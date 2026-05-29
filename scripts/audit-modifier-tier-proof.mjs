#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROOF_PATH_DEV = path.resolve("DEV_generated", "modifier", "ModifierValueProofRuntime.json");
const DEFAULT_PROOF_PATH = fs.existsSync(DEFAULT_PROOF_PATH_DEV)
  ? DEFAULT_PROOF_PATH_DEV
  : path.resolve("..", "BPSR-UID-Extractors", "output", "ModifierValueProofRuntime.json");
const DEFAULT_EXPORT_DIR = path.resolve("DEV_exports");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "modifier-tier-proof-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "modifier-tier-proof-audit.md");

const STACK_FIELD = /(?:stack|count|layer)/i;
const ID_FIELD = /(?:^|_)(?:id|uid|baseId|sourceConfigId|targetUid|hostUid|sourceUid|attackerUid|ownerUid|entityId)(?:$|_)/i;
const FIELD_WHITELIST = new Set([
  "baseId",
  "sourceConfigId",
  "observedBuffId",
  "effectSourceBuffId",
  "factorBuffId",
  "modifierBaseId",
  "modifierSourceConfigId",
  "buffLevel",
  "level",
  "lv",
  "tier",
  "grade",
  "rank",
  "star",
  "count",
  "layer",
  "modifierCount",
  "modifierLayer",
  "hits",
  "totalValue",
  "effectiveTotalValue",
]);

