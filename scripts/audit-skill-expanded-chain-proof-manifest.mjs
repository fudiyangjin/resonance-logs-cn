#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_MAX_FILES_PER_CHAIN = 3;

function parseArgs(argv) {
  const options = {
    sampleSet: path.join(repoRoot, "DEV_exports", "skill-chain-sample-set-selection-audit.json"),
    outJson: path.join(repoRoot, "DEV_exports", "skill-expanded-chain-proof-manifest.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-expanded-chain-proof-manifest.md"),
    maxFilesPerChain: DEFAULT_MAX_FILES_PER_CHAIN,
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
      case "--sample-set":
        options.sampleSet = path.resolve(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--max-files-per-chain":
        options.maxFilesPerChain = Number(next());
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
  console.log(`Skill Expanded Chain Proof Manifest

Usage:
  node scripts/audit-skill-expanded-chain-proof-manifest.mjs [options]

Notes:
  Dev-only manifest builder. It turns the sample-set scan into an explicit
  allowlist for expanded chain proof inputs, keeping partial and missing chains
  out of replay math until their sibling damage ids are present.
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function cleanName(row) {
  return asArray(row.recountNames).filter(Boolean).join(", ") || String(row.recountId ?? "");
}

function samplePath(fileName) {
  return path.join(repoRoot, "DEV_exports", fileName);
}

function proofStatus(row) {
  if (row.status === "covered-in-saved-exports") return "ready-for-expanded-ledger";
  if (row.status === "improved-but-still-missing") return "partial-proof-only";
  return "targeted-capture-needed";
}

function selectedFilesFor(row, options) {
  const knownCount = asArray(row.knownDamageIds).length;
  const files = asArray(row.bestFiles);
  if (row.status !== "covered-in-saved-exports") return [];
  return files
    .filter((entry) => asArray(entry.foundIds).length === knownCount)
    .slice(0, Math.max(1, options.maxFilesPerChain));
}

function evidenceFilesFor(row, options) {
  return asArray(row.bestFiles).slice(0, Math.max(1, options.maxFilesPerChain));
}

function buildManifest(sampleSet, options) {
  const rows = asArray(sampleSet.rows).map((row) => {
    const status = proofStatus(row);
    const selectedFiles = selectedFilesFor(row, options);
    const evidenceFiles = evidenceFilesFor(row, options);
    const selectedInputFiles = selectedFiles.map((entry) => ({
      file: entry.file,
      path: samplePath(entry.file),
      encounterId: entry.encounterId,
      playerUid: entry.playerUid,
      foundIds: asArray(entry.foundIds).map(String),
      totalValue: finiteNumber(entry.totalValue) ?? 0,
      hits: finiteNumber(entry.hits) ?? 0,
    }));

    return {
      recountId: row.recountId,
      recountNames: asArray(row.recountNames),
      name: cleanName(row),
      sourceStatus: row.status,
      proofStatus: status,
      ledgerEligible: status === "ready-for-expanded-ledger",
      knownDamageIds: asArray(row.knownDamageIds).map(String),
      latestObservedDamageIds: asArray(row.latestObservedDamageIds).map(String),
      foundAfterAllSamples: asArray(row.foundAfterAllSamples).map(String),
      missingDamageIds: asArray(row.missingAfterAllSamples).map(String),
      selectedInputFiles,
      evidenceFiles: evidenceFiles.map((entry) => ({
        file: entry.file,
        encounterId: entry.encounterId,
        foundIds: asArray(entry.foundIds).map(String),
        totalValue: finiteNumber(entry.totalValue) ?? 0,
        hits: finiteNumber(entry.hits) ?? 0,
      })),
      nextProof:
        status === "ready-for-expanded-ledger"
          ? "run expanded ledger/chain allocation, then require coefficient and modifier-strip proof"
          : status === "partial-proof-only"
            ? "keep out of expanded replay and capture the remaining sibling damage ids"
            : "target a parse that emits the missing sibling damage ids",
    };
  });

  const expandedLedgerInputs = uniqueSorted(rows.flatMap((row) => row.selectedInputFiles.map((entry) => entry.path)));
  const inputArgs = expandedLedgerInputs.flatMap((input) => ["--input", input]);

  const summary = {
    chains: rows.length,
    readyForExpandedLedger: rows.filter((row) => row.proofStatus === "ready-for-expanded-ledger").length,
    partialProofOnly: rows.filter((row) => row.proofStatus === "partial-proof-only").length,
    targetedCaptureNeeded: rows.filter((row) => row.proofStatus === "targeted-capture-needed").length,
    expandedLedgerInputFiles: expandedLedgerInputs.length,
    readyChainNames: rows.filter((row) => row.ledgerEligible).map((row) => row.name),
    blockedMissingDamageIds: uniqueSorted(rows.flatMap((row) => row.missingDamageIds)),
  };

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      sampleSet: options.sampleSet,
    },
    semantics: {
      boundary: "dev-only manifest; no parser/runtime/UI changes",
      purpose: "explicitly choose chain proof sample inputs before any expanded replay audit",
      note: "ledger eligibility only means all known child packet rows exist in saved exports; it does not prove coefficients or contribution math",
    },
    summary,
    expandedLedgerInputs,
    expandedLedgerCommandArgs: inputArgs,
    suggestedReports: {
      ledgerJson: path.join(repoRoot, "DEV_exports", "skill-base-hit-ledger-expanded-chain.json"),
      ledgerMd: path.join(repoRoot, "DEV_exports", "skill-base-hit-ledger-expanded-chain.md"),
      chainJson: path.join(repoRoot, "DEV_exports", "skill-chain-allocation-expanded-chain.json"),
      chainMd: path.join(repoRoot, "DEV_exports", "skill-chain-allocation-expanded-chain.md"),
      blockersJson: path.join(repoRoot, "DEV_exports", "skill-coefficient-blockers-expanded-chain.json"),
      blockersMd: path.join(repoRoot, "DEV_exports", "skill-coefficient-blockers-expanded-chain.md"),
    },
    rows,
  };
}

function renderMarkdown(report) {
  const commandInputs = report.expandedLedgerInputs.map((input) => `--input "${input}"`).join(" ");
  return [
    "# Skill Expanded Chain Proof Manifest",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Chains: ${formatNumber(report.summary.chains)}`,
    `- Ready for expanded ledger: ${formatNumber(report.summary.readyForExpandedLedger)}`,
    `- Partial proof only: ${formatNumber(report.summary.partialProofOnly)}`,
    `- Targeted capture needed: ${formatNumber(report.summary.targetedCaptureNeeded)}`,
    `- Expanded ledger input files: ${formatNumber(report.summary.expandedLedgerInputFiles)}`,
    `- Blocked missing damage IDs: ${report.summary.blockedMissingDamageIds.join(", ") || "none"}`,
    "",
    "## Suggested Dev Commands",
    "",
    "```powershell",
    `node scripts/audit-skill-base-hit-ledger.mjs ${commandInputs} --out-json DEV_exports/skill-base-hit-ledger-expanded-chain.json --out-md DEV_exports/skill-base-hit-ledger-expanded-chain.md`,
    "node scripts/audit-skill-chain-allocation.mjs --ledger DEV_exports/skill-base-hit-ledger-expanded-chain.json --out-json DEV_exports/skill-chain-allocation-expanded-chain.json --out-md DEV_exports/skill-chain-allocation-expanded-chain.md",
    "node scripts/audit-skill-coefficient-blockers.mjs --ledger DEV_exports/skill-base-hit-ledger-expanded-chain.json --chain DEV_exports/skill-chain-allocation-expanded-chain.json --out-json DEV_exports/skill-coefficient-blockers-expanded-chain.json --out-md DEV_exports/skill-coefficient-blockers-expanded-chain.md",
    "```",
    "",
    "## Chains",
    "",
    markdownTable(
      ["Recount", "Proof Status", "Known IDs", "Missing IDs", "Selected Inputs", "Evidence Files", "Next Proof"],
      report.rows.map((row) => [
        row.name,
        row.proofStatus,
        row.knownDamageIds.join(", "),
        row.missingDamageIds.join(", "),
        row.selectedInputFiles
          .map((entry) => `${entry.file}: ${entry.foundIds.join(",")} (${formatShort(entry.totalValue)}/${formatNumber(entry.hits)})`)
          .join("; "),
        row.evidenceFiles
          .map((entry) => `${entry.file}: ${entry.foundIds.join(",")} (${formatShort(entry.totalValue)}/${formatNumber(entry.hits)})`)
          .join("; "),
        row.nextProof,
      ])
    ),
    "",
    "## Inputs",
    "",
    `- sampleSet: ${report.inputs.sampleSet}`,
    "",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sampleSet = readJson(options.sampleSet);
  const report = buildManifest(sampleSet, options);
  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));

  console.log(
    `Wrote ${path.relative(repoRoot, options.outJson)} and ${path.relative(repoRoot, options.outMd)}`
  );
  console.log(
    `Ready chains=${report.summary.readyForExpandedLedger}, partial=${report.summary.partialProofOnly}, capture=${report.summary.targetedCaptureNeeded}, inputs=${report.summary.expandedLedgerInputFiles}`
  );
}

main();
