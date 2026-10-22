<script lang="ts">
  /**
   * @file One display slot of the counter editor: target, linked buff and
   * its actions, cooldown; the rest (conditional cooldown, dungeon-start
   * cooldown, damage / passive triggers, attribute scaling) sits behind
   * "Advanced". Dependent fields only show once what they depend on is set.
   */
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import Trash2Icon from "virtual:icons/lucide/trash-2";
  import type { CounterAction } from "$lib/bindings";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    COUNTER_ACTIONS,
    COUNTER_DISPLAY_MODES,
    RESET_BUFF_TARGETS,
    type RuleIssueCode,
    type SlotDraft,
  } from "$lib/user-counter-rules";
  import CounterIdPicker from "./counter-id-picker.svelte";
  import CounterNumberInput from "./counter-number-input.svelte";

  interface Props {
    slot: SlotDraft;
    index: number;
    errorFor: (path: string) => RuleIssueCode | undefined;
    warningFor: (path: string) => RuleIssueCode | undefined;
    onremove: () => void;
  }

  let {
    slot = $bindable(),
    index,
    errorFor,
    warningFor,
    onremove,
  }: Props = $props();

  type ModifierKey = "thresholdModifier" | "freezeDurationModifier";

  const ADVANCED_PATHS = [
    "resetSourceConfigId",
    "altFreeze.conditionBuffId",
    "altFreeze.freezeDurationMs",
    "dungeonStartFreezeMs",
    "resetSkillKeys",
    "resetPassiveSkillIds",
    "thresholdModifier.attrId",
    "thresholdModifier.basisPointsPerUnit",
    "thresholdModifier.maxReductionBasisPoints",
    "freezeDurationModifier.attrId",
    "freezeDurationModifier.basisPointsPerUnit",
    "freezeDurationModifier.maxReductionBasisPoints",
  ];

  let advancedOpen = $state(false);

  const hasBuff = $derived(slot.resetBuffId !== null);
  const hasThreshold = $derived(slot.threshold !== null);
  const hasCooldown = $derived(
    slot.freezeDurationMs !== null ||
      slot.altFreeze !== null ||
      slot.dungeonStartFreezeMs !== null,
  );
  const advancedHasError = $derived(
    ADVANCED_PATHS.some((path) => errorFor(pathOf(path)) !== undefined),
  );
  const advancedInUse = $derived(
    (hasBuff && slot.resetSourceConfigId !== null) ||
      slot.altFreeze !== null ||
      slot.dungeonStartFreezeMs !== null ||
      slot.resetSkillKeys.length > 0 ||
      slot.resetPassiveSkillIds.length > 0 ||
      slot.thresholdModifier !== null ||
      slot.freezeDurationModifier !== null,
  );
  const showAdvanced = $derived(advancedOpen || advancedHasError);

  function pathOf(field: string): string {
    return `slots.${index}.${field}`;
  }

  function toAction(value: string): CounterAction | undefined {
    return COUNTER_ACTIONS.find((action) => action === value);
  }

  function setModifier(key: ModifierKey, enabled: boolean) {
    slot[key] = enabled
      ? { attrId: null, basisPointsPerUnit: 1, maxReductionBasisPoints: null }
      : null;
  }
</script>

