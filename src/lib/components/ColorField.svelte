<script lang="ts">
  /**
   * One color setting: a swatch that opens the native picker, a hex box the
   * user can type or paste into, and a palette of scheme / recently used
   * colors so the exact same color is one click away.
   *
   * Controlled: the parent owns the value and writes it through its own
   * update function in `onchange`. Dragging the native picker commits at
   * most every 200 ms so the HUD follows without rewriting the settings file
   * on every step.
   */
  import { onDestroy } from "svelte";
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { t } from "$lib/i18n/index.svelte";
  import { cn } from "$lib/utils.js";
  import { blurOnEnter } from "$lib/utils.svelte";
  import { createThrottledCommit, parseColorInput } from "$lib/color-field";
  import { recentColors, rememberColor } from "$lib/recent-colors.svelte";
  import { HUD_SCHEME_SWATCHES } from "$lib/hud-color-schemes";

  interface Props {
    /** `#rrggbb`; anything unparsable shows as black. */
    value: string;
    onchange: (hex: string) => void;
    label?: string | undefined;
    description?: string | undefined;
    /** Accessible name when the field has no visible label. */
    ariaLabel?: string | undefined;
    swatches?: readonly string[] | undefined;
    disabled?: boolean | undefined;
    class?: string | undefined;
  }

  let {
    value,
    onchange,
    label,
    description,
    ariaLabel,
    swatches = HUD_SCHEME_SWATCHES,
    disabled = false,
    class: className,
  }: Props = $props();

  const normalized = $derived(parseColorInput(value) ?? "#000000");
  const name = $derived(label ?? ariaLabel ?? "");

  // While the native picker is dragged the swatch and hex box show this,
  // so a lagging throttled value never pushes the open picker back.
  let preview = $state<string | null>(null);
  const shownColor = $derived(preview ?? normalized);

  // A typed draft only counts against the value it was typed over: if the
  // value changes underneath (scheme applied, profile switched) it lapses.
  let draft = $state<{ base: string; text: string } | null>(null);
  const shownText = $derived(
    draft && draft.base === value ? draft.text : shownColor.toUpperCase(),
  );

  let invalid = $state(false);
  let invalidTimer: ReturnType<typeof setTimeout> | undefined;
  let paletteOpen = $state(false);

  const throttle = createThrottledCommit((hex: string) => {
    if (hex !== normalized) onchange(hex);
  }, 200);

  function commit(hex: string) {
    throttle.cancel();
    if (hex !== normalized) onchange(hex);
    rememberColor(hex);
  }

  function onPickerInput(event: Event & { currentTarget: HTMLInputElement }) {
    const hex = parseColorInput(event.currentTarget.value);
    if (!hex) return;
    preview = hex;
    throttle.push(hex);
  }

  function onPickerChange(event: Event & { currentTarget: HTMLInputElement }) {
    const hex = parseColorInput(event.currentTarget.value);
    throttle.flush();
    preview = null;
    if (hex) commit(hex);
  }

  function onPickerBlur() {
    throttle.flush();
    preview = null;
  }

  function flagInvalid() {
    invalid = true;
    clearTimeout(invalidTimer);
    invalidTimer = setTimeout(() => (invalid = false), 1500);
  }

  function onTextChange(event: Event & { currentTarget: HTMLInputElement }) {
    const text = event.currentTarget.value;
    draft = null;
    if (!text.trim()) return;
    const hex = parseColorInput(text);
    if (hex) commit(hex);
    else flagInvalid();
  }

  function onTextKeydown(
    event: KeyboardEvent & { currentTarget: HTMLInputElement },
  ) {
    if (event.key !== "Escape") return;
    draft = null;
    event.currentTarget.value = normalized.toUpperCase();
    event.currentTarget.blur();
  }

  function pick(hex: string) {
    commit(hex);
    paletteOpen = false;
  }

  onDestroy(() => {
    throttle.flush();
    clearTimeout(invalidTimer);
  });
</script>

{#snippet swatchGrid(colors: readonly string[])}
  <div class="grid grid-cols-8 gap-1.5">
    {#each colors as color (color)}
      <button
        type="button"
        class="border-border/60 hover:ring-primary/60 h-6 w-6 rounded border transition-shadow hover:ring-2 {color ===
        normalized
          ? 'ring-primary ring-2'
          : ''}"
        style:background={color}
        title={color.toUpperCase()}
        aria-label={color.toUpperCase()}
        onclick={() => pick(color)}
      ></button>
    {/each}
  </div>
{/snippet}

{#snippet controls()}
  <div class="flex shrink-0 items-center gap-1.5">
    <input
      type="color"
      class="border-border/60 h-7 w-8 cursor-pointer rounded border bg-transparent p-0 disabled:cursor-not-allowed"
      value={shownColor}
      {disabled}
      title={shownColor.toUpperCase()}
      aria-label={name}
      oninput={onPickerInput}
      onchange={onPickerChange}
      onblur={onPickerBlur}
    />
    <input
      type="text"
      class={cn(
        "bg-background text-foreground w-[5.5rem] rounded border px-1.5 py-1 font-mono text-xs uppercase transition-colors",
        invalid ? "border-destructive" : "border-border/60",
      )}
      value={shownText}
      {disabled}
      spellcheck="false"
      autocomplete="off"
      maxlength={24}
      aria-label={`${name} ${t("colorField.hexLabel")}`.trim()}
      aria-invalid={invalid}
      title={invalid ? t("colorField.invalid") : undefined}
      oninput={(event) =>
        (draft = { base: value, text: event.currentTarget.value })}
      onchange={onTextChange}
      onkeydown={onTextKeydown}
      {@attach blurOnEnter}
    />
    <Popover.Root bind:open={paletteOpen}>
      <Popover.Trigger
        class="border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground flex h-7 w-6 items-center justify-center rounded border transition-colors disabled:opacity-50"
        {disabled}
        aria-label={t("colorField.openPalette")}
        title={t("colorField.openPalette")}
      >
        <ChevronDown class="h-3.5 w-3.5" />
      </Popover.Trigger>
      <Popover.Content class="w-auto space-y-3 p-3" align="end" sideOffset={6}>
        <div class="space-y-1.5">
          <div class="text-muted-foreground text-xs">
            {t("colorField.schemeColors")}
          </div>
          {@render swatchGrid(swatches)}
        </div>
        <div class="space-y-1.5">
          <div class="text-muted-foreground text-xs">
            {t("colorField.recent")}
          </div>
          {#if recentColors().length > 0}
            {@render swatchGrid(recentColors())}
          {:else}
            <div class="text-muted-foreground/70 text-xs">
              {t("colorField.recentEmpty")}
            </div>
          {/if}
        </div>
      </Popover.Content>
    </Popover.Root>
  </div>
{/snippet}

{#if label}
  <div
    class={cn(
      "hover:bg-popover/50 flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors",
      className,
    )}
  >
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <div class="text-foreground text-sm">{label}</div>
      {#if description}
        <div class="text-muted-foreground text-xs leading-relaxed">
          {description}
        </div>
      {/if}
    </div>
    {@render controls()}
  </div>
{:else}
  <div class={cn("inline-flex", className)}>{@render controls()}</div>
{/if}
