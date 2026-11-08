<script lang="ts">
  import { onDestroy } from "svelte";
  import Color from "colorjs.io";
  import ColorField from "$lib/components/ColorField.svelte";
  import { createThrottledCommit } from "$lib/color-field";
  import { t } from "$lib/i18n/index.svelte";

  let {
    label = "",
    description = "",
    value = $bindable("rgba(255, 255, 255, 1)"),
    oninput,
  }: {
    label: string;
    description?: string | undefined;
    value: string;
    oninput?: (value: string) => void;
  } = $props();

  type Rgba = { r: number; g: number; b: number; a: number };

  // Any CSS color (oklch, rgba, hex, …) to sRGB channels; output is rgba().
  function parseToRgba(colorStr: string): Rgba {
    try {
      const srgb = new Color(colorStr).to("srgb");
      const channel = (n: number | null | undefined) =>
        Math.round(Math.max(0, Math.min(1, n ?? 0)) * 255);
      return {
        r: channel(srgb.coords[0]),
        g: channel(srgb.coords[1]),
        b: channel(srgb.coords[2]),
        a: srgb.alpha ?? 1,
      };
    } catch {
      return { r: 255, g: 255, b: 255, a: 1 };
    }
  }

  function toHex({ r, g, b }: Rgba): string {
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }

  const parsed = $derived(parseToRgba(value));
  const hex = $derived(toHex(parsed));

  // The slider previews locally while dragged; the store sees throttled commits.
  let alphaDraft = $state<number | null>(null);
  const alphaPercent = $derived(Math.round((alphaDraft ?? parsed.a) * 100));

  function emit(color: Rgba) {
    const next = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    if (next === value) return;
    value = next;
    oninput?.(next);
  }

  const alphaThrottle = createThrottledCommit((alpha: number) => {
    emit({ ...parsed, a: alpha });
  }, 200);

  function setHex(next: string) {
    emit({
      r: Number.parseInt(next.slice(1, 3), 16),
      g: Number.parseInt(next.slice(3, 5), 16),
      b: Number.parseInt(next.slice(5, 7), 16),
      a: parsed.a,
    });
  }

  function percentToAlpha(text: string): number | null {
    const percent = Number(text);
    if (!Number.isFinite(percent)) return null;
    return Math.round(Math.max(0, Math.min(100, percent))) / 100;
  }

  function onSliderInput(event: Event & { currentTarget: HTMLInputElement }) {
    const alpha = percentToAlpha(event.currentTarget.value);
    if (alpha === null) return;
    alphaDraft = alpha;
    alphaThrottle.push(alpha);
  }

  function onSliderChange() {
    alphaThrottle.flush();
    alphaDraft = null;
  }

  function onPercentChange(event: Event & { currentTarget: HTMLInputElement }) {
    const alpha = percentToAlpha(event.currentTarget.value);
    if (alpha !== null) emit({ ...parsed, a: alpha });
    event.currentTarget.value = String(Math.round(parsed.a * 100));
  }

  onDestroy(() => alphaThrottle.flush());
</script>

<div
  class="hover:bg-popover/50 flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors"
>
  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
    <div class="text-foreground text-sm font-medium">{label}</div>
    {#if description}
      <div class="text-muted-foreground text-xs leading-relaxed">
        {description}
      </div>
    {/if}
  </div>
  <div class="flex flex-shrink-0 items-center gap-2">
    <ColorField value={hex} ariaLabel={label} onchange={setHex} />
    <input
      type="range"
      min="0"
      max="100"
      value={alphaPercent}
      aria-label={`${label} ${t("colorField.opacity")}`}
      oninput={onSliderInput}
      onchange={onSliderChange}
      class="accent-primary h-2 w-16 cursor-pointer"
    />
    <label class="text-muted-foreground flex items-center gap-0.5 text-xs">
      <input
        type="number"
        min="0"
        max="100"
        value={alphaPercent}
        aria-label={`${label} ${t("colorField.opacity")}`}
        class="bg-background border-border/60 w-12 rounded border px-1 py-0.5 text-right font-mono"
        onchange={onPercentChange}
      />%
    </label>
  </div>
</div>