function usage() {
  console.log(`Usage: node scripts/audit-modifier-tier-proof.mjs [options]

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

const maxRows = positiveNumber(argValue("--max-rows", "120")) ?? 120;
const proofPath = path.resolve(argValue("--proof", DEFAULT_PROOF_PATH));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const inputs = resolveInputs();

const proof = readJson(proofPath, null);
if (!proof) throw new Error(`Could not read proof table: ${proofPath}`);

const tierEntries = loadTierEntries(proof);
const report = buildReport({ inputs, tierEntries, proofPath });

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, renderMarkdown(report, maxRows));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Tier selector audit: files=${report.summary.files}, tierSelectors=${report.summary.tierSelectors}, observed=${report.summary.observedSelectors}, strongCandidates=${report.summary.strongTierFieldCandidates}, ambiguous=${report.summary.ambiguousTierFieldCandidates}`,
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

function loadTierEntries(proof) {
  const rows = [];
  const rowsByUid = new Map();

  for (const [key, entry] of Object.entries(proof.entriesByKey ?? {})) {
    const uid = positiveNumber(entry.uid);
    if (uid === null) continue;

    const selectors = asArray(entry.valueSelectors).filter((selector) => selector?.kind === "runtime-tier-or-level");
    for (let index = 0; index < selectors.length; index += 1) {
      const selector = selectors[index];
      const candidates = serializeCandidates(selector);
      const row = {
        id: `${key}#tier:${index}`,
        key,
        uid,
        label: entry.sourceLabel ?? key,
        category: entry.category ?? null,
        runtimeKind: entry.runtimeKind ?? null,
        valueProofStatus: entry.valueProofStatus ?? null,
        formulaZoneIds: asArray(entry.formulaZoneIds),
        componentKey: selector.componentKey ?? null,
        valueResolution: selector.valueResolution ?? null,
        candidateScopes: uniqueStrings(asArray(selector.scopes)),
        candidateTiers: uniqueNumbers(candidates.map((candidate) => candidate.tier)),
        candidatesByScope: candidates,
        valueBlockers: asArray(entry.valueBlockers),
        proofRequirements: asArray(entry.proofRequirements),
        sourceRuleIds: asArray(entry.sourceRuleIds),
        directSourceRuleIds: asArray(entry.directSourceRuleIds),
        observed: createObserved(),
      };
      rows.push(row);
      const list = rowsByUid.get(uid) ?? [];
      list.push(row);
      rowsByUid.set(uid, list);
    }
  }

  return { rows, rowsByUid };
}

function serializeCandidates(selector) {
  const candidates = [];
  for (const [scope, values] of Object.entries(selector.candidatesByScope ?? {})) {
    for (const candidate of asArray(values)) {
      candidates.push({
        scope,
        value: candidate.value ?? null,
        decimalValue: candidate.decimalValue ?? null,
        unit: candidate.unit ?? null,
        rawText: candidate.rawText ?? null,
        tier: numberOrNull(candidate.tier),
        tierKind: candidate.tierKind ?? null,
        grade: numberOrNull(candidate.grade),
        key: candidate.key ?? null,
        rawTableValue: candidate.rawTableValue ?? null,
        sourceRuleId: candidate.sourceRuleId ?? null,
      });
    }
  }
  return candidates;
}

function createObserved() {
  return {
    files: new Set(),
    kinds: new Map(),
    ids: new Map(),
    fields: new Map(),
    strongTierFields: new Map(),
    ambiguousTierFields: new Map(),
    stackFields: new Map(),
    sources: new Map(),
    hosts: new Map(),
    rows: 0,
    hits: 0,
    damage: 0,
    firstSeenMs: null,
    lastSeenMs: null,
  };
}

function buildReport({ inputs, tierEntries, proofPath }) {
  const { rows, rowsByUid } = tierEntries;

  for (const input of inputs) {
    const exportJson = readJson(input, null);
    if (!exportJson) continue;
    const fileName = path.basename(input);
    const actors = buildActorMap(exportJson);

    for (const buff of asArray(exportJson.activeBuffs)) {
      applyObserved(rowsByUid, positiveNumber(buff.baseId), fileName, "activeBuff.baseId", buff, actors, 0, 0);
      applyObserved(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, "activeBuff.sourceConfigId", buff, actors, 0, 0);
    }

    for (const buff of asArray(exportJson.activeEffectBuffs)) {
      applyObserved(rowsByUid, positiveNumber(buff.observedBuffId ?? buff.effectSourceBuffId), fileName, "activeEffectBuff.observedBuffId", buff, actors, 0, 0);
      applyObserved(rowsByUid, positiveNumber(buff.effectSourceBuffId), fileName, "activeEffectBuff.effectSourceBuffId", buff, actors, 0, 0);
      applyObserved(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, "activeEffectBuff.sourceConfigId", buff, actors, 0, 0);
    }

    for (const buff of asArray(exportJson.activeFactorBuffs)) {
      applyObserved(rowsByUid, positiveNumber(buff.observedBuffId ?? buff.factorBuffId), fileName, "activeFactorBuff.observedBuffId", buff, actors, 0, 0);
      applyObserved(rowsByUid, positiveNumber(buff.factorBuffId), fileName, "activeFactorBuff.factorBuffId", buff, actors, 0, 0);
      applyObserved(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, "activeFactorBuff.sourceConfigId", buff, actors, 0, 0);
    }

    for (const window of asArray(exportJson.modifierWindows)) {
      applyObserved(rowsByUid, positiveNumber(window.baseId), fileName, "modifierWindow.baseId", window, actors, 0, 0);
      applyObserved(rowsByUid, positiveNumber(window.sourceConfigId), fileName, "modifierWindow.sourceConfigId", window, actors, 0, 0);
    }

    for (const bucket of asArray(exportJson.modifierHitBuckets)) {
      const hits = finiteNumber(bucket.hits) ?? 0;
      const damage = finiteNumber(bucket.totalValue ?? bucket.effectiveTotalValue) ?? 0;
      applyObserved(rowsByUid, positiveNumber(bucket.modifierBaseId), fileName, "modifierHitBucket.modifierBaseId", bucket, actors, hits, damage);
      applyObserved(rowsByUid, positiveNumber(bucket.modifierSourceConfigId), fileName, "modifierHitBucket.modifierSourceConfigId", bucket, actors, hits, damage);
    }

    for (const hit of asArray(exportJson.modifierReplayHits)) {
      const damage = finiteNumber(hit.effectiveValue ?? hit.value) ?? 0;
      for (const modifier of asArray(hit.activeModifiers)) {
        const merged = { ...hit, ...modifier };
        applyObserved(rowsByUid, positiveNumber(modifier.modifierBaseId), fileName, "modifierReplay.modifierBaseId", merged, actors, 1, damage);
        applyObserved(rowsByUid, positiveNumber(modifier.modifierSourceConfigId), fileName, "modifierReplay.modifierSourceConfigId", merged, actors, 1, damage);
      }
    }
  }

  const serializedRows = rows
    .map(serializeRow)
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.hits - a.hits ||
        b.damage - a.damage ||
        a.uid - b.uid ||
        a.key.localeCompare(b.key),
    );

  const summary = {
    generatedAt: new Date().toISOString(),
    proofPath: path.relative(process.cwd(), proofPath),
    files: inputs.length,
    tierSelectors: serializedRows.length,
    observedSelectors: serializedRows.filter((row) => row.status !== "not-observed").length,
    strongTierFieldCandidates: serializedRows.filter((row) => row.status === "observed-strong-tier-field-candidate").length,
    ambiguousTierFieldCandidates: serializedRows.filter((row) => row.status === "observed-ambiguous-tier-field").length,
    observedWithoutTierField: serializedRows.filter((row) => row.status === "observed-without-tier-field").length,
    notObserved: serializedRows.filter((row) => row.status === "not-observed").length,
    totalHits: serializedRows.reduce((sum, row) => sum + row.hits, 0),
    totalDamage: serializedRows.reduce((sum, row) => sum + row.damage, 0),
  };

  return {
    schemaVersion: 1,
    generatedBy: "audit-modifier-tier-proof.mjs",
    inputs: inputs.map((input) => path.relative(process.cwd(), input)),
    summary,
    rows: serializedRows,
    notes: [
      "Dev-only tier/level selector audit. This does not change live DPS, history, recount, modifier rendering, or monitor behavior.",
      "Strong tier-field candidates are evidence hints only; they must be manually checked before generated values can be promoted.",
      "buffLevel/level/layer/count are treated as ambiguous because packet rows often use them for buff runtime state or stacks rather than Battle Imagine modification tier.",
      "If this report cannot find a stable tier field, the next source of truth is a loadout/equipment packet bridge for Battle Imagine modification tier.",
    ],
  };
}

function buildActorMap(exportJson) {
  const actors = new Map();
  const localUid = positiveNumber(exportJson.uid);
  if (localUid !== null) actors.set(localUid, { uid: localUid, name: exportJson.name ?? `#${localUid}`, ownerUid: null, ownerName: null });
  for (const actor of asArray(exportJson.modifierSourceActors)) {
    const uid = positiveNumber(actor.uid);
    if (uid === null) continue;
    actors.set(uid, {
      uid,
      name: actor.name ?? `#${uid}`,
      ownerUid: positiveNumber(actor.ownerUid),
      ownerName: actor.ownerName ?? null,
    });
  }
  return actors;
}

function applyObserved(rowsByUid, uid, fileName, kind, source, actors, hits, damage) {
  if (uid === null || !rowsByUid.has(uid)) return;

  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.rows += 1;
    observed.hits += hits;
    observed.damage += damage;
    increment(observed.kinds, kind);
    collectIds(observed, source);
    collectFields(row, observed, source);
    collectActors(observed, source, actors);
    touchTimes(observed, source);
  }
}

