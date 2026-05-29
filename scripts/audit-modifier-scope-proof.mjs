#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXPORT_DIR = path.resolve("DEV_exports");
const DEFAULT_VALUE_PROOF_DEV = path.resolve("DEV_generated", "modifier", "ModifierValueProofRuntime.json");
const DEFAULT_VALUE_PROOF = fs.existsSync(DEFAULT_VALUE_PROOF_DEV)
  ? DEFAULT_VALUE_PROOF_DEV
  : path.resolve("..", "BPSR-UID-Extractors", "output", "ModifierValueProofRuntime.json");
const DEFAULT_OUT_JSON = path.resolve("DEV_exports", "modifier-scope-proof-audit.json");
const DEFAULT_OUT_MD = path.resolve("DEV_exports", "modifier-scope-proof-audit.md");

function usage() {
  console.log(`Usage: node scripts/audit-modifier-scope-proof.mjs [options]

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
const proofPath = path.resolve(argValue("--proof", DEFAULT_VALUE_PROOF));
const outJson = path.resolve(argValue("--out-json", DEFAULT_OUT_JSON));
const outMd = path.resolve(argValue("--out-md", DEFAULT_OUT_MD));
const inputs = resolveInputs();

const proof = readJson(proofPath, null);
if (!proof) throw new Error(`Could not read value proof table: ${proofPath}`);

const scopeEntries = loadScopeEntries(proof);
const report = buildReport({ inputs, scopeEntries, proofPath });

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, renderMarkdown(report, maxRows));

console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);
console.log(
  `Scope audit: files=${report.summary.files}, scopeSelectors=${report.summary.scopeSelectors}, proven=${report.summary.activeScopeProven}, unproven=${report.summary.activeScopeUnproven}`,
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

function loadScopeEntries(proof) {
  const rowsByUid = new Map();
  const rows = [];

  for (const [key, entry] of Object.entries(proof.entriesByKey ?? {})) {
    const uid = positiveNumber(entry.uid);
    if (uid === null) continue;

    const selectors = asArray(entry.valueSelectors).filter((selector) => selector?.kind === "runtime-scope");
    for (let index = 0; index < selectors.length; index += 1) {
      const selector = selectors[index];
      const row = {
        id: `${key}#scope:${index}`,
        key,
        uid,
        label: entry.sourceLabel ?? key,
        category: entry.category ?? null,
        runtimeKind: entry.runtimeKind ?? null,
        valueProofStatus: entry.valueProofStatus ?? null,
        componentKey: selector.componentKey ?? null,
        candidateScopes: uniqueStrings(asArray(selector.scopes)),
        selectedValues: serializeScopeCandidates(selector),
        blockers: asArray(entry.valueBlockers),
        proofRequirements: asArray(entry.proofRequirements),
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

function createObserved() {
  return {
    files: new Set(),
    windows: 0,
    replayHits: 0,
    replayDamage: 0,
    hitBucketRows: 0,
    hitBucketHits: 0,
    hitBucketDamage: 0,
    scopes: new Map(),
    sources: new Map(),
    hosts: new Map(),
    firstSeenMs: null,
    lastSeenMs: null,
  };
}

function buildReport({ inputs, scopeEntries, proofPath }) {
  const { rows, rowsByUid } = scopeEntries;

  for (const input of inputs) {
    const exportJson = readJson(input, null);
    if (!exportJson) continue;
    const fileName = path.basename(input);
    const actors = buildActorMap(exportJson);

    for (const buff of asArray(exportJson.activeBuffs)) {
      applyWindow(rowsByUid, positiveNumber(buff.baseId), fileName, exportJson, actors, buff);
      applyWindow(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, exportJson, actors, buff);
    }

    for (const buff of asArray(exportJson.activeEffectBuffs)) {
      applyWindow(rowsByUid, positiveNumber(buff.observedBuffId ?? buff.effectSourceBuffId), fileName, exportJson, actors, buff);
      applyWindow(rowsByUid, positiveNumber(buff.effectSourceBuffId), fileName, exportJson, actors, buff);
      applyWindow(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, exportJson, actors, buff);
    }

    for (const buff of asArray(exportJson.activeFactorBuffs)) {
      applyWindow(rowsByUid, positiveNumber(buff.observedBuffId ?? buff.factorBuffId), fileName, exportJson, actors, buff);
      applyWindow(rowsByUid, positiveNumber(buff.factorBuffId), fileName, exportJson, actors, buff);
      applyWindow(rowsByUid, positiveNumber(buff.sourceConfigId), fileName, exportJson, actors, buff);
    }

    for (const window of asArray(exportJson.modifierWindows)) {
      applyWindow(rowsByUid, positiveNumber(window.baseId), fileName, exportJson, actors, window);
      applyWindow(rowsByUid, positiveNumber(window.sourceConfigId), fileName, exportJson, actors, window);
    }

    for (const bucket of asArray(exportJson.modifierHitBuckets)) {
      applyHitBucket(rowsByUid, positiveNumber(bucket.modifierBaseId), fileName, exportJson, actors, bucket);
      applyHitBucket(rowsByUid, positiveNumber(bucket.modifierSourceConfigId), fileName, exportJson, actors, bucket);
    }

    for (const hit of asArray(exportJson.modifierReplayHits)) {
      for (const modifier of asArray(hit.activeModifiers)) {
        applyReplay(rowsByUid, positiveNumber(modifier.modifierBaseId), fileName, exportJson, actors, hit, modifier);
        applyReplay(rowsByUid, positiveNumber(modifier.modifierSourceConfigId), fileName, exportJson, actors, hit, modifier);
      }
    }
  }

  const serializedRows = rows
    .map(serializeRow)
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.replayHits - a.replayHits ||
        b.hitBucketHits - a.hitBucketHits ||
        a.uid - b.uid ||
        a.key.localeCompare(b.key),
    );

  const summary = {
    generatedAt: new Date().toISOString(),
    proofPath: path.relative(process.cwd(), proofPath),
    files: inputs.length,
    scopeSelectors: serializedRows.length,
    activeScopeProven: serializedRows.filter((row) => row.status === "active-scope-proven").length,
    activeScopeMismatch: serializedRows.filter((row) => row.status === "active-scope-mismatch").length,
    activeScopeUnproven: serializedRows.filter((row) => row.status === "active-scope-unproven").length,
    notObserved: serializedRows.filter((row) => row.status === "not-observed").length,
    ownerHitClaims: serializedRows.reduce((sum, row) => sum + (row.scopeSummary.owner?.hits ?? 0), 0),
    partyHitClaims: serializedRows.reduce((sum, row) => sum + (row.scopeSummary.party?.hits ?? 0), 0),
    unknownHitClaims: serializedRows.reduce((sum, row) => sum + (row.scopeSummary.unknown?.hits ?? 0), 0),
  };

  return {
    schemaVersion: 1,
    generatedBy: "audit-modifier-scope-proof.mjs",
    inputs: inputs.map((input) => path.relative(process.cwd(), input)),
    summary,
    rows: serializedRows,
    notes: [
      "Dev-only owner/party scope audit. This does not change live DPS, history, recount, modifier rendering, or monitor behavior.",
      "This report proves only source-recipient scope from encounter-local source/host actor evidence.",
      "Scope proof is not value proof: tier, grade, stack, expected-value, and stat-conversion blockers still apply before contribution math.",
      "When source and recipient resolve to the same canonical actor, the owner/self value is selected; when they differ, the party/external value is selected if the generated table has one.",
    ],
  };
}

function buildActorMap(exportJson) {
  const actors = new Map();
  const localUid = positiveNumber(exportJson.uid);
  if (localUid !== null) actors.set(localUid, { uid: localUid, name: exportJson.name ?? `#${localUid}`, ownerUid: null, ownerName: null, entityType: "EntChar" });
  for (const actor of asArray(exportJson.modifierSourceActors)) {
    const uid = positiveNumber(actor.uid);
    if (uid === null) continue;
    actors.set(uid, {
      uid,
      name: actor.name ?? `#${uid}`,
      ownerUid: positiveNumber(actor.ownerUid),
      ownerName: actor.ownerName ?? null,
      entityType: actor.entityType ?? null,
    });
  }
  return actors;
}

function applyWindow(rowsByUid, uid, fileName, exportJson, actors, source) {
  if (uid === null || !rowsByUid.has(uid)) return;
  const context = classifyScope(exportJson, actors, {
    hostUid: source.hostUid,
    sourceUid: source.sourceUid,
    attackerUid: null,
    targetUid: null,
    topSummonerUid: null,
  });
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.windows += 1;
    addScope(observed, context, 0, 0, "window");
    touchTimes(observed, source);
  }
}

