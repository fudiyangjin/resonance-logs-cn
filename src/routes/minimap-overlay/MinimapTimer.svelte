<script lang="ts">
  import { remainingUntilMs } from "$lib/hud-temporal.svelte.js";
  import { overlayNow } from "../game-overlay/overlay-clock.svelte.js";
  import type { MechanicRow } from "./scene-types";

  let { row }: { row: MechanicRow } = $props();

  const remainingText = $derived.by(() => {
    if (row.durationMs <= 0 || row.createTimeMs <= 0) return "--";
    const remainingMs = remainingUntilMs(
      row.createTimeMs + row.durationMs,
      overlayNow(),
    );
    return `${Math.floor(remainingMs / 1000)}s`;
  });
</script>

<span class="time">{remainingText}</span>

<style>
  .time {
    flex: none;
    min-width: 3ch;
    margin-top: 2px;
    padding: 2px 6px;
    border: 1px solid rgba(125, 211, 252, 0.28);
    border-radius: 999px;
    color: #e0f2fe;
    background: rgba(14, 165, 233, 0.12);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    text-align: right;
  }
</style>
