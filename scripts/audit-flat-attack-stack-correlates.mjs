#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BLOCKERS = path.resolve("DEV_exports", "flat-attack-replay-blockers-latest4.json");
const DEFAULT_STATE = path.resolve("DEV_exports", "flat-attack-state-selector-latest4.json");
const DEFAULT_ENTITY_DIR = path.resolve("DEV_exports");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "flat-attack-stack-correlates-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "flat-attack-stack-correlates-audit.md");

const ATTR_PHYSICAL_ATTACK_PANEL = 11330;
const ATTR_MAGIC_ATTACK_PANEL = 11340;
const ATTR_ATTACK_POWER = 50;

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const blockersPath = path.resolve(argValue("--blockers", DEFAULT_BLOCKERS));
const statePath = path.resolve(argValue("--state", DEFAULT_STATE));
const entityDir = path.resolve(argValue("--entity-dir", DEFAULT_ENTITY_DIR));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const maxCandidates = positiveNumber(argValue("--max-candidates", "30")) ?? 30;

const blockers = readJson(blockersPath);
const state = readJson(statePath);
const report = buildReport({ blockers, state, entityDir, blockersPath, statePath, maxCandidates });

ensureDir(outJson);
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
ensureDir(outMd);
fs.writeFileSync(outMd, renderMarkdown(report, maxCandidates));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Flat attack stack correlate audit: rows=${report.summary.rows}, rowsWithPanelLadder=${report.summary.rowsWithPanelLadder}, rowsWithStrongCorrelates=${report.summary.rowsWithStrongCorrelates}, coactiveGroups=${report.summary.coactiveGroups}`,
);

function usage() {
  console.log(`Usage: node scripts/audit-flat-attack-stack-correlates.mjs [options]

Options:
  --blockers <path>        flat-attack replay blocker audit JSON.
  --state <path>           flat-attack state selector audit JSON.
  --entity-dir <path>      Directory containing modifier-entity-*.json files.
  --out-json <path>        JSON output path.
  --out-md <path>          Markdown output path.
  --max-candidates <n>     Maximum candidates per markdown table.
  --help                   Show this help.
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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addCount(object, key, amount = 1) {
  const safeKey = String(key ?? "null");
  object[safeKey] = (object[safeKey] ?? 0) + amount;
}

function uniqueNumbers(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((left, right) => left - right);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "")).filter(Boolean))].sort();
}

function whole(value) {
  if (!Number.isFinite(value)) return "";
  return Math.round(value).toLocaleString("en-US");
}

function decimal(value, digits = 1) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(digits);
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function blockerRowsByRule(blockers) {
  const map = new Map();
  for (const row of asArray(blockers.rows)) {
    if (!row.ruleId) continue;
    map.set(row.ruleId, row);
  }
  return map;
}

function activeModsForIds(hit, ids) {
  const idSet = new Set(ids.map(Number));
  return asArray(hit.activeModifiers).filter((modifier) => idSet.has(Number(modifier.modifierBaseId)));
}

function attrValue(attrs, attrId) {
  const found = asArray(attrs).find((attr) => Number(attr.attrId) === Number(attrId));
  if (!found) return null;
  return finiteNumber(found.valueInt ?? found.valueFloat ?? found.valueBool);
}

function panelValue(hit) {
  return attrValue(hit.attackerAttrs, ATTR_PHYSICAL_ATTACK_PANEL)
    ?? attrValue(hit.attackerAttrs, ATTR_MAGIC_ATTACK_PANEL)
    ?? attrValue(hit.attackerAttrs, ATTR_ATTACK_POWER);
}

