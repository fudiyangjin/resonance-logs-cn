import type { MessageKey } from "$lib/i18n/index.svelte";

/**
 * A one-click group of forbidden damage ids tied to a specific dungeon mechanic.
 * Used by the challenge-watch settings UI to bulk-add ids, and by the warning
 * tooltip to surface a human-readable mechanic name for a matched id.
 */
export type ChallengePreset = {
  id: string;
  labelKey: MessageKey;
  damageIds: number[];
};

export const CHALLENGE_PRESETS: ChallengePreset[] = [
  {
    id: "n17-fuyoupao",
    labelKey: "challengeWatch.preset.n17Fuyoupao",
    damageIds: [
      110098100102,
      110098110103,
      110098130103,
      110098140102,
      110098140104,
      110098140107,
      120016180102,
    ],
  },
];

/**
 * Reverse lookup: damage_id -> preset that contains it. Built once at module
 * load so tooltips can map a matched id back to its mechanic preset.
 */
const DAMAGE_ID_TO_PRESET = new Map<number, ChallengePreset>();
for (const preset of CHALLENGE_PRESETS) {
  for (const id of preset.damageIds) {
    if (!DAMAGE_ID_TO_PRESET.has(id)) {
      DAMAGE_ID_TO_PRESET.set(id, preset);
    }
  }
}

export function getPresetForDamageId(id: number): ChallengePreset | undefined {
  return DAMAGE_ID_TO_PRESET.get(id);
}
