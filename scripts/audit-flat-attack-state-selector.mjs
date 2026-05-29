#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sortedNumbers(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((left, right) => left - right);
}

function addCount(object, key, amount = 1) {
  const safeKey = String(key ?? "null");
  object[safeKey] = (object[safeKey] ?? 0) + amount;
}

function stat(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) return null;
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    distinct: sortedNumbers(numbers),
  };
}

function whole(value) {
  if (!Number.isFinite(value)) return "";
  return Math.round(value).toLocaleString("en-US");
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function relationshipStateBuffIds(ruleId, relationship) {
  const source = relationship.sourcesByRuleId?.[ruleId] ?? {};
  const edges = asArray(source.uidEdges).filter((edge) =>
    edge.uidKind === "buff"
    && edge.edgeKind === "runtime-state-child-alias"
    && edge.role === "runtime-state"
  );
  return {
    stateBuffIds: sortedNumbers(edges.map((edge) => edge.uid)),
    parentBuffIds: sortedNumbers(edges.map((edge) => edge.parentUid)),
    edges: edges.map((edge) => ({
      edgeKind: edge.edgeKind,
      uid: edge.uid,
      parentUid: edge.parentUid,
      relationshipKind: edge.relationshipKind,
      status: edge.status,
    })),
  };
}

function activeModsForIds(hit, ids) {
  const idSet = new Set(ids);
  return asArray(hit.activeModifiers).filter((modifier) => idSet.has(Number(modifier.modifierBaseId)));
}

function buildFileStats(filePath, row, stateBuffIds) {
  const entity = readJson(filePath);
  const damageIds = new Set(sortedNumbers(row.damageIds));
  const runtimeBuffIds = sortedNumbers(row.runtimeBuffIds);
  const byDamageId = {};
  const sourceLayers = {};
  const sourceCounts = {};
  const sourceConfigIds = {};
  const stateLayers = {};
  const stateCounts = {};
  const stateConfigIds = {};
  const sourceHitValues = [];
  const sourceStateHitValues = [];
  const stats = {
    file: path.basename(filePath),
    replayHitsForDamageIds: 0,
    sourceActiveHits: 0,
    stateActiveHits: 0,
    sourceAndStateHits: 0,
    sourceWithoutStateHits: 0,
    stateWithoutSourceHits: 0,
    byDamageId,
    sourceLayers,
    sourceCounts,
    sourceConfigIds,
    stateLayers,
    stateCounts,
    stateConfigIds,
    sourceValue: null,
    sourceStateValue: null,
  };

  for (const hit of asArray(entity.modifierReplayHits)) {
    if (!damageIds.has(Number(hit.damageId))) continue;
    stats.replayHitsForDamageIds += 1;
    const sourceMods = activeModsForIds(hit, runtimeBuffIds);
    const stateMods = activeModsForIds(hit, stateBuffIds);
    const sourceActive = sourceMods.length > 0;
    const stateActive = stateMods.length > 0;
    if (sourceActive) {
      stats.sourceActiveHits += 1;
      sourceHitValues.push(Number(hit.value));
      addCount(byDamageId, hit.damageId);
      for (const modifier of sourceMods) {
        addCount(sourceLayers, modifier.modifierLayer);
        addCount(sourceCounts, modifier.modifierCount);
        addCount(sourceConfigIds, modifier.modifierSourceConfigId);
      }
    }
    if (stateActive) {
      stats.stateActiveHits += 1;
      for (const modifier of stateMods) {
        addCount(stateLayers, modifier.modifierLayer);
        addCount(stateCounts, modifier.modifierCount);
        addCount(stateConfigIds, modifier.modifierSourceConfigId);
      }
    }
    if (sourceActive && stateActive) {
      stats.sourceAndStateHits += 1;
      sourceStateHitValues.push(Number(hit.value));
    } else if (sourceActive) {
      stats.sourceWithoutStateHits += 1;
    } else if (stateActive) {
      stats.stateWithoutSourceHits += 1;
    }
  }

  stats.sourceValue = stat(sourceHitValues);
  stats.sourceStateValue = stat(sourceStateHitValues);
  return stats;
}

function selectorStatus(row, totals, stateBuffIds) {
  const statuses = [];
  if (row.runtimeBuffIds.length === 0) statuses.push("blocked-no-runtime-source-buff");
  if (totals.sourceActiveHits === 0) statuses.push("blocked-no-source-active-hits");
  if (totals.sourceActiveHits > 0 && totals.sourceActiveHits !== row.hits) statuses.push("review-source-hit-count-mismatch");
  if (totals.sourceActiveHits === row.hits && row.hits > 0) statuses.push("source-window-covers-blocked-hits");
  if (stateBuffIds.length === 0) {
    statuses.push("blocked-no-state-child-buff");
  } else if (totals.sourceActiveHits > 0 && totals.sourceWithoutStateHits === 0) {
    statuses.push("state-child-covers-source-hits");
  } else if (totals.sourceWithoutStateHits > 0) {
    statuses.push("blocked-source-hits-missing-state-child");
  }
  if (Object.keys(totals.stateLayers).length === 1) statuses.push("single-state-layer-observed");
  if (Object.keys(totals.stateLayers).length > 1) statuses.push("multi-state-layer-observed");
  if (Object.keys(totals.stateLayers).length > 0) statuses.push("value-ladder-still-needs-layer-to-value-map");
  return statuses;
}

function mergeFileStats(fileStats) {
  const totals = {
    replayHitsForDamageIds: 0,
    sourceActiveHits: 0,
    stateActiveHits: 0,
    sourceAndStateHits: 0,
    sourceWithoutStateHits: 0,
    stateWithoutSourceHits: 0,
    sourceLayers: {},
    sourceCounts: {},
    sourceConfigIds: {},
    stateLayers: {},
    stateCounts: {},
    stateConfigIds: {},
  };
  for (const file of fileStats) {
    for (const key of [
      "replayHitsForDamageIds",
      "sourceActiveHits",
      "stateActiveHits",
      "sourceAndStateHits",
      "sourceWithoutStateHits",
      "stateWithoutSourceHits",
    ]) {
      totals[key] += file[key] || 0;
    }
    for (const [target, source] of [
      [totals.sourceLayers, file.sourceLayers],
      [totals.sourceCounts, file.sourceCounts],
      [totals.sourceConfigIds, file.sourceConfigIds],
      [totals.stateLayers, file.stateLayers],
      [totals.stateCounts, file.stateCounts],
      [totals.stateConfigIds, file.stateConfigIds],
    ]) {
      for (const [key, count] of Object.entries(source)) addCount(target, key, count);
    }
  }
  return totals;
}

function buildReport(blockers, relationship, entityDir) {
  const rows = [];
  for (const row of asArray(blockers.rows)) {
    const state = relationshipStateBuffIds(row.ruleId, relationship);
    const fileStats = asArray(row.files).map((file) => buildFileStats(path.join(entityDir, file), row, state.stateBuffIds));
    const totals = mergeFileStats(fileStats);
    rows.push({
      ruleId: row.ruleId,
      sourceId: row.sourceId,
      label: row.label,
      blockedHits: row.hits,
      runtimeBuffIds: sortedNumbers(row.runtimeBuffIds),
      stateBuffIds: state.stateBuffIds,
      parentStateBuffIds: state.parentBuffIds,
      selectorCandidates: asArray(row.selectorCandidates),
      candidateValues: asArray(row.candidateValues),
      totals,
      selectorStatus: selectorStatus(row, totals, state.stateBuffIds),
      fileStats,
      relationshipEdges: state.edges,
    });
  }

  const byStatus = {};
  for (const row of rows) {
    for (const status of row.selectorStatus) addCount(byStatus, status);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      flatAttackRules: rows.length,
      rulesWithSourceWindowCoverage: rows.filter((row) => row.selectorStatus.includes("source-window-covers-blocked-hits")).length,
      rulesWithStateChildCoverage: rows.filter((row) => row.selectorStatus.includes("state-child-covers-source-hits")).length,
      rulesStillBlockedNoSourceHits: rows.filter((row) => row.selectorStatus.includes("blocked-no-source-active-hits")).length,
      byStatus,
    },
    rows,
  };
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Flat ATK State Selector Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Flat ATK rules: ${report.summary.flatAttackRules}`);
  lines.push(`- Source window covers blocked hits: ${report.summary.rulesWithSourceWindowCoverage}`);
  lines.push(`- State child covers source hits: ${report.summary.rulesWithStateChildCoverage}`);
  lines.push(`- Still blocked with no source-active hits: ${report.summary.rulesStillBlockedNoSourceHits}`);
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| Rule | Label | Blocked Hits | Source Hits | State Hits | Source+State | Runtime Buffs | State Buffs | State Layers | Status |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |");
  for (const row of report.rows.slice(0, maxRows)) {
    lines.push(
      [
        row.ruleId,
        row.label,
        whole(row.blockedHits),
        whole(row.totals.sourceActiveHits),
        whole(row.totals.stateActiveHits),
        whole(row.totals.sourceAndStateHits),
        row.runtimeBuffIds.join(", "),
        row.stateBuffIds.join(", "),
        Object.entries(row.totals.stateLayers).map(([key, count]) => `${key}:${count}`).join("<br>"),
        row.selectorStatus.join("<br>"),
      ]
        .map(markdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
const blockersPath = args["blockers-json"] ?? "DEV_exports/flat-attack-replay-blockers-latest4.json";
const relationshipPath = args["relationship-json"] ?? "parser-data/generated/ModifierRelationshipTable.json";
const entityDir = args["entity-dir"] ?? "DEV_exports";
const outJson = args["out-json"] ?? "DEV_exports/flat-attack-state-selector-latest4.json";
const outMd = args["out-md"] ?? "DEV_exports/flat-attack-state-selector-latest4.md";
const maxRows = Number.parseInt(args["max-rows"] ?? "60", 10);

const report = buildReport(readJson(blockersPath), readJson(relationshipPath), entityDir);
report.inputs = { blockersPath, relationshipPath, entityDir };
ensureDir(outJson);
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
ensureDir(outMd);
fs.writeFileSync(outMd, renderMarkdown(report, Number.isFinite(maxRows) ? maxRows : 60));

console.log(`Flat ATK rules: ${report.summary.flatAttackRules}`);
console.log(`Source window covers blocked hits: ${report.summary.rulesWithSourceWindowCoverage}`);
console.log(`State child covers source hits: ${report.summary.rulesWithStateChildCoverage}`);
console.log(`Still blocked with no source-active hits: ${report.summary.rulesStillBlockedNoSourceHits}`);
console.log(`Output: ${outJson}`);
console.log(`Markdown: ${outMd}`);
