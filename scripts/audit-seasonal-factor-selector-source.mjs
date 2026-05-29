#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const SEASONAL_ID_MIN = 3_050_000;
const SEASONAL_ID_MAX = 3_060_000;
const DEFAULT_LATEST_INPUTS = 4;
const DEFAULT_MAX_EVENT_FILES = 40;
const DEFAULT_MAX_EVENT_BYTES = 160 * 1024 * 1024;
const DEFAULT_OUT_JSON = "DEV_exports/seasonal-factor-selector-source-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/seasonal-factor-selector-source-audit.md";
const FACTOR_CANDIDATES = [
  "../BPSR-UID-Extractors/output/SeasonPhantomFactors.json",
  "parser-data/generated/SeasonPhantomFactors.json",
];
const SEASONAL_TALENT_CANDIDATES = [
  "../BPSR-UID-Extractors/output/SeasonalTalentDescriptions.json",
  "parser-data/generated/SeasonalTalentDescriptions.json",
];

function usage() {
  return `Usage: node scripts/audit-seasonal-factor-selector-source.mjs [options]

Options:
  --input <path>            Add a modifier-entity export. Repeatable.
  --latest <count>          Use latest DEV_exports/modifier-entity-*.json when no inputs are provided. Default: ${DEFAULT_LATEST_INPUTS}
  --event-root <path>       Event logger root/file to scan. Repeatable. Defaults to AppData EventLogs.
  --max-event-files <n>     Maximum event logger files to scan. Default: ${DEFAULT_MAX_EVENT_FILES}
  --max-event-bytes <n>     Skip event files larger than this. Default: ${DEFAULT_MAX_EVENT_BYTES}
  --factors <path>          SeasonPhantomFactors.json path.
  --seasonal-talents <path> SeasonalTalentDescriptions.json path.
  --current-vdata <path>    Current probe_factor_vdata report. Default: DEV_exports/factor-vdata-current.json
  --vdata-path-scan <path>  Current probe:vdata:path-scan report. Default: DEV_exports/vdata-path-scan-current.json
  --out-json <path>         JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>           Markdown report path. Default: ${DEFAULT_OUT_MD}
`;
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    eventRoots: [],
    maxEventFiles: DEFAULT_MAX_EVENT_FILES,
    maxEventBytes: DEFAULT_MAX_EVENT_BYTES,
    factors: null,
    seasonalTalents: null,
    currentVdata: "DEV_exports/factor-vdata-current.json",
    vdataPathScan: "DEV_exports/vdata-path-scan-current.json",
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
    } else if (arg === "--event-root") {
      options.eventRoots.push(next());
    } else if (arg === "--max-event-files") {
      options.maxEventFiles = Math.max(0, Number(next()) || DEFAULT_MAX_EVENT_FILES);
    } else if (arg === "--max-event-bytes") {
      options.maxEventBytes = Math.max(0, Number(next()) || DEFAULT_MAX_EVENT_BYTES);
    } else if (arg === "--factors") {
      options.factors = next();
    } else if (arg === "--seasonal-talents") {
      options.seasonalTalents = next();
    } else if (arg === "--current-vdata") {
      options.currentVdata = next();
    } else if (arg === "--vdata-path-scan") {
      options.vdataPathScan = next();
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
    .map((entry) => entry.filePath);
}

function eventRoots() {
  const roots = [];
  if (process.env.APPDATA) {
    roots.push(path.join(process.env.APPDATA, "com.resonance-logs-global", "EventLogs"));
  }
  if (process.env.LOCALAPPDATA) {
    roots.push(path.join(process.env.LOCALAPPDATA, "com.resonance-logs-global", "EventLogs"));
  }
  return roots;
}

function collectJsonFiles(inputPath, out) {
  if (!inputPath || !fs.existsSync(inputPath)) return;
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    if (inputPath.toLowerCase().endsWith(".json")) out.push(inputPath);
    return;
  }
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
    const child = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(child, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      out.push(child);
    }
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asCollection(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([mapKey, row]) => ({
    ...(row && typeof row === "object" ? row : {}),
    map_key: row?.map_key ?? row?.mapKey ?? mapKey,
  }));
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

function sortedValues(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))]
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

function formatList(values, limit = 8) {
  const list = asArray(values).filter((value) => value !== null && value !== undefined && value !== "");
  if (!list.length) return "-";
  const head = list.slice(0, limit).map(String);
  return list.length > limit ? `${head.join(", ")}, +${list.length - limit}` : head.join(", ");
}

function formatValueRows(rows, limit = 4) {
  return formatList(
    asArray(rows).map((row) => {
      if (!row || typeof row !== "object") return null;
      if (row.rawText) return row.rawText;
      const value = finiteNumber(row.value);
      if (value === null) return null;
      return row.unit === "percent" ? `${value}%` : `${value}${row.unit ? ` ${row.unit}` : ""}`;
    }),
    limit,
  );
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

function loadFactorCatalog(filePath) {
  const resolved = filePath ? resolveRepoPath(filePath) : firstExistingPath(FACTOR_CANDIDATES);
  const payload = resolved && fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, "utf8")) : {};
  const byBuffId = new Map();
  const byGradeItemId = new Map();
  const byFamilyId = new Map();
  const byAffectedDamageId = new Map();
  const byAffectedRecountId = new Map();
  const pushMap = (map, key, value) => {
    const id = finiteNumber(key);
    if (id === null) return;
    const rows = map.get(id) ?? [];
    rows.push(value);
    map.set(id, rows);
  };
  for (const [buffIdText, factor] of Object.entries(payload.factorsByBuffId ?? {})) {
    const buffId = Number(buffIdText);
    if (!Number.isFinite(buffId)) continue;
    const familyName = factor.familyNames?.en ?? factor.familyName ?? `factor:${buffId}`;
    const info = {
      buffId,
      familyId: factor.familyId ?? null,
      familyName,
      affectedDamageIds: asArray(factor.affectedDamageIds).filter((id) => Number.isFinite(Number(id))).map(Number),
      affectedRecountIds: asArray(factor.affectedRecountIds).filter((id) => Number.isFinite(Number(id))).map(Number),
    };
    byBuffId.set(buffId, info);
    pushMap(byFamilyId, info.familyId, info);
    for (const id of info.affectedDamageIds) pushMap(byAffectedDamageId, id, info);
    for (const id of info.affectedRecountIds) pushMap(byAffectedRecountId, id, info);
    for (const row of asArray(factor.modifierEvidence?.gradeRows)) {
      const itemId = finiteNumber(row.itemId);
      if (itemId === null) continue;
      byGradeItemId.set(itemId, {
        buffId,
        familyId: factor.familyId ?? null,
        familyName,
        grade: finiteNumber(row.grade),
        itemId,
        valueTexts: asArray(row.valueTexts),
      });
    }
  }
  return { path: resolved, byBuffId, byGradeItemId, byFamilyId, byAffectedDamageId, byAffectedRecountId };
}

