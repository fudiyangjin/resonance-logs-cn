#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_INPUTS = 3;
const DEFAULT_MAX_ROWS = 80;
const DEFAULT_OUT_JSON = "DEV_exports/modifier-term-proof-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/modifier-term-proof-audit.md";
const DEFAULT_TERM_TABLE_CANDIDATES = [
  "DEV_generated/modifier/ModifierFormulaTermRuntime.json",
  "parser-data/generated/ModifierFormulaTermRuntime.json",
  "../BPSR-UID-Extractors/output/ModifierFormulaTermRuntime.json",
];
const DEFAULT_FULL_TERM_TABLE_CANDIDATES = [
  "DEV_generated/modifier/ModifierFormulaTermTable.json",
  "parser-data/generated/ModifierFormulaTermTable.json",
  "../BPSR-UID-Extractors/output/ModifierFormulaTermTable.json",
];

const NO_VALUE_RESOLUTIONS = new Set([
  "",
  "none",
  "no-value",
  "identity",
  "identity-only",
  "label-only",
  "unknown",
]);
const DAMAGE_REPLAY_ZONES = new Set([
  "allRoundDamage",
  "baseAttackTerm",
  "critical",
  "elementalDamage",
  "exactLuckyProducedDamage",
  "finalDamage",
  "generalDamage",
  "luckyEnhancement",
  "luckyStrikeBaseTerm",
  "physicalMagicEnhancement",
  "seasonDamage",
  "seasonSuppression",
  "skillFixedDamage",
  "skillMultiplier",
]);
const NON_DAMAGE_ZONES = new Set(["timingCadence"]);

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
    maxRows: DEFAULT_MAX_ROWS,
    termTable: null,
    fullTermTable: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      options.inputs.push(argv[++index]);
    } else if (arg === "--latest") {
      options.latest = Math.max(1, Number(argv[++index]) || DEFAULT_LATEST_INPUTS);
    } else if (arg === "--term-table") {
      options.termTable = argv[++index];
    } else if (arg === "--full-term-table") {
      options.fullTermTable = argv[++index];
    } else if (arg === "--out-json") {
      options.outJson = argv[++index];
    } else if (arg === "--out-md") {
      options.outMd = argv[++index];
    } else if (arg === "--max-rows") {
      options.maxRows = Math.max(1, Number(argv[++index]) || DEFAULT_MAX_ROWS);
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
  console.log(`Usage: node scripts/audit-modifier-term-proof.mjs [options]

Options:
  --input <path>       Add a specific modifier-entity export. Repeatable.
  --latest <count>     Use latest DEV_exports/modifier-entity-*.json files when no inputs are provided. Default: ${DEFAULT_LATEST_INPUTS}
  --term-table <path>  ModifierFormulaTermRuntime.json path. Defaults to app parser-data, then sibling extractor output.
  --full-term-table <path>
                       Optional full ModifierFormulaTermTable.json path for strict value proof. Defaults to app parser-data, then sibling extractor output when present.
  --out-json <path>    JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>      Markdown report path. Default: ${DEFAULT_OUT_MD}
  --max-rows <count>   Max Markdown rows per table. Default: ${DEFAULT_MAX_ROWS}
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function readGeneratedOptional(fileName) {
  const filePath = path.join(repoRoot, "parser-data", "generated", fileName);
  return fs.existsSync(filePath) ? readJson(filePath) : {};
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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function numberValue(value) {
  return finiteNumber(value) ?? 0;
}

function localizedName(map, fallback = "") {
  if (map && typeof map === "object" && !Array.isArray(map)) {
    return (
      map.en
      ?? map.design
      ?? Object.values(map).find((value) => typeof value === "string" && value.trim())
      ?? fallback
    );
  }
  return fallback;
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function formatDecimal(value, digits = 1) {
  return (Number(value) || 0).toFixed(digits);
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((left, right) => left - right);
}

function uniqueSortedStrings(values) {
  return [...new Set(values.map(String).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function addMapCount(map, key, amount = 1) {
  if (!key) return;
  const stringKey = String(key);
  if (typeof map.set === "function" && typeof map.get === "function") {
    map.set(stringKey, (map.get(stringKey) ?? 0) + amount);
    return;
  }
  map[stringKey] = (map[stringKey] ?? 0) + amount;
}

function addToSet(set, value) {
  if (value === null || value === undefined || value === "") return;
  set.add(String(value));
}

function setToSortedArray(set, limit = 24) {
  return [...set].sort((left, right) => left.localeCompare(right)).slice(0, limit);
}

function countMapToObject(map, limit = 20) {
  return Object.fromEntries(
    [...map.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit),
  );
}

function topRows(map, limit) {
  return [...map.values()]
    .sort((left, right) => {
      const valueDelta = (right.totalValue ?? 0) - (left.totalValue ?? 0);
      if (valueDelta !== 0) return valueDelta;
      return (right.hits ?? 0) - (left.hits ?? 0);
    })
    .slice(0, limit);
}

function topStrictReadyRows(map, limit) {
  return [...map.values()]
    .filter((row) => (row.strictReplayReadyHits ?? 0) > 0)
    .sort((left, right) => {
      const valueDelta = (right.strictReplayReadyValue ?? 0) - (left.strictReplayReadyValue ?? 0);
      if (valueDelta !== 0) return valueDelta;
      return (right.strictReplayReadyHits ?? 0) - (left.strictReplayReadyHits ?? 0);
    })
    .slice(0, limit);
}

function topStrictBlockedRows(map, limit) {
  return [...map.values()]
    .filter((row) => (row.strictReplayBlockedHits ?? 0) > 0)
    .sort((left, right) => {
      const blockedValueDelta = ((right.totalValue ?? 0) - (right.strictReplayReadyValue ?? 0))
        - ((left.totalValue ?? 0) - (left.strictReplayReadyValue ?? 0));
      if (blockedValueDelta !== 0) return blockedValueDelta;
      return (right.strictReplayBlockedHits ?? 0) - (left.strictReplayBlockedHits ?? 0);
    })
    .slice(0, limit);
}

function buildIndexes(options) {
  const termTablePath = options.termTable
    ? resolveRepoPath(options.termTable)
    : firstExistingPath(DEFAULT_TERM_TABLE_CANDIDATES);
  const fullTermTablePath = options.fullTermTable
    ? resolveRepoPath(options.fullTermTable)
    : firstExistingPath(DEFAULT_FULL_TERM_TABLE_CANDIDATES);

  if (!termTablePath) {
    throw new Error(
      `Could not find ModifierFormulaTermRuntime.json. Tried: ${DEFAULT_TERM_TABLE_CANDIDATES.join(", ")}`,
    );
  }

  const modifierRecount = readGenerated("ModifierRecountTable.json");
  const display = readGenerated("ModifierDisplayTable.json");
  const contribution = readGenerated("ModifierContributionRuntime.json");
  const recount = readGenerated("RecountTable.json");
  const damageAttrNames = readGeneratedOptional("DamageAttrIdName.json");
  const termTable = readJson(termTablePath);
  const fullTermTable = fullTermTablePath ? readJson(fullTermTablePath) : null;

  const ruleIdsByBuffId = new Map();
  for (const [buffId, ruleIds] of Object.entries(asObject(modifierRecount.byBuffId))) {
    ruleIdsByBuffId.set(String(buffId), asArray(ruleIds).map(String));
  }

  const termsByRuleId = new Map();
  const entriesByKey = asObject(termTable.entriesByKey);
  const fullEntriesByKey = asObject(fullTermTable?.entriesByKey);
  for (const [termKey, rawEntry] of Object.entries(entriesByKey)) {
    const entry = { ...asObject(fullEntriesByKey[termKey]), ...asObject(rawEntry), termKey };
    const sourceRuleIds = uniqueSortedStrings([
      ...asArray(entry.sourceRuleIds),
      ...asArray(entry.directSourceRuleIds),
    ]);
    for (const ruleId of sourceRuleIds) {
      if (!termsByRuleId.has(ruleId)) termsByRuleId.set(ruleId, []);
      termsByRuleId.get(ruleId).push(entry);
    }
  }

  const recountByDamageId = new Map();
  for (const [recountId, row] of Object.entries(asObject(recount))) {
    for (const damageId of asArray(row?.DamageId)) {
      const key = String(damageId);
      if (!recountByDamageId.has(key)) recountByDamageId.set(key, []);
      recountByDamageId.get(key).push({
        recountId: Number(recountId),
        name: localizedName(row?.Names, row?.Name ?? row?.RecountName ?? `recount:${recountId}`),
      });
    }
  }

  return {
    termTable,
    termTablePath,
    fullTermTable,
    fullTermTablePath,
    modifierRecount,
    display,
    contribution,
    damageAttrNames,
    ruleIdsByBuffId,
    termsByRuleId,
    recountByDamageId,
    ignoredBuffIds: new Set(asArray(modifierRecount.ignoredBuffIds).map(Number).filter(Number.isFinite)),
  };
}

function sourceLabel(ruleId, indexes) {
  const display = indexes.display.sourcesByRuleId?.[ruleId];
  const source = indexes.modifierRecount.sourcesById?.[ruleId];
  const contribution = indexes.contribution.sourcesByRuleId?.[ruleId];
  return (
    display?.sourceName
    ?? localizedName(display?.sourceNames)
    ?? localizedName(source?.sourceNames)
    ?? source?.sourceName
    ?? contribution?.sourceId
    ?? source?.sourceId
    ?? ruleId
  );
}

function activeModifierEntries(hit) {
  const entries = [];
  for (const modifier of asArray(hit?.activeModifiers)) {
    const modifierBaseId = positiveNumber(modifier?.modifierBaseId);
    const modifierSourceConfigId = positiveNumber(modifier?.modifierSourceConfigId);
    const modifierHostUid = positiveNumber(modifier?.modifierHostUid);
    const modifierSourceUid = positiveNumber(modifier?.modifierSourceUid);
    const modifierLayer = finiteNumber(modifier?.modifierLayer);
    const modifierCount = finiteNumber(modifier?.modifierCount);
    for (const [field, buffId] of [
      ["modifierBaseId", modifierBaseId],
      ["modifierSourceConfigId", modifierSourceConfigId],
    ]) {
      if (buffId === null) continue;
      entries.push({
        buffId,
        field,
        modifierBaseId,
        modifierSourceConfigId,
        modifierHostUid,
        modifierSourceUid,
        modifierLayer,
        modifierCount,
      });
    }
  }
  return entries;
}

function activeRuleLinks(hit, indexes) {
  const byRule = new Map();
  const unmapped = new Map();

  for (const entry of activeModifierEntries(hit)) {
    const ruleIds = indexes.ruleIdsByBuffId.get(String(entry.buffId)) ?? [];
    if (!ruleIds.length) {
      if (!indexes.ignoredBuffIds.has(entry.buffId)) {
        const key = `${entry.buffId}:${entry.field}`;
        let row = unmapped.get(key);
        if (!row) {
          row = { buffId: entry.buffId, field: entry.field, entries: [] };
          unmapped.set(key, row);
        }
        row.entries.push(entry);
      }
      continue;
    }

    for (const ruleId of ruleIds) {
      let current = byRule.get(ruleId);
      if (!current) {
        current = {
          ruleId,
          buffIds: new Set(),
          entries: [],
        };
        byRule.set(ruleId, current);
      }
      current.buffIds.add(entry.buffId);
      current.entries.push(entry);
    }
  }

  return {
    links: [...byRule.values()].map((link) => ({
      ...link,
      buffIds: uniqueSortedNumbers([...link.buffIds]),
    })),
    unmapped: [...unmapped.values()],
  };
}

function buildActorIndex(entity) {
  const byUid = new Map();
  for (const actor of asArray(entity.modifierSourceActors)) {
    const uid = positiveNumber(actor?.uid);
    if (uid !== null) byUid.set(uid, actor);
  }
  return byUid;
}

function sourceUidForLink(link) {
  return link.entries.find((entry) => entry.modifierSourceUid !== null)?.modifierSourceUid ?? null;
}

function hostUidForLink(link) {
  return link.entries.find((entry) => entry.modifierHostUid !== null)?.modifierHostUid ?? null;
}

function providerForLink(entity, actorIndex, link, hit) {
  const sourceUid = sourceUidForLink(link);
  const hostUid = hostUidForLink(link);
  const actorUid = positiveNumber(hit?.originalAttackerUid) ?? positiveNumber(hit?.attackerUid) ?? positiveNumber(entity.uid);
  const sourceActor = sourceUid !== null ? actorIndex.get(sourceUid) : undefined;
  const hostActor = hostUid !== null ? actorIndex.get(hostUid) : undefined;
  const ownerUid = positiveNumber(sourceActor?.ownerUid) ?? positiveNumber(hostActor?.ownerUid) ?? sourceUid;
  const ownerName = sourceActor?.ownerName ?? hostActor?.ownerName;
  const providerName = ownerName
    ?? sourceActor?.name
    ?? hostActor?.name
    ?? (sourceUid === entity.uid ? entity.name : null)
    ?? (sourceUid !== null ? `#${sourceUid}` : "unknown");
  const isOwner = sourceUid === actorUid || ownerUid === actorUid || sourceUid === entity.uid || ownerUid === entity.uid;

  return {
    sourceUid,
    hostUid,
    ownerUid,
    providerName,
    scope: isOwner ? "owner" : "party",
  };
}

function recountParentsForHit(hit, indexes) {
  const parents = [];
  for (const id of uniqueSortedNumbers([hit?.damageId, hit?.skillKey])) {
    for (const parent of indexes.recountByDamageId.get(String(id)) ?? []) {
      if (!parents.some((candidate) => candidate.recountId === parent.recountId)) parents.push(parent);
    }
  }
  return parents;
}

function targetIdsForRule(ruleId, indexes) {
  const source = indexes.modifierRecount.sourcesById?.[ruleId] ?? {};
  return {
    targetDamageIds: new Set(asArray(source.targetDamageIds).map(Number).filter(Number.isFinite)),
    targetRecountIds: new Set(asArray(source.targetRecountIds).map(Number).filter(Number.isFinite)),
  };
}

function ruleTargetStatus(ruleId, hit, recountParents, indexes) {
  const { targetDamageIds, targetRecountIds } = targetIdsForRule(ruleId, indexes);
  const hasStaticTargets = targetDamageIds.size > 0 || targetRecountIds.size > 0;
  if (!hasStaticTargets) {
    return {
      hasStaticTargets,
      targetMatch: false,
      targetDamageIds: [],
      targetRecountIds: [],
      recountParents,
    };
  }

  const hitDamageIds = uniqueSortedNumbers([hit?.damageId, hit?.skillKey]);
  const targetMatch = hitDamageIds.some((id) => targetDamageIds.has(id))
    || recountParents.some((parent) => targetRecountIds.has(parent.recountId));
  return {
    hasStaticTargets,
    targetMatch,
    targetDamageIds: [...targetDamageIds].sort((left, right) => left - right),
    targetRecountIds: [...targetRecountIds].sort((left, right) => left - right),
    recountParents,
  };
}

function ruleSourceRecord(ruleId, indexes) {
  return {
    recount: asObject(indexes.modifierRecount.sourcesById?.[ruleId]),
    display: asObject(indexes.display.sourcesByRuleId?.[ruleId]),
    contribution: asObject(indexes.contribution.sourcesByRuleId?.[ruleId]),
  };
}

function predicateTagsForRule(ruleId, indexes) {
  const record = ruleSourceRecord(ruleId, indexes);
  return uniqueSortedStrings([
    ...asArray(record.recount.predicateTags),
    ...asArray(record.display.predicateTags),
    ...asArray(record.contribution.predicateTags),
  ]);
}

function targetWindowEntriesForHit(link, hit) {
  const targetUid = positiveNumber(hit?.targetUid);
  if (targetUid === null) return [];
  return link.entries.filter((entry) =>
    entry.modifierHostUid === targetUid || entry.modifierSourceUid === targetUid
  );
}

function ruleIdsForBuffId(buffId, indexes) {
  if (buffId === null || buffId === undefined) return [];
  return indexes.ruleIdsByBuffId.get(String(buffId)) ?? [];
}

function rawTargetWindowEntriesForHit(hit) {
  const targetUid = positiveNumber(hit?.targetUid);
  if (targetUid === null) return [];

  const windows = [];
  for (const modifier of asArray(hit?.activeModifiers)) {
    const modifierBaseId = positiveNumber(modifier?.modifierBaseId);
    const modifierSourceConfigId = positiveNumber(modifier?.modifierSourceConfigId);
    const modifierHostUid = positiveNumber(modifier?.modifierHostUid);
    const modifierSourceUid = positiveNumber(modifier?.modifierSourceUid);
    if (modifierHostUid !== targetUid && modifierSourceUid !== targetUid) continue;

    windows.push({
      modifierBaseId,
      modifierSourceConfigId,
      modifierHostUid,
      modifierSourceUid,
      modifierLayer: finiteNumber(modifier?.modifierLayer),
      modifierCount: finiteNumber(modifier?.modifierCount),
      modifierBuffLevel: finiteNumber(modifier?.modifierBuffLevel),
      targetSide: modifierHostUid === targetUid ? "host" : "source",
    });
  }
  return windows;
}

function hasWindowStackEvidence(window) {
  return (Number.isFinite(window?.modifierLayer) && window.modifierLayer > 0)
    || (Number.isFinite(window?.modifierCount) && window.modifierCount > 0);
}

function targetWindowEvidenceForHit(hit, indexes) {
  const targetUid = positiveNumber(hit?.targetUid);
  const windows = rawTargetWindowEntriesForHit(hit).map((window) => {
    const baseRuleIds = ruleIdsForBuffId(window.modifierBaseId, indexes);
    const sourceConfigRuleIds = ruleIdsForBuffId(window.modifierSourceConfigId, indexes);
    const buffIds = uniqueSortedNumbers([window.modifierBaseId, window.modifierSourceConfigId]);
    const unmappedBuffIds = buffIds.filter((buffId) =>
      !ruleIdsForBuffId(buffId, indexes).length && !indexes.ignoredBuffIds.has(buffId)
    );
    return {
      ...window,
      buffIds,
      baseRuleIds: uniqueSortedStrings(baseRuleIds),
      sourceConfigRuleIds: uniqueSortedStrings(sourceConfigRuleIds),
      mappedRuleIds: uniqueSortedStrings([...baseRuleIds, ...sourceConfigRuleIds]),
      unmappedBuffIds,
      hasStackEvidence: hasWindowStackEvidence(window),
    };
  });

  return {
    targetUid,
    windows,
    anyWindowCount: windows.length,
    mappedWindowCount: windows.filter((window) => window.mappedRuleIds.length).length,
    stackWindowCount: windows.filter((window) => window.hasStackEvidence).length,
  };
}

function evaluateTargetWindowForLink(link, targetWindowEvidence) {
  const ruleId = String(link?.ruleId ?? "");
  const linkBuffIds = new Set(asArray(link?.buffIds).map(String));
  const windows = asArray(targetWindowEvidence?.windows);
  const sameRuleWindows = [];
  const linkedWindows = [];
  const unlinkedWindows = [];

  for (const window of windows) {
    const sameRule = window.mappedRuleIds.includes(ruleId);
    const linkedByBuffId = window.buffIds.some((buffId) => linkBuffIds.has(String(buffId)));
    if (sameRule) sameRuleWindows.push(window);
    if (sameRule || linkedByBuffId) linkedWindows.push(window);
    else unlinkedWindows.push(window);
  }

  return {
    targetUid: targetWindowEvidence?.targetUid ?? null,
    windows,
    sameRuleWindows,
    linkedWindows,
    unlinkedWindows,
    anyWindowCount: windows.length,
    mappedWindowCount: targetWindowEvidence?.mappedWindowCount ?? 0,
    stackWindowCount: targetWindowEvidence?.stackWindowCount ?? 0,
    sameRuleWindowCount: sameRuleWindows.length,
    linkedWindowCount: linkedWindows.length,
    unlinkedWindowCount: unlinkedWindows.length,
    linkedStackWindowCount: linkedWindows.filter((window) => window.hasStackEvidence).length,
  };
}

function targetWindowProofBlocker(targetWindowEval, missingBlocker, unlinkedBlocker) {
  if ((targetWindowEval?.linkedWindowCount ?? 0) > 0) return null;
  if ((targetWindowEval?.anyWindowCount ?? 0) > 0) return unlinkedBlocker;
  return missingBlocker;
}

function hitDamageIds(hit) {
  return uniqueSortedNumbers([hit?.damageId, hit?.skillKey]);
}

function targetSignatureForStatus(targetStatus) {
  const damage = asArray(targetStatus.targetDamageIds).map(String).sort((left, right) => left.localeCompare(right));
  const recount = asArray(targetStatus.targetRecountIds).map(String).sort((left, right) => left.localeCompare(right));
  return `damage:${damage.join(",")}|recount:${recount.join(",")}`;
}

function hasRuntimeStackEvidence(link) {
  return link.entries.some((entry) =>
    (Number.isFinite(entry.modifierLayer) && entry.modifierLayer > 0)
    || (Number.isFinite(entry.modifierCount) && entry.modifierCount > 0)
  );
}

function isPacketExactTerm(term) {
  const readiness = String(term.formulaReadiness ?? "").toLowerCase();
  const zones = asArray(term.formulaZoneIds).map((zone) => String(zone).toLowerCase());
  return readiness.includes("packet-exact")
    || zones.some((zone) => zone.includes("exact") && zone.includes("damage"));
}

function needsValueResolution(term) {
  if (isPacketExactTerm(term)) return false;
  const valueResolution = String(term.valueResolution ?? "").toLowerCase();
  return NO_VALUE_RESOLUTIONS.has(valueResolution);
}

function damageReplayZones(term) {
  return asArray(term.formulaZoneIds).map(String).filter((zone) => DAMAGE_REPLAY_ZONES.has(zone));
}

function hasOnlyNonDamageZones(term) {
  const zones = asArray(term.formulaZoneIds).map(String).filter(Boolean);
  return zones.length > 0 && zones.every((zone) => NON_DAMAGE_ZONES.has(zone));
}

function valueScopeMatches(valueScope, providerScope) {
  const scope = String(valueScope ?? "").toLowerCase();
  const provider = String(providerScope ?? "").toLowerCase();
  if (scope === "all" || scope === "global" || scope === "any") return true;
  if (provider === "owner") return scope === "owner" || scope === "self";
  if (provider === "party") return scope === "party" || scope === "ally" || scope === "external";
  return false;
}

function formulaValuesForHint(hint, provider) {
  return asArray(hint?.values)
    .filter((value) => value?.formulaAmount)
    .filter((value) => valueScopeMatches(value?.scope, provider.scope));
}

function strictValueBlockers(term, provider) {
  if (isPacketExactTerm(term)) return [];
  if (!damageReplayZones(term).length) return [];

  const blockers = [];
  const valueResolution = String(term.valueResolution ?? "").toLowerCase();
  const hints = asArray(term.componentValueHints);
  if (!hints.length) {
    blockers.push("missing-component-value-hint");
    return blockers;
  }

  if (valueResolution === "description-owner-party-split-candidate") {
    blockers.push("owner-party-split-candidate-needs-runtime-confirmation");
  }
  if (valueResolution === "base-plus-modification-tier-owner-party-split") {
    blockers.push("tier-or-modification-value-selection-required");
  }

  for (const hint of hints) {
    const key = String(hint?.componentKey ?? "unknown");
    const formulaTermIds = asArray(hint?.formulaTermIds).map((value) => String(value).toLowerCase());
    if (
      /(^|[-_])(critical-rate|crit-rate|lucky-rate|lucky-chance|lucky-probability)($|[-_])/.test(key.toLowerCase())
      || formulaTermIds.some((id) => id.includes("critchance") || id.includes("luckychance"))
    ) {
      blockers.push(`component:${key}:probability-term-needs-expected-model`);
    }
    const formulaValues = asArray(hint?.values).filter((value) => value?.formulaAmount);
    if (!formulaValues.length) {
      blockers.push(`component:${key}:missing-formula-value`);
      continue;
    }

    const scopedValues = formulaValuesForHint(hint, provider);
    if (scopedValues.length === 1) continue;
    if (scopedValues.length > 1) {
      blockers.push(`component:${key}:ambiguous-scoped-value`);
      continue;
    }

    const ambiguousValues = formulaValues.filter((value) =>
      String(value?.scope ?? "").toLowerCase() === "ambiguous"
    );
    if (ambiguousValues.length) {
      blockers.push(`component:${key}:ambiguous-value-selection-required`);
    } else {
      blockers.push(`component:${key}:scope-value-not-found`);
    }
  }

  return uniqueSortedStrings(blockers);
}

function strictRuntimeBlockers(term, hit, link, provider, targetStatus, targetWindowEval) {
  const blockers = [];
  const proofRequired = asArray(term.runtimeProofRequired).map((value) => String(value).toLowerCase());
  const proofHas = (fragment) => proofRequired.some((value) => value.includes(fragment));
  const hasAttackerAttrs = asArray(hit?.attackerAttrs).length > 0;

  if (proofHas("hit timestamp") && positiveNumber(hit?.timestampMs) === null) {
    blockers.push("missing-hit-timestamp");
  }
  if (proofHas("skill id") && positiveNumber(hit?.skillKey) === null) {
    blockers.push("missing-skill-id");
  }
  if (proofHas("attacker stat snapshot") && !hasAttackerAttrs) {
    blockers.push("missing-attacker-stat-snapshot");
  }
  if (proofHas("attacker crit-rate snapshot") && !hasAttackerAttrs) {
    blockers.push("missing-attacker-crit-rate-snapshot");
  }
  if (proofHas("attacker crit-damage snapshot") && !hasAttackerAttrs) {
    blockers.push("missing-attacker-crit-damage-snapshot");
  }
  if (proofHas("attacker elemental damage snapshot") && !hasAttackerAttrs) {
    blockers.push("missing-attacker-elemental-snapshot");
  }
  if (proofHas("season damage bonus snapshot") && !hasAttackerAttrs) {
    blockers.push("missing-season-damage-snapshot");
  }
  if (proofHas("observed final hit value") && positiveNumber(hit?.value) === null) {
    blockers.push("missing-observed-final-hit-value");
  }
  if (proofHas("damage id") && positiveNumber(hit?.damageId ?? hit?.skillKey) === null) {
    blockers.push("missing-damage-id");
  }
  if (proofHas("attacker uid") && positiveNumber(hit?.attackerUid) === null) {
    blockers.push("missing-attacker-uid");
  }
  if (proofHas("source actor") && positiveNumber(provider?.ownerUid ?? provider?.sourceUid) === null) {
    blockers.push("missing-source-actor");
  }
  if (proofHas("recipient actor") && positiveNumber(hit?.targetUid) === null) {
    blockers.push("missing-recipient-actor");
  }
  if (proofHas("target uid") && positiveNumber(hit?.targetUid) === null) {
    blockers.push("missing-target-uid");
  }
  if (proofHas("crit flag") && typeof hit?.isCrit !== "boolean") {
    blockers.push("missing-crit-flag");
  }
  if (
    proofHas("damage element mapping")
    && positiveNumber(hit?.property) === null
  ) {
    blockers.push("missing-damage-element-map");
  }
  if (proofHas("damage row atk/matk lane")) {
    blockers.push("damage-atk-lane-map-required");
  }
  if (proofHas("source predicate") || proofHas("target/source predicate")) {
    blockers.push("source-predicate-proof-required");
  }
  if (proofHas("cast timeline")) {
    blockers.push("missing-cast-timeline-proof");
  }
  if (
    (proofHas("active buff window") || proofHas("modifier windows"))
    && !asArray(link?.entries).length
  ) {
    blockers.push("missing-active-window-proof");
  }
  if (
    proofHas("stack count at hit time")
    && !hasRuntimeStackEvidence(link)
  ) {
    blockers.push("missing-runtime-stack-count");
  }
  if (proofHas("stack cap or threshold state")) {
    blockers.push("missing-stack-cap-state");
  }
  if (proofHas("target stack state")) {
    if ((targetWindowEval?.linkedStackWindowCount ?? 0) <= 0) {
      if ((targetWindowEval?.linkedWindowCount ?? 0) > 0) blockers.push("missing-target-stack-state");
      else if ((targetWindowEval?.anyWindowCount ?? 0) > 0) blockers.push("target-stack-window-not-linked-to-source");
      else blockers.push("missing-target-stack-state");
    }
  }
  if (
    proofHas("target damage/recount id match")
    && targetStatus.hasStaticTargets
    && !targetStatus.targetMatch
  ) {
    blockers.push("target-damage-mismatch");
  }

  return uniqueSortedStrings(blockers);
}

function strictReplayBlockers(term, hit, link, provider, targetStatus, baseBlockers, targetWindowEval) {
  const blockers = new Set(baseBlockers);
  const zones = asArray(term.formulaZoneIds).map(String).filter(Boolean);
  if (!zones.length) blockers.add("missing-formula-zone");
  if (hasOnlyNonDamageZones(term)) blockers.add("timing-only-not-damage-contribution");
  if (!damageReplayZones(term).length && zones.length > 0) blockers.add("missing-damage-replay-zone");
  for (const blocker of strictValueBlockers(term, provider)) blockers.add(blocker);
  for (const blocker of strictRuntimeBlockers(term, hit, link, provider, targetStatus, targetWindowEval)) blockers.add(blocker);
  if (!term.name && !asArray(term.componentValueHints).length && !isPacketExactTerm(term)) {
    blockers.add("full-term-value-data-missing");
  }
  return [...blockers].sort((left, right) => left.localeCompare(right));
}

function proofRequires(term, fragment) {
  const needle = String(fragment).toLowerCase();
  return asArray(term.runtimeProofRequired).some((value) =>
    String(value).toLowerCase().includes(needle)
  );
}

function needsTargetProofDiagnostic(term, targetStatus, blockers, strictBlockers) {
  return targetStatus.hasStaticTargets
    || blockers.some((blocker) => blocker.includes("target"))
    || strictBlockers.some((blocker) => blocker.includes("target"))
    || proofRequires(term, "target-side")
    || proofRequires(term, "target damage/recount")
    || proofRequires(term, "target stack")
    || proofRequires(term, "target uid");
}

function needsSourcePredicateDiagnostic(term, ruleId, indexes, strictBlockers) {
  const tags = predicateTagsForRule(ruleId, indexes);
  return strictBlockers.includes("source-predicate-proof-required")
    || proofRequires(term, "source predicate")
    || proofRequires(term, "target/source predicate")
    || tags.some((tag) =>
      tag.startsWith("target.")
      || tag.startsWith("source.")
      || tag.startsWith("relationship.")
    );
}

function diagnosticBlockers(strictBlockers, fragments) {
  return asArray(strictBlockers).filter((blocker) => {
    const text = String(blocker).toLowerCase();
    return fragments.some((fragment) => text.includes(fragment));
  });
}

function valueDiagnosticBlockers(strictBlockers) {
  return diagnosticBlockers(strictBlockers, [
    "value",
    "component",
    "tier",
    "owner-party",
    "probability",
  ]);
}

function stackDiagnosticBlockers(strictBlockers) {
  return diagnosticBlockers(strictBlockers, ["stack"]);
}

function damageLaneDiagnosticBlockers(strictBlockers) {
  return diagnosticBlockers(strictBlockers, [
    "snapshot",
    "lane",
    "element-map",
  ]);
}

function needsValueProofDiagnostic(strictBlockers) {
  return valueDiagnosticBlockers(strictBlockers).length > 0;
}

function needsStackProofDiagnostic(term, strictBlockers) {
  return stackDiagnosticBlockers(strictBlockers).length > 0
    || String(term.stackPolicy ?? "none").toLowerCase() !== "none"
    || proofRequires(term, "stack count at hit time")
    || proofRequires(term, "stack cap")
    || proofRequires(term, "target stack");
}

function needsDamageLaneDiagnostic(term, strictBlockers) {
  return damageLaneDiagnosticBlockers(strictBlockers).length > 0
    || proofRequires(term, "attacker stat snapshot")
    || proofRequires(term, "attacker crit-rate snapshot")
    || proofRequires(term, "attacker crit-damage snapshot")
    || proofRequires(term, "attacker elemental damage snapshot")
    || proofRequires(term, "season damage bonus snapshot")
    || proofRequires(term, "damage row atk/matk lane")
    || proofRequires(term, "damage element mapping");
}

function classifyStrictReplay(term, strictBlockers) {
  if (!asArray(term.formulaZoneIds).length) return "not-formula-term";
  if (hasOnlyNonDamageZones(term)) return "timing-only";
  if (!damageReplayZones(term).length) return "not-damage-replay-term";
  if (!strictBlockers.length) {
    return isPacketExactTerm(term) ? "strict-exact-replay-ready" : "strict-formula-replay-ready";
  }
  if (strictBlockers.some((blocker) => blocker.includes("target"))) return "strict-needs-target-proof";
  if (strictBlockers.some((blocker) => blocker.includes("stack"))) return "strict-needs-stack-proof";
  if (strictBlockers.some((blocker) => blocker.includes("probability-term"))) {
    return "strict-needs-probability-model";
  }
  if (strictBlockers.some((blocker) => blocker.includes("value") || blocker.includes("component"))) {
    return "strict-needs-value-proof";
  }
  if (strictBlockers.some((blocker) => blocker.includes("snapshot") || blocker.includes("lane") || blocker.includes("element-map"))) {
    return "strict-needs-stat-or-skill-map";
  }
  if (strictBlockers.some((blocker) => blocker.includes("source") || blocker.includes("actor"))) return "strict-needs-source-proof";
  if (strictBlockers.some((blocker) => blocker.includes("equipment"))) return "strict-needs-equipment-proof";
  return "strict-blocked";
}

function proofBlockers(term, entity, hit, link, provider, targetStatus, targetWindowEval) {
  const blockers = new Set();
  const proofRequired = asArray(term.runtimeProofRequired).map((value) => String(value).toLowerCase());
  const zones = asArray(term.formulaZoneIds).map(String).filter(Boolean);
  const stackPolicy = String(term.stackPolicy ?? "none").toLowerCase();
  const scopeKinds = asArray(term.scopeKinds).map((value) => String(value).toLowerCase());

  if (!zones.length) blockers.add("missing-formula-zone");
  if (needsValueResolution(term)) blockers.add("missing-value-resolution");
  if (stackPolicy !== "none" && !hasRuntimeStackEvidence(link)) blockers.add("missing-runtime-stack-count");

  if (proofRequired.includes("observed final hit value") && numberValue(hit?.value) <= 0) {
    blockers.add("missing-final-hit-value");
  }
  if (proofRequired.includes("damage id") && positiveNumber(hit?.damageId) === null && positiveNumber(hit?.skillKey) === null) {
    blockers.add("missing-damage-id");
  }
  if (proofRequired.includes("attacker uid") && positiveNumber(hit?.attackerUid) === null && positiveNumber(hit?.originalAttackerUid) === null) {
    blockers.add("missing-attacker-uid");
  }
  if (proofRequired.includes("target uid") && positiveNumber(hit?.targetUid) === null) {
    blockers.add("missing-target-uid");
  }
  if (
    proofRequired.includes("battle imagine owner/source actor uid")
    && provider.sourceUid === null
    && provider.ownerUid === null
  ) {
    blockers.add("missing-source-actor-uid");
  }
  if (
    proofRequired.includes("recipient actor uid for party-shared effects")
    && provider.hostUid === null
    && positiveNumber(hit?.attackerUid) === null
  ) {
    blockers.add("missing-recipient-actor-uid");
  }
  if (proofRequired.includes("target damage/recount id match")) {
    if (!targetStatus.hasStaticTargets) blockers.add("missing-static-target-map");
    else if (!targetStatus.targetMatch) blockers.add("target-damage-mismatch");
  }
  if (proofRequired.includes("target-side buff/debuff/window state at hit time")) {
    const blocker = targetWindowProofBlocker(
      targetWindowEval,
      "missing-target-side-window",
      "target-side-window-not-linked-to-source",
    );
    if (blocker) blockers.add(blocker);
  }

  const wantsOwnerScope = scopeKinds.some((scope) => scope === "owner" || scope === "self");
  const wantsPartyScope = scopeKinds.some((scope) => scope === "party" || scope === "external");
  if (wantsOwnerScope && provider.scope !== "owner" && !wantsPartyScope) blockers.add("owner-scope-not-proven");
  if (wantsPartyScope && provider.providerName === "unknown") blockers.add("party-source-not-proven");

  if (
    (provider.providerName === "unknown" || provider.providerName.startsWith("#"))
    && (proofRequired.includes("battle imagine owner/source actor uid") || wantsPartyScope)
  ) {
    blockers.add("source-name-unresolved");
  }

  // Equipment statlines are intentionally packet/runtime-derived, not game-file derived.
  if (String(term.runtimeKind ?? "").toLowerCase().includes("equipment")) {
    blockers.add("equipment-statline-runtime-decoder-required");
  }

  return [...blockers].sort((left, right) => left.localeCompare(right));
}

function classifyTerm(term, blockers) {
  if (!asArray(term.formulaZoneIds).length) return "not-formula-term";
  if (!blockers.length) return isPacketExactTerm(term) ? "exact-produced-ready" : "formula-ready-candidate";
  if (blockers.some((blocker) => blocker.includes("target"))) return "needs-target-proof";
  if (blockers.some((blocker) => blocker.includes("stack"))) return "needs-stack-proof";
  if (blockers.some((blocker) => blocker.includes("value"))) return "needs-value-proof";
  if (blockers.some((blocker) => blocker.includes("source") || blocker.includes("actor"))) return "needs-source-proof";
  if (blockers.some((blocker) => blocker.includes("equipment"))) return "needs-equipment-proof";
  return "active-term-blocked";
}

function termLabel(term, fallback = "") {
  const name = term.name
    ?? localizedName(term.names)
    ?? localizedName(term.sourceNames)
    ?? fallback
    ?? term.termKey;
  return `${name} [${term.runtimeKind ?? term.category ?? "term"}:${term.uid ?? term.termKey}]`;
}

function createTermSummary(term, ruleId, sourceName, provider) {
  return {
    termKey: term.termKey,
    uid: term.uid ?? null,
    category: term.category ?? null,
    runtimeKind: term.runtimeKind ?? null,
    label: termLabel(term, sourceName),
    ruleId,
    sourceName,
    sourceKind: null,
    formulaReadiness: term.formulaReadiness ?? null,
    valueResolution: term.valueResolution ?? null,
    formulaZoneIds: asArray(term.formulaZoneIds).map(String),
    scopeKinds: asArray(term.scopeKinds).map(String),
    stackPolicy: term.stackPolicy ?? null,
    statusCounts: new Map(),
    strictReplayStatusCounts: new Map(),
    blockers: new Map(),
    strictReplayBlockers: new Map(),
    providers: new Set(),
    providerScopes: new Set(),
    providerUids: new Set(),
    buffIds: new Set(),
    damageIds: new Set(),
    targetMonsterTypeIds: new Set(),
    files: new Set(),
    stackLayers: new Set(),
    stackCounts: new Set(),
    hits: 0,
    totalValue: 0,
    strictReplayReadyHits: 0,
    strictReplayReadyValue: 0,
    strictReplayBlockedHits: 0,
    critHits: 0,
    luckyHits: 0,
    observedStatus: null,
    strictReplayStatus: null,
    sampleProvider: provider,
  };
}

function updateTermSummary(row, term, link, provider, hit, fileReport, status, blockers, strictStatus, strictBlockers) {
  row.hits += 1;
  row.totalValue += numberValue(hit?.value);
  if (hit?.isCrit) row.critHits += 1;
  if (hit?.isLucky) row.luckyHits += 1;
  addMapCount(row.statusCounts, status);
  addMapCount(row.strictReplayStatusCounts, strictStatus);
  row.observedStatus = preferredStatus(row.observedStatus, status);
  row.strictReplayStatus = preferredStrictStatus(row.strictReplayStatus, strictStatus);
  if (strictStatus === "strict-exact-replay-ready" || strictStatus === "strict-formula-replay-ready") {
    row.strictReplayReadyHits += 1;
    row.strictReplayReadyValue += numberValue(hit?.value);
  } else {
    row.strictReplayBlockedHits += 1;
  }
  addToSet(row.providers, provider.providerName);
  addToSet(row.providerScopes, provider.scope);
  addToSet(row.providerUids, provider.ownerUid ?? provider.sourceUid);
  for (const buffId of link.buffIds) addToSet(row.buffIds, buffId);
  addToSet(row.damageIds, positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey));
  addToSet(row.targetMonsterTypeIds, positiveNumber(hit?.targetMonsterTypeId));
  addToSet(row.files, fileReport.file);
  for (const entry of link.entries) {
    if (Number.isFinite(entry.modifierLayer)) addToSet(row.stackLayers, entry.modifierLayer);
    if (Number.isFinite(entry.modifierCount)) addToSet(row.stackCounts, entry.modifierCount);
  }
  for (const blocker of blockers) addMapCount(row.blockers, blocker);
  for (const blocker of strictBlockers) addMapCount(row.strictReplayBlockers, blocker);
  row.formulaZoneIds = uniqueSortedStrings([...row.formulaZoneIds, ...asArray(term.formulaZoneIds)]);
}

