<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import {
    resetOverlayPositions,
    resetOverlaySizes,
  } from "../game-overlay/overlay-layout.svelte.js";
  import {
    resetMonsterOverlayPositions,
    resetMonsterOverlaySizes,
  } from "../monster-overlay/monster-layout.svelte.js";
  import {
    resetMinimapPositions,
    resetMinimapSizes,
  } from "../minimap-overlay/minimap-state.svelte.js";
  import { revertHudEditSession } from "./hud-edit-session";
  import { finishHudEditing, startHudWindowDrag } from "./hud-events.svelte.js";

  function resetAllPositions() {
    resetOverlayPositions();
    resetMonsterOverlayPositions();
    resetMinimapPositions();
  }

  function resetAllSizes() {
    resetOverlaySizes();
    resetMonsterOverlaySizes();
    resetMinimapSizes();
  }
</script>

<div class="edit-banner">
  <div class="edit-title">{t("gameOverlay.edit.title")}</div>
  <button
    type="button"
    class="done-btn secondary"
    onclick={() => void revertHudEditSession()}
  >
    {t("gameOverlay.edit.revert")}
  </button>
  <button type="button" class="done-btn secondary" onclick={resetAllPositions}>
    {t("gameOverlay.edit.resetPosition")}
  </button>
  <button type="button" class="done-btn secondary" onclick={resetAllSizes}>
    {t("gameOverlay.edit.resetSize")}
  </button>
  <button
    type="button"
    class="done-btn"
    onclick={() => void finishHudEditing()}
  >
    {t("gameOverlay.edit.done")}
  </button>
</div>

<div class="window-drag-bar" onpointerdown={startHudWindowDrag}>
  {t("gameOverlay.edit.dragHint")}
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
    cursor: move;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
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