function loadSeasonalTalentCatalog(filePath) {
  const resolved = filePath ? resolveRepoPath(filePath) : firstExistingPath(SEASONAL_TALENT_CANDIDATES);
  const payload = resolved && fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, "utf8")) : {};
  const byUid = new Map();
  const byBuffId = new Map();
  const entries = payload.entriesByUid && typeof payload.entriesByUid === "object"
    ? Object.entries(payload.entriesByUid)
    : asArray(payload.entries).map((entry) => [entry?.uid, entry]);
  const pushBuffId = (buffId, entry) => {
    const id = finiteNumber(buffId);
    if (id === null) return;
    const rows = byBuffId.get(id) ?? [];
    rows.push(entry);
    byBuffId.set(id, rows);
  };
  for (const [uidText, entry] of entries) {
    const uid = finiteNumber(entry?.uid ?? uidText);
    if (uid === null) continue;
    const normalized = {
      uid,
      name: entry?.names?.en ?? entry?.name ?? `seasonal-talent:${uid}`,
      cleanDescription: entry?.cleanDescriptions?.en ?? entry?.cleanDescription ?? "",
      valueRows: asArray(entry?.valueRows),
      buffIds: asArray(entry?.relationships?.buffIds)
        .map(finiteNumber)
        .filter((id) => id !== null),
    };
    byUid.set(uid, normalized);
    for (const buffId of normalized.buffIds) pushBuffId(buffId, normalized);
  }
  return { path: resolved, byUid, byBuffId };
}

function factorLabel(catalog, factorId) {
  const factor = catalog.byBuffId.get(Number(factorId));
  return factor ? `${factor.familyName} (${factorId})` : String(factorId);
}

function catalogMatchLabels(rows, prefix) {
  return asArray(rows).map((row) => `${prefix}:${row.familyName} (${row.buffId})`);
}

function directCatalogMatches(catalog, values) {
  const matches = [];
  for (const value of sortedValues(values)) {
    const factor = catalog.byBuffId.get(value);
    if (factor) matches.push(`factor-buff:${factor.familyName} (${value})`);
    const grade = catalog.byGradeItemId.get(value);
    if (grade) matches.push(`grade-item:${grade.familyName} G${grade.grade ?? "?"} (${value})`);
    matches.push(...catalogMatchLabels(catalog.byFamilyId.get(value), "factor-family"));
    matches.push(...catalogMatchLabels(catalog.byAffectedDamageId.get(value), "affected-damage"));
    matches.push(...catalogMatchLabels(catalog.byAffectedRecountId.get(value), "affected-recount"));
  }
  return [...new Set(matches)].sort();
}

function seasonalTalentNodeCandidates(values) {
  const candidates = [];
  const seen = new Set();
  const push = (uid, matchKind, sourceId) => {
    const id = finiteNumber(uid);
    if (id === null || id <= 0 || seen.has(id)) return;
    seen.add(id);
    candidates.push({ uid: id, matchKind, sourceId });
  };
  for (const value of sortedValues(values)) {
    push(value, "exact-node-id", value);
    if (value >= 100_000) {
      push(value - 100_000, "node-minus-100000", value);
      push(value % 100_000, "node-tail-100000", value);
    }
  }
  return candidates;
}

function seasonalTalentMatchForNode(catalog, values) {
  if (!catalog?.byUid?.size) return null;
  for (const candidate of seasonalTalentNodeCandidates(values)) {
    const entry = catalog.byUid.get(candidate.uid);
    if (!entry) continue;
    return {
      uid: entry.uid,
      name: entry.name,
      cleanDescription: entry.cleanDescription,
      buffIds: entry.buffIds,
      matchKind: candidate.matchKind,
      sourceId: candidate.sourceId,
      valuePreview: formatValueRows(entry.valueRows),
    };
  }
  return null;
}

function collectFactorBuffIdsFromEntity(entity) {
  const ids = [];
  for (const row of asArray(entity?.activeFactorBuffs ?? entity?.active_factor_buffs)) {
    const id = seasonalId(row.factorBuffId ?? row.factor_buff_id ?? row.effectSourceBuffId ?? row.effect_source_buff_id ?? row.observedBuffId ?? row.observed_buff_id);
    if (id !== null) ids.push(id);
  }
  return sortedValues(ids);
}

function collectFactorItemsFromEntity(entity, catalog) {
  const rows = [];
  for (const item of asArray(entity?.activeFactorItems ?? entity?.active_factor_items)) {
    const factorBuffId = seasonalId(item.factorBuffId ?? item.factor_buff_id);
    if (factorBuffId === null) continue;
    const itemConfigId = finiteNumber(item.itemConfigId ?? item.item_config_id ?? item.config_id ?? item.configId);
    const grade = finiteNumber(item.grade);
    const label = factorLabel(catalog, factorBuffId);
    rows.push({
      factorBuffId,
      label,
      itemConfigId,
      grade,
      runtimeSource: item.runtimeSource ?? item.runtime_source ?? "",
    });
  }
  return rows.sort((left, right) => left.factorBuffId - right.factorBuffId || (left.grade ?? 0) - (right.grade ?? 0));
}

function collectFactorItemsFromContainerProbe(raw, catalog) {
  const rows = [];
  for (const item of asArray(raw?.equippedFactorItems)) {
    const factorBuffId = seasonalId(item.factorBuffId ?? item.factor_buff_id);
    if (factorBuffId === null) continue;
    rows.push({
      factorBuffId,
      label: factorLabel(catalog, factorBuffId),
      itemConfigId: finiteNumber(item.itemConfigId ?? item.item_config_id ?? item.configId ?? item.config_id),
      grade: finiteNumber(item.grade),
      runtimeSource: item.runtimeSource ?? item.runtime_source ?? "container-probe-equipped-factor-item",
    });
  }
  return rows.sort((left, right) => left.factorBuffId - right.factorBuffId || (left.grade ?? 0) - (right.grade ?? 0));
}

