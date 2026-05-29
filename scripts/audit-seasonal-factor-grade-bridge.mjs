#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_INPUTS = 4;
const DEFAULT_OUT_JSON = "DEV_exports/seasonal-factor-grade-bridge-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/seasonal-factor-grade-bridge-audit.md";
const DEFAULT_CURRENT_VDATA = "DEV_exports/factor-vdata-current.json";
const DEFAULT_VDATA_PATH_SCAN = "DEV_exports/vdata-path-scan-current.json";
const DEFAULT_RECONCILIATION_AUDIT = "DEV_exports/modifier-expected-value-audit-211-214.json";
const DEFAULT_CONTAINER_PROBE_AUDIT = "DEV_exports/container-probe-audit.json";
const SEASONAL_MODIFIER_ID_MIN = 3050000;
const SEASONAL_MODIFIER_ID_MAX = 3060000;
const DEFAULT_VALUE_PROOF_CANDIDATES = [
  "DEV_generated/modifier/ModifierValueProofRuntime.json",
  "parser-data/generated/ModifierValueProofRuntime.json",
  "../BPSR-UID-Extractors/output/ModifierValueProofRuntime.json",
];
const DEFAULT_FACTOR_DESCRIPTION_CANDIDATES = [
  "DEV_generated/modifier/FactorDescriptions.json",
  "../BPSR-UID-Extractors/output/FactorDescriptions.json",
  "parser-data/generated/FactorDescriptions.json",
];

