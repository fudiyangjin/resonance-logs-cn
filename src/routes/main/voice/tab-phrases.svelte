<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import ChevronRightIcon from "virtual:icons/lucide/chevron-right";
  import PlayIcon from "virtual:icons/lucide/play";
  import PlusIcon from "virtual:icons/lucide/plus";
  import RefreshCwIcon from "virtual:icons/lucide/refresh-cw";
  import SparklesIcon from "virtual:icons/lucide/sparkles";
  import Trash2Icon from "virtual:icons/lucide/trash-2";
  import XIcon from "virtual:icons/lucide/x";
  import { SvelteSet } from "svelte/reactivity";
  import {
    commands,
    type VoiceAssetMeta,
    type VoiceGenerateRequestDto,
    type VoiceLanguage,
    type VoicePhraseMeta,
  } from "$lib/bindings";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import {
    cancelVoiceGeneration,
    runVoiceOperation,
    runVoiceGeneration,
    VOICE,
    voiceErrorMessage,
  } from "$lib/stores/voice-store.svelte";
  import {
    classifyOrphanPhrases,
    collectReferencedVoiceKeys,
  } from "$lib/voice-phrase-gc";

  const status = $derived(VOICE.status);
  const phrases = $derived(status?.catalog.phrases ?? []);
  const profiles = $derived(status?.catalog.profiles ?? []);
  const fineTunedState = $derived(status?.fineTunedVoice ?? null);
  const assets = $derived(status?.catalog.assets ?? []);
  const operationActive = $derived(VOICE.operation.kind !== "idle");
  const generating = $derived(
    VOICE.generationPhase === "running" ||
      VOICE.generationPhase === "cancelling",
  );

  const LANGUAGES: { value: VoiceLanguage; labelKey: MessageKey }[] = [
    { value: "zhCn", labelKey: "voice.language.zhCN" },
    { value: "enUs", labelKey: "voice.language.enUS" },
    { value: "jaJp", labelKey: "voice.language.jaJP" },
  ];

  let newName = $state("");
  let newText = $state("");
  let newLanguage = $state<VoiceLanguage>("zhCn");
  let creating = $state(false);
  let localError = $state<string | null>(null);

  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editText = $state("");
  let editLanguage = $state<VoiceLanguage>("zhCn");
  let savingEdit = $state(false);
  let deletingId = $state<string | null>(null);
  let regeneratingId = $state<string | null>(null);

  let generatePanelOpen = $state(false);
  let profileMode = $state<"existing" | "new">("existing");
  const selectedSource = $derived(SETTINGS.voice.state.selectedSource);
  const selectedProfileId = $derived(SETTINGS.voice.state.selectedProfileId);
  let newProfileName = $state("");
  let referenceWavPath = $state<string | null>(null);
  let keepReference = $state(false);
  const selectedPhraseIds = new SvelteSet<string>();

  $effect(() => {
    const validPhraseIds = new Set(phrases.map((phrase) => phrase.id));
    for (const phraseId of selectedPhraseIds) {
      if (!validPhraseIds.has(phraseId)) selectedPhraseIds.delete(phraseId);
    }
  });

  function languageLabel(language: VoiceLanguage): string {
    return t(
      LANGUAGES.find((item) => item.value === language)?.labelKey ??
        "voice.language.zhCN",
    );
  }

  function activeAssetOf(phrase: VoicePhraseMeta): VoiceAssetMeta | null {
    if (!phrase.activeAssetId) return null;
    return assets.find((a) => a.id === phrase.activeAssetId) ?? null;
  }

  type PhraseStatus = "ready" | "stale" | "pending";

  function phraseStatus(phrase: VoicePhraseMeta): PhraseStatus {
    const asset = activeAssetOf(phrase);
    if (!asset) return "pending";
    return asset.stale ? "stale" : "ready";
  }

  async function createPhrase() {
    if (!newName.trim() || !newText.trim() || creating) return;
    creating = true;
    localError = null;
    try {
      const res = await runVoiceOperation({ kind: "updatingCatalog" }, () =>
        commands.voiceCreatePhrase(newName.trim(), newText.trim(), newLanguage),
      );
      if (res.status === "error") {
        localError = voiceErrorMessage(res.error);
      } else {
        newName = "";
        newText = "";
      }
    } finally {
      creating = false;
    }
  }

  function startEdit(phrase: VoicePhraseMeta) {
    editingId = phrase.id;
    editName = phrase.name;
    editText = phrase.text;
    editLanguage = phrase.language;
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit() {
    if (!editingId || savingEdit) return;
    savingEdit = true;
    localError = null;
    try {
      const res = await runVoiceOperation({ kind: "updatingCatalog" }, () =>
        commands.voiceUpdatePhrase(
          editingId!,
          editName.trim(),
          editText.trim(),
          editLanguage,
        ),
      );
      if (res.status === "error") {
        localError = voiceErrorMessage(res.error);
      } else {
        editingId = null;
      }
    } finally {
      savingEdit = false;
    }
  }

  async function deletePhrase(id: string) {
    deletingId = id;
    localError = null;
    try {
      const res = await runVoiceOperation({ kind: "updatingCatalog" }, () =>
        commands.voiceDeletePhrase(id),
      );
      if (res.status === "error") {
        localError = voiceErrorMessage(res.error);
      } else {
        selectedPhraseIds.delete(id);
      }
    } finally {
      deletingId = null;
    }
  }

  // Orphan = auto-managed phrase (auto:voice:* / custom:voice:*) whose rule
  // key is no longer referenced by any binding in ANY loadout profile.
  // Manually created phrases never match the managed name pattern.
  const orphanPhrases = $derived(
    classifyOrphanPhrases(
      phrases,
      collectReferencedVoiceKeys({
        skillProfiles: SETTINGS.skillMonitor.state.profiles,
        monsterConfigs: [
          SETTINGS.monsterMonitor.state,
          ...SETTINGS.monsterMonitor.state.profiles,
        ],
        mechanicVoiceConfigs: SETTINGS.minimap.state.mechanicVoiceConfigs,
      }),
    ),
  );

  let gcConfirmOpen = $state(false);
  let gcRunning = $state(false);
  let gcMessage = $state<string | null>(null);

  async function cleanupOrphanPhrases() {
    if (gcRunning) return;
    // Snapshot: the derived list recomputes as the catalog refreshes after
    // each delete.
    const targets = [...orphanPhrases];
    gcRunning = true;
    gcMessage = null;
    localError = null;
    let removed = 0;
    let failed = 0;
    try {
      for (const phrase of targets) {
        const res = await runVoiceOperation({ kind: "updatingCatalog" }, () =>
          commands.voiceDeletePhrase(phrase.id),
        );
        if (res.status === "error") {
          failed += 1;
          localError = voiceErrorMessage(res.error);
        } else {
          removed += 1;
          selectedPhraseIds.delete(phrase.id);
        }
      }
      gcMessage =
        failed > 0
          ? t("voice.phrases.gc.failed", { count: removed, failed })
          : t("voice.phrases.gc.done", { count: removed });
    } finally {
      gcRunning = false;
      gcConfirmOpen = false;
    }
  }

  async function testTrigger(phraseId: string) {
    await commands.voiceTestTrigger(phraseId);
  }

  function togglePhraseSelection(id: string) {
    if (selectedPhraseIds.has(id)) selectedPhraseIds.delete(id);
    else selectedPhraseIds.add(id);
  }

  function selectAllPhrases() {
    selectedPhraseIds.clear();
    for (const phrase of phrases) selectedPhraseIds.add(phrase.id);
  }

  function clearPhraseSelection() {
    selectedPhraseIds.clear();
  }

  async function pickReferenceWav() {
    const selected = await open({
      title: t("voice.phrases.generate.pickReferenceTitle"),
      multiple: false,
      filters: [{ name: "WAV", extensions: ["wav"] }],
    });
    if (typeof selected === "string") {
      referenceWavPath = selected;
    }
  }

  // Only the "clone an already-saved profile" and "fine-tuned voice"
  // sources make sense for a single-phrase inline regenerate: creating a
  // brand-new cloned profile is inherently a one-shot, multi-phrase action
  // that belongs in the batch panel below.
  const rowSourceReady = $derived(
    status?.model.kind === "ready" &&
      (selectedSource === "fineTuned"
        ? fineTunedState?.kind === "ready"
        : !!selectedProfileId),
  );
  const canRegenerateRow = $derived(!operationActive && rowSourceReady);

  const canGenerate = $derived(
    !operationActive &&
      status?.model.kind === "ready" &&
      selectedPhraseIds.size > 0 &&
      (selectedSource === "fineTuned"
        ? fineTunedState?.kind === "ready"
        : profileMode === "existing"
          ? !!selectedProfileId
          : !!referenceWavPath && newProfileName.trim().length > 0),
  );

  function buildRowSource(): VoiceGenerateRequestDto["source"] | null {
    if (selectedSource === "fineTuned") {
      return fineTunedState?.kind === "ready" ? { mode: "fineTuned" } : null;
    }
    return selectedProfileId
      ? { mode: "cloneExisting", profileId: selectedProfileId }
      : null;
  }

  async function regeneratePhrase(phraseId: string) {
    if (!canRegenerateRow || regeneratingId) return;
    const source = buildRowSource();
    if (!source) return;
    regeneratingId = phraseId;
    try {
      await runVoiceGeneration({
        source,
        phraseIds: [phraseId],
        backendPreference: SETTINGS.voice.state.generationBackend,
      });
    } finally {
      regeneratingId = null;
    }
  }

  async function submitGeneration() {
    if (!canGenerate) return;
    const request: VoiceGenerateRequestDto = {
      source:
        selectedSource === "fineTuned"
          ? { mode: "fineTuned" }
          : profileMode === "existing"
            ? { mode: "cloneExisting", profileId: selectedProfileId! }
            : {
                mode: "cloneNew",
                name: newProfileName.trim(),
                referenceWavPath: referenceWavPath!,
                keepReference,
              },
      phraseIds: Array.from(selectedPhraseIds),
      backendPreference: SETTINGS.voice.state.generationBackend,
    };
    const summary = await runVoiceGeneration(request);
    if (
      selectedSource === "clone" &&
      profileMode === "new" &&
      summary &&
      !VOICE.generationError
    ) {
      newProfileName = "";
      referenceWavPath = null;
      profileMode = "existing";
      if (summary.profileId) {
        SETTINGS.voice.state.selectedProfileId = summary.profileId;
      }
    }
  }

  async function cancelGeneration() {
    await cancelVoiceGeneration();
  }
</script>

<div class="space-y-5">
  {#if localError}
    <div
      class="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-xs"
    >
      {localError}
    </div>
  {/if}

  <section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
    <div class="space-y-1">
      <h2 class="text-foreground text-base font-semibold">
        {t("voice.phrases.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("voice.phrases.description")}
      </p>
    </div>

    <div class="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)_140px_auto]">
      <input
        class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground rounded border px-3 py-2 text-sm"
        placeholder={t("voice.phrases.namePlaceholder")}
        value={newName}
        oninput={(event) => {
          newName = (event.currentTarget as HTMLInputElement).value;
        }}
      />
      <input
        class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground rounded border px-3 py-2 text-sm"
        placeholder={t("voice.phrases.textPlaceholder")}
        value={newText}
        oninput={(event) => {
          newText = (event.currentTarget as HTMLInputElement).value;
        }}
      />
      <select
        class="border-border/60 bg-muted/30 text-foreground rounded border px-3 py-2 text-sm"
        value={newLanguage}
        onchange={(event) => {
          newLanguage = (event.currentTarget as HTMLSelectElement)
            .value as VoiceLanguage;
        }}
      >
        {#each LANGUAGES as lang (lang.value)}
          <option value={lang.value}>{t(lang.labelKey)}</option>
        {/each}
      </select>
      <button
        type="button"
        class="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1.5 rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        disabled={operationActive ||
          creating ||
          !newName.trim() ||
          !newText.trim()}
        onclick={createPhrase}
      >
        <PlusIcon class="h-4 w-4" />
        {t("voice.phrases.add")}
      </button>
    </div>

    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="border-border/60 hover:bg-muted/40 flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs disabled:opacity-50"
          disabled={operationActive || gcRunning || orphanPhrases.length === 0}
          onclick={() => (gcConfirmOpen = !gcConfirmOpen)}
        >
          <Trash2Icon class="h-3.5 w-3.5" />
          {t("voice.phrases.gc.button", { count: orphanPhrases.length })}
        </button>
        {#if gcMessage}
          <span class="text-muted-foreground text-xs">{gcMessage}</span>
        {/if}
      </div>

      {#if gcConfirmOpen}
        <div
          class="border-border/60 bg-background/50 space-y-2 rounded-lg border p-3 text-xs"
        >
          <p class="text-muted-foreground">
            {t("voice.phrases.gc.confirm", { count: orphanPhrases.length })}
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              class="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded px-3 py-1.5 font-medium disabled:opacity-50"
              disabled={operationActive || gcRunning}
              onclick={cleanupOrphanPhrases}
            >
              {t("voice.phrases.gc.confirmAction")}
            </button>
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 rounded border px-3 py-1.5"
              disabled={gcRunning}
              onclick={() => (gcConfirmOpen = false)}
            >
              {t("voice.phrases.gc.cancel")}
            </button>
          </div>
        </div>
      {/if}
    </div>

    {#if phrases.length > 0}
      <div class="space-y-2">
        {#each phrases as phrase (phrase.id)}
          {@const state = phraseStatus(phrase)}
          {@const activeAsset = activeAssetOf(phrase)}
          <div
            class="border-border/60 bg-background/50 flex items-center gap-2 rounded-lg border p-3"
          >
            <input
              type="checkbox"
              checked={selectedPhraseIds.has(phrase.id)}
              disabled={operationActive}
              onchange={() => togglePhraseSelection(phrase.id)}
            />

            {#if editingId === phrase.id}
              <input
                class="border-border/60 bg-muted/30 text-foreground w-32 rounded border px-2 py-1 text-sm"
                value={editName}
                oninput={(event) => {
                  editName = (event.currentTarget as HTMLInputElement).value;
                }}
              />
              <input
                class="border-border/60 bg-muted/30 text-foreground min-w-0 flex-1 rounded border px-2 py-1 text-sm"
                value={editText}
                oninput={(event) => {
                  editText = (event.currentTarget as HTMLInputElement).value;
                }}
              />
              <select
                class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-sm"
                value={editLanguage}
                onchange={(event) => {
                  editLanguage = (event.currentTarget as HTMLSelectElement)
                    .value as VoiceLanguage;
                }}
              >
                {#each LANGUAGES as lang (lang.value)}
                  <option value={lang.value}>{t(lang.labelKey)}</option>
                {/each}
              </select>
              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs disabled:opacity-50"
                disabled={operationActive || savingEdit}
                onclick={saveEdit}
              >
                {t("voice.phrases.save")}
              </button>
              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs"
                onclick={cancelEdit}
              >
                {t("voice.phrases.cancelEdit")}
              </button>
            {:else}
              <div class="min-w-0 flex-1">
                <div
                  class="text-foreground flex items-center gap-1.5 truncate text-sm font-medium"
                >
                  {phrase.name}
                  <span class="text-muted-foreground text-xs"
                    >({languageLabel(phrase.language)})</span
                  >
                  {#if state === "ready"}
                    <span
                      class="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-normal text-emerald-500"
                    >
                      {t("voice.phrases.status.ready")}
                      {#if activeAsset}
                        · {activeAsset.durationSec.toFixed(1)}s
                      {/if}
                    </span>
                  {:else if state === "stale"}
                    <span
                      class="bg-amber-500/15 text-amber-500 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-normal"
                    >
                      {t("voice.phrases.status.stale")}
                    </span>
                  {:else}
                    <span
                      class="bg-muted/50 text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[11px] font-normal"
                    >
                      {t("voice.phrases.status.pending")}
                    </span>
                  {/if}
                </div>
                <div class="text-muted-foreground truncate text-xs">
                  {phrase.text}
                </div>
              </div>

              {#if state !== "pending"}
                <button
                  type="button"
                  class="border-border/60 hover:bg-muted/40 flex items-center gap-1 rounded border px-2 py-1 text-xs"
                  onclick={() => testTrigger(phrase.id)}
                >
                  <PlayIcon class="h-3.5 w-3.5" />
                  {t("voice.phrases.tryPlay")}
                </button>
              {/if}

              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                disabled={!canRegenerateRow || regeneratingId === phrase.id}
                title={!rowSourceReady
                  ? t("voice.phrases.rowGenerateHint")
                  : undefined}
                onclick={() => regeneratePhrase(phrase.id)}
              >
                <RefreshCwIcon
                  class="h-3.5 w-3.5 {regeneratingId === phrase.id
                    ? 'animate-spin'
                    : ''}"
                />
                {state === "pending"
                  ? t("voice.phrases.generateOne")
                  : t("voice.phrases.regenerateOne")}
              </button>

              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs"
                disabled={operationActive}
                onclick={() => startEdit(phrase)}
              >
                {t("voice.phrases.edit")}
              </button>
              <button
                type="button"
                class="border-border/60 text-destructive hover:bg-destructive/10 rounded border px-2 py-1 text-xs disabled:opacity-50"
                disabled={operationActive || deletingId === phrase.id}
                onclick={() => deletePhrase(phrase.id)}
              >
                <Trash2Icon class="h-3.5 w-3.5" />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="text-muted-foreground text-sm">
        {t("voice.phrases.empty")}
      </div>
    {/if}
  </section>

  <section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
    <button
      type="button"
      class="flex w-full items-center justify-between"
      onclick={() => (generatePanelOpen = !generatePanelOpen)}
    >
      <div class="space-y-1 text-left">
        <h2 class="text-foreground text-base font-semibold">
          {t("voice.phrases.generate.title")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("voice.phrases.generate.description")}
        </p>
      </div>
      {#if generatePanelOpen}
        <ChevronDownIcon class="h-4 w-4 shrink-0" />
      {:else}
        <ChevronRightIcon class="h-4 w-4 shrink-0" />
      {/if}
    </button>

    {#if generatePanelOpen}
      <div class="space-y-4">
        {#if status && status.model.kind !== "ready"}
          <div
            class="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-xs"
          >
            {t("voice.phrases.generate.modelRequired")}
          </div>
        {/if}

        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors {selectedSource ===
            'clone'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
            disabled={operationActive}
            onclick={() => (SETTINGS.voice.state.selectedSource = "clone")}
          >
            {t("voice.phrases.generate.cloneSource")}
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors {selectedSource ===
            'fineTuned'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
            disabled={operationActive}
            onclick={() => (SETTINGS.voice.state.selectedSource = "fineTuned")}
          >
            {t("voice.phrases.generate.finetunedSource")}
          </button>
        </div>

        {#if selectedSource === "fineTuned"}
          {#if fineTunedState?.kind === "ready"}
            <div
              class="border-border/60 bg-muted/30 rounded border px-3 py-2 text-sm"
            >
              {fineTunedState.voice.displayName}
              <span class="text-muted-foreground ml-2 text-xs">
                {fineTunedState.voice.speakerName}
              </span>
            </div>
          {:else}
            <div
              class="border-destructive/40 bg-destructive/10 text-destructive rounded border px-3 py-2 text-xs"
            >
              {t("voice.phrases.generate.finetunedUnavailable")}
            </div>
          {/if}
        {:else}
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded border px-3 py-2 text-xs {profileMode ===
              'existing'
                ? 'border-primary bg-primary/10'
                : 'border-border/60'}"
              onclick={() => (profileMode = "existing")}
              >{t("voice.phrases.generate.useExisting")}</button
            >
            <button
              type="button"
              class="flex-1 rounded border px-3 py-2 text-xs {profileMode ===
              'new'
                ? 'border-primary bg-primary/10'
                : 'border-border/60'}"
              onclick={() => (profileMode = "new")}
              >{t("voice.phrases.generate.createNew")}</button
            >
          </div>

          {#if profileMode === "existing"}
            <select
              class="border-border/60 bg-muted/30 text-foreground w-full rounded border px-3 py-2 text-sm"
              value={selectedProfileId ?? ""}
              disabled={operationActive}
              onchange={(event) => {
                SETTINGS.voice.state.selectedProfileId =
                  (event.currentTarget as HTMLSelectElement).value || null;
              }}
            >
              <option value="">{t("voice.phrases.generate.pickProfile")}</option
              >
              {#each profiles as profile (profile.id)}
                <option value={profile.id}>{profile.name || profile.id}</option>
              {/each}
            </select>
          {:else}
            <div class="grid gap-2 md:grid-cols-2">
              <input
                class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground rounded border px-3 py-2 text-sm"
                placeholder={t("voice.phrases.generate.newProfileName")}
                value={newProfileName}
                disabled={operationActive}
                oninput={(event) => {
                  newProfileName = (event.currentTarget as HTMLInputElement)
                    .value;
                }}
              />
              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 truncate rounded border px-3 py-2 text-left text-sm"
                disabled={operationActive}
                onclick={pickReferenceWav}
              >
                {referenceWavPath ?? t("voice.phrases.generate.pickReference")}
              </button>
            </div>
            <label class="text-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                bind:checked={keepReference}
                disabled={operationActive}
              />
              {t("voice.phrases.generate.keepReference")}
            </label>
          {/if}
        {/if}

        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">
            {t("voice.phrases.generate.selectedCount", {
              count: selectedPhraseIds.size,
            })}
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1"
              disabled={operationActive}
              onclick={selectAllPhrases}
            >
              {t("voice.phrases.generate.selectAll")}
            </button>
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1"
              disabled={operationActive}
              onclick={clearPhraseSelection}
            >
              {t("voice.phrases.generate.selectNone")}
            </button>
          </div>
        </div>

        <button
          type="button"
          class="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={!canGenerate}
          onclick={submitGeneration}
        >
          {#if generating}
            <SparklesIcon class="mr-1 inline h-4 w-4 animate-spin" />
          {/if}
          {generating
            ? t("voice.phrases.generate.generating")
            : t("voice.phrases.generate.start")}
        </button>

        {#if generating}
          <button
            type="button"
            class="border-border/60 hover:bg-muted/40 inline-flex items-center gap-1.5 rounded border px-4 py-2 text-sm disabled:opacity-50"
            disabled={VOICE.generationPhase === "cancelling"}
            onclick={cancelGeneration}
          >
            <XIcon class="h-4 w-4" />
            {VOICE.generationPhase === "cancelling"
              ? t("voice.phrases.generate.cancelling")
              : t("voice.phrases.generate.cancel")}
          </button>
        {/if}

        {#if VOICE.generationPhase !== "idle" || VOICE.generationStage || VOICE.generationSummary || VOICE.generationError}
          <div
            class="border-border/60 bg-background/50 space-y-2 rounded-lg border p-3 text-xs"
          >
            {#if VOICE.generationStage}
              <div class="text-muted-foreground">
                {t("voice.phrases.generate.stage", {
                  stage: VOICE.generationStage,
                  status: VOICE.generationStageStatus ?? "",
                })}
              </div>
            {/if}
            {#each Object.entries(VOICE.generationItems) as [id, item] (id)}
              <div class="flex items-center justify-between">
                <span class="truncate">{id}</span>
                <span
                  class={item.status === "ok"
                    ? "text-emerald-500"
                    : item.status === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"}
                >
                  {item.status}
                </span>
              </div>
            {/each}
            {#if VOICE.generationSummary}
              <div class="text-foreground">
                {t("voice.phrases.generate.summary", {
                  completed: VOICE.generationSummary.completed,
                  failed: VOICE.generationSummary.failed,
                })}
              </div>
            {/if}
            {#if VOICE.generationPhase === "cancelled"}
              <div class="text-muted-foreground">
                {t("voice.phrases.generate.cancelled")}
              </div>
            {/if}
            {#if VOICE.generationError}
              <div class="text-destructive">{VOICE.generationError}</div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </section>
</div>