function collectGradeItemCandidateIdsFromContainerProbe(raw) {
  const ids = [];
  const candidateGroups = [
    ...asArray(raw?.factorCandidates),
    ...asArray(raw?.rawProtoCandidates),
    ...asArray(raw?.jsonCandidates),
  ];
  for (const candidate of candidateGroups) {
    const evidenceType = candidate.evidenceType ?? candidate.kind ?? "";
    if (evidenceType !== "seasonal-factor-grade-item" && evidenceType !== "seasonal-factor-grade-item-id") continue;
    const id = finiteNumber(candidate.value);
    if (id !== null) ids.push(id);
  }
  return sortedValues(ids);
}

function addContainerProbeCandidateToGroups(groups, catalog, candidate) {
  const value = finiteNumber(candidate?.value);
  if (value === null) return;
  const kind = candidate?.evidenceType ?? candidate?.kind ?? "";
  const refs = [];

  if (kind === "seasonal-factor-grade-item" || kind === "seasonal-factor-grade-item-id") {
    const grade = catalog.byGradeItemId.get(value);
    if (grade) refs.push({ info: grade, role: "grade", itemId: value });
  } else if (kind === "seasonal-factor-buff-id") {
    const info = catalog.byBuffId.get(value);
    if (info) refs.push({ info, role: "buff" });
  } else if (kind === "seasonal-factor-family-id") {
    for (const info of asArray(catalog.byFamilyId.get(value))) refs.push({ info, role: "family" });
  } else if (kind === "seasonal-factor-affected-damage-id") {
    for (const info of asArray(catalog.byAffectedDamageId.get(value))) refs.push({ info, role: "affected-damage" });
    for (const info of asArray(catalog.byAffectedRecountId.get(value))) refs.push({ info, role: "affected-damage" });
  }

  for (const ref of refs) {
    const buffId = finiteNumber(ref.info.buffId ?? ref.info.factorBuffId);
    if (buffId === null) continue;
    const group = groups.get(buffId) ?? {
      factorBuffId: buffId,
      label: factorLabel(catalog, buffId),
      identityCount: 0,
      affectedDamageCount: 0,
      gradeCount: 0,
      gradeItemIds: new Set(),
      sources: new Set(),
    };
    if (ref.role === "grade") {
      group.gradeCount += 1;
      if (ref.itemId !== null && ref.itemId !== undefined) group.gradeItemIds.add(ref.itemId);
    } else if (ref.role === "affected-damage") {
      group.affectedDamageCount += 1;
    } else {
      group.identityCount += 1;
    }
    group.sources.add(candidate?.source ?? candidate?.location ?? "container-probe");
    groups.set(buffId, group);
  }
}

function summarizeContainerProbeCandidateGroups(raw, catalog) {
  const groups = new Map();
  for (const item of collectFactorItemsFromContainerProbe(raw, catalog)) {
    const group = groups.get(item.factorBuffId) ?? {
      factorBuffId: item.factorBuffId,
      label: item.label,
      identityCount: 0,
      affectedDamageCount: 0,
      gradeCount: 0,
      equippedSelectedCount: 0,
      gradeItemIds: new Set(),
      sources: new Set(),
    };
    group.gradeCount += 1;
    group.equippedSelectedCount = (group.equippedSelectedCount ?? 0) + 1;
    if (item.itemConfigId !== null && item.itemConfigId !== undefined) group.gradeItemIds.add(item.itemConfigId);
    group.sources.add(item.runtimeSource ?? "container-probe-equipped-factor-item");
    groups.set(item.factorBuffId, group);
  }

  const candidateGroups = [
    ...asArray(raw?.factorCandidates).map((candidate) => ({ ...candidate, source: "offset-scan" })),
    ...asArray(raw?.rawProtoCandidates).map((candidate) => ({ ...candidate, source: "raw-proto" })),
    ...asArray(raw?.jsonCandidates).map((candidate) => ({ ...candidate, source: "typed-json" })),
  ];
  for (const candidate of candidateGroups) addContainerProbeCandidateToGroups(groups, catalog, candidate);

  const rows = [...groups.values()].map((group) => {
    const hasEquipped = (group.equippedSelectedCount ?? 0) > 0;
    const hasStrongIdentity = group.identityCount > 0;
    const hasAffectedIdentity = group.affectedDamageCount > 0;
    const hasGrade = group.gradeCount > 0;
    const proofClass = hasEquipped
      ? "typed-equipped-factor-item"
      : hasStrongIdentity && hasGrade
        ? "same-payload-identity-grade-candidate"
        : hasAffectedIdentity && hasGrade
          ? "same-payload-affected-grade-candidate"
          : hasGrade
            ? "grade-only-capture-clue"
            : hasStrongIdentity
              ? "identity-only-capture-clue"
              : "affected-only-capture-clue";
    return {
      ...group,
      proofClass,
      gradeItemIds: sortedValues([...group.gradeItemIds]),
      sources: [...group.sources].sort((left, right) => left.localeCompare(right)),
    };
  });

  return rows.sort((left, right) => left.factorBuffId - right.factorBuffId || left.proofClass.localeCompare(right.proofClass));
}

function splitFactorItemsByActiveFactorIds(items, activeFactorIds) {
  const active = new Set(asArray(activeFactorIds).map((id) => String(id)));
  const matched = [];
  const mismatched = [];
  for (const item of asArray(items)) {
    if (active.has(String(item.factorBuffId))) {
      matched.push(item);
    } else {
      mismatched.push(item);
    }
  }
  return { matched, mismatched };
}

function collectRawSeasonalIds(value, out = new Set(), depth = 0) {
  if (depth > 8 || value === null || value === undefined) return out;
  if (typeof value === "number" || typeof value === "string") {
    const id = seasonalId(value);
    if (id !== null) out.add(id);
    return out;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectRawSeasonalIds(child, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value)) collectRawSeasonalIds(child, out, depth + 1);
  }
  return out;
}

const MODIFIER_ID_FIELDS = [
  "id",
  "uid",
  "buffId",
  "buff_id",
  "baseId",
  "base_id",
  "configId",
  "config_id",
  "observedBuffId",
  "observed_buff_id",
  "effectSourceBuffId",
  "effect_source_buff_id",
  "modifierBaseId",
  "modifier_base_id",
  "modifierSourceConfigId",
  "modifier_source_config_id",
];

