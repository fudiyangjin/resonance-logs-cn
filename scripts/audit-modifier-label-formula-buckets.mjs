#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_OUT_JSON = "DEV_exports/modifier-label-formula-bucket-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/modifier-label-formula-bucket-audit.md";
const DEFAULT_MAX_ROWS = 120;
const DEFAULT_VALUE_PROOF_CANDIDATES = [
  "DEV_generated/modifier/ModifierValueProofTable.json",
  "parser-data/generated/ModifierValueProofTable.json",
  "../BPSR-UID-Extractors/output/ModifierValueProofTable.json",
];
const DEFAULT_FORMULA_TERM_CANDIDATES = [
  "DEV_generated/modifier/ModifierFormulaTermTable.json",
  "parser-data/generated/ModifierFormulaTermTable.json",
  "../BPSR-UID-Extractors/output/ModifierFormulaTermTable.json",
];

function parseArgs(argv) {
  const options = {
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
    maxRows: DEFAULT_MAX_ROWS,
    valueProof: null,
    formulaTerms: null,
    recountTable: "parser-data/generated/ModifierRecountTable.json",
    relationshipTable: "parser-data/generated/ModifierRelationshipTable.json",
    displayTable: "parser-data/generated/ModifierDisplayTable.json",
    classificationTable: "parser-data/generated/ModifierClassificationTable.json",
    contributionTable: "parser-data/generated/ModifierContributionTable.json",
    buffNameTable: "parser-data/generated/BuffName.json",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    switch (arg) {
      case "--out-json":
        options.outJson = next();
        break;
      case "--out-md":
        options.outMd = next();
        break;
      case "--max-rows":
        options.maxRows = Math.max(1, Number(next()) || DEFAULT_MAX_ROWS);
        break;
      case "--value-proof":
        options.valueProof = next();
        break;
      case "--formula-terms":
        options.formulaTerms = next();
        break;
      case "--recount-table":
        options.recountTable = next();
        break;
      case "--relationship-table":
        options.relationshipTable = next();
        break;
      case "--display-table":
        options.displayTable = next();
        break;
      case "--classification-table":
        options.classificationTable = next();
        break;
      case "--contribution-table":
        options.contributionTable = next();
        break;
      case "--buff-name-table":
        options.buffNameTable = next();
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/audit-modifier-label-formula-buckets.mjs [options]

Build a dev-only truth table that joins modifier labels, UID provenance, formula
buckets, value hints, and runtime proof blockers before contribution math.

Options:
  --out-json <path>              JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>                Markdown report path. Default: ${DEFAULT_OUT_MD}
  --max-rows <count>             Max rows per Markdown section. Default: ${DEFAULT_MAX_ROWS}
  --value-proof <path>           ModifierValueProofTable.json path.
  --formula-terms <path>         ModifierFormulaTermTable.json path.
  --recount-table <path>         ModifierRecountTable.json path.
  --relationship-table <path>    ModifierRelationshipTable.json path.
  --display-table <path>         ModifierDisplayTable.json path.
  --classification-table <path>  ModifierClassificationTable.json path.
  --contribution-table <path>    ModifierContributionTable.json path.
  --buff-name-table <path>       BuffName.json path for observed-only debug labels.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    const resolved = resolveRepoPath(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!fs.existsSync(resolved)) {
    if (fallback !== null) return fallback;
    throw new Error(`Missing JSON file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function readOptionalGenerated(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!fs.existsSync(resolved)) return fallback;
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function countInto(map, key, amount = 1) {
  const safeKey = String(key ?? "unknown").trim() || "unknown";
  map.set(safeKey, (map.get(safeKey) ?? 0) + amount);
}

function countManyInto(map, values) {
  const list = uniqueStrings(asArray(values));
  if (list.length === 0) {
    countInto(map, "none");
    return;
  }
  for (const value of list) countInto(map, value);
}

function mapToSortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );
}

function preferredName(names, fallback = "") {
  const orderedLocales = ["en", "zh-CN", "zh-TW", "ja", "ko-KR", "fr", "de", "es", "pt-BR", "th", "id", "design", "und"];
  for (const locale of orderedLocales) {
    const value = names?.[locale];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const value of Object.values(names ?? {})) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function labelLooksRaw(label, sourceId) {
  const value = String(label ?? "").trim();
  if (!value) return true;
  if (/^(?:uid:|#|unknown\b|active buff\b|buff-source:|talent:|mrs:)/i.test(value)) return true;
  if (sourceId && value === String(sourceId)) return true;
  return false;
}

function generatedLabelCandidates(formulaEntries, valueEntries) {
  const candidates = [
    ...formulaEntries.map((entry) => ({
      label: entry.name,
      names: entry.names,
      category: entry.category,
      provenance: `ModifierFormulaTermTable:${entry.catalogFile ?? entry.category ?? "unknown"}`,
    })),
    ...valueEntries.map((entry) => ({
      label: entry.sourceLabel,
      names: entry.sourceNames,
      category: entry.category,
      provenance: `ModifierValueProofTable:${entry.category ?? "unknown"}`,
    })),
  ];

  return candidates
    .map((candidate) => {
      const label = preferredName(candidate.names, candidate.label);
      const ownerQualified = /\s+-\s+/.test(label);
      const categoryBonus = candidate.category === "battle-imagines" ? 2 : 0;
      return {
        ...candidate,
        label,
        score: (ownerQualified ? 10 : 0) + categoryBonus + Math.min(label.length / 100, 1),
      };
    })
    .filter((candidate) => candidate.label)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}

function chooseLabel({ display, classification, recount, formulaEntries, valueEntries, relationship, sourceRuleId, buffNameById }) {
  const buffNameCandidate = buffNameCandidateForSource(relationship?.sourceId, buffNameById);
  const generatedCandidates = generatedLabelCandidates(formulaEntries, valueEntries);
  const candidates = [
    {
      label: display?.sourceName,
      names: display?.sourceNames,
      provenance: "ModifierDisplayTable",
    },
    {
      label: classification?.sourceName,
      names: classification?.sourceNames,
      provenance: "ModifierClassificationTable",
    },
    {
      label: recount?.sourceName,
      names: recount?.sourceNames,
      provenance: "ModifierRecountTable",
    },
    ...generatedCandidates,
    buffNameCandidate,
    {
      label: relationship?.sourceId,
      provenance: "sourceId-fallback",
    },
    {
      label: sourceRuleId,
      provenance: "sourceRuleId-fallback",
    },
  ];

  for (const candidate of candidates.filter(Boolean)) {
    const label = preferredName(candidate.names, candidate.label);
    if (label) {
      return {
        label,
        labelProvenance: candidate.provenance,
        rawFallback: labelLooksRaw(label, relationship?.sourceId),
      };
    }
  }

  return {
    label: sourceRuleId,
    labelProvenance: "sourceRuleId-fallback",
    rawFallback: true,
  };
}

function buildBuffNameById(buffNameTable) {
  const entries = Array.isArray(buffNameTable) ? buffNameTable : Object.values(asObject(buffNameTable));
  return new Map(entries
    .filter((entry) => entry?.Id !== undefined && entry?.Id !== null)
    .map((entry) => [String(entry.Id), entry]));
}

function buffNameCandidateForSource(sourceId, buffNameById) {
  const match = String(sourceId ?? "").match(/^(?:observed-buff|active-buff|buff-source):(-?\d+)$/);
  if (!match) return null;
  const buffName = buffNameById.get(match[1]);
  if (!buffName) return null;
  return {
    label: preferredName(buffName.Names, buffName.NameDesign ?? buffName.DesignName ?? ""),
    names: buffName.Names,
    provenance: "BuffName:observed-buff",
  };
}

function indexEntriesBySourceRuleId(entriesByKey, keyName = "sourceRuleIds") {
  const map = new Map();
  for (const entry of Object.values(asObject(entriesByKey))) {
    for (const sourceRuleId of uniqueStrings([
      ...asArray(entry?.[keyName]),
      ...asArray(entry?.directSourceRuleIds),
      ...asArray(entry?.sourceRuleLinks).map((link) => link?.sourceRuleId),
      ...asArray(entry?.componentValueHints).map((hint) => hint?.sourceRuleId),
    ])) {
      const list = map.get(sourceRuleId) ?? [];
      list.push(entry);
      map.set(sourceRuleId, list);
    }
  }
  return map;
}

function categoryKeysForSourceId(sourceId) {
  const match = String(sourceId ?? "").match(/^([^:]+):(-?\d+)$/);
  if (!match) return [];
  const [, kind, uid] = match;
  const keys = [];
  if (kind === "observed-buff" || kind === "active-buff" || kind === "buff-source") {
    keys.push(`buffs:${uid}`);
    keys.push(`battle-imagines:${uid}`);
    keys.push(`skills:${uid}`);
  } else if (kind === "talent") {
    keys.push(`talents:${uid}`);
  } else if (kind === "season-talent-node" || kind === "season-rogue-entry") {
    keys.push(`seasonal-talents:${uid}`);
  } else if (kind === "phantom-factor") {
    keys.push(`factors:${uid}`);
  } else if (kind === "item") {
    keys.push(`items:${uid}`);
  }
  return keys;
}

function entriesForSourceId(entriesByKey, sourceId) {
  const table = asObject(entriesByKey);
  return categoryKeysForSourceId(sourceId)
    .map((key) => table[key])
    .filter(Boolean);
}

function mergeEntryLists(...lists) {
  const byKey = new Map();
  for (const entry of lists.flat()) {
    if (!entry) continue;
    byKey.set(entry.key ?? `${entry.category}:${entry.uid}`, entry);
  }
  return [...byKey.values()];
}

function compactValueHint(hint) {
  const values = asArray(hint?.values);
  return {
    componentKey: hint?.componentKey ?? "",
    label: hint?.label ?? "",
    effectClass: hint?.effectClass ?? "",
    stat: hint?.stat ?? "",
    direction: hint?.direction ?? "",
    contributionScope: hint?.contributionScope ?? "",
    valueResolution: hint?.valueResolution ?? "",
    tierSelectionRequired: Boolean(hint?.tierSelectionRequired),
    formulaTermIds: uniqueStrings(hint?.formulaTermIds),
    contributionGroups: uniqueStrings(hint?.contributionGroups),
    scopes: uniqueStrings(values.map((value) => value?.scope)),
    valueCount: values.length,
    sampleValues: values.slice(0, 8).map((value) => ({
      scope: value?.scope ?? "",
      value: value?.value ?? null,
      decimalValue: value?.decimalValue ?? null,
      unit: value?.unit ?? "",
      rawText: value?.rawText ?? "",
      tier: value?.tier ?? null,
      tierKind: value?.tierKind ?? "",
      key: value?.key ?? "",
    })),
  };
}

function compactValueSelector(selector) {
  return {
    kind: selector?.kind ?? "",
    status: selector?.status ?? "",
    componentKey: selector?.componentKey ?? "",
    valueResolution: selector?.valueResolution ?? "",
    candidateCount: selector?.candidateCount ?? 0,
    scopes: uniqueStrings(selector?.scopes),
  };
}

function collectComponentValueHints(formulaEntries) {
  const hints = [];
  for (const entry of formulaEntries) {
    for (const hint of asArray(entry?.componentValueHints)) {
      hints.push(compactValueHint(hint));
    }
  }
  return hints;
}

function collectValueSelectors(valueEntries) {
  const selectors = [];
  for (const entry of valueEntries) {
    for (const selector of asArray(entry?.valueSelectors)) {
      selectors.push(compactValueSelector(selector));
    }
  }
  return selectors;
}

function hasAnyText(values, patterns) {
  const haystack = uniqueStrings(values).join("\n").toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

function classifyNextActions(row) {
  const actions = [];
  const blockers = row.blockerHints;
  const proof = row.runtimeProofRequired;
  const readiness = row.formulaReadiness;
  const valueStatus = row.valueProofStatus;
  const selectors = row.valueSelectors.map((selector) => selector.kind);
  let nonFormulaAuditOnly = false;

  if (row.rawFallbackLabel) actions.push("static-label-or-source-bridge");

  if (row.formulaBuckets.length === 0) {
    if (
      row.reportPolicy === "debug-only"
      || hasAnyText(readiness, ["identity-only", "overlap-only", "non-damage-or-support", "formula-replay-required"])
      || hasAnyText(blockers, ["missing-formula-bucket"])
    ) {
      actions.push("audit-only-or-non-formula-row");
      nonFormulaAuditOnly = true;
    } else {
      actions.push("missing-static-formula-bucket");
    }
  }

  if (row.formulaBuckets.length > 0 && row.valueProofKeys.length === 0) {
    actions.push("missing-static-value-proof-row");
  }

  if (
    hasAnyText(valueStatus, ["missing-value-data"])
    || hasAnyText(blockers, ["missing-value-data", "missing-component-value-hint"])
  ) {
    if (!nonFormulaAuditOnly) actions.push("missing-static-component-value-data");
  }

  if (
    hasAnyText(valueStatus, ["needs-value-selection"])
    || hasAnyText(blockers, ["needs-value-selection", "ambiguous-value-selection-required", "ambiguous-scoped-value"])
  ) {
    actions.push("static-value-selection-review");
  }

  if (
    hasAnyText(readiness, ["needs-component-classification"])
    || hasAnyText(blockers, ["needs-component-classification"])
  ) {
    actions.push("static-component-classification-review");
  }

  if (
    hasAnyText(valueStatus, ["non-damage-or-support"])
    || hasAnyText(blockers, ["non-damage-or-support"])
    || hasAnyText(readiness, ["non-damage-or-support"])
  ) {
    actions.push("support-or-defensive-routing");
  }

  if (
    hasAnyText(valueStatus, ["needs-seasonal-factor-selector"])
    || hasAnyText(blockers, ["needs-seasonal-factor-selector"])
    || hasAnyText(selectors, ["seasonal-factor-loadout-selector"])
  ) {
    actions.push("runtime-selected-seasonal-factor");
  }

  if (
    hasAnyText(valueStatus, ["needs-scope-value", "value-ready-runtime-scope"])
    || hasAnyText(blockers, ["needs-scope-value", "value-ready-runtime-scope"])
    || hasAnyText(proof, ["owner", "party", "source-scope", "target-scope"])
  ) {
    actions.push("runtime-owner-party-target-scope");
  }

  if (
    hasAnyText(valueStatus, ["needs-value-ladder-selector", "needs-value-ramp-model", "needs-threshold-model"])
    || hasAnyText(blockers, ["needs-value-ladder-selector", "needs-value-ramp-model", "needs-threshold-model", "needs-skill-stage-selector"])
    || hasAnyText(selectors, ["runtime-value-ladder", "skill-stage-selector", "threshold-counter-selector"])
    || hasAnyText(proof, ["stack", "tier", "stage"])
  ) {
    actions.push("runtime-stack-tier-stage-selector");
  }

  if (
    hasAnyText(valueStatus, ["needs-timing-model", "needs-hit-count-model"])
    || hasAnyText(blockers, ["needs-timing-model", "needs-hit-count-model"])
    || hasAnyText(selectors, ["timing-cadence-model", "hit-count-model"])
    || hasAnyText(proof, ["cast", "cooldown", "duration", "timeline", "hit-count"])
  ) {
    actions.push("runtime-timing-hit-model");
  }

  if (
    hasAnyText(valueStatus, ["needs-expected-model"])
    || hasAnyText(blockers, ["needs-expected-model"])
    || hasAnyText(row.formulaBuckets, ["critical", "luckyEnhancement"])
  ) {
    actions.push("expected-value-model");
  }

  if (
    hasAnyText(valueStatus, ["needs-stat-conversion-model"])
    || hasAnyText(blockers, ["needs-stat-conversion-model"])
    || hasAnyText(selectors, ["stat-conversion-model"])
    || hasAnyText(proof, ["attacker stat snapshot", "attacker armor/defense snapshot", "damage row ATK/MATK lane"])
  ) {
    actions.push("runtime-stat-conversion-model");
  }

  if (
    hasAnyText(valueStatus, ["needs-target-window-proof"])
    || hasAnyText(blockers, ["needs-target-window-proof", "missing-target-side-window", "target-side-window-not-linked-to-source"])
    || hasAnyText(proof, ["target-window", "target-side", "debuff"])
  ) {
    actions.push("runtime-target-window-proof");
  }

  if (
    hasAnyText(valueStatus, ["needs-value-polarity"])
    || hasAnyText(blockers, ["needs-value-polarity"])
  ) {
    actions.push("runtime-value-polarity");
  }

  if (
    row.formulaMathStatus === "packet-exact-produced-row"
    || hasAnyText(valueStatus, ["packet-exact-value-not-required"])
    || hasAnyText(blockers, ["packet-exact-produced-damage"])
    || hasAnyText(readiness, ["packet-exact-produced-damage"])
  ) {
    actions.push("packet-exact-produced-damage-truth");
  }

  if (row.formulaMathStatus === "value-ready-needs-runtime-proof") {
    actions.push("runtime-source-window-proof");
  }

  if (actions.length === 0) actions.push("review-unclassified");
  return [...new Set(actions)];
}

function summarizeUidEdges(uidEdges) {
  const byKind = new Map();
  const byRole = new Map();
  const samples = [];
  for (const edge of asArray(uidEdges)) {
    countInto(byKind, edge?.edgeKind ?? edge?.uidKind ?? "unknown");
    countInto(byRole, edge?.role ?? "unknown");
    if (samples.length < 16) {
      samples.push({
        edgeKind: edge?.edgeKind ?? "",
        uidKind: edge?.uidKind ?? "",
        uid: edge?.uid ?? null,
        role: edge?.role ?? "",
        source: edge?.source ?? "",
        status: edge?.status ?? "",
      });
    }
  }
  return {
    count: asArray(uidEdges).length,
    byKind: mapToSortedObject(byKind),
    byRole: mapToSortedObject(byRole),
    samples,
  };
}

function primaryUidFromRelationship(relationship, recount) {
  const sourceEntityId = recount?.sourceEntityId ?? relationship?.sourceEntityId;
  if (sourceEntityId !== undefined && sourceEntityId !== null) {
    return {
      uid: String(sourceEntityId),
      uidKind: recount?.sourceType ?? relationship?.sourceType ?? "source-entity",
    };
  }

  for (const edge of asArray(relationship?.uidEdges)) {
    if (["source", "runtime", "owner"].includes(edge?.role) && edge?.uid !== undefined && edge?.uid !== null) {
      return {
        uid: String(edge.uid),
        uidKind: edge.uidKind ?? "unknown",
      };
    }
  }

  return {
    uid: String(relationship?.sourceId ?? ""),
    uidKind: "source-id",
  };
}

function buildRow({
  sourceRuleId,
  relationship,
  recount,
  display,
  classification,
  contribution,
  formulaEntries,
  valueEntries,
  buffNameById,
}) {
  const label = chooseLabel({
    display,
    classification,
    recount,
    formulaEntries,
    valueEntries,
    relationship,
    sourceRuleId,
    buffNameById,
  });
  const primaryUid = primaryUidFromRelationship(relationship, recount);

  const formulaBuckets = uniqueStrings([
    ...asArray(contribution?.formulaZoneIds),
    ...asArray(recount?.formulaZoneIds),
    ...formulaEntries.flatMap((entry) => asArray(entry?.formulaZoneIds)),
    ...valueEntries.flatMap((entry) => asArray(entry?.formulaZoneIds)),
  ]);
  const formulaTerms = uniqueStrings([
    ...asArray(contribution?.formulaTermIds),
    ...formulaEntries.flatMap((entry) => asArray(entry?.formulaTerms)),
    ...formulaEntries.flatMap((entry) => asArray(entry?.componentValueHints).flatMap((hint) => asArray(hint?.formulaTermIds))),
  ]);
  const componentClasses = uniqueStrings([
    ...asArray(classification?.componentClasses),
    ...asArray(contribution?.componentClasses),
    ...asArray(recount?.componentClasses),
    ...formulaEntries.flatMap((entry) => asArray(entry?.componentValueHints).map((hint) => hint?.effectClass)),
  ]);
  const contributionGroups = uniqueStrings([
    ...asArray(classification?.contributionGroups),
    ...asArray(contribution?.contributionGroups),
    ...asArray(recount?.contributionGroups),
    ...formulaEntries.flatMap((entry) => asArray(entry?.componentValueHints).flatMap((hint) => asArray(hint?.contributionGroups))),
  ]);
  const runtimeProofRequired = uniqueStrings([
    ...asArray(contribution?.requiredRuntimeEvidence),
    ...asArray(recount?.attributionModel?.requiredRuntimeEvidence),
    ...formulaEntries.flatMap((entry) => asArray(entry?.runtimeProofRequired)),
    ...valueEntries.flatMap((entry) => asArray(entry?.runtimeProofRequired)),
    ...valueEntries.flatMap((entry) => asArray(entry?.proofRequirements)),
  ]);
  const blockerHints = uniqueStrings([
    ...valueEntries.map((entry) => entry?.valueProofStatus),
    ...valueEntries.flatMap((entry) => asArray(entry?.valueBlockers)),
    ...formulaEntries.map((entry) => entry?.formulaReadiness),
    contribution?.contributionTier && contribution.contributionTier !== "exact" ? `contribution-tier:${contribution.contributionTier}` : "",
    contribution?.contributionMode && contribution.contributionMode !== "exact-produced-damage" ? `contribution-mode:${contribution.contributionMode}` : "",
    formulaBuckets.length === 0 ? "missing-formula-bucket" : "",
    valueEntries.length === 0 ? "missing-value-proof-row" : "",
  ]);

  const formulaReadiness = uniqueStrings([
    ...formulaEntries.map((entry) => entry?.formulaReadiness),
    ...valueEntries.map((entry) => entry?.formulaReadiness),
    contribution?.contributionStatus,
    recount?.contributionStatus,
  ]);
  const valueProofStatus = uniqueStrings(valueEntries.map((entry) => entry?.valueProofStatus));
  const scopeKinds = uniqueStrings([
    ...formulaEntries.flatMap((entry) => asArray(entry?.scopeKinds)),
    ...valueEntries.flatMap((entry) => asArray(entry?.scopeKinds)),
  ]);
  const stackPolicies = uniqueStrings([
    ...formulaEntries.map((entry) => entry?.stackPolicy),
    ...valueEntries.map((entry) => entry?.stackPolicy),
  ]);
  const descriptionSources = uniqueStrings([
    ...formulaEntries.flatMap((entry) => asArray(entry?.descriptionRef?.sourceFiles)),
    ...formulaEntries.map((entry) => entry?.catalogFile),
  ]);

  const labelStatus = label.rawFallback
    ? "raw-or-fallback-label"
    : formulaBuckets.length === 0
      ? "labeled-no-formula-bucket"
      : "labeled-with-formula-bucket";
  const formulaMathStatus = contribution?.contributionMode === "exact-produced-damage"
    ? "packet-exact-produced-row"
    : valueProofStatus.some((status) => status === "value-ready" || status === "value-ready-runtime-scope")
      ? "value-ready-needs-runtime-proof"
      : blockerHints.length > 0
        ? "blocked-or-audit-only"
        : "unclassified";

  const row = {
    sourceRuleId,
    sourceId: relationship?.sourceId ?? recount?.sourceId ?? "",
    primaryUid: primaryUid.uid,
    primaryUidKind: primaryUid.uidKind,
    label: label.label,
    labelProvenance: label.labelProvenance,
    labelStatus,
    rawFallbackLabel: label.rawFallback,
    sourceKind: classification?.sourceKind ?? recount?.sourceKind ?? "",
    sourceType: classification?.sourceType ?? recount?.sourceType ?? "",
    sourceEntityId: classification?.sourceEntityId ?? recount?.sourceEntityId ?? null,
    runtimeDetection: classification?.runtimeDetection ?? recount?.runtimeDetection ?? "",
    reportPolicy: classification?.reportPolicy ?? recount?.reportPolicy ?? "",
    rowModel: classification?.rowModel ?? classification?.rowPolicy ?? recount?.rowPolicy ?? "",
    primaryRole: classification?.primaryRole ?? "",
    reportDomains: uniqueStrings(classification?.reportDomains),
    offensiveKind: classification?.offensiveKind ?? "",
    contributionStatus: classification?.contributionStatus ?? contribution?.contributionStatus ?? recount?.contributionStatus ?? "",
    contributionMode: contribution?.contributionMode ?? "",
    contributionTier: contribution?.contributionTier ?? "",
    confidence: contribution?.confidence ?? "",
    formulaReadiness,
    formulaMathStatus,
    formulaBuckets,
    formulaTerms,
    componentClasses,
    contributionGroups,
    scopeKinds,
    stackPolicies,
    valueProofStatus,
    valueResolution: uniqueStrings([
      ...formulaEntries.map((entry) => entry?.valueResolution),
      ...valueEntries.map((entry) => entry?.valueResolution),
    ]),
    componentValueHints: collectComponentValueHints(formulaEntries),
    valueSelectors: collectValueSelectors(valueEntries),
    runtimeProofRequired,
    blockerHints,
    descriptionSources,
    buffIds: uniqueStrings([
      ...asArray(classification?.buffIds),
      ...asArray(recount?.buffIds),
    ]),
    targetDamageIds: asArray(classification?.targetDamageIds ?? recount?.targetDamageIds).slice(0, 24),
    targetRecountIds: asArray(classification?.targetRecountIds ?? recount?.targetRecountIds).slice(0, 24),
    talentOwnership: relationship?.talentOwnership ?? recount?.talentOwnership ?? null,
    uidEdges: summarizeUidEdges(relationship?.uidEdges),
    formulaEntryKeys: uniqueStrings(formulaEntries.map((entry) => entry?.key)),
    valueProofKeys: uniqueStrings(valueEntries.map((entry) => entry?.key)),
  };

  row.nextActions = classifyNextActions(row);
  row.nextActionPrimary = row.nextActions[0] ?? "review-unclassified";
  return row;
}

function buildReport(options) {
  const valueProofPath = options.valueProof
    ? resolveRepoPath(options.valueProof)
    : firstExistingPath(DEFAULT_VALUE_PROOF_CANDIDATES);
  const formulaTermsPath = options.formulaTerms
    ? resolveRepoPath(options.formulaTerms)
    : firstExistingPath(DEFAULT_FORMULA_TERM_CANDIDATES);
  if (!valueProofPath) throw new Error("Unable to find ModifierValueProofTable.json");
  if (!formulaTermsPath) throw new Error("Unable to find ModifierFormulaTermTable.json");

  const valueProof = readJson(valueProofPath);
  const formulaTerms = readJson(formulaTermsPath);
  const recountTable = readJson(options.recountTable);
  const relationshipTable = readJson(options.relationshipTable);
  const displayTable = readOptionalGenerated(options.displayTable, { sourcesByRuleId: {} });
  const classificationTable = readOptionalGenerated(options.classificationTable, { sourcesByRuleId: {} });
  const contributionTable = readOptionalGenerated(options.contributionTable, { sourcesByRuleId: {} });
  const buffNameTable = readOptionalGenerated(options.buffNameTable, []);
  const buffNameById = buildBuffNameById(buffNameTable);

  const formulaByRule = indexEntriesBySourceRuleId(formulaTerms.entriesByKey);
  const valueByRule = indexEntriesBySourceRuleId(valueProof.entriesByKey);

  const rows = Object.entries(asObject(relationshipTable.sourcesByRuleId))
    .map(([sourceRuleId, relationship]) => {
      const sourceId = relationship?.sourceId;
      return buildRow({
        sourceRuleId,
        relationship,
        recount: recountTable.sourcesById?.[sourceId],
        display: displayTable.sourcesByRuleId?.[sourceRuleId],
        classification: classificationTable.sourcesByRuleId?.[sourceRuleId],
        contribution: contributionTable.sourcesByRuleId?.[sourceRuleId],
        formulaEntries: mergeEntryLists(
          formulaByRule.get(sourceRuleId) ?? [],
          entriesForSourceId(formulaTerms.entriesByKey, sourceId),
        ),
        valueEntries: mergeEntryLists(
          valueByRule.get(sourceRuleId) ?? [],
          entriesForSourceId(valueProof.entriesByKey, sourceId),
        ),
        buffNameById,
      });
    })
    .sort((left, right) =>
      Number(right.rawFallbackLabel) - Number(left.rawFallbackLabel)
      || Number(right.formulaBuckets.length === 0) - Number(left.formulaBuckets.length === 0)
      || left.label.localeCompare(right.label)
      || left.sourceRuleId.localeCompare(right.sourceRuleId),
    );

  const counters = {
    labelStatus: new Map(),
    labelProvenance: new Map(),
    sourceKind: new Map(),
    sourceType: new Map(),
    reportPolicy: new Map(),
    formulaMathStatus: new Map(),
    formulaReadiness: new Map(),
    valueProofStatus: new Map(),
    formulaBuckets: new Map(),
    contributionTier: new Map(),
    proofRequirements: new Map(),
    blockers: new Map(),
    nextActions: new Map(),
    nextActionPrimary: new Map(),
  };

  for (const row of rows) {
    countInto(counters.labelStatus, row.labelStatus);
    countInto(counters.labelProvenance, row.labelProvenance);
    countInto(counters.sourceKind, row.sourceKind || "unknown");
    countInto(counters.sourceType, row.sourceType || "unknown");
    countInto(counters.reportPolicy, row.reportPolicy || "unknown");
    countInto(counters.formulaMathStatus, row.formulaMathStatus);
    countManyInto(counters.formulaReadiness, row.formulaReadiness);
    countManyInto(counters.valueProofStatus, row.valueProofStatus);
    countManyInto(counters.formulaBuckets, row.formulaBuckets);
    countInto(counters.contributionTier, row.contributionTier || "none");
    countManyInto(counters.proofRequirements, row.runtimeProofRequired);
    countManyInto(counters.blockers, row.blockerHints);
    countManyInto(counters.nextActions, row.nextActions);
    countInto(counters.nextActionPrimary, row.nextActionPrimary);
  }

  const stats = {
    generatedAt: new Date().toISOString(),
    sourceRows: rows.length,
    generatedSources: {
      valueProofPath: path.relative(repoRoot, valueProofPath),
      formulaTermsPath: path.relative(repoRoot, formulaTermsPath),
      recountTablePath: options.recountTable,
      relationshipTablePath: options.relationshipTable,
      displayTablePath: options.displayTable,
      classificationTablePath: options.classificationTable,
      contributionTablePath: options.contributionTable,
      buffNameTablePath: options.buffNameTable,
    },
    labelStatus: mapToSortedObject(counters.labelStatus),
    labelProvenance: mapToSortedObject(counters.labelProvenance),
    sourceKind: mapToSortedObject(counters.sourceKind),
    sourceType: mapToSortedObject(counters.sourceType),
    reportPolicy: mapToSortedObject(counters.reportPolicy),
    formulaMathStatus: mapToSortedObject(counters.formulaMathStatus),
    formulaReadiness: mapToSortedObject(counters.formulaReadiness),
    valueProofStatus: mapToSortedObject(counters.valueProofStatus),
    formulaBuckets: mapToSortedObject(counters.formulaBuckets),
    contributionTier: mapToSortedObject(counters.contributionTier),
    topProofRequirements: Object.fromEntries(Object.entries(mapToSortedObject(counters.proofRequirements)).slice(0, 40)),
    topBlockers: Object.fromEntries(Object.entries(mapToSortedObject(counters.blockers)).slice(0, 40)),
    nextActions: mapToSortedObject(counters.nextActions),
    nextActionPrimary: mapToSortedObject(counters.nextActionPrimary),
  };

  return {
    schemaVersion: 1,
    description: "Dev-only modifier label/formula bucket truth table. This does not change parser/runtime behavior.",
    stats,
    formulaZoneContract: formulaTerms.formulaZoneContract ?? contributionTable.formulaZoneContract ?? null,
    rows,
  };
}

function markdownTable(headers, rows) {
  const escapeCell = (value) => String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => escapeCell(row[header])).join(" | ")} |`),
  ].join("\n");
}

function compactList(values, limit = 5) {
  const list = uniqueStrings(values);
  if (list.length <= limit) return list.join(", ");
  return `${list.slice(0, limit).join(", ")} (+${list.length - limit})`;
}

function objectRows(object, keyName, valueName, limit) {
  return Object.entries(object ?? {})
    .slice(0, limit)
    .map(([key, value]) => ({ [keyName]: key, [valueName]: value }));
}

function rowSummary(row) {
  return {
    label: row.label,
    sourceId: row.sourceId,
    rule: row.sourceRuleId,
    provenance: row.labelProvenance,
    type: compactList([row.sourceType, row.sourceKind].filter(Boolean), 2),
    buckets: compactList(row.formulaBuckets),
    readiness: compactList(row.formulaReadiness),
    value: compactList(row.valueProofStatus),
    next: compactList(row.nextActions, 4),
    blockers: compactList(row.blockerHints, 4),
    proof: compactList(row.runtimeProofRequired, 4),
  };
}

function buildMarkdown(report, maxRows) {
  const { stats } = report;
  const rawRows = report.rows.filter((row) => row.rawFallbackLabel);
  const missingBucketRows = report.rows.filter((row) => row.formulaBuckets.length === 0);
  const blockedRows = report.rows.filter((row) => row.formulaMathStatus === "blocked-or-audit-only");
  const readyRows = report.rows.filter((row) => row.formulaMathStatus !== "blocked-or-audit-only");

  const sections = [
    "# Modifier Label / Formula Bucket Audit",
    "",
    "Dev-only report. It joins generated labels, UID edges, formula buckets, value hints, and runtime proof blockers before any parser-side contribution math.",
    "",
    "## Summary",
    "",
    `- Generated at: ${stats.generatedAt}`,
    `- Source rows: ${stats.sourceRows}`,
    `- Value proof table: ${stats.generatedSources.valueProofPath}`,
    `- Formula term table: ${stats.generatedSources.formulaTermsPath}`,
    "",
    "## Label Status",
    "",
    markdownTable(["status", "count"], objectRows(stats.labelStatus, "status", "count", maxRows)),
    "",
    "## Formula Math Status",
    "",
    markdownTable(["status", "count"], objectRows(stats.formulaMathStatus, "status", "count", maxRows)),
    "",
    "## Formula Buckets",
    "",
    markdownTable(["bucket", "count"], objectRows(stats.formulaBuckets, "bucket", "count", maxRows)),
    "",
    "## Value Proof Status",
    "",
    markdownTable(["status", "count"], objectRows(stats.valueProofStatus, "status", "count", maxRows)),
    "",
    "## Top Blockers",
    "",
    markdownTable(["blocker", "count"], objectRows(stats.topBlockers, "blocker", "count", maxRows)),
    "",
    "## Next Actions",
    "",
    markdownTable(["action", "count"], objectRows(stats.nextActions, "action", "count", maxRows)),
    "",
    "## Primary Next Action",
    "",
    markdownTable(["action", "count"], objectRows(stats.nextActionPrimary, "action", "count", maxRows)),
    "",
    "## Raw / Fallback Labels",
    "",
    rawRows.length
      ? markdownTable(["label", "sourceId", "rule", "provenance", "type", "buckets", "readiness", "value", "next", "blockers", "proof"], rawRows.slice(0, maxRows).map(rowSummary))
      : "_None._",
    "",
    "## Missing Formula Buckets",
    "",
    missingBucketRows.length
      ? markdownTable(["label", "sourceId", "rule", "provenance", "type", "buckets", "readiness", "value", "next", "blockers", "proof"], missingBucketRows.slice(0, maxRows).map(rowSummary))
      : "_None._",
    "",
    "## Blocked Rows Sample",
    "",
    blockedRows.length
      ? markdownTable(["label", "sourceId", "rule", "provenance", "type", "buckets", "readiness", "value", "next", "blockers", "proof"], blockedRows.slice(0, maxRows).map(rowSummary))
      : "_None._",
    "",
    "## Ready / Exact Rows Sample",
    "",
    readyRows.length
      ? markdownTable(["label", "sourceId", "rule", "provenance", "type", "buckets", "readiness", "value", "next", "blockers", "proof"], readyRows.slice(0, maxRows).map(rowSummary))
      : "_None._",
  ];

  return `${sections.join("\n")}\n`;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(resolveRepoPath(filePath)), { recursive: true });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  ensureParentDir(options.outJson);
  ensureParentDir(options.outMd);
  fs.writeFileSync(resolveRepoPath(options.outJson), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolveRepoPath(options.outMd), buildMarkdown(report, options.maxRows));
  console.log(JSON.stringify({
    outJson: options.outJson,
    outMd: options.outMd,
    sourceRows: report.stats.sourceRows,
    labelStatus: report.stats.labelStatus,
    formulaMathStatus: report.stats.formulaMathStatus,
    topFormulaBuckets: Object.fromEntries(Object.entries(report.stats.formulaBuckets).slice(0, 12)),
    topNextActions: Object.fromEntries(Object.entries(report.stats.nextActions).slice(0, 12)),
  }, null, 2));
}

main();
