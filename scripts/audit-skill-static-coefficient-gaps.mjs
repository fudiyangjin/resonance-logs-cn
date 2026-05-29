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
    blockers: path.join(repoRoot, "DEV_exports", "skill-coefficient-blockers-latest4.json"),
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-allocation-latest4.json"),
    surface: DEFAULT_SURFACE_PATH,
    outJson: path.join(repoRoot, "DEV_exports", "skill-static-coefficient-gap-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-static-coefficient-gap-audit.md"),
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
      case "--blockers":
        options.blockers = path.resolve(next());
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
  console.log(`Skill Static Coefficient Gap Audit

Usage:
  node scripts/audit-skill-static-coefficient-gaps.mjs [options]

Options:
  --blockers <path>  Skill coefficient blocker report. Default: DEV_exports/skill-coefficient-blockers-latest4.json
  --chain <path>     Skill chain allocation report. Default: DEV_exports/skill-chain-allocation-latest4.json
  --surface <path>   Deep SkillCoefficientSurfaceProbe JSON.
  --out-json <path>  JSON report path. Default: DEV_exports/skill-static-coefficient-gap-audit.json
  --out-md <path>    Markdown report path. Default: DEV_exports/skill-static-coefficient-gap-audit.md
  --max-rows <n>     Max Markdown rows. Default: 120
  --help             Show this help.

Notes:
  Dev-only blocker classifier. It does not change parser/runtime math and does
  not publish contribution values. It narrows the next generator/data pass for
  static coefficient and recount-chain gaps.
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
  const counts = new Map();
  for (const row of rows) {
    const values = asArray(selector(row));
    for (const value of values) {
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function indexByDamageId(rows) {
  const map = new Map();
  for (const row of asArray(rows)) {
    const id = finiteNumber(row?.damageId);
    if (id !== null) map.set(String(id), row);
  }
  return map;
}

function indexChainChildren(chainReport) {
  const map = new Map();
  for (const chain of asArray(chainReport?.chains)) {
    for (const child of asArray(chain.childRows)) {
      const damageId = finiteNumber(child?.damageId);
      if (damageId === null) continue;
      map.set(String(damageId), { chain, child });
    }
  }
  return map;
}

function rowIds(row, surfaceRow, chainEntry) {
  const ids = [
    row.damageId,
    row.linkedId,
    row.damageAttrLinkedId,
    ...asArray(row.recountIds),
    surfaceRow?.damageAttr?.linkedId,
    surfaceRow?.generatedBreakdown?.linkedId,
    surfaceRow?.generatedBreakdown?.linkedSkillId,
    surfaceRow?.generatedBreakdown?.linkedSkillEffectId,
    surfaceRow?.generatedBreakdown?.linkedSkillFightId,
    surfaceRow?.generatedBreakdown?.baseSkillId,
    surfaceRow?.generatedBreakdown?.parentBaseSkillId,
    surfaceRow?.generatedBreakdown?.recountOwnerSkillId,
    ...asArray(surfaceRow?.linkedIds),
    ...asArray(surfaceRow?.skillEffects).flatMap((effect) => [effect.effectId, effect.skillId]),
    ...asArray(surfaceRow?.skillFights).flatMap((fight) => [fight.fightId, fight.skillId, fight.effectId]),
    ...asArray(chainEntry?.chain?.knownDamageIds),
  ];

  return new Set(ids.map(finiteNumber).filter((value) => value !== null).map(String));
}

function compactFloatHints(matchingRows) {
  const counts = new Map();
  for (const row of matchingRows) {
    for (const field of asArray(row.floatFields)) {
      const value = finiteNumber(field?.value);
      const offset = finiteNumber(field?.fieldOffset);
      if (value === null || offset === null) continue;
      if (value === 0) continue;
      const rounded = Math.abs(value) >= 10 ? Number(value.toFixed(3)) : Number(value.toFixed(6));
      const key = `+${offset}=${rounded}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([key, count]) => `${key} x${count}`);
}

function surfaceHints(surfaceReport, idSet) {
  const tableHints = [];
  const noisyTables = new Set(["ItemTable.ctb"]);

  for (const table of asArray(surfaceReport?.tableReports)) {
    const tableName = String(table.table ?? table.tableName ?? table.name ?? "unknown-table");
    const matchingRows = asArray(table.rows).filter((row) =>
      asArray(row.matches).some((match) => idSet.has(String(finiteNumber(match?.value))))
    );
    if (!matchingRows.length) continue;

    const priority =
      tableName === "DamageAttrTable.ctb" ||
      tableName === "SkillEffectTable.ctb" ||
      tableName === "SkillFightLevelTable.ctb" ||
      tableName === "BuffTable.ctb" ||
      tableName === "SkillTable.ctb" ||
      tableName.startsWith("CTB:");
    const noisePenalty = noisyTables.has(tableName) ? 1 : 0;

    tableHints.push({
      table: tableName,
      matches: matchingRows.length,
      priority,
      noisePenalty,
      floatHints: compactFloatHints(matchingRows),
    });
  }

  return tableHints
    .sort(
      (left, right) =>
        Number(right.priority) - Number(left.priority) ||
        left.noisePenalty - right.noisePenalty ||
        right.matches - left.matches ||
        left.table.localeCompare(right.table)
    )
    .slice(0, 6);
}

