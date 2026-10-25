<script lang="ts">
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import MonsterSkillSearchGrid from "$lib/components/MonsterSkillSearchGrid.svelte";
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import {
    lookupMonsterSkillDefaultName,
    searchMonsterSkills,
  } from "$lib/config/monster-skill-search";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import type { MonsterSkillEntryPatch } from "$lib/monster-skill-entries";
  import type {
    CustomPanelStyle,
    MonsterSkillWatchEntry,
  } from "$lib/settings-store";
  import { blurOnEnter } from "$lib/utils.svelte";
  import OverlayTextStyleFields from "../skill-monitor/overlay-text-style-fields.svelte";

  interface Props {
    monitorAll: boolean;
    onMonitorAllChange: (checked: boolean) => void;
    entries: MonsterSkillWatchEntry[];
    panelStyle: CustomPanelStyle;
    addEntry: (skillId: number) => void;
    updateEntry: (skillId: number, patch: MonsterSkillEntryPatch) => void;
    moveEntry: (skillId: number, direction: "up" | "down") => void;
    removeEntry: (skillId: number) => void;
    updatePanelStyle: <K extends keyof CustomPanelStyle>(
      key: K,
      value: CustomPanelStyle[K],
    ) => void;
  }

  let {
    monitorAll,
    onMonitorAllChange,
    entries,
    panelStyle,
    addEntry,
    updateEntry,
    moveEntry,
    removeEntry,
    updatePanelStyle,
  }: Props = $props();

  let searchKeyword = $state("");
  let voiceExpandedIds = $state<number[]>([]);

  const addedIds = $derived(new Set(entries.map((entry) => entry.skillId)));
  const aliases = $derived(
    Object.fromEntries(
      entries
        .filter((entry) => entry.label)
        .map((entry) => [String(entry.skillId), entry.label]),
    ),
  );
  const searchResults = $derived(
    searchMonsterSkills(searchKeyword, aliases, getLocale()),
  );

  function toggleVoiceExpanded(skillId: number) {
    voiceExpandedIds = voiceExpandedIds.includes(skillId)
      ? voiceExpandedIds.filter((existing) => existing !== skillId)
      : [...voiceExpandedIds, skillId];
  }

  function defaultName(skillId: number): string {
    return lookupMonsterSkillDefaultName(skillId, getLocale()) ?? `#${skillId}`;
  }

  function secondsText(entry: MonsterSkillWatchEntry): string {
    return String(Math.round(entry.displayMs / 100) / 10);
  }

  function commitSeconds(
    entry: MonsterSkillWatchEntry,
    input: HTMLInputElement,
  ) {
    const seconds = Number(input.value.trim());
    if (Number.isFinite(seconds) && seconds > 0) {
      updateEntry(entry.skillId, { displayMs: Math.round(seconds * 1000) });
    }
    // Show the stored (clamped) value, also after rejected input.
    input.value = secondsText(entry);
  }

  const inputClass =
    "border-border bg-background focus:border-primary rounded-lg border px-3 py-2 text-sm outline-none";
</script>

<section class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5">
  <div class="space-y-1">
    <h2 class="text-foreground text-base font-semibold">
      {t("monsterMonitor.monsterSkill.title")}
    </h2>
    <p class="text-muted-foreground text-sm">
      {t("monsterMonitor.monsterSkill.description")}
    </p>
  </div>
  <SettingsSwitch
    label={t("monsterMonitor.monsterSkill.monitorAll")}
    description={t("monsterMonitor.monsterSkill.monitorAllDesc")}
    checked={monitorAll}
    onCheckedChange={onMonitorAllChange}
  />
</section>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <h3 class="text-foreground text-sm font-semibold">
    {t("monsterMonitor.monsterSkill.searchTitle")}
  </h3>
  <input
    type="text"
    bind:value={searchKeyword}
    placeholder={t("monsterMonitor.monsterSkill.searchPlaceholder")}
    class="{inputClass} w-full py-2.5"
  />
  <p class="text-muted-foreground text-xs">
    {t("monsterMonitor.monsterSkill.searchHint")}
  </p>
  {#if searchKeyword.trim().length > 0}
    <MonsterSkillSearchGrid
      items={searchResults}
      onSelect={addEntry}
      isAdded={(skillId) => addedIds.has(skillId)}
      emptyMessage={t("monsterMonitor.monsterSkill.emptySearch")}
    />
  {/if}
</section>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <h3 class="text-foreground text-sm font-semibold">
    {t("monsterMonitor.monsterSkill.listTitle")}
  </h3>
  {#if entries.length === 0}
    <p class="text-muted-foreground text-sm">
      {t("monsterMonitor.monsterSkill.empty")}
    </p>
  {:else}
    <div class="space-y-2">
      {#each entries as entry, index (entry.skillId)}
        <div class="teammate-order-row flex-wrap">
          <span class="text-muted-foreground w-24 shrink-0 text-xs"
            >#{entry.skillId}</span
          >
          <span
            class="text-muted-foreground min-w-0 flex-1 truncate text-xs"
            title={defaultName(entry.skillId)}
          >
            {defaultName(entry.skillId)}
          </span>
          <input
            type="text"
            class="{inputClass} w-36"
            value={entry.label}
            placeholder={t("monsterMonitor.monsterSkill.label")}
            {@attach blurOnEnter}
            onchange={(event) =>
              updateEntry(entry.skillId, {
                label: event.currentTarget.value,
              })}
          />
          <label
            class="text-muted-foreground flex shrink-0 items-center gap-2 text-xs"
          >
            {t("monsterMonitor.monsterSkill.displaySeconds")}
            <input
              type="text"
              inputmode="decimal"
              class="{inputClass} w-20"
              value={secondsText(entry)}
              {@attach blurOnEnter}
              onchange={(event) => commitSeconds(entry, event.currentTarget)}
            />
          </label>
          <button
            type="button"
            class="order-button"
            disabled={index === 0}
            onclick={() => moveEntry(entry.skillId, "up")}
          >
            {t("monsterMonitor.priority.moveUp")}
          </button>
          <button
            type="button"
            class="order-button"
            disabled={index === entries.length - 1}
            onclick={() => moveEntry(entry.skillId, "down")}
          >
            {t("monsterMonitor.priority.moveDown")}
          </button>
          <button
            type="button"
            class="order-button danger"
            onclick={() => removeEntry(entry.skillId)}
          >
            {t("monsterMonitor.priority.remove")}
          </button>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground flex basis-full items-center justify-between gap-2 px-1 text-xs"
            onclick={() => toggleVoiceExpanded(entry.skillId)}
          >
            <span>{t("monsterMonitor.monsterSkill.voice.title")}</span>
            <ChevronDownIcon
              class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 {voiceExpandedIds.includes(
                entry.skillId,
              )
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if voiceExpandedIds.includes(entry.skillId)}
            <div class="basis-full">
              <VoiceBindingControl
                subject={{ kind: "monsterSkill", skillId: entry.skillId }}
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
    {t("monsterMonitor.monsterSkill.styleTitle")}
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
            Number.parseInt(event.currentTarget.value, 10),
          )}
      />
      <strong>{panelStyle.gap}px</strong>
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
            Number.parseInt(event.currentTarget.value, 10),
          )}
      />
      <strong>{panelStyle.fontSize}px</strong>
    </label>
    <label class="color-field">
      <span>{t("monsterMonitor.style.nameColor")}</span>
      <input
        type="color"
        value={panelStyle.nameColor}
        oninput={(event) =>
          updatePanelStyle("nameColor", event.currentTarget.value)}
      />
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
