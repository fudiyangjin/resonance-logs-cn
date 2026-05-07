#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DIR_NAME = "com.resonance-logs-cn";
const DEFAULT_EVENT_LIMIT = 48;
const DEFAULT_CENSUS_LIMIT = 80;
const DEFAULT_MAX_ROWS = 120;

const repoRoot = process.cwd();
const defaultFormulaLabPath = path.join(repoRoot, "DEV_exports", "formula-semantics-lab.json");
const defaultEventRoot = process.env.APPDATA
  ? path.join(process.env.APPDATA, APP_DIR_NAME, "EventLogs")
  : path.join(os.homedir(), "AppData", "Roaming", APP_DIR_NAME, "EventLogs");

function parseArgs(argv) {
  const options = {
    eventRoot: defaultEventRoot,
    latest: DEFAULT_EVENT_LIMIT,
    latestCensus: DEFAULT_CENSUS_LIMIT,
    all: false,
    playerUid: null,
    outJson: path.join(repoRoot, "DEV_exports", "skill-source-preview.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-source-preview.md"),
    formulaLab: defaultFormulaLabPath,
    maxRows: DEFAULT_MAX_ROWS,
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
      case "--latest-census":
        options.latestCensus = Number(next());
        break;
      case "--all":
        options.all = true;
        break;
      case "--player-uid":
        options.playerUid = Number(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--formula-lab":
        options.formulaLab = path.resolve(next());
        break;
      case "--no-formula-lab":
        options.formulaLab = null;
        break;
      case "--max-rows":
        options.maxRows = Number(next());
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
  console.log(`Skill Source Row Preview - offline report for safer Skill Details child-row policy.

Usage:
  node scripts/preview-skill-source-rows.mjs [options]

Options:
  --event-root <dir>       EventLogs root. Default: ${defaultEventRoot}
  --latest <count>         Latest normal event log files to scan. Default: ${DEFAULT_EVENT_LIMIT}
  --latest-census <count>  Latest AttributionCensus files to scan. Default: ${DEFAULT_CENSUS_LIMIT}
  --all                    Scan all event/census JSON files under the event root.
  --player-uid <uid>       Restrict preview rows to one attacker/player UID.
  --out-json <path>        JSON report path. Default: DEV_exports/skill-source-preview.json
  --out-md <path>          Markdown report path. Default: DEV_exports/skill-source-preview.md
  --formula-lab <path>     Optional formula-lab report for plausible-fit multiplier calibration. Default: ${defaultFormulaLabPath}
  --no-formula-lab         Disable formula-lab calibration.
  --max-rows <count>       Max rows per Markdown section. Default: ${DEFAULT_MAX_ROWS}
  --help                   Show this help.

Notes:
  This is a preview report only. It does not modify live Skill Details UI behavior.
  Numeric contribution remains limited to exact damage rows emitted by the game.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
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

function compactFile(filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return filePath;
}

function fileLabel(filePath) {
  return path.basename(filePath);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return Math.round(number).toLocaleString("en-US");
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return `${(number * 100).toFixed(2)}%`;
}

function shortList(values, limit = 6) {
  const list = asArray(values).filter((value) => value !== null && value !== undefined && value !== "");
  if (list.length <= limit) return list.join(", ");
  return `${list.slice(0, limit).join(", ")} +${list.length - limit} more`;
}

function parsePercentText(text) {
  if (typeof text !== "string") return null;
  const match = text.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  return Number(match[1]) / 100;
}

function expectedMultipliersFromGradeRows(gradeRows) {
  const rows = [];
  for (const gradeRow of asArray(gradeRows)) {
    const percentFromText = asArray(gradeRow.valueTexts).map(parsePercentText).find((value) => value !== null);
    const firstParam = finiteNumber(asArray(gradeRow.parameterValues)[0]);
    const percentFromParam = firstParam !== null ? firstParam / 10000 : null;
    const percent = percentFromText ?? percentFromParam;
    if (percent === null) continue;
    rows.push({
      grade: finiteNumber(gradeRow.grade),
      itemId: finiteNumber(gradeRow.itemId),
      percent,
      multiplier: 1 + percent,
      parameterValues: uniqueNumbers(gradeRow.parameterValues),
      valueTexts: asArray(gradeRow.valueTexts).map(String),
      cleanResolvedDescription: gradeRow.cleanResolvedDescription ?? null,
    });
  }
  return rows;
}

function expectedMultipliersFromModifierEvidence(modifierEvidence) {
  if (!modifierEvidence) return [];
  const gradeRows = expectedMultipliersFromGradeRows(modifierEvidence.gradeRows);
  if (gradeRows.length > 0) return gradeRows;

  const valueTexts = asArray(modifierEvidence.valueTexts).map(String);
  const percents = uniqueNumbers(valueTexts.map(parsePercentText).filter((value) => value !== null));
  const description = String(modifierEvidence.cleanDescription ?? "");
  const damageLike = /\b(?:DMG|Damage|Boost|Multiplier|Bonus)\b/i.test(description);
  if (!damageLike || percents.length !== 1) return [];
  const percent = percents[0];
  return [
    {
      grade: null,
      itemId: null,
      percent,
      multiplier: 1 + percent,
      parameterValues: uniqueNumbers(modifierEvidence.parameterValues),
      valueTexts,
      cleanResolvedDescription: modifierEvidence.cleanDescription ?? null,
    },
  ];
}

function buildGeneratedIndex() {
  const recount = readGenerated("RecountTable.json");
  const breakdown = readGenerated("SkillBreakdownDetails.json");
  const effectSources = readGenerated("EffectSources.json");
  const factors = readGenerated("SeasonPhantomFactors.json");

  const damageToRecount = new Map();
  const recountToDamageIds = new Map();
  const damageNames = new Map();
  const recountNames = new Map();
  const factorByBuffId = new Map();
  const factorDamageIdsByBuffId = new Map();
  const sourceCandidatesByRecountId = new Map();
  const sourceCandidatesByDamageId = new Map();
  const effectSourceRowsById = new Map();
  const effectSourceRowsByEntityId = new Map();
  const effectSourceIdsByBuffId = new Map();

  const addDamageToRecount = (damageId, recountId, name, reason) => {
    if (damageId === null || recountId === null) return;
    const row = { recountId, name: name ?? `Recount ${recountId}`, reason };
    addToMapList(damageToRecount, damageId, row, (item) => item.recountId);
    addToMapSet(recountToDamageIds, recountId, damageId);
  };

  for (const [recountIdText, row] of Object.entries(recount)) {
    const recountId = finiteNumber(recountIdText);
    if (recountId === null) continue;
    const name = row.Names?.en ?? row.Name ?? row.RecountName ?? `Recount ${recountId}`;
    recountNames.set(recountId, name);
    for (const damageId of uniqueNumbers(row.DamageId)) {
      addDamageToRecount(damageId, recountId, name, "RecountTable.DamageId");
    }
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

  for (const [buffIdText, row] of Object.entries(factors.factorsByBuffId ?? {})) {
    const buffId = finiteNumber(buffIdText);
    if (buffId !== null) factorByBuffId.set(buffId, row);
  }

  for (const [damageIdText, buffIds] of Object.entries(factors.damageIdToFactorBuffIds ?? {})) {
    const damageId = finiteNumber(damageIdText);
    if (damageId === null) continue;
    for (const buffId of uniqueNumbers(buffIds)) addToMapSet(factorDamageIdsByBuffId, buffId, damageId);
  }

  for (const source of Object.values(effectSources.effectSourcesById ?? {})) {
    const sourceId = String(source.sourceId ?? "");
    if (sourceId) effectSourceRowsById.set(sourceId, source);
    const sourceEntityId = finiteNumber(source.sourceEntityId);
    if (sourceEntityId !== null) addToMapList(effectSourceRowsByEntityId, sourceEntityId, source, (item) => item.sourceId);
    for (const buffId of uniqueNumbers(source.buffIds)) addToMapSet(effectSourceIdsByBuffId, buffId, sourceId);
  }

  const candidates = [];
  for (const source of Object.values(effectSources.effectSourcesById ?? {})) {
    const sourceId = String(source.sourceId ?? "");
    const buffIds = uniqueNumbers(source.buffIds);
    const targetRecountIds = [];
    const targetDamageIds = [];

    for (const target of asArray(source.targets)) {
      if (target.targetKind === "recount") {
        const recountId = finiteNumber(target.recountId ?? target.targetId);
        if (recountId !== null) {
          targetRecountIds.push(recountId);
          targetDamageIds.push(...setToSortedNumbers(recountToDamageIds.get(recountId) ?? new Set()));
        }
        continue;
      }

      if (target.targetKind === "damage") {
        const damageId = finiteNumber(target.damageId ?? target.targetId);
        if (damageId !== null) {
          targetDamageIds.push(damageId);
          for (const recountRow of damageToRecount.get(damageId) ?? []) targetRecountIds.push(recountRow.recountId);
        }
        const parentRecountId = finiteNumber(target.parentRecountId);
        if (parentRecountId !== null) targetRecountIds.push(parentRecountId);
      }
    }

    const candidate = {
      sourceId,
      sourceKind: source.sourceKind ?? "unknown",
      sourceType: source.sourceType ?? "unknown",
      sourceName: pickName(source) ?? sourceId,
      sourceEntityId: finiteNumber(source.sourceEntityId),
      runtimeDetection: source.runtimeDetection ?? null,
      buffIds,
      targetRecountIds: uniqueNumbers(targetRecountIds),
      targetDamageIds: uniqueNumbers(targetDamageIds),
      targetEvidence: asArray(source.targets)
        .map((target) => ({
          targetKind: target.targetKind ?? null,
          damageId: finiteNumber(target.damageId ?? target.targetId),
          recountId: finiteNumber(target.recountId),
          parentRecountId: finiteNumber(target.parentRecountId),
          relationshipKind: target.relationshipKind ?? null,
          evidenceStatus: target.evidenceStatus ?? null,
        }))
        .slice(0, 12),
      cleanDescription: source.cleanDescriptions?.en ?? source.modifierEvidence?.cleanDescription ?? null,
      modifierEvidence: source.modifierEvidence ?? null,
      expectedMultipliers: expectedMultipliersFromModifierEvidence(source.modifierEvidence),
    };

    candidates.push(candidate);
    for (const recountId of candidate.targetRecountIds) addToMapList(sourceCandidatesByRecountId, recountId, candidate, (item) => item.sourceId);
    for (const damageId of candidate.targetDamageIds) addToMapList(sourceCandidatesByDamageId, damageId, candidate, (item) => item.sourceId);
  }

  const recountToFactorBuffIds = new Map();
  for (const [recountIdText, buffIds] of Object.entries(factors.recountIdToFactorBuffIds ?? {})) {
    const recountId = finiteNumber(recountIdText);
    if (recountId !== null) recountToFactorBuffIds.set(recountId, uniqueNumbers(buffIds));
  }

  return {
    damageToRecount,
    recountToDamageIds,
    damageNames,
    recountNames,
    factorByBuffId,
    factorDamageIdsByBuffId,
    recountToFactorBuffIds,
    sourceCandidatesByRecountId,
    sourceCandidatesByDamageId,
    effectSourceRowsById,
    effectSourceRowsByEntityId,
    effectSourceIdsByBuffId,
    candidates,
    staticSourceCandidateCount: candidates.length,
  };
}

function applyFormulaLabCalibration(index, formulaLabPath) {
  const lab = readOptionalJson(formulaLabPath);
  const rows = asArray(lab?.candidateRows);
  const calibrationBySourceId = new Map();
  const counters = {
    path: formulaLabPath,
    loaded: Boolean(lab),
    plausibleFits: 0,
    attachedCandidates: 0,
  };

  for (const row of rows) {
    if (row.fit?.status !== "plausible-fit") continue;
    const sourceId = String(row.sourceId ?? "");
    const expected = row.fit?.bestExpected;
    const targetDamageId = finiteNumber(row.targetDamageId);
    if (!sourceId || !expected || targetDamageId === null) continue;
    const multiplier = finiteNumber(expected.expectedMultiplier);
    const percent = finiteNumber(expected.expectedPercent);
    if (multiplier === null || multiplier <= 1) continue;
    const calibration = {
      sourceId,
      targetDamageId,
      targetNames: asArray(row.targetNames).map(String),
      status: row.fit.status,
      mode: row.fit.mode ?? null,
      observedMultiplier: finiteNumber(expected.observedMultiplier ?? row.fit.observedMultiplier),
      relativeError: finiteNumber(expected.relativeError),
      grade: finiteNumber(expected.grade),
      percent,
      multiplier,
      valueTexts: asArray(expected.valueTexts).map(String),
      parameterValues: uniqueNumbers(expected.parameterValues),
      sourceReport: compactFile(formulaLabPath),
    };
    const list = calibrationBySourceId.get(sourceId) ?? [];
    list.push(calibration);
    calibrationBySourceId.set(sourceId, list);
    counters.plausibleFits += 1;
  }

  for (const candidate of index.candidates ?? []) {
    const matches = asArray(calibrationBySourceId.get(candidate.sourceId)).filter(
      (row) => candidate.targetDamageIds.includes(row.targetDamageId),
    );
    if (matches.length === 0) continue;
    candidate.formulaCalibrations = matches;
    counters.attachedCandidates += 1;
  }

  index.formulaCalibrationCounters = counters;
  return counters;
}

function findInputFiles(options) {
  const allFiles = walkJsonFiles(options.eventRoot).sort((left, right) => fileMtime(right) - fileMtime(left));
  const isCensus = (filePath) => filePath.includes(`${path.sep}AttributionCensus${path.sep}`);
  const eventFiles = allFiles.filter((filePath) => !isCensus(filePath));
  const censusFiles = allFiles.filter(isCensus);
  return {
    eventFiles: options.all ? eventFiles : eventFiles.slice(0, options.latest),
    censusFiles: options.all ? censusFiles : censusFiles.slice(0, options.latestCensus),
    totalEventFiles: eventFiles.length,
    totalCensusFiles: censusFiles.length,
  };
}

function emptyRuntimeState() {
  return {
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
  const buffId = finiteNumber(item.factorBuffId ?? item.factor_buff_id);
  if (buffId === null) return;
  state.activeFactorItemBuffIds.add(buffId);
  const grade = finiteNumber(item.grade);
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

function mergeRuntimeState(target, source) {
  addNumbersToSet(target.activeFactorBuffIds, source.activeFactorBuffIds);
  addNumbersToSet(target.activeFactorItemBuffIds, source.activeFactorItemBuffIds);
  addNumbersToSet(target.activeEffectBuffIds, source.activeEffectBuffIds);
  addStringsToSet(target.activeEffectSourceIds, source.activeEffectSourceIds);
  addNumbersToSet(target.activePassiveSkillIds, source.activePassiveSkillIds);
  addNumbersToSet(target.activePassiveSkillUuids, source.activePassiveSkillUuids);
  addNumbersToSet(target.activeProfessionTalentNodeIds, source.activeProfessionTalentNodeIds);
  addNumbersToSet(target.activeProfessionTalentStageCfgIds, source.activeProfessionTalentStageCfgIds);
  for (const [buffId, grades] of source.activeFactorItemGradesByBuffId ?? []) {
    for (const grade of grades) addToMapSet(target.activeFactorItemGradesByBuffId, buffId, grade);
  }
  for (const [buffId, actors] of source.activeBuffActorsByBuffId ?? []) {
    for (const actor of actors) addToMapSet(target.activeBuffActorsByBuffId, buffId, actor);
  }
}

function serializeRuntimeState(state) {
  const factorItemGradesByBuffId = {};
  for (const [buffId, grades] of state.activeFactorItemGradesByBuffId) {
    factorItemGradesByBuffId[buffId] = setToSortedNumbers(grades);
  }
  const activeBuffActorsByBuffId = {};
  for (const [buffId, actors] of state.activeBuffActorsByBuffId) {
    activeBuffActorsByBuffId[buffId] = setToSortedStrings(actors);
  }
  return {
    activeFactorBuffIds: setToSortedNumbers(state.activeFactorBuffIds),
    activeFactorItemBuffIds: setToSortedNumbers(state.activeFactorItemBuffIds),
    activeFactorItemGradesByBuffId: factorItemGradesByBuffId,
    activeEffectBuffIds: setToSortedNumbers(state.activeEffectBuffIds),
    activeEffectSourceIds: setToSortedStrings(state.activeEffectSourceIds),
    activePassiveSkillIds: setToSortedNumbers(state.activePassiveSkillIds),
    activePassiveSkillUuids: setToSortedNumbers(state.activePassiveSkillUuids),
    activeProfessionTalentNodeIds: setToSortedNumbers(state.activeProfessionTalentNodeIds),
    activeProfessionTalentStageCfgIds: setToSortedNumbers(state.activeProfessionTalentStageCfgIds),
    activeProfessionTalentSourcePairs: professionTalentSourcePairs(setToSortedNumbers(state.activeProfessionTalentNodeIds)),
    activeBuffActorsByBuffId,
  };
}

function normalizeEventPlayerSnapshot(entry) {
  const raw = rawJson(entry);
  if (!raw) return null;
  const uid = finiteNumber(raw.uid ?? raw.playerUid ?? entry.uid ?? entry.sourceUid ?? entry.source_uid);
  if (uid === null) return null;

  const state = emptyRuntimeState();
  addNumbersToSet(
    state.activeFactorBuffIds,
    asArray(raw.activeFactorBuffs ?? raw.active_factor_buffs).map((buff) => buff.factor_buff_id ?? buff.factorBuffId),
  );
  for (const buff of asArray(raw.activeFactorBuffs ?? raw.active_factor_buffs)) {
    addBuffActor(state, buff.factor_buff_id ?? buff.factorBuffId, buff, "factor");
  }

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
  addNumbersToSet(
    state.activeProfessionTalentNodeIds,
    activeProfessionTalents.map((talent) => talent.talent_node_id ?? talent.talentNodeId),
  );
  addNumbersToSet(
    state.activeProfessionTalentStageCfgIds,
    activeProfessionTalents.map((talent) => talent.talent_stage_cfg_id ?? talent.talentStageCfgId),
  );

  return {
    tsMs: Number(entry.tsMs ?? entry.ts_ms ?? 0),
    uid,
    name: raw.name ?? entry.nameHint ?? entry.name_hint ?? entry.sourceLabel ?? entry.source_label ?? null,
    classId: finiteNumber(raw.classId ?? raw.class_id),
    classSpec: raw.classSpec ?? raw.class_spec ?? null,
    state,
  };
}

function normalizeEventSkillSnapshot(entry) {
  const raw = rawJson(entry);
  if (!raw) return null;
  const stats = raw.stats ?? {};
  const skillId = finiteNumber(raw.skillId ?? raw.skill_id ?? entry.uid);
  const playerUid = finiteNumber(raw.playerUid ?? raw.player_uid ?? entry.sourceUid ?? entry.source_uid);
  if (skillId === null || playerUid === null) return null;
  return {
    tsMs: Number(entry.tsMs ?? entry.ts_ms ?? 0),
    skillId,
    playerUid,
    playerName: raw.playerName ?? raw.player_name ?? entry.sourceLabel ?? entry.source_label ?? null,
    total: statValue(stats, "total_value", "totalValue"),
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

function makeBucket(origin, filePath, playerUid, recountId, recountName) {
  return {
    origin,
    file: filePath,
    fileName: fileLabel(filePath),
    playerUid,
    playerName: null,
    classId: null,
    classSpec: null,
    recountId,
    recountName,
    state: emptyRuntimeState(),
    observedDamageRows: new Map(),
    observationCount: 0,
  };
}

function bucketKey(origin, filePath, playerUid, recountId) {
  return `${origin}|${filePath}|${playerUid}|${recountId}`;
}

function getBucket(buckets, origin, filePath, playerUid, recountId, recountName) {
  const key = bucketKey(origin, filePath, playerUid, recountId);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = makeBucket(origin, filePath, playerUid, recountId, recountName);
    buckets.set(key, bucket);
  }
  return bucket;
}

function addObservedDamage(bucket, row) {
  const damageId = finiteNumber(row.damageId);
  if (damageId === null) return;
  const existing = bucket.observedDamageRows.get(damageId);
  const total = Number(row.total ?? 0);
  const hits = Number(row.hits ?? 0);
  if (!existing || total >= existing.total) {
    bucket.observedDamageRows.set(damageId, {
      damageId,
      damageName: row.damageName ?? `Damage ${damageId}`,
      total,
      hits,
      critHits: Number(row.critHits ?? 0),
      luckyHits: Number(row.luckyHits ?? 0),
      sourceStatus: row.sourceStatus ?? null,
      sourceKind: row.sourceKind ?? null,
      sourceType: row.sourceType ?? null,
      displayName: row.displayName ?? null,
      linkedSource: row.linkedSource ?? null,
      linkedId: row.linkedId ?? null,
      observations: existing ? existing.observations + 1 : 1,
    });
  } else {
    existing.observations += 1;
  }
}

function scanEventFiles(eventFiles, index, options) {
  const buckets = new Map();
  const counters = {
    filesRead: 0,
    unreadableFiles: 0,
    entries: 0,
    playerSnapshots: 0,
    skillSnapshots: 0,
    skillSnapshotsWithRecount: 0,
  };

  for (const filePath of eventFiles) {
    let payload;
    try {
      payload = readJson(filePath);
    } catch {
      counters.unreadableFiles += 1;
      continue;
    }
    counters.filesRead += 1;
    const playerSnapshotsByUid = new Map();
    const skillSnapshots = [];

    for (const entry of asArray(payload.entries)) {
      counters.entries += 1;
      if (entry.action !== "snapshot") continue;

      if (entry.category === "player") {
        const snapshot = normalizeEventPlayerSnapshot(entry);
        if (!snapshot) continue;
        if (options.playerUid !== null && snapshot.uid !== options.playerUid) continue;
        const list = playerSnapshotsByUid.get(snapshot.uid) ?? [];
        list.push(snapshot);
        playerSnapshotsByUid.set(snapshot.uid, list);
        counters.playerSnapshots += 1;
        continue;
      }

      if (entry.category === "player_skill_damage") {
        const snapshot = normalizeEventSkillSnapshot(entry);
        if (!snapshot) continue;
        if (options.playerUid !== null && snapshot.playerUid !== options.playerUid) continue;
        if (snapshot.total <= 0 || snapshot.hits <= 0) continue;
        skillSnapshots.push(snapshot);
        counters.skillSnapshots += 1;
      }
    }

    for (const snapshots of playerSnapshotsByUid.values()) snapshots.sort((left, right) => left.tsMs - right.tsMs);

    for (const skill of skillSnapshots) {
      const recountRows = index.damageToRecount.get(skill.skillId) ?? [];
      if (recountRows.length === 0) continue;
      counters.skillSnapshotsWithRecount += 1;
      const playerSnapshot = latestSnapshotAt(playerSnapshotsByUid.get(skill.playerUid) ?? [], skill.tsMs);
      for (const recountRow of recountRows) {
        const bucket = getBucket(buckets, "event", filePath, skill.playerUid, recountRow.recountId, recountRow.name);
        bucket.playerName = skill.playerName ?? playerSnapshot?.name ?? bucket.playerName;
        bucket.classId = playerSnapshot?.classId ?? bucket.classId;
        bucket.classSpec = playerSnapshot?.classSpec ?? bucket.classSpec;
        if (playerSnapshot) mergeRuntimeState(bucket.state, playerSnapshot.state);
        addObservedDamage(bucket, {
          damageId: skill.skillId,
          damageName: index.damageNames.get(skill.skillId),
          total: skill.total,
          hits: skill.hits,
          critHits: skill.critHits,
          luckyHits: skill.luckyHits,
        });
        bucket.observationCount += 1;
      }
    }
  }

  return { counters, buckets };
}

function stateFromCensusRow(row) {
  const state = emptyRuntimeState();
  addNumbersToSet(state.activeFactorBuffIds, row.activeFactorBuffIds ?? row.active_factor_buff_ids);
  addNumbersToSet(state.activeEffectBuffIds, row.activeEffectBuffIds ?? row.active_effect_buff_ids);
  addStringsToSet(state.activeEffectSourceIds, row.activeEffectSourceIds ?? row.active_effect_source_ids);
  addNumbersToSet(state.activePassiveSkillIds, row.activePassiveSkillIds ?? row.active_passive_skill_ids);
  addNumbersToSet(state.activePassiveSkillUuids, row.activePassiveSkillUuids ?? row.active_passive_skill_uuids);
  addNumbersToSet(state.activeProfessionTalentNodeIds, row.activeProfessionTalentNodeIds ?? row.active_profession_talent_node_ids);
  addNumbersToSet(state.activeProfessionTalentStageCfgIds, row.activeProfessionTalentStageCfgIds ?? row.active_profession_talent_stage_cfg_ids);
  for (const buff of asArray(row.activeFactorBuffs ?? row.active_factor_buffs)) {
    addBuffActor(state, buff.factor_buff_id ?? buff.factorBuffId, buff, "factor");
  }
  for (const buff of asArray(row.activeEffectBuffs ?? row.active_effect_buffs)) {
    addBuffActor(state, buff.effect_source_buff_id ?? buff.effectSourceBuffId, buff, "effect");
    addBuffActor(state, buff.observed_buff_id ?? buff.observedBuffId, buff, "effect-observed");
    addBuffActor(state, buff.source_config_id ?? buff.sourceConfigId, buff, "effect-source-config");
  }
  for (const item of asArray(row.activeFactorItems ?? row.active_factor_items)) addFactorItem(state, item);
  return state;
}

function recountRowsForCensusRow(row, index) {
  const rows = [];
  for (const recountRow of asArray(row.recountRows)) {
    const recountId = finiteNumber(recountRow.recountId);
    if (recountId !== null) rows.push({ recountId, name: recountRow.name ?? index.recountNames.get(recountId) ?? `Recount ${recountId}` });
  }
  const parentRecountId = finiteNumber(row.parentRecountId);
  if (parentRecountId !== null) rows.push({ recountId: parentRecountId, name: row.parentRecountName ?? index.recountNames.get(parentRecountId) ?? `Recount ${parentRecountId}` });
  const damageId = finiteNumber(row.damageId);
  if (damageId !== null) rows.push(...(index.damageToRecount.get(damageId) ?? []));

  const seen = new Set();
  return rows.filter((item) => {
    if (seen.has(item.recountId)) return false;
    seen.add(item.recountId);
    return true;
  });
}

function scanCensusFiles(censusFiles, index, options) {
  const buckets = new Map();
  const counters = {
    filesRead: 0,
    unreadableFiles: 0,
    rows: 0,
    rowsWithRecount: 0,
    rowsWithActiveFactors: 0,
    rowsWithActiveEffects: 0,
    rowsWithActiveTalents: 0,
    rowsWithActivePassives: 0,
  };

  for (const filePath of censusFiles) {
    let payload;
    try {
      payload = readJson(filePath);
    } catch {
      counters.unreadableFiles += 1;
      continue;
    }
    counters.filesRead += 1;

    for (const row of asArray(payload.rows)) {
      counters.rows += 1;
      const damageId = finiteNumber(row.damageId);
      const playerUid = finiteNumber(row.lastAttackerUid ?? row.attackerUid ?? payload.characterUid);
      if (damageId === null || playerUid === null) continue;
      if (options.playerUid !== null && playerUid !== options.playerUid) continue;
      const recountRows = recountRowsForCensusRow(row, index);
      if (recountRows.length === 0) continue;
      counters.rowsWithRecount += 1;

      const state = stateFromCensusRow(row);
      if (state.activeFactorBuffIds.size > 0) counters.rowsWithActiveFactors += 1;
      if (state.activeEffectBuffIds.size > 0 || state.activeEffectSourceIds.size > 0) counters.rowsWithActiveEffects += 1;
      if (state.activeProfessionTalentNodeIds.size > 0) counters.rowsWithActiveTalents += 1;
      if (state.activePassiveSkillIds.size > 0 || state.activePassiveSkillUuids.size > 0) counters.rowsWithActivePassives += 1;

      for (const recountRow of recountRows) {
        const bucket = getBucket(buckets, "census", filePath, playerUid, recountRow.recountId, recountRow.name);
        bucket.playerName = playerUid === finiteNumber(payload.characterUid) ? payload.characterName : bucket.playerName;
        bucket.classSpec = asArray(row.attackerClassSpecs)[0] ?? bucket.classSpec;
        mergeRuntimeState(bucket.state, state);
        addObservedDamage(bucket, {
          damageId,
          damageName: row.displayName ?? row.displayDetailName ?? index.damageNames.get(damageId),
          total: row.totalValue,
          hits: row.hits,
          critHits: row.critHits,
          luckyHits: row.luckyHits,
          sourceStatus: row.sourceStatus,
          sourceKind: row.sourceKind,
          sourceType: row.sourceType,
          displayName: row.displayName,
          linkedSource: row.linkedSource,
          linkedId: row.linkedId,
        });
        bucket.observationCount += 1;
      }
    }
  }

  return { counters, buckets };
}

function factorSourceRow(buffId, index, state, exactDamageIdSet) {
  const factor = index.factorByBuffId.get(buffId);
  const grades = setToSortedNumbers(state.activeFactorItemGradesByBuffId.get(buffId) ?? new Set());
  const matchedExactDamageIds = setToSortedNumbers(index.factorDamageIdsByBuffId.get(buffId) ?? new Set()).filter((damageId) => exactDamageIdSet.has(damageId));
  const evidence = [];
  if (state.activeFactorBuffIds.has(buffId)) evidence.push(`activeFactorBuff:${buffId}`);
  if (state.activeEffectBuffIds.has(buffId)) evidence.push(`activeEffectBuff:${buffId}`);
  if (state.activeFactorItemBuffIds.has(buffId)) evidence.push(`activeFactorItem:${buffId}${grades.length ? `:G${grades.join("/")}` : ""}`);
  return {
    sourceId: `phantom-factor:${buffId}`,
    sourceKind: "phantom-factor",
    sourceType: "season-phantom-factor",
    sourceName: factor?.familyNames?.en ?? factor?.familyName ?? `Phantom Factor ${buffId}`,
    buffIds: [buffId],
    evidence,
    matchedExactDamageIds,
    grades,
    cleanDescription: factor?.cleanDescriptions?.en ?? null,
  };
}

function activeEvidenceForCandidate(candidate, state) {
  const evidence = [];
  for (const buffId of candidate.buffIds) {
    if (state.activeFactorBuffIds.has(buffId)) evidence.push(`activeFactorBuff:${buffId}`);
    if (state.activeEffectBuffIds.has(buffId)) evidence.push(`activeEffectBuff:${buffId}`);
    if (state.activeFactorItemBuffIds.has(buffId)) evidence.push(`activeFactorItem:${buffId}`);
  }
  if (candidate.sourceId && state.activeEffectSourceIds.has(candidate.sourceId)) evidence.push(`activeEffectSource:${candidate.sourceId}`);
  if (candidate.sourceEntityId !== null && state.activePassiveSkillIds.has(candidate.sourceEntityId)) {
    evidence.push(`activePassiveSkill:${candidate.sourceEntityId}`);
  }
  if (candidate.sourceKind === "talent-passive" && candidate.sourceEntityId !== null) {
    for (const pair of professionTalentSourcePairs(setToSortedNumbers(state.activeProfessionTalentNodeIds))) {
      if (pair.sourceEntityId === candidate.sourceEntityId) {
        evidence.push(`activeProfessionTalentNode:${pair.nodeId}->talent:${pair.sourceEntityId}`);
      }
    }
  }
  return uniqueStrings(evidence);
}

function strongEvidence(evidence) {
  return asArray(evidence).filter((item) => !String(item).startsWith("activeFactorItem:"));
}

function candidateSourceKey(candidate) {
  return candidate.sourceId || `${candidate.sourceKind}:${candidate.sourceEntityId ?? candidate.sourceName}`;
}

function candidateTargetsExactDamage(candidate, exactDamageIdSet) {
  return candidate.targetDamageIds.some((damageId) => exactDamageIdSet.has(damageId));
}

function candidateSourcesForParent(bucket, index, exactDamageIdSet) {
  const candidates = new Map();
  for (const candidate of index.sourceCandidatesByRecountId.get(bucket.recountId) ?? []) {
    candidates.set(candidateSourceKey(candidate), candidate);
  }
  for (const damageId of exactDamageIdSet) {
    for (const candidate of index.sourceCandidatesByDamageId.get(damageId) ?? []) {
      candidates.set(candidateSourceKey(candidate), candidate);
    }
  }
  return [...candidates.values()];
}

function observedGradesForCandidate(candidate, state) {
  const grades = new Set();
  for (const buffId of candidate.buffIds) {
    for (const grade of state.activeFactorItemGradesByBuffId.get(buffId) ?? []) grades.add(grade);
  }
  return setToSortedNumbers(grades);
}

function buffActorsForCandidate(candidate, state) {
  const actors = new Set();
  for (const buffId of candidate.buffIds) {
    for (const actor of state.activeBuffActorsByBuffId.get(buffId) ?? []) actors.add(actor);
  }
  return setToSortedStrings(actors);
}

function chooseExpectedMultiplier(candidate, state) {
  const expected = asArray(candidate.expectedMultipliers);
  if (expected.length === 0) {
    return { status: "no-static-multiplier", multiplier: null, observedGrades: [] };
  }

  const observedGrades = observedGradesForCandidate(candidate, state);
  const gradeMatches = expected.filter((row) => row.grade !== null && observedGrades.includes(row.grade));
  if (gradeMatches.length > 0) {
    const best = gradeMatches.sort((left, right) => (right.grade ?? 0) - (left.grade ?? 0))[0];
    return { status: "grade-matched", multiplier: best, observedGrades };
  }

  if (expected.length === 1 && expected[0].grade === null) {
    return { status: "fixed-percent", multiplier: expected[0], observedGrades };
  }

  const calibration = asArray(candidate.formulaCalibrations)[0];
  if (calibration) {
    return {
      status: "formula-lab-plausible-fit",
      multiplier: {
        grade: calibration.grade,
        itemId: null,
        percent: calibration.percent,
        multiplier: calibration.multiplier,
        parameterValues: calibration.parameterValues,
        valueTexts: calibration.valueTexts,
        cleanResolvedDescription: `Formula-lab plausible fit (${calibration.mode ?? "unknown mode"})`,
        calibration,
      },
      observedGrades,
    };
  }

  return { status: "missing-observed-grade", multiplier: null, observedGrades };
}

function contributionSourceRow(candidate, evidence, multiplierChoice, state) {
  const multiplier = multiplierChoice.multiplier;
  return {
    sourceId: candidate.sourceId,
    sourceKind: candidate.sourceKind,
    sourceType: candidate.sourceType,
    sourceName: candidate.sourceName,
    sourceEntityId: candidate.sourceEntityId,
    buffIds: candidate.buffIds,
    evidence,
    actorHints: buffActorsForCandidate(candidate, state),
    multiplier: multiplier.multiplier,
    percent: multiplier.percent,
    multiplierStatus: multiplierChoice.status,
    observedGrades: multiplierChoice.observedGrades,
    valueTexts: multiplier.valueTexts ?? [],
    parameterValues: multiplier.parameterValues ?? [],
    calibration: multiplier.calibration ?? null,
    cleanDescription: multiplier.cleanResolvedDescription ?? candidate.cleanDescription ?? null,
    targetDamageIds: candidate.targetDamageIds,
    targetRecountIds: candidate.targetRecountIds,
  };
}

function unresolvedSourceRow(candidate, evidence, reason, state, extra = {}) {
  return {
    sourceId: candidate.sourceId,
    sourceKind: candidate.sourceKind,
    sourceType: candidate.sourceType,
    sourceName: candidate.sourceName,
    sourceEntityId: candidate.sourceEntityId,
    buffIds: candidate.buffIds,
    evidence,
    actorHints: buffActorsForCandidate(candidate, state),
    reason,
    targetDamageIds: candidate.targetDamageIds,
    targetRecountIds: candidate.targetRecountIds,
    cleanDescription: candidate.cleanDescription ?? null,
    ...extra,
  };
}

function buildContributionPreview(bucket, index, exactDamageRows, exactDamageIdSet) {
  const parentTotal = exactDamageRows.reduce((sum, row) => sum + row.total, 0);
  const candidates = candidateSourcesForParent(bucket, index, exactDamageIdSet);
  const calculatedSources = [];
  const unresolvedSources = [];
  const exactCoveredSources = [];

  for (const candidate of candidates) {
    const evidence = activeEvidenceForCandidate(candidate, bucket.state);
    if (evidence.length === 0) continue;
    const activeStrongEvidence = strongEvidence(evidence);
    const exactCovered = candidateTargetsExactDamage(candidate, exactDamageIdSet);
    const multiplierChoice = chooseExpectedMultiplier(candidate, bucket.state);

    if (activeStrongEvidence.length === 0) {
      unresolvedSources.push(unresolvedSourceRow(candidate, evidence, "selected-or-item-only-no-runtime", bucket.state, multiplierChoice));
      continue;
    }

    if (!multiplierChoice.multiplier) {
      const reason = exactCovered ? "linked-active-source-unsplit-no-usable-multiplier" : multiplierChoice.status;
      unresolvedSources.push(unresolvedSourceRow(candidate, activeStrongEvidence, reason, bucket.state, multiplierChoice));
      if (exactCovered) exactCoveredSources.push(candidate.sourceId);
      continue;
    }

    if (multiplierChoice.multiplier.multiplier <= 1) {
      unresolvedSources.push(unresolvedSourceRow(candidate, activeStrongEvidence, "non-positive-or-neutral-multiplier", bucket.state, multiplierChoice));
      continue;
    }

    calculatedSources.push(contributionSourceRow(candidate, activeStrongEvidence, multiplierChoice, bucket.state));
  }

  const productMultiplier = calculatedSources.reduce((product, source) => product * source.multiplier, 1);
  const baseTotal = productMultiplier > 0 ? parentTotal / productMultiplier : parentTotal;
  const upliftTotal = Math.max(0, parentTotal - baseTotal);
  const logSum = calculatedSources.reduce((sum, source) => sum + Math.max(0, Math.log(source.multiplier)), 0);
  const baseDamageRows = exactDamageRows.map((row) => {
    const rawShare = parentTotal > 0 ? row.total / parentTotal : 0;
    return {
      rowKind: "base-damage",
      damageId: row.damageId,
      damageName: row.damageName ?? row.displayName ?? `Damage ${row.damageId}`,
      observedTotal: row.total,
      calculatedTotal: calculatedSources.length > 0 ? baseTotal * rawShare : row.total,
      parentPct: parentTotal > 0 ? (calculatedSources.length > 0 ? baseTotal * rawShare : row.total) / parentTotal : 0,
      hits: row.hits,
      method: calculatedSources.length > 0 ? "observed-damage-minus-estimated-modifiers" : "exact-emitted-damage",
    };
  });

  const modifierRows = calculatedSources.map((source) => {
    const weight = logSum > 0 ? Math.max(0, Math.log(source.multiplier)) / logSum : 1 / calculatedSources.length;
    const calculatedTotal = upliftTotal * weight;
    return {
      rowKind: "calculated-modifier",
      ...source,
      calculatedTotal,
      parentPct: parentTotal > 0 ? calculatedTotal / parentTotal : 0,
      method: "multiplicative-log-uplift-allocation",
    };
  });

  const balancedTotal = [...baseDamageRows, ...modifierRows].reduce((sum, row) => sum + row.calculatedTotal, 0);
  return {
    parentTotal,
    productMultiplier,
    baseTotal,
    upliftTotal,
    calculatedModifierCount: modifierRows.length,
    unresolvedSourceCount: unresolvedSources.length,
    exactCoveredSourceCount: exactCoveredSources.length,
    balanceError: parentTotal - balancedTotal,
    baseDamageRows,
    modifierRows,
    unresolvedSources,
  };
}

function buildPreviewRows(allBuckets, index) {
  const rows = [];
  const counters = {
    previewRows: 0,
    rowsWithExactDamage: 0,
    exactDamageRows: 0,
    legacyFactorSourceOnlyRows: 0,
    proposedFactorSourceOnlyRows: 0,
    proposedEffectSourceOnlyRows: 0,
    suppressedFactorRows: 0,
    exactLinkedSourceRows: 0,
    contributionRowsWithCalculatedModifiers: 0,
    calculatedModifierRows: 0,
    unresolvedContributionSources: 0,
    estimatedUpliftTotal: 0,
  };

  for (const bucket of allBuckets) {
    const state = bucket.state;
    const exactDamageRows = [...bucket.observedDamageRows.values()].sort((left, right) => right.total - left.total || left.damageId - right.damageId);
    const exactDamageIdSet = new Set(exactDamageRows.map((row) => row.damageId));
    const legacyFactorRows = [];
    const proposedFactorRows = [];
    const suppressedFactorRows = [];
    const proposedEffectRows = [];
    const exactLinkedSources = [];

    for (const buffId of index.recountToFactorBuffIds.get(bucket.recountId) ?? []) {
      const runtimeActive = state.activeFactorBuffIds.has(buffId) || state.activeEffectBuffIds.has(buffId);
      const itemOnlyActive = state.activeFactorItemBuffIds.has(buffId) && !runtimeActive;
      if (!runtimeActive && !itemOnlyActive) continue;

      const sourceRow = factorSourceRow(buffId, index, state, exactDamageIdSet);
      legacyFactorRows.push(sourceRow);

      if (sourceRow.matchedExactDamageIds.length > 0) {
        exactLinkedSources.push({
          ...sourceRow,
          evidence: sourceRow.evidence.filter((item) => !item.startsWith("activeFactorItem:")),
          reason: "active factor already has an exact emitted child damage row",
        });
      } else if (runtimeActive) {
        proposedFactorRows.push(sourceRow);
      } else {
        suppressedFactorRows.push({
          ...sourceRow,
          reason: "item-package-only factor selection; not observed as an active runtime buff",
        });
      }
    }

    const seenEffectSourceIds = new Set();
    for (const candidate of index.sourceCandidatesByRecountId.get(bucket.recountId) ?? []) {
      if (!candidate.sourceId || seenEffectSourceIds.has(candidate.sourceId)) continue;
      seenEffectSourceIds.add(candidate.sourceId);
      if (candidate.sourceKind === "phantom-factor") continue;

      const evidence = activeEvidenceForCandidate(candidate, state);
      const activeStrongEvidence = strongEvidence(evidence);
      if (activeStrongEvidence.length === 0) continue;
      const matchedExactDamageIds = candidate.targetDamageIds.filter((damageId) => exactDamageIdSet.has(damageId));
      const sourceRow = {
        sourceId: candidate.sourceId,
        sourceKind: candidate.sourceKind,
        sourceType: candidate.sourceType,
        sourceName: candidate.sourceName,
        sourceEntityId: candidate.sourceEntityId,
        buffIds: candidate.buffIds,
        evidence: activeStrongEvidence,
        matchedExactDamageIds,
        targetDamageIds: candidate.targetDamageIds,
        targetRecountIds: candidate.targetRecountIds,
        runtimeDetection: candidate.runtimeDetection,
        targetEvidence: candidate.targetEvidence,
      };

      if (matchedExactDamageIds.length > 0) {
        exactLinkedSources.push({
          ...sourceRow,
          reason: "active source already appears as an exact emitted child damage row",
        });
      } else {
        proposedEffectRows.push(sourceRow);
      }
    }

    if (
      exactDamageRows.length === 0 &&
      legacyFactorRows.length === 0 &&
      proposedFactorRows.length === 0 &&
      proposedEffectRows.length === 0 &&
      suppressedFactorRows.length === 0 &&
      exactLinkedSources.length === 0
    ) {
      continue;
    }

    const total = exactDamageRows.reduce((sum, row) => sum + row.total, 0);
    const contributionPreview = buildContributionPreview(bucket, index, exactDamageRows, exactDamageIdSet);
    const previewRow = {
      origin: bucket.origin,
      file: compactFile(bucket.file),
      fileName: bucket.fileName,
      playerUid: bucket.playerUid,
      playerName: bucket.playerName,
      classId: bucket.classId,
      classSpec: bucket.classSpec,
      recountId: bucket.recountId,
      recountName: bucket.recountName,
      total,
      exactDamageRows,
      legacyFactorSourceOnlyRows: legacyFactorRows,
      proposedFactorSourceOnlyRows: proposedFactorRows,
      proposedEffectSourceOnlyRows: proposedEffectRows,
      suppressedFactorRows,
      exactLinkedSources,
      contributionPreview,
      runtimeState: serializeRuntimeState(state),
      observationCount: bucket.observationCount,
      changeScore:
        suppressedFactorRows.length * 4 +
        proposedEffectRows.length * 3 +
        proposedFactorRows.length * 2 +
        exactLinkedSources.length +
        Math.min(exactDamageRows.length, 5),
    };

    rows.push(previewRow);
    counters.previewRows += 1;
    if (exactDamageRows.length > 0) counters.rowsWithExactDamage += 1;
    counters.exactDamageRows += exactDamageRows.length;
    counters.legacyFactorSourceOnlyRows += legacyFactorRows.length;
    counters.proposedFactorSourceOnlyRows += proposedFactorRows.length;
    counters.proposedEffectSourceOnlyRows += proposedEffectRows.length;
    counters.suppressedFactorRows += suppressedFactorRows.length;
    counters.exactLinkedSourceRows += exactLinkedSources.length;
    if (contributionPreview.calculatedModifierCount > 0) counters.contributionRowsWithCalculatedModifiers += 1;
    counters.calculatedModifierRows += contributionPreview.calculatedModifierCount;
    counters.unresolvedContributionSources += contributionPreview.unresolvedSourceCount;
    counters.estimatedUpliftTotal += contributionPreview.upliftTotal;
  }

  rows.sort((left, right) => {
    if (right.changeScore !== left.changeScore) return right.changeScore - left.changeScore;
    if (right.total !== left.total) return right.total - left.total;
    return left.recountName.localeCompare(right.recountName);
  });

  return { rows, counters };
}

function mergeBucketMaps(...maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [key, bucket] of map) {
      if (!merged.has(key)) {
        merged.set(key, bucket);
        continue;
      }
      const target = merged.get(key);
      mergeRuntimeState(target.state, bucket.state);
      for (const damageRow of bucket.observedDamageRows.values()) addObservedDamage(target, damageRow);
      target.observationCount += bucket.observationCount;
      target.playerName = target.playerName ?? bucket.playerName;
      target.classId = target.classId ?? bucket.classId;
      target.classSpec = target.classSpec ?? bucket.classSpec;
    }
  }
  return merged;
}

function sourceSummary(row) {
  const parts = [];
  parts.push(`${row.sourceName ?? row.sourceId} [${row.sourceKind ?? "source"}]`);
  if (row.evidence?.length) parts.push(`evidence=${shortList(row.evidence, 3)}`);
  if (row.matchedExactDamageIds?.length) parts.push(`exact=${shortList(row.matchedExactDamageIds, 3)}`);
  return parts.join("; ");
}

function calculatedContributionSummary(row) {
  const name = row.sourceName ?? row.sourceId ?? "source";
  const parts = [
    `${name} [${row.sourceKind ?? "source"}]`,
    `est=${formatNumber(row.calculatedTotal)}`,
    `share=${formatPercent(row.parentPct)}`,
  ];
  if (Number.isFinite(row.percent)) parts.push(`mult=${formatPercent(row.percent)}`);
  if (row.evidence?.length) parts.push(`evidence=${shortList(row.evidence, 3)}`);
  return parts.join("; ");
}

function unresolvedContributionSummary(row) {
  const name = row.sourceName ?? row.sourceId ?? "source";
  const parts = [`${name} [${row.sourceKind ?? "source"}]`, `reason=${row.reason}`];
  if (row.evidence?.length) parts.push(`evidence=${shortList(row.evidence, 3)}`);
  return parts.join("; ");
}

function addSourceAggregate(map, source, parentRow) {
  const key = source.sourceId || `${source.sourceKind}:${source.sourceName}`;
  const entry = map.get(key) ?? {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    sourceType: source.sourceType,
    sourceName: source.sourceName,
    buffIds: new Set(),
    recounts: new Map(),
    evidence: new Set(),
    exactDamageIds: new Set(),
    rows: 0,
    files: new Set(),
  };
  entry.rows += 1;
  entry.files.add(parentRow.fileName);
  entry.recounts.set(parentRow.recountId, parentRow.recountName);
  addNumbersToSet(entry.buffIds, source.buffIds);
  addStringsToSet(entry.evidence, source.evidence);
  addNumbersToSet(entry.exactDamageIds, source.matchedExactDamageIds);
  map.set(key, entry);
}

function serializeSourceAggregateMap(map) {
  return [...map.values()]
    .map((entry) => ({
      sourceId: entry.sourceId,
      sourceKind: entry.sourceKind,
      sourceType: entry.sourceType,
      sourceName: entry.sourceName,
      buffIds: setToSortedNumbers(entry.buffIds),
      rows: entry.rows,
      fileCount: entry.files.size,
      recounts: [...entry.recounts.entries()]
        .map(([recountId, recountName]) => ({ recountId, recountName }))
        .sort((left, right) => left.recountId - right.recountId),
      evidence: setToSortedStrings(entry.evidence).slice(0, 20),
      exactDamageIds: setToSortedNumbers(entry.exactDamageIds),
    }))
    .sort((left, right) => right.rows - left.rows || String(left.sourceName).localeCompare(String(right.sourceName)));
}

function buildSourceAggregates(previewRows) {
  const proposedFactors = new Map();
  const proposedEffects = new Map();
  const suppressedFactors = new Map();
  const exactLinkedSources = new Map();
  for (const row of previewRows) {
    for (const source of row.proposedFactorSourceOnlyRows) addSourceAggregate(proposedFactors, source, row);
    for (const source of row.proposedEffectSourceOnlyRows) addSourceAggregate(proposedEffects, source, row);
    for (const source of row.suppressedFactorRows) addSourceAggregate(suppressedFactors, source, row);
    for (const source of row.exactLinkedSources) addSourceAggregate(exactLinkedSources, source, row);
  }
  return {
    proposedFactors: serializeSourceAggregateMap(proposedFactors),
    proposedEffects: serializeSourceAggregateMap(proposedEffects),
    suppressedFactors: serializeSourceAggregateMap(suppressedFactors),
    exactLinkedSources: serializeSourceAggregateMap(exactLinkedSources),
  };
}

function addContributionAggregate(map, source, parentRow) {
  const key = source.sourceId || `${source.sourceKind}:${source.sourceName}`;
  const entry = map.get(key) ?? {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    sourceType: source.sourceType,
    sourceName: source.sourceName,
    buffIds: new Set(),
    recounts: new Map(),
    evidence: new Set(),
    reasons: new Set(),
    rows: 0,
    files: new Set(),
    calculatedTotal: 0,
  };
  entry.rows += 1;
  entry.files.add(parentRow.fileName);
  entry.recounts.set(parentRow.recountId, parentRow.recountName);
  entry.calculatedTotal += Number(source.calculatedTotal ?? 0);
  addNumbersToSet(entry.buffIds, source.buffIds);
  addStringsToSet(entry.evidence, source.evidence);
  if (source.reason) entry.reasons.add(source.reason);
  map.set(key, entry);
}

function serializeContributionAggregateMap(map) {
  return [...map.values()]
    .map((entry) => ({
      sourceId: entry.sourceId,
      sourceKind: entry.sourceKind,
      sourceType: entry.sourceType,
      sourceName: entry.sourceName,
      buffIds: setToSortedNumbers(entry.buffIds),
      rows: entry.rows,
      fileCount: entry.files.size,
      calculatedTotal: entry.calculatedTotal,
      recounts: [...entry.recounts.entries()]
        .map(([recountId, recountName]) => ({ recountId, recountName }))
        .sort((left, right) => left.recountId - right.recountId),
      evidence: setToSortedStrings(entry.evidence).slice(0, 20),
      reasons: setToSortedStrings(entry.reasons).slice(0, 20),
    }))
    .sort((left, right) => right.calculatedTotal - left.calculatedTotal || right.rows - left.rows);
}

function buildContributionAggregates(previewRows) {
  const calculatedModifiers = new Map();
  const unresolvedSources = new Map();
  for (const row of previewRows) {
    for (const source of row.contributionPreview?.modifierRows ?? []) addContributionAggregate(calculatedModifiers, source, row);
    for (const source of row.contributionPreview?.unresolvedSources ?? []) addContributionAggregate(unresolvedSources, source, row);
  }
  return {
    calculatedModifiers: serializeContributionAggregateMap(calculatedModifiers),
    unresolvedSources: serializeContributionAggregateMap(unresolvedSources),
  };
}

function addRuntimeInventory(map, key, item, bucket) {
  const entry = map.get(key) ?? {
    ...item,
    rows: 0,
    files: new Set(),
    recounts: new Map(),
    actorHints: new Set(),
  };
  entry.rows += 1;
  entry.files.add(bucket.fileName);
  entry.recounts.set(bucket.recountId, bucket.recountName);
  addStringsToSet(entry.actorHints, item.actorHints);
  map.set(key, entry);
}

function sourceRowsForEntity(index, sourceEntityId) {
  return index.effectSourceRowsByEntityId.get(sourceEntityId) ?? [];
}

function sourceRowName(row, fallback) {
  return row?.sourceNames?.en ?? row?.sourceName ?? row?.familyNames?.en ?? row?.familyName ?? fallback;
}

function sourceTargetCount(rows) {
  return rows.reduce((sum, row) => sum + asArray(row.targets).length, 0);
}

function buildRuntimeSourceInventory(buckets, index) {
  const talentNodes = new Map();
  const passiveSkills = new Map();
  const buffSources = new Map();

  for (const bucket of buckets) {
    const state = bucket.state;
    for (const pair of professionTalentSourcePairs(setToSortedNumbers(state.activeProfessionTalentNodeIds))) {
      const sourceId = `talent:${pair.sourceEntityId}`;
      const sourceRows = [
        index.effectSourceRowsById.get(sourceId),
        ...sourceRowsForEntity(index, pair.sourceEntityId),
      ].filter(Boolean);
      const first = sourceRows[0];
      addRuntimeInventory(talentNodes, `${sourceId}:${pair.nodeId}`, {
        runtimeKind: "selected-profession-talent",
        runtimeId: pair.nodeId,
        sourceId,
        sourceEntityId: pair.sourceEntityId,
        sourceName: sourceRowName(first, `Talent ${pair.sourceEntityId}`),
        generatedSourceCount: sourceRows.length,
        targetLinkCount: sourceTargetCount(sourceRows),
        bridgeStatus: sourceRows.length === 0
          ? "missing-generated-source"
          : sourceTargetCount(sourceRows) === 0
            ? "generated-source-without-targets"
            : "generated-source-with-targets",
      }, bucket);
    }

    for (const passiveSkillId of setToSortedNumbers(state.activePassiveSkillIds)) {
      const sourceRows = sourceRowsForEntity(index, passiveSkillId);
      const first = sourceRows[0];
      addRuntimeInventory(passiveSkills, `passive:${passiveSkillId}`, {
        runtimeKind: "active-passive-skill",
        runtimeId: passiveSkillId,
        sourceId: first?.sourceId ?? `passive:${passiveSkillId}`,
        sourceEntityId: passiveSkillId,
        sourceName: sourceRowName(first, `Passive Skill ${passiveSkillId}`),
        generatedSourceCount: sourceRows.length,
        targetLinkCount: sourceTargetCount(sourceRows),
        bridgeStatus: sourceRows.length === 0
          ? "missing-passive-source-bridge"
          : sourceTargetCount(sourceRows) === 0
            ? "generated-source-without-targets"
            : "generated-source-with-targets",
      }, bucket);
    }

    const runtimeBuffIds = new Set([
      ...state.activeFactorBuffIds,
      ...state.activeEffectBuffIds,
    ]);
    for (const buffId of setToSortedNumbers(runtimeBuffIds)) {
      const sourceIds = setToSortedStrings(index.effectSourceIdsByBuffId.get(buffId) ?? new Set()).filter(Boolean);
      const sourceRows = sourceIds.map((sourceId) => index.effectSourceRowsById.get(sourceId)).filter(Boolean);
      const first = sourceRows[0];
      addRuntimeInventory(buffSources, `buff:${buffId}`, {
        runtimeKind: "active-buff-source",
        runtimeId: buffId,
        sourceId: first?.sourceId ?? null,
        sourceEntityId: finiteNumber(first?.sourceEntityId),
        sourceName: sourceRowName(first, `Buff ${buffId}`),
        buffIds: [buffId],
        generatedSourceCount: sourceRows.length,
        targetLinkCount: sourceTargetCount(sourceRows),
        bridgeStatus: sourceRows.length === 0
          ? "missing-buff-source-bridge"
          : sourceTargetCount(sourceRows) === 0
            ? "generated-source-without-targets"
            : "generated-source-with-targets",
        actorHints: setToSortedStrings(state.activeBuffActorsByBuffId.get(buffId) ?? new Set()),
      }, bucket);
    }
  }

  const serialize = (map) => [...map.values()]
    .map((entry) => ({
      ...entry,
      rows: entry.rows,
      fileCount: entry.files.size,
      files: undefined,
      recounts: [...entry.recounts.entries()]
        .map(([recountId, recountName]) => ({ recountId, recountName }))
        .sort((left, right) => left.recountId - right.recountId),
      actorHints: setToSortedStrings(entry.actorHints).slice(0, 20),
      actorSummary: summarizeActorHints(entry.actorHints),
    }))
    .sort((left, right) => {
      const leftMissing = left.bridgeStatus?.includes("missing") || left.bridgeStatus?.includes("without") ? 1 : 0;
      const rightMissing = right.bridgeStatus?.includes("missing") || right.bridgeStatus?.includes("without") ? 1 : 0;
      return rightMissing - leftMissing || right.rows - left.rows || String(left.sourceName).localeCompare(String(right.sourceName));
    });

  const activeBuffSources = serialize(buffSources);
  return {
    selectedProfessionTalents: serialize(talentNodes),
    activePassiveSkills: serialize(passiveSkills),
    activeBuffSources,
    externalActiveBuffSources: activeBuffSources
      .filter((row) => row.actorSummary?.externalSourceUids?.length)
      .sort((left, right) => (
        right.actorSummary.externalSourceCount - left.actorSummary.externalSourceCount
        || right.rows - left.rows
        || String(left.sourceName).localeCompare(String(right.sourceName))
      )),
  };
}

function markdownAggregateRow(row) {
  const recounts = shortList(row.recounts.map((item) => `${item.recountName} (${item.recountId})`), 5);
  const evidence = row.evidence.length ? `; evidence=${shortList(row.evidence, 4)}` : "";
  const exact = row.exactDamageIds.length ? `; exact=${shortList(row.exactDamageIds, 4)}` : "";
  return `- ${row.sourceName ?? row.sourceId} [${row.sourceKind ?? "source"}]: ${row.rows} rows across ${row.fileCount} files; recounts=${recounts || "n/a"}${evidence}${exact}`;
}

function markdownContributionAggregateRow(row) {
  const recounts = shortList(row.recounts.map((item) => `${item.recountName} (${item.recountId})`), 5);
  const evidence = row.evidence.length ? `; evidence=${shortList(row.evidence, 4)}` : "";
  const reasons = row.reasons.length ? `; reasons=${shortList(row.reasons, 4)}` : "";
  const total = row.calculatedTotal > 0 ? `; estimated=${formatNumber(row.calculatedTotal)}` : "";
  return `- ${row.sourceName ?? row.sourceId} [${row.sourceKind ?? "source"}]: ${row.rows} rows across ${row.fileCount} files; recounts=${recounts || "n/a"}${total}${evidence}${reasons}`;
}

function markdownRuntimeInventoryRow(row) {
  const recounts = shortList(row.recounts.map((item) => `${item.recountName} (${item.recountId})`), 4);
  const actors = row.actorHints?.length ? `; actors=${shortList(row.actorHints, 3)}` : "";
  const external = row.actorSummary?.externalSourceUids?.length
    ? `; externalSources=${shortList(row.actorSummary.externalSourceUids, 6)}`
    : "";
  const self = row.actorSummary?.selfSourceUids?.length
    ? `; selfSources=${shortList(row.actorSummary.selfSourceUids, 3)}`
    : "";
  return `- ${row.sourceName ?? row.sourceId ?? row.runtimeId} [${row.runtimeKind}]: ${row.rows} rows across ${row.fileCount} files; status=${row.bridgeStatus}; targets=${row.targetLinkCount}; generatedSources=${row.generatedSourceCount}; recounts=${recounts || "n/a"}${external}${self}${actors}`;
}

function markdownAggregateSection(lines, title, rows, options, formatter = markdownAggregateRow) {
  lines.push(`### ${title}`);
  lines.push("");
  if (rows.length === 0) {
    lines.push("- None in the scanned logs.");
  } else {
    for (const row of rows.slice(0, options.maxRows)) lines.push(formatter(row));
  }
  lines.push("");
}

function damageSummary(row) {
  const name = row.damageName ?? row.displayName ?? `Damage ${row.damageId}`;
  const pieces = [`${name} (${row.damageId})`, `hits=${formatNumber(row.hits)}`, `total=${formatNumber(row.total)}`];
  if (row.sourceKind) pieces.push(row.sourceKind);
  return pieces.join("; ");
}

function markdownPreviewRow(row) {
  const lines = [];
  const player = row.playerName ? `${row.playerName} #${row.playerUid}` : `#${row.playerUid}`;
  lines.push(`- ${row.recountName} (\`${row.recountId}\`) - ${player} - ${row.origin} \`${row.fileName}\``);
  if (row.exactDamageRows.length) {
    lines.push(`  - exact numeric rows: ${shortList(row.exactDamageRows.map(damageSummary), 4)}`);
  }
  if (row.proposedFactorSourceOnlyRows.length) {
    lines.push(`  - proposed factor source-only evidence: ${shortList(row.proposedFactorSourceOnlyRows.map(sourceSummary), 4)}`);
  }
  if (row.proposedEffectSourceOnlyRows.length) {
    lines.push(`  - proposed effect/talent/passive source-only evidence: ${shortList(row.proposedEffectSourceOnlyRows.map(sourceSummary), 4)}`);
  }
  if (row.suppressedFactorRows.length) {
    lines.push(`  - suppressed item-only factor rows: ${shortList(row.suppressedFactorRows.map(sourceSummary), 4)}`);
  }
  if (row.exactLinkedSources.length) {
    lines.push(`  - active sources already covered by exact rows: ${shortList(row.exactLinkedSources.map(sourceSummary), 4)}`);
  }
  const contribution = row.contributionPreview;
  if (contribution?.modifierRows?.length) {
    lines.push(`  - calculated modifier contributions: ${shortList(contribution.modifierRows.map(calculatedContributionSummary), 4)}`);
    lines.push(
      `  - calculated base/remainder: ${formatNumber(contribution.baseTotal)}; estimated uplift=${formatNumber(contribution.upliftTotal)}; product multiplier=${contribution.productMultiplier.toFixed(5)}`,
    );
  }
  if (contribution?.unresolvedSources?.length) {
    lines.push(`  - linked but unsplit sources: ${shortList(contribution.unresolvedSources.map(unresolvedContributionSummary), 4)}`);
  }
  return lines.join("\n");
}

function writeMarkdown(report, options) {
  const lines = [];
  lines.push("# Skill Source Row Preview");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Event files scanned: ${report.inputs.eventFiles.length} of ${report.inputs.totalEventFiles}`);
  lines.push(`- AttributionCensus files scanned: ${report.inputs.censusFiles.length} of ${report.inputs.totalCensusFiles}`);
  lines.push(`- Formula-lab calibration loaded: ${report.formulaCalibrationCounters.loaded ? "yes" : "no"}`);
  lines.push(`- Formula-lab plausible fits attached: ${report.formulaCalibrationCounters.attachedCandidates} of ${report.formulaCalibrationCounters.plausibleFits}`);
  lines.push(`- Preview parent rows: ${report.previewCounters.previewRows}`);
  lines.push(`- Exact emitted child damage rows: ${report.previewCounters.exactDamageRows}`);
  lines.push(`- Legacy Phantom Factor source-only rows seen by preview: ${report.previewCounters.legacyFactorSourceOnlyRows}`);
  lines.push(`- Proposed runtime-observed Phantom Factor source-only rows: ${report.previewCounters.proposedFactorSourceOnlyRows}`);
  lines.push(`- Proposed effect/talent/passive source-only rows: ${report.previewCounters.proposedEffectSourceOnlyRows}`);
  lines.push(`- Suppressed item-package-only Phantom Factor rows: ${report.previewCounters.suppressedFactorRows}`);
  lines.push(`- Active sources already covered by exact emitted damage rows: ${report.previewCounters.exactLinkedSourceRows}`);
  lines.push(`- Parent rows with calculated modifier contributions: ${report.previewCounters.contributionRowsWithCalculatedModifiers}`);
  lines.push(`- Calculated modifier contribution rows: ${report.previewCounters.calculatedModifierRows}`);
  lines.push(`- Linked/active sources still unsplit: ${report.previewCounters.unresolvedContributionSources}`);
  lines.push(`- Active buff source rows with external source UID evidence: ${report.runtimeSourceInventory.externalActiveBuffSources.length}`);
  lines.push(`- Estimated modifier uplift total: ${formatNumber(report.previewCounters.estimatedUpliftTotal)}`);
  lines.push("");
  lines.push("## Preview Policy");
  lines.push("");
  lines.push("- Exact emitted damage IDs are the only rows allowed to carry numeric damage/DPS/share.");
  lines.push("- Source-only rows are evidence rows only: active buff/passive/talent/source state linked to the parent, no contribution split.");
  lines.push("- Item-package-only Phantom Factor evidence is suppressed from the proposed source-only set because it proves selection/grade, not runtime activation.");
  lines.push("- When an active source already produced an exact emitted child damage row, the preview records it as exact-linked instead of adding a duplicate source-only row.");
  lines.push("- Calculated contribution rows are estimates: they require runtime evidence plus a static multiplier, remove the modifier uplift from the exact damage row into a base/remainder row, and keep each parent total balanced.");
  lines.push("- When live runtime proves activation but does not expose grade, this preview may use a previous formula-lab `plausible-fit` as calibration; those rows are marked with `formula-lab-plausible-fit`.");
  lines.push("- Multiple modifiers are treated as multiplicative; their shared uplift is allocated by log multiplier weight so row totals add back to the parent.");
  lines.push("");
  lines.push("## Source Evidence Aggregates");
  lines.push("");
  markdownAggregateSection(lines, "Proposed Runtime Phantom Factor Evidence", report.sourceAggregates.proposedFactors, options);
  markdownAggregateSection(lines, "Proposed Effect/Talent/Passive Evidence", report.sourceAggregates.proposedEffects, options);
  markdownAggregateSection(lines, "Suppressed Item-Package-Only Factor Evidence", report.sourceAggregates.suppressedFactors, options);
  markdownAggregateSection(lines, "Exact-Linked Active Sources", report.sourceAggregates.exactLinkedSources, options);

  lines.push("## Calculated Contribution Aggregates");
  lines.push("");
  markdownAggregateSection(lines, "Calculated Modifier Contributions", report.contributionAggregates.calculatedModifiers, options, markdownContributionAggregateRow);
  markdownAggregateSection(lines, "Linked But Unsplit Sources", report.contributionAggregates.unresolvedSources, options, markdownContributionAggregateRow);

  lines.push("## Runtime Source Bridge Inventory");
  lines.push("");
  for (const [title, rows] of [
    ["Selected Profession Talents", report.runtimeSourceInventory.selectedProfessionTalents],
    ["Active Passive Skills", report.runtimeSourceInventory.activePassiveSkills],
    ["External Active Buff Sources", report.runtimeSourceInventory.externalActiveBuffSources],
    ["Active Buff Sources", report.runtimeSourceInventory.activeBuffSources],
  ]) {
    lines.push(`### ${title}`);
    lines.push("");
    if (!rows.length) {
      lines.push("- None in the scanned logs.");
    } else {
      for (const row of rows.slice(0, options.maxRows)) lines.push(markdownRuntimeInventoryRow(row));
    }
    lines.push("");
  }

  const changedRows = report.previewRows.filter(
    (row) =>
      row.proposedFactorSourceOnlyRows.length ||
      row.proposedEffectSourceOnlyRows.length ||
      row.suppressedFactorRows.length ||
      row.exactLinkedSources.length ||
      row.contributionPreview?.modifierRows?.length ||
      row.contributionPreview?.unresolvedSources?.length,
  );
  lines.push("## Rows With Proposed Changes");
  lines.push("");
  if (changedRows.length === 0) {
    lines.push("- No changed source-row candidates found in the scanned logs.");
  } else {
    for (const row of changedRows.slice(0, options.maxRows)) lines.push(markdownPreviewRow(row));
  }
  lines.push("");

  const suppressedRows = report.previewRows.filter((row) => row.suppressedFactorRows.length > 0);
  lines.push("## Suppressed Item-Only Factor Rows");
  lines.push("");
  if (suppressedRows.length === 0) {
    lines.push("- None in the scanned logs.");
  } else {
    for (const row of suppressedRows.slice(0, options.maxRows)) lines.push(markdownPreviewRow(row));
  }
  lines.push("");

  const proposedRows = report.previewRows.filter((row) => row.proposedFactorSourceOnlyRows.length > 0 || row.proposedEffectSourceOnlyRows.length > 0);
  lines.push("## Proposed Source-Only Evidence Rows");
  lines.push("");
  if (proposedRows.length === 0) {
    lines.push("- None in the scanned logs.");
  } else {
    for (const row of proposedRows.slice(0, options.maxRows)) lines.push(markdownPreviewRow(row));
  }
  lines.push("");

  const exactLinkedRows = report.previewRows.filter((row) => row.exactLinkedSources.length > 0);
  lines.push("## Exact-Linked Active Sources");
  lines.push("");
  if (exactLinkedRows.length === 0) {
    lines.push("- None in the scanned logs.");
  } else {
    for (const row of exactLinkedRows.slice(0, options.maxRows)) lines.push(markdownPreviewRow(row));
  }
  lines.push("");

  const calculatedRows = report.previewRows.filter((row) => row.contributionPreview?.modifierRows?.length > 0);
  lines.push("## Calculated Contribution Rows");
  lines.push("");
  if (calculatedRows.length === 0) {
    lines.push("- None in the scanned logs.");
  } else {
    for (const row of calculatedRows.slice(0, options.maxRows)) lines.push(markdownPreviewRow(row));
  }
  lines.push("");

  lines.push("## Runtime Scan Counters");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify({ event: report.eventCounters, census: report.censusCounters }, null, 2));
  lines.push("```");
  lines.push("");

  lines.push("## Files");
  lines.push("");
  for (const file of report.inputs.eventFiles.slice(0, options.maxRows)) lines.push(`- Event: \`${file}\``);
  for (const file of report.inputs.censusFiles.slice(0, options.maxRows)) lines.push(`- Census: \`${file}\``);
  lines.push("");
  lines.push("## Limitation");
  lines.push("");
  lines.push("This report can identify active/selected/runtime-observed source links and exact emitted damage IDs. It still cannot infer numeric contribution for a modifier source unless the game emits a separate damage ID or a controlled baseline-vs-active capture proves the multiplier.");
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!fs.existsSync(options.eventRoot)) throw new Error(`Event log root not found: ${options.eventRoot}`);

  const index = buildGeneratedIndex();
  const formulaCalibrationCounters = applyFormulaLabCalibration(index, options.formulaLab);
  const inputs = findInputFiles(options);
  const eventScan = scanEventFiles(inputs.eventFiles, index, options);
  const censusScan = scanCensusFiles(inputs.censusFiles, index, options);
  const buckets = mergeBucketMaps(eventScan.buckets, censusScan.buckets);
  const preview = buildPreviewRows([...buckets.values()], index);
  const sourceAggregates = buildSourceAggregates(preview.rows);
  const contributionAggregates = buildContributionAggregates(preview.rows);
  const runtimeSourceInventory = buildRuntimeSourceInventory([...buckets.values()], index);

  const report = {
    generatedAt: new Date().toISOString(),
    eventRoot: options.eventRoot,
    playerUid: options.playerUid,
    inputs,
    staticSourceCandidateCount: index.staticSourceCandidateCount,
    formulaCalibrationCounters,
    eventCounters: eventScan.counters,
    censusCounters: censusScan.counters,
    previewCounters: preview.counters,
    sourceAggregates,
    contributionAggregates,
    runtimeSourceInventory,
    previewRows: preview.rows,
  };

  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(options.outMd, writeMarkdown(report, options));

  console.log(`Scanned ${inputs.eventFiles.length} event files and ${inputs.censusFiles.length} census files.`);
  if (formulaCalibrationCounters.loaded) {
    console.log(
      `Formula-lab calibrations: ${formulaCalibrationCounters.plausibleFits} plausible fits, ${formulaCalibrationCounters.attachedCandidates} attached candidates.`,
    );
  }
  console.log(`Preview parent rows: ${preview.counters.previewRows}`);
  console.log(`Exact emitted child damage rows: ${preview.counters.exactDamageRows}`);
  console.log(`Legacy factor source-only rows: ${preview.counters.legacyFactorSourceOnlyRows}`);
  console.log(`Proposed factor source-only rows: ${preview.counters.proposedFactorSourceOnlyRows}`);
  console.log(`Proposed effect/talent/passive source-only rows: ${preview.counters.proposedEffectSourceOnlyRows}`);
  console.log(`Suppressed item-package-only factor rows: ${preview.counters.suppressedFactorRows}`);
  console.log(`Exact-linked active sources: ${preview.counters.exactLinkedSourceRows}`);
  console.log(`Rows with calculated modifier contributions: ${preview.counters.contributionRowsWithCalculatedModifiers}`);
  console.log(`Calculated modifier rows: ${preview.counters.calculatedModifierRows}`);
  console.log(`Linked/active sources still unsplit: ${preview.counters.unresolvedContributionSources}`);
  console.log(`Wrote ${options.outJson}`);
  console.log(`Wrote ${options.outMd}`);
}

main();
