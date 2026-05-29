#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    chain: path.join(repoRoot, "DEV_exports", "skill-chain-coefficient-gap-audit.json"),
    lucky: path.join(repoRoot, "DEV_exports", "skill-lucky-formula-bridge-audit.json"),
    samplesDir: path.join(repoRoot, "DEV_exports"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-missing-sibling-sample-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-missing-sibling-sample-audit.md"),
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
      case "--lucky":
        options.lucky = path.resolve(next());
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
  console.log(`Skill Missing Sibling Sample Audit

Usage:
  node scripts/audit-skill-missing-sibling-samples.mjs [options]

Notes:
  Dev-only scan of saved modifier entity exports to see whether chain/lucky
  sibling damage ids already exist in local samples.
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

function collectTargets(chain, lucky) {
  const targets = new Map();
  const addTarget = (damageId, source) => {
    const key = String(damageId);
    const entry = targets.get(key) ?? {
      damageId: key,
      sources: [],
      foundIn: [],
      totalValue: 0,
      hits: 0,
      critHits: 0,
      luckyHits: 0,
    };
    entry.sources.push(source);
    targets.set(key, entry);
  };

  for (const chainRow of asArray(chain.chains)) {
    for (const missingId of asArray(chainRow.missingKnownDamageIds)) {
      addTarget(missingId, {
        lane: "chain",
        recountId: chainRow.recountId,
        recountNames: asArray(chainRow.recountNames).map(cleanName),
        observedDamageIds: chainRow.observedDamageIds,
      });
    }
  }

  for (const row of asArray(lucky.rows)) {
    for (const missingId of asArray(row.chain?.missingKnownDamageIds)) {
      addTarget(missingId, {
        lane: "lucky",
        sourceId: row.runtimeSource?.sourceId,
        sourceName: row.runtimeSource?.sourceName,
        observedDamageIds: row.chain?.observedDamageIds,
      });
    }
  }

  return targets;
}

function buildReport(chain, lucky, options) {
  const targets = collectTargets(chain, lucky);
  const files = sampleFiles(options.samplesDir);
  const scanErrors = [];

  for (const filePath of files) {
    let sample;
    try {
      sample = readJson(filePath);
    } catch (error) {
      scanErrors.push({ file: path.basename(filePath), error: String(error?.message ?? error) });
      continue;
    }
    const dmgSkills = sample?.dmgSkills ?? {};
    for (const [damageId, target] of targets) {
      const skill = dmgSkills[damageId];
      if (!skill) continue;
      const totalValue = finiteNumber(skill.totalValue) ?? 0;
      const hits = finiteNumber(skill.hits) ?? 0;
      const critHits = finiteNumber(skill.critHits) ?? 0;
      const luckyHits = finiteNumber(skill.luckyHits) ?? 0;
      target.totalValue += totalValue;
      target.hits += hits;
      target.critHits += critHits;
      target.luckyHits += luckyHits;
      target.foundIn.push({
        file: path.basename(filePath),
        encounterId: sample?.encounterId ?? path.basename(filePath).match(/^modifier-entity-(\d+)-/u)?.[1] ?? null,
        playerUid: sample?.uid ?? null,
        totalValue,
        hits,
        critHits,
        luckyHits,
      });
    }
  }

  const rows = [...targets.values()].sort((left, right) => Number(left.damageId) - Number(right.damageId));
  const foundRows = rows.filter((row) => row.foundIn.length);
  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      chain: options.chain,
      lucky: options.lucky,
      samplesDir: options.samplesDir,
    },
    semantics: {
      boundary: "dev-only sample coverage scan; no parser/runtime/UI changes",
      purpose: "check whether missing known sibling damage ids already exist in saved modifier entity exports",
      gate: "a found sibling removes the sample blocker only for evidence; coefficient and modifier-strip proof are still separate blockers",
    },
    summary: {
      filesScanned: files.length,
      scanErrors: scanErrors.length,
      targetDamageIds: rows.length,
      foundTargetDamageIds: foundRows.length,
      stillMissingTargetDamageIds: rows.length - foundRows.length,
      foundTotalValue: foundRows.reduce((sum, row) => sum + row.totalValue, 0),
      foundHits: foundRows.reduce((sum, row) => sum + row.hits, 0),
    },
    scanErrors,
    rows,
  };
}

function renderMarkdown(report) {
  return [
    "# Skill Missing Sibling Sample Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Files scanned: ${formatNumber(report.summary.filesScanned)}`,
    `- Scan errors: ${formatNumber(report.summary.scanErrors)}`,
    `- Target damage IDs: ${formatNumber(report.summary.targetDamageIds)}`,
    `- Found target damage IDs: ${formatNumber(report.summary.foundTargetDamageIds)}`,
    `- Still missing target damage IDs: ${formatNumber(report.summary.stillMissingTargetDamageIds)}`,
    `- Found total value: ${formatNumber(report.summary.foundTotalValue)}`,
    `- Found hits: ${formatNumber(report.summary.foundHits)}`,
    "",
    "## Target Rows",
    "",
    markdownTable(
      ["Damage ID", "Status", "Total", "Hits", "Files", "Sources"],
      report.rows.map((row) => [
        row.damageId,
        row.foundIn.length ? "found" : "missing",
        formatShort(row.totalValue),
        formatNumber(row.hits),
        row.foundIn.map((entry) => `${entry.file}:${formatShort(entry.totalValue)}/${entry.hits}`).join("; "),
        row.sources
          .map((source) =>
            source.lane === "chain"
              ? `${source.lane}:${asArray(source.recountNames).join(",") || source.recountId}`
              : `${source.lane}:${source.sourceName ?? source.sourceId}`
          )
          .join("; "),
      ])
    ),
    "",
    "## Inputs",
    "",
    `- chain: ${report.inputs.chain}`,
    `- lucky: ${report.inputs.lucky}`,
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
  const lucky = readJson(options.lucky);
  const report = buildReport(chain, lucky, options);
  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Targets: ${report.summary.targetDamageIds}`);
  console.log(`Found: ${report.summary.foundTargetDamageIds}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
