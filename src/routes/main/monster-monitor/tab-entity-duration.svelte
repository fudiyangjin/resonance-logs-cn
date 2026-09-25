<script lang="ts">
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import type { EntityDurationPreset } from "$lib/config/entity-duration-presets";
  import {
    isValidEntityId,
    type EntityDurationEntryInput,
    type EntityDurationEntryPatch,
  } from "$lib/entity-duration-entries";
  import { t } from "$lib/i18n/index.svelte";
  import type {
    CustomPanelStyle,
    EntityDurationEntry,
    EntityDurationScope,
  } from "$lib/settings-store";
  import OverlayTextStyleFields from "../skill-monitor/overlay-text-style-fields.svelte";

  interface Props {
    entries: EntityDurationEntry[];
    presets: EntityDurationPreset[];
    panelStyle: CustomPanelStyle;
    addPreset: (preset: EntityDurationPreset) => void;
    addEntry: (input: EntityDurationEntryInput) => void;
    updateEntry: (id: string, patch: EntityDurationEntryPatch) => void;
    moveEntry: (id: string, direction: "up" | "down") => void;
    removeEntry: (id: string) => void;
    updatePanelStyle: <K extends keyof CustomPanelStyle>(
      key: K,
      value: CustomPanelStyle[K],
    ) => void;
  }

  let {
    entries,
    presets,
    panelStyle,
    addPreset,
    addEntry,
    updateEntry,
    moveEntry,
    removeEntry,
    updatePanelStyle,
  }: Props = $props();

  let manualIdText = $state("");
  let manualLabel = $state("");
  let manualSecondsText = $state("");
  let manualScope = $state<EntityDurationScope>("self");
  let manualMerge = $state(false);
  let manualIdInvalid = $state(false);
  let voiceExpandedIds = $state<string[]>([]);

  function toggleVoiceExpanded(id: string) {
    voiceExpandedIds = voiceExpandedIds.includes(id)
      ? voiceExpandedIds.filter((existing) => existing !== id)
      : [...voiceExpandedIds, id];
  }

  const monitoredIds = $derived(new Set(entries.map((e) => e.monsterId)));

  function parseSeconds(text: string): number | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
    return Math.round(seconds * 1000);
  }

  function submitManual() {
    const id = Number(manualIdText.trim());
    if (!isValidEntityId(id)) {
      manualIdInvalid = true;
      return;
    }
    manualIdInvalid = false;
    const durationMs = parseSeconds(manualSecondsText);
    addEntry({
      monsterId: id,
      label: manualLabel,
      scope: manualScope,
      merge: manualMerge,
      ...(durationMs !== undefined ? { durationMs } : {}),
    });
    manualIdText = "";
    manualLabel = "";
    manualSecondsText = "";
  }

  function secondsText(entry: EntityDurationEntry): string {
    return entry.durationMs === undefined
      ? ""
      : String(Math.round(entry.durationMs / 100) / 10);
  }

  function commitSeconds(entry: EntityDurationEntry, text: string) {
    const durationMs = parseSeconds(text);
    updateEntry(entry.id, {
      durationMs: durationMs === undefined ? null : durationMs,
    });
  }

  const inputClass =
    "border-border bg-background focus:border-primary rounded-lg border px-3 py-2 text-sm outline-none";
</script>

<section class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5">
  <div class="space-y-1">
    <h2 class="text-foreground text-base font-semibold">
      {t("monsterMonitor.entityDuration.title")}
    </h2>
    <p class="text-muted-foreground text-sm">
      {t("monsterMonitor.entityDuration.description")}
    </p>
  </div>