{#snippet issue(path: string)}
  {@const error = errorFor(path)}
  {#if error}
    <p class="text-destructive text-xs">
      {t(`skillMonitor.customPanel.counterEditor.issue.${error}`)}
    </p>
  {/if}
{/snippet}

{#snippet labelled(label: MessageKey)}
  <span class="text-muted-foreground text-xs">{t(label)}</span>
{/snippet}

{#snippet actionSelect(
  label: MessageKey,
  value: CounterAction,
  onchange: (action: CounterAction) => void,
)}
  <label class="block space-y-1">
    {@render labelled(label)}
    <select
      class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
      {value}
      onchange={(event) => {
        const action = toAction(
          (event.currentTarget as HTMLSelectElement).value,
        );
        if (action) onchange(action);
      }}
    >
      {#each COUNTER_ACTIONS as action (action)}
        <option value={action}>
          {t(`skillMonitor.customPanel.counterEditor.action.${action}`)}
        </option>
      {/each}
    </select>
  </label>
{/snippet}

{#snippet secondsInput(
  label: MessageKey,
  value: number | null,
  path: string,
  onchange: (ms: number | null) => void,
)}
  <label class="block space-y-1">
    {@render labelled(label)}
    <CounterNumberInput
      {value}
      scale={1000}
      step={0.1}
      min={0.001}
      placeholder={t("skillMonitor.customPanel.counterEditor.unset")}
      invalid={errorFor(path) !== undefined}
      {path}
      {onchange}
    />
    {@render issue(path)}
  </label>
{/snippet}

{#snippet modifierFields(key: ModifierKey, label: MessageKey)}
  {@const modifier = slot[key]}
  <div class="space-y-2 sm:col-span-2 lg:col-span-3">
    <label class="text-foreground flex items-center gap-1.5 text-xs">
      <input
        type="checkbox"
        checked={modifier !== null}
        onchange={(event) =>
          setModifier(key, (event.currentTarget as HTMLInputElement).checked)}
      />
      {t(label)}
    </label>
    {#if modifier}
      <div class="grid gap-2 sm:grid-cols-3">
        <label class="block space-y-1">
          {@render labelled(
            "skillMonitor.customPanel.counterEditor.field.attrId",
          )}
          <CounterNumberInput
            value={modifier.attrId}
            min={1}
            invalid={errorFor(pathOf(`${key}.attrId`)) !== undefined}
            path={pathOf(`${key}.attrId`)}
            onchange={(next) => (modifier.attrId = next)}
          />
          {@render issue(pathOf(`${key}.attrId`))}
        </label>
        <label class="block space-y-1">
          {@render labelled(
            "skillMonitor.customPanel.counterEditor.slot.modifierMax",
          )}
          <CounterNumberInput
            value={modifier.maxReductionBasisPoints}
            scale={100}
            step={0.01}
            min={0.01}
            invalid={errorFor(pathOf(`${key}.maxReductionBasisPoints`)) !==
              undefined}
            path={pathOf(`${key}.maxReductionBasisPoints`)}
            onchange={(next) => (modifier.maxReductionBasisPoints = next)}
          />
          {@render issue(pathOf(`${key}.maxReductionBasisPoints`))}
        </label>
        <label class="block space-y-1">
          {@render labelled(
            "skillMonitor.customPanel.counterEditor.slot.modifierPerUnit",
          )}
          <CounterNumberInput
            value={modifier.basisPointsPerUnit}
            min={1}
            invalid={errorFor(pathOf(`${key}.basisPointsPerUnit`)) !==
              undefined}
            path={pathOf(`${key}.basisPointsPerUnit`)}
            onchange={(next) => (modifier.basisPointsPerUnit = next)}
          />
          {@render issue(pathOf(`${key}.basisPointsPerUnit`))}
        </label>
      </div>
    {/if}
  </div>
{/snippet}

<div class="border-border/60 bg-muted/20 space-y-4 rounded-lg border p-3">
  <div class="flex items-center justify-between gap-2">
    <div class="text-foreground text-sm font-medium">
      {t("skillMonitor.customPanel.counterEditor.slotTitle", {
        id: slot.slotId,
      })}
    </div>
    <button
      type="button"
      class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-9 w-9 items-center justify-center rounded transition-colors"
      aria-label={t("skillMonitor.customPanel.counterEditor.removeSlot")}
      title={t("skillMonitor.customPanel.counterEditor.removeSlot")}
      onclick={onremove}
    >
      <Trash2Icon class="h-4 w-4" />
    </button>
  </div>

  <!-- Target -->
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label class="block space-y-1">
      {@render labelled(
        "skillMonitor.customPanel.counterEditor.slot.threshold",
      )}
      <CounterNumberInput
        value={slot.threshold}
        min={1}
        placeholder={t("skillMonitor.customPanel.counterEditor.unset")}
        invalid={errorFor(pathOf("threshold")) !== undefined}
        path={pathOf("threshold")}
        onchange={(next) => (slot.threshold = next)}
      />
      {@render issue(pathOf("threshold"))}
    </label>
    {#if hasThreshold}
      <label class="block space-y-1">
        {@render labelled(
          "skillMonitor.customPanel.counterEditor.slot.displayMode",
        )}
        <select
          class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
          value={slot.displayMode}
          onchange={(event) => {
            const mode = COUNTER_DISPLAY_MODES.find(
              (item) =>
                item === (event.currentTarget as HTMLSelectElement).value,
            );
            if (mode) slot.displayMode = mode;
          }}
        >
          {#each COUNTER_DISPLAY_MODES as mode (mode)}
            <option value={mode}>
              {t(`skillMonitor.customPanel.counterEditor.display.${mode}`)}
            </option>
          {/each}
        </select>
      </label>
      <label
        class="text-foreground flex items-center gap-1.5 self-end pb-2 text-xs"
      >
        <input
          type="checkbox"
          checked={slot.wrapAtThreshold}
          onchange={(event) =>
            (slot.wrapAtThreshold = (
              event.currentTarget as HTMLInputElement
            ).checked)}
        />
        {t("skillMonitor.customPanel.counterEditor.slot.wrapAtThreshold")}
      </label>
    {/if}
  </div>

  <!-- Linked buff -->
  <div class="space-y-3">
    <div class="space-y-1">
      {@render labelled(
        "skillMonitor.customPanel.counterEditor.slot.resetBuff",
      )}
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-56 flex-1">
          <CounterIdPicker
            domain="buff"
            ids={slot.resetBuffId === null ? [] : [slot.resetBuffId]}
            multiple={false}
            invalid={errorFor(pathOf("resetBuffId")) !== undefined}
            path={pathOf("resetBuffId")}
            onchange={(ids) => (slot.resetBuffId = ids[0] ?? null)}
          />
        </div>
        {#if hasBuff}
          <div
            class="flex items-center gap-3 pt-2 text-xs"
            role="radiogroup"
            aria-label={t(
              "skillMonitor.customPanel.counterEditor.slot.resetBuffTarget",
            )}
          >
            {#each RESET_BUFF_TARGETS as target (target)}
              <label class="text-foreground flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`counter-slot-${slot.key}-target`}
                  checked={slot.resetBuffTarget === target}
                  onchange={() => (slot.resetBuffTarget = target)}
                />
                {t(`skillMonitor.customPanel.counterEditor.target.${target}`)}
              </label>
            {/each}
          </div>
        {/if}
      </div>
      {@render issue(pathOf("resetBuffId"))}
    </div>
    {#if hasBuff}
      <div class="grid gap-3 sm:grid-cols-3">
        {@render actionSelect(
          "skillMonitor.customPanel.counterEditor.slot.onBuffAdd",
          slot.onBuffAdd,
          (action) => (slot.onBuffAdd = action),
        )}
        {@render actionSelect(
          "skillMonitor.customPanel.counterEditor.slot.onBuffChange",
          slot.onBuffChange,
          (action) => (slot.onBuffChange = action),
        )}
        {@render actionSelect(
          "skillMonitor.customPanel.counterEditor.slot.onBuffRemove",
          slot.onBuffRemove,
          (action) => (slot.onBuffRemove = action),
        )}
      </div>
    {/if}
  </div>

  <!-- Cooldown -->
  <div class="space-y-1">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {@render secondsInput(
        "skillMonitor.customPanel.counterEditor.slot.cooldown",
        slot.freezeDurationMs,
        pathOf("freezeDurationMs"),
        (ms) => (slot.freezeDurationMs = ms),
      )}
      {#if hasCooldown}
        {@render actionSelect(
          "skillMonitor.customPanel.counterEditor.slot.onFreezeExpire",
          slot.onFreezeExpire,
          (action) => (slot.onFreezeExpire = action),
        )}
      {/if}
    </div>
    <p class="text-muted-foreground text-xs">
      {t("skillMonitor.customPanel.counterEditor.slot.cooldownHint")}
    </p>
    {#if warningFor(pathOf("freezeDurationMs"))}
      <p class="text-xs text-amber-500">
        {t("skillMonitor.customPanel.counterEditor.issue.freezeNeverStarts")}
      </p>
    {/if}
  </div>

  <!-- Advanced -->
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
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#if hasBuff}
          <label class="block space-y-1">
            {@render labelled(
              "skillMonitor.customPanel.counterEditor.slot.resetSourceConfigId",
            )}
            <CounterNumberInput
              value={slot.resetSourceConfigId}
              min={1}
              placeholder={t("skillMonitor.customPanel.counterEditor.unset")}
              invalid={errorFor(pathOf("resetSourceConfigId")) !== undefined}
              path={pathOf("resetSourceConfigId")}
              onchange={(next) => (slot.resetSourceConfigId = next)}
            />
            {@render issue(pathOf("resetSourceConfigId"))}
          </label>
        {/if}

        {@render secondsInput(
          "skillMonitor.customPanel.counterEditor.slot.dungeonStartFreeze",
          slot.dungeonStartFreezeMs,
          pathOf("dungeonStartFreezeMs"),
          (ms) => (slot.dungeonStartFreezeMs = ms),
        )}

        <div class="space-y-2 sm:col-span-2 lg:col-span-3">
          <label class="text-foreground flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={slot.altFreeze !== null}
              onchange={(event) =>
                (slot.altFreeze = (event.currentTarget as HTMLInputElement)
                  .checked
                  ? { conditionBuffId: null, freezeDurationMs: null }
                  : null)}
            />
            {t("skillMonitor.customPanel.counterEditor.slot.altFreeze")}
          </label>
          {#if slot.altFreeze}
            {@const altFreeze = slot.altFreeze}
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1">
                {@render labelled(
                  "skillMonitor.customPanel.counterEditor.slot.altFreezeBuff",
                )}
                <CounterIdPicker
                  domain="buff"
                  ids={altFreeze.conditionBuffId === null
                    ? []
                    : [altFreeze.conditionBuffId]}
                  multiple={false}
                  invalid={errorFor(pathOf("altFreeze.conditionBuffId")) !==
                    undefined}
                  path={pathOf("altFreeze.conditionBuffId")}
                  onchange={(ids) =>
                    (altFreeze.conditionBuffId = ids[0] ?? null)}
                />
                {@render issue(pathOf("altFreeze.conditionBuffId"))}
              </div>
              {@render secondsInput(
                "skillMonitor.customPanel.counterEditor.slot.cooldown",
                altFreeze.freezeDurationMs,
                pathOf("altFreeze.freezeDurationMs"),
                (ms) => (altFreeze.freezeDurationMs = ms),
              )}
            </div>
          {/if}
        </div>

        <div class="space-y-2 sm:col-span-2 lg:col-span-3">
          {@render labelled(
            "skillMonitor.customPanel.counterEditor.slot.resetSkillKeys",
          )}
          <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
            <CounterIdPicker
              domain="damage"
              ids={slot.resetSkillKeys}
              multiple
              invalid={errorFor(pathOf("resetSkillKeys")) !== undefined}
              path={pathOf("resetSkillKeys")}
              onchange={(ids) => (slot.resetSkillKeys = ids)}
            />
            {#if slot.resetSkillKeys.length > 0}
              {@render actionSelect(
                "skillMonitor.customPanel.counterEditor.slot.action",
                slot.onResetSkill,
                (action) => (slot.onResetSkill = action),
              )}
            {/if}
          </div>
          {@render issue(pathOf("resetSkillKeys"))}
        </div>

        <div class="space-y-2 sm:col-span-2 lg:col-span-3">
          {@render labelled(
            "skillMonitor.customPanel.counterEditor.slot.resetPassiveSkillIds",
          )}
          <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
            <CounterIdPicker
              domain="skill"
              ids={slot.resetPassiveSkillIds}
              multiple
              invalid={errorFor(pathOf("resetPassiveSkillIds")) !== undefined}
              path={pathOf("resetPassiveSkillIds")}
              onchange={(ids) => (slot.resetPassiveSkillIds = ids)}
            />
            {#if slot.resetPassiveSkillIds.length > 0}
              {@render actionSelect(
                "skillMonitor.customPanel.counterEditor.slot.action",
                slot.onPassiveSkill,
                (action) => (slot.onPassiveSkill = action),
              )}
            {/if}
          </div>
          {@render issue(pathOf("resetPassiveSkillIds"))}
        </div>

        {@render modifierFields(
          "thresholdModifier",
          "skillMonitor.customPanel.counterEditor.slot.thresholdModifier",
        )}
        {@render modifierFields(
          "freezeDurationModifier",
          "skillMonitor.customPanel.counterEditor.slot.freezeDurationModifier",
        )}
      </div>
    {/if}
  </div>
</div>
