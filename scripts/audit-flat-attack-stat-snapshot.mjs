#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BLOCKERS = path.resolve("DEV_exports", "flat-attack-replay-blockers-latest4.json");
const DEFAULT_STATE = path.resolve("DEV_exports", "flat-attack-state-selector-latest4.json");
const DEFAULT_EXPORT_DIR = path.resolve("DEV_exports");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "flat-attack-stat-snapshot-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "flat-attack-stat-snapshot-audit.md");

const ATTR_LABELS = new Map([
  [50, "AttackPower"],
  [262, "PhysicalAttackLegacy"],
  [11010, "Strength"],
  [11020, "Intelligence"],
  [11030, "Agility"],
  [11110, "CriticalMultiplier"],
  [11330, "PhysicalAttackPanel"],
  [11340, "MagicAttackPanel"],
  [11440, "SeasonStrength"],
  [11710, "CritRatePanel"],
  [11720, "AttackSpeed"],
  [11730, "CastSpeedPanel"],
  [11780, "LuckyPanel"],
  [11930, "HastePanel"],
  [11940, "MasteryPanel"],
  [11950, "VersatilityPanel"],
  [11960, "CooldownAccelerationPanel"],
  [12510, "CritDamagePanel"],
  [12530, "LuckyDamageMultiplierPanel"],
  [12540, "LuckyStrikeMultiplierPanel"],
]);

const PRIMARY_ATTACK_ATTRS = [50, 11330, 11340];
const SNAPSHOT_ATTRS = [
  50,
  11330,
  11340,
  11010,
  11020,
  11030,
  11440,
  11110,
  11710,
  11720,
  11730,
  11780,
  11930,
  11940,
  11950,
  11960,
  12510,
  12530,
  12540,
];

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const blockersPath = path.resolve(argValue("--blockers", DEFAULT_BLOCKERS));
const statePath = path.resolve(argValue("--state", DEFAULT_STATE));
const exportDir = path.resolve(argValue("--entity-dir", DEFAULT_EXPORT_DIR));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const maxRows = positiveNumber(argValue("--max-rows", "80")) ?? 80;

const blockers = readJson(blockersPath);
const state = readJson(statePath);
const report = buildReport({ blockers, state, exportDir, blockersPath, statePath });

ensureDir(outJson);
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
ensureDir(outMd);
fs.writeFileSync(outMd, renderMarkdown(report, maxRows));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Flat attack stat snapshot audit: rows=${report.summary.rows}, direct=${report.summary.rowsWithDirectSourceStats}, primaryAttrs=${report.summary.rowsWithPrimaryAttackAttrs}, blockedNoSource=${report.summary.rowsBlockedNoSourceHits}`,
);

function usage() {
  console.log(`Usage: node scripts/audit-flat-attack-stat-snapshot.mjs [options]

Options:
  --blockers <path>     flat-attack replay blocker audit JSON.
  --state <path>        flat-attack state selector audit JSON.
  --entity-dir <path>   Directory containing modifier-entity-*.json files.
  --out-json <path>     JSON output path.
  --out-md <path>       Markdown output path.
  --max-rows <n>        Maximum markdown table rows.
  --help                Show this help.
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

