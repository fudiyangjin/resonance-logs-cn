#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_LATEST_INPUTS = 3;
const DEFAULT_MAX_ROWS = 80;
const DEFAULT_MAX_SAMPLES_PER_ROW = 4;

const ATTR_ATTACK_POWER = 50;
const ATTR_DEFENSE_POWER = 51;
const ATTR_CRIT_MULTIPLIER = 0x2b66;

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    outJson: path.join(repoRoot, "DEV_exports", "skill-base-hit-ledger.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-base-hit-ledger.md"),
    maxRows: DEFAULT_MAX_ROWS,
    maxSamplesPerRow: DEFAULT_MAX_SAMPLES_PER_ROW,
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
      case "--input":
        options.inputs.push(path.resolve(next()));
        break;
      case "--latest":
        options.latest = Number(next());
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
      case "--max-samples-per-row":
        options.maxSamplesPerRow = Number(next());
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
  console.log(`Skill Base Hit Ledger Audit

Usage:
  node scripts/audit-skill-base-hit-ledger.mjs [options]

Options:
  --input <file>              Modifier entity export or AttributionCensus JSON. Repeatable.
  --latest <count>            When --input is omitted, scan latest DEV_exports/modifier-entity-*.json files. Default: ${DEFAULT_LATEST_INPUTS}
  --out-json <path>           JSON report path. Default: DEV_exports/skill-base-hit-ledger.json
  --out-md <path>             Markdown report path. Default: DEV_exports/skill-base-hit-ledger.md
  --max-rows <count>          Max Markdown rows per table. Default: ${DEFAULT_MAX_ROWS}
  --max-samples-per-row <n>   Sample hit snippets retained per damage row. Default: ${DEFAULT_MAX_SAMPLES_PER_ROW}
  --help                      Show this help.

Notes:
  This is a base-hit worklist, not a contribution calculator. It normalizes
  observed final hits only by captured crit multiplier snapshots, then groups
  the remaining value by DamageAttr/Recount/underlying skill evidence so the
  next replay step can strip known modifiers in the right order.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map((value) => String(value)).filter(Boolean))];
}

function uniqueNumbers(values) {
  return [...new Set(asArray(values).map(finiteNumber).filter((value) => value !== null))];
}

function pickName(names, fallback = "") {
  if (names && typeof names === "object" && !Array.isArray(names)) {
    return names.en ?? names.design ?? Object.values(names).find((value) => typeof value === "string" && value.trim()) ?? fallback;
  }
  return fallback;
}

function formatNumber(value, digits = 0) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(number);
}

function formatRatio(value) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return number.toFixed(number >= 100 ? 2 : 4);
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function latestModifierEntityInputs(options) {
  const dir = path.join(repoRoot, "DEV_exports");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^modifier-entity-.+\.json$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .slice(0, Math.max(0, options.latest));
}

function buildGeneratedIndex() {
  const recountRows = readGenerated("RecountTable.json");
  const skillDetails = readGenerated("SkillBreakdownDetails.json");
  const damageRows = readGenerated("DamageAttrIdName.json");
  const modifierSourceIndex = readGenerated("ModifierSourceIndex.json");

  const recountByDamageId = new Map();
  for (const row of Object.values(recountRows ?? {})) {
    for (const damageId of asArray(row?.DamageId)) {
      const key = String(damageId);
      const rows = recountByDamageId.get(key) ?? [];
      rows.push(row);
      recountByDamageId.set(key, rows);
    }
  }

  return {
    recountRows,
    skillDetails,
    damageRows,
    modifierSourcesByBuffId: modifierSourceIndex?.byBuffId ?? {},
    recountByDamageId,
  };
}

function attrRawValue(attr) {
  if (!attr || typeof attr !== "object") return null;
  const direct = attr.valueInt ?? attr.valueFloat ?? attr.Int ?? attr.Float;
  if (direct !== undefined && direct !== null) return finiteNumber(direct);
  if (attr.value && typeof attr.value === "object") {
    return finiteNumber(attr.value.Int ?? attr.value.Float ?? attr.value.Double);
  }
  return finiteNumber(attr.value);
}

function attrValue(attrs, attrId, names = []) {
  const wantedNames = new Set(names.map((name) => name.toLowerCase()));
  for (const attr of asArray(attrs)) {
    const currentId = finiteNumber(attr?.attrId);
    const currentName = String(attr?.attrName ?? "").toLowerCase();
    if (currentId === attrId || (currentName && wantedNames.has(currentName))) {
      return attrRawValue(attr);
    }
  }
  return null;
}

function decimalAttrValue(attrs, attrId, names = []) {
  const raw = attrValue(attrs, attrId, names);
  if (raw === null) return null;
  return raw / 10000;
}

function normalizedCritMultiplier(sample) {
  if (!sample?.isCrit) return 1;
  const value = decimalAttrValue(sample.attackerAttrs, ATTR_CRIT_MULTIPLIER, ["Crit", "CritDamage", "CriticalDamage"]);
  return value !== null && value > 1 ? value : null;
}

function sampleDamageId(sample, row) {
  return finiteNumber(sample?.damageId ?? sample?.skillKey ?? row?.damageId);
}

function sampleValue(sample) {
  return positiveNumber(sample?.value ?? sample?.effectiveValue ?? sample?.hpLossValue);
}

function activeModifierIds(sample) {
  const ids = [];
  for (const modifier of asArray(sample?.activeModifiers)) {
    ids.push(modifier?.modifierBaseId, modifier?.modifierSourceConfigId);
  }
  ids.push(...asArray(sample?.activeBuffBaseIds));
  ids.push(...asArray(sample?.activeEffectBuffIds));
  ids.push(...asArray(sample?.activeFactorBuffIds));
  return uniqueNumbers(ids);
}

function activeSourceRowsForSample(sample, generated) {
  const rows = [];
  const seen = new Set();
  for (const id of activeModifierIds(sample)) {
    for (const source of asArray(generated.modifierSourcesByBuffId[String(id)])) {
      const key = source?.sourceId ?? `${id}:${source?.sourceName ?? ""}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(source);
    }
  }
  return rows;
}