function diagnosticKey(term, link, provider) {
  return [
    term.termKey,
    link.ruleId,
    provider.scope,
    provider.providerName,
    provider.ownerUid ?? provider.sourceUid ?? "?",
  ].join("|");
}

function staticCandidateKey(link, provider) {
  return [
    link.ruleId,
    provider.scope,
    provider.providerName,
    provider.ownerUid ?? provider.sourceUid ?? "?",
  ].join("|");
}

function createStaticTargetCandidateSummary(link, sourceName, provider, targetStatus, terms, indexes) {
  const source = ruleSourceRecord(link.ruleId, indexes).recount;
  return {
    key: staticCandidateKey(link, provider),
    ruleId: link.ruleId,
    sourceName,
    sourceKind: source.sourceKind ?? null,
    sourceId: source.sourceId ?? null,
    targetSignature: targetSignatureForStatus(targetStatus),
    targetDamageIds: new Set(asArray(targetStatus.targetDamageIds).map(String)),
    targetRecountIds: new Set(asArray(targetStatus.targetRecountIds).map(String)),
    linkedTermKeys: new Set(asArray(terms).map((term) => term.termKey).filter(Boolean)),
    linkedTermLabels: new Set(asArray(terms).map((term) => termLabel(term, sourceName)).filter(Boolean)),
    formulaZoneIds: new Set(asArray(terms).flatMap((term) => asArray(term.formulaZoneIds).map(String))),
    valueResolutions: new Set(asArray(terms).map((term) => term.valueResolution).filter(Boolean)),
    stackPolicies: new Set(asArray(terms).map((term) => term.stackPolicy).filter(Boolean)),
    providers: new Set(),
    providerScopes: new Set(),
    providerUids: new Set(),
    buffIds: new Set(),
    sourceUids: new Set(),
    hostUids: new Set(),
    targetUids: new Set(),
    damageIds: new Set(),
    recountParents: new Set(),
    targetMonsterTypeIds: new Set(),
    files: new Set(),
    matchedHitFingerprints: new Set(),
    activeHits: 0,
    activeValue: 0,
    matchedHits: 0,
    matchedValue: 0,
    mismatchHits: 0,
    critHits: 0,
    luckyHits: 0,
  };
}

