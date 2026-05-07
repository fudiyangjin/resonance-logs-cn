#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const APP_DIR_NAME = "com.resonance-logs-cn";
const DEFAULT_CENSUS_LIMIT = 6;
const DEFAULT_EVENT_LIMIT = 6;

const repoRoot = process.cwd();
const eventRoot = path.join(process.env.APPDATA ?? "", APP_DIR_NAME, "EventLogs");
const outputDir = path.join(repoRoot, "DEV_exports");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function generatedJson(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function walkJsonFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, result);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      result.push(fullPath);
    }
  }
  return result;
}

function statMtime(filePath) {
  return fs.statSync(filePath).mtimeMs;
}

function basename(filePath) {
  return path.basename(filePath);
}

function uniquePush(array, value, limit = 128) {
  if (value === null || value === undefined || value === "" || array.includes(value)) return;
  if (array.length < limit) array.push(value);
}

function uniquePushRecount(array, value, limit = 128) {
  if (!value || value.recountId === null || value.recountId === undefined) return;
  if (array.some((existing) => existing.recountId === value.recountId)) return;
  if (array.length < limit) array.push(value);
}

function mergeValues(target, source, keys) {
  for (const key of keys) {
    if (!Array.isArray(source[key])) continue;
    if (!Array.isArray(target[key])) target[key] = [];
    for (const value of source[key]) {
      if (key === "recountRows") uniquePushRecount(target[key], value);
      else uniquePush(target[key], value);
    }
  }
}

function compactRow(row) {
  return {
    damageId: row.damageId,
    displayName: row.displayName ?? null,
    displayDetailName: row.displayDetailName ?? null,
    category: row.category ?? null,
    sourceStatus: row.sourceStatus ?? null,
    totalValue: row.totalValue ?? 0,
    hits: row.hits ?? 0,
    healHits: row.healHits ?? 0,
    parentRecountId: row.parentRecountId ?? null,
    parentRecountName: row.parentRecountName ?? null,
    recountRows: row.recountRows ?? [],
    directFactorBuffIds: row.directFactorBuffIds ?? [],
    effectSourceIds: row.effectSourceIds ?? [],
    ownerIds: row.ownerIds ?? [],
    ownerLevels: row.ownerLevels ?? [],
    hitEventIds: row.hitEventIds ?? [],
    damageSources: row.damageSources ?? [],
    activeFactorBuffIds: row.activeFactorBuffIds ?? [],
    activeEffectBuffIds: row.activeEffectBuffIds ?? [],
    activeEffectSourceIds: row.activeEffectSourceIds ?? [],
    activeFactorItemIds: row.activeFactorItemIds ?? [],
    files: row.files ?? [],
  };
}

function mergeCensusRows(files) {
  const byId = new Map();
  const mergeKeys = [
    "ownerIds",
    "ownerLevels",
    "hitEventIds",
    "damageSources",
    "attackerClassIds",
    "attackerClassSpecs",
    "activeFactorBuffIds",
    "activeEffectBuffIds",
    "activeEffectSourceIds",
    "activeFactorItemIds",
    "activeFactorItemGrades",
    "directFactorBuffIds",
    "effectSourceIds",
    "recountRows",
  ];

  for (const filePath of files) {
    const payload = readJson(filePath);
    for (const row of payload.rows ?? []) {
      const key = String(row.damageId);
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, {
          ...row,
          files: [basename(filePath)],
        });
        continue;
      }

      existing.hits = (existing.hits ?? 0) + (row.hits ?? 0);
      existing.healHits = (existing.healHits ?? 0) + (row.healHits ?? 0);
      existing.totalValue = (existing.totalValue ?? 0) + (row.totalValue ?? 0);
      existing.hpLossTotal = (existing.hpLossTotal ?? 0) + (row.hpLossTotal ?? 0);
      existing.shieldLossTotal = (existing.shieldLossTotal ?? 0) + (row.shieldLossTotal ?? 0);
      existing.critHits = (existing.critHits ?? 0) + (row.critHits ?? 0);
      existing.luckyHits = (existing.luckyHits ?? 0) + (row.luckyHits ?? 0);
      existing.firstSeenMs = Math.min(existing.firstSeenMs ?? row.firstSeenMs, row.firstSeenMs);
      existing.lastSeenMs = Math.max(existing.lastSeenMs ?? row.lastSeenMs, row.lastSeenMs);
      uniquePush(existing.files, basename(filePath));
      mergeValues(existing, row, mergeKeys);
    }
  }

  return [...byId.values()].sort(
    (left, right) => (right.totalValue ?? 0) - (left.totalValue ?? 0) || Number(left.damageId) - Number(right.damageId),
  );
}