function usage() {
  return `Usage: node scripts/audit-seasonal-factor-grade-bridge.mjs [options]

Options:
  --input <path>             Add a modifier-entity export. Repeatable.
  --latest <count>           Use latest DEV_exports/modifier-entity-*.json when no inputs are provided. Default: ${DEFAULT_LATEST_INPUTS}
  --value-proof <path>       ModifierValueProofRuntime.json path. Defaults to app parser-data, then sibling extractor output.
  --factor-descriptions <p>  FactorDescriptions.json path. Defaults to app parser-data, then sibling extractor output.
  --reconciliation <path>    Optional modifier expected-value audit with Seasonal Factor Value Reconciliation rows.
                             Default: ${DEFAULT_RECONCILIATION_AUDIT}
  --current-vdata <path>     Optional current probe_factor_vdata report. Default: ${DEFAULT_CURRENT_VDATA}
  --vdata-path-scan <path>   Optional current probe:vdata:path-scan report. Default: ${DEFAULT_VDATA_PATH_SCAN}
  --container-probes <path>  Optional audit-container-probes report. Default: ${DEFAULT_CONTAINER_PROBE_AUDIT}
  --max-rows <count>         Max Markdown rows. Default: 120
  --out-json <path>          JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>            Markdown report path. Default: ${DEFAULT_OUT_MD}
`;
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    valueProof: null,
    factorDescriptions: null,
    reconciliation: DEFAULT_RECONCILIATION_AUDIT,
    currentVdata: DEFAULT_CURRENT_VDATA,
    vdataPathScan: DEFAULT_VDATA_PATH_SCAN,
    containerProbes: DEFAULT_CONTAINER_PROBE_AUDIT,
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
    } else if (arg === "--value-proof") {
      options.valueProof = next();
    } else if (arg === "--factor-descriptions") {
      options.factorDescriptions = next();
    } else if (arg === "--reconciliation") {
      options.reconciliation = next();
    } else if (arg === "--current-vdata") {
      options.currentVdata = next();
    } else if (arg === "--vdata-path-scan") {
      options.vdataPathScan = next();
    } else if (arg === "--container-probes") {
      options.containerProbes = next();
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
  if (!filePath) return filePath;
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function compactPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved || !fs.existsSync(resolved)) return fallback;
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    const resolved = resolveRepoPath(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
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
    .map((entry) => entry.filePath);
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

function seasonalId(value) {
  const id = positiveNumber(value);
  return id !== null && id >= SEASONAL_MODIFIER_ID_MIN && id < SEASONAL_MODIFIER_ID_MAX ? id : null;
}

function incrementMap(map, key, amount = 1) {
  const stringKey = String(key ?? "unknown");
  map.set(stringKey, (map.get(stringKey) ?? 0) + amount);
}

function addToSetMap(map, key, value) {
  if (value === null || value === undefined || value === "") return;
  const stringKey = String(key);
  const set = map.get(stringKey) ?? new Set();
  set.add(String(value));
  map.set(stringKey, set);
}

function sortedMapCounts(map, limit = 12) {
  return Object.fromEntries(
    [...map.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit),
  );
}

function sortedSetValues(set) {
  return [...set].sort((left, right) => String(left).localeCompare(String(right)));
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function formatPercent(value, digits = 2) {
  const number = finiteNumber(value);
  if (number === null) return "-";
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(digits)}%`;
}

function formatCounts(value) {
  const entries = Object.entries(value ?? {});
  if (!entries.length) return "-";
  return entries.map(([key, count]) => `${key}x${count}`).join(", ");
}

function seasonalKeysFromCountObject(value) {
  return Object.keys(value ?? {})
    .map(seasonalId)
    .filter((id) => id !== null);
}

function formatList(values, limit = 6) {
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

function normalizeFactorItem(row, source) {
  const factorBuffId = positiveNumber(row?.factor_buff_id ?? row?.factorBuffId);
  if (factorBuffId === null) return null;
  const gradeRow = asObject(row?.grade_row ?? row?.gradeRow);
  return {
    factorBuffId,
    itemConfigId: positiveNumber(row?.item_config_id ?? row?.itemConfigId ?? row?.config_id ?? row?.configId ?? gradeRow.itemId),
    itemUuid: positiveNumber(row?.item_uuid ?? row?.itemUuid ?? row?.uuid),
    packageKey: finiteNumber(row?.package_key ?? row?.packageKey),
    packageType: finiteNumber(row?.package_type ?? row?.packageType),
    grade: finiteNumber(row?.grade ?? gradeRow.grade),
    familyId: finiteNumber(row?.family_id ?? row?.familyId),
    familyName: row?.family_name ?? row?.familyName ?? null,
    valueTexts: asArray(gradeRow.valueTexts),
    description: gradeRow.cleanResolvedDescription ?? row?.description ?? null,
    runtimeSource: row?.runtime_source ?? row?.runtimeSource ?? source,
    source,
  };
}

function compactFactorItem(item) {
  const parts = [];
  if (item.grade !== null) parts.push(`G${item.grade}`);
  if (item.itemConfigId !== null) parts.push(`item:${item.itemConfigId}`);
  if (item.valueTexts?.length) parts.push(item.valueTexts.join("/"));
  if (item.source) parts.push(item.source);
  return parts.join(" ");
}

function inputEntities(raw) {
  return Array.isArray(raw?.entities) ? raw.entities : [raw].filter(Boolean);
}

function loadValueProofIndex(filePath) {
  const valueProof = readJson(filePath, {});
  const byUid = new Map();
  for (const entry of Object.values(valueProof.entriesByKey ?? {})) {
    const uid = String(entry.uid ?? "");
    if (!uid) continue;
    const selectors = asArray(entry.valueSelectors);
    const runtimeValueSelectors = selectors.filter(
      (selector) =>
        selector?.kind === "runtime-value-ladder" ||
        String(selector?.status ?? "").includes("runtime-value-ladder"),
    );
    const row = byUid.get(uid) ?? {
      uid,
      labels: new Set(),
      categories: new Set(),
      runtimeKinds: new Set(),
      valueProofStatuses: new Set(),
      valueBlockers: new Set(),
      formulaZoneIds: new Set(),
      entries: [],
      candidateValues: [],
      requiresRuntimeValueSelection: false,
    };
    row.labels.add(entry.sourceLabel || `uid:${uid}`);
    row.categories.add(entry.category || "unknown");
    row.runtimeKinds.add(entry.runtimeKind || "unknown");
    row.valueProofStatuses.add(entry.valueProofStatus || "unknown");
    for (const blocker of asArray(entry.valueBlockers)) row.valueBlockers.add(String(blocker));
    for (const zone of asArray(entry.formulaZoneIds)) row.formulaZoneIds.add(String(zone));
    row.requiresRuntimeValueSelection =
      row.requiresRuntimeValueSelection ||
      runtimeValueSelectors.length > 0 ||
      asArray(entry.valueBlockers).some((blocker) => String(blocker).includes("value-ladder-selection-required"));
    for (const selector of runtimeValueSelectors) {
      for (const candidate of asArray(selector.candidates)) {
        row.candidateValues.push({
          componentKey: selector.componentKey ?? "unknown",
          grade: finiteNumber(candidate.grade),
          gradeKind: candidate.gradeKind ?? null,
          value: finiteNumber(candidate.value),
          decimalValue: finiteNumber(candidate.decimalValue),
          unit: candidate.unit ?? null,
          rawText: candidate.rawText ?? null,
        });
      }
    }
    row.entries.push({
      key: entry.key,
      category: entry.category,
      runtimeKind: entry.runtimeKind,
      valueProofStatus: entry.valueProofStatus,
    });
    byUid.set(uid, row);
  }

  for (const [uid, row] of byUid.entries()) {
    row.labels = sortedSetValues(row.labels);
    row.categories = sortedSetValues(row.categories);
    row.runtimeKinds = sortedSetValues(row.runtimeKinds);
    row.valueProofStatuses = sortedSetValues(row.valueProofStatuses);
    row.valueBlockers = sortedSetValues(row.valueBlockers);
    row.formulaZoneIds = sortedSetValues(row.formulaZoneIds);
    row.candidateValues.sort((left, right) => {
      const componentDelta = String(left.componentKey).localeCompare(String(right.componentKey));
      if (componentDelta !== 0) return componentDelta;
      return (left.grade ?? 9999) - (right.grade ?? 9999) || (left.decimalValue ?? 0) - (right.decimalValue ?? 0);
    });
    byUid.set(uid, row);
  }
  return byUid;
}

function loadFactorDescriptionsIndex(filePath) {
  const descriptions = readJson(filePath, {});
  const rows = descriptions.entriesByUid ?? descriptions;
  const byUid = new Map();
  for (const [uid, row] of Object.entries(rows)) {
    if (!/^\d+$/.test(uid)) continue;
    byUid.set(uid, row);
  }
  return byUid;
}

function loadReconciliationIndex(filePath) {
  const report = readJson(filePath, null);
  const byUid = new Map();
  for (const row of asArray(report?.seasonalFactorValueReconciliation)) {
    const uid = String(row.rawId ?? "");
    if (!uid) continue;
    const rows = byUid.get(uid) ?? [];
    rows.push(row);
    byUid.set(uid, rows);
  }
  return byUid;
}

function loadCurrentVdataIndex(filePath) {
  const report = readJson(filePath, null);
  const rows = [];
  for (const item of asArray(report?.equipped_factor_item_matches ?? report?.equippedFactorItemMatches)) {
    const normalized = normalizeFactorItem(item, "current-vdata-equipped-nonhistorical");
    if (normalized) rows.push(normalized);
  }
  for (const item of asArray(report?.factor_item_matches ?? report?.factorItemMatches)) {
    const normalized = normalizeFactorItem(item, "current-vdata-owned-item-package-nonproof");
    if (normalized) rows.push(normalized);
  }
  for (const item of asArray(report?.buff_db_factor_matches ?? report?.buffDbFactorMatches)) {
    const normalized = normalizeFactorItem(item, "current-vdata-buff-db-nonhistorical");
    if (normalized) rows.push(normalized);
  }

  const byBuffId = new Map();
  for (const row of rows) {
    const key = String(row.factorBuffId);
    const existing = byBuffId.get(key) ?? [];
    existing.push(row);
    byBuffId.set(key, existing);
  }
  return {
    path: filePath,
    source: report?.source ?? "missing",
    conclusion: report?.conclusion ?? null,
    rows,
    byBuffId,
  };
}

function normalizeVdataPathHint(match, source) {
  const needles = asArray(match?.needles);
  const factorNeedles = needles.filter((needle) => seasonalId(needle?.factor_buff_id ?? needle?.factorBuffId) !== null);
  return factorNeedles.map((needle) => ({
    factorBuffId: seasonalId(needle.factor_buff_id ?? needle.factorBuffId),
    context: match.context ?? "unknown",
    path: match.path ?? null,
    location: match.location ?? null,
    value: match.value ?? null,
    needleKind: needle.kind ?? null,
    familyId: finiteNumber(needle.family_id ?? needle.familyId),
    familyName: needle.family_name ?? needle.familyName ?? null,
    itemConfigId: positiveNumber(needle.item_id ?? needle.itemId),
    grade: finiteNumber(needle.grade),
    valueTexts: asArray(needle.value_texts ?? needle.valueTexts),
    source,
  }));
}

function loadVdataPathScanIndex(filePath) {
  const report = readJson(filePath, null);
  const rows = [];
  for (const match of asArray(report?.matches)) {
    rows.push(...normalizeVdataPathHint(match, "current-vdata-decoded-path-nonhistorical"));
  }
  for (const match of asArray(report?.raw_proto_matches ?? report?.rawProtoMatches)) {
    rows.push(...normalizeVdataPathHint(match, "current-vdata-raw-proto-path-nonhistorical"));
  }

  const byBuffId = new Map();
  for (const row of rows) {
    if (row.factorBuffId === null) continue;
    const key = String(row.factorBuffId);
    const existing = byBuffId.get(key) ?? [];
    existing.push(row);
    byBuffId.set(key, existing);
  }
  return {
    path: filePath,
    source: report?.source ?? "missing",
    summary: report?.summary ?? {},
    rows,
    byBuffId,
  };
}

function loadContainerProbeIndex(filePath) {
  const report = readJson(filePath, null);
  const rows = [];
  for (const probeRow of asArray(report?.rows)) {
    const compactProbeFile = probeRow.file ? path.basename(String(probeRow.file)) : null;
    for (const transition of asArray(probeRow.dirtyTreeSelectedTransitionCandidates)) {
      const factorBuffId = positiveNumber(transition.factorBuffId);
      const itemConfigId = positiveNumber(transition.itemConfigId);
      if (factorBuffId === null || itemConfigId === null) continue;
      rows.push({
        factorBuffId,
        itemConfigId,
        itemConfigIds: [itemConfigId],
        itemUuid: null,
        packageKey: null,
        packageType: null,
        grade: finiteNumber(transition.grade),
        grades: [finiteNumber(transition.grade)].filter((value) => value !== null),
        familyId: finiteNumber(transition.familyId),
        familyName: transition.familyName ?? null,
        valueTexts: asArray(transition.valueTexts),
        description: transition.cleanResolvedDescription ?? null,
        runtimeSource: "container-probe-dirty-tree-selected-transition",
        source: "container-probe-dirty-tree-selected-transition",
        probeFile: compactProbeFile,
        probeTsMs: finiteNumber(probeRow.tsMs),
        probeStatus: transition.proofClass ?? transition.evidenceType ?? "dirty-tree-selected-transition",
        selectedTransition: true,
        treePath: transition.treePath ?? null,
        treeSignature: transition.treeSignature ?? null,
        zeroValue: transition.zeroValue ?? null,
        gradeValue: transition.gradeValue ?? null,
        rowDistance: finiteNumber(transition.rowDistance),
        msAfterZero: finiteNumber(transition.msAfterZero),
      });
    }
    for (const group of asArray(probeRow.factorGroups)) {
      const factorBuffId = positiveNumber(group.factorBuffId);
      if (factorBuffId === null || !asArray(group.gradeItems).length) continue;
      rows.push({
        factorBuffId,
        itemConfigId: positiveNumber(asArray(group.gradeItems)[0]),
        itemConfigIds: asArray(group.gradeItems).map(positiveNumber).filter((value) => value !== null),
        itemUuid: null,
        packageKey: null,
        packageType: null,
        grade: finiteNumber(asArray(group.grades)[0]),
        grades: asArray(group.grades).map(finiteNumber).filter((value) => value !== null),
        familyId: finiteNumber(group.familyId),
        familyName: group.familyName ?? null,
        valueTexts: asArray(group.valueTexts),
        description: null,
        runtimeSource: "container-probe-capture-unlinked",
        source: `container-probe-${group.status ?? "candidate"}-unlinked`,
        probeFile: compactProbeFile,
        probeTsMs: finiteNumber(probeRow.tsMs),
        probeStatus: group.status ?? "unknown",
      });
    }
  }

  const byBuffId = new Map();
  for (const row of rows) {
    const key = String(row.factorBuffId);
    const existing = byBuffId.get(key) ?? [];
    existing.push(row);
    byBuffId.set(key, existing);
  }
  return {
    path: filePath,
    source: report?.source ?? "missing",
    scannedFileCount: report?.scannedFileCount ?? 0,
    probeEntryCount: report?.probeEntryCount ?? 0,
    rows,
    byBuffId,
  };
}

function rawBucketIds(bucket) {
  const ids = [
    bucket.modifierBaseId,
    bucket.modifier_base_id,
    bucket.modifierSourceConfigId,
    bucket.modifier_source_config_id,
  ]
    .map(seasonalId)
    .filter((value) => value !== null);
  return [...new Set(ids)];
}

function collectRawSeasonalRows(filePath, entity, valueProofByUid, factorDescriptionsByUid, reconciliationByUid) {
  const compactFile = compactPath(filePath);
  const entityUid = positiveNumber(entity.uid);
  const activeFactorItems = asArray(entity.activeFactorItems ?? entity.active_factor_items)
    .map((item) => normalizeFactorItem(item, "encounter-activeFactorItems"))
    .filter(Boolean);
  const byRawId = new Map();

  for (const bucket of asArray(entity.modifierHitBuckets ?? entity.modifier_hit_buckets)) {
    for (const rawId of rawBucketIds(bucket)) {
      const uid = String(rawId);
      let row = byRawId.get(uid);
      if (!row) {
        const proof = valueProofByUid.get(uid) ?? null;
        const description = factorDescriptionsByUid.get(uid) ?? null;
        row = {
          file: compactFile,
          entityUid,
          entityName: entity.name ?? `#${entityUid}`,
          rawId: uid,
          labels: proof?.labels ?? [description?.name ?? `uid:${uid}`],
          categories: proof?.categories ?? [],
          runtimeKinds: proof?.runtimeKinds ?? [],
          valueProofStatuses: proof?.valueProofStatuses ?? ["unmapped"],
          formulaZoneIds: proof?.formulaZoneIds ?? [],
          valueBlockers: proof?.valueBlockers ?? [],
          requiresRuntimeValueSelection: Boolean(proof?.requiresRuntimeValueSelection),
          candidateValues: proof?.candidateValues ?? [],
          relationshipItemIds: asArray(description?.relationships?.itemIds),
          cleanDescription: description?.cleanDescription ?? description?.cleanDescriptions?.en ?? "",
          reconciliationRows: asArray(reconciliationByUid.get(uid)).filter((candidate) =>
            asArray(candidate.files).includes(compactFile),
          ),
          activeFactorItems: activeFactorItems.filter((item) => String(item.factorBuffId) === uid),
          damageIds: new Map(),
          levels: new Map(),
          layers: new Map(),
          counts: new Map(),
          buffLevels: new Map(),
          sourceConfigIds: new Map(),
          rawFields: new Set(),
          hits: 0,
          totalValue: 0,
        };
        byRawId.set(uid, row);
      }

      row.hits += finiteNumber(bucket.hits) ?? 0;
      row.totalValue += finiteNumber(bucket.totalValue ?? bucket.total_value ?? bucket.effectiveTotalValue) ?? 0;
      incrementMap(row.damageIds, bucket.damageId ?? bucket.damage_id ?? bucket.skillKey ?? bucket.skill_key, finiteNumber(bucket.hits) ?? 1);
      incrementMap(row.layers, bucket.modifierLayer ?? bucket.modifier_layer ?? "null");
      incrementMap(row.counts, bucket.modifierCount ?? bucket.modifier_count ?? "null");
      incrementMap(row.buffLevels, bucket.modifierBuffLevel ?? bucket.modifier_buff_level ?? "null");
      incrementMap(row.sourceConfigIds, bucket.modifierSourceConfigId ?? bucket.modifier_source_config_id ?? "null");
      if (bucket.ownerLevel !== undefined || bucket.owner_level !== undefined) {
        incrementMap(row.levels, bucket.ownerLevel ?? bucket.owner_level ?? "null");
      }
      for (const key of Object.keys(bucket)) {
        if (/modifier/i.test(key) || key === "ownerLevel" || key === "ownerId") row.rawFields.add(key);
      }
    }
  }

  return [...byRawId.values()].map((row) => ({
    ...row,
    damageIds: sortedMapCounts(row.damageIds),
    levels: sortedMapCounts(row.levels),
    layers: sortedMapCounts(row.layers),
    counts: sortedMapCounts(row.counts),
    buffLevels: sortedMapCounts(row.buffLevels),
    sourceConfigIds: sortedMapCounts(row.sourceConfigIds),
    rawFields: sortedSetValues(row.rawFields),
  }));
}

