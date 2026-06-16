<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import {
    onWindowDragPointerDown,
    resetMinimapPositions,
    resetMinimapSizes,
    setMinimapEditMode,
  } from "./minimap-state.svelte.js";
</script>

<div class="edit-banner">
  <div class="edit-title">{t("minimap.edit.title")}</div>
  <button
    type="button"
    class="done-btn secondary"
    onclick={resetMinimapPositions}
  >
    {t("minimap.edit.resetPosition")}
  </button>
  <button type="button" class="done-btn secondary" onclick={resetMinimapSizes}>
    {t("minimap.edit.resetSize")}
  </button>
  <button
    type="button"
    class="done-btn"
    onclick={() => setMinimapEditMode(false)}
  >
    {t("minimap.edit.done")}
  </button>
</div>

<div class="window-drag-bar" onpointerdown={onWindowDragPointerDown}>
  {t("minimap.edit.dragHint")}
</div>

<style>
  .edit-banner {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    background: rgba(15, 15, 15, 0.76);
  }

  .window-drag-bar {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1000;
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 8px;
    color: #fff;
    background: rgba(30, 30, 30, 0.8);
    font-size: 12px;
    font-weight: 600;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
    cursor: move;
  }

  .edit-title {
    color: #fff;
    font-size: 12px;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }

  .done-btn {
    padding: 3px 8px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 6px;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    font-size: 12px;
    cursor: pointer;
  }

  .done-btn.secondary {
    background: rgba(80, 80, 80, 0.45);
  }
</style>