function applyHitBucket(rowsByUid, uid, fileName, exportJson, actors, bucket) {
  if (uid === null || !rowsByUid.has(uid)) return;
  const hits = finiteNumber(bucket?.hits) ?? 0;
  const damage = finiteNumber(bucket?.totalValue ?? bucket?.effectiveTotalValue) ?? 0;
  const context = classifyScope(exportJson, actors, {
    hostUid: bucket.modifierHostUid,
    sourceUid: bucket.modifierSourceUid,
    attackerUid: bucket.attackerUid,
    targetUid: bucket.targetUid,
    topSummonerUid: bucket.topSummonerUid,
  });
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.hitBucketRows += 1;
    observed.hitBucketHits += hits;
    observed.hitBucketDamage += damage;
    addScope(observed, context, hits, damage, "hitBucket");
    touchTimes(observed, bucket);
  }
}

function applyReplay(rowsByUid, uid, fileName, exportJson, actors, hit, modifier) {
  if (uid === null || !rowsByUid.has(uid)) return;
  const damage = finiteNumber(hit?.effectiveValue ?? hit?.value) ?? 0;
  const context = classifyScope(exportJson, actors, {
    hostUid: modifier.modifierHostUid,
    sourceUid: modifier.modifierSourceUid,
    attackerUid: hit.attackerUid,
    targetUid: hit.targetUid,
    topSummonerUid: hit.topSummonerUid,
  });
  for (const row of rowsByUid.get(uid)) {
    const observed = row.observed;
    observed.files.add(fileName);
    observed.replayHits += 1;
    observed.replayDamage += damage;
    addScope(observed, context, 1, damage, "replay");
    touchTimes(observed, hit);
    touchTimes(observed, modifier);
  }
}

