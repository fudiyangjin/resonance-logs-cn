import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  onBossBuffUpdate,
  onBossDbmUpdate,
  onEntityIdentities,
  onHateListUpdate,
  onTeammateBuffUpdate,
  onTeammateFantasyClear,
  onTeammateFantasyUpdate,
  type BuffUpdateState,
  type HateEntry,
  type TeammateFantasyState,
} from "$lib/api";
import {
  fantasyEntryKey,
  withPreservedFantasySummonerName,
} from "./monster-fantasy";
import {
  onGlobalPointerMove,
  onGlobalPointerUp,
  setMonsterEditMode,
  setMonsterOverlayWindow,
  setMonsterReferenceMode,
} from "./monster-layout.svelte.js";
import type { EntityId } from "$lib/entity-id";
import { updateMonsterDisplay } from "./monster-display.svelte.js";
import { monsterRuntime } from "./monster-runtime.svelte.js";

function mapBossBuffs(buffs: BuffUpdateState[]) {
  const next = new Map<number, BuffUpdateState>();
  for (const buff of buffs) {
    const existing = next.get(buff.baseId);
    if (!existing || buff.createTimeMs >= existing.createTimeMs) {
      next.set(buff.baseId, buff);
    }
  }
  return next;
}

const mapEntityBuffs = mapBossBuffs;

function mergeFantasyEntries(entries: TeammateFantasyState[]) {
  const next = new Map(
    monsterRuntime.fantasyEntries.map((entry) => [
      fantasyEntryKey(entry),
      entry,
    ]),
  );
  for (const entry of entries) {
    const key = fantasyEntryKey(entry);
    const existing = next.get(key);
    if (!existing) {
      next.set(key, entry);
      continue;
    }

    if (entry.detectedAtMs >= existing.detectedAtMs) {
      next.set(key, withPreservedFantasySummonerName(entry, existing));
      continue;
    }

    if (!existing.summonerName && entry.summonerName) {
      next.set(key, { ...existing, summonerName: entry.summonerName });
    }
  }
  monsterRuntime.fantasyEntries = [...next.values()];
}

function clearFantasyEntries() {
  monsterRuntime.fantasyEntries = [];
  monsterRuntime.fantasyRows = [];
}

export function initMonsterOverlay() {
  if (monsterRuntime.cleanup) return monsterRuntime.cleanup;
  if (typeof window === "undefined") {
    return () => {};
  }

  monsterRuntime.isMounted = true;
  monsterRuntime.isInitialized = true;
  setMonsterOverlayWindow(getCurrentWindow());

  document.documentElement.style.setProperty(
    "background",
    "transparent",
    "important",
  );
  document.body.style.setProperty("background", "transparent", "important");

  void setMonsterEditMode(false);

  const unlistenEditToggle = listen("monster-overlay-edit-toggle", () => {
    void setMonsterEditMode(!monsterRuntime.isEditing);
  });
  const unlistenReferenceToggle = listen<boolean>(
    "monster-overlay-reference-toggle",
    (event) => {
      setMonsterReferenceMode(event.payload);
    },
  );
  const unlistenBossBuff = onBossBuffUpdate((event) => {
    const next = new Map<EntityId, Map<number, BuffUpdateState>>();
    for (const [entityUuid, buffs] of Object.entries(event.payload.bossBuffs)) {
      next.set(entityUuid, mapEntityBuffs(buffs));
    }
    monsterRuntime.bossBuffMap = next;
  });
  const unlistenTeammateBuff = onTeammateBuffUpdate((event) => {
    const next = new Map<EntityId, Map<number, BuffUpdateState>>();
    for (const [entityUuid, buffs] of Object.entries(
      event.payload.teammateBuffs,
    )) {
      next.set(entityUuid, mapEntityBuffs(buffs));
    }
    monsterRuntime.teammateBuffMap = next;
  });
  const unlistenTeammateFantasy = onTeammateFantasyUpdate((event) => {
    mergeFantasyEntries(event.payload.fantasies);
  });
  const unlistenTeammateFantasyClear = onTeammateFantasyClear(() => {
    clearFantasyEntries();
  });
  const unlistenHateList = onHateListUpdate((event) => {
    const next = new Map<EntityId, HateEntry[]>();
    for (const [entityUuid, entries] of Object.entries(
      event.payload.hateLists,
    )) {
      next.set(entityUuid, entries);
    }
    monsterRuntime.bossHateMap = next;
  });
  const unlistenBossDbm = onBossDbmUpdate((event) => {
    for (const dbmEvent of event.payload.events) {
      monsterRuntime.bossDbmMap.set(dbmEvent.baseSkillId, dbmEvent);
    }
  });
  const unlistenIdentities = onEntityIdentities((event) => {
    const nextPlayerNames = new Map(monsterRuntime.playerNameCache);
    for (const [entityUuid, name] of Object.entries(
      event.payload.playerNames,
    )) {
      nextPlayerNames.set(entityUuid, name);
    }
    const nextMonsterIds = new Map(monsterRuntime.monsterIdCache);
    for (const [entityUuid, monsterId] of Object.entries(
      event.payload.monsterIds,
    )) {
      nextMonsterIds.set(entityUuid, monsterId);
    }
    monsterRuntime.playerNameCache = nextPlayerNames;
    monsterRuntime.monsterIdCache = nextMonsterIds;
  });

  window.addEventListener("pointermove", onGlobalPointerMove);
  window.addEventListener("pointerup", onGlobalPointerUp);
  monsterRuntime.rafId = requestAnimationFrame(updateMonsterDisplay);

  monsterRuntime.cleanup = () => {
    monsterRuntime.isMounted = false;
    monsterRuntime.isInitialized = false;
    monsterRuntime.dragState = null;
    monsterRuntime.resizeState = null;
    monsterRuntime.playerNameCache = new Map();
    monsterRuntime.monsterIdCache = new Map();
    monsterRuntime.bossBuffMap = new Map();
    monsterRuntime.teammateBuffMap = new Map();
    monsterRuntime.bossHateMap = new Map();
    monsterRuntime.fantasyEntries = [];
    monsterRuntime.bossDbmMap = new Map();
    monsterRuntime.bossSections = [];
    monsterRuntime.teammateColumns = [];
    monsterRuntime.teammateRows = [];
    monsterRuntime.hateSections = [];
    monsterRuntime.fantasyRows = [];
    monsterRuntime.dbmRows = [];
    unlistenEditToggle.then((fn) => fn());
    unlistenReferenceToggle.then((fn) => fn());
    unlistenBossBuff.then((fn) => fn());
    unlistenTeammateBuff.then((fn) => fn());
    unlistenTeammateFantasy.then((fn) => fn());
    unlistenTeammateFantasyClear.then((fn) => fn());
    unlistenHateList.then((fn) => fn());
    unlistenBossDbm.then((fn) => fn());
    unlistenIdentities.then((fn) => fn());
    window.removeEventListener("pointermove", onGlobalPointerMove);
    window.removeEventListener("pointerup", onGlobalPointerUp);
    if (monsterRuntime.rafId) {
      cancelAnimationFrame(monsterRuntime.rafId);
      monsterRuntime.rafId = null;
    }
    setMonsterOverlayWindow(null);
    monsterRuntime.cleanup = null;
  };

  return monsterRuntime.cleanup;
}
