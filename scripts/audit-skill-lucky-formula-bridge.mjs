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
    staticGaps: path.join(repoRoot, "DEV_exports", "skill-static-coefficient-gap-audit.json"),
    ledger: path.join(repoRoot, "DEV_exports", "skill-base-hit-ledger-latest4.json"),
    surface: DEFAULT_SURFACE_PATH,
    luckyRuntime: path.join(repoRoot, "parser-data", "generated", "LuckyStrikeRuntime.json"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-lucky-formula-bridge-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-lucky-formula-bridge-audit.md"),
    maxCandidates: 12,
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
      case "--ledger":
        options.ledger = path.resolve(next());
        break;
      case "--surface":
        options.surface = path.resolve(next());
        break;
      case "--lucky-runtime":
        options.luckyRuntime = path.resolve(next());
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
  console.log(`Skill Lucky Formula Bridge Audit

Usage:
  node scripts/audit-skill-lucky-formula-bridge.mjs [options]

Options:
  --static-gaps <path>    Static coefficient gap audit JSON.
  --ledger <path>         Latest skill base-hit ledger JSON.
  --surface <path>        Deep SkillCoefficientSurfaceProbe JSON.
  --lucky-runtime <path>  Generated LuckyStrikeRuntime JSON.
  --out-json <path>       JSON report path.
  --out-md <path>         Markdown report path.
  --max-candidates <n>    Candidate rows per damage row. Default: 12
  --help                  Show this help.

Notes:
  Dev-only focused scan for lucky damage rows. Exact produced lucky damage can
  be anchored to packet final damage, but chance/multiplier contribution remains
  blocked until the per-hit expected-value formula is proven.
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
    .slice(0, 8);
}

function rowIds(row, runtimeSource, chain) {
  return new Set(
    [
      row.damageId,
      row.linkedId,
      ...asArray(row.recountIds),
      ...asArray(row.recountNames),
      ...asArray(chain?.knownDamageIds),
      ...asArray(chain?.observedDamageIds),
      ...asArray(runtimeSource?.buffIds),
      ...asArray(runtimeSource?.targetDamageIds),
      ...asArray(runtimeSource?.targetRecountIds),
    ]
      .map(finiteNumber)
      .filter((value) => value !== null)
      .map(String)
  );
}

function matchKinds(matches) {
  return unique(asArray(matches).flatMap((match) => asArray(match?.kinds))).join(",");
}

function matchScope(candidate, row, runtimeSource) {
  const values = new Set(candidate.matchValues);
  const damageId = finiteNumber(row.damageId);
  const linkedId = finiteNumber(row.linkedId);
  const hasDamage = damageId !== null && values.has(String(damageId));
  const hasLinked = linkedId !== null && values.has(String(linkedId));
  const hasRuntimeTarget = asArray(runtimeSource?.targetDamageIds).some((id) => values.has(String(finiteNumber(id))));
  const hasRuntimeBuff = asArray(runtimeSource?.buffIds).some((id) => values.has(String(finiteNumber(id))));
  const hasRecount = asArray(row.recountIds).some((id) => values.has(String(finiteNumber(id))));
  if (hasDamage && (hasLinked || hasRuntimeBuff)) return "damage-and-lucky-source-link";
  if (hasDamage && hasRuntimeTarget) return "damage-runtime-target-link";
  if (hasDamage) return "damage-link";
  if (hasLinked || hasRuntimeBuff) return "lucky-source-link";
  if (hasRuntimeTarget) return "runtime-target-link";
  if (hasRecount) return "recount-link";
  return "other-link";
}

function scoreCandidate(candidate, row, runtimeSource) {
  let score = 0;
  const table = candidate.table;
  if (table === "DamageAttrTable.ctb") score += 22;
  if (table === "BuffTable.ctb") score += 18;
  if (table === "SkillEffectTable.ctb" || table === "SkillFightLevelTable.ctb") score += 14;
  if (table.startsWith("CTB:")) score += 10;
  if (candidate.matchValues.includes(String(row.damageId))) score += 8;
  if (candidate.matchValues.includes(String(row.linkedId))) score += 6;
  for (const id of asArray(runtimeSource?.targetDamageIds)) {
    if (candidate.matchValues.includes(String(id))) score += 4;
  }
  score += candidate.floatFields.length * 4;
  score += candidate.strings.length * 2;
  if (candidate.table === "ItemTable.ctb") score -= 18;
  return score;
}

function collectCandidates(surfaceReport, row, runtimeSource, chain, options) {
  const ids = rowIds(row, runtimeSource, chain);
  const candidates = [];

  for (const table of asArray(surfaceReport.tableReports)) {
    const name = tableName(table);
    for (const tableRow of asArray(table.rows)) {
      const matches = asArray(tableRow.matches).filter((match) => ids.has(String(finiteNumber(match?.value))));
      if (!matches.length) continue;
      const candidate = {
        table: name,
        rowIndex: finiteNumber(tableRow.rowIndex),
        absoluteOffset: finiteNumber(tableRow.absoluteOffset),
        matchValues: unique(matches.map((match) => String(finiteNumber(match?.value))).filter(Boolean)),
        matchKinds: matchKinds(matches),
        floatFields: compactFloatFields(tableRow.floatFields),
        strings: compactStrings(tableRow.strings),
      };
      candidate.matchScope = matchScope(candidate, row, runtimeSource);
      candidate.score = scoreCandidate(candidate, row, runtimeSource);
      candidates.push(candidate);
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.table.localeCompare(right.table) || (left.rowIndex ?? 0) - (right.rowIndex ?? 0))
    .slice(0, options.maxCandidates);
}

function findRuntimeSource(luckyRuntime, row) {
  const damageId = finiteNumber(row.damageId);
  const linkedId = finiteNumber(row.linkedId);
  return (
    Object.values(luckyRuntime.sourcesById ?? {}).find(
      (source) =>
        asArray(source.targetDamageIds).some((id) => finiteNumber(id) === damageId) ||
        asArray(source.buffIds).some((id) => finiteNumber(id) === linkedId)
    ) ?? null
  );
}

function findLedgerRow(ledger, damageId) {
  return asArray(ledger.damageRows).find((row) => finiteNumber(row.damageId) === damageId) ?? null;
}

function findChain(ledger, row, runtimeSource) {
  const recountIds = new Set([...asArray(row.recountIds), ...asArray(runtimeSource?.targetRecountIds)].map(finiteNumber).filter((id) => id !== null));
  return asArray(ledger.recountChains).find((chain) => recountIds.has(finiteNumber(chain.recountId))) ?? null;
}

function verdictFor(row, runtimeSource, chain, candidates) {
  const damageId = finiteNumber(row.damageId);
  const exactProduced = runtimeSource?.formulaPolicy === "exact-produced-damage" && asArray(runtimeSource.targetDamageIds).some((id) => finiteNumber(id) === damageId);
  const missingSiblings = asArray(chain?.knownDamageIds).filter((id) => !asArray(chain?.observedDamageIds).map(String).includes(String(id)));
  const directValueCandidate = candidates.some(
    (candidate) =>
      candidate.floatFields.length &&
      ["damage-and-lucky-source-link", "damage-runtime-target-link", "damage-link", "lucky-source-link"].includes(candidate.matchScope)
  );
  if (exactProduced && missingSiblings.length) return "exact-produced-damage-observed-missing-sibling";
  if (exactProduced && directValueCandidate) return "exact-produced-damage-plus-direct-value-candidate";
  if (exactProduced) return "exact-produced-damage-observed";
  if (directValueCandidate) return "direct-value-candidate-without-runtime-target";
  return "lucky-formula-still-blocked";
}

function summarizeRow(row, ledger, luckyRuntime, surfaceReport, options) {
  const runtimeSource = findRuntimeSource(luckyRuntime, row);
  const ledgerRow = findLedgerRow(ledger, finiteNumber(row.damageId));
  const chain = findChain(ledger, row, runtimeSource);
  const candidates = collectCandidates(surfaceReport, row, runtimeSource, chain, options);
  const knownDamageIds = asArray(chain?.knownDamageIds).map(String);
  const observedDamageIds = asArray(chain?.observedDamageIds).map(String);
  const missingKnownDamageIds = knownDamageIds.filter((id) => !observedDamageIds.includes(id));

  return {
    damageId: finiteNumber(row.damageId),
    name: row.name,
    category: row.category,
    finalValue: finiteNumber(row.finalValue),
    hits: finiteNumber(row.hits),
    linkedSource: row.linkedSource,
    linkedId: finiteNumber(row.linkedId),
    gapClass: row.gapClass,
    ledger: ledgerRow
      ? {
          totalValue: finiteNumber(ledgerRow.totalValue),
          effectiveTotal: finiteNumber(ledgerRow.effectiveTotal),
          hits: finiteNumber(ledgerRow.hits),
          critHits: finiteNumber(ledgerRow.critHits),
          luckyHits: finiteNumber(ledgerRow.luckyHits),
          decritAttackSpreadPct: finiteNumber(ledgerRow.decritPerAttack?.spreadPct),
          activeSourceLabels: asArray(ledgerRow.activeSourceLabels).slice(0, 12),
        }
      : null,
    runtimeSource: runtimeSource
      ? {
          sourceId: runtimeSource.sourceId,
          sourceName: runtimeSource.sourceName,
          sourceKind: runtimeSource.sourceKind,
          sourceEntityId: finiteNumber(runtimeSource.sourceEntityId),
          formulaPolicy: runtimeSource.formulaPolicy,
          buffIds: asArray(runtimeSource.buffIds),
          targetDamageIds: asArray(runtimeSource.targetDamageIds),
          targetRecountIds: asArray(runtimeSource.targetRecountIds),
          luckyTerms: asArray(runtimeSource.luckyTerms).map((term) => term.termId),
          requiredRuntimeEvidence: asArray(runtimeSource.requiredRuntimeEvidence),
        }
      : null,
    chain: chain
      ? {
          recountId: finiteNumber(chain.recountId),
          recountNames: asArray(chain.recountNames),
          observedDamageIds,
          knownDamageIds,
          missingKnownDamageIds,
          observedValue: finiteNumber(chain.observedValue),
          observedHits: finiteNumber(chain.observedHits),
          needsChainAllocation: Boolean(chain.needsChainAllocation),
        }
      : null,
    verdict: verdictFor(row, runtimeSource, chain, candidates),
    formulaGate: {
      exactProducedDamage: "use observed packet final value for the produced lucky damage row",
      expectedValueContribution: "blocked until chance, lucky multiplier, lucky damage bonus, and parent-hit pairing are proven per hit",
      screenshotFormula:
        "expected lucky multiplier = lucky probability * (0.4 + 0.25 * lucky probability) * (1 + lucky probability + other general damage bonuses)",
    },
    topCandidates: candidates,
  };
}

function buildReport(staticGapReport, ledger, luckyRuntime, surfaceReport, options) {
  const rows = asArray(staticGapReport.rows)
    .filter((row) => row.gapClass === "lucky-formula-link-gap")
    .map((row) => summarizeRow(row, ledger, luckyRuntime, surfaceReport, options));

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      staticGaps: options.staticGaps,
      ledger: options.ledger,
      luckyRuntime: options.luckyRuntime,
      surface: options.surface,
    },
    semantics: {
      boundary: "dev-only audit; no parser/runtime contribution calculation",
      finalDamageAnchor: "observed packet final damage remains the truth source",
      purpose: "separate exact produced lucky damage rows from lucky chance/multiplier expected-value contribution math",
    },
    luckyRuntimeStats: luckyRuntime.stats ?? {},
    summary: {
      rows: rows.length,
      finalDamage: rows.reduce((sum, row) => sum + (row.finalValue ?? 0), 0),
      hits: rows.reduce((sum, row) => sum + (row.hits ?? 0), 0),
      exactProducedRows: rows.filter((row) => row.runtimeSource?.formulaPolicy === "exact-produced-damage").length,
      rowsWithMissingKnownSiblings: rows.filter((row) => asArray(row.chain?.missingKnownDamageIds).length).length,
      byVerdict: Object.fromEntries(
        [...rows.reduce((map, row) => map.set(row.verdict, (map.get(row.verdict) ?? 0) + 1), new Map()).entries()].sort(
          (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
        )
      ),
    },
    rows,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Skill Lucky Formula Bridge Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Rows: ${formatNumber(report.summary.rows)}`,
    `- Exact lucky final damage covered: ${formatNumber(report.summary.finalDamage)}`,
    `- Hits covered: ${formatNumber(report.summary.hits)}`,
    `- Exact produced rows: ${formatNumber(report.summary.exactProducedRows)}`,
    `- Rows with missing known siblings: ${formatNumber(report.summary.rowsWithMissingKnownSiblings)}`,
    `- Runtime lucky sources: ${formatNumber(report.luckyRuntimeStats.sources)}`,
    `- Runtime exact-produced policies: ${formatNumber(report.luckyRuntimeStats.formulaPolicyCounts?.["exact-produced-damage"])}`,
    `- Runtime expected-value candidates: ${formatNumber(report.luckyRuntimeStats.formulaPolicyCounts?.["expected-value-candidate"])}`,
    "",
    markdownTable(
      ["Verdict", "Rows"],
      Object.entries(report.summary.byVerdict).map(([verdict, count]) => [verdict, count])
    ),
    "",
    "## Lucky Rows",
    "",
    markdownTable(
      ["Damage", "Name", "Final", "Hits", "Runtime Source", "Policy", "Known IDs", "Observed IDs", "Missing IDs", "Verdict"],
      report.rows.map((row) => [
        row.damageId,
        row.name,
        formatShort(row.finalValue),
        formatNumber(row.hits),
        row.runtimeSource?.sourceId ?? "",
        row.runtimeSource?.formulaPolicy ?? "",
        asArray(row.chain?.knownDamageIds).join(", "),
        asArray(row.chain?.observedDamageIds).join(", "),
        asArray(row.chain?.missingKnownDamageIds).join(", "),
        row.verdict,
      ])
    ),
    "",
    "## Formula Gate",
    "",
    "- Exact produced lucky damage rows can be anchored to packet final damage.",
    "- Lucky chance/multiplier contribution remains blocked until per-hit parent pairing and the lucky expected-value formula are proven.",
    "- Working screenshot formula: `expected lucky multiplier = lucky probability * (0.4 + 0.25 * lucky probability) * (1 + lucky probability + other general damage bonuses)`.",
    "",
    "## Candidate Surfaces",
    "",
  ];

  for (const row of report.rows) {
    lines.push(`### ${row.name} (${row.damageId})`, "");
    lines.push(
      markdownTable(
        ["Table", "Row", "Scope", "Matches", "Kinds", "Floats", "Strings", "Score"],
        asArray(row.topCandidates).map((candidate) => [
          candidate.table,
          candidate.rowIndex,
          candidate.matchScope,
          candidate.matchValues.join(", "),
          candidate.matchKinds,
          candidate.floatFields.map((field) => `+${field.offset}=${field.value}`).join("; "),
          candidate.strings.join("; "),
          candidate.score,
        ])
      ),
      ""
    );
  }

  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const staticGapReport = readJson(options.staticGaps);
  const ledger = readJson(options.ledger);
  const luckyRuntime = readJson(options.luckyRuntime);
  const surfaceReport = readJson(options.surface);
  const report = buildReport(staticGapReport, ledger, luckyRuntime, surfaceReport, options);

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Rows: ${report.summary.rows}`);
  console.log(`Verdicts: ${Object.entries(report.summary.byVerdict).map(([name, count]) => `${name}=${count}`).join(", ")}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