function percent(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
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

function attrMap(attrs) {
  const map = new Map();
  for (const attr of asArray(attrs)) {
    const attrId = Number(attr.attrId);
    if (!Number.isFinite(attrId)) continue;
    const value = attr.valueInt ?? attr.valueFloat ?? attr.valueBool;
    if (value === null || value === undefined) continue;
    map.set(attrId, value);
  }
  return map;
}

function createAttrAccumulator(attrId) {
  return {
    attrId,
    label: ATTR_LABELS.get(attrId) ?? `attr:${attrId}`,
    samples: 0,
    min: null,
    max: null,
    first: null,
    last: null,
    distinctValues: new Map(),
  };
}

function observeAttr(acc, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  acc.samples += 1;
  if (acc.first === null) acc.first = number;
  acc.last = number;
  acc.min = acc.min === null ? number : Math.min(acc.min, number);
  acc.max = acc.max === null ? number : Math.max(acc.max, number);
  addCount(acc.distinctValues, number);
}

function finalizeAttr(acc) {
  const distinctValues = Object.entries(acc.distinctValues)
    .map(([value, hits]) => ({ value: Number(value), hits }))
    .sort((left, right) => right.hits - left.hits || left.value - right.value);
  return {
    attrId: acc.attrId,
    label: acc.label,
    samples: acc.samples,
    min: acc.min,
    max: acc.max,
    first: acc.first,
    last: acc.last,
    uniqueValues: distinctValues.length,
    topValues: distinctValues.slice(0, 12),
  };
}

function relationKeysForMod(hit, modifier) {
  const sourceUid = finiteNumber(modifier.modifierSourceUid);
  const hostUid = finiteNumber(modifier.modifierHostUid);
  const attackerUid = finiteNumber(hit.attackerUid);
  const topSummonerUid = finiteNumber(hit.topSummonerUid);
  const originalAttackerUid = finiteNumber(hit.originalAttackerUid);
  const targetUid = finiteNumber(hit.targetUid);
  const keys = [];

  if (sourceUid === null) {
    keys.push("source:null");
  } else {
    if (sourceUid === attackerUid) keys.push("source=attacker");
    if (sourceUid === topSummonerUid) keys.push("source=topSummoner");
    if (sourceUid === originalAttackerUid) keys.push("source=originalAttacker");
    if (sourceUid === targetUid) keys.push("source=target");
    if (!keys.some((key) => key.startsWith("source="))) keys.push("source=other");
  }

  if (hostUid === null) {
    keys.push("host:null");
  } else {
    if (hostUid === attackerUid) keys.push("host=attacker");
    if (hostUid === topSummonerUid) keys.push("host=topSummoner");
    if (hostUid === originalAttackerUid) keys.push("host=originalAttacker");
    if (hostUid === targetUid) keys.push("host=target");
    if (!keys.some((key) => key.startsWith("host="))) keys.push("host=other");
  }

  return keys;
}

function sourceStatIsDirect(hit, sourceMods) {
  if (!sourceMods.length) return false;
  const attackerUid = finiteNumber(hit.attackerUid);
  const topSummonerUid = finiteNumber(hit.topSummonerUid);
  const originalAttackerUid = finiteNumber(hit.originalAttackerUid);
  return sourceMods.some((modifier) => {
    const sourceUid = finiteNumber(modifier.modifierSourceUid);
    const hostUid = finiteNumber(modifier.modifierHostUid);
    return [sourceUid, hostUid].some((uid) =>
      uid !== null && (uid === attackerUid || uid === topSummonerUid || uid === originalAttackerUid),
    );
  });
}

function buildFileStats(filePath, row) {
  const entity = readJson(filePath);
  const damageIds = new Set(uniqueNumbers(row.damageIds));
  const runtimeBuffIds = uniqueNumbers(row.runtimeBuffIds);
  const attrAccumulators = new Map(SNAPSHOT_ATTRS.map((attrId) => [attrId, createAttrAccumulator(attrId)]));
  const directAttrAccumulators = new Map(SNAPSHOT_ATTRS.map((attrId) => [attrId, createAttrAccumulator(attrId)]));
  const stats = {
    file: path.basename(filePath),
    replayHitsForDamageIds: 0,
    sourceActiveHits: 0,
    sourceActiveDamage: 0,
    sourceActiveWithAttackerAttrs: 0,
    directSourceStatHits: 0,
    directSourceWithPrimaryAttackAttrs: 0,
    sourceWithoutDirectStats: 0,
    missingPrimaryAttackAttrs: 0,
    byDamageId: {},
    relationCounts: {},
    attackerUidCounts: {},
    topSummonerUidCounts: {},
    originalAttackerUidCounts: {},
    sourceUidCounts: {},
    hostUidCounts: {},
    sourceLayers: {},
    sourceCounts: {},
    sourceConfigIds: {},
    firstSeenMs: null,
    lastSeenMs: null,
    attrSnapshots: [],
    directSourceAttrSnapshots: [],
  };

  for (const hit of asArray(entity.modifierReplayHits)) {
    if (!damageIds.has(Number(hit.damageId))) continue;
    stats.replayHitsForDamageIds += 1;
    const sourceMods = activeModsForIds(hit, runtimeBuffIds);
    if (!sourceMods.length) continue;

    stats.sourceActiveHits += 1;
    stats.sourceActiveDamage += finiteNumber(hit.value) ?? 0;
    addCount(stats.byDamageId, hit.damageId);
    addCount(stats.attackerUidCounts, hit.attackerUid);
    addCount(stats.topSummonerUidCounts, hit.topSummonerUid);
    addCount(stats.originalAttackerUidCounts, hit.originalAttackerUid);
    if (stats.firstSeenMs === null || Number(hit.timestampMs) < stats.firstSeenMs) stats.firstSeenMs = Number(hit.timestampMs);
    if (stats.lastSeenMs === null || Number(hit.timestampMs) > stats.lastSeenMs) stats.lastSeenMs = Number(hit.timestampMs);

    for (const modifier of sourceMods) {
      addCount(stats.sourceUidCounts, modifier.modifierSourceUid);
      addCount(stats.hostUidCounts, modifier.modifierHostUid);
      addCount(stats.sourceLayers, modifier.modifierLayer);
      addCount(stats.sourceCounts, modifier.modifierCount);
      addCount(stats.sourceConfigIds, modifier.modifierSourceConfigId);
      for (const key of relationKeysForMod(hit, modifier)) addCount(stats.relationCounts, key);
    }

    const attrs = attrMap(hit.attackerAttrs);
    if (attrs.size > 0) {
      stats.sourceActiveWithAttackerAttrs += 1;
      for (const [attrId, acc] of attrAccumulators) observeAttr(acc, attrs.get(attrId));
    }

    const direct = sourceStatIsDirect(hit, sourceMods);
    if (direct) {
      stats.directSourceStatHits += 1;
      for (const [attrId, acc] of directAttrAccumulators) observeAttr(acc, attrs.get(attrId));
      const hasPrimary = PRIMARY_ATTACK_ATTRS.some((attrId) => attrs.has(attrId));
      if (hasPrimary) {
        stats.directSourceWithPrimaryAttackAttrs += 1;
      } else {
        stats.missingPrimaryAttackAttrs += 1;
      }
    } else {
      stats.sourceWithoutDirectStats += 1;
    }
  }

  stats.attrSnapshots = [...attrAccumulators.values()].map(finalizeAttr).filter((attr) => attr.samples > 0);
  stats.directSourceAttrSnapshots = [...directAttrAccumulators.values()].map(finalizeAttr).filter((attr) => attr.samples > 0);
  return stats;
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) addCount(target, key, value);
}

