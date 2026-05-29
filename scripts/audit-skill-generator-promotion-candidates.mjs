#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    inventory: path.join(repoRoot, "DEV_exports", "skill-accuracy-blocker-inventory.json"),
    staticGaps: path.join(repoRoot, "DEV_exports", "skill-static-coefficient-gap-audit.json"),
    buffProc: path.join(repoRoot, "DEV_exports", "skill-buff-proc-coefficient-bridge-audit.json"),
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-coefficient-gap-audit.json"),
    linkedZero: path.join(repoRoot, "DEV_exports", "skill-linked-zero-coefficient-audit.json"),
    lucky: path.join(repoRoot, "DEV_exports", "skill-lucky-formula-bridge-audit.json"),
    derived: path.join(repoRoot, "DEV_exports", "skill-modifier-derived-contributions-latest4.json"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-generator-promotion-candidates.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-generator-promotion-candidates.md"),
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
      case "--inventory":
        options.inventory = path.resolve(next());
        break;
      case "--static-gaps":
        options.staticGaps = path.resolve(next());
        break;
      case "--buff-proc":
        options.buffProc = path.resolve(next());
        break;
      case "--chain":
        options.chain = path.resolve(next());
        break;
      case "--linked-zero":
        options.linkedZero = path.resolve(next());
        break;
      case "--lucky":
        options.lucky = path.resolve(next());
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
  console.log(`Skill Generator Promotion Candidates

Usage:
  node scripts/audit-skill-generator-promotion-candidates.mjs [options]

Notes:
  Dev-only review of which skill contribution blockers can become generator
  bridge work and which still need samples or formula proof. This never changes
  runtime/parser/UI behavior.
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

function cleanName(value) {
  return String(value ?? "")
    .replaceAll("\u200b", "")
    .replaceAll("â€‹", "")
    .replace(/\s+/g, " ")
    .trim();
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (finiteNumber(row[field]) ?? 0), 0);
}

function makeRow({
  lane,
  promotionState,
  bridgeType,
  name,
  ids,
  finalDamage,
  hits,
  evidence,
  blockedBy,
  nextStep,
  details = {},
}) {
  return {
    lane,
    promotionState,
    bridgeType,
    name: cleanName(name),
    ids: asArray(ids).map(String),
    finalDamage: finiteNumber(finalDamage) ?? 0,
    hits: finiteNumber(hits) ?? 0,
    evidence,
    blockedBy: asArray(blockedBy),
    nextStep,
    details,
  };
}

function buildRows(staticGaps, buffProc, chain, linkedZero, lucky, derived) {
  const rows = [];

  for (const source of asArray(derived.sourceRows)) {
    rows.push(
      makeRow({
        lane: "validated-dev-contribution",
        promotionState: "dev-proof-only",
        bridgeType: "formula-contribution-proof",
        name: source.label,
        ids: [source.sourceId, source.ruleId],
        finalDamage: source.finalContribution,
        hits: source.activeHits,
        evidence: `${source.validationStatus}; ${source.validatedDamageRows} damage rows`,
        blockedBy: ["runtime needs formula-derived rows separate from exact packet damage rows"],
        nextStep: "keep offline until the modifier UI can display formula-derived contribution separately",
        details: {
          term: source.term,
          amount: source.amount,
          damageRows: asArray(source.damageRows).map((row) => ({
            damageId: String(row.damageId),
            name: cleanName(row.damageName),
            finalContribution: row.finalContribution,
            rowFinalDamage: row.rowFinalDamage,
            rowHits: row.rowHits,
          })),
        },
      })
    );
  }

  for (const row of asArray(staticGaps.rows).filter((item) => item.readiness === "modifier-strip-required")) {
    rows.push(
      makeRow({
        lane: "static-coefficient",
        promotionState: "needs-isolation-proof",
        bridgeType: "existing-static-coefficient",
        name: row.name,
        ids: [row.damageId, ...(row.recountIds ?? [])],
        finalDamage: row.finalValue,
        hits: row.hits,
        evidence: `${row.coefficientStatus}; coefficient values ${asArray(row.coefficientValues).join(", ")}`,
        blockedBy: ["active modifier spread still present"],
        nextStep: "run modifier-strip proof and compare reconstructed base values against packet final damage",
        details: {
          category: row.category,
          coefficientValues: row.coefficientValues,
          linkedSource: row.linkedSource,
          linkedId: row.linkedId,
          decritAttackSpreadPct: row.decritAttackSpreadPct,
        },
      })
    );
  }

  for (const chainRow of asArray(chain.chains)) {
    const missingCoefficientChildren = asArray(chainRow.children).filter(
      (child) => child.childVerdict === "missing-child-coefficient"
    );
    if (missingCoefficientChildren.length) {
      rows.push(
        makeRow({
          lane: "chain-child-coefficient",
          promotionState: asArray(chainRow.missingKnownDamageIds).length
            ? "generator-candidate-needs-sample"
            : "generator-candidate-needs-proof",
          bridgeType: "child-damage-id-to-coefficient",
          name: asArray(chainRow.recountNames).map(cleanName).join(", "),
          ids: [chainRow.recountId, ...missingCoefficientChildren.map((child) => child.damageId)],
          finalDamage: chainRow.observedValue,
          hits: chainRow.observedHits,
          evidence: `${missingCoefficientChildren.length} observed children lack coefficients`,
          blockedBy: [
            ...(asArray(chainRow.missingKnownDamageIds).length ? ["missing known sibling damage ids"] : []),
            "child coefficient bridge not generated",
            "active modifier spread still present",
          ],
          nextStep: asArray(chainRow.missingKnownDamageIds).length
            ? "collect/scan samples for missing siblings, then add child coefficient bridges"
            : "add generator-side child coefficient bridge candidates, then rerun modifier-strip proof",
          details: {
            knownDamageIds: chainRow.knownDamageIds,
            observedDamageIds: chainRow.observedDamageIds,
            missingKnownDamageIds: chainRow.missingKnownDamageIds,
            missingCoefficientChildren: missingCoefficientChildren.map((child) => ({
              damageId: String(child.damageId),
              name: cleanName(child.name),
              linkedSource: child.staticLinkedSource,
              linkedId: child.staticLinkedId,
              surfaceHints: asArray(child.surfaceHints).slice(0, 4),
            })),
          },
        })
      );
    }

    if (!missingCoefficientChildren.length && asArray(chainRow.missingKnownDamageIds).length) {
      rows.push(
        makeRow({
          lane: "chain-sample",
          promotionState: "sample-required",
          bridgeType: "complete-known-child-sample",
          name: asArray(chainRow.recountNames).map(cleanName).join(", "),
          ids: [chainRow.recountId, ...asArray(chainRow.missingKnownDamageIds)],
          finalDamage: chainRow.observedValue,
          hits: chainRow.observedHits,
          evidence: "observed children with coefficients do not cover all known child ids",
          blockedBy: ["missing known sibling damage ids"],
          nextStep: "use future parses to confirm the missing child rows before allocating chain contribution",
          details: {
            knownDamageIds: chainRow.knownDamageIds,
            observedDamageIds: chainRow.observedDamageIds,
            missingKnownDamageIds: chainRow.missingKnownDamageIds,
          },
        })
      );
    }
  }

  for (const row of asArray(buffProc.rows)) {
    rows.push(
      makeRow({
        lane: "buff-proc-coefficient",
        promotionState: String(row.verdict ?? "").includes("recount-value")
          ? "source-identity-plus-weak-value-candidate"
          : "source-identity-only",
        bridgeType: "buff-source-to-emitted-proc-coefficient",
        name: row.name,
        ids: [row.damageId, row.linkedId, ...(row.recountIds ?? [])],
        finalDamage: row.finalValue,
        hits: row.hits,
        evidence: row.verdict,
        blockedBy: ["no strict source-linked coefficient/value field yet"],
        nextStep: "scan candidate tables for a source-linked value bridge that explains packet totals",
        details: {
          linkedSource: row.linkedSource,
          linkedId: row.linkedId,
          topCandidates: asArray(row.candidates).slice(0, 6).map((candidate) => ({
            table: candidate.table,
            rowIndex: candidate.rowIndex,
            matchScope: candidate.matchScope,
            score: candidate.score,
            floatFields: candidate.floatFields,
            strings: candidate.strings,
          })),
        },
      })
    );
  }

  for (const row of asArray(linkedZero.rows)) {
    rows.push(
      makeRow({
        lane: "linked-zero-coefficient",
        promotionState: "field-proof-required",
        bridgeType: "linked-skill-side-table-field",
        name: row.name,
        ids: [row.damageId, row.linkedId],
        finalDamage: row.finalValue,
        hits: row.hits,
        evidence: row.verdict,
        blockedBy: ["candidate side-table values are not proven coefficient fields"],
        nextStep: "prove which linked side-table field reconstructs packet totals after modifier strip",
        details: {
          linkedSource: row.linkedSource,
          linkedId: row.linkedId,
          topCandidates: asArray(row.candidates).slice(0, 8).map((candidate) => ({
            table: candidate.table,
            rowIndex: candidate.rowIndex,
            matchScope: candidate.matchScope,
            score: candidate.score,
            floatFields: candidate.floatFields,
            strings: candidate.strings,
          })),
        },
      })
    );
  }

  for (const row of asArray(lucky.rows)) {
    rows.push(
      makeRow({
        lane: "lucky-formula",
        promotionState: "formula-proof-required",
        bridgeType: "exact-lucky-damage-plus-expected-value-formula",
        name: row.name,
        ids: [row.damageId, row.runtimeSource?.sourceId, ...(row.chain?.missingKnownDamageIds ?? [])],
        finalDamage: row.finalValue,
        hits: row.hits,
        evidence: row.verdict,
        blockedBy: [
          ...(asArray(row.chain?.missingKnownDamageIds).length ? ["missing exact lucky sibling damage ids"] : []),
          "parent-hit pairing and expected-value lucky formula not proven",
        ],
        nextStep: "keep exact produced lucky damage separate, then prove chance/multiplier contribution from parent hits",
        details: {
          runtimeSource: row.runtimeSource,
          formulaGate: row.formulaGate,
          chain: row.chain,
        },
      })
    );
  }

  return rows;
}

function summarizeRows(rows) {
  const byState = {};
  const byLane = {};
  for (const row of rows) {
    byState[row.promotionState] = (byState[row.promotionState] ?? 0) + 1;
    byLane[row.lane] = (byLane[row.lane] ?? 0) + 1;
  }
  return {
    rows: rows.length,
    runtimePromotionsReady: rows.filter((row) => row.promotionState === "runtime-ready").length,
    generatorCandidateRows: rows.filter((row) => row.promotionState.startsWith("generator-candidate")).length,
    sampleRequiredRows: rows.filter((row) => row.promotionState.includes("sample")).length,
    proofRequiredRows: rows.filter((row) => row.promotionState.includes("proof")).length,
    nonUniqueFinalDamage: sum(rows, "finalDamage"),
    hits: sum(rows, "hits"),
    byState,
    byLane,
  };
}

function buildReport(inputs, options) {
  const rows = buildRows(
    inputs.staticGaps,
    inputs.buffProc,
    inputs.chain,
    inputs.linkedZero,
    inputs.lucky,
    inputs.derived
  );
  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      inventory: options.inventory,
      staticGaps: options.staticGaps,
      buffProc: options.buffProc,
      chain: options.chain,
      linkedZero: options.linkedZero,
      lucky: options.lucky,
      derived: options.derived,
    },
    semantics: {
      boundary: "dev-only promotion review; no parser/runtime/UI changes",
      runtimePromotionPolicy: "zero rows are runtime-ready until generator bridges and formula proof pass against packet final damage",
      generatorPromotionPolicy: "candidate rows identify generator work only; they are not contribution math",
    },
    summary: summarizeRows(rows),
    sourceInventorySummary: inputs.inventory.summary,
    rows,
  };
}

function renderMarkdown(report) {
  const topRows = [...report.rows].sort((left, right) => right.finalDamage - left.finalDamage);
  return [
    "# Skill Generator Promotion Candidates",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Review rows: ${formatNumber(report.summary.rows)}`,
    `- Runtime-ready rows: ${formatNumber(report.summary.runtimePromotionsReady)}`,
    `- Generator candidate rows: ${formatNumber(report.summary.generatorCandidateRows)}`,
    `- Sample-required rows: ${formatNumber(report.summary.sampleRequiredRows)}`,
    `- Proof-required rows: ${formatNumber(report.summary.proofRequiredRows)}`,
    `- Non-unique final damage across reviewed rows: ${formatNumber(report.summary.nonUniqueFinalDamage)}`,
    `- Hits covered by reviewed blockers: ${formatNumber(report.summary.hits)}`,
    "",
    "## State Totals",
    "",
    markdownTable(
      ["State", "Rows"],
      Object.entries(report.summary.byState).map(([state, rows]) => [state, rows])
    ),
    "",
    "## Lane Totals",
    "",
    markdownTable(
      ["Lane", "Rows"],
      Object.entries(report.summary.byLane).map(([lane, rows]) => [lane, rows])
    ),
    "",
    "## Review Rows",
    "",
    markdownTable(
      ["Lane", "State", "Bridge", "Name", "IDs", "Final", "Hits", "Blocked By", "Next Step"],
      topRows.map((row) => [
        row.lane,
        row.promotionState,
        row.bridgeType,
        row.name,
        row.ids.join(", "),
        formatShort(row.finalDamage),
        formatNumber(row.hits),
        row.blockedBy.join("; "),
        row.nextStep,
      ])
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

  const inputs = {
    inventory: readJson(options.inventory),
    staticGaps: readJson(options.staticGaps),
    buffProc: readJson(options.buffProc),
    chain: readJson(options.chain),
    linkedZero: readJson(options.linkedZero),
    lucky: readJson(options.lucky),
    derived: readJson(options.derived),
  };
  const report = buildReport(inputs, options);

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Review rows: ${report.summary.rows}`);
  console.log(`Runtime-ready rows: ${report.summary.runtimePromotionsReady}`);
  console.log(`Generator candidate rows: ${report.summary.generatorCandidateRows}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
