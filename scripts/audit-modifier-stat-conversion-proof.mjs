#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXPORT_DIR = path.resolve("DEV_exports");
const DEFAULT_VALUE_PROOF_DEV = path.resolve("DEV_generated", "modifier", "ModifierValueProofRuntime.json");
const DEFAULT_VALUE_PROOF = fs.existsSync(DEFAULT_VALUE_PROOF_DEV)
  ? DEFAULT_VALUE_PROOF_DEV
  : path.resolve("..", "BPSR-UID-Extractors", "output", "ModifierValueProofRuntime.json");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "modifier-stat-conversion-proof-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "modifier-stat-conversion-proof-audit.md");

const ATTRS_BY_COMPONENT = new Map([
  ["adaptive-primary-stat", [11010, 11020, 11030]],
  ["mastery-stat", [11940]],
  ["versatility", [11950]],
  ["haste-or-attack-speed", [11720, 11730, 11930, 11960]],
  ["critical-rate", [11710]],
  ["critical-damage", [11110, 12510]],
  ["lucky-rate", [11780]],
  ["lucky-enhancement", [12530]],
  ["atk", [50, 11330, 11340]],
]);

const ATTR_LABELS = new Map([
  [50, "AttackPower"],
  [11010, "Strength"],
  [11020, "Intelligence"],
  [11030, "Agility"],
  [11110, "CriticalMultiplier"],
  [11330, "PhysicalAttackPanel"],
  [11340, "MagicAttackPanel"],
  [11710, "CritRatePanel"],
  [11720, "AttackSpeed"],
  [11730, "CastSpeedPanel"],
  [11780, "LuckyPanel"],
  [11930, "HastePanel"],
  [11940, "MasteryPanel"],
  [11950, "VersatilityPanel"],
  [11960, "CooldownAccelerationPanel"],
  [12510, "CritDamagePanel"],
  [12530, "LuckyDamageMultiplierPanel"],
]);

function usage() {
  console.log(`Usage: node scripts/audit-modifier-stat-conversion-proof.mjs [options]

Options:
  --input <path>       Modifier entity export JSON. Can be repeated.
  --latest <n>         Use newest n DEV_exports/modifier-entity-*.json files when --input is omitted.
  --proof <path>       ModifierValueProofRuntime.json path.
  --out-json <path>    JSON output path.
  --out-md <path>      Markdown output path.
  --max-rows <n>       Maximum rows in markdown tables.
  --help               Show this help.
`);
}

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const maxRows = positiveNumber(argValue("--max-rows", "100")) ?? 100;
const proofPath = path.resolve(argValue("--proof", DEFAULT_VALUE_PROOF));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const inputs = resolveInputs();

const proof = readJson(proofPath, null);
if (!proof) throw new Error(`Could not read value proof table: ${proofPath}`);

