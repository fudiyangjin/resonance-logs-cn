#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultGeneratedDir = firstExistingPath([
  path.join(repoRoot, "parser-data", "generated"),
  path.join(repoRoot, "..", "Generators", "output"),
]);
const defaultConfigDir = path.join(repoRoot, "src", "lib", "config");
const defaultOutputDir = path.join(repoRoot, "DEV_exports");

const DEFAULT_MAX_SAMPLES = 20;

const KNOWN_DATASETS = [
  { label: "Buff names", generated: "BuffName.json", config: "BuffName.json", idFields: ["Id", "id", "baseId"] },
  {
    label: "Damage attr names",
    generated: "DamageAttrIdName.json",
    config: "DamageAttrIdName.json",
    idFields: ["Id", "id"],
  },
  { label: "Recount table", generated: "RecountTable.json", config: "RecountTable.json", idFields: ["Id", "id"] },
  { label: "Item names", generated: "itemnames.json", config: "itemnames.json", idFields: ["Id", "id"] },
  {
    label: "Monster names",
    generated: "monsternames.json",
    config: "MonsterIdNameType.json",
    idFields: ["Id", "MonsterId", "id"],
  },
  {
    label: "Scene names",
    generated: "scenenames.json",
    config: "SceneName.json",
    idFields: ["Id", "SceneId", "id"],
  },
  {
    label: "Skill aoyi icons",
    generated: "skill_aoyi_icons.json",
    config: "skill_aoyi_icons.json",
    idFields: ["Id", "SkillId", "id"],
  },
  { label: "Skill names", generated: "skillnames.json", config: "skillnames.json", idFields: ["Id", "SkillId", "id"] },
  { label: "Class labels", generated: "class-labels.json", config: "class-labels.json", idFields: ["Id", "ClassId", "id"] },
  {
    label: "Effect sources",
    generated: "EffectSources.json",
    config: "EffectSources.json",
    idFields: ["Id", "id", "sourceId"],
    entryPath: ["effectSourcesById"],
  },
  {
    label: "Season phantom factors",
    generated: "SeasonPhantomFactors.json",
    config: "SeasonPhantomFactors.json",
    idFields: ["Id", "id", "factorBuffId"],
    entryPath: ["factorsByBuffId"],
  },
];