function updateStaticTargetCandidateSummary(row, link, provider, hit, fileReport, targetStatus, hitFingerprint) {
  row.activeHits += 1;
  row.activeValue += numberValue(hit?.value);
  for (const buffId of link.buffIds) addToSet(row.buffIds, buffId);
  for (const entry of link.entries) {
    addToSet(row.sourceUids, entry.modifierSourceUid);
    addToSet(row.hostUids, entry.modifierHostUid);
  }
  addToSet(row.providers, provider.providerName);
  addToSet(row.providerScopes, provider.scope);
  addToSet(row.providerUids, provider.ownerUid ?? provider.sourceUid);
  addToSet(row.files, fileReport.file);

  if (!targetStatus.targetMatch) {
    row.mismatchHits += 1;
    return;
  }

  row.matchedHits += 1;
  row.matchedValue += numberValue(hit?.value);
  addToSet(row.matchedHitFingerprints, hitFingerprint);
  if (hit?.isCrit) row.critHits += 1;
  if (hit?.isLucky) row.luckyHits += 1;
  for (const id of hitDamageIds(hit)) addToSet(row.damageIds, id);
  addToSet(row.targetUids, positiveNumber(hit?.targetUid));
  addToSet(row.targetMonsterTypeIds, positiveNumber(hit?.targetMonsterTypeId));
  for (const parent of asArray(targetStatus.recountParents)) {
    addToSet(row.recountParents, `${parent.recountId}:${parent.name}`);
  }
}

function recordStaticTargetMatchedHit(global, hitFingerprint, hit, fileReport) {
  if (global.staticTargetMatchedHits.has(hitFingerprint)) return;
  global.staticTargetMatchedHits.set(hitFingerprint, {
    file: fileReport.file,
    value: numberValue(hit?.value),
    damageId: positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey),
  });
}

function createTargetProofSummary(term, link, sourceName, provider, targetStatus, indexes) {
  const source = ruleSourceRecord(link.ruleId, indexes).recount;
  return {
    key: diagnosticKey(term, link, provider),
    termKey: term.termKey,
    ruleId: link.ruleId,
    sourceName,
    sourceKind: source.sourceKind ?? null,
    label: termLabel(term, sourceName),
    formulaZoneIds: asArray(term.formulaZoneIds).map(String),
    valueResolution: term.valueResolution ?? null,
    stackPolicy: term.stackPolicy ?? null,
    targetDamageIds: new Set(asArray(targetStatus.targetDamageIds).map(String)),
    targetRecountIds: new Set(asArray(targetStatus.targetRecountIds).map(String)),
    providers: new Set(),
    providerScopes: new Set(),
    providerUids: new Set(),
    buffIds: new Set(),
    sourceUids: new Set(),
    hostUids: new Set(),
    targetUids: new Set(),
    targetWindowBuffIds: new Set(),
    targetWindowBaseIds: new Set(),
    targetWindowSourceConfigIds: new Set(),
    targetWindowRuleIds: new Set(),
    targetWindowSourceUids: new Set(),
    targetWindowHostUids: new Set(),
    targetWindowStackLayers: new Set(),
    targetWindowStackCounts: new Set(),
    observedTargetWindowBuffIds: new Set(),
    observedTargetWindowRuleIds: new Set(),
    observedTargetWindowUnmappedBuffIds: new Set(),
    damageIds: new Set(),
    recountParents: new Set(),
    targetMonsterTypeIds: new Set(),
    files: new Set(),
    blockers: new Map(),
    strictReplayBlockers: new Map(),
    hits: 0,
    totalValue: 0,
    targetUidMissingHits: 0,
    targetWindowHits: 0,
    anyTargetWindowHits: 0,
    mappedTargetWindowHits: 0,
    sameRuleTargetWindowHits: 0,
    linkedTargetWindowHits: 0,
    unlinkedTargetWindowHits: 0,
    targetStackWindowHits: 0,
    linkedTargetStackWindowHits: 0,
    missingTargetWindowHits: 0,
    staticTargetMatchHits: 0,
    staticTargetMismatchHits: 0,
  };
}

function updateTargetProofSummary(
  row,
  term,
  link,
  provider,
  hit,
  fileReport,
  targetStatus,
  blockers,
  strictBlockers,
  targetWindowEval,
) {
  row.hits += 1;
  row.totalValue += numberValue(hit?.value);
  row.formulaZoneIds = uniqueSortedStrings([...row.formulaZoneIds, ...asArray(term.formulaZoneIds)]);
  for (const buffId of link.buffIds) addToSet(row.buffIds, buffId);
  for (const entry of link.entries) {
    addToSet(row.sourceUids, entry.modifierSourceUid);
    addToSet(row.hostUids, entry.modifierHostUid);
  }
  addToSet(row.providers, provider.providerName);
  addToSet(row.providerScopes, provider.scope);
  addToSet(row.providerUids, provider.ownerUid ?? provider.sourceUid);
  addToSet(row.targetUids, positiveNumber(hit?.targetUid));
  addToSet(row.damageIds, positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey));
  addToSet(row.targetMonsterTypeIds, positiveNumber(hit?.targetMonsterTypeId));
  addToSet(row.files, fileReport.file);
  for (const parent of asArray(targetStatus.recountParents)) {
    addToSet(row.recountParents, `${parent.recountId}:${parent.name}`);
  }
  for (const id of asArray(targetStatus.targetDamageIds)) addToSet(row.targetDamageIds, id);
  for (const id of asArray(targetStatus.targetRecountIds)) addToSet(row.targetRecountIds, id);

  for (const window of asArray(targetWindowEval?.windows)) {
    for (const buffId of window.buffIds) addToSet(row.observedTargetWindowBuffIds, buffId);
    for (const ruleId of window.mappedRuleIds) addToSet(row.observedTargetWindowRuleIds, ruleId);
    for (const buffId of window.unmappedBuffIds) addToSet(row.observedTargetWindowUnmappedBuffIds, buffId);
  }
  for (const window of asArray(targetWindowEval?.linkedWindows)) {
    for (const buffId of window.buffIds) addToSet(row.targetWindowBuffIds, buffId);
    for (const ruleId of window.mappedRuleIds) addToSet(row.targetWindowRuleIds, ruleId);
    addToSet(row.targetWindowBaseIds, window.modifierBaseId);
    addToSet(row.targetWindowSourceConfigIds, window.modifierSourceConfigId);
    addToSet(row.targetWindowSourceUids, window.modifierSourceUid);
    addToSet(row.targetWindowHostUids, window.modifierHostUid);
    addToSet(row.targetWindowStackLayers, window.modifierLayer);
    addToSet(row.targetWindowStackCounts, window.modifierCount);
  }

  const targetUid = positiveNumber(hit?.targetUid);
  if (targetUid === null) {
    row.targetUidMissingHits += 1;
  } else if ((targetWindowEval?.linkedWindowCount ?? 0) > 0) {
    row.targetWindowHits += 1;
    row.linkedTargetWindowHits += 1;
  } else {
    row.missingTargetWindowHits += 1;
  }
  if ((targetWindowEval?.anyWindowCount ?? 0) > 0) row.anyTargetWindowHits += 1;
  if ((targetWindowEval?.mappedWindowCount ?? 0) > 0) row.mappedTargetWindowHits += 1;
  if ((targetWindowEval?.sameRuleWindowCount ?? 0) > 0) row.sameRuleTargetWindowHits += 1;
  if ((targetWindowEval?.unlinkedWindowCount ?? 0) > 0) row.unlinkedTargetWindowHits += 1;
  if ((targetWindowEval?.stackWindowCount ?? 0) > 0) row.targetStackWindowHits += 1;
  if ((targetWindowEval?.linkedStackWindowCount ?? 0) > 0) row.linkedTargetStackWindowHits += 1;

  if (targetStatus.hasStaticTargets) {
    if (targetStatus.targetMatch) row.staticTargetMatchHits += 1;
    else row.staticTargetMismatchHits += 1;
  }

  for (const blocker of blockers) addMapCount(row.blockers, blocker);
  for (const blocker of strictBlockers) addMapCount(row.strictReplayBlockers, blocker);
}

