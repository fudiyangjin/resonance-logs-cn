<script lang="ts">
  import type { SkillDamagePaint } from "$lib/skill-damage-settings";
  import { t } from "$lib/i18n/index.svelte";
  let { paint, label }: { paint: SkillDamagePaint; label: string } = $props();
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
  <span>{label}</span>
  <select
    class="bg-background rounded border p-1"
    bind:value={paint.mode}
    aria-label={label}
  >
    <option value="solid">{t("skillDamage.solid")}</option><option
      value="gradient">{t("skillDamage.gradient")}</option
    >
  </select>
  <!-- onchange, not bind: the picker fires input on every drag step. -->
  <input
    type="color"
    value={paint.color}
    onchange={(event) => (paint.color = event.currentTarget.value)}
    aria-label={`${label} 1`}
  />
  {#if paint.mode === "gradient"}
    <input
      type="color"
      value={paint.endColor}
      onchange={(event) => (paint.endColor = event.currentTarget.value)}
      aria-label={`${label} 2`}
    />
    <label
      >{t("skillDamage.angle")}<input
        class="bg-background w-20 rounded border p-1"
        type="number"
        min="0"
        max="360"
        value={paint.angle}
        onchange={(event) =>
          (paint.angle = Math.max(
            0,
            Math.min(360, Number(event.currentTarget.value) || 0),
          ))}
      /></label
    >
  {/if}
</div>
