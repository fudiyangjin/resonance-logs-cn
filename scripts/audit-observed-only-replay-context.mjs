#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_REPLAY = path.resolve("DEV_exports", "skill-replay-candidates-latest4.json");
const DEFAULT_BRIDGE = path.resolve("DEV_exports", "observed-only-source-bridges-latest4.json");
const DEFAULT_STATE_BRIDGE = path.resolve("DEV_exports", "observed-only-source-bridges-state-bridge-test.json");
const DEV_GENERATED_ROOT = path.resolve("DEV_generated", "modifier");
const EXTRACTOR_GENERATED_ROOT = path.resolve("..", "BPSR-UID-Extractors", "output");
const DEFAULT_FORMULA_RUNTIME = generatedDevOrExtractor("ModifierFormulaTermRuntime.json");
const DEFAULT_FORMULA_TABLE = generatedDevOrExtractor("ModifierFormulaTermTable.json");
const DEFAULT_VALUE_RUNTIME = generatedDevOrExtractor("ModifierValueProofRuntime.json");
const DEFAULT_VALUE_TABLE = generatedDevOrExtractor("ModifierValueProofTable.json");
const DEFAULT_CONTRIBUTION_RUNTIME = path.resolve("..", "BPSR-UID-Extractors", "output", "ModifierContributionRuntime.json");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "observed-only-replay-context-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "observed-only-replay-context-audit.md");

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const replayPath = path.resolve(argValue("--replay-json", DEFAULT_REPLAY));
const bridgePath = path.resolve(argValue("--bridge-json", DEFAULT_BRIDGE));
const stateBridgePath = path.resolve(argValue("--state-bridge-json", DEFAULT_STATE_BRIDGE));
const formulaRuntimePath = path.resolve(argValue("--formula-runtime", DEFAULT_FORMULA_RUNTIME));
const formulaTablePath = path.resolve(argValue("--formula-table", DEFAULT_FORMULA_TABLE));
const valueRuntimePath = path.resolve(argValue("--value-runtime", DEFAULT_VALUE_RUNTIME));
const valueTablePath = path.resolve(argValue("--value-table", DEFAULT_VALUE_TABLE));
const contributionRuntimePath = path.resolve(argValue("--contribution-runtime", DEFAULT_CONTRIBUTION_RUNTIME));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const maxRows = positiveNumber(argValue("--max-rows", "80")) ?? 80;

function generatedDevOrExtractor(fileName) {
  const devPath = path.join(DEV_GENERATED_ROOT, fileName);
  return fs.existsSync(devPath) ? devPath : path.join(EXTRACTOR_GENERATED_ROOT, fileName);
}

const replay = readJson(replayPath);
const bridge = readJson(bridgePath);
const stateBridge = readJson(stateBridgePath);
const formulaRuntime = readJson(formulaRuntimePath);
const formulaTable = readJson(formulaTablePath);
const valueRuntime = readJson(valueRuntimePath);
const valueTable = readJson(valueTablePath);
const contributionRuntime = readJson(contributionRuntimePath);

const report = buildReport();
ensureDir(outJson);
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
ensureDir(outMd);
fs.writeFileSync(outMd, renderMarkdown(report, maxRows));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Observed-only replay context: buffs=${report.summary.observedOnlyBuffs}, rows=${report.summary.replayRowsWithObservedOnly}, stateOnly=${report.summary.stateOnlyBridges}, rowsStillBlocked=${report.summary.rowsStillBlockedAfterStateBridge}`,
);

function usage() {
  console.log(`Usage: node scripts/audit-observed-only-replay-context.mjs [options]

Options:
  --replay-json <path>          Skill replay candidate audit JSON.
  --bridge-json <path>          Current observed-only bridge audit JSON.
  --state-bridge-json <path>    Temp/generated state bridge audit JSON.
  --formula-runtime <path>      ModifierFormulaTermRuntime JSON.
  --formula-table <path>        ModifierFormulaTermTable JSON fallback.
  --value-runtime <path>        ModifierValueProofRuntime JSON.
  --value-table <path>          ModifierValueProofTable JSON fallback.
  --contribution-runtime <path> ModifierContributionRuntime JSON.
  --out-json <path>             JSON output path.
  --out-md <path>               Markdown output path.
  --max-rows <n>                Markdown row limit.
  --help                        Show this help.