function createSourcePredicateSummary(term, link, sourceName, provider, indexes) {
  const source = ruleSourceRecord(link.ruleId, indexes).recount;
  return {
    key: diagnosticKey(term, link, provider),
    termKey: term.termKey,
    ruleId: link.ruleId,
    sourceName,
    sourceKind: source.sourceKind ?? null,
    label: termLabel(term, sourceName),
    formulaZoneIds: asArray(term.formulaZoneIds).map(String),
    valueResolution: term.valueResolution ?? null,
    stackPolicy: term.stackPolicy ?? null,
    predicateTags: new Set(predicateTagsForRule(link.ruleId, indexes)),
    runtimeProofRequired: new Set(asArray(term.runtimeProofRequired).map(String)),
    providers: new Set(),
    providerScopes: new Set(),
    providerUids: new Set(),
    buffIds: new Set(),
    sourceUids: new Set(),
    hostUids: new Set(),
    targetUids: new Set(),
    damageIds: new Set(),
    files: new Set(),
    blockers: new Map(),
    strictReplayBlockers: new Map(),
    hits: 0,
    totalValue: 0,
    sourcePredicateBlockedHits: 0,
    activeWindowHits: 0,
    missingActiveWindowHits: 0,
    targetWindowHits: 0,
    sourceMatchesAttackerHits: 0,
    hostMatchesAttackerHits: 0,
    ownerMatchesAttackerHits: 0,
    sourceMatchesTargetHits: 0,
    hostMatchesTargetHits: 0,
    unresolvedProviderHits: 0,
  };
}

function updateSourcePredicateSummary(row, term, link, provider, hit, fileReport, strictBlockers, targetWindowEval) {
  row.hits += 1;
  row.totalValue += numberValue(hit?.value);
  row.formulaZoneIds = uniqueSortedStrings([...row.formulaZoneIds, ...asArray(term.formulaZoneIds)]);
  for (const proof of asArray(term.runtimeProofRequired)) addToSet(row.runtimeProofRequired, proof);
  for (const buffId of link.buffIds) addToSet(row.buffIds, buffId);
  addToSet(row.providers, provider.providerName);
  addToSet(row.providerScopes, provider.scope);
  addToSet(row.providerUids, provider.ownerUid ?? provider.sourceUid);
  addToSet(row.targetUids, positiveNumber(hit?.targetUid));
  addToSet(row.damageIds, positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey));
  addToSet(row.files, fileReport.file);
  for (const entry of link.entries) {
    addToSet(row.sourceUids, entry.modifierSourceUid);
    addToSet(row.hostUids, entry.modifierHostUid);
  }
  if (strictBlockers.includes("source-predicate-proof-required")) row.sourcePredicateBlockedHits += 1;
  if (asArray(link.entries).length) row.activeWindowHits += 1;
  else row.missingActiveWindowHits += 1;
  if ((targetWindowEval?.linkedWindowCount ?? 0) > 0) row.targetWindowHits += 1;
  if (provider.providerName === "unknown" || provider.providerName.startsWith("#")) row.unresolvedProviderHits += 1;

  const attackerUid = positiveNumber(hit?.originalAttackerUid) ?? positiveNumber(hit?.attackerUid);
  const targetUid = positiveNumber(hit?.targetUid);
  if (attackerUid !== null) {
    if (provider.sourceUid === attackerUid) row.sourceMatchesAttackerHits += 1;
    if (provider.hostUid === attackerUid) row.hostMatchesAttackerHits += 1;
    if (provider.ownerUid === attackerUid) row.ownerMatchesAttackerHits += 1;
  }
  if (targetUid !== null) {
    if (provider.sourceUid === targetUid) row.sourceMatchesTargetHits += 1;
    if (provider.hostUid === targetUid) row.hostMatchesTargetHits += 1;
  }
  for (const blocker of strictBlockers) addMapCount(row.strictReplayBlockers, blocker);
}

function formulaValueLabel(componentKey, value) {
  const scope = value?.scope ?? "?";
  const amount = value?.rawText ?? value?.value ?? value?.decimalValue ?? "?";
  const unit = value?.unit ? ` ${value.unit}` : "";
  const source = value?.inferredFrom ? ` (${value.inferredFrom})` : "";
  return `${componentKey}:${scope}:${amount}${unit}${source}`;
}

function updateValueHintSets(row, term, provider) {
  const hints = asArray(term.componentValueHints);
  if (!hints.length) {
    addToSet(row.componentKeys, "missing");
    return;
  }

  for (const hint of hints) {
    const componentKey = String(hint?.componentKey ?? "unknown");
    addToSet(row.componentKeys, componentKey);
    addToSet(row.effectClasses, hint?.effectClass);
    addToSet(row.contributionScopes, hint?.contributionScope);
    addToSet(row.directions, hint?.direction);
    for (const formulaTermId of asArray(hint?.formulaTermIds)) addToSet(row.formulaTermIds, formulaTermId);
    for (const group of asArray(hint?.contributionGroups)) addToSet(row.contributionGroups, group);

    const formulaValues = asArray(hint?.values).filter((value) => value?.formulaAmount);
    if (!formulaValues.length) {
      row.componentsWithoutFormulaValue += 1;
      continue;
    }

    const scopedValues = formulaValuesForHint(hint, provider);
    if (scopedValues.length === 1) row.componentsWithSingleScopedValue += 1;
    else if (scopedValues.length > 1) row.componentsWithAmbiguousScopedValues += 1;
    else row.componentsWithoutScopedValue += 1;

    for (const value of formulaValues) {
      addToSet(row.valueScopes, value?.scope);
      const label = formulaValueLabel(componentKey, value);
      addToSet(row.formulaValues, label);
      if (valueScopeMatches(value?.scope, provider.scope)) addToSet(row.scopedFormulaValues, label);
      if (String(value?.scope ?? "").toLowerCase() === "ambiguous") addToSet(row.ambiguousFormulaValues, label);
    }
  }
}

function createValueProofSummary(term, link, sourceName, provider, indexes) {
  const source = ruleSourceRecord(link.ruleId, indexes).recount;
  return {
    key: diagnosticKey(term, link, provider),
    termKey: term.termKey,
    ruleId: link.ruleId,
    sourceName,
    sourceKind: source.sourceKind ?? null,
    label: termLabel(term, sourceName),
    category: term.category ?? null,
    runtimeKind: term.runtimeKind ?? null,
    formulaReadiness: term.formulaReadiness ?? null,
    formulaZoneIds: asArray(term.formulaZoneIds).map(String),
    valueResolution: term.valueResolution ?? null,
    stackPolicy: term.stackPolicy ?? null,
    runtimeProofRequired: new Set(asArray(term.runtimeProofRequired).map(String)),
    descriptionSources: new Set(asArray(term.descriptionRef?.sourceFiles).map(String)),
    hasDescription: Boolean(term.descriptionRef?.hasDescription),
    componentKeys: new Set(),
    effectClasses: new Set(),
    contributionScopes: new Set(),
    directions: new Set(),
    formulaTermIds: new Set(),
    contributionGroups: new Set(),
    valueScopes: new Set(),
    formulaValues: new Set(),
    scopedFormulaValues: new Set(),
    ambiguousFormulaValues: new Set(),
    providers: new Set(),
    providerScopes: new Set(),
    providerUids: new Set(),
    buffIds: new Set(),
    sourceUids: new Set(),
    hostUids: new Set(),
    targetUids: new Set(),
    damageIds: new Set(),
    targetMonsterTypeIds: new Set(),
    files: new Set(),
    strictReplayBlockers: new Map(),
    hits: 0,
    totalValue: 0,
    componentsWithSingleScopedValue: 0,
    componentsWithAmbiguousScopedValues: 0,
    componentsWithoutScopedValue: 0,
    componentsWithoutFormulaValue: 0,
  };
}

function updateValueProofSummary(row, term, link, provider, hit, fileReport, strictBlockers) {
  row.hits += 1;
  row.totalValue += numberValue(hit?.value);
  row.formulaZoneIds = uniqueSortedStrings([...row.formulaZoneIds, ...asArray(term.formulaZoneIds)]);
  row.hasDescription = row.hasDescription || Boolean(term.descriptionRef?.hasDescription);
  for (const sourceFile of asArray(term.descriptionRef?.sourceFiles)) addToSet(row.descriptionSources, sourceFile);
  for (const proof of asArray(term.runtimeProofRequired)) addToSet(row.runtimeProofRequired, proof);
  updateValueHintSets(row, term, provider);
  for (const buffId of link.buffIds) addToSet(row.buffIds, buffId);
  for (const entry of link.entries) {
    addToSet(row.sourceUids, entry.modifierSourceUid);
    addToSet(row.hostUids, entry.modifierHostUid);
  }
  addToSet(row.providers, provider.providerName);
  addToSet(row.providerScopes, provider.scope);
  addToSet(row.providerUids, provider.ownerUid ?? provider.sourceUid);
  addToSet(row.targetUids, positiveNumber(hit?.targetUid));
  addToSet(row.damageIds, positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey));
  addToSet(row.targetMonsterTypeIds, positiveNumber(hit?.targetMonsterTypeId));
  addToSet(row.files, fileReport.file);
  for (const blocker of valueDiagnosticBlockers(strictBlockers)) addMapCount(row.strictReplayBlockers, blocker);
}

function createStackProofSummary(term, link, sourceName, provider, indexes) {
  const source = ruleSourceRecord(link.ruleId, indexes).recount;
  return {
    key: diagnosticKey(term, link, provider),
    termKey: term.termKey,
    ruleId: link.ruleId,
    sourceName,
    sourceKind: source.sourceKind ?? null,
    label: termLabel(term, sourceName),
    formulaZoneIds: asArray(term.formulaZoneIds).map(String),
    valueResolution: term.valueResolution ?? null,
    stackPolicy: term.stackPolicy ?? null,
    runtimeProofRequired: new Set(asArray(term.runtimeProofRequired).map(String)),
    providers: new Set(),
    providerScopes: new Set(),
    providerUids: new Set(),
    buffIds: new Set(),
    sourceUids: new Set(),
    hostUids: new Set(),
    targetUids: new Set(),
    damageIds: new Set(),
    activeStackLayers: new Set(),
    activeStackCounts: new Set(),
    targetWindowStackLayers: new Set(),
    targetWindowStackCounts: new Set(),
    targetWindowBuffIds: new Set(),
    targetWindowRuleIds: new Set(),
    targetWindowBaseIds: new Set(),
    targetWindowSourceConfigIds: new Set(),
    observedTargetStackLayers: new Set(),
    observedTargetStackCounts: new Set(),
    observedTargetWindowBuffIds: new Set(),
    files: new Set(),
    strictReplayBlockers: new Map(),
    hits: 0,
    totalValue: 0,
    activeStackEvidenceHits: 0,
    linkedTargetStackWindowHits: 0,
    anyTargetStackWindowHits: 0,
    missingStackProofHits: 0,
  };
}

function updateStackProofSummary(row, term, link, provider, hit, fileReport, strictBlockers, targetWindowEval) {
  row.hits += 1;
  row.totalValue += numberValue(hit?.value);
  row.formulaZoneIds = uniqueSortedStrings([...row.formulaZoneIds, ...asArray(term.formulaZoneIds)]);
  for (const proof of asArray(term.runtimeProofRequired)) addToSet(row.runtimeProofRequired, proof);
  for (const buffId of link.buffIds) addToSet(row.buffIds, buffId);
  for (const entry of link.entries) {
    addToSet(row.sourceUids, entry.modifierSourceUid);
    addToSet(row.hostUids, entry.modifierHostUid);
    addToSet(row.activeStackLayers, entry.modifierLayer);
    addToSet(row.activeStackCounts, entry.modifierCount);
  }
  addToSet(row.providers, provider.providerName);
  addToSet(row.providerScopes, provider.scope);
  addToSet(row.providerUids, provider.ownerUid ?? provider.sourceUid);
  addToSet(row.targetUids, positiveNumber(hit?.targetUid));
  addToSet(row.damageIds, positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey));
  addToSet(row.files, fileReport.file);

  for (const window of asArray(targetWindowEval?.windows)) {
    for (const buffId of window.buffIds) addToSet(row.observedTargetWindowBuffIds, buffId);
    addToSet(row.observedTargetStackLayers, window.modifierLayer);
    addToSet(row.observedTargetStackCounts, window.modifierCount);
  }
  for (const window of asArray(targetWindowEval?.linkedWindows)) {
    for (const buffId of window.buffIds) addToSet(row.targetWindowBuffIds, buffId);
    for (const ruleId of window.mappedRuleIds) addToSet(row.targetWindowRuleIds, ruleId);
    addToSet(row.targetWindowBaseIds, window.modifierBaseId);
    addToSet(row.targetWindowSourceConfigIds, window.modifierSourceConfigId);
    addToSet(row.targetWindowStackLayers, window.modifierLayer);
    addToSet(row.targetWindowStackCounts, window.modifierCount);
  }

  if (hasRuntimeStackEvidence(link)) row.activeStackEvidenceHits += 1;
  if ((targetWindowEval?.linkedStackWindowCount ?? 0) > 0) row.linkedTargetStackWindowHits += 1;
  if ((targetWindowEval?.stackWindowCount ?? 0) > 0) row.anyTargetStackWindowHits += 1;
  const stackBlockers = stackDiagnosticBlockers(strictBlockers);
  if (stackBlockers.length) row.missingStackProofHits += 1;
  for (const blocker of stackBlockers) addMapCount(row.strictReplayBlockers, blocker);
}

function damageAttrRecordForHit(hit, indexes) {
  const damageId = positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey);
  if (damageId === null) return null;
  return asObject(indexes.damageAttrNames?.[String(damageId)]);
}

function damageAttrLabel(record) {
  if (!record || !Object.keys(record).length) return "";
  return localizedName(record.Names, record.Name ?? record.LinkedBuffName ?? record.LinkedSkillName ?? "");
}

function createDamageLaneSummary(term, link, sourceName, provider, indexes) {
  const source = ruleSourceRecord(link.ruleId, indexes).recount;
  return {
    key: diagnosticKey(term, link, provider),
    termKey: term.termKey,
    ruleId: link.ruleId,
    sourceName,
    sourceKind: source.sourceKind ?? null,
    label: termLabel(term, sourceName),
    formulaZoneIds: asArray(term.formulaZoneIds).map(String),
    valueResolution: term.valueResolution ?? null,
    stackPolicy: term.stackPolicy ?? null,
    runtimeProofRequired: new Set(asArray(term.runtimeProofRequired).map(String)),
    providers: new Set(),
    providerScopes: new Set(),
    providerUids: new Set(),
    buffIds: new Set(),
    damageIds: new Set(),
    damageLabels: new Set(),
    damageKinds: new Set(),
    detailKinds: new Set(),
    properties: new Set(),
    damageModes: new Set(),
    attackerAttrIds: new Set(),
    targetAttrIds: new Set(),
    files: new Set(),
    strictReplayBlockers: new Map(),
    hits: 0,
    totalValue: 0,
    hitsWithDamageAttrRow: 0,
    hitsWithAttackerAttrs: 0,
    hitsWithTargetAttrs: 0,
  };
}

