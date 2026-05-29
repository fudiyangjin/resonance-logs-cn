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

function readJson(filePath) {
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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function localizedName(row) {
  const names = row?.Names ?? {};
  return String(
    names.en
      ?? names["zh-CN"]
      ?? names.design
      ?? row?.Name
      ?? row?.NameDesign
      ?? row?.DesignName
      ?? "",
  ).trim();
}

function designName(row) {
  return String(row?.Names?.design ?? row?.DesignName ?? row?.NameDesign ?? "").trim();
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .replace(/[－-]\s*(?:stack|stacks|stacking|cd|叠层cd|叠层|层数|計數|计数)\s*$/iu, "")
    .trim();
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function collectObservedBridgeKeys(replay) {
  const ids = new Map();
  for (const row of replay.rows ?? []) {
    for (const detail of row.blockedActionDetails ?? []) {
      const match = String(detail.reason ?? "").match(/^observed-only-value-bridge-required:observed-buff:(\d+)$/);
      if (!match) continue;
      const buffId = Number(match[1]);
      const current = ids.get(buffId) ?? { buffId, ruleIds: new Set(), hits: 0, damageIds: new Set() };
      current.ruleIds.add(detail.ruleId);
      current.hits += Number(detail.hits) || 0;
      current.damageIds.add(row.damageId);
      ids.set(buffId, current);
    }
  }
  return [...ids.values()].map((entry) => ({
    buffId: entry.buffId,
    ruleIds: [...entry.ruleIds].sort(),
    hits: entry.hits,
    damageIds: [...entry.damageIds].sort((left, right) => left - right),
  }));
}

function sourceSummary(ruleId, recount) {
  const source = recount.sourcesById?.[ruleId] ?? {};
  return {
    ruleId,
    sourceId: source.sourceId ?? "",
    sourceKind: source.sourceKind ?? "",
    sourceType: source.sourceType ?? "",
    sourceEntityId: source.sourceEntityId ?? null,
    sourceName: source.sourceName ?? "",
    contributionStatus: source.contributionStatus ?? "",
    rowPolicy: source.rowPolicy ?? "",
    reportPolicy: source.reportPolicy ?? "",
    buffIds: asArray(source.buffIds),
    debugBuffIds: asArray(source.debugBuffIds),
  };
}

function relationshipEdgesForBuff(buffId, relationshipTable) {
  if (!relationshipTable) return [];
  const needle = Number(buffId);
  const edges = [];
  for (const [ruleId, relationships] of Object.entries(relationshipTable.relationshipsByRuleId ?? {})) {
    for (const relationship of asArray(relationships)) {
      if (Number(relationship.childBuffId) !== needle && Number(relationship.buffId) !== needle) continue;
      edges.push({
        ruleId,
        edgeKind: relationship.edgeKind ?? "",
        relationshipKind: relationship.relationshipKind ?? "",
        role: relationship.role ?? "",
        status: relationship.status ?? "",
        parentBuffId: relationship.parentBuffId ?? null,
        childBuffId: relationship.childBuffId ?? relationship.buffId ?? null,
      });
    }
  }
  for (const [ruleId, source] of Object.entries(relationshipTable.sourcesByRuleId ?? {})) {
    for (const edge of asArray(source.uidEdges)) {
      if (Number(edge.uid) !== needle || edge.uidKind !== "buff") continue;
      edges.push({
        ruleId,
        edgeKind: edge.edgeKind ?? "",
        relationshipKind: edge.relationshipKind ?? "",
        role: edge.role ?? "",
        status: edge.status ?? "",
        parentBuffId: edge.parentUidKind === "buff" ? (edge.parentUid ?? null) : null,
        childBuffId: edge.uid ?? null,
      });
    }
  }
  return edges.sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function bridgeCandidates(observed, buffRows, recount, formulaTerms, valueProof, relationshipTable) {
  const byBuffId = new Map(buffRows.map((row) => [Number(row.Id ?? row.id), row]));
  const row = byBuffId.get(observed.buffId);
  const family = Math.floor(observed.buffId / 10);
  const observedLabel = localizedName(row);
  const observedDesign = designName(row);
  const observedBase = normalizeName(observedDesign || observedLabel);
  const directRuleIds = (recount.byBuffId?.[String(observed.buffId)] ?? [])
    .filter((ruleId) => {
      const summary = sourceSummary(ruleId, recount);
      return summary.sourceId && !summary.sourceId.startsWith("observed-buff:");
    })
    .sort();
  const directCandidates = directRuleIds.map((ruleId) => {
    const summary = sourceSummary(ruleId, recount);
    const relationshipEdges = relationshipEdgesForBuff(observed.buffId, relationshipTable)
      .filter((edge) => edge.ruleId === ruleId);
    return {
      ...summary,
      siblingBuffIds: [],
      siblingLabels: [],
      evidence: [...new Set([
        "direct-recount-mapping",
        ...relationshipEdges.map((edge) => edge.edgeKind || edge.relationshipKind).filter(Boolean),
      ])],
      relationshipEdges,
      strength: 10,
    };
  });
  const siblings = buffRows
    .filter((candidate) => {
      const id = positiveNumber(candidate.Id ?? candidate.id);
      return id !== null && id !== observed.buffId && Math.floor(id / 10) === family;
    })
    .sort((left, right) => Number(left.Id) - Number(right.Id));

  const candidatesByRuleId = new Map();
  for (const sibling of siblings) {
    const siblingId = Number(sibling.Id ?? sibling.id);
    const siblingBase = normalizeName(designName(sibling) || localizedName(sibling));
    for (const ruleId of recount.byBuffId?.[String(siblingId)] ?? []) {
      const summary = sourceSummary(ruleId, recount);
      if (!summary.sourceId || summary.sourceId.startsWith("observed-buff:")) continue;
      const current = candidatesByRuleId.get(ruleId) ?? {
        ...summary,
        siblingBuffIds: [],
        siblingLabels: [],
        evidence: [],
      };
      current.siblingBuffIds.push(siblingId);
      current.siblingLabels.push(localizedName(sibling) || designName(sibling));
      current.evidence.push(`same-buff-family:${family}`);
      if (observedBase && siblingBase && (observedBase === siblingBase || observedBase.startsWith(siblingBase) || siblingBase.startsWith(observedBase))) {
        current.evidence.push("design-name-prefix-match");
      }
      if (asArray(sibling.LinkedSourceRows).some((link) => link?.rowId === summary.sourceEntityId)) {
        current.evidence.push("linked-source-row-match");
      }
      candidatesByRuleId.set(ruleId, current);
    }
  }

  const formulaEntry = formulaTerms.entriesByKey?.[`buffs:${observed.buffId}`] ?? null;
  const valueEntry = valueProof.entriesByKey?.[`buffs:${observed.buffId}`] ?? null;
  const candidates = [...candidatesByRuleId.values()]
    .map((candidate) => {
      const evidence = [...new Set(candidate.evidence)].sort();
      const strength =
        (evidence.includes("same-buff-family") ? 2 : 0)
        + (evidence.includes("design-name-prefix-match") ? 2 : 0)
        + (evidence.includes("linked-source-row-match") ? 2 : 0)
        + (candidate.sourceKind === "season-talent-node" ? 1 : 0);
      return {
        ...candidate,
        siblingBuffIds: [...new Set(candidate.siblingBuffIds)].sort((left, right) => left - right),
        siblingLabels: [...new Set(candidate.siblingLabels)].sort(),
        evidence,
        strength,
      };
    })
    .concat(directCandidates)
    .sort((left, right) => right.strength - left.strength || left.ruleId.localeCompare(right.ruleId));

  const recommendation = directCandidates.length > 0
    ? "already-bridged-by-recount"
    : candidates.length === 1 && candidates[0].strength >= 4
    ? "bridge-as-runtime-state-child"
    : candidates.length > 1
      ? "manual-review-multiple-family-candidates"
      : "no-bridge-candidate";

  return {
    buffId: observed.buffId,
    observedRuleIds: observed.ruleIds,
    observedHits: observed.hits,
    affectedDamageIds: observed.damageIds,
    observedLabel,
    observedDesign,
    formulaReadiness: formulaEntry?.formulaReadiness ?? "",
    valueProofStatus: valueEntry?.valueProofStatus ?? "",
    stackPolicy: formulaEntry?.stackPolicy ?? valueEntry?.stackPolicy ?? "",
    runtimeProofRequired: formulaEntry?.runtimeProofRequired ?? valueEntry?.runtimeProofRequired ?? [],
    recommendation,
    directRuleIds,
    candidates,
  };
}

function buildMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Observed-Only Source Bridge Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Observed-only blocked buffs: ${report.summary.observedOnlyBlockedBuffs}`);
  lines.push(`- Already bridged by recount: ${report.summary.alreadyBridgedByRecount}`);
  lines.push(`- Bridge-as-state-child candidates: ${report.summary.bridgeAsRuntimeStateChild}`);
  lines.push(`- No candidate: ${report.summary.noBridgeCandidate}`);
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| Buff ID | Label | Hits | Formula Readiness | Value Status | Stack Policy | Recommendation | Best Candidate | Evidence |");
  lines.push("| ---: | --- | ---: | --- | --- | --- | --- | --- | --- |");
  for (const row of report.rows.slice(0, maxRows)) {
    const best = row.candidates[0];
    lines.push(
      [
        row.buffId,
        row.observedLabel || row.observedDesign,
        row.observedHits,
        row.formulaReadiness,
        row.valueProofStatus,
        row.stackPolicy,
        row.recommendation,
        best ? `${best.sourceName || best.sourceId} (${best.ruleId})` : "",
        best?.evidence?.join("<br>") ?? "",
      ]
        .map(markdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
const replayPath = args["replay-json"] ?? "DEV_exports/skill-replay-candidates-latest4.json";
const buffNamePath = args["buff-name"] ?? "parser-data/generated/BuffName.json";
const recountPath = args["recount-json"] ?? args["recount-table"] ?? "parser-data/generated/ModifierRecountTable.json";
const relationshipPath = args["relationship-json"] ?? args["relationship-table"] ?? "";
const formulaPath = args["formula-table"] ?? generatedDevOrExtractor("ModifierFormulaTermTable.json");
const valuePath = args["value-table"] ?? generatedDevOrExtractor("ModifierValueProofTable.json");
const outJson = args["out-json"] ?? "DEV_exports/observed-only-source-bridges-latest4.json";
const outMd = args["out-md"] ?? "DEV_exports/observed-only-source-bridges-latest4.md";
const maxRows = Number.parseInt(args["max-rows"] ?? "80", 10);

const replay = readJson(replayPath);
const buffRows = readJson(buffNamePath);
const recount = readJson(recountPath);
const relationshipTable = relationshipPath ? readJson(relationshipPath) : null;
const formulaTerms = readJson(formulaPath);
const valueProof = readJson(valuePath);

const observed = collectObservedBridgeKeys(replay);
const rows = observed.map((entry) => bridgeCandidates(entry, buffRows, recount, formulaTerms, valueProof, relationshipTable));
const summary = {
  observedOnlyBlockedBuffs: rows.length,
  alreadyBridgedByRecount: rows.filter((row) => row.recommendation === "already-bridged-by-recount").length,
  bridgeAsRuntimeStateChild: rows.filter((row) => row.recommendation === "bridge-as-runtime-state-child").length,
  noBridgeCandidate: rows.filter((row) => row.recommendation === "no-bridge-candidate").length,
};
const report = {
  generatedAt: new Date().toISOString(),
  inputs: { replayPath, buffNamePath, recountPath, relationshipPath, formulaPath, valuePath },
  summary,
  rows,
};

ensureDir(outJson);
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
ensureDir(outMd);
fs.writeFileSync(outMd, buildMarkdown(report, Number.isFinite(maxRows) ? maxRows : 80));

console.log(`Observed-only blocked buffs: ${summary.observedOnlyBlockedBuffs}`);
console.log(`Already bridged by recount: ${summary.alreadyBridgedByRecount}`);
console.log(`Bridge-as-runtime-state-child candidates: ${summary.bridgeAsRuntimeStateChild}`);
console.log(`No bridge candidate: ${summary.noBridgeCandidate}`);
console.log(`Output: ${outJson}`);
console.log(`Markdown: ${outMd}`);
