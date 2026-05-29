#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BLOCKERS = path.resolve("DEV_exports", "flat-attack-replay-blockers-latest4.json");
const DEFAULT_STATE = path.resolve("DEV_exports", "flat-attack-state-selector-latest4.json");
const DEFAULT_ENTITY_DIR = path.resolve("DEV_exports");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "flat-attack-isolation-windows-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "flat-attack-isolation-windows-audit.md");
const WINDOW_MS = 5000;

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const blockersPath = path.resolve(argValue("--blockers", DEFAULT_BLOCKERS));
const statePath = path.resolve(argValue("--state", DEFAULT_STATE));
const entityDir = path.resolve(argValue("--entity-dir", DEFAULT_ENTITY_DIR));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const latest = positiveNumber(argValue("--latest", "80")) ?? 80;
const minWindowHits = positiveNumber(argValue("--min-window-hits", "10")) ?? 10;

const blockers = readJson(blockersPath);
const state = readJson(statePath);
const entityFiles = resolveEntityFiles(entityDir, latest);
const report = buildReport({ blockers, state, entityFiles, blockersPath, statePath, entityDir, minWindowHits });

ensureDir(outJson);
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
ensureDir(outMd);
fs.writeFileSync(outMd, renderMarkdown(report));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Flat attack isolation audit: files=${report.summary.files}, rows=${report.summary.rows}, rowsWithSoloHits=${report.summary.rowsWithSoloHits}, rowsWithUsableSoloWindows=${report.summary.rowsWithUsableSoloWindows}`,
);

function usage() {
  console.log(`Usage: node scripts/audit-flat-attack-isolation-windows.mjs [options]

Options:
  --blockers <path>          flat-attack replay blocker audit JSON.
  --state <path>             flat-attack state selector audit JSON.
  --entity-dir <path>        Directory containing modifier-entity-*.json files.
  --latest <n>               Number of newest modifier entity exports to scan.
  --min-window-hits <n>      Minimum solo hits for a 5s window to be considered useful.
  --out-json <path>          JSON output path.
  --out-md <path>            Markdown output path.
  --help                     Show this help.
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

function resolveEntityFiles(entityDir, latest) {
  if (!fs.existsSync(entityDir)) return [];
  return fs
    .readdirSync(entityDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^modifier-entity-.*\.json$/i.test(entry.name))
    .map((entry) => path.join(entityDir, entry.name))
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.filePath.localeCompare(b.filePath))
    .slice(0, latest)
    .map((entry) => path.resolve(entry.filePath));
}

function blockerRowsByRule(blockers) {
  const map = new Map();
  for (const row of asArray(blockers.rows)) {
    if (!row.ruleId) continue;
    map.set(row.ruleId, row);
  }
  return map;
}