function updateDamageLaneSummary(row, term, link, provider, hit, fileReport, strictBlockers, indexes) {
  row.hits += 1;
  row.totalValue += numberValue(hit?.value);
  row.formulaZoneIds = uniqueSortedStrings([...row.formulaZoneIds, ...asArray(term.formulaZoneIds)]);
  for (const proof of asArray(term.runtimeProofRequired)) addToSet(row.runtimeProofRequired, proof);
  for (const buffId of link.buffIds) addToSet(row.buffIds, buffId);
  addToSet(row.providers, provider.providerName);
  addToSet(row.providerScopes, provider.scope);
  addToSet(row.providerUids, provider.ownerUid ?? provider.sourceUid);
  addToSet(row.damageIds, positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey));
  addToSet(row.properties, hit?.property);
  addToSet(row.damageModes, hit?.damageMode);
  addToSet(row.files, fileReport.file);

  const damageAttr = damageAttrRecordForHit(hit, indexes);
  if (Object.keys(damageAttr).length) {
    row.hitsWithDamageAttrRow += 1;
    addToSet(row.damageLabels, damageAttrLabel(damageAttr));
    addToSet(row.damageKinds, damageAttr.DamageKind);
    addToSet(row.detailKinds, damageAttr.DetailKind);
  }
  if (asArray(hit?.attackerAttrs).length) row.hitsWithAttackerAttrs += 1;
  if (asArray(hit?.targetAttrs).length) row.hitsWithTargetAttrs += 1;
  for (const attr of asArray(hit?.attackerAttrs)) addToSet(row.attackerAttrIds, attr?.attrId);
  for (const attr of asArray(hit?.targetAttrs)) addToSet(row.targetAttrIds, attr?.attrId);
  for (const blocker of damageLaneDiagnosticBlockers(strictBlockers)) addMapCount(row.strictReplayBlockers, blocker);
}

function preferredStatus(current, next) {
  if (!current) return next;
  const rank = {
    "exact-produced-ready": 0,
    "formula-ready-candidate": 1,
    "needs-value-proof": 2,
    "needs-stack-proof": 3,
    "needs-target-proof": 4,
    "needs-source-proof": 5,
    "needs-equipment-proof": 6,
    "active-term-blocked": 7,
    "not-formula-term": 8,
  };
  return (rank[next] ?? 99) < (rank[current] ?? 99) ? next : current;
}

function preferredStrictStatus(current, next) {
  if (!current) return next;
  const rank = {
    "strict-exact-replay-ready": 0,
    "strict-formula-replay-ready": 1,
    "strict-needs-value-proof": 2,
    "strict-needs-stack-proof": 3,
    "strict-needs-target-proof": 4,
    "strict-needs-stat-or-skill-map": 5,
    "strict-needs-probability-model": 6,
    "strict-needs-source-proof": 7,
    "strict-needs-equipment-proof": 8,
    "strict-blocked": 9,
    "timing-only": 10,
    "not-damage-replay-term": 11,
    "not-formula-term": 12,
  };
  return (rank[next] ?? 99) < (rank[current] ?? 99) ? next : current;
}

function serializeTermSummary(row) {
  return {
    termKey: row.termKey,
    uid: row.uid,
    category: row.category,
    runtimeKind: row.runtimeKind,
    label: row.label,
    ruleId: row.ruleId,
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    observedStatus: row.observedStatus ?? "active-term-blocked",
    strictReplayStatus: row.strictReplayStatus ?? "strict-blocked",
    formulaReadiness: row.formulaReadiness,
    valueResolution: row.valueResolution,
    formulaZoneIds: row.formulaZoneIds,
    scopeKinds: row.scopeKinds,
    stackPolicy: row.stackPolicy,
    hits: row.hits,
    totalValue: Math.round(row.totalValue),
    strictReplayReadyHits: row.strictReplayReadyHits,
    strictReplayReadyValue: Math.round(row.strictReplayReadyValue),
    strictReplayBlockedHits: row.strictReplayBlockedHits,
    critHits: row.critHits,
    luckyHits: row.luckyHits,
    statusCounts: countMapToObject(row.statusCounts, 20),
    strictReplayStatusCounts: countMapToObject(row.strictReplayStatusCounts, 20),
    blockers: countMapToObject(row.blockers, 20),
    strictReplayBlockers: countMapToObject(row.strictReplayBlockers, 20),
    providers: setToSortedArray(row.providers),
    providerScopes: setToSortedArray(row.providerScopes),
    providerUids: setToSortedArray(row.providerUids),
    buffIds: setToSortedArray(row.buffIds),
    damageIds: setToSortedArray(row.damageIds),
    targetMonsterTypeIds: setToSortedArray(row.targetMonsterTypeIds),
    stackLayers: setToSortedArray(row.stackLayers),
    stackCounts: setToSortedArray(row.stackCounts),
    files: setToSortedArray(row.files),
  };
}

function serializeTargetProofSummary(row) {
  return {
    termKey: row.termKey,
    ruleId: row.ruleId,
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    label: row.label,
    formulaZoneIds: row.formulaZoneIds,
    valueResolution: row.valueResolution,
    stackPolicy: row.stackPolicy,
    hits: row.hits,
    totalValue: Math.round(row.totalValue),
    targetUidMissingHits: row.targetUidMissingHits,
    targetWindowHits: row.targetWindowHits,
    anyTargetWindowHits: row.anyTargetWindowHits,
    mappedTargetWindowHits: row.mappedTargetWindowHits,
    sameRuleTargetWindowHits: row.sameRuleTargetWindowHits,
    linkedTargetWindowHits: row.linkedTargetWindowHits,
    unlinkedTargetWindowHits: row.unlinkedTargetWindowHits,
    targetStackWindowHits: row.targetStackWindowHits,
    linkedTargetStackWindowHits: row.linkedTargetStackWindowHits,
    missingTargetWindowHits: row.missingTargetWindowHits,
    staticTargetMatchHits: row.staticTargetMatchHits,
    staticTargetMismatchHits: row.staticTargetMismatchHits,
    providers: setToSortedArray(row.providers),
    providerScopes: setToSortedArray(row.providerScopes),
    providerUids: setToSortedArray(row.providerUids),
    buffIds: setToSortedArray(row.buffIds),
    sourceUids: setToSortedArray(row.sourceUids),
    hostUids: setToSortedArray(row.hostUids),
    targetUids: setToSortedArray(row.targetUids),
    targetWindowBuffIds: setToSortedArray(row.targetWindowBuffIds),
    targetWindowBaseIds: setToSortedArray(row.targetWindowBaseIds),
    targetWindowSourceConfigIds: setToSortedArray(row.targetWindowSourceConfigIds),
    targetWindowRuleIds: setToSortedArray(row.targetWindowRuleIds),
    targetWindowSourceUids: setToSortedArray(row.targetWindowSourceUids),
    targetWindowHostUids: setToSortedArray(row.targetWindowHostUids),
    targetWindowStackLayers: setToSortedArray(row.targetWindowStackLayers),
    targetWindowStackCounts: setToSortedArray(row.targetWindowStackCounts),
    observedTargetWindowBuffIds: setToSortedArray(row.observedTargetWindowBuffIds),
    observedTargetWindowRuleIds: setToSortedArray(row.observedTargetWindowRuleIds),
    observedTargetWindowUnmappedBuffIds: setToSortedArray(row.observedTargetWindowUnmappedBuffIds),
    damageIds: setToSortedArray(row.damageIds),
    targetDamageIds: setToSortedArray(row.targetDamageIds),
    targetRecountIds: setToSortedArray(row.targetRecountIds),
    recountParents: setToSortedArray(row.recountParents),
    targetMonsterTypeIds: setToSortedArray(row.targetMonsterTypeIds),
    blockers: countMapToObject(row.blockers, 20),
    strictReplayBlockers: countMapToObject(row.strictReplayBlockers, 20),
    files: setToSortedArray(row.files),
  };
}

function serializeTargetWindowEvidenceSummary(row) {
  return {
    key: row.key,
    hits: row.hits,
    windowOccurrences: row.windowOccurrences,
    totalValue: Math.round(row.totalValue),
    modifierBaseIds: setToSortedArray(row.modifierBaseIds),
    modifierSourceConfigIds: setToSortedArray(row.modifierSourceConfigIds),
    mappedRuleIds: setToSortedArray(row.mappedRuleIds),
    mappedRuleNames: setToSortedArray(row.mappedRuleNames),
    unmappedBuffIds: setToSortedArray(row.unmappedBuffIds),
    targetSides: setToSortedArray(row.targetSides),
    targetUids: setToSortedArray(row.targetUids),
    sourceUids: setToSortedArray(row.sourceUids),
    hostUids: setToSortedArray(row.hostUids),
    stackLayers: setToSortedArray(row.stackLayers),
    stackCounts: setToSortedArray(row.stackCounts),
    buffLevels: setToSortedArray(row.buffLevels),
    damageIds: setToSortedArray(row.damageIds),
    targetMonsterTypeIds: setToSortedArray(row.targetMonsterTypeIds),
    files: setToSortedArray(row.files),
  };
}

function serializeStaticTargetCandidateSummary(row, matchedHitCounts = new Map()) {
  const overlappingMatchedHits = [...row.matchedHitFingerprints]
    .filter((fingerprint) => (matchedHitCounts.get(fingerprint) ?? 0) > 1)
    .length;
  return {
    key: row.key,
    ruleId: row.ruleId,
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    sourceId: row.sourceId,
    targetSignature: row.targetSignature,
    targetDamageIds: setToSortedArray(row.targetDamageIds),
    targetRecountIds: setToSortedArray(row.targetRecountIds),
    linkedTermKeys: setToSortedArray(row.linkedTermKeys, 12),
    linkedTermLabels: setToSortedArray(row.linkedTermLabels, 12),
    formulaZoneIds: setToSortedArray(row.formulaZoneIds),
    valueResolutions: setToSortedArray(row.valueResolutions),
    stackPolicies: setToSortedArray(row.stackPolicies),
    providers: setToSortedArray(row.providers),
    providerScopes: setToSortedArray(row.providerScopes),
    providerUids: setToSortedArray(row.providerUids),
    buffIds: setToSortedArray(row.buffIds),
    sourceUids: setToSortedArray(row.sourceUids),
    hostUids: setToSortedArray(row.hostUids),
    targetUids: setToSortedArray(row.targetUids),
    damageIds: setToSortedArray(row.damageIds),
    recountParents: setToSortedArray(row.recountParents),
    targetMonsterTypeIds: setToSortedArray(row.targetMonsterTypeIds),
    files: setToSortedArray(row.files),
    activeHits: row.activeHits,
    activeValue: Math.round(row.activeValue),
    matchedHits: row.matchedHits,
    matchedValue: Math.round(row.matchedValue),
    mismatchHits: row.mismatchHits,
    critHits: row.critHits,
    luckyHits: row.luckyHits,
    overlappingMatchedHits,
    exactAssignedHits: row.exactAssignedHits ?? 0,
    exactAssignedValue: Math.round(row.exactAssignedValue ?? 0),
    exactOverlapOutHits: row.exactOverlapOutHits ?? 0,
    exactOverlapOutValue: Math.round(row.exactOverlapOutValue ?? 0),
    exactAmbiguousAssignmentHits: row.exactAmbiguousAssignmentHits ?? 0,
    exactOverlappedBy: setToSortedArray(row.exactOverlappedBy ?? new Set()),
    matchedShareOfActiveHits: row.activeHits > 0 ? row.matchedHits / row.activeHits : 0,
    matchedShareOfActiveValue: row.activeValue > 0 ? row.matchedValue / row.activeValue : 0,
    exactAssignedShareOfMatchedHits: row.matchedHits > 0 ? (row.exactAssignedHits ?? 0) / row.matchedHits : 0,
    exactAssignedShareOfMatchedValue: row.matchedValue > 0 ? (row.exactAssignedValue ?? 0) / row.matchedValue : 0,
    sameTargetSignatureRows: 0,
  };
}

function serializeSourcePredicateSummary(row) {
  return {
    termKey: row.termKey,
    ruleId: row.ruleId,
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    label: row.label,
    formulaZoneIds: row.formulaZoneIds,
    valueResolution: row.valueResolution,
    stackPolicy: row.stackPolicy,
    predicateTags: setToSortedArray(row.predicateTags),
    runtimeProofRequired: setToSortedArray(row.runtimeProofRequired),
    hits: row.hits,
    totalValue: Math.round(row.totalValue),
    sourcePredicateBlockedHits: row.sourcePredicateBlockedHits,
    activeWindowHits: row.activeWindowHits,
    missingActiveWindowHits: row.missingActiveWindowHits,
    targetWindowHits: row.targetWindowHits,
    sourceMatchesAttackerHits: row.sourceMatchesAttackerHits,
    hostMatchesAttackerHits: row.hostMatchesAttackerHits,
    ownerMatchesAttackerHits: row.ownerMatchesAttackerHits,
    sourceMatchesTargetHits: row.sourceMatchesTargetHits,
    hostMatchesTargetHits: row.hostMatchesTargetHits,
    unresolvedProviderHits: row.unresolvedProviderHits,
    providers: setToSortedArray(row.providers),
    providerScopes: setToSortedArray(row.providerScopes),
    providerUids: setToSortedArray(row.providerUids),
    buffIds: setToSortedArray(row.buffIds),
    sourceUids: setToSortedArray(row.sourceUids),
    hostUids: setToSortedArray(row.hostUids),
    targetUids: setToSortedArray(row.targetUids),
    damageIds: setToSortedArray(row.damageIds),
    strictReplayBlockers: countMapToObject(row.strictReplayBlockers, 20),
    files: setToSortedArray(row.files),
  };
}

function serializeValueProofSummary(row) {
  return {
    termKey: row.termKey,
    ruleId: row.ruleId,
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    label: row.label,
    category: row.category,
    runtimeKind: row.runtimeKind,
    formulaReadiness: row.formulaReadiness,
    formulaZoneIds: row.formulaZoneIds,
    valueResolution: row.valueResolution,
    stackPolicy: row.stackPolicy,
    hasDescription: row.hasDescription,
    descriptionSources: setToSortedArray(row.descriptionSources),
    componentKeys: setToSortedArray(row.componentKeys),
    effectClasses: setToSortedArray(row.effectClasses),
    contributionScopes: setToSortedArray(row.contributionScopes),
    directions: setToSortedArray(row.directions),
    formulaTermIds: setToSortedArray(row.formulaTermIds),
    contributionGroups: setToSortedArray(row.contributionGroups),
    valueScopes: setToSortedArray(row.valueScopes),
    formulaValues: setToSortedArray(row.formulaValues, 36),
    scopedFormulaValues: setToSortedArray(row.scopedFormulaValues, 24),
    ambiguousFormulaValues: setToSortedArray(row.ambiguousFormulaValues, 24),
    runtimeProofRequired: setToSortedArray(row.runtimeProofRequired, 30),
    hits: row.hits,
    totalValue: Math.round(row.totalValue),
    componentsWithSingleScopedValue: row.componentsWithSingleScopedValue,
    componentsWithAmbiguousScopedValues: row.componentsWithAmbiguousScopedValues,
    componentsWithoutScopedValue: row.componentsWithoutScopedValue,
    componentsWithoutFormulaValue: row.componentsWithoutFormulaValue,
    providers: setToSortedArray(row.providers),
    providerScopes: setToSortedArray(row.providerScopes),
    providerUids: setToSortedArray(row.providerUids),
    buffIds: setToSortedArray(row.buffIds),
    sourceUids: setToSortedArray(row.sourceUids),
    hostUids: setToSortedArray(row.hostUids),
    targetUids: setToSortedArray(row.targetUids),
    damageIds: setToSortedArray(row.damageIds),
    targetMonsterTypeIds: setToSortedArray(row.targetMonsterTypeIds),
    strictReplayBlockers: countMapToObject(row.strictReplayBlockers, 20),
    files: setToSortedArray(row.files),
  };
}

