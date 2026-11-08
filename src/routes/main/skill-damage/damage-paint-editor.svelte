<script lang="ts">
  import type { SkillDamagePaint } from "$lib/skill-damage-settings";
  import { t } from "$lib/i18n/index.svelte";
  import ColorField from "$lib/components/ColorField.svelte";
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
  <ColorField
    value={paint.color}
    ariaLabel={`${label} 1`}
    onchange={(hex) => (paint.color = hex)}
  />
  {#if paint.mode === "gradient"}
    <ColorField
      value={paint.endColor}
      ariaLabel={`${label} 2`}
      onchange={(hex) => (paint.endColor = hex)}
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
