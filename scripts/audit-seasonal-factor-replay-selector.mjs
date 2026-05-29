#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_INPUTS = 4;
const DEFAULT_REPLAY = "DEV_exports/skill-replay-candidates-latest4.json";
const DEFAULT_GRADE_BRIDGE = "DEV_exports/seasonal-factor-grade-bridge-audit.json";
const DEFAULT_SELECTOR_SOURCE = "DEV_exports/seasonal-factor-selector-source-audit.json";
const DEFAULT_DIFFERENTIAL = "DEV_exports/seasonal-factor-differential-audit.json";
const DEFAULT_CONTRIBUTION_RUNTIME = "parser-data/generated/ModifierContributionRuntime.json";
const DEFAULT_RELATIONSHIP_TABLE = "parser-data/generated/ModifierRelationshipTable.json";
const DEFAULT_OUT_JSON = "DEV_exports/seasonal-factor-replay-selector-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/seasonal-factor-replay-selector-audit.md";
const SEASONAL_ID_MIN = 3_050_000;
const SEASONAL_ID_MAX = 3_060_000;
const FACTOR_CANDIDATES = [
  "../BPSR-UID-Extractors/output/SeasonPhantomFactors.json",
  "parser-data/generated/SeasonPhantomFactors.json",
];

function usage() {
  return `Usage: node scripts/audit-seasonal-factor-replay-selector.mjs [options]

Options:
  --input <path>              Add a modifier-entity export. Repeatable.
  --latest <count>            Use latest DEV_exports/modifier-entity-*.json when no inputs are provided. Default: ${DEFAULT_LATEST_INPUTS}
  --replay-json <path>        Skill replay candidate report. Default: ${DEFAULT_REPLAY}
  --grade-bridge-json <path>  Seasonal factor grade bridge report. Default: ${DEFAULT_GRADE_BRIDGE}
  --selector-source-json <p>  Seasonal factor selector-source report. Default: ${DEFAULT_SELECTOR_SOURCE}
  --differential-json <path>  Seasonal factor differential report. Default: ${DEFAULT_DIFFERENTIAL}
  --factors-json <path>       SeasonPhantomFactors.json path.
  --contribution-json <path>  ModifierContributionRuntime.json path. Default: ${DEFAULT_CONTRIBUTION_RUNTIME}
  --relationship-json <path>  ModifierRelationshipTable.json path. Default: ${DEFAULT_RELATIONSHIP_TABLE}
  --max-rows <count>          Max Markdown blocked rows. Default: 120
  --out-json <path>           JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>             Markdown report path. Default: ${DEFAULT_OUT_MD}
`;
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    replayJson: DEFAULT_REPLAY,
    gradeBridgeJson: DEFAULT_GRADE_BRIDGE,
    selectorSourceJson: DEFAULT_SELECTOR_SOURCE,
    differentialJson: DEFAULT_DIFFERENTIAL,
    factorsJson: null,
    contributionJson: DEFAULT_CONTRIBUTION_RUNTIME,
    relationshipJson: DEFAULT_RELATIONSHIP_TABLE,
    maxRows: 120,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--input") {
      options.inputs.push(next());
    } else if (arg === "--latest") {
      options.latest = Math.max(1, Number(next()) || DEFAULT_LATEST_INPUTS);
    } else if (arg === "--replay-json") {
      options.replayJson = next();
    } else if (arg === "--grade-bridge-json") {
      options.gradeBridgeJson = next();
    } else if (arg === "--selector-source-json") {
      options.selectorSourceJson = next();
    } else if (arg === "--differential-json") {
      options.differentialJson = next();
    } else if (arg === "--factors-json") {
      options.factorsJson = next();
    } else if (arg === "--contribution-json") {
      options.contributionJson = next();
    } else if (arg === "--relationship-json") {
      options.relationshipJson = next();
    } else if (arg === "--max-rows") {
      options.maxRows = Math.max(1, Number(next()) || 120);
    } else if (arg === "--out-json") {
      options.outJson = next();
    } else if (arg === "--out-md") {
      options.outMd = next();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveRepoPath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function compactPath(filePath) {
  if (!filePath) return "";
  const relative = path.relative(repoRoot, filePath);
  return relative && !relative.startsWith("..") ? relative.replaceAll(path.sep, "/") : filePath;
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved || !fs.existsSync(resolved)) return fallback;
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

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    const resolved = resolveRepoPath(candidate);
    if (resolved && fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function latestModifierEntityFiles(count) {
  const dir = path.join(repoRoot, "DEV_exports");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^modifier-entity-.+\.json$/i.test(entry.name))
    .map((entry) => {
      const filePath = path.join(dir, entry.name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, count)
    .map((entry) => entry.filePath)
    .reverse();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function seasonalId(value) {
  const number = finiteNumber(value);
  return number !== null && number >= SEASONAL_ID_MIN && number < SEASONAL_ID_MAX ? number : null;
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))]
    .map(String)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function uniqueSortedNumbers(values) {
  return uniqueSorted(values)
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function formatList(values, limit = 8) {
  const list = asArray(values).filter((value) => value !== null && value !== undefined && value !== "");
  if (!list.length) return "-";
  const head = list.slice(0, limit).map(String);
  return list.length > limit ? `${head.join(", ")}, +${list.length - limit}` : head.join(", ");
}

function markdownTable(headers, rows) {
  const escapeCell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    "",
  ].join("\n");
}

function increment(map, key, amount = 1) {
  const stringKey = String(key ?? "unknown");
  map.set(stringKey, (map.get(stringKey) ?? 0) + amount);
}

function pushMap(map, key, value) {
  const stringKey = String(key ?? "unknown");
  const rows = map.get(stringKey) ?? [];
  rows.push(value);
  map.set(stringKey, rows);
}

function loadFactorCatalog(filePath) {
  const resolved = filePath ? resolveRepoPath(filePath) : firstExistingPath(FACTOR_CANDIDATES);
  const payload = resolved && fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, "utf8")) : {};
  const byBuffId = new Map();
  const byName = new Map();

  for (const [buffIdText, factor] of Object.entries(payload.factorsByBuffId ?? {})) {
    const buffId = seasonalId(buffIdText);
    if (buffId === null) continue;
    const gradeRows = asArray(factor.modifierEvidence?.gradeRows).map((row) => ({
      grade: finiteNumber(row.grade),
      itemId: finiteNumber(row.itemId),
      itemQualityTier: finiteNumber(row.itemQualityTier),
      parameterValues: asArray(row.parameterValues),
      valueTexts: asArray(row.valueTexts),
      cleanResolvedDescription: row.cleanResolvedDescription ?? "",
    }));
    const info = {
      buffId,
      familyId: finiteNumber(factor.familyId),
      familyName: factor.familyNames?.en ?? factor.familyName ?? `seasonal-factor:${buffId}`,
      familyNames: asObject(factor.familyNames),
      cleanDescription: factor.cleanDescriptions?.en ?? factor.cleanDescription ?? "",
      gradeCount: finiteNumber(factor.gradeCount) ?? gradeRows.length,
      gradeItemIds: uniqueSortedNumbers(asArray(factor.gradeItemIds)),
      affectedDamageIds: uniqueSortedNumbers(asArray(factor.affectedDamageIds)),
      affectedRecountIds: uniqueSortedNumbers(asArray(factor.affectedRecountIds)),
      runtimeSelectionStatus: factor.modifierEvidence?.runtimeSelectionStatus ?? "",
      valueStatus: factor.modifierEvidence?.valueStatus ?? "",
      gradeRows,
    };
    byBuffId.set(String(buffId), info);
    byName.set(String(info.familyName).toLowerCase(), info);
  }

  return { path: resolved, byBuffId, byName };
}

