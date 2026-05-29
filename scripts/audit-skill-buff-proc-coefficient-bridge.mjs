#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_SURFACE_PATH = path.resolve(
  repoRoot,
  "..",
  "BPSR-UID-Extractors",
  "output",
  "probing-reports",
  "SkillCoefficientSurfaceProbe.latest4.deep.json"
);

function parseArgs(argv) {
  const options = {
    staticGaps: path.join(repoRoot, "DEV_exports", "skill-static-coefficient-gap-audit.json"),
    surface: DEFAULT_SURFACE_PATH,
    outJson: path.join(repoRoot, "DEV_exports", "skill-buff-proc-coefficient-bridge-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-buff-proc-coefficient-bridge-audit.md"),
    maxCandidates: 12,
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
      case "--static-gaps":
        options.staticGaps = path.resolve(next());
        break;
      case "--surface":
        options.surface = path.resolve(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--max-candidates":
        options.maxCandidates = Number(next());
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
  console.log(`Skill Buff/Proc Coefficient Bridge Audit

Usage:
  node scripts/audit-skill-buff-proc-coefficient-bridge.mjs [options]

Options:
  --static-gaps <path>    Static coefficient gap audit JSON.
  --surface <path>        Deep SkillCoefficientSurfaceProbe JSON.
  --out-json <path>       JSON report path.
  --out-md <path>         Markdown report path.
  --max-candidates <n>    Candidate rows per damage row. Default: 12
  --help                  Show this help.

Notes:
  Dev-only focused scan for rows whose DamageAttr link points to a buff/source
  id rather than a normal SkillEffect coefficient. This does not promote any
  coefficient into runtime.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function formatNumber(value, digits = 0) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(number);
}

function formatShort(value) {
  const number = finiteNumber(value);
  if (number === null) return "";
  const abs = Math.abs(number);
  if (abs >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return `${Math.round(number)}`;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function tableName(table) {
  return String(table?.table ?? table?.tableName ?? table?.name ?? "unknown-table");
}

function rowIds(row) {
  return new Set(
    [
      row.damageId,
      row.linkedId,
      ...asArray(row.recountNames),
      ...asArray(row.recountIds),
      ...asArray(row.blockers),
    ]
      .map(finiteNumber)
      .filter((value) => value !== null)
      .map(String)
  );
}

function compactStrings(strings) {
  return unique(
    asArray(strings)
      .map((entry) => String(entry?.text ?? ""))
      .filter((text) => text && !text.startsWith("ui/atlas/") && !text.startsWith("item_icons_"))
      .slice(0, 4)
  );
}

function compactFloatFields(floatFields) {
  return asArray(floatFields)
    .map((field) => ({
      offset: finiteNumber(field?.fieldOffset),
      value: finiteNumber(field?.value),
    }))
    .filter((field) => field.offset !== null && field.value !== null && field.value !== 0)
    .slice(0, 8);
}

function matchKinds(matches) {
  return unique(asArray(matches).flatMap((match) => asArray(match?.kinds))).join(",");
}

function matchScope(candidate, damageId, linkedId, recountIds) {
  const values = new Set(candidate.matchValues);
  const hasDamage = damageId !== null && values.has(String(damageId));
  const hasLinked = linkedId !== null && values.has(String(linkedId));
  const hasRecount = asArray(recountIds).some((id) => values.has(String(finiteNumber(id))));
  if (hasDamage && hasLinked) return "damage-and-source-link";
  if (hasDamage) return "damage-link";
  if (hasLinked) return "source-link";
  if (hasRecount) return "recount-link";
  return "other-link";
}

function scoreCandidate(candidate, damageId, linkedId) {
  let score = 0;
  const table = candidate.table;
  if (table === "BuffTable.ctb") score += 20;
  if (table === "DamageAttrTable.ctb") score += 18;
  if (table === "SkillEffectTable.ctb" || table === "SkillFightLevelTable.ctb") score += 16;
  if (table.startsWith("CTB:")) score += 10;
  if (candidate.matchValues.includes(String(damageId))) score += 8;
  if (linkedId !== null && candidate.matchValues.includes(String(linkedId))) score += 6;
  score += candidate.floatFields.length * 4;
  score += candidate.strings.length * 2;
  if (candidate.table === "ItemTable.ctb") score -= 18;
  return score;
}

function collectCandidates(surfaceReport, row, options) {
  const ids = rowIds(row);
  const damageId = finiteNumber(row.damageId);
  const linkedId = finiteNumber(row.linkedId);
  const candidates = [];

  for (const table of asArray(surfaceReport.tableReports)) {
    const name = tableName(table);
    for (const tableRow of asArray(table.rows)) {
      const matches = asArray(tableRow.matches).filter((match) => ids.has(String(finiteNumber(match?.value))));
      if (!matches.length) continue;
      const candidate = {
        table: name,
        rowIndex: finiteNumber(tableRow.rowIndex),
        absoluteOffset: finiteNumber(tableRow.absoluteOffset),
        matchValues: unique(matches.map((match) => String(finiteNumber(match?.value))).filter(Boolean)),
        matchKinds: matchKinds(matches),
        floatFields: compactFloatFields(tableRow.floatFields),
        strings: compactStrings(tableRow.strings),
      };
      candidate.matchScope = matchScope(candidate, damageId, linkedId, row.recountIds);
      candidate.score = scoreCandidate(candidate, damageId, linkedId);
      candidates.push(candidate);
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.table.localeCompare(right.table) || (left.rowIndex ?? 0) - (right.rowIndex ?? 0))
    .slice(0, options.maxCandidates);
}

function summarizeCandidates(candidates) {
  const byTable = new Map();
  for (const candidate of candidates) {
    const entry = byTable.get(candidate.table) ?? {
      table: candidate.table,
      rows: 0,
      rowsWithFloats: 0,
      rowIndexes: [],
      floatHints: new Map(),
    };
    entry.rows += 1;
    if (candidate.floatFields.length) entry.rowsWithFloats += 1;
    if (candidate.rowIndex !== null) entry.rowIndexes.push(candidate.rowIndex);
    for (const field of candidate.floatFields) {
      const rounded = Math.abs(field.value) >= 10 ? Number(field.value.toFixed(3)) : Number(field.value.toFixed(6));
      const key = `+${field.offset}=${rounded}`;
      entry.floatHints.set(key, (entry.floatHints.get(key) ?? 0) + 1);
    }
    byTable.set(candidate.table, entry);
  }

  return [...byTable.values()]
    .map((entry) => ({
      ...entry,
      rowIndexes: unique(entry.rowIndexes).slice(0, 8),
      floatHints: [...entry.floatHints.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 6)
        .map(([field, count]) => `${field} x${count}`),
    }))
    .sort((left, right) => right.rowsWithFloats - left.rowsWithFloats || right.rows - left.rows || left.table.localeCompare(right.table));
}

function verdictFor(row, candidates) {
  const hasDirectSourceIdentity = candidates.some((candidate) =>
    ["damage-and-source-link", "damage-link", "source-link"].includes(candidate.matchScope)
  );
  const directValueCandidate = candidates.some(
    (candidate) =>
      candidate.floatFields.length && ["damage-and-source-link", "damage-link", "source-link"].includes(candidate.matchScope)
  );
  const recountValueCandidate = candidates.some((candidate) => candidate.floatFields.length && candidate.matchScope === "recount-link");
  const hasSkillSurface = candidates.some(
    (candidate) => candidate.table === "SkillEffectTable.ctb" || candidate.table === "SkillFightLevelTable.ctb"
  );

  if (directValueCandidate && !hasSkillSurface) {
    return "source-linked-value-candidate";
  }
  if (hasSkillSurface && directValueCandidate) {
    return "unexpected-skill-surface-candidate";
  }
  if (hasDirectSourceIdentity && recountValueCandidate) {
    return "source-identity-plus-recount-value-candidates";
  }
  if (recountValueCandidate) {
    return "recount-value-candidates-without-source-proof";
  }
  if (hasDirectSourceIdentity) {
    return "source-identity-only";
  }
  return "no-strong-candidate";
}

function buildReport(staticGapReport, surfaceReport, options) {
  const rows = asArray(staticGapReport.rows)
    .filter((row) => row.gapClass === "buff-proc-effect-link-gap")
    .map((row) => {
      const candidates = collectCandidates(surfaceReport, row, options);
      return {
        damageId: finiteNumber(row.damageId),
        name: row.name,
        category: row.category,
        finalValue: finiteNumber(row.finalValue),
        hits: finiteNumber(row.hits),
        linkedSource: row.linkedSource,
        linkedId: finiteNumber(row.linkedId),
        gapClass: row.gapClass,
        proofGate: row.proofGate,
        verdict: verdictFor(row, candidates),
        tableSummary: summarizeCandidates(candidates),
        candidates,
      };
    })
    .sort((left, right) => (right.finalValue ?? 0) - (left.finalValue ?? 0));

  const summary = {
    rows: rows.length,
    finalDamage: rows.reduce((sum, row) => sum + (row.finalValue ?? 0), 0),
    hits: rows.reduce((sum, row) => sum + (row.hits ?? 0), 0),
    byVerdict: Object.fromEntries(
      [...rows.reduce((map, row) => map.set(row.verdict, (map.get(row.verdict) ?? 0) + 1), new Map()).entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      )
    ),
  };

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      staticGaps: options.staticGaps,
      surface: options.surface,
    },
    semantics: {
      boundary: "dev-only audit; no parser/runtime contribution calculation",
      finalDamageAnchor: "observed packet final damage remains the truth source",
      purpose: "find candidate static tables for buff/proc emitted damage rows that lack SkillEffect coefficient links",
    },
    summary,
    rows,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Skill Buff/Proc Coefficient Bridge Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Rows: ${formatNumber(report.summary.rows)}`,
    `- Final damage covered: ${formatNumber(report.summary.finalDamage)}`,
    `- Hits covered: ${formatNumber(report.summary.hits)}`,
    "",
    markdownTable(
      ["Verdict", "Rows"],
      Object.entries(report.summary.byVerdict).map(([verdict, count]) => [verdict, count])
    ),
    "",
    "## Buff/Proc Rows",
    "",
    markdownTable(
      ["Damage", "Name", "Final", "Hits", "Source Link", "Verdict", "Candidate Tables"],
      report.rows.map((row) => [
        row.damageId,
        row.name,
        formatShort(row.finalValue),
        formatNumber(row.hits),
        `${row.linkedSource}:${row.linkedId}`,
        row.verdict,
        row.tableSummary.map((entry) => `${entry.table} rows=${entry.rows} floats=${entry.rowsWithFloats} ${entry.floatHints.join("; ")}`).join("; "),
      ])
    ),
    "",
    "## Top Candidate Rows",
    "",
  ];

  for (const row of report.rows) {
    lines.push(`### ${row.name} (${row.damageId})`, "");
    lines.push(
      markdownTable(
        ["Table", "Row", "Scope", "Matches", "Kinds", "Floats", "Strings", "Score"],
        row.candidates.map((candidate) => [
          candidate.table,
          candidate.rowIndex,
          candidate.matchScope,
          candidate.matchValues.join(", "),
          candidate.matchKinds,
          candidate.floatFields.map((field) => `+${field.offset}=${field.value}`).join("; "),
          candidate.strings.join("; "),
          candidate.score,
        ])
      ),
      ""
    );
  }

  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const staticGapReport = readJson(options.staticGaps);
  const surfaceReport = readJson(options.surface);
  const report = buildReport(staticGapReport, surfaceReport, options);

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Rows: ${report.summary.rows}`);
  console.log(`Verdicts: ${Object.entries(report.summary.byVerdict).map(([name, count]) => `${name}=${count}`).join(", ")}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
