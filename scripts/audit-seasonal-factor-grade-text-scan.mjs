#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_FILES = 40;
const DEFAULT_OUT_JSON = "DEV_exports/seasonal-factor-grade-text-scan-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/seasonal-factor-grade-text-scan-audit.md";
const FACTOR_CANDIDATES = [
  "../BPSR-UID-Extractors/output/SeasonPhantomFactors.json",
  "parser-data/generated/SeasonPhantomFactors.json",
];

function usage() {
  return `Usage: node scripts/audit-seasonal-factor-grade-text-scan.mjs [options]

Options:
  --input <path>    Event logger file to scan. Repeatable.
  --root <path>     Event logger root to scan. Repeatable. Defaults to AppData EventLogs.
  --latest <n>      Number of latest event files to scan. Default: ${DEFAULT_LATEST_FILES}
  --factors <path>  SeasonPhantomFactors.json path.
  --out-json <p>    JSON output path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>   Markdown output path. Default: ${DEFAULT_OUT_MD}
`;
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    roots: [],
    latest: DEFAULT_LATEST_FILES,
    factors: null,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--input") {
      options.inputs.push(next());
    } else if (arg === "--root") {
      options.roots.push(next());
    } else if (arg === "--latest") {
      options.latest = Math.max(1, Number(next()) || DEFAULT_LATEST_FILES);
    } else if (arg === "--factors") {
      options.factors = next();
    } else if (arg === "--out-json") {
      options.outJson = next();
    } else if (arg === "--out-md") {
      options.outMd = next();
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
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, options.latest)
    .map((entry) => entry.filePath);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function increment(map, key, amount = 1) {
  const stringKey = String(key);
  map.set(stringKey, (map.get(stringKey) ?? 0) + amount);
}

function topMap(map, limit = 30) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { numeric: true }))
    .slice(0, limit)
    .map(([id, count]) => ({ id, count }));
}

function loadFactorCatalog(filePath) {
  const resolved = filePath ? resolveRepoPath(filePath) : firstExisting(FACTOR_CANDIDATES);
  const payload = resolved && fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, "utf8")) : {};
  const factorByBuffId = new Map();
  const gradeItemById = new Map();

  for (const [buffIdText, factor] of Object.entries(payload.factorsByBuffId ?? {})) {
    const factorBuffId = finiteNumber(buffIdText);
    if (factorBuffId === null) continue;
    const familyName = factor.familyNames?.en ?? factor.familyName ?? `seasonal-factor:${factorBuffId}`;
    factorByBuffId.set(String(factorBuffId), {
      factorBuffId,
      familyName,
      familyId: finiteNumber(factor.familyId),
    });
    for (const row of factor.modifierEvidence?.gradeRows ?? []) {
      const itemId = finiteNumber(row.itemId);
      if (itemId === null) continue;
      gradeItemById.set(String(itemId), {
        itemId,
        factorBuffId,
        familyName,
        grade: finiteNumber(row.grade),
        valueTexts: Array.isArray(row.valueTexts) ? row.valueTexts : [],
      });
    }
  }

  return { path: resolved, factorByBuffId, gradeItemById };
}

function decorateFactorMatch(match, catalog) {
  const factor = catalog.factorByBuffId.get(String(match.id));
  return {
    ...match,
    familyName: factor?.familyName ?? "",
  };
}

function decorateGradeMatch(match, catalog) {
  const item = catalog.gradeItemById.get(String(match.id));
  return {
    ...match,
    factorBuffId: item?.factorBuffId ?? null,
    familyName: item?.familyName ?? "",
    grade: item?.grade ?? null,
    valueTexts: item?.valueTexts ?? [],
  };
}

