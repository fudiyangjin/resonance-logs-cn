#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXPORT_DIR = path.resolve("DEV_exports");
const DEFAULT_VALUE_PROOF_DEV = path.resolve("DEV_generated", "modifier", "ModifierValueProofRuntime.json");
const DEFAULT_VALUE_PROOF = fs.existsSync(DEFAULT_VALUE_PROOF_DEV)
  ? DEFAULT_VALUE_PROOF_DEV
  : path.resolve("..", "BPSR-UID-Extractors", "output", "ModifierValueProofRuntime.json");
const DEFAULT_CONTRIBUTION_TABLE = path.resolve("..", "BPSR-UID-Extractors", "output", "ModifierContributionTable.json");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "modifier-hit-count-proof-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "modifier-hit-count-proof-audit.md");

function usage() {
  console.log(`Usage: node scripts/audit-modifier-hit-count-proof.mjs [options]

Options:
  --input <path>             Modifier entity export JSON. Can be repeated.
  --latest <n>               Use newest n DEV_exports/modifier-entity-*.json files when --input is omitted.
  --proof <path>             ModifierValueProofRuntime.json path.
  --contribution <path>      ModifierContributionTable.json path.
  --out-json <path>          JSON output path.
  --out-md <path>            Markdown output path.
  --max-rows <n>             Maximum rows in markdown tables.
  --help                     Show this help.
`);
}

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const maxRows = positiveNumber(argValue("--max-rows", "100")) ?? 100;
const proofPath = path.resolve(argValue("--proof", DEFAULT_VALUE_PROOF));
const contributionPath = path.resolve(argValue("--contribution", DEFAULT_CONTRIBUTION_TABLE));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const inputs = resolveInputs();

const proof = readJson(proofPath, null);
if (!proof) throw new Error(`Could not read value proof table: ${proofPath}`);

