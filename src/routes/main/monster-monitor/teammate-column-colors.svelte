<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import type { TeammateBuffColumnStyle } from "$lib/settings-store";
  import type { TeammateColumnColors } from "$lib/teammate-buff-columns";
  import ColorField from "$lib/components/ColorField.svelte";

  interface Props {
    /** Effective colors: the column's overrides, else the panel's. */
    colors: TeammateColumnColors;
    /** Whether the column overrides any panel color. */
    customized: boolean;
    onChange: (patch: TeammateBuffColumnStyle) => void;
    onReset: () => void;
  }

  let { colors, customized, onChange, onReset }: Props = $props();
</script>

<div class="flex flex-none flex-wrap items-center gap-3">
  <div class="text-muted-foreground flex items-center gap-1.5 text-xs">
    {t("monsterMonitor.style.progressColor")}
    <ColorField
      value={colors.progressColor}
      ariaLabel={t("monsterMonitor.style.progressColor")}
      onchange={(progressColor) => onChange({ progressColor })}
    />
  </div>
  <div class="text-muted-foreground flex items-center gap-1.5 text-xs">
    {t("monsterMonitor.style.valueColor")}
    <ColorField
      value={colors.valueColor}
      ariaLabel={t("monsterMonitor.style.valueColor")}
      onchange={(valueColor) => onChange({ valueColor })}
    />
  </div>
  {#if customized}
    <button
      type="button"
      class="border-border/60 hover:bg-muted/50 rounded border px-2 py-1 text-xs"
      onclick={onReset}
    >
      {t("monsterMonitor.teammate.columnColorReset")}
    </button>
  {/if}
</div>
