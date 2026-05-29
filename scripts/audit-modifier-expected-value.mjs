#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_INPUTS = 3;
const DEFAULT_MAX_ROWS = 80;
const DEFAULT_MIN_ELIGIBLE_HITS = 100;
const DEFAULT_CHANCE_ERROR_LIMIT = 0.025;
const DEFAULT_OUT_JSON = "DEV_exports/modifier-expected-value-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/modifier-expected-value-audit.md";
const SEASONAL_FACTOR_HINT_LIMIT = 8;
const SEASONAL_MODIFIER_ID_MIN = 3050000;
const SEASONAL_MODIFIER_ID_MAX = 3060000;
const DEFAULT_VALUE_PROOF_CANDIDATES = [
  "DEV_generated/modifier/ModifierValueProofRuntime.json",
  "parser-data/generated/ModifierValueProofRuntime.json",
  "../BPSR-UID-Extractors/output/ModifierValueProofRuntime.json",
];
const DEFAULT_RECOUNT_TABLE_CANDIDATES = [
  "parser-data/generated/ModifierRecountTable.json",
  "../BPSR-UID-Extractors/output/ModifierRecountTable.json",
];

const ATTR_CRIT_MULTIPLIER = 0x2b66;
const ATTR_CRIT_RATE = 11710;
const ATTR_LUCKY_CHANCE = 11780;
const ATTR_SEASON_STRENGTH = 11440;
const MODEL_CRITICAL_EXPECTED = "critical-expected-v1";
const MODEL_LUCKY_EXPECTED = "lucky-expected-v1";
const MODEL_SEASONAL_FACTOR = "seasonal-factor-multiplier-v1";
// Current generated catalogs still use these raw keys for the factor value; keep the audit label broader.
const SEASONAL_FACTOR_TERM_IDS = new Set(["seasonDamagePct"]);
const SEASONAL_FACTOR_COMPONENT_KEYS = new Set(["season-damage", "seasonal-factor-damage"]);
const ATTR_LABELS = new Map([
  [50, "AttackPower"],
  [262, "PhysicalAttackLegacy"],
  [263, "MagicAttackLegacy"],
  [11010, "Strength"],
  [11020, "Intelligence"],
  [11030, "Agility"],
  [11110, "CriticalMultiplier"],
  [11330, "PhysicalAttackPanel"],
  [11340, "MagicAttackPanel"],
  [ATTR_SEASON_STRENGTH, "SeasonStrength"],
  [11710, "CritRatePanel"],
  [11720, "AttackSpeed"],
  [11730, "CastSpeedPanel"],
  [11760, "CooldownReductionPanel"],
  [11780, "LuckyPanel"],
  [11930, "HastePanel"],
  [11940, "MasteryPanel"],
  [11950, "VersatilityPanel"],
  [11960, "CooldownAccelerationPanel"],
  [11970, "BlockPanel"],
  [12510, "CritDamagePanel"],
  [12530, "LuckyDamageMultiplierPanel"],
  [12540, "BlockDamageReductionPanel"],
]);
const EXPECTED_ATTRS_BY_MODEL = new Map([
  [MODEL_CRITICAL_EXPECTED, [{ attrId: ATTR_CRIT_RATE, source: "attacker" }]],
  [MODEL_LUCKY_EXPECTED, [{ attrId: ATTR_LUCKY_CHANCE, source: "attacker" }]],
]);
const ATTR_NORMALIZERS = [
  { key: "raw/10000", divisor: 10000 },
  { key: "raw/1000", divisor: 1000 },
  { key: "raw/100", divisor: 100 },
  { key: "raw", divisor: 1 },
];
const SEASONAL_FACTOR_BRIDGE_ATTRS = [
  // Candidate only: prove this across multiple factor totals before treating it as semantic.
  { source: "attacker", attrId: 12530, normalizer: "raw/10000", divisor: 10000 },
];

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
    maxRows: DEFAULT_MAX_ROWS,
    valueProof: null,
    recountTable: null,
    minEligibleHits: DEFAULT_MIN_ELIGIBLE_HITS,
    chanceErrorLimit: DEFAULT_CHANCE_ERROR_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      options.inputs.push(argv[++index]);
    } else if (arg === "--latest") {
      options.latest = Math.max(1, Number(argv[++index]) || DEFAULT_LATEST_INPUTS);
    } else if (arg === "--value-proof") {
      options.valueProof = argv[++index];
    } else if (arg === "--recount-table") {
      options.recountTable = argv[++index];
    } else if (arg === "--out-json") {
      options.outJson = argv[++index];
    } else if (arg === "--out-md") {
      options.outMd = argv[++index];
    } else if (arg === "--max-rows") {
      options.maxRows = Math.max(1, Number(argv[++index]) || DEFAULT_MAX_ROWS);
    } else if (arg === "--min-hits") {
      options.minEligibleHits = Math.max(1, Number(argv[++index]) || DEFAULT_MIN_ELIGIBLE_HITS);
    } else if (arg === "--chance-error") {
      options.chanceErrorLimit = Math.max(0, Number(argv[++index]) || DEFAULT_CHANCE_ERROR_LIMIT);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/audit-modifier-expected-value.mjs [options]

Options:
  --input <path>          Add a specific modifier-entity export. Repeatable.
  --latest <count>        Use latest DEV_exports/modifier-entity-*.json when no inputs are provided. Default: ${DEFAULT_LATEST_INPUTS}
  --value-proof <path>    ModifierValueProofRuntime.json path. Defaults to app parser-data, then sibling extractor output.
  --recount-table <path>  ModifierRecountTable.json path. Defaults to app parser-data, then sibling extractor output.
  --out-json <path>       JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>         Markdown report path. Default: ${DEFAULT_OUT_MD}
  --max-rows <count>      Max Markdown rows per table. Default: ${DEFAULT_MAX_ROWS}
  --min-hits <count>      Min active and inactive hits required to validate a rate delta. Default: ${DEFAULT_MIN_ELIGIBLE_HITS}
  --chance-error <value>  Max absolute chance delta error. Default: ${DEFAULT_CHANCE_ERROR_LIMIT}
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    const resolved = resolveRepoPath(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function latestModifierEntityExports(count) {
  const dir = path.join(repoRoot, "DEV_exports");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^modifier-entity-.+\.json$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return { fullPath, stat: fs.statSync(fullPath) };
    })
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)
    .slice(0, count)
    .map((entry) => entry.fullPath);
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

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function addString(set, value) {
  if (value === null || value === undefined || value === "") return;
  set.add(String(value));
}

function addNumericString(set, value) {
  const number = finiteNumber(value);
  if (number === null) return;
  set.add(String(Math.trunc(number)));
}

