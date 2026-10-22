<script lang="ts">
  /**
   * @file Numeric field of the counter editor. Commits on change (blur or
   * Enter) so a half-typed value such as `1.` is never rewritten under the
   * cursor. `scale` converts the shown unit into the stored one, e.g. 1000
   * for seconds stored as milliseconds; scaled values are rounded.
   */
  import { blurOnEnter } from "$lib/utils.svelte";

  interface Props {
    value: number | null;
    onchange: (value: number | null) => void;
    scale?: number;
    step?: number | "any";
    min?: number | undefined;
    placeholder?: string | undefined;
    invalid?: boolean;
    path?: string | undefined;
    ariaLabel?: string | undefined;
  }

  let {
    value,
    onchange,
    scale = 1,
    step = 1,
    min,
    placeholder,
    invalid = false,
    path,
    ariaLabel,
  }: Props = $props();

  function format(stored: number | null): string {
    return stored === null
      ? ""
      : String(Math.round((stored / scale) * 1000) / 1000);
  }

  function commit(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const raw = input.value.trim();
    if (!raw) {
      onchange(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      input.value = format(value);
      return;
    }
    const next = scale === 1 ? parsed : Math.round(parsed * scale);
    onchange(next);
    input.value = format(next);
  }
</script>

<input
  type="number"
  class="bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none {invalid
    ? 'border-destructive/70'
    : 'border-border/60'}"
  {step}
  {min}
  {placeholder}
  value={format(value)}
  data-path={path}
  aria-label={ariaLabel}
  aria-invalid={invalid}
  onchange={commit}
  {@attach blurOnEnter}
/>