function factorIdFromSourceId(sourceId) {
  const match = /^phantom-factor:(\d+)$/i.exec(String(sourceId ?? ""));
  return match ? seasonalId(match[1]) : null;
}

function factorIdFromRule(ruleId, runtime, relationships, catalog, label) {
  const runtimeRow = runtime.sourcesByRuleId?.[ruleId];
  const runtimeId = factorIdFromSourceId(runtimeRow?.sourceId);
  if (runtimeId !== null) return runtimeId;

  const relationshipRow = relationships.sourcesByRuleId?.[ruleId] ?? relationships.relationshipsByRuleId?.[ruleId];
  const relationshipId = factorIdFromSourceId(relationshipRow?.sourceId);
  if (relationshipId !== null) return relationshipId;
  for (const edge of asArray(relationshipRow?.uidEdges)) {
    if (edge?.uidKind === "buff") {
      const edgeId = seasonalId(edge.uid);
      if (edgeId !== null) return edgeId;
    }
  }

  const labelMatch = catalog.byName.get(String(label ?? "").toLowerCase());
  return labelMatch?.buffId ?? null;
}

function activeModifierIds(hit) {
  const ids = new Set();
  for (const modifier of asArray(hit?.activeModifiers)) {
    const baseId = seasonalId(modifier?.modifierBaseId);
    if (baseId !== null) ids.add(baseId);
    const sourceId = seasonalId(modifier?.modifierSourceConfigId);
    if (sourceId !== null) ids.add(sourceId);
  }
  return ids;
}