function firstExistingPath(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function parseArgs(argv) {
  const args = {
    generatedDir: defaultGeneratedDir,
    configDir: defaultConfigDir,
    gitBaseline: true,
    gitRef: "HEAD",
    outJson: path.join(defaultOutputDir, "generated-config-diff.json"),
    outMd: path.join(defaultOutputDir, "generated-config-diff.md"),
    maxSamples: DEFAULT_MAX_SAMPLES,
    includeConfigOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--generated-dir" && argv[i + 1]) {
      args.generatedDir = resolveFromRepo(argv[++i]);
    } else if (arg === "--config-dir" && argv[i + 1]) {
      args.configDir = resolveFromRepo(argv[++i]);
    } else if (arg === "--git-ref" && argv[i + 1]) {
      args.gitRef = argv[++i];
    } else if (arg === "--no-git-baseline") {
      args.gitBaseline = false;
    } else if (arg === "--out-json" && argv[i + 1]) {
      args.outJson = resolveFromRepo(argv[++i]);
    } else if (arg === "--out-md" && argv[i + 1]) {
      args.outMd = resolveFromRepo(argv[++i]);
    } else if (arg === "--max-samples" && argv[i + 1]) {
      args.maxSamples = Math.max(0, Number(argv[++i]) || DEFAULT_MAX_SAMPLES);
    } else if (arg === "--include-config-only") {
      args.includeConfigOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage: node scripts/compare-generated-config.mjs [options]

Compares generated parser data against src/lib/config JSON baselines. When the
working tree no longer has a config JSON file, the script can read the tracked
baseline from git so generated-data imports can be reviewed before copy/import.

Options:
  --generated-dir <path>  Generated JSON directory. Defaults to parser-data/generated.
  --config-dir <path>     Runtime config JSON directory. Defaults to src/lib/config.
  --git-ref <ref>         Git ref for missing config JSON baselines. Default: HEAD.
  --no-git-baseline       Only compare files that exist in the working tree.
  --out-json <path>       JSON report path. Default: DEV_exports/generated-config-diff.json.
  --out-md <path>         Markdown report path. Default: DEV_exports/generated-config-diff.md.
  --max-samples <count>   Sample count per diff bucket. Default: ${DEFAULT_MAX_SAMPLES}.
  --include-config-only   Include config JSON files with no generated counterpart.
`);
}

function resolveFromRepo(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
}

function walkJsonFiles(dir, baseDir = dir, result = new Map()) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, baseDir, result);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      result.set(normalizeSlashes(path.relative(baseDir, fullPath)), fullPath);
    }
  }
  return result;
}

function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}

function repoRelative(filePath) {
  return normalizeSlashes(path.relative(repoRoot, filePath));
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listGitJsonFiles(configDir, gitRef) {
  const configRel = repoRelative(configDir);
  try {
    const output = execFileSync("git", ["ls-tree", "-r", "--name-only", gitRef, configRel], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.endsWith(".json"))
      .map((filePath) => normalizeSlashes(path.relative(configRel, filePath)));
  } catch {
    return [];
  }
}

function readGitJson(configDir, relativePath, gitRef) {
  const gitPath = `${repoRelative(configDir)}/${relativePath}`;
  try {
    const output = execFileSync("git", ["show", `${gitRef}:${gitPath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function stableString(value) {
  return JSON.stringify(stableValue(value));
}

function valueAtPath(payload, entryPath) {
  let current = payload;
  for (const part of entryPath ?? []) {
    if (!isRecord(current)) return payload;
    current = current[part];
  }
  return current ?? payload;
}

function collectEntries(payload, idFields, entryPath = []) {
  const entryPayload = valueAtPath(payload, entryPath);

  if (Array.isArray(entryPayload)) {
    return entryPayload.map((value, index) => ({
      key: extractEntryKey(value, idFields) ?? `#${index}`,
      value,
    }));
  }

  if (isRecord(entryPayload)) {
    return Object.entries(entryPayload).map(([key, value]) => ({
      key: extractEntryKey(value, idFields) ?? key,
      value,
    }));
  }

  return [{ key: "$value", value: entryPayload }];
}

function extractEntryKey(value, idFields) {
  if (!isRecord(value)) return null;
  for (const field of idFields) {
    const rawValue = value[field];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "bigint") {
      return String(rawValue);
    }
  }
  return null;
}

function indexPayload(payload, idFields, entryPath = []) {
  const map = new Map();
  const duplicates = [];
  const duplicateCounts = new Map();

  for (const entry of collectEntries(payload, idFields, entryPath)) {
    let key = entry.key;
    if (map.has(key)) {
      const count = (duplicateCounts.get(key) ?? 1) + 1;
      duplicateCounts.set(key, count);
      duplicates.push(key);
      key = `${key}#duplicate-${count}`;
    }
    map.set(key, entry.value);
  }

  return {
    count: map.size,
    duplicates: [...new Set(duplicates)].sort(compareKeys),
    map,
  };
}

function compareKeys(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function comparePayloads(generated, baseline, idFields, entryPath, maxSamples) {
  const generatedIndex = indexPayload(generated, idFields, entryPath);
  const baselineIndex = indexPayload(baseline, idFields, entryPath);
  const generatedKeys = new Set(generatedIndex.map.keys());
  const baselineKeys = new Set(baselineIndex.map.keys());
  const added = [...generatedKeys].filter((key) => !baselineKeys.has(key)).sort(compareKeys);
  const removed = [...baselineKeys].filter((key) => !generatedKeys.has(key)).sort(compareKeys);
  const common = [...generatedKeys].filter((key) => baselineKeys.has(key)).sort(compareKeys);
  const changed = common.filter((key) => stableString(generatedIndex.map.get(key)) !== stableString(baselineIndex.map.get(key)));

  return {
    generatedCount: generatedIndex.count,
    baselineCount: baselineIndex.count,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    unchangedCount: common.length - changed.length,
    generatedDuplicateKeys: generatedIndex.duplicates.slice(0, maxSamples),
    baselineDuplicateKeys: baselineIndex.duplicates.slice(0, maxSamples),
    samples: {
      added: sampleRows(added, generatedIndex.map, null, maxSamples),
      removed: sampleRows(removed, null, baselineIndex.map, maxSamples),
      changed: sampleRows(changed, generatedIndex.map, baselineIndex.map, maxSamples),
    },
  };
}

function sampleRows(keys, generatedMap, baselineMap, maxSamples) {
  return keys.slice(0, maxSamples).map((key) => ({
    key,
    generated: generatedMap ? summarizeRow(generatedMap.get(key)) : null,
    baseline: baselineMap ? summarizeRow(baselineMap.get(key)) : null,
  }));
}

function summarizeRow(value) {
  if (!isRecord(value)) return value;
  const label = pickLabel(value);
  const summary = {};
  for (const field of ["Id", "id", "Name", "name", "DisplayName", "NameDesign", "DesignName", "Category", "SourceKind"]) {
    if (value[field] !== undefined) summary[field] = value[field];
  }
  if (label && !Object.values(summary).includes(label)) summary.label = label;
  return summary;
}

function pickLabel(value) {
  for (const field of [
    "DisplayName",
    "Name",
    "name",
    "NameDesign",
    "DesignName",
    "DisplayDetailName",
    "DamageName",
    "ParentRecountName",
  ]) {
    if (typeof value[field] === "string" && value[field].trim()) return value[field].trim();
  }

  for (const field of ["Names", "DisplayNames", "DamageNames", "ParentRecountNames"]) {
    const names = value[field];
    if (!isRecord(names)) continue;
    for (const locale of ["en", "zh-CN", "design", "und"]) {
      if (typeof names[locale] === "string" && names[locale].trim()) return names[locale].trim();
    }
    const first = Object.values(names).find((entry) => typeof entry === "string" && entry.trim());
    if (typeof first === "string") return first.trim();
  }

  return "";
}

function makeDatasetPlan(generatedFiles, configFiles, gitConfigFiles, includeConfigOnly) {
  const planByKey = new Map();

  for (const dataset of KNOWN_DATASETS) {
    planByKey.set(`${dataset.generated}::${dataset.config}`, { ...dataset });
  }

  for (const generated of generatedFiles.keys()) {
    if ([...planByKey.values()].some((dataset) => dataset.generated === generated)) continue;
    planByKey.set(`${generated}::${generated}`, {
      label: generated,
      generated,
      config: generated,
      idFields: ["Id", "id", "baseId", "SkillId", "MonsterId", "SceneId"],
    });
  }

  if (includeConfigOnly) {
    for (const config of new Set([...configFiles.keys(), ...gitConfigFiles])) {
      if ([...planByKey.values()].some((dataset) => dataset.config === config)) continue;
      planByKey.set(`${config}::${config}`, {
        label: config,
        generated: config,
        config,
        idFields: ["Id", "id", "baseId", "SkillId", "MonsterId", "SceneId"],
      });
    }
  }

  return [...planByKey.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function analyzeDataset(dataset, sources, args) {
  const generatedPath = sources.generatedFiles.get(dataset.generated);
  const configPath = sources.configFiles.get(dataset.config);
  const generated = generatedPath ? readJsonFile(generatedPath) : null;
  let baseline = configPath ? readJsonFile(configPath) : null;
  let baselineSource = configPath ? "working-tree" : null;

  if (!baseline && args.gitBaseline && sources.gitConfigFiles.has(dataset.config)) {
    baseline = readGitJson(args.configDir, dataset.config, args.gitRef);
    baselineSource = baseline ? `git:${args.gitRef}` : null;
  }

  const result = {
    label: dataset.label,
    generatedFile: dataset.generated,
    configFile: dataset.config,
    generatedPath: generatedPath ? repoRelative(generatedPath) : null,
    baselinePath: configPath ? repoRelative(configPath) : null,
    baselineSource,
    idFields: dataset.idFields,
    entryPath: dataset.entryPath ?? [],
    status: "compared",
    diff: null,
  };

  if (!generated && !baseline) {
    result.status = "missing-both";
    return result;
  }
  if (!generated) {
    result.status = "missing-generated";
    const baselineCount = indexPayload(baseline, dataset.idFields, dataset.entryPath).count;
    result.diff = {
      generatedCount: 0,
      baselineCount,
      addedCount: 0,
      removedCount: baselineCount,
      changedCount: 0,
      unchangedCount: 0,
      generatedDuplicateKeys: [],
      baselineDuplicateKeys: [],
      samples: { added: [], removed: [], changed: [] },
    };
    return result;
  }
  if (!baseline) {
    result.status = "missing-baseline";
    const generatedCount = indexPayload(generated, dataset.idFields, dataset.entryPath).count;
    result.diff = {
      generatedCount,
      baselineCount: 0,
      addedCount: generatedCount,
      removedCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      generatedDuplicateKeys: [],
      baselineDuplicateKeys: [],
      samples: { added: [], removed: [], changed: [] },
    };
    return result;
  }

  result.diff = comparePayloads(generated, baseline, dataset.idFields, dataset.entryPath, args.maxSamples);
  return result;
}

function buildMarkdown(report) {
  const lines = [
    "# Generated Config Diff",
    "",
    `Generated dir: \`${report.generatedDir}\``,
    `Config dir: \`${report.configDir}\``,
    `Git baseline: \`${report.gitBaseline ? report.gitRef : "disabled"}\``,
    `Config-only files: \`${report.includeConfigOnly ? "included" : "hidden"}\``,
    "",
    "| Dataset | Status | Generated | Baseline | Added | Removed | Changed |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const dataset of report.datasets) {
    const diff = dataset.diff;
    lines.push(
      `| ${escapePipe(dataset.label)} | ${dataset.status} | ${diff?.generatedCount ?? 0} | ${diff?.baselineCount ?? 0} | ${diff?.addedCount ?? 0} | ${diff?.removedCount ?? 0} | ${diff?.changedCount ?? 0} |`,
    );
  }

  for (const dataset of report.datasets) {
    const diff = dataset.diff;
    if (!diff || (diff.addedCount === 0 && diff.removedCount === 0 && diff.changedCount === 0)) continue;
    lines.push("", `## ${dataset.label}`, "");
    lines.push(`Generated: \`${dataset.generatedPath ?? dataset.generatedFile}\``);
    lines.push(`Baseline: \`${dataset.baselinePath ?? dataset.configFile}\` (${dataset.baselineSource ?? "missing"})`);
    lines.push(
      `Counts: generated ${diff.generatedCount}, baseline ${diff.baselineCount}, added ${diff.addedCount}, removed ${diff.removedCount}, changed ${diff.changedCount}.`,
    );
    appendSampleSection(lines, "Added", diff.samples.added);
    appendSampleSection(lines, "Removed", diff.samples.removed);
    appendSampleSection(lines, "Changed", diff.samples.changed);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function appendSampleSection(lines, title, samples) {
  if (!samples.length) return;
  lines.push("", `${title} samples:`);
  for (const sample of samples.slice(0, 8)) {
    const generatedLabel = sample.generated ? compactSample(sample.generated) : "";
    const baselineLabel = sample.baseline ? compactSample(sample.baseline) : "";
    const suffix =
      generatedLabel && baselineLabel
        ? `: ${baselineLabel} -> ${generatedLabel}`
        : generatedLabel || baselineLabel
          ? `: ${generatedLabel || baselineLabel}`
          : "";
    lines.push(`- \`${sample.key}\`${suffix}`);
  }
}

function compactSample(value) {
  if (!isRecord(value)) return JSON.stringify(value);
  const label = value.label ?? value.DisplayName ?? value.Name ?? value.name ?? value.NameDesign ?? value.DesignName;
  if (label) return String(label);
  const pairs = Object.entries(value).slice(0, 3);
  return pairs.map(([key, child]) => `${key}=${JSON.stringify(child)}`).join(", ");
}

function escapePipe(value) {
  return String(value).replace(/\|/gu, "\\|");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.generatedDir)) {
    throw new Error(`Generated directory does not exist: ${args.generatedDir}`);
  }
  if (!fs.existsSync(args.configDir)) {
    throw new Error(`Config directory does not exist: ${args.configDir}`);
  }

  const generatedFiles = walkJsonFiles(args.generatedDir);
  const configFiles = walkJsonFiles(args.configDir);
  const gitConfigFiles = new Set(args.gitBaseline ? listGitJsonFiles(args.configDir, args.gitRef) : []);
  const datasets = makeDatasetPlan(generatedFiles, configFiles, gitConfigFiles, args.includeConfigOnly).map((dataset) =>
    analyzeDataset(dataset, { generatedFiles, configFiles, gitConfigFiles }, args),
  );

  const report = {
    generatedDir: repoRelative(args.generatedDir),
    configDir: repoRelative(args.configDir),
    gitBaseline: args.gitBaseline,
    gitRef: args.gitRef,
    includeConfigOnly: args.includeConfigOnly,
    generatedAt: new Date().toISOString(),
    datasets,
  };

  ensureParentDir(args.outJson);
  fs.writeFileSync(args.outJson, `${JSON.stringify(report, null, 2)}\n`);
  ensureParentDir(args.outMd);
  fs.writeFileSync(args.outMd, buildMarkdown(report));

  const changedDatasets = datasets.filter(
    (dataset) =>
      dataset.diff &&
      (dataset.diff.addedCount > 0 || dataset.diff.removedCount > 0 || dataset.diff.changedCount > 0),
  );
  console.log(`Compared ${datasets.length} datasets.`);
  console.log(`Changed datasets: ${changedDatasets.length}.`);
  console.log(`Wrote ${repoRelative(args.outJson)} and ${repoRelative(args.outMd)}.`);
}

main();
