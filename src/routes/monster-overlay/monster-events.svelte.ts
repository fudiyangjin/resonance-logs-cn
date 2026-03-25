import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  onBossBuffUpdate,
  onEntityNames,
  onHateListUpdate,
  type BuffUpdateState,
  type HateEntry,
} from "$lib/api";
import {
  onGlobalPointerMove,
  onGlobalPointerUp,
  setMonsterEditMode,
  setMonsterOverlayWindow,
} from "./monster-layout.svelte.js";
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
  const unlistenEditSet = listen<{ editing: boolean }>(
    "monster-overlay-edit-set",
    (event) => {
      void setMonsterEditMode(Boolean(event.payload?.editing));
    },
  );
  const unlistenBossBuff = onBossBuffUpdate((event) => {
    const next = new Map<number, Map<number, BuffUpdateState>>();
    for (const [uid, buffs] of Object.entries(event.payload.bossBuffs)) {
      next.set(Number(uid), mapBossBuffs(buffs));
    }
    monsterRuntime.bossBuffMap = next;
  });
  const unlistenHateList = onHateListUpdate((event) => {
    const next = new Map<number, HateEntry[]>();
    for (const [uid, entries] of Object.entries(event.payload.hateLists)) {
      next.set(Number(uid), entries);
    }
    monsterRuntime.bossHateMap = next;
  });
  const unlistenNames = onEntityNames((event) => {
    const next = new Map(monsterRuntime.nameCache);
    for (const [uid, name] of Object.entries(event.payload.names)) {
      next.set(Number(uid), name);
    }
    monsterRuntime.nameCache = next;
  });

  window.addEventListener("pointermove", onGlobalPointerMove);
  window.addEventListener("pointerup", onGlobalPointerUp);
  monsterRuntime.rafId = requestAnimationFrame(updateMonsterDisplay);

  monsterRuntime.cleanup = () => {
    monsterRuntime.isMounted = false;
    monsterRuntime.isInitialized = false;
    monsterRuntime.dragState = null;
    monsterRuntime.resizeState = null;
    monsterRuntime.nameCache = new Map();
    monsterRuntime.bossBuffMap = new Map();
    monsterRuntime.bossHateMap = new Map();
    monsterRuntime.bossSections = [];
    monsterRuntime.hateSections = [];
    unlistenEditToggle.then((fn) => fn());
    unlistenEditSet.then((fn) => fn());
    unlistenBossBuff.then((fn) => fn());
    unlistenHateList.then((fn) => fn());
    unlistenNames.then((fn) => fn());
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
