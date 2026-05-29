#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_INPUTS = 4;
const DEFAULT_OUT_JSON = "DEV_exports/seasonal-factor-differential-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/seasonal-factor-differential-audit.md";
const SEASONAL_ID_MIN = 3_050_000;
const SEASONAL_ID_MAX = 3_060_000;
const FACTOR_CANDIDATES = [
  "../BPSR-UID-Extractors/output/SeasonPhantomFactors.json",
  "parser-data/generated/SeasonPhantomFactors.json",
];
const SKILL_CANDIDATES = [
  "../BPSR-UID-Extractors/output/SkillBreakdownDetails.json",
  "parser-data/generated/SkillBreakdownDetails.json",
];

function usage() {
  return `Usage: node scripts/audit-seasonal-factor-differential.mjs [options]

Options:
  --input <path>       Add a modifier-entity export. Repeatable.
  --latest <count>     Use latest DEV_exports/modifier-entity-*.json when no inputs are provided. Default: ${DEFAULT_LATEST_INPUTS}
  --baseline <path>    Compare files against this input. Defaults to the last input.
  --label <key=value>  Optional report label by basename or compact path. Repeatable.
  --max-rows <count>   Max Markdown rows per table. Default: 120
  --out-json <path>    JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>      Markdown report path. Default: ${DEFAULT_OUT_MD}
`;
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    baseline: null,
    labels: new Map(),
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
    } else if (arg === "--baseline") {
      options.baseline = next();
    } else if (arg === "--label") {
      const value = next();
      const at = String(value).indexOf("=");
      if (at > 0) options.labels.set(String(value).slice(0, at), String(value).slice(at + 1));
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
  const relative = path.relative(repoRoot, filePath);
  return relative && !relative.startsWith("..") ? relative.replaceAll(path.sep, "/") : filePath;
}

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    const resolved = resolveRepoPath(candidate);
    if (resolved && fs.existsSync(resolved)) return resolved;
  }
  return null;
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

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberValue(value) {
  return finiteNumber(value) ?? 0;
}

function seasonalId(value) {
  const number = finiteNumber(value);
  return number !== null && number >= SEASONAL_ID_MIN && number < SEASONAL_ID_MAX ? number : null;
}

