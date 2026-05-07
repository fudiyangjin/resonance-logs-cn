#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DIR_NAME = "com.resonance-logs-cn";
const DEFAULT_EVENT_LIMIT = 80;
const DEFAULT_MAX_ROWS = 120;
const DEFAULT_MAX_INTERVAL_MS = 30_000;

const repoRoot = process.cwd();
const defaultEventRoot = process.env.APPDATA
  ? path.join(process.env.APPDATA, APP_DIR_NAME, "EventLogs")
  : path.join(os.homedir(), "AppData", "Roaming", APP_DIR_NAME, "EventLogs");

function parseArgs(argv) {
  const options = {
    eventRoot: defaultEventRoot,
    latest: DEFAULT_EVENT_LIMIT,
    all: false,
    playerUid: null,
    sourceQuery: null,
    outJson: path.join(repoRoot, "DEV_exports", "modifier-uptime-skill-activity.json"),
    outMd: path.join(repoRoot, "DEV_exports", "modifier-uptime-skill-activity.md"),
    outCsv: path.join(repoRoot, "DEV_exports", "modifier-uptime-skill-activity.csv"),
    maxRows: DEFAULT_MAX_ROWS,
    maxIntervalMs: DEFAULT_MAX_INTERVAL_MS,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    switch (arg) {
      case "--event-root":
        options.eventRoot = path.resolve(next());
        break;
      case "--latest":
        options.latest = Number(next());
        break;
      case "--all":
        options.all = true;
        break;
      case "--player-uid":
        options.playerUid = Number(next());
        break;
      case "--source-query":
        options.sourceQuery = next();
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--out-csv":
        options.outCsv = path.resolve(next());
        break;
      case "--max-rows":
        options.maxRows = Number(next());
        break;
      case "--max-interval-ms":
        options.maxIntervalMs = Number(next());
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Modifier Uptime Skill Activity - offline report for active-source windows.

Usage:
  node scripts/analyze-modifier-uptime-skill-activity.mjs [options]

Options:
  --event-root <dir>       EventLogs root. Default: ${defaultEventRoot}
  --latest <count>         Latest normal event log files to scan. Default: ${DEFAULT_EVENT_LIMIT}
  --all                    Scan all normal event JSON files under the event root.
  --player-uid <uid>       Restrict to one player UID.
  --source-query <text>    Add a focused Markdown section for matching sources.
  --out-json <path>        JSON report path. Default: DEV_exports/modifier-uptime-skill-activity.json
  --out-md <path>          Markdown report path. Default: DEV_exports/modifier-uptime-skill-activity.md
  --out-csv <path>         CSV report path. Default: DEV_exports/modifier-uptime-skill-activity.csv
  --max-rows <count>       Max rows per Markdown section. Default: ${DEFAULT_MAX_ROWS}
  --max-interval-ms <ms>   Cap open snapshot windows. Default: ${DEFAULT_MAX_INTERVAL_MS}
  --help                   Show this help.

Notes:
  This is not exact damage contribution math. It measures sources that were active
  in player snapshots, then counts skill hit/damage deltas observed during those
  active windows. Active wall time is estimated from player state snapshots; skill
  interval coverage is per-skill and can overlap across skills.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function walkJsonFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, result);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      result.push(fullPath);
    }
  }
  return result;
}

function fileMtime(filePath) {
  return fs.statSync(filePath).mtimeMs;
}

function compactFile(filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return filePath;
}

function fileLabel(filePath) {
  return path.basename(filePath);
}

function asArray(value) {
  if (value instanceof Set) return [...value];
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueNumbers(values) {
  return [...new Set(asArray(values).map(finiteNumber).filter((value) => value !== null))];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map((value) => String(value)).filter(Boolean))];
}

function setToSortedNumbers(set) {
  return [...set].sort((left, right) => left - right);
}

function setToSortedStrings(set) {
  return [...set].sort((left, right) => left.localeCompare(right));
}

function addToMapList(map, key, value, dedupeKey = null) {
  const list = map.get(key) ?? [];
  if (!dedupeKey || !list.some((existing) => dedupeKey(existing) === dedupeKey(value))) {
    list.push(value);
  }
  map.set(key, list);
}

function addToMapSet(map, key, value) {
  const set = map.get(key) ?? new Set();
  set.add(value);
  map.set(key, set);
}

function pickName(row) {
  return (
    row?.sourceNames?.en ??
    row?.familyNames?.en ??
    row?.DisplayNames?.en ??
    row?.DamageNames?.en ??
    row?.Names?.en ??
    row?.sourceName ??
    row?.familyName ??
    row?.DisplayName ??
    row?.DamageName ??
    row?.Name ??
    null
  );
}

function rawJson(entry) {
  if (!entry?.raw) return null;
  try {
    return JSON.parse(entry.raw);
  } catch {
    return null;
  }
}

