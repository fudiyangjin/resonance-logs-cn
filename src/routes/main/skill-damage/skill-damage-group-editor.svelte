<script lang="ts">
  import ContinuousDamageSettings from "./continuous-damage-settings.svelte";
  import { onDestroy } from "svelte";
  import {
    SKILL_DAMAGE_ICON_PRESETS,
    skillDamageIconBackground,
    resolveSkillDamageIcon,
  } from "$lib/skill-damage-icons";
  import {
    SKILL_DAMAGE_FONT_SIZE,
    SKILL_DAMAGE_FONT_WEIGHTS,
    SKILL_DAMAGE_LABEL_SPACING_MAX,
    SKILL_DAMAGE_ANIMATIONS,
    SKILL_DAMAGE_DURATION_MS,
    SKILL_DAMAGE_MAX_VISIBLE,
    isValidSkillDamageFontDataUrl,
    type SkillDamageGroup,
    type SkillDamageLabelMode,
  } from "$lib/skill-damage-settings";
  import {
    addSkillDamageFont,
    pruneUnusedSkillDamageFonts,
    skillDamageFonts,
  } from "$lib/skill-damage-profile.svelte";
  import {
    ensureSkillDamageFonts,
    skillDamageFontFamily,
  } from "$lib/skill-damage-fonts.svelte";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import { searchSkillDamage } from "$lib/config/skill-damage-search";
  import { lookupDamageIdName } from "$lib/config/recount-table";
  import SkillDamageRow from "$lib/components/SkillDamageRow.svelte";
  import MonsterSkillSearchGrid from "$lib/components/MonsterSkillSearchGrid.svelte";
  import DamagePaintEditor from "./damage-paint-editor.svelte";
  import DamageNumberStyleEditor from "./damage-number-style-editor.svelte";
  import SecondsInput from "./seconds-input.svelte";
  import SkillDamageIconPicker from "./skill-damage-icon-picker.svelte";
  import SettingsFilePicker from "../dps/settings/settings-file-picker.svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";

  let { group }: { group: SkillDamageGroup } = $props();

  const fonts = $derived(skillDamageFonts());
  const fontFamily = $derived(skillDamageFontFamily(group));
  $effect(() => ensureSkillDamageFonts([group]));

  /** A cast preview has no cast to follow, so it pretends one this long. */
  const PREVIEW_CAST_MS = 1_500;
  const PREVIEW_HIT_INTERVAL_MS = 250;
  const PREVIEW_HIT_AMOUNT = 41_152;

  let previewId = $state(0);
  let previewVisible = $state(false);
  /** Phase of a previewed continuous total; a merge group previews a hit row. */
  let previewPhase = $state<"active" | "final">();
  let previewHits = $state(1);
  let previewHitTimer: ReturnType<typeof setInterval> | undefined;
  let previewWindowTimer: ReturnType<typeof setTimeout> | undefined;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  const previewWindowMs = $derived(
    group.continuousWindowMode === "rolling"
      ? group.continuousWindowMs
      : group.continuousWindowMode === "cast"
        ? PREVIEW_CAST_MS + group.continuousCastCloseDelayMs
        : group.continuousTimeoutMs,
  );

  function stopPreviewTimers() {
    clearInterval(previewHitTimer);
    clearTimeout(previewWindowTimer);
    clearTimeout(previewTimer);
  }

  /**
   * A merge group shows one hit for its duration. A continuous group counts
   * hits for one window, then shows the settled total for the duration.
   */
  function testAnimation() {
    stopPreviewTimers();
    previewId += 1;
    previewVisible = true;
    previewHits = 1;
    previewPhase = undefined;
    let windowMs = 0;
    if (group.displayMode === "continuous") {
      windowMs = previewWindowMs;
      previewPhase = "active";
      previewHitTimer = setInterval(
        () => (previewHits += 1),
        PREVIEW_HIT_INTERVAL_MS,
      );
      previewWindowTimer = setTimeout(() => {
        clearInterval(previewHitTimer);
        previewPhase = "final";
        previewId += 1;
      }, windowMs);
    }
    previewTimer = setTimeout(
      () => (previewVisible = false),
      windowMs + group.durationMs,
    );
  }
  onDestroy(stopPreviewTimers);

  let searchKeyword = $state("");
  const addedIds = $derived(
    new Set(group.entries.map((entry) => entry.skillId)),
  );
  const aliases = $derived(
    Object.fromEntries(
      group.entries.map((entry) => [String(entry.skillId), entry.alias]),
    ),
  );
  const searchResults = $derived(
    searchSkillDamage(searchKeyword, aliases, getLocale()),
  );

  function add(skillId: number) {
    if (addedIds.has(skillId)) return;
    group.entries = [...group.entries, { skillId, alias: "" }];
  }

  function setLabelMode(mode: SkillDamageLabelMode) {
    group.labelMode = mode;
    if (mode === "icon" && !resolveSkillDamageIcon(group.iconPath)) {
      group.iconPath = SKILL_DAMAGE_ICON_PRESETS[0] ?? "";
    }
  }

  function selectFont(fontId: string | null) {
    group.fontId = fontId;
    pruneUnusedSkillDamageFonts();
  }

  function uploadFont(dataUrl: string, fileName: string) {
    if (!isValidSkillDamageFontDataUrl(dataUrl)) {
      console.warn("[skill-damage] rejected font file", fileName);
      return;
    }
    const name = fileName.replace(/\.(woff2?|ttf|otf)$/i, "");
    selectFont(addSkillDamageFont(name, dataUrl));
  }

  const previewLabel = $derived(
    group.displayMode === "continuous" || group.mergeSimultaneous
      ? group.name || t("skillDamage.defaultGroup")
      : group.entries[0]?.alias.trim() ||
          (group.entries[0]
            ? lookupDamageIdName(group.entries[0].skillId)
            : group.name || t("skillDamage.defaultGroup")),
  );
