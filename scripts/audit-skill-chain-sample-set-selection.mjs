#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-coefficient-gap-audit.json"),
    samplesDir: path.join(repoRoot, "DEV_exports"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-chain-sample-set-selection-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-chain-sample-set-selection-audit.md"),
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
      case "--chain":
        options.chain = path.resolve(next());
        break;
      case "--samples-dir":
        options.samplesDir = path.resolve(next());
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
  console.log(`Skill Chain Sample Set Selection Audit

Usage:
  node scripts/audit-skill-chain-sample-set-selection.mjs [options]

Notes:
  Dev-only chain sample planner. It identifies which saved modifier entity
  exports cover chain child damage ids and which ids still need targeted parses.
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

function sampleFiles(samplesDir) {
  return fs
    .readdirSync(samplesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^modifier-entity-\d+-\d+\.json$/u.test(entry.name))
    .map((entry) => path.join(samplesDir, entry.name))
    .sort();
}

function loadSamples(samplesDir) {
  const samples = [];
  const errors = [];
  for (const filePath of sampleFiles(samplesDir)) {
    try {
      const data = readJson(filePath);
      const dmgSkills = data?.dmgSkills ?? {};
      const damageIds = new Set(Object.keys(dmgSkills).map(String));
      samples.push({
        file: path.basename(filePath),
        encounterId: path.basename(filePath).match(/^modifier-entity-(\d+)-/u)?.[1] ?? null,
        playerUid: data?.uid ?? null,
        damageIds,
        dmgSkills,
      });
    } catch (error) {
      errors.push({ file: path.basename(filePath), error: String(error?.message ?? error) });
    }
  }
  return { samples, errors };
}

function rowStatus(row) {
  if (row.missingAfterAllSamples.length === 0) return "covered-in-saved-exports";
  if (row.foundAfterAllSamples.length > row.latestObservedDamageIds.length) return "improved-but-still-missing";
  return "targeted-capture-needed";
}

function buildReport(chain, options) {
  const { samples, errors } = loadSamples(options.samplesDir);
  const rows = [];
  for (const chainRow of asArray(chain.chains).filter((row) => asArray(row.knownDamageIds).length > 1)) {
    const knownIds = asArray(chainRow.knownDamageIds).map(String);
    const observedIds = asArray(chainRow.observedDamageIds).map(String);
    const perFile = samples
      .map((sample) => {
        const foundIds = knownIds.filter((id) => sample.damageIds.has(id));
        const totals = foundIds.map((id) => {
          const skill = sample.dmgSkills[id] ?? {};
          return {
            damageId: id,
            totalValue: finiteNumber(skill.totalValue) ?? 0,
            hits: finiteNumber(skill.hits) ?? 0,
          };
        });
        return {
          file: sample.file,
          encounterId: sample.encounterId,
          playerUid: sample.playerUid,
          foundIds,
          foundCount: foundIds.length,
          totalValue: totals.reduce((sum, entry) => sum + entry.totalValue, 0),
          hits: totals.reduce((sum, entry) => sum + entry.hits, 0),
          totals,
        };
      })
      .filter((entry) => entry.foundCount > 0)
      .sort((left, right) => right.foundCount - left.foundCount || right.totalValue - left.totalValue);

    const foundAfterAllSamples = [...new Set(perFile.flatMap((entry) => entry.foundIds))].sort();
    const missingAfterAllSamples = knownIds.filter((id) => !foundAfterAllSamples.includes(id));
    const row = {
      recountId: chainRow.recountId,
      recountNames: asArray(chainRow.recountNames).map(cleanName),
      chainVerdict: chainRow.chainVerdict,
      knownDamageIds: knownIds,
      latestObservedDamageIds: observedIds,
      missingInLatestAudit: asArray(chainRow.missingKnownDamageIds).map(String),
      foundAfterAllSamples,
      missingAfterAllSamples,
      bestFiles: perFile.slice(0, 6),
      sampleSetTotalValue: perFile.reduce((sum, entry) => sum + entry.totalValue, 0),
      sampleSetHits: perFile.reduce((sum, entry) => sum + entry.hits, 0),
    };
    row.status = rowStatus(row);
    rows.push(row);
  }

  const byStatus = {};
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      chain: options.chain,
      samplesDir: options.samplesDir,
    },
    semantics: {
      boundary: "dev-only chain sample selection; no parser/runtime/UI changes",
      purpose: "choose intentional sample sets for chain proof instead of mixing old and new captures accidentally",
      note: "coverage only proves child rows exist in saved exports; coefficient and modifier-strip replay still have to pass separately",
    },
    summary: {
      filesScanned: samples.length,
      scanErrors: errors.length,
      chains: rows.length,
      coveredInSavedExports: rows.filter((row) => row.status === "covered-in-saved-exports").length,
      improvedButStillMissing: rows.filter((row) => row.status === "improved-but-still-missing").length,
      targetedCaptureNeeded: rows.filter((row) => row.status === "targeted-capture-needed").length,
      byStatus,
    },
    scanErrors: errors,
    rows,
  };
}

function renderMarkdown(report) {
  return [
    "# Skill Chain Sample Set Selection Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Files scanned: ${formatNumber(report.summary.filesScanned)}`,
    `- Scan errors: ${formatNumber(report.summary.scanErrors)}`,
    `- Chains: ${formatNumber(report.summary.chains)}`,
    `- Covered in saved exports: ${formatNumber(report.summary.coveredInSavedExports)}`,
    `- Improved but still missing: ${formatNumber(report.summary.improvedButStillMissing)}`,
    `- Targeted capture needed: ${formatNumber(report.summary.targetedCaptureNeeded)}`,
    "",
    "## Chains",
    "",
    markdownTable(
      ["Recount", "Status", "Known IDs", "Latest Observed", "Found In Saved", "Still Missing", "Best Files"],
      report.rows.map((row) => [
        row.recountNames.join(", ") || row.recountId,
        row.status,
        row.knownDamageIds.join(", "),
        row.latestObservedDamageIds.join(", "),
        row.foundAfterAllSamples.join(", "),
        row.missingAfterAllSamples.join(", "),
        row.bestFiles
          .slice(0, 3)
          .map((entry) => `${entry.file}: ${entry.foundIds.join(",")} (${formatShort(entry.totalValue)}/${entry.hits})`)
          .join("; "),
      ])
    ),
    "",
    "## Inputs",
    "",
    `- chain: ${report.inputs.chain}`,
    `- samplesDir: ${report.inputs.samplesDir}`,
    "",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const chain = readJson(options.chain);
  const report = buildReport(chain, options);
  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Chains: ${report.summary.chains}`);
  console.log(`Covered: ${report.summary.coveredInSavedExports}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
