<script lang="ts">
  /**
   * @file Typed seconds field for buff alert thresholds (0.1 s precision).
   *
   * The DOM holds the draft while typing; `change` (blur / Enter) commits a
   * normalized value once, so an edit costs a single settings write.
   */
  import { parseBuffAlertThresholdInput } from "$lib/settings-store";

  interface Props {
    value: number;
    onCommit: (seconds: number) => void;
    class?: string;
  }

  let { value, onCommit, class: className = "" }: Props = $props();

  function commit(input: HTMLInputElement) {
    const next = parseBuffAlertThresholdInput(input.value) ?? value;
    // A one-way `value` only patches the DOM when `value` changes, so rejected
    // or re-rounded text has to be replaced with the canonical form here.
    input.value = String(next);
    if (next !== value) onCommit(next);
  }
</script>

<input
  type="text"
  inputmode="decimal"
  class={className}
  {value}
  onchange={(event) => commit(event.currentTarget)}
  onkeydown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
  }}
/>
