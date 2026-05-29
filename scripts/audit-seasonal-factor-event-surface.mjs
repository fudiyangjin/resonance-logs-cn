#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_FILES = 40;
const DEFAULT_MAX_BYTES = 160 * 1024 * 1024;
const DEFAULT_OUT_JSON = "DEV_exports/seasonal-factor-event-surface-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/seasonal-factor-event-surface-audit.md";
const FACTOR_CANDIDATES = [
  "../BPSR-UID-Extractors/output/SeasonPhantomFactors.json",
  "parser-data/generated/SeasonPhantomFactors.json",
];

function parseArgs(argv) {
  const options = {
    inputs: [],
    roots: [],
    latest: DEFAULT_LATEST_FILES,
    maxBytes: DEFAULT_MAX_BYTES,
    factors: null,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--input") {
      options.inputs.push(next());
    } else if (arg === "--root") {
      options.roots.push(next());
    } else if (arg === "--latest") {
      options.latest = Math.max(1, Number(next()) || DEFAULT_LATEST_FILES);
    } else if (arg === "--max-bytes") {
      options.maxBytes = Math.max(0, Number(next()) || DEFAULT_MAX_BYTES);
    } else if (arg === "--factors") {
      options.factors = next();
    } else if (arg === "--out-json") {
      options.outJson = next();
    } else if (arg === "--out-md") {
      options.outMd = next();
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/audit-seasonal-factor-event-surface.mjs [options]

Options:
  --input <path>       Event logger file to scan. Repeatable.
  --root <path>        Event logger root to scan. Repeatable. Defaults to AppData EventLogs.
  --latest <n>         Number of latest event files to scan. Default: ${DEFAULT_LATEST_FILES}
  --max-bytes <n>      Skip files larger than this. Default: ${DEFAULT_MAX_BYTES}
  --factors <path>     SeasonPhantomFactors.json path.
  --out-json <path>    JSON output path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>      Markdown output path. Default: ${DEFAULT_OUT_MD}
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveRepoPath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function compactPath(filePath) {
  if (!filePath) return "";
  const relative = path.relative(repoRoot, filePath);
  return relative && !relative.startsWith("..") ? relative.replaceAll(path.sep, "/") : filePath;
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, value, "utf8");
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    const resolved = resolveRepoPath(candidate);
    if (resolved && fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function defaultRoots() {
  const roots = [];
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, "com.resonance-logs-global", "EventLogs"));
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, "com.resonance-logs-global", "EventLogs"));
  return roots;
}

function collectJsonFiles(inputPath, out) {
  if (!inputPath || !fs.existsSync(inputPath)) return;
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    if (inputPath.toLowerCase().endsWith(".json")) out.push(inputPath);
    return;
  }
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
    const child = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(child, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      out.push(child);
    }
  }
}

function collectInputFiles(options) {
  if (options.inputs.length) return options.inputs.map(resolveRepoPath).filter(Boolean);
  const files = [];
  const roots = options.roots.length ? options.roots.map(resolveRepoPath) : defaultRoots();
  for (const root of roots) collectJsonFiles(root, files);
  return files
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .slice(0, options.latest);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function seasonalId(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 3_050_000 && number < 3_060_000 ? number : null;
}

function bump(map, key, amount = 1) {
  map.set(String(key), (map.get(String(key)) ?? 0) + amount);
}

function topMap(map, limit = 40) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function loadFactorCatalog(filePath) {
  const resolved = filePath ? resolveRepoPath(filePath) : firstExisting(FACTOR_CANDIDATES);
  const payload = resolved && fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, "utf8")) : {};
  const factorByBuffId = new Map();
  const factorByGradeItemId = new Map();

  for (const [buffIdText, factor] of Object.entries(payload.factorsByBuffId ?? {})) {
    const buffId = Number(buffIdText);
    if (!Number.isFinite(buffId)) continue;
    const familyName = factor.familyNames?.en ?? factor.familyName ?? `factor:${buffId}`;
    factorByBuffId.set(String(buffId), {
      factorBuffId: buffId,
      familyName,
      familyId: factor.familyId ?? null,
    });
    for (const row of factor.modifierEvidence?.gradeRows ?? []) {
      const itemId = finiteNumber(row.itemId);
      if (itemId === null) continue;
      factorByGradeItemId.set(String(itemId), {
        factorBuffId: buffId,
        familyName,
        grade: finiteNumber(row.grade),
        itemId,
        valueTexts: Array.isArray(row.valueTexts) ? row.valueTexts : [],
      });
    }
  }

  return { path: resolved, factorByBuffId, factorByGradeItemId };
}

function shouldParseRaw(raw) {
  if (!raw || typeof raw !== "string") return false;
  return raw.includes("305") || raw.includes("2001") || raw.includes("2002") || raw.includes("activeFactor");
}

