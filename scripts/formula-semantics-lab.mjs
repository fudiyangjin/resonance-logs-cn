#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DIR_NAME = "com.resonance-logs-cn";
const DEFAULT_EVENT_LIMIT = 24;
const DEFAULT_CENSUS_LIMIT = 24;
const DEFAULT_MAX_ROWS = 80;
const DEFAULT_MIN_HITS = 10;

const repoRoot = process.cwd();
const defaultTalentProbePath = path.resolve(
  repoRoot,
  "..",
  "BPSR-UID-Extractors",
  "output",
  "probing-reports",
  "TalentEffectModelProbe.json",
);
const defaultEventRoot = process.env.APPDATA
  ? path.join(process.env.APPDATA, APP_DIR_NAME, "EventLogs")
  : path.join(os.homedir(), "AppData", "Roaming", APP_DIR_NAME, "EventLogs");

function parseArgs(argv) {
  const options = {
    eventRoot: defaultEventRoot,
    latest: DEFAULT_EVENT_LIMIT,
    latestCensus: DEFAULT_CENSUS_LIMIT,
    all: false,
    outJson: path.join(repoRoot, "DEV_exports", "formula-semantics-lab.json"),
    outMd: path.join(repoRoot, "DEV_exports", "formula-semantics-lab.md"),
    talentProbe: defaultTalentProbePath,
    maxRows: DEFAULT_MAX_ROWS,
    minHits: DEFAULT_MIN_HITS,
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
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--talent-probe":
        options.talentProbe = path.resolve(next());
        break;
      case "--max-rows":
        options.maxRows = Number(next());
        break;
      case "--min-hits":
        options.minHits = Number(next());
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
  console.log(`Formula Semantics Lab - compare static modifier candidates with runtime event logs.

Usage:
  node scripts/formula-semantics-lab.mjs [options]

Options:
  --event-root <dir>       EventLogs root. Default: ${defaultEventRoot}
  --latest <count>         Latest normal event log files to scan. Default: ${DEFAULT_EVENT_LIMIT}
  --latest-census <count>  Latest AttributionCensus files to scan. Default: ${DEFAULT_CENSUS_LIMIT}
  --all                    Scan all event/census JSON files under the event root.
  --out-json <path>        JSON report path. Default: DEV_exports/formula-semantics-lab.json
  --out-md <path>          Markdown report path. Default: DEV_exports/formula-semantics-lab.md
  --talent-probe <path>    Optional TalentEffectModelProbe report. Default: ${defaultTalentProbePath}
  --max-rows <count>       Max candidate rows in Markdown sections. Default: ${DEFAULT_MAX_ROWS}
  --min-hits <count>       Minimum active/inactive hits before fitting. Default: ${DEFAULT_MIN_HITS}
  --help                   Show this help.

Notes:
  This is an evidence report. Existing history/event data can bootstrap source
  observations and snapshot-delta comparisons, but exact formula contribution
  needs controlled captures with isolated baseline and active states.
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

function basename(filePath) {
  return path.basename(filePath);
}

function asArray(value) {
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

function pickName(row) {
  return row?.sourceNames?.en ?? row?.familyNames?.en ?? row?.Names?.en ?? row?.Name ?? row?.sourceName ?? row?.familyName ?? null;
}

function statValue(stats, snake, camel = snake) {
  const value = stats?.[snake] ?? stats?.[camel];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rawJson(entry) {
  if (!entry?.raw) return null;
  try {
    return JSON.parse(entry.raw);
  } catch {
    return null;
  }
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return "n/a";
  return Math.round(Number(value)).toLocaleString("en-US");
}

function average(total, hits) {
  return hits > 0 ? total / hits : null;
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
    });
  }
  return rows;
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

  for (const [recountIdText, row] of Object.entries(recount)) {
    const recountId = Number(recountIdText);
    recountNames.set(recountId, row.Names?.en ?? row.Name ?? row.RecountName ?? `Recount ${recountId}`);
    const damageIds = uniqueNumbers(row.DamageId);
    recountToDamageIds.set(recountId, damageIds);
    for (const damageId of damageIds) {
      const rows = damageToRecount.get(damageId) ?? [];
      rows.push({ recountId, name: recountNames.get(recountId) });
      damageToRecount.set(damageId, rows);
    }
  }

  for (const [damageIdText, row] of Object.entries(breakdown)) {
    const damageId = Number(damageIdText);
    damageNames.set(damageId, row.DisplayNames?.en ?? row.DisplayName ?? row.DamageNames?.en ?? row.DamageName ?? `Damage ${damageId}`);
    if (Number.isFinite(Number(row.ParentRecountId)) && !damageToRecount.has(damageId)) {
      damageToRecount.set(damageId, [
        {
          recountId: Number(row.ParentRecountId),
          name: row.ParentRecountNames?.en ?? row.ParentRecountName ?? `Recount ${row.ParentRecountId}`,
        },
      ]);
    }
  }

  const candidates = [];
  const directFactorDamageIds = new Set(Object.keys(factors.damageIdToFactorBuffIds ?? {}).map(Number));
  for (const source of Object.values(effectSources.effectSourcesById ?? {})) {
    const targets = asArray(source.targets);
    if (targets.length === 0) continue;

    const targetRecountIds = [];
    const targetDamageIds = [];
    for (const target of targets) {
      if (target.targetKind === "recount") {
        const recountId = finiteNumber(target.recountId);
        if (recountId !== null) {
          targetRecountIds.push(recountId);
          targetDamageIds.push(...(recountToDamageIds.get(recountId) ?? []));
        }
      } else if (target.targetKind === "damage") {
        const damageId = finiteNumber(target.damageId ?? target.targetId);
        if (damageId !== null) targetDamageIds.push(damageId);
      }
    }

    const buffIds = uniqueNumbers(source.buffIds);
    const gradeRows = source.modifierEvidence?.gradeRows ?? [];
    const expectedMultipliers = expectedMultipliersFromGradeRows(gradeRows);
    const sourceEntityId = finiteNumber(source.sourceEntityId);
    const exactChildDamageIds = uniqueNumbers(
      buffIds.flatMap((buffId) => {
        const ids = [];
        for (const [damageId, sourceBuffIds] of Object.entries(factors.damageIdToFactorBuffIds ?? {})) {
          if (asArray(sourceBuffIds).map(Number).includes(buffId)) ids.push(Number(damageId));
        }
        return ids;
      }),
    );

    candidates.push({
      key: String(source.sourceId ?? `${source.sourceKind}:${sourceEntityId ?? candidates.length}`),
      sourceId: String(source.sourceId ?? ""),
      sourceKind: source.sourceKind ?? "unknown",
      sourceType: source.sourceType ?? "unknown",
      sourceName: pickName(source),
      runtimeDetection: source.runtimeDetection ?? null,
      sourceEntityId,
      buffIds,
      targetRecountIds: uniqueNumbers(targetRecountIds),
      targetDamageIds: uniqueNumbers(targetDamageIds),
      exactChildDamageIds,
      hasExactChildDamage: exactChildDamageIds.some((damageId) => directFactorDamageIds.has(damageId)),
      targetNames: uniqueStrings([
        ...uniqueNumbers(targetRecountIds).map((id) => recountNames.get(id)),
        ...uniqueNumbers(targetDamageIds).map((id) => damageNames.get(id)),
      ]).slice(0, 12),
      cleanDescription: source.cleanDescriptions?.en ?? null,
      expectedMultipliers,
      targetEvidence: targets.map((target) => ({
        targetKind: target.targetKind ?? null,
        recountId: target.recountId ?? null,
        damageId: target.damageId ?? null,
        relationshipKind: target.relationshipKind ?? null,
        evidenceStatus: target.evidenceStatus ?? null,
      })),
    });
  }

  const candidatesByTargetDamageId = new Map();
  for (const candidate of candidates) {
    for (const damageId of candidate.targetDamageIds) {
      const list = candidatesByTargetDamageId.get(damageId) ?? [];
      list.push(candidate);
      candidatesByTargetDamageId.set(damageId, list);
    }
  }

  return {
    recount,
    breakdown,
    effectSources,
    factors,
    candidates,
    candidatesByTargetDamageId,
    damageToRecount,
    recountToDamageIds,
    damageNames,
    recountNames,
  };
}

function buildTalentCoverage(index, talentProbePath) {
  const effectSourceRows = Object.values(index.effectSources.effectSourcesById ?? {});
  const talentSources = effectSourceRows.filter((row) => row.sourceKind === "talent-passive");
  const talentSourcesWithTargets = talentSources.filter((row) => asArray(row.targets).length > 0);
  const talentTargetLinks = talentSources.flatMap((row) =>
    asArray(row.targets).map((target) => ({
      sourceId: row.sourceId,
      sourceName: pickName(row),
      targetKind: target.targetKind ?? null,
      damageId: finiteNumber(target.damageId ?? target.targetId),
      recountId: finiteNumber(target.recountId),
      relationshipKind: target.relationshipKind ?? null,
      evidenceStatus: target.evidenceStatus ?? null,
    })),
  );
  const talentProbe = readOptionalJson(talentProbePath);
  const probeRecountRows = Object.values(talentProbe?.recountEvidenceIndex ?? {});
  const probeSkillRows = Object.values(talentProbe?.skillEvidenceIndex ?? {});
  const probeLinkedTalentRows = probeRecountRows.filter((row) => row.linkedTalent);
  const probeFormulaRows = probeRecountRows.filter((row) => asArray(row.formulaMatches).length > 0);
  const probePairRows = probeSkillRows.filter((row) => asArray(row.talentSkillPairRecords).length > 0);
  const probeDescriptionRows = probeSkillRows.filter((row) => asArray(row.descriptionLinkTextMentions).length > 0);

  return {
    generatedEffectSources: {
      talentPassiveRows: talentSources.length,
      talentPassiveRowsWithTargets: talentSourcesWithTargets.length,
      talentTargetLinks: talentTargetLinks.length,
      talentDamageTargetLinks: talentTargetLinks.filter((row) => row.targetKind === "damage").length,
      talentRecountTargetLinks: talentTargetLinks.filter((row) => row.targetKind === "recount").length,
      talentRowsWithRuntimeBuffIds: talentSources.filter((row) => asArray(row.buffIds).length > 0).length,
      examples: talentSourcesWithTargets.slice(0, 12).map((row) => ({
        sourceId: row.sourceId,
        sourceName: pickName(row),
        buffIds: uniqueNumbers(row.buffIds),
        targets: asArray(row.targets).slice(0, 8).map((target) => ({
          targetKind: target.targetKind ?? null,
          damageId: finiteNumber(target.damageId ?? target.targetId),
          recountId: finiteNumber(target.recountId),
          relationshipKind: target.relationshipKind ?? null,
          evidenceStatus: target.evidenceStatus ?? null,
        })),
      })),
    },
    probe: {
      path: talentProbePath,
      loaded: Boolean(talentProbe),
      summary: talentProbe?.summary ?? null,
      linkedTalentRecountRows: probeLinkedTalentRows.length,
      formulaMatchRecountRows: probeFormulaRows.length,
      skillRowsWithOpcode6PairEvidence: probePairRows.length,
      skillRowsWithDescriptionLinkTextEvidence: probeDescriptionRows.length,
      linkedTalentExamples: probeLinkedTalentRows.slice(0, 12).map((row) => ({
        recountId: row.recountId,
        recountName: row.recountName,
        damageIds: uniqueNumbers(row.damageIds),
        talentId: row.linkedTalent?.talentId ?? null,
        talentName: row.linkedTalent?.talentName ?? null,
        bridge: row.linkedTalent?.bridge ?? null,
        bridgeStatus: row.linkedTalent?.bridgeStatus ?? null,
      })),
      formulaExamples: probeFormulaRows.slice(0, 8).map((row) => ({
        recountId: row.recountId,
        recountName: row.recountName,
        formulaMatches: asArray(row.formulaMatches).slice(0, 4).map((match) => ({
          talentId: match.talent?.id ?? null,
          talentName: match.talent?.name ?? null,
          buffId: match.buffRecord?.buffId ?? null,
          evidenceStatus: match.evidenceStatus ?? null,
        })),
      })),
    },
  };
}

function findInputFiles(options) {
  const allFiles = walkJsonFiles(options.eventRoot).sort((a, b) => fileMtime(b) - fileMtime(a));
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

function normalizeFactorItem(item) {
  return {
    factorBuffId: finiteNumber(item.factor_buff_id ?? item.factorBuffId),
    itemConfigId: finiteNumber(item.item_config_id ?? item.itemConfigId),
    grade: finiteNumber(item.grade),
    familyId: finiteNumber(item.family_id ?? item.familyId),
  };
}

function normalizePassiveSkill(skill) {
  return {
    passiveUuid: finiteNumber(skill.passive_uuid ?? skill.passiveUuid),
    targetUid: finiteNumber(skill.target_uid ?? skill.targetUid),
    skillId: finiteNumber(skill.skill_id ?? skill.skillId),
    skillLevel: finiteNumber(skill.skill_level ?? skill.skillLevel),
    skillStage: finiteNumber(skill.skill_stage ?? skill.skillStage),
  };
}

function normalizeProfessionTalent(talent) {
  return {
    professionId: finiteNumber(talent.profession_id ?? talent.professionId),
    talentNodeId: finiteNumber(talent.talent_node_id ?? talent.talentNodeId),
    talentStageCfgId: finiteNumber(talent.talent_stage_cfg_id ?? talent.talentStageCfgId),
  };
}

function normalizePlayerSnapshot(entry) {
  const raw = rawJson(entry);
  if (!raw) return null;
  const uid = finiteNumber(raw.uid ?? raw.playerUid ?? entry.uid ?? entry.source_uid ?? entry.sourceUid);
  if (uid === null) return null;
  const activeFactorItems = asArray(raw.activeFactorItems ?? raw.active_factor_items).map(normalizeFactorItem);
  const activePassiveSkills = asArray(raw.activePassiveSkills ?? raw.active_passive_skills).map(normalizePassiveSkill);
  const activeProfessionTalents = asArray(raw.activeProfessionTalents ?? raw.active_profession_talents).map(normalizeProfessionTalent);
  const activeProfessionTalentNodeIds = uniqueNumbers(activeProfessionTalents.map((talent) => talent.talentNodeId));
  return {
    tsMs: Number(entry.ts_ms ?? entry.tsMs ?? 0),
    uid,
    name: raw.name ?? entry.name_hint ?? entry.nameHint ?? null,
    classId: finiteNumber(raw.classId ?? raw.class_id),
    classSpec: raw.classSpec ?? raw.class_spec ?? null,
    activeFactorBuffIds: uniqueNumbers([
      ...asArray(raw.activeFactorBuffs ?? raw.active_factor_buffs).map((buff) => buff.factor_buff_id ?? buff.factorBuffId),
      ...activeFactorItems.map((item) => item.factorBuffId),
    ]),
    activeEffectBuffIds: uniqueNumbers(asArray(raw.activeEffectBuffs ?? raw.active_effect_buffs).map((buff) => buff.effect_source_buff_id ?? buff.effectSourceBuffId)),
    activeEffectSourceIds: uniqueStrings(asArray(raw.activeEffectSources ?? raw.active_effect_sources).map((source) => source.source_id ?? source.sourceId)),
    activeFactorItems,
    activePassiveSkillIds: uniqueNumbers(activePassiveSkills.map((skill) => skill.skillId)),
    activePassiveSkillUuids: uniqueNumbers(activePassiveSkills.map((skill) => skill.passiveUuid)),
    activeProfessionTalentNodeIds,
    activeProfessionTalentSourcePairs: professionTalentSourcePairs(activeProfessionTalentNodeIds),
    activeProfessionTalentStageCfgIds: uniqueNumbers(activeProfessionTalents.map((talent) => talent.talentStageCfgId)),
  };
}

function normalizeSkillSnapshot(entry) {
  const raw = rawJson(entry);
  if (!raw) return null;
  const stats = raw.stats ?? {};
  const skillId = finiteNumber(raw.skillId ?? raw.skill_id ?? entry.uid);
  const playerUid = finiteNumber(raw.playerUid ?? raw.player_uid ?? entry.source_uid ?? entry.sourceUid);
  if (skillId === null || playerUid === null) return null;

  const targetUid = finiteNumber(raw.targetUid ?? raw.target_uid ?? entry.target_uid ?? entry.targetUid);
  return {
    file: null,
    tsMs: Number(entry.ts_ms ?? entry.tsMs ?? 0),
    category: entry.category,
    playerUid,
    playerName: raw.playerName ?? raw.player_name ?? entry.source_label ?? entry.sourceLabel ?? null,
    targetUid,
    targetName: raw.targetName ?? raw.target_name ?? entry.target_label ?? entry.targetLabel ?? null,
    skillId,
    total: statValue(stats, "total_value", "totalValue"),
    effectiveTotal: statValue(stats, "effective_total_value", "effectiveTotalValue"),
    hits: statValue(stats, "hits"),
    critHits: statValue(stats, "crit_hits", "critHits"),
    critTotal: statValue(stats, "crit_total_value", "critTotalValue"),
    luckyHits: statValue(stats, "lucky_hits", "luckyHits"),
    luckyTotal: statValue(stats, "lucky_total_value", "luckyTotalValue"),
  };
}

function sourceActive(candidate, snapshot) {
  if (!snapshot) return { active: false, evidence: [] };
  const evidence = [];
  for (const buffId of candidate.buffIds) {
    if (snapshot.activeFactorBuffIds.includes(buffId)) evidence.push(`activeFactorBuff:${buffId}`);
    if (snapshot.activeEffectBuffIds.includes(buffId)) evidence.push(`activeEffectBuff:${buffId}`);
    for (const item of snapshot.activeFactorItems) {
      if (item.factorBuffId === buffId) {
        evidence.push(`activeFactorItem:${buffId}${item.grade !== null ? `:G${item.grade}` : ""}`);
      }
    }
  }
  if (candidate.sourceId && snapshot.activeEffectSourceIds.includes(candidate.sourceId)) {
    evidence.push(`activeEffectSource:${candidate.sourceId}`);
  }
  if (candidate.sourceEntityId !== null && snapshot.activePassiveSkillIds.includes(candidate.sourceEntityId)) {
    evidence.push(`activePassiveSkill:${candidate.sourceEntityId}`);
  }
  if (
    candidate.sourceKind === "talent-passive" &&
    candidate.sourceEntityId !== null &&
    snapshot.activeProfessionTalentNodeIds.includes(candidate.sourceEntityId)
  ) {
    evidence.push(`activeProfessionTalent:${candidate.sourceEntityId}`);
  }
  if (candidate.sourceKind === "talent-passive" && candidate.sourceEntityId !== null) {
    for (const pair of asArray(snapshot.activeProfessionTalentSourcePairs)) {
      if (pair.sourceEntityId === candidate.sourceEntityId) {
        evidence.push(`activeProfessionTalentNode:${pair.nodeId}->talent:${pair.sourceEntityId}`);
      }
    }
  }
  return { active: evidence.length > 0, evidence };
}

function observedGrades(candidate, snapshot) {
  if (!snapshot) return [];
  const grades = [];
  for (const item of snapshot.activeFactorItems) {
    if (candidate.buffIds.includes(item.factorBuffId) && item.grade !== null) grades.push(item.grade);
  }
  return uniqueNumbers(grades);
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

function scanEventFiles(eventFiles) {
  const playerSnapshotsByFilePlayer = new Map();
  const skillSnapshotsByGroup = new Map();
  const counters = {
    eventFilesRead: 0,
    eventEntries: 0,
    playerSnapshots: 0,
    skillSnapshots: 0,
    targetSkillSnapshots: 0,
    unreadableFiles: 0,
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
    for (const entry of asArray(payload.entries)) {
      counters.eventEntries += 1;
      if (entry.action !== "snapshot") continue;

      if (entry.category === "player") {
        const snapshot = normalizePlayerSnapshot(entry);
        if (!snapshot) continue;
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
        snapshot.file = filePath;
        const key = groupKeyForSkill(snapshot);
        const list = skillSnapshotsByGroup.get(key) ?? [];
        list.push(snapshot);
        skillSnapshotsByGroup.set(key, list);
        counters.skillSnapshots += 1;
        if (entry.category === "player_target_skill_damage") counters.targetSkillSnapshots += 1;
      }
    }
  }

  for (const list of playerSnapshotsByFilePlayer.values()) {
    list.sort((left, right) => left.tsMs - right.tsMs);
  }

  const intervals = [];
  for (const snapshots of skillSnapshotsByGroup.values()) {
    snapshots.sort((left, right) => left.tsMs - right.tsMs);
    let previous = null;
    for (const current of snapshots) {
      if (previous) {
        const deltaTotal = current.total - previous.total;
        const deltaHits = current.hits - previous.hits;
        const deltaCritHits = current.critHits - previous.critHits;
        const deltaLuckyHits = current.luckyHits - previous.luckyHits;
        const reset = deltaTotal < 0 || deltaHits < 0 || current.tsMs < previous.tsMs;
        if (!reset && deltaHits > 0 && deltaTotal > 0) {
          const playerSnapshots = playerSnapshotsByFilePlayer.get(`${current.file}|${current.playerUid}`) ?? [];
          const playerSnapshot = latestSnapshotAt(playerSnapshots, current.tsMs);
          intervals.push({
            file: current.file,
            tsMs: current.tsMs,
            category: current.category,
            playerUid: current.playerUid,
            playerName: current.playerName,
            targetUid: current.targetUid,
            targetName: current.targetName,
            skillId: current.skillId,
            deltaTotal,
            deltaEffectiveTotal: current.effectiveTotal - previous.effectiveTotal,
            deltaHits,
            deltaCritHits: Math.max(0, deltaCritHits),
            deltaLuckyHits: Math.max(0, deltaLuckyHits),
            avgPerHit: deltaTotal / deltaHits,
            elapsedMs: current.tsMs - previous.tsMs,
            playerSnapshot,
            precision: "snapshot-delta",
          });
        }
      }
      previous = current;
    }
  }

  return { counters, intervals };
}

function scanCensusFiles(censusFiles, index) {
  const observations = [];
  const counters = {
    censusFilesRead: 0,
    censusRows: 0,
    rowsWithActivePassiveSkills: 0,
    rowsWithActiveProfessionTalents: 0,
    unreadableFiles: 0,
  };

  for (const filePath of censusFiles) {
    let payload;
    try {
      payload = readJson(filePath);
    } catch {
      counters.unreadableFiles += 1;
      continue;
    }
    counters.censusFilesRead += 1;
    for (const row of asArray(payload.rows)) {
      counters.censusRows += 1;
      const damageId = finiteNumber(row.damageId);
      if (damageId === null) continue;
      const candidates = index.candidatesByTargetDamageId.get(damageId) ?? [];
      const activePassiveSkillIds = uniqueNumbers([
        ...asArray(row.activePassiveSkillIds ?? row.active_passive_skill_ids),
        ...asArray(row.activePassiveSkills ?? row.active_passive_skills).map((skill) => skill.skill_id ?? skill.skillId),
      ]);
      const activePassiveSkillUuids = uniqueNumbers([
        ...asArray(row.activePassiveSkillUuids ?? row.active_passive_skill_uuids),
        ...asArray(row.activePassiveSkills ?? row.active_passive_skills).map((skill) => skill.passive_uuid ?? skill.passiveUuid),
      ]);
      const activeProfessionTalentNodeIds = uniqueNumbers([
        ...asArray(row.activeProfessionTalentNodeIds ?? row.active_profession_talent_node_ids),
        ...asArray(row.activeProfessionTalents ?? row.active_profession_talents).map((talent) => talent.talent_node_id ?? talent.talentNodeId),
      ]);
      const activeProfessionTalentSourcePairs = professionTalentSourcePairs(activeProfessionTalentNodeIds);
      const activeProfessionTalentStageCfgIds = uniqueNumbers(row.activeProfessionTalentStageCfgIds ?? row.active_profession_talent_stage_cfg_ids);
      if (activePassiveSkillIds.length || activePassiveSkillUuids.length) counters.rowsWithActivePassiveSkills += 1;
      if (activeProfessionTalentNodeIds.length) counters.rowsWithActiveProfessionTalents += 1;
      for (const candidate of candidates) {
        const activeFactorBuffIds = uniqueNumbers(row.activeFactorBuffIds ?? row.active_factor_buff_ids);
        const activeEffectBuffIds = uniqueNumbers(row.activeEffectBuffIds ?? row.active_effect_buff_ids);
        const activeEffectSourceIds = uniqueStrings(row.activeEffectSourceIds ?? row.active_effect_source_ids);
        const evidence = [];
        for (const buffId of candidate.buffIds) {
          if (activeFactorBuffIds.includes(buffId)) evidence.push(`activeFactorBuff:${buffId}`);
          if (activeEffectBuffIds.includes(buffId)) evidence.push(`activeEffectBuff:${buffId}`);
        }
        if (candidate.sourceId && activeEffectSourceIds.includes(candidate.sourceId)) {
          evidence.push(`activeEffectSource:${candidate.sourceId}`);
        }
        if (candidate.sourceEntityId !== null && activePassiveSkillIds.includes(candidate.sourceEntityId)) {
          evidence.push(`activePassiveSkill:${candidate.sourceEntityId}`);
        }
        if (
          candidate.sourceKind === "talent-passive" &&
          candidate.sourceEntityId !== null &&
          activeProfessionTalentNodeIds.includes(candidate.sourceEntityId)
        ) {
          evidence.push(`activeProfessionTalent:${candidate.sourceEntityId}`);
        }
        if (candidate.sourceKind === "talent-passive" && candidate.sourceEntityId !== null) {
          for (const pair of activeProfessionTalentSourcePairs) {
            if (pair.sourceEntityId === candidate.sourceEntityId) {
              evidence.push(`activeProfessionTalentNode:${pair.nodeId}->talent:${pair.sourceEntityId}`);
            }
          }
        }
        const active =
          evidence.length > 0;
        if (!active) continue;
        observations.push({
          file: filePath,
          candidateKey: candidate.key,
          damageId,
          totalValue: Number(row.totalValue ?? 0),
          hits: Number(row.hits ?? 0),
          critHits: Number(row.critHits ?? 0),
          luckyHits: Number(row.luckyHits ?? 0),
          activeFactorBuffIds,
          activeEffectBuffIds,
          activeEffectSourceIds,
          activePassiveSkillIds,
          activePassiveSkillUuids,
          activeProfessionTalentNodeIds,
          activeProfessionTalentSourcePairs,
          activeProfessionTalentStageCfgIds,
          evidence,
        });
      }
    }
  }

  return { counters, observations };
}

function emptyBucket() {
  return {
    intervals: 0,
    hits: 0,
    total: 0,
    normalIntervals: 0,
    normalHits: 0,
    normalTotal: 0,
    critHits: 0,
    luckyHits: 0,
  };
}

function addToBucket(bucket, interval) {
  bucket.intervals += 1;
  bucket.hits += interval.deltaHits;
  bucket.total += interval.deltaTotal;
  bucket.critHits += interval.deltaCritHits;
  bucket.luckyHits += interval.deltaLuckyHits;
  if (interval.deltaCritHits === 0 && interval.deltaLuckyHits === 0) {
    bucket.normalIntervals += 1;
    bucket.normalHits += interval.deltaHits;
    bucket.normalTotal += interval.deltaTotal;
  }
}

function targetAnalysisKey(candidate, damageId) {
  return `${candidate.key}::damage:${damageId}`;
}

function makeCandidateAnalysis(candidate, targetDamageId, index) {
  const recountRows = index.damageToRecount.get(targetDamageId) ?? [];
  const targetRecountIds = recountRows.map((row) => row.recountId);
  const targetNames = uniqueStrings([
    index.damageNames.get(targetDamageId),
    ...recountRows.map((row) => row.name),
  ]);

  return {
    ...candidate,
    analysisKey: targetAnalysisKey(candidate, targetDamageId),
    candidateKey: candidate.key,
    targetDamageId,
    targetDamageIds: [targetDamageId],
    targetRecountIds,
    targetNames,
    observedTargetIntervals: 0,
    active: emptyBucket(),
    inactive: emptyBucket(),
    activeGrades: new Map(),
    activeExamples: [],
    inactiveExamples: [],
    census: {
      activeRows: 0,
      activeHits: 0,
      activeTotal: 0,
      files: new Set(),
    },
  };
}

function addExample(list, interval, activeEvidence) {
  if (list.length >= 5) return;
  list.push({
    file: basename(interval.file),
    tsMs: interval.tsMs,
    playerName: interval.playerName,
    targetName: interval.targetName,
    skillId: interval.skillId,
    total: interval.deltaTotal,
    hits: interval.deltaHits,
    avgPerHit: interval.avgPerHit,
    critHits: interval.deltaCritHits,
    luckyHits: interval.deltaLuckyHits,
    activeEvidence,
  });
}

function bestFitFor(analysis, options) {
  const fitBucket =
    analysis.active.normalHits >= options.minHits && analysis.inactive.normalHits >= options.minHits
      ? {
          mode: "normal-only",
          activeAvg: average(analysis.active.normalTotal, analysis.active.normalHits),
          inactiveAvg: average(analysis.inactive.normalTotal, analysis.inactive.normalHits),
          activeHits: analysis.active.normalHits,
          inactiveHits: analysis.inactive.normalHits,
        }
      : {
          mode: "all-hits",
          activeAvg: average(analysis.active.total, analysis.active.hits),
          inactiveAvg: average(analysis.inactive.total, analysis.inactive.hits),
          activeHits: analysis.active.hits,
          inactiveHits: analysis.inactive.hits,
        };

  if (analysis.observedTargetIntervals === 0 && analysis.census.activeRows === 0) {
    return {
      status: "no-runtime-observation",
      detail: "No scanned previous log had this source's target damage rows.",
      nextAction: "Capture target skill with this source equipped/active.",
    };
  }

  if (analysis.active.intervals === 0 && analysis.census.activeRows > 0) {
    return {
      status: "census-active-only",
      detail: "Attribution census saw the source active on target damage rows, but event snapshots did not provide usable deltas.",
      nextAction: "Use event log snapshots or a controlled capture with repeated skill snapshots enabled.",
    };
  }

  if (analysis.active.intervals > 0 && analysis.inactive.intervals === 0) {
    return {
      status: "active-only-needs-baseline",
      detail: "Previous logs saw the source active on target deltas, but no inactive baseline for the same target rows.",
      nextAction: "Capture the same skill/target once without the source and once with it active.",
    };
  }

  if (analysis.active.intervals === 0 && analysis.inactive.intervals > 0) {
    return {
      status: "inactive-only-needs-active",
      detail: "Previous logs saw target deltas only while this source was inactive.",
      nextAction: "Capture the same skill/target with the source active.",
    };
  }

  if (fitBucket.activeHits < options.minHits || fitBucket.inactiveHits < options.minHits) {
    return {
      status: "insufficient-hit-count",
      detail: `Need at least ${options.minHits} active and inactive hits; found ${fitBucket.activeHits} active / ${fitBucket.inactiveHits} inactive in ${fitBucket.mode}.`,
      nextAction: "Capture more repeated hits in both states.",
    };
  }

  const observedMultiplier = fitBucket.activeAvg / fitBucket.inactiveAvg;
  const observedGrades = [...analysis.activeGrades.keys()].map(Number).sort((a, b) => a - b);
  const expectedRows =
    observedGrades.length > 0
      ? analysis.expectedMultipliers.filter((row) => observedGrades.includes(row.grade))
      : analysis.expectedMultipliers;
  let best = null;
  for (const row of expectedRows) {
    const absError = Math.abs(observedMultiplier - row.multiplier);
    const relError = absError / row.multiplier;
    if (!best || relError < best.relativeError) {
      best = {
        grade: row.grade,
        expectedMultiplier: row.multiplier,
        expectedPercent: row.percent,
        observedMultiplier,
        absoluteError: absError,
        relativeError: relError,
        valueTexts: row.valueTexts,
        parameterValues: row.parameterValues,
      };
    }
  }

  if (!best) {
    return {
      status: "mixed-baseline-no-static-expected",
      detail: `Observed active/inactive ratio is ${observedMultiplier.toFixed(5)}, but no static percent/multiplier was available to compare.`,
      nextAction: "Validate source table schema or add expected-value extraction.",
      mode: fitBucket.mode,
      observedMultiplier,
      activeAvg: fitBucket.activeAvg,
      inactiveAvg: fitBucket.inactiveAvg,
    };
  }

  const status = best.relativeError <= 0.03 ? "plausible-fit" : "inconclusive-mismatch";
  return {
    status,
    detail:
      status === "plausible-fit"
        ? `Observed ratio is within 3% of the static expected multiplier in ${fitBucket.mode}.`
        : `Observed ratio does not match the closest static expected multiplier closely enough in ${fitBucket.mode}.`,
    nextAction:
      status === "plausible-fit"
        ? "Repeat in a controlled capture before promoting this to estimated contribution."
        : "Capture isolated baseline/active samples and check stacking, crit/lucky mix, target, and source timing.",
    mode: fitBucket.mode,
    observedMultiplier,
    activeAvg: fitBucket.activeAvg,
    inactiveAvg: fitBucket.inactiveAvg,
    bestExpected: best,
  };
}

function analyze(index, intervals, censusObservations, options) {
  const analyses = new Map();
  for (const candidate of index.candidates) {
    for (const targetDamageId of candidate.targetDamageIds) {
      analyses.set(targetAnalysisKey(candidate, targetDamageId), makeCandidateAnalysis(candidate, targetDamageId, index));
    }
  }

  for (const interval of intervals) {
    const candidates = index.candidatesByTargetDamageId.get(interval.skillId) ?? [];
    for (const candidate of candidates) {
      const analysis = analyses.get(targetAnalysisKey(candidate, interval.skillId));
      if (!analysis) continue;
      analysis.observedTargetIntervals += 1;
      const active = sourceActive(candidate, interval.playerSnapshot);
      if (active.active) {
        addToBucket(analysis.active, interval);
        for (const grade of observedGrades(candidate, interval.playerSnapshot)) {
          analysis.activeGrades.set(grade, (analysis.activeGrades.get(grade) ?? 0) + interval.deltaHits);
        }
        addExample(analysis.activeExamples, interval, active.evidence);
      } else {
        addToBucket(analysis.inactive, interval);
        addExample(analysis.inactiveExamples, interval, []);
      }
    }
  }

  for (const observation of censusObservations) {
    const analysis = analyses.get(targetAnalysisKey({ key: observation.candidateKey }, observation.damageId));
    if (!analysis) continue;
    analysis.census.activeRows += 1;
    analysis.census.activeHits += observation.hits;
    analysis.census.activeTotal += observation.totalValue;
    analysis.census.files.add(observation.file);
  }

  const rows = [...analyses.values()].map((analysis) => {
    const fit = bestFitFor(analysis, options);
    return {
      key: analysis.key,
      analysisKey: analysis.analysisKey,
      candidateKey: analysis.candidateKey,
      sourceId: analysis.sourceId,
      sourceKind: analysis.sourceKind,
      sourceType: analysis.sourceType,
      sourceName: analysis.sourceName,
      runtimeDetection: analysis.runtimeDetection,
      buffIds: analysis.buffIds,
      targetRecountIds: analysis.targetRecountIds,
      targetDamageIds: analysis.targetDamageIds,
      targetDamageId: analysis.targetDamageId,
      targetNames: analysis.targetNames,
      cleanDescription: analysis.cleanDescription,
      hasExactChildDamage: analysis.hasExactChildDamage,
      exactChildDamageIds: analysis.exactChildDamageIds,
      expectedMultipliers: analysis.expectedMultipliers,
      observed: {
        targetIntervals: analysis.observedTargetIntervals,
        active: {
          ...analysis.active,
          avgPerHit: average(analysis.active.total, analysis.active.hits),
          normalAvgPerHit: average(analysis.active.normalTotal, analysis.active.normalHits),
        },
        inactive: {
          ...analysis.inactive,
          avgPerHit: average(analysis.inactive.total, analysis.inactive.hits),
          normalAvgPerHit: average(analysis.inactive.normalTotal, analysis.inactive.normalHits),
        },
        activeGrades: Object.fromEntries([...analysis.activeGrades.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
        activeExamples: analysis.activeExamples,
        inactiveExamples: analysis.inactiveExamples,
      },
      census: {
        activeRows: analysis.census.activeRows,
        activeHits: analysis.census.activeHits,
        activeTotal: analysis.census.activeTotal,
        files: [...analysis.census.files].map(basename).sort(),
      },
      fit,
    };
  });

  rows.sort((left, right) => {
    const leftObserved = left.observed.active.total + left.census.activeTotal + left.observed.inactive.total;
    const rightObserved = right.observed.active.total + right.census.activeTotal + right.observed.inactive.total;
    return rightObserved - leftObserved || left.sourceName.localeCompare(right.sourceName);
  });

  const statusCounts = {};
  for (const row of rows) {
    statusCounts[row.fit.status] = (statusCounts[row.fit.status] ?? 0) + 1;
  }

  return { rows, statusCounts };
}

function activeEvidenceList(example) {
  return asArray(example?.activeEvidence ?? example?.evidence).map(String);
}

function hasDecodedProfessionTalentEvidence(row) {
  return asArray(row?.observed?.activeExamples).some((example) =>
    activeEvidenceList(example).some((evidence) => evidence.startsWith("activeProfessionTalentNode:")),
  );
}

function buildRuntimeBridgeCoverage(rows) {
  const decodedProfessionTalentNodeEvidenceRows = rows.filter(hasDecodedProfessionTalentEvidence);
  return {
    decodedProfessionTalentNodeEvidenceRows: decodedProfessionTalentNodeEvidenceRows.length,
    examples: decodedProfessionTalentNodeEvidenceRows.slice(0, 12).map((row) => ({
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      targetDamageId: row.targetDamageId,
      targetNames: row.targetNames,
      status: row.fit.status,
      activeHits: row.observed.active.hits,
      inactiveHits: row.observed.inactive.hits,
      censusRows: row.census.activeRows,
      evidence: activeEvidenceList(row.observed.activeExamples[0]).filter((evidence) =>
        evidence.startsWith("activeProfessionTalentNode:"),
      ),
    })),
  };
}

function markdownCandidateRow(row) {
  const activeAvg = row.observed.active.avgPerHit;
  const inactiveAvg = row.observed.inactive.avgPerHit;
  const target = row.targetNames.slice(0, 4).join(", ") || row.targetDamageIds.slice(0, 4).join(", ");
  const source = `${row.sourceName ?? row.sourceId} [${row.sourceId || row.sourceKind || "unknown"}]`;
  const runtime = row.buffIds.length > 0 ? `buffs=${row.buffIds.join(",")}` : `runtime=${row.runtimeDetection ?? "unknown"}`;
  const expected = row.fit.bestExpected
    ? `expected=${row.fit.bestExpected.expectedMultiplier.toFixed(5)} (${formatPercent(row.fit.bestExpected.expectedPercent)})`
    : row.expectedMultipliers.length > 0
      ? `expected=${row.expectedMultipliers.slice(0, 3).map((item) => `${item.multiplier.toFixed(5)}${item.grade ? `/G${item.grade}` : ""}`).join(", ")}`
      : "expected=n/a";
  const observed = row.fit.observedMultiplier ? `observed=${row.fit.observedMultiplier.toFixed(5)}` : "observed=n/a";
  return `- ${source}: ${row.fit.status}; target=${target || "none"}; damageId=${row.targetDamageId ?? "n/a"}; ${runtime}; active=${row.observed.active.hits} hits avg=${formatNumber(activeAvg)}; inactive=${row.observed.inactive.hits} hits avg=${formatNumber(inactiveAvg)}; ${observed}; ${expected}`;
}

function writeMarkdown(report, options) {
  const rows = report.candidateRows;
  const observedRows = rows.filter((row) => row.observed.active.hits > 0 || row.census.activeRows > 0 || row.observed.inactive.hits > 0);
  const mixedRows = rows.filter((row) => row.fit.status === "plausible-fit" || row.fit.status === "inconclusive-mismatch" || row.fit.status === "mixed-baseline-no-static-expected");
  const activeOnlyRows = rows.filter((row) => row.fit.status === "active-only-needs-baseline" || row.fit.status === "census-active-only");
  const exactRows = rows.filter((row) => row.hasExactChildDamage);
  const observedTalentRows = observedRows.filter((row) => row.sourceKind === "talent-passive");
  const talentCoverage = report.talentCoverage;

  const lines = [];
  lines.push("# Formula Semantics Lab");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Event root: \`${report.eventRoot}\``);
  lines.push("");
  lines.push("## Short Answer");
  lines.push("");
  lines.push("- Previous event logs are useful for bootstrapping: they can prove that a source was observed with target damage rows and can sometimes provide snapshot-delta active/inactive comparisons.");
  lines.push("- Previous saved encounter history is not enough by itself for exact formula splitting because it stores aggregate skill totals and end-state source lists, not a per-hit source timeline.");
  lines.push("- Controlled test encounters are still needed for high-confidence formulas: same skill, same target, same setup, one source toggled, enough baseline and active hits.");
  lines.push("");
  lines.push("## Input Coverage");
  lines.push("");
  lines.push(`- Event files scanned: ${report.inputs.eventFiles.length} of ${report.inputs.totalEventFiles}`);
  lines.push(`- Attribution census files scanned: ${report.inputs.censusFiles.length} of ${report.inputs.totalCensusFiles}`);
  lines.push(`- Event entries scanned: ${report.eventCounters.eventEntries}`);
  lines.push(`- Player snapshots: ${report.eventCounters.playerSnapshots}`);
  lines.push(`- Skill snapshots: ${report.eventCounters.skillSnapshots}`);
  lines.push(`- Census rows with active passive skills: ${report.censusCounters.rowsWithActivePassiveSkills}`);
  lines.push(`- Census rows with selected profession talents: ${report.censusCounters.rowsWithActiveProfessionTalents}`);
  lines.push(`- Snapshot-delta intervals with new damage: ${report.intervalCount}`);
  lines.push(`- Static source candidates with targets: ${report.staticCandidateCount}`);
  lines.push(`- Source/target damage rows analyzed: ${report.staticCandidateTargetCount}`);
  lines.push("");
  lines.push("## Fit Status Counts");
  lines.push("");
  for (const [status, count] of Object.entries(report.statusCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${status}: ${count}`);
  }
  lines.push("");
  lines.push("## Talent-Link Coverage");
  lines.push("");
  lines.push(`- Generated talent/passive source rows: ${talentCoverage.generatedEffectSources.talentPassiveRows}`);
  lines.push(`- Generated talent/passive rows with target links: ${talentCoverage.generatedEffectSources.talentPassiveRowsWithTargets}`);
  lines.push(`- Generated talent target links: ${talentCoverage.generatedEffectSources.talentTargetLinks}`);
  lines.push(`- Generated talent damage-target links: ${talentCoverage.generatedEffectSources.talentDamageTargetLinks}`);
  lines.push(`- Generated talent recount-target links: ${talentCoverage.generatedEffectSources.talentRecountTargetLinks}`);
  lines.push(`- Generated talent rows with runtime buff ids: ${talentCoverage.generatedEffectSources.talentRowsWithRuntimeBuffIds}`);
  lines.push(`- Runtime rows with decoded profession-talent node evidence: ${report.runtimeBridgeCoverage.decodedProfessionTalentNodeEvidenceRows}`);
  if (talentCoverage.probe.loaded) {
    lines.push(`- Talent probe linked recount rows: ${talentCoverage.probe.linkedTalentRecountRows}`);
    lines.push(`- Talent probe formula-match recount rows: ${talentCoverage.probe.formulaMatchRecountRows}`);
    lines.push(`- Talent probe skill rows with opcode-6 pair evidence: ${talentCoverage.probe.skillRowsWithOpcode6PairEvidence}`);
    lines.push(`- Talent probe skill rows with description-link text evidence: ${talentCoverage.probe.skillRowsWithDescriptionLinkTextEvidence}`);
  } else {
    lines.push(`- Talent probe report not loaded: \`${talentCoverage.probe.path}\``);
  }
  lines.push("");
  if (report.runtimeBridgeCoverage.examples.length > 0) {
    lines.push("### Runtime Talent Node Evidence");
    lines.push("");
    for (const row of report.runtimeBridgeCoverage.examples) {
      lines.push(
        `- ${row.sourceName ?? row.sourceId} [${row.sourceId}], target=${row.targetNames.slice(0, 3).join(", ") || row.targetDamageId}; evidence=${row.evidence.join(", ")}`,
      );
    }
    lines.push("");
  }
  lines.push("### Talent Link Examples");
  lines.push("");
  for (const row of talentCoverage.generatedEffectSources.examples.slice(0, options.maxRows)) {
    const targets = row.targets
      .map((target) =>
        target.targetKind === "damage"
          ? `damage ${target.damageId}`
          : target.targetKind === "recount"
            ? `recount ${target.recountId}`
            : target.targetKind,
      )
      .join(", ");
    lines.push(`- ${row.sourceName} [${row.sourceId}], buffs=${row.buffIds.join(",") || "none"} -> ${targets || "none"}`);
  }
  lines.push("");
  lines.push("## Observed Talent Candidates");
  lines.push("");
  if (observedTalentRows.length === 0) {
    lines.push("- No talent/passive source rows overlapped scanned previous runtime logs.");
  } else {
    for (const row of observedTalentRows.slice(0, options.maxRows)) lines.push(markdownCandidateRow(row));
  }
  lines.push("");
  lines.push("## Mixed Active/Inactive Candidates");
  lines.push("");
  if (mixedRows.length === 0) {
    lines.push("- None in the scanned previous logs.");
  } else {
    for (const row of mixedRows.slice(0, options.maxRows)) lines.push(markdownCandidateRow(row));
  }
  lines.push("");
  lines.push("## Active Observed, Baseline Needed");
  lines.push("");
  if (activeOnlyRows.length === 0) {
    lines.push("- None in the scanned previous logs.");
  } else {
    for (const row of activeOnlyRows.slice(0, options.maxRows)) lines.push(markdownCandidateRow(row));
  }
  lines.push("");
  lines.push("## Exact Child Damage Sources");
  lines.push("");
  if (exactRows.length === 0) {
    lines.push("- None in the static candidate set.");
  } else {
    for (const row of exactRows.slice(0, options.maxRows)) {
      lines.push(`- ${row.sourceName ?? row.sourceId}: exact child damage ids=${row.exactChildDamageIds.join(", ")}; targets=${row.targetNames.slice(0, 5).join(", ") || "none"}`);
    }
  }
  lines.push("");
  lines.push("## Top Observed Candidates");
  lines.push("");
  if (observedRows.length === 0) {
    lines.push("- No candidate source/target overlap was observed in the scanned previous logs.");
  } else {
    for (const row of observedRows.slice(0, options.maxRows)) lines.push(markdownCandidateRow(row));
  }
  lines.push("");
  lines.push("## Controlled Capture Protocol");
  lines.push("");
  lines.push("1. Pick one candidate source and one listed target skill.");
  lines.push("2. Capture a baseline with the source inactive/unequipped, same gear and target.");
  lines.push("3. Capture an active run with only that source changed.");
  lines.push("4. Prefer training dummy or a stable boss target; avoid multi-target pulls.");
  lines.push("5. Record at least 20 to 30 non-crit/non-lucky hits per state, or enough total hits to model crit/lucky separately.");
  lines.push("6. Keep event logger JSON and attribution census enabled so the lab can match source state to skill deltas.");
  lines.push("");
  lines.push("## Files");
  lines.push("");
  for (const file of report.inputs.eventFiles.slice(0, options.maxRows)) lines.push(`- Event: \`${file}\``);
  for (const file of report.inputs.censusFiles.slice(0, options.maxRows)) lines.push(`- Census: \`${file}\``);
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!fs.existsSync(options.eventRoot)) {
    throw new Error(`Event log root not found: ${options.eventRoot}`);
  }

  const index = buildGeneratedIndex();
  const talentCoverage = buildTalentCoverage(index, options.talentProbe);
  const inputs = findInputFiles(options);
  const { counters: eventCounters, intervals } = scanEventFiles(inputs.eventFiles);
  const { counters: censusCounters, observations: censusObservations } = scanCensusFiles(inputs.censusFiles, index);
  const analysis = analyze(index, intervals, censusObservations, options);
  const runtimeBridgeCoverage = buildRuntimeBridgeCoverage(analysis.rows);

  const report = {
    generatedAt: new Date().toISOString(),
    eventRoot: options.eventRoot,
    inputs,
    eventCounters,
    censusCounters,
    intervalCount: intervals.length,
    staticCandidateCount: index.candidates.length,
    staticCandidateTargetCount: analysis.rows.length,
    talentCoverage,
    runtimeBridgeCoverage,
    statusCounts: analysis.statusCounts,
    candidateRows: analysis.rows,
  };

  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(options.outMd, writeMarkdown(report, options));

  console.log(`Scanned ${inputs.eventFiles.length} event files and ${inputs.censusFiles.length} census files.`);
  console.log(`Snapshot-delta intervals: ${intervals.length}`);
  console.log(`Static source candidates: ${index.candidates.length}`);
  console.log(`Source/target damage rows analyzed: ${analysis.rows.length}`);
  console.log(`Status counts: ${JSON.stringify(analysis.statusCounts)}`);
  console.log(`Wrote ${options.outJson}`);
  console.log(`Wrote ${options.outMd}`);
}

main();
