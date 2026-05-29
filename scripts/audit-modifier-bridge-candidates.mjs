#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extractorOutput = path.resolve(repoRoot, "..", "BPSR-UID-Extractors", "output");

const DEFAULT_CONTEXT_JSON = path.join(repoRoot, "DEV_exports", "modifier-source-blocker-context-all-actions.json");
const DEFAULT_FORMULA_TABLE = path.join(extractorOutput, "ModifierFormulaTermTable.json");
const DEFAULT_VALUE_TABLE = path.join(extractorOutput, "ModifierValueProofTable.json");
const DEFAULT_OUT_JSON = path.join(repoRoot, "DEV_exports", "modifier-bridge-candidate-audit.json");
const DEFAULT_OUT_MD = path.join(repoRoot, "DEV_exports", "modifier-bridge-candidate-audit.md");

const BRIDGE_QUEUES = new Set([
  "needs-static-description-bridge",
  "missing-generated-source-context",
  "needs-parent-child-value-bridge",
  "needs-value-extraction-or-selector",
  "needs-formula-zone-classification",
]);

function parseArgs(argv) {
  const options = {
    contextJson: DEFAULT_CONTEXT_JSON,
    formulaTable: DEFAULT_FORMULA_TABLE,
    valueTable: DEFAULT_VALUE_TABLE,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
    maxRows: 240,
    maxCandidates: 8,
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
      case "--context-json":
        options.contextJson = resolvePath(next());
        break;
      case "--formula-table":
        options.formulaTable = resolvePath(next());
        break;
      case "--value-table":
        options.valueTable = resolvePath(next());
        break;
      case "--out-json":
        options.outJson = resolvePath(next());
        break;
      case "--out-md":
        options.outMd = resolvePath(next());
        break;
      case "--max-rows":
        options.maxRows = Math.max(1, Number(next()) || options.maxRows);
        break;
      case "--max-candidates":
        options.maxCandidates = Math.max(0, Number(next()) || options.maxCandidates);
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
  console.log(`Modifier Bridge Candidate Audit

Usage:
  node scripts/audit-modifier-bridge-candidates.mjs [options]

Options:
  --context-json <file>     Source blocker context JSON.
  --formula-table <file>    Generated ModifierFormulaTermTable JSON.
  --value-table <file>      Generated ModifierValueProofTable JSON.
  --out-json <file>         Output JSON path.
  --out-md <file>           Output Markdown path.
  --max-rows <n>            Maximum blocker rows to inspect. Default: 240.
  --max-candidates <n>      Candidate rows to keep per blocker. Default: 8.
  --help                    Show this help.
`);
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
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

function pushUnique(array, value) {
  if (value == null || value === "") return;
  if (!array.includes(value)) array.push(value);
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function normalizeLabel(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function keyCategory(key) {
  return String(key ?? "").split(":")[0] || "";
}

function keyUid(key) {
  return String(key ?? "").split(":")[1] || "";
}

function sourceLabel(entry) {
  return entry.sourceLabel ?? entry.name ?? entry.label ?? "";
}

function valueStatus(entry) {
  return entry.valueProofStatus ?? entry.valueResolution ?? "";
}

function hasDescription(entry) {
  return Boolean(
    entry.descriptionRef?.hasDescription
      || entry.descriptionRef?.hasDescriptionBlocks
      || entry.descriptionRef?.hasBridgedPageContext
      || entry.descriptionPreview?.hasDescription
      || entry.descriptionPreview?.cleanDescription,
  );
}

function hasSelectedValue(entry) {
  return asArray(entry.selectedValues).length > 0;
}

function hasFormulaZone(entry) {
  return asArray(entry.formulaZoneIds).length > 0
    || asArray(entry.formulaTermIds).length > 0
    || asArray(entry.contributionGroups).some((group) => String(group).startsWith("formulaZone:"));
}

function compactEntry(entry, relation = entry.relation ?? null) {
  return {
    relation,
    tableName: entry.tableName,
    key: entry.key,
    uid: String(entry.uid ?? keyUid(entry.key)),
    category: entry.category ?? keyCategory(entry.key),
    label: sourceLabel(entry),
    formulaReadiness: entry.formulaReadiness,
    valueStatus: valueStatus(entry),
    hasDescription: hasDescription(entry),
    hasFormulaZone: hasFormulaZone(entry),
    selectedValueCount: asArray(entry.selectedValues).length,
    formulaZoneIds: asArray(entry.formulaZoneIds),
    formulaTermIds: asArray(entry.formulaTermIds),
    contributionGroups: asArray(entry.contributionGroups),
    selectedValues: asArray(entry.selectedValues).slice(0, 5).map((value) => ({
      componentKey: value.componentKey,
      effectClass: value.effectClass,
      contributionGroups: asArray(value.contributionGroups),
      value: value.value,
      decimalValue: value.decimalValue,
      unit: value.unit,
      scope: value.scope,
      rawText: value.rawText,
      sourceText: value.sourceText,
    })),
    valueBlockers: asArray(entry.valueBlockers),
    runtimeProofRequired: asArray(entry.runtimeProofRequired),
    descriptionRef: entry.descriptionRef ?? null,
  };
}

function entryRuleIds(entry) {
  const ids = [];
  for (const key of ["sourceRuleIds", "directSourceRuleIds"]) {
    for (const id of asArray(entry[key])) pushUnique(ids, id);
  }
  for (const link of asArray(entry.sourceRuleLinks)) pushUnique(ids, link?.sourceRuleId);
  return ids;
}

function buildGeneratedIndex(formulaTable, valueTable) {
  const all = [];
  const byKey = new Map();
  const byLabel = new Map();
  const byUid = new Map();
  const byRuleId = new Map();

  for (const [tableName, table] of [
    ["formula", formulaTable],
    ["value", valueTable],
  ]) {
    for (const entry of Object.values(table.entriesByKey ?? {})) {
      const wrapped = { ...entry, tableName };
      all.push(wrapped);
      if (wrapped.key) byKey.set(`${tableName}:${wrapped.key}`, wrapped);
      const uid = String(wrapped.uid ?? keyUid(wrapped.key));
      if (uid) {
        const uidKey = `${uid}`;
        if (!byUid.has(uidKey)) byUid.set(uidKey, []);
        byUid.get(uidKey).push(wrapped);
      }
      const label = normalizeLabel(sourceLabel(wrapped));
      if (label) {
        if (!byLabel.has(label)) byLabel.set(label, []);
        byLabel.get(label).push(wrapped);
      }
      for (const sourceRuleId of entryRuleIds(wrapped)) {
        if (!byRuleId.has(sourceRuleId)) byRuleId.set(sourceRuleId, []);
        byRuleId.get(sourceRuleId).push(wrapped);
      }
    }
  }

  return { all, byKey, byLabel, byUid, byRuleId };
}

function generatedEntriesFromContext(row) {
  const entries = [];
  for (const entry of asArray(row.directGeneratedEntries)) entries.push({ ...entry, relation: "direct" });
  for (const entry of asArray(row.sameLabelSiblingCandidates)) entries.push({ ...entry, relation: "same-label-sibling" });
  return entries;
}

function sameUidCandidates(row, indexes, maxCandidates) {
  const uids = [];
  for (const entry of generatedEntriesFromContext(row)) pushUnique(uids, entry.uid ?? keyUid(entry.key));
  const candidates = [];
  const seen = new Set();
  const rowLabel = normalizeLabel(row.sourceLabel);
  for (const uid of uids) {
    for (const entry of asArray(indexes.byUid.get(String(uid)))) {
      const key = `${entry.tableName}:${entry.key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const relation = normalizeLabel(sourceLabel(entry)) === rowLabel
        ? "same-uid-same-label"
        : "same-uid-cross-category";
      candidates.push(compactEntry(entry, relation));
    }
  }
  return candidates
    .sort(candidateSort)
    .slice(0, maxCandidates);
}

function labelCandidates(row, indexes, maxCandidates) {
  const candidates = [];
  const seen = new Set();
  for (const entry of asArray(indexes.byLabel.get(normalizeLabel(row.sourceLabel)))) {
    const key = `${entry.tableName}:${entry.key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(compactEntry(entry, "same-label"));
  }
  return candidates
    .sort(candidateSort)
    .slice(0, maxCandidates);
}

function candidateSort(a, b) {
  const score = (entry) => (
    (entry.hasSelectedValue ? 8 : 0)
    + (entry.valueStatus === "value-ready" ? 6 : 0)
    + (entry.hasFormulaZone ? 4 : 0)
    + (entry.hasDescription ? 2 : 0)
    - (entry.valueStatus === "missing-value-data" ? 1 : 0)
  );
  return score(b) - score(a) || String(a.key).localeCompare(String(b.key));
}

function inferRecommendation(row, candidates) {
  const direct = asArray(row.directGeneratedEntries);
  const sibling = asArray(row.sameLabelSiblingCandidates);
  const strong = candidates.filter((entry) => entry.relation === "same-label" || entry.relation === "same-uid-same-label");
  const weak = candidates.filter((entry) => entry.relation === "same-uid-cross-category");
  const valueCandidates = strong.filter((entry) => entry.hasSelectedValue || entry.valueStatus === "value-ready");
  const weakValueCandidates = weak.filter((entry) => entry.hasSelectedValue || entry.valueStatus === "value-ready");
  const describedCandidates = strong.filter((entry) => entry.hasDescription);
  const weakDescribedCandidates = weak.filter((entry) => entry.hasDescription);
  const formulaCandidates = strong.filter((entry) => entry.hasFormulaZone);
  const weakFormulaCandidates = weak.filter((entry) => entry.hasFormulaZone);

  if (row.staticQueue === "missing-generated-source-context") {
    if (sibling.length) return "candidate-observed-source-bridge";
    return "needs-raw-source-lookup";
  }
  if (row.staticQueue === "needs-parent-child-value-bridge") {
    if (valueCandidates.length) return "candidate-parent-child-value-bridge";
    return "needs-parent-child-source-lookup";
  }
  if (row.staticQueue === "needs-static-description-bridge") {
    if (describedCandidates.length) return "candidate-static-description-bridge";
    if (weakDescribedCandidates.length) return "weak-cross-category-description-lead";
    if (direct.some((entry) => valueStatus(entry) === "missing-value-data")) return "no-static-description-found";
    return "needs-static-description-search";
  }
  if (row.staticQueue === "needs-value-extraction-or-selector") {
    if (valueCandidates.length) return "candidate-value-selector-bridge";
    if (weakValueCandidates.length) return "weak-cross-category-value-lead";
    if (describedCandidates.length || formulaCandidates.length) return "needs-value-selector-or-parameter-source";
    if (weakDescribedCandidates.length || weakFormulaCandidates.length) return "weak-cross-category-value-lead";
    return "needs-description-before-value";
  }
  if (row.staticQueue === "needs-formula-zone-classification") {
    if (formulaCandidates.length) return "candidate-formula-zone-bridge";
    if (weakFormulaCandidates.length) return "weak-cross-category-formula-lead";
    return "needs-formula-zone-classifier";
  }
  return "no-bridge-action";
}

function buildRows(context, indexes, options) {
  return asArray(context.rows)
    .filter((row) => BRIDGE_QUEUES.has(row.staticQueue))
    .slice(0, options.maxRows)
    .map((row) => {
      const uidCandidates = sameUidCandidates(row, indexes, options.maxCandidates);
      const sameLabelCandidates = labelCandidates(row, indexes, options.maxCandidates);
      const candidatesByKey = new Map();
      for (const entry of [...uidCandidates, ...sameLabelCandidates]) {
        candidatesByKey.set(`${entry.tableName}:${entry.key}`, entry);
      }
      const candidates = [...candidatesByKey.values()].sort(candidateSort).slice(0, options.maxCandidates);
      const recommendation = inferRecommendation(row, candidates);
      return {
        sourceLabel: row.sourceLabel,
        sourceId: row.sourceId,
        sourceKind: row.sourceKind,
        nextDevAction: row.nextDevAction,
        staticQueue: row.staticQueue,
        recommendation,
        blockedEffectLinks: row.blockedEffectLinks,
        topMissingEvidence: row.topMissingEvidence,
        directGeneratedEntries: asArray(row.directGeneratedEntries).map((entry) => compactEntry(entry, "direct")),
        sameLabelSiblingCandidates: asArray(row.sameLabelSiblingCandidates).map((entry) => compactEntry(entry, "same-label-sibling")),
        bridgeCandidates: candidates,
      };
    });
}

function escapeMd(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(escapeMd).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeMd).join(" | ")} |`),
  ].join("\n");
}

function shortList(values, max = 4) {
  const unique = [];
  for (const value of asArray(values)) pushUnique(unique, String(value));
  if (unique.length <= max) return unique.join(", ");
  return `${unique.slice(0, max).join(", ")}, +${unique.length - max} more`;
}

function candidateSummary(entry) {
  if (!entry) return "";
  const status = entry.valueStatus || entry.formulaReadiness || "";
  const valueText = entry.selectedValueCount ? `values:${entry.selectedValueCount}` : "";
  const zoneText = entry.formulaZoneIds?.length ? shortList(entry.formulaZoneIds, 3) : "";
  const relation = entry.relation ? `[${entry.relation}]` : "";
  return [entry.key, relation, status, valueText, zoneText].filter(Boolean).join(" ");
}

function buildMarkdown(report) {
  const lines = [
    "# Modifier Bridge Candidate Audit",
    "",
    "- Dev-audit report only.",
    "- Does not modify parser, DPS totals, worker, monitor, overlay, hotkeys, runtime capture, or shipped modifier UI paths.",
    "- Candidates are evidence leads. They are not promoted mappings or contribution truth.",
    "",
    "## Summary",
    "",
    `- Inspected bridge rows: ${report.summary.inspectedRows}`,
    "",
    "### By Static Queue",
    "",
    markdownTable(["Static Queue", "Rows"], Object.entries(report.summary.byStaticQueue).map(([key, value]) => [key, value])),
    "",
    "### By Recommendation",
    "",
    markdownTable(["Recommendation", "Rows"], Object.entries(report.summary.byRecommendation).map(([key, value]) => [key, value])),
    "",
  ];

  for (const [queue, rows] of Object.entries(report.rowsByStaticQueue)) {
    lines.push(`## ${queue}`, "");
    lines.push(markdownTable(
      [
        "Source",
        "Kind",
        "Action",
        "Recommendation",
        "Blocked",
        "Direct",
        "Best Candidate",
        "Top Missing",
      ],
      rows.slice(0, 80).map((row) => [
        row.sourceLabel,
        row.sourceKind,
        row.nextDevAction,
        row.recommendation,
        row.blockedEffectLinks,
        candidateSummary(row.directGeneratedEntries[0]),
        candidateSummary(row.bridgeCandidates[0]),
        asArray(row.topMissingEvidence).map((entry) => `${entry.evidence ?? entry[0]} (${entry.rows ?? entry[1] ?? ""})`).join("; "),
      ]),
    ));
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function buildReport(options) {
  const context = readJson(options.contextJson);
  const formulaTable = readJson(options.formulaTable);
  const valueTable = readJson(options.valueTable);
  const indexes = buildGeneratedIndex(formulaTable, valueTable);
  const rows = buildRows(context, indexes, options);
  const rowsByStaticQueue = {};
  for (const row of rows) {
    rowsByStaticQueue[row.staticQueue] ??= [];
    rowsByStaticQueue[row.staticQueue].push(row);
  }

  return {
    generatedAt: new Date().toISOString(),
    inputPaths: {
      contextJson: path.relative(repoRoot, options.contextJson),
      formulaTable: path.relative(repoRoot, options.formulaTable),
      valueTable: path.relative(repoRoot, options.valueTable),
    },
    boundaries: [
      "Dev-audit report only.",
      "Does not modify parser, DPS totals, worker, monitor, overlay, hotkeys, runtime capture, or shipped modifier UI paths.",
      "Candidates are evidence leads. They are not promoted mappings or contribution truth.",
    ],
    summary: {
      inspectedRows: rows.length,
      byStaticQueue: countBy(rows, (row) => row.staticQueue),
      byRecommendation: countBy(rows, (row) => row.recommendation),
    },
    rowsByStaticQueue,
    rows,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = buildReport(options);
  writeJson(options.outJson, report);
  writeText(options.outMd, buildMarkdown(report));

  console.log(`Inspected bridge rows: ${report.summary.inspectedRows}`);
  console.log(JSON.stringify(report.summary.byRecommendation, null, 2));
  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
}

main();
