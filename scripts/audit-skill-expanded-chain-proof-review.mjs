#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    manifest: path.join(repoRoot, "DEV_exports", "skill-expanded-chain-proof-manifest.json"),
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-allocation-expanded-chain.json"),
    blockers: path.join(repoRoot, "DEV_exports", "skill-coefficient-blockers-expanded-chain.json"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-expanded-chain-proof-review.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-expanded-chain-proof-review.md"),
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
      case "--manifest":
        options.manifest = path.resolve(next());
        break;
      case "--chain":
        options.chain = path.resolve(next());
        break;
      case "--blockers":
        options.blockers = path.resolve(next());
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
  console.log(`Skill Expanded Chain Proof Review

Usage:
  node scripts/audit-skill-expanded-chain-proof-review.mjs [options]

Notes:
  Dev-only review that joins the expanded chain manifest, chain allocation, and
  coefficient blocker report. It classifies what still blocks each chain before
  any modifier contribution math can be trusted.
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

function formatPct(value, digits = 1) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return `${(number * 100).toFixed(digits)}%`;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const values = asArray(selector(row));
    for (const value of values) {
      if (!value) continue;
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function byRecountId(chainReport) {
  const map = new Map();
  for (const row of asArray(chainReport.chains)) {
    const id = finiteNumber(row.recountId);
    if (id !== null) map.set(String(id), row);
  }
  return map;
}

function byDamageId(blockerReport) {
  const map = new Map();
  for (const row of asArray(blockerReport.rows)) {
    const id = finiteNumber(row.damageId);
    if (id !== null) map.set(String(id), row);
  }
  return map;
}

function strongestChainStatus(manifestRow, chainRow, childBlockers) {
  if (manifestRow.proofStatus === "partial-proof-only") return "partial-proof-only";
  if (manifestRow.proofStatus === "targeted-capture-needed") return "targeted-capture-needed";
  if (!chainRow) return "expanded-proof-missing-chain-report";
  if (chainRow.allocationStatus !== "exact-observed-all-known-children") return "expanded-proof-sample-blocked";

  const chainBlockers = new Set(asArray(chainRow.blockers));
  const childReadiness = new Set(childBlockers.map((row) => row?.readiness).filter(Boolean));
  const childBlockerSet = new Set(childBlockers.flatMap((row) => asArray(row?.blockers)));

  if (childReadiness.has("damage-attr-blocked") || childBlockerSet.has("missing-damage-attr-row")) {
    return "expanded-proof-runtime-bridge-blocked";
  }
  if (
    chainBlockers.has("missing-child-static-coefficients") ||
    childReadiness.has("coefficient-schema-blocked") ||
    childReadiness.has("chain-coefficient-schema-blocked") ||
    childBlockerSet.has("missing-nonzero-static-coefficient")
  ) {
    return "expanded-proof-coefficient-blocked";
  }
  if (chainBlockers.has("active-modifier-spread-not-stripped") || childReadiness.has("modifier-strip-required")) {
    return "expanded-proof-modifier-strip-required";
  }
  if (chainRow.replayStatus === "replay-validation-candidate") return "expanded-replay-candidate";
  return "expanded-proof-evidence-only";
}

function nextAction(status) {
  switch (status) {
    case "expanded-proof-runtime-bridge-blocked":
      return "extend generated runtime/surface bridges for child damage rows before replay";
    case "expanded-proof-coefficient-blocked":
      return "find strict child coefficient/value fields for all emitted child damage IDs";
    case "expanded-proof-modifier-strip-required":
      return "strip active formula-ready modifier terms and replay against packet totals";
    case "expanded-proof-sample-blocked":
    case "partial-proof-only":
    case "targeted-capture-needed":
      return "collect or isolate samples where all sibling child damage IDs are present";
    case "expanded-replay-candidate":
      return "run formula replay validation against observed packet totals";
    default:
      return "keep as dev evidence only";
  }
}

function buildReport(manifest, chainReport, blockerReport, options) {
  const chainsByRecount = byRecountId(chainReport);
  const blockersByDamage = byDamageId(blockerReport);

  const rows = asArray(manifest.rows).map((manifestRow) => {
    const recountId = finiteNumber(manifestRow.recountId);
    const chainRow = recountId === null ? null : chainsByRecount.get(String(recountId));
    const knownIds = asArray(manifestRow.knownDamageIds).map(String);
    const childBlockers = knownIds.map((id) => blockersByDamage.get(id)).filter(Boolean);
    const status = strongestChainStatus(manifestRow, chainRow, childBlockers);
    const childReadiness = countBy(childBlockers, (row) => [row.readiness]);
    const topBlockers = Object.entries(countBy(childBlockers, (row) => row.blockers))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      recountId,
      name: manifestRow.name,
      manifestProofStatus: manifestRow.proofStatus,
      proofReviewStatus: status,
      knownDamageIds: knownIds,
      observedDamageIds: asArray(chainRow?.observedDamageIds).map(String),
      missingDamageIds: asArray(manifestRow.missingDamageIds).map(String),
      selectedInputFiles: asArray(manifestRow.selectedInputFiles).map((entry) => entry.file),
      chainAllocation: chainRow?.allocationStatus ?? "",
      chainReplayStatus: chainRow?.replayStatus ?? "",
      observedValue: finiteNumber(chainRow?.observedValue) ?? 0,
      observedHits: finiteNumber(chainRow?.observedHits) ?? 0,
      coefficientCoverage: chainRow?.coefficientCoverage ?? null,
      maxFinalCoefficientShareDelta: finiteNumber(chainRow?.maxFinalCoefficientShareDelta),
      chainBlockers: asArray(chainRow?.blockers),
      childReadiness,
      topBlockers,
      nextAction: nextAction(status),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      manifest: options.manifest,
      chain: options.chain,
      blockers: options.blockers,
    },
    semantics: {
      boundary: "dev-only expanded chain proof review; no parser/runtime/UI changes",
      purpose: "classify chain proof blockers after intentional sample expansion",
      note: "observed packet totals are still the truth anchor; this report does not publish contribution math",
    },
    summary: {
      chains: rows.length,
      byProofReviewStatus: countBy(rows, (row) => [row.proofReviewStatus]),
      replayCandidateChains: rows.filter((row) => row.proofReviewStatus === "expanded-replay-candidate").length,
      observedValue: rows.reduce((sum, row) => sum + (finiteNumber(row.observedValue) ?? 0), 0),
      observedHits: rows.reduce((sum, row) => sum + (finiteNumber(row.observedHits) ?? 0), 0),
    },
    rows,
  };
}

function renderMarkdown(report) {
  const statusRows = Object.entries(report.summary.byProofReviewStatus).map(([status, count]) => [status, count]);
  return [
    "# Skill Expanded Chain Proof Review",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "This dev-only review joins the expanded chain manifest, packet-anchored chain allocation, and coefficient blocker reports. It does not change runtime parsing or publish contribution math.",
    "",
    "## Summary",
    "",
    `- Chains: ${formatNumber(report.summary.chains)}`,
    `- Replay candidate chains: ${formatNumber(report.summary.replayCandidateChains)}`,
    `- Observed chain value in reviewed rows: ${formatNumber(report.summary.observedValue)}`,
    `- Observed chain hits in reviewed rows: ${formatNumber(report.summary.observedHits)}`,
    "",
    "### Status Counts",
    "",
    markdownTable(["Proof Review Status", "Chains"], statusRows),
    "",
    "## Chain Review",
    "",
    markdownTable(
      ["Recount", "Status", "Allocation", "Observed/Known", "Final", "Hits", "Coeff Rows", "Max Delta", "Top Blockers", "Next Action"],
      report.rows.map((row) => [
        row.name,
        row.proofReviewStatus,
        row.chainAllocation,
        `${row.observedDamageIds.length}/${row.knownDamageIds.length}`,
        formatNumber(row.observedValue),
        formatNumber(row.observedHits),
        row.coefficientCoverage
          ? `${formatNumber(row.coefficientCoverage.rowsWithSingleCoefficient)}/${formatNumber(row.coefficientCoverage.observedRows)}`
          : "",
        row.maxFinalCoefficientShareDelta === null ? "" : formatPct(row.maxFinalCoefficientShareDelta, 2),
        row.topBlockers.map((entry) => `${entry.name} x${entry.count}`).join("; "),
        row.nextAction,
      ])
    ),
    "",
    "## Inputs",
    "",
    `- manifest: ${report.inputs.manifest}`,
    `- chain: ${report.inputs.chain}`,
    `- blockers: ${report.inputs.blockers}`,
    "",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const manifest = readJson(options.manifest);
  const chain = readJson(options.chain);
  const blockers = readJson(options.blockers);
  const report = buildReport(manifest, chain, blockers, options);

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(
    `Wrote ${path.relative(repoRoot, options.outJson)} and ${path.relative(repoRoot, options.outMd)}`
  );
  console.log(`Replay candidates=${report.summary.replayCandidateChains}; statuses=${JSON.stringify(report.summary.byProofReviewStatus)}`);
}

main();
