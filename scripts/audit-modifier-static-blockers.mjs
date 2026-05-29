#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LABEL_AUDIT = "DEV_exports/modifier-label-formula-bucket-audit.json";
const DEFAULT_FORMULA_TERMS = fs.existsSync("DEV_generated/modifier/ModifierFormulaTermTable.json")
  ? "DEV_generated/modifier/ModifierFormulaTermTable.json"
  : "../BPSR-UID-Extractors/output/ModifierFormulaTermTable.json";
const DEFAULT_VALUE_PROOF = fs.existsSync("DEV_generated/modifier/ModifierValueProofTable.json")
  ? "DEV_generated/modifier/ModifierValueProofTable.json"
  : "../BPSR-UID-Extractors/output/ModifierValueProofTable.json";
const DEFAULT_OUT_JSON = "DEV_exports/modifier-static-blocker-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/modifier-static-blocker-audit.md";
const DEFAULT_MAX_ROWS = 120;

const STATIC_ACTIONS = new Set([
  "static-label-or-source-bridge",
  "missing-static-formula-bucket",
  "missing-static-value-proof-row",
  "missing-static-component-value-data",
  "static-value-selection-review",
  "static-component-classification-review",
]);

function parseArgs(argv) {
  const options = {
    labelAudit: DEFAULT_LABEL_AUDIT,
    formulaTerms: DEFAULT_FORMULA_TERMS,
    valueProof: DEFAULT_VALUE_PROOF,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
    maxRows: DEFAULT_MAX_ROWS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    switch (arg) {
      case "--label-audit":
        options.labelAudit = next();
        break;
      case "--formula-terms":
        options.formulaTerms = next();
        break;
      case "--value-proof":
        options.valueProof = next();
        break;
      case "--out-json":
        options.outJson = next();
        break;
      case "--out-md":
        options.outMd = next();
        break;
      case "--max-rows":
        options.maxRows = Math.max(1, Number(next()) || DEFAULT_MAX_ROWS);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/audit-modifier-static-blockers.mjs [options]

Classify dev-only modifier static blockers into actionable generator/source gaps.
This report does not change parser, DPS, overlay, monitor, or runtime behavior.

Options:
  --label-audit <path>     Label/formula audit JSON. Default: ${DEFAULT_LABEL_AUDIT}
  --formula-terms <path>   ModifierFormulaTermTable.json. Default: ${DEFAULT_FORMULA_TERMS}
  --value-proof <path>     ModifierValueProofTable.json. Default: ${DEFAULT_VALUE_PROOF}
  --out-json <path>        JSON output path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>          Markdown output path. Default: ${DEFAULT_OUT_MD}
  --max-rows <count>       Max sample rows per Markdown section. Default: ${DEFAULT_MAX_ROWS}
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function readJson(filePath) {
  const resolved = resolveRepoPath(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Missing JSON file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function countInto(map, key, amount = 1) {
  const safeKey = String(key ?? "unknown").trim() || "unknown";
  map.set(safeKey, (map.get(safeKey) ?? 0) + amount);
}

function countManyInto(map, values) {
  const list = uniqueStrings(values);
  if (!list.length) {
    countInto(map, "none");
    return;
  }
  for (const value of list) countInto(map, value);
}

function mapToSortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );
}

function firstUidPrefix(sourceId) {
  const text = String(sourceId ?? "").trim();
  const index = text.indexOf(":");
  return index >= 0 ? text.slice(0, index) : text || "unknown";
}

function hasAny(values, needles) {
  const haystack = uniqueStrings(values).join("\n").toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function staticActionsFor(row) {
  return uniqueStrings(row.nextActions).filter((action) => STATIC_ACTIONS.has(action));
}

function entryHasDescription(entry) {
  const ref = entry?.descriptionRef ?? {};
  return Boolean(
    ref.hasDescription
    || ref.hasScopeDescription
    || ref.hasDescriptionBlocks
    || ref.hasBridgedPageContext
  );
}

function entryEvidenceShape(formulaEntries, valueEntries) {
  return {
    formulaEntries: formulaEntries.length,
    valueEntries: valueEntries.length,
    hasDescription: formulaEntries.some(entryHasDescription),
    hasDescriptionBlocks: formulaEntries.some((entry) => entry.descriptionRef?.hasDescriptionBlocks),
    hasBridgedPageContext: formulaEntries.some((entry) => entry.descriptionRef?.hasBridgedPageContext),
    hasStructuredValueRows: formulaEntries.some((entry) => entry.descriptionRef?.hasStructuredValueRows),
    hasUnresolvedDecisionPlaceholders: formulaEntries.some((entry) => entry.descriptionRef?.hasUnresolvedDecisionPlaceholders),
    hasDescriptionValueRows: formulaEntries.some((entry) => asArray(entry.valueRows).length > 0),
    hasComponentValueHints: formulaEntries.some((entry) => asArray(entry.componentValueHints).length > 0),
    hasSelectedValues: valueEntries.some((entry) => asArray(entry.selectedValues).length > 0),
    hasValueSelectors: valueEntries.some((entry) => asArray(entry.valueSelectors).length > 0),
  };
}

function classifyStaticBlocker(row, formulaEntries, valueEntries) {
  const actions = staticActionsFor(row);
  const shape = entryEvidenceShape(formulaEntries, valueEntries);
  const formulaBuckets = asArray(row.formulaBuckets);
  const valueStatuses = asArray(row.valueProofStatus);
  const blockers = asArray(row.blockerHints);
  const readiness = asArray(row.formulaReadiness);

  if (row.rawFallbackLabel || actions.includes("static-label-or-source-bridge")) {
    return "label-source-bridge";
  }

  if (!formulaBuckets.length) {
    if (actions.includes("static-component-classification-review")) {
      return "non-formula-component-classification-review";
    }
    if (actions.includes("static-value-selection-review")) {
      return "non-formula-value-selection-review";
    }
    if (actions.includes("missing-static-formula-bucket")) {
      return "missing-formula-bucket";
    }
    return "audit-only-non-formula-row";
  }

  if (actions.includes("static-component-classification-review")) {
    if (hasAny(valueStatuses, ["packet-exact-value-not-required"])) {
      return "component-classification-packet-exact-route";
    }
    if (hasAny(valueStatuses, ["non-damage-or-support"]) || hasAny(readiness, ["non-damage-or-support"])) {
      return "component-classification-support-route";
    }
    if (!shape.hasDescription && !shape.hasDescriptionValueRows && !shape.hasComponentValueHints) {
      return "component-classification-needs-description-source";
    }
    return "component-classification-needs-formula-policy";
  }

  if (actions.includes("static-value-selection-review")) {
    if (shape.hasValueSelectors) {
      return "static-selector-policy-review";
    }
    if (hasAny(blockers, ["ambiguous-scoped-value"])) {
      return "ambiguous-scope-value-selection";
    }
    if (hasAny(blockers, ["ambiguous-value-selection-required", "needs-value-selection"])) {
      return "ambiguous-static-value-selection";
    }
    return "static-value-selection-review";
  }

  if (actions.includes("missing-static-value-proof-row")) {
    return "missing-value-proof-entry";
  }

  if (actions.includes("missing-static-component-value-data")) {
    if (shape.hasUnresolvedDecisionPlaceholders || hasAny(valueStatuses, ["needs-description-parameter-source"])) {
      return "description-decision-placeholders-need-value-source";
    }
    if (!shape.hasDescription && !shape.hasDescriptionValueRows && !shape.hasComponentValueHints) {
      return "name-only-formula-hint-missing-description";
    }
    if (shape.hasDescription && !shape.hasDescriptionValueRows && !shape.hasComponentValueHints) {
      return "description-has-formula-zone-but-no-values";
    }
    if (shape.hasDescriptionValueRows && !shape.hasComponentValueHints) {
      return "description-values-need-component-mapping";
    }
    if (shape.hasComponentValueHints && !shape.hasSelectedValues && !shape.hasValueSelectors) {
      return "component-hints-missing-selected-values";
    }
    return "missing-static-component-value-data";
  }

  return "static-review-unclassified";
}

function buildRow(row, formulaTerms, valueProof) {
  const formulaEntries = uniqueStrings(row.formulaEntryKeys)
    .map((key) => formulaTerms.entriesByKey?.[key])
    .filter(Boolean);
  const valueEntries = uniqueStrings(row.valueProofKeys)
    .map((key) => valueProof.entriesByKey?.[key])
    .filter(Boolean);
  const staticActions = staticActionsFor(row);
  const evidenceShape = entryEvidenceShape(formulaEntries, valueEntries);

  return {
    label: row.label,
    sourceId: row.sourceId,
    sourceType: row.sourceType,
    reportPolicy: row.reportPolicy,
    labelProvenance: row.labelProvenance,
    formulaBuckets: uniqueStrings(row.formulaBuckets),
    formulaReadiness: uniqueStrings(row.formulaReadiness),
    valueProofStatus: uniqueStrings(row.valueProofStatus),
    valueResolution: uniqueStrings(row.valueResolution),
    staticActions,
    blockerClass: classifyStaticBlocker(row, formulaEntries, valueEntries),
    evidenceShape,
    blockerHints: uniqueStrings(row.blockerHints),
    runtimeProofRequired: uniqueStrings(row.runtimeProofRequired),
    formulaEntryKeys: uniqueStrings(row.formulaEntryKeys),
    valueProofKeys: uniqueStrings(row.valueProofKeys),
    sourcePrefix: firstUidPrefix(row.sourceId),
  };
}

function buildReport(options) {
  const labelAudit = readJson(options.labelAudit);
  const formulaTerms = readJson(options.formulaTerms);
  const valueProof = readJson(options.valueProof);

  const rows = asArray(labelAudit.rows)
    .filter((row) => staticActionsFor(row).length > 0)
    .map((row) => buildRow(row, formulaTerms, valueProof))
    .sort((left, right) =>
      left.blockerClass.localeCompare(right.blockerClass)
      || left.sourcePrefix.localeCompare(right.sourcePrefix)
      || left.label.localeCompare(right.label)
    );

  const counters = {
    blockerClass: new Map(),
    staticActions: new Map(),
    sourcePrefix: new Map(),
    sourceType: new Map(),
    labelProvenance: new Map(),
    formulaBuckets: new Map(),
    valueProofStatus: new Map(),
  };

  for (const row of rows) {
    countInto(counters.blockerClass, row.blockerClass);
    countManyInto(counters.staticActions, row.staticActions);
    countInto(counters.sourcePrefix, row.sourcePrefix);
    countInto(counters.sourceType, row.sourceType || "unknown");
    countInto(counters.labelProvenance, row.labelProvenance || "unknown");
    countManyInto(counters.formulaBuckets, row.formulaBuckets);
    countManyInto(counters.valueProofStatus, row.valueProofStatus);
  }

  return {
    schemaVersion: 1,
    description:
      "Dev-only static blocker audit for modifier formula/value work. This does not change parser/runtime behavior.",
    stats: {
      generatedAt: new Date().toISOString(),
      labelAuditPath: options.labelAudit,
      formulaTermsPath: options.formulaTerms,
      valueProofPath: options.valueProof,
      staticRows: rows.length,
      sourceRowsFromLabelAudit: asArray(labelAudit.rows).length,
      blockerClass: mapToSortedObject(counters.blockerClass),
      staticActions: mapToSortedObject(counters.staticActions),
      sourcePrefix: mapToSortedObject(counters.sourcePrefix),
      sourceType: mapToSortedObject(counters.sourceType),
      labelProvenance: mapToSortedObject(counters.labelProvenance),
      formulaBuckets: mapToSortedObject(counters.formulaBuckets),
      valueProofStatus: mapToSortedObject(counters.valueProofStatus),
    },
    rows,
  };
}

function compactList(values, limit = 4) {
  const list = uniqueStrings(values);
  if (list.length <= limit) return list.join(", ");
  return `${list.slice(0, limit).join(", ")}, +${list.length - limit}`;
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => escapeCell(row[header])).join(" | ")} |`),
  ].join("\n");
}

function objectRows(object, keyName, valueName, limit) {
  return Object.entries(object ?? {})
    .slice(0, limit)
    .map(([key, value]) => ({ [keyName]: key, [valueName]: value }));
}

function rowSummary(row) {
  return {
    class: row.blockerClass,
    label: row.label,
    sourceId: row.sourceId,
    type: compactList([row.sourceType, row.sourcePrefix].filter(Boolean), 2),
    buckets: compactList(row.formulaBuckets),
    status: compactList(row.valueProofStatus),
    actions: compactList(row.staticActions),
    shape: [
      row.evidenceShape.hasDescription ? "desc" : "no-desc",
      row.evidenceShape.hasBridgedPageContext ? "bridged-page" : row.evidenceShape.hasDescriptionBlocks ? "page" : "no-page",
      row.evidenceShape.hasStructuredValueRows ? "structured" : "no-structured",
      row.evidenceShape.hasDescriptionValueRows ? "values" : "no-values",
      row.evidenceShape.hasComponentValueHints ? "hints" : "no-hints",
      row.evidenceShape.hasSelectedValues ? "selected" : "no-selected",
    ].join(" / "),
    blockers: compactList(row.blockerHints, 3),
  };
}

function buildMarkdown(report, maxRows) {
  const sections = [
    "# Modifier Static Blocker Audit",
    "",
    "Dev-only report. It explains static/generator-side gaps before any parser-side contribution math.",
    "",
    "## Summary",
    "",
    `- Generated at: ${report.stats.generatedAt}`,
    `- Static rows: ${report.stats.staticRows}`,
    `- Source rows from label audit: ${report.stats.sourceRowsFromLabelAudit}`,
    "",
    "## Blocker Classes",
    "",
    markdownTable(["class", "count"], objectRows(report.stats.blockerClass, "class", "count", maxRows)),
    "",
    "## Static Actions",
    "",
    markdownTable(["action", "count"], objectRows(report.stats.staticActions, "action", "count", maxRows)),
    "",
    "## Source Prefixes",
    "",
    markdownTable(["prefix", "count"], objectRows(report.stats.sourcePrefix, "prefix", "count", maxRows)),
    "",
    "## Source Types",
    "",
    markdownTable(["type", "count"], objectRows(report.stats.sourceType, "type", "count", maxRows)),
    "",
    "## Formula Buckets",
    "",
    markdownTable(["bucket", "count"], objectRows(report.stats.formulaBuckets, "bucket", "count", maxRows)),
    "",
    "## Static Blocker Samples",
    "",
    report.rows.length
      ? markdownTable(
        ["class", "label", "sourceId", "type", "buckets", "status", "actions", "shape", "blockers"],
        report.rows.slice(0, maxRows).map(rowSummary),
      )
      : "_None._",
  ];

  return `${sections.join("\n")}\n`;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(resolveRepoPath(filePath)), { recursive: true });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  ensureParentDir(options.outJson);
  ensureParentDir(options.outMd);
  fs.writeFileSync(resolveRepoPath(options.outJson), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolveRepoPath(options.outMd), buildMarkdown(report, options.maxRows));
  console.log(JSON.stringify({
    outJson: options.outJson,
    outMd: options.outMd,
    staticRows: report.stats.staticRows,
    blockerClass: report.stats.blockerClass,
    staticActions: report.stats.staticActions,
  }, null, 2));
}

main();