function sourceContributionModeCounts(sources) {
  const counts = {};
  for (const source of sources) {
    const status = source?.attributionModel?.status ?? source?.contributionStatus ?? "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function sourceLabels(sources, limit = 8) {
  const labels = [];
  for (const source of sources) {
    const label = pickName(source?.sourceNames, source?.sourceName ?? source?.sourceId);
    if (label && !labels.includes(label)) labels.push(label);
    if (labels.length >= limit) break;
  }
  return labels;
}

function staticSkillCoefficientEvidence(detail) {
  if (!detail || typeof detail !== "object") return false;
  return Object.keys(detail).some((key) => /coefficient|multiplier|flatdamage|flat_damage|ratio|valuecal|value_cal/i.test(key));
}

function ensureAggregate(map, damageId, generated) {
  const key = String(damageId);
  let row = map.get(key);
  if (row) return row;

  const detail = generated.skillDetails[key] ?? {};
  const damageRow = generated.damageRows[key] ?? {};
  const recountRows = generated.recountByDamageId.get(key) ?? [];
  const primaryRecount = recountRows[0] ?? null;
  const recountSiblingDamageIds = uniqueNumbers(recountRows.flatMap((recount) => asArray(recount?.DamageId)));
  const siblingDetails = recountSiblingDamageIds
    .filter((id) => String(id) !== key)
    .slice(0, 12)
    .map((id) => ({
      damageId: id,
      name: pickName(generated.skillDetails[String(id)]?.DisplayNames, generated.skillDetails[String(id)]?.DisplayName) || pickName(generated.damageRows[String(id)]?.Names, generated.damageRows[String(id)]?.Name),
      category: generated.skillDetails[String(id)]?.Category ?? "",
    }));

  row = {
    damageId,
    displayName: pickName(detail.DisplayNames, detail.DisplayName) || pickName(damageRow.Names, damageRow.Name) || key,
    category: detail.Category ?? "",
    sourceRole: detail.SourceRole ?? "",
    damageKind: detail.DamageKind ?? damageRow.DamageKind ?? "",
    parentRecountIds: uniqueNumbers(recountRows.map((recount) => recount?.Id ?? detail.ParentRecountId)),
    parentRecountNames: uniqueStrings(recountRows.map((recount) => pickName(recount?.Names, recount?.Name ?? recount?.RecountName)).filter(Boolean)),
    parentBaseSkillId: finiteNumber(detail.ParentBaseSkillId ?? primaryRecount?.LinkedBaseSkillId),
    parentBaseSkillName: pickName(detail.ParentBaseSkillNames, detail.ParentBaseSkillName ?? primaryRecount?.LinkedBaseSkillName),
    underlyingSkillId: finiteNumber(detail.UnderlyingSkillId ?? detail.BaseSkillId ?? detail.LinkedSkillId),
    underlyingSkillName: pickName(detail.UnderlyingSkillNames, detail.UnderlyingSkillName ?? detail.LinkedName),
    linkedSource: detail.LinkedSource ?? damageRow.LinkedSource ?? "",
    linkedId: finiteNumber(detail.LinkedId ?? damageRow.LinkedId),
    recountSiblingDamageIds,
    recountSiblingDamageCount: recountSiblingDamageIds.length,
    siblingDetails,
    hasStaticSkillCoefficientEvidence: staticSkillCoefficientEvidence(detail),
    hits: 0,
    totalValue: 0,
    effectiveTotal: 0,
    critHits: 0,
    luckyHits: 0,
    samplesWithAttack: 0,
    samplesWithDefense: 0,
    critSamplesWithMultiplier: 0,
    critSamplesMissingMultiplier: 0,
    decritValueTotal: 0,
    decritPerAttackValues: [],
    targetDefenseValues: [],
    activeModifierIds: new Set(),
    activeSourceIds: new Set(),
    activeSourceLabels: new Set(),
    contributionModeCounts: {},
    sampleSnippets: [],
    files: new Set(),
  };
  map.set(key, row);
  return row;
}

function addModeCounts(target, counts) {
  for (const [key, value] of Object.entries(counts)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function analyzeSample(sample, rowContext, filePath, generated, aggregates, options) {
  const damageId = sampleDamageId(sample, rowContext);
  const value = sampleValue(sample);
  if (damageId === null || value === null) return false;

  const aggregate = ensureAggregate(aggregates, damageId, generated);
  const attackPower = attrValue(sample.attackerAttrs, ATTR_ATTACK_POWER, ["AttackPower"]);
  const defensePower = attrValue(sample.targetAttrs, ATTR_DEFENSE_POWER, ["DefensePower"]);
  const critMultiplier = normalizedCritMultiplier(sample);
  const decritValue = critMultiplier ? value / critMultiplier : null;
  const decritPerAttack = decritValue !== null && attackPower && attackPower > 0 ? decritValue / attackPower : null;
  const activeIds = activeModifierIds(sample);
  const activeSources = activeSourceRowsForSample(sample, generated);

  aggregate.hits += 1;
  aggregate.totalValue += value;
  aggregate.effectiveTotal += Number(sample.effectiveValue ?? value);
  if (sample.isCrit) aggregate.critHits += 1;
  if (sample.isLucky) aggregate.luckyHits += 1;
  if (attackPower !== null) aggregate.samplesWithAttack += 1;
  if (defensePower !== null) {
    aggregate.samplesWithDefense += 1;
    aggregate.targetDefenseValues.push(defensePower);
  }
  if (sample.isCrit && critMultiplier !== null) aggregate.critSamplesWithMultiplier += 1;
  if (sample.isCrit && critMultiplier === null) aggregate.critSamplesMissingMultiplier += 1;
  if (decritValue !== null) aggregate.decritValueTotal += decritValue;
  if (decritPerAttack !== null && Number.isFinite(decritPerAttack)) aggregate.decritPerAttackValues.push(decritPerAttack);
  for (const id of activeIds) aggregate.activeModifierIds.add(String(id));
  for (const source of activeSources) {
    if (source?.sourceId) aggregate.activeSourceIds.add(source.sourceId);
  }
  for (const label of sourceLabels(activeSources)) aggregate.activeSourceLabels.add(label);
  addModeCounts(aggregate.contributionModeCounts, sourceContributionModeCounts(activeSources));
  aggregate.files.add(path.basename(filePath));

  if (aggregate.sampleSnippets.length < options.maxSamplesPerRow) {
    aggregate.sampleSnippets.push({
      tsMs: sample.tsMs ?? sample.timestampMs ?? null,
      value,
      isCrit: Boolean(sample.isCrit),
      isLucky: Boolean(sample.isLucky),
      critMultiplier,
      attackPower,
      defensePower,
      decritValue,
      decritPerAttack,
      activeModifierCount: activeIds.length,
      activeSourceLabels: sourceLabels(activeSources, 4),
    });
  }

  return true;
}

function analyzeFile(filePath, generated, aggregates, totals, options) {
  const payload = readJson(filePath);
  totals.filesScanned += 1;

  let samples = 0;

  for (const sample of asArray(payload.modifierReplayHits)) {
    samples += analyzeSample(sample, null, filePath, generated, aggregates, options) ? 1 : 0;
  }

  for (const row of asArray(payload.rows)) {
    for (const sample of asArray(row.formulaSamples)) {
      samples += analyzeSample(sample, row, filePath, generated, aggregates, options) ? 1 : 0;
    }
  }

  totals.samplesScanned += samples;
  if (samples === 0) totals.filesWithoutSamples += 1;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * p)));
  return sortedValues[index];
}