const contribution = readJson(contributionPath, null);
const sourceRules = loadSourceRules(contribution);
const hitCountEntries = loadHitCountEntries(proof, sourceRules);
const report = buildReport({ inputs, hitCountEntries, proofPath, contributionPath });

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, renderMarkdown(report, maxRows));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Hit-count selector audit: files=${report.summary.files}, hitCountEntries=${report.summary.hitCountEntries}, produced=${report.summary.producedObserved}, sourceActive=${report.summary.sourceActiveOnly}`,
);

function argValues(flag) {
  const values = [];
  for (let index = 2; index < process.argv.length - 1; index += 1) {
    if (process.argv[index] === flag) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function argValue(flag, fallback = null) {
  return argValues(flag).at(-1) ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function resolveInputs() {
  const explicit = argValues("--input").map((item) => path.resolve(item));
  if (explicit.length) return explicit.filter((filePath) => fs.existsSync(filePath));

  const latest = positiveNumber(argValue("--latest", "20")) ?? 20;
  if (!fs.existsSync(DEFAULT_EXPORT_DIR)) return [];
  return fs
    .readdirSync(DEFAULT_EXPORT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^modifier-entity-.*\.json$/i.test(entry.name))
    .map((entry) => path.join(DEFAULT_EXPORT_DIR, entry.name))
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.filePath.localeCompare(b.filePath))
    .slice(0, latest)
    .map((entry) => path.resolve(entry.filePath));
}

function loadSourceRules(contribution) {
  const rulesById = new Map();
  const rulesByEntityId = new Map();
  for (const rule of Object.values(contribution?.sourcesByRuleId ?? {})) {
    const id = String(rule.sourceRuleId || "");
    if (!id) continue;
    rulesById.set(id, rule);
    const entityId = positiveNumber(rule.sourceEntityId);
    if (entityId !== null) {
      const list = rulesByEntityId.get(entityId) ?? [];
      list.push(rule);
      rulesByEntityId.set(entityId, list);
    }
  }
  return { rulesById, rulesByEntityId };
}

function loadHitCountEntries(proof, sourceRules) {
  const rowsByUid = new Map();
  const rows = [];

  for (const [key, entry] of Object.entries(proof.entriesByKey ?? {})) {
    const selectors = asArray(entry.valueSelectors).filter((selector) => selector?.kind === "hit-count-model");
    if (!selectors.length) continue;
    const uid = positiveNumber(entry.uid);
    if (uid === null) continue;

    const ruleIds = uniqueStrings([...asArray(entry.sourceRuleIds), ...asArray(entry.directSourceRuleIds)]);
    const rules = new Map();
    for (const ruleId of ruleIds) {
      const rule = sourceRules.rulesById.get(ruleId);
      if (rule) rules.set(rule.sourceRuleId, rule);
    }
    for (const rule of sourceRules.rulesByEntityId.get(uid) ?? []) {
      if (isReasonableEntityRule(entry, rule)) rules.set(rule.sourceRuleId, rule);
    }

    const row = {
      key,
      uid,
      category: entry.category ?? null,
      runtimeKind: entry.runtimeKind ?? null,
      label: entry.sourceLabel ?? key,
      valueProofStatus: entry.valueProofStatus ?? null,
      formulaZoneIds: asArray(entry.formulaZoneIds),
      selectedValues: asArray(entry.selectedValues)
        .filter((value) => value?.componentKey === "hit-count-model")
        .map(formatSelectedValue),
      allSelectedValues: asArray(entry.selectedValues).map(formatSelectedValue),
      valueBlockers: asArray(entry.valueBlockers),
      proofRequirements: asArray(entry.proofRequirements),
      sourceRules: [...rules.values()].map(compactSourceRule),
      observed: createObserved(),
    };

    rows.push(row);
    const list = rowsByUid.get(uid) ?? [];
    list.push(row);
    rowsByUid.set(uid, list);
  }

  const rowsByTargetDamageId = new Map();
  const rowsByTargetRecountId = new Map();
  for (const row of rows) {
    for (const rule of row.sourceRules) {
      for (const id of rule.targetDamageIds) addMapList(rowsByTargetDamageId, id, row);
      for (const id of rule.targetRecountIds) addMapList(rowsByTargetRecountId, id, row);
    }
  }

  return { rows, rowsByUid, rowsByTargetDamageId, rowsByTargetRecountId };
}

function isReasonableEntityRule(entry, rule) {
  const category = String(entry.category || "");
  const sourceType = String(rule.sourceType || "");
  const sourceId = String(rule.sourceId || "");
  if (category === "seasonal-talents") return sourceId.startsWith("season-talent-node:");
  if (category === "factors") return sourceId.startsWith("season-phantom-factor:") || sourceType === "seasonal-factor";
  if (category === "talents") return sourceType === "talent" || sourceId.startsWith("talent:");
  if (category === "skills") return sourceType === "skill" || sourceId.startsWith("skill:");
  if (category === "buffs") return sourceType === "buff" || sourceId.startsWith("buff-source:");
  if (category === "linktext-tooltips") return sourceType === "talent" || sourceType === "skill" || sourceType === "buff";
  return true;
}

function compactSourceRule(rule) {
  return {
    sourceRuleId: rule.sourceRuleId,
    sourceId: rule.sourceId ?? null,
    sourceType: rule.sourceType ?? null,
    sourceEntityId: positiveNumber(rule.sourceEntityId),
    contributionMode: rule.contributionMode ?? null,
    contributionTier: rule.contributionTier ?? null,
    confidence: rule.confidence ?? null,
    targetDamageIds: asArray(rule.targetDamageIds).map(positiveNumber).filter((id) => id !== null),
    targetRecountIds: asArray(rule.targetRecountIds).map(positiveNumber).filter((id) => id !== null),
    requiredRuntimeEvidence: asArray(rule.requiredRuntimeEvidence),
  };
}

function createObserved() {
  return {
    files: new Set(),
    directProducedReplayHits: 0,
    directProducedDamage: 0,
    sourceRuleProducedReplayHits: 0,
    sourceRuleProducedDamage: 0,
    activeModifierReplayHits: 0,
    activeModifierDamage: 0,
    activeWindowRows: 0,
    modifierWindowRows: 0,
    hitBucketRows: 0,
    hitBucketHits: 0,
    hitBucketDamage: 0,
    dmgSkillRows: 0,
    dmgSkillHits: 0,
    dmgSkillDamage: 0,
    activeSourceConfigHits: 0,
    activeSourceConfigDamage: 0,
    damageIds: new Set(),
    skillKeys: new Set(),
    ownerIds: new Set(),
    sourceRuleIds: new Set(),
    targetDamageIds: new Set(),
    targetRecountIds: new Set(),
    modifierIds: new Set(),
    firstSeenMs: null,
    lastSeenMs: null,
  };
}

function buildReport({ inputs, hitCountEntries, proofPath, contributionPath }) {
  const { rows, rowsByUid, rowsByTargetDamageId, rowsByTargetRecountId } = hitCountEntries;

  for (const input of inputs) {
    const exportJson = readJson(input, null);
    if (!exportJson) continue;
    const fileName = path.basename(input);

    for (const [rawId, skill] of Object.entries(exportJson.dmgSkills ?? {})) {
      applyDmgSkill(rowsByUid, positiveNumber(rawId), fileName, skill);
    }

    for (const buff of asArray(exportJson.activeBuffs)) {
      applyActiveWindow(rowsByUid, positiveNumber(buff.baseId), fileName, "activeWindowRows", buff);
      applyActiveWindow(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, "activeWindowRows", buff);
    }

    for (const buff of asArray(exportJson.activeEffectBuffs)) {
      applyActiveWindow(rowsByUid, positiveNumber(buff.observedBuffId ?? buff.effectSourceBuffId), fileName, "activeWindowRows", buff);
      applyActiveWindow(rowsByUid, positiveNumber(buff.effectSourceBuffId), fileName, "activeWindowRows", buff);
      applyActiveWindow(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, "activeWindowRows", buff);
    }

    for (const buff of asArray(exportJson.activeFactorBuffs)) {
      applyActiveWindow(rowsByUid, positiveNumber(buff.observedBuffId ?? buff.factorBuffId), fileName, "activeWindowRows", buff);
      applyActiveWindow(rowsByUid, positiveNumber(buff.factorBuffId), fileName, "activeWindowRows", buff);
      applyActiveWindow(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, "activeWindowRows", buff);
    }

    for (const window of asArray(exportJson.modifierWindows)) {
      applyActiveWindow(rowsByUid, positiveNumber(window.baseId), fileName, "modifierWindowRows", window);
      applyActiveWindow(rowsByUid, positiveNumber(window.sourceConfigId), fileName, "modifierWindowRows", window);
    }

    for (const bucket of asArray(exportJson.modifierHitBuckets)) {
      applyHitBucket(rowsByUid, positiveNumber(bucket.modifierBaseId), fileName, bucket);
      applyHitBucket(rowsByUid, positiveNumber(bucket.modifierSourceConfigId), fileName, bucket);
    }

    for (const hit of asArray(exportJson.modifierReplayHits)) {
      applyDirectProduced(rowsByUid, positiveNumber(hit.damageId), fileName, hit);
      applyDirectProduced(rowsByUid, positiveNumber(hit.skillKey), fileName, hit);
      applyDirectProduced(rowsByUid, positiveNumber(hit.ownerId), fileName, hit);
      applyRuleProduced(rowsByTargetDamageId, positiveNumber(hit.damageId), fileName, hit, "damage");
      applyRuleProduced(rowsByTargetRecountId, positiveNumber(hit.ownerId), fileName, hit, "recount");

      for (const modifier of asArray(hit.activeModifiers)) {
        applyActiveModifier(rowsByUid, positiveNumber(modifier.modifierBaseId), fileName, hit, modifier);
        applyActiveModifier(rowsByUid, positiveNumber(modifier.modifierSourceConfigId), fileName, hit, modifier, true);
      }
    }
  }

  const serializedRows = rows
    .map(serializeRow)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.producedHits - a.producedHits || b.sourceActiveHits - a.sourceActiveHits || a.uid - b.uid);

  const summary = {
    generatedAt: new Date().toISOString(),
    proofPath: path.relative(process.cwd(), proofPath),
    contributionPath: fs.existsSync(contributionPath) ? path.relative(process.cwd(), contributionPath) : null,
    files: inputs.length,
    hitCountEntries: serializedRows.length,
    producedObserved: serializedRows.filter((row) => row.status === "produced-hit-count-observed").length,
    sourceActiveOnly: serializedRows.filter((row) => row.status === "source-active-needs-produced-pair").length,
    targetMapNotObserved: serializedRows.filter((row) => row.status === "source-rule-target-map-not-observed").length,
    nonDamageOrSupport: serializedRows.filter((row) => row.status === "non-damage-or-support").length,
    notObserved: serializedRows.filter((row) => row.status === "not-observed").length,
    totalProducedHits: serializedRows.reduce((sum, row) => sum + row.producedHits, 0),
    totalProducedDamage: serializedRows.reduce((sum, row) => sum + row.producedDamage, 0),
    totalSourceActiveHits: serializedRows.reduce((sum, row) => sum + row.sourceActiveHits, 0),
  };

  return {
    schemaVersion: 1,
    generatedBy: "audit-modifier-hit-count-proof.mjs",
    inputs: inputs.map((input) => path.relative(process.cwd(), input)),
    summary,
    rows: serializedRows,
    notes: [
      "Dev-only hit-count/proc selector audit. This does not change live DPS, history, recount, modifier rendering, or monitor behavior.",
      "Produced-hit evidence comes from exact replay damage rows, dmgSkills rows, or generated source-rule target damage/recount maps.",
      "Source-active evidence only proves the modifier was present on a hit; it does not prove extra-hit count or proc contribution by itself.",
      "Rows with produced hits remain proof candidates, not deterministic contribution totals, until parent-hit pairing and formula validation are implemented.",
    ],
  };
}

function applyDmgSkill(rowsByUid, uid, fileName, skill) {
  if (uid === null || !rowsByUid.has(uid)) return;
  const hits = finiteNumber(skill?.hits) ?? 0;
  const damage = finiteNumber(skill?.totalValue ?? skill?.effectiveTotalValue) ?? 0;
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.dmgSkillRows += 1;
    observed.dmgSkillHits += hits;
    observed.dmgSkillDamage += damage;
    observed.damageIds.add(uid);
  }
}

function applyActiveWindow(rowsByUid, uid, fileName, field, source) {
  if (uid === null || !rowsByUid.has(uid)) return;
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed[field] += 1;
    observed.modifierIds.add(uid);
    touchTimes(observed, source);
  }
}

function applyHitBucket(rowsByUid, uid, fileName, bucket) {
  if (uid === null || !rowsByUid.has(uid)) return;
  const hits = finiteNumber(bucket?.hits) ?? 0;
  const damage = finiteNumber(bucket?.totalValue ?? bucket?.effectiveTotalValue) ?? 0;
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.hitBucketRows += 1;
    observed.hitBucketHits += hits;
    observed.hitBucketDamage += damage;
    observed.modifierIds.add(uid);
    touchTimes(observed, bucket);
  }
}

function applyDirectProduced(rowsByUid, uid, fileName, hit) {
  if (uid === null || !rowsByUid.has(uid)) return;
  const damage = finiteNumber(hit?.effectiveValue ?? hit?.value) ?? 0;
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.directProducedReplayHits += 1;
    observed.directProducedDamage += damage;
    addHitIds(observed, hit);
    touchTimes(observed, hit);
  }
}

function applyRuleProduced(rowsByTargetMap, id, fileName, hit, idKind) {
  if (id === null || !rowsByTargetMap.has(id)) return;
  const damage = finiteNumber(hit?.effectiveValue ?? hit?.value) ?? 0;
  for (const row of rowsByTargetMap.get(id)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.sourceRuleProducedReplayHits += 1;
    observed.sourceRuleProducedDamage += damage;
    addHitIds(observed, hit);
    if (idKind === "damage") observed.targetDamageIds.add(id);
    if (idKind === "recount") observed.targetRecountIds.add(id);
    for (const rule of row.sourceRules) {
      if (rule.targetDamageIds.includes(id) || rule.targetRecountIds.includes(id)) {
        observed.sourceRuleIds.add(rule.sourceRuleId);
      }
    }
    touchTimes(observed, hit);
  }
}

function applyActiveModifier(rowsByUid, uid, fileName, hit, modifier, sourceConfigOnly = false) {
  if (uid === null || !rowsByUid.has(uid)) return;
  const damage = finiteNumber(hit?.effectiveValue ?? hit?.value) ?? 0;
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.activeModifierReplayHits += 1;
    observed.activeModifierDamage += damage;
    if (sourceConfigOnly) {
      observed.activeSourceConfigHits += 1;
      observed.activeSourceConfigDamage += damage;
    }
    observed.modifierIds.add(uid);
    addHitIds(observed, hit);
    touchTimes(observed, hit);
    touchTimes(observed, modifier);
  }
}

function touchTimes(observed, source) {
  const first = finiteNumber(source?.timestampMs ?? source?.startTimeMs ?? source?.createTimeMs ?? source?.modifierStartTimeMs ?? source?.firstHitTimeMs);
  const last = finiteNumber(source?.timestampMs ?? source?.endTimeMs ?? source?.receivedTimeMs ?? source?.modifierEndTimeMs ?? source?.lastHitTimeMs);
  if (first !== null) observed.firstSeenMs = observed.firstSeenMs === null ? first : Math.min(observed.firstSeenMs, first);
  if (last !== null) observed.lastSeenMs = observed.lastSeenMs === null ? last : Math.max(observed.lastSeenMs, last);
}

function addHitIds(observed, hit) {
  const damageId = positiveNumber(hit?.damageId);
  const skillKey = positiveNumber(hit?.skillKey);
  const ownerId = positiveNumber(hit?.ownerId);
  if (damageId !== null) observed.damageIds.add(damageId);
  if (skillKey !== null) observed.skillKeys.add(skillKey);
  if (ownerId !== null) observed.ownerIds.add(ownerId);
}

function serializeRow(row) {
  const observed = row.observed;
  const producedHits = observed.directProducedReplayHits + observed.sourceRuleProducedReplayHits + observed.dmgSkillHits;
  const producedDamage = observed.directProducedDamage + observed.sourceRuleProducedDamage + observed.dmgSkillDamage;
  const sourceActiveHits = observed.activeModifierReplayHits + observed.hitBucketHits;
  const sourceActiveDamage = observed.activeModifierDamage + observed.hitBucketDamage;
  const hasTargetMap = row.sourceRules.some((rule) => rule.targetDamageIds.length || rule.targetRecountIds.length);
  const hasSourceActive = sourceActiveHits > 0 || observed.activeWindowRows > 0 || observed.modifierWindowRows > 0;
  const status = row.valueProofStatus === "non-damage-or-support"
    ? "non-damage-or-support"
    : producedHits > 0
    ? "produced-hit-count-observed"
    : hasSourceActive
      ? "source-active-needs-produced-pair"
      : hasTargetMap
        ? "source-rule-target-map-not-observed"
        : "not-observed";

  return {
    key: row.key,
    uid: row.uid,
    label: row.label,
    category: row.category,
    runtimeKind: row.runtimeKind,
    status,
    valueProofStatus: row.valueProofStatus,
    formulaZoneIds: row.formulaZoneIds,
    selectedValues: row.selectedValues,
    allSelectedValues: row.allSelectedValues,
    valueBlockers: row.valueBlockers,
    proofRequirements: row.proofRequirements,
    sourceRules: row.sourceRules,
    files: [...observed.files].sort(),
    producedHits,
    producedDamage,
    sourceActiveHits,
    sourceActiveDamage,
    directProducedReplayHits: observed.directProducedReplayHits,
    sourceRuleProducedReplayHits: observed.sourceRuleProducedReplayHits,
    activeModifierReplayHits: observed.activeModifierReplayHits,
    activeSourceConfigHits: observed.activeSourceConfigHits,
    activeWindowRows: observed.activeWindowRows,
    modifierWindowRows: observed.modifierWindowRows,
    hitBucketRows: observed.hitBucketRows,
    hitBucketHits: observed.hitBucketHits,
    dmgSkillRows: observed.dmgSkillRows,
    dmgSkillHits: observed.dmgSkillHits,
    damageIds: [...observed.damageIds].sort((a, b) => a - b).slice(0, 24),
    skillKeys: [...observed.skillKeys].sort((a, b) => a - b).slice(0, 24),
    ownerIds: [...observed.ownerIds].sort((a, b) => a - b).slice(0, 24),
    sourceRuleIds: [...observed.sourceRuleIds].sort(),
    targetDamageIds: [...observed.targetDamageIds].sort((a, b) => a - b).slice(0, 24),
    targetRecountIds: [...observed.targetRecountIds].sort((a, b) => a - b).slice(0, 24),
    modifierIds: [...observed.modifierIds].sort((a, b) => a - b).slice(0, 24),
    firstSeenMs: observed.firstSeenMs,
    lastSeenMs: observed.lastSeenMs,
  };
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Modifier Hit-Count Proof Audit");
  lines.push("");
  lines.push("Dev-only hit-count/proc selector audit for generated value-proof rows. This report does not change live DPS, history, recount, modifier rendering, or monitor behavior.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`| ${escapeMd(key)} | ${escapeMd(formatValue(value))} |`);
  }
  lines.push("");
  lines.push("## Produced Hit-Count Evidence");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "produced-hit-count-observed"), maxRows);
  lines.push("");
  lines.push("## Source Active Without Produced Pair");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "source-active-needs-produced-pair"), maxRows);
  lines.push("");
  lines.push("## Target Maps Not Observed");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "source-rule-target-map-not-observed"), Math.min(maxRows, 40));
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function pushRows(lines, rows, maxRows) {
  if (!rows.length) {
    lines.push("_None._");
    return;
  }
  lines.push("| Status | UID | Label | Values | Produced Hits | Produced Damage | Source Active Hits | Damage IDs | Rule IDs | Files | Blockers |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.slice(0, maxRows)) {
    lines.push([
      row.status,
      row.uid,
      row.label,
      row.selectedValues.join("; "),
      formatNumber(row.producedHits),
      formatNumber(row.producedDamage),
      formatNumber(row.sourceActiveHits),
      row.damageIds.join(", "),
      row.sourceRuleIds.join(", "),
      row.files.join(", "),
      row.valueBlockers.slice(0, 4).join("; "),
    ].map((cell) => escapeMd(formatValue(cell))).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
}

function formatSelectedValue(value) {
  if (!value || typeof value !== "object") return "";
  const component = value.componentKey ?? "component";
  const scope = value.scope ?? "scope";
  const raw = value.rawText ?? value.value ?? value.decimalValue ?? "";
  const unit = value.unit ?? "";
  return `${component}:${scope}=${raw}${unit && !String(raw).includes(String(unit)) ? ` ${unit}` : ""}`;
}

function statusRank(status) {
  return {
    "produced-hit-count-observed": 0,
    "source-active-needs-produced-pair": 1,
    "source-rule-target-map-not-observed": 2,
    "non-damage-or-support": 3,
    "not-observed": 4,
  }[status] ?? 9;
}

function addMapList(map, key, value) {
  if (key === null) return;
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number);
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function escapeMd(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
