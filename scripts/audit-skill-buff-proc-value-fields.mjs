#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    buffProc: path.join(repoRoot, "DEV_exports", "skill-buff-proc-coefficient-bridge-audit.json"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-buff-proc-value-field-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-buff-proc-value-field-audit.md"),
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
      case "--buff-proc":
        options.buffProc = path.resolve(next());
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
  console.log(`Skill Buff/Proc Value Field Audit

Usage:
  node scripts/audit-skill-buff-proc-value-fields.mjs [options]

Notes:
  Dev-only drilldown for buff/proc rows. It separates strict source-linked
  numeric fields from weak recount-only numeric collisions.
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

function fieldKey(candidate, field) {
  const value = finiteNumber(field.value);
  const rounded = value === null ? "" : Math.abs(value) >= 10 ? value.toFixed(3) : value.toFixed(6);
  return `${candidate.table}+${field.offset ?? field.fieldOffset}=${rounded}`;
}

function groupFields(candidates, predicate) {
  const groups = new Map();
  for (const candidate of asArray(candidates).filter(predicate)) {
    for (const field of asArray(candidate.floatFields)) {
      const key = fieldKey(candidate, field);
      const group = groups.get(key) ?? {
        table: candidate.table,
        offset: field.offset ?? field.fieldOffset,
        value: finiteNumber(field.value),
        rows: 0,
        matchScopes: new Set(),
        rowIndexes: new Set(),
        strings: new Set(),
      };
      group.rows += 1;
      group.matchScopes.add(candidate.matchScope);
      if (candidate.rowIndex !== null && candidate.rowIndex !== undefined) group.rowIndexes.add(candidate.rowIndex);
      for (const text of asArray(candidate.strings)) group.strings.add(String(text));
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      table: group.table,
      offset: group.offset,
      value: group.value,
      rows: group.rows,
      matchScopes: [...group.matchScopes],
      rowIndexes: [...group.rowIndexes].slice(0, 8),
      strings: [...group.strings].slice(0, 4),
    }))
    .sort((left, right) => right.rows - left.rows || String(left.table).localeCompare(String(right.table)));
}

function verdictFor(row) {
  if (row.strictSourceLinkedFields.length) return "strict-source-linked-value-field";
  if (row.sourceLinkedFields.length) return "source-linked-value-field-candidate";
  if (row.damageLinkedFields.length) return "damage-linked-value-field-candidate";
  if (row.weakRecountFields.length) return "weak-recount-value-candidate";
  return "identity-only-no-value-field";
}

function buildReport(buffProc, options) {
  const rows = asArray(buffProc.rows).map((row) => {
    const candidates = asArray(row.candidates);
    const strictSourceLinkedFields = groupFields(
      candidates,
      (candidate) => candidate.matchScope === "damage-and-source-link"
    );
    const sourceLinkedFields = groupFields(candidates, (candidate) => candidate.matchScope === "source-link");
    const damageLinkedFields = groupFields(candidates, (candidate) => candidate.matchScope === "damage-link");
    const weakRecountFields = groupFields(candidates, (candidate) => candidate.matchScope === "recount-link");
    const identityRows = candidates.filter((candidate) =>
      ["damage-and-source-link", "source-link", "damage-link"].includes(candidate.matchScope)
    );
    const result = {
      damageId: String(row.damageId),
      name: row.name,
      finalValue: row.finalValue,
      hits: row.hits,
      linkedSource: row.linkedSource,
      linkedId: row.linkedId,
      originalVerdict: row.verdict,
      identityRows: identityRows.length,
      strictSourceLinkedFields,
      sourceLinkedFields,
      damageLinkedFields,
      weakRecountFields,
      nextStep: "do not promote until a value field is tied to damage id and source id or independently reconstructs packet totals",
    };
    result.verdict = verdictFor(result);
    return result;
  });

  const byVerdict = {};
  for (const row of rows) byVerdict[row.verdict] = (byVerdict[row.verdict] ?? 0) + 1;

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      buffProc: options.buffProc,
    },
    semantics: {
      boundary: "dev-only buff/proc value field drilldown; no runtime coefficient promotion",
      strictPromotionGate: "value must be linked to both emitted damage id and source id, or validated by formula replay against packet final damage",
      weakRecountWarning: "recount-only numeric collisions are evidence, not coefficients",
    },
    summary: {
      rows: rows.length,
      finalDamage: rows.reduce((sum, row) => sum + (finiteNumber(row.finalValue) ?? 0), 0),
      hits: rows.reduce((sum, row) => sum + (finiteNumber(row.hits) ?? 0), 0),
      strictSourceLinkedRows: rows.filter((row) => row.strictSourceLinkedFields.length).length,
      sourceLinkedValueRows: rows.filter((row) => row.sourceLinkedFields.length).length,
      weakRecountValueRows: rows.filter((row) => row.weakRecountFields.length).length,
      byVerdict,
    },
    rows,
  };
}

function renderMarkdown(report) {
  return [
    "# Skill Buff/Proc Value Field Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Rows: ${formatNumber(report.summary.rows)}`,
    `- Final damage covered: ${formatNumber(report.summary.finalDamage)}`,
    `- Hits covered: ${formatNumber(report.summary.hits)}`,
    `- Strict source-linked value rows: ${formatNumber(report.summary.strictSourceLinkedRows)}`,
    `- Source-linked value candidate rows: ${formatNumber(report.summary.sourceLinkedValueRows)}`,
    `- Weak recount-value rows: ${formatNumber(report.summary.weakRecountValueRows)}`,
    "",
    "## Verdicts",
    "",
    markdownTable(
      ["Verdict", "Rows"],
      Object.entries(report.summary.byVerdict).map(([verdict, rows]) => [verdict, rows])
    ),
    "",
    "## Rows",
    "",
    markdownTable(
      ["Name", "Damage ID", "Final", "Hits", "Linked ID", "Verdict", "Strict", "Source", "Weak Recount", "Next Step"],
      report.rows.map((row) => [
        row.name,
        row.damageId,
        formatShort(row.finalValue),
        formatNumber(row.hits),
        row.linkedId,
        row.verdict,
        row.strictSourceLinkedFields.map((field) => `${field.table}+${field.offset}=${field.value}`).join("; "),
        row.sourceLinkedFields.map((field) => `${field.table}+${field.offset}=${field.value}`).join("; "),
        row.weakRecountFields.map((field) => `${field.table}+${field.offset}=${field.value}`).join("; "),
        row.nextStep,
      ])
    ),
    "",
    "## Inputs",
    "",
    `- buffProc: ${report.inputs.buffProc}`,
    "",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const buffProc = readJson(options.buffProc);
  const report = buildReport(buffProc, options);
  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Rows: ${report.summary.rows}`);
  console.log(`Strict source-linked rows: ${report.summary.strictSourceLinkedRows}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
