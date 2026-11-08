<script lang="ts">
  /**
   * An opacity setting: a slider for dragging plus a percent box for typing
   * an exact value. Dragging previews locally and commits at most every
   * 200 ms, like `ColorField`.
   */
  import { onDestroy } from "svelte";
  import { createThrottledCommit } from "$lib/color-field";
  import { blurOnEnter } from "$lib/utils.svelte";

  interface Props {
    label: string;
    /** 0–1. */
    value: number;
    onchange: (value: number) => void;
    step?: number | undefined;
  }

  let { label, value, onchange, step = 0.05 }: Props = $props();

  let draft = $state<number | null>(null);
  const shown = $derived(draft ?? value);

  function clamp(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  const throttle = createThrottledCommit((next: number) => {
    if (Math.abs(next - value) > 1e-6) onchange(next);
  }, 200);

  function onSliderInput(event: Event & { currentTarget: HTMLInputElement }) {
    const next = clamp(Number(event.currentTarget.value));
    if (!Number.isFinite(next)) return;
    draft = next;
    throttle.push(next);
  }

  function onSliderChange() {
    throttle.flush();
    draft = null;
  }

  function onPercentChange(event: Event & { currentTarget: HTMLInputElement }) {
    const percent = Number(event.currentTarget.value);
    if (Number.isFinite(percent)) {
      const next = clamp(Math.round(percent) / 100);
      if (Math.abs(next - value) > 1e-6) onchange(next);
    }
    event.currentTarget.value = String(Math.round(value * 100));
  }

  onDestroy(() => throttle.flush());
</script>

<div
  class="hover:bg-popover/50 flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors"
>
  <span class="text-foreground min-w-0 text-sm">{label}</span>
  <div class="flex shrink-0 items-center gap-2">
    <input
      type="range"
      min="0"
      max="1"
      {step}
      value={shown}
      aria-label={label}
      class="accent-primary w-24 cursor-pointer"
      oninput={onSliderInput}
      onchange={onSliderChange}
    />
    <label class="text-muted-foreground flex items-center gap-0.5 text-xs">
      <input
        type="number"
        min="0"
        max="100"
        value={Math.round(shown * 100)}
        aria-label={label}
        class="bg-background border-border/60 text-foreground w-12 rounded border px-1 py-0.5 text-right font-mono"
        onchange={onPercentChange}
        {@attach blurOnEnter}
      />%
    </label>
  </div>
</div>
