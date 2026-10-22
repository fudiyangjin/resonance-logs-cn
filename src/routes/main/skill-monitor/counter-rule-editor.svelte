<script lang="ts">
  /**
   * @file Form for one user counter rule. Works on a local draft and writes
   * settings once, on save (every settings write is a full IPC round and
   * file write). Errors show after the first save attempt, which also
   * scrolls to the first invalid field; warnings never block saving.
   */
  import { tick } from "svelte";
  import PlusIcon from "virtual:icons/lucide/plus";
  import type { BuffDefinition } from "$lib/config/buff-name-table";
  import { t } from "$lib/i18n/index.svelte";
  import type { UserCounterRule } from "$lib/settings-store";
  import type { CounterRulePreset } from "$lib/skill-mappings";
  import {
    createRuleDraft,
    createSlotDraft,
    createSourceDraft,
    fromDraft,
    issuesByPath,
    toDraft,
    validateRuleDraft,
    type CounterRuleDefinition,
    type RuleDraft,
    type RuleIssueCode,
  } from "$lib/user-counter-rules";
  import { blurOnEnter } from "$lib/utils.svelte";
  import CounterSlotFields from "./counter-slot-fields.svelte";
  import CounterSourceFields from "./counter-source-fields.svelte";
  import { setCounterEditorContext } from "./counter-editor-context";

  interface Props {
    /** `null` creates a new rule. Mount a new editor per rule. */
    rule: UserCounterRule | null;
    presets: CounterRulePreset[];
    classKey: string;
    availableBuffMap: Map<number, BuffDefinition>;
    getBuffDisplayName: (buffId: number) => string;
    getBuffIconPreviewSrc: (buffId: number) => string | null;
    onsave: (
      body: { name: string } & CounterRuleDefinition,
      ruleId: number | null,
    ) => void;
    oncancel: () => void;
  }

  let {
    rule,
    presets,
    classKey,
    availableBuffMap,
    getBuffDisplayName,
    getBuffIconPreviewSrc,
    onsave,
    oncancel,
  }: Props = $props();

  setCounterEditorContext({
    get availableBuffMap() {
      return availableBuffMap;
    },
    get classKey() {
      return classKey;
    },
    getBuffDisplayName: (buffId) => getBuffDisplayName(buffId),
    getBuffIconPreviewSrc: (buffId) => getBuffIconPreviewSrc(buffId),
  });

  function initialDraft(): RuleDraft {
    return rule ? toDraft(rule, rule.ruleId) : createRuleDraft();
  }

  function highestSlotId(slots: ReadonlyArray<{ slotId: number }>): number {
    return slots.reduce((highest, slot) => Math.max(highest, slot.slotId), 0);
  }

  const startDraft = initialDraft();
  let draft = $state(startDraft);
  // Slot ids are never handed out twice while editing: the saved rule's
  // panel entries and voice bindings still point at removed ones.
  let lastSlotId = $state(highestSlotId(startDraft.slots));
  let showErrors = $state(false);
  let root: HTMLElement | undefined = $state();

  const validation = $derived(validateRuleDraft(draft));
  const errors = $derived(issuesByPath(validation.errors));
  const warnings = $derived(issuesByPath(validation.warnings));

  function errorFor(path: string): RuleIssueCode | undefined {
    return showErrors ? errors.get(path) : undefined;
  }

  function warningFor(path: string): RuleIssueCode | undefined {
    return warnings.get(path);
  }

  const slotsError = $derived(errorFor("slots"));

  function copyPreset(value: string) {
    const preset = presets.find((item) => String(item.ruleId) === value);
    if (!preset) return;
    draft = {
      ...toDraft(preset, null),
      name: t("skillMonitor.customPanel.counterEditor.copyName", {
        name: preset.name,
      }),
    };
    lastSlotId = highestSlotId(draft.slots);
    showErrors = false;
  }

  function addSource() {
    draft.sources.push(createSourceDraft("skillCast"));
  }

  function addSlot() {
    lastSlotId = Math.max(lastSlotId, highestSlotId(draft.slots)) + 1;
    draft.slots.push(createSlotDraft(lastSlotId));
  }

  async function save() {
    if (validation.errors.length > 0) {
      showErrors = true;
      await tick();
      const first = validation.errors[0];
      const target =
        (first &&
          root?.querySelector<HTMLElement>(
            `[data-path="${CSS.escape(first.path)}"]`,
          )) ??
        root?.querySelector<HTMLElement>('[aria-invalid="true"]');
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      target?.focus({ preventScroll: true });
      return;
    }
    onsave(fromDraft($state.snapshot(draft)), draft.ruleId);
  }
</script>

<div
  bind:this={root}
  class="border-primary/40 bg-primary/5 space-y-5 rounded-lg border p-4"