function hitValue(hit) {
  return finiteNumber(hit?.effectiveValue) ?? finiteNumber(hit?.hpLossValue) ?? finiteNumber(hit?.value) ?? 0;
}

function compactFileLabel(filePath) {
  return path.basename(filePath).replace(/^modifier-entity-/, "").replace(/\.json$/i, "");
}

function summarizeEntityFile(filePath, factorIds, damageIds) {
  const payload = readJson(filePath, {});
  const activeFactorBuffIds = uniqueSortedNumbers(
    asArray(payload.activeFactorBuffs).map((row) => row.factorBuffId ?? row.observedBuffId),
  );
  const activeFactorItems = asArray(payload.activeFactorItems);
  const rowsByFactorDamage = new Map();
  const damageTotals = new Map();
  const selectedItemsByFactor = new Map();

  for (const item of activeFactorItems) {
    const factorId = seasonalId(item?.factorBuffId ?? item?.observedBuffId);
    if (factorId !== null) pushMap(selectedItemsByFactor, factorId, item);
  }

  const factorSet = new Set(factorIds.map(String));
  const damageSet = new Set(damageIds.map(String));
  for (const hit of asArray(payload.modifierReplayHits)) {
    const damageId = finiteNumber(hit.damageId ?? hit.skillKey);
    if (damageId === null || !damageSet.has(String(damageId))) continue;
    const value = hitValue(hit);
    const damageTotal = damageTotals.get(String(damageId)) ?? { hits: 0, value: 0 };
    damageTotal.hits += 1;
    damageTotal.value += value;
    damageTotals.set(String(damageId), damageTotal);

    const activeIds = activeModifierIds(hit);
    for (const factorId of activeIds) {
      if (!factorSet.has(String(factorId))) continue;
      const key = `${factorId}:${damageId}`;
      const row = rowsByFactorDamage.get(key) ?? { hits: 0, value: 0 };
      row.hits += 1;
      row.value += value;
      rowsByFactorDamage.set(key, row);
    }
  }

  return {
    file: compactPath(filePath),
    label: compactFileLabel(filePath),
    entityUid: finiteNumber(payload.uid),
    entityName: payload.name ?? "",
    activeFactorBuffIds,
    activeFactorItems: activeFactorItems.length,
    selectedItemsByFactor,
    rowsByFactorDamage,
    damageTotals,
  };
}

function summarizeGradeBridge(gradeBridge) {
  const rowsByFactor = new Map();
  for (const row of asArray(gradeBridge.rows)) {
    const factorId = seasonalId(row.rawId);
    if (factorId === null) continue;
    pushMap(rowsByFactor, factorId, row);
  }
  return rowsByFactor;
}

function compactSelectedItem(item) {
  const grade = finiteNumber(item?.grade);
  const itemId = finiteNumber(item?.itemConfigId ?? item?.item_config_id ?? item?.configId ?? item?.config_id);
  const uuid = finiteNumber(item?.itemUuid ?? item?.item_uuid ?? item?.uuid);
  return {
    factorBuffId: seasonalId(item?.factorBuffId ?? item?.observedBuffId),
    grade,
    itemConfigId: itemId,
    itemUuid: uuid,
    source: item?.source ?? item?.runtimeSource ?? "",
  };
}

function compactCurrentCandidate(candidate) {
  return {
    grade: finiteNumber(candidate?.grade),
    itemConfigId: finiteNumber(candidate?.itemConfigId ?? candidate?.item_config_id),
    itemUuid: finiteNumber(candidate?.itemUuid ?? candidate?.item_uuid),
    valueTexts: asArray(candidate?.valueTexts),
    source: candidate?.source ?? candidate?.runtimeSource ?? "current-vdata",
  };
}

