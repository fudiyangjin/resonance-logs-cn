<script lang="ts">
  /**
   * @file One counting source of the counter editor, rendered from the
   * kind's field specs in `$lib/user-counter-rules`; rarely needed fields sit
   * behind "Advanced", which opens by itself when one of them is invalid.
   */
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import Trash2Icon from "virtual:icons/lucide/trash-2";
  import { t } from "$lib/i18n/index.svelte";
  import {
    COUNTER_SOURCE_KINDS,
    DAMAGE_TYPE_FLAGS,
    SOURCE_KIND_GROUPS,
    createSourceDraft,
    getSourceFieldSpecs,
    type RuleIssueCode,
    type SourceDraft,
    type SourceFieldSpec,
  } from "$lib/user-counter-rules";
  import CounterIdPicker from "./counter-id-picker.svelte";
  import CounterNumberInput from "./counter-number-input.svelte";
  import {
    counterIdName,
    getCounterEditorContext,
  } from "./counter-editor-context";

  interface Props {
    source: SourceDraft;
    index: number;
    errorFor: (path: string) => RuleIssueCode | undefined;
    onremove: () => void;
  }

  let { source = $bindable(), index, errorFor, onremove }: Props = $props();

  const context = getCounterEditorContext();

  type AttrCondition = { attrId: number | null; requiredValue: number | null };

  let advancedOpen = $state(false);

  const fields = $derived(getSourceFieldSpecs(source.kind));
  const mainFields = $derived(fields.filter((field) => !field.advanced));
  const advancedFields = $derived(fields.filter((field) => field.advanced));
  const advancedHasError = $derived(
    advancedFields.some((field) => errorFor(fieldPath(field)) !== undefined),
  );
  const advancedInUse = $derived(
    advancedFields.some((field) => {
      const value = source.params[field.key];
      return field.key !== "attrId" && value !== null && value !== 0;
    }),
  );
  const showAdvanced = $derived(advancedOpen || advancedHasError);

  function fieldPath(field: SourceFieldSpec): string {
    return `sources.${index}.${field.key}`;
  }

  function isWide(field: SourceFieldSpec): boolean {
    const type = field.control.type;
    return type === "ids" || type === "typeFlags" || type === "attrCondition";
  }

  function changeKind(value: string) {
    const kind = COUNTER_SOURCE_KINDS.find((item) => item === value);
    if (kind && kind !== source.kind) source = createSourceDraft(kind, source);
  }

  function numberParam(key: string): number | null {
    const value = source.params[key];
    return typeof value === "number" ? value : null;
  }

  function idsParam(key: string): number[] {
    const value = source.params[key];
    return Array.isArray(value) ? (value as number[]) : [];
  }

  function attrCondition(): AttrCondition | null {
    const value = source.params["attrCondition"];
    return value && typeof value === "object" ? (value as AttrCondition) : null;
  }
</script>

