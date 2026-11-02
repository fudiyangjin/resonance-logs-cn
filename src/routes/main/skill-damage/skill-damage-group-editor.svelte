<script lang="ts">
  import {
    SKILL_DAMAGE_ICON_PRESETS,
    TALENT_DAMAGE_ICON_PRESETS,
    skillDamageIconBackground,
    resolveSkillDamageIcon,
  } from "$lib/skill-damage-icons";
  import { damagePaint } from "$lib/skill-damage-groups";
  import DamagePaintEditor from "./damage-paint-editor.svelte";
  import SkillIcon from "$lib/components/skill-icon.svelte";
  import { onDestroy, untrack } from "svelte";
  import SkillDamageRow from "$lib/components/SkillDamageRow.svelte";
  import { skillDamageDurationMs } from "$lib/skill-damage-display";
  import type { SkillDamageGroup } from "$lib/settings-store";
  import DamageNumberStyleEditor from "./damage-number-style-editor.svelte";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import { searchSkillDamage } from "$lib/config/skill-damage-search";
  import MonsterSkillSearchGrid from "$lib/components/MonsterSkillSearchGrid.svelte";
  import { lookupDamageIdName } from "$lib/config/recount-table";
  import SettingsFilePicker from "../dps/settings/settings-file-picker.svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";

  let { config }: { config: SkillDamageGroup } = $props();
  config.iconBackground ??= damagePaint("#1e232c");
  let iconCategory = $state<"skill" | "talent">(
    untrack(() => (config.iconPath?.includes("/talent/") ? "talent" : "skill")),
  );
  const iconPresets = $derived(
    iconCategory === "talent"
      ? TALENT_DAMAGE_ICON_PRESETS
      : SKILL_DAMAGE_ICON_PRESETS,
  );
  let previewId = $state(0);
  let previewVisible = $state(false);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  function testAnimation() {
    clearTimeout(previewTimer);
    previewId += 1;
    previewVisible = true;
    previewTimer = setTimeout(
      () => (previewVisible = false),
      skillDamageDurationMs(config.durationMs),
    );
  }
  onDestroy(() => clearTimeout(previewTimer));
  let searchKeyword = $state("");
  const addedIds = $derived(
    new Set(config.entries.map((entry) => entry.skillId)),
  );
  const aliases = $derived(
    Object.fromEntries(
      config.entries.map((entry) => [String(entry.skillId), entry.alias]),
    ),
  );
  const searchResults = $derived(
    searchSkillDamage(searchKeyword, aliases, getLocale()),
  );
  function add(skillId: number) {
    if (addedIds.has(skillId)) return;
    config.entries = [...config.entries, { skillId, alias: "" }];
  }
</script>

