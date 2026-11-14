<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import {
    SKILL_DAMAGE_ANIMATIONS,
    SKILL_DAMAGE_CAST_CLOSE_DELAY_MS,
    SKILL_DAMAGE_DURATION_MS,
    SKILL_DAMAGE_LABEL_SPACING_MAX,
    SKILL_DAMAGE_WINDOW_TIMEOUT_MS,
    type SkillDamageGroup,
  } from "$lib/skill-damage-settings";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import SecondsInput from "./seconds-input.svelte";
  import WindowSkillPicker from "./window-skill-picker.svelte";

  let { group }: { group: SkillDamageGroup } = $props();

  const animations = [
    { key: "continuousAnimation", label: "skillDamage.continuousAnimation" },
    {
      key: "continuousFinalAnimation",
      label: "skillDamage.continuousFinalAnimation",
    },
  ] as const;
</script>

<section class="space-y-3 rounded border p-3">
  <p class="text-muted-foreground text-sm">{t("skillDamage.continuousHint")}</p>
  <label class="flex items-center gap-2 text-sm">
    {t("skillDamage.windowMode")}
    <select
      class="bg-background rounded border p-2"
      bind:value={group.continuousWindowMode}
    >
      <option value="rolling">{t("skillDamage.windowRolling")}</option>
      <option value="skills">{t("skillDamage.windowSkills")}</option>
      <option value="cast">{t("skillDamage.windowCast")}</option>
    </select>
  </label>
  {#if group.continuousWindowMode === "rolling"}
    <SecondsInput
      label={t("skillDamage.continuousWindow")}
      bind:valueMs={group.continuousWindowMs}
      range={SKILL_DAMAGE_DURATION_MS}
    />
  {:else if group.continuousWindowMode === "skills"}
    <WindowSkillPicker
      bind:value={group.continuousStartSkillIds}
      label={t("skillDamage.windowStart")}
      empty={t("skillDamage.windowStartDefault")}
    />
    <WindowSkillPicker
      bind:value={group.continuousEndSkillIds}
      label={t("skillDamage.windowEnd")}
      empty={t("skillDamage.windowEndNone")}
    />
    <p class="text-muted-foreground text-xs">
      {t("skillDamage.windowSkillsHint")}
    </p>
    <SecondsInput
      label={t("skillDamage.windowTimeout")}
      bind:valueMs={group.continuousTimeoutMs}
      range={SKILL_DAMAGE_WINDOW_TIMEOUT_MS}
    />
  {:else}
    <label class="flex items-center gap-2 text-sm">
      {t("skillDamage.windowPreset")}
      <select
        class="bg-background rounded border p-2"
        bind:value={group.continuousCastPreset}
      >
        <option value="ray">{t("skillDamage.castRay")}</option>
        <option value="infusion">{t("skillDamage.castInfusion")}</option>
      </select>
    </label>
    <p class="text-muted-foreground text-xs">
      {t("skillDamage.windowCastHint")}
    </p>
    <SecondsInput
      label={t("skillDamage.castCloseDelay")}
      bind:valueMs={group.continuousCastCloseDelayMs}
      range={SKILL_DAMAGE_CAST_CLOSE_DELAY_MS}
    />
    <p class="text-muted-foreground text-xs">
      {t("skillDamage.castCloseDelayHint")}
    </p>
  {/if}
  <SettingsSwitch
    bind:checked={group.continuousAllDamage}
    label={t("skillDamage.continuousAll")}
    description={t("skillDamage.continuousAllHint")}
  />
  <div class="flex flex-wrap gap-4">
    {#each animations as item (item.key)}
      <label class="flex items-center gap-2 text-sm">
        {t(item.label)}
        <select
          class="bg-background rounded border p-2"
          bind:value={group[item.key]}
        >
          {#each SKILL_DAMAGE_ANIMATIONS as animation (animation)}
            <option value={animation}>{t(`skillDamage.${animation}`)}</option>
          {/each}
        </select>
      </label>
    {/each}
  </div>
  <SettingsSwitch
    bind:checked={group.showComboCount}
    label={t("skillDamage.showComboCount")}
  />
  {#if group.showComboCount}
    <div class="flex flex-wrap gap-4">
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.comboFormat")}
        <select
          class="bg-background rounded border p-2"
          bind:value={group.comboFormat}
        >
          <option value="hit">{t("skillDamage.comboFormatHit")}</option>
          <option value="multiplier">
            {t("skillDamage.comboFormatMultiplier")}
          </option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.comboPosition")}
        <select
          class="bg-background rounded border p-2"
          bind:value={group.comboPosition}
        >
          <option value="bottom">{t("skillDamage.comboBottom")}</option>
          <option value="top">{t("skillDamage.comboTop")}</option>
          <option value="right">{t("skillDamage.comboRight")}</option>
          <option value="left">{t("skillDamage.comboLeft")}</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.comboSpacing")}
        <input
          class="bg-background w-24 rounded border p-2"
          type="number"
          min="0"
          max={SKILL_DAMAGE_LABEL_SPACING_MAX}
          value={group.comboSpacing}
          onchange={(event) =>
            (group.comboSpacing = Math.max(
              0,
              Math.min(
                SKILL_DAMAGE_LABEL_SPACING_MAX,
                Number(event.currentTarget.value) || 0,
              ),
            ))}
        />
      </label>
    </div>
  {/if}
</section>
