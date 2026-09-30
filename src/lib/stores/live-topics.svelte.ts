import {
  commands,
  type LiveBuffsPayload,
  type LiveCombatPayload,
  type LiveDeathsPayload,
  type LiveFantasyPayload,
  type LiveMonsterPayload,
  type LiveScenePayload,
  type LiveStatusPayload,
  type LiveTeamPayload,
} from "$lib/bindings";
import {
  LiveSceneEventStore,
  LiveTopicStore,
} from "$lib/stores/live-topic-store.svelte";

export const liveCombatStore = new LiveTopicStore<LiveCombatPayload>();

export const liveStatusStore = new LiveTopicStore<LiveStatusPayload>();

export const liveBuffsStore = new LiveTopicStore<LiveBuffsPayload>();

export const liveMonsterStore = new LiveTopicStore<LiveMonsterPayload>();

export const liveFantasyStore = new LiveTopicStore<LiveFantasyPayload>();

export const liveDeathsStore = new LiveTopicStore<LiveDeathsPayload>();

// Teammate cooldowns shared through the team relay (monster HUD interest).
export const liveTeamStore = new LiveTopicStore<LiveTeamPayload>();

// `main`-only: drives the daily-scene auto-hide logic for the
// game/monster/minimap overlay windows without subscribing to the far
// heavier `live-combat` cadence.
export const liveSceneStore = new LiveSceneEventStore<LiveScenePayload>(
  "live-scene",
  () => commands.getLiveScene(),
);
