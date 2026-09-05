import { CLASS_SPEC_MAP } from "$lib/settings-store";

/**
 * `TalentStageTable` second-tier rows: `talentStageCfgId` -> `ClassSpec` name
 * (same names as `CLASS_SPEC_MAP` keys and the `/images/class_specs/<Spec>.png`
 * icons). First-tier / zero stages are intentionally absent: they are
 * transient respec states, not bindable specs.
 */
export const TALENT_STAGE_SPECS: Readonly<Record<number, string>> = {
  101: "Iaido",
  102: "Moonstrike",
  104: "Icicle",
  105: "Frostbeam",
  107: "Vanguard",
  108: "Skyward",
  110: "Smite",
  111: "Lifebind",
  113: "Earthfort",
  114: "Block",
  116: "Wildpack",
  117: "Falconry",
  119: "Dissonance",
  120: "Concerto",
  122: "Recovery",
  123: "Shield",
  128: "Voidflame",
  129: "Blazecrimson",
};

export type TalentStageOption = {
  cfgId: number;
  className: string;
  specName: string;
};

/** All bindable specs, grouped by class for `<optgroup>` rendering. */
export function talentStageOptions(): TalentStageOption[] {
  return Object.entries(TALENT_STAGE_SPECS).map(([cfgId, specName]) => ({
    cfgId: Number(cfgId),
    className: CLASS_SPEC_MAP[specName] ?? "",
    specName,
  }));
}

export function talentStageIconPath(cfgId: number): string {
  const spec = TALENT_STAGE_SPECS[cfgId];
  return spec ? `/images/class_specs/${spec}.png` : "";
}