function serializeStackProofSummary(row) {
  return {
    termKey: row.termKey,
    ruleId: row.ruleId,
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    label: row.label,
    formulaZoneIds: row.formulaZoneIds,
    valueResolution: row.valueResolution,
    stackPolicy: row.stackPolicy,
    runtimeProofRequired: setToSortedArray(row.runtimeProofRequired, 30),
    hits: row.hits,
    totalValue: Math.round(row.totalValue),
    activeStackEvidenceHits: row.activeStackEvidenceHits,
    linkedTargetStackWindowHits: row.linkedTargetStackWindowHits,
    anyTargetStackWindowHits: row.anyTargetStackWindowHits,
    missingStackProofHits: row.missingStackProofHits,
    providers: setToSortedArray(row.providers),
    providerScopes: setToSortedArray(row.providerScopes),
    providerUids: setToSortedArray(row.providerUids),
    buffIds: setToSortedArray(row.buffIds),
    sourceUids: setToSortedArray(row.sourceUids),
    hostUids: setToSortedArray(row.hostUids),
    targetUids: setToSortedArray(row.targetUids),
    damageIds: setToSortedArray(row.damageIds),
    activeStackLayers: setToSortedArray(row.activeStackLayers),
    activeStackCounts: setToSortedArray(row.activeStackCounts),
    targetWindowStackLayers: setToSortedArray(row.targetWindowStackLayers),
    targetWindowStackCounts: setToSortedArray(row.targetWindowStackCounts),
    targetWindowBuffIds: setToSortedArray(row.targetWindowBuffIds),
    targetWindowRuleIds: setToSortedArray(row.targetWindowRuleIds),
    targetWindowBaseIds: setToSortedArray(row.targetWindowBaseIds),
    targetWindowSourceConfigIds: setToSortedArray(row.targetWindowSourceConfigIds),
    observedTargetStackLayers: setToSortedArray(row.observedTargetStackLayers),
    observedTargetStackCounts: setToSortedArray(row.observedTargetStackCounts),
    observedTargetWindowBuffIds: setToSortedArray(row.observedTargetWindowBuffIds),
    strictReplayBlockers: countMapToObject(row.strictReplayBlockers, 20),
    files: setToSortedArray(row.files),
  };
}

function serializeDamageLaneSummary(row) {
  return {
    termKey: row.termKey,
    ruleId: row.ruleId,
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    label: row.label,
    formulaZoneIds: row.formulaZoneIds,
    valueResolution: row.valueResolution,
    stackPolicy: row.stackPolicy,
    runtimeProofRequired: setToSortedArray(row.runtimeProofRequired, 30),
    hits: row.hits,
    totalValue: Math.round(row.totalValue),
    hitsWithDamageAttrRow: row.hitsWithDamageAttrRow,
    hitsWithAttackerAttrs: row.hitsWithAttackerAttrs,
    hitsWithTargetAttrs: row.hitsWithTargetAttrs,
    providers: setToSortedArray(row.providers),
    providerScopes: setToSortedArray(row.providerScopes),
    providerUids: setToSortedArray(row.providerUids),
    buffIds: setToSortedArray(row.buffIds),
    damageIds: setToSortedArray(row.damageIds),
    damageLabels: setToSortedArray(row.damageLabels),
    damageKinds: setToSortedArray(row.damageKinds),
    detailKinds: setToSortedArray(row.detailKinds),
    properties: setToSortedArray(row.properties),
    damageModes: setToSortedArray(row.damageModes),
    attackerAttrIds: setToSortedArray(row.attackerAttrIds, 48),
    targetAttrIds: setToSortedArray(row.targetAttrIds, 48),
    strictReplayBlockers: countMapToObject(row.strictReplayBlockers, 20),
    files: setToSortedArray(row.files),
  };
}

function topTargetProofRows(map, limit) {
  return [...map.values()]
    .sort((left, right) => {
      const leftBlocked = left.missingTargetWindowHits + left.staticTargetMismatchHits + left.targetUidMissingHits;
      const rightBlocked = right.missingTargetWindowHits + right.staticTargetMismatchHits + right.targetUidMissingHits;
      if (rightBlocked !== leftBlocked) return rightBlocked - leftBlocked;
      const valueDelta = (right.totalValue ?? 0) - (left.totalValue ?? 0);
      if (valueDelta !== 0) return valueDelta;
      return (right.hits ?? 0) - (left.hits ?? 0);
    })
    .slice(0, limit);
}

function topStaticTargetMatchedRows(map, limit) {
  return [...map.values()]
    .filter((row) => (row.staticTargetMatchHits ?? 0) > 0)
    .sort((left, right) => {
      if (right.staticTargetMatchHits !== left.staticTargetMatchHits) {
        return right.staticTargetMatchHits - left.staticTargetMatchHits;
      }
      const valueDelta = (right.totalValue ?? 0) - (left.totalValue ?? 0);
      if (valueDelta !== 0) return valueDelta;
      return (right.hits ?? 0) - (left.hits ?? 0);
    })
    .slice(0, limit);
}

function topStaticTargetCandidateRows(map, limit) {
  return [...map.values()]
    .filter((row) => (row.matchedHits ?? 0) > 0)
    .sort((left, right) => {
      const valueDelta = (right.matchedValue ?? 0) - (left.matchedValue ?? 0);
      if (valueDelta !== 0) return valueDelta;
      return (right.matchedHits ?? 0) - (left.matchedHits ?? 0);
    })
    .slice(0, limit);
}

function topExactStaticContributionRows(rows, limit) {
  return [...rows]
    .filter((row) => (row.exactAssignedHits ?? 0) > 0)
    .sort((left, right) => {
      const valueDelta = (right.exactAssignedValue ?? 0) - (left.exactAssignedValue ?? 0);
      if (valueDelta !== 0) return valueDelta;
      const hitDelta = (right.exactAssignedHits ?? 0) - (left.exactAssignedHits ?? 0);
      if (hitDelta !== 0) return hitDelta;
      return String(left.sourceName).localeCompare(String(right.sourceName));
    })
    .slice(0, limit);
}

function staticCandidateMatchedHitCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const fingerprint of row.matchedHitFingerprints) {
      counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }
  }
  return counts;
}

function staticCandidateHitClaims(rows) {
  const claims = new Map();
  for (const row of rows) {
    for (const fingerprint of row.matchedHitFingerprints) {
      const list = claims.get(fingerprint) ?? [];
      list.push(row);
      claims.set(fingerprint, list);
    }
  }
  return claims;
}

function collectionSize(value) {
  if (value instanceof Set || Array.isArray(value)) return value.size ?? value.length;
  return 0;
}

function staticCandidateSpecificity(row) {
  const targetDamageIdCount = collectionSize(row.targetDamageIds);
  const targetRecountIdCount = collectionSize(row.targetRecountIds);
  return {
    targetIdCount: targetDamageIdCount + targetRecountIdCount,
    targetDamageIdCount,
    targetRecountIdCount,
    linkedTermCount: collectionSize(row.linkedTermKeys),
    activeHits: row.activeHits ?? 0,
  };
}

function compareStaticCandidateAssignment(left, right) {
  const leftSpec = staticCandidateSpecificity(left);
  const rightSpec = staticCandidateSpecificity(right);
  for (const key of [
    "targetIdCount",
    "targetDamageIdCount",
    "targetRecountIdCount",
    "linkedTermCount",
    "activeHits",
  ]) {
    const delta = leftSpec[key] - rightSpec[key];
    if (delta !== 0) return delta;
  }
  const matchedValueDelta = (right.matchedValue ?? 0) - (left.matchedValue ?? 0);
  if (matchedValueDelta !== 0) return matchedValueDelta;
  return String(left.sourceName).localeCompare(String(right.sourceName));
}

function resetStaticTargetAssignments(rows) {
  for (const row of rows) {
    row.exactAssignedHits = 0;
    row.exactAssignedValue = 0;
    row.exactOverlapOutHits = 0;
    row.exactOverlapOutValue = 0;
    row.exactAmbiguousAssignmentHits = 0;
    row.exactOverlappedBy = new Set();
  }
}

function assignStaticTargetContributions(rows, matchedHits) {
  resetStaticTargetAssignments(rows);
  const claimsByHit = staticCandidateHitClaims(rows);
  const totals = {
    assignedHits: 0,
    assignedValue: 0,
    overlapOutHits: 0,
    overlapOutValue: 0,
    ambiguousAssignmentHits: 0,
    rowsWithAssigned: 0,
  };

  for (const [fingerprint, claimRows] of claimsByHit.entries()) {
    const hit = matchedHits.get(fingerprint);
    const hitValue = numberValue(hit?.value);
    const sortedClaims = [...claimRows].sort(compareStaticCandidateAssignment);
    const winner = sortedClaims[0];
    if (!winner) continue;

    const ambiguous = sortedClaims.length > 1
      && compareStaticCandidateAssignment(sortedClaims[0], sortedClaims[1]) === 0;
    winner.exactAssignedHits += 1;
    winner.exactAssignedValue += hitValue;
    totals.assignedHits += 1;
    totals.assignedValue += hitValue;
    if (ambiguous) {
      winner.exactAmbiguousAssignmentHits += 1;
      totals.ambiguousAssignmentHits += 1;
    }

    for (const row of sortedClaims.slice(1)) {
      row.exactOverlapOutHits += 1;
      row.exactOverlapOutValue += hitValue;
      addToSet(row.exactOverlappedBy, winner.sourceName);
      totals.overlapOutHits += 1;
      totals.overlapOutValue += hitValue;
    }
  }

  totals.rowsWithAssigned = rows.filter((row) => row.exactAssignedHits > 0).length;
  return totals;
}

function staticCandidateCollisionCounts(rows) {
  const signatureCounts = new Map();
  for (const row of rows) {
    if (!row.targetSignature || row.matchedHits <= 0) continue;
    const key = `${row.targetSignature}|provider:${row.providerUids.join(",") || row.providers.join(",")}`;
    signatureCounts.set(key, (signatureCounts.get(key) ?? 0) + 1);
  }
  return signatureCounts;
}

function annotateStaticCandidateCollisions(rows, signatureCounts = staticCandidateCollisionCounts(rows)) {
  return rows.map((row) => {
    const key = `${row.targetSignature}|provider:${row.providerUids.join(",") || row.providers.join(",")}`;
    return {
      ...row,
      sameTargetSignatureRows: signatureCounts.get(key) ?? 0,
    };
  });
}

function topSourcePredicateRows(map, limit) {
  return [...map.values()]
    .sort((left, right) => {
      if (right.sourcePredicateBlockedHits !== left.sourcePredicateBlockedHits) {
        return right.sourcePredicateBlockedHits - left.sourcePredicateBlockedHits;
      }
      if (right.unresolvedProviderHits !== left.unresolvedProviderHits) {
        return right.unresolvedProviderHits - left.unresolvedProviderHits;
      }
      const valueDelta = (right.totalValue ?? 0) - (left.totalValue ?? 0);
      if (valueDelta !== 0) return valueDelta;
      return (right.hits ?? 0) - (left.hits ?? 0);
    })
    .slice(0, limit);
}

function createGlobalReport(indexes, inputs) {
  return {
    generatedAt: new Date().toISOString(),
    inputs: inputs.map((file) => path.relative(repoRoot, file).replaceAll("\\", "/")),
    termTable: {
      path: path.relative(repoRoot, indexes.termTablePath).replaceAll("\\", "/"),
      fullPath: indexes.fullTermTablePath
        ? path.relative(repoRoot, indexes.fullTermTablePath).replaceAll("\\", "/")
        : null,
      schemaVersion: indexes.termTable.schemaVersion ?? null,
      generatedBy: indexes.termTable.generatedBy ?? null,
      stats: indexes.termTable.stats ?? null,
    },
    notes: [
      "Dev-only proof audit. It does not change live parsing, history totals, or DPS recount behavior.",
      "Packet final damage remains the truth; this only checks whether active UID evidence is strong enough to replay formula terms later.",
      "Equipment statlines remain packet/runtime-derived and are intentionally blocked until the equipment decoder proves them.",
    ],
    summary: {
      files: 0,
      hits: 0,
      totalValue: 0,
      activeRuleObservations: 0,
      activeTermObservations: 0,
      strictReplayReadyObservations: 0,
      strictReplayBlockedObservations: 0,
      activeRulesWithoutTerms: 0,
      unknownActiveModifierObservations: 0,
      statusCounts: {},
      strictReplayStatusCounts: {},
      formulaZoneCounts: {},
      blockerCounts: {},
      strictReplayBlockerCounts: {},
      sourceRulesWithoutTerms: {},
      unknownActiveBuffIds: {},
    },
    files: [],
    termSummaries: new Map(),
    staticTargetCandidateSummaries: new Map(),
    staticTargetMatchedHits: new Map(),
    targetWindowEvidenceSummaries: new Map(),
    targetProofSummaries: new Map(),
    sourcePredicateSummaries: new Map(),
    valueProofSummaries: new Map(),
    stackProofSummaries: new Map(),
    damageLaneSummaries: new Map(),
    rulesWithoutTerms: new Map(),
    unknownActive: new Map(),
  };
}

function updateUnknownSummary(global, unknown, hit) {
  const key = `${unknown.buffId}:${unknown.field}`;
  const row = global.unknownActive.get(key) ?? {
    buffId: unknown.buffId,
    field: unknown.field,
    hits: 0,
    totalValue: 0,
    sourceUids: new Set(),
    hostUids: new Set(),
  };
  row.hits += 1;
  row.totalValue += numberValue(hit?.value);
  for (const entry of asArray(unknown.entries)) {
    addToSet(row.sourceUids, entry.modifierSourceUid);
    addToSet(row.hostUids, entry.modifierHostUid);
  }
  global.unknownActive.set(key, row);
}

function targetWindowEvidenceKey(window) {
  return [
    window.modifierBaseId ?? "?",
    window.modifierSourceConfigId ?? "?",
    window.targetSide ?? "?",
    window.mappedRuleIds.join("+") || "unmapped",
  ].join("|");
}

function createTargetWindowEvidenceSummary(window, indexes) {
  return {
    key: targetWindowEvidenceKey(window),
    modifierBaseIds: new Set(),
    modifierSourceConfigIds: new Set(),
    mappedRuleIds: new Set(),
    mappedRuleNames: new Set(),
    unmappedBuffIds: new Set(),
    targetSides: new Set(),
    targetUids: new Set(),
    sourceUids: new Set(),
    hostUids: new Set(),
    stackLayers: new Set(),
    stackCounts: new Set(),
    buffLevels: new Set(),
    damageIds: new Set(),
    targetMonsterTypeIds: new Set(),
    files: new Set(),
    hitFingerprints: new Set(),
    hits: 0,
    windowOccurrences: 0,
    totalValue: 0,
  };
}

function updateTargetWindowEvidenceSummaries(global, targetWindowEvidence, hit, fileReport, hitFingerprint, indexes) {
  const seenKeys = new Set();
  for (const window of asArray(targetWindowEvidence?.windows)) {
    const key = targetWindowEvidenceKey(window);
    let row = global.targetWindowEvidenceSummaries.get(key);
    if (!row) {
      row = createTargetWindowEvidenceSummary(window, indexes);
      global.targetWindowEvidenceSummaries.set(key, row);
    }

    row.windowOccurrences += 1;
    addToSet(row.modifierBaseIds, window.modifierBaseId);
    addToSet(row.modifierSourceConfigIds, window.modifierSourceConfigId);
    addToSet(row.targetSides, window.targetSide);
    addToSet(row.targetUids, targetWindowEvidence.targetUid);
    addToSet(row.sourceUids, window.modifierSourceUid);
    addToSet(row.hostUids, window.modifierHostUid);
    addToSet(row.stackLayers, window.modifierLayer);
    addToSet(row.stackCounts, window.modifierCount);
    addToSet(row.buffLevels, window.modifierBuffLevel);
    addToSet(row.damageIds, positiveNumber(hit?.damageId) ?? positiveNumber(hit?.skillKey));
    addToSet(row.targetMonsterTypeIds, positiveNumber(hit?.targetMonsterTypeId));
    addToSet(row.files, fileReport.file);
    for (const ruleId of window.mappedRuleIds) {
      addToSet(row.mappedRuleIds, ruleId);
      addToSet(row.mappedRuleNames, sourceLabel(ruleId, indexes));
    }
    for (const buffId of window.unmappedBuffIds) addToSet(row.unmappedBuffIds, buffId);

    const uniqueHitKey = `${key}:${hitFingerprint}`;
    if (!seenKeys.has(key) && !row.hitFingerprints.has(uniqueHitKey)) {
      row.hits += 1;
      row.totalValue += numberValue(hit?.value);
      row.hitFingerprints.add(uniqueHitKey);
      seenKeys.add(key);
    }
  }
}