function mergeAttrSnapshots(fileStats, key) {
  const merged = new Map(SNAPSHOT_ATTRS.map((attrId) => [attrId, createAttrAccumulator(attrId)]));
  for (const file of fileStats) {
    for (const attr of asArray(file[key])) {
      const acc = merged.get(Number(attr.attrId));
      if (!acc) continue;
      for (const value of asArray(attr.topValues)) {
        for (let index = 0; index < value.hits; index += 1) observeAttr(acc, value.value);
      }
    }
  }
  return [...merged.values()].map(finalizeAttr).filter((attr) => attr.samples > 0);
}

function mergeFileStats(fileStats) {
  const totals = {
    replayHitsForDamageIds: 0,
    sourceActiveHits: 0,
    sourceActiveDamage: 0,
    sourceActiveWithAttackerAttrs: 0,
    directSourceStatHits: 0,
    directSourceWithPrimaryAttackAttrs: 0,
    sourceWithoutDirectStats: 0,
    missingPrimaryAttackAttrs: 0,
    byDamageId: {},
    relationCounts: {},
    attackerUidCounts: {},
    topSummonerUidCounts: {},
    originalAttackerUidCounts: {},
    sourceUidCounts: {},
    hostUidCounts: {},
    sourceLayers: {},
    sourceCounts: {},
    sourceConfigIds: {},
    firstSeenMs: null,
    lastSeenMs: null,
  };

  for (const file of fileStats) {
    for (const key of [
      "replayHitsForDamageIds",
      "sourceActiveHits",
      "sourceActiveDamage",
      "sourceActiveWithAttackerAttrs",
      "directSourceStatHits",
      "directSourceWithPrimaryAttackAttrs",
      "sourceWithoutDirectStats",
      "missingPrimaryAttackAttrs",
    ]) {
      totals[key] += file[key] || 0;
    }
    for (const key of [
      "byDamageId",
      "relationCounts",
      "attackerUidCounts",
      "topSummonerUidCounts",
      "originalAttackerUidCounts",
      "sourceUidCounts",
      "hostUidCounts",
      "sourceLayers",
      "sourceCounts",
      "sourceConfigIds",
    ]) {
      mergeCounts(totals[key], file[key]);
    }
    if (file.firstSeenMs !== null && (totals.firstSeenMs === null || file.firstSeenMs < totals.firstSeenMs)) {
      totals.firstSeenMs = file.firstSeenMs;
    }
    if (file.lastSeenMs !== null && (totals.lastSeenMs === null || file.lastSeenMs > totals.lastSeenMs)) {
      totals.lastSeenMs = file.lastSeenMs;
    }
  }

  totals.attrSnapshots = mergeAttrSnapshots(fileStats, "attrSnapshots");
  totals.directSourceAttrSnapshots = mergeAttrSnapshots(fileStats, "directSourceAttrSnapshots");
  return totals;
}