function summarizeRatios(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) {
    return {
      count: 0,
      min: null,
      p05: null,
      avg: null,
      p95: null,
      max: null,
      spreadPct: null,
    };
  }
  const sum = sorted.reduce((total, value) => total + value, 0);
  const avg = sum / sorted.length;
  const p05 = percentile(sorted, 0.05);
  const p95 = percentile(sorted, 0.95);
  const spreadPct = avg > 0 && p05 !== null && p95 !== null ? (p95 - p05) / avg : null;
  return {
    count: sorted.length,
    min: sorted[0],
    p05,
    avg,
    p95,
    max: sorted[sorted.length - 1],
    spreadPct,
  };
}

function blockerList(row, ratioStats) {
  const blockers = [];
  if (!row.hasStaticSkillCoefficientEvidence) blockers.push("static skill coefficient/value-cal mapping missing");
  if (row.critSamplesMissingMultiplier > 0) blockers.push("crit hits missing crit multiplier snapshot");
  if (row.samplesWithAttack < row.hits) blockers.push("attacker attack snapshot missing on some hits");
  if (row.samplesWithDefense < row.hits) blockers.push("target defense snapshot missing on some hits");
  if (!row.parentRecountIds.length) blockers.push("DPS recount parent missing");
  if (row.recountSiblingDamageCount > 1) blockers.push("recount parent has multiple child damage ids; needs chain allocation");
  if ((ratioStats.spreadPct ?? 0) > 0.15) blockers.push("de-crit / attack ratio varies; strip active modifiers before declaring base");
  if (Object.keys(row.contributionModeCounts).length === 0) blockers.push("no mapped active modifier sources on samples");
  return blockers;
}