function analyzeFile(filePath, indexes, global) {
  const entity = readJson(filePath);
  const fileReport = {
    file: path.relative(repoRoot, filePath).replaceAll("\\", "/"),
    uid: entity.uid ?? null,
    name: entity.name ?? "",
    classId: entity.classId ?? null,
    classSpec: entity.classSpec ?? null,
    hits: 0,
    totalValue: 0,
    activeRuleObservations: 0,
    activeTermObservations: 0,
    strictReplayReadyObservations: 0,
    strictReplayBlockedObservations: 0,
    statusCounts: {},
    strictReplayStatusCounts: {},
    blockerCounts: {},
    strictReplayBlockerCounts: {},
  };

  const actorIndex = buildActorIndex(entity);
  const replayHits = asArray(entity.modifierReplayHits)
    .filter((hit) => !hit?.isHeal && numberValue(hit?.value) > 0);

  for (let hitIndex = 0; hitIndex < replayHits.length; hitIndex += 1) {
    const hit = replayHits[hitIndex];
    const hitFingerprint = `${fileReport.file}:${hitIndex}`;
    fileReport.hits += 1;
    fileReport.totalValue += numberValue(hit?.value);
    global.summary.hits += 1;
    global.summary.totalValue += numberValue(hit?.value);

    const recountParents = recountParentsForHit(hit, indexes);
    const active = activeRuleLinks(hit, indexes);
    const targetWindowEvidence = targetWindowEvidenceForHit(hit, indexes);
    updateTargetWindowEvidenceSummaries(global, targetWindowEvidence, hit, fileReport, hitFingerprint, indexes);

    for (const unknown of active.unmapped) {
      global.summary.unknownActiveModifierObservations += 1;
      addMapCount(global.summary.unknownActiveBuffIds, `${unknown.buffId}:${unknown.field}`);
      updateUnknownSummary(global, unknown, hit);
    }

    for (const link of active.links) {
      fileReport.activeRuleObservations += 1;
      global.summary.activeRuleObservations += 1;
      const terms = indexes.termsByRuleId.get(link.ruleId) ?? [];
      const provider = providerForLink(entity, actorIndex, link, hit);
      const targetStatus = ruleTargetStatus(link.ruleId, hit, recountParents, indexes);
      const targetWindowEval = evaluateTargetWindowForLink(link, targetWindowEvidence);
      const sourceName = sourceLabel(link.ruleId, indexes);

      if (targetStatus.hasStaticTargets) {
        const candidateKey = staticCandidateKey(link, provider);
        let candidate = global.staticTargetCandidateSummaries.get(candidateKey);
        if (!candidate) {
          candidate = createStaticTargetCandidateSummary(link, sourceName, provider, targetStatus, terms, indexes);
          global.staticTargetCandidateSummaries.set(candidateKey, candidate);
        }
        updateStaticTargetCandidateSummary(candidate, link, provider, hit, fileReport, targetStatus, hitFingerprint);
        if (targetStatus.targetMatch) recordStaticTargetMatchedHit(global, hitFingerprint, hit, fileReport);
      }

      if (!terms.length) {
        fileReport.statusCounts["active-rule-without-term"] = (fileReport.statusCounts["active-rule-without-term"] ?? 0) + 1;
        global.summary.activeRulesWithoutTerms += 1;
        addMapCount(global.summary.sourceRulesWithoutTerms, `${link.ruleId}:${sourceName}`);
        addMapCount(global.rulesWithoutTerms, `${link.ruleId}:${sourceName}`);
        continue;
      }

      for (const term of terms) {
        const blockers = proofBlockers(term, entity, hit, link, provider, targetStatus, targetWindowEval);
        const status = classifyTerm(term, blockers);
        const strictBlockers = strictReplayBlockers(
          term,
          hit,
          link,
          provider,
          targetStatus,
          blockers,
          targetWindowEval,
        );
        const strictStatus = classifyStrictReplay(term, strictBlockers);
        const key = [
          term.termKey,
          link.ruleId,
          provider.scope,
          provider.providerName,
          provider.ownerUid ?? provider.sourceUid ?? "?",
        ].join("|");
        let summary = global.termSummaries.get(key);
        if (!summary) {
          summary = createTermSummary(term, link.ruleId, sourceName, provider);
          summary.sourceKind = indexes.modifierRecount.sourcesById?.[link.ruleId]?.sourceKind ?? null;
          global.termSummaries.set(key, summary);
        }
        updateTermSummary(summary, term, link, provider, hit, fileReport, status, blockers, strictStatus, strictBlockers);

        if (needsTargetProofDiagnostic(term, targetStatus, blockers, strictBlockers)) {
          let targetProof = global.targetProofSummaries.get(key);
          if (!targetProof) {
            targetProof = createTargetProofSummary(term, link, sourceName, provider, targetStatus, indexes);
            global.targetProofSummaries.set(key, targetProof);
          }
          updateTargetProofSummary(
            targetProof,
            term,
            link,
            provider,
            hit,
            fileReport,
            targetStatus,
            blockers,
            strictBlockers,
            targetWindowEval,
          );
        }

        if (needsSourcePredicateDiagnostic(term, link.ruleId, indexes, strictBlockers)) {
          let sourcePredicate = global.sourcePredicateSummaries.get(key);
          if (!sourcePredicate) {
            sourcePredicate = createSourcePredicateSummary(term, link, sourceName, provider, indexes);
            global.sourcePredicateSummaries.set(key, sourcePredicate);
          }
          updateSourcePredicateSummary(
            sourcePredicate,
            term,
            link,
            provider,
            hit,
            fileReport,
            strictBlockers,
            targetWindowEval,
          );
        }

        if (needsValueProofDiagnostic(strictBlockers)) {
          let valueProof = global.valueProofSummaries.get(key);
          if (!valueProof) {
            valueProof = createValueProofSummary(term, link, sourceName, provider, indexes);
            global.valueProofSummaries.set(key, valueProof);
          }
          updateValueProofSummary(valueProof, term, link, provider, hit, fileReport, strictBlockers);
        }

        if (needsStackProofDiagnostic(term, strictBlockers)) {
          let stackProof = global.stackProofSummaries.get(key);
          if (!stackProof) {
            stackProof = createStackProofSummary(term, link, sourceName, provider, indexes);
            global.stackProofSummaries.set(key, stackProof);
          }
          updateStackProofSummary(
            stackProof,
            term,
            link,
            provider,
            hit,
            fileReport,
            strictBlockers,
            targetWindowEval,
          );
        }

        if (needsDamageLaneDiagnostic(term, strictBlockers)) {
          let damageLane = global.damageLaneSummaries.get(key);
          if (!damageLane) {
            damageLane = createDamageLaneSummary(term, link, sourceName, provider, indexes);
            global.damageLaneSummaries.set(key, damageLane);
          }
          updateDamageLaneSummary(damageLane, term, link, provider, hit, fileReport, strictBlockers, indexes);
        }

        fileReport.activeTermObservations += 1;
        global.summary.activeTermObservations += 1;
        fileReport.statusCounts[status] = (fileReport.statusCounts[status] ?? 0) + 1;
        fileReport.strictReplayStatusCounts[strictStatus] = (fileReport.strictReplayStatusCounts[strictStatus] ?? 0) + 1;
        global.summary.statusCounts[status] = (global.summary.statusCounts[status] ?? 0) + 1;
        global.summary.strictReplayStatusCounts[strictStatus] = (global.summary.strictReplayStatusCounts[strictStatus] ?? 0) + 1;
        if (strictStatus === "strict-exact-replay-ready" || strictStatus === "strict-formula-replay-ready") {
          global.summary.strictReplayReadyObservations += 1;
          fileReport.strictReplayReadyObservations += 1;
        } else {
          global.summary.strictReplayBlockedObservations += 1;
          fileReport.strictReplayBlockedObservations += 1;
        }
        for (const zone of asArray(term.formulaZoneIds)) {
          global.summary.formulaZoneCounts[zone] = (global.summary.formulaZoneCounts[zone] ?? 0) + 1;
        }
        for (const blocker of blockers) {
          fileReport.blockerCounts[blocker] = (fileReport.blockerCounts[blocker] ?? 0) + 1;
          global.summary.blockerCounts[blocker] = (global.summary.blockerCounts[blocker] ?? 0) + 1;
        }
        for (const blocker of strictBlockers) {
          fileReport.strictReplayBlockerCounts[blocker] = (fileReport.strictReplayBlockerCounts[blocker] ?? 0) + 1;
          global.summary.strictReplayBlockerCounts[blocker] = (global.summary.strictReplayBlockerCounts[blocker] ?? 0) + 1;
        }
      }
    }
  }

  global.files.push({
    ...fileReport,
    totalValue: Math.round(fileReport.totalValue),
  });
  global.summary.files += 1;
}

function finalizeReport(global, options) {
  const topTerms = topRows(global.termSummaries, options.maxRows).map(serializeTermSummary);
  const topStrictReplayReadyTerms = topStrictReadyRows(global.termSummaries, options.maxRows)
    .map(serializeTermSummary);
  const topStrictReplayBlockedTerms = topStrictBlockedRows(global.termSummaries, options.maxRows)
    .map(serializeTermSummary);
  const allTerms = [...global.termSummaries.values()].map(serializeTermSummary);
  const rawStaticTargetCandidateRows = [...global.staticTargetCandidateSummaries.values()];
  const staticCandidateMatchedCounts = staticCandidateMatchedHitCounts(rawStaticTargetCandidateRows);
  const staticTargetAssignmentTotals = assignStaticTargetContributions(
    rawStaticTargetCandidateRows,
    global.staticTargetMatchedHits,
  );
  const rawStaticTargetCandidates = rawStaticTargetCandidateRows
    .map((row) => serializeStaticTargetCandidateSummary(row, staticCandidateMatchedCounts));
  const staticTargetCollisionCounts = staticCandidateCollisionCounts(rawStaticTargetCandidates);
  const staticTargetCandidates = annotateStaticCandidateCollisions(
    rawStaticTargetCandidates,
    staticTargetCollisionCounts,
  );
  const topStaticTargetCandidates = annotateStaticCandidateCollisions(
    topStaticTargetCandidateRows(global.staticTargetCandidateSummaries, options.maxRows)
      .map((row) => serializeStaticTargetCandidateSummary(row, staticCandidateMatchedCounts)),
    staticTargetCollisionCounts,
  );
  const topExactStaticContributions = annotateStaticCandidateCollisions(
    topExactStaticContributionRows(rawStaticTargetCandidateRows, options.maxRows)
      .map((row) => serializeStaticTargetCandidateSummary(row, staticCandidateMatchedCounts)),
    staticTargetCollisionCounts,
  );
  const uniqueStaticTargetMatchedValue = [...global.staticTargetMatchedHits.values()]
    .reduce((total, hit) => total + numberValue(hit.value), 0);
  const staticTargetCandidateTotals = staticTargetCandidates.reduce(
    (totals, row) => {
      totals.rows += 1;
      totals.rowsWithMatches += row.matchedHits > 0 ? 1 : 0;
      totals.activeHits += row.activeHits;
      totals.activeValue += row.activeValue;
      totals.matchedHits += row.matchedHits;
      totals.matchedValue += row.matchedValue;
      totals.mismatchHits += row.mismatchHits;
      return totals;
    },
    {
      rows: 0,
      rowsWithMatches: 0,
      activeHits: 0,
      activeValue: 0,
      matchedHits: 0,
      matchedValue: 0,
      mismatchHits: 0,
    },
  );
  const topTargetProofDiagnostics = topTargetProofRows(global.targetProofSummaries, options.maxRows)
    .map(serializeTargetProofSummary);
  const topTargetWindowEvidence = topRows(global.targetWindowEvidenceSummaries, options.maxRows)
    .map(serializeTargetWindowEvidenceSummary);
  const topStaticTargetMatchedDiagnostics = topStaticTargetMatchedRows(global.targetProofSummaries, options.maxRows)
    .map(serializeTargetProofSummary);
  const topSourcePredicateDiagnostics = topSourcePredicateRows(global.sourcePredicateSummaries, options.maxRows)
    .map(serializeSourcePredicateSummary);
  const topValueProofDiagnostics = topRows(global.valueProofSummaries, options.maxRows)
    .map(serializeValueProofSummary);
  const topStackProofDiagnostics = topRows(global.stackProofSummaries, options.maxRows)
    .map(serializeStackProofSummary);
  const topDamageLaneDiagnostics = topRows(global.damageLaneSummaries, options.maxRows)
    .map(serializeDamageLaneSummary);
  const targetProofDiagnostics = [...global.targetProofSummaries.values()].map(serializeTargetProofSummary);
  const targetWindowEvidence = [...global.targetWindowEvidenceSummaries.values()]
    .map(serializeTargetWindowEvidenceSummary);
  const sourcePredicateDiagnostics = [...global.sourcePredicateSummaries.values()].map(serializeSourcePredicateSummary);
  const valueProofDiagnostics = [...global.valueProofSummaries.values()].map(serializeValueProofSummary);
  const stackProofDiagnostics = [...global.stackProofSummaries.values()].map(serializeStackProofSummary);
  const damageLaneDiagnostics = [...global.damageLaneSummaries.values()].map(serializeDamageLaneSummary);
  const topUnknownActiveModifiers = topRows(global.unknownActive, options.maxRows).map((row) => ({
    buffId: row.buffId,
    field: row.field,
    hits: row.hits,
    totalValue: Math.round(row.totalValue),
    sourceUids: setToSortedArray(row.sourceUids),
    hostUids: setToSortedArray(row.hostUids),
  }));

  return {
    generatedAt: global.generatedAt,
    inputs: global.inputs,
    termTable: global.termTable,
    notes: global.notes,
    summary: {
      ...global.summary,
      totalValue: Math.round(global.summary.totalValue),
      sourceRulesWithoutTerms: countMapToObject(global.rulesWithoutTerms, 30),
      unknownActiveBuffIds: countMapToObject(
        new Map([...global.unknownActive.entries()].map(([key, row]) => [key, row.hits])),
        30,
      ),
      targetProofDiagnosticRows: global.targetProofSummaries.size,
      targetWindowEvidenceRows: global.targetWindowEvidenceSummaries.size,
      sourcePredicateDiagnosticRows: global.sourcePredicateSummaries.size,
      valueProofDiagnosticRows: global.valueProofSummaries.size,
      stackProofDiagnosticRows: global.stackProofSummaries.size,
      damageLaneDiagnosticRows: global.damageLaneSummaries.size,
      staticTargetCandidateRows: staticTargetCandidateTotals.rows,
      staticTargetCandidateRowsWithMatches: staticTargetCandidateTotals.rowsWithMatches,
      staticTargetCandidateActiveHits: staticTargetCandidateTotals.activeHits,
      staticTargetCandidateActiveValue: Math.round(staticTargetCandidateTotals.activeValue),
      staticTargetCandidateMatchedHits: staticTargetCandidateTotals.matchedHits,
      staticTargetCandidateMatchedValue: Math.round(staticTargetCandidateTotals.matchedValue),
      staticTargetCandidateMismatchHits: staticTargetCandidateTotals.mismatchHits,
      staticTargetCandidateUniqueMatchedHits: global.staticTargetMatchedHits.size,
      staticTargetCandidateUniqueMatchedValue: Math.round(uniqueStaticTargetMatchedValue),
      exactStaticContributionRows: staticTargetAssignmentTotals.rowsWithAssigned,
      exactStaticContributionAssignedHits: staticTargetAssignmentTotals.assignedHits,
      exactStaticContributionAssignedValue: Math.round(staticTargetAssignmentTotals.assignedValue),
      exactStaticContributionOverlapOutHits: staticTargetAssignmentTotals.overlapOutHits,
      exactStaticContributionOverlapOutValue: Math.round(staticTargetAssignmentTotals.overlapOutValue),
      exactStaticContributionAmbiguousHits: staticTargetAssignmentTotals.ambiguousAssignmentHits,
    },
    files: global.files,
    topTerms,
    topStrictReplayReadyTerms,
    topStrictReplayBlockedTerms,
    topExactStaticContributions,
    topStaticTargetCandidates,
    topTargetWindowEvidence,
    topTargetProofDiagnostics,
    topStaticTargetMatchedDiagnostics,
    topSourcePredicateDiagnostics,
    topValueProofDiagnostics,
    topStackProofDiagnostics,
    topDamageLaneDiagnostics,
    topUnknownActiveModifiers,
    terms: allTerms,
    staticTargetCandidates,
    targetWindowEvidence,
    targetProofDiagnostics,
    sourcePredicateDiagnostics,
    valueProofDiagnostics,
    stackProofDiagnostics,
    damageLaneDiagnostics,
  };
}

function mdEscape(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function mdTable(headers, rows) {
  const lines = [
    `| ${headers.map(mdEscape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.map(mdEscape).join(" | ")} |`);
  }
  return lines.join("\n");
}