function rowStatus(row, totals) {
  const statuses = [];
  if (!row.runtimeBuffIds.length) statuses.push("blocked-no-runtime-source-buff");
  if (totals.sourceActiveHits === 0) {
    statuses.push("blocked-no-source-active-hits");
    return statuses;
  }
  if (totals.sourceActiveWithAttackerAttrs === 0) statuses.push("blocked-no-attacker-attrs");
  if (totals.directSourceStatHits === totals.sourceActiveHits) {
    statuses.push("source-actor-stat-snapshot-direct");
  } else if (totals.directSourceStatHits > 0) {
    statuses.push("partial-source-actor-stat-snapshot-direct");
  } else {
    statuses.push("blocked-source-actor-stats-not-in-attacker-snapshot");
  }
  if (totals.directSourceWithPrimaryAttackAttrs === totals.directSourceStatHits && totals.directSourceStatHits > 0) {
    statuses.push("primary-attack-snapshot-present");
  } else if (totals.directSourceStatHits > 0) {
    statuses.push("blocked-missing-primary-attack-attrs");
  }
  if (!row.stateBuffIds.length) statuses.push("blocked-no-hit-time-stack-state");
  if (row.selectorCandidates.length > 1 || row.candidateValues.length > 1) {
    statuses.push("value-ladder-selector-still-required");
  }
  const primaryAttrs = totals.directSourceAttrSnapshots.filter((attr) => PRIMARY_ATTACK_ATTRS.includes(attr.attrId));
  if (primaryAttrs.some((attr) => attr.uniqueValues > 1)) statuses.push("primary-attack-stat-ladder-observed");
  if (primaryAttrs.length && primaryAttrs.every((attr) => attr.uniqueValues === 1)) statuses.push("single-primary-attack-value-observed");
  return statuses;
}

