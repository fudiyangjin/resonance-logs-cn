/**
 * Composite buffs: a named set of member buffs that counts as present only
 * while every member (or a threshold of them) is. A most-urgent composite
 * instead shows the member most in need of attention while any member is
 * present. Each composite owns a negative id (never a game buff id) and is
 * used anywhere a buff id is — display areas, coverage, alerts, voice. The
 * backend derives its presence (`projections::buff_presence`).
 *
 * Definitions are global, like buff aliases, and are not exported with
 * loadouts; profile references to an unknown composite are pruned.
 *
 * Pure helpers only, and free of the buff name tables so `settings-store`
 * can depend on it.
 */
import type { BuffCompositeSpec } from "$lib/bindings";
import type { BuffAliasMap } from "$lib/config/buff-name-table";
import type {
  BuffGroup,
  InlineBuffEntry,
  SkillMonitorProfile,
} from "$lib/settings-store";

/** Mirrors `MAX_BUFF_COMPOSITES` in `bootstrap_snapshot.rs`. */
export const MAX_BUFF_COMPOSITES = 64;
/** Mirrors `MAX_BUFF_COMPOSITE_MEMBERS` in `bootstrap_snapshot.rs`. */
export const MAX_BUFF_COMPOSITE_MEMBERS = 8;

export type BuffComposite = {
  /** Negative i32. */
  id: number;
  name: string;
  /** In configured order, which breaks most-urgent ties. */
  memberIds: number[];
  /** Members that must be active at once, below the member count; omitted
   * means every member. Never set on a most-urgent composite. */
  minActive?: number;
  /** Member whose sprite the composite shows; without one it renders as
   * text. Never set on a most-urgent composite, which shows its focused
   * member. */
  iconBuffId?: number;
  /** Shows the member most in need of attention — a missing one first,
   * otherwise the one ending first — while any member is present. Omitted
   * means the composite shows as one buff. */
  mode?: "mostUrgent";
};

export function isMostUrgentComposite(composite: BuffComposite): boolean {
  return composite.mode === "mostUrgent";
}

/** Members that must be active at once for `composite` to count. */
export function buffCompositeMinActive(composite: BuffComposite): number {
  if (isMostUrgentComposite(composite)) return 1;
  return composite.minActive ?? composite.memberIds.length;
}

const MIN_I32 = -2_147_483_648;
const MAX_I32 = 2_147_483_647;

export function isBuffCompositeId(id: unknown): id is number {
  return (
    Number.isSafeInteger(id) && (id as number) < 0 && (id as number) >= MIN_I32
  );
}

function isGameBuffId(id: unknown): id is number {
  return (
    Number.isSafeInteger(id) && (id as number) > 0 && (id as number) <= MAX_I32
  );
}

/** Drops malformed definitions: a composite needs a unique negative id and
 * 2..MAX distinct member buffs. A threshold outside 1..members-1 means every
 * member and is dropped. A most-urgent composite keeps neither a threshold
 * nor an icon member. */
export function ensureBuffComposites(raw: unknown): BuffComposite[] {
  if (!Array.isArray(raw)) return [];
  const result: BuffComposite[] = [];
  const seenIds = new Set<number>();
  for (const item of raw as Partial<BuffComposite>[]) {
    if (result.length >= MAX_BUFF_COMPOSITES) break;
    if (!item || !isBuffCompositeId(item.id) || seenIds.has(item.id)) continue;
    const memberIds = Array.from(
      new Set((item.memberIds ?? []).filter(isGameBuffId)),
    ).slice(0, MAX_BUFF_COMPOSITE_MEMBERS);
    if (memberIds.length < 2) continue;
    seenIds.add(item.id);
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (item.mode === "mostUrgent") {
      result.push({ id: item.id, name, memberIds, mode: "mostUrgent" });
      continue;
    }
    const minActive = item.minActive;
    const hasThreshold =
      typeof minActive === "number" &&
      Number.isInteger(minActive) &&
      minActive >= 1 &&
      minActive < memberIds.length;
    result.push({
      id: item.id,
      name,
      memberIds,
      ...(hasThreshold ? { minActive } : {}),
      ...(item.iconBuffId !== undefined && memberIds.includes(item.iconBuffId)
        ? { iconBuffId: item.iconBuffId }
        : {}),
    });
  }
  return result;
}

/** A random negative id: composites are not exported with loadouts, so an
 * imported reference must never collide with an unrelated local composite
 * the way sequential ids (-1, -2, …) would. */
export function allocateBuffCompositeId(
  existing: readonly BuffComposite[],
  random: () => number = Math.random,
): number {
  const used = new Set(existing.map((composite) => composite.id));
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const id = -1 - Math.floor(random() * (MAX_I32 - 1));
    if (!used.has(id)) return id;
  }
  return Math.min(-1, ...used) - 1;
}

export function buffCompositeSpecs(
  composites: readonly BuffComposite[],
): BuffCompositeSpec[] {
  return composites.map(({ id, memberIds, minActive, mode }) => ({
    id,
    memberIds: [...memberIds],
    ...(minActive !== undefined ? { minActive } : {}),
    ...(mode !== undefined ? { mode } : {}),
  }));
}

/** Composite names keyed like buff aliases, so every name resolver that
 * takes an alias map also names composites. */