function classifyScope(exportJson, actors, ids) {
  const localUid = positiveNumber(exportJson.uid);
  const hostUid = positiveNumber(ids.hostUid);
  const sourceUid = positiveNumber(ids.sourceUid);
  const attackerUid = positiveNumber(ids.attackerUid);
  const topSummonerUid = positiveNumber(ids.topSummonerUid);
  const targetUid = positiveNumber(ids.targetUid);

  const sourceOwner = canonicalOwnerUid(actors, sourceUid);
  const hostOwner = canonicalOwnerUid(actors, hostUid);
  const attackerOwner = canonicalOwnerUid(actors, topSummonerUid) ?? canonicalOwnerUid(actors, attackerUid);
  const targetOwner = canonicalOwnerUid(actors, targetUid);

  let scope = "unknown";
  let reason = "missing-source-or-host";
  if (sourceOwner !== null && hostOwner !== null) {
    if (sourceOwner === hostOwner) {
      scope = "owner";
      reason = "source-owner-equals-recipient-owner";
    } else if (hostOwner === attackerOwner || hostOwner === localUid) {
      scope = "party";
      reason = "source-owner-differs-from-damage-recipient";
    } else if (hostOwner === targetOwner) {
      scope = "target";
      reason = "recipient-resolves-to-target";
    } else {
      scope = "party";
      reason = "source-owner-differs-from-recipient-owner";
    }
  } else if (hostOwner !== null && sourceOwner === null) {
    scope = "unknown";
    reason = "recipient-known-source-missing";
  } else if (sourceOwner !== null && hostOwner === null) {
    scope = "unknown";
    reason = "source-known-recipient-missing";
  }

  return {
    scope,
    reason,
    hostUid,
    sourceUid,
    hostOwner,
    sourceOwner,
    attackerUid,
    attackerOwner,
    targetUid,
    targetOwner,
    sourceLabel: actorLabel(actors, sourceUid),
    hostLabel: actorLabel(actors, hostUid),
  };
}

