import { describe, expect, it } from "vitest";
import * as v from "valibot";
import type { CounterSource } from "$lib/bindings";
import counterRulesRaw from "$lib/config/counter_rules.json";
import counterSlotTemplatesRaw from "$lib/config/counter_slot_templates.json";
import counterSourceTemplatesRaw from "$lib/config/counter_source_templates.json";
import type { InlineBuffEntry, SkillMonitorProfile } from "$lib/settings-store";
import type {
  CounterEffectSlotPreset,
  CounterRulePreset,
} from "$lib/skill-mappings";
import {
  COUNTER_SOURCE_KINDS,
  counterSourceSchema,
  createRuleDraft,
  createSlotDraft,
  createSourceDraft,
  dropLegacyUserCounterRules,
  fromDraft,
  isValidCounterRuleDefinition,
  pruneCounterEntriesForSlots,
  toDraft,
  validateRuleDraft,
  type RuleDraft,
} from "./user-counter-rules";

const PRESETS = counterRulesRaw as CounterRulePreset[];
const SOURCE_TEMPLATE_SOURCES = (
  counterSourceTemplatesRaw as Array<{
    source: CounterSource | CounterSource[];
  }>
).flatMap((template) =>
  Array.isArray(template.source) ? template.source : [template.source],
);
const SLOT_TEMPLATE_SLOTS = (
  counterSlotTemplatesRaw as Array<{
    slot: Omit<CounterEffectSlotPreset, "slotId">;
  }>
).map((template): CounterEffectSlotPreset => ({ slotId: 1, ...template.slot }));

/** What the engine assumes for every field a slot leaves out. */
function withEngineDefaults(slot: CounterEffectSlotPreset) {
  const defined = Object.fromEntries(
    Object.entries(slot).filter(([, value]) => value !== undefined),
  );
  return {
    resetBuffTarget: "selfPlayer",
    onBuffAdd: "noOp",
    onBuffChange: "noOp",
    onBuffRemove: "noOp",
    onFreezeExpire: "resetAndStartCount",
    onResetSkill: "noOp",
    onPassiveSkill: "noOp",
    wrapAtThreshold: false,
    displayMode: "raw",
    ...defined,
  };
}

function roundTrip(rule: { name: string } & CounterRulePreset) {
  return fromDraft(toDraft(rule, null));
}

const validSlot: CounterEffectSlotPreset = {
  slotId: 1,
  threshold: 10,
  resetBuffId: 2201611,
  onBuffAdd: "reset",
  onBuffChange: "noOp",
  onBuffRemove: "noOp",
};

function definition(
  overrides: Partial<{ sources: unknown[]; effectSlots: unknown[] }>,
) {
  return {
    sources: [{ skillCast: { skillBaseIds: [1937], increment: 1 } }],
    effectSlots: [validSlot],
    ...overrides,
  };
}