function resolveEntityFiles(row, exportDir) {
  const fileNames = uniqueStrings([
    ...asArray(row.files),
    ...asArray(row.fileStats).map((file) => file.file),
  ]);
  return fileNames
    .map((file) => path.resolve(exportDir, file))
    .filter((filePath) => fs.existsSync(filePath));
}

function buildReport({ blockers, state, exportDir, blockersPath, statePath }) {
  const blockersByRule = blockerRowsByRule(blockers);
  const rows = [];

  for (const stateRow of asArray(state.rows)) {
    const blocker = blockersByRule.get(stateRow.ruleId) ?? {};
    const row = {
      ruleId: stateRow.ruleId,
      sourceId: stateRow.sourceId ?? blocker.sourceId ?? null,
      label: stateRow.label ?? blocker.label ?? stateRow.ruleId,
      blockedHits: Number(stateRow.blockedHits ?? blocker.hits) || 0,
      runtimeBuffIds: uniqueNumbers([...asArray(stateRow.runtimeBuffIds), ...asArray(blocker.runtimeBuffIds)]),
      stateBuffIds: uniqueNumbers(asArray(stateRow.stateBuffIds)),
      damageIds: uniqueNumbers([...asArray(blocker.damageIds), ...asArray(stateRow.damageIds)]),
      candidateValues: uniqueStrings([...asArray(blocker.candidateValues), ...asArray(stateRow.candidateValues)]),
      selectorCandidates: uniqueStrings([...asArray(blocker.selectorCandidates), ...asArray(stateRow.selectorCandidates)]),
      files: uniqueStrings([
        ...asArray(blocker.files),
        ...asArray(stateRow.fileStats).map((file) => file.file),
      ]),
    };
    const entityFiles = resolveEntityFiles(row, exportDir);
    const fileStats = entityFiles.map((filePath) => buildFileStats(filePath, row));
    const totals = mergeFileStats(fileStats);
    const statuses = rowStatus(row, totals);
    rows.push({
      ...row,
      fileStats,
      totals,
      statuses,
      directSourceCoveragePct: percent(totals.directSourceStatHits, totals.sourceActiveHits),
      primaryAttackAttrCoveragePct: percent(totals.directSourceWithPrimaryAttackAttrs, totals.directSourceStatHits),
    });
  }

  const byStatus = {};
  for (const row of rows) {
    for (const status of row.statuses) addCount(byStatus, status);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "audit-flat-attack-stat-snapshot.mjs",
    inputs: {
      blockers: path.relative(process.cwd(), blockersPath),
      state: path.relative(process.cwd(), statePath),
      exportDir: path.relative(process.cwd(), exportDir),
    },
    summary: {
      rows: rows.length,
      blockedHits: rows.reduce((sum, row) => sum + row.blockedHits, 0),
      sourceActiveHits: rows.reduce((sum, row) => sum + row.totals.sourceActiveHits, 0),
      directSourceStatHits: rows.reduce((sum, row) => sum + row.totals.directSourceStatHits, 0),
      rowsWithDirectSourceStats: rows.filter((row) => row.statuses.includes("source-actor-stat-snapshot-direct")).length,
      rowsWithPrimaryAttackAttrs: rows.filter((row) => row.statuses.includes("primary-attack-snapshot-present")).length,
      rowsWithPrimaryAttackLadder: rows.filter((row) => row.statuses.includes("primary-attack-stat-ladder-observed")).length,
      rowsBlockedNoSourceHits: rows.filter((row) => row.statuses.includes("blocked-no-source-active-hits")).length,
      rowsBlockedNoStackState: rows.filter((row) => row.statuses.includes("blocked-no-hit-time-stack-state")).length,
      byStatus,
    },
    rows,
  };
}

