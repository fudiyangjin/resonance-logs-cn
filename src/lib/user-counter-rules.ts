/**
 * @file User-defined counter rules: the form model behind the counter editor,
 * the strict schema every stored rule must pass before it reaches the
 * runtime, and the cleanup of rules saved in the retired template-picker
 * shape.
 *
 * A rule is the same `sources` + `effectSlots` pair as a preset in
 * `config/counter_rules.json`. The editor works on a {@link RuleDraft} whose
 * empty inputs are `null`; {@link fromDraft} turns it back into that shape.
 */
import * as v from "valibot";
import type {
  CounterAction,
  CounterSource,
  ResetBuffTarget,
} from "$lib/bindings";
import type {
  InlineBuffEntry,
  SkillMonitorProfile,
  UserCounterRule,
} from "$lib/settings-store";
import type {
  CounterEffectSlotPreset,
  CounterSlotDisplayMode,
} from "$lib/skill-mappings";

const I32_MAX = 2_147_483_647;
const U32_MAX = 4_294_967_295;
/** Longest timer the form accepts (one day); the engine itself takes u64. */
export const MAX_COUNTER_DURATION_MS = 86_400_000;
export const MAX_COUNTER_METERS = 100_000;
const FULL_REDUCTION_BASIS_POINTS = 10_000;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type CounterSourceKind = CounterSource extends infer S
  ? S extends unknown
    ? keyof S & string
    : never
  : never;

export const COUNTER_ACTIONS = [
  "noOp",
  "reset",
  "freeze",
  "startCount",
  "resetAndStartCount",
  "resetAndFreeze",
  "resetAndFreezeKeepCounting",
] as const satisfies readonly CounterAction[];

/** Actions that start the slot's cooldown when it has one. */
const FREEZING_ACTIONS: ReadonlySet<CounterAction> = new Set([
  "freeze",
  "resetAndFreeze",
  "resetAndFreezeKeepCounting",
]);

export const COUNTER_DISPLAY_MODES = [
  "raw",
  "rawWithThreshold",
  "remainingToThreshold",
  "percentOfThreshold",
] as const satisfies readonly CounterSlotDisplayMode[];

export const RESET_BUFF_TARGETS = [
  "selfPlayer",
  "anyTeam",
] as const satisfies readonly ResetBuffTarget[];

/** Hit type bits, see `damage_type_flag` in the Rust combat projection. */
export const DAMAGE_TYPE_FLAGS = [
  { bit: 1, key: "crit" },
  { bit: 2, key: "block" },
  { bit: 4, key: "lucky" },
  { bit: 8, key: "luckyTaken" },
] as const;
const ALL_DAMAGE_TYPE_FLAGS = 15;

/** Which game table an id field points into; drives the picker. */
export type CounterIdDomain = "buff" | "damage" | "skill" | "resource" | "attr";

export type SourceFieldControl =
  | { type: "ids"; domain: CounterIdDomain }
  | { type: "id"; domain: CounterIdDomain | null }
  | { type: "count" }
  | { type: "milliseconds" }
  | { type: "meters" }
  | { type: "typeFlags" }
  | { type: "attrCondition" };

export type SourceFieldLabel =
  | "skills"
  | "skill"
  | "damages"
  | "damagesOptional"
  | "buff"
  | "resource"
  | "increment"
  | "hitsRequired"
  | "requiredTypeFlags"
  | "sourceConfigId"
  | "layersRequired"
  | "unitsRequired"
  | "tickInterval"
  | "attrCondition"
  | "metersRequired"
  | "positionAttr";

export type SourceFieldSpec = {
  /** Key inside the source's parameter object. */
  key: string;
  /** Message key suffix under `skillMonitor.customPanel.counterEditor.field`. */
  label: SourceFieldLabel;
  control: SourceFieldControl;
  required: boolean;
  advanced?: boolean;
};

export type SourceKindGroup = "skill" | "damage" | "buff" | "resource";

type SourceKindSpec = {
  group: SourceKindGroup;
  fields: SourceFieldSpec[];
};

const INCREMENT: SourceFieldSpec = {
  key: "increment",
  label: "increment",
  control: { type: "count" },
  required: true,
};
const HITS_REQUIRED: SourceFieldSpec = {
  key: "hitsRequired",
  label: "hitsRequired",
  control: { type: "count" },
  required: false,
  advanced: true,
};
const TYPE_FLAGS: SourceFieldSpec = {
  key: "requiredTypeFlags",
  label: "requiredTypeFlags",
  control: { type: "typeFlags" },
  required: false,
  advanced: true,
};
const SKILL_IDS: SourceFieldSpec = {
  key: "skillBaseIds",
  label: "skills",
  control: { type: "ids", domain: "skill" },
  required: true,
};
const DAMAGE_IDS: SourceFieldSpec = {
  key: "skillKeys",
  label: "damages",
  control: { type: "ids", domain: "damage" },
  required: true,
};
const BUFF_ID: SourceFieldSpec = {
  key: "buffId",
  label: "buff",
  control: { type: "id", domain: "buff" },
  required: true,
};
const TICK_INTERVAL: SourceFieldSpec = {
  key: "tickIntervalMs",
  label: "tickInterval",
  control: { type: "milliseconds" },
  required: true,
};