describe("counter rule schema", () => {
  it("accepts every preset and every factor template", () => {
    for (const preset of PRESETS) {
      expect(isValidCounterRuleDefinition(preset), preset.name).toBe(true);
    }
    for (const source of SOURCE_TEMPLATE_SOURCES) {
      expect(v.is(counterSourceSchema, source), JSON.stringify(source)).toBe(
        true,
      );
    }
    expect(
      isValidCounterRuleDefinition({
        sources: [],
        effectSlots: SLOT_TEMPLATE_SLOTS.map((slot, index) => ({
          ...slot,
          slotId: index + 1,
        })),
      }),
    ).toBe(true);
  });

  it("knows every source kind the bundled configs use", () => {
    const used = new Set(
      [
        ...SOURCE_TEMPLATE_SOURCES,
        ...PRESETS.flatMap((rule) => rule.sources),
      ].flatMap((source) => Object.keys(source)),
    );
    for (const kind of used) {
      expect(COUNTER_SOURCE_KINDS).toContain(kind);
    }
  });

  it("rejects what the runtime would fail on or silently ignore", () => {
    const cases: Record<string, unknown> = {
      unknownSlotField: definition({
        effectSlots: [{ ...validSlot, freezeDurationMS: 1000 }],
      }),
      twoKindSource: definition({
        sources: [
          {
            skillCast: { skillBaseIds: [1], increment: 1 },
            buffAdded: { buffId: 1, increment: 1 },
          },
        ],
      }),
      unknownKind: definition({ sources: [{ skillCats: {} }] }),
      negativeIncrement: definition({
        sources: [{ skillCast: { skillBaseIds: [1], increment: -1 } }],
      }),
      fractionalIncrement: definition({
        sources: [{ skillCast: { skillBaseIds: [1], increment: 1.5 } }],
      }),
      emptySkills: definition({
        sources: [{ skillCast: { skillBaseIds: [], increment: 1 } }],
      }),
      buffIdOverI32: definition({
        effectSlots: [{ ...validSlot, resetBuffId: 2_147_483_648 }],
      }),
      duplicateSlotId: definition({ effectSlots: [validSlot, validSlot] }),
      noSlots: definition({ effectSlots: [] }),
    };
    for (const [name, value] of Object.entries(cases)) {
      expect(isValidCounterRuleDefinition(value), name).toBe(false);
    }
  });

  it("takes damage ids beyond i32", () => {
    expect(
      isValidCounterRuleDefinition(
        definition({
          sources: [
            { damageBySkillKey: { skillKeys: [2203110203], increment: 1 } },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe("rule draft", () => {
  it("round-trips every preset without changing what the engine sees", () => {
    for (const preset of PRESETS) {
      const draft = toDraft(preset, null);
      expect(validateRuleDraft(draft).errors, preset.name).toEqual([]);
      const output = roundTrip(preset);
      expect(output.sources, preset.name).toEqual(preset.sources);
      expect(output.effectSlots.map(withEngineDefaults), preset.name).toEqual(
        preset.effectSlots.map(withEngineDefaults),
      );
    }
  });

  it("round-trips every factor slot template", () => {
    for (const slot of SLOT_TEMPLATE_SLOTS) {
      const output = roundTrip({
        ruleId: 1,
        name: "slot",
        sources: [],
        effectSlots: [slot],
      });
      expect(output.effectSlots.map(withEngineDefaults)).toEqual([
        withEngineDefaults(slot),
      ]);
    }
  });

  it("starts empty with a name error and a never-changes warning", () => {
    const validation = validateRuleDraft(createRuleDraft());
    expect(validation.errors).toEqual([{ path: "name", code: "nameRequired" }]);
    expect(validation.warnings).toEqual([
      { path: "sources", code: "neverChanges" },
    ]);
  });

  it("reports missing required fields by path", () => {
    const draft: RuleDraft = {
      ...createRuleDraft(),
      name: "x",
      sources: [createSourceDraft("skillCast")],
    };
    expect(validateRuleDraft(draft).errors).toEqual([
      { path: "sources.0.skillBaseIds", code: "required" },
    ]);
  });

  it("warns when a cooldown can never start", () => {
    const slot = {
      ...createSlotDraft(1),
      resetBuffId: 2201611,
      freezeDurationMs: 5000,
    };
    const draft: RuleDraft = { ...createRuleDraft(), name: "x", slots: [slot] };
    expect(validateRuleDraft(draft).warnings).toContainEqual({
      path: "slots.0.freezeDurationMs",
      code: "freezeNeverStarts",
    });
    slot.onBuffAdd = "freeze";
    expect(validateRuleDraft(draft).warnings).toEqual([]);
  });

  it("drops settings that depend on an unset field", () => {
    const slot = {
      ...createSlotDraft(1),
      displayMode: "remainingToThreshold" as const,
      wrapAtThreshold: true,
      onBuffAdd: "reset" as const,
      resetBuffTarget: "anyTeam" as const,
    };
    const [output] = fromDraft({
      ...createRuleDraft(),
      name: "x",
      slots: [slot],
    }).effectSlots;
    expect(output).toEqual({
      slotId: 1,
      threshold: null,
      resetBuffId: 0,
      onBuffAdd: "noOp",
      onBuffChange: "noOp",
      onBuffRemove: "noOp",
    });
  });

  it("carries the increment and same-table ids across a kind switch", () => {
    const cast = createSourceDraft("skillCast");
    cast.params["skillBaseIds"] = [1714, 1718];
    cast.params["increment"] = 25;
    const tick = createSourceDraft("skillDurationTick", cast);
    expect(tick.key).toBe(cast.key);
    expect(tick.params).toMatchObject({
      skillBaseId: 1714,
      increment: 25,
      tickIntervalMs: 1000,
    });
    const hit = createSourceDraft("damageBySkillKey", cast);
    expect(hit.params["skillKeys"]).toEqual([]);
  });

  it("omits unset optional source fields", () => {
    const source = createSourceDraft("damageTaken");
    source.params["increment"] = 3;
    const output = fromDraft({
      ...createRuleDraft(),
      name: "x",
      sources: [source],
    });
    expect(output.sources).toEqual([{ damageTaken: { increment: 3 } }]);
  });
});

function counterEntry(
  id: string,
  sourceId: number,
  counterSlotId: number,
): InlineBuffEntry {
  return {
    id,
    sourceType: "counter",
    sourceId,
    counterSlotId,
    label: id,
    format: "timer",
  };
}

type EntryHolder = Pick<
  SkillMonitorProfile,
  "userCounterRules" | "customPanelGroups" | "inlineBuffEntries"
>;

function holder(overrides: Partial<EntryHolder>): EntryHolder {
  return {
    userCounterRules: [],
    customPanelGroups: [
      {
        id: "g",
        name: "",
        kind: "manual",
        entries: [
          counterEntry("legacy", 10001, 1),
          counterEntry("kept", 10002, 1),
          counterEntry("kept2", 10002, 2),
          counterEntry("preset", 4, 1),
        ],
        position: { x: 0, y: 0 },
        scale: 1,
        style: {} as never,
      },
    ],
    inlineBuffEntries: [counterEntry("inlineLegacy", 10001, 1)],
    ...overrides,
  };
}

const currentRule = {
  ruleId: 10002,
  name: "current",
  sources: [],
  effectSlots: [validSlot, { ...validSlot, slotId: 2 }],
};

describe("legacy rule cleanup", () => {
  it("drops template-picker rules with their panel entries", () => {
    const profile = holder({
      userCounterRules: [
        {
          ruleId: 10001,
          name: "legacy",
          sourceRefs: ["a"],
          slotRefs: ["b"],
        } as never,
        currentRule,
      ],
    });
    const next = dropLegacyUserCounterRules(profile);
    expect(next.userCounterRules).toEqual([currentRule]);
    expect(next.customPanelGroups?.[0]?.entries.map((e) => e.id)).toEqual([
      "kept",
      "kept2",
      "preset",
    ]);
    expect(next.inlineBuffEntries).toEqual([]);
  });

  it("returns the profile itself when nothing is legacy", () => {
    const profile = holder({ userCounterRules: [currentRule] });
    expect(dropLegacyUserCounterRules(profile)).toBe(profile);
    const empty = holder({});
    delete empty.userCounterRules;
    expect(dropLegacyUserCounterRules(empty)).toBe(empty);
  });

  it("prunes only the entries of removed slots", () => {
    const profile = holder({ userCounterRules: [currentRule] });
    const next = pruneCounterEntriesForSlots(profile, 10002, new Set([2]));
    expect(next.customPanelGroups?.[0]?.entries.map((e) => e.id)).toEqual([
      "legacy",
      "kept2",
      "preset",
    ]);
    expect(next.inlineBuffEntries).toBe(profile.inlineBuffEntries);
    expect(pruneCounterEntriesForSlots(profile, 10002, new Set([1, 2]))).toBe(
      profile,
    );
  });
});