function collectIds(observed, source) {
  for (const key of ["baseId", "sourceConfigId", "observedBuffId", "effectSourceBuffId", "factorBuffId", "modifierBaseId", "modifierSourceConfigId"]) {
    const value = positiveNumber(source?.[key]);
    if (value !== null) incrementNested(observed.ids, key, value);
  }
}

function collectFields(row, observed, source) {
  const candidateTierSet = new Set(row.candidateTiers);
  for (const [field, value] of Object.entries(source ?? {})) {
    const number = finiteNumber(value);
    if (number === null) continue;

    if (shouldKeepField(field)) incrementNested(observed.fields, field, number);

    if (STACK_FIELD.test(field)) {
      incrementNested(observed.stackFields, field, number);
      continue;
    }

    if (!candidateTierSet.has(number)) continue;

    if (isStrongTierField(field)) {
      incrementNested(observed.strongTierFields, field, number);
    } else if (isAmbiguousTierField(field)) {
      incrementNested(observed.ambiguousTierFields, field, number);
    }
  }
}

function shouldKeepField(field) {
  if (FIELD_WHITELIST.has(field)) return true;
  if (ID_FIELD.test(field)) return false;
  return isStrongTierField(field) || isAmbiguousTierField(field) || STACK_FIELD.test(field);
}