function buildReport(options) {
  const replay = readJson(options.replayJson, {});
  const gradeBridge = readJson(options.gradeBridgeJson, {});
  const selectorSource = readJson(options.selectorSourceJson, {});
  const differential = readJson(options.differentialJson, {});
  const contributionRuntime = readJson(options.contributionJson, {});
  const relationshipTable = readJson(options.relationshipJson, {});
  const factorCatalog = loadFactorCatalog(options.factorsJson);
  const gradeRowsByFactor = summarizeGradeBridge(gradeBridge);

  const blockedRows = [];
  const factors = new Set();
  const damageIds = new Set();
  for (const replayRow of asArray(replay.rows)) {
    for (const detail of asArray(replayRow.blockedActionDetails)) {
      const factorBuffId = factorIdFromRule(
        detail.ruleId,
        contributionRuntime,
        relationshipTable,
        factorCatalog,
        detail.label,
      );
      const legacySeasonDamageBlocker =
        asArray(detail?.terms).map(String).includes("seasonDamagePct") ||
        String(detail?.reason ?? "").includes("seasonDamagePct") ||
        String(detail?.componentKey ?? "").includes("season");
      if (factorBuffId === null && !legacySeasonDamageBlocker) continue;
      const factorInfo = factorBuffId !== null ? factorCatalog.byBuffId.get(String(factorBuffId)) : null;
      const runtimeRow = contributionRuntime.sourcesByRuleId?.[detail.ruleId] ?? {};
      const damageId = finiteNumber(replayRow.damageId);
      if (factorBuffId !== null) factors.add(String(factorBuffId));
      if (damageId !== null) damageIds.add(String(damageId));
      blockedRows.push({
        damageId,
        damageName: replayRow.name ?? "",
        damageFinalValue: finiteNumber(replayRow.finalValue) ?? 0,
        damageHits: finiteNumber(replayRow.hits) ?? 0,
        ruleId: detail.ruleId ?? "",
        label: detail.label ?? factorInfo?.familyName ?? "",
        factorBuffId,
        factorName: factorInfo?.familyName ?? detail.label ?? "",
        sourceTypology: "seasonal-factor",
        formulaTermIds: uniqueSorted([...(runtimeRow.formulaTermIds ?? []), ...asArray(detail.terms)]),
        formulaZoneIds: uniqueSorted(runtimeRow.formulaZoneIds ?? ["seasonDamage"]),
        contributionGroups: uniqueSorted(runtimeRow.contributionGroups ?? ["seasonDamage"]),
        componentKey: detail.componentKey ?? "",
        blockedHits: finiteNumber(detail.hits) ?? 0,
        blockerReason: detail.reason ?? "",
      });
    }
  }

  const inputs = options.inputs.length ? options.inputs.map(resolveRepoPath) : latestModifierEntityFiles(options.latest);
  const entitySummaries = inputs.map((filePath) =>
    summarizeEntityFile(filePath, [...factors].map(Number), [...damageIds].map(Number)),
  );

  const factorMatrixById = new Map();
  for (const row of asArray(differential.factorMatrix)) {
    const factorId = seasonalId(row.factorBuffId);
    if (factorId !== null) factorMatrixById.set(String(factorId), row);
  }

  const rowReports = [];
  const factorReportsById = new Map();
  const verdictCounts = new Map();
  for (const row of blockedRows) {
    const factorKey = String(row.factorBuffId ?? "unresolved");
    const factorInfo = row.factorBuffId !== null ? factorCatalog.byBuffId.get(String(row.factorBuffId)) : null;
    const gradeRows = row.factorBuffId !== null ? gradeRowsByFactor.get(String(row.factorBuffId)) ?? [] : [];
    const selectedItems = [];
    const currentCandidates = [];
    const perFile = [];
    let sourceActiveReplayHits = 0;
    let sourceActiveReplayDamage = 0;
    let totalReplayHitsForDamage = 0;
    let totalReplayDamageForDamage = 0;
    let activeFactorFiles = 0;

    for (const entity of entitySummaries) {
      const activeFactorInFile = row.factorBuffId !== null && entity.activeFactorBuffIds.includes(row.factorBuffId);
      if (activeFactorInFile) activeFactorFiles += 1;
      const factorDamage = entity.rowsByFactorDamage.get(`${row.factorBuffId}:${row.damageId}`) ?? { hits: 0, value: 0 };
      const damageTotal = entity.damageTotals.get(String(row.damageId)) ?? { hits: 0, value: 0 };
      const fileSelectedItems =
        row.factorBuffId !== null ? asArray(entity.selectedItemsByFactor.get(String(row.factorBuffId))) : [];
      selectedItems.push(...fileSelectedItems.map(compactSelectedItem));
      sourceActiveReplayHits += factorDamage.hits;
      sourceActiveReplayDamage += factorDamage.value;
      totalReplayHitsForDamage += damageTotal.hits;
      totalReplayDamageForDamage += damageTotal.value;
      perFile.push({
        file: entity.file,
        label: entity.label,
        activeFactorInFile,
        damageReplayHits: damageTotal.hits,
        sourceActiveReplayHits: factorDamage.hits,
        sourceActiveReplayDamage: Math.round(factorDamage.value),
        selectedFactorItems: fileSelectedItems.map(compactSelectedItem),
      });
    }

    for (const gradeRow of gradeRows) {
      currentCandidates.push(...asArray(gradeRow.currentCandidates).map(compactCurrentCandidate));
    }

    const uniqueSelectedItems = Object.values(
      Object.fromEntries(
        selectedItems.map((item) => [
          `${item.factorBuffId}:${item.grade}:${item.itemConfigId}:${item.itemUuid}`,
          item,
        ]),
      ),
    );
    const uniqueCurrentCandidates = Object.values(
      Object.fromEntries(
        currentCandidates.map((item) => [`${item.grade}:${item.itemConfigId}:${item.itemUuid}`, item]),
      ),
    );

    const blockers = [];
    if (!sourceActiveReplayHits) blockers.push("seasonal-factor-family-not-active-on-replay-hits");
    if (!uniqueSelectedItems.length) blockers.push("encounter-local-selected-factor-grade-not-captured");
    if ((factorInfo?.gradeCount ?? 0) > 1) blockers.push(`seasonal-factor-grade-ladder:${factorInfo.gradeCount}`);
    if (uniqueCurrentCandidates.length) blockers.push("current-vdata-candidate-is-current-only-not-encounter-local");
    if (!factorInfo) blockers.push("missing-seasonal-factor-catalog-row");

    const verdict = !sourceActiveReplayHits
      ? "blocked-no-family-active-hit-proof"
      : uniqueSelectedItems.length
        ? "review-selected-grade-captured"
        : "blocked-family-active-grade-selector-missing";
    increment(verdictCounts, verdict);

    const reportRow = {
      ...row,
      factorCatalog: factorInfo
        ? {
            familyId: factorInfo.familyId,
            familyName: factorInfo.familyName,
            cleanDescription: factorInfo.cleanDescription,
            gradeCount: factorInfo.gradeCount,
            gradeItemIds: factorInfo.gradeItemIds,
            affectedDamageIds: factorInfo.affectedDamageIds,
            affectedRecountIds: factorInfo.affectedRecountIds,
            runtimeSelectionStatus: factorInfo.runtimeSelectionStatus,
            valueStatus: factorInfo.valueStatus,
            gradeValuePreview: factorInfo.gradeRows.slice(0, 6).map((gradeRow) => ({
              grade: gradeRow.grade,
              itemId: gradeRow.itemId,
              valueTexts: gradeRow.valueTexts,
            })),
          }
        : null,
      replayHitEvidence: {
        totalReplayHitsForDamage,
        totalReplayDamageForDamage: Math.round(totalReplayDamageForDamage),
        sourceActiveReplayHits,
        sourceActiveReplayDamage: Math.round(sourceActiveReplayDamage),
        activeFactorFiles,
        files: perFile,
      },
      selectorEvidence: {
        encounterSelectedFactorItems: uniqueSelectedItems,
        currentOnlyCandidates: uniqueCurrentCandidates,
        gradeBridgeRows: gradeRows.length,
        gradeBridgeValueProofStatuses: uniqueSorted(gradeRows.flatMap((gradeRow) => gradeRow.valueProofStatuses ?? [])),
        gradeBridgeValueBlockers: uniqueSorted(gradeRows.flatMap((gradeRow) => gradeRow.valueBlockers ?? [])),
      },
      differentialEvidence: factorMatrixById.get(factorKey) ?? null,
      verdict,
      remainingBlockers: blockers,
    };
    rowReports.push(reportRow);

    const factorReport = factorReportsById.get(factorKey) ?? {
      factorBuffId: row.factorBuffId,
      factorName: row.factorName,
      sourceTypology: "seasonal-factor",
      formulaZoneIds: new Set(),
      formulaTermIds: new Set(),
      blockedDamageRows: 0,
      blockedHits: 0,
      totalReplayHitsForDamage: 0,
      sourceActiveReplayHits: 0,
      rowsWithSourceActiveHits: 0,
      rowsWithEncounterSelectedGrade: 0,
      currentOnlyCandidateCount: 0,
      verdictCounts: new Map(),
      damageIds: new Set(),
      blockerReasons: new Set(),
    };
    for (const value of row.formulaZoneIds) factorReport.formulaZoneIds.add(value);
    for (const value of row.formulaTermIds) factorReport.formulaTermIds.add(value);
    factorReport.blockedDamageRows += 1;
    factorReport.blockedHits += row.blockedHits;
    factorReport.totalReplayHitsForDamage += totalReplayHitsForDamage;
    factorReport.sourceActiveReplayHits += sourceActiveReplayHits;
    if (sourceActiveReplayHits) factorReport.rowsWithSourceActiveHits += 1;
    if (uniqueSelectedItems.length) factorReport.rowsWithEncounterSelectedGrade += 1;
    factorReport.currentOnlyCandidateCount += uniqueCurrentCandidates.length;
    increment(factorReport.verdictCounts, verdict);
    factorReport.damageIds.add(String(row.damageId));
    factorReport.blockerReasons.add(row.blockerReason);
    factorReportsById.set(factorKey, factorReport);
  }

  const factorReports = [...factorReportsById.values()]
    .map((row) => ({
      ...row,
      formulaZoneIds: [...row.formulaZoneIds].sort(),
      formulaTermIds: [...row.formulaTermIds].sort(),
      verdictCounts: Object.fromEntries([...row.verdictCounts.entries()].sort()),
      damageIds: [...row.damageIds].sort((left, right) => Number(left) - Number(right)),
      blockerReasons: [...row.blockerReasons].sort(),
      differentialEvidence: factorMatrixById.get(String(row.factorBuffId)) ?? null,
      factorCatalog: row.factorBuffId !== null ? factorCatalog.byBuffId.get(String(row.factorBuffId)) ?? null : null,
    }))
    .sort((left, right) => right.blockedHits - left.blockedHits || String(left.factorName).localeCompare(String(right.factorName)));

  const summary = {
    replayRows: asArray(replay.rows).length,
    blockedRows: rowReports.length,
    blockedHits: rowReports.reduce((sum, row) => sum + row.blockedHits, 0),
    uniqueFactorRules: new Set(rowReports.map((row) => row.ruleId)).size,
    uniqueFactorBuffIds: new Set(rowReports.map((row) => row.factorBuffId).filter((id) => id !== null)).size,
    rowsWithSourceActiveReplayHits: rowReports.filter((row) => row.replayHitEvidence.sourceActiveReplayHits > 0).length,
    rowsWithEncounterSelectedGrade: rowReports.filter((row) => row.selectorEvidence.encounterSelectedFactorItems.length > 0).length,
    rowsWithCurrentOnlyCandidates: rowReports.filter((row) => row.selectorEvidence.currentOnlyCandidates.length > 0).length,
    verdictCounts: Object.fromEntries([...verdictCounts.entries()].sort()),
    selectorSourceSummary: selectorSource.summary ?? {},
    gradeBridgeSummary: gradeBridge.summary ?? {},
    differentialSummary: differential.summary ?? {},
  };

  return {
    source: "scripts/audit-seasonal-factor-replay-selector.mjs",
    generatedAt: new Date().toISOString(),
    notes: [
      "Dev-only report. This does not change runtime parser, DPS, monitor, overlay, or shipped modifier UI behavior.",
      "Rows are typed as seasonal-factor sources even when they plug into the seasonDamage formula zone.",
      "Current VData candidates are recorded as current-only hints and are not encounter-local replay selectors.",
    ],
    inputs: {
      replayJson: compactPath(resolveRepoPath(options.replayJson)),
      gradeBridgeJson: compactPath(resolveRepoPath(options.gradeBridgeJson)),
      selectorSourceJson: compactPath(resolveRepoPath(options.selectorSourceJson)),
      differentialJson: compactPath(resolveRepoPath(options.differentialJson)),
      factorsJson: compactPath(factorCatalog.path),
      contributionJson: compactPath(resolveRepoPath(options.contributionJson)),
      relationshipJson: compactPath(resolveRepoPath(options.relationshipJson)),
      modifierEntityFiles: inputs.map(compactPath),
    },
    summary,
    factorRules: factorReports,
    rows: rowReports.sort(
      (left, right) =>
        right.blockedHits - left.blockedHits ||
        String(left.factorName).localeCompare(String(right.factorName)) ||
        String(left.damageName).localeCompare(String(right.damageName)),
    ),
  };
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Seasonal Factor Replay Selector Audit", "");
  lines.push("> Dev-only report. No runtime parser, DPS, monitor, overlay, hotkey, capture, or shipped modifier UI behavior was changed.", "");
  lines.push("## Summary", "");
  lines.push(markdownTable(
    ["Metric", "Value"],
    [
      ["Blocked rows", formatNumber(report.summary.blockedRows)],
      ["Blocked hit references", formatNumber(report.summary.blockedHits)],
      ["Unique factor rules", formatNumber(report.summary.uniqueFactorRules)],
      ["Unique factor buff ids", formatNumber(report.summary.uniqueFactorBuffIds)],
      ["Rows with factor active on replay hits", formatNumber(report.summary.rowsWithSourceActiveReplayHits)],
      ["Rows with encounter-local selected grade", formatNumber(report.summary.rowsWithEncounterSelectedGrade)],
      ["Rows with current-only VData candidates", formatNumber(report.summary.rowsWithCurrentOnlyCandidates)],
      ["Verdicts", Object.entries(report.summary.verdictCounts).map(([key, count]) => `${key}: ${count}`).join(", ") || "-"],
    ],
  ));

  lines.push("## Factor Rules", "");
  lines.push(markdownTable(
    [
      "Factor",
      "UID",
      "Blocked Rows",
      "Blocked Hits",
      "Replay Active Hits",
      "Selected Grade Rows",
      "Current-Only Hints",
      "Terms",
      "Verdicts",
    ],
    report.factorRules.map((row) => [
      row.factorName,
      row.factorBuffId ?? "-",
      formatNumber(row.blockedDamageRows),
      formatNumber(row.blockedHits),
      formatNumber(row.sourceActiveReplayHits),
      formatNumber(row.rowsWithEncounterSelectedGrade),
      formatNumber(row.currentOnlyCandidateCount),
      formatList(row.formulaTermIds),
      Object.entries(row.verdictCounts).map(([key, count]) => `${key}: ${count}`).join(", "),
    ]),
  ));

  lines.push("## Blocked Rows", "");
  lines.push(markdownTable(
    [
      "Damage",
      "Factor",
      "UID",
      "Blocked Hits",
      "Replay Active Hits",
      "Replay Damage",
      "Selected Grade",
      "Current-Only Grade",
      "Verdict",
      "Remaining Blockers",
    ],
    report.rows.slice(0, maxRows).map((row) => [
      `${row.damageName} (${row.damageId})`,
      row.factorName,
      row.factorBuffId ?? "-",
      formatNumber(row.blockedHits),
      formatNumber(row.replayHitEvidence.sourceActiveReplayHits),
      formatNumber(row.replayHitEvidence.sourceActiveReplayDamage),
      formatList(row.selectorEvidence.encounterSelectedFactorItems.map((item) => item.grade)),
      formatList(row.selectorEvidence.currentOnlyCandidates.map((item) => item.grade)),
      row.verdict,
      formatList(row.remainingBlockers, 5),
    ]),
  ));

  if (report.rows.length > maxRows) {
    lines.push(`_Truncated ${report.rows.length - maxRows} additional rows._`, "");
  }

  lines.push("## Inputs", "");
  lines.push("```json");
  lines.push(JSON.stringify(report.inputs, null, 2));
  lines.push("```", "");
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report, options.maxRows));
  console.log(
    [
      `Wrote ${options.outJson}`,
      `Blocked rows: ${report.summary.blockedRows}`,
      `Rows with factor active on replay hits: ${report.summary.rowsWithSourceActiveReplayHits}`,
      `Rows with encounter-local selected grade: ${report.summary.rowsWithEncounterSelectedGrade}`,
      `Rows with current-only VData candidates: ${report.summary.rowsWithCurrentOnlyCandidates}`,
    ].join("\n"),
  );
}

main();