function findLatestFiles() {
  const files = walkJsonFiles(eventRoot).sort((a, b) => statMtime(b) - statMtime(a));
  const censusFiles = files.filter((file) => file.includes(`${path.sep}AttributionCensus${path.sep}`)).slice(0, DEFAULT_CENSUS_LIMIT);
  const censusWindowStart =
    censusFiles.length > 0 ? Math.min(...censusFiles.map(statMtime)) - 15 * 60 * 1000 : 0;
  return {
    censusFiles,
    eventFiles: files
      .filter((file) => !file.includes(`${path.sep}AttributionCensus${path.sep}`))
      .filter((file) => censusWindowStart === 0 || statMtime(file) >= censusWindowStart)
      .filter((file) => fs.statSync(file).size > 100_000)
      .slice(0, DEFAULT_EVENT_LIMIT),
  };
}

function scanEventLogDamageIds(files) {
  const byId = new Map();
  for (const filePath of files) {
    const payload = readJson(filePath);
    for (const entry of payload.entries ?? []) {
      if (entry.action !== "snapshot" || !entry.raw) continue;
      let raw;
      try {
        raw = JSON.parse(entry.raw);
      } catch {
        continue;
      }

      const skillId = raw.skillId;
      if (!Number.isFinite(Number(skillId))) continue;
      const kind = entry.category;
      const totalValue = Number(
        raw.stats?.total_value ??
          raw.stats?.totalValue ??
          raw.stats?.effective_total_value ??
          raw.totalValue ??
          0,
      );
      const hits = Number(raw.stats?.hits ?? 0);
      const key = String(skillId);
      const row = byId.get(key) ?? {
        damageId: Number(skillId),
        snapshots: 0,
        files: [],
        kinds: [],
        maxTotalValue: 0,
        maxHits: 0,
      };
      row.snapshots += 1;
      uniquePush(row.files, basename(filePath));
      uniquePush(row.kinds, kind);
      row.maxTotalValue = Math.max(row.maxTotalValue, totalValue);
      row.maxHits = Math.max(row.maxHits, hits);
      byId.set(key, row);
    }
  }
  return [...byId.values()].sort((left, right) => right.maxTotalValue - left.maxTotalValue);
}

function scanEventLogActiveFactors(files) {
  const active = new Map();
  for (const filePath of files) {
    const payload = readJson(filePath);
    for (const entry of payload.entries ?? []) {
      if (entry.category !== "player" || entry.action !== "snapshot" || !entry.raw) continue;
      let raw;
      try {
        raw = JSON.parse(entry.raw);
      } catch {
        continue;
      }
      for (const item of raw.activeFactorItems ?? []) {
        const buffId = Number(item.factor_buff_id ?? item.factorBuffId);
        if (!Number.isFinite(buffId)) continue;
        const row = active.get(buffId) ?? {
          buffId,
          snapshots: 0,
          grades: [],
          itemConfigIds: [],
          files: [],
        };
        row.snapshots += 1;
        uniquePush(row.grades, Number(item.grade));
        uniquePush(row.itemConfigIds, Number(item.item_config_id ?? item.itemConfigId));
        uniquePush(row.files, basename(filePath));
        active.set(buffId, row);
      }
    }
  }
  return [...active.values()].sort((left, right) => right.snapshots - left.snapshots || left.buffId - right.buffId);
}