const SOURCE_KIND_SPECS: Record<CounterSourceKind, SourceKindSpec> = {
  skillCast: { group: "skill", fields: [SKILL_IDS, INCREMENT] },
  skillCastComplete: { group: "skill", fields: [SKILL_IDS, INCREMENT] },
  skillDurationTick: {
    group: "skill",
    fields: [
      {
        key: "skillBaseId",
        label: "skill",
        control: { type: "id", domain: "skill" },
        required: true,
      },
      TICK_INTERVAL,
      INCREMENT,
    ],
  },
  damageBySkillKey: {
    group: "damage",
    fields: [DAMAGE_IDS, INCREMENT, HITS_REQUIRED, TYPE_FLAGS],
  },
  damageBySkillKeyOnce: {
    group: "damage",
    fields: [DAMAGE_IDS, INCREMENT, TYPE_FLAGS],
  },
  damageBySkillKeySelfTarget: {
    group: "damage",
    fields: [DAMAGE_IDS, INCREMENT, HITS_REQUIRED, TYPE_FLAGS],
  },
  anyDamage: {
    group: "damage",
    fields: [INCREMENT, HITS_REQUIRED, TYPE_FLAGS],
  },
  damageTaken: {
    group: "damage",
    fields: [
      { ...DAMAGE_IDS, label: "damagesOptional", required: false },
      INCREMENT,
      HITS_REQUIRED,
      TYPE_FLAGS,
    ],
  },
  buffAdded: {
    group: "buff",
    fields: [
      BUFF_ID,
      INCREMENT,
      {
        key: "sourceConfigId",
        label: "sourceConfigId",
        control: { type: "id", domain: null },
        required: false,
        advanced: true,
      },
    ],
  },
  buffLayerSpent: {
    group: "buff",
    fields: [
      BUFF_ID,
      {
        key: "unitsRequired",
        label: "layersRequired",
        control: { type: "count" },
        required: true,
      },
      INCREMENT,
    ],
  },
  buffDurationTick: {
    group: "buff",
    fields: [
      BUFF_ID,
      TICK_INTERVAL,
      INCREMENT,
      {
        key: "attrCondition",
        label: "attrCondition",
        control: { type: "attrCondition" },
        required: false,
        advanced: true,
      },
    ],
  },
  movementDistance: {
    group: "buff",
    fields: [
      BUFF_ID,
      {
        key: "metersRequired",
        label: "metersRequired",
        control: { type: "meters" },
        required: true,
      },
      INCREMENT,
      {
        key: "attrId",
        label: "positionAttr",
        control: { type: "id", domain: "attr" },
        required: true,
        advanced: true,
      },
    ],
  },
  fightResourceSpent: {
    group: "resource",
    fields: [
      {
        key: "resourceId",
        label: "resource",
        control: { type: "id", domain: "resource" },
        required: true,
      },
      {
        key: "unitsRequired",
        label: "unitsRequired",
        control: { type: "count" },
        required: true,
      },
      INCREMENT,
    ],
  },
};

/** Kinds in picker order, grouped. */
export const SOURCE_KIND_GROUPS: ReadonlyArray<{
  group: SourceKindGroup;
  kinds: CounterSourceKind[];
}> = [
  {
    group: "skill",
    kinds: ["skillCast", "skillCastComplete", "skillDurationTick"],
  },
  {
    group: "damage",
    kinds: [
      "damageBySkillKey",
      "damageBySkillKeyOnce",
      "damageBySkillKeySelfTarget",
      "anyDamage",
      "damageTaken",
    ],
  },
  {
    group: "buff",
    kinds: [
      "buffAdded",
      "buffLayerSpent",
      "buffDurationTick",
      "movementDistance",
    ],
  },
  { group: "resource", kinds: ["fightResourceSpent"] },
];

export const COUNTER_SOURCE_KINDS = SOURCE_KIND_GROUPS.flatMap(
  (entry) => entry.kinds,
);

export function getSourceFieldSpecs(
  kind: CounterSourceKind,
): readonly SourceFieldSpec[] {
  return SOURCE_KIND_SPECS[kind].fields;
}

function isSourceKind(value: string): value is CounterSourceKind {
  return Object.hasOwn(SOURCE_KIND_SPECS, value);
}

/** Position attribute the movement source reads by default. */
const DEFAULT_POSITION_ATTR_ID = 52;

// ---------------------------------------------------------------------------
// Persisted shape: strict schema
// ---------------------------------------------------------------------------

const idSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(I32_MAX),
);
const damageIdSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const countSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(U32_MAX),
);
const durationSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(MAX_COUNTER_DURATION_MS),
);
const tickIntervalSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(MAX_COUNTER_DURATION_MS),
);
const metersSchema = v.pipe(
  v.number(),
  v.gtValue(0),
  v.maxValue(MAX_COUNTER_METERS),
);
const typeFlagsSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(ALL_DAMAGE_TYPE_FLAGS),
);
const i32Schema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(-I32_MAX - 1),
  v.maxValue(I32_MAX),
);
const actionSchema = v.picklist(COUNTER_ACTIONS);
const idListSchema = v.pipe(v.array(idSchema), v.minLength(1));
const damageIdListSchema = v.pipe(v.array(damageIdSchema), v.minLength(1));