</section>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <h3 class="text-foreground text-sm font-semibold">
    {t("monsterMonitor.entityDuration.presetsTitle")}
  </h3>
  <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
    {#each presets as preset (preset.key)}
      {@const added = monitoredIds.has(preset.monsterId)}
      <button
        type="button"
        class="border-border/60 bg-muted/20 hover:bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        disabled={added}
        onclick={() => addPreset(preset)}
      >
        {#if preset.imagePath}
          <img
            src={preset.imagePath}
            alt=""
            class="h-9 w-9 shrink-0 rounded-md object-cover"
          />
        {/if}
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-foreground truncate font-medium">{preset.label}</span>
          <span class="text-muted-foreground text-xs">
            #{preset.monsterId}
            {#if preset.durationMs !== undefined}
              · {Math.round(preset.durationMs / 1000)}s
            {/if}
            · {preset.scope === "any"
              ? t("monsterMonitor.entityDuration.scope.any")
              : t("monsterMonitor.entityDuration.scope.self")}
            {#if preset.merge}
              · {t("monsterMonitor.entityDuration.merge")}
            {/if}
          </span>
        </span>
        {#if added}
          <span class="text-muted-foreground shrink-0 text-xs">
            {t("monsterMonitor.entityDuration.presetAdded")}
          </span>
        {/if}
      </button>
    {/each}
  </div>
</section>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <h3 class="text-foreground text-sm font-semibold">
    {t("monsterMonitor.entityDuration.manualTitle")}
  </h3>
  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <label class="flex flex-col gap-1 text-xs">
      <span class="text-muted-foreground"
        >{t("monsterMonitor.entityDuration.monsterId")}</span
      >
      <input
        type="text"
        inputmode="numeric"
        class={inputClass}
        bind:value={manualIdText}
        placeholder="179903"
      />
    </label>
    <label class="flex flex-col gap-1 text-xs">
      <span class="text-muted-foreground"
        >{t("monsterMonitor.entityDuration.label")}</span
      >
      <input type="text" class={inputClass} bind:value={manualLabel} />
    </label>
    <label class="flex flex-col gap-1 text-xs">
      <span class="text-muted-foreground"
        >{t("monsterMonitor.entityDuration.durationSeconds")}</span
      >
      <input
        type="text"
        inputmode="decimal"
        class={inputClass}
        bind:value={manualSecondsText}
        placeholder="35"
      />
    </label>
    <label class="flex flex-col gap-1 text-xs">
      <span class="text-muted-foreground"
        >{t("monsterMonitor.entityDuration.scope")}</span
      >
      <select class={inputClass} bind:value={manualScope}>
        <option value="self"
          >{t("monsterMonitor.entityDuration.scope.self")}</option
        >
        <option value="any">{t("monsterMonitor.entityDuration.scope.any")}</option
        >
      </select>
    </label>
  </div>
  <label class="text-foreground flex items-center gap-2 text-xs">
    <input type="checkbox" bind:checked={manualMerge} />
    {t("monsterMonitor.entityDuration.merge")}
    <span class="text-muted-foreground"
      >{t("monsterMonitor.entityDuration.mergeHint")}</span
    >
  </label>
  <p class="text-muted-foreground text-xs">
    {t("monsterMonitor.entityDuration.durationHint")}
  </p>
  {#if manualIdInvalid}
    <p class="text-destructive text-xs">
      {t("monsterMonitor.entityDuration.invalidId")}
    </p>
  {/if}
  <button
    type="button"
    class="bg-primary text-primary-foreground border-primary rounded-lg border px-3 py-2 text-sm font-medium"
    onclick={submitManual}
  >
    {t("monsterMonitor.entityDuration.add")}
  </button>
</section>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <h3 class="text-foreground text-sm font-semibold">
    {t("monsterMonitor.entityDuration.listTitle")}
  </h3>
  {#if entries.length === 0}
    <p class="text-muted-foreground text-sm">
      {t("monsterMonitor.entityDuration.empty")}
    </p>
  {:else}
    <div class="space-y-2">
      {#each entries as entry, index (entry.id)}
        <div class="teammate-order-row flex-wrap">
          <span class="text-muted-foreground w-20 shrink-0 text-xs"
            >#{entry.monsterId}</span
          >
          <input
            type="text"
            class="{inputClass} min-w-0 flex-1"
            value={entry.label}
            placeholder={t("monsterMonitor.entityDuration.label")}
            onchange={(event) =>
              updateEntry(entry.id, {
                label: (event.currentTarget as HTMLInputElement).value,
              })}
          />
          <input
            type="text"
            inputmode="decimal"
            class="{inputClass} w-24"
            value={secondsText(entry)}
            placeholder={t("monsterMonitor.entityDuration.noDuration")}
            onchange={(event) =>
              commitSeconds(
                entry,
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
          <select
            class="{inputClass} w-28"
            value={entry.scope}
            onchange={(event) =>
              updateEntry(entry.id, {
                scope:
                  (event.currentTarget as HTMLSelectElement).value === "any"
                    ? "any"
                    : "self",
              })}
          >
            <option value="self"
              >{t("monsterMonitor.entityDuration.scope.self")}</option
            >
            <option value="any"
              >{t("monsterMonitor.entityDuration.scope.any")}</option
            >
          </select>
          <label
            class="text-foreground flex shrink-0 items-center gap-2 text-xs"
            title={t("monsterMonitor.entityDuration.mergeHint")}
          >
            <input
              type="checkbox"
              checked={entry.merge === true}
              onchange={(event) =>
                updateEntry(entry.id, {
                  merge: (event.currentTarget as HTMLInputElement).checked,
                })}
            />
            {t("monsterMonitor.entityDuration.merge")}
          </label>
          <button
            type="button"
            class="order-button"
            disabled={index === 0}
            onclick={() => moveEntry(entry.id, "up")}
          >
            {t("monsterMonitor.priority.moveUp")}
          </button>
          <button
            type="button"
            class="order-button"
            disabled={index === entries.length - 1}
            onclick={() => moveEntry(entry.id, "down")}
          >
            {t("monsterMonitor.priority.moveDown")}
          </button>
          <button
            type="button"
            class="order-button danger"
            onclick={() => removeEntry(entry.id)}
          >
            {t("monsterMonitor.priority.remove")}
          </button>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground flex basis-full items-center justify-between gap-2 px-1 text-xs"
            onclick={() => toggleVoiceExpanded(entry.id)}
          >
            <span>{t("monsterMonitor.entityDuration.voice.title")}</span>
            <ChevronDownIcon
              class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 {voiceExpandedIds.includes(
                entry.id,
              )
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if voiceExpandedIds.includes(entry.id)}
            <div class="basis-full space-y-2">
              <p class="text-muted-foreground px-1 text-xs">
                {t("monsterMonitor.entityDuration.voice.hint")}
              </p>
              <VoiceBindingControl
                subject={{
                  kind: "entity",
                  monsterId: entry.monsterId,
                  scope: entry.scope,
                }}
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<section class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5">
  <h3 class="text-foreground text-sm font-semibold">
    {t("monsterMonitor.entityDuration.styleTitle")}
  </h3>
  <div class="grid gap-4 lg:grid-cols-3">
    <label class="style-field">
      <span>{t("monsterMonitor.style.gap")}</span>
      <input
        type="range"
        min="0"
        max="24"
        value={panelStyle.gap}
        oninput={(event) =>
          updatePanelStyle(
            "gap",
            Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
          )}
      />
      <strong>{panelStyle.gap}px</strong>
    </label>
    <label class="style-field">
      <span>{t("monsterMonitor.style.columnGap")}</span>
      <input
        type="range"
        min="0"
        max="240"
        value={panelStyle.columnGap}
        oninput={(event) =>
          updatePanelStyle(
            "columnGap",
            Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
          )}
      />
      <strong>{panelStyle.columnGap}px</strong>
    </label>
    <label class="style-field">
      <span>{t("monsterMonitor.style.fontSize")}</span>
      <input
        type="range"
        min="10"
        max="28"
        value={panelStyle.fontSize}
        oninput={(event) =>
          updatePanelStyle(
            "fontSize",
            Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
          )}
      />
      <strong>{panelStyle.fontSize}px</strong>
    </label>
  </div>

  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <label class="color-field">
      <span>{t("monsterMonitor.style.nameColor")}</span>
      <input
        type="color"
        value={panelStyle.nameColor}
        oninput={(event) =>
          updatePanelStyle(
            "nameColor",
            (event.currentTarget as HTMLInputElement).value,
          )}
      />
    </label>
    <label class="color-field">
      <span>{t("monsterMonitor.style.valueColor")}</span>
      <input
        type="color"
        value={panelStyle.valueColor}
        oninput={(event) =>
          updatePanelStyle(
            "valueColor",
            (event.currentTarget as HTMLInputElement).value,
          )}
      />
    </label>
    <label class="color-field">
      <span>{t("monsterMonitor.style.progressColor")}</span>
      <input
        type="color"
        value={panelStyle.progressColor}
        oninput={(event) =>
          updatePanelStyle(
            "progressColor",
            (event.currentTarget as HTMLInputElement).value,
          )}
      />
    </label>
    <label class="color-field">
      <span>{t("monsterMonitor.style.progressOpacity")}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={panelStyle.progressOpacity}
        oninput={(event) =>
          updatePanelStyle(
            "progressOpacity",
            Number((event.currentTarget as HTMLInputElement).value),
          )}
      />
      <strong>{Math.round(panelStyle.progressOpacity * 100)}%</strong>
    </label>
  </div>
  <OverlayTextStyleFields
    textShadowEnabled={panelStyle.textShadowEnabled}
    backgroundEnabled={panelStyle.backgroundEnabled}
    backgroundOpacity={panelStyle.backgroundOpacity}
    onTextShadowEnabled={(v) => updatePanelStyle("textShadowEnabled", v)}
    onBackgroundEnabled={(v) => updatePanelStyle("backgroundEnabled", v)}
    onBackgroundOpacity={(v) => updatePanelStyle("backgroundOpacity", v)}
  />
</section>

<style>
  .teammate-order-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.28);
  }

  .order-button {
    flex: 0 0 auto;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 4px 8px;
    color: var(--foreground, #fff);
    font-size: 12px;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      color 120ms ease;
  }

  .order-button:hover:not(:disabled) {
    border-color: rgba(96, 165, 250, 0.65);
    background: rgba(30, 41, 59, 0.55);
  }

  .order-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .order-button.danger {
    color: var(--destructive, #f87171);
  }

  .order-button.danger:hover:not(:disabled) {
    border-color: rgba(248, 113, 113, 0.55);
    background: rgba(127, 29, 29, 0.24);
  }

  .style-field,
  .color-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.22);
    font-size: 13px;
    color: var(--foreground, #fff);
  }

  .style-field strong {
    font-size: 12px;
    color: var(--muted-foreground, rgba(255, 255, 255, 0.72));
  }

  .color-field input[type="color"] {
    width: 100%;
    height: 42px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }
</style>
