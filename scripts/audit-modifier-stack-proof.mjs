import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROOF_PATH_DEV = path.resolve("DEV_generated", "modifier", "ModifierValueProofRuntime.json");
const DEFAULT_PROOF_PATH = fs.existsSync(DEFAULT_PROOF_PATH_DEV)
  ? DEFAULT_PROOF_PATH_DEV
  : path.resolve("..", "BPSR-UID-Extractors", "output", "ModifierValueProofRuntime.json");
const DEFAULT_EXPORT_DIR = path.resolve("DEV_exports");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "modifier-stack-proof-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "modifier-stack-proof-audit.md");

function argValues(flag) {
  const values = [];
  for (let i = 2; i < process.argv.length - 1; i += 1) {
    if (process.argv[i] === flag) {
      values.push(process.argv[i + 1]);
      i += 1;
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

function usage() {
  console.log(`Usage: node scripts/audit-modifier-stack-proof.mjs [options]

Options:
  --input <path>       Modifier entity export JSON. Can be repeated.
  --latest <n>         Use the newest n DEV_exports/modifier-entity-*.json files when --input is omitted.
  --proof <path>       ModifierValueProofRuntime.json path.
  --out-json <path>    JSON output path.
  --out-md <path>      Markdown output path.
  --max-rows <n>       Maximum rows in markdown tables.
  --help              Show this help.
`);
}

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const maxRows = positiveNumber(argValue("--max-rows", "80")) ?? 80;
const proofPath = path.resolve(argValue("--proof", DEFAULT_PROOF_PATH));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const inputs = resolveInputs();

const proof = readJson(proofPath, null);
if (!proof) {
  throw new Error(`Could not read proof table: ${proofPath}`);
}

const stackEntries = loadStackEntries(proof);
const report = buildReport({ inputs, stackEntries, proofPath });

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, renderMarkdown(report, maxRows));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Stack selector audit: files=${report.summary.files}, stackEntries=${report.summary.stackEntries}, observed=${report.summary.observedEntries}, proof=${report.summary.stackProofObserved}`,
);

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

function loadStackEntries(proof) {
  const rowsByUid = new Map();
  for (const [key, entry] of Object.entries(proof.entriesByKey ?? {})) {
    const selectors = asArray(entry.valueSelectors).filter((selector) => selector?.kind === "runtime-stack");
    const requiresStack = asArray(entry.proofRequirements).some((text) => String(text).toLowerCase().includes("stack"));
    if (!selectors.length && !requiresStack) continue;
    const uid = positiveNumber(entry.uid);
    if (uid === null) continue;

    const row = {
      key,
      uid,
      category: entry.category ?? null,
      runtimeKind: entry.runtimeKind ?? null,
      label: entry.sourceLabel ?? key,
      valueProofStatus: entry.valueProofStatus ?? null,
      formulaZoneIds: asArray(entry.formulaZoneIds),
      stackPolicies: uniqueStrings(selectors.map((selector) => selector.stackPolicy).filter(Boolean)),
      selectedValues: asArray(entry.selectedValues).map(formatSelectedValue),
      proofRequirements: asArray(entry.proofRequirements),
      valueBlockers: asArray(entry.valueBlockers),
      observed: createObserved(),
    };

    const list = rowsByUid.get(uid) ?? [];
    list.push(row);
    rowsByUid.set(uid, list);
  }
  return rowsByUid;
}

function createObserved() {
  return {
    files: new Set(),
    activeWindowRows: 0,
    effectWindowRows: 0,
    modifierWindowRows: 0,
    hitBucketRows: 0,
    hits: 0,
    damage: 0,
    counts: new Set(),
    rawCounts: new Set(),
    layers: new Set(),
    rawLayers: new Set(),
    sourceConfigIds: new Set(),
    sourceConfigRows: 0,
    firstSeenMs: null,
    lastSeenMs: null,
  };
}

function buildReport({ inputs, stackEntries, proofPath }) {
  const rows = [...stackEntries.values()].flat();
  const rowsByUid = stackEntries;
  const sourceConfigOnly = new Map();

  for (const input of inputs) {
    const exportJson = readJson(input, null);
    if (!exportJson) continue;
    const fileName = path.basename(input);

    for (const buff of asArray(exportJson.activeBuffs)) {
      applyObserved(rowsByUid, positiveNumber(buff.baseId), fileName, "activeWindowRows", buff, 0, 0);
      applySourceConfig(rowsByUid, sourceConfigOnly, positiveNumber(buff.sourceConfigId), positiveNumber(buff.baseId), fileName, buff);
    }

    for (const buff of asArray(exportJson.activeEffectBuffs)) {
      applyObserved(rowsByUid, positiveNumber(buff.observedBuffId ?? buff.effectSourceBuffId), fileName, "effectWindowRows", buff, 0, 0);
      applyObserved(rowsByUid, positiveNumber(buff.effectSourceBuffId), fileName, "effectWindowRows", buff, 0, 0);
      applySourceConfig(rowsByUid, sourceConfigOnly, positiveNumber(buff.sourceConfigId), positiveNumber(buff.observedBuffId), fileName, buff);
    }

    for (const window of asArray(exportJson.modifierWindows)) {
      applyObserved(rowsByUid, positiveNumber(window.baseId), fileName, "modifierWindowRows", window, 0, 0);
      applySourceConfig(rowsByUid, sourceConfigOnly, positiveNumber(window.sourceConfigId), positiveNumber(window.baseId), fileName, window);
    }

    for (const bucket of asArray(exportJson.modifierHitBuckets)) {
      const hits = finiteNumber(bucket.hits) ?? 0;
      const damage = finiteNumber(bucket.totalValue ?? bucket.effectiveTotalValue) ?? 0;
      applyObserved(rowsByUid, positiveNumber(bucket.modifierBaseId), fileName, "hitBucketRows", bucket, hits, damage);
      applySourceConfig(
        rowsByUid,
        sourceConfigOnly,
        positiveNumber(bucket.modifierSourceConfigId),
        positiveNumber(bucket.modifierBaseId),
        fileName,
        bucket,
      );
    }
  }

  const serializedRows = rows
    .map(serializeRow)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.hits - a.hits || b.damage - a.damage || a.uid - b.uid);

  const sourceConfigRows = [...sourceConfigOnly.values()]
    .map((row) => ({
      uid: row.uid,
      sourceConfigIds: [...row.sourceConfigIds].sort((a, b) => a - b),
      files: [...row.files].sort(),
      rows: row.rows,
    }))
    .sort((a, b) => b.rows - a.rows || a.uid - b.uid);

  const summary = {
    generatedAt: new Date().toISOString(),
    proofPath: path.relative(process.cwd(), proofPath),
    files: inputs.length,
    stackEntries: serializedRows.length,
    observedEntries: serializedRows.filter((row) => row.status !== "not-observed").length,
    stackProofObserved: serializedRows.filter((row) => row.status === "stack-proof-observed").length,
    observedWithoutStackState: serializedRows.filter((row) => row.status === "observed-without-stack-state").length,
    notObserved: serializedRows.filter((row) => row.status === "not-observed").length,
    sourceConfigOnlyRows: sourceConfigRows.length,
    totalObservedHits: serializedRows.reduce((sum, row) => sum + row.hits, 0),
    totalObservedDamage: serializedRows.reduce((sum, row) => sum + row.damage, 0),
  };

  return {
    schemaVersion: 1,
    generatedBy: "audit-modifier-stack-proof.mjs",
    inputs: inputs.map((input) => path.relative(process.cwd(), input)),
    summary,
    rows: serializedRows,
    sourceConfigOnlyRows: sourceConfigRows,
    notes: [
      "Dev-only stack selector audit. This does not change live DPS, history, recount, modifier rendering, or monitor behavior.",
      "A positive count or layer greater than 1 is treated as stack-state evidence. Default layer 0/1 and count -1 only prove uptime, not stack value.",
      "Source-config-only rows are routing clues. They do not prove stack value unless the linked row also carries stack count/layer evidence.",
    ],
  };
}

function applyObserved(rowsByUid, uid, fileName, field, source, hits, damage) {
  if (uid === null || !rowsByUid.has(uid)) return;
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed[field] += 1;
    observed.hits += hits;
    observed.damage += damage;

    const count = finiteNumber(source.count ?? source.modifierCount);
    if (count !== null) {
      observed.rawCounts.add(count);
      if (count > 0) observed.counts.add(count);
    }

    const layer = finiteNumber(source.layer ?? source.modifierLayer);
    if (layer !== null) {
      observed.rawLayers.add(layer);
      if (layer > 0) observed.layers.add(layer);
    }

    const sourceConfigId = positiveNumber(source.sourceConfigId ?? source.modifierSourceConfigId);
    if (sourceConfigId !== null) observed.sourceConfigIds.add(sourceConfigId);

    const first = finiteNumber(source.startTimeMs ?? source.createTimeMs ?? source.modifierStartTimeMs ?? source.firstHitTimeMs);
    const last = finiteNumber(source.endTimeMs ?? source.receivedTimeMs ?? source.modifierEndTimeMs ?? source.lastHitTimeMs);
    if (first !== null) observed.firstSeenMs = observed.firstSeenMs === null ? first : Math.min(observed.firstSeenMs, first);
    if (last !== null) observed.lastSeenMs = observed.lastSeenMs === null ? last : Math.max(observed.lastSeenMs, last);
  }
}

function applySourceConfig(rowsByUid, sourceConfigOnly, sourceConfigId, observedId, fileName, source) {
  if (sourceConfigId === null || !rowsByUid.has(sourceConfigId)) return;
  const directCount = finiteNumber(source.count ?? source.modifierCount);
  const directLayer = finiteNumber(source.layer ?? source.modifierLayer);
  const hasStackState = (directCount !== null && directCount > 0) || (directLayer !== null && directLayer > 1);
  if (hasStackState) {
    applyObserved(rowsByUid, sourceConfigId, fileName, "sourceConfigRows", source, finiteNumber(source.hits) ?? 0, finiteNumber(source.totalValue) ?? 0);
    return;
  }

  const row = sourceConfigOnly.get(sourceConfigId) ?? {
    uid: sourceConfigId,
    sourceConfigIds: new Set(),
    files: new Set(),
    rows: 0,
  };
  if (observedId !== null) row.sourceConfigIds.add(observedId);
  row.files.add(fileName);
  row.rows += 1;
  sourceConfigOnly.set(sourceConfigId, row);
}

function serializeRow(row) {
  const observed = row.observed;
  const counts = [...observed.counts].sort((a, b) => a - b);
  const rawCounts = [...observed.rawCounts].sort((a, b) => a - b);
  const layers = [...observed.layers].sort((a, b) => a - b);
  const rawLayers = [...observed.rawLayers].sort((a, b) => a - b);
  const hasStackProof = counts.some((count) => count > 0) || layers.some((layer) => layer > 1);
  const hasObserved = observed.files.size > 0;
  const status = hasStackProof ? "stack-proof-observed" : hasObserved ? "observed-without-stack-state" : "not-observed";
  return {
    key: row.key,
    uid: row.uid,
    label: row.label,
    category: row.category,
    runtimeKind: row.runtimeKind,
    status,
    valueProofStatus: row.valueProofStatus,
    formulaZoneIds: row.formulaZoneIds,
    stackPolicies: row.stackPolicies,
    selectedValues: row.selectedValues,
    valueBlockers: row.valueBlockers,
    proofRequirements: row.proofRequirements,
    files: [...observed.files].sort(),
    activeWindowRows: observed.activeWindowRows,
    effectWindowRows: observed.effectWindowRows,
    modifierWindowRows: observed.modifierWindowRows,
    hitBucketRows: observed.hitBucketRows,
    sourceConfigRows: observed.sourceConfigRows,
    hits: observed.hits,
    damage: observed.damage,
    counts,
    rawCounts,
    layers,
    rawLayers,
    sourceConfigIds: [...observed.sourceConfigIds].sort((a, b) => a - b),
    firstSeenMs: observed.firstSeenMs,
    lastSeenMs: observed.lastSeenMs,
  };
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Modifier Stack Proof Audit");
  lines.push("");
  lines.push("Dev-only stack selector audit for generated value-proof rows. This report does not change live DPS, history, recount, modifier rendering, or monitor behavior.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`| ${escapeMd(key)} | ${escapeMd(formatValue(value))} |`);
  }
  lines.push("");
  lines.push("## Observed Stack Rows");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status !== "not-observed"), maxRows);
  lines.push("");
  lines.push("## Source Config Only");
  lines.push("");
  if (report.sourceConfigOnlyRows.length) {
    lines.push("| UID | Linked IDs | Files | Rows |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of report.sourceConfigOnlyRows.slice(0, maxRows)) {
      lines.push(`| ${row.uid} | ${row.sourceConfigIds.join(", ")} | ${row.files.join(", ")} | ${formatNumber(row.rows)} |`);
    }
  } else {
    lines.push("_None._");
  }
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
  lines.push("| Status | UID | Label | Policies | Values | Counts | Layers | Hits | Damage | Files | Blockers |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.slice(0, maxRows)) {
    lines.push([
      row.status,
      row.uid,
      row.label,
      row.stackPolicies.join(", "),
      row.selectedValues.slice(0, 4).join("; "),
      row.counts.join(", ") || rawFallback(row.rawCounts),
      row.layers.join(", ") || rawFallback(row.rawLayers),
      formatNumber(row.hits),
      formatNumber(row.damage),
      row.files.join(", "),
      row.valueBlockers.slice(0, 4).join("; "),
    ].map((cell) => escapeMd(formatValue(cell))).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
}

function rawFallback(values) {
  return values.length ? `raw:${values.join(",")}` : "";
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
    "observed-without-stack-state": 0,
    "stack-proof-observed": 1,
    "not-observed": 2,
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