function normalizePath(parts) {
  return parts.map((part) => (typeof part === "number" ? "[]" : part)).join(".");
}

function isLikelyIdentifierPath(fieldPath) {
  return /(?:id|config|source|base|buff|factor|item|candidate|family|needle)/i.test(fieldPath);
}

function walk(value, parts, visit, depth = 0) {
  if (depth > 16 || value === null || value === undefined) return;
  if (typeof value === "number" || typeof value === "string") {
    visit(value, normalizePath(parts));
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      walk(value[index], [...parts, index], visit, depth + 1);
    }
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walk(child, [...parts, key], visit, depth + 1);
    }
  }
}

function scanRawObject(raw, catalog) {
  const seasonalPathCounts = new Map();
  const gradeItemPathCounts = new Map();
  const looseGradeItemPathCounts = new Map();
  const seasonalIdCounts = new Map();
  const gradeItemCounts = new Map();
  const looseGradeItemCounts = new Map();
  const seasonalLabels = new Map();
  const gradeItemLabels = new Map();
  const looseGradeItemLabels = new Map();
  let seasonalMatches = 0;
  let gradeItemMatches = 0;
  let looseGradeItemMatches = 0;

  walk(raw, [], (value, fieldPath) => {
    const number = finiteNumber(value);
    if (number !== null && catalog.factorByGradeItemId.has(String(number))) {
      looseGradeItemMatches += 1;
      bump(looseGradeItemPathCounts, fieldPath);
      bump(looseGradeItemCounts, number);
      const item = catalog.factorByGradeItemId.get(String(number));
      looseGradeItemLabels.set(String(number), `${item.familyName} G${item.grade ?? "?"}`);
    }

    if (!isLikelyIdentifierPath(fieldPath)) return;

    const sid = seasonalId(value);
    if (sid !== null) {
      seasonalMatches += 1;
      bump(seasonalPathCounts, fieldPath);
      bump(seasonalIdCounts, sid);
      const factor = catalog.factorByBuffId.get(String(sid));
      if (factor) seasonalLabels.set(String(sid), factor.familyName);
    }

    if (number !== null && catalog.factorByGradeItemId.has(String(number))) {
      gradeItemMatches += 1;
      bump(gradeItemPathCounts, fieldPath);
      bump(gradeItemCounts, number);
      const item = catalog.factorByGradeItemId.get(String(number));
      gradeItemLabels.set(String(number), `${item.familyName} G${item.grade ?? "?"}`);
    }
  });

  return {
    seasonalMatches,
    gradeItemMatches,
    looseGradeItemMatches,
    seasonalPathCounts,
    gradeItemPathCounts,
    looseGradeItemPathCounts,
    seasonalIdCounts,
    gradeItemCounts,
    looseGradeItemCounts,
    seasonalLabels,
    gradeItemLabels,
    looseGradeItemLabels,
  };
}

function mergeScan(target, scan) {
  target.seasonalMatches += scan.seasonalMatches;
  target.gradeItemMatches += scan.gradeItemMatches;
  target.looseGradeItemMatches += scan.looseGradeItemMatches;
  for (const [key, count] of scan.seasonalPathCounts) bump(target.seasonalPathCounts, key, count);
  for (const [key, count] of scan.gradeItemPathCounts) bump(target.gradeItemPathCounts, key, count);
  for (const [key, count] of scan.looseGradeItemPathCounts) bump(target.looseGradeItemPathCounts, key, count);
  for (const [key, count] of scan.seasonalIdCounts) bump(target.seasonalIdCounts, key, count);
  for (const [key, count] of scan.gradeItemCounts) bump(target.gradeItemCounts, key, count);
  for (const [key, count] of scan.looseGradeItemCounts) bump(target.looseGradeItemCounts, key, count);
  for (const [key, value] of scan.seasonalLabels) target.seasonalLabels.set(key, value);
  for (const [key, value] of scan.gradeItemLabels) target.gradeItemLabels.set(key, value);
  for (const [key, value] of scan.looseGradeItemLabels) target.looseGradeItemLabels.set(key, value);
}

function emptyAggregate() {
  return {
    seasonalMatches: 0,
    gradeItemMatches: 0,
    looseGradeItemMatches: 0,
    seasonalPathCounts: new Map(),
    gradeItemPathCounts: new Map(),
    looseGradeItemPathCounts: new Map(),
    seasonalIdCounts: new Map(),
    gradeItemCounts: new Map(),
    looseGradeItemCounts: new Map(),
    seasonalLabels: new Map(),
    gradeItemLabels: new Map(),
    looseGradeItemLabels: new Map(),
  };
}

