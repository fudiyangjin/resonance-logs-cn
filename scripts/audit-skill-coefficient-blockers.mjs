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
    ledger: path.join(repoRoot, "DEV_exports", "skill-base-hit-ledger-latest4.json"),
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-allocation-latest4.json"),
    surface: DEFAULT_SURFACE_PATH,
    outJson: path.join(repoRoot, "DEV_exports", "skill-coefficient-blockers-latest4.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-coefficient-blockers-latest4.md"),
    maxRows: 120,
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
      case "--ledger":
        options.ledger = path.resolve(next());
        break;
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
      case "--max-rows":
        options.maxRows = Number(next());
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
  console.log(`Skill Coefficient Blocker Audit

Usage:
  node scripts/audit-skill-coefficient-blockers.mjs [options]

Options:
  --ledger <path>     Skill base-hit ledger JSON. Default: DEV_exports/skill-base-hit-ledger-latest4.json
  --chain <path>      Skill chain allocation JSON. Default: DEV_exports/skill-chain-allocation-latest4.json
  --surface <path>    Skill coefficient surface probe JSON.
  --out-json <path>   JSON report path. Default: DEV_exports/skill-coefficient-blockers-latest4.json
  --out-md <path>     Markdown report path. Default: DEV_exports/skill-coefficient-blockers-latest4.md
  --max-rows <count>  Max Markdown rows per table. Default: 120
  --help              Show this help.

Notes:
  This is a dev-only readiness report. It does not calculate or publish modifier
  contribution. It identifies which observed damage IDs are blocked by missing
  static coefficient linkage, chain allocation, active modifier spread, or
  missing crit/base evidence before formula replay can use them.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function byDamageId(rows) {
  const map = new Map();
  for (const row of asArray(rows)) {
    const id = finiteNumber(row?.damageId);
    if (id !== null) map.set(String(id), row);
  }
  return map;
}

function chainChildIndex(chainReport) {
  const map = new Map();
  for (const chain of asArray(chainReport?.chains)) {
    for (const child of asArray(chain.childRows)) {
      const id = finiteNumber(child?.damageId);
      if (id === null) continue;
      map.set(String(id), { chain, child });
    }
  }
  return map;
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function coefficientValues(surfaceRow, chainChild) {
  const values = [];
  for (const candidate of asArray(surfaceRow?.coefficientCandidates)) {
    const value = finiteNumber(candidate?.value ?? candidate?.floatAt16);
    if (value !== null && value > 0) values.push(value);
  }
  for (const value of asArray(chainChild?.coefficientValues)) {
    const number = finiteNumber(value);
    if (number !== null && number > 0) values.push(number);
  }
  return uniqueValues(values).sort((left, right) => Number(left) - Number(right));
}

function coefficientStatus(values, surfaceRow, chainChild) {
  if (values.length === 1) return "single-candidate";
  if (values.length > 1) return "ambiguous-candidates";
  if (asArray(surfaceRow?.skillEffects).length || asArray(surfaceRow?.skillFights).length || chainChild) {
    return "linked-but-zero-or-missing";
  }
  return "missing-link";
}

function rowBlockers(ledgerRow, surfaceRow, chainEntry, values, coeffStatus) {
  const blockers = new Set();
  if (!surfaceRow?.damageAttr) blockers.add("missing-damage-attr-row");
  if (!asArray(surfaceRow?.skillEffects).length) blockers.add("missing-skill-effect-link");
  if (!asArray(surfaceRow?.skillFights).length) blockers.add("missing-skill-fight-link");
  if (coeffStatus === "linked-but-zero-or-missing" || coeffStatus === "missing-link") {
    blockers.add("missing-nonzero-static-coefficient");
  }
  if (coeffStatus === "ambiguous-candidates") blockers.add("ambiguous-static-coefficient");
  if ((ledgerRow?.critSamplesMissingMultiplier ?? 0) > 0) blockers.add("crit-multiplier-snapshot-missing");
  if ((finiteNumber(ledgerRow?.decritPerAttack?.spreadPct) ?? 0) > 0.15) blockers.add("active-modifier-spread-not-stripped");
  if (asArray(ledgerRow?.recountSiblingDamageIds).length > 1 && !chainEntry) {
    blockers.add("multi-damage-chain-allocation-required");
  }
  if (chainEntry?.chain?.allocationStatus === "observed-subset-of-known-chain") {
    blockers.add("chain-allocation-observed-subset");
  }
  for (const blocker of asArray(chainEntry?.child?.runtimeBlockers)) {
    if (blocker && blocker !== "needs-chain-allocation") blockers.add(`runtime:${blocker}`);
  }
  for (const blocker of asArray(chainEntry?.chain?.blockers)) {
    if (blocker) blockers.add(blocker);
  }
  return [...blockers].sort();
}

function readiness(blockers, coeffStatus, chainEntry, ledgerRow) {
  if (blockers.includes("missing-damage-attr-row")) return "damage-attr-blocked";
  if (blockers.includes("missing-nonzero-static-coefficient") || blockers.includes("ambiguous-static-coefficient")) {
    return "coefficient-schema-blocked";
  }
  if (blockers.includes("missing-child-static-coefficients")) return "chain-coefficient-schema-blocked";
  if (blockers.includes("chain-allocation-observed-subset") || blockers.includes("multi-damage-chain-allocation-required")) {
    return "chain-sample-blocked";
  }
  if (blockers.includes("active-modifier-spread-not-stripped")) return "modifier-strip-required";
  if (blockers.includes("crit-multiplier-snapshot-missing")) return "crit-snapshot-blocked";
  if (coeffStatus === "single-candidate" && (!chainEntry || chainEntry.chain?.allocationStatus === "exact-observed-all-known-children")) {
    return "replay-candidate";
  }
  if (asArray(ledgerRow?.recountSiblingDamageIds).length <= 1 && coeffStatus === "single-candidate") {
    return "single-damage-replay-candidate";
  }
  return "evidence-only";
}

function nextAction(status, blockers) {
  if (status === "coefficient-schema-blocked") return "map static coefficient/value-cal field for linked SkillEffect/Fight rows";
  if (status === "chain-coefficient-schema-blocked") return "map missing sibling child static coefficients before parent-chain replay";
  if (status === "chain-sample-blocked") return "collect/scan samples where all known child damage IDs appear for this recount parent";
  if (status === "modifier-strip-required") return "strip active formula-ready modifier terms before trusting base ratios";
  if (status === "crit-snapshot-blocked") return "capture crit multiplier snapshots for every crit sample";
  if (blockers.some((blocker) => blocker.startsWith("runtime:"))) return "regenerate/extend SkillDamageChainRuntime bridge";
  if (status.includes("candidate")) return "validate replay math against observed packet totals";
  return "keep as evidence until stronger static/runtime proof exists";
}

function summarize(rows) {
  const countBy = (selector) => {
    const counts = {};
    for (const row of rows) {
      const values = asArray(selector(row));
      for (const value of values) {
        counts[value] = (counts[value] ?? 0) + 1;
      }
    }
    return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
  };
  return {
    damageRows: rows.length,
    finalDamage: rows.reduce((sum, row) => sum + (finiteNumber(row.finalValue) ?? 0), 0),
    hits: rows.reduce((sum, row) => sum + (finiteNumber(row.hits) ?? 0), 0),
    byReadiness: countBy((row) => [row.readiness]),
    byCoefficientStatus: countBy((row) => [row.coefficientStatus]),
    byBlocker: countBy((row) => row.blockers),
  };
}

function buildReport(ledger, chainReport, surfaceReport, options) {
  const ledgerRows = byDamageId(ledger.damageRows);
  const surfaceRows = byDamageId(surfaceReport.chainCandidates);
  const chainChildren = chainChildIndex(chainReport);

  const rows = [...ledgerRows.values()]
    .map((ledgerRow) => {
      const damageId = String(ledgerRow.damageId);
      const surfaceRow = surfaceRows.get(damageId);
      const chainEntry = chainChildren.get(damageId);
      const values = coefficientValues(surfaceRow, chainEntry?.child);
      const coeffStatus = coefficientStatus(values, surfaceRow, chainEntry?.child);
      const blockers = rowBlockers(ledgerRow, surfaceRow, chainEntry, values, coeffStatus);
      const ready = readiness(blockers, coeffStatus, chainEntry, ledgerRow);
      return {
        damageId: finiteNumber(damageId),
        name: ledgerRow.displayName || surfaceRow?.displayName || damageId,
        category: ledgerRow.category || surfaceRow?.category || "",
        finalValue: ledgerRow.totalValue,
        hits: ledgerRow.hits,
        recountIds: asArray(ledgerRow.parentRecountIds),
        recountNames: asArray(ledgerRow.parentRecountNames),
        linkedSource: ledgerRow.linkedSource || surfaceRow?.generatedBreakdown?.linkedSource || "",
        linkedId: ledgerRow.linkedId ?? surfaceRow?.damageAttr?.linkedId ?? null,
        damageAttrLinkedId: surfaceRow?.damageAttr?.linkedId ?? null,
        damageKind: ledgerRow.damageKind || surfaceRow?.damageAttr?.damageKind || "",
        skillEffectCount: asArray(surfaceRow?.skillEffects).length,
        skillFightCount: asArray(surfaceRow?.skillFights).length,
        coefficientStatus: coeffStatus,
        coefficientValues: values,
        chainAllocation: chainEntry?.chain?.allocationStatus ?? (asArray(ledgerRow.recountSiblingDamageIds).length > 1 ? "not-observed-in-chain-report" : "single-damage-parent"),
        chainReplayStatus: chainEntry?.chain?.replayStatus ?? "",
        decritAttackSpreadPct: ledgerRow.decritPerAttack?.spreadPct ?? null,
        critSamplesMissingMultiplier: ledgerRow.critSamplesMissingMultiplier ?? 0,
        blockers,
        readiness: ready,
        nextAction: nextAction(ready, blockers),
      };
    })
    .sort((left, right) => {
      const leftRank = readinessRank(left.readiness);
      const rightRank = readinessRank(right.readiness);
      return leftRank - rightRank || (right.finalValue ?? 0) - (left.finalValue ?? 0);
    });

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      ledger: options.ledger,
      chain: options.chain,
      surface: options.surface,
    },
    semantics: {
      boundary: "dev-only audit; no parser/runtime contribution calculation",
      finalDamageAnchor: "observed packet final damage remains the truth source",
      coefficientUse: "static coefficients stay candidate-only until replay math validates against observed packets",
    },
    summary: summarize(rows),
    rows,
  };
}

function readinessRank(status) {
  return {
    "replay-candidate": 0,
    "single-damage-replay-candidate": 1,
    "modifier-strip-required": 2,
    "chain-coefficient-schema-blocked": 3,
    "chain-sample-blocked": 4,
    "coefficient-schema-blocked": 5,
    "crit-snapshot-blocked": 6,
    "damage-attr-blocked": 7,
    "evidence-only": 8,
  }[status] ?? 99;
}

function renderMarkdown(report, options) {
  const summaryRows = Object.entries(report.summary.byReadiness).map(([status, count]) => [
    status,
    count,
    formatNumber(report.rows.filter((row) => row.readiness === status).reduce((sum, row) => sum + (finiteNumber(row.finalValue) ?? 0), 0)),
  ]);
  const blockerRows = Object.entries(report.summary.byBlocker)
    .slice(0, options.maxRows)
    .map(([blocker, count]) => [blocker, count]);
  const detailRows = report.rows.slice(0, options.maxRows).map((row) => [
    row.name,
    row.damageId,
    row.category,
    formatNumber(row.finalValue),
    formatNumber(row.hits),
    row.recountNames.join(", ") || row.recountIds.join(", "),
    row.coefficientStatus,
    row.coefficientValues.join(", "),
    row.chainAllocation,
    row.decritAttackSpreadPct === null ? "" : formatPct(row.decritAttackSpreadPct, 2),
    row.readiness,
    row.nextAction,
    row.blockers.slice(0, 4).join("; "),
  ]);

  return [
    "# Skill Coefficient Blocker Audit",
    "",
    "This is a dev-only readiness report. It joins the packet-anchored base-hit ledger, the chain allocation audit, and the game-file coefficient surface probe. It does not publish modifier contribution math.",
    "",
    "## Summary",
    "",
    `- Damage rows: ${formatNumber(report.summary.damageRows)}`,
    `- Final damage covered: ${formatNumber(report.summary.finalDamage)}`,
    `- Hits covered: ${formatNumber(report.summary.hits)}`,
    "",
    "### Readiness",
    "",
    summaryRows.length ? markdownTable(["Readiness", "Rows", "Final Damage"], summaryRows) : "_None._",
    "",
    "### Top Blockers",
    "",
    blockerRows.length ? markdownTable(["Blocker", "Rows"], blockerRows) : "_None._",
    "",
    "## Damage Row Matrix",
    "",
    detailRows.length
      ? markdownTable(
          [
            "Name",
            "Damage ID",
            "Category",
            "Final",
            "Hits",
            "Recount",
            "Coeff Status",
            "Coeff",
            "Chain",
            "Spread",
            "Readiness",
            "Next Action",
            "Blockers",
          ],
          detailRows
        )
      : "_None._",
    "",
    "## Inputs",
    "",
    `- Ledger: ${report.inputs.ledger}`,
    `- Chain allocation: ${report.inputs.chain}`,
    `- Surface probe: ${report.inputs.surface}`,
    "",
  ].join("\n");
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const ledger = readJson(options.ledger);
  const chain = readJson(options.chain);
  const surface = readJson(options.surface);
  const report = buildReport(ledger, chain, surface, options);

  ensureParentDir(options.outJson);
  ensureParentDir(options.outMd);
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(options.outMd, renderMarkdown(report, options));

  console.log(`Damage rows: ${report.summary.damageRows}`);
  console.log(`Readiness: ${JSON.stringify(report.summary.byReadiness)}`);
  console.log(`Top blocker: ${Object.entries(report.summary.byBlocker)[0]?.join(" = ") ?? "none"}`);
  console.log(`Output: ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Markdown: ${path.relative(repoRoot, options.outMd)}`);
}

main();