function compactAggregates(aggregates) {
  return [...aggregates.values()]
    .map((row) => {
      const ratioStats = summarizeRatios(row.decritPerAttackValues);
      const defenseValues = [...row.targetDefenseValues].sort((left, right) => left - right);
      return {
        damageId: row.damageId,
        displayName: row.displayName,
        category: row.category,
        sourceRole: row.sourceRole,
        damageKind: row.damageKind,
        parentRecountIds: row.parentRecountIds,
        parentRecountNames: row.parentRecountNames,
        parentBaseSkillId: row.parentBaseSkillId,
        parentBaseSkillName: row.parentBaseSkillName,
        underlyingSkillId: row.underlyingSkillId,
        underlyingSkillName: row.underlyingSkillName,
        linkedSource: row.linkedSource,
        linkedId: row.linkedId,
        recountSiblingDamageIds: row.recountSiblingDamageIds,
        recountSiblingDamageCount: row.recountSiblingDamageCount,
        siblingDetails: row.siblingDetails,
        hasStaticSkillCoefficientEvidence: row.hasStaticSkillCoefficientEvidence,
        hits: row.hits,
        totalValue: row.totalValue,
        effectiveTotal: row.effectiveTotal,
        critHits: row.critHits,
        luckyHits: row.luckyHits,
        samplesWithAttack: row.samplesWithAttack,
        samplesWithDefense: row.samplesWithDefense,
        critSamplesWithMultiplier: row.critSamplesWithMultiplier,
        critSamplesMissingMultiplier: row.critSamplesMissingMultiplier,
        decritValueTotal: row.decritValueTotal,
        decritPerAttack: ratioStats,
        targetDefense: {
          min: defenseValues[0] ?? null,
          max: defenseValues[defenseValues.length - 1] ?? null,
          samples: defenseValues.length,
        },
        activeModifierCount: row.activeModifierIds.size,
        activeSourceCount: row.activeSourceIds.size,
        activeSourceLabels: [...row.activeSourceLabels].slice(0, 16),
        contributionModeCounts: Object.fromEntries(Object.entries(row.contributionModeCounts).sort(([left], [right]) => left.localeCompare(right))),
        blockers: blockerList(row, ratioStats),
        sampleSnippets: row.sampleSnippets,
        files: [...row.files].sort(),
      };
    })
    .sort((left, right) => right.totalValue - left.totalValue || right.hits - left.hits || String(left.damageId).localeCompare(String(right.damageId)));
}