function modifierKey(modifier) {
  return [
    `base:${modifier.modifierBaseId ?? "null"}`,
    `srcCfg:${modifier.modifierSourceConfigId ?? "null"}`,
    `layer:${modifier.modifierLayer ?? "null"}`,
    `count:${modifier.modifierCount ?? "null"}`,
  ].join("|");
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

function createCandidate(key, modifier) {
  return {
    key,
    sample: compactModifier(modifier),
    hits: 0,
    byPanel: {},
    byFile: {},
    bySourceUid: {},
    byHostUid: {},
  };
}

function observeCandidate(candidates, hit, fileName, panel) {
  const seenKeys = new Set();
  for (const modifier of asArray(hit.activeModifiers)) {
    const key = modifierKey(modifier);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const candidate = candidates.get(key) ?? createCandidate(key, modifier);
    candidate.hits += 1;
    addCount(candidate.byPanel, panel);
    addCount(candidate.byFile, fileName);
    addCount(candidate.bySourceUid, modifier.modifierSourceUid);
    addCount(candidate.byHostUid, modifier.modifierHostUid);
    candidates.set(key, candidate);
  }
}

function buildRowFromReports(stateRow, blocker) {
  return {
    ruleId: stateRow.ruleId,
    sourceId: stateRow.sourceId ?? blocker.sourceId ?? null,
    label: stateRow.label ?? blocker.label ?? stateRow.ruleId,
    blockedHits: Number(stateRow.blockedHits ?? blocker.hits) || 0,
    runtimeBuffIds: uniqueNumbers([...asArray(stateRow.runtimeBuffIds), ...asArray(blocker.runtimeBuffIds)]),
    damageIds: uniqueNumbers([...asArray(blocker.damageIds), ...asArray(stateRow.damageIds)]),
    selectorCandidates: uniqueStrings([...asArray(stateRow.selectorCandidates), ...asArray(blocker.selectorCandidates)]),
    candidateValues: uniqueStrings([...asArray(stateRow.candidateValues), ...asArray(blocker.candidateValues)]),
    files: uniqueStrings([
      ...asArray(blocker.files),
      ...asArray(stateRow.fileStats).map((file) => file.file),
    ]),
  };
}

function hitSignature(hit) {
  return [
    hit.timestampMs ?? "",
    hit.damageId ?? "",
    hit.hitEventId ?? "",
    hit.attackerUid ?? "",
    hit.topSummonerUid ?? "",
    hit.targetUid ?? "",
    hit.value ?? "",
  ].join("|");
}

function resolveEntityFiles(row, entityDir) {
  return row.files
    .map((file) => path.resolve(entityDir, file))
    .filter((filePath) => fs.existsSync(filePath));
}

function buildFileStats(filePath, row) {
  const entity = readJson(filePath);
  const fileName = path.basename(filePath);
  const damageIds = new Set(row.damageIds);
  const runtimeBuffIds = row.runtimeBuffIds;
  const candidates = new Map();
  const panelCounts = {};
  const sourceHitSignatures = new Set();
  const sourceLayers = {};
  const sourceCounts = {};
  const sourceConfigIds = {};
  const stats = {
    file: fileName,
    sourceActiveHits: 0,
    panelCounts,
    sourceLayers,
    sourceCounts,
    sourceConfigIds,
    sourceHitSignatures: [],
    candidates: [],
  };

  for (const hit of asArray(entity.modifierReplayHits)) {
    if (!damageIds.has(Number(hit.damageId))) continue;
    const sourceMods = activeModsForIds(hit, runtimeBuffIds);
    if (!sourceMods.length) continue;
    const panel = panelValue(hit);
    stats.sourceActiveHits += 1;
    addCount(panelCounts, panel);
    sourceHitSignatures.add(hitSignature(hit));
    for (const sourceMod of sourceMods) {
      addCount(sourceLayers, sourceMod.modifierLayer);
      addCount(sourceCounts, sourceMod.modifierCount);
      addCount(sourceConfigIds, sourceMod.modifierSourceConfigId);
    }
    observeCandidate(candidates, hit, fileName, panel);
  }

  stats.sourceHitSignatures = [...sourceHitSignatures];
  stats.candidates = [...candidates.values()];
  return stats;
}

function mergeFileStats(fileStats) {
  const candidates = new Map();
  const totals = {
    sourceActiveHits: 0,
    panelCounts: {},
    sourceLayers: {},
    sourceCounts: {},
    sourceConfigIds: {},
    sourceHitSignatures: new Set(),
  };

  for (const file of fileStats) {
    totals.sourceActiveHits += file.sourceActiveHits || 0;
    for (const key of ["panelCounts", "sourceLayers", "sourceCounts", "sourceConfigIds"]) {
      for (const [value, count] of Object.entries(file[key] ?? {})) addCount(totals[key], value, count);
    }
    for (const signature of asArray(file.sourceHitSignatures)) totals.sourceHitSignatures.add(signature);
    for (const item of asArray(file.candidates)) {
      const candidate = candidates.get(item.key) ?? {
        key: item.key,
        sample: item.sample,
        hits: 0,
        byPanel: {},
        byFile: {},
        bySourceUid: {},
        byHostUid: {},
      };
      candidate.hits += item.hits;
      for (const key of ["byPanel", "byFile", "bySourceUid", "byHostUid"]) {
        for (const [value, count] of Object.entries(item[key] ?? {})) addCount(candidate[key], value, count);
      }
      candidates.set(item.key, candidate);
    }
  }

  const panelValues = Object.keys(totals.panelCounts).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  totals.panelValues = panelValues;
  totals.lowPanelValue = panelValues.at(0) ?? null;
  totals.highPanelValue = panelValues.at(-1) ?? null;
  totals.sourceHitSignatures = [...totals.sourceHitSignatures];
  totals.candidates = scoreCandidates([...candidates.values()], totals);
  return totals;
}

function scoreCandidates(candidates, totals) {
  const lowKey = String(totals.lowPanelValue);
  const highKey = String(totals.highPanelValue);
  const lowTotal = totals.panelCounts[lowKey] ?? 0;
  const highTotal = totals.panelCounts[highKey] ?? 0;
  return candidates
    .map((candidate) => {
      const lowHits = candidate.byPanel[lowKey] ?? 0;
      const highHits = candidate.byPanel[highKey] ?? 0;
      const lowCoverage = lowTotal ? lowHits / lowTotal : 0;
      const highCoverage = highTotal ? highHits / highTotal : 0;
      const separation = Math.abs(highCoverage - lowCoverage);
      const broadCoverage = totals.sourceActiveHits ? candidate.hits / totals.sourceActiveHits : 0;
      const likelyRuntimeSource = broadCoverage > 0.95 && separation < 0.05;
      return {
        ...candidate,
        lowHits,
        highHits,
        lowCoverage,
        highCoverage,
        separation,
        broadCoverage,
        verdict: likelyRuntimeSource
          ? "coactive-broad-source-not-stack-selector"
          : separation >= 0.8
            ? "strong-panel-ladder-correlate"
            : separation >= 0.25
              ? "weak-panel-ladder-correlate"
              : "not-panel-ladder-specific",
      };
    })
    .sort((left, right) =>
      right.separation - left.separation
      || right.highCoverage - left.highCoverage
      || right.hits - left.hits
      || left.key.localeCompare(right.key),
    );
}

function buildReport({ blockers, state, entityDir, blockersPath, statePath, maxCandidates }) {
  const blockersByRule = blockerRowsByRule(blockers);
  const rows = [];
  const signatureGroups = new Map();
  for (const stateRow of asArray(state.rows)) {
    const row = buildRowFromReports(stateRow, blockersByRule.get(stateRow.ruleId) ?? {});
    const fileStats = resolveEntityFiles(row, entityDir).map((filePath) => buildFileStats(filePath, row));
    const totals = mergeFileStats(fileStats);
    const strongCorrelates = totals.candidates.filter((candidate) => candidate.verdict === "strong-panel-ladder-correlate");
    const weakCorrelates = totals.candidates.filter((candidate) => candidate.verdict === "weak-panel-ladder-correlate");
    const signatureKey = totals.sourceHitSignatures.length ? totals.sourceHitSignatures.slice().sort().join("\n") : "";
    const sourceHitSignatureHash = signatureKey ? stableHash(signatureKey) : null;
    if (signatureKey) {
      const group = signatureGroups.get(signatureKey) ?? [];
      group.push(stateRow.ruleId);
      signatureGroups.set(signatureKey, group);
    }
    const statuses = [];
    if (totals.sourceActiveHits === 0) statuses.push("blocked-no-source-active-hits");
    if (totals.panelValues.length < 2 && totals.sourceActiveHits > 0) statuses.push("blocked-no-panel-ladder-in-source-window");
    if (totals.panelValues.length >= 2) statuses.push("panel-ladder-observed");
    if (strongCorrelates.length) statuses.push("strong-stack-correlate-candidate");
    if (!strongCorrelates.length && weakCorrelates.length) statuses.push("weak-stack-correlate-candidate");
    if (!strongCorrelates.length && !weakCorrelates.length && totals.sourceActiveHits > 0) statuses.push("blocked-no-stack-correlate-found");
    if (row.selectorCandidates.length > 1 || row.candidateValues.length > 1) statuses.push("value-ladder-selector-still-required");

    rows.push({
      ...row,
      fileStats: fileStats.map((file) => ({
        ...file,
        sourceHitSignatures: undefined,
        candidates: undefined,
      })),
      totals: {
        ...totals,
        sourceHitSignatures: undefined,
        candidates: totals.candidates.slice(0, maxCandidates),
      },
      sourceHitSignatureHash,
      sourceHitSignatureCount: totals.sourceHitSignatures.length,
      candidateCounts: {
        total: totals.candidates.length,
        strong: strongCorrelates.length,
        weak: weakCorrelates.length,
      },
      statuses,
    });
  }

  const coactiveSignatureHashes = new Set(
    [...signatureGroups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([signatureKey]) => stableHash(signatureKey)),
  );
  const coactiveGroups = coactiveSignatureHashes.size;
  for (const row of rows) {
    if (row.sourceHitSignatureHash && coactiveSignatureHashes.has(row.sourceHitSignatureHash)) {
      row.statuses.push("coactive-hit-set-ambiguous");
    }
  }
  const byStatus = {};
  for (const row of rows) {
    for (const status of row.statuses) addCount(byStatus, status);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "audit-flat-attack-stack-correlates.mjs",
    inputs: {
      blockers: path.relative(process.cwd(), blockersPath),
      state: path.relative(process.cwd(), statePath),
      entityDir: path.relative(process.cwd(), entityDir),
    },
    summary: {
      rows: rows.length,
      rowsWithSourceActiveHits: rows.filter((row) => row.totals.sourceActiveHits > 0).length,
      rowsWithPanelLadder: rows.filter((row) => row.statuses.includes("panel-ladder-observed")).length,
      rowsWithStrongCorrelates: rows.filter((row) => row.statuses.includes("strong-stack-correlate-candidate")).length,
      rowsWithWeakCorrelates: rows.filter((row) => row.statuses.includes("weak-stack-correlate-candidate")).length,
      rowsBlockedNoStackCorrelate: rows.filter((row) => row.statuses.includes("blocked-no-stack-correlate-found")).length,
      rowsBlockedNoSourceHits: rows.filter((row) => row.statuses.includes("blocked-no-source-active-hits")).length,
      rowsCoactiveHitSetAmbiguous: rows.filter((row) => row.statuses.includes("coactive-hit-set-ambiguous")).length,
      coactiveGroups,
      byStatus,
    },
    rows,
  };
}

function stableHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function formatCounts(counts, limit = 6) {
  return Object.entries(counts ?? {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, count]) => `${key}:${whole(count)}`)
    .join(", ");
}