const damageFilters = {
  hitsRequired: v.optional(v.nullable(countSchema)),
  requiredTypeFlags: v.optional(v.nullable(typeFlagsSchema)),
};

const SOURCE_PARAM_SCHEMAS = {
  skillCast: v.strictObject({
    skillBaseIds: idListSchema,
    increment: countSchema,
  }),
  skillCastComplete: v.strictObject({
    skillBaseIds: idListSchema,
    increment: countSchema,
  }),
  skillDurationTick: v.strictObject({
    skillBaseId: idSchema,
    tickIntervalMs: tickIntervalSchema,
    increment: countSchema,
  }),
  damageBySkillKey: v.strictObject({
    skillKeys: damageIdListSchema,
    increment: countSchema,
    ...damageFilters,
  }),
  damageBySkillKeyOnce: v.strictObject({
    skillKeys: damageIdListSchema,
    increment: countSchema,
    requiredTypeFlags: damageFilters.requiredTypeFlags,
  }),
  damageBySkillKeySelfTarget: v.strictObject({
    skillKeys: damageIdListSchema,
    increment: countSchema,
    ...damageFilters,
  }),
  anyDamage: v.strictObject({ increment: countSchema, ...damageFilters }),
  damageTaken: v.strictObject({
    skillKeys: v.optional(v.nullable(damageIdListSchema)),
    increment: countSchema,
    ...damageFilters,
  }),
  buffAdded: v.strictObject({
    buffId: idSchema,
    sourceConfigId: v.optional(v.nullable(idSchema)),
    increment: countSchema,
  }),
  buffLayerSpent: v.strictObject({
    buffId: idSchema,
    unitsRequired: countSchema,
    increment: countSchema,
  }),
  buffDurationTick: v.strictObject({
    buffId: idSchema,
    tickIntervalMs: tickIntervalSchema,
    increment: countSchema,
    attrCondition: v.optional(
      v.nullable(
        v.strictObject({ attrId: idSchema, requiredValue: i32Schema }),
      ),
    ),
  }),
  movementDistance: v.strictObject({
    buffId: idSchema,
    attrId: idSchema,
    metersRequired: metersSchema,
    increment: countSchema,
  }),
  fightResourceSpent: v.strictObject({
    resourceId: idSchema,
    unitsRequired: countSchema,
    increment: countSchema,
  }),
} satisfies Record<CounterSourceKind, v.GenericSchema>;

/** A source object: exactly one known kind key with valid parameters. */
export const counterSourceSchema = v.custom<CounterSource>((input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const keys = Object.keys(input);
  const kind = keys[0];
  if (keys.length !== 1 || kind === undefined || !isSourceKind(kind)) {
    return false;
  }
  return v.is(
    SOURCE_PARAM_SCHEMAS[kind],
    (input as Record<string, unknown>)[kind],
  );
}, "invalid counter source");

const attrModifierSchema = v.strictObject({
  attrId: idSchema,
  basisPointsPerUnit: v.optional(countSchema),
  maxReductionBasisPoints: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(FULL_REDUCTION_BASIS_POINTS),
  ),
});

export const counterSlotSchema = v.strictObject({
  slotId: idSchema,
  threshold: v.nullable(countSchema),
  resetBuffId: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(I32_MAX),
  ),
  resetSourceConfigId: v.optional(v.nullable(idSchema)),
  resetBuffTarget: v.optional(v.picklist(RESET_BUFF_TARGETS)),
  onBuffAdd: v.optional(actionSchema),
  onBuffChange: v.optional(actionSchema),
  onBuffRemove: v.optional(actionSchema),
  freezeDurationMs: v.optional(v.nullable(durationSchema)),
  onFreezeExpire: v.optional(actionSchema),
  altFreeze: v.optional(
    v.nullable(
      v.strictObject({
        conditionBuffId: idSchema,
        freezeDurationMs: durationSchema,
      }),
    ),
  ),
  thresholdModifier: v.optional(v.nullable(attrModifierSchema)),
  freezeDurationModifier: v.optional(v.nullable(attrModifierSchema)),
  resetSkillKeys: v.optional(v.nullable(v.array(damageIdSchema))),
  onResetSkill: v.optional(actionSchema),
  wrapAtThreshold: v.optional(v.boolean()),
  resetPassiveSkillIds: v.optional(v.nullable(v.array(idSchema))),
  onPassiveSkill: v.optional(actionSchema),
  dungeonStartFreezeMs: v.optional(v.nullable(durationSchema)),
  displayMode: v.optional(v.picklist(COUNTER_DISPLAY_MODES)),
});

function hasUniqueSlotIds(slots: ReadonlyArray<{ slotId: number }>): boolean {
  return new Set(slots.map((slot) => slot.slotId)).size === slots.length;
}

/** Field schemas of a rule definition, for embedding in object schemas. */
export const counterRuleDefinitionEntries = {
  sources: v.array(counterSourceSchema),
  effectSlots: v.pipe(
    v.array(counterSlotSchema),
    v.minLength(1),
    v.check((slots) => hasUniqueSlotIds(slots), "duplicate counter slot id"),
  ),
};

