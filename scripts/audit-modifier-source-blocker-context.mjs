#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extractorOutput = path.resolve(repoRoot, "..", "BPSR-UID-Extractors", "output");

const DEFAULT_AUDIT_JSON = path.join(repoRoot, "DEV_exports", "modifier-accuracy-audit-latest4-proof-status.json");
const DEFAULT_FORMULA_TABLE = path.join(extractorOutput, "ModifierFormulaTermTable.json");
const DEFAULT_VALUE_TABLE = path.join(extractorOutput, "ModifierValueProofTable.json");
const DEFAULT_OUT_JSON = path.join(repoRoot, "DEV_exports", "modifier-source-blocker-context-audit.json");
const DEFAULT_OUT_MD = path.join(repoRoot, "DEV_exports", "modifier-source-blocker-context-audit.md");

const DESCRIPTION_FILES = {
  buffs: "BuffDescriptions.json",
  talents: "TalentDescriptions.json",
  "seasonal-talents": "SeasonalTalentDescriptions.json",
  factors: "FactorDescriptions.json",
  "battle-imagines": "BattleImagineDescriptions.json",
  items: "ItemDescriptions.json",
  skills: "SkillDescriptions.json",
};

const DEFAULT_ACTIONS = new Set([
  "classify-formula-zone",
  "resolve-static-description-bridge",
  "extract-modifier-value",
]);