>
  <div class="flex flex-wrap items-end gap-3">
    <label class="block min-w-56 flex-1 space-y-1">
      <span class="text-muted-foreground text-xs">
        {t("skillMonitor.customPanel.counterEditor.name")}
      </span>
      <input
        class="bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none {errorFor(
          'name',
        )
          ? 'border-destructive/70'
          : 'border-border/60'}"
        placeholder={t(
          "skillMonitor.customPanel.counterEditor.namePlaceholder",
        )}
        value={draft.name}
        data-path="name"
        oninput={(event) =>
          (draft.name = (event.currentTarget as HTMLInputElement).value)}
        {@attach blurOnEnter}
      />
      {#if errorFor("name")}
        <p class="text-destructive text-xs">
          {t("skillMonitor.customPanel.counterEditor.issue.nameRequired")}
        </p>
      {/if}
    </label>
    {#if draft.ruleId === null && presets.length > 0}
      <label class="block space-y-1">
        <span class="text-muted-foreground text-xs">
          {t("skillMonitor.customPanel.counterEditor.copyFromPreset")}
        </span>
        <select
          class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 w-full rounded border px-2 py-2 text-sm focus:ring-2 focus:outline-none sm:w-64"
          value=""
          onchange={(event) => {
            const select = event.currentTarget as HTMLSelectElement;
            copyPreset(select.value);
            select.value = "";
          }}
        >
          <option value="" disabled>
            {t(
              "skillMonitor.customPanel.counterEditor.copyFromPresetPlaceholder",
            )}
          </option>
          {#each presets as preset (preset.ruleId)}
            <option value={String(preset.ruleId)}>{preset.name}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  <section class="space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-foreground text-sm font-medium">
          {t("skillMonitor.customPanel.counterEditor.sources")}
        </div>
        <p class="text-muted-foreground text-xs">
          {t("skillMonitor.customPanel.counterEditor.sourcesHint")}
        </p>
      </div>
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 flex min-h-9 shrink-0 items-center gap-1 rounded border px-3 py-1 text-xs transition-colors"
        onclick={addSource}
      >
        <PlusIcon class="h-3.5 w-3.5" />
        {t("skillMonitor.customPanel.counterEditor.addSource")}
      </button>
    </div>
    {#if draft.sources.length === 0}
      <div
        class="border-border/60 text-muted-foreground rounded-lg border border-dashed px-3 py-3 text-center text-xs"
      >
        {t("skillMonitor.customPanel.counterEditor.sourcesEmpty")}
      </div>
    {/if}
    {#each draft.sources as source, index (source.key)}
      <CounterSourceFields
        bind:source={() => source, (next) => (draft.sources[index] = next)}
        {index}
        {errorFor}
        onremove={() => draft.sources.splice(index, 1)}
      />
    {/each}
  </section>

  <section class="space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-foreground text-sm font-medium">
          {t("skillMonitor.customPanel.counterEditor.slots")}
        </div>
        <p class="text-muted-foreground text-xs">
          {t("skillMonitor.customPanel.counterEditor.slotsHint")}
        </p>
      </div>
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 flex min-h-9 shrink-0 items-center gap-1 rounded border px-3 py-1 text-xs transition-colors"
        onclick={addSlot}
      >
        <PlusIcon class="h-3.5 w-3.5" />
        {t("skillMonitor.customPanel.counterEditor.addSlot")}
      </button>
    </div>
    {#if slotsError}
      <p class="text-destructive text-xs" data-path="slots">
        {t(`skillMonitor.customPanel.counterEditor.issue.${slotsError}`)}
      </p>
    {/if}
    {#each draft.slots as slot, index (slot.key)}
      <CounterSlotFields
        bind:slot={() => slot, (next) => (draft.slots[index] = next)}
        {index}
        {errorFor}
        {warningFor}
        onremove={() => draft.slots.splice(index, 1)}
      />
    {/each}
  </section>

  {#if warningFor("sources")}
    <p class="text-xs text-amber-500">
      {t("skillMonitor.customPanel.counterEditor.issue.neverChanges")}
    </p>
  {/if}

  <div class="flex flex-wrap items-center justify-end gap-2">
    {#if showErrors && validation.errors.length > 0}
      <span class="text-destructive mr-auto text-xs" role="status">
        {errorFor("")
          ? t("skillMonitor.customPanel.counterEditor.issue.ruleInvalid")
          : t("skillMonitor.customPanel.counterEditor.issueCount", {
              count: validation.errors.length,
            })}
      </span>
    {/if}
    <button
      type="button"
      class="border-border/60 hover:bg-muted/40 min-h-9 rounded border px-4 py-1.5 text-sm transition-colors"
      onclick={oncancel}
    >
      {t("common.cancel")}
    </button>
    <button
      type="button"
      class="border-primary bg-primary text-primary-foreground min-h-9 rounded border px-4 py-1.5 text-sm font-medium transition-colors"
      onclick={save}
    >
      {t("skillMonitor.customPanel.counterEditor.save")}
    </button>
  </div>
</div>