const counterRuleDefinitionSchema = v.object(counterRuleDefinitionEntries);

export type CounterRuleDefinition = {
  sources: CounterSource[];
  effectSlots: CounterEffectSlotPreset[];
};

/** Whether `rule` can be sent to the runtime as is. A rule that fails would
 * make the whole monitor snapshot fail to deserialize, so callers skip it. */
export function isValidCounterRuleDefinition(
  rule: unknown,
): rule is CounterRuleDefinition {
  return v.is(counterRuleDefinitionSchema, rule);
}

// ---------------------------------------------------------------------------
// Retired template-picker rules
// ---------------------------------------------------------------------------

/** Rules saved before the form editor referenced source/slot templates by
 * id (`sourceRefs`/`slotRefs`) instead of carrying a `sources` array. */
export function isCurrentUserCounterRule(rule: unknown): boolean {
  return (
    !!rule &&
    typeof rule === "object" &&
    Array.isArray((rule as { sources?: unknown }).sources) &&
    Array.isArray((rule as { effectSlots?: unknown }).effectSlots)
  );
}

type CounterEntryHolder = Pick<
  SkillMonitorProfile,
  "userCounterRules" | "customPanelGroups" | "inlineBuffEntries"
>;

function withoutCounterEntries<P extends CounterEntryHolder>(
  profile: P,
  drop: (entry: InlineBuffEntry) => boolean,
): P {
  const keep = (entry: InlineBuffEntry) =>
    !(entry.sourceType === "counter" && drop(entry));
  const groups = profile.customPanelGroups;
  const inline = profile.inlineBuffEntries;
  const nextGroups = Array.isArray(groups)
    ? groups.map((group) =>
        Array.isArray(group.entries) && !group.entries.every(keep)
          ? { ...group, entries: group.entries.filter(keep) }
          : group,
      )
    : groups;
  const nextInline =
    Array.isArray(inline) && !inline.every(keep) ? inline.filter(keep) : inline;
  const groupsChanged =
    Array.isArray(groups) &&
    nextGroups !== undefined &&
    nextGroups.some((group, index) => group !== groups[index]);
  if (!groupsChanged && nextInline === inline) return profile;
  return {
    ...profile,
    ...(groupsChanged ? { customPanelGroups: nextGroups } : {}),
    ...(nextInline !== inline ? { inlineBuffEntries: nextInline } : {}),
  };
}

/**
 * `profile` without retired template-picker rules and the panel entries that
 * show them (their voice bindings live inside the rule and go with it); the
 * same object when there is nothing to drop.
 */
export function dropLegacyUserCounterRules<P extends CounterEntryHolder>(
  profile: P,
): P {
  const rules = profile.userCounterRules as unknown[] | undefined;
  if (!Array.isArray(rules) || rules.every(isCurrentUserCounterRule)) {
    return profile;
  }
  const droppedIds = new Set<number>();
  rules.forEach((rule, index) => {
    if (isCurrentUserCounterRule(rule)) return;
    // Same fallback id the old `ensureUserCounterRules` handed out.
    const ruleId = (rule as { ruleId?: unknown } | null)?.ruleId;
    droppedIds.add(
      typeof ruleId === "number" && Number.isInteger(ruleId)
        ? ruleId
        : 10001 + index,
    );
  });
  return withoutCounterEntries(
    {
      ...profile,
      userCounterRules: rules.filter(
        isCurrentUserCounterRule,
      ) as UserCounterRule[],
    },
    (entry) => droppedIds.has(entry.sourceId),
  );
}

/** `profile` without panel entries of `ruleId` whose slot is gone. */
export function pruneCounterEntriesForSlots<P extends CounterEntryHolder>(
  profile: P,
  ruleId: number,
  keptSlotIds: ReadonlySet<number>,
): P {
  return withoutCounterEntries(
    profile,
    (entry) =>
      entry.sourceId === ruleId &&
      entry.counterSlotId !== undefined &&
      !keptSlotIds.has(entry.counterSlotId),
  );
}

// ---------------------------------------------------------------------------
// Form draft
// ---------------------------------------------------------------------------

export type SourceDraft = {
  /** Keyed-each identity; never persisted. */
  key: string;
  kind: CounterSourceKind;
  /** The source's parameters keyed like the persisted object; empty inputs
   * are `null`, id lists are arrays, `requiredTypeFlags` is `0` for none. */
  params: Record<string, unknown>;
};

export type AttrModifierDraft = {
  attrId: number | null;
  basisPointsPerUnit: number | null;
  maxReductionBasisPoints: number | null;
};

export type SlotDraft = {
  key: string;
  slotId: number;
  threshold: number | null;
  displayMode: CounterSlotDisplayMode;
  wrapAtThreshold: boolean;
  resetBuffId: number | null;
  resetSourceConfigId: number | null;
  resetBuffTarget: ResetBuffTarget;
  onBuffAdd: CounterAction;
  onBuffChange: CounterAction;
  onBuffRemove: CounterAction;
  freezeDurationMs: number | null;
  onFreezeExpire: CounterAction;
  altFreeze: {
    conditionBuffId: number | null;
    freezeDurationMs: number | null;
  } | null;
  dungeonStartFreezeMs: number | null;
  thresholdModifier: AttrModifierDraft | null;
  freezeDurationModifier: AttrModifierDraft | null;
  resetSkillKeys: number[];
  onResetSkill: CounterAction;
  resetPassiveSkillIds: number[];
  onPassiveSkill: CounterAction;
};

