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
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-coefficient-gap-audit.json"),
    surface: DEFAULT_SURFACE_PATH,
    outJson: path.join(repoRoot, "DEV_exports", "skill-chain-child-value-field-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-chain-child-value-field-audit.md"),
    maxCandidates: 10,
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
      case "--chain":
        options.chain = path.resolve(next());
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
  console.log(`Skill Chain Child Value Field Audit

Usage:
  node scripts/audit-skill-chain-child-value-fields.mjs [options]

Notes:
  Dev-only drilldown for chain children that are missing static coefficients.
  It does not alter parser/runtime/UI behavior.
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

function cleanName(value) {
  return String(value ?? "")
    .replaceAll("\u200b", "")
    .replaceAll("â€‹", "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function tableName(table) {
  return String(table?.table ?? table?.tableName ?? table?.name ?? "unknown-table");
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
    .slice(0, 10);
}

function matchKinds(matches) {
  return unique(asArray(matches).flatMap((match) => asArray(match?.kinds))).join(",");
}

function collectCandidates(surfaceReport, child, chainRow, options) {
  const damageId = finiteNumber(child.damageId);
  const linkedId = finiteNumber(child.staticLinkedId);
  const recountId = finiteNumber(chainRow.recountId);
  const ids = new Set([damageId, linkedId, recountId].filter((value) => value !== null).map(String));
  const candidates = [];

  for (const table of asArray(surfaceReport.tableReports)) {
    const name = tableName(table);
    for (const tableRow of asArray(table.rows)) {
      const matches = asArray(tableRow.matches).filter((match) => ids.has(String(finiteNumber(match?.value))));
      if (!matches.length) continue;
      const values = unique(matches.map((match) => String(finiteNumber(match?.value))).filter(Boolean));
      const hasDamage = damageId !== null && values.includes(String(damageId));
      const hasLinked = linkedId !== null && values.includes(String(linkedId));
      const hasRecount = recountId !== null && values.includes(String(recountId));
      const floatFields = compactFloatFields(tableRow.floatFields);
      const candidate = {
        table: name,
        rowIndex: finiteNumber(tableRow.rowIndex),
        absoluteOffset: finiteNumber(tableRow.absoluteOffset),
        matchValues: values,
        matchKinds: matchKinds(matches),
        floatFields,
        strings: compactStrings(tableRow.strings),
        matchScope:
          hasDamage && hasLinked
            ? "damage-and-linked-id"
            : hasDamage
              ? "damage-id"
              : hasLinked
                ? "linked-id"
                : hasRecount
                  ? "recount-id"
                  : "other",
      };
      candidate.score =
        (candidate.table === "DamageAttrTable.ctb" ? 18 : 0) +
        (candidate.table === "SkillEffectTable.ctb" || candidate.table === "SkillFightLevelTable.ctb" ? 16 : 0) +
        (candidate.table.startsWith("CTB:") ? 10 : 0) +
        (hasDamage ? 8 : 0) +
        (hasLinked ? 6 : 0) +
        (hasRecount ? 4 : 0) +
        floatFields.length * 4 +
        candidate.strings.length * 2 -
        (candidate.table === "ItemTable.ctb" ? 18 : 0);
      candidates.push(candidate);
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.table.localeCompare(right.table) || (left.rowIndex ?? 0) - (right.rowIndex ?? 0))
    .slice(0, options.maxCandidates);
}

function fieldSummary(candidates, scope) {
  const fields = [];
  for (const candidate of candidates) {
    if (candidate.matchScope !== scope) continue;
    for (const field of asArray(candidate.floatFields)) {
      fields.push({
        table: candidate.table,
        rowIndex: candidate.rowIndex,
        offset: field.offset,
        value: field.value,
        strings: candidate.strings,
      });
    }
  }
  return fields;
}

function verdictFor(row) {
  if (row.strictLinkedFields.length) return "strict-linked-value-field";
  if (row.linkedOnlyFields.length) return "linked-only-value-candidate";
  if (row.damageOnlyFields.length) return "damage-only-value-candidate";
  if (row.recountOnlyFields.length) return "weak-recount-value-candidate";
  return "identity-only-no-value-field";
}

function buildReport(chain, surface, options) {
  const rows = [];
  for (const chainRow of asArray(chain.chains)) {
    for (const child of asArray(chainRow.children).filter((entry) => entry.childVerdict === "missing-child-coefficient")) {
      const candidates = collectCandidates(surface, child, chainRow, options);
      const result = {
        recountId: chainRow.recountId,
        recountNames: asArray(chainRow.recountNames).map(cleanName),
        damageId: String(child.damageId),
        name: cleanName(child.name),
        finalValue: child.finalValue,
        hits: child.hits,
        sampleComplete: asArray(chainRow.missingKnownDamageIds).length === 0,
        missingKnownDamageIds: chainRow.missingKnownDamageIds,
        linkedSource: child.staticLinkedSource,
        linkedId: child.staticLinkedId,
        strictLinkedFields: fieldSummary(candidates, "damage-and-linked-id"),
        linkedOnlyFields: fieldSummary(candidates, "linked-id"),
        damageOnlyFields: fieldSummary(candidates, "damage-id"),
        recountOnlyFields: fieldSummary(candidates, "recount-id"),
        candidates,
        nextStep: "do not promote until child coefficient/value fields reconstruct packet totals after modifier strip",
      };
      result.verdict = verdictFor(result);
      rows.push(result);
    }
  }

  const byVerdict = {};
  for (const row of rows) byVerdict[row.verdict] = (byVerdict[row.verdict] ?? 0) + 1;

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      chain: options.chain,
      surface: options.surface,
    },
    semantics: {
      boundary: "dev-only chain child value field drilldown; no runtime coefficient promotion",
      strictPromotionGate: "child value must be linked to both emitted damage id and linked source/skill id, then validated by packet replay",
      sampleGate: "partial chains remain sample-blocked even when one observed child has a value candidate",
    },
    summary: {
      rows: rows.length,
      completeSampleRows: rows.filter((row) => row.sampleComplete).length,
      partialSampleRows: rows.filter((row) => !row.sampleComplete).length,
      finalDamage: rows.reduce((sum, row) => sum + (finiteNumber(row.finalValue) ?? 0), 0),
      hits: rows.reduce((sum, row) => sum + (finiteNumber(row.hits) ?? 0), 0),
      strictLinkedRows: rows.filter((row) => row.strictLinkedFields.length).length,
      linkedOnlyRows: rows.filter((row) => row.linkedOnlyFields.length).length,
      weakRecountRows: rows.filter((row) => row.recountOnlyFields.length).length,
      byVerdict,
    },
    rows,
  };
}

function fieldList(fields) {
  return asArray(fields)
    .slice(0, 4)
    .map((field) => `${field.table}+${field.offset}=${field.value}`)
    .join("; ");
}

function renderMarkdown(report) {
  return [
    "# Skill Chain Child Value Field Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Rows: ${formatNumber(report.summary.rows)}`,
    `- Complete-sample rows: ${formatNumber(report.summary.completeSampleRows)}`,
    `- Partial-sample rows: ${formatNumber(report.summary.partialSampleRows)}`,
    `- Final damage covered: ${formatNumber(report.summary.finalDamage)}`,
    `- Hits covered: ${formatNumber(report.summary.hits)}`,
    `- Strict linked value rows: ${formatNumber(report.summary.strictLinkedRows)}`,
    `- Linked-only value rows: ${formatNumber(report.summary.linkedOnlyRows)}`,
    `- Weak recount-value rows: ${formatNumber(report.summary.weakRecountRows)}`,
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
      ["Recount", "Name", "Damage ID", "Final", "Hits", "Sample", "Linked", "Verdict", "Strict", "Linked Only", "Weak Recount", "Missing Siblings"],
      report.rows.map((row) => [
        row.recountNames.join(", "),
        row.name,
        row.damageId,
        formatShort(row.finalValue),
        formatNumber(row.hits),
        row.sampleComplete ? "complete" : "partial",
        `${row.linkedSource}:${row.linkedId}`,
        row.verdict,
        fieldList(row.strictLinkedFields),
        fieldList(row.linkedOnlyFields),
        fieldList(row.recountOnlyFields),
        asArray(row.missingKnownDamageIds).join(", "),
      ])
    ),
    "",
    "## Inputs",
    "",
    `- chain: ${report.inputs.chain}`,
    `- surface: ${report.inputs.surface}`,
    "",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const chain = readJson(options.chain);
  const surface = readJson(options.surface);
  const report = buildReport(chain, surface, options);
  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Rows: ${report.summary.rows}`);
  console.log(`Strict linked rows: ${report.summary.strictLinkedRows}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
