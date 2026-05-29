#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const defaultSourceRoot = path.resolve(repoRoot, "..", "BPSR-UID-Extractors", "output");
const defaultTargetRoot = path.resolve(repoRoot, "DEV_generated", "modifier");

const COPY_ENTRIES = [
  "ModifierDescriptionCatalogs.json",
  "ItemDescriptionSources.json",
  "SeasonEffectDescriptions.json",
  "BuffDescriptions.json",
  "SkillDescriptions.json",
  "SkillDescriptions.locales",
  "TalentDescriptions.json",
  "SeasonalTalentDescriptions.json",
  "FactorDescriptions.json",
  "ItemDescriptions.json",
  "ItemDescriptions.locales",
  "BattleImagineDescriptions.json",
  "LinkTextTooltipDescriptions.json",
  "ModifierFormulaTermTable.json",
  "ModifierFormulaTermRuntime.json",
  "ModifierValueProofTable.json",
  "ModifierValueProofRuntime.json",
];

function parseArgs(argv) {
  const options = {
    sourceRoot: defaultSourceRoot,
    targetRoot: defaultTargetRoot,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    switch (arg) {
      case "--source-root":
        options.sourceRoot = path.resolve(repoRoot, next());
        break;
      case "--target-root":
        options.targetRoot = path.resolve(repoRoot, next());
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/sync-modifier-dev-generated.mjs [options]

Copy heavy extractor-side modifier development assets into the app repo without
placing them under parser-data, so they stay out of shipped runtime bundles.

Options:
  --source-root <path>  Extractor output directory. Default: ../BPSR-UID-Extractors/output
  --target-root <path>  App-side dev asset directory. Default: DEV_generated/modifier
  --dry-run             Print what would be copied without writing files.
`);
}

function assertInside(parent, child) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing path outside target root: ${child}`);
  }
}

function copyEntry(sourceRoot, targetRoot, relativePath, dryRun) {
  const sourcePath = path.resolve(sourceRoot, relativePath);
  const targetPath = path.resolve(targetRoot, relativePath);
  assertInside(targetRoot, targetPath);

  if (!fs.existsSync(sourcePath)) {
    return {
      relativePath,
      copied: false,
      missing: true,
      bytes: 0,
      files: 0,
    };
  }

  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    const summary = directorySummary(sourcePath);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
    }
    return {
      relativePath,
      copied: true,
      directory: true,
      bytes: summary.bytes,
      files: summary.files,
    };
  }

  if (!dryRun) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }

  return {
    relativePath,
    copied: true,
    directory: false,
    bytes: stat.size,
    files: 1,
  };
}

function directorySummary(directoryPath) {
  let bytes = 0;
  let files = 0;
  const pending = [directoryPath];

  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(entryPath);
        bytes += stat.size;
        files += 1;
      }
    }
  }

  return { bytes, files };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function writeManifest(targetRoot, sourceRoot, results, dryRun) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(repoRoot, sourceRoot).replaceAll("\\", "/"),
    targetRoot: path.relative(repoRoot, targetRoot).replaceAll("\\", "/"),
    dryRun,
    files: results,
    copiedFiles: results.reduce((total, result) => total + (result.copied ? result.files : 0), 0),
    copiedBytes: results.reduce((total, result) => total + (result.copied ? result.bytes : 0), 0),
    missing: results.filter((result) => result.missing).map((result) => result.relativePath),
  };

  if (!dryRun) {
    fs.mkdirSync(targetRoot, { recursive: true });
    fs.writeFileSync(path.join(targetRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return manifest;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(options.sourceRoot);
  const targetRoot = path.resolve(options.targetRoot);
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });

  const results = COPY_ENTRIES.map((entry) => copyEntry(sourceRoot, targetRoot, entry, options.dryRun));
  const manifest = writeManifest(targetRoot, sourceRoot, results, options.dryRun);

  for (const result of results) {
    const status = result.missing ? "missing" : options.dryRun ? "would copy" : "copied";
    const detail = result.directory ? `${result.files} files, ${formatBytes(result.bytes)}` : formatBytes(result.bytes);
    console.log(`${status}: ${result.relativePath} (${detail})`);
  }

  console.log(
    `${options.dryRun ? "Would sync" : "Synced"} ${manifest.copiedFiles} files (${formatBytes(
      manifest.copiedBytes,
    )}) to ${path.relative(repoRoot, targetRoot).replaceAll("\\", "/")}`,
  );

  if (manifest.missing.length) {
    console.warn(`Missing optional entries: ${manifest.missing.join(", ")}`);
  }
}

main();
