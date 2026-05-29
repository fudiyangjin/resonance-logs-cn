#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST = 4;
const DEFAULT_MAX_EVENT_FILES = 80;
const DEFAULT_MAX_EVENT_BYTES = 160 * 1024 * 1024;
const DEFAULT_PREFIX = "current";

function usage() {
  return `Usage: node scripts/probe-seasonal-factor-selector.mjs [options]

Options:
  --input <path>            Add a modifier-entity export. Repeatable.
  --latest <count>          Use latest DEV_exports/modifier-entity-*.json if no inputs are provided. Default: ${DEFAULT_LATEST}
  --event-root <path>       Event logger root/file to scan. Repeatable.
  --max-event-files <n>     Maximum event logger files to scan. Default: ${DEFAULT_MAX_EVENT_FILES}
  --max-event-bytes <n>     Skip event files larger than this. Default: ${DEFAULT_MAX_EVENT_BYTES}
  --prefix <name>           Report filename suffix. Default: ${DEFAULT_PREFIX}
  --skip-current-vdata      Reuse existing current-vdata/path-scan reports instead of rerunning cargo probes.
  --dry-run                 Print commands without running them.
`;
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    eventRoots: [],
    latest: DEFAULT_LATEST,
    maxEventFiles: DEFAULT_MAX_EVENT_FILES,
    maxEventBytes: DEFAULT_MAX_EVENT_BYTES,
    prefix: DEFAULT_PREFIX,
    skipCurrentVdata: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--input") {
      options.inputs.push(next());
    } else if (arg === "--event-root") {
      options.eventRoots.push(next());
    } else if (arg === "--latest") {
      options.latest = Math.max(1, Number(next()) || DEFAULT_LATEST);
    } else if (arg === "--max-event-files") {
      options.maxEventFiles = Math.max(0, Number(next()) || DEFAULT_MAX_EVENT_FILES);
    } else if (arg === "--max-event-bytes") {
      options.maxEventBytes = Math.max(0, Number(next()) || DEFAULT_MAX_EVENT_BYTES);
    } else if (arg === "--prefix") {
      options.prefix = String(next() || DEFAULT_PREFIX).replace(/[^a-z0-9_.-]/gi, "-") || DEFAULT_PREFIX;
    } else if (arg === "--skip-current-vdata") {
      options.skipCurrentVdata = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!fs.existsSync(resolved)) return fallback;
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, value, "utf8");
}

function compactPath(filePath) {
  const relative = path.relative(repoRoot, resolveRepoPath(filePath));
  return relative && !relative.startsWith("..") ? relative.replaceAll(path.sep, "/") : filePath;
}

function commandName(name) {
  if (process.platform !== "win32") return name;
  if (name === "cargo") return "cargo.exe";
  if (name === "node") return process.execPath;
  return name;
}