function canonicalOwnerUid(actors, uid) {
  const id = positiveNumber(uid);
  if (id === null) return null;
  const actor = actors.get(id);
  return positiveNumber(actor?.ownerUid) ?? id;
}

function actorLabel(actors, uid) {
  const id = positiveNumber(uid);
  if (id === null) return null;
  const actor = actors.get(id);
  const owner = positiveNumber(actor?.ownerUid);
  if (owner !== null) return `${actor?.name ?? `#${id}`} -> ${actor?.ownerName ?? `#${owner}`}`;
  return actor?.name ?? `#${id}`;
}

function addScope(observed, context, hits, damage, sourceKind) {
  const scope = context.scope ?? "unknown";
  const entry = observed.scopes.get(scope) ?? {
    scope,
    hits: 0,
    damage: 0,
    windows: 0,
    hitBucketRows: 0,
    replayHits: 0,
    reasons: new Map(),
  };
  entry.hits += hits;
  entry.damage += damage;
  if (sourceKind === "window") entry.windows += 1;
  if (sourceKind === "hitBucket") entry.hitBucketRows += 1;
  if (sourceKind === "replay") entry.replayHits += hits;
  increment(entry.reasons, context.reason ?? "unknown");
  observed.scopes.set(scope, entry);

  if (context.sourceUid !== null) {
    const sourceKey = `${context.sourceUid}:${context.sourceLabel ?? `#${context.sourceUid}`}`;
    increment(observed.sources, sourceKey);
  }
  if (context.hostUid !== null) {
    const hostKey = `${context.hostUid}:${context.hostLabel ?? `#${context.hostUid}`}`;
    increment(observed.hosts, hostKey);
  }
}

function serializeRow(row) {
  const observed = row.observed;
  const scopeSummary = Object.fromEntries(
    [...observed.scopes.entries()].map(([scope, item]) => [
      scope,
      {
        hits: item.hits,
        damage: item.damage,
        windows: item.windows,
        hitBucketRows: item.hitBucketRows,
        replayHits: item.replayHits,
        reasons: topCounts(item.reasons, 4),
      },
    ]),
  );
  const observedScopes = Object.keys(scopeSummary).filter((scope) => scope !== "unknown" && ((scopeSummary[scope]?.hits ?? 0) > 0 || (scopeSummary[scope]?.windows ?? 0) > 0));
  const matchedScopes = observedScopes.filter((scope) => row.candidateScopes.includes(scope) || (scope === "owner" && row.candidateScopes.includes("self")));
  const totalHits = observed.replayHits + observed.hitBucketHits;
  const totalDamage = observed.replayDamage + observed.hitBucketDamage;
  const hasObserved = totalHits > 0 || observed.windows > 0 || observed.hitBucketRows > 0;
  const hasOnlyUnknown = hasObserved && observedScopes.length === 0;
  const status = !hasObserved
    ? "not-observed"
    : matchedScopes.length
      ? "active-scope-proven"
      : hasOnlyUnknown
        ? "active-scope-unproven"
        : "active-scope-mismatch";

  return {
    id: row.id,
    key: row.key,
    uid: row.uid,
    label: row.label,
    category: row.category,
    runtimeKind: row.runtimeKind,
    componentKey: row.componentKey,
    valueProofStatus: row.valueProofStatus,
    status,
    candidateScopes: row.candidateScopes,
    observedScopes,
    matchedScopes,
    selectedValues: row.selectedValues,
    scopeSummary,
    files: [...observed.files].sort(),
    windows: observed.windows,
    replayHits: observed.replayHits,
    replayDamage: observed.replayDamage,
    hitBucketRows: observed.hitBucketRows,
    hitBucketHits: observed.hitBucketHits,
    hitBucketDamage: observed.hitBucketDamage,
    sources: topCounts(observed.sources, 8),
    hosts: topCounts(observed.hosts, 8),
    blockers: row.blockers,
    proofRequirements: row.proofRequirements,
    firstSeenMs: observed.firstSeenMs,
    lastSeenMs: observed.lastSeenMs,
  };
}

