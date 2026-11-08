<script lang="ts">
  import type {
    ShieldDetailStyle,
  } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import OverlayTextStyleFields from "./overlay-text-style-fields.svelte";
  import ColorField from "$lib/components/ColorField.svelte";

  interface Props {
    shieldDetailStyle: ShieldDetailStyle;
    setShieldDetailStyleFlag: (
      key:
        | "showHpBar"
        | "showTotalShieldBar"
        | "showShieldEntries",
      value: boolean,
    ) => void;
    setShieldDetailFontSize: (value: number) => void;
    setShieldDetailBarWidth: (value: number) => void;
    setShieldDetailGap: (value: number) => void;
    setShieldDetailColor: (
      key: "hpColor" | "shieldColor" | "healShieldColor",
      value: string,
    ) => void;
    setShieldDetailTextShadowEnabled: (value: boolean) => void;
    setShieldDetailBackgroundEnabled: (value: boolean) => void;
    setShieldDetailBackgroundOpacity: (value: number) => void;
  }

  let {
    shieldDetailStyle,
    setShieldDetailStyleFlag,
    setShieldDetailFontSize,
    setShieldDetailBarWidth,
    setShieldDetailGap,
    setShieldDetailColor,
    setShieldDetailTextShadowEnabled,
    setShieldDetailBackgroundEnabled,
    setShieldDetailBackgroundOpacity,
  }: Props = $props();
</script>

<div class="space-y-4">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="space-y-1">
      <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.shieldDetail.title")}</h2>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.shieldDetail.description")}
      </p>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
    <div class="space-y-1">
      <div class="text-sm font-medium text-foreground">{t("skillMonitor.shieldDetail.display.title")}</div>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.shieldDetail.display.description")}
      </p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground">
        <span>{t("skillMonitor.shieldDetail.showHpBar")}</span>
        <input
          type="checkbox"
          checked={shieldDetailStyle.showHpBar}
          onchange={(event) =>
            setShieldDetailStyleFlag("showHpBar", (event.currentTarget as HTMLInputElement).checked)}
        />
      </label>
      <label class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground">
        <span>{t("skillMonitor.shieldDetail.showTotalShieldBar")}</span>
        <input
          type="checkbox"
          checked={shieldDetailStyle.showTotalShieldBar}
          onchange={(event) =>
            setShieldDetailStyleFlag("showTotalShieldBar", (event.currentTarget as HTMLInputElement).checked)}
        />
      </label>
      <label class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground">
        <span>{t("skillMonitor.shieldDetail.showShieldEntries")}</span>
        <input
          type="checkbox"
          checked={shieldDetailStyle.showShieldEntries}
          onchange={(event) =>
            setShieldDetailStyleFlag("showShieldEntries", (event.currentTarget as HTMLInputElement).checked)}
        />
      </label>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
    <div class="space-y-1">
      <div class="text-sm font-medium text-foreground">{t("skillMonitor.shieldDetail.style.title")}</div>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.shieldDetail.style.description")}
      </p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <label class="text-xs text-muted-foreground">
        {t("skillMonitor.style.fontSize", { value: shieldDetailStyle.fontSize })}
        <input
          class="mt-1 w-full"
          type="range"
          min="8"
          max="28"
          step="1"
          value={shieldDetailStyle.fontSize}
          oninput={(event) =>
            setShieldDetailFontSize(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <label class="text-xs text-muted-foreground">
        {t("skillMonitor.shieldDetail.barWidth", { value: shieldDetailStyle.barWidth })}
        <input
          class="mt-1 w-full"
          type="range"
          min="60"
          max="400"
          step="1"
          value={shieldDetailStyle.barWidth}
          oninput={(event) =>
            setShieldDetailBarWidth(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <label class="text-xs text-muted-foreground">
        {t("skillMonitor.style.gap", { value: shieldDetailStyle.gap })}
        <input
          class="mt-1 w-full"
          type="range"
          min="0"
          max="24"
          step="1"
          value={shieldDetailStyle.gap}
          oninput={(event) =>
            setShieldDetailGap(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
    </div>
    <div class="grid grid-cols-1 gap-x-4 gap-y-0.5 md:grid-cols-2">
      <ColorField
        label={t("skillMonitor.shieldDetail.hpColor")}
        value={shieldDetailStyle.hpColor}
        onchange={(hex) => setShieldDetailColor("hpColor", hex)}
      />
      <ColorField
        label={t("skillMonitor.shieldDetail.shieldColor")}
        value={shieldDetailStyle.shieldColor}
        onchange={(hex) => setShieldDetailColor("shieldColor", hex)}
      />
      <ColorField
        label={t("skillMonitor.shieldDetail.healShieldColor")}
        value={shieldDetailStyle.healShieldColor}
        onchange={(hex) => setShieldDetailColor("healShieldColor", hex)}
      />
    </div>
    <OverlayTextStyleFields
      textShadowEnabled={shieldDetailStyle.textShadowEnabled}
      backgroundEnabled={shieldDetailStyle.backgroundEnabled}
      backgroundOpacity={shieldDetailStyle.backgroundOpacity}
      onTextShadowEnabled={setShieldDetailTextShadowEnabled}
      onBackgroundEnabled={setShieldDetailBackgroundEnabled}
      onBackgroundOpacity={setShieldDetailBackgroundOpacity}
    />
  </div>
</div>