function classifyStaticGap(row, surfaceRow, chainEntry) {
  const blockers = new Set(asArray(row.blockers));
  const linkedSource = String(row.linkedSource ?? surfaceRow?.generatedBreakdown?.linkedSource ?? "");
  const hasSkillEffect = (finiteNumber(row.skillEffectCount) ?? 0) > 0 || asArray(surfaceRow?.skillEffects).length > 0;
  const hasSkillFight = (finiteNumber(row.skillFightCount) ?? 0) > 0 || asArray(surfaceRow?.skillFights).length > 0;
  const coeffStatus = String(row.coefficientStatus ?? "");
  const chainStatus = String(row.chainAllocation ?? chainEntry?.chain?.allocationStatus ?? "");

  if (row.category === "lucky-strike") {
    return {
      gapClass: "lucky-formula-link-gap",
      staticState: "DamageAttr is linked to lucky buff/effect id, not a normal SkillEffect coefficient row",
      generatorNeed: "build lucky-strike formula/value bridge from buff/effect/description surface",
      proofGate: "lucky expected-value replay must match final packet totals",
    };
  }

  if (coeffStatus === "single-candidate" && blockers.size === 1 && blockers.has("active-modifier-spread-not-stripped")) {
    return {
      gapClass: "static-coefficient-present",
      staticState: "single coefficient candidate already mapped",
      generatorNeed: "none for static coefficient; replay needs modifier-strip proof",
      proofGate: "active modifier spread must be stripped or isolated",
    };
  }

  if (blockers.has("missing-child-static-coefficients")) {
    return {
      gapClass: "chain-child-coefficient-gap",
      staticState: "at least one sibling child is missing coefficient coverage",
      generatorNeed: "extend child damage id -> SkillEffect/Fight coefficient bridge",
      proofGate: chainStatus === "observed-subset-of-known-chain" ? "also needs all known child damage ids observed" : "chain coefficient shares must validate",
    };
  }

  if (blockers.has("missing-known-child-damage-ids") || blockers.has("chain-allocation-observed-subset")) {
    return {
      gapClass: "chain-sample-gap",
      staticState: "known sibling chain exists but sample did not observe all children",
      generatorNeed: "no static change until a complete chain sample exists",
      proofGate: "collect/scan encounter where every known child damage id appears",
    };
  }

  if (coeffStatus === "missing-link" || (!hasSkillEffect && !hasSkillFight)) {
    if (linkedSource.includes("BuffName") || row.category === "buff-proc") {
      return {
        gapClass: "buff-proc-effect-link-gap",
        staticState: "DamageAttr links to buff/source id without SkillEffect/Fight coefficient rows",
        generatorNeed: "bridge buff/source id to emitted proc coefficient/value table",
        proofGate: "source identity and coefficient table must both be historical/encounter-safe",
      };
    }

    return {
      gapClass: "damageattr-link-gap",
      staticState: "DamageAttr exists but generator cannot bridge it to SkillEffect/Fight coefficient rows",
      generatorNeed: "extend DamageAttr linked-id bridge",
      proofGate: "replay only after one unambiguous coefficient candidate exists",
    };
  }

  if (coeffStatus === "linked-but-zero-or-missing" && hasSkillEffect && hasSkillFight) {
    const nonzeroFightValues = unique(asArray(surfaceRow?.skillFights).map((fight) => finiteNumber(fight?.floatAt28)).filter((value) => value !== null && value > 0));
    const nonzeroEffectFields = unique(
      asArray(surfaceRow?.skillEffects)
        .flatMap((effect) => [effect.floatAt16, effect.u32At28])
        .map(finiteNumber)
        .filter((value) => value !== null && value > 0)
    );
    return {
      gapClass: "linked-zero-coefficient-field",
      staticState: "SkillEffect/Fight rows exist, but current candidate coefficient field is zero or unproven",
      generatorNeed:
        nonzeroFightValues.length || nonzeroEffectFields.length
          ? "prove the correct coefficient/value field among linked rows"
          : "deep-scan adjacent value-cal/effect component tables",
      proofGate: "candidate field must explain packet totals after active modifiers are stripped",
    };
  }

  if (coeffStatus === "ambiguous-candidates") {
    return {
      gapClass: "ambiguous-static-coefficient",
      staticState: "multiple nonzero coefficient candidates are present",
      generatorNeed: "disambiguate coefficient by level/tier/fight id",
      proofGate: "only one candidate may be promoted for a row/tier",
    };
  }

  return {
    gapClass: "evidence-only",
    staticState: "not enough information for a more specific static gap",
    generatorNeed: "keep as dev evidence",
    proofGate: "needs stronger static and runtime evidence",
  };
}