function rowVerdict(row, currentCandidates, containerProbeCandidates, fileContext) {
  if (!row.requiresRuntimeValueSelection) return "no-runtime-selector-needed";
  if (row.activeFactorItems.length) return "encounter-selector-ready";
  if (containerProbeCandidates.some((candidate) => candidate.selectedTransition)) {
    return "selector-dirty-tree-ready";
  }
  if (containerProbeCandidates.length) return "selector-capture-needs-encounter-link";
  if (fileContext?.factorIdentityWithoutSelector) {
    if (currentCandidates.length) return "selector-capture-gap-current-only";
    return "selector-capture-gap";
  }
  if (row.reconciliationRows.length && currentCandidates.length) return "selector-missing-current-conflict-check";
  if (currentCandidates.length) return "selector-missing-current-only";
  return "selector-missing";
}

function currentCandidateSummary(candidates) {
  return candidates.map(compactFactorItem);
}

function containerProbeCandidateSummary(candidates) {
  return candidates.map((candidate) => {
    const parts = [compactFactorItem(candidate)];
    if (candidate.probeStatus) parts.push(candidate.probeStatus);
    if (candidate.selectedTransition && candidate.treePath) parts.push(`path:${candidate.treePath}`);
    if (candidate.probeFile) parts.push(candidate.probeFile);
    return parts.filter(Boolean).join(" ");
  });
}

