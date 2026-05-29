#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function readJson(filePath, fallback = undefined) {
  if (!filePath || !fs.existsSync(filePath)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function generatedDevOrExtractor(fileName) {
  const devPath = path.join("DEV_generated", "modifier", fileName);
  return fs.existsSync(devPath) ? devPath : path.join("..", "BPSR-UID-Extractors", "output", fileName);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function addMap(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function whole(value) {
  if (!Number.isFinite(value)) return "";
  return Math.round(value).toLocaleString("en-US");
}

function sourceIdToProofKey(sourceId) {
  if (!sourceId || !sourceId.includes(":")) return null;
  const [kind, id] = sourceId.split(":");
  if (!id) return null;
  if (kind === "season-talent-node") return `seasonal-talents:${id}`;
  if (kind === "talent") return `talents:${id}`;
  if (kind === "buff" || kind === "observed-buff") return `buffs:${id}`;
  if (kind === "skill") return `skills:${id}`;
  if (kind === "item") return `items:${id}`;
  return `${kind}:${id}`;
}

function valueLabel(value) {
  if (!value) return "";
  const raw = value.rawText ?? value.value ?? value.decimalValue ?? "";
  const grade = value.grade !== undefined ? ` g${value.grade}` : "";
  const scope = value.scope ? `${value.scope}:` : "";
  return `${scope}${raw}${grade}`.trim();
}

function selectorSummary(entry) {
  return asArray(entry?.valueSelectors).map((selector) => ({
    kind: selector.kind ?? "",
    status: selector.status ?? "",
    componentKey: selector.componentKey ?? "",
    candidateCount: selector.candidateCount ?? asArray(selector.candidates).length,
    candidates: asArray(selector.candidates).map(valueLabel),
    requiredRuntimeProof: selector.requiredRuntimeProof ?? "",
    stackPolicy: selector.stackPolicy ?? "",
  }));
}

function compactValueProof(entry) {
  if (!entry) return null;
  return {
    key: entry.key ?? null,
    uid: entry.uid ?? null,
    label: entry.sourceLabel ?? entry.label ?? null,
    category: entry.category ?? null,
    valueProofStatus: entry.valueProofStatus ?? null,
    formulaZoneIds: asArray(entry.formulaZoneIds),
    selectedValues: asArray(entry.selectedValues).map(valueLabel),
    selectors: selectorSummary(entry),
    valueBlockers: asArray(entry.valueBlockers),
    proofRequirements: asArray(entry.proofRequirements),
  };
}

function compactStatRow(row) {
  if (!row) return null;
  return {
    key: row.key,
    uid: row.uid,
    label: row.label,
    status: row.status,
    valueProofStatus: row.valueProofStatus,
    components: asArray(row.components),
    selectedValues: asArray(row.selectedValues),
    requiredAttrs: asArray(row.requiredAttrs),
    missingAttrIds: asArray(row.missingAttrIds),
    attrSamples: asArray(row.attrSamples).map((attr) => ({
      attrId: attr.attrId,
      label: attr.label,
      samples: attr.samples,
      min: attr.min,
      max: attr.max,
      first: attr.first,
      last: attr.last,
    })),
    activeHits: row.activeHits ?? 0,
    activeReplayHits: row.activeReplayHits ?? 0,
    valueBlockers: asArray(row.valueBlockers),
    files: asArray(row.files),
  };
}

function compactMirageFile(file) {
  const inference = file?.panelAttackInference;
  if (!inference) {
    return {
      file: file?.file ?? "",
      proofStatus: "no-panel-attack-ladder",
      states: asArray(file?.states).map((state) => ({ state: state.state, hits: state.hits })),
    };
  }
  return {
    file: file.file,
    proofStatus: "panel-attack-ladder",
    attrId: inference.attrId,
    attrName: inference.attrName,
    baselineState: inference.baselineState,
    baseValue: inference.baseValue,
    maxValue: inference.maxValue,
    maxActiveMirageLayer: inference.maxActiveMirageLayer,
    maxObservedStackSteps: inference.maxObservedStackSteps,
    totalDelta: inference.totalDelta,
    averageDeltaPerObservedStep: inference.averageDeltaPerObservedStep,
    observedPerStack: inference.capComparison?.observedPerStack ?? null,
    observedVsTooltipCap: inference.capComparison?.observedVsTooltipCap ?? null,
    adjacentStepDeltas: asArray(inference.adjacentStepDeltas),
    ladder: asArray(inference.ladder).map((step) => ({
      inferredStackStep: step.inferredStackStep,
      panelAttack: step.panelAttack,
      deltaFromBase: step.deltaFromBase,
      deltaPerStep: step.deltaPerStep,
      hits: step.hits,
    })),
  };
}

function buildFlatBlockers(replay) {
  const byRule = new Map();
  for (const row of asArray(replay.rows)) {
    for (const detail of asArray(row.blockedActionDetails)) {
      const reason = String(detail.reason ?? "");
      const terms = asArray(detail.terms);
      if (!terms.includes("primaryAttack") && !reason.startsWith("flat-attack-term")) continue;
      const ruleId = detail.ruleId ?? "unknown-rule";
      const bucket = byRule.get(ruleId) ?? {
        ruleId,
        label: detail.label ?? ruleId,
        hits: 0,
        rows: 0,
        damageIds: new Set(),
        files: new Set(),
        reasons: new Map(),
      };
      bucket.hits += Number(detail.hits) || 0;
      bucket.rows += 1;
      bucket.damageIds.add(row.damageId);
      for (const file of asArray(row.files)) bucket.files.add(file);
      addMap(bucket.reasons, reason, Number(detail.hits) || 0);
      byRule.set(ruleId, bucket);
    }
  }
  return byRule;
}

function gatherRuleContext(ruleId, aggregate, context) {
  const contribution = context.contribution.sourcesByRuleId?.[ruleId] ?? null;
  const relationship = context.relationship.sourcesByRuleId?.[ruleId] ?? null;
  const sourceId = contribution?.sourceId ?? relationship?.sourceId ?? null;
  const sourceProofKey = sourceIdToProofKey(sourceId);
  const runtimeBuffIds = unique(
    asArray(relationship?.uidEdges)
      .filter((edge) => edge.uidKind === "buff" && edge.role === "runtime")
      .map((edge) => Number(edge.uid))
      .filter(Number.isFinite),
  );
  const runtimeProofKeys = runtimeBuffIds.map((uid) => `buffs:${uid}`);
  const sourceProof = compactValueProof(sourceProofKey ? context.valueProof.entriesByKey?.[sourceProofKey] : null);
  const runtimeProofs = runtimeProofKeys
    .map((key) => compactValueProof(context.valueProof.entriesByKey?.[key]))
    .filter(Boolean);
  const sourceStat = compactStatRow(sourceProofKey ? context.statRowsByKey.get(sourceProofKey) : null);
  const runtimeStats = runtimeProofKeys.map((key) => compactStatRow(context.statRowsByKey.get(key))).filter(Boolean);
  const atkHint = asArray(contribution?.componentValueHints).find((hint) =>
    hint.componentKey === "atk" || asArray(hint.formulaTermIds).includes("primaryAttack"),
  );
  const candidateValues = unique(asArray(atkHint?.values).map(valueLabel));
  const selectorCandidates = unique(
    asArray(sourceProof?.selectors)
      .filter((selector) => selector.componentKey === "atk" || selector.kind === "runtime-value-ladder")
      .flatMap((selector) => selector.candidates),
  );
  const hasStackSelector = asArray(sourceProof?.selectors).some((selector) => selector.kind === "runtime-stack");
  const hasValueLadder = asArray(sourceProof?.selectors).some((selector) => selector.kind === "runtime-value-ladder");
  const hasPanelAttackLadder =
    /Mirage Dream/i.test(aggregate.label) || sourceId === "season-talent-node:1301"
      ? context.mirageFiles.some((file) => file.proofStatus === "panel-attack-ladder")
      : false;
  const equipmentEvidence =
    /Mirage Dream/i.test(aggregate.label) || sourceId === "season-talent-node:1301"
      ? context.equipment.mirageComparison ?? null
      : null;

  const blockers = [];
  if (candidateValues.length > 1 || selectorCandidates.length > 1) blockers.push("ambiguous-flat-value-ladder");
  if (hasValueLadder) blockers.push("runtime-value-ladder-selector-required");
  if (hasStackSelector) blockers.push("hit-time-stack-state-required");
  if (!sourceStat && !runtimeStats.length) blockers.push("no-primary-attack-stat-audit-row");
  if (hasPanelAttackLadder) blockers.push("panel-ladder-is-proof-not-yet-replay-input");
  if (equipmentEvidence?.status?.includes("pending")) blockers.push("gear-multiplier-decode-required");
  if (sourceProof?.valueProofStatus && sourceProof.valueProofStatus !== "value-ready") {
    blockers.push(`value-proof:${sourceProof.valueProofStatus}`);
  }
  if (!contribution) blockers.push("missing-contribution-runtime-rule");

  return {
    ruleId,
    sourceId,
    label: aggregate.label,
    hits: aggregate.hits,
    blockedRows: aggregate.rows,
    damageIds: [...aggregate.damageIds].sort((left, right) => Number(left) - Number(right)),
    files: [...aggregate.files].sort(),
    reasons: Object.fromEntries([...aggregate.reasons.entries()].sort((left, right) => right[1] - left[1])),
    runtimeBuffIds,
    formulaTermIds: asArray(contribution?.formulaTermIds),
    contributionGroups: asArray(contribution?.contributionGroups),
    candidateValues,
    selectorCandidates,
    sourceProofKey,
    sourceValueProof: sourceProof,
    runtimeValueProofs: runtimeProofs,
    sourceStat,
    runtimeStats,
    miragePanelEvidence:
      /Mirage Dream/i.test(aggregate.label) || sourceId === "season-talent-node:1301" ? context.mirageFiles : [],
    equipmentEvidence,
    blockers: unique(blockers),
    nextEvidence: nextEvidence({
      sourceId,
      label: aggregate.label,
      hasValueLadder,
      hasStackSelector,
      hasPanelAttackLadder,
      equipmentEvidence,
      sourceStat,
      runtimeStats,
    }),
  };
}

function nextEvidence(row) {
  const steps = [];
  if (row.hasValueLadder) {
    steps.push("select the active flat ATK ladder value from runtime/loadout grade, tier, or stack state");
  }
  if (row.hasStackSelector) {
    steps.push("join hit-time stack count/layer to each affected hit before replay");
  }
  if (!row.sourceStat && !row.runtimeStats.length) {
    steps.push("attach source actor panel Physical/Magic Attack snapshot to this rule family");
  }
  if (row.hasPanelAttackLadder) {
    steps.push("convert Mirage panel ladder into a replay input only after stack and gear multipliers are resolved");
  }
  if (row.equipmentEvidence) {
    steps.push("decode equipped gear/accessory multiplier lines before trusting raw panel delta");
  }
  if (!steps.length) steps.push("inspect replay blockers for this source");
  return steps;
}

function buildReport(context) {
  const flatBlockers = buildFlatBlockers(context.replay);
  const rows = [...flatBlockers.entries()]
    .map(([ruleId, aggregate]) => gatherRuleContext(ruleId, aggregate, context))
    .sort((left, right) => right.hits - left.hits || left.label.localeCompare(right.label));

  const blockerCounts = new Map();
  for (const row of rows) {
    for (const blocker of row.blockers) addMap(blockerCounts, blocker);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputs: context.inputs,
    summary: {
      flatAttackRules: rows.length,
      totalBlockedHits: rows.reduce((sum, row) => sum + row.hits, 0),
      totalBlockedDamageRows: rows.reduce((sum, row) => sum + row.blockedRows, 0),
      rulesWithPanelAttackLadder: rows.filter((row) => row.miragePanelEvidence.length > 0).length,
      rulesWithRuntimeBuffAliases: rows.filter((row) => row.runtimeBuffIds.length > 0).length,
      byBlocker: Object.fromEntries([...blockerCounts.entries()].sort((left, right) => right[1] - left[1])),
    },
    rows,
    notes: [
      "Dev-only audit: this report joins replay blockers with generated value proof, relationship edges, current equipment evidence, and Mirage panel ladders.",
      "Rows here are not runtime contribution rows. They show which evidence must exist before flat ATK modifiers can be replayed against final damage packets.",
    ],
  };
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Flat ATK Replay Blocker Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Flat ATK source rules: ${report.summary.flatAttackRules}`);
  lines.push(`- Blocked hit evidence: ${whole(report.summary.totalBlockedHits)}`);
  lines.push(`- Blocked damage-row instances: ${whole(report.summary.totalBlockedDamageRows)}`);
  lines.push(`- Rules with panel attack ladder evidence: ${report.summary.rulesWithPanelAttackLadder}`);
  lines.push(`- Rules with runtime buff aliases: ${report.summary.rulesWithRuntimeBuffAliases}`);
  lines.push("");
  lines.push("## Source Rules");
  lines.push("");
  lines.push("| Rule | Source | Label | Hits | Damage Rows | Runtime Buffs | Flat Values | Value Proof | Stat Evidence | Blockers | Next Evidence |");
  lines.push("| --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |");
  for (const row of report.rows.slice(0, maxRows)) {
    const statEvidence = [
      row.sourceStat ? `${row.sourceStat.key}:${row.sourceStat.status}` : "",
      ...row.runtimeStats.map((stat) => `${stat.key}:${stat.status}`),
    ]
      .filter(Boolean)
      .join("<br>");
    const valueProof = [
      row.sourceValueProof ? `${row.sourceProofKey}:${row.sourceValueProof.valueProofStatus}` : "",
      ...row.runtimeValueProofs.map((proof) => `${proof.key ?? proof.uid}:${proof.valueProofStatus}`),
    ]
      .filter(Boolean)
      .join("<br>");
    lines.push(
      [
        row.ruleId,
        row.sourceId,
        row.label,
        whole(row.hits),
        row.blockedRows,
        row.runtimeBuffIds.join(", "),
        unique([...row.candidateValues, ...row.selectorCandidates]).join("<br>"),
        valueProof,
        statEvidence || "missing",
        row.blockers.join("<br>"),
        row.nextEvidence.join("<br>"),
      ]
        .map(markdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  lines.push("");
  lines.push("## Mirage Panel Evidence");
  lines.push("");
  lines.push("| File | Base | Max | Delta | Stack Steps | Per Step | Ratio To Tooltip Cap |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  const mirageRows = report.rows.flatMap((row) => row.miragePanelEvidence).slice(0, maxRows);
  for (const evidence of mirageRows) {
    lines.push(
      [
        evidence.file,
        evidence.baseValue ?? "",
        evidence.maxValue ?? "",
        evidence.totalDelta ?? "",
        evidence.maxObservedStackSteps ?? "",
        evidence.observedPerStack ?? "",
        evidence.observedVsTooltipCap ?? "",
      ]
        .map(markdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  if (!mirageRows.length) lines.push("|  |  |  |  |  |  |  |");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
const replayPath = args["replay-json"] ?? "DEV_exports/skill-replay-candidates-latest4.json";
const statPath = args["stat-json"] ?? "DEV_exports/modifier-stat-conversion-proof-audit.json";
const equipmentPath = args["equipment-json"] ?? "DEV_exports/current-equipment-stat-audit.json";
const miragePath = args["mirage-json"] ?? "DEV_exports/mirage-dream-scaling-audit.json";
const contributionPath = args["contribution-json"] ?? "parser-data/generated/ModifierContributionRuntime.json";
const relationshipPath = args["relationship-json"] ?? "parser-data/generated/ModifierRelationshipTable.json";
const valueProofPath = args["value-proof-json"] ?? generatedDevOrExtractor("ModifierValueProofRuntime.json");
const outJson = args["out-json"] ?? "DEV_exports/flat-attack-replay-blockers-latest4.json";
const outMd = args["out-md"] ?? "DEV_exports/flat-attack-replay-blockers-latest4.md";
const maxRows = Number.parseInt(args["max-rows"] ?? "60", 10);

const stat = readJson(statPath);
const context = {
  inputs: {
    replay: replayPath,
    stat: statPath,
    equipment: equipmentPath,
    mirage: miragePath,
    contribution: contributionPath,
    relationship: relationshipPath,
    valueProof: valueProofPath,
  },
  replay: readJson(replayPath),
  stat,
  equipment: readJson(equipmentPath, {}),
  mirage: readJson(miragePath, {}),
  contribution: readJson(contributionPath, {}),
  relationship: readJson(relationshipPath, {}),
  valueProof: readJson(valueProofPath, {}),
  statRowsByKey: new Map(asArray(stat.rows).map((row) => [row.key, row])),
  mirageFiles: asArray(readJson(miragePath, {}).files).map(compactMirageFile),
};

const report = buildReport(context);
ensureDir(outJson);
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
ensureDir(outMd);
fs.writeFileSync(outMd, renderMarkdown(report, Number.isFinite(maxRows) ? maxRows : 60));

console.log(`Flat ATK source rules: ${report.summary.flatAttackRules}`);
console.log(`Blocked hit evidence: ${report.summary.totalBlockedHits}`);
console.log(`Rules with panel attack ladder evidence: ${report.summary.rulesWithPanelAttackLadder}`);
console.log(`Output: ${outJson}`);
console.log(`Markdown: ${outMd}`);
