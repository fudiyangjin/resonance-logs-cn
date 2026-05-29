#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    staticGaps: path.join(repoRoot, "DEV_exports", "skill-static-coefficient-gap-audit.json"),
    buffProc: path.join(repoRoot, "DEV_exports", "skill-buff-proc-coefficient-bridge-audit.json"),
    lucky: path.join(repoRoot, "DEV_exports", "skill-lucky-formula-bridge-audit.json"),
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-coefficient-gap-audit.json"),
    linkedZero: path.join(repoRoot, "DEV_exports", "skill-linked-zero-coefficient-audit.json"),
    derived: path.join(repoRoot, "DEV_exports", "skill-modifier-derived-contributions-latest4.json"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-accuracy-blocker-inventory.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-accuracy-blocker-inventory.md"),
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
      case "--buff-proc":
        options.buffProc = path.resolve(next());
        break;
      case "--lucky":
        options.lucky = path.resolve(next());
        break;
      case "--chain":
        options.chain = path.resolve(next());
        break;
      case "--linked-zero":
        options.linkedZero = path.resolve(next());
        break;
      case "--derived":
        options.derived = path.resolve(next());
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
  console.log(`Skill Accuracy Blocker Inventory

Usage:
  node scripts/audit-skill-accuracy-blocker-inventory.mjs [options]

Notes:
  Dev-only rollup of the latest skill contribution audit lanes. This only
  summarizes generated reports and does not touch parser/runtime/UI behavior.
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

function rowsByReadiness(staticGaps) {
  const groups = new Map();
  for (const row of asArray(staticGaps.rows)) {
    const key = row.readiness ?? "unknown";
    const entry = groups.get(key) ?? { readiness: key, rows: 0, finalDamage: 0, hits: 0, names: [] };
    entry.rows += 1;
    entry.finalDamage += finiteNumber(row.finalValue) ?? 0;
    entry.hits += finiteNumber(row.hits) ?? 0;
    entry.names.push(`${row.name} (${row.damageId})`);
    groups.set(key, entry);
  }
  return [...groups.values()].sort((left, right) => right.finalDamage - left.finalDamage);
}

function collectNextActions(staticGaps, buffProc, lucky, chain, linkedZero, derived) {
  const actions = [];
  const derivedSummary = derived.summary ?? {};
  if ((derivedSummary.validatedSources ?? 0) > 0) {
    actions.push({
      lane: "validated-dev-contribution",
      priority: 1,
      rows: derivedSummary.validatedDamageRows ?? 0,
      finalDamage: derivedSummary.validatedFinalContribution ?? 0,
      action: "keep as dev-only proof until the UI can mark formula-derived contributions separately from exact damage rows",
    });
  }
  const modifierStripRows = asArray(staticGaps.rows).filter((row) => row.readiness === "modifier-strip-required");
  if (modifierStripRows.length) {
    actions.push({
      lane: "static-coefficients",
      priority: 2,
      rows: modifierStripRows.length,
      finalDamage: modifierStripRows.reduce((sum, row) => sum + (finiteNumber(row.finalValue) ?? 0), 0),
      action: "run modifier-strip/isolation proof for rows with known static coefficients",
      examples: modifierStripRows.map((row) => `${row.name} (${row.damageId})`).slice(0, 6),
    });
  }
  const chainRows = asArray(chain.chains);
  const childBridgeChains = chainRows.filter((row) => ["needs-child-coefficient-bridge", "needs-complete-sample-and-child-coefficients"].includes(row.chainVerdict));
  if (childBridgeChains.length) {
    actions.push({
      lane: "chain-child-coefficients",
      priority: 3,
      rows: childBridgeChains.reduce((sum, row) => sum + asArray(row.children).filter((child) => child.childVerdict === "missing-child-coefficient").length, 0),
      finalDamage: childBridgeChains.reduce((sum, row) => sum + (finiteNumber(row.observedValue) ?? 0), 0),
      action: "build generator-side child damage id to coefficient bridges for observed chain children",
      examples: childBridgeChains.map((row) => `${asArray(row.recountNames).join(", ")} (${row.recountId})`).slice(0, 6),
    });
  }
  const sampleChains = chainRows.filter((row) => ["needs-complete-child-sample", "needs-complete-sample-and-child-coefficients"].includes(row.chainVerdict));
  if (sampleChains.length) {
    actions.push({
      lane: "chain-samples",
      priority: 4,
      rows: sampleChains.reduce((sum, row) => sum + asArray(row.missingKnownDamageIds).length, 0),
      finalDamage: sampleChains.reduce((sum, row) => sum + (finiteNumber(row.observedValue) ?? 0), 0),
      action: "wait for or target encounters where missing known child damage ids appear before assuming allocation",
      examples: sampleChains.map((row) => `${asArray(row.recountNames).join(", ")} missing ${asArray(row.missingKnownDamageIds).join(", ")}`).slice(0, 6),
    });
  }
  const buffProcRows = asArray(buffProc.rows);
  if (buffProcRows.length) {
    actions.push({
      lane: "buff-proc-coefficients",
      priority: 5,
      rows: buffProcRows.length,
      finalDamage: buffProcRows.reduce((sum, row) => sum + (finiteNumber(row.finalValue) ?? 0), 0),
      action: "find source-linked coefficient/value bridges; recount-only value candidates stay blocked",
      examples: buffProcRows.map((row) => `${row.name} (${row.damageId}) ${row.verdict}`).slice(0, 6),
    });
  }
  const linkedZeroRows = asArray(linkedZero.rows);
  if (linkedZeroRows.length) {
    actions.push({
      lane: "linked-zero-coefficient",
      priority: 6,
      rows: linkedZeroRows.length,
      finalDamage: linkedZeroRows.reduce((sum, row) => sum + (finiteNumber(row.finalValue) ?? 0), 0),
      action: "prove the correct value field for linked skill rows after active modifiers are stripped",
      examples: linkedZeroRows.map((row) => `${row.name} (${row.damageId}) ${row.verdict}`).slice(0, 6),
    });
  }
  const luckyRows = asArray(lucky.rows);
  if (luckyRows.length) {
    actions.push({
      lane: "lucky-formula",
      priority: 7,
      rows: luckyRows.length,
      finalDamage: luckyRows.reduce((sum, row) => sum + (finiteNumber(row.finalValue) ?? 0), 0),
      action: "keep exact lucky damage separate from expected-value chance/multiplier contribution until parent-hit formula proof lands",
      examples: luckyRows.map((row) => `${row.name} (${row.damageId}) ${row.verdict}`).slice(0, 6),
    });
  }
  return actions.sort((left, right) => left.priority - right.priority);
}

function buildReport(staticGaps, buffProc, lucky, chain, linkedZero, derived, options) {
  const readinessRows = rowsByReadiness(staticGaps);
  const nextActions = collectNextActions(staticGaps, buffProc, lucky, chain, linkedZero, derived);
  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      staticGaps: options.staticGaps,
      buffProc: options.buffProc,
      lucky: options.lucky,
      chain: options.chain,
      linkedZero: options.linkedZero,
      derived: options.derived,
    },
    semantics: {
      boundary: "dev-only audit rollup; no parser/runtime contribution calculation",
      finalDamageAnchor: "observed packet final damage remains the truth source",
      purpose: "combine the latest proof lanes into one blocker inventory before any generator promotion",
    },
    summary: {
      observedRows: staticGaps.summary?.rows ?? asArray(staticGaps.rows).length,
      observedFinalDamage: staticGaps.summary?.finalDamage,
      observedHits: staticGaps.summary?.hits,
      validatedDevSources: derived.summary?.validatedSources ?? 0,
      validatedDevDamageRows: derived.summary?.validatedDamageRows ?? 0,
      validatedDevFinalContribution: derived.summary?.validatedFinalContribution ?? 0,
      readinessRows,
      nextActionCount: nextActions.length,
    },
    laneSummaries: {
      staticGaps: staticGaps.summary,
      buffProc: buffProc.summary,
      lucky: lucky.summary,
      chain: chain.summary,
      linkedZero: linkedZero.summary,
      derived: derived.summary,
    },
    nextActions,
  };
}

function renderMarkdown(report) {
  return [
    "# Skill Accuracy Blocker Inventory",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Observed rows: ${formatNumber(report.summary.observedRows)}`,
    `- Observed final damage: ${formatNumber(report.summary.observedFinalDamage)}`,
    `- Observed hits: ${formatNumber(report.summary.observedHits)}`,
    `- Validated dev-only contribution sources: ${formatNumber(report.summary.validatedDevSources)}`,
    `- Validated dev-only contribution rows: ${formatNumber(report.summary.validatedDevDamageRows)}`,
    `- Validated dev-only final contribution: ${formatNumber(report.summary.validatedDevFinalContribution, 1)}`,
    "",
    "## Readiness Buckets",
    "",
    markdownTable(
      ["Readiness", "Rows", "Final", "Hits", "Examples"],
      report.summary.readinessRows.map((row) => [
        row.readiness,
        row.rows,
        formatShort(row.finalDamage),
        formatNumber(row.hits),
        row.names.slice(0, 5).join("; "),
      ])
    ),
    "",
    "## Next Actions",
    "",
    markdownTable(
      ["Priority", "Lane", "Rows", "Final", "Action", "Examples"],
      report.nextActions.map((row) => [
        row.priority,
        row.lane,
        row.rows,
        formatShort(row.finalDamage),
        row.action,
        asArray(row.examples).join("; "),
      ])
    ),
    "",
    "## Lane Totals",
    "",
    markdownTable(
      ["Lane", "Rows/Chains", "Final", "Hits", "Details"],
      [
        [
          "static gaps",
          report.laneSummaries.staticGaps?.rows,
          formatShort(report.laneSummaries.staticGaps?.finalDamage),
          formatNumber(report.laneSummaries.staticGaps?.hits),
          Object.entries(report.laneSummaries.staticGaps?.byGapClass ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join(", "),
        ],
        [
          "buff/proc",
          report.laneSummaries.buffProc?.rows,
          formatShort(report.laneSummaries.buffProc?.finalDamage),
          formatNumber(report.laneSummaries.buffProc?.hits),
          Object.entries(report.laneSummaries.buffProc?.byVerdict ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join(", "),
        ],
        [
          "lucky",
          report.laneSummaries.lucky?.rows,
          formatShort(report.laneSummaries.lucky?.finalDamage),
          formatNumber(report.laneSummaries.lucky?.hits),
          Object.entries(report.laneSummaries.lucky?.byVerdict ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join(", "),
        ],
        [
          "chain",
          report.laneSummaries.chain?.chains,
          formatShort(report.laneSummaries.chain?.finalDamage),
          formatNumber(report.laneSummaries.chain?.hits),
          Object.entries(report.laneSummaries.chain?.byVerdict ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join(", "),
        ],
        [
          "linked zero",
          report.laneSummaries.linkedZero?.rows,
          formatShort(report.laneSummaries.linkedZero?.finalDamage),
          formatNumber(report.laneSummaries.linkedZero?.hits),
          Object.entries(report.laneSummaries.linkedZero?.byVerdict ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join(", "),
        ],
      ]
    ),
    "",
    "## Inputs",
    "",
    ...Object.entries(report.inputs).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const staticGaps = readJson(options.staticGaps);
  const buffProc = readJson(options.buffProc);
  const lucky = readJson(options.lucky);
  const chain = readJson(options.chain);
  const linkedZero = readJson(options.linkedZero);
  const derived = readJson(options.derived);
  const report = buildReport(staticGaps, buffProc, lucky, chain, linkedZero, derived, options);

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Observed rows: ${report.summary.observedRows}`);
  console.log(`Next actions: ${report.summary.nextActionCount}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
