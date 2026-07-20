<script lang="ts">
  /**
   * @file Read-only "播报总览" tab: aggregates every voice binding configured
   * inline on the Buff Monitor / Custom Counter / Boss Mechanics pages, and
   * offers a one-click batch generation for bindings whose phrase still has
   * no active audio asset. Manual rule authoring was removed in favor of the
   * inline bindings, so this tab has no create/edit UI of its own.
   */
  import { goto } from "$app/navigation";
  import PlayIcon from "virtual:icons/lucide/play";
  import RefreshCwIcon from "virtual:icons/lucide/refresh-cw";
  import SparklesIcon from "virtual:icons/lucide/sparkles";
  import { commands, type VoiceGenerateRequestDto } from "$lib/bindings";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    SETTINGS,
    VOICE_PRIORITY_TIERS,
    type VoicePhraseBinding,
  } from "$lib/settings-store";
  import { runVoiceGeneration, VOICE } from "$lib/stores/voice-store.svelte";
  import {
    hasTierPlaceholder,
    listVoiceBindingOverview,
    materializeBindingPhraseIds,
    TIERED_PHRASE_COUNT,
    type VoiceBindingOverviewEntry,
  } from "$lib/voice-binding-compile.svelte.js";

  const operationActive = $derived(VOICE.operation.kind !== "idle");
  const generating = $derived(
    VOICE.generationPhase === "running" ||
      VOICE.generationPhase === "cancelling",
  );

  const entries = $derived(listVoiceBindingOverview());
  const phrasesById = $derived(
    new Map((VOICE.status?.catalog.phrases ?? []).map((p) => [p.id, p])),
  );

  const SOURCE_LABEL_KEYS: Record<VoicePhraseBinding["source"], MessageKey> = {
    auto: "voice.binding.source.auto",
    custom: "voice.binding.source.custom",
    phrase: "voice.binding.source.phrase",
  };

  const PRIORITY_LABEL_KEYS = {
    default: "voice.binding.priority.default",
    low: "voice.binding.priority.low",
    medium: "voice.binding.priority.medium",
    high: "voice.binding.priority.high",
    urgent: "voice.binding.priority.urgent",
  } satisfies Record<(typeof VOICE_PRIORITY_TIERS)[number]["id"], MessageKey>;

  function priorityLabel(priority: number): string {
    const tier = VOICE_PRIORITY_TIERS.find(
      (candidate) => (candidate.value ?? 0) === priority,
    );
    return tier ? t(PRIORITY_LABEL_KEYS[tier.id]) : String(priority);
  }

  function usesTierPlaceholder(entry: VoiceBindingOverviewEntry): boolean {
    return (
      entry.binding.source === "custom" &&
      hasTierPlaceholder(entry.binding.text)
    );
  }

  function entryPhraseIds(entry: VoiceBindingOverviewEntry): string[] {
    return [entry.phraseId, ...entry.tierPhraseIds].filter(
      (id): id is string => !!id,
    );
  }

  /** How many phrases this entry compiles to (7 for tier-placeholder text). */
  function expectedPhraseCount(entry: VoiceBindingOverviewEntry): number {
    return usesTierPlaceholder(entry) ? TIERED_PHRASE_COUNT : 1;
  }

  function readyPhraseCount(entry: VoiceBindingOverviewEntry): number {
    return entryPhraseIds(entry).filter(
      (id) => !!phrasesById.get(id)?.activeAssetId,
    ).length;
  }

  function isReady(entry: VoiceBindingOverviewEntry): boolean {
    const ids = entryPhraseIds(entry);
    if (ids.length < expectedPhraseCount(entry)) return false;
    return ids.every((id) => !!phrasesById.get(id)?.activeAssetId);
  }

  const groups = $derived.by(() => {
    const buff = entries.filter((e) => e.navigateTo === "buff");
    const monsterBuff = entries.filter((e) => e.navigateTo === "monsterBuff");
    const counter = entries.filter((e) => e.navigateTo === "counter");
    const dbm = entries.filter((e) => e.navigateTo === "dbm");
    const minimap = entries.filter((e) => e.navigateTo === "minimap");
    return [
      {
        navigateTo: "buff" as const,
        titleKey: "skillMonitor.buff.title" as const,
        navigateKey: "voice.bindings.navigate.buff" as const,
        items: buff,
      },
      {
        navigateTo: "monsterBuff" as const,
        titleKey: "monsterMonitor.buff.title" as const,
        navigateKey: "voice.bindings.navigate.monsterBuff" as const,
        items: monsterBuff,
      },
      {
        navigateTo: "counter" as const,
        titleKey: "skillMonitor.customPanel.rule.title" as const,
        navigateKey: "voice.bindings.navigate.counter" as const,
        items: counter,
      },
      {
        navigateTo: "dbm" as const,
        titleKey: "monsterMonitor.bossDbm.title" as const,
        navigateKey: "voice.bindings.navigate.dbm" as const,
        items: dbm,
      },
      {
        navigateTo: "minimap" as const,
        titleKey: "minimap.settings.voiceCues.title" as const,
        navigateKey: "voice.bindings.navigate.minimap" as const,
        items: minimap,
      },
    ].filter((group) => group.items.length > 0);
  });

  const pendingCount = $derived(entries.filter((e) => !isReady(e)).length);

  function navigate(target: VoiceBindingOverviewEntry["navigateTo"]) {
    if (target === "minimap") {
      void goto("/main/minimap");
    } else if (target === "dbm" || target === "monsterBuff") {
      void goto("/main/monster-monitor");
    } else {
      void goto("/main/skill-monitor");
    }
  }

  let generateMessage = $state<string | null>(null);
  let previewingId = $state<string | null>(null);

  async function tryPlay(entry: VoiceBindingOverviewEntry) {
    if (!entry.phraseId) return;
    previewingId = entry.id;
    try {
      await commands.voiceTestTrigger(entry.phraseId);
    } finally {
      previewingId = null;
    }
  }

  const fineTunedState = $derived(VOICE.status?.fineTunedVoice ?? null);
  const selectedSource = $derived(SETTINGS.voice.state.selectedSource);
  const selectedProfileId = $derived(SETTINGS.voice.state.selectedProfileId);

  function resolveGenerationSource(): VoiceGenerateRequestDto["source"] | null {
    if (selectedSource === "fineTuned") {
      return fineTunedState?.kind === "ready" ? { mode: "fineTuned" } : null;
    }
    return selectedProfileId
      ? { mode: "cloneExisting", profileId: selectedProfileId }
      : null;
  }

  async function generateMissing() {
    generateMessage = null;
    // Materialize every phrase behind each pending entry (tier-placeholder
    // text expands to 7 phrases, upserted here if not cached yet), then
    // submit the ones that still lack audio.
    const missingIds: string[] = [];
    for (const entry of entries) {
      if (isReady(entry)) continue;
      const ids = await materializeBindingPhraseIds(entry.id, entry.binding);
      missingIds.push(
        ...ids.filter((id) => !phrasesById.get(id)?.activeAssetId),
      );
    }
    const phraseIds = Array.from(new Set(missingIds));
    if (phraseIds.length === 0) {
      generateMessage = t("voice.bindings.generateMissing.none");
      return;
    }
    const source = resolveGenerationSource();
    if (!source) {
      generateMessage = t("voice.bindings.generateMissing.needProfile");
      return;
    }
    const request: VoiceGenerateRequestDto = {
      source,
      phraseIds,
      backendPreference: SETTINGS.voice.state.generationBackend,
    };
    const summary = await runVoiceGeneration(request);
    if (VOICE.generationError) {
      generateMessage = VOICE.generationError;
    } else if (summary) {
      generateMessage = t("voice.bindings.generateMissing.summary", {
        count: phraseIds.length,
      });
    }
  }
