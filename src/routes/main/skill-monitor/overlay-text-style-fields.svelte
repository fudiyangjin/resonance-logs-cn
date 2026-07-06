<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";

  interface Props {
    textShadowEnabled: boolean;
    backgroundEnabled: boolean;
    backgroundOpacity: number;
    onTextShadowEnabled: (value: boolean) => void;
    onBackgroundEnabled: (value: boolean) => void;
    onBackgroundOpacity: (value: number) => void;
  }

  let {
    textShadowEnabled,
    backgroundEnabled,
    backgroundOpacity,
    onTextShadowEnabled,
    onBackgroundEnabled,
    onBackgroundOpacity,
  }: Props = $props();
</script>

<div class="space-y-3">
  <div
    class="border-border/60 bg-muted/20 flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
  >
    <span class="text-muted-foreground">{t("overlay.style.textShadow")}</span>
    <input
      type="checkbox"
      checked={textShadowEnabled}
      onchange={(event) =>
        onTextShadowEnabled(
          (event.currentTarget as HTMLInputElement).checked,
        )}
    />
  </div>

  <div
    class="border-border/60 bg-muted/20 flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
  >
    <span class="text-muted-foreground">{t("overlay.style.background")}</span>
    <input
      type="checkbox"
      checked={backgroundEnabled}
      onchange={(event) =>
        onBackgroundEnabled(
          (event.currentTarget as HTMLInputElement).checked,
        )}
    />
  </div>

  {#if backgroundEnabled}
    <label class="text-muted-foreground block text-xs">
      {t("overlay.style.backgroundOpacity", {
        value: Math.round(backgroundOpacity * 100),
      })}
      <input
        class="mt-1 w-full"
        type="range"
        min="0"
        max="1"
        step="0.02"
        value={backgroundOpacity}
        oninput={(event) =>
          onBackgroundOpacity(
            Number((event.currentTarget as HTMLInputElement).value),
          )}
      />
    </label>
  {/if}
</div>