function isStrongTierField(field) {
  const lower = String(field).toLowerCase();
  return lower.includes("tier") || ["star", "stars", "grade", "rank", "qualityrank"].includes(lower);
}

function isAmbiguousTierField(field) {
  const lower = String(field).toLowerCase();
  return (
    ["level", "lv", "bufflevel", "skilllevel", "sourcelevel", "modifierlevel", "enhancelevel", "quality", "phase"].includes(lower) ||
    lower.endsWith("level")
  );
}

function collectActors(observed, source, actors) {
  const sourceUid = positiveNumber(source?.sourceUid ?? source?.modifierSourceUid);
  const hostUid = positiveNumber(source?.hostUid ?? source?.modifierHostUid);
  if (sourceUid !== null) increment(observed.sources, actorKey(actors, sourceUid));
  if (hostUid !== null) increment(observed.hosts, actorKey(actors, hostUid));
}

function actorKey(actors, uid) {
  const actor = actors.get(uid);
  const ownerUid = positiveNumber(actor?.ownerUid);
  if (ownerUid !== null) return `${uid}:${actor?.name ?? `#${uid}`} -> ${actor?.ownerName ?? `#${ownerUid}`}`;
  return `${uid}:${actor?.name ?? `#${uid}`}`;
}

function touchTimes(observed, source) {
  const first = finiteNumber(source?.timestampMs ?? source?.startTimeMs ?? source?.createTimeMs ?? source?.modifierStartTimeMs ?? source?.firstHitTimeMs);
  const last = finiteNumber(source?.timestampMs ?? source?.endTimeMs ?? source?.receivedTimeMs ?? source?.modifierEndTimeMs ?? source?.lastHitTimeMs);
  if (first !== null) observed.firstSeenMs = observed.firstSeenMs === null ? first : Math.min(observed.firstSeenMs, first);
  if (last !== null) observed.lastSeenMs = observed.lastSeenMs === null ? last : Math.max(observed.lastSeenMs, last);
}