function statValue(stats, snake, camel = snake) {
  const value = stats?.[snake] ?? stats?.[camel];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function decodeProfessionTalentNodeId(nodeId) {
  const id = finiteNumber(nodeId);
  if (id === null) return null;
  if (id >= 1_000_000) return Math.floor(id / 1000);
  return null;
}

function professionTalentSourcePairs(nodeIds) {
  const pairs = [];
  for (const nodeId of uniqueNumbers(nodeIds)) {
    const sourceEntityId = decodeProfessionTalentNodeId(nodeId);
    if (sourceEntityId !== null) pairs.push({ nodeId, sourceEntityId });
  }
  return pairs;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return Math.round(number).toLocaleString("en-US");
}

function formatDecimal(value, places = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return number.toFixed(places);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return `${(number * 100).toFixed(2)}%`;
}

function formatDuration(ms) {
  const number = Number(ms);
  if (!Number.isFinite(number) || number <= 0) return "0s";
  const totalSeconds = Math.round(number / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function shortList(values, limit = 6) {
  const list = asArray(values).filter((value) => value !== null && value !== undefined && value !== "");
  if (list.length <= limit) return list.join(", ");
  return `${list.slice(0, limit).join(", ")} +${list.length - limit} more`;
}

function targetIdsFromSource(source) {
  const targetDamageIds = [];
  const targetRecountIds = [];
  for (const target of asArray(source?.targets)) {
    if (target.targetKind === "damage") {
      const damageId = finiteNumber(target.damageId ?? target.targetId);
      if (damageId !== null) targetDamageIds.push(damageId);
      const parentRecountId = finiteNumber(target.parentRecountId);
      if (parentRecountId !== null) targetRecountIds.push(parentRecountId);
    }
    if (target.targetKind === "recount") {
      const recountId = finiteNumber(target.recountId ?? target.targetId);
      if (recountId !== null) targetRecountIds.push(recountId);
    }
  }
  return {
    targetDamageIds: uniqueNumbers(targetDamageIds),
    targetRecountIds: uniqueNumbers(targetRecountIds),
  };
}

function normalizeGeneratedSource(source) {
  const sourceId = String(source?.sourceId ?? "");
  const sourceEntityId = finiteNumber(source?.sourceEntityId);
  const targets = targetIdsFromSource(source);
  return {
    sourceId,
    sourceKind: source?.sourceKind ?? "unknown",
    sourceType: source?.sourceType ?? "unknown",
    sourceName: pickName(source) ?? sourceId,
    sourceEntityId,
    runtimeDetection: source?.runtimeDetection ?? null,
    buffIds: uniqueNumbers(source?.buffIds),
    cleanDescription: source?.cleanDescriptions?.en ?? source?.modifierEvidence?.cleanDescription ?? null,
    targetDamageIds: targets.targetDamageIds,
    targetRecountIds: targets.targetRecountIds,
  };
}

function factorSourceRow(buffId, factor) {
  return {
    sourceId: `phantom-factor:${buffId}`,
    sourceKind: "phantom-factor",
    sourceType: "season-phantom-factor",
    sourceName: factor?.familyNames?.en ?? factor?.familyName ?? `Phantom Factor ${buffId}`,
    sourceEntityId: finiteNumber(factor?.buffId ?? buffId),
    runtimeDetection: "active-buff",
    buffIds: [buffId],
    cleanDescription: factor?.cleanDescriptions?.en ?? null,
    targetDamageIds: uniqueNumbers(factor?.affectedDamageIds),
    targetRecountIds: uniqueNumbers(factor?.affectedRecountIds),
  };
}

function fallbackSourceRow(sourceId, sourceKind, sourceType, sourceName, sourceEntityId = null, buffIds = []) {
  return {
    sourceId,
    sourceKind,
    sourceType,
    sourceName,
    sourceEntityId,
    runtimeDetection: "runtime-only",
    buffIds: uniqueNumbers(buffIds),
    cleanDescription: null,
    targetDamageIds: [],
    targetRecountIds: [],
  };
}

function buildGeneratedIndex() {
  const recount = readGenerated("RecountTable.json");
  const breakdown = readGenerated("SkillBreakdownDetails.json");
  const effectSources = readGenerated("EffectSources.json");
  const factors = readGenerated("SeasonPhantomFactors.json");
  const buffNames = readGenerated("BuffName.json");

  const damageToRecount = new Map();
  const damageNames = new Map();
  const recountNames = new Map();
  const buffNamesById = new Map();
  const factorByBuffId = new Map();
  const sourceRowsById = new Map();
  const sourceRowsByEntityId = new Map();
  const sourceRowsByBuffId = new Map();
  const sources = [];

  const addDamageToRecount = (damageId, recountId, name, reason) => {
    if (damageId === null || recountId === null) return;
    addToMapList(damageToRecount, damageId, { recountId, name: name ?? `Recount ${recountId}`, reason }, (item) => item.recountId);
  };

  for (const [recountIdText, row] of Object.entries(recount)) {
    const recountId = finiteNumber(recountIdText);
    if (recountId === null) continue;
    const name = row.Names?.en ?? row.Name ?? row.RecountName ?? `Recount ${recountId}`;
    recountNames.set(recountId, name);
    for (const damageId of uniqueNumbers(row.DamageId)) addDamageToRecount(damageId, recountId, name, "RecountTable.DamageId");
  }

  for (const [damageIdText, row] of Object.entries(breakdown)) {
    const damageId = finiteNumber(damageIdText);
    if (damageId === null) continue;
    damageNames.set(damageId, pickName(row) ?? `Damage ${damageId}`);
    const parentRecountId = finiteNumber(row.ParentRecountId ?? row.parentRecountId);
    if (parentRecountId !== null) {
      const parentName = row.ParentRecountNames?.en ?? row.ParentRecountName ?? recountNames.get(parentRecountId) ?? `Recount ${parentRecountId}`;
      addDamageToRecount(damageId, parentRecountId, parentName, "SkillBreakdownDetails.ParentRecountId");
    }
  }

  for (const row of Array.isArray(buffNames) ? buffNames : []) {
    const buffId = finiteNumber(row.Id ?? row.id);
    if (buffId === null) continue;
    const name = row.Names?.en ?? row.Name ?? row.NameDesign ?? row.DesignName;
    if (name) buffNamesById.set(buffId, name);
  }

  for (const [buffIdText, row] of Object.entries(factors.factorsByBuffId ?? {})) {
    const buffId = finiteNumber(buffIdText);
    if (buffId !== null) factorByBuffId.set(buffId, row);
  }

  for (const rawSource of Object.values(effectSources.effectSourcesById ?? {})) {
    const source = normalizeGeneratedSource(rawSource);
    if (!source.sourceId) continue;
    sources.push(source);
    sourceRowsById.set(source.sourceId, source);
    if (source.sourceEntityId !== null) addToMapList(sourceRowsByEntityId, source.sourceEntityId, source, (item) => item.sourceId);
    for (const buffId of source.buffIds) addToMapList(sourceRowsByBuffId, buffId, source, (item) => item.sourceId);
  }

  for (const [buffIdText, sourceIds] of Object.entries(effectSources.buffIdToEffectSourceIds ?? {})) {
    const buffId = finiteNumber(buffIdText);
    if (buffId === null) continue;
    for (const sourceId of uniqueStrings(sourceIds)) {
      const source = sourceRowsById.get(sourceId);
      if (source) addToMapList(sourceRowsByBuffId, buffId, source, (item) => item.sourceId);
    }
  }

  return {
    damageToRecount,
    damageNames,
    recountNames,
    buffNamesById,
    factorByBuffId,
    sourceRowsById,
    sourceRowsByEntityId,
    sourceRowsByBuffId,
    generatedSourceCount: sources.length,
  };
}

function findInputFiles(options) {
  const allFiles = walkJsonFiles(options.eventRoot).sort((left, right) => fileMtime(right) - fileMtime(left));
  const isCensus = (filePath) => filePath.includes(`${path.sep}AttributionCensus${path.sep}`);
  const eventFiles = allFiles.filter((filePath) => !isCensus(filePath));
  return {
    eventFiles: options.all ? eventFiles : eventFiles.slice(0, options.latest),
    totalEventFiles: eventFiles.length,
  };
}

function emptyRuntimeState() {
  return {
    activeBuffIds: new Set(),
    activeFactorBuffIds: new Set(),
    activeFactorItemBuffIds: new Set(),
    activeFactorItemGradesByBuffId: new Map(),
    activeEffectBuffIds: new Set(),
    activeEffectSourceIds: new Set(),
    activePassiveSkillIds: new Set(),
    activePassiveSkillUuids: new Set(),
    activeProfessionTalentNodeIds: new Set(),
    activeProfessionTalentStageCfgIds: new Set(),
    activeBuffActorsByBuffId: new Map(),
  };
}

function addNumbersToSet(set, values) {
  for (const value of uniqueNumbers(values)) set.add(value);
}

function addStringsToSet(set, values) {
  for (const value of uniqueStrings(values)) set.add(value);
}

function addFactorItem(state, item) {
  const buffId = finiteNumber(item?.factorBuffId ?? item?.factor_buff_id);
  if (buffId === null) return;
  state.activeFactorItemBuffIds.add(buffId);
  const grade = finiteNumber(item?.grade);
  if (grade !== null) addToMapSet(state.activeFactorItemGradesByBuffId, buffId, grade);
}

function addBuffActor(state, buffId, raw, kind) {
  const id = finiteNumber(buffId);
  if (id === null) return;
  const hostUid = finiteNumber(raw?.hostUid ?? raw?.host_uid);
  const sourceUid = finiteNumber(raw?.sourceUid ?? raw?.source_uid);
  const parts = [kind];
  if (hostUid !== null) parts.push(`host:${hostUid}`);
  if (sourceUid !== null) parts.push(`source:${sourceUid}`);
  if (parts.length > 1) addToMapSet(state.activeBuffActorsByBuffId, id, parts.join("|"));
}

function parseActorHint(hint) {
  const parts = String(hint ?? "").split("|").filter(Boolean);
  const parsed = {
    kind: parts[0] ?? "unknown",
    hostUid: null,
    sourceUid: null,
  };
  for (const part of parts.slice(1)) {
    const [key, value] = part.split(":");
    const number = finiteNumber(value);
    if (key === "host") parsed.hostUid = number;
    if (key === "source") parsed.sourceUid = number;
  }
  return parsed;
}

function summarizeActorHints(actorHints) {
  const hostUids = new Set();
  const sourceUids = new Set();
  const externalSourceUids = new Set();
  const selfSourceUids = new Set();
  const kinds = new Set();

  for (const hint of actorHints ?? []) {
    const parsed = parseActorHint(hint);
    if (parsed.kind) kinds.add(parsed.kind);
    if (parsed.hostUid !== null) hostUids.add(parsed.hostUid);
    if (parsed.sourceUid !== null) sourceUids.add(parsed.sourceUid);
    if (parsed.hostUid !== null && parsed.sourceUid !== null) {
      if (parsed.hostUid === parsed.sourceUid) {
        selfSourceUids.add(parsed.sourceUid);
      } else {
        externalSourceUids.add(parsed.sourceUid);
      }
    }
  }

  return {
    kinds: setToSortedStrings(kinds),
    hostUids: setToSortedNumbers(hostUids),
    sourceUids: setToSortedNumbers(sourceUids),
    externalSourceUids: setToSortedNumbers(externalSourceUids),
    selfSourceUids: setToSortedNumbers(selfSourceUids),
    externalSourceCount: externalSourceUids.size,
    selfSourceCount: selfSourceUids.size,
  };
}

function normalizePlayerSnapshot(entry) {
  const raw = rawJson(entry);
  if (!raw) return null;
  const uid = finiteNumber(raw.uid ?? raw.playerUid ?? entry.uid ?? entry.sourceUid ?? entry.source_uid);
  if (uid === null) return null;
  const classId = finiteNumber(raw.classId ?? raw.class_id);

  const state = emptyRuntimeState();
  const activeBuffs = asArray(raw.activeBuffs ?? raw.active_buffs);
  addNumbersToSet(
    state.activeBuffIds,
    activeBuffs.map((buff) => buff.base_id ?? buff.baseId),
  );
  for (const buff of activeBuffs) addBuffActor(state, buff.base_id ?? buff.baseId, buff, "active");

  const activeFactorBuffs = asArray(raw.activeFactorBuffs ?? raw.active_factor_buffs);
  addNumbersToSet(
    state.activeFactorBuffIds,
    activeFactorBuffs.map((buff) => buff.factor_buff_id ?? buff.factorBuffId),
  );
  for (const buff of activeFactorBuffs) addBuffActor(state, buff.factor_buff_id ?? buff.factorBuffId, buff, "factor");
  for (const item of asArray(raw.activeFactorItems ?? raw.active_factor_items)) addFactorItem(state, item);

  const activeEffectBuffIds = [];
  for (const buff of asArray(raw.activeEffectBuffs ?? raw.active_effect_buffs)) {
    activeEffectBuffIds.push(buff.effect_source_buff_id ?? buff.effectSourceBuffId);
    activeEffectBuffIds.push(buff.observed_buff_id ?? buff.observedBuffId);
    activeEffectBuffIds.push(buff.source_config_id ?? buff.sourceConfigId);
    addBuffActor(state, buff.effect_source_buff_id ?? buff.effectSourceBuffId, buff, "effect");
    addBuffActor(state, buff.observed_buff_id ?? buff.observedBuffId, buff, "effect-observed");
    addBuffActor(state, buff.source_config_id ?? buff.sourceConfigId, buff, "effect-source-config");
  }
  addNumbersToSet(state.activeEffectBuffIds, activeEffectBuffIds);
  addStringsToSet(
    state.activeEffectSourceIds,
    asArray(raw.activeEffectSources ?? raw.active_effect_sources).map((source) => source.source_id ?? source.sourceId),
  );

  const activePassiveSkills = asArray(raw.activePassiveSkills ?? raw.active_passive_skills);
  addNumbersToSet(
    state.activePassiveSkillIds,
    activePassiveSkills.map((skill) => skill.skill_id ?? skill.skillId),
  );
  addNumbersToSet(
    state.activePassiveSkillUuids,
    activePassiveSkills.map((skill) => skill.passive_uuid ?? skill.passiveUuid),
  );

  const activeProfessionTalents = asArray(raw.activeProfessionTalents ?? raw.active_profession_talents);
  const activeCurrentProfessionTalents = activeProfessionTalents.filter((talent) => {
    const professionId = finiteNumber(talent.profession_id ?? talent.professionId);
    return professionId === null || classId === null || classId <= 0 || professionId === classId;
  });
  addNumbersToSet(
    state.activeProfessionTalentNodeIds,
    activeCurrentProfessionTalents.map((talent) => talent.talent_node_id ?? talent.talentNodeId),
  );
  addNumbersToSet(
    state.activeProfessionTalentStageCfgIds,
    activeCurrentProfessionTalents.map((talent) => talent.talent_stage_cfg_id ?? talent.talentStageCfgId),
  );

  return {
    file: null,
    tsMs: Number(entry.tsMs ?? entry.ts_ms ?? 0),
    uid,
    name: raw.name ?? entry.nameHint ?? entry.name_hint ?? entry.sourceLabel ?? entry.source_label ?? null,
    classId,
    classSpec: raw.classSpec ?? raw.class_spec ?? null,
    state,
  };
}

function normalizeSkillSnapshot(entry) {
  const raw = rawJson(entry);
  if (!raw) return null;
  const stats = raw.stats ?? {};
  const skillId = finiteNumber(raw.skillId ?? raw.skill_id ?? entry.uid);
  const playerUid = finiteNumber(raw.playerUid ?? raw.player_uid ?? entry.sourceUid ?? entry.source_uid);
  if (skillId === null || playerUid === null) return null;

  return {
    file: null,
    tsMs: Number(entry.tsMs ?? entry.ts_ms ?? 0),
    category: entry.category,
    playerUid,
    playerName: raw.playerName ?? raw.player_name ?? entry.sourceLabel ?? entry.source_label ?? null,
    targetUid: finiteNumber(raw.targetUid ?? raw.target_uid ?? entry.targetUid ?? entry.target_uid),
    targetName: raw.targetName ?? raw.target_name ?? entry.targetLabel ?? entry.target_label ?? null,
    skillId,
    total: statValue(stats, "total_value", "totalValue"),
    effectiveTotal: statValue(stats, "effective_total_value", "effectiveTotalValue"),
    hits: statValue(stats, "hits"),
    critHits: statValue(stats, "crit_hits", "critHits"),
    luckyHits: statValue(stats, "lucky_hits", "luckyHits"),
  };
}

function latestSnapshotAt(snapshots, tsMs) {
  let low = 0;
  let high = snapshots.length - 1;
  let best = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (snapshots[mid].tsMs <= tsMs) {
      best = snapshots[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function groupKeyForSkill(snapshot) {
  return [
    snapshot.file,
    snapshot.category,
    snapshot.playerUid,
    snapshot.category === "player_target_skill_damage" ? (snapshot.targetUid ?? "targetless") : "all-targets",
    snapshot.skillId,
  ].join("|");
}

function sourceKey(source) {
  return source.sourceId || `${source.sourceKind}:${source.sourceEntityId ?? source.sourceName}`;
}

function addSourceObservation(map, source, evidence, actorHints = []) {
  const key = sourceKey(source);
  let existing = map.get(key);
  if (!existing) {
    existing = {
      ...source,
      sourceId: key,
      buffIds: new Set(source.buffIds ?? []),
      targetDamageIds: new Set(source.targetDamageIds ?? []),
      targetRecountIds: new Set(source.targetRecountIds ?? []),
      evidence: new Set(),
      actorHints: new Set(),
    };
    map.set(key, existing);
  }
  for (const buffId of uniqueNumbers(source.buffIds)) existing.buffIds.add(buffId);
  for (const damageId of uniqueNumbers(source.targetDamageIds)) existing.targetDamageIds.add(damageId);
  for (const recountId of uniqueNumbers(source.targetRecountIds)) existing.targetRecountIds.add(recountId);
  for (const item of uniqueStrings(evidence)) existing.evidence.add(item);
  for (const hint of uniqueStrings(actorHints)) existing.actorHints.add(hint);
}

function entityRows(index, entityId, predicate) {
  const rows = index.sourceRowsByEntityId.get(entityId) ?? [];
  return rows.filter(predicate);
}

function sourceHasActiveBuff(source, activeBuffIds) {
  const buffIds = uniqueNumbers(source.buffIds);
  if (buffIds.length === 0) return true;
  return buffIds.some((buffId) => activeBuffIds.has(buffId));
}

function addBuffSourceObservations(map, buffId, state, index) {
  const evidence = [];
  if (state.activeFactorBuffIds.has(buffId)) evidence.push(`activeFactorBuff:${buffId}`);
  if (state.activeBuffIds.has(buffId)) evidence.push(`activeBuff:${buffId}`);
  if (state.activeEffectBuffIds.has(buffId)) evidence.push(`activeEffectBuff:${buffId}`);
  if (state.activeFactorItemBuffIds.has(buffId)) {
    const grades = setToSortedNumbers(state.activeFactorItemGradesByBuffId.get(buffId) ?? new Set());
    evidence.push(`activeFactorItem:${buffId}${grades.length ? `:G${grades.join("/")}` : ""}`);
  }
  const actorHints = setToSortedStrings(state.activeBuffActorsByBuffId.get(buffId) ?? new Set());
  const rows = index.sourceRowsByBuffId.get(buffId) ?? [];
  if (rows.length > 0) {
    for (const row of rows) addSourceObservation(map, row, evidence, actorHints);
    return;
  }

  const factor = index.factorByBuffId.get(buffId);
  if (factor) {
    addSourceObservation(map, factorSourceRow(buffId, factor), evidence, actorHints);
    return;
  }

  addSourceObservation(map, fallbackSourceRow(`active-buff:${buffId}`, "active-buff", "runtime-buff", index.buffNamesById.get(buffId) ?? `Active Buff ${buffId}`, buffId, [buffId]), evidence, actorHints);
}

function activeSourcesFromState(state, index) {
  const observations = new Map();
  const activeBuffIds = new Set([
    ...state.activeBuffIds,
    ...state.activeFactorBuffIds,
    ...state.activeFactorItemBuffIds,
    ...state.activeEffectBuffIds,
  ]);
  for (const buffId of activeBuffIds) addBuffSourceObservations(observations, buffId, state, index);

  for (const sourceId of state.activeEffectSourceIds) {
    const source = index.sourceRowsById.get(sourceId);
    const row = source ?? fallbackSourceRow(`effect-source:${sourceId}`, "effect-source", "runtime-effect-source", `Effect Source ${sourceId}`, null, []);
    addSourceObservation(observations, row, [`activeEffectSource:${sourceId}`], []);
  }

  for (const skillId of state.activePassiveSkillIds) {
    const rows = entityRows(index, skillId, (row) => row.sourceKind === "passive-skill" || row.sourceType === "passive-skill");
    if (rows.length > 0) {
      for (const row of rows) addSourceObservation(observations, row, [`activePassiveSkill:${skillId}`], []);
    } else {
      addSourceObservation(observations, fallbackSourceRow(`passive-skill:${skillId}`, "passive-skill", "runtime-passive", `Passive Skill ${skillId}`, skillId, []), [`activePassiveSkill:${skillId}`], []);
    }
  }

  for (const pair of professionTalentSourcePairs(setToSortedNumbers(state.activeProfessionTalentNodeIds))) {
    const rows = entityRows(index, pair.sourceEntityId, (row) => row.sourceKind === "talent-passive" && row.sourceType === "talent");
    const evidence = [`activeProfessionTalentNode:${pair.nodeId}->talent:${pair.sourceEntityId}`];
    if (rows.length > 0) {
      for (const row of rows) {
        if (sourceHasActiveBuff(row, activeBuffIds)) addSourceObservation(observations, row, evidence, []);
      }
    } else {
      addSourceObservation(
        observations,
        fallbackSourceRow(`profession-talent:${pair.sourceEntityId}`, "profession-talent", "runtime-talent", `Profession Talent ${pair.sourceEntityId}`, pair.sourceEntityId, []),
        evidence,
        [],
      );
    }
  }

  for (const stageCfgId of state.activeProfessionTalentStageCfgIds) {
    const rows = entityRows(index, stageCfgId, (row) => row.sourceKind === "talent-passive" && row.sourceType === "talent");
    const evidence = [`activeProfessionTalentStage:${stageCfgId}`];
    if (rows.length > 0) {
      for (const row of rows) addSourceObservation(observations, row, evidence, []);
    } else {
      addSourceObservation(
        observations,
        fallbackSourceRow(`profession-talent-stage:${stageCfgId}`, "profession-talent-stage", "runtime-talent-stage", `Profession Talent Stage ${stageCfgId}`, stageCfgId, []),
        evidence,
        [],
      );
    }
  }

  return [...observations.values()].map((source) => ({
    ...source,
    buffIds: setToSortedNumbers(source.buffIds),
    targetDamageIds: setToSortedNumbers(source.targetDamageIds),
    targetRecountIds: setToSortedNumbers(source.targetRecountIds),
    evidence: setToSortedStrings(source.evidence),
    actorHints: setToSortedStrings(source.actorHints),
  }));
}

function targetMatchForSource(source, damageId, recountId) {
  const targetDamageIds = new Set(source.targetDamageIds ?? []);
  const targetRecountIds = new Set(source.targetRecountIds ?? []);
  if (targetDamageIds.has(damageId) || targetRecountIds.has(recountId)) return "direct-static-target";
  if (targetDamageIds.size === 0 && targetRecountIds.size === 0) return "no-static-target";
  return "other-static-target";
}

function recountRowsForDamage(damageId, index) {
  const rows = index.damageToRecount.get(damageId) ?? [];
  if (rows.length > 0) {
    const seen = new Set();
    return rows.filter((row) => {
      if (seen.has(row.recountId)) return false;
      seen.add(row.recountId);
      return true;
    });
  }
  return [
    {
      recountId: damageId,
      name: index.damageNames.get(damageId) ?? `Damage ${damageId}`,
      reason: "fallback-damage-as-parent",
    },
  ];
}

function makeUptimeBucket(source) {
  return {
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceKind: source.sourceKind,
    sourceType: source.sourceType,
    runtimeDetection: source.runtimeDetection,
    sourceEntityId: source.sourceEntityId,
    buffIds: new Set(source.buffIds ?? []),
    evidence: new Set(source.evidence ?? []),
    actorHints: new Set(source.actorHints ?? []),
    files: new Set(),
    playerUids: new Set(),
    playerNames: new Set(),
    windows: 0,
    trailingWindows: 0,
    cappedWindows: 0,
    rawActiveMs: 0,
    cappedActiveMs: 0,
  };
}

function addUptime(sourceUptime, source, snapshot, filePath, rawMs, cappedMs, capped, trailing) {
  const key = sourceKey(source);
  let bucket = sourceUptime.get(key);
  if (!bucket) {
    bucket = makeUptimeBucket(source);
    sourceUptime.set(key, bucket);
  }
  for (const buffId of uniqueNumbers(source.buffIds)) bucket.buffIds.add(buffId);
  for (const evidence of uniqueStrings(source.evidence)) bucket.evidence.add(evidence);
  for (const hint of uniqueStrings(source.actorHints)) bucket.actorHints.add(hint);
  bucket.files.add(fileLabel(filePath));
  bucket.playerUids.add(snapshot.uid);
  if (snapshot.name) bucket.playerNames.add(snapshot.name);
  bucket.windows += 1;
  if (trailing) bucket.trailingWindows += 1;
  if (capped) bucket.cappedWindows += 1;
  bucket.rawActiveMs += rawMs;
  bucket.cappedActiveMs += cappedMs;
}

function makeActivityBucket(source, interval, recountRow, targetMatch) {
  return {
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceKind: source.sourceKind,
    sourceType: source.sourceType,
    runtimeDetection: source.runtimeDetection,
    sourceEntityId: source.sourceEntityId,
    buffIds: new Set(source.buffIds ?? []),
    targetDamageIds: new Set(source.targetDamageIds ?? []),
    targetRecountIds: new Set(source.targetRecountIds ?? []),
    sourceEvidence: new Set(source.evidence ?? []),
    actorHints: new Set(source.actorHints ?? []),
    targetMatch,
    recountId: recountRow.recountId,
    recountName: recountRow.name,
    damageId: interval.skillId,
    damageName: interval.damageName,
    category: interval.category,
    files: new Set(),
    playerUids: new Set(),
    playerNames: new Set(),
    targetUids: new Set(),
    targetNames: new Set(),
    intervalCount: 0,
    cappedIntervals: 0,
    rawSkillIntervalMs: 0,
    cappedSkillIntervalMs: 0,
    deltaHits: 0,
    deltaCritHits: 0,
    deltaLuckyHits: 0,
    deltaTotal: 0,
    deltaEffectiveTotal: 0,
    firstSeenMs: null,
    lastSeenMs: null,
    examples: [],
  };
}

function addActivity(activity, source, interval, recountRow, targetMatch, options) {
  const key = [source.sourceId, recountRow.recountId, interval.skillId, targetMatch].join("|");
  let bucket = activity.get(key);
  if (!bucket) {
    bucket = makeActivityBucket(source, interval, recountRow, targetMatch);
    activity.set(key, bucket);
  }

  const rawMs = Math.max(0, interval.elapsedMs);
  const cappedMs = Math.min(rawMs, options.maxIntervalMs);
  for (const buffId of uniqueNumbers(source.buffIds)) bucket.buffIds.add(buffId);
  for (const damageId of uniqueNumbers(source.targetDamageIds)) bucket.targetDamageIds.add(damageId);
  for (const recountId of uniqueNumbers(source.targetRecountIds)) bucket.targetRecountIds.add(recountId);
  for (const evidence of uniqueStrings(source.evidence)) bucket.sourceEvidence.add(evidence);
  for (const hint of uniqueStrings(source.actorHints)) bucket.actorHints.add(hint);
  bucket.files.add(fileLabel(interval.file));
  bucket.playerUids.add(interval.playerUid);
  if (interval.playerName) bucket.playerNames.add(interval.playerName);
  if (interval.targetUid !== null && interval.targetUid !== undefined) bucket.targetUids.add(interval.targetUid);
  if (interval.targetName) bucket.targetNames.add(interval.targetName);
  bucket.intervalCount += 1;
  if (rawMs > options.maxIntervalMs) bucket.cappedIntervals += 1;
  bucket.rawSkillIntervalMs += rawMs;
  bucket.cappedSkillIntervalMs += cappedMs;
  bucket.deltaHits += interval.deltaHits;
  bucket.deltaCritHits += interval.deltaCritHits;
  bucket.deltaLuckyHits += interval.deltaLuckyHits;
  bucket.deltaTotal += interval.deltaTotal;
  bucket.deltaEffectiveTotal += interval.deltaEffectiveTotal;
  bucket.firstSeenMs = bucket.firstSeenMs === null ? interval.tsMs : Math.min(bucket.firstSeenMs, interval.tsMs);
  bucket.lastSeenMs = bucket.lastSeenMs === null ? interval.tsMs : Math.max(bucket.lastSeenMs, interval.tsMs);
  if (bucket.examples.length < 5) {
    bucket.examples.push({
      file: fileLabel(interval.file),
      tsMs: interval.tsMs,
      playerName: interval.playerName,
      targetName: interval.targetName,
      hits: interval.deltaHits,
      total: Math.round(interval.deltaTotal),
      evidence: source.evidence.slice(0, 8),
    });
  }
}

function scanEventFiles(eventFiles, index, options) {
  const playerSnapshotsByFilePlayer = new Map();
  const skillSnapshotsByGroup = new Map();
  const fileMaxTs = new Map();
  const sourceUptime = new Map();
  const activity = new Map();
  const counters = {
    eventFilesRead: 0,
    unreadableFiles: 0,
    eventEntries: 0,
    playerSnapshots: 0,
    skillSnapshots: 0,
    targetSkillSnapshots: 0,
    playerStateWindows: 0,
    playerStateTrailingWindows: 0,
    skillIntervals: 0,
    skillIntervalsWithPlayerState: 0,
    skillIntervalsWithActiveSources: 0,
    activityRowsTouched: 0,
    targetMatchCounts: {
      "direct-static-target": 0,
      "no-static-target": 0,
      "other-static-target": 0,
    },
  };

  for (const filePath of eventFiles) {
    let payload;
    try {
      payload = readJson(filePath);
    } catch {
      counters.unreadableFiles += 1;
      continue;
    }
    counters.eventFilesRead += 1;
    let maxTs = 0;
    for (const entry of asArray(payload.entries)) {
      counters.eventEntries += 1;
      const tsMs = Number(entry.tsMs ?? entry.ts_ms ?? 0);
      if (Number.isFinite(tsMs)) maxTs = Math.max(maxTs, tsMs);
      if (entry.action !== "snapshot") continue;

      if (entry.category === "player") {
        const snapshot = normalizePlayerSnapshot(entry);
        if (!snapshot) continue;
        if (options.playerUid !== null && snapshot.uid !== options.playerUid) continue;
        snapshot.file = filePath;
        const key = `${filePath}|${snapshot.uid}`;
        const list = playerSnapshotsByFilePlayer.get(key) ?? [];
        list.push(snapshot);
        playerSnapshotsByFilePlayer.set(key, list);
        counters.playerSnapshots += 1;
        continue;
      }

      if (entry.category === "player_skill_damage" || entry.category === "player_target_skill_damage") {
        const snapshot = normalizeSkillSnapshot(entry);
        if (!snapshot) continue;
        if (options.playerUid !== null && snapshot.playerUid !== options.playerUid) continue;
        snapshot.file = filePath;
        const key = groupKeyForSkill(snapshot);
        const list = skillSnapshotsByGroup.get(key) ?? [];
        list.push(snapshot);
        skillSnapshotsByGroup.set(key, list);
        counters.skillSnapshots += 1;
        if (entry.category === "player_target_skill_damage") counters.targetSkillSnapshots += 1;
      }
    }
    fileMaxTs.set(filePath, maxTs);
  }

  for (const snapshots of playerSnapshotsByFilePlayer.values()) {
    snapshots.sort((left, right) => left.tsMs - right.tsMs);
    for (let indexInList = 0; indexInList < snapshots.length; indexInList += 1) {
      const current = snapshots[indexInList];
      const next = snapshots[indexInList + 1];
      const endTs = next?.tsMs ?? fileMaxTs.get(current.file) ?? current.tsMs;
      const rawMs = endTs - current.tsMs;
      if (!Number.isFinite(rawMs) || rawMs <= 0) continue;
      const cappedMs = Math.min(rawMs, options.maxIntervalMs);
      const activeSources = activeSourcesFromState(current.state, index);
      counters.playerStateWindows += 1;
      if (!next) counters.playerStateTrailingWindows += 1;
      for (const source of activeSources) {
        addUptime(sourceUptime, source, current, current.file, rawMs, cappedMs, rawMs > options.maxIntervalMs, !next);
      }
    }
  }

  for (const snapshots of skillSnapshotsByGroup.values()) {
    snapshots.sort((left, right) => left.tsMs - right.tsMs);
    let previous = null;
    for (const current of snapshots) {
      if (previous) {
        const deltaTotal = current.total - previous.total;
        const deltaEffectiveTotal = current.effectiveTotal - previous.effectiveTotal;
        const deltaHits = current.hits - previous.hits;
        const deltaCritHits = current.critHits - previous.critHits;
        const deltaLuckyHits = current.luckyHits - previous.luckyHits;
        const reset = deltaTotal < 0 || deltaHits < 0 || current.tsMs < previous.tsMs;
        if (!reset && deltaHits > 0 && deltaTotal > 0) {
          counters.skillIntervals += 1;
          const playerSnapshots = playerSnapshotsByFilePlayer.get(`${current.file}|${current.playerUid}`) ?? [];
          const playerSnapshot = latestSnapshotAt(playerSnapshots, current.tsMs);
          if (playerSnapshot) counters.skillIntervalsWithPlayerState += 1;
          const activeSources = playerSnapshot ? activeSourcesFromState(playerSnapshot.state, index) : [];
          if (activeSources.length > 0) counters.skillIntervalsWithActiveSources += 1;
          const interval = {
            file: current.file,
            tsMs: current.tsMs,
            category: current.category,
            playerUid: current.playerUid,
            playerName: current.playerName ?? playerSnapshot?.name ?? null,
            targetUid: current.targetUid,
            targetName: current.targetName,
            skillId: current.skillId,
            damageName: index.damageNames.get(current.skillId) ?? `Damage ${current.skillId}`,
            deltaTotal,
            deltaEffectiveTotal,
            deltaHits,
            deltaCritHits: Math.max(0, deltaCritHits),
            deltaLuckyHits: Math.max(0, deltaLuckyHits),
            elapsedMs: current.tsMs - previous.tsMs,
          };
          for (const recountRow of recountRowsForDamage(current.skillId, index)) {
            for (const source of activeSources) {
              const targetMatch = targetMatchForSource(source, current.skillId, recountRow.recountId);
              counters.targetMatchCounts[targetMatch] += 1;
              addActivity(activity, source, interval, recountRow, targetMatch, options);
              counters.activityRowsTouched += 1;
            }
          }
        }
      }
      previous = current;
    }
  }

  return { counters, sourceUptime, activity };
}

function serializeUptimeBucket(bucket) {
  const actorHints = setToSortedStrings(bucket.actorHints);
  return {
    sourceId: bucket.sourceId,
    sourceName: bucket.sourceName,
    sourceKind: bucket.sourceKind,
    sourceType: bucket.sourceType,
    runtimeDetection: bucket.runtimeDetection,
    sourceEntityId: bucket.sourceEntityId,
    buffIds: setToSortedNumbers(bucket.buffIds),
    evidence: setToSortedStrings(bucket.evidence),
    actorSummary: summarizeActorHints(actorHints),
    files: setToSortedStrings(bucket.files),
    playerUids: setToSortedNumbers(bucket.playerUids),
    playerNames: setToSortedStrings(bucket.playerNames),
    windows: bucket.windows,
    trailingWindows: bucket.trailingWindows,
    cappedWindows: bucket.cappedWindows,
    rawActiveMs: bucket.rawActiveMs,
    cappedActiveMs: bucket.cappedActiveMs,
  };
}

function serializeActivityBucket(bucket, uptimeBySourceId) {
  const actorHints = setToSortedStrings(bucket.actorHints);
  const uptime = uptimeBySourceId.get(bucket.sourceId);
  const cappedActiveMs = uptime?.cappedActiveMs ?? 0;
  const hitsPerActiveMinute = cappedActiveMs > 0 ? bucket.deltaHits / (cappedActiveMs / 60_000) : null;
  return {
    sourceId: bucket.sourceId,
    sourceName: bucket.sourceName,
    sourceKind: bucket.sourceKind,
    sourceType: bucket.sourceType,
    runtimeDetection: bucket.runtimeDetection,
    sourceEntityId: bucket.sourceEntityId,
    buffIds: setToSortedNumbers(bucket.buffIds),
    sourceEvidence: setToSortedStrings(bucket.sourceEvidence),
    actorSummary: summarizeActorHints(actorHints),
    targetMatch: bucket.targetMatch,
    targetDamageIds: setToSortedNumbers(bucket.targetDamageIds),
    targetRecountIds: setToSortedNumbers(bucket.targetRecountIds),
    recountId: bucket.recountId,
    recountName: bucket.recountName,
    damageId: bucket.damageId,
    damageName: bucket.damageName,
    category: bucket.category,
    files: setToSortedStrings(bucket.files),
    playerUids: setToSortedNumbers(bucket.playerUids),
    playerNames: setToSortedStrings(bucket.playerNames),
    targetUids: setToSortedNumbers(bucket.targetUids),
    targetNames: setToSortedStrings(bucket.targetNames),
    intervalCount: bucket.intervalCount,
    cappedIntervals: bucket.cappedIntervals,
    rawSkillIntervalMs: bucket.rawSkillIntervalMs,
    cappedSkillIntervalMs: bucket.cappedSkillIntervalMs,
    sourceCappedActiveMs: cappedActiveMs,
    hitsPerActiveMinute,
    deltaHits: bucket.deltaHits,
    deltaCritHits: bucket.deltaCritHits,
    deltaLuckyHits: bucket.deltaLuckyHits,
    critRate: bucket.deltaHits > 0 ? bucket.deltaCritHits / bucket.deltaHits : null,
    luckyRate: bucket.deltaHits > 0 ? bucket.deltaLuckyHits / bucket.deltaHits : null,
    deltaTotal: bucket.deltaTotal,
    deltaEffectiveTotal: bucket.deltaEffectiveTotal,
    avgDamagePerHit: bucket.deltaHits > 0 ? bucket.deltaTotal / bucket.deltaHits : null,
    firstSeenMs: bucket.firstSeenMs,
    lastSeenMs: bucket.lastSeenMs,
    examples: bucket.examples,
  };
}

function rowMatchesQuery(row, query) {
  if (!query) return false;
  const haystack = [
    row.sourceId,
    row.sourceName,
    row.sourceKind,
    row.sourceType,
    row.runtimeDetection,
    row.sourceEntityId,
    ...(row.buffIds ?? []),
    ...(row.sourceEvidence ?? row.evidence ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function markdownActivityTable(rows, limit) {
  const lines = [
    "| Source | Skill Parent | Damage ID | Match | Hits | Crit | Lucky | Damage | Skill Interval | Active Time | Evidence | Files |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
  ];
  for (const row of rows.slice(0, limit)) {
    lines.push(
      `| ${row.sourceName} | ${row.recountName} | ${row.damageId} | ${row.targetMatch} | ${formatNumber(row.deltaHits)} | ${formatPercent(row.critRate)} | ${formatPercent(row.luckyRate)} | ${formatNumber(row.deltaTotal)} | ${formatDuration(row.cappedSkillIntervalMs)} | ${formatDuration(row.sourceCappedActiveMs)} | ${shortList(row.sourceEvidence, 3)} | ${row.files.length} |`,
    );
  }
  return lines.join("\n");
}

function markdownUptimeTable(rows, limit) {
  const lines = [
    "| Source | Kind | Active Time | Windows | Players | External Sources | Evidence | Files |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |",
  ];
  for (const row of rows.slice(0, limit)) {
    lines.push(
      `| ${row.sourceName} | ${row.sourceKind} | ${formatDuration(row.cappedActiveMs)} | ${formatNumber(row.windows)} | ${row.playerUids.length} | ${row.actorSummary.externalSourceCount} | ${shortList(row.evidence, 3)} | ${row.files.length} |`,
    );
  }
  return lines.join("\n");
}

function buildMarkdown(report, options) {
  const activityRows = report.skillActivity;
  const uptimeRows = report.sourceUptime;
  const directRows = activityRows.filter((row) => row.targetMatch === "direct-static-target");
  const externalRows = activityRows.filter((row) => row.actorSummary.externalSourceCount > 0);
  const queryActivityRows = options.sourceQuery ? activityRows.filter((row) => rowMatchesQuery(row, options.sourceQuery)) : [];
  const queryUptimeRows = options.sourceQuery ? uptimeRows.filter((row) => rowMatchesQuery(row, options.sourceQuery)) : [];
  const lines = [];

  lines.push("# Modifier Uptime Skill Activity");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Event files scanned: ${formatNumber(report.summary.eventFilesScanned)} of ${formatNumber(report.summary.totalEventFiles)}`);
  lines.push(`- Event entries scanned: ${formatNumber(report.counters.eventEntries)}`);
  lines.push(`- Player snapshots: ${formatNumber(report.counters.playerSnapshots)}`);
  lines.push(`- Player state windows: ${formatNumber(report.counters.playerStateWindows)} (${formatNumber(report.counters.playerStateTrailingWindows)} trailing windows)`);
  lines.push(`- Skill snapshots: ${formatNumber(report.counters.skillSnapshots)} (${formatNumber(report.counters.targetSkillSnapshots)} target-specific)`);
  lines.push(`- Usable skill delta intervals: ${formatNumber(report.counters.skillIntervals)}`);
  lines.push(`- Skill intervals with player state: ${formatNumber(report.counters.skillIntervalsWithPlayerState)}`);
  lines.push(`- Skill intervals with active sources: ${formatNumber(report.counters.skillIntervalsWithActiveSources)}`);
  lines.push(`- Source uptime rows: ${formatNumber(uptimeRows.length)}`);
  lines.push(`- Source/skill activity rows: ${formatNumber(activityRows.length)}`);
  lines.push(`- Max snapshot interval cap: ${formatDuration(options.maxIntervalMs)}; raw durations are preserved in JSON/CSV.`);
  lines.push("");
  lines.push("Interpretation: active time is estimated from player snapshot state windows. Skill interval time is per skill snapshot delta coverage, so it can overlap and should not be summed as encounter wall-clock time.");
  lines.push("");

  lines.push("## Top Source Uptime");
  lines.push("");
  lines.push(markdownUptimeTable(uptimeRows, options.maxRows));
  lines.push("");

  lines.push("## Top Skill Activity During Source Uptime");
  lines.push("");
  lines.push(markdownActivityTable(activityRows, options.maxRows));
  lines.push("");

  lines.push("## Direct Static Target Matches");
  lines.push("");
  if (directRows.length > 0) {
    lines.push(markdownActivityTable(directRows, options.maxRows));
  } else {
    lines.push("_No direct static target matches found in this slice._");
  }
  lines.push("");

  lines.push("## External Buff Source Activity");
  lines.push("");
  if (externalRows.length > 0) {
    lines.push(markdownActivityTable(externalRows, options.maxRows));
  } else {
    lines.push("_No active buff rows with external source UID evidence found in this slice._");
  }
  lines.push("");

  if (options.sourceQuery) {
    lines.push(`## Source Query: ${options.sourceQuery}`);
    lines.push("");
    if (queryUptimeRows.length > 0) {
      lines.push("### Matching Uptime");
      lines.push("");
      lines.push(markdownUptimeTable(queryUptimeRows, options.maxRows));
      lines.push("");
    }
    if (queryActivityRows.length > 0) {
      lines.push("### Matching Skill Activity");
      lines.push("");
      lines.push(markdownActivityTable(queryActivityRows, options.maxRows));
      lines.push("");
    }
    if (queryUptimeRows.length === 0 && queryActivityRows.length === 0) {
      lines.push("_No matching source rows found._");
      lines.push("");
    }
  }

  lines.push("## Target Match Counts");
  lines.push("");
  lines.push(`- Direct static target: ${formatNumber(report.counters.targetMatchCounts["direct-static-target"])}`);
  lines.push(`- No static target metadata: ${formatNumber(report.counters.targetMatchCounts["no-static-target"])}`);
  lines.push(`- Other static target: ${formatNumber(report.counters.targetMatchCounts["other-static-target"])}`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(filePath, rows) {
  const columns = [
    "sourceId",
    "sourceName",
    "sourceKind",
    "sourceType",
    "targetMatch",
    "recountId",
    "recountName",
    "damageId",
    "damageName",
    "deltaHits",
    "deltaCritHits",
    "deltaLuckyHits",
    "critRate",
    "luckyRate",
    "deltaTotal",
    "avgDamagePerHit",
    "intervalCount",
    "cappedSkillIntervalMs",
    "sourceCappedActiveMs",
    "hitsPerActiveMinute",
    "files",
    "playerUids",
    "targetNames",
    "buffIds",
    "sourceEvidence",
    "externalSourceUids",
  ];
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          if (column === "externalSourceUids") return escapeCsv(row.actorSummary.externalSourceUids);
          return escapeCsv(row[column]);
        })
        .join(","),
    );
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function ensureOutputDirs(options) {
  for (const filePath of [options.outJson, options.outMd, options.outCsv]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!Number.isFinite(options.latest) || options.latest <= 0) throw new Error("--latest must be a positive number");
  if (!Number.isFinite(options.maxRows) || options.maxRows <= 0) throw new Error("--max-rows must be a positive number");
  if (!Number.isFinite(options.maxIntervalMs) || options.maxIntervalMs <= 0) throw new Error("--max-interval-ms must be a positive number");
  if (options.playerUid !== null && !Number.isFinite(options.playerUid)) throw new Error("--player-uid must be a number");

  const generatedIndex = buildGeneratedIndex();
  const input = findInputFiles(options);
  const scan = scanEventFiles(input.eventFiles, generatedIndex, options);
  const uptimeRows = [...scan.sourceUptime.values()]
    .map(serializeUptimeBucket)
    .sort((left, right) => right.cappedActiveMs - left.cappedActiveMs || right.windows - left.windows || left.sourceName.localeCompare(right.sourceName));
  const uptimeBySourceId = new Map(uptimeRows.map((row) => [row.sourceId, row]));
  const activityRows = [...scan.activity.values()]
    .map((row) => serializeActivityBucket(row, uptimeBySourceId))
    .sort((left, right) => right.deltaHits - left.deltaHits || right.deltaTotal - left.deltaTotal || left.sourceName.localeCompare(right.sourceName));

  const report = {
    summary: {
      eventRoot: options.eventRoot,
      totalEventFiles: input.totalEventFiles,
      eventFilesScanned: input.eventFiles.length,
      playerUid: options.playerUid,
      sourceQuery: options.sourceQuery,
      maxIntervalMs: options.maxIntervalMs,
      generatedSourceCount: generatedIndex.generatedSourceCount,
      sourceUptimeRows: uptimeRows.length,
      skillActivityRows: activityRows.length,
    },
    counters: scan.counters,
    sourceUptime: uptimeRows,
    skillActivity: activityRows,
  };

  ensureOutputDirs(options);
  fs.writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(options.outMd, buildMarkdown(report, options), "utf8");
  writeCsv(options.outCsv, activityRows);

  console.log(`Scanned ${input.eventFiles.length}/${input.totalEventFiles} event files.`);
  console.log(`Wrote ${compactFile(options.outJson)}`);
  console.log(`Wrote ${compactFile(options.outMd)}`);
  console.log(`Wrote ${compactFile(options.outCsv)}`);
}

main();