function buildRows(blockers, state) {
  const blockersByRule = blockerRowsByRule(blockers);
  return asArray(state.rows).map((stateRow) => {
    const blocker = blockersByRule.get(stateRow.ruleId) ?? {};
    return {
      ruleId: stateRow.ruleId,
      sourceId: stateRow.sourceId ?? blocker.sourceId ?? null,
      label: stateRow.label ?? blocker.label ?? stateRow.ruleId,
      runtimeBuffIds: uniqueNumbers([...asArray(stateRow.runtimeBuffIds), ...asArray(blocker.runtimeBuffIds)]),
      damageIds: uniqueNumbers([...asArray(stateRow.damageIds), ...asArray(blocker.damageIds)]),
    };
  });
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

function panelSnapshot(hit) {
  return {
    attackPower: attrValue(hit.attackerAttrs, 50),
    physicalAttackPanel: attrValue(hit.attackerAttrs, 11330),
    magicAttackPanel: attrValue(hit.attackerAttrs, 11340),
  };
}

function createRowStats(row) {
  return {
    ruleId: row.ruleId,
    sourceId: row.sourceId,
    label: row.label,
    runtimeBuffIds: row.runtimeBuffIds,
    sourceActiveHits: 0,
    soloHits: 0,
    coactiveHits: 0,
    soloFiles: {},
    coactiveByRule: {},
    soloPanelValues: {},
    coactivePanelValues: {},
    soloWindows: new Map(),
    usableSoloWindows: [],
  };
}

function windowKey(fileName, timestampMs) {
  const bucket = Math.floor((Number(timestampMs) || 0) / WINDOW_MS) * WINDOW_MS;
  return `${fileName}|${bucket}`;
}

function observeWindow(rowStats, fileName, hit) {
  const key = windowKey(fileName, hit.timestampMs);
  const window = rowStats.soloWindows.get(key) ?? {
    file: fileName,
    startMs: Math.floor((Number(hit.timestampMs) || 0) / WINDOW_MS) * WINDOW_MS,
    hits: 0,
    firstHitMs: null,
    lastHitMs: null,
    panelValues: {},
    damageIds: {},
  };
  window.hits += 1;
  if (window.firstHitMs === null || Number(hit.timestampMs) < window.firstHitMs) window.firstHitMs = Number(hit.timestampMs);
  if (window.lastHitMs === null || Number(hit.timestampMs) > window.lastHitMs) window.lastHitMs = Number(hit.timestampMs);
  const panel = panelSnapshot(hit);
  addCount(window.panelValues, panel.physicalAttackPanel ?? panel.magicAttackPanel ?? panel.attackPower);
  addCount(window.damageIds, hit.damageId);
  rowStats.soloWindows.set(key, window);
}

function buildReport({ blockers, state, entityFiles, blockersPath, statePath, entityDir, minWindowHits }) {
  const rows = buildRows(blockers, state);
  const rowStats = new Map(rows.map((row) => [row.ruleId, createRowStats(row)]));
  const damageIdUnion = new Set(rows.flatMap((row) => row.damageIds));

  for (const filePath of entityFiles) {
    const fileName = path.basename(filePath);
    const entity = readJson(filePath);
    for (const hit of asArray(entity.modifierReplayHits)) {
      if (!damageIdUnion.has(Number(hit.damageId))) continue;
      const activeRows = [];
      for (const row of rows) {
        if (!row.damageIds.includes(Number(hit.damageId))) continue;
        if (!activeModsForIds(hit, row.runtimeBuffIds).length) continue;
        activeRows.push(row);
      }
      if (!activeRows.length) continue;

      const panel = panelSnapshot(hit);
      const panelKey = panel.physicalAttackPanel ?? panel.magicAttackPanel ?? panel.attackPower;
      for (const row of activeRows) {
        const stats = rowStats.get(row.ruleId);
        stats.sourceActiveHits += 1;
        if (activeRows.length === 1) {
          stats.soloHits += 1;
          addCount(stats.soloFiles, fileName);
          addCount(stats.soloPanelValues, panelKey);
          observeWindow(stats, fileName, hit);
        } else {
          stats.coactiveHits += 1;
          addCount(stats.coactivePanelValues, panelKey);
          for (const other of activeRows) {
            if (other.ruleId !== row.ruleId) addCount(stats.coactiveByRule, other.label);
          }
        }
      }
    }
  }

  const outputRows = [...rowStats.values()].map((stats) => {
    const windows = [...stats.soloWindows.values()]
      .filter((window) => window.hits >= minWindowHits)
      .sort((a, b) => b.hits - a.hits || a.startMs - b.startMs)
      .slice(0, 20);
    const statuses = [];
    if (stats.sourceActiveHits === 0) statuses.push("blocked-no-source-active-hits");
    if (stats.soloHits > 0) statuses.push("solo-source-hits-found");
    if (windows.length > 0) statuses.push("usable-solo-window-found");
    if (stats.sourceActiveHits > 0 && stats.soloHits === 0) statuses.push("blocked-only-coactive-source-hits");
    if (Object.keys(stats.soloPanelValues).length > 1) statuses.push("solo-panel-ladder-observed");
    if (Object.keys(stats.coactivePanelValues).length > 1) statuses.push("coactive-panel-ladder-observed");
    return {
      ...stats,
      soloWindows: undefined,
      usableSoloWindows: windows,
      statuses,
    };
  });

  const byStatus = {};
  for (const row of outputRows) {
    for (const status of row.statuses) addCount(byStatus, status);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "audit-flat-attack-isolation-windows.mjs",
    inputs: {
      blockers: path.relative(process.cwd(), blockersPath),
      state: path.relative(process.cwd(), statePath),
      entityDir: path.relative(process.cwd(), entityDir),
      files: entityFiles.map((file) => path.relative(process.cwd(), file)),
      windowMs: WINDOW_MS,
      minWindowHits,
    },
    summary: {
      files: entityFiles.length,
      rows: outputRows.length,
      sourceActiveHits: outputRows.reduce((sum, row) => sum + row.sourceActiveHits, 0),
      soloHits: outputRows.reduce((sum, row) => sum + row.soloHits, 0),
      coactiveHits: outputRows.reduce((sum, row) => sum + row.coactiveHits, 0),
      rowsWithSoloHits: outputRows.filter((row) => row.soloHits > 0).length,
      rowsWithUsableSoloWindows: outputRows.filter((row) => row.usableSoloWindows.length > 0).length,
      rowsOnlyCoactive: outputRows.filter((row) => row.statuses.includes("blocked-only-coactive-source-hits")).length,
      byStatus,
    },
    rows: outputRows,
  };
}

function formatCounts(counts, limit = 8) {
  return Object.entries(counts ?? {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, count]) => `${key}:${whole(count)}`)
    .join(", ");
}