function commandForDisplay(command, args) {
  return [command, ...args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ");
}

function run(command, args, options = {}) {
  const display = commandForDisplay(command, args);
  console.log(`\n> ${display}`);
  if (options.dryRun) return;
  const result = spawnSync(commandName(command), args, {
    cwd: repoRoot,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${display}`);
  }
}

function pushRepeated(args, flag, values) {
  for (const value of values) args.push(flag, value);
}

function countObjectEntries(value) {
  if (!value || typeof value !== "object") return 0;
  return Object.keys(value).length;
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function sumNonOwnershipContexts(contextCounts) {
  if (!contextCounts || typeof contextCounts !== "object") return 0;
  return Object.entries(contextCounts)
    .filter(([context]) => !String(context).includes("item-package"))
    .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
}

function renderSummaryMarkdown(report) {
  const lines = [];
  lines.push("# Seasonal Factor Selector Current Probe", "");
  lines.push("- dev-only audit: no live parser, DPS, recount, monitor, hotkey, or modifier worker behavior is changed");
  lines.push(`- generated at: ${report.generatedAt}`);
  lines.push(`- current vdata: ${compactPath(report.outputs.currentVdata)}`);
  lines.push(`- vdata path scan: ${compactPath(report.outputs.vdataPathScan)}`);
  lines.push(`- container probe audit: ${compactPath(report.outputs.containerProbeMd)}`);
  lines.push(`- grade bridge audit: ${compactPath(report.outputs.gradeBridgeMd)}`);
  lines.push(`- selector source audit: ${compactPath(report.outputs.selectorSourceMd)}`);
  lines.push("");
  lines.push("## Summary", "");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("## Interpretation", "");
  lines.push("- Character-panel stat snapshots are already current runtime values; contribution math must use them as inputs, not add matching modifier values onto them again.");
  lines.push("- Factor identity and factor value selection are separate proof lanes: `activeFactorBuffs` can prove the factor family was present, but exact ladder math needs a selected grade/loadout selector.");
  lines.push("- Owned factor grade items and item-package rows are inventory evidence only. They remain blocked until a selected/loadout field or same-payload selector clue is captured and tied to an encounter timestamp.");
  if (report.summary.selectorReadyRows > 0) {
    lines.push("- This run found selector-ready evidence. Review the linked audits before promoting anything into formula replay.");
  } else if (report.summary.containerDirtyTreeSelectedTransitionRows > 0) {
    lines.push("- This run found dirty-container tree selected-slot transitions. Review the linked bridge report before promoting the decoder into runtime capture.");
  } else if (report.summary.containerSamePayloadSelectorCandidateRows > 0) {
    lines.push("- This run found same-payload identity+grade capture clues, but no selected/equipped selector rows. Keep exact ladder values blocked until a clue is tied to selected loadout state.");
  } else {
    lines.push("- This run did not find selector-ready evidence. The next useful test is launching with `npm run tauri:dev:factor-probes`, changing/confirming the seasonal factor loadout, then running this probe again.");
  }
  lines.push("");
  return lines.join("\n");
}

const options = parseArgs(process.argv.slice(2));
const suffix = options.prefix;
const outputs = {
  currentVdata: `DEV_exports/seasonal-factor-${suffix}-vdata.json`,
  vdataPathScan: `DEV_exports/vdata-path-scan-${suffix}.json`,
  containerProbeJson: `DEV_exports/container-probe-audit-${suffix}.json`,
  containerProbeMd: `DEV_exports/container-probe-audit-${suffix}.md`,
  gradeBridgeJson: `DEV_exports/seasonal-factor-grade-bridge-${suffix}.json`,
  gradeBridgeMd: `DEV_exports/seasonal-factor-grade-bridge-${suffix}.md`,
  selectorSourceJson: `DEV_exports/seasonal-factor-selector-source-${suffix}.json`,
  selectorSourceMd: `DEV_exports/seasonal-factor-selector-source-${suffix}.md`,
  summaryJson: `DEV_exports/seasonal-factor-selector-${suffix}-summary.json`,
  summaryMd: `DEV_exports/seasonal-factor-selector-${suffix}-summary.md`,
};

fs.mkdirSync(resolveRepoPath("DEV_exports"), { recursive: true });

const cargoEnv = {
  ...process.env,
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? path.join("..", "_codex_target_check", "factor-vdata"),
};

try {
  if (!options.skipCurrentVdata) {
    run(
      "cargo",
      [
        "run",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--no-default-features",
        "--bin",
        "probe_factor_vdata",
        "--",
        "--out-json",
        outputs.currentVdata,
      ],
      { env: cargoEnv, dryRun: options.dryRun },
    );

    run(
      "cargo",
      [
        "run",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--no-default-features",
        "--bin",
        "probe_vdata_paths",
        "--",
        "--out-json",
        outputs.vdataPathScan,
        "--max-matches",
        "800",
        "--max-raw-depth",
        "18",
      ],
      { env: cargoEnv, dryRun: options.dryRun },
    );
  }

  const inputArgs = [];
  if (options.inputs.length) {
    pushRepeated(inputArgs, "--input", options.inputs);
  } else {
    inputArgs.push("--latest", String(options.latest));
  }

  const eventRootArgs = [];
  pushRepeated(eventRootArgs, "--event-root", options.eventRoots);

  const containerInputArgs = [];
  pushRepeated(containerInputArgs, "--input", options.eventRoots);

  run(
    "node",
    [
      "scripts/audit-container-probes.mjs",
      ...containerInputArgs,
      "--max-files",
      String(options.maxEventFiles),
      "--max-bytes",
      String(options.maxEventBytes),
      "--out-json",
      outputs.containerProbeJson,
      "--out-md",
      outputs.containerProbeMd,
    ],
    { dryRun: options.dryRun },
  );

  run(
    "node",
    [
      "scripts/audit-seasonal-factor-grade-bridge.mjs",
      ...inputArgs,
      "--current-vdata",
      outputs.currentVdata,
      "--vdata-path-scan",
      outputs.vdataPathScan,
      "--container-probes",
      outputs.containerProbeJson,
      "--out-json",
      outputs.gradeBridgeJson,
      "--out-md",
      outputs.gradeBridgeMd,
    ],
    { dryRun: options.dryRun },
  );

  run(
    "node",
    [
      "scripts/audit-seasonal-factor-selector-source.mjs",
      ...inputArgs,
      ...eventRootArgs,
      "--max-event-files",
      String(options.maxEventFiles),
      "--max-event-bytes",
      String(options.maxEventBytes),
      "--current-vdata",
      outputs.currentVdata,
      "--vdata-path-scan",
      outputs.vdataPathScan,
      "--out-json",
      outputs.selectorSourceJson,
      "--out-md",
      outputs.selectorSourceMd,
    ],
    { dryRun: options.dryRun },
  );

  if (!options.dryRun) {
    const currentVdata = readJson(outputs.currentVdata, {});
    const pathScan = readJson(outputs.vdataPathScan, {});
    const containerProbe = readJson(outputs.containerProbeJson, {});
    const gradeBridge = readJson(outputs.gradeBridgeJson, {});
    const selectorSource = readJson(outputs.selectorSourceJson, {});

    const summary = {
      factorGradeSelectionStatus: currentVdata?.conclusion?.factor_grade_selection_status ?? "unknown",
      currentOwnedFactorCandidates:
        currentVdata?.summary?.factor_item_match_count ?? countArray(currentVdata?.factor_item_matches),
      currentEquippedFactorCandidates:
        currentVdata?.summary?.equipped_factor_item_match_count ?? countArray(currentVdata?.equipped_factor_item_matches),
      currentBuffDbFactorMatches:
        currentVdata?.summary?.buff_db_factor_match_count ?? countArray(currentVdata?.buff_db_factor_matches),
      vdataPathMatches: pathScan?.summary?.match_count ?? pathScan?.matchCount ?? 0,
      vdataPathRawMatches: pathScan?.summary?.raw_proto_match_count ?? pathScan?.rawProtoMatchCount ?? 0,
      vdataPathNonOwnershipMatches: sumNonOwnershipContexts(pathScan?.summary?.match_count_by_context),
      vdataPathRawNonOwnershipMatches: sumNonOwnershipContexts(pathScan?.summary?.raw_proto_match_count_by_context),
      vdataPathNonOwnershipContextKinds: countObjectEntries(
        pathScan?.summary?.match_count_by_non_ownership_context ?? pathScan?.nonOwnershipContexts,
      ),
      containerProbeEntries: containerProbe?.probeEntryCount ?? 0,
      containerSamePayloadSelectorCandidateRows: containerProbe?.samePayloadSelectorCandidateRowCount ?? 0,
      containerDirtyTreeSelectedTransitionRows: containerProbe?.dirtyTreeSelectedTransitionRowCount ?? 0,
      containerDirtyTreeSelectedTransitions: containerProbe?.dirtyTreeSelectedTransitionCount ?? 0,
      rawSeasonalRows: gradeBridge?.summary?.rawSeasonalRows ?? 0,
      encounterSelectorRows: gradeBridge?.summary?.encounterSelectorRows ?? 0,
      dirtyTreeSelectorRows: gradeBridge?.summary?.dirtyTreeSelectorRows ?? 0,
      currentVdataCandidateRows: gradeBridge?.summary?.currentVdataCandidateRows ?? 0,
      selectorReadyRows: gradeBridge?.summary?.selectorReadyRows ?? 0,
      selectorSourceEventFilesScanned: selectorSource?.summary?.eventFilesScanned ?? selectorSource?.summary?.eventFiles ?? 0,
      selectorSourceEventContainerProbeEntries: selectorSource?.summary?.eventContainerProbeEntries ?? 0,
      selectorSourceEventContainerProbeEntriesWithSelectors:
        selectorSource?.summary?.eventContainerProbeEntriesWithSelectors ?? 0,
      selectorSourceEventContainerProbeEntriesWithSamePayloadSelectorClues:
        selectorSource?.summary?.eventContainerProbeEntriesWithSamePayloadSelectorClues ?? 0,
      selectorSourceEventContainerProbeEntriesWithGradeOnlyClues:
        selectorSource?.summary?.eventContainerProbeEntriesWithGradeOnlyClues ?? 0,
    };

    const report = {
      source: "probe-seasonal-factor-selector",
      generatedAt: new Date().toISOString(),
      options,
      outputs,
      summary,
      notes: [
        "Character-panel stat snapshots are current runtime truth; do not add matching modifier values back onto them.",
        "activeFactorBuffs proves seasonal factor identity, not selected grade/value.",
        "activeFactorItems or an equivalent selected loadout field is required before exact seasonal factor ladder values can feed contribution math.",
        "Dirty-container tree zero-to-grade transitions are treated as selected-slot evidence in this dev audit, not live contribution input.",
        "Container probes are dev-only event logger rows and remain evidence until linked to encounter/local timestamp state.",
      ],
    };

    writeJson(outputs.summaryJson, report);
    writeText(outputs.summaryMd, renderSummaryMarkdown(report));
    console.log(`\nWrote ${outputs.summaryJson}`);
    console.log(`Wrote ${outputs.summaryMd}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