</script>

<section class="space-y-4 rounded-lg border p-4">
  <h2 class="text-lg font-semibold">
    {group.name || t("skillDamage.defaultGroup")}
  </h2>
  <p class="text-muted-foreground text-sm">{t("skillDamage.description")}</p>
  <SettingsSwitch
    bind:checked={group.enabled}
    label={t("skillDamage.groupEnabled")}
  />
  <label class="flex items-center gap-2 text-sm"
    >{t("skillDamage.displayMode")}
    <select
      class="bg-background rounded border p-2"
      bind:value={group.displayMode}
    >
      <option value="merge">{t("skillDamage.mergeMode")}</option><option
        value="continuous">{t("skillDamage.continuousMode")}</option
      >
    </select>
  </label>
  {#if group.displayMode === "continuous"}<ContinuousDamageSettings
      {group}
    />{:else}
    <SettingsSwitch
      bind:checked={group.mergeSimultaneous}
      label={t("skillDamage.groupMerge")}
      description={t("skillDamage.groupMergeHint")}
    />
    <SettingsSwitch
      bind:checked={group.mergeHits}
      label={t("skillDamage.mergeHits")}
      description={t("skillDamage.mergeHitsHint")}
    />
  {/if}
  <label class="flex items-center gap-2 text-sm"
    >{t("skillDamage.labelMode")}
    <select
      class="bg-background rounded border p-2"
      value={group.labelMode}
      onchange={(event) =>
        setLabelMode(event.currentTarget.value as SkillDamageLabelMode)}
    >
      <option value="none">{t("skillDamage.nameNone")}</option>
      <option value="text">{t("skillDamage.nameText")}</option>
      <option value="icon">{t("skillDamage.nameIcon")}</option>
    </select>
  </label>
  {#if group.labelMode === "icon"}
    <div class="space-y-2 rounded border p-3">
      <h3 class="text-sm font-semibold">{t("skillDamage.iconPresets")}</h3>
      <DamagePaintEditor
        paint={group.iconBackground}
        label={t("skillDamage.iconBackground")}
      />
      <label class="flex items-center gap-2 text-sm"
        >{t("skillDamage.iconOpacity")}
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={group.iconBackgroundOpacity * 100}
          onchange={(event) =>
            (group.iconBackgroundOpacity =
              Number(event.currentTarget.value) / 100)}
        />
        <span>{Math.round(group.iconBackgroundOpacity * 100)}%</span>
      </label>
      <SkillDamageIconPicker
        selected={group.iconPath}
        background={skillDamageIconBackground(group)}
        onSelect={(path) => (group.iconPath = path)}
      />
    </div>
  {/if}
  <div class="flex flex-wrap items-center gap-4">
    {#if group.displayMode === "merge"}
      <label class="flex items-center gap-2 text-sm"
        >{t("skillDamage.scrollDirection")}
        <select
          class="bg-background rounded border p-2"
          bind:value={group.scrollDirection}
        >
          <option value="up">{t("skillDamage.scrollUp")}</option><option
            value="down">{t("skillDamage.scrollDown")}</option
          >
        </select>
      </label>
    {/if}
    {#if group.labelMode !== "none"}
      <label class="flex items-center gap-2 text-sm"
        >{t("skillDamage.labelSpacing")}
        <input
          class="bg-background w-24 rounded border p-2"
          type="number"
          min="0"
          max={SKILL_DAMAGE_LABEL_SPACING_MAX}
          value={group.labelSpacing}
          onchange={(event) =>
            (group.labelSpacing = Math.max(
              0,
              Math.min(
                SKILL_DAMAGE_LABEL_SPACING_MAX,
                Number(event.currentTarget.value) || 0,
              ),
            ))}
        />
      </label>
    {/if}
  </div>
  {#if group.displayMode === "merge"}
    <label class="flex items-center gap-2 text-sm">
      {t("skillDamage.maxVisible")}
      <select
        class="bg-background rounded border p-2"
        bind:value={group.maxVisible}
      >
        {#each Array.from({ length: SKILL_DAMAGE_MAX_VISIBLE }, (_, index) => index + 1) as count (count)}<option
            value={count}>{count}</option
          >{/each}
      </select>
    </label>
  {/if}
  <SettingsSwitch
    bind:checked={group.allSelfDamage}
    label={t("skillDamage.allSelfDamage")}
    description={t("skillDamage.allSelfDamageHint")}
  />
  <div class="flex flex-wrap gap-4">
    <label class="flex items-center gap-2 text-sm">
      {t("skillDamage.format")}
      <select
        class="bg-background rounded border p-2"
        bind:value={group.format}
      >
        <option value="integer">{t("skillDamage.integer")}</option>
        <option value="grouped">{t("skillDamage.grouped")}</option>
        <option value="cn">{t("skillDamage.cn")}</option>
        <option value="western">{t("skillDamage.western")}</option>
      </select>
    </label>
    {#if group.displayMode === "merge"}
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.animation")}
        <select
          class="bg-background rounded border p-2"
          bind:value={group.animation}
        >
          {#each SKILL_DAMAGE_ANIMATIONS as animation (animation)}
            <option value={animation}>{t(`skillDamage.${animation}`)}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>
  <div class="flex flex-wrap items-center gap-3">
    <SecondsInput
      label={t(
        group.displayMode === "continuous"
          ? "skillDamage.continuousTotalDuration"
          : "skillDamage.duration",
      )}
      bind:valueMs={group.durationMs}
      range={SKILL_DAMAGE_DURATION_MS}
    />
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
          {group}
          label={previewLabel}
          amount={previewPhase
            ? String(previewHits * PREVIEW_HIT_AMOUNT)
            : "123456"}
          hitCount={3}
          phase={previewPhase}
          comboCount={previewPhase ? previewHits : undefined}
          {fontFamily}
        />
      {/key}
    </div>
  {/if}
  <div class="space-y-3 rounded border p-3">
    <h3 class="text-sm font-semibold">{t("skillDamage.font")}</h3>
    <label class="flex items-center gap-2 text-sm">
      {t("skillDamage.fontSource")}
      <select
        class="bg-background rounded border p-2"
        value={group.fontId ?? ""}
        onchange={(event) => selectFont(event.currentTarget.value || null)}
      >
        <option value="">{t("skillDamage.systemFont")}</option>
        {#each fonts as font (font.id)}
          <option value={font.id}>{font.name}</option>
        {/each}
      </select>
    </label>
    {#if !group.fontId}
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.fontFamily")}
        <input
          class="bg-background flex-1 rounded border p-2"
          placeholder="Arial / Microsoft YaHei"
          bind:value={group.fontFamily}
        />
      </label>
    {/if}
    <SettingsFilePicker
      label={t("skillDamage.uploadFont")}
      description={t("skillDamage.uploadFontDescription")}
      accept=".woff2,.woff,.ttf,.otf"
      value={group.fontId ?? ""}
      onchange={uploadFont}
      onclear={() => selectFont(null)}
    />
    <div class="flex flex-wrap gap-4">
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.fontSize")}
        <input
          class="bg-background w-20 rounded border p-2"
          type="number"
          min={SKILL_DAMAGE_FONT_SIZE.min}
          max={SKILL_DAMAGE_FONT_SIZE.max}
          value={group.fontSize}
          onchange={(event) =>
            (group.fontSize = Math.max(
              SKILL_DAMAGE_FONT_SIZE.min,
              Math.min(
                SKILL_DAMAGE_FONT_SIZE.max,
                Number(event.currentTarget.value) ||
                  SKILL_DAMAGE_FONT_SIZE.default,
              ),
            ))}
        />
      </label>
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.fontWeight")}
        <select
          class="bg-background rounded border p-2"
          bind:value={group.fontWeight}
        >
          {#each SKILL_DAMAGE_FONT_WEIGHTS as weight (weight)}<option
              value={weight}>{weight}</option
            >{/each}
        </select>
      </label>
    </div>
  </div>
  <DamageNumberStyleEditor style={group.numberStyle} />
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
  {#each group.entries as entry (entry.skillId)}
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
          (group.entries = group.entries.filter(
            (item) => item.skillId !== entry.skillId,
          ))}>{t("skillDamage.delete")}</button
      >
    </div>
  {/each}
</section>