export type RuleDraft = {
  /** `null` while creating. */
  ruleId: number | null;
  name: string;
  sources: SourceDraft[];
  slots: SlotDraft[];
};

let draftKeySequence = 0;

function nextDraftKey(prefix: string): string {
  draftKeySequence += 1;
  return `${prefix}${draftKeySequence}`;
}

function defaultFieldValue(field: SourceFieldSpec): unknown {
  switch (field.control.type) {
    case "ids":
      return [];
    case "count":
      return field.required ? 1 : null;
    case "milliseconds":
      return 1000;
    case "meters":
      return 1;
    case "typeFlags":
      return 0;
    case "id":
      return field.key === "attrId" ? DEFAULT_POSITION_ATTR_ID : null;
    case "attrCondition":
      return null;
  }
}

function fieldDomain(field: SourceFieldSpec): CounterIdDomain | null {
  return field.control.type === "ids" || field.control.type === "id"
    ? field.control.domain
    : null;
}

/** Ids of `params` in `domain`, whether held in a list or a single field. */
function idsInDomain(
  kind: CounterSourceKind,
  params: Record<string, unknown>,
  domain: CounterIdDomain,
): number[] {
  return getSourceFieldSpecs(kind).flatMap((field) => {
    if (fieldDomain(field) !== domain) return [];
    const value = params[field.key];
    if (Array.isArray(value)) return value as number[];
    return typeof value === "number" ? [value] : [];
  });
}

/**
 * A fresh source of `kind`. When switching from `previous`, the increment
 * and the ids that point into the same table carry over.
 */
export function createSourceDraft(
  kind: CounterSourceKind,
  previous?: SourceDraft,
): SourceDraft {
  const params: Record<string, unknown> = {};
  for (const field of getSourceFieldSpecs(kind)) {
    params[field.key] = defaultFieldValue(field);
    const domain = fieldDomain(field);
    if (!previous || !domain) continue;
    const carried = idsInDomain(previous.kind, previous.params, domain);
    if (carried.length === 0) continue;
    params[field.key] =
      field.control.type === "ids" ? [...carried] : (carried[0] ?? null);
  }
  const increment = previous?.params["increment"];
  if (typeof increment === "number") params["increment"] = increment;
  return { key: previous?.key ?? nextDraftKey("source"), kind, params };
}

export function createSlotDraft(slotId: number): SlotDraft {
  return {
    key: nextDraftKey("slot"),
    slotId,
    threshold: null,
    displayMode: "raw",
    wrapAtThreshold: false,
    resetBuffId: null,
    resetSourceConfigId: null,
    resetBuffTarget: "selfPlayer",
    onBuffAdd: "noOp",
    onBuffChange: "noOp",
    onBuffRemove: "noOp",
    freezeDurationMs: null,
    // The engine's default when the field is absent.
    onFreezeExpire: "resetAndStartCount",
    altFreeze: null,
    dungeonStartFreezeMs: null,
    thresholdModifier: null,
    freezeDurationModifier: null,
    resetSkillKeys: [],
    onResetSkill: "noOp",
    resetPassiveSkillIds: [],
    onPassiveSkill: "noOp",
  };
}

/** Next slot id: one past the highest, so ids are never reused while a
 * draft is open (panel entries and voice bindings key on them). */
export function nextSlotId(slots: ReadonlyArray<{ slotId: number }>): number {
  return slots.reduce((highest, slot) => Math.max(highest, slot.slotId), 0) + 1;
}

export function createRuleDraft(): RuleDraft {
  return {
    ruleId: null,
    name: "",
    sources: [],
    slots: [createSlotDraft(1)],
  };
}

function sourceKindOf(source: CounterSource): CounterSourceKind | null {
  const kind = Object.keys(source)[0];
  return kind !== undefined && isSourceKind(kind) ? kind : null;
}

function sourceToDraft(source: CounterSource): SourceDraft | null {
  const kind = sourceKindOf(source);
  if (!kind) return null;
  const stored =
    (source as Record<string, Record<string, unknown>>)[kind] ?? {};
  const params: Record<string, unknown> = {};
  for (const field of getSourceFieldSpecs(kind)) {
    const value = stored[field.key];
    if (field.control.type === "ids") {
      params[field.key] = Array.isArray(value) ? [...value] : [];
    } else if (field.control.type === "attrCondition") {
      params[field.key] =
        value && typeof value === "object" ? { ...value } : null;
    } else if (field.control.type === "typeFlags") {
      params[field.key] = typeof value === "number" ? value : 0;
    } else {
      params[field.key] = typeof value === "number" ? value : null;
    }
  }
  return { key: nextDraftKey("source"), kind, params };
}

function modifierToDraft(
  modifier: CounterEffectSlotPreset["thresholdModifier"],
): AttrModifierDraft | null {
  return modifier
    ? {
        attrId: modifier.attrId,
        basisPointsPerUnit: modifier.basisPointsPerUnit ?? 1,
        maxReductionBasisPoints: modifier.maxReductionBasisPoints,
      }
    : null;
}