</script>

<div class="space-y-5">
  <section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <h2 class="text-foreground text-base font-semibold">
          {t("voice.tabs.bindings")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("voice.bindings.description")}
        </p>
      </div>

      <button
        type="button"
        class="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        disabled={operationActive || generating || pendingCount === 0}
        onclick={generateMissing}
      >
        {#if generating}
          <RefreshCwIcon class="h-4 w-4 animate-spin" />
          {t("voice.bindings.generateMissing.generating")}
        {:else}
          <SparklesIcon class="h-4 w-4" />
          {t("voice.bindings.generateMissing")}
        {/if}
      </button>
    </div>

    {#if generateMessage}
      <div
        class="border-border/60 bg-muted/20 text-muted-foreground rounded-lg border px-3 py-2 text-xs"
      >
        {generateMessage}
      </div>
    {/if}
  </section>

  {#if groups.length === 0}
    <section class="border-border/60 bg-card/60 rounded-xl border p-5">
      <p class="text-muted-foreground text-sm">{t("voice.bindings.empty")}</p>
    </section>
  {:else}
    {#each groups as group (group.navigateTo)}
      <section
        class="border-border/60 bg-card/60 space-y-3 rounded-xl border p-5"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-foreground text-sm font-semibold">
            {t(group.titleKey)}
          </h3>
          <button
            type="button"
            class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs"
            onclick={() => navigate(group.navigateTo)}
          >
            {t(group.navigateKey)}
          </button>
        </div>

        <div class="overflow-hidden rounded-lg border border-border/50">
          <table class="w-full text-left text-xs">
            <thead class="bg-muted/20 text-muted-foreground">
              <tr>
                <th class="px-3 py-2 font-medium"
                  >{t("voice.bindings.column.subject")}</th
                >
                <th class="px-3 py-2 font-medium"
                  >{t("voice.bindings.column.event")}</th
                >
                <th class="px-3 py-2 font-medium"
                  >{t("voice.bindings.column.source")}</th
                >
                <th class="px-3 py-2 font-medium"
                  >{t("voice.bindings.column.priority")}</th
                >
                <th class="px-3 py-2 font-medium"
                  >{t("voice.bindings.column.status")}</th
                >
                <th class="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody class="divide-border/40 divide-y">
              {#each group.items as entry (entry.id)}
                {@const ready = isReady(entry)}
                {@const doneCount = readyPhraseCount(entry)}
                {@const totalCount = expectedPhraseCount(entry)}
                <tr class="hover:bg-muted/10">
                  <td class="px-3 py-2 font-medium text-foreground">
                    <div class="flex items-center gap-2">
                      <span>{entry.subjectLabel}</span>
                      {#if entry.monsterBuffSourceScope}
                        <span
                          class="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-normal"
                        >
                          {entry.monsterBuffSourceScope === "localPlayerSource"
                            ? t(
                                "monsterMonitor.buffVoice.scope.localPlayerSource",
                              )
                            : t("monsterMonitor.buffVoice.scope.anySource")}
                        </span>
                      {/if}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">
                    {t(entry.eventLabelKey)}
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">
                    {t(SOURCE_LABEL_KEYS[entry.binding.source])}
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">
                    {priorityLabel(entry.priority)}
                  </td>
                  <td class="px-3 py-2">
                    {#if ready}
                      <span
                        class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-500"
                      >
                        {t("voice.bindings.status.ready")}
                      </span>
                    {:else if doneCount > 0}
                      <span
                        class="bg-amber-500/15 text-amber-500 rounded px-1.5 py-0.5"
                      >
                        {t("voice.bindings.status.partial", {
                          done: doneCount,
                          total: totalCount,
                        })}
                      </span>
                    {:else}
                      <span
                        class="bg-amber-500/15 text-amber-500 rounded px-1.5 py-0.5"
                      >
                        {t("voice.bindings.status.pending")}
                      </span>
                    {/if}
                  </td>
                  <td class="px-3 py-2 text-right">
                    <button
                      type="button"
                      class="border-border/60 hover:bg-muted/40 inline-flex items-center gap-1 rounded border px-2 py-1 disabled:opacity-50"
                      disabled={!ready || previewingId === entry.id}
                      onclick={() => tryPlay(entry)}
                    >
                      <PlayIcon class="h-3 w-3" />
                      {t("voice.bindings.tryPlay")}
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/each}
  {/if}
</div>
