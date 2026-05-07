#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_INPUTS = 3;
const DEFAULT_MAX_ROWS = 80;
const DEFAULT_PAIR_WINDOW_MS = 50;
const ATTR_CRIT_MULTIPLIER = 0x2b66;

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    maxRows: DEFAULT_MAX_ROWS,
    pairWindowMs: DEFAULT_PAIR_WINDOW_MS,
    outJson: path.join(repoRoot, "DEV_exports", "lucky-strike-formula-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "lucky-strike-formula-audit.md"),
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
      case "--max-rows":
        options.maxRows = Number(next());
        break;
      case "--pair-window-ms":
        options.pairWindowMs = Number(next());
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
  console.log(`Lucky Strike Formula Audit

Usage:
  node scripts/audit-lucky-strike-formula.mjs [options]

Options:
  --input <file>          Modifier entity export. Repeatable.
  --latest <count>        When --input is omitted, scan latest DEV_exports/modifier-entity-*.json files. Default: ${DEFAULT_LATEST_INPUTS}
  --pair-window-ms <n>    Max timestamp distance for pairing a lucky row to a parent hit. Default: ${DEFAULT_PAIR_WINDOW_MS}
  --max-rows <count>      Max Markdown rows per table. Default: ${DEFAULT_MAX_ROWS}
  --out-json <path>       JSON report path. Default: DEV_exports/lucky-strike-formula-audit.json
  --out-md <path>         Markdown report path. Default: DEV_exports/lucky-strike-formula-audit.md
  --help                  Show this help.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function readGeneratedOptional(fileName, fallback) {
  const filePath = path.join(repoRoot, "parser-data", "generated", fileName);
  return fs.existsSync(filePath) ? readJson(filePath) : fallback;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatNumber(value, digits = 0) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(number);
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

function localizedName(map, fallback = "") {
  if (map && typeof map === "object" && !Array.isArray(map)) {
    return map.en ?? map.design ?? Object.values(map).find((value) => typeof value === "string" && value.trim()) ?? fallback;
  }
  return fallback;
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

function attrValue(attrs, attrId) {
  for (const attr of asArray(attrs)) {
    if (finiteNumber(attr?.attrId) === attrId) return attrRawValue(attr);
  }
  return null;
}

function decimalAttrValue(attrs, attrId) {
  const raw = attrValue(attrs, attrId);
  return raw === null ? null : raw / 10000;
}

function critMultiplierSnapshot(sample) {
  const value = decimalAttrValue(sample?.attackerAttrs, ATTR_CRIT_MULTIPLIER);
  return value !== null && value > 1 ? value : null;
}

function sampleValue(sample) {
  const value = finiteNumber(sample?.value ?? sample?.effectiveValue ?? sample?.hpLossValue);
  return value !== null && value > 0 ? value : null;
}

function decritValue(sample) {
  const value = sampleValue(sample);
  if (value === null) return null;
  if (!sample?.isCrit) return value;
  const critMultiplier = critMultiplierSnapshot(sample);
  return critMultiplier ? value / critMultiplier : null;
}

function actorUid(sample) {
  return finiteNumber(sample?.originalAttackerUid ?? sample?.attackerUid ?? sample?.topSummonerUid);
}

function sameActor(left, right) {
  const leftActor = actorUid(left);
  const rightActor = actorUid(right);
  return leftActor !== null && rightActor !== null && leftActor === rightActor;
}

function damageDisplayName(damageId, indexes) {
  const key = String(damageId);
  const detail = indexes.skillDetails[key] ?? {};
  const damage = indexes.damageRows[key] ?? {};
  return localizedName(detail.DisplayNames, detail.DisplayName)
    || localizedName(damage.Names, damage.Name)
    || String(damageId);
}

function buildIndexes() {
  const damageRows = readGenerated("DamageAttrIdName.json");
  const skillDetails = readGenerated("SkillBreakdownDetails.json");
  const recount = readGenerated("ModifierRecountTable.json");
  const display = readGenerated("ModifierDisplayTable.json");
  const sourceIndex = readGenerated("ModifierSourceIndex.json");
  const luckyRuntime = readGeneratedOptional("LuckyStrikeRuntime.json", {
    stats: {},
    sourcesById: {},
    byBuffId: {},
  });
  const luckyDamageIds = new Set(
    Object.entries(damageRows)
      .filter(([, row]) => String(row?.DamageKind ?? "").toLowerCase().includes("lucky"))
      .map(([id]) => String(id))
  );
  const ruleIdsByBuffId = new Map();
  for (const [buffId, rules] of Object.entries(recount.byBuffId ?? {})) {
    ruleIdsByBuffId.set(String(buffId), asArray(rules).map(String));
  }
  return {
    damageRows,
    skillDetails,
    recount,
    display,
    sourceIndex,
    luckyRuntime,
    luckyDamageIds,
    ruleIdsByBuffId,
  };
}

function activeModifierBuffIds(sample) {
  const ids = [];
  for (const modifier of asArray(sample?.activeModifiers)) {
    for (const field of ["modifierBaseId", "modifierSourceConfigId"]) {
      const id = finiteNumber(modifier?.[field]);
      if (id !== null) ids.push(id);
    }
  }
  return [...new Set(ids)].sort((left, right) => left - right);
}

function sourceRowsForBuffId(buffId, indexes) {
  const sourceIndexRows = asArray(indexes.sourceIndex.byBuffId?.[buffId]);
  const luckyRows = asArray(indexes.luckyRuntime.byBuffId?.[String(buffId)])
    .map((sourceId) => indexes.luckyRuntime.sourcesById?.[sourceId])
    .filter(Boolean);
  const ruleRows = asArray(indexes.ruleIdsByBuffId.get(String(buffId))).map((ruleId) => ({
    ruleId,
    ...(indexes.recount.sourcesById?.[ruleId] ?? {}),
    ...(indexes.display.sourcesByRuleId?.[ruleId] ?? {}),
  }));
  const rows = [...sourceIndexRows, ...luckyRows, ...ruleRows]
    .map((row) => {
      const lucky = row?.sourceId ? indexes.luckyRuntime.sourcesById?.[row.sourceId] : null;
      if (!lucky) return row;
      return {
        ...row,
        ...lucky,
        sourceName: row.sourceName ?? lucky.sourceName,
        sourceNames: {
          ...(lucky.sourceNames ?? {}),
          ...(row.sourceNames ?? {}),
        },
      };
    });
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.ruleId ?? ""}:${row.sourceId ?? ""}:${row.sourceName ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

function sourceName(row) {
  return row?.sourceName ?? localizedName(row?.sourceNames) ?? row?.sourceId ?? "";
}

function isLuckyRelatedSource(row) {
  if (asArray(row?.luckyTerms).length > 0 || row?.formulaPolicy) return true;
  const text = [
    row?.sourceKind,
    row?.sourceType,
    row?.sourceId,
    row?.sourceName,
    row?.description,
    ...(Object.values(row?.sourceNames ?? {})),
    ...(Object.values(row?.descriptions ?? {})),
    ...(row?.componentClasses ?? []),
    ...(row?.contributionGroups ?? []),
  ].join(" ").toLowerCase();
  return /\blucky\b|\bluck\b|幸運|幸运/.test(text);
}

function luckySourcesForHit(sample, indexes) {
  const byKey = new Map();
  for (const buffId of activeModifierBuffIds(sample)) {
    for (const row of sourceRowsForBuffId(buffId, indexes)) {
      if (!isLuckyRelatedSource(row)) continue;
      const name = sourceName(row);
      const key = `${buffId}:${row.sourceId ?? ""}:${name}:${row.sourceKind ?? ""}`;
      const current = byKey.get(key) ?? {
        buffId,
        ruleIds: [],
        sourceId: row.sourceId ?? null,
        sourceKind: row.sourceKind ?? null,
        sourceType: row.sourceType ?? null,
        sourceName: name,
        formulaPolicy: row.formulaPolicy ?? null,
        luckyTerms: asArray(row.luckyTerms).map((term) => term.termId).filter(Boolean),
        ownerClassId: row.ownership?.classId ?? null,
        ownerClassName: row.ownership?.className ?? null,
        ownerSpecIds: asArray(row.ownership?.ownerSpecIds),
        ownerSpecNames: asArray(row.ownership?.ownerSpecNames),
        contributionStatus: row.contributionStatus ?? row.attributionModel?.status ?? null,
      };
      if (row.ruleId && !current.ruleIds.includes(row.ruleId)) current.ruleIds.push(row.ruleId);
      byKey.set(key, current);
    }
  }
  return [...byKey.values()].map((row) => ({
    ...row,
    ruleIds: row.ruleIds.sort(),
  }));
}

function isLuckyDamageRow(sample, indexes) {
  return Boolean(sample?.isLucky) || indexes.luckyDamageIds.has(String(sample?.damageId ?? sample?.skillKey));
}

function isLuckyEmittedDamageRow(sample, indexes) {
  return indexes.luckyDamageIds.has(String(sample?.damageId ?? sample?.skillKey));
}

function candidateParentHits(luckyHit, hits, indexes, options) {
  const luckyTime = finiteNumber(luckyHit.timestampMs);
  if (luckyTime === null) return [];
  return hits
    .filter((hit) => {
      if (hit === luckyHit) return false;
      const time = finiteNumber(hit.timestampMs);
      if (time === null || Math.abs(time - luckyTime) > options.pairWindowMs) return false;
      if (isLuckyEmittedDamageRow(hit, indexes)) return false;
      if (hit.isHeal || luckyHit.isHeal) return false;
      if (!sameActor(hit, luckyHit)) return false;
      if (finiteNumber(hit.targetUid) !== finiteNumber(luckyHit.targetUid)) return false;
      return sampleValue(hit) !== null;
    })
    .map((hit) => ({
      hit,
      dtMs: luckyTime - finiteNumber(hit.timestampMs),
      sameTimestamp: luckyTime === finiteNumber(hit.timestampMs),
      sameHitEvent:
        luckyHit.hitEventId !== null
        && luckyHit.hitEventId !== undefined
        && hit.hitEventId !== null
        && hit.hitEventId !== undefined
        && luckyHit.hitEventId === hit.hitEventId,
      indexDistance: Math.abs((luckyHit.__index ?? 0) - (hit.__index ?? 0)),
    }))
    .sort((left, right) =>
      Number(right.sameHitEvent) - Number(left.sameHitEvent)
      || Number(right.sameTimestamp) - Number(left.sameTimestamp)
      || Math.abs(left.dtMs) - Math.abs(right.dtMs)
      || left.indexDistance - right.indexDistance
    );
}

function pairConfidence(pair, candidates) {
  if (!pair) return "unpaired";
  if (pair.sameHitEvent && pair.sameTimestamp && candidates.filter((candidate) => candidate.sameHitEvent && candidate.sameTimestamp).length === 1) {
    return "same-timestamp-hit-event";
  }
  if (pair.sameHitEvent && pair.sameTimestamp) return "same-timestamp-hit-event-multiple";
  if (pair.sameTimestamp) return "same-timestamp";
  return "nearby-window";
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function compactRatioStats(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) {
    return { count: 0, p05: null, p50: null, p95: null, min: null, max: null };
  }
  return {
    count: sorted.length,
    p05: percentile(sorted, 0.05),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function addGroup(map, key, seed) {
  const current = map.get(key) ?? {
    ...seed,
    hits: 0,
    luckyFinalDamage: 0,
    parentFinalDamage: 0,
    luckyDecritDamage: 0,
    parentDecritDamage: 0,
    critLuckyHits: 0,
    pairedHits: 0,
    unpairedHits: 0,
    multiCandidateHits: 0,
    ratios: [],
    decritRatios: [],
    files: new Set(),
  };
  map.set(key, current);
  return current;
}

function finalizeGroup(group) {
  return {
    ...group,
    ratioStats: compactRatioStats(group.ratios),
    decritRatioStats: compactRatioStats(group.decritRatios),
    files: [...group.files].sort(),
    ratios: undefined,
    decritRatios: undefined,
  };
}

function analyzeFile(input, indexes, options) {
  const entity = readJson(input);
  const fileName = path.relative(repoRoot, input);
  const hits = asArray(entity.modifierReplayHits)
    .map((hit, index) => ({ ...hit, __index: index }))
    .sort((left, right) => (finiteNumber(left.timestampMs) ?? 0) - (finiteNumber(right.timestampMs) ?? 0) || left.__index - right.__index);
  const luckyHits = hits.filter((hit) => isLuckyEmittedDamageRow(hit, indexes));
  const pairs = [];

  for (const luckyHit of luckyHits) {
    const candidates = candidateParentHits(luckyHit, hits, indexes, options);
    const pair = candidates[0] ?? null;
    const luckyValue = sampleValue(luckyHit);
    const parentValue = pair ? sampleValue(pair.hit) : null;
    const luckyDecrit = decritValue(luckyHit);
    const parentDecrit = pair ? decritValue(pair.hit) : null;
    pairs.push({
      file: fileName,
      timestampMs: luckyHit.timestampMs,
      targetUid: finiteNumber(luckyHit.targetUid),
      luckyDamageId: finiteNumber(luckyHit.damageId ?? luckyHit.skillKey),
      luckyDamageName: damageDisplayName(luckyHit.damageId ?? luckyHit.skillKey, indexes),
      luckyValue,
      luckyIsCrit: Boolean(luckyHit.isCrit),
      luckyCritMultiplier: critMultiplierSnapshot(luckyHit),
      luckyDecrit,
      parentDamageId: pair ? finiteNumber(pair.hit.damageId ?? pair.hit.skillKey) : null,
      parentDamageName: pair ? damageDisplayName(pair.hit.damageId ?? pair.hit.skillKey, indexes) : "",
      parentValue,
      parentIsCrit: pair ? Boolean(pair.hit.isCrit) : null,
      parentCritMultiplier: pair ? critMultiplierSnapshot(pair.hit) : null,
      parentDecrit,
      ratio: luckyValue !== null && parentValue ? luckyValue / parentValue : null,
      decritRatio: luckyDecrit !== null && parentDecrit ? luckyDecrit / parentDecrit : null,
      dtMs: pair ? pair.dtMs : null,
      candidateCount: candidates.length,
      confidence: pairConfidence(pair, candidates),
      activeLuckySources: luckySourcesForHit(luckyHit, indexes),
    });
  }

  return {
    file: fileName,
    player: {
      uid: entity.uid,
      name: entity.name,
      className: entity.className,
      classSpecName: entity.classSpecName,
    },
    totalReplayHits: hits.length,
    luckyRows: luckyHits.length,
    pairs,
  };
}

function buildReport(inputs, indexes, options) {
  const fileReports = inputs.map((input) => analyzeFile(input, indexes, options));
  const exactRows = new Map();
  const parentRows = new Map();
  const sourceRows = new Map();
  const allPairs = fileReports.flatMap((file) => file.pairs);
  const pairConfidenceCounts = {};

  for (const pair of allPairs) {
    pairConfidenceCounts[pair.confidence] = (pairConfidenceCounts[pair.confidence] ?? 0) + 1;
    const exact = addGroup(exactRows, String(pair.luckyDamageId), {
      damageId: pair.luckyDamageId,
      damageName: pair.luckyDamageName,
    });
    exact.hits += 1;
    exact.luckyFinalDamage += pair.luckyValue ?? 0;
    exact.luckyDecritDamage += pair.luckyDecrit ?? 0;
    if (pair.luckyIsCrit) exact.critLuckyHits += 1;
    if (pair.parentDamageId !== null) exact.pairedHits += 1;
    else exact.unpairedHits += 1;
    if ((pair.candidateCount ?? 0) > 1) exact.multiCandidateHits += 1;
    if (pair.ratio !== null) exact.ratios.push(pair.ratio);
    if (pair.decritRatio !== null) exact.decritRatios.push(pair.decritRatio);
    exact.files.add(pair.file);

    if (pair.parentDamageId !== null) {
      const parent = addGroup(parentRows, String(pair.parentDamageId), {
        parentDamageId: pair.parentDamageId,
        parentDamageName: pair.parentDamageName,
      });
      parent.hits += 1;
      parent.luckyFinalDamage += pair.luckyValue ?? 0;
      parent.parentFinalDamage += pair.parentValue ?? 0;
      parent.luckyDecritDamage += pair.luckyDecrit ?? 0;
      parent.parentDecritDamage += pair.parentDecrit ?? 0;
      if (pair.luckyIsCrit) parent.critLuckyHits += 1;
      parent.pairedHits += 1;
      if ((pair.candidateCount ?? 0) > 1) parent.multiCandidateHits += 1;
      if (pair.ratio !== null) parent.ratios.push(pair.ratio);
      if (pair.decritRatio !== null) parent.decritRatios.push(pair.decritRatio);
      parent.files.add(pair.file);
    }

    for (const source of pair.activeLuckySources) {
      const key = `${source.buffId}:${source.sourceId ?? ""}:${source.sourceName}:${source.sourceKind ?? ""}`;
      const row = sourceRows.get(key) ?? {
        ...source,
        ruleIds: new Set(),
        hits: 0,
        luckyFinalDamage: 0,
        luckyDecritDamage: 0,
        files: new Set(),
      };
      for (const ruleId of source.ruleIds ?? []) row.ruleIds.add(ruleId);
      row.hits += 1;
      row.luckyFinalDamage += pair.luckyValue ?? 0;
      row.luckyDecritDamage += pair.luckyDecrit ?? 0;
      row.files.add(pair.file);
      sourceRows.set(key, row);
    }
  }

  const exactLuckyRows = [...exactRows.values()]
    .map(finalizeGroup)
    .sort((left, right) => right.luckyFinalDamage - left.luckyFinalDamage);
  const parentPairRows = [...parentRows.values()]
    .map(finalizeGroup)
    .sort((left, right) => right.luckyFinalDamage - left.luckyFinalDamage);
  const activeLuckySourceRows = [...sourceRows.values()]
    .map((row) => ({ ...row, ruleIds: [...row.ruleIds].sort(), files: [...row.files].sort() }))
    .sort((left, right) => right.luckyFinalDamage - left.luckyFinalDamage);

  return {
    generatedAt: new Date().toISOString(),
    inputs,
    semantics: {
      exactLuckyDamage:
        "lucky strike packets are exact emitted damage rows when DamageKind contains Lucky; these totals are already real final damage",
      parentPairing:
        "parent hits are same-actor same-target non-lucky hits within the configured timestamp window; ratios are evidence for formula inference, not promoted contribution math",
      contributionRule:
        "chance and multiplier sources should only get numeric contribution after the lucky proc/multiplier formula is proven or an exact produced row can be assigned",
    },
    thresholds: {
      pairWindowMs: options.pairWindowMs,
    },
    summary: {
      filesScanned: fileReports.length,
      replayHitsScanned: fileReports.reduce((sum, file) => sum + file.totalReplayHits, 0),
      exactLuckyRows: allPairs.length,
      exactLuckyFinalDamage: allPairs.reduce((sum, pair) => sum + (pair.luckyValue ?? 0), 0),
      exactLuckyDecritDamage: allPairs.reduce((sum, pair) => sum + (pair.luckyDecrit ?? 0), 0),
      pairedLuckyRows: allPairs.filter((pair) => pair.parentDamageId !== null).length,
      unpairedLuckyRows: allPairs.filter((pair) => pair.parentDamageId === null).length,
      multiCandidatePairs: allPairs.filter((pair) => (pair.candidateCount ?? 0) > 1).length,
      highConfidencePairs: allPairs.filter((pair) => pair.confidence === "same-timestamp-hit-event").length,
      critLuckyRows: allPairs.filter((pair) => pair.luckyIsCrit).length,
      activeLuckySources: activeLuckySourceRows.length,
      luckySourceTable: indexes.luckyRuntime.stats,
      pairConfidenceCounts,
    },
    fileReports: fileReports.map((file) => ({
      ...file,
      pairs: undefined,
    })),
    exactLuckyRows,
    parentPairRows,
    activeLuckySourceRows,
    samplePairs: allPairs
      .sort((left, right) => (right.luckyValue ?? 0) - (left.luckyValue ?? 0))
      .slice(0, Math.max(options.maxRows, 200)),
  };
}

function renderMarkdown(report, options) {
  const exactTable = report.exactLuckyRows.slice(0, options.maxRows).map((row) => [
    row.damageName,
    row.damageId,
    row.hits,
    formatNumber(row.luckyFinalDamage),
    formatNumber(row.luckyDecritDamage),
    formatPct(row.critLuckyHits / row.hits, 1),
    `${row.pairedHits}/${row.unpairedHits}`,
    row.ratioStats.p50 === null ? "" : formatPct(row.ratioStats.p50, 2),
    row.decritRatioStats.p50 === null ? "" : formatPct(row.decritRatioStats.p50, 2),
  ]);
  const parentTable = report.parentPairRows.slice(0, options.maxRows).map((row) => [
    row.parentDamageName,
    row.parentDamageId,
    row.hits,
    formatNumber(row.luckyFinalDamage),
    formatNumber(row.parentFinalDamage),
    formatPct(row.luckyFinalDamage / row.parentFinalDamage, 2),
    row.ratioStats.p50 === null ? "" : formatPct(row.ratioStats.p50, 2),
    row.decritRatioStats.p50 === null ? "" : formatPct(row.decritRatioStats.p50, 2),
    row.multiCandidateHits,
  ]);
  const sourceTable = report.activeLuckySourceRows.slice(0, options.maxRows).map((row) => [
    row.sourceName,
    row.sourceId,
    row.sourceKind,
    row.formulaPolicy ?? "",
    asArray(row.luckyTerms).slice(0, 4).join(", "),
    row.ownerClassName ?? "",
    asArray(row.ownerSpecNames).join(", "),
    row.buffId,
    row.hits,
    formatNumber(row.luckyFinalDamage),
  ]);
  const pairTable = report.samplePairs.slice(0, options.maxRows).map((row) => [
    row.luckyDamageName,
    row.luckyValue,
    row.luckyIsCrit ? "yes" : "no",
    row.parentDamageName,
    row.parentDamageId ?? "",
    row.parentValue ?? "",
    row.parentIsCrit === null ? "" : row.parentIsCrit ? "yes" : "no",
    row.ratio === null ? "" : formatPct(row.ratio, 2),
    row.decritRatio === null ? "" : formatPct(row.decritRatio, 2),
    row.dtMs ?? "",
    row.candidateCount,
    row.confidence,
    row.activeLuckySources.slice(0, 4).map((source) => source.sourceName).join("; "),
  ]);

  return [
    "# Lucky Strike Formula Audit",
    "",
    "This is a proof report for lucky damage. It treats DamageKind Lucky rows as exact emitted damage, then pairs each lucky row to nearby same-actor same-target non-lucky hits to study the proc formula. Parent-pair ratios are evidence only until the lucky multiplier formula is proven.",
    "",
    "## Summary",
    "",
    `- Files scanned: ${formatNumber(report.summary.filesScanned)}`,
    `- Replay hits scanned: ${formatNumber(report.summary.replayHitsScanned)}`,
    `- Exact lucky rows: ${formatNumber(report.summary.exactLuckyRows)}`,
    `- Exact lucky final damage: ${formatNumber(report.summary.exactLuckyFinalDamage)}`,
    `- Exact lucky decrit damage: ${formatNumber(report.summary.exactLuckyDecritDamage)}`,
    `- Paired lucky rows: ${formatNumber(report.summary.pairedLuckyRows)}`,
    `- Unpaired lucky rows: ${formatNumber(report.summary.unpairedLuckyRows)}`,
    `- Multi-candidate pairs: ${formatNumber(report.summary.multiCandidatePairs)}`,
    `- High-confidence parent pairs: ${formatNumber(report.summary.highConfidencePairs)}`,
    `- Crit lucky rows: ${formatNumber(report.summary.critLuckyRows)}`,
    `- Active lucky source rows: ${formatNumber(report.summary.activeLuckySources)}`,
    `- Global lucky source table: ${formatNumber(report.summary.luckySourceTable?.sources)} sources, ${formatNumber(report.summary.luckySourceTable?.expectedValueCandidateRules ?? report.summary.luckySourceTable?.formulaPolicyCounts?.["expected-value-candidate"])} expected-value candidates, ${formatNumber(report.summary.luckySourceTable?.formulaPolicyCounts?.["exact-produced-damage"])} exact produced rows`,
    `- Pair confidence counts: ${Object.entries(report.summary.pairConfidenceCounts).map(([key, value]) => `${key}=${value}`).join(", ")}`,
    "",
    "## Exact Lucky Damage Rows",
    "",
    exactTable.length
      ? markdownTable(
          [
            "Lucky Row",
            "Damage ID",
            "Hits",
            "Final Damage",
            "Decrit Damage",
            "Crit %",
            "Paired/Unpaired",
            "Median Lucky/Parent",
            "Median Decrit Lucky/Parent",
          ],
          exactTable
        )
      : "No exact lucky damage rows were observed.",
    "",
    "## Parent Pair Ratios",
    "",
    parentTable.length
      ? markdownTable(
          [
            "Parent Row",
            "Parent Damage ID",
            "Pairs",
            "Lucky Final Damage",
            "Parent Final Damage",
            "Lucky/Parent Sum",
            "Median Lucky/Parent",
            "Median Decrit Lucky/Parent",
            "Multi Candidates",
          ],
          parentTable
        )
      : "No lucky rows could be paired to parent hits.",
    "",
    "## Active Lucky Sources",
    "",
    sourceTable.length
      ? markdownTable(["Source", "Source ID", "Kind", "Formula Policy", "Lucky Terms", "Owner Class", "Owner Specs", "Buff ID", "Hits", "Lucky Final Damage"], sourceTable)
      : "No active lucky-related source rows were found on lucky hits.",
    "",
    "## Sample Pairs",
    "",
    pairTable.length
      ? markdownTable(
          [
            "Lucky Row",
            "Lucky Value",
            "Lucky Crit",
            "Parent Row",
            "Parent Damage ID",
            "Parent Value",
            "Parent Crit",
            "Lucky/Parent",
            "Decrit Lucky/Parent",
            "dt ms",
            "Candidates",
            "Pair Confidence",
            "Lucky Sources",
          ],
          pairTable
        )
      : "No sample pairs were generated.",
    "",
    "## Inputs",
    "",
    ...report.inputs.map((file) => `- ${file}`),
    "",
  ].join("\n");
}

function writeReport(report, options) {
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(options.outMd, renderMarkdown(report, options));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const inputs = options.inputs.length ? options.inputs : latestModifierEntityInputs(options);
  const indexes = buildIndexes();
  const report = buildReport(inputs, indexes, options);
  writeReport(report, options);

  console.log(`Files scanned: ${report.summary.filesScanned}`);
  console.log(`Replay hits scanned: ${report.summary.replayHitsScanned}`);
  console.log(`Exact lucky rows: ${report.summary.exactLuckyRows}`);
  console.log(`Exact lucky final damage: ${Math.round(report.summary.exactLuckyFinalDamage)}`);
  console.log(`Paired lucky rows: ${report.summary.pairedLuckyRows}`);
  console.log(`High-confidence parent pairs: ${report.summary.highConfidencePairs}`);
  console.log(`Active lucky source rows: ${report.summary.activeLuckySources}`);
  console.log(`Output: ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Markdown: ${path.relative(repoRoot, options.outMd)}`);
}

main();
