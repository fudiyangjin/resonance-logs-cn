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
    columnGap?: number | undefined;
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
    columnGap = 8,
    placeholder = false,
  }: Props = $props();
</script>

<div class="text-buff-row" class:placeholder>
  {#if showProgress}
    <div class="text-buff-progress-track">
      <div
        class="text-buff-progress-fill"
        style:width={`${progressPercent}%`}
        style:background={progressColor}
        style:opacity={progressOpacity}
      ></div>
    </div>
  {/if}

  <div class="text-buff-main" style:gap={`${columnGap}px`}>
    <span
      class="text-buff-name"
      style:color={nameColor}
      style:font-size={`${fontSize}px`}
    >
      {label}
    </span>
    <span class="text-buff-right">
      {#if metaText}
        <span
          class="text-buff-meta"
          style:color={valueColor}
          style:font-size={`${Math.max(10, fontSize - 1)}px`}
        >
          {metaText}
        </span>
      {/if}
      <span
        class="text-buff-value"
        style:color={valueColor}
        style:font-size={`${fontSize}px`}
      >
        {valueText}
      </span>
    </span>
  </div>
</div>

<style>
  .text-buff-row {
    position: relative;
    min-height: 20px;
    border-radius: 6px;
    overflow: hidden;
  }

  .text-buff-row.placeholder {
    opacity: 0.6;
  }

  .text-buff-progress-track {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgba(255, 255, 255, 0.16);
    overflow: hidden;
  }

  .text-buff-progress-fill {
    height: 100%;
    transition: width 100ms linear;
  }

  .text-buff-main {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 2px 6px;
    text-shadow:
      0 0 3px rgba(0, 0, 0, 1),
      0 0 6px rgba(0, 0, 0, 0.7),
      0 1px 2px rgba(0, 0, 0, 0.9);
  }

  .text-buff-name {
    min-width: 0;
    flex: 1 1 auto;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .text-buff-right {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    flex: 0 0 auto;
    min-width: 0;
  }

  .text-buff-meta,
  .text-buff-value {
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .text-buff-value {
    font-weight: 600;
  }
</style>