function markdownReport(report, options) {
  const lines = [];
  lines.push("# Modifier Term Proof Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Term table: \`${report.termTable.path}\``);
  if (report.termTable.fullPath) {
    lines.push(`Full term table: \`${report.termTable.fullPath}\``);
  }
  lines.push("");
  lines.push("## Notes");
  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(mdTable(
    [
      "Files",
      "Hits",
      "Packet Value",
      "Active Rules",
      "Active Terms",
      "Strict Ready",
      "Strict Blocked",
      "Rules Without Terms",
      "Unknown Active",
    ],
    [[
      report.summary.files,
      formatNumber(report.summary.hits),
      formatNumber(report.summary.totalValue),
      formatNumber(report.summary.activeRuleObservations),
      formatNumber(report.summary.activeTermObservations),
      formatNumber(report.summary.strictReplayReadyObservations),
      formatNumber(report.summary.strictReplayBlockedObservations),
      formatNumber(report.summary.activeRulesWithoutTerms),
      formatNumber(report.summary.unknownActiveModifierObservations),
    ]],
  ));
  lines.push("");
  lines.push("## Evidence Status Counts");
  lines.push(mdTable(
    ["Status", "Observations"],
    Object.entries(report.summary.statusCounts)
      .sort((left, right) => right[1] - left[1])
      .map(([status, count]) => [status, formatNumber(count)]),
  ));
  lines.push("");
  lines.push("## Strict Replay Status Counts");
  lines.push(mdTable(
    ["Status", "Observations"],
    Object.entries(report.summary.strictReplayStatusCounts)
      .sort((left, right) => right[1] - left[1])
      .map(([status, count]) => [status, formatNumber(count)]),
  ));
  lines.push("");
  lines.push("## Top Evidence Blockers");
  lines.push(mdTable(
    ["Blocker", "Observations"],
    Object.entries(report.summary.blockerCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, options.maxRows)
      .map(([blocker, count]) => [blocker, formatNumber(count)]),
  ));
  lines.push("");
  lines.push("## Top Strict Replay Blockers");
  lines.push(mdTable(
    ["Blocker", "Observations"],
    Object.entries(report.summary.strictReplayBlockerCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, options.maxRows)
      .map(([blocker, count]) => [blocker, formatNumber(count)]),
  ));
  lines.push("");
  lines.push("## Value Resolution Diagnostics");
  lines.push(mdTable(
    [
      "Source",
      "Term",
      "Hits",
      "Damage",
      "Resolution",
      "Components",
      "Scoped Values",
      "All Values",
      "Description",
      "Strict Blockers",
    ],
    report.topValueProofDiagnostics.map((row) => [
      row.sourceName,
      row.label,
      formatNumber(row.hits),
      formatNumber(row.totalValue),
      row.valueResolution ?? "",
      row.componentKeys.join(", "),
      row.scopedFormulaValues.join(", "),
      row.formulaValues.slice(0, 5).join(", "),
      row.hasDescription ? row.descriptionSources.join(", ") || "yes" : row.descriptionSources.join(", ") || "no",
      Object.keys(row.strictReplayBlockers).slice(0, 6).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Stack Proof Diagnostics");
  lines.push(mdTable(
    [
      "Source",
      "Term",
      "Hits",
      "Damage",
      "Stack Policy",
      "Active Stack Hits",
      "Active Layers",
      "Active Counts",
      "Linked Target Stack Hits",
      "Target Counts",
      "Strict Blockers",
    ],
    report.topStackProofDiagnostics.map((row) => [
      row.sourceName,
      row.label,
      formatNumber(row.hits),
      formatNumber(row.totalValue),
      row.stackPolicy ?? "",
      formatNumber(row.activeStackEvidenceHits),
      row.activeStackLayers.join(", "),
      row.activeStackCounts.join(", "),
      formatNumber(row.linkedTargetStackWindowHits),
      row.targetWindowStackCounts.join(", ") || row.observedTargetStackCounts.join(", "),
      Object.keys(row.strictReplayBlockers).slice(0, 6).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Damage Lane Diagnostics");
  lines.push(mdTable(
    [
      "Source",
      "Term",
      "Hits",
      "Damage",
      "Damage IDs",
      "Damage Labels",
      "Damage Kinds",
      "Property",
      "Mode",
      "Attacker Attr IDs",
      "Strict Blockers",
    ],
    report.topDamageLaneDiagnostics.map((row) => [
      row.sourceName,
      row.label,
      formatNumber(row.hits),
      formatNumber(row.totalValue),
      row.damageIds.join(", "),
      row.damageLabels.join(", "),
      row.damageKinds.join(", "),
      row.properties.join(", "),
      row.damageModes.join(", "),
      row.attackerAttrIds.slice(0, 12).join(", "),
      Object.keys(row.strictReplayBlockers).slice(0, 6).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Static Target Candidate Totals");
  lines.push(mdTable(
    [
      "Rows",
      "Rows With Matches",
      "Active Hits",
      "Matched Hits",
      "Mismatch Hits",
      "Row-Matched Damage",
      "Unique Matched Hits",
      "Unique Packet Damage",
      "Exact Assigned Hits",
      "Exact Assigned Damage",
      "Overlap-Out Claims",
      "Overlap-Out Damage",
    ],
    [[
      formatNumber(report.summary.staticTargetCandidateRows),
      formatNumber(report.summary.staticTargetCandidateRowsWithMatches),
      formatNumber(report.summary.staticTargetCandidateActiveHits),
      formatNumber(report.summary.staticTargetCandidateMatchedHits),
      formatNumber(report.summary.staticTargetCandidateMismatchHits),
      formatNumber(report.summary.staticTargetCandidateMatchedValue),
      formatNumber(report.summary.staticTargetCandidateUniqueMatchedHits),
      formatNumber(report.summary.staticTargetCandidateUniqueMatchedValue),
      formatNumber(report.summary.exactStaticContributionAssignedHits),
      formatNumber(report.summary.exactStaticContributionAssignedValue),
      formatNumber(report.summary.exactStaticContributionOverlapOutHits),
      formatNumber(report.summary.exactStaticContributionOverlapOutValue),
    ]],
  ));
  lines.push("");
  lines.push("## Exact Static Contribution Rows");
  lines.push(mdTable(
    [
      "Source",
      "Provider",
      "Scope",
      "Assigned Damage",
      "Assigned Hits",
      "Matched Damage",
      "Matched Hits",
      "Overlap-Out Hits",
      "Overlap-Out Damage",
      "Target Damage IDs",
      "Target Recount IDs",
      "Observed Damage IDs",
      "Formula Zones",
      "Linked Terms",
    ],
    report.topExactStaticContributions.map((row) => [
      row.sourceName,
      row.providers.join(", "),
      row.providerScopes.join(", "),
      formatNumber(row.exactAssignedValue),
      formatNumber(row.exactAssignedHits),
      formatNumber(row.matchedValue),
      formatNumber(row.matchedHits),
      formatNumber(row.exactOverlapOutHits),
      formatNumber(row.exactOverlapOutValue),
      row.targetDamageIds.join(", "),
      row.targetRecountIds.join(", "),
      row.damageIds.join(", "),
      row.formulaZoneIds.join(", "),
      row.linkedTermLabels.slice(0, 4).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Static Target Candidate Rows");
  lines.push(mdTable(
    [
      "Source",
      "Provider",
      "Scope",
      "Assigned Damage",
      "Assigned Hits",
      "Matched Damage",
      "Matched Hits",
      "Active Hits",
      "Mismatch Hits",
      "Target Damage IDs",
      "Target Recount IDs",
      "Observed Damage IDs",
      "Recount Parents",
      "Same Target Rows",
      "Overlapping Hits",
      "Overlap-Out Hits",
      "Formula Zones",
      "Linked Terms",
    ],
    report.topStaticTargetCandidates.map((row) => [
      row.sourceName,
      row.providers.join(", "),
      row.providerScopes.join(", "),
      formatNumber(row.exactAssignedValue),
      formatNumber(row.exactAssignedHits),
      formatNumber(row.matchedValue),
      formatNumber(row.matchedHits),
      formatNumber(row.activeHits),
      formatNumber(row.mismatchHits),
      row.targetDamageIds.join(", "),
      row.targetRecountIds.join(", "),
      row.damageIds.join(", "),
      row.recountParents.join(", "),
      formatNumber(row.sameTargetSignatureRows),
      formatNumber(row.overlappingMatchedHits),
      formatNumber(row.exactOverlapOutHits),
      row.formulaZoneIds.join(", "),
      row.linkedTermLabels.slice(0, 4).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Target-Side Window Evidence");
  lines.push(mdTable(
    [
      "Mapped Rules",
      "Hits",
      "Windows",
      "Damage",
      "Base IDs",
      "Source Config IDs",
      "Target Side",
      "Stack Layers",
      "Stack Counts",
      "Target UIDs",
      "Source UIDs",
      "Host UIDs",
      "Damage IDs",
    ],
    report.topTargetWindowEvidence.map((row) => [
      row.mappedRuleNames.join(", ") || row.mappedRuleIds.join(", ") || "unmapped",
      formatNumber(row.hits),
      formatNumber(row.windowOccurrences),
      formatNumber(row.totalValue),
      row.modifierBaseIds.join(", "),
      row.modifierSourceConfigIds.join(", "),
      row.targetSides.join(", "),
      row.stackLayers.join(", "),
      row.stackCounts.join(", "),
      row.targetUids.join(", "),
      row.sourceUids.join(", "),
      row.hostUids.join(", "),
      row.damageIds.join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Target Proof Diagnostics");
  lines.push(mdTable(
    [
      "Source",
      "Term",
      "Hits",
      "Damage",
      "Linked Window",
      "Any Window",
      "Same Rule",
      "Linked Stack",
      "Missing Window",
      "Static Match",
      "Static Mismatch",
      "Target Window IDs",
      "Target Damage IDs",
      "Target Recount IDs",
      "Observed Damage IDs",
      "Providers",
      "Strict Blockers",
    ],
    report.topTargetProofDiagnostics.map((row) => [
      row.sourceName,
      row.label,
      formatNumber(row.hits),
      formatNumber(row.totalValue),
      formatNumber(row.linkedTargetWindowHits ?? row.targetWindowHits),
      formatNumber(row.anyTargetWindowHits),
      formatNumber(row.sameRuleTargetWindowHits),
      formatNumber(row.linkedTargetStackWindowHits),
      formatNumber(row.missingTargetWindowHits),
      formatNumber(row.staticTargetMatchHits),
      formatNumber(row.staticTargetMismatchHits),
      [...row.targetWindowBaseIds, ...row.targetWindowSourceConfigIds].join(", "),
      row.targetDamageIds.join(", "),
      row.targetRecountIds.join(", "),
      row.damageIds.join(", "),
      row.providers.join(", "),
      Object.keys(row.strictReplayBlockers).slice(0, 6).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Static Target Matches");
  lines.push(mdTable(
    [
      "Source",
      "Term",
      "Hits",
      "Damage",
      "Static Match",
      "Static Mismatch",
      "Target Damage IDs",
      "Target Recount IDs",
      "Observed Damage IDs",
      "Providers",
      "Strict Blockers",
    ],
    report.topStaticTargetMatchedDiagnostics.map((row) => [
      row.sourceName,
      row.label,
      formatNumber(row.hits),
      formatNumber(row.totalValue),
      formatNumber(row.staticTargetMatchHits),
      formatNumber(row.staticTargetMismatchHits),
      row.targetDamageIds.join(", "),
      row.targetRecountIds.join(", "),
      row.damageIds.join(", "),
      row.providers.join(", "),
      Object.keys(row.strictReplayBlockers).slice(0, 6).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Source Predicate Diagnostics");
  lines.push(mdTable(
    [
      "Source",
      "Term",
      "Predicate Tags",
      "Hits",
      "Damage",
      "Blocked",
      "Active Window",
      "Target Window",
      "Provider",
      "Scope",
      "Src=Atk",
      "Host=Atk",
      "Owner=Atk",
      "Src=Target",
      "Host=Target",
      "Strict Blockers",
    ],
    report.topSourcePredicateDiagnostics.map((row) => [
      row.sourceName,
      row.label,
      row.predicateTags.join(", "),
      formatNumber(row.hits),
      formatNumber(row.totalValue),
      formatNumber(row.sourcePredicateBlockedHits),
      formatNumber(row.activeWindowHits),
      formatNumber(row.targetWindowHits),
      row.providers.join(", "),
      row.providerScopes.join(", "),
      formatNumber(row.sourceMatchesAttackerHits),
      formatNumber(row.hostMatchesAttackerHits),
      formatNumber(row.ownerMatchesAttackerHits),
      formatNumber(row.sourceMatchesTargetHits),
      formatNumber(row.hostMatchesTargetHits),
      Object.keys(row.strictReplayBlockers).slice(0, 6).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Strict Replay Ready Terms");
  lines.push(mdTable(
    ["Strict", "Source", "Term", "Zones", "Value", "Stack", "Providers", "Ready Hits", "Ready Damage"],
    report.topStrictReplayReadyTerms.map((row) => [
      row.strictReplayStatus,
      row.sourceName,
      row.label,
      row.formulaZoneIds.join(", "),
      row.valueResolution ?? "",
      row.stackPolicy ?? "",
      row.providers.join(", "),
      formatNumber(row.strictReplayReadyHits),
      formatNumber(row.strictReplayReadyValue),
    ]),
  ));
  lines.push("");
  lines.push("## Strict Replay Blocked Terms");
  lines.push(mdTable(
    ["Strict", "Source", "Term", "Zones", "Value", "Stack", "Providers", "Hits", "Damage", "Strict Blockers"],
    report.topStrictReplayBlockedTerms.map((row) => [
      row.strictReplayStatus,
      row.sourceName,
      row.label,
      row.formulaZoneIds.join(", "),
      row.valueResolution ?? "",
      row.stackPolicy ?? "",
      row.providers.join(", "),
      formatNumber(row.strictReplayBlockedHits),
      formatNumber(row.totalValue - row.strictReplayReadyValue),
      Object.keys(row.strictReplayBlockers).slice(0, 6).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Top Active Terms");
  lines.push(mdTable(
    [
      "Evidence",
      "Strict",
      "Source",
      "Term",
      "Zones",
      "Value",
      "Stack",
      "Providers",
      "Hits",
      "Damage",
      "Ready Hits",
      "Evidence Blockers",
      "Strict Blockers",
    ],
    report.topTerms.map((row) => [
      row.observedStatus,
      row.strictReplayStatus,
      row.sourceName,
      row.label,
      row.formulaZoneIds.join(", "),
      row.valueResolution ?? "",
      row.stackPolicy ?? "",
      row.providers.join(", "),
      formatNumber(row.hits),
      formatNumber(row.totalValue),
      formatNumber(row.strictReplayReadyHits),
      Object.keys(row.blockers).slice(0, 6).join(", "),
      Object.keys(row.strictReplayBlockers).slice(0, 6).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Active Source Rules Without Terms");
  lines.push(mdTable(
    ["Rule", "Hits"],
    Object.entries(report.summary.sourceRulesWithoutTerms)
      .slice(0, options.maxRows)
      .map(([rule, count]) => [rule, formatNumber(count)]),
  ));
  lines.push("");
  lines.push("## Unknown Active Modifier IDs");
  lines.push(mdTable(
    ["Buff Field", "Hits"],
    Object.entries(report.summary.unknownActiveBuffIds)
      .slice(0, options.maxRows)
      .map(([buffField, count]) => [buffField, formatNumber(count)]),
  ));
  lines.push("");
  lines.push("## Files");
  lines.push(mdTable(
    ["File", "Entity", "Hits", "Damage", "Active Rules", "Active Terms", "Strict Ready", "Strict Blocked"],
    report.files.map((file) => [
      file.file,
      `${file.name || "#"} (${file.uid ?? "?"})`,
      formatNumber(file.hits),
      formatNumber(file.totalValue),
      formatNumber(file.activeRuleObservations),
      formatNumber(file.activeTermObservations),
      formatNumber(file.strictReplayReadyObservations),
      formatNumber(file.strictReplayBlockedObservations),
    ]),
  ));
  lines.push("");
  lines.push(`Showing top ${formatNumber(options.maxRows)} rows in markdown. Full detail is in the JSON report.`);
  lines.push("");
  return lines.join("\n");
}

function writeReport(report, options) {
  const outJson = resolveRepoPath(options.outJson);
  const outMd = resolveRepoPath(options.outMd);
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.mkdirSync(path.dirname(outMd), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(outMd, markdownReport(report, options));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const indexes = buildIndexes(options);
  const inputs = options.inputs.length
    ? options.inputs.map(resolveRepoPath)
    : latestModifierEntityExports(options.latest);

  if (!inputs.length) {
    throw new Error("No modifier entity exports found. Use --input or create DEV_exports/modifier-entity-*.json first.");
  }

  const global = createGlobalReport(indexes, inputs);
  for (const file of inputs) analyzeFile(file, indexes, global);
  const report = finalizeReport(global, options);
  writeReport(report, options);

  console.log(`Wrote ${options.outJson}`);
  console.log(`Wrote ${options.outMd}`);
  console.log(
    `Active terms: ${formatNumber(report.summary.activeTermObservations)} observations, `
    + `${formatNumber(report.summary.strictReplayReadyObservations)} strict-ready, `
    + `${formatNumber(report.summary.strictReplayBlockedObservations)} strict-blocked, `
    + `${formatNumber(report.topTerms.length)} top rows, `
    + `${formatDecimal(report.summary.totalValue / Math.max(1, report.summary.hits), 1)} avg packet value per hit.`,
  );
}

main();
