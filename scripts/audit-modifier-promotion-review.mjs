#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_BRIDGE_JSON = path.join(repoRoot, "DEV_exports", "modifier-bridge-candidate-audit.json");
const DEFAULT_OUT_JSON = path.join(repoRoot, "DEV_exports", "modifier-promotion-review.json");
const DEFAULT_OUT_MD = path.join(repoRoot, "DEV_exports", "modifier-promotion-review.md");

const STRONG_RELATIONS = new Set(["same-label", "same-uid-same-label"]);
const WEAK_RELATIONS = new Set(["same-uid-cross-category"]);

function parseArgs(argv) {
  const options = {
    bridgeJson: DEFAULT_BRIDGE_JSON,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
    maxRows: 240,
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
      case "--bridge-json":
        options.bridgeJson = resolvePath(next());
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
  console.log(`Modifier Promotion Review

Usage:
  node scripts/audit-modifier-promotion-review.mjs [options]

Options:
  --bridge-json <file>  Modifier bridge candidate audit JSON.
  --out-json <file>     Output JSON path.
  --out-md <file>       Output Markdown path.
  --max-rows <n>        Maximum rows to review. Default: 240.
  --help                Show this help.
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

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function hasValue(candidate) {
  return candidate?.selectedValueCount > 0 || candidate?.valueStatus === "value-ready";
}

function hasDescription(candidate) {
  return Boolean(candidate?.hasDescription || candidate?.descriptionRef?.hasDescription || candidate?.descriptionRef?.hasBridgedPageContext);
}

function hasFormulaZone(candidate) {
  return Boolean(candidate?.hasFormulaZone || asArray(candidate?.formulaZoneIds).length || asArray(candidate?.formulaTermIds).length);
}

function strongCandidates(row) {
  const candidates = asArray(row.bridgeCandidates)
    .filter((candidate) => STRONG_RELATIONS.has(candidate.relation));
  if (row.staticQueue === "missing-generated-source-context") {
    return candidates;
  }
  return candidates.filter((candidate) => hasValue(candidate) || hasDescription(candidate) || hasFormulaZone(candidate));
}

function weakCandidates(row) {
  return asArray(row.bridgeCandidates)
    .filter((candidate) => WEAK_RELATIONS.has(candidate.relation))
    .filter((candidate) => hasValue(candidate) || hasDescription(candidate) || hasFormulaZone(candidate));
}

function isWindowOnly(row) {
  if (row.nextDevAction === "window-only-not-contribution") return true;
  return asArray(row.topMissingEvidence).some((entry) => String(entry.evidence ?? entry[0] ?? "").includes("target damage/recount id match"));
}

function classifyGate(row, strong, weak) {
  if (isWindowOnly(row)) {
    if (strong.length) return "context-only-window-proof";
    if (weak.length) return "weak-window-only-lead-blocked";
    return "window-only-deferred";
  }

  if (row.staticQueue === "missing-generated-source-context") {
    if (strong.length || asArray(row.sameLabelSiblingCandidates).length) return "source-context-bridge-review";
    return "raw-source-lookup-required";
  }

  if (row.staticQueue === "needs-parent-child-value-bridge") {
    if (strong.some(hasValue)) return "parent-child-value-bridge-review";
    if (weak.some(hasValue)) return "weak-parent-child-value-lead-blocked";
    return "parent-child-source-lookup-required";
  }

  if (row.staticQueue === "needs-static-description-bridge") {
    if (strong.some(hasDescription)) return "static-description-bridge-review";
    if (weak.some(hasDescription)) return "weak-description-lead-blocked";
    return "static-description-search-required";
  }

  if (row.staticQueue === "needs-value-extraction-or-selector") {
    if (strong.some(hasValue)) return "value-selector-bridge-review";
    if (weak.some(hasValue)) return "weak-value-lead-blocked";
    return "value-selector-or-parameter-proof-required";
  }

  if (row.staticQueue === "needs-formula-zone-classification") {
    if (strong.some(hasFormulaZone)) return "formula-zone-classifier-review";
    if (weak.some(hasFormulaZone)) return "weak-formula-zone-lead-blocked";
    return "formula-zone-classifier-required";
  }

  return "manual-review";
}

function compactCandidate(candidate) {
  return {
    relation: candidate.relation,
    tableName: candidate.tableName,
    key: candidate.key,
    category: candidate.category,
    uid: candidate.uid,
    label: candidate.label,
    valueStatus: candidate.valueStatus,
    formulaReadiness: candidate.formulaReadiness,
    hasDescription: hasDescription(candidate),
    hasFormulaZone: hasFormulaZone(candidate),
    selectedValueCount: candidate.selectedValueCount,
    formulaZoneIds: asArray(candidate.formulaZoneIds),
    formulaTermIds: asArray(candidate.formulaTermIds),
    contributionGroups: asArray(candidate.contributionGroups),
    selectedValues: asArray(candidate.selectedValues),
    runtimeProofRequired: asArray(candidate.runtimeProofRequired),
    valueBlockers: asArray(candidate.valueBlockers),
    descriptionRef: candidate.descriptionRef ?? null,
  };
}

function buildRows(bridgeReport, options) {
  return asArray(bridgeReport.rows)
    .slice(0, options.maxRows)
    .map((row) => {
      const strong = strongCandidates(row);
      const weak = weakCandidates(row);
      const gate = classifyGate(row, strong, weak);
      return {
        sourceLabel: row.sourceLabel,
        sourceId: row.sourceId,
        sourceKind: row.sourceKind,
        nextDevAction: row.nextDevAction,
        staticQueue: row.staticQueue,
        recommendation: row.recommendation,
        gate,
        promotionReady: gate.endsWith("-review") && !gate.startsWith("context-only"),
        contextOnly: gate === "context-only-window-proof",
        blockedEffectLinks: row.blockedEffectLinks ?? 0,
        topMissingEvidence: asArray(row.topMissingEvidence),
        directGeneratedEntries: asArray(row.directGeneratedEntries).map(compactCandidate),
        strongCandidates: strong.map(compactCandidate),
        weakCandidates: weak.map(compactCandidate),
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

function candidateSummary(candidate) {
  if (!candidate) return "";
  const values = candidate.selectedValueCount ? `values:${candidate.selectedValueCount}` : "";
  const zones = asArray(candidate.formulaZoneIds).length ? `zones:${asArray(candidate.formulaZoneIds).slice(0, 3).join(",")}` : "";
  return [candidate.key, `[${candidate.relation}]`, candidate.valueStatus, values, zones].filter(Boolean).join(" ");
}

function buildMarkdown(report) {
  const promotionRows = report.rows.filter((row) => row.promotionReady);
  const contextRows = report.rows.filter((row) => row.contextOnly);
  const weakRows = report.rows.filter((row) => row.gate.includes("weak"));
  const deferredRows = report.rows.filter((row) => !row.promotionReady && !row.contextOnly && !row.gate.includes("weak"));

  const lines = [
    "# Modifier Promotion Review",
    "",
    "- Dev-audit report only.",
    "- Strong candidates require matching label identity or same UID plus same label.",
    "- Cross-category same-UID matches are blocked as weak leads.",
    "- This report does not modify parser, DPS totals, worker, monitor, overlay, hotkeys, runtime capture, or shipped modifier UI paths.",
    "",
    "## Summary",
    "",
    `- Reviewed rows: ${report.summary.reviewedRows}`,
    `- Promotion-review rows: ${promotionRows.length}`,
    `- Context-only rows: ${contextRows.length}`,
    `- Weak-blocked rows: ${weakRows.length}`,
    `- Deferred rows: ${deferredRows.length}`,
    "",
    "### By Gate",
    "",
    markdownTable(["Gate", "Rows"], Object.entries(report.summary.byGate).map(([key, value]) => [key, value])),
    "",
  ];

  if (promotionRows.length) {
    lines.push("## Promotion Review Rows", "");
    lines.push(markdownTable(
      ["Source", "Kind", "Queue", "Gate", "Blocked", "Strong Candidate", "Top Missing"],
      promotionRows.map((row) => [
        row.sourceLabel,
        row.sourceKind,
        row.staticQueue,
        row.gate,
        row.blockedEffectLinks,
        candidateSummary(row.strongCandidates[0]),
        asArray(row.topMissingEvidence).slice(0, 3).map((entry) => `${entry.evidence ?? entry[0]} (${entry.rows ?? entry[1] ?? ""})`).join("; "),
      ]),
    ));
    lines.push("");
  }

  if (contextRows.length) {
    lines.push("## Context Only Rows", "");
    lines.push(markdownTable(
      ["Source", "Kind", "Queue", "Gate", "Candidate"],
      contextRows.map((row) => [
        row.sourceLabel,
        row.sourceKind,
        row.staticQueue,
        row.gate,
        candidateSummary(row.strongCandidates[0]),
      ]),
    ));
    lines.push("");
  }

  if (weakRows.length) {
    lines.push("## Weak Blocked Rows", "");
    lines.push(markdownTable(
      ["Source", "Kind", "Queue", "Gate", "Weak Candidate"],
      weakRows.map((row) => [
        row.sourceLabel,
        row.sourceKind,
        row.staticQueue,
        row.gate,
        candidateSummary(row.weakCandidates[0]),
      ]),
    ));
    lines.push("");
  }

  lines.push("## Deferred Rows", "");
  lines.push(markdownTable(
    ["Source", "Kind", "Queue", "Gate", "Recommendation"],
    deferredRows.slice(0, 80).map((row) => [
      row.sourceLabel,
      row.sourceKind,
      row.staticQueue,
      row.gate,
      row.recommendation,
    ]),
  ));
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function buildReport(options) {
  const bridgeReport = readJson(options.bridgeJson);
  const rows = buildRows(bridgeReport, options);

  return {
    generatedAt: new Date().toISOString(),
    inputPaths: {
      bridgeJson: path.relative(repoRoot, options.bridgeJson),
    },
    boundaries: [
      "Dev-audit report only.",
      "Strong candidates require matching label identity or same UID plus same label.",
      "Cross-category same-UID matches are blocked as weak leads.",
      "Does not modify parser, DPS totals, worker, monitor, overlay, hotkeys, runtime capture, or shipped modifier UI paths.",
    ],
    summary: {
      reviewedRows: rows.length,
      promotionReadyRows: rows.filter((row) => row.promotionReady).length,
      contextOnlyRows: rows.filter((row) => row.contextOnly).length,
      weakBlockedRows: rows.filter((row) => row.gate.includes("weak")).length,
      deferredRows: rows.filter((row) => !row.promotionReady && !row.contextOnly && !row.gate.includes("weak")).length,
      byGate: countBy(rows, (row) => row.gate),
      promotionByQueue: countBy(rows.filter((row) => row.promotionReady), (row) => row.staticQueue),
      weakByQueue: countBy(rows.filter((row) => row.gate.includes("weak")), (row) => row.staticQueue),
    },
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

  console.log(`Reviewed rows: ${report.summary.reviewedRows}`);
  console.log(JSON.stringify(report.summary.byGate, null, 2));
  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
}

main();