function renderWindows(windows) {
  return asArray(windows)
    .slice(0, 8)
    .map((window) =>
      `${window.file} hits=${whole(window.hits)} panels=[${formatCounts(window.panelValues, 4)}] damage=[${formatCounts(window.damageIds, 4)}]`,
    )
    .join("<br>");
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Flat Attack Isolation Windows Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Files scanned: ${report.summary.files}`);
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Source-active hits: ${whole(report.summary.sourceActiveHits)}`);
  lines.push(`- Solo hits: ${whole(report.summary.soloHits)}`);
  lines.push(`- Coactive hits: ${whole(report.summary.coactiveHits)}`);
  lines.push(`- Rows with solo hits: ${report.summary.rowsWithSoloHits}`);
  lines.push(`- Rows with usable solo windows: ${report.summary.rowsWithUsableSoloWindows}`);
  lines.push(`- Rows only coactive: ${report.summary.rowsOnlyCoactive}`);
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
  lines.push("| Source | Runtime buffs | Source active | Solo hits | Coactive hits | Solo panels | Coactive with | Usable solo windows | Status |");
  lines.push("| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |");
  for (const row of report.rows) {
    lines.push(
      `| ${markdownCell(row.label)}<br>${markdownCell(row.sourceId)} | ${markdownCell(row.runtimeBuffIds.join(", "))} | ${whole(row.sourceActiveHits)} | ${whole(row.soloHits)} | ${whole(row.coactiveHits)} | ${markdownCell(formatCounts(row.soloPanelValues))} | ${markdownCell(formatCounts(row.coactiveByRule))} | ${markdownCell(renderWindows(row.usableSoloWindows))} | ${markdownCell(row.statuses.join("<br>"))} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This report is dev-only evidence. It does not change runtime parsing or modifier UI behavior.");
  lines.push("- A usable solo window is a 5 second source-active window where only one flat attack source is active for at least the configured minimum hit count.");
  lines.push("- Solo windows can become controlled replay lanes; fully coactive rows remain blocked until another selector separates the source values.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