function vdataPathHintSummary(hints) {
  return hints.map((hint) => {
    const parts = [];
    parts.push(hint.context ?? "unknown");
    if (hint.needleKind) parts.push(hint.needleKind);
    if (hint.grade !== null) parts.push(`G${hint.grade}`);
    if (hint.itemConfigId !== null) parts.push(`item:${hint.itemConfigId}`);
    if (hint.valueTexts?.length) parts.push(hint.valueTexts.join("/"));
    if (hint.path) parts.push(hint.path);
    return parts.join(" ");
  });
}

function reconciliationSummary(rows) {
  return rows.map((row) => {
    const candidate = row.candidate ?? {};
    return [
      row.verdict,
      candidate.componentKey ?? "component",
      candidate.grade !== undefined && candidate.grade !== null ? `G${candidate.grade}` : "G?",
      candidate.rawText ?? formatPercent(candidate.decimalValue),
      `${formatPercent(row.baseExpected)} -> ${formatPercent(row.adjustedExpected)}`,
    ].join(" ");
  });
}

function sourceLinkSummary(links) {
  return links.map((link) => {
    const parts = [`source:${link.sourceId}`];
    if (link.sourceLabels?.length) parts.push(formatList(link.sourceLabels, 2));
    if (link.sourceStatus?.length) parts.push(formatList(link.sourceStatus, 2));
    parts.push(`count:${link.count}`);
    return parts.join(" ");
  });
}