function slotToDraft(slot: CounterEffectSlotPreset): SlotDraft {
  const defaults = createSlotDraft(slot.slotId);
  return {
    ...defaults,
    threshold: slot.threshold,
    displayMode: slot.displayMode ?? "raw",
    wrapAtThreshold: slot.wrapAtThreshold === true,
    resetBuffId: slot.resetBuffId > 0 ? slot.resetBuffId : null,
    resetSourceConfigId: slot.resetSourceConfigId ?? null,
    resetBuffTarget: slot.resetBuffTarget ?? "selfPlayer",
    onBuffAdd: slot.onBuffAdd ?? "noOp",
    onBuffChange: slot.onBuffChange ?? "noOp",
    onBuffRemove: slot.onBuffRemove ?? "noOp",
    freezeDurationMs: slot.freezeDurationMs ?? null,
    onFreezeExpire: slot.onFreezeExpire ?? defaults.onFreezeExpire,
    altFreeze: slot.altFreeze ? { ...slot.altFreeze } : null,
    dungeonStartFreezeMs: slot.dungeonStartFreezeMs ?? null,
    thresholdModifier: modifierToDraft(slot.thresholdModifier),
    freezeDurationModifier: modifierToDraft(slot.freezeDurationModifier),
    resetSkillKeys: [...(slot.resetSkillKeys ?? [])],
    onResetSkill: slot.onResetSkill ?? "noOp",
    resetPassiveSkillIds: [...(slot.resetPassiveSkillIds ?? [])],
    onPassiveSkill: slot.onPassiveSkill ?? "noOp",
  };
}

/** The editor's starting point for an existing rule or a preset copy. */
export function toDraft(
  rule: { name: string } & CounterRuleDefinition,
  ruleId: number | null,
): RuleDraft {
  return {
    ruleId,
    name: rule.name,
    sources: rule.sources.flatMap((source) => sourceToDraft(source) ?? []),
    slots: rule.effectSlots.map(slotToDraft),
  };
}

function draftToSource(draft: SourceDraft): CounterSource {
  const params: Record<string, unknown> = {};
  for (const field of getSourceFieldSpecs(draft.kind)) {
    const value = draft.params[field.key];
    switch (field.control.type) {
      case "ids": {
        const ids = Array.isArray(value) ? [...(value as number[])] : [];
        if (ids.length > 0 || field.required) params[field.key] = ids;
        break;
      }
      case "typeFlags":
        if (typeof value === "number" && value > 0) params[field.key] = value;
        break;
      case "count":
        // A hit requirement of one is the same as none.
        if (
          typeof value === "number" &&
          !(field.key === "hitsRequired" && value <= 1)
        ) {
          params[field.key] = value;
        }
        break;
      case "attrCondition":
        if (value && typeof value === "object") {
          params[field.key] = { ...(value as object) };
        }
        break;
      default:
        if (typeof value === "number") params[field.key] = value;
    }
  }
  return { [draft.kind]: params } as CounterSource;
}

function draftToModifier(
  modifier: AttrModifierDraft | null,
): CounterEffectSlotPreset["thresholdModifier"] | undefined {
  if (!modifier) return undefined;
  return {
    attrId: modifier.attrId ?? 0,
    basisPointsPerUnit: modifier.basisPointsPerUnit ?? 1,
    maxReductionBasisPoints: modifier.maxReductionBasisPoints ?? 0,
  };
}

function draftToSlot(draft: SlotDraft): CounterEffectSlotPreset {
  const hasBuff = draft.resetBuffId !== null;
  const hasThreshold = draft.threshold !== null;
  const hasFreeze =
    draft.freezeDurationMs !== null ||
    draft.altFreeze !== null ||
    draft.dungeonStartFreezeMs !== null;
  const thresholdModifier = draftToModifier(draft.thresholdModifier);
  const freezeDurationModifier = draftToModifier(draft.freezeDurationModifier);
  return {
    slotId: draft.slotId,
    threshold: draft.threshold,
    ...(hasThreshold && draft.displayMode !== "raw"
      ? { displayMode: draft.displayMode }
      : {}),
    ...(hasThreshold && draft.wrapAtThreshold ? { wrapAtThreshold: true } : {}),
    resetBuffId: draft.resetBuffId ?? 0,
    ...(hasBuff && draft.resetSourceConfigId !== null
      ? { resetSourceConfigId: draft.resetSourceConfigId }
      : {}),
    ...(hasBuff && draft.resetBuffTarget !== "selfPlayer"
      ? { resetBuffTarget: draft.resetBuffTarget }
      : {}),
    onBuffAdd: hasBuff ? draft.onBuffAdd : "noOp",
    onBuffChange: hasBuff ? draft.onBuffChange : "noOp",
    onBuffRemove: hasBuff ? draft.onBuffRemove : "noOp",
    ...(draft.freezeDurationMs !== null
      ? { freezeDurationMs: draft.freezeDurationMs }
      : {}),
    ...(hasFreeze ? { onFreezeExpire: draft.onFreezeExpire } : {}),
    ...(draft.altFreeze
      ? {
          altFreeze: {
            conditionBuffId: draft.altFreeze.conditionBuffId ?? 0,
            freezeDurationMs: draft.altFreeze.freezeDurationMs ?? 0,
          },
        }
      : {}),
    ...(draft.dungeonStartFreezeMs !== null
      ? { dungeonStartFreezeMs: draft.dungeonStartFreezeMs }
      : {}),
    ...(thresholdModifier ? { thresholdModifier } : {}),
    ...(freezeDurationModifier ? { freezeDurationModifier } : {}),
    ...(draft.resetSkillKeys.length > 0
      ? {
          resetSkillKeys: [...draft.resetSkillKeys],
          onResetSkill: draft.onResetSkill,
        }
      : {}),
    ...(draft.resetPassiveSkillIds.length > 0
      ? {
          resetPassiveSkillIds: [...draft.resetPassiveSkillIds],
          onPassiveSkill: draft.onPassiveSkill,
        }
      : {}),
  };
}

