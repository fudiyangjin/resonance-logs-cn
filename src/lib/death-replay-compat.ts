import type { DeathRecord, HistoryEntityData } from "$lib/bindings";

export function normalizeDeathRecord(record: DeathRecord): DeathRecord {
  const participantBuffs = Array.isArray(record.participantBuffs)
    ? record.participantBuffs.map((participant) => ({
        ...participant,
        buffs: Array.isArray(participant.buffs) ? participant.buffs : [],
      }))
    : [];

  return {
    ...record,
    recentDamages: Array.isArray(record.recentDamages)
      ? record.recentDamages
      : [],
    victimBuffs: Array.isArray(record.victimBuffs) ? record.victimBuffs : [],
    participantBuffs,
  };
}

export function normalizeDeathRecords(records: DeathRecord[] | null | undefined) {
  return (records ?? []).map(normalizeDeathRecord);
}

export function normalizeHistoryEntities(
  entities: HistoryEntityData[] | null | undefined,
) {
  return (entities ?? []).map((entity) => ({
    ...entity,
    deaths: normalizeDeathRecords(entity.deaths),
  }));
}