function renderCandidates(candidates, limit) {
  return asArray(candidates)
    .slice(0, limit)
    .map((candidate) =>
      `${candidate.sample.modifierBaseId ?? "null"}`
      + ` srcCfg=${candidate.sample.modifierSourceConfigId ?? "null"}`
      + ` layer=${candidate.sample.modifierLayer ?? "null"}`
      + ` count=${candidate.sample.modifierCount ?? "null"}`
      + ` sep=${decimal(candidate.separation * 100)}%`
      + ` high=${decimal(candidate.highCoverage * 100)}%`
      + ` low=${decimal(candidate.lowCoverage * 100)}%`
      + ` ${candidate.verdict}`,
    )
    .join("<br>");
}

function renderMarkdown(report, maxCandidates) {
  const lines = [];
  lines.push("# Flat Attack Stack Correlate Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Rows with source-active hits: ${report.summary.rowsWithSourceActiveHits}`);
  lines.push(`- Rows with panel ladders: ${report.summary.rowsWithPanelLadder}`);
  lines.push(`- Rows with strong correlates: ${report.summary.rowsWithStrongCorrelates}`);
  lines.push(`- Rows with weak correlates: ${report.summary.rowsWithWeakCorrelates}`);
  lines.push(`- Rows blocked by no stack correlate: ${report.summary.rowsBlockedNoStackCorrelate}`);
  lines.push(`- Rows blocked by no source hits: ${report.summary.rowsBlockedNoSourceHits}`);
  lines.push(`- Rows with coactive hit-set ambiguity: ${report.summary.rowsCoactiveHitSetAmbiguous}`);
  lines.push(`- Coactive hit-signature groups: ${report.summary.coactiveGroups}`);
  lines.push("");
  lines.push("### Status Counts");
  lines.push("");
  lines.push("| Status | Rows |");
  lines.push("| --- | ---: |");
  for (const [status, count] of Object.entries(report.summary.byStatus).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`| ${markdownCell(status)} | ${count} |`);
  }
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| Source | Runtime buffs | Source active | Panel values | Source layers/counts | Candidates | Status |");
  lines.push("| --- | --- | ---: | --- | --- | --- | --- |");
  for (const row of report.rows) {
    lines.push(
      `| ${markdownCell(row.label)}<br>${markdownCell(row.sourceId)} | ${markdownCell(row.runtimeBuffIds.join(", "))} | ${whole(row.totals.sourceActiveHits)} | ${markdownCell(formatCounts(row.totals.panelCounts))} | ${markdownCell(formatCounts(row.totals.sourceLayers))}<br>${markdownCell(formatCounts(row.totals.sourceCounts))} | ${markdownCell(renderCandidates(row.totals.candidates, Math.min(maxCandidates, 8)))} | ${markdownCell(row.statuses.join("<br>"))} |`,
    );
  }
  lines.push("");
  lines.push("## File Panels");
  lines.push("");
  lines.push("| Source | File | Source active | Panel values | Source config ids |");
  lines.push("| --- | --- | ---: | --- | --- |");
  for (const row of report.rows) {
    for (const file of row.fileStats) {
      lines.push(
        `| ${markdownCell(row.label)} | ${markdownCell(file.file)} | ${whole(file.sourceActiveHits)} | ${markdownCell(formatCounts(file.panelCounts))} | ${markdownCell(formatCounts(file.sourceConfigIds))} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This report is dev-only evidence. It does not change runtime parsing or modifier UI behavior.");
  lines.push("- Strong correlates are active modifier UID/layer/count tuples whose presence separates the low and high panel attack values.");
  lines.push("- If no strong correlate appears, the replay has a panel stat ladder but still lacks a trustworthy per-hit stack/value selector.");
  lines.push("- Coactive hit-signature groups mean multiple source rules cover the same hit set, so their effects cannot be separated without an additional selector.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