function buildGeneratedIndex() {
  const breakdown = generatedJson("SkillBreakdownDetails.json");
  const recount = generatedJson("RecountTable.json");
  const factors = generatedJson("SeasonPhantomFactors.json");
  const effects = generatedJson("EffectSources.json");

  const recountByDamageId = new Map();
  for (const [recountId, row] of Object.entries(recount)) {
    for (const damageId of row.DamageId ?? []) {
      const list = recountByDamageId.get(String(damageId)) ?? [];
      list.push({ recountId: Number(recountId), name: row.Names?.en ?? row.Name ?? row.RecountName ?? null });
      recountByDamageId.set(String(damageId), list);
    }
  }

  const directFactorDamageByBuffId = new Map();
  for (const [damageId, buffIds] of Object.entries(factors.damageIdToFactorBuffIds ?? {})) {
    for (const buffId of buffIds) directFactorDamageByBuffId.set(Number(buffId), Number(damageId));
  }

  return {
    breakdown,
    recountByDamageId,
    factors,
    effects,
    directFactorDamageByBuffId,
  };
}

function enrichObservedDamageIds(observed, index) {
  return observed.map((row) => {
    const detail = index.breakdown[String(row.damageId)] ?? {};
    return {
      ...row,
      displayName: detail.DisplayNames?.en ?? detail.DisplayName ?? null,
      category: detail.Category ?? null,
      parentRecountId: detail.ParentRecountId ?? null,
      parentRecountName: detail.ParentRecountNames?.en ?? detail.ParentRecountName ?? null,
      recountRows: index.recountByDamageId.get(String(row.damageId)) ?? [],
      directFactorBuffIds: index.factors.damageIdToFactorBuffIds?.[String(row.damageId)] ?? [],
      effectSourceIds: index.effects.damageIdToEffectSourceIds?.[String(row.damageId)] ?? [],
      knownBreakdown: Boolean(index.breakdown[String(row.damageId)]),
    };
  });
}

function buildActiveFactorEvidence(rows, index) {
  const active = new Map();
  for (const row of rows) {
    for (const buffId of row.activeFactorBuffIds ?? []) {
      const current = active.get(Number(buffId)) ?? {
        buffId: Number(buffId),
        observedDamageRows: 0,
        observedTotalValue: 0,
        directDamageId: index.directFactorDamageByBuffId.get(Number(buffId)) ?? null,
        sourceOnlyTargetRecountIds: [],
      };
      current.observedDamageRows += 1;
      current.observedTotalValue += row.totalValue ?? 0;
      active.set(Number(buffId), current);
    }
  }

  for (const [recountId, buffIds] of Object.entries(index.factors.recountIdToFactorBuffIds ?? {})) {
    for (const buffId of buffIds) {
      const current = active.get(Number(buffId));
      if (current) uniquePush(current.sourceOnlyTargetRecountIds, Number(recountId));
    }
  }

  return [...active.values()].sort(
    (left, right) => right.observedTotalValue - left.observedTotalValue || left.buffId - right.buffId,
  );
}

