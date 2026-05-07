#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DIR_NAME = "com.resonance-logs-cn";
const DEFAULT_LATEST = 20;
const DEFAULT_MAX_ROWS = 80;

const repoRoot = process.cwd();
const defaultCensusRoot = process.env.APPDATA
  ? path.join(process.env.APPDATA, APP_DIR_NAME, "EventLogs", "AttributionCensus")
  : path.join(os.homedir(), "AppData", "Roaming", APP_DIR_NAME, "EventLogs", "AttributionCensus");

function parseArgs(argv) {
  const options = {
    censusRoot: defaultCensusRoot,
    latest: DEFAULT_LATEST,
    all: false,
    outJson: path.join(repoRoot, "DEV_exports", "formula-replay-evidence.json"),
    outMd: path.join(repoRoot, "DEV_exports", "formula-replay-evidence.md"),
    maxRows: DEFAULT_MAX_ROWS,
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
      case "--census-root":
        options.censusRoot = path.resolve(next());
        break;
      case "--latest":
        options.latest = Number(next());
        break;
      case "--all":
        options.all = true;
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
  console.log(`Formula Replay Evidence Audit

Usage:
  node scripts/audit-formula-replay-evidence.mjs [options]

Options:
  --census-root <dir>  AttributionCensus root. Default: ${defaultCensusRoot}
  --latest <count>    Latest census files to scan when --all is not set. Default: ${DEFAULT_LATEST}
  --all               Scan all census JSON files.
  --out-json <path>   JSON report path. Default: DEV_exports/formula-replay-evidence.json
  --out-md <path>     Markdown report path. Default: DEV_exports/formula-replay-evidence.md
  --max-rows <count>  Max Markdown rows per table. Default: ${DEFAULT_MAX_ROWS}
  --help              Show this help.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function readLogic(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "logic", fileName));
}

function walkJsonFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, result);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      result.push(fullPath);
    }
  }
  return result;
}

function fileMtime(filePath) {
  return fs.statSync(filePath).mtimeMs;
}

function latestFiles(root, options) {
  const files = walkJsonFiles(root).sort((left, right) => fileMtime(right) - fileMtime(left));
  return options.all ? files : files.slice(0, options.latest);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return value === null || value === undefined ? "" : String(value);
}

function nonZero(value) {
  return value !== null && value !== undefined && value !== 0 && value !== "";
}

function hasOwnValue(object, key) {
  return (
    object &&
    Object.prototype.hasOwnProperty.call(object, key) &&
    object[key] !== null &&
    object[key] !== undefined
  );
}

function uniquePush(array, value, limit = 256) {
  if (!nonZero(value) || array.includes(value)) return;
  if (array.length < limit) array.push(value);
}

function uniqueValues(values) {
  const result = [];
  for (const value of values) uniquePush(result, value);
  return result;
}

function localizedName(map, fallback) {
  if (map && typeof map === "object") {
    return map.en ?? map.design ?? Object.values(map).find((value) => typeof value === "string" && value.trim());
  }
  return fallback ?? null;
}

function buildGeneratedIndex() {
  const damageFormula = readLogic("DamageFormula.json");
  const effectSources = readGenerated("EffectSources.json");
  const seasonFactors = readGenerated("SeasonPhantomFactors.json");
  const skillDetails = readGenerated("SkillBreakdownDetails.json");
  const recount = readGenerated("RecountTable.json");

  const recountByDamageId = new Map();
  for (const [key, row] of Object.entries(recount ?? {})) {
    for (const damageId of asArray(row?.DamageId)) {
      if (!recountByDamageId.has(String(damageId))) recountByDamageId.set(String(damageId), []);
      recountByDamageId.get(String(damageId)).push({
        recountId: Number(key),
        name: localizedName(row?.Names, row?.Name ?? row?.RecountName),
      });
    }
  }

  return {
    damageFormula,
    effectSourcesById: effectSources.effectSourcesById ?? {},
    buffIdToEffectSourceIds: effectSources.buffIdToEffectSourceIds ?? {},
    damageIdToEffectSourceIds: effectSources.damageIdToEffectSourceIds ?? {},
    factorsByBuffId: seasonFactors.factorsByBuffId ?? {},
    damageIdToFactorBuffIds: seasonFactors.damageIdToFactorBuffIds ?? {},
    skillDetails: skillDetails ?? {},
    recountByDamageId,
  };
}

function sourceLabel(sourceId, generated) {
  const source = generated.effectSourcesById[sourceId];
  if (source) {
    return localizedName(source.sourceNames, source.sourceName) ?? sourceId;
  }

  const factorId = sourceId.startsWith("phantom-factor:")
    ? sourceId.slice("phantom-factor:".length)
    : null;
  if (factorId && generated.factorsByBuffId[factorId]) {
    const factor = generated.factorsByBuffId[factorId];
    return localizedName(factor.familyNames, factor.familyName) ?? sourceId;
  }

  return sourceId;
}

function sourceModel(sourceId, generated) {
  const source = generated.effectSourcesById[sourceId];
  if (source?.attributionModel) return source.attributionModel;

  if (sourceId.startsWith("phantom-factor:")) {
    return {
      status: "factor-description-target",
      confidence: "low",
      formulaTermIds: [],
      contributionGroups: ["genericDamage"],
      predicateTags: ["relationship.description-target"],
      requiredRuntimeEvidence: [
        "damage id",
        "skill key",
        "observed final hit value",
        "modifier to formula-term classification",
      ],
    };
  }

  return null;
}

function attrNames(attrs) {
  return new Set(asArray(attrs).map((attr) => attr?.attrName).filter(Boolean));
}

function hasAttr(attrs, names) {
  const present = attrNames(attrs);
  return names.some((name) => present.has(name));
}

function rowHasCoefficientData(row) {
  if (!row || typeof row !== "object") return false;
  const keys = Object.keys(row);
  return keys.some((key) => /multiplier|coefficient|formula|flatdamage|flat_damage/i.test(key));
}

function evidenceForSample(row, sample, generated) {
  const evidence = new Set();
  const add = (key, condition = true) => {
    if (condition) evidence.add(key);
  };

  const attackerAttrs = asArray(sample.attackerAttrs);
  const targetAttrs = asArray(sample.targetAttrs);
  const skillDetail = generated.skillDetails[String(row.damageId)];
  const rowHasTargetIds = asArray(row.targetMonsterTypeIds).length > 0;

  add("observed final hit value", hasOwnValue(sample, "value") || nonZero(row.totalValue));
  add("damage hit value", hasOwnValue(sample, "value") || nonZero(row.totalValue));
  add("effective damage value", hasOwnValue(sample, "effectiveValue"));
  add("skill key", hasOwnValue(sample, "skillKey") || asArray(row.skillKeys).length > 0);
  add("damage id", nonZero(row.damageId));
  add("produced damage row id", nonZero(row.damageId));
  add("target uid", nonZero(sample.targetUid) || nonZero(row.lastTargetUid));
  add("target monster config id", nonZero(sample.targetMonsterTypeId) || rowHasTargetIds);
  add("attacker uid", nonZero(sample.attackerUid) || nonZero(row.lastAttackerUid));
  add("original attacker uid", nonZero(sample.originalAttackerUid) || asArray(row.originalAttackerUids).length > 0);
  add("top summoner uid", nonZero(sample.topSummonerUid) || asArray(row.topSummonerUids).length > 0);
  add("crit flag", typeof sample.isCrit === "boolean");
  add("lucky flag", typeof sample.isLucky === "boolean");
  add("attacker stat snapshot at hit time", attackerAttrs.length > 0);
  add("target resistance or defense snapshot at hit time", targetAttrs.length > 0);
  add("damage element mapping by damage id", hasOwnValue(sample, "property") || asArray(row.properties).length > 0);
  add("damage mode", hasOwnValue(sample, "damageMode") || asArray(row.damageModes).length > 0);
  add(
    "target predicate evaluation, such as elite-or-stronger",
    nonZero(sample.targetMonsterTypeId) ||
      rowHasTargetIds ||
      hasAttr(targetAttrs, ["EliteStatus", "MonsterId", "Level"]),
  );
  add(
    "source predicate evaluation, such as companion or summon",
    nonZero(sample.originalAttackerUid) || nonZero(sample.topSummonerUid),
  );
  add("skill coefficient mapping by damage id", rowHasCoefficientData(skillDetail));

  return evidence;
}

function collectSourceIds(row, sample, generated) {
  const ids = [];
  const damageId = String(row.damageId);
  const pushSource = (sourceId) => uniquePush(ids, sourceId);
  const pushSources = (values) => {
    for (const value of asArray(values)) pushSource(String(value));
  };
  const pushEffectSourcesForBuff = (buffId) => {
    for (const sourceId of asArray(generated.buffIdToEffectSourceIds[String(buffId)])) {
      pushSource(sourceId);
    }
  };
  const pushFactorSource = (buffId) => {
    if (generated.factorsByBuffId[String(buffId)]) pushSource(`phantom-factor:${buffId}`);
  };

  pushSources(row.effectSourceIds);
  pushSources(generated.damageIdToEffectSourceIds[damageId]);
  pushSources(sample.activeEffectSourceIds);
  for (const buffId of [
    ...asArray(row.activeEffectBuffIds),
    ...asArray(sample.activeEffectBuffIds),
    ...asArray(row.activeBuffBaseIds),
    ...asArray(sample.activeBuffBaseIds),
  ]) {
    pushEffectSourcesForBuff(buffId);
  }
  for (const factorBuffId of [
    ...asArray(row.directFactorBuffIds),
    ...asArray(row.activeFactorBuffIds),
    ...asArray(sample.activeFactorBuffIds),
    ...asArray(generated.damageIdToFactorBuffIds[damageId]),
  ]) {
    pushFactorSource(factorBuffId);
  }

  return ids;
}

function mergeSet(target, values) {
  for (const value of values ?? []) target.add(value);
}

function analyzeFile(filePath, generated, totals, sourceRows, gapCounts) {
  const payload = readJson(filePath);
  const rows = asArray(payload.rows);
  totals.filesScanned += 1;
  totals.rowsScanned += rows.length;

  let fileSamples = 0;
  for (const row of rows) {
    const samples = asArray(row.formulaSamples);
    fileSamples += samples.length;
    totals.samplesScanned += samples.length;
    if (samples.length === 0) {
      totals.rowsWithoutSamples += 1;
      continue;
    }

    for (const sample of samples) {
      const evidence = evidenceForSample(row, sample, generated);
      const sourceIds = collectSourceIds(row, sample, generated);
      if (sourceIds.length === 0) totals.samplesWithoutMappedSources += 1;

      for (const sourceId of sourceIds) {
        const model = sourceModel(sourceId, generated);
        if (model?.formulaTermIds?.length || model?.contributionGroups?.length) {
          evidence.add("modifier to formula-term classification");
        }
        const requiredEvidence = uniqueValues([
          ...asArray(model?.requiredRuntimeEvidence),
          "observed final hit value",
          "damage id",
        ]);
        const missingEvidence = requiredEvidence.filter((item) => !evidence.has(item));

        const key = sourceId;
        if (!sourceRows.has(key)) {
          sourceRows.set(key, {
            sourceId,
            label: sourceLabel(sourceId, generated),
            generatedStatus: model?.status ?? "unmapped-source",
            confidence: model?.confidence ?? null,
            formulaTermIds: new Set(),
            contributionGroups: new Set(),
            predicateTags: new Set(),
            requiredEvidence: new Set(),
            missingEvidence: new Set(),
            sampleCount: 0,
            rowCount: 0,
            files: new Set(),
            damageIds: new Set(),
            observedFinalValue: 0,
            effectiveValue: 0,
          });
        }

        const aggregate = sourceRows.get(key);
        aggregate.sampleCount += 1;
        aggregate.rowCount += 1;
        aggregate.observedFinalValue += Number(sample.value ?? 0);
        aggregate.effectiveValue += Number(sample.effectiveValue ?? 0);
        aggregate.files.add(path.basename(filePath));
        aggregate.damageIds.add(String(row.damageId));
        mergeSet(aggregate.formulaTermIds, model?.formulaTermIds);
        mergeSet(aggregate.contributionGroups, model?.contributionGroups);
        mergeSet(aggregate.predicateTags, model?.predicateTags);
        mergeSet(aggregate.requiredEvidence, requiredEvidence);
        mergeSet(aggregate.missingEvidence, missingEvidence);

        for (const gap of missingEvidence) {
          gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1);
        }
      }
    }
  }

  if (fileSamples === 0) totals.filesWithoutSamples += 1;
}

function compactSourceRows(sourceRows, maxRows) {
  return [...sourceRows.values()]
    .map((row) => ({
      ...row,
      formulaTermIds: [...row.formulaTermIds].sort(),
      contributionGroups: [...row.contributionGroups].sort(),
      predicateTags: [...row.predicateTags].sort(),
      requiredEvidence: [...row.requiredEvidence].sort(),
      missingEvidence: [...row.missingEvidence].sort(),
      files: [...row.files].sort(),
      damageIds: [...row.damageIds].sort((left, right) => Number(left) - Number(right)),
      evidenceReady: row.missingEvidence.size === 0,
    }))
    .sort(
      (left, right) =>
        right.sampleCount - left.sampleCount ||
        right.observedFinalValue - left.observedFinalValue ||
        left.label.localeCompare(right.label),
    )
    .slice(0, maxRows);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value ?? 0);
}

function markdownTable(headers, rows) {
  const escape = (value) => asString(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function writeReport(report, options) {
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));

  const sourceRows = report.topSources.map((row) => [
    row.label,
    row.generatedStatus,
    row.contributionGroups.join(", "),
    row.formulaTermIds.join(", "),
    row.sampleCount,
    formatNumber(row.observedFinalValue),
    row.missingEvidence.join("; ") || "none",
  ]);
  const gapRows = report.topGaps.map((row) => [row.evidence, row.count]);

  const md = [
    "# Formula Replay Evidence Audit",
    "",
    "This report does not compute net-added damage yet. It checks whether captured final-hit samples contain the runtime inputs needed to replay the adjustable damage formula and eventually compare source-on versus source-off counterfactuals.",
    "",
    "## Summary",
    "",
    `- Census files scanned: ${report.totals.filesScanned}`,
    `- Rows scanned: ${report.totals.rowsScanned}`,
    `- Formula samples scanned: ${report.totals.samplesScanned}`,
    `- Files with no formula samples: ${report.totals.filesWithoutSamples}`,
    `- Rows with no formula samples: ${report.totals.rowsWithoutSamples}`,
    `- Samples without mapped generated sources: ${report.totals.samplesWithoutMappedSources}`,
    "",
    "## Main Gaps",
    "",
    gapRows.length > 0
      ? markdownTable(["Missing Evidence", "Occurrences"], gapRows)
      : "No missing evidence was observed in sampled source rows.",
    "",
    "## Top Source Evidence Rows",
    "",
    sourceRows.length > 0
      ? markdownTable(
          ["Source", "Generated Status", "Groups", "Terms", "Samples", "Observed Final Hit Sum", "Missing Evidence"],
          sourceRows,
        )
      : "No generated source rows were linked to formula samples.",
    "",
    "## Files",
    "",
    ...report.files.map((file) => `- ${file}`),
    "",
  ].join("\n");

  fs.writeFileSync(options.outMd, md);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const generated = buildGeneratedIndex();
  const files = latestFiles(options.censusRoot, options);
  const totals = {
    filesScanned: 0,
    rowsScanned: 0,
    samplesScanned: 0,
    filesWithoutSamples: 0,
    rowsWithoutSamples: 0,
    samplesWithoutMappedSources: 0,
  };
  const sourceRows = new Map();
  const gapCounts = new Map();

  for (const filePath of files) {
    analyzeFile(filePath, generated, totals, sourceRows, gapCounts);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    formulaId: generated.damageFormula.id,
    formulaStatus: generated.damageFormula.status,
    formulaExpression: generated.damageFormula.formula?.perHitExpression ?? null,
    censusRoot: options.censusRoot,
    files: files.map((file) => path.relative(options.censusRoot, file)),
    totals,
    topGaps: [...gapCounts.entries()]
      .map(([evidence, count]) => ({ evidence, count }))
      .sort((left, right) => right.count - left.count || left.evidence.localeCompare(right.evidence))
      .slice(0, options.maxRows),
    topSources: compactSourceRows(sourceRows, options.maxRows),
  };

  writeReport(report, options);
  console.log(`Formula replay evidence report written:`);
  console.log(`  ${options.outJson}`);
  console.log(`  ${options.outMd}`);
  if (totals.samplesScanned === 0) {
    console.log("No formula samples were found. Enable Attribution Census and capture a fresh encounter to populate replay evidence.");
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
