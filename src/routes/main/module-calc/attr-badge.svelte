<script lang="ts" module>
  import { resolvedLanguage } from "$lib/i18n/index.svelte";

  export function getAttrLevel(value: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
    if (value >= 20) return 6;
    if (value >= 16) return 5;
    if (value >= 12) return 4;
    if (value >= 8) return 3;
    if (value >= 4) return 2;
    if (value >= 1) return 1;
    return 0;
  }

  export function sortAttrEntries(entries: Array<[string, number]>) {
    return [...entries].sort(
      (a, b) =>
        getAttrLevel(b[1]) - getAttrLevel(a[1]) ||
        b[1] - a[1] ||
        a[0].localeCompare(b[0], resolvedLanguage())
    );
  }
</script>

<script lang="ts">
  import { tl, tm } from "$lib/i18n/index.svelte";
  let {
    name,
    value,
    compact = false,
  }: {
    name: string;
    value: number;
    compact?: boolean;
  } = $props();

  const level = $derived(Math.max(1, getAttrLevel(value)));
  const tierClass = $derived(`tier-${level}`);
  const isHighlighted = $derived(level >= 5);
</script>

<div
  class={`attr-badge ${compact ? "attr-badge--compact" : ""} ${tierClass}`}
  aria-label={tm("{{name}} +{{value}}, Lv{{level}}", { name: tl(name), value, level })}
>
  <div class="attr-badge__name">{tl(name)}</div>
  <div class="attr-badge__meta">
    <span class="attr-badge__value">+{value}</span>
    {#if isHighlighted}
      <span class="attr-badge__level">{tm("Lv{{level}}", { level })}</span>
    {/if}
  </div>
</div>

<style>
  .attr-badge {
    --tier-color: var(--border);
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border-radius: 0.95rem;
    border: 1px solid color-mix(in oklab, var(--tier-color) 40%, var(--border));
    background:
      linear-gradient(
        135deg,
        color-mix(in oklab, var(--tier-color) 18%, var(--card)) 0%,
        color-mix(in oklab, var(--tier-color) 10%, var(--card)) 100%
      );
    padding: 0.7rem 0.85rem;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 0 1px color-mix(in oklab, var(--tier-color) 8%, transparent);
  }

  .attr-badge--compact {
    gap: 0.5rem;
    border-radius: 0.8rem;
    padding: 0.55rem 0.7rem;
  }

  .attr-badge__name {
    min-width: 0;
    color: var(--foreground);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.15;
    word-break: break-word;
  }

  .attr-badge__meta {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: flex-end;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .attr-badge__value {
    color: var(--foreground);
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
  }

  .attr-badge__level {
    border-radius: 999px;
    background: color-mix(in oklab, var(--tier-color) 22%, transparent);
    color: color-mix(in oklab, var(--tier-color) 72%, white);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1;
    padding: 0.22rem 0.45rem;
  }

  .tier-1 {
    --tier-color: var(--border);
  }

  .tier-2 {
    --tier-color: var(--border);
  }

  .tier-3 {
    --tier-color: var(--border);
  }

  .tier-4 {
    --tier-color: var(--border);
  }

  .tier-5 {
    --tier-color: var(--tier-5);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 0 0 1px color-mix(in oklab, var(--tier-color) 18%, transparent),
      0 0 22px color-mix(in oklab, var(--tier-color) 16%, transparent);
  }

  .tier-5 .attr-badge__name,
  .tier-5 .attr-badge__value {
    color: color-mix(in oklab, var(--tier-color) 78%, white);
  }

  .tier-6 {
    --tier-color: var(--tier-6);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.07),
      0 0 0 1px color-mix(in oklab, var(--tier-color) 24%, transparent),
      0 0 26px color-mix(in oklab, var(--tier-color) 22%, transparent);
  }

  .tier-6 .attr-badge__name,
  .tier-6 .attr-badge__value {
    color: color-mix(in oklab, var(--tier-color) 82%, white);
  }
</style>
