<script lang="ts">
  import CircleCheckIcon from "virtual:icons/lucide/circle-check";
  import CircleXIcon from "virtual:icons/lucide/circle-x";
  import GaugeIcon from "virtual:icons/lucide/gauge";
  import RefreshCwIcon from "virtual:icons/lucide/refresh-cw";
  import SquareIcon from "virtual:icons/lucide/square";
  import { commands } from "$lib/bindings";
  import type { EngineBackend, VoiceBackendStatus } from "$lib/bindings";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    SETTINGS,
    type VoiceGenerationBackendSetting,
    type VoiceQueuePolicySetting,
  } from "$lib/settings-store";
  import {
    refreshVoiceStatus,
    VOICE,
  } from "$lib/stores/voice-store.svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";

  const voice = $derived(SETTINGS.voice.state);
  const status = $derived(VOICE.status);
  const operationActive = $derived(VOICE.operation.kind !== "idle");
  const generationBackends: {
    value: VoiceGenerationBackendSetting;
    labelKey: MessageKey;
  }[] = [
    { value: "auto", labelKey: "voice.backend.auto" },
    { value: "cpu", labelKey: "voice.backend.cpu" },
    { value: "vulkan", labelKey: "voice.backend.vulkan" },
  ];

  $effect(() => {
    const current = SETTINGS.voice.state.generationBackend as string;
    if (!generationBackends.some((backend) => backend.value === current)) {
      SETTINGS.voice.state.generationBackend = "auto";
    }
  });

  const queuePolicies: {
    value: VoiceQueuePolicySetting;
    labelKey: MessageKey;
  }[] = [
    { value: "dropLowPriority", labelKey: "voice.overview.queue.drop" },
    {
      value: "interruptForHigherPriority",
      labelKey: "voice.overview.queue.interrupt",
    },
  ];

  async function stopPlayback() {
    await commands.voiceStopPlayback();
  }

  async function refreshAll() {
    // Explicit user action: bypass the backend probe cache so a stale
    // "unavailable" reading (e.g. after installing the Vulkan runtime)
    // can be corrected without restarting the app.
    await refreshVoiceStatus(true);
  }

  function backendStatus(backend: EngineBackend): VoiceBackendStatus | null {
    if (!status) return null;
    return status.backends[backend];
  }

  function backendStateLabel(backend: EngineBackend): string {
    const entry = backendStatus(backend);
    if (!entry || entry.engine.kind === "missing") {
      return t("voice.backend.missing");
    }
    if (entry.engine.kind === "ready") {
      const device = entry.engine.probe.devices.find(
        (candidate) => candidate.backend === backend,
      );
      return device?.name ?? t("voice.backend.ready");
    }
    return entry.engine.kind === "incompatible"
      ? entry.engine.reason
      : entry.engine.message;
  }
</script>

