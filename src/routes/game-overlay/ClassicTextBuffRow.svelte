<script lang="ts">
  interface Props {
    label: string;
    valueText: string;
    metaText?: string | undefined;
    progressPercent: number;
    showProgress: boolean;
    nameColor: string;
    valueColor: string;
    progressColor: string;
    progressOpacity?: number | undefined;
    fontSize: number;
    placeholder?: boolean | undefined;
  }

  let {
    label,
    valueText,
    metaText,
    progressPercent,
    showProgress,
    nameColor,
    valueColor,
    progressColor,
    progressOpacity = 0.4,
    fontSize,
    placeholder = false,
  }: Props = $props();
</script>

<div class="text-buff-row" class:placeholder>
  <div
    class="text-buff-name"
    style:color={nameColor}
    style:font-size={`${fontSize}px`}
  >
    {label}
  </div>
  <div class="text-buff-right">
    {#if metaText}
      <span
        class="text-buff-layer"
        style:color={valueColor}
        style:font-size={`${Math.max(10, fontSize - 1)}px`}
      >
        {metaText}
      </span>
    {/if}
    <span
      class="text-buff-time"
      style:color={valueColor}
      style:font-size={`${fontSize}px`}
    >
      {valueText}
    </span>
  </div>

  {#if showProgress}
    <div class="text-buff-decay">
      <div
        class="text-buff-decay-fill"
        style:width={`${progressPercent}%`}
        style:background={progressColor}
        style:opacity={progressOpacity}
      ></div>
    </div>
  {/if}
</div>

<style>
  .text-buff-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
  }

  .text-buff-row.placeholder {
    opacity: 0.6;
  }

  .text-buff-name,
  .text-buff-time,
  .text-buff-layer {
    line-height: 1.2;
    text-shadow:
      0 0 3px rgba(0, 0, 0, 1),
      0 0 6px rgba(0, 0, 0, 0.7),
      0 1px 2px rgba(0, 0, 0, 0.9);
  }

  .text-buff-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .text-buff-right {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }

  .text-buff-time,
  .text-buff-layer {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .text-buff-time {
    font-weight: 600;
  }

  .text-buff-decay {
    grid-column: 1 / -1;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.2);
    overflow: hidden;
  }

  .text-buff-decay-fill {
    height: 100%;
    transition: width 100ms linear;
  }
</style>
