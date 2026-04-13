<script lang="ts">
  import type { IconBuffDisplay } from "./overlay-types";

  type PointerHandler = ((event: PointerEvent) => void) | undefined;

  let {
    buff,
    iconSize,
    showName = true,
    showTime = true,
    showLayer = true,
    standalone = false,
    editable = false,
    left = undefined,
    top = undefined,
    onPointerDown = undefined,
    onResizePointerDown = undefined,
  }: {
    buff: IconBuffDisplay;
    iconSize: number;
    showName?: boolean;
    showTime?: boolean;
    showLayer?: boolean;
    standalone?: boolean;
    editable?: boolean;
    left?: number;
    top?: number;
    onPointerDown?: PointerHandler;
    onResizePointerDown?: PointerHandler;
  } = $props();

  const hasSpecialImages = $derived(
    Boolean(buff.specialImages && buff.specialImages.length > 0),
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class:overlay-group={standalone}
  class:editable={editable}
  class="icon-buff-cell"
  class:placeholder={buff.isPlaceholder}
  style:width={`${iconSize + 8}px`}
  style:left={left === undefined ? undefined : `${left}px`}
  style:top={top === undefined ? undefined : `${top}px`}
  onpointerdown={onPointerDown}
>
  {#if showName && !hasSpecialImages}
    <div class="buff-name-label" style:max-width={`${iconSize + 8}px`}>
      {buff.name}
    </div>
  {/if}

  <div class="buff-icon-wrap" style:width={`${iconSize}px`} style:height={`${iconSize}px`}>
    {#if hasSpecialImages}
      {#each buff.specialImages ?? [] as imgSrc (imgSrc)}
        <img src={imgSrc} alt={buff.name} class="special-buff-icon" />
      {/each}
    {:else}
      <img src={`/images/buff/${buff.spriteFile}`} alt={buff.name} class="buff-icon" />
    {/if}

    {#if showLayer && !hasSpecialImages && buff.layer > 1}
      <div class="layer-badge">{buff.layer}</div>
    {/if}
  </div>

  {#if showTime && !hasSpecialImages}
    <div class="buff-time" style:font-size={`${Math.max(10, Math.round(iconSize * 0.26))}px`}>
      {buff.text}
    </div>
  {/if}

  {#if editable && onResizePointerDown}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle icon" onpointerdown={onResizePointerDown}></div>
  {/if}
</div>

<style>
  .icon-buff-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 52px;
    position: relative;
  }

  .icon-buff-cell.placeholder {
    opacity: 0.6;
  }

  .icon-buff-cell.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 8px;
    background: rgba(20, 36, 56, 0.55);
    padding: 4px 2px;
  }

  .buff-name-label {
    font-size: 10px;
    color: #ffffff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
    line-height: 1;
    max-width: 52px;
    text-align: center;
    white-space: normal;
    overflow: hidden;
    overflow-wrap: anywhere;
    word-break: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    max-height: 4.2em;
  }

  .buff-icon-wrap {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
  }

  .buff-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .buff-time {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
    line-height: 1;
  }

  .layer-badge {
    position: absolute;
    right: 2px;
    top: 2px;
    padding: 1px 4px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.65);
    color: #ffffff;
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
  }

  .special-buff-icon {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.9));
  }
</style>