function scanEventFile(filePath, options, catalog) {
  const stat = fs.statSync(filePath);
  if (options.maxBytes > 0 && stat.size > options.maxBytes) {
    return {
      file: filePath,
      status: "skipped-too-large",
      bytes: stat.size,
      entries: 0,
      rawCandidates: 0,
      rawParsed: 0,
      rawParseFailed: 0,
      seasonalMatches: 0,
      gradeItemMatches: 0,
      looseGradeItemMatches: 0,
      seasonalPaths: [],
      gradeItemPaths: [],
      looseGradeItemPaths: [],
      seasonalIds: [],
      gradeItemIds: [],
      looseGradeItemIds: [],
    };
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      file: filePath,
      status: `parse-failed: ${error.message}`,
      bytes: stat.size,
      entries: 0,
      rawCandidates: 0,
      rawParsed: 0,
      rawParseFailed: 0,
      seasonalMatches: 0,
      gradeItemMatches: 0,
      looseGradeItemMatches: 0,
      seasonalPaths: [],
      gradeItemPaths: [],
      looseGradeItemPaths: [],
      seasonalIds: [],
      gradeItemIds: [],
      looseGradeItemIds: [],
    };
  }

  const aggregate = emptyAggregate();
  let rawCandidates = 0;
  let rawParsed = 0;
  let rawParseFailed = 0;
  for (const entry of payload.entries ?? []) {
    const rawText = entry.raw;
    if (!shouldParseRaw(rawText)) continue;
    rawCandidates += 1;
    let raw;
    try {
      raw = JSON.parse(rawText);
    } catch {
      rawParseFailed += 1;
      continue;
    }
    rawParsed += 1;
    const scan = scanRawObject(raw, catalog);
    mergeScan(aggregate, scan);
  }

  return {
    file: filePath,
    status: "scanned",
    bytes: stat.size,
    entries: Array.isArray(payload.entries) ? payload.entries.length : 0,
    rawCandidates,
    rawParsed,
    rawParseFailed,
    seasonalMatches: aggregate.seasonalMatches,
    gradeItemMatches: aggregate.gradeItemMatches,
    looseGradeItemMatches: aggregate.looseGradeItemMatches,
    seasonalPaths: topMap(aggregate.seasonalPathCounts),
    gradeItemPaths: topMap(aggregate.gradeItemPathCounts),
    looseGradeItemPaths: topMap(aggregate.looseGradeItemPathCounts),
    seasonalIds: topMap(aggregate.seasonalIdCounts).map((row) => ({
      ...row,
      label: aggregate.seasonalLabels.get(row.key) ?? "",
    })),
    gradeItemIds: topMap(aggregate.gradeItemCounts).map((row) => ({
      ...row,
      label: aggregate.gradeItemLabels.get(row.key) ?? "",
    })),
    looseGradeItemIds: topMap(aggregate.looseGradeItemCounts).map((row) => ({
      ...row,
      label: aggregate.looseGradeItemLabels.get(row.key) ?? "",
    })),
  };
}

function markdownTable(headers, rows) {
  const escapeCell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    "",
  ].join("\n");
}