function compactChains(rows) {
  const byRecount = new Map();
  for (const row of rows) {
    for (const recountId of row.parentRecountIds) {
      const key = String(recountId);
      const entry = byRecount.get(key) ?? {
        recountId,
        recountNames: new Set(),
        observedDamageIds: new Set(),
        knownDamageIds: new Set(),
        observedValue: 0,
        observedHits: 0,
        rows: [],
      };
      for (const name of row.parentRecountNames) entry.recountNames.add(name);
      entry.observedDamageIds.add(String(row.damageId));
      for (const id of row.recountSiblingDamageIds) entry.knownDamageIds.add(String(id));
      entry.observedValue += row.totalValue;
      entry.observedHits += row.hits;
      entry.rows.push({
        damageId: row.damageId,
        name: row.displayName,
        category: row.category,
        totalValue: row.totalValue,
        hits: row.hits,
      });
      byRecount.set(key, entry);
    }
  }

  return [...byRecount.values()]
    .map((entry) => ({
      recountId: entry.recountId,
      recountNames: [...entry.recountNames].sort(),
      observedDamageIds: [...entry.observedDamageIds].sort((left, right) => Number(left) - Number(right)),
      knownDamageIds: [...entry.knownDamageIds].sort((left, right) => Number(left) - Number(right)),
      observedValue: entry.observedValue,
      observedHits: entry.observedHits,
      observedRows: entry.rows.sort((left, right) => right.totalValue - left.totalValue),
      needsChainAllocation: entry.knownDamageIds.size > 1,
    }))
    .filter((entry) => entry.needsChainAllocation || entry.observedDamageIds.length > 1)
    .sort((left, right) => right.observedValue - left.observedValue || right.observedHits - left.observedHits);
}