function buildReport(blockerReport, chainReport, surfaceReport, options) {
  const surfaceRows = indexByDamageId(surfaceReport.chainCandidates);
  const chainRows = indexChainChildren(chainReport);

  const rows = asArray(blockerReport.rows)
    .map((row) => {
      const key = String(finiteNumber(row.damageId));
      const surfaceRow = surfaceRows.get(key);
      const chainEntry = chainRows.get(key);
      const classification = classifyStaticGap(row, surfaceRow, chainEntry);
      const idSet = rowIds(row, surfaceRow, chainEntry);
      const hints = surfaceHints(surfaceReport, idSet);
      return {
        damageId: finiteNumber(row.damageId),
        name: row.name,
        category: row.category,
        finalValue: finiteNumber(row.finalValue),
        hits: finiteNumber(row.hits),
        recountIds: asArray(row.recountIds),
        recountNames: asArray(row.recountNames),
        linkedSource: row.linkedSource ?? surfaceRow?.generatedBreakdown?.linkedSource ?? "",
        linkedId: finiteNumber(row.linkedId ?? row.damageAttrLinkedId ?? surfaceRow?.damageAttr?.linkedId),
        skillEffectCount: finiteNumber(row.skillEffectCount) ?? asArray(surfaceRow?.skillEffects).length,
        skillFightCount: finiteNumber(row.skillFightCount) ?? asArray(surfaceRow?.skillFights).length,
        coefficientStatus: row.coefficientStatus,
        coefficientValues: asArray(row.coefficientValues),
        readiness: row.readiness,
        chainAllocation: row.chainAllocation ?? chainEntry?.chain?.allocationStatus ?? "",
        blockers: asArray(row.blockers),
        decritAttackSpreadPct: finiteNumber(row.decritAttackSpreadPct),
        gapClass: classification.gapClass,
        staticState: classification.staticState,
        generatorNeed: classification.generatorNeed,
        proofGate: classification.proofGate,
        surfaceHints: hints,
      };
    })
    .sort((left, right) => (right.finalValue ?? 0) - (left.finalValue ?? 0));

  const summary = {
    rows: rows.length,
    finalDamage: rows.reduce((sum, row) => sum + (row.finalValue ?? 0), 0),
    hits: rows.reduce((sum, row) => sum + (row.hits ?? 0), 0),
    byGapClass: countBy(rows, (row) => [row.gapClass]),
    byReadiness: countBy(rows, (row) => [row.readiness]),
    byGeneratorNeed: countBy(rows, (row) => [row.generatorNeed]),
  };

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      blockers: options.blockers,
      chain: options.chain,
      surface: options.surface,
    },
    semantics: {
      boundary: "dev-only audit; no parser/runtime contribution calculation",
      finalDamageAnchor: "observed packet final damage remains the truth source",
      purpose: "classify static coefficient and chain bridge gaps before any shipped modifier math",
    },
    summary,
    rows,
  };
}

function renderMarkdown(report, options) {
  const lines = [
    "# Skill Static Coefficient Gap Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Rows: ${formatNumber(report.summary.rows)}`,
    `- Final damage covered: ${formatNumber(report.summary.finalDamage)}`,
    `- Hits covered: ${formatNumber(report.summary.hits)}`,
    "",
    "### Gap Classes",
    "",
    markdownTable(
      ["Gap Class", "Rows"],
      Object.entries(report.summary.byGapClass).map(([name, count]) => [name, count])
    ),
    "",
    "### Generator Needs",
    "",
    markdownTable(
      ["Need", "Rows"],
      Object.entries(report.summary.byGeneratorNeed).map(([name, count]) => [name, count])
    ),
    "",
    "## Damage Rows",
    "",
    markdownTable(
      ["Damage", "Name", "Final", "Hits", "Link", "Coeff", "Spread", "Gap", "Next Generator/Data Need", "Surface Hints"],
      report.rows.slice(0, options.maxRows).map((row) => [
        row.damageId,
        row.name,
        formatShort(row.finalValue),
        formatNumber(row.hits),
        `${row.linkedSource}:${row.linkedId ?? ""}`,
        `${row.coefficientStatus}${row.coefficientValues?.length ? ` (${row.coefficientValues.join(", ")})` : ""}`,
        formatPct(row.decritAttackSpreadPct),
        row.gapClass,
        row.generatorNeed,
        asArray(row.surfaceHints)
          .map((hint) => `${hint.table} x${hint.matches}${hint.floatHints.length ? ` [${hint.floatHints.join("; ")}]` : ""}`)
          .join("; "),
      ])
    ),
    "",
    "## Proof Gates",
    "",
    markdownTable(
      ["Damage", "Name", "Static State", "Proof Gate", "Blockers"],
      report.rows.slice(0, options.maxRows).map((row) => [
        row.damageId,
        row.name,
        row.staticState,
        row.proofGate,
        row.blockers.join(", "),
      ])
    ),
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

  const blockerReport = readJson(options.blockers);
  const chainReport = readJson(options.chain);
  const surfaceReport = readJson(options.surface);
  const report = buildReport(blockerReport, chainReport, surfaceReport, options);

  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report, options));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Rows: ${report.summary.rows}`);
  console.log(`Gap classes: ${Object.entries(report.summary.byGapClass).map(([name, count]) => `${name}=${count}`).join(", ")}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