function formatList(values, limit = 8) {
  const list = Array.isArray(values) ? values.filter((value) => value !== null && value !== undefined && value !== "") : [];
  if (!list.length) return "-";
  const head = list.slice(0, limit).map(String);
  return list.length > limit ? `${head.join(", ")}, +${list.length - limit}` : head.join(", ");
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Seasonal Factor Event Surface Audit", "");
  lines.push("- dev-only audit: no parser/live DPS/recount/monitor behavior is changed");
  lines.push(`- generated at: ${report.generatedAt}`);
  lines.push(`- factor catalog: ${compactPath(report.factorCatalogPath)}`);
  lines.push("");
  lines.push("## Summary", "");
  for (const [key, value] of Object.entries(report.summary)) lines.push(`- ${key}: ${value}`);
  lines.push("");
  lines.push(
    "Interpretation: seasonal factor buff IDs prove active factor identity; grade item IDs are the stronger clue for selected ladder grade. Paths here show what the existing event logger already captured.",
    "",
  );

  lines.push("## File Summary", "");
  lines.push(
    markdownTable(
      ["File", "Status", "Bytes", "Entries", "Raw parsed", "Seasonal matches", "Grade item matches", "Loose grade item matches", "Top seasonal paths", "Top grade paths"],
      report.files.map((row) => [
        compactPath(row.file),
        row.status,
        row.bytes,
        row.entries,
        row.rawParsed,
        row.seasonalMatches,
        row.gradeItemMatches,
        row.looseGradeItemMatches,
        formatList(row.seasonalPaths.map((pathRow) => `${pathRow.key}:${pathRow.count}`), 4),
        formatList([
          ...row.gradeItemPaths.map((pathRow) => `${pathRow.key}:${pathRow.count}`),
          ...row.looseGradeItemPaths.map((pathRow) => `loose:${pathRow.key}:${pathRow.count}`),
        ], 4),
      ]),
    ),
  );

  lines.push("## Global Paths", "");
  lines.push(
    markdownTable(
      ["Type", "Path", "Count"],
      [
        ...report.globalSeasonalPaths.map((row) => ["seasonal-id", row.key, row.count]),
        ...report.globalGradeItemPaths.map((row) => ["grade-item-id", row.key, row.count]),
        ...report.globalLooseGradeItemPaths.map((row) => ["loose-grade-item-id", row.key, row.count]),
      ].slice(0, 80),
    ),
  );

  lines.push("## Global IDs", "");
  lines.push(
    markdownTable(
      ["Type", "ID", "Count", "Label"],
      [
        ...report.globalSeasonalIds.map((row) => ["seasonal-id", row.key, row.count, row.label]),
        ...report.globalGradeItemIds.map((row) => ["grade-item-id", row.key, row.count, row.label]),
        ...report.globalLooseGradeItemIds.map((row) => ["loose-grade-item-id", row.key, row.count, row.label]),
      ].slice(0, 80),
    ),
  );

  lines.push(
    "## Next Evidence Boundary",
    "",
    "- If grade item IDs only appear under ownership/current surfaces, they are not historical selected-loadout proof.",
    "- If event logger snapshots show active factor IDs but no grade item IDs, the selected grade must be captured from another packet/container surface before contribution math can use ladder values.",
    "",
  );
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadFactorCatalog(options.factors);
  const files = collectInputFiles(options);
  const scanned = files.map((filePath) => scanEventFile(filePath, options, catalog));
  const aggregate = emptyAggregate();
  for (const file of scanned) {
    for (const row of file.seasonalPaths ?? []) bump(aggregate.seasonalPathCounts, row.key, row.count);
    for (const row of file.gradeItemPaths ?? []) bump(aggregate.gradeItemPathCounts, row.key, row.count);
    for (const row of file.looseGradeItemPaths ?? []) bump(aggregate.looseGradeItemPathCounts, row.key, row.count);
    for (const row of file.seasonalIds ?? []) {
      bump(aggregate.seasonalIdCounts, row.key, row.count);
      if (row.label) aggregate.seasonalLabels.set(row.key, row.label);
    }
    for (const row of file.gradeItemIds ?? []) {
      bump(aggregate.gradeItemCounts, row.key, row.count);
      if (row.label) aggregate.gradeItemLabels.set(row.key, row.label);
    }
    for (const row of file.looseGradeItemIds ?? []) {
      bump(aggregate.looseGradeItemCounts, row.key, row.count);
      if (row.label) aggregate.looseGradeItemLabels.set(row.key, row.label);
    }
  }

  const report = {
    source: "audit-seasonal-factor-event-surface",
    host: os.hostname(),
    generatedAt: new Date().toISOString(),
    factorCatalogPath: catalog.path,
    options: {
      inputs: files.map(compactPath),
      latest: options.latest,
      maxBytes: options.maxBytes,
    },
    summary: {
      files: scanned.length,
      filesScanned: scanned.filter((row) => row.status === "scanned").length,
      filesSkippedTooLarge: scanned.filter((row) => row.status === "skipped-too-large").length,
      entries: scanned.reduce((sum, row) => sum + row.entries, 0),
      rawCandidates: scanned.reduce((sum, row) => sum + row.rawCandidates, 0),
      rawParsed: scanned.reduce((sum, row) => sum + row.rawParsed, 0),
      rawParseFailed: scanned.reduce((sum, row) => sum + row.rawParseFailed, 0),
      seasonalMatches: scanned.reduce((sum, row) => sum + row.seasonalMatches, 0),
      gradeItemMatches: scanned.reduce((sum, row) => sum + row.gradeItemMatches, 0),
      looseGradeItemMatches: scanned.reduce((sum, row) => sum + row.looseGradeItemMatches, 0),
    },
    files: scanned,
    globalSeasonalPaths: topMap(aggregate.seasonalPathCounts, 80),
    globalGradeItemPaths: topMap(aggregate.gradeItemPathCounts, 80),
    globalLooseGradeItemPaths: topMap(aggregate.looseGradeItemPathCounts, 80),
    globalSeasonalIds: topMap(aggregate.seasonalIdCounts, 80).map((row) => ({
      ...row,
      label: aggregate.seasonalLabels.get(row.key) ?? "",
    })),
    globalGradeItemIds: topMap(aggregate.gradeItemCounts, 80).map((row) => ({
      ...row,
      label: aggregate.gradeItemLabels.get(row.key) ?? "",
    })),
    globalLooseGradeItemIds: topMap(aggregate.looseGradeItemCounts, 80).map((row) => ({
      ...row,
      label: aggregate.looseGradeItemLabels.get(row.key) ?? "",
    })),
  };

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));
  console.log(`wrote ${options.outJson} and ${options.outMd}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
