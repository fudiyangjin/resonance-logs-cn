<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import type { TeammateBuffColumnStyle } from "$lib/settings-store";
  import type { TeammateColumnColors } from "$lib/teammate-buff-columns";

  interface Props {
    /** Effective colors: the column's overrides, else the panel's. */
    colors: TeammateColumnColors;
    /** Whether the column overrides any panel color. */
    customized: boolean;
    onChange: (patch: TeammateBuffColumnStyle) => void;
    onReset: () => void;
  }

  let { colors, customized, onChange, onReset }: Props = $props();

  const swatchClass =
    "border-border/60 h-7 w-9 cursor-pointer rounded border bg-transparent p-0";
</script>

<div class="flex flex-none items-center gap-2">
  <label class="text-muted-foreground flex items-center gap-1 text-xs">
    {t("monsterMonitor.style.progressColor")}
    <input
      class={swatchClass}
      type="color"
      value={colors.progressColor}
      oninput={(event) =>
        onChange({ progressColor: event.currentTarget.value })}
    />
  </label>
  <label class="text-muted-foreground flex items-center gap-1 text-xs">
    {t("monsterMonitor.style.valueColor")}
    <input
      class={swatchClass}
      type="color"
      value={colors.valueColor}
      oninput={(event) => onChange({ valueColor: event.currentTarget.value })}
    />
  </label>
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