function activeFactorBuffId(row) {
  return seasonalId(row?.factorBuffId ?? row?.factor_buff_id ?? row?.effectSourceBuffId ?? row?.effect_source_buff_id);
}

function factorItemBuffId(row) {
  return seasonalId(row?.factorBuffId ?? row?.factor_buff_id);
}

function buildReport(
  inputPaths,
  valueProofByUid,
  factorDescriptionsByUid,
  reconciliationByUid,
  currentVdata,
  vdataPathScan,
  containerProbes,
) {
  const rows = [];
  const files = [];
  const fileContextByFile = new Map();

  for (const inputPath of inputPaths) {
    const raw = readJson(inputPath, {});
    const entities = inputEntities(raw);
    const fileRows = [];
    let activeFactorItems = 0;
    let activeFactorBuffs = 0;
    let modifierBuckets = 0;
    const activeFactorBuffIds = new Set();
    const activeFactorItemBuffIds = new Set();
    for (const entity of entities) {
      const entityFactorItems = asArray(entity.activeFactorItems ?? entity.active_factor_items);
      const entityFactorBuffs = asArray(entity.activeFactorBuffs ?? entity.active_factor_buffs);
      activeFactorItems += entityFactorItems.length;
      activeFactorBuffs += entityFactorBuffs.length;
      modifierBuckets += asArray(entity.modifierHitBuckets ?? entity.modifier_hit_buckets).length;
      for (const item of entityFactorItems) {
        const id = factorItemBuffId(item);
        if (id !== null) activeFactorItemBuffIds.add(String(id));
      }
      for (const buff of entityFactorBuffs) {
        const id = activeFactorBuffId(buff);
        if (id !== null) activeFactorBuffIds.add(String(id));
      }
      fileRows.push(...collectRawSeasonalRows(inputPath, entity, valueProofByUid, factorDescriptionsByUid, reconciliationByUid));
    }

    const compactFile = compactPath(inputPath);
    const fileContext = {
      file: compactFile,
      activeFactorItems,
      activeFactorBuffs,
      activeFactorBuffIds: sortedSetValues(activeFactorBuffIds),
      activeFactorItemBuffIds: sortedSetValues(activeFactorItemBuffIds),
      factorIdentityWithoutSelector: activeFactorBuffs > 0 && activeFactorItems === 0,
    };
    fileContextByFile.set(compactFile, fileContext);

    for (const row of fileRows) {
      const currentCandidates = asArray(currentVdata.byBuffId.get(row.rawId));
      const vdataPathHints = asArray(vdataPathScan.byBuffId.get(row.rawId));
      const containerProbeCandidates = asArray(containerProbes.byBuffId.get(row.rawId));
      rows.push({
        ...row,
        fileFactorContext: fileContext,
        currentCandidates,
        vdataPathHints,
        containerProbeCandidates,
        verdict: rowVerdict(row, currentCandidates, containerProbeCandidates, fileContext),
      });
    }

    files.push({
      file: compactFile,
      entities: entities.length,
      activeFactorItems,
      activeFactorBuffs,
      activeFactorBuffIds: fileContext.activeFactorBuffIds,
      activeFactorItemBuffIds: fileContext.activeFactorItemBuffIds,
      factorIdentityWithoutSelector: fileContext.factorIdentityWithoutSelector,
      modifierBuckets,
      rawSeasonalIds: [...new Set(fileRows.map((row) => row.rawId))].sort((left, right) => Number(left) - Number(right)),
      rawSeasonalRows: fileRows.length,
      rawRowsNeedingRuntimeValueSelection: fileRows.filter((row) => row.requiresRuntimeValueSelection).length,
      rawRowsWithEncounterSelectors: fileRows.filter((row) => row.activeFactorItems.length).length,
    });
  }

  const rowsByFileAndId = new Map();
  for (const row of rows) {
    rowsByFileAndId.set(`${row.file}:${row.rawId}`, row);
  }
  for (const row of rows) {
    row.observedSourceLinks = seasonalKeysFromCountObject(row.sourceConfigIds)
      .filter((sourceId) => String(sourceId) !== row.rawId)
      .map((sourceId) => {
        const sourceRow = rowsByFileAndId.get(`${row.file}:${sourceId}`);
        return {
          sourceId,
          count: row.sourceConfigIds[String(sourceId)] ?? 0,
          sourceLabels: sourceRow?.labels ?? [],
          sourceStatus: sourceRow?.valueProofStatuses ?? [],
          sourceRequiresRuntimeValueSelection: Boolean(sourceRow?.requiresRuntimeValueSelection),
        };
      });
  }

  rows.sort((left, right) => {
    const verdictRank = {
      "selector-missing-current-conflict-check": 0,
      "selector-missing-current-only": 1,
      "selector-capture-gap-current-only": 2,
      "selector-capture-needs-encounter-link": 3,
      "selector-capture-gap": 4,
      "selector-missing": 5,
      "selector-dirty-tree-ready": 6,
      "encounter-selector-ready": 7,
      "no-runtime-selector-needed": 8,
    };
    return (
      (verdictRank[left.verdict] ?? 9) - (verdictRank[right.verdict] ?? 9) ||
      right.hits - left.hits ||
      Number(left.rawId) - Number(right.rawId)
    );
  });

  const statusCounts = new Map();
  for (const row of rows) incrementMap(statusCounts, row.verdict);
  const valueProofStatusCounts = new Map();
  for (const row of rows) {
    for (const status of row.valueProofStatuses) incrementMap(valueProofStatusCounts, status);
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      files: files.length,
      rawSeasonalRows: rows.length,
      rawSeasonalHits: rows.reduce((sum, row) => sum + row.hits, 0),
      rawSeasonalDamage: rows.reduce((sum, row) => sum + row.totalValue, 0),
      runtimeValueSelectionRows: rows.filter((row) => row.requiresRuntimeValueSelection).length,
      encounterSelectorRows: rows.filter((row) => row.activeFactorItems.length).length,
      dirtyTreeSelectorRows: rows.filter((row) =>
        row.containerProbeCandidates.some((candidate) => candidate.selectedTransition),
      ).length,
      selectorReadyRows: rows.filter(
        (row) => row.verdict === "encounter-selector-ready" || row.verdict === "selector-dirty-tree-ready",
      ).length,
      currentVdataCandidateRows: rows.filter((row) => row.currentCandidates.length).length,
      vdataPathHintRows: rows.filter((row) => row.vdataPathHints.length).length,
      vdataPathNonOwnershipHintRows: rows.filter((row) =>
        row.vdataPathHints.some((hint) => !String(hint.context ?? "").includes("item-package")),
      ).length,
      containerProbeCandidateRows: rows.filter((row) => row.containerProbeCandidates.length).length,
      containerProbeDirtyTreeSelectedRows: rows.filter((row) =>
        row.containerProbeCandidates.some((candidate) => candidate.selectedTransition),
      ).length,
      filesWithFactorIdentityNoSelector: files.filter((file) => file.factorIdentityWithoutSelector).length,
      runtimeSelectionRowsInFactorIdentityNoSelectorFiles: rows.filter(
        (row) => row.requiresRuntimeValueSelection && fileContextByFile.get(row.file)?.factorIdentityWithoutSelector,
      ).length,
      observedSourceLinkedRows: rows.filter((row) => row.observedSourceLinks.length).length,
      unmappedRowsWithObservedSourceLink: rows.filter(
        (row) => row.observedSourceLinks.length && row.valueProofStatuses.includes("unmapped"),
      ).length,
      verdictCounts: sortedMapCounts(statusCounts, 20),
      valueProofStatusCounts: sortedMapCounts(valueProofStatusCounts, 20),
    },
    files,
    rows,
    currentVdata: {
      source: currentVdata.source,
      rows: currentVdata.rows.length,
      conclusion: currentVdata.conclusion,
    },
    vdataPathScan: {
      source: vdataPathScan.source,
      rows: vdataPathScan.rows.length,
      summary: vdataPathScan.summary,
    },
    containerProbes: {
      source: containerProbes.source,
      rows: containerProbes.rows.length,
      scannedFileCount: containerProbes.scannedFileCount,
      probeEntryCount: containerProbes.probeEntryCount,
    },
  };
}