function addSeasonalTalentBuffEvidence(evidence, seasonalTalentCatalog, value, surface) {
  const buffId = finiteNumber(value);
  if (buffId === null) return;
  const talents = seasonalTalentCatalog?.byBuffId?.get(buffId);
  if (!talents?.length) return;
  for (const talent of talents) {
    const key = `${talent.uid}:${buffId}`;
    const row = evidence.get(key) ?? {
      uid: talent.uid,
      name: talent.name,
      buffId,
      count: 0,
      surfaces: new Set(),
      values: formatValueRows(talent.valueRows),
    };
    row.count += 1;
    row.surfaces.add(surface);
    evidence.set(key, row);
  }
}

function scanModifierIdRow(evidence, seasonalTalentCatalog, row, surface) {
  if (!row || typeof row !== "object") return;
  for (const field of MODIFIER_ID_FIELDS) {
    addSeasonalTalentBuffEvidence(evidence, seasonalTalentCatalog, row[field], `${surface}.${field}`);
  }
}

function collectSeasonalTalentBuffEvidence(entity, seasonalTalentCatalog) {
  const evidence = new Map();
  for (const row of asArray(entity?.activeBuffs ?? entity?.active_buffs)) {
    scanModifierIdRow(evidence, seasonalTalentCatalog, row, "activeBuffs");
  }
  for (const row of asArray(entity?.activeEffectBuffs ?? entity?.active_effect_buffs)) {
    scanModifierIdRow(evidence, seasonalTalentCatalog, row, "activeEffectBuffs");
  }
  for (const row of asArray(entity?.modifierWindows ?? entity?.modifier_windows)) {
    scanModifierIdRow(evidence, seasonalTalentCatalog, row, "modifierWindows");
  }
  for (const row of asArray(entity?.modifierHitBuckets ?? entity?.modifier_hit_buckets)) {
    scanModifierIdRow(evidence, seasonalTalentCatalog, row, "modifierHitBuckets");
  }
  for (const hit of asArray(entity?.replayHits ?? entity?.replay_hits)) {
    for (const modifier of asArray(hit?.activeModifiers ?? hit?.active_modifiers)) {
      scanModifierIdRow(evidence, seasonalTalentCatalog, modifier, "replayHits.activeModifiers");
    }
  }
  return [...evidence.values()]
    .map((row) => ({
      ...row,
      surfaces: [...row.surfaces].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.uid - right.uid || left.buffId - right.buffId);
}

function currentSelectedSeasonalTalentBuffIds(currentVdata) {
  const ids = [];
  for (const row of asArray(currentVdata?.seasonMedal?.chosenNodes)) {
    for (const buffId of asArray(row.seasonalTalentMatch?.buffIds)) {
      const id = finiteNumber(buffId);
      if (id !== null) ids.push(id);
    }
  }
  return new Set(sortedValues(ids));
}

function attachCurrentSelectedSeasonalTalentEvidence(modifierFiles, currentVdata) {
  const selectedBuffIds = currentSelectedSeasonalTalentBuffIds(currentVdata);
  return modifierFiles.map((row) => {
    const currentSelectedSeasonalTalentBuffEvidence = asArray(row.seasonalTalentBuffEvidence)
      .filter((evidence) => selectedBuffIds.has(Number(evidence.buffId)));
    return {
      ...row,
      currentSelectedSeasonalTalentBuffEvidenceCount: currentSelectedSeasonalTalentBuffEvidence.length,
      currentSelectedSeasonalTalentBuffEvidence,
    };
  });
}

function summarizeModifierFile(filePath, catalog, seasonalTalentCatalog) {
  const payload = readJson(filePath, {});
  const factorBuffIds = collectFactorBuffIdsFromEntity(payload);
  const activeFactorItems = collectFactorItemsFromEntity(payload, catalog);
  const { matched: matchedActiveFactorItems, mismatched: mismatchedActiveFactorItems } =
    splitFactorItemsByActiveFactorIds(activeFactorItems, factorBuffIds);
  const rawSeasonalIds = sortedValues([...collectRawSeasonalIds(payload)]);
  const seasonalTalentBuffEvidence = collectSeasonalTalentBuffEvidence(payload, seasonalTalentCatalog);
  const hasFactorIdentity = factorBuffIds.length > 0;
  const hasSelector = matchedActiveFactorItems.length > 0;
  return {
    file: compactPath(resolveRepoPath(filePath)),
    factorBuffIds,
    factorLabels: factorBuffIds.map((id) => factorLabel(catalog, id)),
    activeFactorItemCount: activeFactorItems.length,
    activeFactorItems,
    matchedActiveFactorItemCount: matchedActiveFactorItems.length,
    matchedActiveFactorItems,
    mismatchedActiveFactorItemCount: mismatchedActiveFactorItems.length,
    mismatchedActiveFactorItems,
    rawSeasonalIds,
    seasonalTalentBuffEvidenceCount: seasonalTalentBuffEvidence.length,
    seasonalTalentBuffEvidence,
    hasFactorIdentity,
    hasSelector,
    status: hasSelector
      ? "selector-captured"
      : hasFactorIdentity && mismatchedActiveFactorItems.length > 0
        ? "selector-present-mismatched"
        : hasFactorIdentity
          ? "identity-without-selector"
          : activeFactorItems.length > 0
            ? "selector-without-factor-identity"
            : "no-factor-identity",
  };
}

function parseRawEntry(raw) {
  if (!raw || typeof raw !== "string") return null;
  if (!raw.includes("activeFactorBuffs") && !raw.includes("active_factor_buffs")) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseRawEntryLoose(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rawContainsAnyId(raw, ids) {
  if (!raw || !ids?.size) return false;
  for (const id of ids) {
    if (raw.includes(String(id))) return true;
  }
  return false;
}

function selectedSeasonalTalentEvidence(evidence, selectedBuffIds) {
  return asArray(evidence).filter((row) => selectedBuffIds.has(Number(row.buffId)));
}

function summarizeEventFile(filePath, catalog, seasonalTalentCatalog, currentSelectedBuffIds, maxBytes) {
  const stat = fs.statSync(filePath);
  if (maxBytes > 0 && stat.size > maxBytes) {
    return {
      file: filePath,
      status: "skipped-too-large",
      bytes: stat.size,
      snapshots: 0,
      snapshotsWithFactorIdentity: 0,
      snapshotsWithSelector: 0,
      snapshotsWithIdentityNoSelector: 0,
      factorBuffIds: [],
      selectorFactorBuffIds: [],
      mismatchedSelectorFactorBuffIds: [],
      containerProbeEntries: 0,
      containerProbeEntriesWithSelectors: 0,
      containerProbeEntriesWithSamePayloadSelectorClues: 0,
      containerProbeEntriesWithGradeOnlyClues: 0,
      containerProbeSelectorFactorBuffIds: [],
      containerProbeSelectorFactorLabels: [],
      containerProbeGradeItemCandidateIds: [],
      snapshotsWithMismatchedSelector: 0,
      snapshotsWithCurrentSelectedSeasonalTalentBuffEvidence: 0,
      currentSelectedSeasonalTalentBuffEvidence: [],
    };
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      file: filePath,
      status: `parse-failed: ${error.message}`,
      bytes: stat.size,
      snapshots: 0,
      snapshotsWithFactorIdentity: 0,
      snapshotsWithSelector: 0,
      snapshotsWithIdentityNoSelector: 0,
      factorBuffIds: [],
      selectorFactorBuffIds: [],
      mismatchedSelectorFactorBuffIds: [],
      containerProbeEntries: 0,
      containerProbeEntriesWithSelectors: 0,
      containerProbeEntriesWithSamePayloadSelectorClues: 0,
      containerProbeEntriesWithGradeOnlyClues: 0,
      containerProbeSelectorFactorBuffIds: [],
      containerProbeSelectorFactorLabels: [],
      containerProbeGradeItemCandidateIds: [],
      snapshotsWithMismatchedSelector: 0,
      snapshotsWithCurrentSelectedSeasonalTalentBuffEvidence: 0,
      currentSelectedSeasonalTalentBuffEvidence: [],
    };
  }

  let snapshots = 0;
  let snapshotsWithFactorIdentity = 0;
  let snapshotsWithSelector = 0;
  let snapshotsWithIdentityNoSelector = 0;
  let snapshotsWithMismatchedSelector = 0;
  let containerProbeEntries = 0;
  let containerProbeEntriesWithSelectors = 0;
  let containerProbeEntriesWithSamePayloadSelectorClues = 0;
  let containerProbeEntriesWithGradeOnlyClues = 0;
  const factorBuffIds = [];
  const selectorFactorBuffIds = [];
  const mismatchedSelectorFactorBuffIds = [];
  const containerProbeSelectorFactorBuffIds = [];
  const containerProbeSamePayloadSelectorFactorBuffIds = [];
  const containerProbeGradeOnlyFactorBuffIds = [];
  const containerProbeGradeItemCandidateIds = [];
  let snapshotsWithCurrentSelectedSeasonalTalentBuffEvidence = 0;
  const currentSelectedSeasonalTalentEvidence = new Map();

  for (const entry of asArray(payload.entries)) {
    if (entry.category === "container_probe") {
      const raw = parseRawEntryLoose(entry.raw);
      if (raw) {
        containerProbeEntries += 1;
        const probeGroups = summarizeContainerProbeCandidateGroups(raw, catalog);
        const selectedGroups = probeGroups.filter((group) => group.proofClass === "typed-equipped-factor-item");
        const samePayloadGroups = probeGroups.filter(
          (group) =>
            group.proofClass === "same-payload-identity-grade-candidate" ||
            group.proofClass === "same-payload-affected-grade-candidate",
        );
        const gradeOnlyGroups = probeGroups.filter((group) => group.proofClass === "grade-only-capture-clue");
        const gradeIds = collectGradeItemCandidateIdsFromContainerProbe(raw);
        containerProbeSelectorFactorBuffIds.push(...selectedGroups.map((group) => group.factorBuffId));
        containerProbeSamePayloadSelectorFactorBuffIds.push(...samePayloadGroups.map((group) => group.factorBuffId));
        containerProbeGradeOnlyFactorBuffIds.push(...gradeOnlyGroups.map((group) => group.factorBuffId));
        containerProbeGradeItemCandidateIds.push(...gradeIds);
        if (selectedGroups.length) containerProbeEntriesWithSelectors += 1;
        if (samePayloadGroups.length) containerProbeEntriesWithSamePayloadSelectorClues += 1;
        if (gradeOnlyGroups.length) containerProbeEntriesWithGradeOnlyClues += 1;
      }
    }
    const shouldScanCurrentSeasonalTalents = rawContainsAnyId(entry.raw, currentSelectedBuffIds);
    const raw = parseRawEntry(entry.raw);
    const looseRaw = raw ?? (shouldScanCurrentSeasonalTalents ? parseRawEntryLoose(entry.raw) : null);
    if (looseRaw && shouldScanCurrentSeasonalTalents) {
      const evidence = selectedSeasonalTalentEvidence(
        collectSeasonalTalentBuffEvidence(looseRaw, seasonalTalentCatalog),
        currentSelectedBuffIds,
      );
      if (evidence.length) {
        snapshotsWithCurrentSelectedSeasonalTalentBuffEvidence += 1;
        for (const row of evidence) {
          const key = `${row.uid}:${row.buffId}`;
          const existing = currentSelectedSeasonalTalentEvidence.get(key) ?? {
            ...row,
            count: 0,
            surfaces: new Set(),
          };
          existing.count += row.count;
          for (const surface of row.surfaces) existing.surfaces.add(surface);
          currentSelectedSeasonalTalentEvidence.set(key, existing);
        }
      }
    }
    if (!raw) continue;
    const ids = collectFactorBuffIdsFromEntity(raw);
    const items = collectFactorItemsFromEntity(raw, catalog);
    const { matched, mismatched } = splitFactorItemsByActiveFactorIds(items, ids);
    if (!ids.length && !items.length) continue;
    snapshots += 1;
    factorBuffIds.push(...ids);
    selectorFactorBuffIds.push(...matched.map((item) => item.factorBuffId));
    mismatchedSelectorFactorBuffIds.push(...mismatched.map((item) => item.factorBuffId));
    if (ids.length) snapshotsWithFactorIdentity += 1;
    if (matched.length) snapshotsWithSelector += 1;
    if (mismatched.length) snapshotsWithMismatchedSelector += 1;
    if (ids.length && !matched.length) snapshotsWithIdentityNoSelector += 1;
  }

  return {
    file: filePath,
    status: "scanned",
    bytes: stat.size,
    snapshots,
    snapshotsWithFactorIdentity,
    snapshotsWithSelector,
    snapshotsWithIdentityNoSelector,
    factorBuffIds: sortedValues(factorBuffIds),
    factorLabels: sortedValues(factorBuffIds).map((id) => factorLabel(catalog, id)),
    selectorFactorBuffIds: sortedValues(selectorFactorBuffIds),
    mismatchedSelectorFactorBuffIds: sortedValues(mismatchedSelectorFactorBuffIds),
    containerProbeEntries,
    containerProbeEntriesWithSelectors,
    containerProbeEntriesWithSamePayloadSelectorClues,
    containerProbeEntriesWithGradeOnlyClues,
    containerProbeSelectorFactorBuffIds: sortedValues(containerProbeSelectorFactorBuffIds),
    containerProbeSelectorFactorLabels: sortedValues(containerProbeSelectorFactorBuffIds).map((id) => factorLabel(catalog, id)),
    containerProbeSamePayloadSelectorFactorBuffIds: sortedValues(containerProbeSamePayloadSelectorFactorBuffIds),
    containerProbeSamePayloadSelectorFactorLabels: sortedValues(containerProbeSamePayloadSelectorFactorBuffIds).map((id) => factorLabel(catalog, id)),
    containerProbeGradeOnlyFactorBuffIds: sortedValues(containerProbeGradeOnlyFactorBuffIds),
    containerProbeGradeOnlyFactorLabels: sortedValues(containerProbeGradeOnlyFactorBuffIds).map((id) => factorLabel(catalog, id)),
    containerProbeGradeItemCandidateIds: sortedValues(containerProbeGradeItemCandidateIds),
    snapshotsWithMismatchedSelector,
    snapshotsWithCurrentSelectedSeasonalTalentBuffEvidence,
    currentSelectedSeasonalTalentBuffEvidence: [...currentSelectedSeasonalTalentEvidence.values()]
      .map((row) => ({
        ...row,
        surfaces: [...row.surfaces].sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => left.uid - right.uid || left.buffId - right.buffId),
  };
}

function summarizeEventLogs(options, catalog, seasonalTalentCatalog, currentSelectedBuffIds) {
  const roots = options.eventRoots.length ? options.eventRoots.map(resolveRepoPath) : eventRoots();
  const files = [];
  for (const root of roots) collectJsonFiles(root, files);
  files.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  const selected = files.slice(0, options.maxEventFiles);
  return selected.map((filePath) => summarizeEventFile(filePath, catalog, seasonalTalentCatalog, currentSelectedBuffIds, options.maxEventBytes));
}

function summarizeCurrentVdata(filePath, catalog, seasonalTalentCatalog) {
  const payload = readJson(filePath, null);
  if (!payload) return null;
  const factorRows = asArray(payload.factor_item_matches ?? payload.factorItemMatches ?? payload.owned_factor_items);
  const equippedRows = asArray(payload.equipped_factor_item_matches ?? payload.equippedFactorItemMatches);
  const ownedRelevant = factorRows
    .map((row) => {
      const factorBuffId = seasonalId(row.factor_buff_id ?? row.factorBuffId);
      if (factorBuffId === null) return null;
      const gradeRow = row.grade_row ?? row.gradeRow ?? {};
      return {
        factorBuffId,
        label: factorLabel(catalog, factorBuffId),
        itemConfigId: finiteNumber(row.config_id ?? row.item_config_id ?? row.itemConfigId ?? gradeRow.itemId ?? gradeRow.item_id),
        grade: finiteNumber(row.grade ?? gradeRow.grade),
        valueTexts: asArray(row.value_texts ?? row.valueTexts ?? gradeRow.value_texts ?? gradeRow.valueTexts),
      };
    })
    .filter(Boolean);
  const seasonMedal = summarizeSeasonMedalSurface(payload, catalog, seasonalTalentCatalog);
  return {
    file: compactPath(resolveRepoPath(filePath)),
    ownedCandidateCount: ownedRelevant.length,
    equippedCandidateCount: equippedRows.length,
    ownedCandidates: ownedRelevant,
    equippedCandidates: equippedRows,
    seasonMedal,
  };
}

function summarizeSeasonMedalSurface(payload, catalog, seasonalTalentCatalog) {
  const medal = payload?.season_medal ?? payload?.seasonMedal ?? payload?.season_medal_info ?? payload?.seasonMedalInfo;
  if (!medal || typeof medal !== "object") return null;
  const coreNodes = asCollection(medal.core_hole_node_infos ?? medal.coreHoleNodeInfos);
  const normalNodes = asCollection(medal.normal_hole_node_infos ?? medal.normalHoleNodeInfos);
  const allNodes = [
    ...coreNodes.map((node) => ({ ...node, source: "core_hole_node_infos" })),
    ...normalNodes.map((node) => ({ ...node, source: "normal_hole_node_infos" })),
  ];
  const nodeRows = allNodes
    .map((node) => {
      const nodeId = finiteNumber(node.node_id ?? node.nodeId ?? node.id);
      const mapKey = finiteNumber(node.map_key ?? node.mapKey);
      const nodeLevel = finiteNumber(node.node_level ?? node.nodeLevel ?? node.level);
      const choose = node.choose ?? node.chosen ?? node.is_choose ?? node.isChoose ?? null;
      const chosen = choose === true || choose === 1 || choose === "1" || choose === "true";
      const slot = finiteNumber(node.slot);
      const seasonalTalentMatch = seasonalTalentMatchForNode(seasonalTalentCatalog, [nodeId, mapKey]);
      return {
        source: node.source,
        mapKey,
        nodeId,
        nodeLevel,
        chosen,
        slot,
        directCatalogMatches: directCatalogMatches(catalog, [nodeId, mapKey]),
        seasonalTalentMatch,
      };
    })
    .filter((row) => row.nodeId !== null || row.mapKey !== null)
    .sort((left, right) => Number(left.slot ?? 9999) - Number(right.slot ?? 9999) || Number(left.nodeId ?? 0) - Number(right.nodeId ?? 0));
  const chosenNodes = nodeRows.filter((row) => row.chosen);
  return {
    seasonId: finiteNumber(medal.season_id ?? medal.seasonId),
    nodeCount: nodeRows.length,
    chosenNodeCount: chosenNodes.length,
    directCatalogMatchCount: chosenNodes.filter((row) => row.directCatalogMatches.length > 0).length,
    seasonalTalentMatchCount: chosenNodes.filter((row) => row.seasonalTalentMatch).length,
    chosenNodes,
    allNodes: nodeRows,
  };
}

function summarizeVdataPathScan(filePath) {
  const payload = readJson(filePath, null);
  if (!payload) return null;
  const contextCounts = payload.summary?.match_count_by_context ?? {};
  const rawContextCounts = payload.summary?.raw_proto_match_count_by_context ?? {};
  const nonOwnershipContexts = Object.fromEntries(
    Object.entries(contextCounts).filter(([key]) => !String(key).includes("item-package")),
  );
  const nonOwnershipRawContexts = Object.fromEntries(
    Object.entries(rawContextCounts).filter(([key]) => !String(key).includes("item-package")),
  );
  return {
    file: compactPath(resolveRepoPath(filePath)),
    ownedFactorItemCount: payload.summary?.owned_factor_item_count ?? payload.owned_factor_items?.length ?? 0,
    matchCount: payload.summary?.match_count ?? 0,
    rawProtoMatchCount: payload.summary?.raw_proto_match_count ?? 0,
    contextCounts,
    rawContextCounts,
    nonOwnershipContexts,
    nonOwnershipRawContexts,
  };
}

function buildSummary(modifierFiles, eventFiles, currentVdata, vdataPathScan) {
  const scannedEventFiles = eventFiles.filter((row) => row.status === "scanned");
  return {
    modifierFiles: modifierFiles.length,
    modifierFilesWithFactorIdentity: modifierFiles.filter((row) => row.hasFactorIdentity).length,
    modifierFilesWithSelector: modifierFiles.filter((row) => row.hasSelector).length,
    modifierFilesWithIdentityNoSelector: modifierFiles.filter((row) => row.hasFactorIdentity && !row.hasSelector).length,
    modifierFilesWithMismatchedSelectors: modifierFiles.filter((row) => row.mismatchedActiveFactorItemCount > 0).length,
    modifierFilesWithSeasonalTalentBuffEvidence: modifierFiles.filter((row) => row.seasonalTalentBuffEvidenceCount > 0).length,
    modifierSeasonalTalentBuffEvidenceRows: modifierFiles.reduce((sum, row) => sum + row.seasonalTalentBuffEvidenceCount, 0),
    modifierFilesWithCurrentSelectedSeasonalTalentBuffEvidence: modifierFiles.filter((row) => row.currentSelectedSeasonalTalentBuffEvidenceCount > 0).length,
    modifierCurrentSelectedSeasonalTalentBuffEvidenceRows: modifierFiles.reduce((sum, row) => sum + row.currentSelectedSeasonalTalentBuffEvidenceCount, 0),
    eventFiles: eventFiles.length,
    eventFilesScanned: scannedEventFiles.length,
    eventFilesSkippedTooLarge: eventFiles.filter((row) => row.status === "skipped-too-large").length,
    eventSnapshots: eventFiles.reduce((sum, row) => sum + row.snapshots, 0),
    eventSnapshotsWithFactorIdentity: eventFiles.reduce((sum, row) => sum + row.snapshotsWithFactorIdentity, 0),
    eventSnapshotsWithSelector: eventFiles.reduce((sum, row) => sum + row.snapshotsWithSelector, 0),
    eventSnapshotsWithIdentityNoSelector: eventFiles.reduce((sum, row) => sum + row.snapshotsWithIdentityNoSelector, 0),
    eventSnapshotsWithMismatchedSelector: eventFiles.reduce((sum, row) => sum + row.snapshotsWithMismatchedSelector, 0),
    eventSnapshotsWithCurrentSelectedSeasonalTalentBuffEvidence: eventFiles.reduce((sum, row) => sum + row.snapshotsWithCurrentSelectedSeasonalTalentBuffEvidence, 0),
    eventContainerProbeEntries: eventFiles.reduce((sum, row) => sum + row.containerProbeEntries, 0),
    eventContainerProbeEntriesWithSelectors: eventFiles.reduce((sum, row) => sum + row.containerProbeEntriesWithSelectors, 0),
    eventContainerProbeEntriesWithSamePayloadSelectorClues: eventFiles.reduce(
      (sum, row) => sum + row.containerProbeEntriesWithSamePayloadSelectorClues,
      0,
    ),
    eventContainerProbeEntriesWithGradeOnlyClues: eventFiles.reduce(
      (sum, row) => sum + row.containerProbeEntriesWithGradeOnlyClues,
      0,
    ),
    currentOwnedCandidates: currentVdata?.ownedCandidateCount ?? 0,
    currentEquippedCandidates: currentVdata?.equippedCandidateCount ?? 0,
    currentSeasonMedalChosenNodes: currentVdata?.seasonMedal?.chosenNodeCount ?? 0,
    currentSeasonMedalDirectCatalogMatches: currentVdata?.seasonMedal?.directCatalogMatchCount ?? 0,
    currentSeasonMedalSeasonalTalentMatches: currentVdata?.seasonMedal?.seasonalTalentMatchCount ?? 0,
    currentVdataNonOwnershipContextCount: Object.values(vdataPathScan?.nonOwnershipContexts ?? {}).reduce((sum, count) => sum + count, 0),
    currentVdataRawNonOwnershipContextCount: Object.values(vdataPathScan?.nonOwnershipRawContexts ?? {}).reduce((sum, count) => sum + count, 0),
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Seasonal Factor Selector Source Audit", "");
  lines.push("- dev-only audit: no parser/live DPS/recount/monitor behavior is changed");
  lines.push(`- generated at: ${new Date().toISOString()}`);
  lines.push(`- factor catalog: ${compactPath(report.factorCatalogPath)}`);
  lines.push(`- seasonal talent catalog: ${compactPath(report.seasonalTalentCatalogPath)}`);
  lines.push("");
  lines.push("## Summary", "");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push(
    "Interpretation: `activeFactorBuffs` proves that a seasonal factor identity was active on the encounter/player snapshot. `activeFactorItems` is the selected grade/loadout selector needed to choose exact ladder values. Item-package ownership or unlock rows are not selected-loadout proof.",
    "",
  );

  lines.push("## Modifier Exports", "");
  lines.push(
    markdownTable(
      ["File", "Status", "Factor identities", "Matched selectors", "Mismatched selectors", "Selected node buff evidence", "Raw seasonal ids"],
      report.modifierFiles.map((row) => [
        row.file,
        row.status,
        formatList(row.factorLabels, 6),
        row.matchedActiveFactorItemCount
          ? formatList(row.matchedActiveFactorItems.map((item) => `${item.label} G${item.grade ?? "?"}`), 4)
          : "-",
        row.mismatchedActiveFactorItemCount
          ? formatList(row.mismatchedActiveFactorItems.map((item) => `${item.label} G${item.grade ?? "?"}`), 4)
          : "-",
        row.currentSelectedSeasonalTalentBuffEvidenceCount
          ? formatList(
            row.currentSelectedSeasonalTalentBuffEvidence.map((item) =>
              `${item.name} (${item.buffId}) x${item.count} via ${formatList(item.surfaces, 2)}`,
            ),
            4,
          )
          : "-",
        formatList(row.rawSeasonalIds, 10),
      ]),
    ),
  );

  lines.push("## Event Logger Snapshots", "");
  lines.push(
    markdownTable(
      [
        "File",
        "Status",
        "Bytes",
        "Snapshots",
        "Identity",
        "Matched selectors",
        "Mismatched selectors",
        "Identity no selector",
        "Selected node buff snapshots",
        "Container probes",
        "Probe selectors",
        "Probe same-payload clues",
        "Probe grade-only clues",
        "Factor identities",
      ],
      report.eventFiles.slice(0, 30).map((row) => [
        compactPath(row.file),
        row.status,
        row.bytes,
        row.snapshots,
        row.snapshotsWithFactorIdentity,
        row.snapshotsWithSelector,
        row.snapshotsWithMismatchedSelector,
        row.snapshotsWithIdentityNoSelector,
        row.snapshotsWithCurrentSelectedSeasonalTalentBuffEvidence
          ? formatList(
            row.currentSelectedSeasonalTalentBuffEvidence.map((item) => `${item.name} (${item.buffId}) x${item.count}`),
            3,
          )
          : "-",
        row.containerProbeEntries,
        row.containerProbeEntriesWithSelectors
          ? formatList(row.containerProbeSelectorFactorLabels, 4)
          : "-",
        row.containerProbeEntriesWithSamePayloadSelectorClues
          ? formatList(row.containerProbeSamePayloadSelectorFactorLabels, 4)
          : "-",
        row.containerProbeEntriesWithGradeOnlyClues
          ? formatList(row.containerProbeGradeOnlyFactorLabels, 4) ||
            formatList(row.containerProbeGradeItemCandidateIds, 4)
          : "-",
        formatList(row.factorLabels, 5),
      ]),
    ),
  );

  lines.push("## Current VData Surface", "");
  if (report.currentVdata) {
    lines.push(
      markdownTable(
        ["Source", "Owned candidates", "Equipped candidates", "Owned factor candidates"],
        [[
          report.currentVdata.file,
          report.currentVdata.ownedCandidateCount,
          report.currentVdata.equippedCandidateCount,
          formatList(
            report.currentVdata.ownedCandidates.map((row) => `${row.label} G${row.grade ?? "?"} ${formatList(row.valueTexts, 2)}`),
            8,
          ),
        ]],
      ),
    );
    if (report.currentVdata.seasonMedal) {
      lines.push(
        "### Current Season Medal Nodes",
        "",
        "These rows are current-state season/slumberdream node evidence only. Seasonal talent matches identify selected nodes; they are not selected seasonal factor grade/loadout proof unless a direct generated factor catalog match appears.",
        "",
      );
      lines.push(
        markdownTable(
          ["Season", "Node", "Talent", "Level", "Slot", "Values", "Related buffs", "Direct generated factor matches"],
          report.currentVdata.seasonMedal.chosenNodes.map((row) => [
            report.currentVdata.seasonMedal.seasonId ?? "-",
            row.nodeId ?? row.mapKey ?? "-",
            row.seasonalTalentMatch
              ? `${row.seasonalTalentMatch.name} (${row.seasonalTalentMatch.uid}, ${row.seasonalTalentMatch.matchKind})`
              : "-",
            row.nodeLevel ?? "-",
            row.slot ?? "-",
            row.seasonalTalentMatch?.valuePreview ?? "-",
            formatList(row.seasonalTalentMatch?.buffIds, 5),
            formatList(row.directCatalogMatches, 4),
          ]),
        ),
      );
    }
  } else {
    lines.push("- no current-vdata report found", "");
  }

  lines.push("## Current VData Path Scan", "");
  if (report.vdataPathScan) {
    lines.push(
      markdownTable(
        ["Source", "Matches", "Raw matches", "Non-ownership contexts", "Raw non-ownership contexts"],
        [[
          report.vdataPathScan.file,
          report.vdataPathScan.matchCount,
          report.vdataPathScan.rawProtoMatchCount,
          JSON.stringify(report.vdataPathScan.nonOwnershipContexts),
          JSON.stringify(report.vdataPathScan.nonOwnershipRawContexts),
        ]],
      ),
    );
  } else {
    lines.push("- no vdata path scan report found", "");
  }

  lines.push(
    "## Next Evidence Boundary",
    "",
    "- If event snapshots and modifier exports keep showing identity without selectors, exact seasonal factor ladder values must stay blocked.",
    "- `Container probes` only appear when `RESONANCE_ENABLE_CONTAINER_PROBES` is enabled; they are the current dev-only path for proving selected factor grade/loadout from packet data.",
    "- The next non-dev implementation would be a dedicated historical selected-loadout capture from the correct packet/field, not inference from current owned items.",
    "",
  );
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadFactorCatalog(options.factors);
  const seasonalTalentCatalog = loadSeasonalTalentCatalog(options.seasonalTalents);
  const inputFiles = options.inputs.length
    ? options.inputs.map(resolveRepoPath)
    : latestModifierEntityFiles(options.latest);
  let modifierFiles = inputFiles.map((filePath) => summarizeModifierFile(filePath, catalog, seasonalTalentCatalog));
  const currentVdata = summarizeCurrentVdata(options.currentVdata, catalog, seasonalTalentCatalog);
  modifierFiles = attachCurrentSelectedSeasonalTalentEvidence(modifierFiles, currentVdata);
  const currentSelectedBuffIds = currentSelectedSeasonalTalentBuffIds(currentVdata);
  const eventFiles = summarizeEventLogs(options, catalog, seasonalTalentCatalog, currentSelectedBuffIds);
  const vdataPathScan = summarizeVdataPathScan(options.vdataPathScan);
  const report = {
    source: "audit-seasonal-factor-selector-source",
    host: os.hostname(),
    generatedAt: new Date().toISOString(),
    factorCatalogPath: catalog.path,
    seasonalTalentCatalogPath: seasonalTalentCatalog.path,
    options: {
      inputs: inputFiles.map(compactPath),
      maxEventFiles: options.maxEventFiles,
      maxEventBytes: options.maxEventBytes,
      seasonalTalents: options.seasonalTalents,
      currentVdata: options.currentVdata,
      vdataPathScan: options.vdataPathScan,
    },
    modifierFiles,
    eventFiles,
    currentVdata,
    vdataPathScan,
    summary: null,
  };
  report.summary = buildSummary(modifierFiles, eventFiles, currentVdata, vdataPathScan);
  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report));
  console.log(`wrote ${options.outJson} and ${options.outMd}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