export function buffCompositeAliases(
  composites: readonly BuffComposite[],
): BuffAliasMap {
  const aliases: BuffAliasMap = {};
  for (const composite of composites) {
    if (composite.name) aliases[String(composite.id)] = composite.name;
  }
  return aliases;
}

/** The member whose sprite stands for `composite` without live data (layout
 * placeholders, pickers): its icon member, or a most-urgent composite's
 * first member. */
export function compositeIconMemberId(
  composite: BuffComposite,
): number | undefined {
  return isMostUrgentComposite(composite)
    ? composite.memberIds[0]
    : composite.iconBuffId;
}

/** The buff whose sprite stands for `baseId`: a composite borrows a
 * member's (see `compositeIconMemberId`), any other buff is itself. */
export function buffIconSourceId(
  baseId: number,
  composites: readonly BuffComposite[],
): number {
  if (!isBuffCompositeId(baseId)) return baseId;
  const composite = composites.find((candidate) => candidate.id === baseId);
  return (composite ? compositeIconMemberId(composite) : undefined) ?? baseId;
}

type BuffIdMapper = (buffId: number) => number | null;

function mapIds(ids: readonly number[], map: BuffIdMapper): number[] {
  const result: number[] = [];
  for (const id of ids) {
    const next = map(id);
    if (next !== null) result.push(next);
  }
  return result;
}

function mapKeys<T>(
  record: Record<string | number, T>,
  map: BuffIdMapper,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const id = Number(key);
    if (!Number.isInteger(id)) {
      result[key] = value;
      continue;
    }
    const next = map(id);
    if (next !== null) result[String(next)] = value;
  }
  return result;
}

function mapEntries(
  entries: readonly InlineBuffEntry[],
  map: BuffIdMapper,
): InlineBuffEntry[] {
  const result: InlineBuffEntry[] = [];
  for (const entry of entries) {
    if (entry.sourceType !== "buff") {
      result.push(entry);
      continue;
    }
    const next = map(entry.sourceId);
    if (next !== null) result.push({ ...entry, sourceId: next });
  }
  return result;
}

function mapGroup(group: BuffGroup, map: BuffIdMapper): BuffGroup {
  return {
    ...group,
    buffIds: mapIds(group.buffIds ?? [], map),
    priorityBuffIds: mapIds(group.priorityBuffIds ?? [], map),
  };
}

/**
 * Rewrites every buff id a skill-monitor profile references; `null` drops
 * the reference. The one place that knows where buff ids live in a profile.
 */
export function mapProfileBuffIds(
  profile: SkillMonitorProfile,
  map: BuffIdMapper,
): SkillMonitorProfile {
  return {
    ...profile,
    monitoredBuffIds: mapIds(profile.monitoredBuffIds ?? [], map),
    buffPriorityIds: mapIds(profile.buffPriorityIds ?? [], map),
    ...(profile.buffAlerts
      ? { buffAlerts: mapKeys(profile.buffAlerts, map) }
      : {}),
    ...(profile.buffVoiceConfigs
      ? { buffVoiceConfigs: mapKeys(profile.buffVoiceConfigs, map) }
      : {}),
    buffGroups: (profile.buffGroups ?? []).map((group) => mapGroup(group, map)),
    ...(profile.individualMonitorAllGroup
      ? {
          individualMonitorAllGroup: mapGroup(
            profile.individualMonitorAllGroup,
            map,
          ),
        }
      : {}),
    ...(profile.customPanelGroups
      ? {
          customPanelGroups: profile.customPanelGroups.map((group) => ({
            ...group,
            entries: mapEntries(group.entries ?? [], map),
          })),
        }
      : {}),
    ...(profile.inlineBuffEntries
      ? { inlineBuffEntries: mapEntries(profile.inlineBuffEntries, map) }
      : {}),
    ...(profile.buffCoverageEntries
      ? {
          buffCoverageEntries: profile.buffCoverageEntries.flatMap((entry) => {
            const buffId = map(entry.buffId);
            return buffId === null ? [] : [{ ...entry, buffId }];
          }),
        }
      : {}),
    ...(profile.overlayPositions
      ? {
          overlayPositions: {
            ...profile.overlayPositions,
            iconBuffPositions: mapKeys(
              profile.overlayPositions.iconBuffPositions ?? {},
              map,
            ),
          },
        }
      : {}),
    ...(profile.overlaySizes
      ? {
          overlaySizes: {
            ...profile.overlaySizes,
            iconBuffSizes: mapKeys(
              profile.overlaySizes.iconBuffSizes ?? {},
              map,
            ),
          },
        }
      : {}),
  };
}

/** Every buff id `profile` references. */
export function collectProfileBuffIds(
  profile: SkillMonitorProfile,
): Set<number> {
  const ids = new Set<number>();
  mapProfileBuffIds(profile, (id) => {
    ids.add(id);
    return id;
  });
  return ids;
}

/** Drops references to composites outside `knownIds`; returns `profile`
 * itself when there is nothing to drop. */
export function pruneUnknownCompositeRefs(
  profile: SkillMonitorProfile,
  knownIds: ReadonlySet<number>,
): SkillMonitorProfile {
  const isUnknown = (id: number) => isBuffCompositeId(id) && !knownIds.has(id);
  for (const id of collectProfileBuffIds(profile)) {
    if (isUnknown(id)) {
      return mapProfileBuffIds(profile, (buffId) =>
        isUnknown(buffId) ? null : buffId,
      );
    }
  }
  return profile;
}
