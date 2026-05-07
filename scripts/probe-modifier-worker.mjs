import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { performance } from "node:perf_hooks";

const root = process.cwd();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const actorFilterArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--actor-filter="))
  ?.split("=")[1];
const entityPath = positionalArgs[0]
  ?? path.join(root, "DEV_exports", "modifier-entity-195-3296036.json");
const staticWorkerPath = path.join(root, "static", "workers", "history-modifier-report.worker.js");
const LOCALES = ["en", "zh-CN", "zh-TW", "ja", "ko-KR", "fr", "de", "es", "pt-BR", "th", "id"];
const builtWorkerDir = path.join(
  root,
  ".svelte-kit",
  "output",
  "client",
  "_app",
  "immutable",
  "workers",
);

const workerPath = fs.existsSync(staticWorkerPath)
  ? staticWorkerPath
  : fs
    .readdirSync(builtWorkerDir)
    .filter((name) => name.startsWith("history-modifier-report.worker-") && name.endsWith(".js"))
    .map((name) => path.join(builtWorkerDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];

if (!workerPath) {
  throw new Error(`No history modifier worker found in ${staticWorkerPath} or ${builtWorkerDir}`);
}

function time(label, fn) {
  const startedAt = performance.now();
  const value = fn();
  return { label, value, ms: performance.now() - startedAt };
}

const entityRead = time("entity_read", () => fs.readFileSync(entityPath, "utf8"));
const entityParse = time("entity_parse", () => JSON.parse(entityRead.value));
const workerRead = time("worker_read", () => fs.readFileSync(workerPath, "utf8"));
const modifierRelationshipRead = time("modifier_relationship_read", () =>
  JSON.parse(fs.readFileSync(path.join(root, "parser-data", "generated", "ModifierRelationshipTable.json"), "utf8")));

function finitePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sortedNumbers(values) {
  return [...new Set([...values].filter(Number.isFinite))].sort((left, right) => left - right);
}

function decodeProfessionTalentNodeId(nodeId) {
  if (!Number.isFinite(nodeId)) return null;
  if (nodeId >= 1_000_000) return Math.floor(nodeId / 1000);
  return null;
}

function localizedMap(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;
  for (const [locale, raw] of Object.entries(value)) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text) out[locale] = text;
  }
  return out;
}

