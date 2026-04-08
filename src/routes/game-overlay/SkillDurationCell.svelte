<script lang="ts">
  import type { SkillDurationDisplay } from "./overlay-types";

  type PointerHandler = ((event: PointerEvent) => void) | undefined;

  let {
    skill,
    iconSize,
    editable = false,
    left = undefined,
    top = undefined,
    onPointerDown = undefined,
    onResizePointerDown = undefined,
  }: {
    skill: SkillDurationDisplay;
    iconSize: number;
    editable?: boolean;
    left?: number;
    top?: number;
    onPointerDown?: PointerHandler;
    onResizePointerDown?: PointerHandler;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="overlay-group skill-duration-cell"
  class:editable
  class:placeholder={skill.isPlaceholder}
  style:width={`${iconSize + 8}px`}
  style:left={left === undefined ? undefined : `${left}px`}
  style:top={top === undefined ? undefined : `${top}px`}
  onpointerdown={onPointerDown}
  title={skill.name}
>
  <div
    class="skill-icon-wrap"
    style:width={`${iconSize}px`}
    style:height={`${iconSize}px`}
  >
    {#if skill.imagePath}
      <img src={skill.imagePath} alt={skill.name} class="skill-icon" />
    {:else}
      <div class="skill-fallback">#{skill.skillId}</div>
    {/if}
  </div>

  <div
    class="skill-time"
    style:font-size={`${Math.max(10, Math.round(iconSize * 0.26))}px`}
  >
    {skill.text}
  </div>

  {#if editable && onResizePointerDown}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle icon" onpointerdown={onResizePointerDown}></div>
  {/if}
</div>

<style>
  .skill-duration-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 52px;
  }

  .skill-duration-cell.placeholder {
    opacity: 0.6;
  }

  .skill-duration-cell.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 8px;
    background: rgba(20, 36, 56, 0.55);
    padding: 4px 2px;
  }

  .skill-icon-wrap {
    position: relative;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
  }

  .skill-icon {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .skill-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.7);
    font-size: 10px;
    background: rgba(255, 255, 255, 0.08);
  }

  .skill-time {
    font-weight: 600;
    color: #ffffff;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }
</style>