function serializeRow(row) {
  const observed = row.observed;
  const strongTierFields = nestedMapToCounts(observed.strongTierFields, 12);
  const ambiguousTierFields = nestedMapToCounts(observed.ambiguousTierFields, 12);
  const hasObserved = observed.rows > 0;
  const status = !hasObserved
    ? "not-observed"
    : strongTierFields.length
      ? "observed-strong-tier-field-candidate"
      : ambiguousTierFields.length
        ? "observed-ambiguous-tier-field"
        : "observed-without-tier-field";

  return {
    id: row.id,
    key: row.key,
    uid: row.uid,
    label: row.label,
    category: row.category,
    runtimeKind: row.runtimeKind,
    componentKey: row.componentKey,
    valueResolution: row.valueResolution,
    valueProofStatus: row.valueProofStatus,
    status,
    formulaZoneIds: row.formulaZoneIds,
    candidateScopes: row.candidateScopes,
    candidateTiers: row.candidateTiers,
    candidateValues: row.candidatesByScope,
    files: [...observed.files].sort(),
    rows: observed.rows,
    kinds: mapToCounts(observed.kinds, 10),
    ids: nestedMapToCounts(observed.ids, 8),
    fields: nestedMapToCounts(observed.fields, 12),
    strongTierFields,
    ambiguousTierFields,
    stackFields: nestedMapToCounts(observed.stackFields, 8),
    sources: topCounts(observed.sources, 8),
    hosts: topCounts(observed.hosts, 8),
    hits: observed.hits,
    damage: observed.damage,
    valueBlockers: row.valueBlockers,
    proofRequirements: row.proofRequirements,
    sourceRuleIds: row.sourceRuleIds,
    directSourceRuleIds: row.directSourceRuleIds,
    firstSeenMs: observed.firstSeenMs,
    lastSeenMs: observed.lastSeenMs,
  };
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Modifier Tier Proof Audit");
  lines.push("");
  lines.push("Dev-only tier/level selector audit for generated value-proof rows. This report does not change live DPS, history, recount, modifier rendering, or monitor behavior.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`| ${escapeMd(key)} | ${escapeMd(formatValue(value))} |`);
  }
  lines.push("");
  lines.push("## Strong Tier Field Candidates");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "observed-strong-tier-field-candidate"), maxRows);
  lines.push("");
  lines.push("## Ambiguous Tier Fields");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "observed-ambiguous-tier-field"), maxRows);
  lines.push("");
  lines.push("## Observed Without Tier Field");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "observed-without-tier-field"), maxRows);
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
  lines.push("| Status | UID | Label | Component | Resolution | Candidate Tiers | Values | Tier Fields | Stack Fields | Rows | Hits | Damage | Kinds | Files | Blockers |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.slice(0, maxRows)) {
    lines.push(
      [
        row.status,
        row.uid,
        row.label,
        row.componentKey,
        row.valueResolution,
        row.candidateTiers.join(", "),
        formatCandidateValues(row.candidateValues),
        formatTierFields(row.strongTierFields.length ? row.strongTierFields : row.ambiguousTierFields),
        formatNestedCounts(row.stackFields),
        formatNumber(row.rows),
        formatNumber(row.hits),
        formatNumber(row.damage),
        row.kinds.map((item) => `${item.key} (${item.count})`).join("; "),
        row.files.join(", "),
        row.valueBlockers.slice(0, 4).join("; "),
      ]
        .map((cell) => escapeMd(formatValue(cell)))
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
}

function formatCandidateValues(candidates) {
  return candidates
    .slice(0, 12)
    .map((candidate) => `${candidate.scope}:t${formatValue(candidate.tier)}=${candidate.rawText ?? candidate.value ?? ""}`)
    .join("; ");
}

function formatTierFields(fields) {
  return fields.map((field) => `${field.key}=${field.values.map((item) => `${item.key} (${item.count})`).join(",")}`).join("; ");
}

function formatNestedCounts(groups) {
  return groups.map((field) => `${field.key}=${field.values.map((item) => `${item.key} (${item.count})`).join(",")}`).join("; ");
}

function increment(map, key, amount = 1) {
  map.set(String(key), (map.get(String(key)) ?? 0) + amount);
}

function incrementNested(map, key, value, amount = 1) {
  const nested = map.get(String(key)) ?? new Map();
  increment(nested, formatValueForKey(value), amount);
  map.set(String(key), nested);
}

function mapToCounts(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function nestedMapToCounts(map, limit) {
  return [...map.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, nested]) => ({ key, values: mapToCounts(nested, 8) }));
}

function topCounts(map, limit) {
  return mapToCounts(map, limit);
}

function statusRank(status) {
  return {
    "observed-strong-tier-field-candidate": 0,
    "observed-ambiguous-tier-field": 1,
    "observed-without-tier-field": 2,
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

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueNumbers(values) {
  return [...new Set(values.map(numberOrNull).filter((value) => value !== null))].sort((a, b) => a - b);
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

function formatValueForKey(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value ?? "");
}

function escapeMd(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