`);
}

function argValues(flag) {
  const values = [];
  for (let index = 2; index < process.argv.length - 1; index += 1) {
    if (process.argv[index] === flag) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function argValue(flag, fallback = null) {
  return argValues(flag).at(-1) ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing input file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function uniqueNumbers(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((left, right) => left - right);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "")).filter(Boolean))].sort();
}

function addCount(object, key, amount = 1) {
  const safeKey = String(key ?? "null");
  object[safeKey] = (object[safeKey] ?? 0) + amount;
}

function whole(value) {
  if (!Number.isFinite(value)) return "";
  return Math.round(value).toLocaleString("en-US");
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function entryByKey(table, key) {
  return table.entriesByKey?.[key] ?? table[key] ?? null;
}

function sourceRuleContribution(ruleId) {
  return (
    contributionRuntime.sourcesByRuleId?.[ruleId]
    ?? contributionRuntime.sourcesById?.[ruleId]
    ?? contributionRuntime[ruleId]
    ?? null
  );
}

function sourceIdToFormulaKey(sourceId, sourceKind, sourceEntityId) {
  const entityId = positiveNumber(sourceEntityId) ?? positiveNumber(String(sourceId).split(":").at(-1));
  if (!entityId) return "";
  if (sourceKind === "season-talent-node" || String(sourceId).startsWith("season-talent-node:")) {
    return `seasonal-talents:${entityId}`;
  }
  if (sourceKind === "season-rogue-entry" || String(sourceId).startsWith("season-rogue-entry:")) {
    return `season-rogue-entries:${entityId}`;
  }
  if (sourceKind === "buff-source" || String(sourceId).startsWith("buff-source:")) {
    return `buffs:${entityId}`;
  }
  if (String(sourceId).startsWith("talent:") || String(sourceKind).startsWith("talent")) {
    return `talents:${entityId}`;
  }
  return "";
}

function observedOnlyDetails(row) {
  return asArray(row.blockedActionDetails).filter((detail) =>
    /^observed-only-value-bridge-required:observed-buff:\d+$/.test(String(detail.reason ?? "")),
  );
}

function observedBuffIdFromReason(reason) {
  const match = String(reason ?? "").match(/^observed-only-value-bridge-required:observed-buff:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function bridgeRowByBuff(report) {
  const map = new Map();
  for (const row of asArray(report.rows)) {
    const buffId = positiveNumber(row.buffId);
    if (buffId) map.set(buffId, row);
  }
  return map;
}

function replayRowsByObservedBuff() {
  const map = new Map();
  for (const row of asArray(replay.rows)) {
    for (const detail of observedOnlyDetails(row)) {
      const buffId = observedBuffIdFromReason(detail.reason);
      if (!buffId) continue;
      const entry = map.get(buffId) ?? {
        buffId,
        totalDetailHits: 0,
        damageIds: new Set(),
        rawRuleIds: new Set(),
        rows: [],
      };
      entry.totalDetailHits += Number(detail.hits) || 0;
      entry.damageIds.add(Number(row.damageId));
      entry.rawRuleIds.add(String(detail.ruleId ?? ""));
      entry.rows.push({
        damageId: Number(row.damageId),
        name: row.name ?? "",
        hits: Number(row.hits) || 0,
        detailHits: Number(detail.hits) || 0,
        rawRuleId: detail.ruleId ?? "",
        replayBlockers: asArray(row.replayBlockers),
        remainingBlockersAfterStateBridge: asArray(row.replayBlockers).filter((blocker) => blocker !== "observed-only-source-value-bridge-required"),
      });
      map.set(buffId, entry);
    }
  }
  return map;
}

function modifierMatches(modifier, ids) {
  const idSet = new Set(ids.map(Number));
  const baseId = finiteNumber(modifier.modifierBaseId);
  const sourceConfigId = finiteNumber(modifier.modifierSourceConfigId);
  return {
    base: baseId !== null && idSet.has(baseId),
    sourceConfig: sourceConfigId !== null && idSet.has(sourceConfigId),
  };
}

function compactModifier(modifier) {
  return {
    modifierBaseId: finiteNumber(modifier.modifierBaseId),
    modifierSourceConfigId: finiteNumber(modifier.modifierSourceConfigId),
    modifierLayer: finiteNumber(modifier.modifierLayer),
    modifierCount: finiteNumber(modifier.modifierCount),
    modifierHostUid: finiteNumber(modifier.modifierHostUid),
    modifierSourceUid: finiteNumber(modifier.modifierSourceUid),
  };
}

function modifierKey(modifier) {
  const compact = compactModifier(modifier);
  return [
    `base:${compact.modifierBaseId ?? "null"}`,
    `srcCfg:${compact.modifierSourceConfigId ?? "null"}`,
    `layer:${compact.modifierLayer ?? "null"}`,
    `count:${compact.modifierCount ?? "null"}`,
  ].join("|");
}

function replayInputFiles() {
  return asArray(replay.inputs?.modifierStrip)
    .map((filePath) => path.resolve(filePath))
    .filter((filePath) => fs.existsSync(filePath));
}

function scanReplayContext(entry, stateBridgeInfo) {
  const damageIds = new Set([...entry.damageIds]);
  const parentBuffIds = uniqueNumbers(
    asArray(stateBridgeInfo?.candidates?.[0]?.relationshipEdges).map((edge) => edge.parentBuffId),
  );
  const observedIds = [entry.buffId];
  const allBridgeIds = uniqueNumbers([...observedIds, ...parentBuffIds]);
  const totals = {
    sourceActiveHits: 0,
    observedBaseHits: 0,
    observedSourceConfigHits: 0,
    parentBaseHits: 0,
    parentSourceConfigHits: 0,
    byFile: {},
    byDamageId: {},
    byModifierBaseId: {},
    byModifierSourceConfigId: {},
    byLayer: {},
    byCount: {},
    sampleModifiers: [],
  };

  for (const filePath of replayInputFiles()) {
    const fileName = path.basename(filePath);
    const entity = readJson(filePath);
    for (const hit of asArray(entity.modifierReplayHits)) {
      if (!damageIds.has(Number(hit.damageId))) continue;
      let matched = false;
      const seenModifierKeys = new Set();
      for (const modifier of asArray(hit.activeModifiers)) {
        const observedMatch = modifierMatches(modifier, observedIds);
        const parentMatch = modifierMatches(modifier, parentBuffIds);
        const bridgeMatch = modifierMatches(modifier, allBridgeIds);
        if (!bridgeMatch.base && !bridgeMatch.sourceConfig) continue;
        matched = true;
        if (observedMatch.base) totals.observedBaseHits += 1;
        if (observedMatch.sourceConfig) totals.observedSourceConfigHits += 1;
        if (parentMatch.base) totals.parentBaseHits += 1;
        if (parentMatch.sourceConfig) totals.parentSourceConfigHits += 1;
        const compact = compactModifier(modifier);
        addCount(totals.byModifierBaseId, compact.modifierBaseId);
        addCount(totals.byModifierSourceConfigId, compact.modifierSourceConfigId);
        addCount(totals.byLayer, compact.modifierLayer);
        addCount(totals.byCount, compact.modifierCount);
        const key = modifierKey(modifier);
        if (!seenModifierKeys.has(key) && totals.sampleModifiers.length < 16) {
          totals.sampleModifiers.push(compact);
          seenModifierKeys.add(key);
        }
      }
      if (!matched) continue;
      totals.sourceActiveHits += 1;
      addCount(totals.byFile, fileName);
      addCount(totals.byDamageId, hit.damageId);
    }
  }

  return {
    parentBuffIds,
    bridgeIds: allBridgeIds,
    totals,
  };
}

function tableStatusFor(key) {
  const formula = entryByKey(formulaRuntime, key) ?? entryByKey(formulaTable, key);
  const value = entryByKey(valueRuntime, key) ?? entryByKey(valueTable, key);
  return {
    key,
    formulaReadiness: formula?.formulaReadiness ?? "",
    formulaZoneIds: asArray(formula?.formulaZoneIds),
    valueResolution: formula?.valueResolution ?? value?.valueResolution ?? "",
    valueProofStatus: value?.valueProofStatus ?? "",
    stackPolicy: formula?.stackPolicy ?? value?.stackPolicy ?? "",
    runtimeProofRequired: uniqueStrings([
      ...asArray(formula?.runtimeProofRequired),
      ...asArray(value?.runtimeProofRequired),
      ...asArray(value?.proofRequirements),
    ]),
    valueBlockers: asArray(value?.valueBlockers),
    sourceRuleIds: uniqueStrings([
      ...asArray(formula?.sourceRuleIds),
      ...asArray(value?.sourceRuleIds),
    ]),
  };
}

function buildRow(entry, currentBridgeMap, stateBridgeMap) {
  const currentBridgeInfo = currentBridgeMap.get(entry.buffId) ?? null;
  const stateBridgeInfo = stateBridgeMap.get(entry.buffId) ?? null;
  const bestCandidate = stateBridgeInfo?.candidates?.[0] ?? currentBridgeInfo?.candidates?.[0] ?? null;
  const bridgedRuleId = bestCandidate?.ruleId ?? "";
  const sourceKey = bestCandidate
    ? sourceIdToFormulaKey(bestCandidate.sourceId, bestCandidate.sourceKind, bestCandidate.sourceEntityId)
    : "";
  const observedKey = `buffs:${entry.buffId}`;
  const observedStatus = tableStatusFor(observedKey);
  const sourceStatus = sourceKey ? tableStatusFor(sourceKey) : null;
  const contribution = bridgedRuleId ? sourceRuleContribution(bridgedRuleId) : null;
  const replayContext = scanReplayContext(entry, stateBridgeInfo);
  const rowsStillBlocked = entry.rows.filter((row) => row.remainingBlockersAfterStateBridge.length > 0).length;
  const statuses = [];
  if (stateBridgeInfo?.recommendation === "already-bridged-by-recount") statuses.push("bridge-proven-by-temp-recount");
  if (asArray(bestCandidate?.relationshipEdges).some((edge) => edge.status === "state-only")) statuses.push("runtime-state-child-only");
  if (observedStatus.valueProofStatus === "missing-value-data" || observedStatus.valueResolution === "no-value") statuses.push("observed-buff-has-no-value-proof");
  if (contribution?.contributionMode === "overlap-only" || bestCandidate?.contributionStatus === "uptime-only") statuses.push("source-not-formula-contribution-ready");
  if (replayContext.totals.sourceActiveHits > 0) statuses.push("observed-in-replay-context");
  if (rowsStillBlocked > 0) statuses.push("replay-still-blocked-after-state-bridge");
  if (rowsStillBlocked === 0 && entry.rows.length > 0) statuses.push("state-bridge-unblocks-all-observed-rows");

  return {
    buffId: entry.buffId,
    label: stateBridgeInfo?.observedLabel ?? currentBridgeInfo?.observedLabel ?? "",
    observedDesign: stateBridgeInfo?.observedDesign ?? currentBridgeInfo?.observedDesign ?? "",
    rawRuleIds: uniqueStrings([...entry.rawRuleIds]),
    bridgedRuleId,
    bridgedSourceId: bestCandidate?.sourceId ?? "",
    bridgedSourceKind: bestCandidate?.sourceKind ?? "",
    bridgedContributionStatus: bestCandidate?.contributionStatus ?? "",
    bridgedReportPolicy: bestCandidate?.reportPolicy ?? "",
    contributionMode: contribution?.contributionMode ?? "",
    contributionTier: contribution?.contributionTier ?? "",
    currentRecommendation: currentBridgeInfo?.recommendation ?? "",
    stateBridgeRecommendation: stateBridgeInfo?.recommendation ?? "",
    stateBridgeEvidence: uniqueStrings(asArray(bestCandidate?.evidence)),
    observedStatus,
    sourceStatus,
    replayContext,
    totalDetailHits: entry.totalDetailHits,
    affectedDamageIds: uniqueNumbers([...entry.damageIds]),
    replayRows: entry.rows.sort((left, right) => right.detailHits - left.detailHits || left.damageId - right.damageId),
    rowsStillBlockedAfterStateBridge: rowsStillBlocked,
    statuses,
  };
}

function buildReport() {
  const currentBridgeMap = bridgeRowByBuff(bridge);
  const stateBridgeMap = bridgeRowByBuff(stateBridge);
  const observedMap = replayRowsByObservedBuff();
  const rows = [...observedMap.values()].map((entry) => buildRow(entry, currentBridgeMap, stateBridgeMap));
  const byStatus = {};
  for (const row of rows) {
    for (const status of row.statuses) addCount(byStatus, status);
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "audit-observed-only-replay-context.mjs",
    inputs: {
      replay: path.relative(process.cwd(), replayPath),
      bridge: path.relative(process.cwd(), bridgePath),
      stateBridge: path.relative(process.cwd(), stateBridgePath),
      formulaRuntime: path.relative(process.cwd(), formulaRuntimePath),
      formulaTable: path.relative(process.cwd(), formulaTablePath),
      valueRuntime: path.relative(process.cwd(), valueRuntimePath),
      valueTable: path.relative(process.cwd(), valueTablePath),
      contributionRuntime: path.relative(process.cwd(), contributionRuntimePath),
    },
    summary: {
      observedOnlyBuffs: rows.length,
      replayRowsWithObservedOnly: rows.reduce((sum, row) => sum + row.replayRows.length, 0),
      observedOnlyDetailHits: rows.reduce((sum, row) => sum + row.totalDetailHits, 0),
      stateOnlyBridges: rows.filter((row) => row.statuses.includes("runtime-state-child-only")).length,
      valueReadyBridges: rows.filter((row) => !row.statuses.includes("observed-buff-has-no-value-proof")).length,
      rowsStillBlockedAfterStateBridge: rows.reduce((sum, row) => sum + row.rowsStillBlockedAfterStateBridge, 0),
      replayContextHits: rows.reduce((sum, row) => sum + row.replayContext.totals.sourceActiveHits, 0),
      byStatus,
    },
    rows,
  };
}

function formatCounts(counts, limit = 8) {
  return Object.entries(counts ?? {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, count]) => `${key}:${whole(count)}`)
    .join(", ");
}

function renderMarkdown(report, limit) {
  const lines = [];
  lines.push("# Observed-Only Replay Context Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Observed-only buffs: ${report.summary.observedOnlyBuffs}`);
  lines.push(`- Replay rows with observed-only blockers: ${report.summary.replayRowsWithObservedOnly}`);
  lines.push(`- Observed-only detail hits: ${whole(report.summary.observedOnlyDetailHits)}`);
  lines.push(`- State-only bridges: ${report.summary.stateOnlyBridges}`);
  lines.push(`- Value-ready bridges: ${report.summary.valueReadyBridges}`);
  lines.push(`- Rows still blocked after state bridge: ${report.summary.rowsStillBlockedAfterStateBridge}`);
  lines.push(`- Replay context hits found: ${whole(report.summary.replayContextHits)}`);
  lines.push("");
  lines.push("## Bridge Verdicts");
  lines.push("");
  lines.push("| Buff | Label | Raw Rule | Bridge Rule | Source | Value Status | Contribution | Replay Context | Verdicts |");
  lines.push("| ---: | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of report.rows.slice(0, limit)) {
    lines.push(
      [
        row.buffId,
        row.label || row.observedDesign,
        row.rawRuleIds.join("<br>"),
        row.bridgedRuleId,
        row.bridgedSourceId,
        [
          row.observedStatus.formulaReadiness,
          row.observedStatus.valueProofStatus,
          row.observedStatus.valueResolution,
          row.observedStatus.stackPolicy,
        ].filter(Boolean).join("<br>"),
        [row.contributionMode, row.contributionTier, row.bridgedContributionStatus].filter(Boolean).join("<br>"),
        [
          `hits=${whole(row.replayContext.totals.sourceActiveHits)}`,
          `base=${formatCounts(row.replayContext.totals.byModifierBaseId, 4)}`,
          `srcCfg=${formatCounts(row.replayContext.totals.byModifierSourceConfigId, 4)}`,
          `count=${formatCounts(row.replayContext.totals.byCount, 4)}`,
        ].join("<br>"),
        row.statuses.join("<br>"),
      ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }
  lines.push("");
  lines.push("## Affected Replay Rows");
  lines.push("");
  for (const row of report.rows.slice(0, limit)) {
    lines.push(`### ${markdownCell(row.label || row.buffId)} (${row.buffId})`);
    lines.push("");
    lines.push("| Damage ID | Skill | Detail Hits | Remaining Blockers After State Bridge |");
    lines.push("| ---: | --- | ---: | --- |");
    for (const replayRow of row.replayRows.slice(0, limit)) {
      lines.push(
        [
          replayRow.damageId,
          replayRow.name,
          replayRow.detailHits,
          replayRow.remainingBlockersAfterStateBridge.join("<br>"),
        ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"),
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
