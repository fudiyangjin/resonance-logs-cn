<script lang="ts">
  let {
    label = "",
    description = "",
    checked = $bindable(false),
    onCheckedChange,
  }: {
    label: string;
    description?: string | undefined;
    checked: boolean | undefined;
    onCheckedChange?: (checked: boolean) => void;
  } = $props();

  // If checked is undefined, give it a default (e.g. false)
  if (checked === undefined) {
    checked = true;
  }
</script>

<label
  class="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-popover/50 cursor-pointer transition-colors group"
>
  <div class="relative flex items-center justify-center shrink-0">
    <input
      type="checkbox"
      bind:checked
      onchange={(event) =>
        onCheckedChange?.((event.currentTarget as HTMLInputElement).checked)}
      class="peer appearance-none w-5 h-5 border-2 border-border rounded bg-popover cursor-pointer transition-all
             checked:bg-primary checked:border-primary
             hover:border-border/80 checked:hover:border-primary/80
             focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
    />
    <svg
      class="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  </div>
  <div class="flex-1 min-w-0">
    <div
      class="text-sm font-medium text-foreground group-hover:text-foreground transition-colors"
    >
      {label}
    </div>
    {#if description}
      <div class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
        {description}
      </div>
    {/if}
  </div>
</label>