function uniqueSortedNumbers(values) {
  return [
    ...new Set(
      values
        .filter((value) => value !== null && value !== undefined && value !== "")
        .map(Number)
        .filter(Number.isFinite)
    ),
  ].sort((left, right) => left - right);
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function formatPercent(part, total, digits = 1) {
  const denominator = Number(total) || 0;
  if (!denominator) return "0.0%";
  return `${((Number(part) / denominator) * 100).toFixed(digits)}%`;
}

function formatSignedPercent(value, digits = 1) {
  const number = Number(value) || 0;
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(digits)}%`;
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

function addMapCount(map, key, amount = 1) {
  const normalized = String(key ?? "unknown");
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function labelsFromOptions(options, filePath) {
  const compact = compactPath(filePath);
  const basename = path.basename(filePath);
  return options.labels.get(compact) ?? options.labels.get(basename) ?? basename.replace(/^modifier-entity-/, "").replace(/\.json$/i, "");
}

function loadFactorCatalog() {
  const resolved = firstExistingPath(FACTOR_CANDIDATES);
  const payload = resolved ? readJson(resolved, {}) : {};
  const byBuffId = new Map();
  const byGradeItemId = new Map();
  const byAffectedDamageId = new Map();

  for (const [buffIdText, factor] of Object.entries(payload.factorsByBuffId ?? {})) {
    const buffId = finiteNumber(buffIdText);
    if (buffId === null) continue;
    const row = {
      buffId,
      familyId: finiteNumber(factor.familyId),
      familyName: factor.familyNames?.en ?? factor.familyName ?? `factor:${buffId}`,
      affectedDamageIds: uniqueSortedNumbers(asArray(factor.affectedDamageIds)),
      affectedRecountIds: uniqueSortedNumbers(asArray(factor.affectedRecountIds)),
    };
    byBuffId.set(String(buffId), row);
    for (const damageId of row.affectedDamageIds) {
      const key = String(damageId);
      const existing = byAffectedDamageId.get(key) ?? [];
      existing.push(row);
      byAffectedDamageId.set(key, existing);
    }
    for (const gradeRow of asArray(factor.modifierEvidence?.gradeRows)) {
      const itemId = finiteNumber(gradeRow.itemId);
      if (itemId === null) continue;
      byGradeItemId.set(String(itemId), {
        ...row,
        itemId,
        grade: finiteNumber(gradeRow.grade),
        valueTexts: asArray(gradeRow.valueTexts),
      });
    }
  }

  return { path: resolved, byBuffId, byGradeItemId, byAffectedDamageId };
}

function loadSkillCatalog() {
  const resolved = firstExistingPath(SKILL_CANDIDATES);
  const payload = resolved ? readJson(resolved, {}) : {};
  const byId = new Map();
  for (const [id, row] of Object.entries(payload)) {
    byId.set(String(id), {
      id,
      name: row.DisplayName ?? row.DisplayNames?.en ?? row.DamageName ?? row.LinkedName ?? `skill:${id}`,
      detailName: row.DisplayDetailName ?? row.DisplayDetailNames?.en ?? "",
      category: row.Category ?? row.SourceKind ?? "",
    });
  }
  return { path: resolved, byId };
}

function factorLabel(catalog, id) {
  const row = catalog.byBuffId.get(String(id));
  return row ? `${row.familyName} (${id})` : String(id);
}

function skillLabel(catalog, id) {
  const row = catalog.byId.get(String(id));
  if (!row) return String(id);
  const detail = row.detailName && row.detailName !== row.name ? ` - ${row.detailName}` : "";
  return `${row.name}${detail} (${id})`;
}

function inputEntity(raw) {
  if (Array.isArray(raw?.entities)) return raw.entities[0] ?? null;
  return raw && typeof raw === "object" ? raw : null;
}

function collectActiveFactorBuffIds(entity) {
  const ids = [];
  for (const row of asArray(entity.activeFactorBuffs ?? entity.active_factor_buffs)) {
    const id = seasonalId(
      row.factorBuffId
        ?? row.factor_buff_id
        ?? row.effectSourceBuffId
        ?? row.effect_source_buff_id
        ?? row.observedBuffId
        ?? row.observed_buff_id
        ?? row.baseId
        ?? row.base_id,
    );
    if (id !== null) ids.push(id);
  }
  return uniqueSortedNumbers(ids);
}

function collectActiveFactorItems(entity, factorCatalog) {
  const rows = [];
  for (const item of asArray(entity.activeFactorItems ?? entity.active_factor_items)) {
    const factorBuffId = seasonalId(item.factorBuffId ?? item.factor_buff_id);
    const itemConfigId = finiteNumber(item.itemConfigId ?? item.item_config_id ?? item.configId ?? item.config_id);
    if (factorBuffId === null && itemConfigId === null) continue;
    const gradeMatch = itemConfigId !== null ? factorCatalog.byGradeItemId.get(String(itemConfigId)) : null;
    rows.push({
      factorBuffId: factorBuffId ?? gradeMatch?.buffId ?? null,
      itemConfigId,
      grade: finiteNumber(item.grade) ?? gradeMatch?.grade ?? null,
      valueTexts: asArray(item.valueTexts ?? item.value_texts).length ? asArray(item.valueTexts ?? item.value_texts) : asArray(gradeMatch?.valueTexts),
      label: factorLabel(factorCatalog, factorBuffId ?? gradeMatch?.buffId ?? itemConfigId),
    });
  }
  return rows;
}

function rawBucketSeasonalIds(bucket) {
  return uniqueSortedNumbers([
    seasonalId(bucket.modifierBaseId ?? bucket.modifier_base_id),
    seasonalId(bucket.modifierSourceConfigId ?? bucket.modifier_source_config_id),
  ]);
}

function collectRawSeasonalRows(entity, factorCatalog, skillCatalog) {
  const byId = new Map();
  for (const bucket of asArray(entity.modifierHitBuckets ?? entity.modifier_hit_buckets)) {
    for (const id of rawBucketSeasonalIds(bucket)) {
      const key = String(id);
      let row = byId.get(key);
      if (!row) {
        row = {
          factorBuffId: id,
          label: factorLabel(factorCatalog, id),
          hits: 0,
          totalValue: 0,
          damageIds: new Map(),
          sourceConfigIds: new Map(),
        };
        byId.set(key, row);
      }
      const hits = numberValue(bucket.hits);
      const value = numberValue(bucket.totalValue ?? bucket.total_value ?? bucket.effectiveTotalValue);
      row.hits += hits;
      row.totalValue += value;
      addMapCount(row.damageIds, bucket.damageId ?? bucket.damage_id ?? bucket.skillKey ?? bucket.skill_key, hits || 1);
      addMapCount(row.sourceConfigIds, bucket.modifierSourceConfigId ?? bucket.modifier_source_config_id ?? "null", hits || 1);
    }
  }
  return [...byId.values()]
    .map((row) => ({
      ...row,
      damageIds: [...row.damageIds.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([id, hits]) => ({ id, label: skillLabel(skillCatalog, id), hits })),
      sourceConfigIds: Object.fromEntries([...row.sourceConfigIds.entries()].sort((left, right) => right[1] - left[1])),
    }))
    .sort((left, right) => right.totalValue - left.totalValue || right.hits - left.hits);
}

function collectDamageSkills(entity, skillCatalog) {
  return Object.entries(entity.dmgSkills ?? entity.dmg_skills ?? {})
    .map(([id, row]) => ({
      id,
      label: skillLabel(skillCatalog, id),
      totalValue: numberValue(row.totalValue ?? row.total_value ?? row.effectiveTotalValue),
      hits: numberValue(row.hits),
      critHits: numberValue(row.critHits ?? row.crit_hits),
      luckyHits: numberValue(row.luckyHits ?? row.lucky_hits),
    }))
    .sort((left, right) => right.totalValue - left.totalValue || right.hits - left.hits);
}

function summarizeFile(filePath, options, factorCatalog, skillCatalog) {
  const raw = readJson(filePath, null);
  const entity = raw ? inputEntity(raw) : null;
  if (!entity) throw new Error(`No entity payload in ${filePath}`);
  const compact = compactPath(filePath);
  const activeFactorBuffIds = collectActiveFactorBuffIds(entity);
  const activeFactorItems = collectActiveFactorItems(entity, factorCatalog);
  const rawSeasonalRows = collectRawSeasonalRows(entity, factorCatalog, skillCatalog);
  const damageSkills = collectDamageSkills(entity, skillCatalog);
  const damage = entity.damage ?? {};
  return {
    file: compact,
    label: labelsFromOptions(options, filePath),
    uid: entity.uid ?? null,
    name: entity.name ?? null,
    classId: entity.classId ?? entity.class_id ?? null,
    classSpec: entity.classSpec ?? entity.class_spec ?? null,
    seasonStrength: entity.seasonStrength ?? entity.season_strength ?? null,
    damageTotal: numberValue(damage.total),
    damageHits: numberValue(damage.hits),
    critHits: numberValue(damage.critHits ?? damage.crit_hits),
    luckyHits: numberValue(damage.luckyHits ?? damage.lucky_hits),
    activeFactorBuffIds,
    activeFactorLabels: activeFactorBuffIds.map((id) => factorLabel(factorCatalog, id)),
    activeFactorItems,
    rawSeasonalRows,
    damageSkills,
  };
}

function pickBaseline(files, options) {
  if (options.baseline) {
    const baseline = resolveRepoPath(options.baseline);
    const compact = baseline ? compactPath(baseline) : options.baseline;
    return files.find((file) => file.file === compact || path.basename(file.file) === path.basename(options.baseline)) ?? files.at(-1);
  }
  return files.at(-1);
}

function buildFactorMatrix(files, factorCatalog) {
  const ids = new Set();
  for (const file of files) {
    for (const id of file.activeFactorBuffIds) ids.add(String(id));
    for (const row of file.rawSeasonalRows) ids.add(String(row.factorBuffId));
  }

  return [...ids]
    .sort((left, right) => Number(left) - Number(right))
    .map((id) => {
      const perFile = files.map((file) => {
        const raw = file.rawSeasonalRows.find((row) => String(row.factorBuffId) === id) ?? null;
        return {
          file: file.file,
          label: file.label,
          active: file.activeFactorBuffIds.map(String).includes(id),
          selected: file.activeFactorItems.some((item) => String(item.factorBuffId) === id),
          rawHits: raw?.hits ?? 0,
          rawValue: raw?.totalValue ?? 0,
        };
      });
      return {
        factorBuffId: Number(id),
        label: factorLabel(factorCatalog, id),
        activeFiles: perFile.filter((row) => row.active).map((row) => row.label),
        selectedFiles: perFile.filter((row) => row.selected).map((row) => row.label),
        rawFiles: perFile.filter((row) => row.rawHits || row.rawValue).map((row) => row.label),
        totalRawHits: perFile.reduce((sum, row) => sum + row.rawHits, 0),
        totalRawValue: perFile.reduce((sum, row) => sum + row.rawValue, 0),
        changedActiveState: new Set(perFile.map((row) => String(row.active))).size > 1,
        changedRawState: new Set(perFile.map((row) => String(Boolean(row.rawHits || row.rawValue)))).size > 1,
        perFile,
      };
    })
    .sort((left, right) => {
      const changeDelta = Number(right.changedActiveState || right.changedRawState) - Number(left.changedActiveState || left.changedRawState);
      if (changeDelta !== 0) return changeDelta;
      return right.totalRawValue - left.totalRawValue || right.totalRawHits - left.totalRawHits;
    });
}

function buildDamageDelta(files, baseline) {
  const baselineBySkill = new Map(baseline.damageSkills.map((row) => [String(row.id), row]));
  const rows = [];
  for (const file of files) {
    if (file.file === baseline.file) continue;
    const ids = new Set([...file.damageSkills.map((row) => String(row.id)), ...baselineBySkill.keys()]);
    for (const id of ids) {
      const current = file.damageSkills.find((row) => String(row.id) === id) ?? { id, label: baselineBySkill.get(id)?.label ?? id, totalValue: 0, hits: 0 };
      const base = baselineBySkill.get(id) ?? { id, label: current.label, totalValue: 0, hits: 0 };
      const currentShare = file.damageTotal ? current.totalValue / file.damageTotal : 0;
      const baselineShare = baseline.damageTotal ? base.totalValue / baseline.damageTotal : 0;
      rows.push({
        file: file.file,
        label: file.label,
        skillId: id,
        skillLabel: current.label ?? base.label ?? id,
        currentValue: current.totalValue,
        baselineValue: base.totalValue,
        valueDelta: current.totalValue - base.totalValue,
        currentShare,
        baselineShare,
        shareDelta: currentShare - baselineShare,
        currentHits: current.hits,
        baselineHits: base.hits,
        hitDelta: current.hits - base.hits,
      });
    }
  }
  return rows.sort((left, right) => Math.abs(right.shareDelta) - Math.abs(left.shareDelta) || Math.abs(right.valueDelta) - Math.abs(left.valueDelta));
}

function buildFactorDelta(files, baseline) {
  const baselineActive = new Set(baseline.activeFactorBuffIds.map(String));
  const baselineRaw = new Map(baseline.rawSeasonalRows.map((row) => [String(row.factorBuffId), row]));
  const rows = [];
  for (const file of files) {
    if (file.file === baseline.file) continue;
    const active = new Set(file.activeFactorBuffIds.map(String));
    const raw = new Map(file.rawSeasonalRows.map((row) => [String(row.factorBuffId), row]));
    const ids = new Set([...active, ...baselineActive, ...raw.keys(), ...baselineRaw.keys()]);
    for (const id of ids) {
      const currentRaw = raw.get(id) ?? { hits: 0, totalValue: 0, label: id };
      const baseRaw = baselineRaw.get(id) ?? { hits: 0, totalValue: 0, label: currentRaw.label ?? id };
      const currentActive = active.has(id);
      const baseActive = baselineActive.has(id);
      if (currentActive === baseActive && currentRaw.hits === baseRaw.hits && currentRaw.totalValue === baseRaw.totalValue) continue;
      rows.push({
        file: file.file,
        label: file.label,
        factorBuffId: Number(id),
        factorLabel: currentRaw.label ?? baseRaw.label ?? id,
        activeDelta: currentActive === baseActive ? "same" : currentActive ? "added" : "removed",
        currentRawHits: currentRaw.hits,
        baselineRawHits: baseRaw.hits,
        rawHitDelta: currentRaw.hits - baseRaw.hits,
        currentRawValue: currentRaw.totalValue,
        baselineRawValue: baseRaw.totalValue,
        rawValueDelta: currentRaw.totalValue - baseRaw.totalValue,
      });
    }
  }
  return rows.sort((left, right) => {
    const activeRank = { added: 0, removed: 1, same: 2 };
    return (activeRank[left.activeDelta] ?? 3) - (activeRank[right.activeDelta] ?? 3) || Math.abs(right.rawValueDelta) - Math.abs(left.rawValueDelta);
  });
}

function buildPairwiseFactorChanges(files, factorCatalog) {
  const rows = [];
  for (let leftIndex = 0; leftIndex < files.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < files.length; rightIndex += 1) {
      const left = files[leftIndex];
      const right = files[rightIndex];
      const leftActive = new Set(left.activeFactorBuffIds.map(String));
      const rightActive = new Set(right.activeFactorBuffIds.map(String));
      const leftRaw = new Set(left.rawSeasonalRows.map((row) => String(row.factorBuffId)));
      const rightRaw = new Set(right.rawSeasonalRows.map((row) => String(row.factorBuffId)));
      const activeAdded = [...rightActive].filter((id) => !leftActive.has(id)).map((id) => factorLabel(factorCatalog, id));
      const activeRemoved = [...leftActive].filter((id) => !rightActive.has(id)).map((id) => factorLabel(factorCatalog, id));
      const rawAdded = [...rightRaw].filter((id) => !leftRaw.has(id)).map((id) => factorLabel(factorCatalog, id));
      const rawRemoved = [...leftRaw].filter((id) => !rightRaw.has(id)).map((id) => factorLabel(factorCatalog, id));
      rows.push({
        fromFile: left.file,
        fromLabel: left.label,
        toFile: right.file,
        toLabel: right.label,
        activeAdded,
        activeRemoved,
        rawAdded,
        rawRemoved,
        damageDelta: right.damageTotal - left.damageTotal,
        hitDelta: right.damageHits - left.damageHits,
        selectedItemDelta: right.activeFactorItems.length - left.activeFactorItems.length,
        activeChangeCount: activeAdded.length + activeRemoved.length,
        rawChangeCount: rawAdded.length + rawRemoved.length,
      });
    }
  }
  return rows.sort((left, right) => {
    const activeDelta = right.activeChangeCount - left.activeChangeCount;
    if (activeDelta !== 0) return activeDelta;
    const rawDelta = right.rawChangeCount - left.rawChangeCount;
    if (rawDelta !== 0) return rawDelta;
    return Math.abs(right.damageDelta) - Math.abs(left.damageDelta);
  });
}

function buildReport(options) {
  const factorCatalog = loadFactorCatalog();
  const skillCatalog = loadSkillCatalog();
  const inputPaths = options.inputs.length
    ? options.inputs.map(resolveRepoPath)
    : latestModifierEntityFiles(options.latest);
  if (!inputPaths.length) throw new Error("No modifier-entity inputs found.");

  const files = inputPaths.map((filePath) => summarizeFile(filePath, options, factorCatalog, skillCatalog));
  const baseline = pickBaseline(files, options);
  const factorMatrix = buildFactorMatrix(files, factorCatalog);
  const damageDeltas = baseline ? buildDamageDelta(files, baseline) : [];
  const factorDeltas = baseline ? buildFactorDelta(files, baseline) : [];
  const pairwiseFactorChanges = buildPairwiseFactorChanges(files, factorCatalog);

  return {
    source: "audit-seasonal-factor-differential",
    generatedAt: new Date().toISOString(),
    generatedSources: {
      SeasonPhantomFactors: factorCatalog.path ? compactPath(factorCatalog.path) : null,
      SkillBreakdownDetails: skillCatalog.path ? compactPath(skillCatalog.path) : null,
    },
    notes: [
      "Dev-only differential audit for controlled seasonal factor captures.",
      "This compares observed final packet damage surfaces and seasonal factor IDs; it does not infer net contribution or change live runtime behavior.",
      "Active factor identity is not selected grade/loadout proof. Exact ladder values remain blocked unless a trusted selector row is present.",
    ],
    baseline: baseline ? { file: baseline.file, label: baseline.label } : null,
    summary: {
      files: files.length,
      totalDamage: files.reduce((sum, file) => sum + file.damageTotal, 0),
      totalHits: files.reduce((sum, file) => sum + file.damageHits, 0),
      uniqueActiveFactors: uniqueSortedNumbers(files.flatMap((file) => file.activeFactorBuffIds)).length,
      uniqueRawSeasonalFactors: uniqueSortedNumbers(files.flatMap((file) => file.rawSeasonalRows.map((row) => row.factorBuffId))).length,
      factorsWithChangedActiveState: factorMatrix.filter((row) => row.changedActiveState).length,
      factorsWithChangedRawState: factorMatrix.filter((row) => row.changedRawState).length,
      filesWithSelectedFactorItems: files.filter((file) => file.activeFactorItems.length).length,
    },
    files,
    factorMatrix,
    pairwiseFactorChanges,
    factorDeltas,
    damageDeltas,
  };
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Seasonal Factor Differential Audit", "");
  lines.push("> Dev-only comparison report. Packet final damage is still the truth; this report only lines up factor identity and damage-surface changes.", "");
  lines.push("## Summary", "");
  lines.push(
    markdownTable(
      ["Metric", "Value"],
      [
        ["Files", formatNumber(report.summary.files)],
        ["Baseline", report.baseline ? `${report.baseline.label} (${report.baseline.file})` : "-"],
        ["Total damage across files", formatNumber(report.summary.totalDamage)],
        ["Total hits across files", formatNumber(report.summary.totalHits)],
        ["Unique active factor IDs", formatNumber(report.summary.uniqueActiveFactors)],
        ["Unique raw seasonal IDs", formatNumber(report.summary.uniqueRawSeasonalFactors)],
        ["Changed active factor IDs", formatNumber(report.summary.factorsWithChangedActiveState)],
        ["Changed raw seasonal IDs", formatNumber(report.summary.factorsWithChangedRawState)],
        ["Files with selected factor item rows", formatNumber(report.summary.filesWithSelectedFactorItems)],
      ],
    ),
  );

  lines.push("## Files", "");
  lines.push(
    markdownTable(
      ["Label", "File", "Damage", "Hits", "Crit", "Lucky", "Active Factors", "Selected Items", "Raw Seasonal Rows"],
      report.files.map((file) => [
        file.label,
        file.file,
        formatNumber(file.damageTotal),
        formatNumber(file.damageHits),
        formatPercent(file.critHits, file.damageHits),
        formatPercent(file.luckyHits, file.damageHits),
        formatList(file.activeFactorLabels, 8),
        file.activeFactorItems.length,
        file.rawSeasonalRows.length,
      ]),
    ),
  );

  lines.push("## Pairwise Factor Set Changes", "");
  lines.push(
    markdownTable(
      ["From", "To", "Active Added", "Active Removed", "Raw Added", "Raw Removed", "Damage Delta", "Hit Delta", "Selected Item Delta"],
      report.pairwiseFactorChanges.slice(0, maxRows).map((row) => [
        row.fromLabel,
        row.toLabel,
        formatList(row.activeAdded, 8),
        formatList(row.activeRemoved, 8),
        formatList(row.rawAdded, 8),
        formatList(row.rawRemoved, 8),
        formatNumber(row.damageDelta),
        formatNumber(row.hitDelta),
        formatNumber(row.selectedItemDelta),
      ]),
    ),
  );

  lines.push("## Changed Factor Identity / Raw Rows", "");
  lines.push(
    markdownTable(
      ["Factor", "Active Files", "Raw Files", "Selected Files", "Raw Hits", "Raw Damage"],
      report.factorMatrix
        .filter((row) => row.changedActiveState || row.changedRawState)
        .slice(0, maxRows)
        .map((row) => [
          row.label,
          formatList(row.activeFiles, 8),
          formatList(row.rawFiles, 8),
          formatList(row.selectedFiles, 8),
          formatNumber(row.totalRawHits),
          formatNumber(row.totalRawValue),
        ]),
    ),
  );

  lines.push("## Factor Delta vs Baseline", "");
  lines.push(
    markdownTable(
      ["File", "Factor", "Active Delta", "Raw Hits", "Baseline Hits", "Hit Delta", "Raw Damage", "Baseline Damage", "Damage Delta"],
      report.factorDeltas.slice(0, maxRows).map((row) => [
        row.label,
        row.factorLabel,
        row.activeDelta,
        formatNumber(row.currentRawHits),
        formatNumber(row.baselineRawHits),
        formatNumber(row.rawHitDelta),
        formatNumber(row.currentRawValue),
        formatNumber(row.baselineRawValue),
        formatNumber(row.rawValueDelta),
      ]),
    ),
  );

  lines.push("## Damage Surface Delta vs Baseline", "");
  lines.push(
    markdownTable(
      ["File", "Damage Source", "Damage", "Baseline", "Delta", "Share", "Baseline Share", "Share Delta", "Hits", "Baseline Hits"],
      report.damageDeltas.slice(0, maxRows).map((row) => [
        row.label,
        row.skillLabel,
        formatNumber(row.currentValue),
        formatNumber(row.baselineValue),
        formatNumber(row.valueDelta),
        formatSignedPercent(row.currentShare),
        formatSignedPercent(row.baselineShare),
        formatSignedPercent(row.shareDelta),
        formatNumber(row.currentHits),
        formatNumber(row.baselineHits),
      ]),
    ),
  );

  lines.push("## Notes", "");
  lines.push("- Damage deltas are parse-shape evidence only; short controlled parses can identify candidate surfaces, not exact contribution math.");
  lines.push("- Factor rows with active identity but no selected item row still require a runtime selector capture before tiered ladder values can be consumed.");
  lines.push("- This script is dev-only and does not touch DPS recount, modifier rendering, monitor behavior, or packet final totals.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  writeJson(options.outJson, report);
  writeText(options.outMd, renderMarkdown(report, options.maxRows));
  console.log(`Wrote ${path.relative(repoRoot, resolveRepoPath(options.outJson))}`);
  console.log(`Wrote ${path.relative(repoRoot, resolveRepoPath(options.outMd))}`);
  console.log(`Files: ${report.summary.files}; changed active factors: ${report.summary.factorsWithChangedActiveState}; selected item files: ${report.summary.filesWithSelectedFactorItems}`);
}

main();
