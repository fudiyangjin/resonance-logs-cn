<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import DownloadIcon from "virtual:icons/lucide/download";
  import FolderOpenIcon from "virtual:icons/lucide/folder-open";
  import LinkIcon from "virtual:icons/lucide/link";
  import Mic2Icon from "virtual:icons/lucide/mic-2";
  import RefreshCwIcon from "virtual:icons/lucide/refresh-cw";
  import Trash2Icon from "virtual:icons/lucide/trash-2";
  import XIcon from "virtual:icons/lucide/x";
  import { commands } from "$lib/bindings";
  import { t } from "$lib/i18n/index.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import {
    refreshVoiceStatus,
    runVoiceOperation,
    VOICE,
    voiceErrorMessage,
  } from "$lib/stores/voice-store.svelte";
  import {
    SETTINGS,
    type VoiceModelDownloadSource,
  } from "$lib/settings-store";

  let manualModelVersion = $state("");
  let installing = $state(false);
  let importing = $state(false);
  let removing = $state<string | null>(null);
  let deletingProfileId = $state<string | null>(null);
  let verifying = $state(false);
  let verificationMessage = $state<string | null>(null);
  let fineTunedBusy = $state(false);
  let fineTunedMessage = $state<string | null>(null);
  let localError = $state<string | null>(null);

  let confirmOpen = $state(false);
  let confirmTitle = $state("");
  let confirmDescription = $state("");
  let confirmVariant = $state<"default" | "destructive">("destructive");
  let confirmResolve = $state<(value: boolean) => void>(() => {});

  function askConfirm(opts: {
    title: string;
    description?: string;
    variant?: "default" | "destructive";
  }): Promise<boolean> {
    confirmTitle = opts.title;
    confirmDescription = opts.description ?? "";
    confirmVariant = opts.variant ?? "destructive";
    confirmOpen = true;
    return new Promise<boolean>((resolve) => {
      confirmResolve = resolve;
    });
  }

  function handleConfirm() {
    confirmResolve(true);
  }

  function handleCancel() {
    confirmResolve(false);
  }

  const status = $derived(VOICE.status);
  const profiles = $derived(status?.catalog.profiles ?? []);
  const operationActive = $derived(VOICE.operation.kind !== "idle");
  const fineTunedState = $derived(status?.fineTunedVoice ?? null);
  const fineTunedVoice = $derived(
    fineTunedState && fineTunedState.kind !== "notConfigured"
      ? fineTunedState.voice
      : null,
  );
  const modelVersion = $derived(
    status?.model.kind === "ready" || status?.model.kind === "corrupt"
      ? status.model.version
      : null,
  );

  function formatBytes(bytes: number): string {
    if (bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }

  const downloadPercent = $derived(
    VOICE.totalBytes > 0
      ? Math.min(
          100,
          Math.round((VOICE.downloadedBytes / VOICE.totalBytes) * 100),
        )
      : 0,
  );

  async function installModel() {
    if (installing) return;
    installing = true;
    localError = null;
    try {
      const configuredSource =
        SETTINGS.voice.state.modelDownloadSource as VoiceModelDownloadSource;
      const source =
        configuredSource === "auto"
          ? SETTINGS.i18n.state.locale === "zh-CN"
            ? "hfMirror"
            : "huggingFace"
          : configuredSource;
      const res = await runVoiceOperation(
        { kind: "installingModel", cancelling: false },
        () => commands.voiceInstallModel(source),
      );
      if (res.status === "error") {
        localError = voiceErrorMessage(res.error);
      }
    } finally {
      installing = false;
    }
  }

  async function cancelDownload() {
    if (VOICE.operation.kind !== "installingModel") return;
    VOICE.operation = { kind: "installingModel", cancelling: true };
    await commands.voiceCancelModelDownload();
  }

  async function manualImport() {
    if (!manualModelVersion.trim() || importing) return;
    const selected = await open({
      title: t("voice.model.import.dialogTitle"),
      multiple: true,
      filters: [{ name: "GGUF", extensions: ["gguf"] }],
    });
    if (!selected) return;
    const files = Array.isArray(selected) ? selected : [selected];
    importing = true;
    localError = null;
    try {
      const res = await runVoiceOperation({ kind: "importingModel" }, () =>
        commands.voiceManualImportModel(manualModelVersion.trim(), files),
      );
      if (res.status === "error") {
        localError = voiceErrorMessage(res.error);
      }
    } finally {
      importing = false;
    }
  }

  async function removeModel(version: string) {
    removing = version;
    localError = null;
    try {
      const res = await runVoiceOperation({ kind: "removingModel" }, () =>
        commands.voiceRemoveModel(version),
      );
      if (res.status === "error") {
        localError = voiceErrorMessage(res.error);
      }
    } finally {
      removing = null;
    }
  }

  async function deleteProfile(id: string) {
    deletingProfileId = id;
    localError = null;
    try {
      const res = await runVoiceOperation({ kind: "updatingCatalog" }, () =>
        commands.voiceDeleteProfile(id),
      );
      if (res.status === "error") {
        localError = voiceErrorMessage(res.error);
      }
    } finally {
      deletingProfileId = null;
    }
  }

  async function verifyModel() {
    if (verifying || operationActive) return;
    verifying = true;
    verificationMessage = null;
    localError = null;
    try {
      const res = await runVoiceOperation({ kind: "verifyingModel" }, () =>
        commands.voiceVerifyModel(),
      );
      if (res.status === "error") {
        localError = voiceErrorMessage(res.error);
      } else if (res.data.kind === "ready") {
        verificationMessage = t("voice.model.verifySuccess");
      } else if (res.data.kind === "corrupt") {
        localError = `${t("voice.model.verifyFailed")}: ${res.data.reason}`;
      }
    } finally {
      verifying = false;
    }
  }

  async function pickPackageDirectory(): Promise<string | null> {
    const selected = await open({
      title: t("voice.model.finetuned.dialogTitle"),
      directory: true,
      multiple: false,
    });
    return typeof selected === "string" ? selected : null;
  }

  async function importFineTunedVoice() {
    const packagePath = await pickPackageDirectory();
    if (!packagePath || fineTunedBusy) return;
    fineTunedBusy = true;
    localError = null;
    try {
      const inspected = await commands.voiceInspectFinetunedPackage(packagePath);
      if (inspected.status === "error") {
        localError = voiceErrorMessage(inspected.error);
        return;
      }
      const replacing = !!fineTunedVoice;
      if (replacing) {
        const confirmed = await askConfirm({
          title: t("voice.model.finetuned.replace"),
          description: t("voice.model.finetuned.replaceConfirm", {
            old: fineTunedVoice?.displayName ?? "",
            oldPath: fineTunedVoice?.packagePath ?? "",
            next: inspected.data.displayName,
            nextPath: inspected.data.packagePath,
          }),
        });
        if (!confirmed) return;
      }
      const result = await commands.voiceSetFinetunedVoice(
        packagePath,
        inspected.data.modelSha256,
        replacing,
      );
      if (result.status === "error") localError = voiceErrorMessage(result.error);
      else await refreshVoiceStatus();
    } finally {
      fineTunedBusy = false;
    }
  }

  async function relinkFineTunedVoice() {
    if (!fineTunedVoice || fineTunedBusy) return;
    const packagePath = await pickPackageDirectory();
    if (!packagePath) return;
    fineTunedBusy = true;
    localError = null;
    try {
      const result = await commands.voiceRelinkFinetunedVoice(
        packagePath,
        fineTunedVoice.modelSha256,
      );
      if (result.status === "error") localError = voiceErrorMessage(result.error);
      else await refreshVoiceStatus();
    } finally {
      fineTunedBusy = false;
    }
  }

  async function removeFineTunedVoice() {
    if (!fineTunedVoice || fineTunedBusy) return;
    const confirmed = await askConfirm({
      title: t("voice.model.finetuned.remove"),
      description: t("voice.model.finetuned.removeConfirm"),
    });
    if (!confirmed) return;
    fineTunedBusy = true;
    localError = null;
    try {
      const result = await commands.voiceRemoveFinetunedVoice();
      if (result.status === "error") localError = voiceErrorMessage(result.error);
      else await refreshVoiceStatus();
    } finally {
      fineTunedBusy = false;
    }
  }

  async function verifyFineTunedVoice() {
    if (!fineTunedVoice || fineTunedBusy) return;
    fineTunedBusy = true;
    fineTunedMessage = null;
    localError = null;
    try {
      const result = await commands.voiceInspectFinetunedPackage(
        fineTunedVoice.packagePath,
      );
      if (result.status === "error") {
        localError = voiceErrorMessage(result.error);
      } else if (result.data.modelSha256 !== fineTunedVoice.modelSha256) {
        localError = t("voice.model.finetuned.modified");
      } else {
        fineTunedMessage = t("voice.model.finetuned.verifySuccess");
        await refreshVoiceStatus();
      }
    } finally {
      fineTunedBusy = false;
    }
  }
</script>

<div class="space-y-5">
  <section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
    <div class="space-y-1">
      <h2 class="text-foreground text-base font-semibold">
        {t("voice.model.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("voice.model.description")}
      </p>
    </div>

    {#if localError}
      <div
        class="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-xs"
      >
        {localError}
      </div>
    {/if}

    <div
      class="border-border/60 bg-background/50 rounded-lg border p-3 text-sm"
    >
      {#if status?.model.kind === "ready"}
        <span class="text-foreground font-medium">{status.model.version}</span>
        <span class="ml-2 text-xs text-emerald-500"
          >{t("voice.model.installed")}</span
        >
        <button
          type="button"
          class="border-border/60 hover:bg-muted/40 ml-3 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={operationActive}
          onclick={verifyModel}
        >
          <RefreshCwIcon class="h-3.5 w-3.5" />
          {verifying
            ? t("voice.model.verifyingIntegrity")
            : t("voice.model.verifyIntegrity")}
        </button>
        <button
          type="button"
          class="border-border/60 text-destructive hover:bg-destructive/10 ml-3 rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={operationActive || removing === modelVersion}
          onclick={() => modelVersion && removeModel(modelVersion)}
        >
          {t("voice.model.remove")}
        </button>
      {:else if status?.model.kind === "corrupt"}
        <span class="text-destructive font-medium">{status.model.version}</span>
        <span class="text-destructive ml-2 text-xs">{status.model.reason}</span>
        <button
          type="button"
          class="border-border/60 hover:bg-muted/40 ml-3 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={operationActive}
          onclick={verifyModel}
        >
          <RefreshCwIcon class="h-3.5 w-3.5" />
          {verifying
            ? t("voice.model.verifyingIntegrity")
            : t("voice.model.verifyIntegrity")}
        </button>
        <button
          type="button"
          class="border-border/60 text-destructive hover:bg-destructive/10 ml-3 rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={operationActive || removing === modelVersion}
          onclick={() => modelVersion && removeModel(modelVersion)}
        >
          {t("voice.model.remove")}
        </button>
      {:else if status?.model.kind === "installing"}
        <span class="text-muted-foreground">{t("voice.model.downloading")}</span
        >
      {:else}
        <span class="text-muted-foreground"
          >{t("voice.model.notInstalled")}</span
        >
      {/if}
    </div>

    {#if verificationMessage}
      <div class="text-xs text-emerald-500">{verificationMessage}</div>
    {/if}

    <div>
      <label class="text-muted-foreground mb-1 block text-xs" for="voice-model-source">
        {t("voice.model.downloadSource")}
      </label>
      <select
        id="voice-model-source"
        class="border-border/60 bg-background text-foreground rounded border px-3 py-2 text-sm"
        value={SETTINGS.voice.state.modelDownloadSource}
        disabled={operationActive || installing || VOICE.downloadActive}
        onchange={(event) => {
          SETTINGS.voice.state.modelDownloadSource = (
            event.currentTarget as HTMLSelectElement
          ).value as VoiceModelDownloadSource;
        }}
      >
        <option value="auto">{t("voice.model.downloadSourceAuto")}</option>
        <option value="huggingFace">{t("voice.model.downloadSourceHuggingFace")}</option>
        <option value="hfMirror">{t("voice.model.downloadSourceMirror")}</option>
      </select>
      <button
        type="button"
        class="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        disabled={operationActive || installing || VOICE.downloadActive}
        onclick={installModel}
      >
        <DownloadIcon class="h-4 w-4" />
        {t("voice.model.install")}
      </button>
    </div>

    {#if VOICE.downloadActive}
      <div
        class="border-border/60 bg-background/50 space-y-2 rounded-lg border p-3"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-foreground truncate">{VOICE.downloadFileName}</span>
          <span class="text-muted-foreground">
            {formatBytes(VOICE.downloadedBytes)} / {formatBytes(
              VOICE.totalBytes,
            )}
          </span>
        </div>
        <div class="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
          <div
            class="bg-primary h-full transition-all duration-300"
            style="width: {downloadPercent}%"
          ></div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground text-xs">
            {VOICE.downloadSource === "hfMirror"
              ? t("voice.model.downloadSourceMirror")
              : t("voice.model.downloadSourceHuggingFace")}
            ·
            {VOICE.downloadPhase === "verifying"
              ? t("voice.model.verifying")
              : t("voice.model.downloading")}
          </span>
          <button
            type="button"
            class="border-border/60 hover:bg-muted/40 flex items-center gap-1 rounded border px-2 py-1 text-xs"
            disabled={VOICE.operation.kind === "installingModel" &&
              VOICE.operation.cancelling}
            onclick={cancelDownload}
          >
            <XIcon class="h-3 w-3" />
            {VOICE.operation.kind === "installingModel" &&
            VOICE.operation.cancelling
              ? t("voice.model.cancelling")
              : t("voice.model.cancel")}
          </button>
        </div>
      </div>
    {/if}

    <div class="border-border/60 space-y-2 rounded-lg border border-dashed p-3">
      <div class="text-muted-foreground text-xs">
        {t("voice.model.import.title")}
      </div>
      <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground w-full rounded border px-3 py-2 text-sm"
          placeholder={t("voice.model.import.versionPlaceholder")}
          value={manualModelVersion}
          oninput={(event) => {
            manualModelVersion = (event.currentTarget as HTMLInputElement)
              .value;
          }}
        />
        <button
          type="button"
          class="border-border/60 hover:bg-muted/40 flex items-center justify-center gap-2 rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={operationActive || importing || !manualModelVersion.trim()}
          onclick={manualImport}
        >
          <FolderOpenIcon class="h-4 w-4" />
          {t("voice.model.import.action")}
        </button>
      </div>
    </div>
  </section>

  <section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h2 class="text-foreground flex items-center gap-2 text-base font-semibold">
          <Mic2Icon class="h-4 w-4" />
          {t("voice.model.finetuned.title")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("voice.model.finetuned.description")}
        </p>
      </div>
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 flex shrink-0 items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={operationActive || fineTunedBusy}
        onclick={importFineTunedVoice}
      >
        <FolderOpenIcon class="h-4 w-4" />
        {fineTunedVoice
          ? t("voice.model.finetuned.replace")
          : t("voice.model.finetuned.import")}
      </button>
    </div>

    {#if fineTunedVoice}
      <div class="border-border/60 bg-background/50 space-y-3 rounded-lg border p-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-foreground truncate text-sm font-medium">
              {fineTunedVoice.displayName}
            </div>
            <div class="text-muted-foreground mt-1 truncate text-xs">
              {fineTunedVoice.packagePath}
            </div>
          </div>
          <span
            class:text-emerald-500={fineTunedState?.kind === "ready"}
            class:text-destructive={fineTunedState?.kind !== "ready"}
            class="shrink-0 text-xs font-medium"
          >
            {fineTunedState?.kind === "ready"
              ? t("voice.model.finetuned.ready")
              : fineTunedState?.kind === "missing"
                ? t("voice.model.finetuned.missing")
                : t("voice.model.finetuned.modified")}
          </span>
        </div>
        <div class="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>{fineTunedVoice.speakerName}</span>
          <span>Token {fineTunedVoice.speakerTokenId}</span>
          <span>{fineTunedVoice.quantization.toUpperCase()}</span>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="border-border/60 hover:bg-muted/40 flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
            disabled={fineTunedBusy}
            onclick={verifyFineTunedVoice}
          >
            <RefreshCwIcon class="h-3.5 w-3.5" />
            {t("voice.model.finetuned.verify")}
          </button>
          {#if fineTunedState?.kind !== "ready"}
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
              disabled={fineTunedBusy}
              onclick={relinkFineTunedVoice}
            >
              <LinkIcon class="h-3.5 w-3.5" />
              {t("voice.model.finetuned.relink")}
            </button>
          {/if}
          <button
            type="button"
            class="border-border/60 text-destructive hover:bg-destructive/10 flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
            disabled={fineTunedBusy}
            onclick={removeFineTunedVoice}
          >
            <Trash2Icon class="h-3.5 w-3.5" />
            {t("voice.model.finetuned.remove")}
          </button>
        </div>
        {#if fineTunedMessage}
          <p class="text-xs text-emerald-500">{fineTunedMessage}</p>
        {/if}
      </div>
    {:else}
      <div class="text-muted-foreground text-sm">
        {t("voice.model.finetuned.empty")}
      </div>
    {/if}
  </section>

  <section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
    <div class="space-y-1">
      <h2 class="text-foreground text-base font-semibold">
        {t("voice.model.profiles.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("voice.model.profiles.description")}
      </p>
    </div>

    {#if profiles.length > 0}
      <div class="space-y-2">
        {#each profiles as profile (profile.id)}
          <div
            class="border-border/60 bg-background/50 flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div class="min-w-0">
              <div class="text-foreground truncate text-sm font-medium">
                {profile.name || profile.id}
              </div>
              <div class="text-muted-foreground text-xs">
                {t("voice.model.profiles.embeddingDim", {
                  dim: profile.embeddingDim,
                })}
              </div>
            </div>
            <button
              type="button"
              class="border-border/60 text-destructive hover:bg-destructive/10 shrink-0 rounded border px-2 py-1 text-xs disabled:opacity-50"
              disabled={operationActive || deletingProfileId === profile.id}
              onclick={() => deleteProfile(profile.id)}
            >
              <Trash2Icon class="h-3.5 w-3.5" />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="text-muted-foreground text-sm">
        {t("voice.model.profiles.empty")}
      </div>
    {/if}
  </section>
</div>

<ConfirmDialog
  bind:open={confirmOpen}
  title={confirmTitle}
  description={confirmDescription}
  confirmText={t("common.confirm")}
  cancelText={t("common.cancel")}
  variant={confirmVariant}
  onconfirm={handleConfirm}
  oncancel={handleCancel}
/>
