#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_SPREAD_LIMIT = 0.15;

const ALLOCATION_STATUS = {
  1: "single-damage-parent",
  2: "needs-chain-allocation",
  3: "multi-parent-damage",
  4: "unowned-damage-row",
};

const BLOCKER_CODES = {
  1: "missing-recount-parent",
  2: "needs-chain-allocation",
  3: "missing-skill-effect-link",
  4: "missing-skill-fight-link",
  5: "missing-nonzero-static-effect-value",
};

function parseArgs(argv) {
  const options = {
    ledger: path.join(repoRoot, "DEV_exports", "skill-base-hit-ledger.json"),
    runtime: path.join(repoRoot, "parser-data", "generated", "SkillDamageChainRuntime.json"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-chain-allocation.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-chain-allocation.md"),
    maxRows: 80,
    spreadLimit: DEFAULT_SPREAD_LIMIT,
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
      case "--runtime":
        options.runtime = path.resolve(next());
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
      case "--spread-limit":
        options.spreadLimit = Number(next());
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
  console.log(`Skill Chain Allocation Audit

Usage:
  node scripts/audit-skill-chain-allocation.mjs [options]

Options:
  --ledger <path>       Skill base-hit ledger JSON. Default: DEV_exports/skill-base-hit-ledger.json
  --runtime <path>      SkillDamageChainRuntime JSON. Default: parser-data/generated/SkillDamageChainRuntime.json
  --out-json <path>     JSON report path. Default: DEV_exports/skill-chain-allocation.json
  --out-md <path>       Markdown report path. Default: DEV_exports/skill-chain-allocation.md
  --max-rows <count>    Max Markdown rows per table. Default: 80
  --spread-limit <n>    Decrit/attack spread limit before replay remains blocked. Default: ${DEFAULT_SPREAD_LIMIT}
  --help                Show this help.

Notes:
  This report allocates observed final packet totals across child damage IDs in
  multi-damage Recount chains. It does not publish modifier contribution math.
  Static coefficient fields stay candidate evidence until replay explains the
  observed packet totals without active-modifier spread.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSortedNumbers(values) {
  return [...new Set(asArray(values).map(finiteNumber).filter((value) => value !== null))].sort((a, b) => a - b);
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

function runtimeString(runtime, index) {
  const number = finiteNumber(index);
  if (!number || number < 1) return "";
  return runtime.strings?.[number - 1] ?? "";
}

function decodeRuntimeDamage(runtime, damageId) {
  const row = runtime.damageChains?.[String(damageId)];
  if (!row) return null;
  return {
    damageId: finiteNumber(damageId) ?? damageId,
    recountIds: asArray(row[0]).map(finiteNumber).filter((value) => value !== null),
    allocationStatus: ALLOCATION_STATUS[row[1]] ?? "unknown",
    linkedId: finiteNumber(row[2]) ?? null,
    linkedSource: runtimeString(runtime, row[3]),
    damageKind: runtimeString(runtime, row[4]),
    baseSkillId: finiteNumber(row[5]) ?? null,
    recountOwnerSkillId: finiteNumber(row[6]) ?? null,
    coefficientCandidates: asArray(row[7]).map((candidate) => ({
      effectId: finiteNumber(candidate?.[0]) ?? null,
      skillId: finiteNumber(candidate?.[1]) ?? null,
      value: finiteNumber(candidate?.[2]) ?? null,
    })),
    skillEffects: asArray(row[8]),
    skillFights: asArray(row[9]),
    formulaReady: row[10] === 1,
    blockerCodes: asArray(row[11]).map((code) => BLOCKER_CODES[code] ?? `unknown-${code}`),
  };
}

function primaryCoefficient(decoded) {
  const values = uniqueSortedNumbers(
    asArray(decoded?.coefficientCandidates)
      .map((candidate) => candidate.value)
      .filter((value) => value !== null && value > 0)
  );
  return {
    values,
    primary: values.length === 1 ? values[0] : null,
    status: values.length === 0 ? "missing" : values.length === 1 ? "single" : "ambiguous",
  };
}

function buildDamageRowIndex(ledger, runtime) {
  const rows = new Map();
  for (const row of asArray(ledger.damageRows)) {
    const damageId = finiteNumber(row.damageId);
    if (damageId === null) continue;
    const decoded = decodeRuntimeDamage(runtime, damageId);
    const coefficient = primaryCoefficient(decoded);
    rows.set(String(damageId), {
      ...row,
      damageId,
      runtime: decoded,
      coefficient,
    });
  }
  return rows;
}

function knownDamageIdsForRecount(runtime, recountId, observedRows) {
  const runtimeChain = runtime.recountChains?.[String(recountId)];
  const runtimeIds = uniqueSortedNumbers(runtimeChain?.damageIds);
  if (runtimeIds.length) return runtimeIds;
  return uniqueSortedNumbers(observedRows.flatMap((row) => row.recountSiblingDamageIds));
}

function buildChainGroups(ledger, runtime, options) {
  const damageRows = buildDamageRowIndex(ledger, runtime);
  const byRecount = new Map();

  for (const row of damageRows.values()) {
    for (const recountId of asArray(row.parentRecountIds)) {
      const key = String(recountId);
      const entry = byRecount.get(key) ?? {
        recountId,
        recountNames: new Set(),
        rows: [],
      };
      for (const name of asArray(row.parentRecountNames)) {
        if (name) entry.recountNames.add(name);
      }
      entry.rows.push(row);
      byRecount.set(key, entry);
    }
  }

  return [...byRecount.values()].map((entry) => summarizeChain(entry, runtime, options));
}

function share(value, total) {
  const number = finiteNumber(value);
  const denominator = finiteNumber(total);
  return number !== null && denominator && denominator > 0 ? number / denominator : null;
}

function ratioSpread(row) {
  return finiteNumber(row.decritPerAttack?.spreadPct);
}

function summarizeChain(entry, runtime, options) {
  const observedRows = [...entry.rows].sort((left, right) => right.totalValue - left.totalValue);
  const knownDamageIds = knownDamageIdsForRecount(runtime, entry.recountId, observedRows);
  const observedDamageIds = uniqueSortedNumbers(observedRows.map((row) => row.damageId));
  const observedSet = new Set(observedDamageIds.map(String));
  const knownSet = new Set(knownDamageIds.map(String));
  const missingKnownDamageIds = knownDamageIds.filter((id) => !observedSet.has(String(id)));
  const observedOutsideKnownDamageIds = observedDamageIds.filter((id) => knownSet.size && !knownSet.has(String(id)));
  const observedValue = observedRows.reduce((sum, row) => sum + (finiteNumber(row.totalValue) ?? 0), 0);
  const observedDecritValue = observedRows.reduce((sum, row) => sum + (finiteNumber(row.decritValueTotal) ?? 0), 0);
  const observedHits = observedRows.reduce((sum, row) => sum + (finiteNumber(row.hits) ?? 0), 0);
  const coefficientRows = observedRows.filter((row) => row.coefficient.status === "single");
  const coefficientReadyRows = coefficientRows.filter((row) => row.coefficient.primary !== null);
  const coefficientTotal = coefficientReadyRows.reduce((sum, row) => sum + row.coefficient.primary, 0);

  const childRows = observedRows.map((row) => {
    const coefficientShare = coefficientTotal > 0 && row.coefficient.primary !== null ? row.coefficient.primary / coefficientTotal : null;
    const finalShare = share(row.totalValue, observedValue);
    const decritShare = share(row.decritValueTotal, observedDecritValue);
    return {
      damageId: row.damageId,
      name: row.displayName,
      category: row.category,
      damageKind: row.damageKind,
      hits: row.hits,
      finalValue: row.totalValue,
      decritValue: row.decritValueTotal,
      finalShare,
      decritShare,
      hitShare: share(row.hits, observedHits),
      coefficientStatus: row.coefficient.status,
      coefficientValues: row.coefficient.values,
      coefficientShare,
      finalVsCoefficientDelta: finalShare !== null && coefficientShare !== null ? finalShare - coefficientShare : null,
      decritVsCoefficientDelta: decritShare !== null && coefficientShare !== null ? decritShare - coefficientShare : null,
      ratioSpread: ratioSpread(row),
      critSamplesMissingMultiplier: row.critSamplesMissingMultiplier,
      runtimeBlockers: row.runtime?.blockerCodes ?? ["missing-runtime-row"],
    };
  });

  const blockers = [];
  if (missingKnownDamageIds.length) blockers.push("missing-known-child-damage-ids");
  if (observedOutsideKnownDamageIds.length) blockers.push("observed-child-not-in-runtime-recount-chain");
  if (childRows.some((row) => row.runtimeBlockers.includes("missing-runtime-row"))) blockers.push("missing-runtime-chain-metadata");
  if (childRows.some((row) => row.coefficientStatus === "missing")) blockers.push("missing-child-static-coefficients");
  if (childRows.some((row) => row.coefficientStatus === "ambiguous")) blockers.push("ambiguous-child-static-coefficients");
  if (childRows.some((row) => (row.critSamplesMissingMultiplier ?? 0) > 0)) blockers.push("crit-multiplier-snapshot-missing");
  if (childRows.some((row) => row.ratioSpread !== null && row.ratioSpread > options.spreadLimit)) {
    blockers.push("active-modifier-spread-not-stripped");
  }
  if (observedDecritValue <= 0) blockers.push("missing-decrit-evidence");

  const allKnownChildrenObserved = knownDamageIds.length > 0 && missingKnownDamageIds.length === 0;
  const allObservedChildrenHaveCoefficient = observedRows.length > 0 && coefficientReadyRows.length === observedRows.length;
  const maxFinalCoeffDelta = maxAbs(childRows.map((row) => row.finalVsCoefficientDelta));
  const maxDecritCoeffDelta = maxAbs(childRows.map((row) => row.decritVsCoefficientDelta));
  const replayReady =
    allKnownChildrenObserved &&
    allObservedChildrenHaveCoefficient &&
    observedDecritValue > 0 &&
    !blockers.includes("crit-multiplier-snapshot-missing") &&
    !blockers.includes("active-modifier-spread-not-stripped") &&
    !blockers.includes("ambiguous-child-static-coefficients");

  return {
    recountId: entry.recountId,
    recountNames: [...entry.recountNames].sort(),
    knownDamageIds,
    observedDamageIds,
    missingKnownDamageIds,
    observedOutsideKnownDamageIds,
    observedValue,
    observedDecritValue,
    observedHits,
    allocationStatus: allKnownChildrenObserved ? "exact-observed-all-known-children" : "observed-subset-of-known-chain",
    observedFinalAllocationReady: observedRows.length > 0,
    replayStatus: replayReady ? "candidate-ready-for-replay-validation" : "blocked-or-evidence-only",
    coefficientCoverage: {
      observedRows: observedRows.length,
      rowsWithSingleCoefficient: coefficientReadyRows.length,
      rowsWithMissingCoefficient: childRows.filter((row) => row.coefficientStatus === "missing").length,
      rowsWithAmbiguousCoefficient: childRows.filter((row) => row.coefficientStatus === "ambiguous").length,
      coefficientTotal: coefficientTotal || null,
    },
    maxFinalCoefficientShareDelta: maxFinalCoeffDelta,
    maxDecritCoefficientShareDelta: maxDecritCoeffDelta,
    blockers,
    childRows,
  };
}

function maxAbs(values) {
  const finiteValues = values.map(finiteNumber).filter((value) => value !== null);
  if (!finiteValues.length) return null;
  return Math.max(...finiteValues.map((value) => Math.abs(value)));
}

function buildReport(ledger, runtime, options) {
  const chains = buildChainGroups(ledger, runtime, options).filter(
    (chain) => chain.knownDamageIds.length > 1 || chain.observedDamageIds.length > 1
  );
  const chainRows = chains.sort((left, right) => right.observedValue - left.observedValue || right.observedHits - left.observedHits);
  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      ledger: options.ledger,
      runtime: options.runtime,
    },
    semantics: {
      finalDamageAnchor: "observed child packet totals are exact for emitted damage ids",
      observedAllocation: "safe only for damage ids observed in this ledger",
      coefficientReplay: "candidate-only until static coefficients and decrit/attack spread validate against observed packets",
    },
    summary: {
      ledgerDamageRows: asArray(ledger.damageRows).length,
      chainsObserved: chainRows.length,
      chainsWithAllKnownChildrenObserved: chainRows.filter((chain) => chain.allocationStatus === "exact-observed-all-known-children").length,
      chainsWithMissingKnownChildren: chainRows.filter((chain) => chain.missingKnownDamageIds.length).length,
      chainsWithFullCoefficientCoverage: chainRows.filter(
        (chain) => chain.coefficientCoverage.rowsWithSingleCoefficient === chain.coefficientCoverage.observedRows
      ).length,
      chainsReadyForReplayValidation: chainRows.filter((chain) => chain.replayStatus === "candidate-ready-for-replay-validation").length,
      observedChainFinalValue: chainRows.reduce((sum, chain) => sum + chain.observedValue, 0),
      observedChainHits: chainRows.reduce((sum, chain) => sum + chain.observedHits, 0),
    },
    chains: chainRows,
  };
}

function topChildSummary(chain) {
  return chain.childRows
    .slice(0, 5)
    .map((row) => `${row.name || row.damageId} ${formatPct(row.finalShare)}`)
    .join("; ");
}

function renderMarkdown(report, options) {
  const rows = report.chains.slice(0, options.maxRows).map((chain) => [
    chain.recountNames.join(", ") || chain.recountId,
    chain.recountId,
    chain.allocationStatus,
    chain.replayStatus,
    `${chain.observedDamageIds.length}/${chain.knownDamageIds.length}`,
    formatNumber(chain.observedValue),
    formatNumber(chain.observedHits),
    `${chain.coefficientCoverage.rowsWithSingleCoefficient}/${chain.coefficientCoverage.observedRows}`,
    chain.maxFinalCoefficientShareDelta === null ? "" : formatPct(chain.maxFinalCoefficientShareDelta, 2),
    topChildSummary(chain),
    chain.blockers.slice(0, 4).join("; "),
  ]);

  const childRows = report.chains
    .flatMap((chain) =>
      chain.childRows.map((row) => [
        chain.recountNames.join(", ") || chain.recountId,
        row.name || row.damageId,
        row.damageId,
        row.hits,
        formatNumber(row.finalValue),
        formatPct(row.finalShare),
        row.coefficientValues.join(", "),
        row.coefficientShare === null ? "" : formatPct(row.coefficientShare),
        row.finalVsCoefficientDelta === null ? "" : formatPct(row.finalVsCoefficientDelta, 2),
      ])
    )
    .slice(0, options.maxRows);

  return [
    "# Skill Chain Allocation Audit",
    "",
    "This report is an offline proof layer. It can split observed final packet totals across emitted child damage IDs, but it does not publish modifier contribution math. Static coefficients remain candidate evidence until replay validation explains the observed packets without active-modifier spread.",
    "",
    "## Summary",
    "",
    `- Ledger damage rows: ${formatNumber(report.summary.ledgerDamageRows)}`,
    `- Multi-child chains observed: ${formatNumber(report.summary.chainsObserved)}`,
    `- Chains with all known children observed: ${formatNumber(report.summary.chainsWithAllKnownChildrenObserved)}`,
    `- Chains with missing known children: ${formatNumber(report.summary.chainsWithMissingKnownChildren)}`,
    `- Chains with full coefficient coverage: ${formatNumber(report.summary.chainsWithFullCoefficientCoverage)}`,
    `- Chains ready for replay validation: ${formatNumber(report.summary.chainsReadyForReplayValidation)}`,
    `- Observed chain final value: ${formatNumber(report.summary.observedChainFinalValue)}`,
    `- Observed chain hits: ${formatNumber(report.summary.observedChainHits)}`,
    "",
    "## Chain Allocation",
    "",
    rows.length
      ? markdownTable(
          [
            "Recount",
            "ID",
            "Allocation",
            "Replay",
            "Observed/Known",
            "Final Sum",
            "Hits",
            "Coeff Rows",
            "Max Final/Coeff Delta",
            "Top Child Shares",
            "Blockers",
          ],
          rows
        )
      : "No multi-child chains were observed.",
    "",
    "## Child Shares",
    "",
    childRows.length
      ? markdownTable(
          ["Recount", "Child", "Damage ID", "Hits", "Final Sum", "Final Share", "Coeff Values", "Coeff Share", "Final-Coeff Delta"],
          childRows
        )
      : "No child rows were observed.",
    "",
    "## Inputs",
    "",
    `- Ledger: ${report.inputs.ledger}`,
    `- Runtime: ${report.inputs.runtime}`,
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
  const runtime = readJson(options.runtime);
  const report = buildReport(ledger, runtime, options);

  ensureParentDir(options.outJson);
  ensureParentDir(options.outMd);
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(options.outMd, renderMarkdown(report, options));

  console.log(`Chains observed: ${report.summary.chainsObserved}`);
  console.log(`All known children observed: ${report.summary.chainsWithAllKnownChildrenObserved}`);
  console.log(`Full coefficient coverage: ${report.summary.chainsWithFullCoefficientCoverage}`);
  console.log(`Replay-ready chains: ${report.summary.chainsReadyForReplayValidation}`);
  console.log(`Output: ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Markdown: ${path.relative(repoRoot, options.outMd)}`);
}

main();
