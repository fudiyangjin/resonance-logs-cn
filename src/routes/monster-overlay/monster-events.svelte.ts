import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  onBossBuffUpdate,
  onEntityIdentities,
  onHateListUpdate,
  onTeammateBuffUpdate,
  type BuffUpdateState,
  type HateEntry,
} from "$lib/api";
import {
  onGlobalPointerMove,
  onGlobalPointerUp,
  setMonsterEditMode,
  setMonsterOverlayWindow,
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
  const unlistenHateList = onHateListUpdate((event) => {
    const next = new Map<EntityId, HateEntry[]>();
    for (const [entityUuid, entries] of Object.entries(event.payload.hateLists)) {
      next.set(entityUuid, entries);
    }
    monsterRuntime.bossHateMap = next;
  });
  const unlistenIdentities = onEntityIdentities((event) => {
    const nextPlayerNames = new Map(monsterRuntime.playerNameCache);
    for (const [entityUuid, name] of Object.entries(event.payload.playerNames)) {
      nextPlayerNames.set(entityUuid, name);
    }
    const nextMonsterIds = new Map(monsterRuntime.monsterIdCache);
    for (const [entityUuid, monsterId] of Object.entries(event.payload.monsterIds)) {
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
    monsterRuntime.bossSections = [];
    monsterRuntime.hateSections = [];
    unlistenEditToggle.then((fn) => fn());
    unlistenBossBuff.then((fn) => fn());
    unlistenTeammateBuff.then((fn) => fn());
    unlistenHateList.then((fn) => fn());
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
