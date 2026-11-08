<script lang="ts">
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import type { CustomPanelStyle } from "$lib/settings-store";
  import OverlayTextStyleFields from "../skill-monitor/overlay-text-style-fields.svelte";

  interface Props {
    titleKey: MessageKey;
    panelStyle: CustomPanelStyle;
    updatePanelStyle: <K extends keyof CustomPanelStyle>(
      key: K,
      value: CustomPanelStyle[K],
    ) => void;
  }

  let { titleKey, panelStyle, updatePanelStyle }: Props = $props();
</script>

<section class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5">
  <h3 class="text-foreground text-sm font-semibold">{t(titleKey)}</h3>
  <div class="grid gap-4 lg:grid-cols-3">
    <label class="style-field">
      <span>{t("monsterMonitor.style.gap")}</span>
      <input
        type="range"
        min="0"
        max="24"
        value={panelStyle.gap}
        oninput={(event) =>
          updatePanelStyle(
            "gap",
            Number.parseInt(event.currentTarget.value, 10),
          )}
      />
      <strong>{panelStyle.gap}px</strong>
    </label>
    <label class="style-field">
      <span>{t("monsterMonitor.style.columnGap")}</span>
      <input
        type="range"
        min="0"
        max="40"
        value={panelStyle.columnGap}
        oninput={(event) =>
          updatePanelStyle(
            "columnGap",
            Number.parseInt(event.currentTarget.value, 10),
          )}
      />
      <strong>{panelStyle.columnGap}px</strong>
    </label>
    <label class="style-field">
      <span>{t("monsterMonitor.style.fontSize")}</span>
      <input
        type="range"
        min="10"
        max="28"
        value={panelStyle.fontSize}
        oninput={(event) =>
          updatePanelStyle(
            "fontSize",
            Number.parseInt(event.currentTarget.value, 10),
          )}
      />
      <strong>{panelStyle.fontSize}px</strong>
    </label>
  </div>

  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <label class="color-field">
      <span>{t("monsterMonitor.style.nameColor")}</span>
      <input
        type="color"
        value={panelStyle.nameColor}
        oninput={(event) =>
          updatePanelStyle("nameColor", event.currentTarget.value)}
      />
    </label>
    <label class="color-field">
      <span>{t("monsterMonitor.style.valueColor")}</span>
      <input
        type="color"
        value={panelStyle.valueColor}
        oninput={(event) =>
          updatePanelStyle("valueColor", event.currentTarget.value)}
      />
    </label>
    <label class="color-field">
      <span>{t("monsterMonitor.style.progressColor")}</span>
      <input
        type="color"
        value={panelStyle.progressColor}
        oninput={(event) =>
          updatePanelStyle("progressColor", event.currentTarget.value)}
      />
    </label>
    <label class="color-field">
      <span>{t("monsterMonitor.style.progressOpacity")}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={panelStyle.progressOpacity}
        oninput={(event) =>
          updatePanelStyle(
            "progressOpacity",
            Number(event.currentTarget.value),
          )}
      />
      <strong>{Math.round(panelStyle.progressOpacity * 100)}%</strong>
    </label>
  </div>
  <OverlayTextStyleFields
    textShadowEnabled={panelStyle.textShadowEnabled}
    backgroundEnabled={panelStyle.backgroundEnabled}
    backgroundOpacity={panelStyle.backgroundOpacity}
    onTextShadowEnabled={(v) => updatePanelStyle("textShadowEnabled", v)}
    onBackgroundEnabled={(v) => updatePanelStyle("backgroundEnabled", v)}
    onBackgroundOpacity={(v) => updatePanelStyle("backgroundOpacity", v)}
  />
</section>

<style>
  .style-field,
  .color-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.22);
    font-size: 13px;
    color: var(--foreground, #fff);
  }

  .style-field strong {
    font-size: 12px;
    color: var(--muted-foreground, rgba(255, 255, 255, 0.72));
  }

  .color-field input[type="color"] {
    width: 100%;
    height: 42px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }
</style>
