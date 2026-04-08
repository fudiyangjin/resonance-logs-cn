<script lang="ts">
  import {
    onWindowDragPointerDown,
    resetMonsterOverlayPositions,
    resetMonsterOverlaySizes,
    setMonsterEditMode,
  } from "./monster-state.svelte.js";
</script>

<div class="edit-banner">
  <div class="edit-title">编辑模式 - 可拖拽调整怪物监控位置</div>
  <button
    type="button"
    class="done-btn secondary"
    onclick={resetMonsterOverlayPositions}
  >
    重置位置
  </button>
  <button
    type="button"
    class="done-btn secondary"
    onclick={resetMonsterOverlaySizes}
  >
    重置尺寸
  </button>
  <button type="button" class="done-btn" onclick={() => setMonsterEditMode(false)}>
    完成编辑
  </button>
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="window-drag-bar" onpointerdown={onWindowDragPointerDown}>
  拖动此处移动 Monster Overlay 窗口
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
