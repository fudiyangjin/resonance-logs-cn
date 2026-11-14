<script lang="ts">
  /** A millisecond setting edited in seconds, kept inside `range`. */
  let {
    label,
    valueMs = $bindable(),
    range,
  }: {
    label: string;
    valueMs: number;
    range: { min: number; max: number };
  } = $props();

  function commit(input: HTMLInputElement) {
    const text = input.value.trim();
    const seconds = Number(text);
    // Blank, malformed or negative input keeps the current value.
    if (text && Number.isFinite(seconds) && seconds >= 0) {
      valueMs = Math.round(
        Math.min(range.max, Math.max(range.min, seconds * 1000)),
      );
    }
    // The field shows what was kept, also when that is the unchanged value.
    input.value = String(valueMs / 1000);
  }
</script>

<label class="flex items-center gap-2 text-sm">
  {label}
  <input
    class="bg-background w-24 rounded border p-2"
    type="text"
    inputmode="decimal"
    value={valueMs / 1000}
    onchange={(event) => commit(event.currentTarget)}
  />
</label>