<section class="space-y-4 rounded-lg border p-4">
  <h2 class="text-lg font-semibold">{config.name}</h2>
  <p class="text-muted-foreground text-sm">{t("skillDamage.description")}</p>
  <SettingsSwitch
    bind:checked={config.enabled}
    label={t("skillDamage.groupEnabled")}
  />
  <SettingsSwitch
    checked={config.mergeSimultaneous}
    onCheckedChange={(checked) => (config.mergeSimultaneous = checked)}
    label={t("skillDamage.groupMerge")}
    description={t("skillDamage.groupMergeHint")}
  />
  <SettingsSwitch
    checked={config.mergeHits ?? false}
    onCheckedChange={(checked) => (config.mergeHits = checked)}
    label={t("skillDamage.mergeHits")}
    description={t("skillDamage.mergeHitsHint")}
  />
  <SettingsSwitch
    checked={config.showSkillName ?? true}
    onCheckedChange={(checked) => (config.showSkillName = checked)}
    label={t("skillDamage.showSkillLabel")}
  />
  {#if config.showSkillName !== false}
    <label class="flex items-center gap-2 text-sm"
      >{t("skillDamage.labelMode")}
      <select
        class="bg-background rounded border p-2"
        value={config.nameDisplayMode ?? "text"}
        onchange={(event) => {
          config.nameDisplayMode = event.currentTarget.value as "text" | "icon";
          if (
            config.nameDisplayMode === "icon" &&
            !resolveSkillDamageIcon(config.iconPath)
          )
            config.iconPath = SKILL_DAMAGE_ICON_PRESETS[0] ?? "";
        }}
      >
        <option value="text">{t("skillDamage.nameText")}</option><option
          value="icon">{t("skillDamage.nameIcon")}</option
        >
      </select>
    </label>
    {#if config.nameDisplayMode === "icon"}
      <div class="space-y-2 rounded border p-3">
        <h3 class="text-sm font-semibold">{t("skillDamage.iconPresets")}</h3>
        <label class="flex items-center gap-2 text-sm"
          >{t("skillDamage.iconCategory")}
          <select
            class="bg-background rounded border p-2"
            bind:value={iconCategory}
          >
            <option value="skill">{t("skillDamage.skillIcons")}</option><option
              value="talent">{t("skillDamage.talentIcons")}</option
            >
          </select>
        </label>
        <DamagePaintEditor
          paint={config.iconBackground!}
          label={t("skillDamage.iconBackground")}
        />
        <label class="flex items-center gap-2 text-sm"
          >{t("skillDamage.iconOpacity")}
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={(config.iconBackgroundOpacity ?? 0.9) * 100}
            oninput={(event) =>
              (config.iconBackgroundOpacity =
                Number(event.currentTarget.value) / 100)}
          />
          <span>{Math.round((config.iconBackgroundOpacity ?? 0.9) * 100)}%</span
          >
        </label>
        <div
          class="grid max-h-80 grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2 overflow-y-auto p-1"
        >
          {#each iconPresets as path, index (path)}
            <button
              type="button"
              class="h-12 w-12 rounded border-2 p-1 {config.iconPath === path
                ? 'border-primary bg-primary/20'
                : 'border-transparent hover:border-border'}"
              aria-label={t("skillDamage.iconNumber", { number: index + 1 })}
              aria-pressed={config.iconPath === path}
              title={t("skillDamage.iconNumber", { number: index + 1 })}
              onclick={() => (config.iconPath = path)}
            >
              <SkillIcon
                imagePath={path}
                background={skillDamageIconBackground(config)}
              />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
  <div class="flex flex-wrap items-center gap-4">
    <label class="flex items-center gap-2 text-sm"
      >{t("skillDamage.scrollDirection")}
      <select
        class="bg-background rounded border p-2"
        value={config.scrollDirection ?? "up"}
        onchange={(event) =>
          (config.scrollDirection = event.currentTarget.value as "up" | "down")}
      >
        <option value="up">{t("skillDamage.scrollUp")}</option><option
          value="down">{t("skillDamage.scrollDown")}</option
        >
      </select>
    </label>
    <label class="flex items-center gap-2 text-sm"
      >{t("skillDamage.labelSpacing")}
      <input
        class="bg-background w-24 rounded border p-2"
        type="number"
        min="0"
        max="200"
        value={config.labelSpacing ?? 12}
        onchange={(event) =>
          (config.labelSpacing = Math.max(
            0,
            Math.min(200, Number(event.currentTarget.value) || 0),
          ))}
      />
    </label>
  </div>
  <label class="flex items-center gap-2 text-sm">
    {t("skillDamage.maxVisible")}
    <select
      class="bg-background rounded border p-2"
      value={config.maxVisible ?? 8}
      onchange={(event) =>
        (config.maxVisible = Number(event.currentTarget.value))}
    >
      {#each [1, 2, 3, 4, 5, 6, 7, 8] as count}<option value={count}
          >{count}</option
        >{/each}
    </select>
  </label>
  <div class="flex flex-wrap gap-4">
    <label class="flex items-center gap-2 text-sm">
      {t("skillDamage.format")}
      <select
        class="bg-background rounded border p-2"
        bind:value={config.format}
      >
        {#each ["integer", "grouped", "cn", "western"] as format}
          <option value={format}
            >{t(`skillDamage.${format}` as "skillDamage.integer")}</option
          >
        {/each}
      </select>
    </label>
    <label class="flex items-center gap-2 text-sm">
      {t("skillDamage.animation")}
      <select
        class="bg-background rounded border p-2"
        bind:value={config.animation}
      >
        <option value="pop">{t("skillDamage.pop")}</option>
        <option value="shrink">{t("skillDamage.shrink")}</option>
        <option value="floatUp">{t("skillDamage.floatUp")}</option>
      </select>
    </label>
  </div>
  <div class="flex flex-wrap items-center gap-3">
    <label class="flex items-center gap-2 text-sm">
      {t("skillDamage.duration")}
      <input
        class="bg-background w-24 rounded border p-2"
        type="text"
        inputmode="decimal"
        value={skillDamageDurationMs(config.durationMs) / 1000}
        onchange={(event) => {
          const seconds = Number(event.currentTarget.value.trim());
          if (Number.isFinite(seconds) && seconds > 0)
            config.durationMs = skillDamageDurationMs(seconds * 1000);
          event.currentTarget.value = String(
            skillDamageDurationMs(config.durationMs) / 1000,
          );
        }}
      />
    </label>
    <button
      type="button"
      class="rounded border px-3 py-2 text-sm"
      onclick={testAnimation}>{t("skillDamage.test")}</button
    >
  </div>
  <p class="text-muted-foreground text-xs">{t("skillDamage.testHint")}</p>
  {#if previewVisible}
    <div
      class="overflow-visible rounded border bg-black/80 p-8 text-2xl font-bold text-white"
    >
      {#key previewId}
        <SkillDamageRow
          {config}
          label={config.mergeSimultaneous
            ? config.name
            : config.entries[0]?.alias.trim() ||
              (config.entries[0]
                ? lookupDamageIdName(config.entries[0].skillId)
                : t("monsterMonitor.tabs.skillDamage"))}
          amount="123456"
          hitCount={3}
        />
      {/key}
    </div>
  {/if}
  <div class="space-y-3 rounded border p-3">
    <h3 class="text-sm font-semibold">{t("skillDamage.font")}</h3>
    <label class="flex items-center gap-2 text-sm">
      {t("skillDamage.fontFamily")}
      <input
        class="bg-background flex-1 rounded border p-2"
        placeholder="Arial / Microsoft YaHei"
        bind:value={config.fontFamily}
      />
    </label>
    <SettingsFilePicker
      label={t("themes.fonts.selectFont")}
      description={t("themes.fonts.selectFontDescription")}
      accept=".woff2,.woff,.ttf,.otf"
      value={config.fontUrl ?? ""}
      onchange={(dataUrl, fileName) => {
        config.fontUrl = dataUrl;
        config.fontFamily = fileName.replace(/\.(woff2?|ttf|otf)$/i, "");
      }}
      onclear={() => {
        config.fontUrl = "";
        config.fontFamily = "";
      }}
    />

    <div class="flex flex-wrap gap-4">
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.fontSize")}
        <input
          class="bg-background w-20 rounded border p-2"
          type="number"
          min="8"
          max="120"
          value={config.fontSize ?? 24}
          onchange={(event) =>
            (config.fontSize = Math.max(
              8,
              Math.min(120, Number(event.currentTarget.value) || 24),
            ))}
        />
      </label>
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.fontWeight")}
        <select
          class="bg-background rounded border p-2"
          bind:value={config.fontWeight}
        >
          {#each [400, 500, 600, 700, 800, 900] as weight}<option value={weight}
              >{weight}</option
            >{/each}
        </select>
      </label>
    </div>
  </div>
  <DamageNumberStyleEditor {config} />
  <div class="space-y-3">
    <form
      onsubmit={(event) => {
        event.preventDefault();
        const exact = searchKeyword.trim().replace(/^#/, "");
        const numeric = /^\d+$/.test(exact) ? Number(exact) : NaN;
        const match = searchResults.find((item) => item.skillId === numeric);
        if (match) add(match.skillId);
        else if (searchResults.length === 1) add(searchResults[0]!.skillId);
      }}
    >
      <input
        class="bg-background w-full rounded border p-2"
        type="search"
        aria-label={t("skillDamage.searchPlaceholder")}
        placeholder={t("skillDamage.searchPlaceholder")}
        bind:value={searchKeyword}
      />
    </form>
    <p class="text-muted-foreground text-xs">{t("skillDamage.searchHint")}</p>
    {#if searchKeyword.trim()}
      <MonsterSkillSearchGrid
        items={searchResults}
        onSelect={add}
        isAdded={(skillId) => addedIds.has(skillId)}
        emptyMessage={t("skillDamage.emptySearch")}
      />
    {/if}
  </div>
  {#each config.entries as entry (entry.skillId)}
    <div class="flex flex-wrap items-center gap-3 rounded border p-3">
      <span class="text-sm"
        >{lookupDamageIdName(entry.skillId)}
        <span class="text-muted-foreground">#{entry.skillId}</span></span
      >
      <input
        class="bg-background min-w-40 flex-1 rounded border p-2"
        aria-label={t("skillDamage.alias")}
        placeholder={t("skillDamage.alias")}
        bind:value={entry.alias}
      />
      <button
        class="rounded border px-3 py-2 text-sm"
        onclick={() =>
          (config.entries = config.entries.filter(
            (item) => item.skillId !== entry.skillId,
          ))}>{t("skillDamage.delete")}</button
      >
    </div>
  {/each}
</section>