function writeMarkdown(filePath, report, options) {
  const lines = [];
  lines.push("# Seasonal Factor Grade Bridge Audit");
  lines.push("");
  lines.push("Dev-only selector audit for seasonal factor UIDs. This report does not change live DPS, history, recount, modifier rendering, or monitor behavior.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(
    markdownTable(
      ["Metric", "Value"],
      [
        ["Files", report.summary.files],
        ["Raw seasonal rows", formatNumber(report.summary.rawSeasonalRows)],
        ["Raw seasonal hits", formatNumber(report.summary.rawSeasonalHits)],
        ["Raw seasonal damage", formatNumber(report.summary.rawSeasonalDamage)],
        ["Runtime value-selection rows", formatNumber(report.summary.runtimeValueSelectionRows)],
        ["Encounter selector rows", formatNumber(report.summary.encounterSelectorRows)],
        ["Dirty-tree selector rows", formatNumber(report.summary.dirtyTreeSelectorRows)],
        ["Selector-ready rows", formatNumber(report.summary.selectorReadyRows)],
        ["Current vdata candidate rows", formatNumber(report.summary.currentVdataCandidateRows)],
        ["Current vdata path hint rows", formatNumber(report.summary.vdataPathHintRows)],
        ["Current vdata non-ownership hint rows", formatNumber(report.summary.vdataPathNonOwnershipHintRows)],
        ["Container probe candidate rows", formatNumber(report.summary.containerProbeCandidateRows)],
        ["Container probe dirty-tree selected rows", formatNumber(report.summary.containerProbeDirtyTreeSelectedRows)],
        ["Files with factor identity but no selector", formatNumber(report.summary.filesWithFactorIdentityNoSelector)],
        [
          "Runtime selector rows in identity/no-selector files",
          formatNumber(report.summary.runtimeSelectionRowsInFactorIdentityNoSelectorFiles),
        ],
        ["Observed source-linked rows", formatNumber(report.summary.observedSourceLinkedRows)],
        ["Unmapped rows with observed source link", formatNumber(report.summary.unmappedRowsWithObservedSourceLink)],
      ],
    ),
  );
  lines.push("## Verdict Counts");
  lines.push("");
  lines.push(markdownTable(["Verdict", "Rows"], Object.entries(report.summary.verdictCounts)));
  lines.push("## Files");
  lines.push("");
  lines.push(
    markdownTable(
      [
        "File",
        "Entities",
        "Active Factor Items",
        "Active Factor Buffs",
        "Factor Buff IDs",
        "Selector Buff IDs",
        "Identity/Selector Gap",
        "Modifier Buckets",
        "Raw Seasonal IDs",
        "Needs Selector",
        "Encounter Selectors",
      ],
      report.files.map((file) => [
        file.file,
        file.entities,
        file.activeFactorItems,
        file.activeFactorBuffs,
        formatList(file.activeFactorBuffIds, 8),
        formatList(file.activeFactorItemBuffIds, 8),
        file.factorIdentityWithoutSelector ? "yes" : "no",
        formatNumber(file.modifierBuckets),
        formatList(file.rawSeasonalIds, 12),
        file.rawRowsNeedingRuntimeValueSelection,
        file.rawRowsWithEncounterSelectors,
      ]),
    ),
  );
  lines.push("## Selector Rows");
  lines.push("");
  lines.push(
    markdownTable(
      [
        "Verdict",
        "File",
        "UID",
        "Label",
        "Status",
        "Hits",
        "Damage",
        "Encounter Selector",
        "Current Snapshot Candidates",
        "Current Path Hints",
        "Container Probe Candidates",
        "Capture Gap",
        "Observed Source Link",
        "Reconciliation",
        "Raw Fields",
      ],
      report.rows.slice(0, options.maxRows).map((row) => [
        row.verdict,
        row.file,
        row.rawId,
        formatList(row.labels, 4),
        formatList(row.valueProofStatuses, 4),
        formatNumber(row.hits),
        formatNumber(row.totalValue),
        formatList(row.activeFactorItems.map(compactFactorItem), 4),
        formatList(currentCandidateSummary(row.currentCandidates), 4),
        formatList(vdataPathHintSummary(row.vdataPathHints), 4),
        formatList(containerProbeCandidateSummary(row.containerProbeCandidates), 4),
        row.fileFactorContext?.factorIdentityWithoutSelector
          ? `factor buffs ${formatList(row.fileFactorContext.activeFactorBuffIds, 4)}; no activeFactorItems`
          : "-",
        formatList(sourceLinkSummary(row.observedSourceLinks), 3),
        formatList(reconciliationSummary(row.reconciliationRows), 3),
        `buffLevel ${formatCounts(row.buffLevels)}; layer ${formatCounts(row.layers)}; count ${formatCounts(row.counts)}; sourceConfig ${formatCounts(row.sourceConfigIds)}`,
      ]),
    ),
  );
  lines.push("## Notes");
  lines.push("");
  lines.push("- `selector-missing-current-only` means a latest/current vdata probe sees an owned/current candidate for the same factor UID, but the encounter export has no local selector. Treat that as non-historical evidence only.");
  lines.push("- `selector-missing-current-conflict-check` means reconciliation suggests one ladder row while the latest/current snapshot may show another; this is exactly why runtime math must not guess from current player state.");
  lines.push("- `selector-capture-gap` means the encounter proves seasonal factor buff identity through `activeFactorBuffs`, but `activeFactorItems` has no selected grade/loadout row. That is a capture gap, not a value-table gap.");
  lines.push("- `selector-capture-gap-current-only` is the same capture gap, with an additional latest/current playerdata clue. The current clue is not historical proof.");
  lines.push("- `selector-capture-needs-encounter-link` means a dev-only container probe saw a grade item candidate, but it still needs an encounter/loadout timestamp link before it can be used as selected-value proof.");
  lines.push("- `selector-dirty-tree-ready` means a dev-only dirty-container tree path changed from 0 to a factor grade item in the same capture. Treat it as strong selected-slot evidence, still gated from live contribution math until repeated and promoted deliberately.");
  lines.push("- Current vdata path hints are non-historical. Item-package paths prove ownership only; non-item-package paths are still hints until they are tied to an encounter-local selected loadout.");
  lines.push("- Observed source links come only from encounter-local `sourceConfig` fields. They can justify future parent/child grouping, but they are not grade/value selectors.");
  lines.push("- `encounter-selector-ready` is the only selector state that can become contribution input later, after a separate formula validation step.");
  lines.push("");
  writeText(filePath, `${lines.join("\n")}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const valueProofPath = options.valueProof
    ? resolveRepoPath(options.valueProof)
    : firstExistingPath(DEFAULT_VALUE_PROOF_CANDIDATES);
  const factorDescriptionsPath = options.factorDescriptions
    ? resolveRepoPath(options.factorDescriptions)
    : firstExistingPath(DEFAULT_FACTOR_DESCRIPTION_CANDIDATES);
  if (!valueProofPath) throw new Error("Could not find ModifierValueProofRuntime.json");
  if (!factorDescriptionsPath) throw new Error("Could not find FactorDescriptions.json");

  const inputPaths = options.inputs.length
    ? options.inputs.map(resolveRepoPath)
    : latestModifierEntityFiles(options.latest);
  if (!inputPaths.length) throw new Error("No modifier-entity exports found");

  const valueProofByUid = loadValueProofIndex(valueProofPath);
  const factorDescriptionsByUid = loadFactorDescriptionsIndex(factorDescriptionsPath);
  const reconciliationByUid = loadReconciliationIndex(options.reconciliation);
  const currentVdata = loadCurrentVdataIndex(options.currentVdata);
  const vdataPathScan = loadVdataPathScanIndex(options.vdataPathScan);
  const containerProbes = loadContainerProbeIndex(options.containerProbes);
  const report = buildReport(
    inputPaths,
    valueProofByUid,
    factorDescriptionsByUid,
    reconciliationByUid,
    currentVdata,
    vdataPathScan,
    containerProbes,
  );
  report.inputs = {
    modifierExports: inputPaths.map(compactPath),
    valueProof: compactPath(valueProofPath),
    factorDescriptions: compactPath(factorDescriptionsPath),
    reconciliation: options.reconciliation ? compactPath(resolveRepoPath(options.reconciliation)) : null,
    currentVdata: options.currentVdata ? compactPath(resolveRepoPath(options.currentVdata)) : null,
    vdataPathScan: options.vdataPathScan ? compactPath(resolveRepoPath(options.vdataPathScan)) : null,
    containerProbes: options.containerProbes ? compactPath(resolveRepoPath(options.containerProbes)) : null,
  };

  writeJson(options.outJson, report);
  writeMarkdown(options.outMd, report, options);
  console.log(`Wrote ${options.outJson}`);
  console.log(`Wrote ${options.outMd}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main();
