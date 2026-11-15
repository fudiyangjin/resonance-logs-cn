import type { MessageKey } from "$lib/i18n/index.svelte";

/**
 * A built-in one-click group of forbidden damage ids tied to a specific
 * dungeon mechanic. Adding it to a loadout copies it into a challenge group
 * named by `labelKey` (see `challenge-watch.ts`).
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
      110098100102, 110098110103, 110098130103, 110098140102, 110098140104,
      110098140107, 120016180102,
    ],
  },
];
