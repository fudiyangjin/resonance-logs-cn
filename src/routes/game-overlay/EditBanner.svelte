<script lang="ts">
  import { tl } from "$lib/i18n/index.svelte";
  import {
    onWindowDragPointerDown,
    resetOverlayPositions,
    resetOverlaySizes,
    setEditMode,
  } from "./overlay-state.svelte.js";
</script>

<div class="edit-banner">
  <div class="edit-title">{tl("Edit Mode - Drag to adjust positions")}</div>
  <button type="button" class="done-btn secondary" onclick={resetOverlayPositions}>
    {tl("Reset Positions")}
  </button>
  <button type="button" class="done-btn secondary" onclick={resetOverlaySizes}>
    {tl("Reset Sizes")}
  </button>
  <button type="button" class="done-btn" onclick={() => setEditMode(false)}>
    {tl("Finish Editing")}
  </button>
</div>

<div class="window-drag-bar" onpointerdown={onWindowDragPointerDown}>
  {tl("Drag here to move the Game Overlay window")}
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
    border-radius: 8px;
    background: rgba(15, 15, 15, 0.76);
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  .window-drag-bar {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1000;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(30, 30, 30, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: move;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
  }

  .edit-title {
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }

  .done-btn {
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  .done-btn.secondary {
    background: rgba(80, 80, 80, 0.45);
  }
</style>