function serializeScopeCandidates(selector) {
  const values = [];
  for (const [scope, candidates] of Object.entries(selector.candidatesByScope ?? {})) {
    for (const candidate of asArray(candidates).slice(0, 8)) {
      values.push({
        scope,
        value: candidate.value ?? null,
        decimalValue: candidate.decimalValue ?? null,
        unit: candidate.unit ?? null,
        rawText: candidate.rawText ?? null,
        tier: candidate.tier ?? null,
        grade: candidate.grade ?? null,
        sourceRuleId: candidate.sourceRuleId ?? null,
      });
    }
  }
  return values;
}

function touchTimes(observed, source) {
  const first = finiteNumber(source?.timestampMs ?? source?.startTimeMs ?? source?.createTimeMs ?? source?.modifierStartTimeMs ?? source?.firstHitTimeMs);
  const last = finiteNumber(source?.timestampMs ?? source?.endTimeMs ?? source?.receivedTimeMs ?? source?.modifierEndTimeMs ?? source?.lastHitTimeMs);
  if (first !== null) observed.firstSeenMs = observed.firstSeenMs === null ? first : Math.min(observed.firstSeenMs, first);
  if (last !== null) observed.lastSeenMs = observed.lastSeenMs === null ? last : Math.max(observed.lastSeenMs, last);
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Modifier Scope Proof Audit");
  lines.push("");
  lines.push("Dev-only owner/party scope selector audit for generated value-proof rows. This report does not change live DPS, history, recount, modifier rendering, or monitor behavior.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`| ${escapeMd(key)} | ${escapeMd(formatValue(value))} |`);
  }
  lines.push("");
  lines.push("## Active Scope Proven");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "active-scope-proven"), maxRows);
  lines.push("");
  lines.push("## Active Scope Unproven");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "active-scope-unproven"), maxRows);
  lines.push("");
  lines.push("## Active Scope Mismatch");
  lines.push("");
  pushRows(lines, report.rows.filter((row) => row.status === "active-scope-mismatch"), maxRows);
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
  lines.push("| Status | UID | Label | Component | Candidate Scopes | Observed Scopes | Values | Replay Hits | Hit Bucket Hits | Damage | Sources | Files | Blockers |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.slice(0, maxRows)) {
    lines.push(
      [
        row.status,
        row.uid,
        row.label,
        row.componentKey,
        row.candidateScopes.join(", "),
        row.observedScopes.join(", "),
        formatScopeValues(row.selectedValues),
        formatNumber(row.replayHits),
        formatNumber(row.hitBucketHits),
        formatNumber(row.replayDamage + row.hitBucketDamage),
        row.sources.map((source) => `${source.key} (${source.count})`).join("; "),
        row.files.join(", "),
        row.blockers.slice(0, 4).join("; "),
      ]
        .map((cell) => escapeMd(formatValue(cell)))
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
}

function formatScopeValues(values) {
  return values
    .slice(0, 8)
    .map((value) => {
      const tier = value.tier !== null && value.tier !== undefined ? ` t${value.tier}` : "";
      const grade = value.grade !== null && value.grade !== undefined ? ` g${value.grade}` : "";
      return `${value.scope}:${value.rawText ?? value.value ?? ""}${tier}${grade}`;
    })
    .join("; ");
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topCounts(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function statusRank(status) {
  return {
    "active-scope-proven": 0,
    "active-scope-unproven": 1,
    "active-scope-mismatch": 2,
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
