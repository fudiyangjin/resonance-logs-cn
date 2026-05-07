#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_MAX_ROWS = 80;

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: 0,
    maxRows: DEFAULT_MAX_ROWS,
    outJson: path.join(repoRoot, "DEV_exports", "global-modifier-coverage-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "global-modifier-coverage-audit.md"),
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
      case "--input":
        options.inputs.push(path.resolve(next()));
        break;
      case "--latest":
        options.latest = Number(next());
        break;
      case "--max-rows":
        options.maxRows = Number(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
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
  console.log(`Global Modifier Coverage Audit

Usage:
  node scripts/audit-global-modifier-coverage.mjs [options]

Options:
  --input <file>       Modifier entity export. Repeatable.
  --latest <count>     Scan newest N DEV_exports/modifier-entity-*.json files. Default 0 means all.
  --max-rows <count>   Max Markdown rows per table. Default: ${DEFAULT_MAX_ROWS}
  --out-json <path>    JSON report path. Default: DEV_exports/global-modifier-coverage-audit.json
  --out-md <path>      Markdown report path. Default: DEV_exports/global-modifier-coverage-audit.md
  --help               Show this help.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function readGeneratedOptional(fileName, fallback) {
  const filePath = path.join(repoRoot, "parser-data", "generated", fileName);
  return fs.existsSync(filePath) ? readJson(filePath) : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function sortedNumbers(values) {
  return [...new Set(asArray(values).map(positiveNumber).filter((value) => value !== null))]
    .sort((left, right) => left - right);
}

function sortedStrings(values) {
  return [...new Set(asArray(values).map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function jsonRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.rows)) return data.rows;
  return Object.values(data).filter((value) => value && typeof value === "object" && !Array.isArray(value));
}

function buildIdIndex(data) {
  const index = new Map();
  for (const row of jsonRows(data)) {
    const id = positiveNumber(row.Id ?? row.id ?? row.SkillId ?? row.skillId);
    if (id !== null && !index.has(id)) index.set(id, row);
  }
  return index;
}

function addCount(map, key, amount = 1) {
  const normalized = String(key || "unknown");
  map[normalized] = (map[normalized] ?? 0) + amount;
}

function formatNumber(value, digits = 0) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(number);
}

function formatPct(numerator, denominator, digits = 1) {
  if (!denominator) return "";
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function latestModifierEntityInputs(options) {
  if (options.inputs.length) return options.inputs;
  const dir = path.join(repoRoot, "DEV_exports");
  if (!fs.existsSync(dir)) return [];
  const all = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^modifier-entity-.+\.json$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return options.latest > 0 ? all.slice(0, options.latest) : all;
}

function localizedName(map, fallback = "") {
  if (map && typeof map === "object" && !Array.isArray(map)) {
    return map.en ?? map.design ?? Object.values(map).find((value) => typeof value === "string" && value.trim()) ?? fallback;
  }
  return fallback;
}

function rowName(row) {
  if (!row || typeof row !== "object") return "";
  return localizedName(
    row.Names ?? row.names ?? row.MonsterNames ?? row.monsterNames,
    row.Name ?? row.name ?? row.NameDesign ?? row.DesignName ?? row.designName ?? "",
  );
}

function rowDesignName(row) {
  if (!row || typeof row !== "object") return "";
  return String(
    row.NameDesign
      ?? row.DesignName
      ?? row.designName
      ?? row.Names?.design
      ?? row.names?.design
      ?? "",
  ).trim();
}

function hasPrimaryLocalizedName(row) {
  const names = row?.Names ?? row?.names;
  return Boolean(
    names?.en
      || names?.["zh-CN"]
      || names?.["zh-TW"]
      || row?.Name
      || row?.name,
  );
}

function classifyGameFileEvidence(evidence, roles) {
  const roleSet = new Set(roles);
  const hasSourceConfigRole = [...roleSet].some((role) => role.toLowerCase().includes("sourceconfig"));
  if (evidence.tables.includes("skill_aoyi_icons")) return "source-config-imagine-skill";
  if (evidence.tables.includes("skillnames") && hasSourceConfigRole) return "source-config-skill";
  if (evidence.tables.includes("DamageAttrIdName") || evidence.tables.includes("SkillBreakdownDetails")) {
    return "damage-row-id";
  }
  if (evidence.tables.includes("RecountTable")) return "recount-row-id";
  if (evidence.tables.includes("BuffName")) {
    const designText = evidence.designNames.join(" ");
    if (
      !evidence.hasLocalizedBuffName
      && /timer|monitor|marker|mark|check|lockout|icd|计时|定时|检测|标记|凝滞|内置冷却/i.test(designText)
    ) {
      return "design-only-marker";
    }
    if (evidence.hasLocalizedBuffName) return "localized-buff-row";
    return "design-only-buff-row";
  }
  if (evidence.targetRuleIds.length > 0) return "existing-target-rule";
  return "no-game-file-row";
}

function buildTargetRuleIndex(recount) {
  const byDamageId = new Map();
  const byRecountId = new Map();
  for (const [ruleId, source] of Object.entries(recount.sourcesById ?? {})) {
    for (const damageId of sortedNumbers(source.targetDamageIds)) {
      const rows = byDamageId.get(damageId) ?? [];
      rows.push(ruleId);
      byDamageId.set(damageId, rows);
    }
    for (const recountId of sortedNumbers(source.targetRecountIds)) {
      const rows = byRecountId.get(recountId) ?? [];
      rows.push(ruleId);
      byRecountId.set(recountId, rows);
    }
  }
  return { byDamageId, byRecountId };
}

function gameFileEvidenceForId(buffId, roles, indexes) {
  const rowSources = [
    ["BuffName", indexes.gameFiles.buffNames.get(buffId)],
    ["skillnames", indexes.gameFiles.skillNames.get(buffId)],
    ["skill_aoyi_icons", indexes.gameFiles.aoyiSkills.get(buffId)],
    ["RecountTable", indexes.gameFiles.recountRows.get(buffId)],
    ["DamageAttrIdName", indexes.gameFiles.damageRows.get(buffId)],
    ["SkillBreakdownDetails", indexes.gameFiles.breakdownRows.get(buffId)],
  ];
  const rows = rowSources.filter(([, row]) => Boolean(row));
  const tables = rows.map(([table]) => table);
  const names = sortedStrings(rows.map(([, row]) => rowName(row)).filter(Boolean));
  const designNames = sortedStrings(rows.map(([, row]) => rowDesignName(row)).filter(Boolean));
  const targetRuleIds = sortedStrings([
    ...(indexes.targetRuleIds.byDamageId.get(buffId) ?? []),
    ...(indexes.targetRuleIds.byRecountId.get(buffId) ?? []),
  ]);
  const buffRow = indexes.gameFiles.buffNames.get(buffId);
  const evidence = {
    tables,
    names,
    designNames,
    hasLocalizedBuffName: hasPrimaryLocalizedName(buffRow),
    targetRuleIds,
  };
  return {
    ...evidence,
    bridgeHint: classifyGameFileEvidence(evidence, roles),
  };
}

function buildIndexes() {
  const sourceIndex = readGenerated("ModifierSourceIndex.json");
  const recount = readGenerated("ModifierRecountTable.json");
  const relationships = readGeneratedOptional("ModifierRelationshipTable.json", {});
  const display = readGenerated("ModifierDisplayTable.json");
  const descriptions = readGenerated("ModifierDescriptions.json");
  const classification = readGenerated("ModifierClassificationRuntime.json");
  const contribution = readGenerated("ModifierContributionRuntime.json");
  const lucky = readGenerated("LuckyStrikeRuntime.json");
  const gameFiles = {
    buffNames: buildIdIndex(readGeneratedOptional("BuffName.json", {})),
    skillNames: buildIdIndex(readGeneratedOptional("skillnames.json", {})),
    aoyiSkills: buildIdIndex(readGeneratedOptional("skill_aoyi_icons.json", [])),
    recountRows: buildIdIndex(readGeneratedOptional("RecountTable.json", {})),
    damageRows: buildIdIndex(readGeneratedOptional("DamageAttrIdName.json", {})),
    breakdownRows: buildIdIndex(readGeneratedOptional("SkillBreakdownDetails.json", {})),
  };
  const targetRuleIds = buildTargetRuleIndex(recount);

  return {
    sourceIndex,
    recount,
    relationships,
    display,
    descriptions,
    classification,
    contribution,
    lucky,
    gameFiles,
    targetRuleIds,
    reportableBuffIds: new Set(asArray(recount.reportableBuffIds).map(String)),
    debugBuffIds: new Set(asArray(recount.debugBuffIds).map(String)),
    ignoredBuffIds: new Set(asArray(recount.ignoredBuffIds).map(String)),
  };
}

function actorIndexes(entity) {
  const byUid = new Map();
  const bySourceConfigId = new Map();
  const byBaseId = new Map();
  const ownUid = positiveNumber(entity.uid);
  if (ownUid !== null) {
    byUid.set(ownUid, {
      uid: ownUid,
      name: entity.name || String(ownUid),
      entityType: "player",
      ownerUid: ownUid,
      ownerName: entity.name || String(ownUid),
    });
  }
  for (const actor of asArray(entity.modifierSourceActors)) {
    const uid = positiveNumber(actor.uid);
    if (uid !== null) byUid.set(uid, actor);
    for (const id of sortedNumbers(actor.sourceConfigIds)) bySourceConfigId.set(id, actor);
    for (const id of sortedNumbers(actor.baseIds)) byBaseId.set(id, actor);
  }
  return { byUid, bySourceConfigId, byBaseId };
}

function actorName(actor) {
  return actor?.name || actor?.ownerName || (actor?.uid ? String(actor.uid) : "");
}

function actorForSource(row, actors) {
  const sourceUid = positiveNumber(row.sourceUid ?? row.modifierSourceUid);
  if (sourceUid !== null && actors.byUid.has(sourceUid)) return actors.byUid.get(sourceUid);
  const sourceConfigId = positiveNumber(row.sourceConfigId ?? row.modifierSourceConfigId);
  if (sourceConfigId !== null && actors.bySourceConfigId.has(sourceConfigId)) return actors.bySourceConfigId.get(sourceConfigId);
  const baseId = positiveNumber(row.baseId ?? row.modifierBaseId);
  if (baseId !== null && actors.byBaseId.has(baseId)) return actors.byBaseId.get(baseId);
  return null;
}

function sourceUidForRow(row) {
  return positiveNumber(row.sourceUid ?? row.modifierSourceUid);
}

function hostUidForRow(row) {
  return positiveNumber(row.hostUid ?? row.modifierHostUid);
}

function rowIds(row, fields) {
  return fields
    .map((field) => ({ field, id: positiveNumber(row?.[field]) }))
    .filter((value) => value.id !== null);
}

function addObserved(observed, id, context) {
  if (id === null || id === undefined || id <= 0) return;
  const key = String(id);
  const current = observed.get(key) ?? {
    buffId: id,
    files: new Set(),
    players: new Set(),
    classes: new Set(),
    specs: new Set(),
    refs: 0,
    bucketRefs: 0,
    replayRefs: 0,
    windowRefs: 0,
    activeRefs: 0,
    hits: 0,
    totalValue: 0,
    effectiveTotalValue: 0,
    externalRefs: 0,
    externalKnownRefs: 0,
    sourceUids: new Set(),
    hostUids: new Set(),
    sourceActorNames: new Set(),
    unresolvedSourceUids: new Set(),
    roles: new Set(),
    sampleContexts: [],
  };
  observed.set(key, current);

  current.refs += context.refs ?? 1;
  current.files.add(context.file);
  if (context.playerName) current.players.add(context.playerName);
  if (context.classId) current.classes.add(String(context.classId));
  if (context.classSpec) current.specs.add(String(context.classSpec));
  current[context.refKind] = (current[context.refKind] ?? 0) + (context.refs ?? 1);
  if (context.role) current.roles.add(context.role);
  current.hits += context.hits ?? 0;
  current.totalValue += context.totalValue ?? 0;
  current.effectiveTotalValue += context.effectiveTotalValue ?? 0;
  if (context.sourceUid !== null && context.sourceUid !== undefined) current.sourceUids.add(context.sourceUid);
  if (context.hostUid !== null && context.hostUid !== undefined) current.hostUids.add(context.hostUid);
  if (context.external) {
    current.externalRefs += context.refs ?? 1;
    if (context.sourceActorName) {
      current.externalKnownRefs += context.refs ?? 1;
      current.sourceActorNames.add(context.sourceActorName);
    } else if (context.sourceUid !== null && context.sourceUid !== undefined) {
      current.unresolvedSourceUids.add(context.sourceUid);
    }
  }
  if (current.sampleContexts.length < 5) {
    current.sampleContexts.push({
      file: context.file,
      source: context.source,
      role: context.role,
      sourceUid: context.sourceUid,
      sourceActorName: context.sourceActorName,
      damageId: context.damageId,
      skillKey: context.skillKey,
    });
  }
}

function scanEntity(filePath, observed) {
  const entity = readJson(filePath);
  const file = path.relative(repoRoot, filePath);
  const actors = actorIndexes(entity);
  const ownUid = positiveNumber(entity.uid);
  const baseContext = {
    file,
    playerName: entity.name || String(entity.uid || ""),
    classId: entity.classId,
    classSpec: entity.classSpec,
  };

  for (const row of asArray(entity.modifierHitBuckets)) {
    const sourceUid = sourceUidForRow(row);
    const actor = actorForSource(row, actors);
    const sourceActorName = actorName(actor);
    const context = {
      ...baseContext,
      source: "modifierHitBuckets",
      refKind: "bucketRefs",
      sourceUid,
      hostUid: hostUidForRow(row),
      sourceActorName,
      external: ownUid !== null && sourceUid !== null && sourceUid !== ownUid,
      hits: finiteNumber(row.hits) ?? 0,
      totalValue: finiteNumber(row.totalValue) ?? 0,
      effectiveTotalValue: finiteNumber(row.effectiveTotalValue) ?? 0,
      damageId: row.damageId,
      skillKey: row.skillKey,
    };
    for (const { id, field } of rowIds(row, ["modifierBaseId", "modifierSourceConfigId"])) {
      addObserved(observed, id, { ...context, role: field });
    }
  }

  for (const hit of asArray(entity.modifierReplayHits)) {
    for (const modifier of asArray(hit.activeModifiers)) {
      const row = {
        ...modifier,
        modifierSourceUid: modifier.modifierSourceUid ?? modifier.sourceUid,
        modifierHostUid: modifier.modifierHostUid ?? modifier.hostUid,
      };
      const sourceUid = sourceUidForRow(row);
      const actor = actorForSource(row, actors);
      const sourceActorName = actorName(actor);
      const context = {
        ...baseContext,
        source: "modifierReplayHits.activeModifiers",
        refKind: "replayRefs",
        sourceUid,
        hostUid: hostUidForRow(row),
        sourceActorName,
        external: ownUid !== null && sourceUid !== null && sourceUid !== ownUid,
        damageId: hit.damageId,
        skillKey: hit.skillKey,
      };
      for (const { id, field } of rowIds(row, ["modifierBaseId", "modifierSourceConfigId"])) {
        addObserved(observed, id, { ...context, role: field });
      }
    }
  }

  for (const row of asArray(entity.modifierWindows)) {
    const sourceUid = sourceUidForRow(row);
    const actor = actorForSource(row, actors);
    const context = {
      ...baseContext,
      source: "modifierWindows",
      refKind: "windowRefs",
      sourceUid,
      hostUid: hostUidForRow(row),
      sourceActorName: actorName(actor),
      external: ownUid !== null && sourceUid !== null && sourceUid !== ownUid,
    };
    for (const { id, field } of rowIds(row, ["baseId", "sourceConfigId"])) {
      addObserved(observed, id, { ...context, role: field });
    }
  }

  for (const [arrayName, fields] of [
    ["activeBuffs", ["baseId", "sourceConfigId"]],
    ["activeFactorBuffs", ["factorBuffId", "observedBuffId", "sourceConfigId"]],
    ["activeEffectBuffs", ["effectSourceBuffId", "observedBuffId", "sourceConfigId"]],
  ]) {
    for (const row of asArray(entity[arrayName])) {
      const sourceUid = sourceUidForRow(row);
      const actor = actorForSource(row, actors);
      const context = {
        ...baseContext,
        source: arrayName,
        refKind: "activeRefs",
        sourceUid,
        hostUid: hostUidForRow(row),
        sourceActorName: actorName(actor),
        external: ownUid !== null && sourceUid !== null && sourceUid !== ownUid,
      };
      for (const { id, field } of rowIds(row, fields)) {
        addObserved(observed, id, { ...context, role: field });
      }
    }
  }

  return {
    file,
    uid: entity.uid,
    name: entity.name,
    classId: entity.classId,
    classSpec: entity.classSpec,
    modifierHitBuckets: asArray(entity.modifierHitBuckets).length,
    modifierReplayHits: asArray(entity.modifierReplayHits).length,
    modifierWindows: asArray(entity.modifierWindows).length,
    sourceActors: asArray(entity.modifierSourceActors).length,
  };
}

function sourceRuleName(ruleId, indexes) {
  const display = indexes.display.sourcesByRuleId?.[ruleId];
  const source = indexes.recount.sourcesById?.[ruleId];
  return display?.sourceName || localizedName(display?.sourceNames) || source?.sourceId || ruleId;
}

function statusForBuffId(buffId, ruleIds, indexes) {
  const key = String(buffId);
  if (indexes.ignoredBuffIds.has(key)) return "ignored";
  if (indexes.reportableBuffIds.has(key)) return "reportable";
  if (indexes.debugBuffIds.has(key)) return "debug";
  if (ruleIds.length) return "mapped";
  if (indexes.sourceIndex.byBuffId?.[key]?.length) return "source-index-only";
  return "unmapped";
}

function finalizeObserved(row, indexes) {
  const key = String(row.buffId);
  const ruleIds = sortedStrings(asArray(indexes.recount.byBuffId?.[key]));
  const sourceIndexRows = asArray(indexes.sourceIndex.byBuffId?.[key]);
  const luckySourceIds = sortedStrings(asArray(indexes.lucky.byBuffId?.[key]));
  const status = statusForBuffId(row.buffId, ruleIds, indexes);
  const roles = sortedStrings([...row.roles]);
  const gameFileEvidence = gameFileEvidenceForId(row.buffId, roles, indexes);
  const missingRuleTables = {
    display: ruleIds.filter((ruleId) => !indexes.display.sourcesByRuleId?.[ruleId]),
    description: ruleIds.filter((ruleId) => !indexes.descriptions.sourcesByRuleId?.[ruleId]),
    classification: ruleIds.filter((ruleId) => !indexes.classification.sourcesByRuleId?.[ruleId]),
    contribution: ruleIds.filter((ruleId) => !indexes.contribution.sourcesByRuleId?.[ruleId]),
  };
  return {
    buffId: row.buffId,
    status,
    refs: row.refs,
    bucketRefs: row.bucketRefs,
    replayRefs: row.replayRefs,
    windowRefs: row.windowRefs,
    activeRefs: row.activeRefs,
    hits: row.hits,
    totalValue: row.totalValue,
    effectiveTotalValue: row.effectiveTotalValue,
    files: sortedStrings([...row.files]),
    players: sortedStrings([...row.players]),
    classes: sortedStrings([...row.classes]),
    specs: sortedStrings([...row.specs]),
    roles,
    sourceUids: sortedNumbers([...row.sourceUids]),
    hostUids: sortedNumbers([...row.hostUids]),
    externalRefs: row.externalRefs,
    externalKnownRefs: row.externalKnownRefs,
    externalActorCoverage: row.externalRefs ? row.externalKnownRefs / row.externalRefs : null,
    sourceActorNames: sortedStrings([...row.sourceActorNames]),
    unresolvedSourceUids: sortedNumbers([...row.unresolvedSourceUids]),
    ruleIds,
    sourceNames: ruleIds.map((ruleId) => sourceRuleName(ruleId, indexes)),
    sourceIndexSourceIds: sortedStrings(sourceIndexRows.map((source) => source.sourceId)),
    sourceKinds: sortedStrings([
      ...ruleIds.map((ruleId) => indexes.recount.sourcesById?.[ruleId]?.sourceKind),
      ...sourceIndexRows.map((source) => source.sourceKind),
    ]),
    luckySourceIds,
    luckyTerms: sortedStrings(luckySourceIds.flatMap((sourceId) =>
      asArray(indexes.lucky.sourcesById?.[sourceId]?.luckyTerms).map((term) => term.termId)
    )),
    gameFileEvidence,
    missingRuleTables,
    sampleContexts: row.sampleContexts,
  };
}

function buildReport(inputs, indexes) {
  const observed = new Map();
  const fileReports = inputs.map((input) => scanEntity(input, observed));
  const observedRows = [...observed.values()]
    .map((row) => finalizeObserved(row, indexes))
    .sort((left, right) =>
      right.totalValue - left.totalValue
      || right.hits - left.hits
      || right.refs - left.refs
      || left.buffId - right.buffId
    );

  const statusCounts = {};
  const statusRefs = {};
  const statusHits = {};
  const roleCounts = {};
  const unmappedEvidenceCounts = {};
  for (const row of observedRows) {
    addCount(statusCounts, row.status);
    addCount(statusRefs, row.status, row.refs);
    addCount(statusHits, row.status, row.hits);
    for (const role of row.roles) addCount(roleCounts, role);
    if (row.status === "unmapped") addCount(unmappedEvidenceCounts, row.gameFileEvidence?.bridgeHint);
  }

  const reportableRows = observedRows.filter((row) => row.status === "reportable");
  const missingDisplayRows = reportableRows.filter((row) => row.missingRuleTables.display.length > 0);
  const missingDescriptionRows = reportableRows.filter((row) => row.missingRuleTables.description.length > 0);
  const missingClassificationRows = reportableRows.filter((row) => row.missingRuleTables.classification.length > 0);
  const missingContributionRows = reportableRows.filter((row) => row.missingRuleTables.contribution.length > 0);
  const externalRows = observedRows.filter((row) => row.externalRefs > 0);
  const externalUnresolvedRows = externalRows.filter((row) => row.externalKnownRefs < row.externalRefs);
  const luckyObservedRows = observedRows.filter((row) => row.luckySourceIds.length > 0 || row.luckyTerms.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    inputs,
    semantics: {
      goal: "Audit generated global modifier coverage across every saved modifier entity export, not just one player or one encounter.",
      mapped:
        "Mapped means the observed buff/source id has generated source evidence. Reportable/debug/ignored decide whether it should appear in user-facing modifier rows.",
      externalActorCoverage:
        "External actor coverage measures whether the encounter-local export has a player/source actor name for a non-self source uid or source config id.",
      contribution:
        "Contribution coverage means a source rule has contribution-readiness metadata; it does not mean net-added damage is mathematically proven.",
    },
    generatedTableStats: {
      modifierSourceIndex: indexes.sourceIndex.stats,
      modifierRecount: indexes.recount.stats,
      modifierRelationships: indexes.relationships.stats,
      modifierClassification: indexes.classification.stats,
      modifierContribution: indexes.contribution.stats,
      lucky: indexes.lucky.stats,
    },
    summary: {
      filesScanned: fileReports.length,
      observedBuffIds: observedRows.length,
      observedRefs: observedRows.reduce((sum, row) => sum + row.refs, 0),
      observedHits: observedRows.reduce((sum, row) => sum + row.hits, 0),
      observedTotalValue: observedRows.reduce((sum, row) => sum + row.totalValue, 0),
      statusCounts,
      statusRefs,
      statusHits,
      roleCounts,
      unmappedEvidenceCounts,
      reportableObservedBuffIds: reportableRows.length,
      unmappedObservedBuffIds: observedRows.filter((row) => row.status === "unmapped").length,
      debugObservedBuffIds: observedRows.filter((row) => row.status === "debug").length,
      ignoredObservedBuffIds: observedRows.filter((row) => row.status === "ignored").length,
      sourceIndexOnlyObservedBuffIds: observedRows.filter((row) => row.status === "source-index-only").length,
      missingDisplayReportableBuffIds: missingDisplayRows.length,
      missingDescriptionReportableBuffIds: missingDescriptionRows.length,
      missingClassificationReportableBuffIds: missingClassificationRows.length,
      missingContributionReportableBuffIds: missingContributionRows.length,
      externalObservedBuffIds: externalRows.length,
      externalRefs: externalRows.reduce((sum, row) => sum + row.externalRefs, 0),
      externalKnownRefs: externalRows.reduce((sum, row) => sum + row.externalKnownRefs, 0),
      externalUnresolvedBuffIds: externalUnresolvedRows.length,
      luckyObservedBuffIds: luckyObservedRows.length,
    },
    files: fileReports,
    observedRows,
    topUnmappedRows: observedRows.filter((row) => row.status === "unmapped").slice(0, 250),
    topDebugRows: observedRows.filter((row) => row.status === "debug").slice(0, 250),
    missingDisplayRows: missingDisplayRows.slice(0, 250),
    missingDescriptionRows: missingDescriptionRows.slice(0, 250),
    missingClassificationRows: missingClassificationRows.slice(0, 250),
    missingContributionRows: missingContributionRows.slice(0, 250),
    externalUnresolvedRows: externalUnresolvedRows.slice(0, 250),
    luckyObservedRows: luckyObservedRows.slice(0, 250),
  };
}

function observedRowTable(rows, maxRows) {
  return rows.slice(0, maxRows).map((row) => [
    row.buffId,
    row.roles.join(", "),
    row.status,
    row.sourceNames.slice(0, 3).join("; "),
    row.sourceKinds.join(", "),
    row.gameFileEvidence?.bridgeHint ?? "",
    [
      ...(row.gameFileEvidence?.names ?? []).slice(0, 2),
      ...(row.gameFileEvidence?.designNames ?? []).slice(0, 2),
    ].filter(Boolean).join("; "),
    row.gameFileEvidence?.tables?.join(", ") ?? "",
    row.refs,
    row.hits,
    formatNumber(row.totalValue),
    row.files.length,
    row.sourceActorNames.slice(0, 4).join(", "),
    row.ruleIds.slice(0, 3).join(", "),
  ]);
}

function missingTableRows(rows, tableName, maxRows) {
  return rows.slice(0, maxRows).map((row) => [
    row.buffId,
    row.roles.join(", "),
    row.sourceNames.slice(0, 3).join("; "),
    row.refs,
    row.hits,
    formatNumber(row.totalValue),
    row.missingRuleTables[tableName].slice(0, 4).join(", "),
  ]);
}

function renderMarkdown(report, options) {
  const summaryRows = Object.keys(report.summary.statusCounts)
    .sort((left, right) => left.localeCompare(right))
    .map((status) => [
      status,
      report.summary.statusCounts[status],
      report.summary.statusRefs[status] ?? 0,
      report.summary.statusHits[status] ?? 0,
      formatPct(report.summary.statusCounts[status], report.summary.observedBuffIds),
    ]);
  const roleRows = Object.keys(report.summary.roleCounts)
    .sort((left, right) => left.localeCompare(right))
    .map((role) => [role, report.summary.roleCounts[role]]);
  const unmappedEvidenceRows = Object.keys(report.summary.unmappedEvidenceCounts)
    .sort((left, right) => report.summary.unmappedEvidenceCounts[right] - report.summary.unmappedEvidenceCounts[left])
    .map((kind) => [kind, report.summary.unmappedEvidenceCounts[kind]]);
  const fileRows = report.files.map((file) => [
    file.name || file.uid,
    file.classId,
    file.classSpec,
    path.basename(file.file),
    file.modifierHitBuckets,
    file.modifierReplayHits,
    file.modifierWindows,
    file.sourceActors,
  ]);
  const externalRows = report.externalUnresolvedRows.slice(0, options.maxRows).map((row) => [
    row.buffId,
    row.roles.join(", "),
    row.sourceNames.slice(0, 3).join("; "),
    row.externalRefs,
    row.externalKnownRefs,
    formatPct(row.externalKnownRefs, row.externalRefs),
    row.sourceActorNames.slice(0, 4).join(", "),
    row.unresolvedSourceUids.slice(0, 6).join(", "),
  ]);
  const luckyRows = report.luckyObservedRows.slice(0, options.maxRows).map((row) => [
    row.buffId,
    row.roles.join(", "),
    row.sourceNames.slice(0, 3).join("; "),
    row.luckySourceIds.slice(0, 3).join(", "),
    row.luckyTerms.slice(0, 5).join(", "),
    row.refs,
    row.hits,
    formatNumber(row.totalValue),
  ]);

  return [
    "# Global Modifier Coverage Audit",
    "",
    "This audit scans saved modifier entity exports against the generated global modifier tables. It is a coverage and gap report, not a single-player parse proof.",
    "",
    "## Summary",
    "",
    `- Files scanned: ${formatNumber(report.summary.filesScanned)}`,
    `- Observed modifier IDs: ${formatNumber(report.summary.observedBuffIds)}`,
    `- Observed references: ${formatNumber(report.summary.observedRefs)}`,
    `- Observed hit buckets: ${formatNumber(report.summary.observedHits)}`,
    `- Observed total value: ${formatNumber(report.summary.observedTotalValue)}`,
    `- Reportable observed IDs: ${formatNumber(report.summary.reportableObservedBuffIds)}`,
    `- Unmapped observed IDs: ${formatNumber(report.summary.unmappedObservedBuffIds)}`,
    `- Debug-only observed IDs: ${formatNumber(report.summary.debugObservedBuffIds)}`,
    `- Ignored observed IDs: ${formatNumber(report.summary.ignoredObservedBuffIds)}`,
    `- Source-index-only observed IDs: ${formatNumber(report.summary.sourceIndexOnlyObservedBuffIds)}`,
    `- Missing display rows on reportable IDs: ${formatNumber(report.summary.missingDisplayReportableBuffIds)}`,
    `- Missing description rows on reportable IDs: ${formatNumber(report.summary.missingDescriptionReportableBuffIds)}`,
    `- Missing classification rows on reportable IDs: ${formatNumber(report.summary.missingClassificationReportableBuffIds)}`,
    `- Missing contribution rows on reportable IDs: ${formatNumber(report.summary.missingContributionReportableBuffIds)}`,
    `- External source actor coverage: ${formatNumber(report.summary.externalKnownRefs)} / ${formatNumber(report.summary.externalRefs)} refs (${formatPct(report.summary.externalKnownRefs, report.summary.externalRefs)})`,
    `- Observed Lucky/Luck IDs: ${formatNumber(report.summary.luckyObservedBuffIds)}`,
    `- Generated modifier UID relationship edges: ${formatNumber(report.generatedTableStats.modifierRelationships?.uidEdges ?? report.generatedTableStats.modifierRecount?.uidEdges)}`,
    "",
    "## Generated Global Tables",
    "",
    `- Modifier recount source rules: ${formatNumber(report.generatedTableStats.modifierRecount?.sourceRules)}`,
    `- Modifier recount reportable buff IDs: ${formatNumber(report.generatedTableStats.modifierRecount?.reportableBuffIds)}`,
    `- Modifier classification rules: ${formatNumber(report.generatedTableStats.modifierClassification?.sourceRules)}`,
    `- Modifier contribution exact produced rows: ${formatNumber(report.generatedTableStats.modifierContribution?.exactProducedDamageRules)}`,
    `- Modifier contribution formula replay candidates: ${formatNumber(report.generatedTableStats.modifierContribution?.formulaReplayCandidateRules)}`,
    `- Global Lucky/Luck sources: ${formatNumber(report.generatedTableStats.lucky?.sources)}`,
    `- Global Lucky/Luck expected-value candidates: ${formatNumber(report.generatedTableStats.lucky?.formulaPolicyCounts?.["expected-value-candidate"])}`,
    "",
    "## Status Counts",
    "",
    summaryRows.length
      ? markdownTable(["Status", "IDs", "Refs", "Hits", "ID %"], summaryRows)
      : "No modifier IDs were observed.",
    "",
    "## Observed ID Roles",
    "",
    roleRows.length
      ? markdownTable(["Role", "IDs"], roleRows)
      : "No ID roles were observed.",
    "",
    "## Unmapped Evidence Kinds",
    "",
    unmappedEvidenceRows.length
      ? markdownTable(["Evidence Kind", "IDs"], unmappedEvidenceRows)
      : "No unmapped IDs were observed.",
    "",
    "## Files",
    "",
    fileRows.length
      ? markdownTable(["Player", "Class", "Spec", "File", "Buckets", "Replay Hits", "Windows", "Source Actors"], fileRows)
      : "No files were scanned.",
    "",
    "## Top Unmapped Observed IDs",
    "",
    report.topUnmappedRows.length
      ? markdownTable(["Modifier ID", "Roles", "Status", "Generated Names", "Kinds", "Evidence Kind", "Game File Names", "Game Tables", "Refs", "Hits", "Total Value", "Files", "Actors", "Rule IDs"], observedRowTable(report.topUnmappedRows, options.maxRows))
      : "No unmapped observed IDs.",
    "",
    "## Top Debug-Only Observed IDs",
    "",
    report.topDebugRows.length
      ? markdownTable(["Modifier ID", "Roles", "Status", "Generated Names", "Kinds", "Evidence Kind", "Game File Names", "Game Tables", "Refs", "Hits", "Total Value", "Files", "Actors", "Rule IDs"], observedRowTable(report.topDebugRows, options.maxRows))
      : "No debug-only observed IDs.",
    "",
    "## Missing Reportable Display",
    "",
    report.missingDisplayRows.length
      ? markdownTable(["Modifier ID", "Roles", "Names", "Refs", "Hits", "Total Value", "Missing Rule IDs"], missingTableRows(report.missingDisplayRows, "display", options.maxRows))
      : "No reportable IDs are missing display rows.",
    "",
    "## Missing Reportable Descriptions",
    "",
    report.missingDescriptionRows.length
      ? markdownTable(["Modifier ID", "Roles", "Names", "Refs", "Hits", "Total Value", "Missing Rule IDs"], missingTableRows(report.missingDescriptionRows, "description", options.maxRows))
      : "No reportable IDs are missing description rows.",
    "",
    "## Missing Reportable Classification",
    "",
    report.missingClassificationRows.length
      ? markdownTable(["Modifier ID", "Roles", "Names", "Refs", "Hits", "Total Value", "Missing Rule IDs"], missingTableRows(report.missingClassificationRows, "classification", options.maxRows))
      : "No reportable IDs are missing classification rows.",
    "",
    "## Missing Reportable Contribution",
    "",
    report.missingContributionRows.length
      ? markdownTable(["Modifier ID", "Roles", "Names", "Refs", "Hits", "Total Value", "Missing Rule IDs"], missingTableRows(report.missingContributionRows, "contribution", options.maxRows))
      : "No reportable IDs are missing contribution rows.",
    "",
    "## External Actor Gaps",
    "",
    externalRows.length
      ? markdownTable(["Modifier ID", "Roles", "Names", "External Refs", "Known Refs", "Coverage", "Known Actors", "Unresolved Source UIDs"], externalRows)
      : "All observed external source refs have encounter-local source actor names, or no external refs were observed.",
    "",
    "## Observed Lucky/Luck Coverage",
    "",
    luckyRows.length
      ? markdownTable(["Modifier ID", "Roles", "Names", "Lucky Source IDs", "Lucky Terms", "Refs", "Hits", "Total Value"], luckyRows)
      : "No observed IDs matched the global Lucky/Luck table.",
    "",
    "## Inputs",
    "",
    ...report.inputs.map((file) => `- ${file}`),
    "",
  ].join("\n");
}

function writeReport(report, options) {
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(options.outMd, renderMarkdown(report, options), "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const inputs = latestModifierEntityInputs(options);
  const indexes = buildIndexes();
  const report = buildReport(inputs, indexes);
  writeReport(report, options);

  console.log(`Files scanned: ${report.summary.filesScanned}`);
  console.log(`Observed modifier IDs: ${report.summary.observedBuffIds}`);
  console.log(`Reportable observed IDs: ${report.summary.reportableObservedBuffIds}`);
  console.log(`Unmapped observed IDs: ${report.summary.unmappedObservedBuffIds}`);
  console.log(`Debug-only observed IDs: ${report.summary.debugObservedBuffIds}`);
  console.log(`External source actor coverage: ${report.summary.externalKnownRefs}/${report.summary.externalRefs}`);
  console.log(`Observed Lucky/Luck IDs: ${report.summary.luckyObservedBuffIds}`);
  console.log(`Generated modifier UID relationship edges: ${report.generatedTableStats.modifierRelationships?.uidEdges ?? report.generatedTableStats.modifierRecount?.uidEdges ?? 0}`);
  console.log(`Output: ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Markdown: ${path.relative(repoRoot, options.outMd)}`);
}

main();