function parseTrailingNumber(value) {
  const match = String(value ?? "").match(/:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function uniqueSortedStrings(values) {
  return [...new Set(values.map(String).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function countMapToObject(map, limit = 20) {
  return Object.fromEntries(
    [...map.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit),
  );
}

function incrementMap(map, key, amount = 1) {
  const stringKey = String(key || "unknown");
  map.set(stringKey, (map.get(stringKey) ?? 0) + amount);
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function formatPercent(value, digits = 1) {
  const number = finiteNumber(value);
  return number === null ? "-" : `${(number * 100).toFixed(digits)}%`;
}

function formatSignedPercent(value, digits = 1) {
  const number = finiteNumber(value);
  if (number === null) return "-";
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(digits)}%`;
}

function formatSignedDecimal(value, digits = 4) {
  const number = finiteNumber(value);
  if (number === null) return "-";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}`;
}

function attrLabel(attrId) {
  return ATTR_LABELS.get(Number(attrId)) ?? `attr:${attrId}`;
}

function compactPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function entriesFromValueProof(valueProof) {
  const entriesByKey = asObject(valueProof.entriesByKey);
  if (Object.keys(entriesByKey).length > 0) return Object.values(entriesByKey);
  return asArray(valueProof.entries);
}

function addToSetMap(map, key, value) {
  if (value === null || value === undefined || value === "") return;
  const stringKey = String(key);
  const set = map.get(stringKey) ?? new Set();
  set.add(String(value));
  map.set(stringKey, set);
}

function addEntryMetadata(metadataById, id, entry) {
  const number = finiteNumber(id);
  if (number === null) return;
  const key = String(Math.trunc(number));
  let metadata = metadataById.get(key);
  if (!metadata) {
    metadata = {
      id: key,
      labels: new Set(),
      entryKeys: new Set(),
      categories: new Set(),
      runtimeKinds: new Set(),
      valueProofStatuses: new Set(),
      formulaZoneIds: new Set(),
      selectedValues: new Set(),
      candidateValues: new Map(),
      valueBlockers: new Set(),
    };
    metadataById.set(key, metadata);
  }

  addString(metadata.labels, entry.sourceLabel ?? entry.name ?? entry.key);
  addString(metadata.entryKeys, entry.key);
  addString(metadata.categories, entry.category);
  addString(metadata.runtimeKinds, entry.runtimeKind);
  addString(metadata.valueProofStatuses, entry.valueProofStatus);
  for (const zoneId of asArray(entry.formulaZoneIds)) addString(metadata.formulaZoneIds, zoneId);
  for (const blocker of asArray(entry.valueBlockers)) addString(metadata.valueBlockers, blocker);
  for (const selectedValue of asArray(entry.selectedValues)) {
    const component = selectedValue.componentKey ?? "unknown";
    const value = selectedValue.rawText ?? selectedValue.value ?? selectedValue.decimalValue;
    if (value !== null && value !== undefined && value !== "") {
      addString(metadata.selectedValues, `${component}:${value}`);
    }
  }
  for (const selector of asArray(entry.valueSelectors)) {
    const component = selector.componentKey ?? "unknown";
    for (const candidate of asArray(selector.candidates)) {
      const decimalValue =
        finiteNumber(candidate.decimalValue) ??
        (candidate.unit === "percent" && finiteNumber(candidate.value) !== null ? finiteNumber(candidate.value) / 100 : null);
      if (decimalValue === null) continue;
      const candidateKey = [
        component,
        decimalValue,
        candidate.rawText ?? candidate.value ?? "",
        candidate.grade ?? "",
        selector.kind ?? "",
        selector.status ?? "",
      ].join("|");
      if (!metadata.candidateValues.has(candidateKey)) {
        metadata.candidateValues.set(candidateKey, {
          componentKey: component,
          decimalValue,
          value: candidate.value ?? null,
          rawText: candidate.rawText ?? null,
          unit: candidate.unit ?? null,
          grade: candidate.grade ?? null,
          gradeKind: candidate.gradeKind ?? null,
          selectorKind: selector.kind ?? null,
          selectorStatus: selector.status ?? null,
        });
      }
    }
  }
}

function buildModifierMetadataById(valueProof) {
  const metadataById = new Map();
  for (const entry of entriesFromValueProof(valueProof)) {
    addEntryMetadata(metadataById, entry.uid, entry);
    for (const id of asArray(entry.sourceIds)) addEntryMetadata(metadataById, id, entry);
  }
  return metadataById;
}

function serializeMetadata(metadata) {
  if (!metadata) {
    return {
      labels: [],
      entryKeys: [],
      categories: [],
      runtimeKinds: [],
      valueProofStatuses: [],
      formulaZoneIds: [],
      selectedValues: [],
      candidateValueRows: [],
      candidateValues: [],
      valueBlockers: [],
    };
  }
  const candidateValueRows = [...metadata.candidateValues.values()].sort((left, right) => {
    const componentDelta = String(left.componentKey).localeCompare(String(right.componentKey));
    if (componentDelta !== 0) return componentDelta;
    return left.decimalValue - right.decimalValue;
  });
  return {
    labels: [...metadata.labels].sort((left, right) => left.localeCompare(right)),
    entryKeys: [...metadata.entryKeys].sort((left, right) => left.localeCompare(right)),
    categories: [...metadata.categories].sort((left, right) => left.localeCompare(right)),
    runtimeKinds: [...metadata.runtimeKinds].sort((left, right) => left.localeCompare(right)),
    valueProofStatuses: [...metadata.valueProofStatuses].sort((left, right) => left.localeCompare(right)),
    formulaZoneIds: [...metadata.formulaZoneIds].sort((left, right) => left.localeCompare(right)),
    selectedValues: [...metadata.selectedValues].sort((left, right) => left.localeCompare(right)),
    candidateValueRows,
    candidateValues: candidateValueRows.map(
      (candidate) =>
        `${candidate.componentKey}:${candidate.rawText ?? formatSignedPercent(candidate.decimalValue, 2)}${
          candidate.grade !== null && candidate.grade !== undefined ? `@grade${candidate.grade}` : ""
        }`,
    ),
    valueBlockers: [...metadata.valueBlockers].sort((left, right) => left.localeCompare(right)),
  };
}

function addSourceRuleIds(set, entry) {
  for (const id of asArray(entry.sourceRuleIds)) addString(set, id);
  for (const id of asArray(entry.directSourceRuleIds)) addString(set, id);
}

function sourceIdsForRule(rule) {
  const ids = new Set();
  addNumericString(ids, rule.sourceEntityId);
  addNumericString(ids, parseTrailingNumber(rule.sourceId));
  for (const id of asArray(rule.buffIds)) addNumericString(ids, id);
  for (const id of asArray(rule.sourceIds)) addNumericString(ids, id);
  for (const id of asArray(rule.sourceConfigIds)) addNumericString(ids, id);
  return ids;
}

function selectedValueHasTerm(selectedValue, termIds) {
  return asArray(selectedValue.formulaTermIds).some((termId) => termIds.has(String(termId)));
}

function selectedValueHasComponent(selectedValue, componentKeys) {
  return componentKeys.has(String(selectedValue.componentKey ?? ""));
}

function isSeasonalFactorValue(selectedValue) {
  return (
    selectedValueHasTerm(selectedValue, SEASONAL_FACTOR_TERM_IDS) ||
    selectedValueHasComponent(selectedValue, SEASONAL_FACTOR_COMPONENT_KEYS)
  );
}

function selectorAppliesToValue(selector, selectedValue) {
  const selectorComponent = selector?.componentKey;
  return !selectorComponent || selectorComponent === selectedValue.componentKey;
}

function isStaticValueSelector(selector) {
  return selector?.kind === "static-uid-grade-ladder" && selector?.status === "selected-by-source-uid-grade";
}

function hasBlockingSelectorForValue(entry, selectedValue) {
  for (const selector of asArray(entry.valueSelectors)) {
    if (selector?.modelId) continue;
    if (!selectorAppliesToValue(selector, selectedValue)) continue;
    if (isStaticValueSelector(selector)) continue;
    return true;
  }
  return false;
}

function seasonalFactorModelSelectors(entry, entryKeySet) {
  if (entry.category === "factors" && entryKeySet.has(`buffs:${entry.uid}`)) {
    return [];
  }

  const selectedValues = asArray(entry.selectedValues).filter((selectedValue) => {
    if (!isSeasonalFactorValue(selectedValue)) return false;
    if (positiveNumber(selectedValue.decimalValue) === null) return false;
    return !hasBlockingSelectorForValue(entry, selectedValue);
  });
  if (selectedValues.length === 0) return [];

  return [
    {
      kind: "seasonal-factor-multiplier",
      modelId: MODEL_SEASONAL_FACTOR,
      modelStatus: "source-observed-snapshot-unproven",
      componentKey: "seasonal-factor",
      selectedValues,
      validationPolicy: {
        kind: "source-window-only",
        minEligibleHits: 1,
        requiredComparison:
          "active source window plus either a local seasonal-factor bucket snapshot or a controlled source-off baseline",
      },
    },
  ];
}

function sourceRuleIdsForSelectedValue(entryRuleIds, selectedValue) {
  const selectedRuleIds = new Set();
  addString(selectedRuleIds, selectedValue.sourceRuleId);
  for (const id of asArray(selectedValue.sourceRuleIds)) addString(selectedRuleIds, id);
  if (selectedRuleIds.size > 0) {
    return { ruleIds: selectedRuleIds, hasSpecificRule: true };
  }
  return { ruleIds: new Set(entryRuleIds), hasSpecificRule: false };
}

function sourceIdsForSelectedValue(entry, selectedRuleIds, sourcesById, includeEntryUid) {
  const ids = new Set();
  if (includeEntryUid) addNumericString(ids, entry.uid);
  for (const ruleId of selectedRuleIds) {
    const rule = sourcesById[ruleId];
    if (!rule) continue;
    for (const id of sourceIdsForRule(rule)) ids.add(id);
  }
  return ids;
}

function selectedRuleMatchesEntryUid(entry, selectedRuleIds, sourcesById) {
  const entryUid = finiteNumber(entry.uid);
  if (entryUid === null || selectedRuleIds.size === 0) return true;
  for (const ruleId of selectedRuleIds) {
    const rule = sourcesById[ruleId];
    if (!rule) continue;
    const sourceIds = sourceIdsForRule(rule);
    if (sourceIds.has(String(Math.trunc(entryUid)))) return true;
  }
  return false;
}

function buildExpectedRows(valueProof, recountTable) {
  const rows = [];
  const seen = new Set();
  const sourcesById = asObject(recountTable.sourcesById);
  const modelCounts = new Map();
  const skippedByReason = new Map();
  const valueEntries = entriesFromValueProof(valueProof);
  const entryKeySet = new Set(valueEntries.map((entry) => String(entry.key ?? "")));

  for (const entry of valueEntries) {
    const selectors = [
      ...asArray(entry.valueSelectors).filter((selector) => selector?.modelId),
      ...seasonalFactorModelSelectors(entry, entryKeySet),
    ];
    if (selectors.length === 0) continue;

    const entryRuleIds = new Set();
    addSourceRuleIds(entryRuleIds, entry);

    for (const selector of selectors) {
      const values = asArray(selector.selectedValues).length
        ? asArray(selector.selectedValues)
        : asArray(entry.selectedValues);
      if (values.length === 0) {
        incrementMap(skippedByReason, "missing-selected-value");
        continue;
      }

      for (const selectedValue of values) {
        const expectedChanceDelta = positiveNumber(selectedValue.decimalValue);
        const componentKey = selector.componentKey ?? selectedValue.componentKey ?? "unknown";
        if (expectedChanceDelta === null) {
          incrementMap(skippedByReason, "missing-expected-chance-delta");
          continue;
        }
        const { ruleIds, hasSpecificRule } = sourceRuleIdsForSelectedValue(entryRuleIds, selectedValue);
        if (hasSpecificRule && !selectedRuleMatchesEntryUid(entry, ruleIds, sourcesById)) {
          incrementMap(skippedByReason, "selected-rule-uid-mismatch");
          continue;
        }
        const baseSourceIds = sourceIdsForSelectedValue(entry, ruleIds, sourcesById, !hasSpecificRule);
        if (baseSourceIds.size === 0) {
          incrementMap(skippedByReason, "missing-source-id");
          continue;
        }
        const key = [
          entry.key,
          selector.modelId,
          componentKey,
          selectedValue.scope ?? "",
          expectedChanceDelta,
        ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
          key,
          entryKey: entry.key,
          uid: entry.uid,
          category: entry.category,
          runtimeKind: entry.runtimeKind,
          sourceLabel: entry.sourceLabel ?? entry.key,
          modelId: selector.modelId,
          modelStatus: selector.modelStatus,
          componentKey,
          formulaTermIds: asArray(selectedValue.formulaTermIds),
          selectedValue: {
            scope: selectedValue.scope ?? null,
            value: selectedValue.value ?? null,
            decimalValue: expectedChanceDelta,
            unit: selectedValue.unit ?? null,
            rawText: selectedValue.rawText ?? null,
          },
          validationPolicy: selector.validationPolicy ?? null,
          sourceRuleIds: [...ruleIds].sort(),
          sourceIds: [...baseSourceIds].sort((left, right) => Number(left) - Number(right)),
        });
        incrementMap(modelCounts, selector.modelId);
      }
    }
  }

  return {
    rows,
    modelCounts: countMapToObject(modelCounts, 50),
    skippedByReason: countMapToObject(skippedByReason, 20),
  };
}

function hitValue(hit) {
  return positiveNumber(hit.effectiveValue) ?? positiveNumber(hit.value) ?? 0;
}

function activeModifierIds(hit) {
  const ids = new Set();
  for (const modifier of asArray(hit.activeModifiers)) {
    addNumericString(ids, modifier.modifierBaseId);
    addNumericString(ids, modifier.modifierSourceConfigId);
    addNumericString(ids, modifier.modifierPartId);
  }
  return ids;
}

function activeSourceRowsForHit(hit, rowsBySourceId) {
  const rowMap = new Map();
  for (const id of activeModifierIds(hit)) {
    for (const row of rowsBySourceId.get(id) ?? []) {
      rowMap.set(row.key, row);
    }
  }
  return [...rowMap.values()];
}

function modifierEvidenceIds(modifier) {
  const ids = new Set();
  addNumericString(ids, modifier?.modifierBaseId);
  addNumericString(ids, modifier?.modifierSourceConfigId);
  addNumericString(ids, modifier?.modifierPartId);
  return ids;
}

function sortNumericStrings(left, right) {
  return Number(left) - Number(right) || String(left).localeCompare(String(right));
}

function addPacketModifierEvidence(evidenceByKey, hit, rows) {
  const expectedSourceIds = new Set(rows.flatMap((row) => asArray(row.sourceIds).map(String)));
  if (expectedSourceIds.size === 0) return;

  for (const modifier of asArray(hit.activeModifiers)) {
    const matchedIds = [...modifierEvidenceIds(modifier)].filter((id) => expectedSourceIds.has(id));
    if (matchedIds.length === 0) continue;

    const key = [
      modifier.modifierBaseId ?? "",
      modifier.modifierSourceConfigId ?? "",
      modifier.modifierPartId ?? "",
      modifier.modifierBuffLevel ?? "",
      modifier.modifierCount ?? "",
      modifier.modifierLayer ?? "",
      modifier.modifierHostUid ?? "",
      modifier.modifierSourceUid ?? "",
    ].join("|");
    let evidence = evidenceByKey.get(key);
    if (!evidence) {
      evidence = {
        modifierBaseId: modifier.modifierBaseId ?? null,
        modifierSourceConfigId: modifier.modifierSourceConfigId ?? null,
        modifierPartId: modifier.modifierPartId ?? null,
        modifierBuffLevel: modifier.modifierBuffLevel ?? null,
        modifierCount: modifier.modifierCount ?? null,
        modifierLayer: modifier.modifierLayer ?? null,
        modifierHostUid: modifier.modifierHostUid ?? null,
        modifierSourceUid: modifier.modifierSourceUid ?? null,
        matchedIds: new Set(),
        hits: 0,
      };
      evidenceByKey.set(key, evidence);
    }
    evidence.hits += 1;
    for (const id of matchedIds) evidence.matchedIds.add(id);
  }
}

function packetModifierEvidenceRows(evidenceByKey, limit = 16) {
  return [...evidenceByKey.values()]
    .map((evidence) => ({
      ...evidence,
      matchedIds: [...evidence.matchedIds].sort(sortNumericStrings),
    }))
    .sort((left, right) => {
      if (right.hits !== left.hits) return right.hits - left.hits;
      return String(left.modifierBaseId ?? "").localeCompare(String(right.modifierBaseId ?? ""));
    })
    .slice(0, limit);
}

function seasonalModifierIdCandidates(modifier) {
  const rows = [];
  const fields = [
    ["base", modifier?.modifierBaseId],
    ["config", modifier?.modifierSourceConfigId],
    ["part", modifier?.modifierPartId],
  ];
  for (const [role, value] of fields) {
    const number = finiteNumber(value);
    if (number === null) continue;
    if (number < SEASONAL_MODIFIER_ID_MIN || number >= SEASONAL_MODIFIER_ID_MAX) continue;
    rows.push({ role, id: String(Math.trunc(number)) });
  }
  return rows;
}

function addSeasonalRawModifierEvidence(evidenceById, hit, seasonalRows, expectedTotal) {
  const expected = finiteNumber(expectedTotal);
  if (expected === null) return;
  const expectedKey = expected.toFixed(6);
  const factorSet = seasonalRows.map((row) => row.entryKey).join(" + ");
  const hitValueAmount = hitValue(hit);
  const seenIds = new Set();

  for (const modifier of asArray(hit.activeModifiers)) {
    const ids = seasonalModifierIdCandidates(modifier);
    if (ids.length === 0) continue;
    const pairKey = `base:${formatOptional(modifier.modifierBaseId)} config:${formatOptional(
      modifier.modifierSourceConfigId,
    )} part:${formatOptional(modifier.modifierPartId)}`;

    for (const { role, id } of ids) {
      let evidence = evidenceById.get(id);
      if (!evidence) {
        evidence = {
          rawId: id,
          expectedGroups: new Map(),
          factorSets: new Set(),
          files: new Set(),
          roles: new Map(),
          pairs: new Map(),
          levels: new Map(),
          counts: new Map(),
          layers: new Map(),
          hosts: new Map(),
          sources: new Map(),
          damageIds: new Map(),
          targetMonsterTypeIds: new Map(),
          hits: 0,
          activeValue: 0,
        };
        evidenceById.set(id, evidence);
      }

      evidence.factorSets.add(factorSet);
      incrementMap(evidence.roles, role);
      incrementMap(evidence.pairs, pairKey);
      incrementMap(evidence.levels, modifier.modifierBuffLevel ?? "unknown");
      incrementMap(evidence.counts, modifier.modifierCount ?? "unknown");
      incrementMap(evidence.layers, modifier.modifierLayer ?? "unknown");
      incrementMap(evidence.hosts, modifier.modifierHostUid ?? "unknown");
      incrementMap(evidence.sources, modifier.modifierSourceUid ?? "unknown");
      incrementMap(evidence.damageIds, hit.damageId ?? hit.skillKey ?? "unknown");
      incrementMap(evidence.targetMonsterTypeIds, hit.targetMonsterTypeId ?? "unknown");

      let group = evidence.expectedGroups.get(expectedKey);
      if (!group) {
        group = {
          expected,
          expectedKey,
          factorSets: new Set(),
          hits: 0,
          activeValue: 0,
        };
        evidence.expectedGroups.set(expectedKey, group);
      }
      group.factorSets.add(factorSet);

      const uniqueHitKey = `${id}`;
      if (!seenIds.has(uniqueHitKey)) {
        seenIds.add(uniqueHitKey);
        evidence.hits += 1;
        evidence.activeValue += hitValueAmount;
        group.hits += 1;
        group.activeValue += hitValueAmount;
      }
    }
  }
}

function seasonalRawModifierEvidenceRows(evidenceById, metadataById, fileName) {
  return [...evidenceById.values()]
    .map((evidence) => {
      const metadata = serializeMetadata(metadataById.get(evidence.rawId));
      return {
        rawId: evidence.rawId,
        file: fileName,
        ...metadata,
        expectedGroups: [...evidence.expectedGroups.values()]
          .map((group) => ({
            expected: group.expected,
            factorSets: [...group.factorSets].sort((left, right) => left.localeCompare(right)),
            hits: group.hits,
            activeValue: group.activeValue,
          }))
          .sort((left, right) => left.expected - right.expected),
        factorSets: [...evidence.factorSets].sort((left, right) => left.localeCompare(right)),
        roles: countMapToObject(evidence.roles, 8),
        pairs: countMapToObject(evidence.pairs, 8),
        levels: countMapToObject(evidence.levels, 8),
        counts: countMapToObject(evidence.counts, 8),
        layers: countMapToObject(evidence.layers, 8),
        hosts: countMapToObject(evidence.hosts, 8),
        sources: countMapToObject(evidence.sources, 8),
        damageIds: countMapToObject(evidence.damageIds, 8),
        targetMonsterTypeIds: countMapToObject(evidence.targetMonsterTypeIds, 8),
        hits: evidence.hits,
        activeValue: evidence.activeValue,
      };
    })
    .sort((left, right) => Number(left.rawId) - Number(right.rawId));
}

function hitLaneKey(hit) {
  return [
    hit.damageId ?? hit.skillKey ?? "",
    hit.property ?? "",
    hit.damageMode ?? "",
    hit.attackerUid ?? hit.originalAttackerUid ?? "",
    hit.targetUid ?? "",
    hit.targetMonsterTypeId ?? "",
  ].join("|");
}

function laneFields(hit) {
  return {
    damageId: hit.damageId ?? hit.skillKey ?? null,
    property: hit.property ?? null,
    damageMode: hit.damageMode ?? null,
    attackerUid: hit.attackerUid ?? hit.originalAttackerUid ?? null,
    targetUid: hit.targetUid ?? null,
    targetMonsterTypeId: hit.targetMonsterTypeId ?? null,
  };
}

function emptyStats() {
  return {
    hits: 0,
    totalValue: 0,
    critHits: 0,
    luckyHits: 0,
    critMultiplierSamples: 0,
    critMultiplierTotal: 0,
    attackerAttrTotals: new Map(),
    targetAttrTotals: new Map(),
  };
}

function cloneEmptyWithLane(hit) {
  return {
    ...emptyStats(),
    ...laneFields(hit),
  };
}

function attrValue(attrs, attrId) {
  for (const attr of asArray(attrs)) {
    if (Number(attr.attrId) !== attrId) continue;
    const value = finiteNumber(attr.valueInt) ?? finiteNumber(attr.valueFloat);
    if (value !== null) return value;
  }
  return null;
}

function addAttrTotals(totals, attrs) {
  for (const attr of asArray(attrs)) {
    const attrId = finiteNumber(attr.attrId);
    if (attrId === null) continue;
    const value = finiteNumber(attr.valueInt) ?? finiteNumber(attr.valueFloat);
    if (value === null) continue;
    const key = String(Math.trunc(attrId));
    const entry = totals.get(key) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += value;
    totals.set(key, entry);
  }
}

function subtractAttrTotals(total, part) {
  const result = new Map();
  for (const [key, totalEntry] of total.entries()) {
    const partEntry = part.get(key);
    const count = Math.max(0, totalEntry.count - (partEntry?.count ?? 0));
    if (count <= 0) continue;
    result.set(key, {
      count,
      sum: totalEntry.sum - (partEntry?.sum ?? 0),
    });
  }
  return result;
}

function averageAttr(totals, attrId) {
  const entry = totals.get(String(attrId));
  if (!entry?.count) return null;
  return entry.sum / entry.count;
}

function attrTotalsForSource(stats, source) {
  return source === "target" ? stats.targetAttrTotals : stats.attackerAttrTotals;
}

function normalizedCritMultiplier(hit) {
  const raw = attrValue(hit.attackerAttrs, ATTR_CRIT_MULTIPLIER);
  if (raw === null) return null;
  const normalized = raw > 10 ? raw / 10000 : raw;
  return normalized > 0 ? normalized : null;
}

function addHit(stats, hit) {
  stats.hits += 1;
  stats.totalValue += hitValue(hit);
  if (hit.isCrit) stats.critHits += 1;
  if (hit.isLucky) stats.luckyHits += 1;
  addAttrTotals(stats.attackerAttrTotals, hit.attackerAttrs);
  addAttrTotals(stats.targetAttrTotals, hit.targetAttrs);
  const critMultiplier = normalizedCritMultiplier(hit);
  if (critMultiplier !== null) {
    stats.critMultiplierSamples += 1;
    stats.critMultiplierTotal += critMultiplier;
  }
}

function subtractStats(total, part) {
  const stats = emptyStats();
  stats.hits = Math.max(0, total.hits - part.hits);
  stats.totalValue = Math.max(0, total.totalValue - part.totalValue);
  stats.critHits = Math.max(0, total.critHits - part.critHits);
  stats.luckyHits = Math.max(0, total.luckyHits - part.luckyHits);
  stats.critMultiplierSamples = Math.max(0, total.critMultiplierSamples - part.critMultiplierSamples);
  stats.critMultiplierTotal = Math.max(0, total.critMultiplierTotal - part.critMultiplierTotal);
  stats.attackerAttrTotals = subtractAttrTotals(total.attackerAttrTotals, part.attackerAttrTotals);
  stats.targetAttrTotals = subtractAttrTotals(total.targetAttrTotals, part.targetAttrTotals);
  return stats;
}

function rate(stats, modelId) {
  if (!stats?.hits) return null;
  if (modelId === MODEL_CRITICAL_EXPECTED) return stats.critHits / stats.hits;
  if (modelId === MODEL_LUCKY_EXPECTED) return stats.luckyHits / stats.hits;
  return null;
}

function averageCritMultiplier(stats) {
  if (!stats?.critMultiplierSamples) return null;
  return stats.critMultiplierTotal / stats.critMultiplierSamples;
}

function normalizedAttrDeltaCandidates({ attrId, source, activeRaw, inactiveRaw, expectedDelta }) {
  return ATTR_NORMALIZERS.map((normalizer) => {
    const delta = (activeRaw - inactiveRaw) / normalizer.divisor;
    return {
      source,
      attrId: Number(attrId),
      label: attrLabel(attrId),
      activeRaw,
      inactiveRaw,
      rawDelta: activeRaw - inactiveRaw,
      normalizer: normalizer.key,
      normalizedDelta: delta,
      error: Math.abs(delta - expectedDelta),
    };
  }).sort((left, right) => left.error - right.error);
}

function attrHintQuality(error) {
  const value = finiteNumber(error);
  if (value === null) return "unknown";
  if (value <= 0.00001) return "exact";
  if (value <= 0.001) return "strong";
  if (value <= 0.01) return "close";
  if (value <= 0.025) return "loose";
  return "weak";
}

function attrHintQualityRank(quality) {
  switch (quality) {
    case "exact":
      return 0;
    case "strong":
      return 1;
    case "close":
      return 2;
    case "loose":
      return 3;
    case "weak":
      return 4;
    default:
      return 5;
  }
}

function normalizedAttrValueCandidates({ attrId, source, activeRaw, inactiveRaw, expectedValue }) {
  const candidates = [];
  for (const normalizer of ATTR_NORMALIZERS) {
    const normalizedValue = activeRaw / normalizer.divisor;
    const activeError = Math.abs(normalizedValue - expectedValue);
    candidates.push({
      comparison: "active-value",
      source,
      attrId: Number(attrId),
      label: attrLabel(attrId),
      activeRaw,
      inactiveRaw,
      rawValue: activeRaw,
      rawDelta: inactiveRaw === null ? null : activeRaw - inactiveRaw,
      normalizer: normalizer.key,
      normalizedValue,
      normalizedDelta: null,
      error: activeError,
      quality: attrHintQuality(activeError),
    });
    if (inactiveRaw !== null) {
      const normalizedDelta = (activeRaw - inactiveRaw) / normalizer.divisor;
      const deltaError = Math.abs(normalizedDelta - expectedValue);
      candidates.push({
        comparison: "active-minus-inactive",
        source,
        attrId: Number(attrId),
        label: attrLabel(attrId),
        activeRaw,
        inactiveRaw,
        rawValue: activeRaw,
        rawDelta: activeRaw - inactiveRaw,
        normalizer: normalizer.key,
        normalizedValue: null,
        normalizedDelta,
        error: deltaError,
        quality: attrHintQuality(deltaError),
      });
    }
  }
  return candidates;
}

function attrValueHintCandidates(expectedValue, activeStats, inactiveStats, limit = SEASONAL_FACTOR_HINT_LIMIT) {
  const expected = finiteNumber(expectedValue);
  if (expected === null) return [];
  const candidates = [];
  for (const source of ["attacker", "target"]) {
    const activeTotals = attrTotalsForSource(activeStats, source);
    const inactiveTotals = attrTotalsForSource(inactiveStats, source);
    const attrIds = new Set([...activeTotals.keys(), ...inactiveTotals.keys()]);
    for (const attrId of attrIds) {
      const activeRaw = averageAttr(activeTotals, attrId);
      const inactiveRaw = averageAttr(inactiveTotals, attrId);
      if (activeRaw === null) continue;
      candidates.push(
        ...normalizedAttrValueCandidates({
          attrId,
          source,
          activeRaw,
          inactiveRaw,
          expectedValue: expected,
        }),
      );
    }
  }

  const sorted = candidates
    .filter((candidate) => Number.isFinite(candidate.error))
    .sort((left, right) => {
      const qualityDelta = attrHintQualityRank(left.quality) - attrHintQualityRank(right.quality);
      if (qualityDelta !== 0) return qualityDelta;
      if (left.error !== right.error) return left.error - right.error;
      const comparisonDelta =
        (left.comparison === "active-minus-inactive" ? 0 : 1) -
        (right.comparison === "active-minus-inactive" ? 0 : 1);
      if (comparisonDelta !== 0) return comparisonDelta;
      return `${left.source}:${left.attrId}:${left.normalizer}`.localeCompare(
        `${right.source}:${right.attrId}:${right.normalizer}`,
      );
    });
  return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
}

function seasonalFactorBridgeSnapshots(expectedValue, activeStats, inactiveStats) {
  const expected = finiteNumber(expectedValue);
  if (expected === null) return [];
  const rows = [];
  for (const bridge of SEASONAL_FACTOR_BRIDGE_ATTRS) {
    const activeTotals = attrTotalsForSource(activeStats, bridge.source);
    const inactiveTotals = attrTotalsForSource(inactiveStats, bridge.source);
    const activeRaw = averageAttr(activeTotals, bridge.attrId);
    if (activeRaw === null) continue;
    const inactiveRaw = averageAttr(inactiveTotals, bridge.attrId);
    const activeNormalized = activeRaw / bridge.divisor;
    const activeError = Math.abs(activeNormalized - expected);
    const row = {
      source: bridge.source,
      attrId: bridge.attrId,
      label: attrLabel(bridge.attrId),
      normalizer: bridge.normalizer,
      activeRaw,
      inactiveRaw,
      activeNormalized,
      activeError,
      activeQuality: attrHintQuality(activeError),
      deltaNormalized: null,
      deltaError: null,
      deltaQuality: null,
    };
    if (inactiveRaw !== null) {
      row.deltaNormalized = (activeRaw - inactiveRaw) / bridge.divisor;
      row.deltaError = Math.abs(row.deltaNormalized - expected);
      row.deltaQuality = attrHintQuality(row.deltaError);
    }
    rows.push(row);
  }
  return rows;
}

function expectedAttrSnapshotState(row, activeStats, inactiveStats) {
  if (row.modelId === MODEL_SEASONAL_FACTOR) {
    return { snapshot: null, missingReason: "missing-local-seasonal-factor-snapshot" };
  }

  const attrConfigs = EXPECTED_ATTRS_BY_MODEL.get(row.modelId) ?? [];
  if (attrConfigs.length === 0) {
    return { snapshot: null, missingReason: "missing-expected-attr-config" };
  }

  const candidates = [];
  let missingActive = 0;
  let missingInactive = 0;
  for (const config of attrConfigs) {
    const activeTotals = attrTotalsForSource(activeStats, config.source);
    const inactiveTotals = attrTotalsForSource(inactiveStats, config.source);
    const activeRaw = averageAttr(activeTotals, config.attrId);
    const inactiveRaw = averageAttr(inactiveTotals, config.attrId);
    if (activeRaw === null || inactiveRaw === null) {
      if (activeRaw === null) missingActive += 1;
      if (inactiveRaw === null) missingInactive += 1;
      continue;
    }
    const [best] = normalizedAttrDeltaCandidates({
      attrId: config.attrId,
      source: config.source,
      activeRaw,
      inactiveRaw,
      expectedDelta: row.selectedValue.decimalValue,
    });
    if (best) candidates.push(best);
  }
  candidates.sort((left, right) => left.error - right.error);
  if (candidates[0]) return { snapshot: candidates[0], missingReason: null };
  if (inactiveStats.hits <= 0) return { snapshot: null, missingReason: "missing-inactive-baseline" };
  if (missingActive > 0 && missingInactive > 0) {
    return { snapshot: null, missingReason: "missing-expected-attr-active-and-inactive" };
  }
  if (missingActive > 0) return { snapshot: null, missingReason: "missing-expected-attr-active" };
  if (missingInactive > 0) return { snapshot: null, missingReason: "missing-expected-attr-inactive" };
  return { snapshot: null, missingReason: "missing-expected-attr-baseline" };
}

function attrSnapshotCandidates(row, activeStats, inactiveStats, limit = 5) {
  const candidates = [];
  for (const source of ["attacker", "target"]) {
    const activeTotals = attrTotalsForSource(activeStats, source);
    const inactiveTotals = attrTotalsForSource(inactiveStats, source);
    const attrIds = new Set([...activeTotals.keys(), ...inactiveTotals.keys()]);
    for (const attrId of attrIds) {
      const activeRaw = averageAttr(activeTotals, attrId);
      const inactiveRaw = averageAttr(inactiveTotals, attrId);
      if (activeRaw === null || inactiveRaw === null) continue;
      candidates.push(
        ...normalizedAttrDeltaCandidates({
          attrId,
          source,
          activeRaw,
          inactiveRaw,
          expectedDelta: row.selectedValue.decimalValue,
        }),
      );
    }
  }

  return candidates
    .filter((candidate) => Number.isFinite(candidate.normalizedDelta) && Number.isFinite(candidate.error))
    .sort((left, right) => left.error - right.error)
    .slice(0, limit);
}

function evaluateSnapshotStatus({ row, snapshot, missingReason, options }) {
  const maxError = row.validationPolicy?.maxAbsoluteChanceError ?? options.chanceErrorLimit;
  if (!snapshot) return missingReason ?? "missing-expected-attr-baseline";
  return snapshot.error <= maxError ? "expected-attr-delta-matches" : "expected-attr-delta-mismatch";
}

function expectedAddedDamage(row, activeStats) {
  if (row.modelId === MODEL_CRITICAL_EXPECTED) {
    const multiplier = averageCritMultiplier(activeStats);
    if (multiplier === null) return null;
    return activeStats.totalValue * row.selectedValue.decimalValue * Math.max(0, multiplier - 1);
  }
  if (row.modelId === MODEL_LUCKY_EXPECTED) {
    const chance = row.selectedValue.decimalValue;
    const luckyMultiplier = chance * (0.4 + 0.25 * chance) * (1 + chance);
    return activeStats.totalValue * luckyMultiplier;
  }
  return null;
}

function evaluateStatus({ active, inactive, observedRateDelta, chanceError, row, options }) {
  const minHits = row.validationPolicy?.minEligibleHits ?? options.minEligibleHits;
  const maxError = row.validationPolicy?.maxAbsoluteChanceError ?? options.chanceErrorLimit;
  if (row.modelId === MODEL_SEASONAL_FACTOR) {
    if (active.hits < minHits) return "insufficient-active-hits";
    return inactive.hits > 0 ? "source-observed-baseline-present" : "source-observed-no-inactive-baseline";
  }
  if (active.hits < minHits) return "insufficient-active-hits";
  if (inactive.hits < minHits) return "insufficient-inactive-baseline";
  if (observedRateDelta === null || chanceError === null) return "missing-rate-delta";
  return chanceError <= maxError ? "observed-delta-matches" : "observed-delta-mismatch";
}

function buildRowsBySourceId(expectedRows) {
  const rowsBySourceId = new Map();
  for (const row of expectedRows) {
    for (const sourceId of row.sourceIds) {
      const list = rowsBySourceId.get(sourceId) ?? [];
      list.push(row);
      rowsBySourceId.set(sourceId, list);
    }
  }
  return rowsBySourceId;
}

function uniqueSeasonalFactorRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    if (row.modelId !== MODEL_SEASONAL_FACTOR) continue;
    const value = positiveNumber(row.selectedValue?.decimalValue);
    if (value === null) continue;
    const key = `${row.entryKey}:${value}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()].sort((left, right) => left.entryKey.localeCompare(right.entryKey));
}

function seasonalFactorSetKey(rows, laneKey) {
  return `${rows.map((row) => `${row.entryKey}@${row.selectedValue.decimalValue}`).join("+")}::${laneKey}`;
}

function buildFileReport(filePath, expectedRows, rowsBySourceId, modifierMetadataById, options) {
  const entity = readJson(filePath);
  const laneStats = new Map();
  const activeLaneStats = new Map();
  const seasonalFactorSetStats = new Map();
  const seasonalRawModifierEvidence = new Map();
  const attackerAttrCounts = new Map();
  const targetAttrCounts = new Map();
  const trackedAttrIds = coverageAttrIds();
  let replayHits = 0;
  let damageHits = 0;
  let activeExpectedObservations = 0;

  for (const hit of asArray(entity.modifierReplayHits)) {
    replayHits += 1;
    if (hit.isHeal || hitValue(hit) <= 0) continue;
    damageHits += 1;
    incrementAttrCounts(attackerAttrCounts, hit.attackerAttrs);
    incrementAttrCounts(targetAttrCounts, hit.targetAttrs);

    const laneKey = hitLaneKey(hit);
    let lane = laneStats.get(laneKey);
    if (!lane) {
      lane = cloneEmptyWithLane(hit);
      laneStats.set(laneKey, lane);
    }
    addHit(lane, hit);

    const activeRows = activeSourceRowsForHit(hit, rowsBySourceId);
    activeExpectedObservations += activeRows.length;
    const seasonalRows = uniqueSeasonalFactorRows(activeRows);
    if (seasonalRows.length > 0) {
      const expectedTotal = seasonalRows.reduce((sum, row) => sum + (positiveNumber(row.selectedValue.decimalValue) ?? 0), 0);
      const setKey = seasonalFactorSetKey(seasonalRows, laneKey);
      let seasonalSet = seasonalFactorSetStats.get(setKey);
      if (!seasonalSet) {
        seasonalSet = {
          sourceLabels: uniqueSortedStrings(seasonalRows.map((row) => row.sourceLabel)),
          entryKeys: uniqueSortedStrings(seasonalRows.map((row) => row.entryKey)),
          sourceIds: uniqueSortedStrings(seasonalRows.flatMap((row) => row.sourceIds)),
          expectedTotal,
          laneKey,
          stats: cloneEmptyWithLane(hit),
          packetModifierEvidence: new Map(),
        };
        seasonalFactorSetStats.set(setKey, seasonalSet);
      }
      addHit(seasonalSet.stats, hit);
      addPacketModifierEvidence(seasonalSet.packetModifierEvidence, hit, seasonalRows);
      addSeasonalRawModifierEvidence(seasonalRawModifierEvidence, hit, seasonalRows, expectedTotal);
    }
    for (const row of activeRows) {
      const activeKey = `${row.key}::${laneKey}`;
      let active = activeLaneStats.get(activeKey);
      if (!active) {
        active = {
          row,
          laneKey,
          stats: cloneEmptyWithLane(hit),
        };
        activeLaneStats.set(activeKey, active);
      }
      addHit(active.stats, hit);
    }
  }

  const rows = [];
  for (const active of activeLaneStats.values()) {
    const laneTotal = laneStats.get(active.laneKey);
    if (!laneTotal) continue;
    const inactive = subtractStats(laneTotal, active.stats);
    const activeRate = rate(active.stats, active.row.modelId);
    const inactiveRate = rate(inactive, active.row.modelId);
    const observedRateDelta = activeRate !== null && inactiveRate !== null ? activeRate - inactiveRate : null;
    const chanceError =
      observedRateDelta === null ? null : Math.abs(observedRateDelta - active.row.selectedValue.decimalValue);
    const expectedSnapshotState = expectedAttrSnapshotState(active.row, active.stats, inactive);
    const expectedSnapshot = expectedSnapshotState.snapshot;
    const snapshotCandidates = attrSnapshotCandidates(active.row, active.stats, inactive);
    const seasonalFactorAttrCandidates =
      active.row.modelId === MODEL_SEASONAL_FACTOR
        ? attrValueHintCandidates(active.row.selectedValue.decimalValue, active.stats, inactive)
        : [];
    const snapshotStatus = evaluateSnapshotStatus({
      row: active.row,
      snapshot: expectedSnapshot,
      missingReason: expectedSnapshotState.missingReason,
      options,
    });
    const status = evaluateStatus({
      active: active.stats,
      inactive,
      observedRateDelta,
      chanceError,
      row: active.row,
      options,
    });

    rows.push({
      file: compactPath(filePath),
      entityUid: entity.uid ?? null,
      entityName: entity.name ?? null,
      entryKey: active.row.entryKey,
      uid: active.row.uid,
      category: active.row.category,
      runtimeKind: active.row.runtimeKind,
      sourceLabel: active.row.sourceLabel,
      modelId: active.row.modelId,
      componentKey: active.row.componentKey,
      sourceIds: active.row.sourceIds,
      sourceRuleIds: active.row.sourceRuleIds,
      selectedValue: active.row.selectedValue,
      expectedRateDelta: active.row.selectedValue.decimalValue,
      activeHits: active.stats.hits,
      inactiveHits: inactive.hits,
      activeValue: active.stats.totalValue,
      inactiveValue: inactive.totalValue,
      activeRate,
      inactiveRate,
      observedRateDelta,
      chanceError,
      expectedAttrSnapshot: expectedSnapshot,
      expectedAttrSnapshotMissingReason: expectedSnapshotState.missingReason,
      bestAttrSnapshotCandidate: snapshotCandidates[0] ?? null,
      attrSnapshotCandidates: snapshotCandidates,
      bestSeasonalFactorAttrHint: seasonalFactorAttrCandidates[0] ?? null,
      seasonalFactorAttrHints: seasonalFactorAttrCandidates,
      snapshotStatus,
      snapshotChanceError: expectedSnapshot?.error ?? null,
      activeCritMultiplier: averageCritMultiplier(active.stats),
      expectedAddedDamageEstimate: expectedAddedDamage(active.row, active.stats),
      status,
      lane: {
        damageId: active.stats.damageId,
        property: active.stats.property,
        damageMode: active.stats.damageMode,
        attackerUid: active.stats.attackerUid,
        targetUid: active.stats.targetUid,
        targetMonsterTypeId: active.stats.targetMonsterTypeId,
      },
    });
  }

  rows.sort((left, right) => {
    const snapshotDelta = snapshotStatusRank(left.snapshotStatus) - snapshotStatusRank(right.snapshotStatus);
    if (snapshotDelta !== 0) return snapshotDelta;
    const statusDelta = statusRank(left.status) - statusRank(right.status);
    if (statusDelta !== 0) return statusDelta;
    return right.activeValue - left.activeValue || right.activeHits - left.activeHits;
  });

  const seasonalFactorPacketHints = [...seasonalFactorSetStats.values()]
    .map((set) => {
      const laneTotal = laneStats.get(set.laneKey);
      const inactive = laneTotal ? subtractStats(laneTotal, set.stats) : emptyStats();
      const candidates = attrValueHintCandidates(set.expectedTotal, set.stats, inactive);
      const allAttrSnapshots = attrValueHintCandidates(set.expectedTotal, set.stats, inactive, Number.POSITIVE_INFINITY);
      const bridgeAttrSnapshots = seasonalFactorBridgeSnapshots(set.expectedTotal, set.stats, inactive);
      return {
        file: compactPath(filePath),
        sourceLabels: set.sourceLabels,
        entryKeys: set.entryKeys,
        sourceIds: set.sourceIds,
        expectedTotal: set.expectedTotal,
        activeHits: set.stats.hits,
        inactiveHits: inactive.hits,
        activeValue: set.stats.totalValue,
        inactiveValue: inactive.totalValue,
        packetModifierEvidence: packetModifierEvidenceRows(set.packetModifierEvidence),
        bestAttrHint: candidates[0] ?? null,
        attrHints: candidates,
        allAttrSnapshots,
        bridgeAttrSnapshots,
        lane: {
          damageId: set.stats.damageId,
          property: set.stats.property,
          damageMode: set.stats.damageMode,
          attackerUid: set.stats.attackerUid,
          targetUid: set.stats.targetUid,
          targetMonsterTypeId: set.stats.targetMonsterTypeId,
        },
      };
    })
    .sort((left, right) => {
      const qualityDelta =
        attrHintQualityRank(left.bestAttrHint?.quality) - attrHintQualityRank(right.bestAttrHint?.quality);
      if (qualityDelta !== 0) return qualityDelta;
      const errorDelta = (left.bestAttrHint?.error ?? Number.POSITIVE_INFINITY) - (right.bestAttrHint?.error ?? Number.POSITIVE_INFINITY);
      if (errorDelta !== 0) return errorDelta;
      return right.activeValue - left.activeValue || right.activeHits - left.activeHits;
    });

  return {
    file: compactPath(filePath),
    entityUid: entity.uid ?? null,
    entityName: entity.name ?? null,
    replayHits,
    damageHits,
    laneCount: laneStats.size,
    attackerAttrCoverage: attrCoverageSummary(attackerAttrCounts, damageHits, trackedAttrIds),
    targetAttrCoverage: attrCoverageSummary(targetAttrCounts, damageHits, trackedAttrIds),
    activeExpectedObservations,
    evaluatedRows: rows.length,
    seasonalFactorPacketHints,
    seasonalRawModifierEvidence: seasonalRawModifierEvidenceRows(
      seasonalRawModifierEvidence,
      modifierMetadataById,
      compactPath(filePath),
    ),
    rows,
  };
}

function statusRank(status) {
  switch (status) {
    case "observed-delta-matches":
      return 0;
    case "observed-delta-mismatch":
      return 1;
    case "source-observed-baseline-present":
      return 2;
    case "source-observed-no-inactive-baseline":
      return 3;
    case "insufficient-inactive-baseline":
      return 3;
    case "insufficient-active-hits":
      return 4;
    default:
      return 5;
  }
}

function snapshotStatusRank(status) {
  switch (status) {
    case "expected-attr-delta-matches":
      return 0;
    case "expected-attr-delta-mismatch":
      return 1;
    case "missing-expected-attr-inactive":
    case "missing-expected-attr-active":
    case "missing-expected-attr-active-and-inactive":
      return 2;
    case "missing-inactive-baseline":
      return 3;
    case "missing-local-seasonal-factor-snapshot":
      return 4;
    case "missing-expected-attr-baseline":
    case "missing-expected-attr-config":
      return 5;
    default:
      return 6;
  }
}

function attrCoverageSummary(counts, totalHits, attrIds) {
  return attrIds.map((attrId) => {
    const hits = counts.get(String(attrId)) ?? 0;
    return {
      attrId,
      label: attrLabel(attrId),
      hits,
      hitPct: totalHits > 0 ? hits / totalHits : null,
    };
  });
}

function incrementAttrCounts(counts, attrs) {
  const seen = new Set();
  for (const attr of asArray(attrs)) {
    const attrId = finiteNumber(attr.attrId);
    if (attrId === null) continue;
    seen.add(String(Math.trunc(attrId)));
  }
  for (const attrId of seen) counts.set(attrId, (counts.get(attrId) ?? 0) + 1);
}

function formatCoverageEntry(entries, attrId) {
  const entry = entries.find((item) => Number(item.attrId) === Number(attrId));
  if (!entry) return "-";
  return `${formatNumber(entry.hits)} (${formatPercent(entry.hitPct)})`;
}

function expectedModelAttrIds() {
  return uniqueSortedStrings([...EXPECTED_ATTRS_BY_MODEL.values()].flatMap((entries) => entries.map((entry) => entry.attrId))).map(Number);
}

function coverageAttrIds() {
  return uniqueSortedStrings([
    51,
    ...expectedModelAttrIds(),
    ATTR_CRIT_MULTIPLIER,
    ATTR_SEASON_STRENGTH,
    12510,
    12530,
    11720,
    11930,
    11940,
    11950,
    11960,
  ]).map(Number);
}

function summarize(files, expectedRows) {
  const statusCounts = new Map();
  const snapshotStatusCounts = new Map();
  const expectedAttrCounts = new Map();
  const bestAttrCandidateCounts = new Map();
  const seasonalFactorHintCounts = new Map();
  const seasonalFactorHintQualityCounts = new Map();
  const seasonalRawModifierStatusCounts = new Map();
  const modelCounts = new Map();
  const categoryCounts = new Map();
  let replayHits = 0;
  let damageHits = 0;
  let activeExpectedObservations = 0;
  let evaluatedRows = 0;

  for (const row of expectedRows) {
    incrementMap(modelCounts, row.modelId);
    incrementMap(categoryCounts, row.category);
  }

  for (const file of files) {
    replayHits += file.replayHits;
    damageHits += file.damageHits;
    activeExpectedObservations += file.activeExpectedObservations;
    evaluatedRows += file.evaluatedRows;
    for (const row of file.rows) {
      incrementMap(statusCounts, row.status);
      incrementMap(snapshotStatusCounts, row.snapshotStatus);
      if (row.expectedAttrSnapshot) {
        incrementMap(
          expectedAttrCounts,
          `${row.expectedAttrSnapshot.source}:${row.expectedAttrSnapshot.attrId}:${row.expectedAttrSnapshot.normalizer}`,
        );
      }
      if (row.bestAttrSnapshotCandidate) {
        incrementMap(
          bestAttrCandidateCounts,
          `${row.bestAttrSnapshotCandidate.source}:${row.bestAttrSnapshotCandidate.attrId}:${row.bestAttrSnapshotCandidate.normalizer}`,
        );
      }
      if (row.bestSeasonalFactorAttrHint) {
        incrementMap(seasonalFactorHintQualityCounts, row.bestSeasonalFactorAttrHint.quality);
      }
    }
    for (const hint of file.seasonalFactorPacketHints) {
      if (!hint.bestAttrHint) continue;
      incrementMap(seasonalFactorHintQualityCounts, `set:${hint.bestAttrHint.quality}`);
      incrementMap(
        seasonalFactorHintCounts,
        `${hint.bestAttrHint.comparison}:${hint.bestAttrHint.source}:${hint.bestAttrHint.attrId}:${hint.bestAttrHint.normalizer}:${hint.bestAttrHint.quality}`,
      );
    }
    for (const row of file.seasonalRawModifierEvidence ?? []) {
      const statuses = asArray(row.valueProofStatuses);
      if (statuses.length === 0) {
        incrementMap(seasonalRawModifierStatusCounts, "unmapped");
      } else {
        for (const status of statuses) incrementMap(seasonalRawModifierStatusCounts, status);
      }
    }
  }

  return {
    files: files.length,
    replayHits,
    damageHits,
    expectedRows: expectedRows.length,
    activeExpectedObservations,
    evaluatedRows,
    statusCounts: countMapToObject(statusCounts, 20),
    snapshotStatusCounts: countMapToObject(snapshotStatusCounts, 20),
    expectedAttrSnapshotCounts: countMapToObject(expectedAttrCounts, 20),
    bestAttrSnapshotCandidateCounts: countMapToObject(bestAttrCandidateCounts, 20),
    seasonalFactorAttrHintCounts: countMapToObject(seasonalFactorHintCounts, 20),
    seasonalFactorAttrHintQualityCounts: countMapToObject(seasonalFactorHintQualityCounts, 20),
    seasonalRawModifierStatusCounts: countMapToObject(seasonalRawModifierStatusCounts, 20),
    expectedRowsByModel: countMapToObject(modelCounts, 20),
    expectedRowsByCategory: countMapToObject(categoryCounts, 20),
  };
}

function topRows(files, options) {
  return files
    .flatMap((file) => file.rows)
    .sort((left, right) => {
      const snapshotDelta = snapshotStatusRank(left.snapshotStatus) - snapshotStatusRank(right.snapshotStatus);
      if (snapshotDelta !== 0) return snapshotDelta;
      const statusDelta = statusRank(left.status) - statusRank(right.status);
      if (statusDelta !== 0) return statusDelta;
      return right.activeValue - left.activeValue || right.activeHits - left.activeHits;
    })
    .slice(0, options.maxRows);
}

function writeJsonReport(filePath, report) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function seasonalFactorPacketHintRows(files, options) {
  return files
    .flatMap((file) => file.seasonalFactorPacketHints ?? [])
    .sort((left, right) => {
      const qualityDelta =
        attrHintQualityRank(left.bestAttrHint?.quality) - attrHintQualityRank(right.bestAttrHint?.quality);
      if (qualityDelta !== 0) return qualityDelta;
      const errorDelta = (left.bestAttrHint?.error ?? Number.POSITIVE_INFINITY) - (right.bestAttrHint?.error ?? Number.POSITIVE_INFINITY);
      if (errorDelta !== 0) return errorDelta;
      return right.activeValue - left.activeValue || right.activeHits - left.activeHits;
    })
    .slice(0, options.maxRows);
}

function aggregateSeasonalRawModifierRows(files, options) {
  const rowsById = new Map();
  for (const row of files.flatMap((file) => file.seasonalRawModifierEvidence ?? [])) {
    let aggregate = rowsById.get(row.rawId);
    if (!aggregate) {
      aggregate = {
        rawId: row.rawId,
        labels: new Set(),
        entryKeys: new Set(),
        categories: new Set(),
        runtimeKinds: new Set(),
        valueProofStatuses: new Set(),
        formulaZoneIds: new Set(),
        selectedValues: new Set(),
        candidateValues: new Set(),
        candidateValueRows: new Map(),
        valueBlockers: new Set(),
        files: new Set(),
        factorSets: new Set(),
        expectedGroups: new Map(),
        roles: new Map(),
        pairs: new Map(),
        levels: new Map(),
        counts: new Map(),
        layers: new Map(),
        hosts: new Map(),
        sources: new Map(),
        damageIds: new Map(),
        targetMonsterTypeIds: new Map(),
        hits: 0,
        activeValue: 0,
      };
      rowsById.set(row.rawId, aggregate);
    }

    for (const value of asArray(row.labels)) addString(aggregate.labels, value);
    for (const value of asArray(row.entryKeys)) addString(aggregate.entryKeys, value);
    for (const value of asArray(row.categories)) addString(aggregate.categories, value);
    for (const value of asArray(row.runtimeKinds)) addString(aggregate.runtimeKinds, value);
    for (const value of asArray(row.valueProofStatuses)) addString(aggregate.valueProofStatuses, value);
    for (const value of asArray(row.formulaZoneIds)) addString(aggregate.formulaZoneIds, value);
    for (const value of asArray(row.selectedValues)) addString(aggregate.selectedValues, value);
    for (const value of asArray(row.candidateValues)) addString(aggregate.candidateValues, value);
    for (const candidate of asArray(row.candidateValueRows)) {
      const decimalValue = finiteNumber(candidate.decimalValue);
      if (decimalValue === null) continue;
      const key = [
        candidate.componentKey ?? "unknown",
        decimalValue,
        candidate.rawText ?? candidate.value ?? "",
        candidate.grade ?? "",
        candidate.selectorKind ?? "",
        candidate.selectorStatus ?? "",
      ].join("|");
      if (!aggregate.candidateValueRows.has(key)) aggregate.candidateValueRows.set(key, candidate);
    }
    for (const value of asArray(row.valueBlockers)) addString(aggregate.valueBlockers, value);
    aggregate.files.add(row.file);
    for (const value of asArray(row.factorSets)) addString(aggregate.factorSets, value);
    aggregate.hits += finiteNumber(row.hits) ?? 0;
    aggregate.activeValue += finiteNumber(row.activeValue) ?? 0;

    for (const [key, value] of Object.entries(asObject(row.roles))) incrementMap(aggregate.roles, key, value);
    for (const [key, value] of Object.entries(asObject(row.pairs))) incrementMap(aggregate.pairs, key, value);
    for (const [key, value] of Object.entries(asObject(row.levels))) incrementMap(aggregate.levels, key, value);
    for (const [key, value] of Object.entries(asObject(row.counts))) incrementMap(aggregate.counts, key, value);
    for (const [key, value] of Object.entries(asObject(row.layers))) incrementMap(aggregate.layers, key, value);
    for (const [key, value] of Object.entries(asObject(row.hosts))) incrementMap(aggregate.hosts, key, value);
    for (const [key, value] of Object.entries(asObject(row.sources))) incrementMap(aggregate.sources, key, value);
    for (const [key, value] of Object.entries(asObject(row.damageIds))) incrementMap(aggregate.damageIds, key, value);
    for (const [key, value] of Object.entries(asObject(row.targetMonsterTypeIds))) {
      incrementMap(aggregate.targetMonsterTypeIds, key, value);
    }

    for (const group of asArray(row.expectedGroups)) {
      const expected = finiteNumber(group.expected);
      if (expected === null) continue;
      const expectedKey = expected.toFixed(6);
      let aggregateGroup = aggregate.expectedGroups.get(expectedKey);
      if (!aggregateGroup) {
        aggregateGroup = {
          expected,
          factorSets: new Set(),
          files: new Set(),
          hits: 0,
          activeValue: 0,
        };
        aggregate.expectedGroups.set(expectedKey, aggregateGroup);
      }
      for (const value of asArray(group.factorSets)) addString(aggregateGroup.factorSets, value);
      aggregateGroup.files.add(row.file);
      aggregateGroup.hits += finiteNumber(group.hits) ?? 0;
      aggregateGroup.activeValue += finiteNumber(group.activeValue) ?? 0;
    }
  }

  return [...rowsById.values()]
    .map((row) => ({
      rawId: row.rawId,
      labels: [...row.labels].sort((left, right) => left.localeCompare(right)),
      entryKeys: [...row.entryKeys].sort((left, right) => left.localeCompare(right)),
      categories: [...row.categories].sort((left, right) => left.localeCompare(right)),
      runtimeKinds: [...row.runtimeKinds].sort((left, right) => left.localeCompare(right)),
      valueProofStatuses: [...row.valueProofStatuses].sort((left, right) => left.localeCompare(right)),
      formulaZoneIds: [...row.formulaZoneIds].sort((left, right) => left.localeCompare(right)),
      selectedValues: [...row.selectedValues].sort((left, right) => left.localeCompare(right)),
      candidateValues: [...row.candidateValues].sort((left, right) => left.localeCompare(right)),
      candidateValueRows: [...row.candidateValueRows.values()].sort((left, right) => {
        const componentDelta = String(left.componentKey).localeCompare(String(right.componentKey));
        if (componentDelta !== 0) return componentDelta;
        return left.decimalValue - right.decimalValue;
      }),
      valueBlockers: [...row.valueBlockers].sort((left, right) => left.localeCompare(right)),
      files: [...row.files].sort((left, right) => left.localeCompare(right)),
      factorSets: [...row.factorSets].sort((left, right) => left.localeCompare(right)),
      expectedGroups: [...row.expectedGroups.values()]
        .map((group) => ({
          expected: group.expected,
          factorSets: [...group.factorSets].sort((left, right) => left.localeCompare(right)),
          files: [...group.files].sort((left, right) => left.localeCompare(right)),
          hits: group.hits,
          activeValue: group.activeValue,
        }))
        .sort((left, right) => left.expected - right.expected),
      roles: countMapToObject(row.roles, 8),
      pairs: countMapToObject(row.pairs, 8),
      levels: countMapToObject(row.levels, 8),
      counts: countMapToObject(row.counts, 8),
      layers: countMapToObject(row.layers, 8),
      hosts: countMapToObject(row.hosts, 8),
      sources: countMapToObject(row.sources, 8),
      damageIds: countMapToObject(row.damageIds, 8),
      targetMonsterTypeIds: countMapToObject(row.targetMonsterTypeIds, 8),
      hits: row.hits,
      activeValue: row.activeValue,
    }))
    .sort((left, right) => {
      const statusDelta =
        (left.valueProofStatuses.includes("value-ready") ? 1 : 0) -
        (right.valueProofStatuses.includes("value-ready") ? 1 : 0);
      if (statusDelta !== 0) return statusDelta;
      return right.hits - left.hits || Number(left.rawId) - Number(right.rawId);
    })
    .slice(0, options.maxRows);
}

function seasonalFactorValueReconciliationVerdict(row) {
  if (row.matchedExpected === null) return "no-existing-total";
  const error = finiteNumber(row.error);
  if (error === null) return "no-existing-total";
  if (error <= 0.001 && Math.abs(row.matchedExpected - row.baseExpected) > 0.0005) {
    return "candidate-bridges-existing-total";
  }
  if (error <= 0.005 && Math.abs(row.matchedExpected - row.baseExpected) > 0.0005) {
    return "candidate-close-to-existing-total";
  }
  return "candidate-unresolved";
}

function seasonalFactorValueReconciliationRank(verdict) {
  switch (verdict) {
    case "candidate-bridges-existing-total":
      return 0;
    case "candidate-close-to-existing-total":
      return 1;
    case "candidate-unresolved":
      return 2;
    default:
      return 3;
  }
}

function seasonalFactorValueReconciliationRows(rawRows, options) {
  const expectedTotals = new Map();
  for (const row of rawRows) {
    for (const group of asArray(row.expectedGroups)) {
      const expected = finiteNumber(group.expected);
      if (expected === null) continue;
      const key = expected.toFixed(6);
      let aggregate = expectedTotals.get(key);
      if (!aggregate) {
        aggregate = {
          expected,
          files: new Set(),
          factorSets: new Set(),
          hits: 0,
          activeValue: 0,
        };
        expectedTotals.set(key, aggregate);
      }
      for (const file of asArray(group.files)) addString(aggregate.files, file);
      for (const factorSet of asArray(group.factorSets)) addString(aggregate.factorSets, factorSet);
      aggregate.hits += finiteNumber(group.hits) ?? 0;
      aggregate.activeValue += finiteNumber(group.activeValue) ?? 0;
    }
  }

  const totals = [...expectedTotals.values()].map((row) => ({
    ...row,
    files: [...row.files].sort((left, right) => left.localeCompare(right)),
    factorSets: [...row.factorSets].sort((left, right) => left.localeCompare(right)),
  }));
  const bestByRawAndBase = new Map();

  for (const row of rawRows) {
    const needsRuntimeValueSelection =
      asArray(row.valueProofStatuses).includes("needs-value-selection") ||
      asArray(row.valueBlockers).some((blocker) => String(blocker).includes("value-ladder-selection-required"));
    if (!needsRuntimeValueSelection) continue;

    for (const group of asArray(row.expectedGroups)) {
      const baseExpected = finiteNumber(group.expected);
      if (baseExpected === null) continue;

      for (const candidate of asArray(row.candidateValueRows)) {
        if (!SEASONAL_FACTOR_COMPONENT_KEYS.has(candidate.componentKey)) continue;
        const candidateValue = finiteNumber(candidate.decimalValue);
        if (candidateValue === null) continue;

        const adjustedExpected = baseExpected + candidateValue;
        let matchedTotal = null;
        let error = Number.POSITIVE_INFINITY;
        for (const total of totals) {
          const candidateError = Math.abs(total.expected - adjustedExpected);
          if (candidateError < error) {
            matchedTotal = total;
            error = candidateError;
          }
        }

        const candidateRow = {
          rawId: row.rawId,
          labels: row.labels,
          valueProofStatuses: row.valueProofStatuses,
          candidate,
          baseExpected,
          adjustedExpected,
          matchedExpected: matchedTotal?.expected ?? null,
          error: Number.isFinite(error) ? error : null,
          files: asArray(group.files),
          matchedFiles: matchedTotal?.files ?? [],
          baseFactorSets: asArray(group.factorSets),
          matchedFactorSets: matchedTotal?.factorSets ?? [],
          valueBlockers: row.valueBlockers,
          hits: group.hits,
          activeValue: group.activeValue,
        };
        candidateRow.verdict = seasonalFactorValueReconciliationVerdict(candidateRow);

        const key = `${row.rawId}|${baseExpected.toFixed(6)}|${candidate.componentKey}`;
        const previous = bestByRawAndBase.get(key);
        if (
          !previous ||
          seasonalFactorValueReconciliationRank(candidateRow.verdict) <
            seasonalFactorValueReconciliationRank(previous.verdict) ||
          ((candidateRow.error ?? Number.POSITIVE_INFINITY) < (previous.error ?? Number.POSITIVE_INFINITY) &&
            seasonalFactorValueReconciliationRank(candidateRow.verdict) ===
              seasonalFactorValueReconciliationRank(previous.verdict))
        ) {
          bestByRawAndBase.set(key, candidateRow);
        }
      }
    }
  }

  return [...bestByRawAndBase.values()]
    .sort((left, right) => {
      const verdictDelta =
        seasonalFactorValueReconciliationRank(left.verdict) - seasonalFactorValueReconciliationRank(right.verdict);
      if (verdictDelta !== 0) return verdictDelta;
      const errorDelta = (left.error ?? Number.POSITIVE_INFINITY) - (right.error ?? Number.POSITIVE_INFINITY);
      if (errorDelta !== 0) return errorDelta;
      return Number(left.rawId) - Number(right.rawId);
    })
    .slice(0, options.maxRows);
}

function addNumberRange(row, field, value) {
  const number = finiteNumber(value);
  if (number === null) return;
  const minKey = `${field}Min`;
  const maxKey = `${field}Max`;
  row[minKey] =
    row[minKey] === null || row[minKey] === undefined || !Number.isFinite(row[minKey])
      ? number
      : Math.min(row[minKey], number);
  row[maxKey] =
    row[maxKey] === null || row[maxKey] === undefined || !Number.isFinite(row[maxKey])
      ? number
      : Math.max(row[maxKey], number);
}

function seasonalFactorBridgeRows(files, options) {
  const rowsByKey = new Map();
  for (const hint of files.flatMap((file) => file.seasonalFactorPacketHints ?? [])) {
    const factorSet = hint.entryKeys.join(" + ");
    const expectedKey = finiteNumber(hint.expectedTotal)?.toFixed(6) ?? String(hint.expectedTotal);
    for (const snapshot of asArray(hint.bridgeAttrSnapshots)) {
      const key = `${factorSet}::${snapshot.source}:${snapshot.attrId}:${snapshot.normalizer}`;
      let row = rowsByKey.get(key);
      if (!row) {
        row = {
          factorSet,
          sourceLabels: new Set(),
          source: snapshot.source,
          attrId: snapshot.attrId,
          label: snapshot.label,
          normalizer: snapshot.normalizer,
          files: new Set(),
          expectedTotals: new Set(),
          observations: 0,
          activeHits: 0,
          inactiveHits: 0,
          activeValue: 0,
          activeNormalizedMin: null,
          activeNormalizedMax: null,
          activeErrorSum: 0,
          activeErrorMax: null,
          deltaNormalizedMin: null,
          deltaNormalizedMax: null,
          deltaErrorSum: 0,
          deltaErrorMax: null,
          deltaObservations: 0,
          qualities: new Map(),
          deltaQualities: new Map(),
        };
        rowsByKey.set(key, row);
      }
      for (const sourceLabel of asArray(hint.sourceLabels)) addString(row.sourceLabels, sourceLabel);
      row.files.add(hint.file);
      row.expectedTotals.add(expectedKey);
      row.observations += 1;
      row.activeHits += finiteNumber(hint.activeHits) ?? 0;
      row.inactiveHits += finiteNumber(hint.inactiveHits) ?? 0;
      row.activeValue += finiteNumber(hint.activeValue) ?? 0;
      addNumberRange(row, "activeNormalized", snapshot.activeNormalized);
      row.activeErrorSum += finiteNumber(snapshot.activeError) ?? 0;
      addNumberRange(row, "activeError", snapshot.activeError);
      incrementMap(row.qualities, snapshot.activeQuality ?? "unknown");
      if (snapshot.deltaNormalized !== null && snapshot.deltaError !== null) {
        row.deltaObservations += 1;
        addNumberRange(row, "deltaNormalized", snapshot.deltaNormalized);
        row.deltaErrorSum += snapshot.deltaError;
        addNumberRange(row, "deltaError", snapshot.deltaError);
        incrementMap(row.deltaQualities, snapshot.deltaQuality ?? "unknown");
      }
    }
  }

  return [...rowsByKey.values()]
    .map((row) => ({
      ...row,
      sourceLabels: [...row.sourceLabels].sort((left, right) => left.localeCompare(right)),
      files: [...row.files].sort((left, right) => left.localeCompare(right)),
      expectedTotals: [...row.expectedTotals].sort((left, right) => Number(left) - Number(right)),
      activeErrorAvg: row.observations > 0 ? row.activeErrorSum / row.observations : null,
      deltaErrorAvg: row.deltaObservations > 0 ? row.deltaErrorSum / row.deltaObservations : null,
      qualities: countMapToObject(row.qualities, 8),
      deltaQualities: countMapToObject(row.deltaQualities, 8),
    }))
    .sort((left, right) => {
      const expectedDiversity = right.expectedTotals.length - left.expectedTotals.length;
      if (expectedDiversity !== 0) return expectedDiversity;
      const qualityDelta =
        attrHintQualityRank(Object.keys(left.qualities)[0]) - attrHintQualityRank(Object.keys(right.qualities)[0]);
      if (qualityDelta !== 0) return qualityDelta;
      const errorDelta =
        (left.activeErrorAvg ?? Number.POSITIVE_INFINITY) - (right.activeErrorAvg ?? Number.POSITIVE_INFINITY);
      if (errorDelta !== 0) return errorDelta;
      return right.observations - left.observations || right.activeValue - left.activeValue;
    })
    .slice(0, options.maxRows);
}

function attrMovementObservedValue(snapshot) {
  if (!snapshot) return null;
  return snapshot.comparison === "active-minus-inactive"
    ? finiteNumber(snapshot.normalizedDelta)
    : finiteNumber(snapshot.normalizedValue);
}

function seasonalFactorMovementVerdict(row) {
  if (row.expectedGroups.length < 2 || row.expectedSpan < 0.0005) return "single-expected-total";
  if (row.observedSpan < 0.002 && row.expectedSpan >= 0.01) return "reject-constant";
  if (row.avgError <= 0.025 && row.spanError <= 0.025) return "moves-with-expected";
  if (row.avgError <= 0.05 && row.spanError <= 0.05) return "partial";
  return "mismatch";
}

function seasonalFactorMovementVerdictRank(verdict) {
  switch (verdict) {
    case "moves-with-expected":
      return 0;
    case "partial":
      return 1;
    case "reject-constant":
      return 2;
    case "mismatch":
      return 3;
    case "single-expected-total":
      return 4;
    default:
      return 5;
  }
}

function seasonalFactorAttrMovementRows(files, options) {
  const rowsByKey = new Map();
  for (const hint of files.flatMap((file) => file.seasonalFactorPacketHints ?? [])) {
    const expected = finiteNumber(hint.expectedTotal);
    if (expected === null) continue;
    const expectedKey = expected.toFixed(6);
    const factorSet = hint.entryKeys.join(" + ");
    const snapshots = asArray(hint.allAttrSnapshots).length > 0 ? hint.allAttrSnapshots : hint.attrHints;
    for (const snapshot of asArray(snapshots)) {
      const observed = attrMovementObservedValue(snapshot);
      const error = finiteNumber(snapshot.error);
      if (observed === null || error === null) continue;
      const key = `${snapshot.comparison}:${snapshot.source}:${snapshot.attrId}:${snapshot.normalizer}`;
      let row = rowsByKey.get(key);
      if (!row) {
        row = {
          comparison: snapshot.comparison,
          source: snapshot.source,
          attrId: snapshot.attrId,
          label: snapshot.label,
          normalizer: snapshot.normalizer,
          files: new Set(),
          factorSets: new Set(),
          sourceLabels: new Set(),
          expectedGroups: new Map(),
          observations: 0,
          activeHits: 0,
          inactiveHits: 0,
          activeValue: 0,
          observedMin: null,
          observedMax: null,
          errorSum: 0,
          errorMax: null,
          qualities: new Map(),
        };
        rowsByKey.set(key, row);
      }

      row.files.add(hint.file);
      row.factorSets.add(factorSet);
      for (const sourceLabel of asArray(hint.sourceLabels)) addString(row.sourceLabels, sourceLabel);
      row.observations += 1;
      row.activeHits += finiteNumber(hint.activeHits) ?? 0;
      row.inactiveHits += finiteNumber(hint.inactiveHits) ?? 0;
      row.activeValue += finiteNumber(hint.activeValue) ?? 0;
      addNumberRange(row, "observed", observed);
      row.errorSum += error;
      addNumberRange(row, "error", error);
      incrementMap(row.qualities, snapshot.quality ?? "unknown");

      let group = row.expectedGroups.get(expectedKey);
      if (!group) {
        group = {
          expected,
          expectedKey,
          files: new Set(),
          factorSets: new Set(),
          observations: 0,
          activeHits: 0,
          inactiveHits: 0,
          activeValue: 0,
          observedSum: 0,
          observedMin: null,
          observedMax: null,
          errorSum: 0,
          errorMax: null,
          qualities: new Map(),
        };
        row.expectedGroups.set(expectedKey, group);
      }
      group.files.add(hint.file);
      group.factorSets.add(factorSet);
      group.observations += 1;
      group.activeHits += finiteNumber(hint.activeHits) ?? 0;
      group.inactiveHits += finiteNumber(hint.inactiveHits) ?? 0;
      group.activeValue += finiteNumber(hint.activeValue) ?? 0;
      group.observedSum += observed;
      addNumberRange(group, "observed", observed);
      group.errorSum += error;
      addNumberRange(group, "error", error);
      incrementMap(group.qualities, snapshot.quality ?? "unknown");
    }
  }

  return [...rowsByKey.values()]
    .map((row) => {
      const expectedGroups = [...row.expectedGroups.values()]
        .map((group) => ({
          ...group,
          files: [...group.files].sort((left, right) => left.localeCompare(right)),
          factorSets: [...group.factorSets].sort((left, right) => left.localeCompare(right)),
          observedAvg: group.observations > 0 ? group.observedSum / group.observations : null,
          errorAvg: group.observations > 0 ? group.errorSum / group.observations : null,
          qualities: countMapToObject(group.qualities, 8),
        }))
        .sort((left, right) => left.expected - right.expected);
      const expectedValues = expectedGroups.map((group) => group.expected);
      const observedAverages = expectedGroups
        .map((group) => finiteNumber(group.observedAvg))
        .filter((value) => value !== null);
      const expectedSpan =
        expectedValues.length > 1 ? Math.max(...expectedValues) - Math.min(...expectedValues) : 0;
      const observedSpan =
        observedAverages.length > 1 ? Math.max(...observedAverages) - Math.min(...observedAverages) : 0;
      const mapped = {
        ...row,
        files: [...row.files].sort((left, right) => left.localeCompare(right)),
        factorSets: [...row.factorSets].sort((left, right) => left.localeCompare(right)),
        sourceLabels: [...row.sourceLabels].sort((left, right) => left.localeCompare(right)),
        expectedGroups,
        expectedSpan,
        observedSpan,
        spanError: expectedValues.length > 1 && observedAverages.length > 1 ? Math.abs(observedSpan - expectedSpan) : null,
        avgError: row.observations > 0 ? row.errorSum / row.observations : null,
        qualities: countMapToObject(row.qualities, 8),
      };
      return {
        ...mapped,
        verdict: seasonalFactorMovementVerdict(mapped),
      };
    })
    .sort((left, right) => {
      const diversityDelta = right.expectedGroups.length - left.expectedGroups.length;
      if (diversityDelta !== 0) return diversityDelta;
      const verdictDelta =
        seasonalFactorMovementVerdictRank(left.verdict) - seasonalFactorMovementVerdictRank(right.verdict);
      if (verdictDelta !== 0) return verdictDelta;
      const spanDelta = (left.spanError ?? Number.POSITIVE_INFINITY) - (right.spanError ?? Number.POSITIVE_INFINITY);
      if (spanDelta !== 0) return spanDelta;
      const errorDelta = (left.avgError ?? Number.POSITIVE_INFINITY) - (right.avgError ?? Number.POSITIVE_INFINITY);
      if (errorDelta !== 0) return errorDelta;
      return right.observations - left.observations || right.activeValue - left.activeValue;
    })
    .slice(0, options.maxRows);
}

function markdownTable(headers, rows) {
  if (rows.length === 0) return "_No rows._\n";
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replaceAll("|", "\\|")).join(" | ")} |`);
  return `${[headerLine, separator, ...body].join("\n")}\n`;
}

function formatAttrSnapshot(snapshot) {
  if (!snapshot) return "-";
  return `${snapshot.source}:${snapshot.label} (${snapshot.attrId}, ${snapshot.normalizer})`;
}

function formatAttrHint(hint) {
  if (!hint) return "-";
  const normalized = hint.comparison === "active-minus-inactive" ? hint.normalizedDelta : hint.normalizedValue;
  return `${hint.comparison}:${hint.source}:${hint.label} (${hint.attrId}, ${hint.normalizer}) ${formatSignedPercent(normalized)} err ${formatPercent(hint.error)} ${hint.quality}`;
}

function formatBridgeAttr(row) {
  return `${row.source}:${row.label} (${row.attrId}, ${row.normalizer})`;
}

function formatMovementExpectedGroups(row) {
  return asArray(row.expectedGroups)
    .map(
      (group) =>
        `${formatSignedPercent(group.expected, 2)} -> ${formatSignedPercent(group.observedAvg, 2)} (${formatPercentRange(
          group.observedMin,
          group.observedMax,
        )}; n=${formatNumber(group.observations)})`,
    )
    .join("; ");
}

function formatRawExpectedGroups(row) {
  return asArray(row.expectedGroups)
    .map(
      (group) =>
        `${formatSignedPercent(group.expected, 2)} hits:${formatNumber(group.hits)} damage:${formatNumber(
          group.activeValue,
        )} files:${asArray(group.files).join(", ")}`,
    )
    .join("; ");
}

function formatCandidateValue(candidate) {
  if (!candidate) return "-";
  const value = candidate.rawText ?? formatSignedPercent(candidate.decimalValue, 2);
  const grade =
    candidate.grade !== null && candidate.grade !== undefined && candidate.grade !== ""
      ? ` grade:${candidate.grade}`
      : "";
  const selector = candidate.selectorKind ? ` ${candidate.selectorKind}` : "";
  const status = candidate.selectorStatus ? ` ${candidate.selectorStatus}` : "";
  return `${candidate.componentKey}:${value}${grade}${selector}${status}`;
}

function formatPercentRange(min, max, digits = 2) {
  if (min === null || max === null) return "-";
  if (Math.abs(min - max) < 0.0000005) return formatSignedPercent(min, digits);
  return `${formatSignedPercent(min, digits)}..${formatSignedPercent(max, digits)}`;
}

function formatCountsObject(value) {
  const entries = Object.entries(asObject(value));
  if (entries.length === 0) return "-";
  return entries.map(([key, count]) => `${key}:${count}`).join(", ");
}

function formatOptional(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatPacketModifierEvidence(evidenceRows) {
  const rows = asArray(evidenceRows);
  if (rows.length === 0) return "-";
  return rows
    .map(
      (row) =>
        `base:${formatOptional(row.modifierBaseId)} config:${formatOptional(row.modifierSourceConfigId)} level:${formatOptional(
          row.modifierBuffLevel,
        )} count:${formatOptional(row.modifierCount)} layer:${formatOptional(row.modifierLayer)} host:${formatOptional(
          row.modifierHostUid,
        )} source:${formatOptional(row.modifierSourceUid)} matched:${asArray(row.matchedIds).join(",")} hits:${formatNumber(row.hits)}`,
    )
    .join("; ");
}

function expectedAttrSpec(modelId) {
  const configs = EXPECTED_ATTRS_BY_MODEL.get(modelId) ?? [];
  if (configs.length === 0) return "none";
  return configs.map((config) => `${config.source}:${attrLabel(config.attrId)} (${config.attrId})`).join(", ");
}

function snapshotRequirement(status) {
  switch (status) {
    case "expected-attr-delta-matches":
      return "ready for model validation";
    case "expected-attr-delta-mismatch":
      return "inspect selected value or attr normalizer";
    case "missing-inactive-baseline":
      return "capture same damage/target lane with source inactive";
    case "missing-expected-attr-active":
      return "capture/export expected attr during active window";
    case "missing-expected-attr-inactive":
      return "capture/export expected attr during inactive window";
    case "missing-expected-attr-active-and-inactive":
      return "capture/export expected attr in both active and inactive windows";
    case "missing-local-seasonal-factor-snapshot":
      return "seasonal factor source term observed, but no local packet attr has been proven for the multiplier";
    case "missing-expected-attr-config":
      return "add expected attr contract";
    default:
      return "needs more proof";
  }
}

function proofRequirementRows(files, options) {
  const groups = new Map();
  for (const file of files) {
    for (const row of file.rows) {
      if (row.snapshotStatus === "expected-attr-delta-matches") continue;
      const key = [
        row.modelId,
        row.snapshotStatus,
        row.entryKey,
        row.sourceLabel,
        row.lane.damageId ?? "",
        row.lane.targetUid ?? "",
      ].join("::");
      let group = groups.get(key);
      if (!group) {
        group = {
          sourceLabel: row.sourceLabel,
          entryKey: row.entryKey,
          modelId: row.modelId,
          damageId: row.lane.damageId ?? null,
          targetUid: row.lane.targetUid ?? null,
          snapshotStatus: row.snapshotStatus,
          expectedAttr: expectedAttrSpec(row.modelId),
          requiredEvidence: snapshotRequirement(row.snapshotStatus),
          rows: 0,
          files: new Set(),
          activeHits: 0,
          inactiveHits: 0,
          activeValue: 0,
          bestAttrSnapshotCandidate: row.bestAttrSnapshotCandidate ?? null,
        };
        groups.set(key, group);
      }
      group.rows += 1;
      group.files.add(row.file);
      group.activeHits += row.activeHits;
      group.inactiveHits += row.inactiveHits;
      group.activeValue += row.activeValue;
      if (!group.bestAttrSnapshotCandidate && row.bestAttrSnapshotCandidate) {
        group.bestAttrSnapshotCandidate = row.bestAttrSnapshotCandidate;
      }
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      files: [...group.files].sort(),
    }))
    .sort((left, right) => {
      const statusDelta = snapshotStatusRank(left.snapshotStatus) - snapshotStatusRank(right.snapshotStatus);
      if (statusDelta !== 0) return statusDelta;
      return right.activeValue - left.activeValue || right.activeHits - left.activeHits;
    })
    .slice(0, options.maxRows);
}

function writeMarkdownReport(filePath, report, options) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const lines = [];
  lines.push("# Modifier Expected-Value Audit");
  lines.push("");
  lines.push("Dev-only evidence pass. This does not change live DPS parsing, packet final damage, recount rows, monitors, or history rendering.");
  lines.push("");
  lines.push("## Inputs");
  lines.push("");
  lines.push(`- Value proof: \`${report.inputs.valueProof}\``);
  lines.push(`- Recount table: \`${report.inputs.recountTable}\``);
  for (const input of report.inputs.modifierExports) lines.push(`- Modifier export: \`${input}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(
    markdownTable(
      ["Files", "Damage hits", "Expected rows", "Active observations", "Evaluated lanes"],
      [
        [
          report.summary.files,
          formatNumber(report.summary.damageHits),
          formatNumber(report.summary.expectedRows),
          formatNumber(report.summary.activeExpectedObservations),
          formatNumber(report.summary.evaluatedRows),
        ],
      ],
    ),
  );
  lines.push("### File Attr Coverage");
  lines.push("");
  lines.push(
    markdownTable(
      [
        "File",
        "Damage Hits",
        "Atk CritRate",
        "Atk Lucky",
        "Atk Crit Mult",
        "Atk SeasonStrength",
        "Atk CritDmg Panel",
        "Target attr:51",
      ],
      report.files.map((file) => [
        file.file,
        formatNumber(file.damageHits),
        formatCoverageEntry(file.attackerAttrCoverage, ATTR_CRIT_RATE),
        formatCoverageEntry(file.attackerAttrCoverage, ATTR_LUCKY_CHANCE),
        formatCoverageEntry(file.attackerAttrCoverage, ATTR_CRIT_MULTIPLIER),
        formatCoverageEntry(file.attackerAttrCoverage, ATTR_SEASON_STRENGTH),
        formatCoverageEntry(file.attackerAttrCoverage, 12510),
        formatCoverageEntry(file.targetAttrCoverage, 51),
      ]),
    ),
  );
  lines.push("### Status Counts");
  lines.push("");
  lines.push(
    markdownTable(
      ["Status", "Rows"],
      Object.entries(report.summary.statusCounts).map(([key, value]) => [key, formatNumber(value)]),
    ),
  );
  lines.push("### Snapshot Status Counts");
  lines.push("");
  lines.push(
    markdownTable(
      ["Status", "Rows"],
      Object.entries(report.summary.snapshotStatusCounts).map(([key, value]) => [key, formatNumber(value)]),
    ),
  );
  lines.push("### Expected Attr Snapshot Counts");
  lines.push("");
  lines.push(
    markdownTable(
      ["Attr Snapshot", "Rows"],
      Object.entries(report.summary.expectedAttrSnapshotCounts).map(([key, value]) => [key, formatNumber(value)]),
    ),
  );
  lines.push("### Seasonal Factor Packet Attr Hint Counts");
  lines.push("");
  lines.push(
    markdownTable(
      ["Hint", "Rows"],
      Object.entries(report.summary.seasonalFactorAttrHintCounts).map(([key, value]) => [key, formatNumber(value)]),
    ),
  );
  lines.push("### Seasonal Factor Hint Quality Counts");
  lines.push("");
  lines.push(
    markdownTable(
      ["Quality", "Rows"],
      Object.entries(report.summary.seasonalFactorAttrHintQualityCounts).map(([key, value]) => [key, formatNumber(value)]),
    ),
  );
  lines.push("### Seasonal Raw Modifier Status Counts");
  lines.push("");
  lines.push(
    markdownTable(
      ["Value Proof Status", "Rows"],
      Object.entries(report.summary.seasonalRawModifierStatusCounts).map(([key, value]) => [key, formatNumber(value)]),
    ),
  );
  lines.push("### Expected Rows By Model");
  lines.push("");
  lines.push(
    markdownTable(
      ["Model", "Rows"],
      Object.entries(report.summary.expectedRowsByModel).map(([key, value]) => [key, formatNumber(value)]),
    ),
  );
  lines.push("## Proof Requirements");
  lines.push("");
  lines.push(
    markdownTable(
      [
        "Requirement",
        "Snapshot Status",
        "Source",
        "Model",
        "Expected Attr",
        "Damage ID",
        "Target",
        "Rows",
        "Active Hits",
        "Inactive Hits",
        "Active Damage",
        "Best Attr Candidate",
      ],
      report.proofRequirements.map((row) => [
        row.requiredEvidence,
        row.snapshotStatus,
        `${row.sourceLabel} (${row.entryKey})`,
        row.modelId,
        row.expectedAttr,
        row.damageId ?? "",
        row.targetUid ?? "",
        formatNumber(row.rows),
        formatNumber(row.activeHits),
        formatNumber(row.inactiveHits),
        formatNumber(row.activeValue),
        formatAttrSnapshot(row.bestAttrSnapshotCandidate),
      ]),
    ),
  );
  lines.push("## Seasonal Factor Attr Movement Scan");
  lines.push("");
  lines.push(
    "These rows scan every packet attr/normalizer seen on seasonal-factor hits and compare whether the observed value moves with different generated factor totals. Rows marked `reject-constant` are useful negatives: the attr looked close in one setup but failed the controlled movement test.",
  );
  lines.push("");
  lines.push(
    markdownTable(
      [
        "Verdict",
        "Attr",
        "Comparison",
        "Expected -> Observed",
        "Span Error",
        "Avg Error",
        "Max Error",
        "Files",
        "Factor Sets",
        "Observations",
        "Active Hits",
        "Qualities",
      ],
      report.seasonalFactorAttrMovementCandidates.map((row) => [
        row.verdict,
        formatBridgeAttr(row),
        row.comparison,
        formatMovementExpectedGroups(row),
        formatPercent(row.spanError, 2),
        formatPercent(row.avgError, 2),
        formatPercent(row.errorMax, 2),
        row.files.join(", "),
        row.factorSets.join("; "),
        formatNumber(row.observations),
        formatNumber(row.activeHits),
        formatCountsObject(row.qualities),
      ]),
    ),
  );
  lines.push("## Seasonal Raw Modifier Census");
  lines.push("");
  lines.push(
    "These rows enumerate raw seasonal-range modifier IDs that are present on hits where generated seasonal factor source windows are active. This is a dev-only gap finder: IDs with `needs-*` statuses are evidence that the source exists, not contribution math.",
  );
  lines.push("");
  lines.push(
    markdownTable(
      [
        "Raw ID",
        "Labels",
        "Status",
        "Zones",
        "Selected Values",
        "Candidate Values",
        "Blockers",
        "Expected Groups",
        "Files",
        "Hits",
        "Active Damage",
        "Roles",
        "Pairs",
        "Layers",
      ],
      report.seasonalRawModifierEvidence.map((row) => [
        row.rawId,
        row.labels.join(", ") || "-",
        row.valueProofStatuses.join(", ") || "unmapped",
        row.formulaZoneIds.join(", ") || "-",
        row.selectedValues.join(", ") || "-",
        row.candidateValues.join(", ") || "-",
        row.valueBlockers.join(", ") || "-",
        formatRawExpectedGroups(row),
        row.files.join(", "),
        formatNumber(row.hits),
        formatNumber(row.activeValue),
        formatCountsObject(row.roles),
        formatCountsObject(row.pairs),
        formatCountsObject(row.layers),
      ]),
    ),
  );
  lines.push("## Seasonal Factor Value Reconciliation");
  lines.push("");
  lines.push(
    "These rows test unresolved seasonal raw UIDs against generated value-ladder candidates. A bridge here is still dev-only: it proves a candidate can reconcile two observed generated totals, but runtime still needs a packet/item/grade selector before contribution math can consume it.",
  );
  lines.push("");
  lines.push(
    markdownTable(
      [
        "Verdict",
        "Raw ID",
        "Labels",
        "Status",
        "Candidate",
        "Base Expected",
        "Adjusted Expected",
        "Matched Existing",
        "Error",
        "Files",
        "Matched Files",
        "Blockers",
      ],
      report.seasonalFactorValueReconciliation.map((row) => [
        row.verdict,
        row.rawId,
        row.labels.join(", ") || "-",
        row.valueProofStatuses.join(", ") || "unmapped",
        formatCandidateValue(row.candidate),
        formatSignedPercent(row.baseExpected, 2),
        formatSignedPercent(row.adjustedExpected, 2),
        formatSignedPercent(row.matchedExpected, 2),
        formatPercent(row.error, 2),
        row.files.join(", "),
        row.matchedFiles.join(", "),
        row.valueBlockers.join(", ") || "-",
      ]),
    ),
  );
  lines.push("## Seasonal Factor Attr Bridge Candidates");
  lines.push("");
  lines.push(
    "These rows aggregate explicit seasonal factor packet-attr candidates across factor sets and files. A single expected total is still only a repeated hint; a real bridge needs different factor totals or a controlled source-off baseline where the attr moves with the generated factor value.",
  );
  lines.push("");
  lines.push(
    markdownTable(
      [
        "Factor Set",
        "Attr",
        "Files",
        "Observations",
        "Active Hits",
        "Inactive Hits",
        "Expected Totals",
        "Active Range",
        "Avg Error",
        "Max Error",
        "Qualities",
        "Active Damage",
      ],
      report.seasonalFactorBridgeCandidates.map((row) => [
        row.factorSet,
        formatBridgeAttr(row),
        row.files.join(", "),
        formatNumber(row.observations),
        formatNumber(row.activeHits),
        formatNumber(row.inactiveHits),
        row.expectedTotals.map((value) => formatSignedPercent(Number(value), 2)).join(", "),
        formatPercentRange(row.activeNormalizedMin, row.activeNormalizedMax),
        formatPercent(row.activeErrorAvg, 2),
        formatPercent(row.activeErrorMax, 2),
        formatCountsObject(row.qualities),
        formatNumber(row.activeValue),
      ]),
    ),
  );
  lines.push("## Seasonal Factor Packet Attr Hints");
  lines.push("");
  lines.push(
    "These rows keep two evidence types separate: packet modifier evidence proves the seasonal factor UIDs were active on the hit, while packet attr hints compare generated seasonal-factor values to active attr snapshots. Attr hints are not contribution proof until a semantic attr bridge or active/inactive proof exists.",
  );
  lines.push("");
  lines.push(
    markdownTable(
      [
        "File",
        "Factor Set",
        "Expected Total",
        "Damage ID",
        "Target",
        "Active Hits",
        "Inactive Hits",
        "Active Damage",
        "Packet Modifier Evidence",
        "Best Packet Attr Hint",
      ],
      report.seasonalFactorPacketHints.map((row) => [
        row.file,
        row.entryKeys.join(" + "),
        formatSignedPercent(row.expectedTotal, 2),
        row.lane.damageId ?? "",
        row.lane.targetUid ?? "",
        formatNumber(row.activeHits),
        formatNumber(row.inactiveHits),
        formatNumber(row.activeValue),
        formatPacketModifierEvidence(row.packetModifierEvidence),
        formatAttrHint(row.bestAttrHint),
      ]),
    ),
  );
  lines.push("## Top Evidence Rows");
  lines.push("");
  lines.push(
    markdownTable(
      [
        "Status",
        "Source",
        "Model",
        "Damage ID",
        "Target",
        "Active Hits",
        "Inactive Hits",
        "Expected Delta",
        "Observed Delta",
        "Error",
        "Snapshot Status",
        "Expected Attr",
        "Snapshot Delta",
        "Snapshot Error",
        "Best Attr Candidate",
        "Estimate",
      ],
      report.topRows.slice(0, options.maxRows).map((row) => [
        row.status,
        `${row.sourceLabel} (${row.entryKey})`,
        row.modelId,
        row.lane.damageId ?? "",
        row.lane.targetUid ?? "",
        formatNumber(row.activeHits),
        formatNumber(row.inactiveHits),
        formatSignedPercent(row.expectedRateDelta),
        formatSignedPercent(row.observedRateDelta),
        formatPercent(row.chanceError),
        row.snapshotStatus,
        formatAttrSnapshot(row.expectedAttrSnapshot),
        formatSignedPercent(row.expectedAttrSnapshot?.normalizedDelta),
        formatPercent(row.snapshotChanceError),
        row.bestSeasonalFactorAttrHint
          ? formatAttrHint(row.bestSeasonalFactorAttrHint)
          : formatAttrSnapshot(row.bestAttrSnapshotCandidate),
        row.expectedAddedDamageEstimate === null ? "-" : formatNumber(row.expectedAddedDamageEstimate),
      ]),
    ),
  );
  lines.push("## Notes");
  lines.push("");
  lines.push("- `observed-delta-matches` means active and inactive windows on the same damage/target lane matched the generated expected chance delta within the configured tolerance.");
  lines.push("- `expected-attr-delta-matches` means the expected attacker/target packet attr snapshot delta matched the generated chance delta; this is stronger than realized crit/lucky RNG.");
  lines.push("- `seasonal-factor-multiplier-v1` rows are source-window proof only for now; this currently covers generated seasonal factor terms, not the separate Season 1 global content bonus.");
  lines.push("- Seasonal factor packet attr hints compare generated factor values against packet attr snapshots, but active-only matches are not contribution proof.");
  lines.push("- Insufficient baseline rows are still useful evidence that the source is observed, but they are not contribution math.");
  lines.push("- `expectedAddedDamageEstimate` is intentionally labeled as an estimate; it is not assigned back to live totals.");

  fs.writeFileSync(resolved, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const valueProofPath = options.valueProof
    ? resolveRepoPath(options.valueProof)
    : firstExistingPath(DEFAULT_VALUE_PROOF_CANDIDATES);
  const recountTablePath = options.recountTable
    ? resolveRepoPath(options.recountTable)
    : firstExistingPath(DEFAULT_RECOUNT_TABLE_CANDIDATES);
  if (!valueProofPath) throw new Error("Could not find ModifierValueProofRuntime.json");
  if (!recountTablePath) throw new Error("Could not find ModifierRecountTable.json");

  const inputPaths = options.inputs.length
    ? options.inputs.map(resolveRepoPath)
    : latestModifierEntityExports(options.latest);
  if (inputPaths.length === 0) throw new Error("No modifier-entity exports found");

  const valueProof = readJson(valueProofPath);
  const recountTable = readJson(recountTablePath);
  const expected = buildExpectedRows(valueProof, recountTable);
  const rowsBySourceId = buildRowsBySourceId(expected.rows);
  const modifierMetadataById = buildModifierMetadataById(valueProof);
  const files = inputPaths.map((inputPath) =>
    buildFileReport(inputPath, expected.rows, rowsBySourceId, modifierMetadataById, options),
  );
  const seasonalRawModifierEvidence = aggregateSeasonalRawModifierRows(files, options);
  const seasonalFactorValueReconciliation = seasonalFactorValueReconciliationRows(
    seasonalRawModifierEvidence,
    options,
  );
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      valueProof: compactPath(valueProofPath),
      recountTable: compactPath(recountTablePath),
      modifierExports: inputPaths.map(compactPath),
      minEligibleHits: options.minEligibleHits,
      chanceErrorLimit: options.chanceErrorLimit,
    },
    modelContracts: valueProof.expectedValueModels ?? {},
    candidateSummary: {
      modelCounts: expected.modelCounts,
      skippedByReason: expected.skippedByReason,
    },
    summary: summarize(files, expected.rows),
    files,
    topRows: topRows(files, options),
    proofRequirements: proofRequirementRows(files, options),
    seasonalFactorAttrMovementCandidates: seasonalFactorAttrMovementRows(files, options),
    seasonalRawModifierEvidence,
    seasonalFactorValueReconciliation,
    seasonalFactorBridgeCandidates: seasonalFactorBridgeRows(files, options),
    seasonalFactorPacketHints: seasonalFactorPacketHintRows(files, options),
  };

  writeJsonReport(options.outJson, report);
  writeMarkdownReport(options.outMd, report, options);

  console.log(`Wrote ${options.outJson}`);
  console.log(`Wrote ${options.outMd}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main();
