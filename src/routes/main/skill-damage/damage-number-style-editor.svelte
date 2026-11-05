<script lang="ts">
  import {
    SKILL_DAMAGE_EFFECT_SIZE_MAX,
    type SkillDamageNumberStyle,
  } from "$lib/skill-damage-settings";
  import { t } from "$lib/i18n/index.svelte";
  import DamagePaintEditor from "./damage-paint-editor.svelte";

  let { style }: { style: SkillDamageNumberStyle } = $props();

  const effects = [
    {
      enabled: "innerGlow",
      size: "innerGlowSize",
      color: "innerGlowColor",
      label: "skillDamage.innerGlow",
    },
    {
      enabled: "outline",
      size: "outlineWidth",
      color: "outlineColor",
      label: "skillDamage.outline",
    },
    {
      enabled: "outerGlow",
      size: "outerGlowSize",
      color: "outerGlowColor",
      label: "skillDamage.outerGlow",
    },
    {
      enabled: "shadow",
      size: "shadowSize",
      color: "shadowColor",
      label: "skillDamage.shadow",
    },
  ] as const;
</script>

<section class="space-y-4 rounded border p-3">
  <h3 class="text-sm font-semibold">{t("skillDamage.numberStyle")}</h3>
  <label class="flex items-center gap-2 text-sm"
    ><input type="checkbox" bind:checked={style.italic} />{t(
      "skillDamage.italic",
    )}</label
  >
  <DamagePaintEditor paint={style.fill} label={t("skillDamage.fill")} />
  {#each effects as effect (effect.enabled)}
    <div class="space-y-2 rounded border p-3">
      <label class="flex items-center gap-2 text-sm"
        ><input type="checkbox" bind:checked={style[effect.enabled]} />{t(
          effect.label,
        )}</label
      >
      {#if style[effect.enabled]}
        <label class="flex items-center gap-2 text-sm"
          >{t(
            effect.enabled === "outline"
              ? "skillDamage.thickness"
              : "skillDamage.effectSize",
          )}
          <input
            class="bg-background w-24 rounded border p-1"
            type="number"
            min="0"
            max={SKILL_DAMAGE_EFFECT_SIZE_MAX}
            step="0.5"
            value={style[effect.size]}
            onchange={(event) =>
              (style[effect.size] = Math.max(
                0,
                Math.min(
                  SKILL_DAMAGE_EFFECT_SIZE_MAX,
                  Number(event.currentTarget.value) || 0,
                ),
              ))}
          />
        </label>
        <DamagePaintEditor
          paint={style[effect.color]}
          label={t("skillDamage.effectColor")}
        />
      {/if}
    </div>
  {/each}
</section>
