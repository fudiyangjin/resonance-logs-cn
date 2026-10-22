/**
 * @file Lookups the counter editor's nested fields share (buff names and
 * icons, the profile's class), handed down through Svelte context instead of
 * threading them through every source and slot field.
 */
import { getContext, setContext } from "svelte";
import type { BuffDefinition } from "$lib/config/buff-name-table";
import { lookupDamageAttrIdName } from "$lib/config/recount-table";
import { lookupMonsterSkillDefaultName } from "$lib/config/monster-skill-search";
import { getLocale } from "$lib/i18n/index.svelte";
import { resolvePanelAttrLabel } from "$lib/i18n/panel-attrs";
import {
  CLASS_RESOURCES,
  findResonanceSkill,
  findResourcesByClass,
  getClassConfigs,
  type GaugeResourceDefinition,
  type ResourceDefinition,
} from "$lib/skill-mappings";
import type { CounterIdDomain } from "$lib/user-counter-rules";

export type CounterEditorContext = {
  readonly availableBuffMap: Map<number, BuffDefinition>;
  readonly classKey: string;
  getBuffDisplayName: (buffId: number) => string;
  getBuffIconPreviewSrc: (buffId: number) => string | null;
};

const KEY = Symbol("counter-editor");

/** `context` should expose its fields as getters so they stay reactive. */
export function setCounterEditorContext(context: CounterEditorContext) {
  setContext(KEY, context);
}

export function getCounterEditorContext(): CounterEditorContext {
  return getContext<CounterEditorContext>(KEY);
}

function isGauge(item: ResourceDefinition): item is GaugeResourceDefinition {
  return item.type === "bar" || item.type === "charges";
}

/** Gauge resources of `classKey`, the ones a resource source can count. */
export function classGaugeResources(
  classKey: string,
): GaugeResourceDefinition[] {
  return findResourcesByClass(classKey).filter(isGauge);
}

function findSkillName(skillId: number): string | null {
  for (const config of getClassConfigs()) {
    const skill = config.skills.find((item) => item.skillId === skillId);
    if (skill) return skill.name;
  }
  return (
    findResonanceSkill(skillId)?.name ??
    lookupMonsterSkillDefaultName(skillId, getLocale())
  );
}

function findResourceName(resourceId: number): string | null {
  for (const classKey of Object.keys(CLASS_RESOURCES)) {
    const match = classGaugeResources(classKey).find(
      (item) => item.currentId === resourceId,
    );
    if (match) return match.label;
  }
  return null;
}

/** Display name of an id in `domain`, `null` when no table knows it. */
export function counterIdName(
  context: CounterEditorContext,
  domain: CounterIdDomain | null,
  id: number,
): string | null {
  switch (domain) {
    case "buff":
      return context.getBuffDisplayName(id);
    case "damage":
      return lookupDamageAttrIdName(id);
    case "skill":
      return findSkillName(id);
    case "resource":
      return findResourceName(id);
    case "attr": {
      const label = resolvePanelAttrLabel({ attrId: id, label: "" });
      return label || null;
    }
    default:
      return null;
  }
}
