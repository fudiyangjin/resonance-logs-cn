import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { get, writable } from "svelte/store";

export type CustomDefinitionType = "buff" | "skill" | "monster" | "counter" | "unknown";

export type CustomDefinitionEntry = {
  uid: number;
  type: CustomDefinitionType;
  name: string;
  shortName?: string | null;
  notes?: string | null;
  icon?: string | null;
  color?: string | null;
};

export type CustomDefinitionsFile = {
  version: number;
  definitions: CustomDefinitionEntry[];
};

const DEFAULT_CUSTOM_DEFINITIONS: CustomDefinitionsFile = {
  version: 1,
  definitions: [],
};

export const CUSTOM_DEFINITIONS_UPDATED_EVENT = "custom-definitions-updated";

export const customDefinitions = writable<CustomDefinitionsFile>(
  DEFAULT_CUSTOM_DEFINITIONS,
);

let loadPromise: Promise<void> | null = null;
let syncListenerPromise: Promise<(() => void) | null> | null = null;

function normalizeEntry(entry: Partial<CustomDefinitionEntry>): CustomDefinitionEntry | null {
  const uid = Number(entry.uid);
  const name = String(entry.name ?? "").trim();
  const type = (entry.type ?? "unknown") as CustomDefinitionType;

  if (!Number.isFinite(uid) || uid <= 0 || !name) {
    return null;
  }

  return {
    uid,
    type,
    name,
    shortName: entry.shortName?.trim() || null,
    notes: entry.notes?.trim() || null,
    icon: entry.icon?.trim() || null,
    color: entry.color?.trim() || null,
  };
}

function normalizePayload(value: Partial<CustomDefinitionsFile> | null | undefined): CustomDefinitionsFile {
  const definitions = Array.isArray(value?.definitions)
    ? value!.definitions
        .map((entry) => normalizeEntry(entry as Partial<CustomDefinitionEntry>))
        .filter((entry): entry is CustomDefinitionEntry => entry !== null)
    : [];

  definitions.sort((a, b) => a.type.localeCompare(b.type) || a.uid - b.uid);

  return {
    version: Number(value?.version) || 1,
    definitions,
  };
}

export async function loadCustomDefinitions(force = false): Promise<void> {
  if (!force && loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    try {
      const payload = await invoke<CustomDefinitionsFile>("read_custom_definitions");
      customDefinitions.set(normalizePayload(payload));
    } catch (error) {
      console.error("[custom-definitions] failed to load custom definitions", error);
      customDefinitions.set(DEFAULT_CUSTOM_DEFINITIONS);
    }
  })();

  await loadPromise;
}

export async function writeCustomDefinitions(nextValue: CustomDefinitionsFile): Promise<void> {
  const normalized = normalizePayload(nextValue);
  await invoke("write_custom_definitions", { payload: normalized });
  customDefinitions.set(normalized);
}

export async function upsertCustomDefinition(
  entry: Partial<CustomDefinitionEntry>,
): Promise<CustomDefinitionEntry | null> {
  const normalized = normalizeEntry(entry);
  if (!normalized) return null;

  const current = normalizePayload(get(customDefinitions));
  const nextDefinitions = current.definitions.filter(
    (item) => !(item.uid === normalized.uid && item.type === normalized.type),
  );
  nextDefinitions.push(normalized);
  nextDefinitions.sort((a, b) => a.type.localeCompare(b.type) || a.uid - b.uid);

  await writeCustomDefinitions({
    version: current.version || 1,
    definitions: nextDefinitions,
  });

  return normalized;
}

export async function deleteCustomDefinition(uid: number, type: CustomDefinitionType): Promise<void> {
  const current = normalizePayload(get(customDefinitions));
  const nextDefinitions = current.definitions.filter(
    (item) => !(item.uid === uid && item.type === type),
  );

  await writeCustomDefinitions({
    version: current.version || 1,
    definitions: nextDefinitions,
  });
}

export function getCustomDefinition(
  uid: number | null | undefined,
  type: CustomDefinitionType,
): CustomDefinitionEntry | null {
  if (!Number.isFinite(Number(uid))) return null;
  const numericUid = Number(uid);
  const state = get(customDefinitions);
  return (
    state.definitions.find(
      (entry) => entry.uid === numericUid && entry.type === type,
    ) ?? null
  );
}

export async function ensureCustomDefinitionsSyncListener(): Promise<void> {
  if (syncListenerPromise) {
    await syncListenerPromise;
    return;
  }

  syncListenerPromise = (async () => {
    try {
      return await listen(CUSTOM_DEFINITIONS_UPDATED_EVENT, async () => {
        await loadCustomDefinitions(true);
      });
    } catch (error) {
      console.error("[custom-definitions] failed to attach sync listener", error);
      return null;
    }
  })();

  await syncListenerPromise;
}