function classifyGradeContext(context) {
  const text = String(context ?? "");
  if (/(?:critTotalValue|crit_total_value|totalValue|total_value|summary\\": \\"total=|total=|\\\"value\\": \\\")/i.test(text)) {
    return "numeric-damage-total-collision";
  }
  if (/(?:item|config|factor|buff|package|unlock|chosen|selected|grade|season)/i.test(text)) {
    return "identifier-like-context";
  }
  return "unclassified-context";
}

async function scanFile(filePath, catalog) {
  const stat = fs.statSync(filePath);
  const factorCounts = new Map();
  const gradeItemCounts = new Map();
  const gradeItemContexts = [];
  const tokenRegex = /\b(?:305\d{4}|2001\d{4}|2002\d{4})\b/g;
  let tail = "";
  let chunks = 0;
  let bytesSeen = 0;

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
    stream.on("data", (chunk) => {
      chunks += 1;
      const chunkStartOffset = Math.max(0, bytesSeen - tail.length);
      const text = `${tail}${chunk}`;
      bytesSeen += Buffer.byteLength(chunk, "utf8");
      tail = text.slice(-16);
      tokenRegex.lastIndex = 0;
      let match;
      while ((match = tokenRegex.exec(text)) !== null) {
        const token = match[0];
        if (catalog.factorByBuffId.has(token)) increment(factorCounts, token);
        if (catalog.gradeItemById.has(token)) {
          increment(gradeItemCounts, token);
          if (gradeItemContexts.length < 24) {
            const item = catalog.gradeItemById.get(token);
            const start = Math.max(0, match.index - 220);
            const end = Math.min(text.length, match.index + token.length + 220);
            gradeItemContexts.push({
              id: token,
              offset: chunkStartOffset + match.index,
              factorBuffId: item?.factorBuffId ?? null,
              familyName: item?.familyName ?? "",
              grade: item?.grade ?? null,
              valueTexts: item?.valueTexts ?? [],
              context: text
                .slice(start, end)
                .replace(/\s+/g, " ")
                .slice(0, 520),
            });
            const last = gradeItemContexts[gradeItemContexts.length - 1];
            last.contextClassification = classifyGradeContext(last.context);
          }
        }
      }
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return {
    file: filePath,
    compactFile: compactPath(filePath),
    bytes: stat.size,
    chunks,
    factorMatches: [...factorCounts.values()].reduce((sum, value) => sum + value, 0),
    gradeItemMatches: [...gradeItemCounts.values()].reduce((sum, value) => sum + value, 0),
    identifierLikeGradeItemMatches: gradeItemContexts.filter(
      (context) => context.contextClassification === "identifier-like-context",
    ).length,
    numericCollisionGradeItemMatches: gradeItemContexts.filter(
      (context) => context.contextClassification === "numeric-damage-total-collision",
    ).length,
    topFactorIds: topMap(factorCounts, 20).map((row) => decorateFactorMatch(row, catalog)),
    topGradeItemIds: topMap(gradeItemCounts, 20).map((row) => decorateGradeMatch(row, catalog)),
    gradeItemContexts,
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

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function formatList(values, limit = 8) {
  const list = Array.isArray(values) ? values.filter((value) => value !== null && value !== undefined && value !== "") : [];
  if (!list.length) return "-";
  const head = list.slice(0, limit).map(String);
  return list.length > limit ? `${head.join(", ")}, +${list.length - limit}` : head.join(", ");
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Seasonal Factor Grade Text Scan", "");
  lines.push("- dev-only text scan: no parser/live DPS/recount/monitor behavior is changed");
  lines.push("- purpose: search large event logs for selected seasonal factor grade item ids without parsing the full JSON payload");
  lines.push(`- generated at: ${report.generatedAt}`);
  lines.push(`- factor catalog: ${report.inputs.factorsJson}`, "");
  lines.push("## Summary", "");
  lines.push(markdownTable(
    ["Metric", "Value"],
    [
      ["Files scanned", formatNumber(report.summary.files)],
      ["Bytes scanned", formatNumber(report.summary.bytes)],
      ["Factor id matches", formatNumber(report.summary.factorMatches)],
      ["Grade item id matches", formatNumber(report.summary.gradeItemMatches)],
      ["Identifier-like grade item hits", formatNumber(report.summary.identifierLikeGradeItemMatches)],
      ["Numeric collision grade item hits", formatNumber(report.summary.numericCollisionGradeItemMatches)],
      ["Files with grade item ids", formatNumber(report.summary.filesWithGradeItemMatches)],
    ],
  ));
  lines.push("## Files", "");
  lines.push(markdownTable(
    ["File", "Bytes", "Factor Matches", "Grade Item Matches", "Identifier-like", "Numeric Collisions", "Top Factors", "Top Grade Items"],
    report.files.map((file) => [
      file.compactFile,
      formatNumber(file.bytes),
      formatNumber(file.factorMatches),
      formatNumber(file.gradeItemMatches),
      formatNumber(file.identifierLikeGradeItemMatches),
      formatNumber(file.numericCollisionGradeItemMatches),
      formatList(file.topFactorIds.map((row) => `${row.familyName || row.id} x${row.count}`), 5),
      formatList(
        file.topGradeItemIds.map(
          (row) => `${row.familyName || row.id} G${row.grade ?? "?"} ${formatList(row.valueTexts, 2)} x${row.count}`,
        ),
        5,
      ),
    ]),
  ));
  lines.push("## Global Grade Item Matches", "");
  lines.push(markdownTable(
    ["Item ID", "Factor", "Grade", "Values", "Count"],
    report.globalGradeItemIds.map((row) => [
      row.id,
      row.familyName,
      row.grade ?? "-",
      formatList(row.valueTexts, 4),
      formatNumber(row.count),
    ]),
  ));
  lines.push("## Global Factor ID Matches", "");
  lines.push(markdownTable(
    ["Factor ID", "Factor", "Count"],
    report.globalFactorIds.map((row) => [row.id, row.familyName, formatNumber(row.count)]),
  ));
  const contexts = report.files.flatMap((file) =>
    file.gradeItemContexts.map((context) => ({
      ...context,
      file: file.compactFile,
    })),
  );
  if (contexts.length) {
    lines.push("## Grade Item Contexts", "");
    lines.push(markdownTable(
      ["File", "Offset", "Item ID", "Factor", "Grade", "Values", "Classification", "Context"],
      contexts.map((row) => [
        row.file,
        formatNumber(row.offset),
        row.id,
        row.familyName,
        row.grade ?? "-",
        formatList(row.valueTexts, 3),
        row.contextClassification,
        row.context,
      ]),
    ));
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadFactorCatalog(options.factors);
  const files = collectInputFiles(options);
  const scanned = [];
  const factorCounts = new Map();
  const gradeItemCounts = new Map();
  for (const filePath of files) {
    const row = await scanFile(filePath, catalog);
    scanned.push(row);
    for (const match of row.topFactorIds) increment(factorCounts, match.id, match.count);
    for (const match of row.topGradeItemIds) increment(gradeItemCounts, match.id, match.count);
  }

  const report = {
    source: "scripts/audit-seasonal-factor-grade-text-scan.mjs",
    generatedAt: new Date().toISOString(),
    inputs: {
      factorsJson: compactPath(catalog.path),
      eventFiles: files.map(compactPath),
    },
    summary: {
      files: scanned.length,
      bytes: scanned.reduce((sum, row) => sum + row.bytes, 0),
      factorMatches: scanned.reduce((sum, row) => sum + row.factorMatches, 0),
      gradeItemMatches: scanned.reduce((sum, row) => sum + row.gradeItemMatches, 0),
      identifierLikeGradeItemMatches: scanned.reduce((sum, row) => sum + row.identifierLikeGradeItemMatches, 0),
      numericCollisionGradeItemMatches: scanned.reduce((sum, row) => sum + row.numericCollisionGradeItemMatches, 0),
      filesWithGradeItemMatches: scanned.filter((row) => row.gradeItemMatches > 0).length,
    },
    files: scanned,
    globalFactorIds: topMap(factorCounts, 60).map((row) => decorateFactorMatch(row, catalog)),
    globalGradeItemIds: topMap(gradeItemCounts, 60).map((row) => decorateGradeMatch(row, catalog)),
  };

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));
  console.log(
    [
      `Wrote ${options.outJson}`,
      `Files scanned: ${report.summary.files}`,
      `Bytes scanned: ${report.summary.bytes}`,
      `Factor id matches: ${report.summary.factorMatches}`,
      `Grade item id matches: ${report.summary.gradeItemMatches}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