<div class="space-y-5">
  <section class="border-border/60 bg-card/60 space-y-4 rounded-lg border p-5">
    <div class="space-y-1">
      <h2 class="text-foreground text-base font-semibold">
        {t("voice.overview.playback.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("voice.overview.playback.description")}
      </p>
    </div>

    <fieldset disabled={operationActive} class="space-y-4 disabled:opacity-60">
      <SettingsSwitch
        label={t("voice.overview.enabled")}
        description={t("voice.overview.enabledDescription")}
        bind:checked={SETTINGS.voice.state.enabled}
      />

      <div class="grid gap-4 md:grid-cols-2">
        <label class="text-muted-foreground text-xs">
          {t("voice.overview.volume", {
            value: Math.round(voice.volume * 100),
          })}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="mt-2 w-full"
            value={voice.volume}
            oninput={(event) => {
              SETTINGS.voice.state.volume = Number(
                (event.currentTarget as HTMLInputElement).value,
              );
            }}
          />
        </label>

        <label class="text-muted-foreground text-xs">
          {t("voice.overview.queuePolicy")}
          <select
            class="border-border/60 bg-muted/30 text-foreground mt-2 w-full rounded border px-3 py-2 text-sm"
            value={voice.queuePolicy}
            onchange={(event) => {
              SETTINGS.voice.state.queuePolicy = (
                event.currentTarget as HTMLSelectElement
              ).value as VoiceQueuePolicySetting;
            }}
          >
            {#each queuePolicies as policy (policy.value)}
              <option value={policy.value}>{t(policy.labelKey)}</option>
            {/each}
          </select>
        </label>
      </div>
    </fieldset>

    <button
      type="button"
      class="border-border/60 hover:bg-muted/40 flex items-center gap-2 rounded border px-3 py-1.5 text-xs"
      onclick={stopPlayback}
    >
      <SquareIcon class="h-3.5 w-3.5" />
      {t("voice.overview.stopPlayback")}
    </button>
  </section>

  <section class="border-border/60 bg-card/60 space-y-4 rounded-lg border p-5">
    <div class="flex items-center gap-2">
      <GaugeIcon class="text-primary h-4 w-4" />
      <h2 class="text-foreground text-base font-semibold">
        {t("voice.backend.title")}
      </h2>
    </div>

    <div
      class="border-border/60 grid grid-cols-3 overflow-hidden rounded-lg border"
    >
      {#each generationBackends as backend (backend.value)}
        <button
          type="button"
          class="border-border/60 min-h-10 border-r px-3 py-2 text-sm font-medium last:border-r-0 {voice.generationBackend ===
          backend.value
            ? 'bg-primary text-primary-foreground'
            : 'bg-background/40 text-foreground hover:bg-muted/50'}"
          disabled={operationActive}
          onclick={() => {
            SETTINGS.voice.state.generationBackend = backend.value;
          }}
        >
          {t(backend.labelKey)}
        </button>
      {/each}
    </div>

    <div class="divide-border/60 divide-y border-y">
      {#each ["cpu", "vulkan"] as backend (backend)}
        {@const entry = backendStatus(backend as EngineBackend)}
        <div class="flex min-h-12 items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-sm font-medium">
              {#if entry?.engine.kind === "ready"}
                <CircleCheckIcon class="h-4 w-4 shrink-0 text-emerald-500" />
              {:else}
                <CircleXIcon class="text-muted-foreground h-4 w-4 shrink-0" />
              {/if}
              <span>{t(`voice.backend.${backend}` as MessageKey)}</span>
              {#if status?.backends.recommended === backend}
                <span class="text-primary text-xs"
                  >{t("voice.backend.recommended")}</span
                >
              {/if}
            </div>
            <div
              class="text-muted-foreground mt-0.5 truncate text-xs"
              title={backendStateLabel(backend as EngineBackend)}
            >
              {backendStateLabel(backend as EngineBackend)}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section class="border-border/60 bg-card/60 space-y-4 rounded-lg border p-5">
    <div class="flex items-center justify-between">
      <h2 class="text-foreground text-base font-semibold">
        {t("voice.overview.status.title")}
      </h2>
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 flex items-center gap-2 rounded border px-3 py-1.5 text-xs disabled:opacity-50"
        disabled={VOICE.statusLoading}
        onclick={refreshAll}
      >
        <RefreshCwIcon
          class="h-3.5 w-3.5 {VOICE.statusLoading ? 'animate-spin' : ''}"
        />
        {t("voice.overview.status.refresh")}
      </button>
    </div>

    {#if VOICE.error}
      <div
        class="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-xs"
      >
        {VOICE.error}
      </div>
    {/if}

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="border-border/60 bg-background/50 rounded-lg border p-3">
        <div class="text-muted-foreground text-xs">
          {t("voice.overview.status.model")}
        </div>
        <div class="mt-1 flex items-center gap-1.5 text-sm font-medium">
          {#if status?.model.kind === "ready"}
            <CircleCheckIcon class="h-4 w-4 text-emerald-500" />
            <span class="truncate">{status.model.version}</span>
          {:else if status?.model.kind === "corrupt"}
            <CircleXIcon class="text-destructive h-4 w-4" />
            <span class="text-destructive truncate" title={status.model.reason}
              >{status.model.version}</span
            >
          {:else}
            <CircleXIcon class="text-muted-foreground h-4 w-4" />
            <span>{t("voice.overview.status.modelMissing")}</span>
          {/if}
        </div>
      </div>

      <div class="border-border/60 bg-background/50 rounded-lg border p-3">
        <div class="text-muted-foreground text-xs">
          {t("voice.overview.status.sidecar")}
        </div>
        <div class="mt-1 flex items-center gap-1.5 text-sm font-medium">
          {#if status?.engine.kind === "ready"}
            <CircleCheckIcon class="h-4 w-4 text-emerald-500" />
            <span>{t("voice.overview.status.sidecarReady")}</span>
          {:else if status?.engine.kind === "incompatible"}
            <CircleXIcon class="text-destructive h-4 w-4" />
            <span class="text-destructive truncate" title={status.engine.reason}
              >{status.engine.reason}</span
            >
          {:else if status?.engine.kind === "error"}
            <CircleXIcon class="text-destructive h-4 w-4" />
            <span
              class="text-destructive truncate"
              title={status.engine.message}>{status.engine.message}</span
            >
          {:else}
            <CircleXIcon class="text-destructive h-4 w-4" />
            <span>{t("voice.overview.status.sidecarMissing")}</span>
          {/if}
        </div>
      </div>

      <div class="border-border/60 bg-background/50 rounded-lg border p-3">
        <div class="text-muted-foreground text-xs">
          {t("voice.overview.status.profiles")}
        </div>
        <div class="mt-1 text-sm font-medium">
          {status?.catalog.profiles.length ?? 0}
        </div>
      </div>

      <div class="border-border/60 bg-background/50 rounded-lg border p-3">
        <div class="text-muted-foreground text-xs">
          {t("voice.overview.status.phrases")}
        </div>
        <div class="mt-1 text-sm font-medium">
          {status?.catalog.phrases.length ?? 0}
        </div>
      </div>
    </div>

    {#if status && status.generation.kind !== "idle"}
      <div
        class="border-primary/40 bg-primary/10 text-primary rounded-lg border px-3 py-2 text-xs"
      >
        {t("voice.overview.status.generating")}
      </div>
    {/if}
  </section>
</div>