/** The stored rule body for `draft`. */
export function fromDraft(
  draft: RuleDraft,
): { name: string } & CounterRuleDefinition {
  return {
    name: draft.name.trim(),
    sources: draft.sources.map(draftToSource),
    effectSlots: draft.slots.map(draftToSlot),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Message key suffixes under `skillMonitor.customPanel.counterEditor.issue`. */
export type RuleIssueCode =
  | "nameRequired"
  | "slotsRequired"
  | "duplicateSlot"
  | "required"
  | "idInvalid"
  | "countInvalid"
  | "durationInvalid"
  | "metersInvalid"
  | "valueInvalid"
  | "reductionInvalid"
  | "ruleInvalid"
  | "freezeNeverStarts"
  | "neverChanges";

export type RuleIssue = {
  /** Dotted draft path, e.g. `sources.0.increment` or `slots.1.threshold`. */
  path: string;
  code: RuleIssueCode;
};

export type RuleValidation = {
  errors: RuleIssue[];
  warnings: RuleIssue[];
};

/** Whether `value` is a usable id in `domain` (damage ids exceed i32). */
export function isCounterId(
  value: unknown,
  domain: CounterIdDomain | null,
): value is number {
  return v.is(domain === "damage" ? damageIdSchema : idSchema, value);
}

function checkSourceField(
  field: SourceFieldSpec,
  value: unknown,
): RuleIssueCode | null {
  const control = field.control;
  switch (control.type) {
    case "ids": {
      const ids = Array.isArray(value) ? value : [];
      if (ids.length === 0) return field.required ? "required" : null;
      return ids.every((id) => isCounterId(id, control.domain))
        ? null
        : "idInvalid";
    }
    case "id":
      if (value === null || value === undefined) {
        return field.required ? "required" : null;
      }
      return isCounterId(value, control.domain) ? null : "idInvalid";
    case "count":
      if (value === null || value === undefined) {
        return field.required ? "required" : null;
      }
      return v.is(countSchema, value) ? null : "countInvalid";
    case "milliseconds":
      if (value === null || value === undefined) return "required";
      return v.is(tickIntervalSchema, value) ? null : "durationInvalid";
    case "meters":
      if (value === null || value === undefined) return "required";
      return v.is(metersSchema, value) ? null : "metersInvalid";
    case "typeFlags":
      return value === 0 || v.is(typeFlagsSchema, value)
        ? null
        : "valueInvalid";
    case "attrCondition": {
      if (value === null || value === undefined) return null;
      const condition = value as { attrId?: unknown; requiredValue?: unknown };
      if (condition.attrId === null || condition.requiredValue === null) {
        return "required";
      }
      return v.is(idSchema, condition.attrId) &&
        v.is(i32Schema, condition.requiredValue)
        ? null
        : "valueInvalid";
    }
  }
}

function checkOptionalDuration(value: number | null): RuleIssueCode | null {
  if (value === null) return null;
  return v.is(tickIntervalSchema, value) ? null : "durationInvalid";
}

function checkModifier(
  issues: RuleIssue[],
  path: string,
  modifier: AttrModifierDraft | null,
) {
  if (!modifier) return;
  if (modifier.attrId === null) {
    issues.push({ path: `${path}.attrId`, code: "required" });
  } else if (!v.is(idSchema, modifier.attrId)) {
    issues.push({ path: `${path}.attrId`, code: "idInvalid" });
  }
  if (modifier.basisPointsPerUnit === null) {
    issues.push({ path: `${path}.basisPointsPerUnit`, code: "required" });
  } else if (!v.is(countSchema, modifier.basisPointsPerUnit)) {
    issues.push({ path: `${path}.basisPointsPerUnit`, code: "countInvalid" });
  }
  const reduction = modifier.maxReductionBasisPoints;
  if (reduction === null) {
    issues.push({ path: `${path}.maxReductionBasisPoints`, code: "required" });
  } else if (
    !Number.isInteger(reduction) ||
    reduction < 1 ||
    reduction > FULL_REDUCTION_BASIS_POINTS
  ) {
    issues.push({
      path: `${path}.maxReductionBasisPoints`,
      code: "reductionInvalid",
    });
  }
}

function checkIdList(
  issues: RuleIssue[],
  path: string,
  ids: readonly number[],
  domain: CounterIdDomain,
) {
  if (!ids.every((id) => isCounterId(id, domain))) {
    issues.push({ path, code: "idInvalid" });
  }
}

function checkSlot(slot: SlotDraft, index: number, errors: RuleIssue[]) {
  const path = `slots.${index}`;
  if (slot.threshold !== null && !v.is(countSchema, slot.threshold)) {
    errors.push({ path: `${path}.threshold`, code: "countInvalid" });
  }
  if (slot.resetBuffId !== null && !v.is(idSchema, slot.resetBuffId)) {
    errors.push({ path: `${path}.resetBuffId`, code: "idInvalid" });
  }
  if (
    slot.resetBuffId !== null &&
    slot.resetSourceConfigId !== null &&
    !v.is(idSchema, slot.resetSourceConfigId)
  ) {
    errors.push({ path: `${path}.resetSourceConfigId`, code: "idInvalid" });
  }
  for (const key of ["freezeDurationMs", "dungeonStartFreezeMs"] as const) {
    const code = checkOptionalDuration(slot[key]);
    if (code) errors.push({ path: `${path}.${key}`, code });
  }
  if (slot.altFreeze) {
    const { conditionBuffId, freezeDurationMs } = slot.altFreeze;
    if (conditionBuffId === null) {
      errors.push({
        path: `${path}.altFreeze.conditionBuffId`,
        code: "required",
      });
    } else if (!v.is(idSchema, conditionBuffId)) {
      errors.push({
        path: `${path}.altFreeze.conditionBuffId`,
        code: "idInvalid",
      });
    }
    if (freezeDurationMs === null) {
      errors.push({
        path: `${path}.altFreeze.freezeDurationMs`,
        code: "required",
      });
    } else {
      const code = checkOptionalDuration(freezeDurationMs);
      if (code) {
        errors.push({ path: `${path}.altFreeze.freezeDurationMs`, code });
      }
    }
  }
  checkModifier(errors, `${path}.thresholdModifier`, slot.thresholdModifier);
  checkModifier(
    errors,
    `${path}.freezeDurationModifier`,
    slot.freezeDurationModifier,
  );
  checkIdList(errors, `${path}.resetSkillKeys`, slot.resetSkillKeys, "damage");
  checkIdList(
    errors,
    `${path}.resetPassiveSkillIds`,
    slot.resetPassiveSkillIds,
    "skill",
  );
}

/** Actions of `slot` that can actually fire. */
function liveActions(slot: SlotDraft): CounterAction[] {
  return [
    ...(slot.resetBuffId !== null
      ? [slot.onBuffAdd, slot.onBuffChange, slot.onBuffRemove]
      : []),
    ...(slot.resetSkillKeys.length > 0 ? [slot.onResetSkill] : []),
    ...(slot.resetPassiveSkillIds.length > 0 ? [slot.onPassiveSkill] : []),
  ];
}

function checkSlotWarnings(
  slot: SlotDraft,
  index: number,
  warnings: RuleIssue[],
) {
  const hasCooldown = slot.freezeDurationMs !== null || slot.altFreeze !== null;
  if (
    hasCooldown &&
    !liveActions(slot).some((action) => FREEZING_ACTIONS.has(action))
  ) {
    warnings.push({
      path: `slots.${index}.freezeDurationMs`,
      code: "freezeNeverStarts",
    });
  }
}

/** The first issue of each path, for looking issues up per field. */
export function issuesByPath(
  issues: readonly RuleIssue[],
): ReadonlyMap<string, RuleIssueCode> {
  const map = new Map<string, RuleIssueCode>();
  for (const issue of issues) {
    if (!map.has(issue.path)) map.set(issue.path, issue.code);
  }
  return map;
}

export function validateRuleDraft(draft: RuleDraft): RuleValidation {
  const errors: RuleIssue[] = [];
  const warnings: RuleIssue[] = [];
  if (!draft.name.trim()) errors.push({ path: "name", code: "nameRequired" });
  draft.sources.forEach((source, index) => {
    for (const field of getSourceFieldSpecs(source.kind)) {
      const code = checkSourceField(field, source.params[field.key]);
      if (code) {
        errors.push({ path: `sources.${index}.${field.key}`, code });
      }
    }
  });
  if (draft.slots.length === 0) {
    errors.push({ path: "slots", code: "slotsRequired" });
  } else if (!hasUniqueSlotIds(draft.slots)) {
    errors.push({ path: "slots", code: "duplicateSlot" });
  }
  draft.slots.forEach((slot, index) => {
    checkSlot(slot, index, errors);
    checkSlotWarnings(slot, index, warnings);
  });
  const anyTrigger =
    draft.sources.length > 0 ||
    draft.slots.some(
      (slot) =>
        liveActions(slot).some((action) => action !== "noOp") ||
        slot.dungeonStartFreezeMs !== null,
    );
  if (!anyTrigger && draft.slots.length > 0) {
    warnings.push({ path: "sources", code: "neverChanges" });
  }
  // Belt and braces: every field check passed, so the stored shape must
  // pass the runtime gate too; anything else is a bug in this module.
  if (errors.length === 0 && !isValidCounterRuleDefinition(fromDraft(draft))) {
    errors.push({ path: "", code: "ruleInvalid" });
  }
  return { errors, warnings };
}