function designNameCandidates(row) {
  return [
    row?.NameDesign,
    row?.DesignName,
    row?.Name,
    row?.Names?.design,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function designOwnerTokens(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return [];
  const tokens = [];
  const leadingCjk = trimmed.match(/^[\u3400-\u9fff]+/u)?.[0]?.trim();
  if (leadingCjk) tokens.push(leadingCjk);
  const delimiterPrefix = trimmed.split(/[-_－—–:：]/u)[0]?.trim();
  if (delimiterPrefix && delimiterPrefix !== trimmed) tokens.push(delimiterPrefix);
  return tokens.filter((token, index, values) => token.length >= 2 && values.indexOf(token) === index);
}

function addMergedNames(target, source, overwrite = false) {
  for (const [locale, value] of Object.entries(source ?? {})) {
    const text = String(value || "").trim();
    if (!text) continue;
    if (overwrite || !target[locale]?.trim()) target[locale] = text;
  }
}

function jsonRows(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function buildMonsterOwnerNameMap() {
  const filePath = path.join(root, "parser-data", "generated", "monsternames.json");
  const ownerNamesByToken = new Map();
  if (!fs.existsSync(filePath)) return ownerNamesByToken;
  for (const row of jsonRows(filePath)) {
    const names = localizedMap(row.Names);
    if (!names.en && typeof row.Name === "string" && row.Name.trim()) names.en = row.Name.trim();
    if (!names.design) {
      const design = [row.NameDesign, row.DesignName].find((value) => typeof value === "string" && value.trim());
      if (design) names.design = design.trim();
    }
    if (Object.keys(names).length === 0) continue;
    const aliases = [
      ...Object.values(names),
      row.Name,
      row.NameDesign,
      row.DesignName,
    ].filter((value) => typeof value === "string" && value.trim());
    for (const alias of aliases) {
      for (const token of [alias.trim(), ...designOwnerTokens(alias)]) {
        const existing = ownerNamesByToken.get(token) ?? {};
        addMergedNames(existing, names);
        ownerNamesByToken.set(token, existing);
      }
    }
  }
  return ownerNamesByToken;
}

const monsterOwnerNamesByToken = buildMonsterOwnerNameMap();

function findDesignMonsterOwnerNames(row) {
  for (const candidate of designNameCandidates(row)) {
    for (const token of designOwnerTokens(candidate)) {
      const names = monsterOwnerNamesByToken.get(token);
      if (names) return names;
    }
  }
  return undefined;
}

function composeOwnerQualifiedBuffNames(row, names) {
  const ownerNames = findDesignMonsterOwnerNames(row);
  if (!ownerNames) return undefined;
  const out = {};
  for (const locale of LOCALES) {
    const ownerName = ownerNames[locale] || ownerNames.en || ownerNames["zh-CN"] || ownerNames.design;
    const buffName = names[locale] || names.en || names["zh-CN"];
    if (ownerName && buffName && ownerName.trim().toLowerCase() !== buffName.trim().toLowerCase()) {
      out[locale] = `${ownerName} - ${buffName}`;
    }
  }
  const design = designNameCandidates(row)[0] ?? names.design;
  if (design) out.design = design;
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildBuffDisplayNameIndex() {
  const filePath = path.join(root, "parser-data", "generated", "BuffName.json");
  const namesById = new Map();
  if (!fs.existsSync(filePath)) return namesById;
  for (const row of jsonRows(filePath)) {
    const id = finitePositiveNumber(row.Id ?? row.id);
    if (id === null) continue;
    const names = localizedMap(row.Names);
    const fallback = [row.NameDesign, row.Name, row.DesignName]
      .find((value) => typeof value === "string" && value.trim());
    if (fallback && !names.design) names.design = fallback.trim();
    const enriched = { ...names };
    addMergedNames(enriched, composeOwnerQualifiedBuffNames(row, names), true);
    if (Object.keys(enriched).length > 0) namesById.set(id, enriched);
  }
  return namesById;
}

const buffDisplayNamesById = buildBuffDisplayNameIndex();

function normalizeDisplayOwnerKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSkillAoyiRows() {
  const filePath = path.join(root, "parser-data", "generated", "skill_aoyi_icons.json");
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) ?? [] : [];
}

const skillAoyiRows = buildSkillAoyiRows();

function buildImagineOwnerNameIndex() {
  const index = new Map();
  for (const row of skillAoyiRows) {
    const monsterNames = row.MonsterNames;
    if (!monsterNames) continue;
    const name = monsterNames.en?.trim() || monsterNames["zh-CN"]?.trim() || row.Name?.trim();
    if (!name) continue;
    const owner = { name, names: monsterNames };
    const designNames = new Set([
      row.Name,
      ...Object.values(row.Names ?? {}),
    ].map((value) => String(value ?? "").trim()).filter(Boolean));
    for (const designName of designNames) {
      const key = normalizeDisplayOwnerKey(designName);
      if (key) index.set(key, owner);
    }
  }
  return index;
}

const imagineOwnerNamesByDesignName = buildImagineOwnerNameIndex();

const RUNTIME_WINDOW_ROW_POLICIES = new Set(["formula", "timing", "uptime"]);
const RUNTIME_WINDOW_GROUPS = new Set([
  "baseattack",
  "critical",
  "elemental",
  "genericdamage",
  "hittiming",
  "targetmitigation",
  "versatility",
]);
const RUNTIME_WINDOW_SOURCE_KINDS = new Set([
  "active-skill",
  "consumable",
  "imagine",
  "phantom-factor",
  "runtime-buff",
  "season-rogue-entry",
  "season-talent-node",
  "set-effect",
  "talent-passive",
  "talent-skill",
]);

function entryHasStaticTargets(entry) {
  return (entry.targetDamageIds?.length ?? 0) > 0 || (entry.targetRecountIds?.length ?? 0) > 0;
}

function entryContributionGroups(entry) {
  return [
    ...(entry.contributionGroups ?? []),
    ...(entry.attributionModel?.contributionGroups ?? []),
  ]
    .map((group) => String(group).trim().toLowerCase())
    .filter(Boolean);
}

function isRuntimeWindowCatalogEntry(entry) {
  if ((entry.reportPolicy ?? "include") !== "debug-only") return false;
  if (entryHasStaticTargets(entry)) return false;
  const rowPolicy = String(entry.rowPolicy ?? "").toLowerCase();
  if (!RUNTIME_WINDOW_ROW_POLICIES.has(rowPolicy)) return false;

  const groups = entryContributionGroups(entry);
  if (groups.some((group) => RUNTIME_WINDOW_GROUPS.has(group))) return true;

  if (rowPolicy !== "uptime") return false;
  const sourceKind = String(entry.sourceKind ?? "").toLowerCase();
  const sourceType = String(entry.sourceType ?? "").toLowerCase();
  return RUNTIME_WINDOW_SOURCE_KINDS.has(sourceKind)
    || sourceType.includes("buff")
    || sourceType.includes("debuff");
}

function isCatalogReportEntry(entry) {
  return (entry.reportPolicy ?? "include") === "include" || isRuntimeWindowCatalogEntry(entry);
}

function mergeLocalizedNames(base, incoming, overwrite = false) {
  if (!base && !incoming) return undefined;
  const merged = { ...(base ?? {}) };
  for (const [locale, value] of Object.entries(incoming ?? {})) {
    const text = String(value || "").trim();
    if (!text) continue;
    if (overwrite || !merged[locale]?.trim()) merged[locale] = text;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buffSourceIdFromEntry(entry) {
  const match = String(entry.sourceId || "").match(/^buff-source:(\d+)(?:$|\|)/);
  return match ? finitePositiveNumber(match[1]) : null;
}

function isRuntimeSourceConfigQualified(entry) {
  return String(entry.sourceId || "").includes("|source-config:")
    || (entry.runtimeSourceConfigIds?.length ?? 0) > 0;
}

function hasOwnerQualifiedImagineBuffName(entry, names) {
  return entry.sourceKind === "imagine"
    && Object.values(names ?? {}).some((value) => /\s+-\s+/.test(String(value || "").trim()));
}

function splitOwnerQualifiedLabel(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return null;
  const owner = match[1]?.trim();
  const child = match[2]?.trim();
  return owner && child ? { owner, child } : null;
}

function replaceImagineDesignOwnerNames(entry) {
  if (entry.sourceKind !== "imagine") return entry;
  const fallbackParts = splitOwnerQualifiedLabel(entry.sourceNames?.en ?? entry.sourceName);
  if (!fallbackParts) return entry;
  const owner = imagineOwnerNamesByDesignName.get(normalizeDisplayOwnerKey(fallbackParts.owner));
  if (!owner) return entry;
  const sourceNames = {};
  const locales = new Set([...Object.keys(entry.sourceNames ?? {}), ...Object.keys(owner.names ?? {}), "en"]);
  for (const locale of locales) {
    const sourceLabel = entry.sourceNames?.[locale]?.trim() || entry.sourceNames?.en?.trim() || entry.sourceName;
    const parts = splitOwnerQualifiedLabel(sourceLabel) ?? fallbackParts;
    const ownerName = owner.names?.[locale]?.trim() || owner.names?.en?.trim() || owner.name;
    sourceNames[locale] = `${ownerName} - ${parts.child}`;
  }
  return {
    ...entry,
    sourceName: sourceNames.en ?? `${owner.name} - ${fallbackParts.child}`,
    sourceNames,
  };
}

function decorateBuffSourceEntry(entry) {
  const ownerDecorated = replaceImagineDesignOwnerNames(entry);
  if (isRuntimeSourceConfigQualified(ownerDecorated)) return ownerDecorated;
  const buffId = buffSourceIdFromEntry(ownerDecorated);
  if (buffId === null) return ownerDecorated;
  const buffNames = buffDisplayNamesById.get(buffId);
  if (!hasOwnerQualifiedImagineBuffName(ownerDecorated, buffNames)) return ownerDecorated;
  const sourceNames = mergeLocalizedNames(ownerDecorated.sourceNames, buffNames, true);
  return {
    ...ownerDecorated,
    sourceName: sourceNames?.en?.trim() || ownerDecorated.sourceName,
    ...(sourceNames ? { sourceNames } : {}),
  };
}

function decorateCatalogEntries(byBuffId) {
  return Object.fromEntries(
    Object.entries(byBuffId).map(([buffId, entries]) => [
      buffId,
      entries.map(decorateBuffSourceEntry),
    ]),
  );
}

function ownershipSpecIds(ownership) {
  return sortedNumbers([
    ...(ownership?.specIds ?? []),
    ...(ownership?.allowedSpecIds ?? []),
  ].map(finitePositiveNumber).filter((id) => id !== null));
}

function buildProbeModifierSourceCatalog(entity) {
  const tablePath = path.join(root, "parser-data", "generated", "ModifierRecountTable.json");
  if (!fs.existsSync(tablePath)) return undefined;
  const table = JSON.parse(fs.readFileSync(tablePath, "utf8"));
  const classificationPath = path.join(root, "parser-data", "generated", "ModifierClassificationRuntime.json");
  const classification = fs.existsSync(classificationPath)
    ? JSON.parse(fs.readFileSync(classificationPath, "utf8"))
    : {};
  const displayPath = path.join(root, "parser-data", "generated", "ModifierDisplayTable.json");
  const displayTable = fs.existsSync(displayPath)
    ? JSON.parse(fs.readFileSync(displayPath, "utf8"))
    : {};
  const contributionPath = path.join(root, "parser-data", "generated", "ModifierContributionRuntime.json");
  const contributionTable = fs.existsSync(contributionPath)
    ? JSON.parse(fs.readFileSync(contributionPath, "utf8"))
    : {};
  const descriptionsPath = path.join(root, "parser-data", "generated", "ModifierDescriptions.json");
  const descriptionsTable = fs.existsSync(descriptionsPath)
    ? JSON.parse(fs.readFileSync(descriptionsPath, "utf8"))
    : {};
  function enrichEntry(ruleId, entry) {
    const row = classification.sourcesByRuleId?.[ruleId];
    const display = displayTable.sourcesByRuleId?.[ruleId];
    const contribution = contributionTable.sourcesByRuleId?.[ruleId];
    const descriptions = descriptionsTable.sourcesByRuleId?.[ruleId];
    const displayFields = {
      sourceName: display?.sourceName?.trim() || entry.sourceName?.trim() || entry.sourceId,
      ...(display?.sourceNames ?? entry.sourceNames ? { sourceNames: display?.sourceNames ?? entry.sourceNames } : {}),
      ...(display?.iconPath ?? entry.iconPath ? { iconPath: display?.iconPath ?? entry.iconPath } : {}),
      ...(display?.displayOwnerKind ?? entry.displayOwnerKind
        ? { displayOwnerKind: display?.displayOwnerKind ?? entry.displayOwnerKind }
        : {}),
    };
    if (!row) {
      return {
        ...entry,
        sourceRuleId: ruleId,
        ...displayFields,
        ...(descriptions?.description ? { description: descriptions.description } : {}),
        ...(descriptions?.descriptions ? { descriptions: descriptions.descriptions } : {}),
        ...(contribution ? { contributionModel: contribution } : {}),
      };
    }
    return {
      ...entry,
      sourceRuleId: ruleId,
      ...displayFields,
      ...(descriptions?.description ? { description: descriptions.description } : {}),
      ...(descriptions?.descriptions ? { descriptions: descriptions.descriptions } : {}),
      classification: row,
      ...(contribution ? { contributionModel: contribution } : {}),
      ...(entry.talentOwnership || row.ownership
        ? { talentOwnership: entry.talentOwnership ?? row.ownership }
        : {}),
    };
  }
  const sourceConfigNames = new Map();
  const ownerBySkillName = new Map();
  function aoyiOwnerDisplay(row) {
    const names = row.MonsterNames;
    const name = names?.en?.trim() || names?.["zh-CN"]?.trim() || "";
    return name ? { name, names } : null;
  }
  for (const row of skillAoyiRows) {
    const owner = aoyiOwnerDisplay(row);
    if (!owner) continue;
    const labels = [
      row.Name,
      ...Object.values(row.Names ?? {}),
    ];
    for (const label of labels) {
      const key = normalizeDisplayOwnerKey(label);
      if (key && !ownerBySkillName.has(key)) ownerBySkillName.set(key, owner);
    }
  }
  for (const row of skillAoyiRows) {
    const id = finitePositiveNumber(row.Id ?? row.id);
    if (id === null) continue;
    const owner = aoyiOwnerDisplay(row)
      ?? ownerBySkillName.get(normalizeDisplayOwnerKey(row.Name))
      ?? Object.values(row.Names ?? {})
        .map((label) => ownerBySkillName.get(normalizeDisplayOwnerKey(label)))
        .find(Boolean);
    const names = owner?.names ?? row.Names;
    const name = names?.en?.trim() || row.Name?.trim() || names?.["zh-CN"]?.trim() || String(id);
    sourceConfigNames.set(id, names ? { name, names } : { name });
  }

  const ids = new Set();
  const observed = new Map();
  function recordObserved(id, role, bucket) {
    const parsed = finitePositiveNumber(id);
    if (parsed === null) return;
    ids.add(parsed);
    let row = observed.get(parsed);
    if (!row) {
      row = {
        buffId: parsed,
        roles: new Set(),
        bucketCount: 0,
        hits: 0,
        totalValue: 0,
        effectiveTotalValue: 0,
        pairedBaseIds: new Set(),
        pairedSourceConfigIds: new Set(),
      };
      observed.set(parsed, row);
    }
    row.roles.add(role);
    row.bucketCount += 1;
    row.hits += Number(bucket.hits) || 0;
    row.totalValue += Number(bucket.totalValue) || 0;
    row.effectiveTotalValue += Number(bucket.effectiveTotalValue) || 0;
    const baseId = finitePositiveNumber(bucket.modifierBaseId);
    const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
    if (baseId !== null) row.pairedBaseIds.add(baseId);
    if (sourceConfigId !== null) row.pairedSourceConfigIds.add(sourceConfigId);
  }
  for (const bucket of entity.modifierHitBuckets ?? []) {
    recordObserved(bucket.modifierBaseId, "base", bucket);
    recordObserved(bucket.modifierSourceConfigId, "sourceConfig", bucket);
  }

  const byBuffId = {};
  const reportableBuffIds = new Set();
  for (const buffId of sortedNumbers(ids)) {
    const entries = (table.byBuffId?.[String(buffId)] ?? [])
      .map((entryId) => {
        const entry = table.sourcesById?.[entryId];
        return entry ? enrichEntry(entryId, entry) : undefined;
      })
      .filter(Boolean)
      .filter(isCatalogReportEntry);
    if (entries.length > 0) {
      byBuffId[String(buffId)] = entries;
      reportableBuffIds.add(buffId);
    }
  }
  const seenPairs = new Set();
  for (const bucket of entity.modifierHitBuckets ?? []) {
    const baseId = finitePositiveNumber(bucket.modifierBaseId);
    const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
    if (baseId === null || sourceConfigId === null || sourceConfigId === baseId) continue;
    const owner = sourceConfigNames.get(sourceConfigId);
    if (!owner) continue;
    const pairKey = `${baseId}:${sourceConfigId}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    for (const entry of byBuffId[String(baseId)] ?? []) {
      const hasStaticTargets = (entry.targetDamageIds?.length ?? 0) > 0 || (entry.targetRecountIds?.length ?? 0) > 0;
      const alreadyQualified = /\s+-\s+| - |！|!/.test(entry.sourceName?.trim() ?? "")
        || /\s+-\s+| - |！|!/.test(entry.sourceNames?.en?.trim() ?? "")
        || /\s+-\s+| - |！|!/.test(entry.sourceNames?.["zh-CN"]?.trim() ?? "");
      if (entry.sourceKind !== "imagine" || hasStaticTargets || alreadyQualified) continue;
      const sourceNames = {};
      const locales = new Set([...Object.keys(owner.names ?? {}), ...Object.keys(entry.sourceNames ?? {}), "en"]);
      for (const locale of locales) {
        const ownerName = owner.names?.[locale]?.trim() || owner.names?.en?.trim() || owner.name;
        const childName = entry.sourceNames?.[locale]?.trim() || entry.sourceNames?.en?.trim() || entry.sourceName;
        sourceNames[locale] = `${ownerName} - ${childName}`;
      }
      const rows = byBuffId[String(sourceConfigId)] ?? [];
      const { displayOwnerKind: _displayOwnerKind, ...entryWithoutGenericOwner } = entry;
      rows.push({
        ...entryWithoutGenericOwner,
        sourceId: `${entry.sourceId}|source-config:${sourceConfigId}`,
        sourceEntityId: sourceConfigId,
        sourceName: sourceNames.en,
        sourceNames,
        runtimeSourceConfigIds: [sourceConfigId],
        runtimeBaseIds: [baseId],
        evidence: [...(entry.evidence ?? []), `runtimeSourceConfig:${sourceConfigId}`, `runtimeBaseBuff:${baseId}`],
      });
      byBuffId[String(sourceConfigId)] = rows;
      reportableBuffIds.add(sourceConfigId);
    }
  }
  const decoratedByBuffId = decorateCatalogEntries(byBuffId);
  const ownerSpecIds = new Set();
  for (const talent of entity.activeProfessionTalents ?? []) {
    const professionId = finitePositiveNumber(talent.professionId);
    if (professionId !== null && entity.classId > 0 && professionId !== entity.classId) continue;
    const nodeId = finitePositiveNumber(talent.talentNodeId);
    const decoded = nodeId !== null ? decodeProfessionTalentNodeId(nodeId) : null;
    if (decoded === null) continue;
    for (const [ruleId, source] of Object.entries(table.sourcesById ?? {})) {
      const entry = enrichEntry(ruleId, source);
      if (entry.talentOwnership?.ownershipKind !== "spec-selector") continue;
      if (finitePositiveNumber(entry.sourceEntityId) !== decoded) continue;
      for (const specId of ownershipSpecIds(entry.talentOwnership)) ownerSpecIds.add(specId);
    }
  }
  for (const buffId of sortedNumbers(ids)) {
    for (const entry of decoratedByBuffId[String(buffId)] ?? []) {
      const ownership = entry.talentOwnership;
      if (ownership?.ownershipKind !== "spec-selector") continue;
      const classId = finitePositiveNumber(ownership.classId);
      if (classId !== null && entity.classId > 0 && classId !== entity.classId) continue;
      for (const specId of ownershipSpecIds(ownership)) ownerSpecIds.add(specId);
    }
  }
  const ignoredBuffIds = new Set(table.ignoredBuffIds ?? []);
  const unmappedObservedBuffs = [...observed.values()]
    .filter((row) => !reportableBuffIds.has(row.buffId) && !ignoredBuffIds.has(row.buffId))
    .map((row) => ({
      ...row,
      roles: [...row.roles].sort(),
      pairedBaseIds: sortedNumbers(row.pairedBaseIds),
      pairedSourceConfigIds: sortedNumbers(row.pairedSourceConfigIds),
    }))
    .sort((left, right) => (right.hits - left.hits) || (left.buffId - right.buffId))
    .slice(0, 80);
  return {
    byBuffId: decoratedByBuffId,
    ignoredBuffIds: table.ignoredBuffIds ?? [],
    reportableBuffIds: sortedNumbers(reportableBuffIds),
    debugBuffIds: table.debugBuffIds ?? [],
    unmappedObservedBuffs,
    ...(entity.classId > 0 ? { ownerClassId: entity.classId } : {}),
    ...(ownerSpecIds.size > 0 ? { ownerSpecIds: sortedNumbers(ownerSpecIds) } : {}),
  };
}

function bucketIds(bucket) {
  return [
    finitePositiveNumber(bucket.modifierBaseId),
    finitePositiveNumber(bucket.modifierSourceConfigId),
  ].filter((id) => id !== null);
}

function keepProbeBucket(bucket, catalog) {
  if (!catalog?.reportableBuffIds?.length) return true;
  const reportable = new Set(catalog.reportableBuffIds);
  const ignored = new Set(catalog.ignoredBuffIds ?? []);
  const ids = bucketIds(bucket);
  return ids.length > 0 && !ids.some((id) => ignored.has(id)) && ids.some((id) => reportable.has(id));
}

const catalogBuild = time("catalog_build", () => buildProbeModifierSourceCatalog(entityParse.value));
if (catalogBuild.value) {
  entityParse.value.modifierSourceCatalog = catalogBuild.value;
  entityParse.value.modifierHitBuckets = (entityParse.value.modifierHitBuckets ?? [])
    .filter((bucket) => keepProbeBucket(bucket, catalogBuild.value));
}

const workerMessages = [];
let cloneBackMs = 0;
const sandbox = {
  console,
  performance,
  self: {
    onmessage: null,
    postMessage(message) {
      const clone = time("worker_post_clone", () => structuredClone(message));
      cloneBackMs += clone.ms;
      workerMessages.push(clone.value);
    },
  },
};

const workerEval = time("worker_eval", () => {
  vm.runInNewContext(workerRead.value, sandbox, {
    filename: workerPath,
  });
});

if (typeof sandbox.self.onmessage !== "function") {
  throw new Error("Worker bundle did not register self.onmessage");
}

const requestData = {
  requestId: 1,
  entity: entityParse.value,
  elapsedSecs: 377,
  options: {
    scope: "all-active",
    actorFilter: actorFilterArg === "external" ? "external" : "all",
    encounterStartMs: null,
    encounterEndMs: null,
  },
};

const requestClone = time("request_clone_to_worker", () => structuredClone(requestData));
const workerRun = time("worker_run", () => {
  sandbox.self.onmessage({ data: requestClone.value });
});

const ok = workerMessages.find((message) => message.status === "ok");
const started = workerMessages.find((message) => message.status === "started");
const err = workerMessages.find((message) => message.status === "error");

const rows = ok?.rows ?? [];
const childRows = rows.reduce((sum, row) => sum + (row.skills?.length ?? 0), 0);
const estimatedContributionRows = rows.filter((row) => (row.estimatedContributionTotal ?? 0) > 0);
const estimatedContributionTotal = estimatedContributionRows.reduce(
  (sum, row) => sum + (row.estimatedContributionTotal ?? 0),
  0,
);

function countByKey(items, keyForItem) {
  const out = {};
  for (const item of items) {
    const key = keyForItem(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function rowContributionMode(row) {
  return row.contributionModel?.contributionMode ?? "none";
}

function rowFormulaReplayStatus(row) {
  return row.formulaReplayModel?.status ?? "none";
}

function summarizeFormulaReplayModel(model) {
  if (!model) return null;
  return {
    status: model.status,
    buckets: model.bucketCount,
    singleHitBuckets: model.singleHitBucketCount,
    hits: model.hitCount,
    mixedCritBuckets: model.mixedCritBucketCount,
    mixedLuckyBuckets: model.mixedLuckyBucketCount,
    missingEvidence: model.missingEvidence?.slice(0, 10) ?? [],
    blockers: model.blockers?.slice(0, 10) ?? [],
    formulaTermIds: model.formulaTermIds?.slice(0, 12) ?? [],
    contributionGroups: model.contributionGroups?.slice(0, 12) ?? [],
    replayedContributionTotal: model.replayedContributionTotal,
    counterfactualTotal: model.counterfactualTotal,
    replayedHitCount: model.replayedHitCount,
    replayedAppliedHitCount: model.replayedAppliedHitCount,
    replayedComponents: model.replayedComponents?.slice(0, 8).map((component) => ({
      componentKey: component.componentKey,
      label: component.label,
      formulaTermIds: component.formulaTermIds,
      decimalValue: component.decimalValue,
      contributionTotal: component.contributionTotal,
      hitCount: component.hitCount,
      method: component.method,
    })) ?? [],
    skippedReplayComponents: model.skippedReplayComponents?.slice(0, 10) ?? [],
    componentValues: model.componentValues?.slice(0, 12).map((value) => ({
      componentKey: value.componentKey,
      label: value.label,
      effectClass: value.effectClass,
      valueResolution: value.valueResolution,
      actorScope: value.actorScope,
      scope: value.scope,
      rawText: value.rawText,
      unit: value.unit,
      value: value.value,
      decimalValue: value.decimalValue,
      formulaAmount: value.formulaAmount,
      resolved: value.resolved,
      selectedBy: value.selectedBy,
    })) ?? [],
  };
}

function actorDisplayName(actor) {
  const uid = finitePositiveNumber(actor?.uid);
  const idLabel = uid === null ? "#?" : `#${uid}`;
  const owner = String(actor?.ownerName ?? "").trim();
  const name = String(actor?.name ?? "").trim();
  const displayName = owner && owner !== name ? owner : name;
  return displayName && displayName !== idLabel ? displayName : idLabel;
}

function externalSourceNames(row) {
  const names = [];
  const seen = new Set();
  for (const actor of row.actorSummary?.externalSourceActors ?? []) {
    const name = actorDisplayName(actor);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (names.length > 0) return names;
  for (const uid of row.actorSummary?.externalSourceUids ?? []) {
    const name = `#${uid}`;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

const formulaReplayRows = rows.filter((row) => row.formulaReplayModel);
const formulaReplaySkillRows = rows.flatMap((row) =>
  (row.skills ?? [])
    .filter((skill) => skill.formulaReplayModel)
    .map((skill) => ({ row, skill, model: skill.formulaReplayModel })),
);

console.log(JSON.stringify({
  entityPath,
  entityBytes: Buffer.byteLength(entityRead.value),
  workerPath,
  workerBytes: Buffer.byteLength(workerRead.value),
  inputBuckets: requestData.entity.modifierHitBuckets?.length ?? null,
  inputReplayHits: requestData.entity.modifierReplayHits?.length ?? null,
  actorFilter: requestData.options.actorFilter,
  catalogReportableBuffIds: catalogBuild.value?.reportableBuffIds?.length ?? null,
  modifierRelationshipUidEdges: modifierRelationshipRead.value?.stats?.uidEdges ?? null,
  modifierRelationshipUidEdgeKindCounts: modifierRelationshipRead.value?.stats?.uidEdgeKindCounts ?? null,
  catalogUnknownObservedBuffs: catalogBuild.value?.unmappedObservedBuffs?.slice(0, 12).map((row) => ({
    buffId: row.buffId,
    roles: row.roles,
    hits: row.hits,
    totalValue: row.totalValue,
    pairedBaseIds: row.pairedBaseIds,
    pairedSourceConfigIds: row.pairedSourceConfigIds,
  })) ?? null,
  startedBuckets: started?.buckets ?? null,
  rows: rows.length,
  childRows,
  contributionModeCounts: countByKey(rows, rowContributionMode),
  formulaReplayStatusCounts: countByKey(rows, rowFormulaReplayStatus),
  formulaReplaySkillStatusCounts: countByKey(formulaReplaySkillRows, (entry) => entry.model?.status ?? "none"),
  estimatedContributionRows: estimatedContributionRows.length,
  estimatedContributionTotal,
  topExactContributionRows: estimatedContributionRows
    .slice()
    .sort((left, right) => (right.estimatedContributionTotal ?? 0) - (left.estimatedContributionTotal ?? 0))
    .slice(0, 16)
    .map((row) => ({
      sourceName: row.sourceName,
      sourceRuleId: row.sourceRuleId,
      contributionMode: row.contributionModel?.contributionMode,
      contributionTier: row.contributionModel?.contributionTier,
      estimatedContributionTotal: row.estimatedContributionTotal,
      estimatedContributionConfidence: row.estimatedContributionConfidence,
      damage: row.totalDmg,
      hits: row.hits,
      children: row.skills?.length ?? 0,
    })),
  formulaReplayRows: formulaReplayRows.length,
  formulaReplaySkillRows: formulaReplaySkillRows.length,
  topFormulaReplayRows: formulaReplayRows
    .slice()
    .sort((left, right) => (right.totalDmg ?? 0) - (left.totalDmg ?? 0))
    .slice(0, 16)
    .map((row) => ({
      sourceName: row.sourceName,
      sourceRuleId: row.sourceRuleId,
      contributionMode: row.contributionModel?.contributionMode,
      damage: row.totalDmg,
      hits: row.hits,
      children: row.skills?.length ?? 0,
      formulaReplay: summarizeFormulaReplayModel(row.formulaReplayModel),
    })),
  topFormulaReplaySkillRows: formulaReplaySkillRows
    .slice()
    .sort((left, right) => (right.skill.totalDmg ?? 0) - (left.skill.totalDmg ?? 0))
    .slice(0, 16)
    .map((entry) => ({
      sourceName: entry.row.sourceName,
      sourceRuleId: entry.row.sourceRuleId,
      skillId: entry.skill.skillId,
      skillName: entry.skill.name,
      damageIds: entry.skill.damageIds,
      damage: entry.skill.totalDmg,
      hits: entry.skill.hits,
      formulaReplay: summarizeFormulaReplayModel(entry.model),
    })),
  workerElapsedMs: ok?.elapsedMs ?? null,
  workerError: err?.error ?? null,
  timingsMs: {
    entityRead: Math.round(entityRead.ms),
    entityParse: Math.round(entityParse.ms),
    catalogBuild: Math.round(catalogBuild.ms),
    workerRead: Math.round(workerRead.ms),
    modifierRelationshipRead: Math.round(modifierRelationshipRead.ms),
    workerEval: Math.round(workerEval.ms),
    requestCloneToWorker: Math.round(requestClone.ms),
    workerRunIncludingCloneBack: Math.round(workerRun.ms),
    cloneBack: Math.round(cloneBackMs),
  },
  previewRows: rows.slice(0, 80).map((row) => ({
    sourceName: row.sourceName,
    sourceRuleId: row.sourceRuleId,
    sourceId: row.sourceId,
    sourceKind: row.sourceKind,
    sourceType: row.sourceType,
    providerAggregation: row.providerAggregation,
    displayOwnerKind: row.displayOwnerKind,
    match: row.match,
    externalSourceUids: row.actorSummary?.externalSourceUids ?? [],
    externalSourceNames: externalSourceNames(row),
    hasDescription: Boolean(row.description || Object.keys(row.descriptions ?? {}).length > 0),
    descriptionPreview: row.description
      ? `${row.description.slice(0, 180)}${row.description.length > 180 ? "..." : ""}`
      : undefined,
    contributionMode: row.contributionModel?.contributionMode,
    contributionTier: row.contributionModel?.contributionTier,
    formulaReplayStatus: row.formulaReplayModel?.status,
    formulaReplayMissingEvidence: row.formulaReplayModel?.missingEvidence?.slice(0, 6),
    formulaReplayBlockers: row.formulaReplayModel?.blockers?.slice(0, 6),
    formulaReplayComponentValues: row.formulaReplayModel?.componentValues?.slice(0, 6).map((value) => ({
      componentKey: value.componentKey,
      actorScope: value.actorScope,
      scope: value.scope,
      rawText: value.rawText,
      formulaAmount: value.formulaAmount,
      resolved: value.resolved,
    })),
    estimatedContributionTotal: row.estimatedContributionTotal,
    estimatedContributionConfidence: row.estimatedContributionConfidence,
    damage: row.totalDmg,
    hits: row.hits,
    children: row.skills?.length ?? 0,
  })),
}, null, 2));
