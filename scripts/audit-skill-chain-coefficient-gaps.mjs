#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    staticGaps: path.join(repoRoot, "DEV_exports", "skill-static-coefficient-gap-audit.json"),
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-allocation-latest4.json"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-chain-coefficient-gap-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-chain-coefficient-gap-audit.md"),
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
      case "--chain":
        options.chain = path.resolve(next());
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
  console.log(`Skill Chain Coefficient Gap Audit

Usage:
  node scripts/audit-skill-chain-coefficient-gaps.mjs [options]

Options:
  --static-gaps <path>    Static coefficient gap audit JSON.
  --chain <path>          Skill chain allocation audit JSON.
  --out-json <path>       JSON report path.
  --out-md <path>         Markdown report path.
  --help                  Show this help.

Notes:
  Dev-only parent-chain gap split. This does not modify parser/runtime/UI.
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

function formatPct(value, digits = 1) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return `${(number * 100).toFixed(digits)}%`;
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

function buildStaticIndex(staticGapReport) {
  return new Map(asArray(staticGapReport.rows).map((row) => [String(finiteNumber(row.damageId)), row]));
}

function childVerdict(child, staticRow) {
  if (child.coefficientStatus === "single") return "static-coefficient-present";
  if (child.coefficientStatus === "ambiguous") return "ambiguous-coefficient";
  if (staticRow?.gapClass === "lucky-formula-link-gap") return "lucky-formula-lane";
  if (staticRow?.gapClass === "chain-sample-gap") return "sample-gap";
  if (staticRow?.gapClass === "chain-child-coefficient-gap") return "missing-child-coefficient";
  if (staticRow?.gapClass === "linked-zero-coefficient-field") return "linked-zero-coefficient-field";
  if (child.coefficientStatus === "missing") return "missing-child-coefficient";
  return "unknown";
}

function chainVerdict(chain, children) {
  const missingKnown = asArray(chain.missingKnownDamageIds).length > 0;
  const missingCoeff = children.some((child) => child.childVerdict === "missing-child-coefficient");
  const linkedZero = children.some((child) => child.childVerdict === "linked-zero-coefficient-field");
  const luckyLane = children.some((child) => child.childVerdict === "lucky-formula-lane");
  const coeffReady = children.length > 0 && children.every((child) => child.childVerdict === "static-coefficient-present");

  if (luckyLane) return "lucky-formula-lane";
  if (missingKnown && missingCoeff) return "needs-complete-sample-and-child-coefficients";
  if (missingKnown) return "needs-complete-child-sample";
  if (missingCoeff) return "needs-child-coefficient-bridge";
  if (linkedZero) return "needs-linked-zero-field-proof";
  if (coeffReady) return "coefficient-ready-strip-proof-needed";
  return "blocked-or-unclear";
}

function compactSurfaceHints(staticRow) {
  return asArray(staticRow?.surfaceHints)
    .slice(0, 4)
    .map((hint) => {
      const floats = asArray(hint.floatHints).slice(0, 3).join("; ");
      return `${hint.table} x${hint.matches}${floats ? ` [${floats}]` : ""}`;
    });
}

function enrichChain(chain, staticByDamageId) {
  const children = asArray(chain.childRows).map((child) => {
    const staticRow = staticByDamageId.get(String(finiteNumber(child.damageId))) ?? null;
    return {
      damageId: finiteNumber(child.damageId),
      name: child.name,
      category: child.category,
      damageKind: child.damageKind,
      hits: finiteNumber(child.hits),
      finalValue: finiteNumber(child.finalValue),
      decritValue: finiteNumber(child.decritValue),
      finalShare: finiteNumber(child.finalShare),
      hitShare: finiteNumber(child.hitShare),
      coefficientStatus: child.coefficientStatus,
      coefficientValues: asArray(child.coefficientValues),
      coefficientShare: finiteNumber(child.coefficientShare),
      finalVsCoefficientDelta: finiteNumber(child.finalVsCoefficientDelta),
      ratioSpread: finiteNumber(child.ratioSpread),
      staticGapClass: staticRow?.gapClass ?? "",
      staticLinkedSource: staticRow?.linkedSource ?? "",
      staticLinkedId: finiteNumber(staticRow?.linkedId),
      staticBlockers: asArray(staticRow?.blockers),
      childVerdict: childVerdict(child, staticRow),
      surfaceHints: compactSurfaceHints(staticRow),
    };
  });

  const missingKnownDamageIds = asArray(chain.missingKnownDamageIds).map(String);
  return {
    recountId: finiteNumber(chain.recountId),
    recountNames: asArray(chain.recountNames),
    knownDamageIds: asArray(chain.knownDamageIds).map(String),
    observedDamageIds: asArray(chain.observedDamageIds).map(String),
    missingKnownDamageIds,
    observedOutsideKnownDamageIds: asArray(chain.observedOutsideKnownDamageIds).map(String),
    observedValue: finiteNumber(chain.observedValue),
    observedHits: finiteNumber(chain.observedHits),
    allocationStatus: chain.allocationStatus,
    observedFinalAllocationReady: Boolean(chain.observedFinalAllocationReady),
    replayStatus: chain.replayStatus,
    coefficientCoverage: chain.coefficientCoverage,
    blockers: asArray(chain.blockers),
    children,
    chainVerdict: chainVerdict(chain, children),
  };
}

function buildReport(staticGapReport, chainReport, options) {
  const staticByDamageId = buildStaticIndex(staticGapReport);
  const chains = asArray(chainReport.chains)
    .map((chain) => enrichChain(chain, staticByDamageId))
    .filter((chain) =>
      chain.children.some((child) =>
        ["missing-child-coefficient", "sample-gap", "linked-zero-coefficient-field", "lucky-formula-lane"].includes(child.childVerdict)
      ) || chain.missingKnownDamageIds.length
    )
    .sort((left, right) => (right.observedValue ?? 0) - (left.observedValue ?? 0));

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      staticGaps: options.staticGaps,
      chain: options.chain,
    },
    semantics: {
      boundary: "dev-only audit; no parser/runtime contribution calculation",
      finalDamageAnchor: "observed child packet totals are exact for emitted damage ids",
      purpose: "classify parent chain blocker type before any chain replay or contribution math",
    },
    summary: {
      chains: chains.length,
      finalDamage: chains.reduce((sum, chain) => sum + (chain.observedValue ?? 0), 0),
      hits: chains.reduce((sum, chain) => sum + (chain.observedHits ?? 0), 0),
      missingKnownChildren: chains.reduce((sum, chain) => sum + chain.missingKnownDamageIds.length, 0),
      missingCoefficientChildren: chains.reduce(
        (sum, chain) => sum + chain.children.filter((child) => child.childVerdict === "missing-child-coefficient").length,
        0
      ),
      byVerdict: Object.fromEntries(
        [...chains.reduce((map, chain) => map.set(chain.chainVerdict, (map.get(chain.chainVerdict) ?? 0) + 1), new Map()).entries()].sort(
          (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
        )
      ),
    },
    chains,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Skill Chain Coefficient Gap Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Chains: ${formatNumber(report.summary.chains)}`,
    `- Final damage covered: ${formatNumber(report.summary.finalDamage)}`,
    `- Hits covered: ${formatNumber(report.summary.hits)}`,
    `- Missing known child IDs: ${formatNumber(report.summary.missingKnownChildren)}`,
    `- Missing coefficient child rows: ${formatNumber(report.summary.missingCoefficientChildren)}`,
    "",
    markdownTable(
      ["Verdict", "Chains"],
      Object.entries(report.summary.byVerdict).map(([verdict, count]) => [verdict, count])
    ),
    "",
    "## Parent Chains",
    "",
    markdownTable(
      ["Recount", "ID", "Final", "Hits", "Observed/Known", "Missing IDs", "Coeff Rows", "Verdict", "Blockers"],
      report.chains.map((chain) => [
        chain.recountNames.join(", "),
        chain.recountId,
        formatShort(chain.observedValue),
        formatNumber(chain.observedHits),
        `${chain.observedDamageIds.length}/${chain.knownDamageIds.length}`,
        chain.missingKnownDamageIds.join(", "),
        `${chain.coefficientCoverage?.rowsWithSingleCoefficient ?? ""}/${chain.coefficientCoverage?.observedRows ?? ""}`,
        chain.chainVerdict,
        chain.blockers.join("; "),
      ])
    ),
    "",
    "## Child Rows",
    "",
    markdownTable(
      ["Recount", "Child", "Damage", "Final", "Hits", "Final Share", "Coeff", "Child Verdict", "Surface Hints"],
      report.chains.flatMap((chain) =>
        chain.children.map((child) => [
          chain.recountNames.join(", "),
          child.name,
          child.damageId,
          formatShort(child.finalValue),
          formatNumber(child.hits),
          formatPct(child.finalShare),
          asArray(child.coefficientValues).join(", ") || child.coefficientStatus,
          child.childVerdict,
          asArray(child.surfaceHints).join("; "),
        ])
      )
    ),
    "",
    "## Inputs",
    "",
    `- Static gaps: ${report.inputs.staticGaps}`,
    `- Chain allocation: ${report.inputs.chain}`,
    "",
  ];

  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const staticGapReport = readJson(options.staticGaps);
  const chainReport = readJson(options.chain);
  const report = buildReport(staticGapReport, chainReport, options);

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Chains: ${report.summary.chains}`);
  console.log(`Verdicts: ${Object.entries(report.summary.byVerdict).map(([name, count]) => `${name}=${count}`).join(", ")}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