function formatCounts(counts, limit = 5) {
  const entries = Object.entries(counts ?? {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
  return entries.map(([key, value]) => `${key}:${whole(value)}`).join(", ");
}

function attrSummaryText(attrs, attrIds = PRIMARY_ATTACK_ATTRS) {
  const byId = new Map(asArray(attrs).map((attr) => [attr.attrId, attr]));
  return attrIds
    .map((attrId) => {
      const attr = byId.get(attrId);
      if (!attr) return null;
      const values = asArray(attr.topValues)
        .slice(0, 4)
        .map((item) => `${item.value}x${whole(item.hits)}`)
        .join(", ");
      return `${attr.label} ${attr.min}-${attr.max} (${values})`;
    })
    .filter(Boolean)
    .join("<br>");
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Flat Attack Stat Snapshot Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Blocked hits: ${whole(report.summary.blockedHits)}`);
  lines.push(`- Source-active hits: ${whole(report.summary.sourceActiveHits)}`);
  lines.push(`- Direct source stat hits: ${whole(report.summary.directSourceStatHits)}`);
  lines.push(`- Rows with direct source stats: ${report.summary.rowsWithDirectSourceStats}`);
  lines.push(`- Rows with primary attack attrs: ${report.summary.rowsWithPrimaryAttackAttrs}`);
  lines.push(`- Rows with primary attack ladders: ${report.summary.rowsWithPrimaryAttackLadder}`);
  lines.push(`- Rows blocked by missing source hits: ${report.summary.rowsBlockedNoSourceHits}`);
  lines.push(`- Rows blocked by missing hit-time stack state: ${report.summary.rowsBlockedNoStackState}`);
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
  lines.push("| Source | Runtime buffs | Blocked hits | Source active | Direct stat hits | Primary attr coverage | Source relations | Primary attack snapshots | Status |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |");
  for (const row of report.rows.slice(0, maxRows)) {
    lines.push(
      `| ${markdownCell(row.label)}<br>${markdownCell(row.sourceId)} | ${markdownCell(row.runtimeBuffIds.join(", "))} | ${whole(row.blockedHits)} | ${whole(row.totals.sourceActiveHits)} | ${whole(row.totals.directSourceStatHits)} | ${decimal(row.primaryAttackAttrCoveragePct)}% | ${markdownCell(formatCounts(row.totals.relationCounts))} | ${markdownCell(attrSummaryText(row.totals.directSourceAttrSnapshots))} | ${markdownCell(row.statuses.join("<br>"))} |`,
    );
  }
  lines.push("");
  lines.push("## File Breakdown");
  lines.push("");
  lines.push("| Source | File | Source active | Direct stat hits | Attacker UIDs | Source UIDs | Primary snapshots |");
  lines.push("| --- | --- | ---: | ---: | --- | --- | --- |");
  for (const row of report.rows.slice(0, maxRows)) {
    for (const file of row.fileStats) {
      lines.push(
        `| ${markdownCell(row.label)} | ${markdownCell(file.file)} | ${whole(file.sourceActiveHits)} | ${whole(file.directSourceStatHits)} | ${markdownCell(formatCounts(file.attackerUidCounts, 4))} | ${markdownCell(formatCounts(file.sourceUidCounts, 4))} | ${markdownCell(attrSummaryText(file.directSourceAttrSnapshots))} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This report is dev-only evidence. It does not promote contribution math into runtime.");
  lines.push("- `source-actor-stat-snapshot-direct` means the active modifier source/host UID matches the attacker, top summoner, or original attacker for the hit, so attackerAttrs are usable as source actor snapshots for this proof lane.");
  lines.push("- `primary-attack-snapshot-present` means at least one of AttackPower, PhysicalAttackPanel, or MagicAttackPanel is present for every direct source stat hit.");
  lines.push("- Missing hit-time stack state still blocks exact flat attack replay because the candidate value ladder cannot be selected from the snapshot alone.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