function parseArgs(argv) {
  const options = {
    auditJson: DEFAULT_AUDIT_JSON,
    formulaTable: DEFAULT_FORMULA_TABLE,
    valueTable: DEFAULT_VALUE_TABLE,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
    actions: new Set(DEFAULT_ACTIONS),
    maxRows: 120,
    maxEntries: 4,
    maxSiblings: 4,
    descriptionMaxBytes: 130 * 1024 * 1024,
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
      case "--audit-json":
        options.auditJson = resolvePath(next());
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
      case "--actions":
        options.actions = new Set(next().split(",").map((value) => value.trim()).filter(Boolean));
        break;
      case "--all-actions":
        options.actions = null;
        break;
      case "--max-rows":
        options.maxRows = Math.max(1, Number(next()) || options.maxRows);
        break;
      case "--max-entries":
        options.maxEntries = Math.max(0, Number(next()) || options.maxEntries);
        break;
      case "--max-siblings":
        options.maxSiblings = Math.max(0, Number(next()) || options.maxSiblings);
        break;
      case "--description-max-mb":
        options.descriptionMaxBytes = Math.max(0, Number(next()) || 0) * 1024 * 1024;
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
  console.log(`Modifier Source Blocker Context Audit

Usage:
  node scripts/audit-modifier-source-blocker-context.mjs [options]

Options:
  --audit-json <file>        Modifier accuracy proof-status JSON.
  --formula-table <file>     Generated ModifierFormulaTermTable JSON.
  --value-table <file>       Generated ModifierValueProofTable JSON.
  --out-json <file>          Output JSON path.
  --out-md <file>            Output Markdown path.
  --actions <a,b,c>          Source blocker next actions to include.
  --all-actions              Include every source blocker action.
  --max-rows <n>             Maximum blocker rows to inspect. Default: 120.
  --max-entries <n>          Direct generated entries per blocker. Default: 4.
  --max-siblings <n>         Same-label sibling candidates per blocker. Default: 4.
  --description-max-mb <n>   Skip category description files larger than this. Default: 130.
  --help                     Show this help.
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

function addToIndex(index, key, value) {
  if (!key) return;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(value);
}

function normalizeLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sourceLabel(entry) {
  return entry.sourceLabel ?? entry.name ?? entry.label ?? "";
}

function entryRuleIds(entry) {
  const ids = [];
  for (const key of ["sourceRuleIds", "directSourceRuleIds"]) {
    for (const id of asArray(entry[key])) pushUnique(ids, id);
  }
  for (const link of asArray(entry.sourceRuleLinks)) {
    pushUnique(ids, link?.sourceRuleId);
  }
  return ids;
}

function compactEntry(entry, descriptionPreview = null) {
  return {
    tableName: entry.tableName,
    key: entry.key,
    uid: String(entry.uid ?? ""),
    category: entry.category,
    runtimeKind: entry.runtimeKind,
    label: sourceLabel(entry),
    formulaReadiness: entry.formulaReadiness,
    valueProofStatus: entry.valueProofStatus,
    valueResolution: entry.valueResolution,
    formulaZoneIds: asArray(entry.formulaZoneIds),
    formulaTermIds: asArray(entry.formulaTermIds),
    contributionGroups: asArray(entry.contributionGroups),
    scopeKinds: asArray(entry.scopeKinds),
    stackPolicy: entry.stackPolicy,
    selectedValues: asArray(entry.selectedValues).slice(0, 4).map((value) => ({
      componentKey: value.componentKey,
      effectClass: value.effectClass,
      formulaTermIds: asArray(value.formulaTermIds),
      contributionGroups: asArray(value.contributionGroups),
      scope: value.scope,
      value: value.value,
      decimalValue: value.decimalValue,
      unit: value.unit,
      rawText: value.rawText,
      sourceText: value.sourceText,
    })),
    valueBlockers: asArray(entry.valueBlockers),
    runtimeProofRequired: asArray(entry.runtimeProofRequired),
    proofRequirements: asArray(entry.proofRequirements),
    descriptionRef: entry.descriptionRef ?? null,
    descriptionPreview,
  };
}

function buildEntryIndexes(formulaTable, valueTable) {
  const all = [];
  const byRuleId = new Map();
  const byLabel = new Map();
  const byKey = new Map();

  for (const [tableName, table] of [
    ["formula", formulaTable],
    ["value", valueTable],
  ]) {
    for (const entry of Object.values(table.entriesByKey ?? {})) {
      const wrapped = { ...entry, tableName };
      all.push(wrapped);
      if (wrapped.key) byKey.set(`${tableName}:${wrapped.key}`, wrapped);
      for (const id of entryRuleIds(wrapped)) addToIndex(byRuleId, id, wrapped);
      addToIndex(byLabel, normalizeLabel(sourceLabel(wrapped)), wrapped);
    }
  }

  return { all, byRuleId, byLabel, byKey };
}

function loadDescriptionCache(options) {
  const cache = new Map();
  const skipped = new Map();

  function get(category, uid) {
    const fileName = DESCRIPTION_FILES[category];
    if (!fileName || !uid) return null;
    const filePath = path.join(extractorOutput, fileName);
    if (!fs.existsSync(filePath)) return null;
    if (!cache.has(category)) {
      const size = fs.statSync(filePath).size;
      if (size > options.descriptionMaxBytes) {
        skipped.set(category, { file: fileName, bytes: size });
        cache.set(category, null);
      } else {
        cache.set(category, readJson(filePath));
      }
    }
    const table = cache.get(category);
    if (!table) return null;
    return table.entriesByUid?.[String(uid)] ?? null;
  }

  return { get, skipped };
}

function descriptionPreview(entry, descCache) {
  const desc = descCache.get(entry.category, entry.uid);
  if (!desc) return null;
  const paragraphs = asArray(desc.descriptionParagraphs).filter(Boolean);
  const clean = desc.cleanDescription || paragraphs.join(" ");
  const valueRows = asArray(desc.structuredValueRows ?? desc.valueRows);
  return {
    hasDescription: Boolean(clean),
    cleanDescription: clean ? String(clean).replace(/\s+/g, " ").trim().slice(0, 360) : "",
    paragraphCount: paragraphs.length,
    valueRowCount: valueRows.length,
    hasDecisionPlaceholders: Boolean(desc.hasDecisionPlaceholders || asArray(desc.decisionPlaceholders).length),
    hasStacking: Boolean(desc.hasStacking || desc.stackPolicy === "runtime-stack-count"),
    hasMaxStackEvidence: Boolean(desc.hasMaxStackEvidence),
    sourceFiles: asArray(desc.provenance).map((row) => row?.sourceFile).filter(Boolean).slice(0, 8),
  };
}

function hasSelectedValue(entry) {
  return asArray(entry.selectedValues).length > 0;
}

function hasFormulaZone(entry) {
  return asArray(entry.formulaZoneIds).length > 0 || asArray(entry.formulaTermIds).length > 0 || asArray(entry.contributionGroups).some((group) => String(group).startsWith("formulaZone:"));
}

function valueStatus(entry) {
  return entry.valueProofStatus ?? entry.valueResolution ?? "";
}

function classifyQueue(row, directEvidence, siblingEvidence, displayedDirectEntries) {
  if (!directEvidence.length) return "missing-generated-source-context";

  const directHasDescription = directEvidence.some((entry) => entry.descriptionRef?.hasDescription)
    || displayedDirectEntries.some((entry) => entry.descriptionPreview?.hasDescription);
  const directHasFormula = directEvidence.some(hasFormulaZone);
  const directHasValue = directEvidence.some(hasSelectedValue);
  const directValueReady = directEvidence.some((entry) => valueStatus(entry) === "value-ready");
  const siblingValueReady = siblingEvidence.some((entry) => valueStatus(entry) === "value-ready" || hasSelectedValue(entry));
  const directText = displayedDirectEntries
    .map((entry) => entry.descriptionPreview?.cleanDescription ?? "")
    .join(" ")
    .toLowerCase();

  if (!directHasDescription) return "needs-static-description-bridge";
  if (!directHasFormula) {
    if (/\b(range|duration|cooldown|cd|radius|area|meter|metre|m)\b/.test(directText)) {
      return "likely-non-damage-or-selector-only";
    }
    return "needs-formula-zone-classification";
  }
  if (!directHasValue && siblingValueReady) return "needs-parent-child-value-bridge";
  if (!directHasValue && !directValueReady) return "needs-value-extraction-or-selector";
  return "has-static-value-needs-runtime-proof";
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
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

function shortList(values, max = 5) {
  const unique = [];
  for (const value of asArray(values)) pushUnique(unique, String(value));
  if (unique.length <= max) return unique.join(", ");
  return `${unique.slice(0, max).join(", ")}, +${unique.length - max} more`;
}

function buildReport(options) {
  const audit = readJson(options.auditJson);
  const formulaTable = readJson(options.formulaTable);
  const valueTable = readJson(options.valueTable);
  const indexes = buildEntryIndexes(formulaTable, valueTable);
  const descCache = loadDescriptionCache(options);

  const inputRows = asArray(audit.timeline_source_blockers)
    .filter((row) => !options.actions || options.actions.has(row.next_dev_action))
    .slice(0, options.maxRows);

  const rows = inputRows.map((row) => {
    const sourceId = row.source_id ?? row.sourceId ?? "";
    const directRaw = asArray(indexes.byRuleId.get(sourceId));
    const directKeys = new Set(directRaw.map((entry) => `${entry.tableName}:${entry.key}`));
    const labelRaw = asArray(indexes.byLabel.get(normalizeLabel(row.source_label ?? row.sourceLabel)));
    const siblingRaw = labelRaw.filter((entry) => !directKeys.has(`${entry.tableName}:${entry.key}`));

    const directEntries = directRaw.slice(0, options.maxEntries).map((entry) => compactEntry(entry, descriptionPreview(entry, descCache)));
    const siblingEntries = siblingRaw.slice(0, options.maxSiblings).map((entry) => compactEntry(entry, descriptionPreview(entry, descCache)));
    const queue = classifyQueue(row, directRaw, siblingRaw, directEntries);

    return {
      sourceLabel: row.source_label ?? row.sourceLabel ?? "",
      sourceId,
      sourceKind: row.source_kind ?? row.sourceKind ?? "",
      generatedStatus: row.generated_status ?? row.generatedStatus ?? "",
      nextDevAction: row.next_dev_action ?? row.nextDevAction ?? "",
      staticQueue: queue,
      effectLinks: row.effect_links ?? row.effectLinks ?? 0,
      readyEffectLinks: row.ready_effect_links ?? row.readyEffectLinks ?? 0,
      blockedEffectLinks: row.blocked_effect_links ?? row.blockedEffectLinks ?? 0,
      topMissingEvidence: asArray(row.top_missing_evidence ?? row.topMissingEvidence).slice(0, 5),
      formulaTermIds: asArray(row.formula_term_ids ?? row.formulaTermIds),
      contributionGroups: asArray(row.contribution_groups ?? row.contributionGroups),
      directGeneratedEntries: directEntries,
      sameLabelSiblingCandidates: siblingEntries,
      directGeneratedEntryCount: directRaw.length,
      sameLabelSiblingCandidateCount: siblingRaw.length,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    inputPaths: {
      auditJson: path.relative(repoRoot, options.auditJson),
      formulaTable: path.relative(repoRoot, options.formulaTable),
      valueTable: path.relative(repoRoot, options.valueTable),
    },
    boundaries: [
      "Dev-audit report only.",
      "Does not modify parser, DPS totals, worker, monitor, overlay, or shipped modifier UI paths.",
      "Same-label sibling candidates are evidence leads, not promoted mappings.",
    ],
    summary: {
      auditSourceBlockers: asArray(audit.timeline_source_blockers).length,
      inspectedRows: rows.length,
      actions: options.actions ? [...options.actions].sort() : ["all"],
      byNextDevAction: countBy(rows, (row) => row.nextDevAction),
      byStaticQueue: countBy(rows, (row) => row.staticQueue),
      directContextRows: rows.filter((row) => row.directGeneratedEntryCount > 0).length,
      siblingCandidateRows: rows.filter((row) => row.sameLabelSiblingCandidateCount > 0).length,
      skippedDescriptionCategories: Object.fromEntries(descCache.skipped.entries()),
    },
    rows,
  };
}

function buildMarkdown(report) {
  const rows = report.rows.slice(0, 80);
  const lines = [
    "# Modifier Source Blocker Context Audit",
    "",
    ...report.boundaries.map((line) => `- ${line}`),
    "",
    "## Summary",
    "",
    `- Source blockers in audit: ${report.summary.auditSourceBlockers}`,
    `- Inspected rows: ${report.summary.inspectedRows}`,
    `- Direct generated context rows: ${report.summary.directContextRows}`,
    `- Same-label sibling candidate rows: ${report.summary.siblingCandidateRows}`,
    "",
    "### By Next Action",
    "",
    markdownTable(
      ["Action", "Rows"],
      Object.entries(report.summary.byNextDevAction).map(([key, count]) => [key, count]),
    ),
    "",
    "### By Static Queue",
    "",
    markdownTable(
      ["Static Queue", "Rows"],
      Object.entries(report.summary.byStaticQueue).map(([key, count]) => [key, count]),
    ),
    "",
    "## Blocker Context",
    "",
    markdownTable(
      [
        "Source",
        "Kind",
        "Action",
        "Static Queue",
        "Blocked",
        "Formula Terms",
        "Groups",
        "Direct Generated Context",
        "Sibling Leads",
        "Description Preview",
        "Top Missing",
      ],
      rows.map((row) => {
        const direct = row.directGeneratedEntries[0];
        const sibling = row.sameLabelSiblingCandidates[0];
        return [
          row.sourceLabel,
          row.sourceKind,
          row.nextDevAction,
          row.staticQueue,
          row.blockedEffectLinks,
          shortList(row.formulaTermIds, 4),
          shortList(row.contributionGroups, 4),
          direct
            ? `${direct.tableName ?? ""}${direct.key ? ` ${direct.key}` : ""} ${direct.valueProofStatus ?? direct.valueResolution ?? direct.formulaReadiness ?? ""}`
            : "",
          sibling ? `${sibling.key} ${sibling.valueProofStatus ?? sibling.valueResolution ?? sibling.formulaReadiness ?? ""}` : "",
          direct?.descriptionPreview?.cleanDescription ?? "",
          row.topMissingEvidence.map((entry) => `${entry.evidence ?? entry[0]} (${entry.rows ?? entry[1] ?? ""})`).join("; "),
        ];
      }),
    ),
    "",
  ];

  if (Object.keys(report.summary.skippedDescriptionCategories).length) {
    lines.push("## Skipped Description Files", "");
    lines.push(markdownTable(
      ["Category", "File", "Bytes"],
      Object.entries(report.summary.skippedDescriptionCategories).map(([category, info]) => [
        category,
        info.file,
        info.bytes,
      ]),
    ));
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
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

  console.log(`Inspected rows: ${report.summary.inspectedRows}`);
  console.log(`Direct context rows: ${report.summary.directContextRows}`);
  console.log(`Sibling candidate rows: ${report.summary.siblingCandidateRows}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
}

main();