function summarize(rows, eventRows, activeFactorEvidence) {
  const statusCounts = {};
  for (const row of rows) {
    const status = row.sourceStatus ?? "event-log-only";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return {
    statusCounts,
    topDamageRows: rows.slice(0, 25).map(compactRow),
    nonRecountRows: rows
      .filter((row) => row.sourceStatus !== "recount-damage-id")
      .map(compactRow),
    powerdrawRows: rows
      .filter((row) => {
        const name = `${row.displayName ?? ""} ${row.parentRecountName ?? ""}`.toLowerCase();
        return (
          name.includes("powerdraw") ||
          row.parentRecountId === 84 ||
          (row.recountRows ?? []).some((recountRow) => recountRow.recountId === 84) ||
          (row.directFactorBuffIds ?? []).includes(3053110)
        );
      })
      .map(compactRow),
    eventLogOnlyRows: eventRows
      .filter((row) => !rows.some((censusRow) => Number(censusRow.damageId) === Number(row.damageId)))
      .slice(0, 50),
    activeFactorEvidence: activeFactorEvidence.slice(0, 40),
  };
}

function writeMarkdown(report) {
  const lines = [];
  lines.push("# Latest Attribution Log Scan");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Event root: \`${eventRoot}\``);
  lines.push("");
  lines.push("## Files");
  lines.push("");
  for (const file of report.files.censusFiles) lines.push(`- Census: \`${file}\``);
  for (const file of report.files.eventFiles) lines.push(`- Event: \`${file}\``);
  lines.push("");
  lines.push("## Status Counts");
  lines.push("");
  for (const [status, count] of Object.entries(report.summary.statusCounts)) {
    lines.push(`- ${status}: ${count}`);
  }
  lines.push("");
  lines.push("## Non-Recount Rows");
  lines.push("");
  if (report.summary.nonRecountRows.length === 0) {
    lines.push("- None");
  } else {
    for (const row of report.summary.nonRecountRows) {
      lines.push(`- ${row.damageId} ${row.displayName ?? "(unnamed)"}: ${row.sourceStatus}, ${row.totalValue} damage/heal over ${row.hits} hits`);
    }
  }
  lines.push("");
  lines.push("## Powerdraw Rows");
  lines.push("");
  for (const row of report.summary.powerdrawRows) {
    lines.push(`- ${row.damageId} ${row.displayName ?? "(unnamed)"}: ${row.sourceStatus}, ${row.totalValue} damage, activeFactors=${row.activeFactorBuffIds.join(",") || "none"}`);
  }
  return lines.join("\n") + "\n";
}

function main() {
  if (!process.env.APPDATA) throw new Error("APPDATA is not set.");
  if (!fs.existsSync(eventRoot)) throw new Error(`Event log root not found: ${eventRoot}`);

  const index = buildGeneratedIndex();
  const files = findLatestFiles();
  const rows = mergeCensusRows(files.censusFiles);
  const eventRows = enrichObservedDamageIds(scanEventLogDamageIds(files.eventFiles), index);
  const activeFactorEvidence = buildActiveFactorEvidence(rows, index);
  const eventLogActiveFactors = scanEventLogActiveFactors(files.eventFiles);
  const summary = summarize(rows, eventRows, activeFactorEvidence);
  summary.eventLogActiveFactors = eventLogActiveFactors.slice(0, 40);

  const report = {
    generatedAt: new Date().toISOString(),
    eventRoot,
    files,
    censusRowCount: rows.length,
    eventLogDamageRowCount: eventRows.length,
    summary,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "latest-attribution-log-scan.json");
  const mdPath = path.join(outputDir, "latest-attribution-log-scan.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, writeMarkdown(report));

  console.log(`Scanned ${files.censusFiles.length} census files and ${files.eventFiles.length} event files.`);
  console.log(`Merged census rows: ${rows.length}`);
  console.log(`Event-log damage rows: ${eventRows.length}`);
  console.log(`Status counts: ${JSON.stringify(summary.statusCounts)}`);
  console.log(`Non-recount rows: ${summary.nonRecountRows.length}`);
  for (const row of summary.nonRecountRows.slice(0, 20)) {
    console.log(`  ${row.damageId} ${row.displayName ?? "(unnamed)"} ${row.sourceStatus} value=${row.totalValue} hits=${row.hits}`);
  }
  console.log(`Powerdraw rows: ${summary.powerdrawRows.length}`);
  for (const row of summary.powerdrawRows) {
    console.log(`  ${row.damageId} ${row.displayName ?? "(unnamed)"} ${row.sourceStatus} value=${row.totalValue} hits=${row.hits} activeFactors=${row.activeFactorBuffIds.join(",")}`);
  }
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

main();