const statEntries = loadStatEntries(proof);
const report = buildReport({ inputs, statEntries, proofPath });

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, renderMarkdown(report, maxRows));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Stat conversion audit: files=${report.summary.files}, statEntries=${report.summary.statEntries}, activeWithAttrs=${report.summary.activeWithRequiredAttrs}, activeUnknownMap=${report.summary.activeUnknownAttrMap}`,
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

function loadStatEntries(proof) {
  const rowsByUid = new Map();
  const rows = [];
  for (const [key, entry] of Object.entries(proof.entriesByKey ?? {})) {
    const selectors = asArray(entry.valueSelectors).filter((selector) => selector?.kind === "stat-conversion-model");
    if (!selectors.length) continue;
    const uid = positiveNumber(entry.uid);
    if (uid === null) continue;

    const components = uniqueStrings(
      selectors
        .map((selector) => selector.componentKey)
        .concat(asArray(entry.selectedValues).map((value) => value?.componentKey))
        .filter(Boolean),
    );
    const requiredAttrIds = uniqueNumbers(components.flatMap((component) => ATTRS_BY_COMPONENT.get(component) ?? []));
    const unknownComponents = components.filter((component) => !ATTRS_BY_COMPONENT.has(component));

    const row = {
      key,
      uid,
      category: entry.category ?? null,
      runtimeKind: entry.runtimeKind ?? null,
      label: entry.sourceLabel ?? key,
      valueProofStatus: entry.valueProofStatus ?? null,
      formulaZoneIds: asArray(entry.formulaZoneIds),
      components,
      requiredAttrIds,
      unknownComponents,
      selectedValues: asArray(entry.selectedValues)
        .filter((value) => components.includes(value?.componentKey))
        .map(formatSelectedValue),
      valueBlockers: asArray(entry.valueBlockers),
      proofRequirements: asArray(entry.proofRequirements),
      observed: createObserved(requiredAttrIds),
    };

    rows.push(row);
    const list = rowsByUid.get(uid) ?? [];
    list.push(row);
    rowsByUid.set(uid, list);
  }
  return { rows, rowsByUid };
}

function createObserved(requiredAttrIds) {
  return {
    files: new Set(),
    activeReplayHits: 0,
    activeReplayDamage: 0,
    activeWindowRows: 0,
    modifierWindowRows: 0,
    hitBucketRows: 0,
    hitBucketHits: 0,
    hitBucketDamage: 0,
    attrSnapshots: new Map(requiredAttrIds.map((attrId) => [attrId, createAttrSummary(attrId)])),
    firstSeenMs: null,
    lastSeenMs: null,
  };
}

function createAttrSummary(attrId) {
  return {
    attrId,
    label: ATTR_LABELS.get(attrId) ?? `attr:${attrId}`,
    samples: 0,
    min: null,
    max: null,
    first: null,
    last: null,
  };
}

function buildReport({ inputs, statEntries, proofPath }) {
  const { rows, rowsByUid } = statEntries;

  for (const input of inputs) {
    const exportJson = readJson(input, null);
    if (!exportJson) continue;
    const fileName = path.basename(input);

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
      for (const modifier of asArray(hit.activeModifiers)) {
        applyActiveReplay(rowsByUid, positiveNumber(modifier.modifierBaseId), fileName, hit, modifier);
        applyActiveReplay(rowsByUid, positiveNumber(modifier.modifierSourceConfigId), fileName, hit, modifier);
      }
    }
  }

  const serializedRows = rows
    .map(serializeRow)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.activeHits - a.activeHits || b.activeDamage - a.activeDamage || a.uid - b.uid);

  const summary = {
    generatedAt: new Date().toISOString(),
    proofPath: path.relative(process.cwd(), proofPath),
    files: inputs.length,
    statEntries: serializedRows.length,
    activeWithRequiredAttrs: serializedRows.filter((row) => row.status === "active-source-with-required-attrs").length,
    activeMissingRequiredAttrs: serializedRows.filter((row) => row.status === "active-source-missing-required-attrs").length,
    activeUnknownAttrMap: serializedRows.filter((row) => row.status === "active-source-unknown-attr-map").length,
    notObserved: serializedRows.filter((row) => row.status === "not-observed").length,
    totalActiveHits: serializedRows.reduce((sum, row) => sum + row.activeHits, 0),
    totalActiveDamage: serializedRows.reduce((sum, row) => sum + row.activeDamage, 0),
  };

  return {
    schemaVersion: 1,
    generatedBy: "audit-modifier-stat-conversion-proof.mjs",
    inputs: inputs.map((input) => path.relative(process.cwd(), input)),
    summary,
    rows: serializedRows,
    notes: [
      "Dev-only stat conversion audit. This does not change live DPS, history, recount, modifier rendering, or monitor behavior.",
      "This report proves whether replay hits carry candidate stat snapshots while the source modifier is active.",
      "Required attr snapshots do not prove the conversion formula by themselves; stat-conversion rows stay blocked until the formula and baseline validation are implemented.",
      "Unknown attr-map rows need a generated or packet-proven stat mapping before they can leave the blocked state.",
    ],
  };
}

function applyActiveWindow(rowsByUid, uid, fileName, field, source) {
  if (uid === null || !rowsByUid.has(uid)) return;
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed[field] += 1;
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
    touchTimes(observed, bucket);
  }
}

function applyActiveReplay(rowsByUid, uid, fileName, hit, modifier) {
  if (uid === null || !rowsByUid.has(uid)) return;
  const damage = finiteNumber(hit?.effectiveValue ?? hit?.value) ?? 0;
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.activeReplayHits += 1;
    observed.activeReplayDamage += damage;
    collectAttrs(observed, hit?.attackerAttrs);
    touchTimes(observed, hit);
    touchTimes(observed, modifier);
  }
}

function collectAttrs(observed, attrs) {
  if (!observed.attrSnapshots.size) return;
  for (const attr of asArray(attrs)) {
    const attrId = positiveNumber(attr.attrId);
    if (attrId === null || !observed.attrSnapshots.has(attrId)) continue;
    const value = finiteNumber(attr.valueInt ?? attr.valueFloat);
    if (value === null) continue;
    const summary = observed.attrSnapshots.get(attrId);
    summary.samples += 1;
    summary.min = summary.min === null ? value : Math.min(summary.min, value);
    summary.max = summary.max === null ? value : Math.max(summary.max, value);
    summary.first = summary.first === null ? value : summary.first;
    summary.last = value;
  }
}

function touchTimes(observed, source) {
  const first = finiteNumber(source?.timestampMs ?? source?.startTimeMs ?? source?.createTimeMs ?? source?.modifierStartTimeMs ?? source?.firstHitTimeMs);
  const last = finiteNumber(source?.timestampMs ?? source?.endTimeMs ?? source?.receivedTimeMs ?? source?.modifierEndTimeMs ?? source?.lastHitTimeMs);
  if (first !== null) observed.firstSeenMs = observed.firstSeenMs === null ? first : Math.min(observed.firstSeenMs, first);
  if (last !== null) observed.lastSeenMs = observed.lastSeenMs === null ? last : Math.max(observed.lastSeenMs, last);
}

function serializeRow(row) {
  const observed = row.observed;
  const activeHits = observed.activeReplayHits + observed.hitBucketHits;
  const activeDamage = observed.activeReplayDamage + observed.hitBucketDamage;
  const attrRows = [...observed.attrSnapshots.values()];
  const attrSamples = attrRows.filter((attr) => attr.samples > 0);
  const missingAttrIds = row.requiredAttrIds.filter((attrId) => {
    const attr = observed.attrSnapshots.get(attrId);
    return !attr || attr.samples === 0;
  });
  const hasSourceActive = activeHits > 0 || observed.activeWindowRows > 0 || observed.modifierWindowRows > 0;
  const status = !hasSourceActive
    ? "not-observed"
    : row.requiredAttrIds.length === 0
      ? "active-source-unknown-attr-map"
      : missingAttrIds.length
        ? "active-source-missing-required-attrs"
        : "active-source-with-required-attrs";

  return {
    key: row.key,
    uid: row.uid,
    label: row.label,
    category: row.category,
    runtimeKind: row.runtimeKind,
    status,
    valueProofStatus: row.valueProofStatus,
    formulaZoneIds: row.formulaZoneIds,
    components: row.components,
    selectedValues: row.selectedValues,
    requiredAttrIds: row.requiredAttrIds,
    requiredAttrs: row.requiredAttrIds.map((attrId) => ATTR_LABELS.get(attrId) ?? `attr:${attrId}`),
    unknownComponents: row.unknownComponents,
    missingAttrIds,
    attrSamples,
    valueBlockers: row.valueBlockers,
    proofRequirements: row.proofRequirements,
    files: [...observed.files].sort(),
    activeHits,
    activeDamage,
    activeReplayHits: observed.activeReplayHits,
    activeWindowRows: observed.activeWindowRows,
    modifierWindowRows: observed.modifierWindowRows,
    hitBucketRows: observed.hitBucketRows,
    hitBucketHits: observed.hitBucketHits,
    firstSeenMs: observed.firstSeenMs,
    lastSeenMs: observed.lastSeenMs,
  };
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Modifier Stat Conversion Proof Audit");
  lines.push("");
  lines.push("Dev-only stat-conversion selector audit for generated value-proof rows. This report does not change live DPS, history, recount, modifier rendering, or monitor behavior.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`| ${escapeMd(key)} | ${escapeMd(formatValue(value))} |`);
  }
  lines.push("");
  lines.push("## Active With Required Attrs");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "active-source-with-required-attrs"), maxRows);
  lines.push("");
  lines.push("## Active Missing Attrs");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "active-source-missing-required-attrs"), maxRows);
  lines.push("");
  lines.push("## Active Unknown Attr Map");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "active-source-unknown-attr-map"), maxRows);
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
  lines.push("| Status | UID | Label | Components | Values | Required Attrs | Attr Samples | Active Hits | Active Damage | Files | Blockers |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.slice(0, maxRows)) {
    lines.push([
      row.status,
      row.uid,
      row.label,
      row.components.join(", "),
      row.selectedValues.join("; "),
      row.requiredAttrs.join(", ") || row.unknownComponents.join(", "),
      formatAttrSamples(row.attrSamples),
      formatNumber(row.activeHits),
      formatNumber(row.activeDamage),
      row.files.join(", "),
      row.valueBlockers.slice(0, 4).join("; "),
    ].map((cell) => escapeMd(formatValue(cell))).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
}

function formatAttrSamples(samples) {
  return samples
    .slice(0, 6)
    .map((attr) => {
      const range = attr.min === attr.max ? formatNumber(attr.min) : `${formatNumber(attr.min)}-${formatNumber(attr.max)}`;
      return `${attr.label}:${range} (${formatNumber(attr.samples)})`;
    })
    .join("; ");
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
    "active-source-with-required-attrs": 0,
    "active-source-missing-required-attrs": 1,
    "active-source-unknown-attr-map": 2,
    "not-observed": 3,
  }[status] ?? 9;
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

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
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