{#snippet field(spec: SourceFieldSpec)}
  {@const path = fieldPath(spec)}
  {@const error = errorFor(path)}
  {@const control = spec.control}
  <div class="space-y-1 {isWide(spec) ? 'sm:col-span-2 lg:col-span-3' : ''}">
    <div class="text-muted-foreground text-xs">
      {t(`skillMonitor.customPanel.counterEditor.field.${spec.label}`)}
    </div>
    {#if control.type === "ids"}
      <CounterIdPicker
        domain={control.domain}
        ids={idsParam(spec.key)}
        multiple
        invalid={error !== undefined}
        {path}
        onchange={(ids) => (source.params[spec.key] = ids)}
      />
    {:else if control.type === "id" && (control.domain === "buff" || control.domain === "skill" || control.domain === "resource")}
      {@const value = numberParam(spec.key)}
      <CounterIdPicker
        domain={control.domain}
        ids={value === null ? [] : [value]}
        multiple={false}
        invalid={error !== undefined}
        {path}
        onchange={(ids) => (source.params[spec.key] = ids[0] ?? null)}
      />
    {:else if control.type === "id"}
      {@const value = numberParam(spec.key)}
      <CounterNumberInput
        {value}
        min={1}
        invalid={error !== undefined}
        {path}
        onchange={(next) => (source.params[spec.key] = next)}
      />
      {#if value !== null && control.domain}
        {@const name = counterIdName(context, control.domain, value)}
        {#if name}
          <div class="text-muted-foreground text-xs">{name}</div>
        {/if}
      {/if}
    {:else if control.type === "count"}
      <CounterNumberInput
        value={numberParam(spec.key)}
        min={1}
        placeholder={spec.required
          ? undefined
          : t("skillMonitor.customPanel.counterEditor.unset")}
        invalid={error !== undefined}
        {path}
        onchange={(next) => (source.params[spec.key] = next)}
      />
    {:else if control.type === "milliseconds"}
      <CounterNumberInput
        value={numberParam(spec.key)}
        scale={1000}
        step={0.1}
        min={0.001}
        invalid={error !== undefined}
        {path}
        onchange={(next) => (source.params[spec.key] = next)}
      />
    {:else if control.type === "meters"}
      <CounterNumberInput
        value={numberParam(spec.key)}
        step={0.1}
        min={0}
        invalid={error !== undefined}
        {path}
        onchange={(next) => (source.params[spec.key] = next)}
      />
    {:else if control.type === "typeFlags"}
      {@const flags = numberParam(spec.key) ?? 0}
      <div class="flex flex-wrap gap-x-4 gap-y-1.5" data-path={path}>
        {#each DAMAGE_TYPE_FLAGS as flag (flag.bit)}
          <label class="text-foreground flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={(flags & flag.bit) !== 0}
              onchange={(event) =>
                (source.params[spec.key] = (
                  event.currentTarget as HTMLInputElement
                ).checked
                  ? flags | flag.bit
                  : flags & ~flag.bit)}
            />
            {t(`skillMonitor.customPanel.counterEditor.flag.${flag.key}`)}
          </label>
        {/each}
      </div>
      <p class="text-muted-foreground text-xs">
        {t(
          "skillMonitor.customPanel.counterEditor.field.requiredTypeFlagsHint",
        )}
      </p>
    {:else if control.type === "attrCondition"}
      {@const condition = attrCondition()}
      <label class="text-foreground flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={condition !== null}
          onchange={(event) =>
            (source.params[spec.key] = (event.currentTarget as HTMLInputElement)
              .checked
              ? { attrId: null, requiredValue: 0 }
              : null)}
        />
        {t("skillMonitor.customPanel.counterEditor.field.attrConditionHint")}
      </label>
      {#if condition}
        <div class="grid max-w-md grid-cols-2 gap-2">
          <label class="space-y-1">
            <span class="text-muted-foreground text-xs">
              {t("skillMonitor.customPanel.counterEditor.field.attrId")}
            </span>
            <CounterNumberInput
              value={condition.attrId}
              min={1}
              invalid={error !== undefined}
              {path}
              onchange={(next) => (condition.attrId = next)}
            />
          </label>
          <label class="space-y-1">
            <span class="text-muted-foreground text-xs">
              {t("skillMonitor.customPanel.counterEditor.field.attrValue")}
            </span>
            <CounterNumberInput
              value={condition.requiredValue}
              invalid={error !== undefined}
              onchange={(next) => (condition.requiredValue = next)}
            />
          </label>
        </div>
      {/if}
    {/if}
    {#if error}
      <p class="text-destructive text-xs">
        {t(`skillMonitor.customPanel.counterEditor.issue.${error}`)}
      </p>
    {/if}
  </div>
{/snippet}

<div class="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-3">
  <div class="flex items-start gap-2">
    <div class="min-w-0 flex-1 space-y-1">
      <select
        class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none sm:w-72"
        aria-label={t("skillMonitor.customPanel.counterEditor.kindLabel")}
        value={source.kind}
        onchange={(event) =>
          changeKind((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each SOURCE_KIND_GROUPS as group (group.group)}
          <optgroup
            label={t(
              `skillMonitor.customPanel.counterEditor.group.${group.group}`,
            )}
          >
            {#each group.kinds as kind (kind)}
              <option value={kind}>
                {t(`skillMonitor.customPanel.counterEditor.kind.${kind}`)}
              </option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <p class="text-muted-foreground text-xs">
        {t(`skillMonitor.customPanel.counterEditor.kindHint.${source.kind}`)}
      </p>
    </div>
    <button
      type="button"
      class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-9 w-9 shrink-0 items-center justify-center rounded transition-colors"
      aria-label={t("skillMonitor.customPanel.counterEditor.removeSource")}
      title={t("skillMonitor.customPanel.counterEditor.removeSource")}
      onclick={onremove}
    >
      <Trash2Icon class="h-4 w-4" />
    </button>
  </div>

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each mainFields as spec (spec.key)}
      {@render field(spec)}
    {/each}
  </div>

  {#if advancedFields.length > 0}
    <div class="space-y-3">
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
        aria-expanded={showAdvanced}
        onclick={() => (advancedOpen = !showAdvanced)}
      >
        <ChevronDownIcon
          class="h-3.5 w-3.5 transition-transform {showAdvanced
            ? ''
            : '-rotate-90'}"
        />
        {t("skillMonitor.customPanel.counterEditor.advanced")}
        {#if advancedInUse && !showAdvanced}
          <span class="bg-primary h-1.5 w-1.5 rounded-full"></span>
        {/if}
      </button>
      {#if showAdvanced}
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each advancedFields as spec (spec.key)}
            {@render field(spec)}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
