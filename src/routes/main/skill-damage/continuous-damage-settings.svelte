<script lang="ts">
  import WindowSkillPicker from "./window-skill-picker.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import {
    clampSkillDamageDuration,
    type SkillDamageGroup,
  } from "$lib/skill-damage-settings";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
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
    <label class="flex items-center gap-2 text-sm"
      >{t("skillDamage.continuousWindow")}
      <input
        class="bg-background w-24 rounded border p-2"
        type="text"
        inputmode="decimal"
        value={group.continuousWindowMs / 1000}
        onchange={(event) => {
          const seconds = Number(event.currentTarget.value.trim());
          if (Number.isFinite(seconds) && seconds > 0)
            group.continuousWindowMs = Math.round(
              clampSkillDamageDuration(seconds * 1000),
            );
          event.currentTarget.value = String(group.continuousWindowMs / 1000);
        }}
      />
    </label>
  {:else}
    {#if group.continuousWindowMode === "skills"}
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
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.castCloseDelay")}
        <input
          class="bg-background w-24 rounded border p-2"
          type="text"
          inputmode="decimal"
          value={group.continuousCastCloseDelayMs / 1000}
          onchange={(event) => {
            const raw = event.currentTarget.value.trim();
            const seconds = Number(raw);
            if (raw && Number.isFinite(seconds))
              group.continuousCastCloseDelayMs = Math.round(
                Math.max(0, Math.min(1000, seconds * 1000)),
              );
            event.currentTarget.value = String(
              group.continuousCastCloseDelayMs / 1000,
            );
          }}
        />
      </label>
      <p class="text-muted-foreground text-xs">
        {t("skillDamage.castCloseDelayHint")}
      </p>
    {/if}
    {#if group.continuousWindowMode === "skills"}
      <label class="flex items-center gap-2 text-sm">
        {t("skillDamage.windowTimeout")}
        <input
          class="bg-background w-24 rounded border p-2"
          type="text"
          inputmode="decimal"
          value={group.continuousTimeoutMs / 1000}
          onchange={(event) => {
            const seconds = Number(event.currentTarget.value.trim());
            if (Number.isFinite(seconds) && seconds > 0)
              group.continuousTimeoutMs = Math.round(
                Math.max(100, Math.min(3600000, seconds * 1000)),
              );
            event.currentTarget.value = String(
              group.continuousTimeoutMs / 1000,
            );
          }}
        />
      </label>
    {/if}
  {/if}
  <SettingsSwitch
    bind:checked={group.continuousAllDamage}
    label={t("skillDamage.continuousAll")}
    description={t("skillDamage.continuousAllHint")}
  />
  <div class="flex flex-wrap gap-4">
    {#each animations as item}
      <label class="flex items-center gap-2 text-sm"
        >{t(item.label)}
        <select
          class="bg-background rounded border p-2"
          bind:value={group[item.key]}
        >
          <option value="pop">{t("skillDamage.pop")}</option><option
            value="shrink">{t("skillDamage.shrink")}</option
          ><option value="floatUp">{t("skillDamage.floatUp")}</option>
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
          <option value="multiplier"
            >{t("skillDamage.comboFormatMultiplier")}</option
          >
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm"
        >{t("skillDamage.comboPosition")}
        <select
          class="bg-background rounded border p-2"
          bind:value={group.comboPosition}
        >
          <option value="bottom">{t("skillDamage.comboBottom")}</option><option
            value="top">{t("skillDamage.comboTop")}</option
          ><option value="right">{t("skillDamage.comboRight")}</option><option
            value="left">{t("skillDamage.comboLeft")}</option
          >
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm"
        >{t("skillDamage.comboSpacing")}
        <input
          class="bg-background w-24 rounded border p-2"
          type="number"
          min="0"
          max="200"
          value={group.comboSpacing}
          onchange={(event) =>
            (group.comboSpacing = Math.max(
              0,
              Math.min(200, Number(event.currentTarget.value) || 0),
            ))}
        />
      </label>
    </div>
  {/if}
</section>