function writeReport(report, options) {
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));

  const topRows = report.damageRows.slice(0, options.maxRows).map((row) => [
    row.displayName,
    row.damageId,
    row.parentRecountNames.join(", ") || "",
    row.hits,
    formatNumber(row.totalValue),
    row.critHits ? `${row.critHits}/${row.hits}` : "0",
    formatRatio(row.decritPerAttack.avg),
    row.decritPerAttack.spreadPct === null ? "" : `${(row.decritPerAttack.spreadPct * 100).toFixed(1)}%`,
    row.recountSiblingDamageCount > 1 ? `${row.recountSiblingDamageCount} ids` : "single",
    row.activeSourceLabels.slice(0, 4).join(", "),
    row.blockers.slice(0, 3).join("; "),
  ]);

  const chainRows = report.recountChains.slice(0, options.maxRows).map((row) => [
    row.recountNames.join(", ") || row.recountId,
    row.recountId,
    row.observedDamageIds.length,
    row.knownDamageIds.length,
    row.observedHits,
    formatNumber(row.observedValue),
    row.observedRows.slice(0, 4).map((entry) => `${entry.name} (${entry.damageId})`).join("; "),
  ]);

  const md = [
    "# Skill Base Hit Ledger",
    "",
    "This report is a base-hit worklist. It does not publish contribution totals. It groups real hit samples by damage id, DPS recount parent, and underlying skill, then removes only the captured crit multiplier snapshot to expose the next layer we need to reverse.",
    "",
    "## Summary",
    "",
    `- Files scanned: ${report.totals.filesScanned}`,
    `- Files with no hit samples: ${report.totals.filesWithoutSamples}`,
    `- Hit samples scanned: ${formatNumber(report.totals.samplesScanned)}`,
    `- Damage rows observed: ${formatNumber(report.summary.damageRowsObserved)}`,
    `- Rows with recount parent chains: ${formatNumber(report.summary.rowsWithMultiDamageRecountParent)}`,
    `- Rows with static coefficient evidence: ${formatNumber(report.summary.rowsWithStaticSkillCoefficientEvidence)}`,
    `- Rows blocked by missing static coefficient/value-cal mapping: ${formatNumber(report.summary.rowsMissingStaticCoefficient)}`,
    "",
    "## Top Damage Rows",
    "",
    topRows.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Recount Parent",
            "Hits",
            "Final Sum",
            "Crit Hits",
            "Avg Decrit/ATK",
            "Ratio Spread",
            "Chain",
            "Active Sources",
            "Main Blockers",
          ],
          topRows,
        )
      : "No damage rows with samples were found.",
    "",
    "## Recount Parent Chains",
    "",
    chainRows.length
      ? markdownTable(["Recount", "ID", "Observed IDs", "Known IDs", "Hits", "Final Sum", "Observed Rows"], chainRows)
      : "No multi-damage recount chains were observed.",
    "",
    "## Inputs",
    "",
    ...report.inputs.map((file) => `- ${file}`),
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

  const inputs = options.inputs.length ? options.inputs : latestModifierEntityInputs(options);
  const generated = buildGeneratedIndex();
  const aggregates = new Map();
  const totals = {
    filesScanned: 0,
    filesWithoutSamples: 0,
    samplesScanned: 0,
  };

  for (const input of inputs) {
    analyzeFile(input, generated, aggregates, totals, options);
  }

  const damageRows = compactAggregates(aggregates);
  const recountChains = compactChains(damageRows);
  const report = {
    generatedAt: new Date().toISOString(),
    inputs,
    totals,
    summary: {
      damageRowsObserved: damageRows.length,
      rowsWithMultiDamageRecountParent: damageRows.filter((row) => row.recountSiblingDamageCount > 1).length,
      rowsWithStaticSkillCoefficientEvidence: damageRows.filter((row) => row.hasStaticSkillCoefficientEvidence).length,
      rowsMissingStaticCoefficient: damageRows.filter((row) => !row.hasStaticSkillCoefficientEvidence).length,
      rowsWithCritMultiplierCoverage: damageRows.filter((row) => row.critHits > 0 && row.critSamplesMissingMultiplier === 0).length,
      recountChainsObserved: recountChains.length,
    },
    damageRows,
    recountChains,
  };

  writeReport(report, options);
  console.log(`Files scanned: ${totals.filesScanned}`);
  console.log(`Hit samples scanned: ${totals.samplesScanned}`);
  console.log(`Damage rows observed: ${damageRows.length}`);
  console.log(`Recount chains observed: ${recountChains.length}`);
  console.log(`Output: ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Markdown: ${path.relative(repoRoot, options.outMd)}`);
}

main();
