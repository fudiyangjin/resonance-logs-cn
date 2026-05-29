#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const DEFAULT_LATEST_INPUTS = 3;
const DEFAULT_MAX_ROWS = 80;
const DEFAULT_STABILITY_LIMIT = 0.15;
const DEFAULT_TOGGLE_ERROR_LIMIT = 0.05;
const DEFAULT_MIN_TOGGLE_HITS = 20;
const DEFAULT_CHANCE_ERROR_LIMIT = 0.025;
const DEFAULT_MIN_CHANCE_TOGGLE_HITS = 100;
const DEFAULT_ATTACK_ERROR_LIMIT = 0.05;
const DEFAULT_MIN_ATTACK_TOGGLE_HITS = 20;

const ATTR_ATTACK_POWER = 50;
const ATTR_CRIT_MULTIPLIER = 0x2b66;

const STRIPPABLE_PERCENT_TERMS = new Set(["genericDamagePct", "elementalDamagePct", "versatilityDamagePct"]);
const CHANCE_COMPONENT_KEYS = new Set(["critical-rate", "lucky-rate"]);
const PROBABILISTIC_CHANCE_COMPONENT_KEYS = new Set(["critical-rate"]);
const CRIT_DAMAGE_COMPONENT_KEYS = new Set(["critical-damage"]);
const STAT_COMPONENT_KEYS = new Set(["atk", "matk", "attack", "primary-attack"]);

function parseArgs(argv) {
  const options = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    outJson: path.join(repoRoot, "DEV_exports", "skill-modifier-strip-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "skill-modifier-strip-audit.md"),
    outDerivedJson: path.join(repoRoot, "DEV_exports", "skill-modifier-derived-contributions.json"),
    outDerivedMd: path.join(repoRoot, "DEV_exports", "skill-modifier-derived-contributions.md"),
    maxRows: DEFAULT_MAX_ROWS,
    stabilityLimit: DEFAULT_STABILITY_LIMIT,
    toggleErrorLimit: DEFAULT_TOGGLE_ERROR_LIMIT,
    minToggleHits: DEFAULT_MIN_TOGGLE_HITS,
    chanceErrorLimit: DEFAULT_CHANCE_ERROR_LIMIT,
    minChanceToggleHits: DEFAULT_MIN_CHANCE_TOGGLE_HITS,
    attackErrorLimit: DEFAULT_ATTACK_ERROR_LIMIT,
    minAttackToggleHits: DEFAULT_MIN_ATTACK_TOGGLE_HITS,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    switch (arg) {
      case "--input":
        options.inputs.push(path.resolve(next()));
        break;
      case "--latest":
        options.latest = Number(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--out-derived-json":
        options.outDerivedJson = path.resolve(next());
        break;
      case "--out-derived-md":
        options.outDerivedMd = path.resolve(next());
        break;
      case "--max-rows":
        options.maxRows = Number(next());
        break;
      case "--stability-limit":
        options.stabilityLimit = Number(next());
        break;
      case "--toggle-error-limit":
        options.toggleErrorLimit = Number(next());
        break;
      case "--min-toggle-hits":
        options.minToggleHits = Number(next());
        break;
      case "--chance-error-limit":
        options.chanceErrorLimit = Number(next());
        break;
      case "--min-chance-toggle-hits":
        options.minChanceToggleHits = Number(next());
        break;
      case "--attack-error-limit":
        options.attackErrorLimit = Number(next());
        break;
      case "--min-attack-toggle-hits":
        options.minAttackToggleHits = Number(next());
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Skill Active Modifier Strip Audit

Usage:
  node scripts/audit-skill-modifier-strip.mjs [options]

Options:
  --input <file>          Modifier entity export. Repeatable.
  --latest <count>        When --input is omitted, scan latest DEV_exports/modifier-entity-*.json files. Default: ${DEFAULT_LATEST_INPUTS}
  --out-json <path>       JSON report path. Default: DEV_exports/skill-modifier-strip-audit.json
  --out-md <path>         Markdown report path. Default: DEV_exports/skill-modifier-strip-audit.md
  --out-derived-json <path> Compact derived contribution table path. Default: DEV_exports/skill-modifier-derived-contributions.json
  --out-derived-md <path> Compact derived contribution Markdown path. Default: DEV_exports/skill-modifier-derived-contributions.md
  --max-rows <count>      Max Markdown rows per table. Default: ${DEFAULT_MAX_ROWS}
  --stability-limit <n>   Max p95-p05/avg spread for replay-ready rows. Default: ${DEFAULT_STABILITY_LIMIT}
  --toggle-error-limit <n> Max abs error between observed and expected toggle delta. Default: ${DEFAULT_TOGGLE_ERROR_LIMIT}
  --min-toggle-hits <n>    Minimum active and inactive hits for toggle validation. Default: ${DEFAULT_MIN_TOGGLE_HITS}
  --chance-error-limit <n> Max abs error for observed active/inactive crit-rate delta. Default: ${DEFAULT_CHANCE_ERROR_LIMIT}
  --min-chance-toggle-hits <n> Minimum active and inactive hits for chance validation. Default: ${DEFAULT_MIN_CHANCE_TOGGLE_HITS}
  --attack-error-limit <n> Max abs error for observed active/inactive attack snapshot delta. Default: ${DEFAULT_ATTACK_ERROR_LIMIT}
  --min-attack-toggle-hits <n> Minimum active and inactive hits for attack snapshot validation. Default: ${DEFAULT_MIN_ATTACK_TOGGLE_HITS}
  --help                  Show this help.

Notes:
  This strips only direct percent replay candidates with unambiguous component
  values. Crit damage, crit rate, and attack-stat modifiers are separate proof
  lanes that require captured snapshot validation before promotion.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatNumber(value, digits = 0) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(number);
}

function formatPct(value, digits = 1) {
  const number = finiteNumber(value);
  if (number === null) return "";
  return `${(number * 100).toFixed(digits)}%`;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function latestModifierEntityInputs(options) {
  const dir = path.join(repoRoot, "DEV_exports");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^modifier-entity-.+\.json$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .slice(0, Math.max(0, options.latest));
}

function attrRawValue(attr) {
  if (!attr || typeof attr !== "object") return null;
  const direct = attr.valueInt ?? attr.valueFloat ?? attr.Int ?? attr.Float;
  if (direct !== undefined && direct !== null) return finiteNumber(direct);
  if (attr.value && typeof attr.value === "object") {
    return finiteNumber(attr.value.Int ?? attr.value.Float ?? attr.value.Double);
  }
  return finiteNumber(attr.value);
}

function attrValue(attrs, attrId) {
  for (const attr of asArray(attrs)) {
    if (finiteNumber(attr?.attrId) === attrId) return attrRawValue(attr);
  }
  return null;
}

function decimalAttrValue(attrs, attrId) {
  const raw = attrValue(attrs, attrId);
  return raw === null ? null : raw / 10000;
}

function normalizedCritMultiplier(sample) {
  if (!sample?.isCrit) return 1;
  const value = critMultiplierSnapshot(sample);
  return value !== null && value > 1 ? value : null;
}

function critMultiplierSnapshot(sample) {
  const value = decimalAttrValue(sample.attackerAttrs, ATTR_CRIT_MULTIPLIER);
  return value !== null && value > 1 ? value : null;
}

function sampleValue(sample) {
  return positiveNumber(sample?.value ?? sample?.effectiveValue ?? sample?.hpLossValue);
}

function sampleActorUid(sample) {
  return finiteNumber(sample?.originalAttackerUid ?? sample?.attackerUid ?? sample?.topSummonerUid);
}

function sampleDamageId(sample, row) {
  return finiteNumber(sample?.damageId ?? sample?.skillKey ?? row?.damageId);
}

function activeModifierEntries(sample) {
  const entries = [];
  for (const modifier of asArray(sample?.activeModifiers)) {
    for (const field of ["modifierBaseId", "modifierSourceConfigId"]) {
      const id = finiteNumber(modifier?.[field]);
      if (id === null) continue;
      entries.push({
        buffId: id,
        field,
        modifierBaseId: finiteNumber(modifier?.modifierBaseId),
        modifierSourceConfigId: finiteNumber(modifier?.modifierSourceConfigId),
        modifierHostUid: finiteNumber(modifier?.modifierHostUid),
        modifierSourceUid: finiteNumber(modifier?.modifierSourceUid),
        modifierLayer: finiteNumber(modifier?.modifierLayer),
      });
    }
  }
  return entries;
}

function sourceLabel(ruleId, indexes) {
  const display = indexes.display.sourcesByRuleId?.[ruleId];
  const contribution = indexes.contribution.sourcesByRuleId?.[ruleId];
  const recount = indexes.recount.sourcesById?.[ruleId];
  return display?.sourceName ?? display?.name ?? recount?.sourceName ?? contribution?.sourceId ?? ruleId;
}

function resolveContributionSource(ruleId, indexes) {
  const direct = indexes.contribution.sourcesByRuleId?.[ruleId];
  if (direct) return { sourceRule: direct, ruleId, aliasFromRuleId: null, aliasReason: "direct-rule" };

  const recountSource = indexes.recount.sourcesById?.[ruleId];
  const sourceId = recountSource?.sourceId;
  if (!sourceId) return { blocker: "missing-contribution-runtime-row" };

  const candidates = asArray(indexes.contributionRulesBySourceId?.get(sourceId)).filter(
    (candidate) => candidate.contributionMode === "formula-replay-candidate"
  );
  if (candidates.length === 1) {
    const sourceRule = candidates[0];
    return {
      sourceRule,
      ruleId: sourceRule.sourceRuleId ?? ruleId,
      aliasFromRuleId: ruleId,
      aliasReason: "source-id-active-window-alias",
    };
  }
  if (candidates.length > 1) return { blocker: `ambiguous-contribution-runtime-source-id:${sourceId}` };
  if (recountSource?.contributionStatus === "observed-only") {
    return { blocker: `observed-only-value-bridge-required:${sourceId}` };
  }
  return { blocker: "missing-contribution-runtime-row" };
}

function buildIndexes() {
  const recount = readGenerated("ModifierRecountTable.json");
  const contribution = readGenerated("ModifierContributionRuntime.json");
  const display = readGenerated("ModifierDisplayTable.json");
  const skillDetails = readGenerated("SkillBreakdownDetails.json");
  const damageRows = readGenerated("DamageAttrIdName.json");
  const ruleIdsByBuffId = new Map();
  for (const [buffId, rules] of Object.entries(recount.byBuffId ?? {})) {
    ruleIdsByBuffId.set(String(buffId), asArray(rules).map(String));
  }
  const contributionRulesBySourceId = new Map();
  for (const [ruleId, sourceRule] of Object.entries(contribution.sourcesByRuleId ?? {})) {
    const sourceId = sourceRule?.sourceId;
    if (!sourceId) continue;
    const current = contributionRulesBySourceId.get(sourceId) ?? [];
    current.push({ ...sourceRule, sourceRuleId: sourceRule.sourceRuleId ?? ruleId });
    contributionRulesBySourceId.set(sourceId, current);
  }
  return {
    recount,
    contribution,
    display,
    skillDetails,
    damageRows,
    ruleIdsByBuffId,
    contributionRulesBySourceId,
  };
}

function localizedName(map, fallback = "") {
  if (map && typeof map === "object" && !Array.isArray(map)) {
    return map.en ?? map.design ?? Object.values(map).find((value) => typeof value === "string" && value.trim()) ?? fallback;
  }
  return fallback;
}

function damageDisplayName(damageId, indexes) {
  const key = String(damageId);
  const detail = indexes.skillDetails[key] ?? {};
  const damage = indexes.damageRows[key] ?? {};
  return (
    localizedName(detail.DisplayNames, detail.DisplayName) ||
    localizedName(damage.Names, damage.Name) ||
    ""
  );
}

function activeRuleLinks(sample, indexes) {
  const byRule = new Map();
  for (const entry of activeModifierEntries(sample)) {
    for (const ruleId of indexes.ruleIdsByBuffId.get(String(entry.buffId)) ?? []) {
      const current = byRule.get(ruleId) ?? {
        ruleId,
        buffIds: new Set(),
        entries: [],
      };
      current.buffIds.add(entry.buffId);
      current.entries.push(entry);
      byRule.set(ruleId, current);
    }
  }
  return [...byRule.values()].map((link) => ({
    ...link,
    buffIds: [...link.buffIds].sort((left, right) => left - right),
  }));
}

function sourceUidForLink(link) {
  return link.entries.find((entry) => entry.modifierSourceUid !== null)?.modifierSourceUid ?? null;
}

function selectedScopeForLink(link, sample) {
  const sourceUid = sourceUidForLink(link);
  const actorUid = sampleActorUid(sample);
  return sourceUid !== null && actorUid !== null && sourceUid === actorUid ? "owner" : "party";
}

function hintScope(hint) {
  const explicit = String(hint?.valueScope ?? "").toLowerCase();
  if (explicit === "owner" || explicit === "party") return explicit;
  const values = asArray(hint?.values);
  const scopes = new Set(values.map((value) => String(value?.scope ?? "").toLowerCase()));
  if (scopes.size === 1) {
    const [scope] = [...scopes];
    if (scope === "owner" || scope === "party") return scope;
  }
  return null;
}

function appliesToSelectedScope(hint, selectedScope) {
  const scope = hintScope(hint);
  return !scope || scope === "all" || scope === "ambiguous" || scope === selectedScope;
}

function chosenPercentValue(hint, link, sample, selectedScope = selectedScopeForLink(link, sample)) {
  const values = asArray(hint.values).filter(
    (value) => value?.formulaAmount && value.unit === "percent" && finiteNumber(value.decimalValue) !== null
  );
  if (hint.valueResolution === "single" && values.length === 1) {
    return { status: "ready", value: values[0] };
  }
  if (hint.valueResolution === "ambiguous-multiple-values" && values.length === 1) {
    return { status: "experimental", value: values[0], reason: "ambiguous-single-percent-value" };
  }
  if (hint.valueResolution === "owner-party-split") {
    const wantedScope = selectedScope;
    const scoped = values.filter((value) => value.scope === wantedScope);
    if (scoped.length === 1) return { status: "ready", value: scoped[0], selectedScope: wantedScope };
    return { status: "blocked", reason: `owner-party-split-${wantedScope}-value-missing` };
  }
  if (values.length === 0) return { status: "blocked", reason: "no-percent-formula-value" };
  return { status: "blocked", reason: `ambiguous-component-values:${hint.valueResolution ?? "unknown"}` };
}

function classifyHint(ruleId, link, sample, row, indexes) {
  const resolved = resolveContributionSource(ruleId, indexes);
  if (!resolved.sourceRule) return [{ kind: "blocked", reason: resolved.blocker ?? "missing-contribution-runtime-row" }];
  const sourceRule = resolved.sourceRule;
  const contributionRuleId = resolved.ruleId ?? ruleId;
  if (sourceRule.contributionMode !== "formula-replay-candidate") {
    return [{ kind: "ignored", reason: `mode:${sourceRule.contributionMode ?? "unknown"}` }];
  }

  const hints = asArray(sourceRule.componentValueHints);
  if (!hints.length) return [{ kind: "blocked", reason: "formula-candidate-without-component-values" }];

  const results = [];
  const selectedScope = selectedScopeForLink(link, sample);
  for (const hint of hints) {
    const componentKey = String(hint.componentKey ?? "").toLowerCase();
    const terms = asArray(hint.formulaTermIds?.length ? hint.formulaTermIds : sourceRule.formulaTermIds).map(String);
    const contributionGroups = asArray(hint.contributionGroups?.length ? hint.contributionGroups : sourceRule.contributionGroups);
    const scopedHint = hintScope(hint);

    if (!appliesToSelectedScope(hint, selectedScope)) {
      results.push({ kind: "ignored", reason: `scope:${scopedHint}-not-${selectedScope}`, componentKey, terms });
      continue;
    }

    if (CHANCE_COMPONENT_KEYS.has(componentKey)) {
      if (!PROBABILISTIC_CHANCE_COMPONENT_KEYS.has(componentKey) || !terms.includes("critMultiplier")) {
        results.push({ kind: "blocked", reason: `chance-component:${componentKey}`, componentKey, terms });
        continue;
      }
      const chosen = chosenPercentValue(hint, link, sample, selectedScope);
      if (chosen.status !== "ready" && chosen.status !== "experimental") {
        results.push({ kind: "blocked", reason: chosen.reason, componentKey, terms });
        continue;
      }
      const amount = finiteNumber(chosen.value.decimalValue);
      if (amount === null || amount <= 0 || amount >= 1) {
        results.push({ kind: "blocked", reason: "invalid-critical-rate-amount", componentKey, terms });
        continue;
      }
      results.push({
        kind: chosen.status === "experimental" ? "experimental-chance-expected" : "chance-expected",
        ruleId: contributionRuleId,
        activeRuleId: resolved.aliasFromRuleId,
        activeRuleAliasReason: resolved.aliasReason,
        sourceId: sourceRule.sourceId,
        label: sourceLabel(contributionRuleId, indexes),
        componentKey,
        contributionGroups,
        term: "criticalRatePct",
        amount,
        valueScope: chosen.value.scope ?? chosen.selectedScope ?? scopedHint ?? selectedScope,
        selectedScope,
        sourceUid: sourceUidForLink(link),
        rawText: chosen.value.rawText ?? "",
        confidence: chosen.reason ?? "unambiguous",
        buffIds: link.buffIds,
      });
      continue;
    }
    if (CRIT_DAMAGE_COMPONENT_KEYS.has(componentKey) && terms.includes("critMultiplier")) {
      const chosen = chosenPercentValue(hint, link, sample, selectedScope);
      if (chosen.status !== "ready" && chosen.status !== "experimental") {
        results.push({ kind: "blocked", reason: chosen.reason, componentKey, terms });
        continue;
      }
      const amount = finiteNumber(chosen.value.decimalValue);
      if (amount === null || amount <= 0) {
        results.push({ kind: "blocked", reason: "invalid-critical-damage-amount", componentKey, terms });
        continue;
      }
      results.push({
        kind: chosen.status === "experimental" ? "experimental-crit-damage" : "crit-damage",
        ruleId: contributionRuleId,
        activeRuleId: resolved.aliasFromRuleId,
        activeRuleAliasReason: resolved.aliasReason,
        sourceId: sourceRule.sourceId,
        label: sourceLabel(contributionRuleId, indexes),
        componentKey,
        contributionGroups,
        term: "critMultiplier",
        amount,
        valueScope: chosen.value.scope ?? chosen.selectedScope ?? scopedHint ?? selectedScope,
        selectedScope,
        sourceUid: sourceUidForLink(link),
        rawText: chosen.value.rawText ?? "",
        confidence: chosen.reason ?? "unambiguous",
        buffIds: link.buffIds,
      });
      continue;
    }
    if (STAT_COMPONENT_KEYS.has(componentKey) || terms.includes("primaryAttack")) {
      const attackTerms = terms.filter((term) => term === "primaryAttack");
      if (attackTerms.length !== 1 || terms.length !== 1) {
        results.push({ kind: "blocked", reason: `unsupported-stat-terms:${terms.join(",") || "none"}`, componentKey, terms });
        continue;
      }
      const flatValues = asArray(hint.values).filter(
        (value) => value?.formulaAmount && value.unit === "flat" && finiteNumber(value.value) !== null
      );
      if (flatValues.length > 1) {
        results.push({ kind: "blocked", reason: `flat-attack-term-ambiguous-values:${flatValues.length}`, componentKey, terms });
        continue;
      }
      if (flatValues.length === 1) {
        results.push({ kind: "blocked", reason: "flat-attack-term-requires-stat-snapshot", componentKey, terms });
        continue;
      }
      const chosen = chosenPercentValue(hint, link, sample, selectedScope);
      if (chosen.status !== "ready" && chosen.status !== "experimental") {
        results.push({ kind: "blocked", reason: chosen.reason, componentKey, terms });
        continue;
      }
      const amount = finiteNumber(chosen.value.decimalValue);
      if (amount === null || amount <= -0.95) {
        results.push({ kind: "blocked", reason: "invalid-attack-snapshot-amount", componentKey, terms });
        continue;
      }
      results.push({
        kind: chosen.status === "experimental" ? "experimental-attack-snapshot" : "attack-snapshot",
        ruleId: contributionRuleId,
        activeRuleId: resolved.aliasFromRuleId,
        activeRuleAliasReason: resolved.aliasReason,
        sourceId: sourceRule.sourceId,
        label: sourceLabel(contributionRuleId, indexes),
        componentKey,
        contributionGroups,
        term: "primaryAttackPct",
        amount,
        valueScope: chosen.value.scope ?? chosen.selectedScope ?? scopedHint ?? selectedScope,
        selectedScope,
        sourceUid: sourceUidForLink(link),
        rawText: chosen.value.rawText ?? "",
        confidence: chosen.reason ?? "unambiguous",
        buffIds: link.buffIds,
      });
      continue;
    }

    const strippableTerms = terms.filter((term) => STRIPPABLE_PERCENT_TERMS.has(term));
    if (strippableTerms.length !== 1 || terms.length !== 1) {
      results.push({ kind: "blocked", reason: `unsupported-or-mixed-terms:${terms.join(",") || "none"}`, componentKey, terms });
      continue;
    }

    const chosen = chosenPercentValue(hint, link, sample);
    if (chosen.status !== "ready" && chosen.status !== "experimental") {
      results.push({ kind: "blocked", reason: chosen.reason, componentKey, terms });
      continue;
    }

    const amount = finiteNumber(chosen.value.decimalValue);
    if (amount === null || amount <= -0.95) {
      results.push({ kind: "blocked", reason: "invalid-percent-amount", componentKey, terms });
      continue;
    }

    results.push({
      kind: chosen.status === "experimental" ? "experimental-strip" : "strip",
      ruleId: contributionRuleId,
      activeRuleId: resolved.aliasFromRuleId,
      activeRuleAliasReason: resolved.aliasReason,
      sourceId: sourceRule.sourceId,
      label: sourceLabel(contributionRuleId, indexes),
      componentKey,
      contributionGroups,
      term: strippableTerms[0],
      amount,
      valueScope: chosen.value.scope ?? chosen.selectedScope ?? scopedHint ?? selectedScope,
      selectedScope,
      sourceUid: sourceUidForLink(link),
      rawText: chosen.value.rawText ?? "",
      confidence: chosen.reason ?? "unambiguous",
      buffIds: link.buffIds,
    });
  }
  return results;
}

function replayActionsForSample(sample, row, indexes) {
  const actions = [];
  const seen = new Set();
  for (const link of activeRuleLinks(sample, indexes)) {
    for (const action of classifyHint(link.ruleId, link, sample, row, indexes)) {
      const key = `${link.ruleId}:${action.kind}:${action.componentKey ?? ""}:${action.term ?? ""}:${action.amount ?? ""}:${action.reason ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({
        ...action,
        ruleId: action.ruleId ?? link.ruleId,
        activeRuleId: action.activeRuleId ?? (action.ruleId && action.ruleId !== link.ruleId ? link.ruleId : null),
        label: action.label ?? sourceLabel(action.ruleId ?? link.ruleId, indexes),
      });
    }
  }
  return collapseScopedFormulaActions(actions);
}

function isFormulaAction(action) {
  return [
    "strip",
    "experimental-strip",
    "crit-damage",
    "experimental-crit-damage",
    "chance-expected",
    "experimental-chance-expected",
    "attack-snapshot",
    "experimental-attack-snapshot",
  ].includes(action.kind);
}

function scopedActionRank(action) {
  const scopeRank = action.valueScope === "owner" ? 2 : action.valueScope === "party" ? 1 : 0;
  return scopeRank * 1000 + Math.abs(finiteNumber(action.amount) ?? 0);
}

function collapseScopedFormulaActions(actions) {
  const retained = [];
  const byFormulaKey = new Map();
  for (const action of actions) {
    if (!isFormulaAction(action)) {
      retained.push(action);
      continue;
    }
    const key = `${action.kind}:${action.sourceId ?? action.ruleId}:${action.componentKey}:${action.term}`;
    const current = byFormulaKey.get(key);
    if (!current || scopedActionRank(action) > scopedActionRank(current)) {
      byFormulaKey.set(key, action);
    }
  }
  return [...retained, ...byFormulaKey.values()];
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * p)));
  return sortedValues[index];
}

function summarizeRatios(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) {
    return { count: 0, min: null, p05: null, avg: null, p95: null, max: null, spreadPct: null };
  }
  const sum = sorted.reduce((total, value) => total + value, 0);
  const avg = sum / sorted.length;
  const p05 = percentile(sorted, 0.05);
  const p95 = percentile(sorted, 0.95);
  return {
    count: sorted.length,
    min: sorted[0],
    p05,
    avg,
    p95,
    max: sorted[sorted.length - 1],
    spreadPct: avg > 0 && p05 !== null && p95 !== null ? (p95 - p05) / avg : null,
  };
}

function makeRow(damageId) {
  return {
    damageId,
    displayName: "",
    hits: 0,
    totalValue: 0,
    critHits: 0,
    samplesWithAttack: 0,
    critSamplesMissingMultiplier: 0,
    beforeRatios: [],
    afterRatios: [],
    stripHits: 0,
    normalizedCritDamageActions: 0,
    activeRuleHits: 0,
    stripActionHits: 0,
    blockedActionHits: 0,
    ignoredActionHits: 0,
    blockedReasons: new Map(),
    blockedActionDetails: new Map(),
    ignoredActionDetails: new Map(),
    strippedTerms: new Map(),
    experimentalStrippedTerms: new Map(),
    critDamageTerms: new Map(),
    experimentalCritDamageTerms: new Map(),
    chanceTerms: new Map(),
    experimentalChanceTerms: new Map(),
    attackSnapshotTerms: new Map(),
    experimentalAttackSnapshotTerms: new Map(),
    contributionByRule: new Map(),
    experimentalContributionByRule: new Map(),
    critDamageContributionByRule: new Map(),
    experimentalCritDamageContributionByRule: new Map(),
    chanceContributionByRule: new Map(),
    experimentalChanceContributionByRule: new Map(),
    attackSnapshotContributionByRule: new Map(),
    experimentalAttackSnapshotContributionByRule: new Map(),
    sampleSummaries: [],
    files: new Set(),
  };
}

function addCount(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function actionDetailKey(action) {
  return [
    action.reason ?? "",
    action.ruleId ?? "",
    action.label ?? "",
    action.sourceId ?? "",
    action.componentKey ?? "",
    asArray(action.terms).join(","),
  ].join("|");
}

function addActionDetail(map, action) {
  const key = actionDetailKey(action);
  if (!key) return;
  const current = map.get(key) ?? {
    reason: action.reason ?? "",
    ruleId: action.ruleId ?? "",
    label: action.label ?? "",
    sourceId: action.sourceId ?? "",
    componentKey: action.componentKey ?? "",
    terms: asArray(action.terms),
    hits: 0,
  };
  current.hits += 1;
  map.set(key, current);
}

function addContribution(map, action, finalContribution, decritContribution) {
  const key = contributionKey(action);
  const row = map.get(key) ?? {
    ruleId: action.ruleId,
    activeRuleId: action.activeRuleId,
    activeRuleAliasReason: action.activeRuleAliasReason,
    label: action.label,
    sourceId: action.sourceId,
    sourceUid: action.sourceUid,
    componentKey: action.componentKey,
    term: action.term,
    amount: action.amount,
    valueScope: action.valueScope,
    rawText: action.rawText,
    hits: 0,
    finalContribution: 0,
    decritContribution: 0,
  };
  row.hits += 1;
  row.finalContribution += finalContribution;
  row.decritContribution += decritContribution;
  map.set(key, row);
}

function analyzeSample(sample, row, filePath, indexes, rows, totals) {
  const damageId = sampleDamageId(sample, row);
  const value = sampleValue(sample);
  if (damageId === null || value === null) return false;

  const attackPower = attrValue(sample.attackerAttrs, ATTR_ATTACK_POWER);
  const critMultiplier = normalizedCritMultiplier(sample);
  const aggregate = rows.get(String(damageId)) ?? makeRow(damageId);
  if (!aggregate.displayName) aggregate.displayName = damageDisplayName(damageId, indexes);
  if (!aggregate.displayName && row?.displayName) aggregate.displayName = row.displayName;
  if (!aggregate.displayName && row?.name) aggregate.displayName = row.name;
  rows.set(String(damageId), aggregate);

  aggregate.hits += 1;
  aggregate.totalValue += value;
  if (sample.isCrit) aggregate.critHits += 1;
  if (attackPower !== null) aggregate.samplesWithAttack += 1;
  if (sample.isCrit && critMultiplier === null) aggregate.critSamplesMissingMultiplier += 1;
  aggregate.files.add(path.basename(filePath));

  const actions = replayActionsForSample(sample, row, indexes);
  const stripActions = actions.filter((action) => action.kind === "strip");
  const experimentalStripActions = actions.filter((action) => action.kind === "experimental-strip");
  const critDamageActions = actions.filter((action) => action.kind === "crit-damage");
  const experimentalCritDamageActions = actions.filter((action) => action.kind === "experimental-crit-damage");
  const chanceActions = actions.filter((action) => action.kind === "chance-expected");
  const experimentalChanceActions = actions.filter((action) => action.kind === "experimental-chance-expected");
  const attackSnapshotActions = actions.filter((action) => action.kind === "attack-snapshot");
  const experimentalAttackSnapshotActions = actions.filter((action) => action.kind === "experimental-attack-snapshot");
  const blockedActions = actions.filter((action) => action.kind === "blocked");
  const ignoredActions = actions.filter((action) => action.kind === "ignored");
  const normalizedActions = actions.filter((action) => action.kind === "normalized");
  if (actions.length) aggregate.activeRuleHits += 1;
  if (stripActions.length) aggregate.stripActionHits += 1;
  if (experimentalStripActions.length) aggregate.experimentalStripActionHits = (aggregate.experimentalStripActionHits ?? 0) + 1;
  if (critDamageActions.length) aggregate.critDamageActionHits = (aggregate.critDamageActionHits ?? 0) + 1;
  if (experimentalCritDamageActions.length) {
    aggregate.experimentalCritDamageActionHits = (aggregate.experimentalCritDamageActionHits ?? 0) + 1;
  }
  if (chanceActions.length) aggregate.chanceActionHits = (aggregate.chanceActionHits ?? 0) + 1;
  if (experimentalChanceActions.length) {
    aggregate.experimentalChanceActionHits = (aggregate.experimentalChanceActionHits ?? 0) + 1;
  }
  if (attackSnapshotActions.length) aggregate.attackSnapshotActionHits = (aggregate.attackSnapshotActionHits ?? 0) + 1;
  if (experimentalAttackSnapshotActions.length) {
    aggregate.experimentalAttackSnapshotActionHits = (aggregate.experimentalAttackSnapshotActionHits ?? 0) + 1;
  }
  if (blockedActions.length) aggregate.blockedActionHits += 1;
  if (ignoredActions.length) aggregate.ignoredActionHits += 1;
  aggregate.normalizedCritDamageActions += normalizedActions.length;
  for (const action of blockedActions) {
    addCount(aggregate.blockedReasons, action.reason);
    addActionDetail(aggregate.blockedActionDetails, action);
  }
  for (const action of ignoredActions) addActionDetail(aggregate.ignoredActionDetails, action);

  if (critMultiplier === null || attackPower === null || attackPower <= 0) return true;

  const decritValue = value / critMultiplier;
  const beforeRatio = decritValue / attackPower;
  aggregate.beforeRatios.push(beforeRatio);

  const termAmounts = new Map();
  for (const action of stripActions) {
    addCount(termAmounts, action.term, action.amount);
    addCount(aggregate.strippedTerms, `${action.term}:${action.componentKey}:${formatPct(action.amount, 2)}`);
  }
  const experimentalTermAmounts = new Map(termAmounts);
  for (const action of experimentalStripActions) {
    addCount(experimentalTermAmounts, action.term, action.amount);
    addCount(aggregate.experimentalStrippedTerms, `${action.term}:${action.componentKey}:${formatPct(action.amount, 2)}`);
  }
  for (const action of critDamageActions) {
    addCount(aggregate.critDamageTerms, `${action.term}:${action.componentKey}:${formatPct(action.amount, 2)}`);
  }
  for (const action of experimentalCritDamageActions) {
    addCount(aggregate.experimentalCritDamageTerms, `${action.term}:${action.componentKey}:${formatPct(action.amount, 2)}`);
  }
  for (const action of chanceActions) {
    addCount(aggregate.chanceTerms, `${action.term}:${action.componentKey}:${formatPct(action.amount, 2)}`);
  }
  for (const action of experimentalChanceActions) {
    addCount(aggregate.experimentalChanceTerms, `${action.term}:${action.componentKey}:${formatPct(action.amount, 2)}`);
  }
  const attackTermAmounts = new Map();
  for (const action of attackSnapshotActions) {
    addCount(attackTermAmounts, action.term, action.amount);
    addCount(aggregate.attackSnapshotTerms, `${action.term}:${action.componentKey}:${formatPct(action.amount, 2)}`);
  }
  const experimentalAttackTermAmounts = new Map(attackTermAmounts);
  for (const action of experimentalAttackSnapshotActions) {
    addCount(experimentalAttackTermAmounts, action.term, action.amount);
    addCount(aggregate.experimentalAttackSnapshotTerms, `${action.term}:${action.componentKey}:${formatPct(action.amount, 2)}`);
  }

  let stripFactor = 1;
  for (const amount of termAmounts.values()) {
    stripFactor *= 1 + amount;
  }
  let experimentalStripFactor = 1;
  for (const amount of experimentalTermAmounts.values()) {
    experimentalStripFactor *= 1 + amount;
  }
  if (stripFactor <= 0 || !Number.isFinite(stripFactor)) return true;
  if (experimentalStripFactor <= 0 || !Number.isFinite(experimentalStripFactor)) return true;

  const strippedDecritValue = decritValue / stripFactor;
  const afterRatio = strippedDecritValue / attackPower;
  const experimentalStrippedDecritValue = decritValue / experimentalStripFactor;
  const experimentalAfterRatio = experimentalStrippedDecritValue / attackPower;
  aggregate.afterRatios.push(afterRatio);
  if (!aggregate.experimentalAfterRatios) aggregate.experimentalAfterRatios = [];
  aggregate.experimentalAfterRatios.push(experimentalAfterRatio);
  if (stripActions.length) aggregate.stripHits += 1;
  if (experimentalStripActions.length) aggregate.experimentalStripHits = (aggregate.experimentalStripHits ?? 0) + 1;

  for (const action of stripActions) {
    const termSum = termAmounts.get(action.term) ?? 0;
    if (termSum <= -0.95) continue;
    const finalContribution = value * (action.amount / (1 + termSum));
    const decritContribution = decritValue * (action.amount / (1 + termSum));
    addContribution(aggregate.contributionByRule, action, finalContribution, decritContribution);
    totals.candidateFinalContribution += finalContribution;
    totals.candidateDecritContribution += decritContribution;
  }
  for (const action of experimentalStripActions) {
    const termSum = experimentalTermAmounts.get(action.term) ?? 0;
    if (termSum <= -0.95) continue;
    const finalContribution = value * (action.amount / (1 + termSum));
    const decritContribution = decritValue * (action.amount / (1 + termSum));
    addContribution(aggregate.experimentalContributionByRule, action, finalContribution, decritContribution);
    totals.experimentalFinalContribution += finalContribution;
    totals.experimentalDecritContribution += decritContribution;
  }
  const critSnapshot = critMultiplierSnapshot(sample);
  if (sample.isCrit && critSnapshot !== null) {
    for (const action of critDamageActions) {
      const finalContribution = decritValue * action.amount;
      addContribution(aggregate.critDamageContributionByRule, action, finalContribution, 0);
      totals.critDamageFinalContribution = (totals.critDamageFinalContribution ?? 0) + finalContribution;
    }
    for (const action of experimentalCritDamageActions) {
      const finalContribution = decritValue * action.amount;
      addContribution(aggregate.experimentalCritDamageContributionByRule, action, finalContribution, 0);
      totals.experimentalCritDamageFinalContribution =
        (totals.experimentalCritDamageFinalContribution ?? 0) + finalContribution;
    }
  }
  if (critSnapshot !== null) {
    const baseNonCritValue = sample.isCrit ? decritValue : value;
    const critBonusPerGuaranteedCrit = Math.max(0, critSnapshot - 1);
    for (const action of chanceActions) {
      const finalContribution = baseNonCritValue * critBonusPerGuaranteedCrit * action.amount;
      addContribution(aggregate.chanceContributionByRule, action, finalContribution, 0);
      totals.chanceExpectedFinalContribution = (totals.chanceExpectedFinalContribution ?? 0) + finalContribution;
    }
    for (const action of experimentalChanceActions) {
      const finalContribution = baseNonCritValue * critBonusPerGuaranteedCrit * action.amount;
      addContribution(aggregate.experimentalChanceContributionByRule, action, finalContribution, 0);
      totals.experimentalChanceExpectedFinalContribution =
        (totals.experimentalChanceExpectedFinalContribution ?? 0) + finalContribution;
    }
  }
  for (const action of attackSnapshotActions) {
    const termSum = attackTermAmounts.get(action.term) ?? 0;
    if (termSum <= -0.95) continue;
    const finalContribution = value * (action.amount / (1 + termSum));
    const decritContribution = decritValue * (action.amount / (1 + termSum));
    addContribution(aggregate.attackSnapshotContributionByRule, action, finalContribution, decritContribution);
    totals.attackSnapshotFinalContribution = (totals.attackSnapshotFinalContribution ?? 0) + finalContribution;
    totals.attackSnapshotDecritContribution = (totals.attackSnapshotDecritContribution ?? 0) + decritContribution;
  }
  for (const action of experimentalAttackSnapshotActions) {
    const termSum = experimentalAttackTermAmounts.get(action.term) ?? 0;
    if (termSum <= -0.95) continue;
    const finalContribution = value * (action.amount / (1 + termSum));
    const decritContribution = decritValue * (action.amount / (1 + termSum));
    addContribution(aggregate.experimentalAttackSnapshotContributionByRule, action, finalContribution, decritContribution);
    totals.experimentalAttackSnapshotFinalContribution =
      (totals.experimentalAttackSnapshotFinalContribution ?? 0) + finalContribution;
    totals.experimentalAttackSnapshotDecritContribution =
      (totals.experimentalAttackSnapshotDecritContribution ?? 0) + decritContribution;
  }

  aggregate.sampleSummaries.push({
    beforeRatio,
    afterRatio,
    experimentalAfterRatio,
    stripFactor,
    experimentalStripFactor,
    isCrit: Boolean(sample.isCrit),
    critMultiplierSnapshot: critSnapshot,
    attackSnapshot: attackPower,
    activeKeys: stripActions.map((action) => contributionKey(action)),
    experimentalActiveKeys: experimentalStripActions.map((action) => contributionKey(action)),
    critDamageActiveKeys: critDamageActions.map((action) => contributionKey(action)),
    experimentalCritDamageActiveKeys: experimentalCritDamageActions.map((action) => contributionKey(action)),
    chanceActiveKeys: chanceActions.map((action) => contributionKey(action)),
    experimentalChanceActiveKeys: experimentalChanceActions.map((action) => contributionKey(action)),
    attackSnapshotActiveKeys: attackSnapshotActions.map((action) => contributionKey(action)),
    experimentalAttackSnapshotActiveKeys: experimentalAttackSnapshotActions.map((action) => contributionKey(action)),
  });

  return true;
}

function contributionKey(action) {
  return `${action.ruleId}:${action.componentKey}:${action.term}:${action.amount}:${action.valueScope ?? ""}`;
}

function analyzeFile(filePath, indexes, rows, totals) {
  const payload = readJson(filePath);
  totals.filesScanned += 1;
  let samples = 0;

  for (const sample of asArray(payload.modifierReplayHits)) {
    samples += analyzeSample(sample, null, filePath, indexes, rows, totals) ? 1 : 0;
  }
  for (const row of asArray(payload.rows)) {
    for (const sample of asArray(row.formulaSamples)) {
      samples += analyzeSample(sample, row, filePath, indexes, rows, totals) ? 1 : 0;
    }
  }

  totals.samplesScanned += samples;
  if (samples === 0) totals.filesWithoutSamples += 1;
}

function compactMap(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function compactActionDetails(map) {
  return [...map.values()].sort(
    (left, right) =>
      right.hits - left.hits ||
      String(left.reason).localeCompare(String(right.reason)) ||
      String(left.label).localeCompare(String(right.label))
  );
}

function compactContributions(map) {
  return [...map.values()].sort((left, right) => Math.abs(right.finalContribution) - Math.abs(left.finalContribution));
}

function distinctRounded(values, digits = 6) {
  return new Set(values.map((value) => finiteNumber(value)).filter((value) => value !== null).map((value) => value.toFixed(digits))).size;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildToggleTests(row, mode = "safe") {
  const keyField = mode === "experimental" ? "experimentalActiveKeys" : "activeKeys";
  const ratioField = mode === "experimental" ? "experimentalAfterRatio" : "beforeRatio";
  const contributionMap = mode === "experimental" ? row.experimentalContributionByRule : row.contributionByRule;
  const keys = new Set(row.sampleSummaries.flatMap((sample) => sample[keyField] ?? []));
  const tests = [];
  for (const key of keys) {
    const active = [];
    const inactive = [];
    for (const sample of row.sampleSummaries) {
      if ((sample[keyField] ?? []).includes(key)) active.push(sample[ratioField]);
      else inactive.push(sample[ratioField]);
    }
    if (!active.length || !inactive.length) continue;
    const contribution = compactContributions(contributionMap).find((item) => contributionKey(item) === key);
    const activeMedian = median(active);
    const inactiveMedian = median(inactive);
    const observedDelta =
      activeMedian !== null && inactiveMedian !== null && inactiveMedian > 0 ? activeMedian / inactiveMedian - 1 : null;
    const expectedDelta = contribution?.amount ?? null;
    tests.push({
      key,
      label: contribution?.label ?? key,
      componentKey: contribution?.componentKey ?? "",
      term: contribution?.term ?? "",
      amount: expectedDelta,
      activeHits: active.length,
      inactiveHits: inactive.length,
      activeMedian,
      inactiveMedian,
      observedDelta,
      deltaError:
        observedDelta !== null && expectedDelta !== null ? Math.abs(observedDelta - expectedDelta) : null,
      mode,
    });
  }
  return tests.sort((left, right) => (left.deltaError ?? Infinity) - (right.deltaError ?? Infinity));
}

function buildCritDamageSnapshotTests(row, mode = "safe") {
  const keyField = mode === "experimental" ? "experimentalCritDamageActiveKeys" : "critDamageActiveKeys";
  const contributionMap =
    mode === "experimental" ? row.experimentalCritDamageContributionByRule : row.critDamageContributionByRule;
  const keys = new Set(row.sampleSummaries.flatMap((sample) => sample[keyField] ?? []));
  const tests = [];
  for (const key of keys) {
    const active = [];
    const inactive = [];
    for (const sample of row.sampleSummaries) {
      const value = finiteNumber(sample.critMultiplierSnapshot);
      if (value === null) continue;
      if ((sample[keyField] ?? []).includes(key)) active.push(value);
      else inactive.push(value);
    }
    if (!active.length || !inactive.length) continue;
    const contribution = compactContributions(contributionMap).find((item) => contributionKey(item) === key);
    const activeMedian = median(active);
    const inactiveMedian = median(inactive);
    const observedDelta =
      activeMedian !== null && inactiveMedian !== null ? activeMedian - inactiveMedian : null;
    const expectedDelta = contribution?.amount ?? null;
    tests.push({
      key,
      label: contribution?.label ?? key,
      componentKey: contribution?.componentKey ?? "",
      term: contribution?.term ?? "",
      amount: expectedDelta,
      activeHits: active.length,
      inactiveHits: inactive.length,
      activeMedian,
      inactiveMedian,
      observedDelta,
      deltaError:
        observedDelta !== null && expectedDelta !== null ? Math.abs(observedDelta - expectedDelta) : null,
      mode,
    });
  }
  return tests.sort((left, right) => (left.deltaError ?? Infinity) - (right.deltaError ?? Infinity));
}

function buildChanceToggleTests(row, mode = "safe") {
  const keyField = mode === "experimental" ? "experimentalChanceActiveKeys" : "chanceActiveKeys";
  const contributionMap = mode === "experimental" ? row.experimentalChanceContributionByRule : row.chanceContributionByRule;
  const keys = new Set(row.sampleSummaries.flatMap((sample) => sample[keyField] ?? []));
  const tests = [];
  for (const key of keys) {
    let activeHits = 0;
    let activeCrits = 0;
    let inactiveHits = 0;
    let inactiveCrits = 0;
    for (const sample of row.sampleSummaries) {
      if ((sample[keyField] ?? []).includes(key)) {
        activeHits += 1;
        if (sample.isCrit) activeCrits += 1;
      } else {
        inactiveHits += 1;
        if (sample.isCrit) inactiveCrits += 1;
      }
    }
    if (!activeHits || !inactiveHits) continue;
    const contribution = compactContributions(contributionMap).find((item) => contributionKey(item) === key);
    const activeRate = activeCrits / activeHits;
    const inactiveRate = inactiveCrits / inactiveHits;
    const observedDelta = activeRate - inactiveRate;
    const expectedDelta = contribution?.amount ?? null;
    tests.push({
      key,
      label: contribution?.label ?? key,
      componentKey: contribution?.componentKey ?? "",
      term: contribution?.term ?? "",
      amount: expectedDelta,
      activeHits,
      inactiveHits,
      activeCrits,
      inactiveCrits,
      activeRate,
      inactiveRate,
      observedDelta,
      deltaError:
        observedDelta !== null && expectedDelta !== null ? Math.abs(observedDelta - expectedDelta) : null,
      mode,
    });
  }
  return tests.sort((left, right) => (left.deltaError ?? Infinity) - (right.deltaError ?? Infinity));
}

function buildAttackSnapshotTests(row, mode = "safe") {
  const keyField = mode === "experimental" ? "experimentalAttackSnapshotActiveKeys" : "attackSnapshotActiveKeys";
  const contributionMap =
    mode === "experimental" ? row.experimentalAttackSnapshotContributionByRule : row.attackSnapshotContributionByRule;
  const keys = new Set(row.sampleSummaries.flatMap((sample) => sample[keyField] ?? []));
  const tests = [];
  for (const key of keys) {
    const active = [];
    const inactive = [];
    for (const sample of row.sampleSummaries) {
      const value = finiteNumber(sample.attackSnapshot);
      if (value === null || value <= 0) continue;
      if ((sample[keyField] ?? []).includes(key)) active.push(value);
      else inactive.push(value);
    }
    if (!active.length || !inactive.length) continue;
    const contribution = compactContributions(contributionMap).find((item) => contributionKey(item) === key);
    const activeMedian = median(active);
    const inactiveMedian = median(inactive);
    const observedDelta =
      activeMedian !== null && inactiveMedian !== null && inactiveMedian > 0 ? activeMedian / inactiveMedian - 1 : null;
    const expectedDelta = contribution?.amount ?? null;
    tests.push({
      key,
      label: contribution?.label ?? key,
      componentKey: contribution?.componentKey ?? "",
      term: contribution?.term ?? "",
      amount: expectedDelta,
      activeHits: active.length,
      inactiveHits: inactive.length,
      activeMedian,
      inactiveMedian,
      observedDelta,
      deltaError:
        observedDelta !== null && expectedDelta !== null ? Math.abs(observedDelta - expectedDelta) : null,
      mode,
    });
  }
  return tests.sort((left, right) => (left.deltaError ?? Infinity) - (right.deltaError ?? Infinity));
}

function compactRows(rows, options) {
  return [...rows.values()]
    .map((row) => {
      const before = summarizeRatios(row.beforeRatios);
      const after = summarizeRatios(row.afterRatios);
      const experimentalAfter = summarizeRatios(row.experimentalAfterRatios ?? []);
      const spreadDelta =
        before.spreadPct !== null && after.spreadPct !== null ? before.spreadPct - after.spreadPct : null;
      const experimentalSpreadDelta =
        before.spreadPct !== null && experimentalAfter.spreadPct !== null ? before.spreadPct - experimentalAfter.spreadPct : null;
      const stripFactorDistinctValues = distinctRounded(row.sampleSummaries.map((sample) => sample.stripFactor));
      const experimentalStripFactorDistinctValues = distinctRounded(
        row.sampleSummaries.map((sample) => sample.experimentalStripFactor)
      );
      const toggleTests = buildToggleTests(row);
      const experimentalToggleTests = buildToggleTests(row, "experimental");
      const critDamageSnapshotTests = buildCritDamageSnapshotTests(row);
      const experimentalCritDamageSnapshotTests = buildCritDamageSnapshotTests(row, "experimental");
      const chanceToggleTests = buildChanceToggleTests(row);
      const experimentalChanceToggleTests = buildChanceToggleTests(row, "experimental");
      const attackSnapshotTests = buildAttackSnapshotTests(row);
      const experimentalAttackSnapshotTests = buildAttackSnapshotTests(row, "experimental");
      const status =
        after.spreadPct !== null &&
        after.spreadPct <= options.stabilityLimit &&
        row.blockedActionHits === 0 &&
        row.stripHits > 0
          ? "candidate-ready-for-coefficient-check"
          : "blocked-or-evidence-only";
      return {
        damageId: row.damageId,
        displayName: row.displayName,
        hits: row.hits,
        totalValue: row.totalValue,
        critHits: row.critHits,
        samplesWithAttack: row.samplesWithAttack,
        critSamplesMissingMultiplier: row.critSamplesMissingMultiplier,
        stripHits: row.stripHits,
        experimentalStripHits: row.experimentalStripHits ?? 0,
        activeRuleHits: row.activeRuleHits,
        stripActionHits: row.stripActionHits,
        experimentalStripActionHits: row.experimentalStripActionHits ?? 0,
        critDamageActionHits: row.critDamageActionHits ?? 0,
        experimentalCritDamageActionHits: row.experimentalCritDamageActionHits ?? 0,
        chanceActionHits: row.chanceActionHits ?? 0,
        experimentalChanceActionHits: row.experimentalChanceActionHits ?? 0,
        attackSnapshotActionHits: row.attackSnapshotActionHits ?? 0,
        experimentalAttackSnapshotActionHits: row.experimentalAttackSnapshotActionHits ?? 0,
        blockedActionHits: row.blockedActionHits,
        ignoredActionHits: row.ignoredActionHits,
        normalizedCritDamageActions: row.normalizedCritDamageActions,
        before,
        after,
        experimentalAfter,
        spreadDelta,
        experimentalSpreadDelta,
        stripFactorDistinctValues,
        experimentalStripFactorDistinctValues,
        status,
        blockedReasons: compactMap(row.blockedReasons),
        blockedActionDetails: compactActionDetails(row.blockedActionDetails).slice(0, options.maxRows),
        ignoredActionDetails: compactActionDetails(row.ignoredActionDetails).slice(0, options.maxRows),
        strippedTerms: compactMap(row.strippedTerms),
        experimentalStrippedTerms: compactMap(row.experimentalStrippedTerms),
        critDamageTerms: compactMap(row.critDamageTerms),
        experimentalCritDamageTerms: compactMap(row.experimentalCritDamageTerms),
        chanceTerms: compactMap(row.chanceTerms),
        experimentalChanceTerms: compactMap(row.experimentalChanceTerms),
        attackSnapshotTerms: compactMap(row.attackSnapshotTerms),
        experimentalAttackSnapshotTerms: compactMap(row.experimentalAttackSnapshotTerms),
        toggleTests,
        experimentalToggleTests,
        critDamageSnapshotTests,
        experimentalCritDamageSnapshotTests,
        chanceToggleTests,
        experimentalChanceToggleTests,
        attackSnapshotTests,
        experimentalAttackSnapshotTests,
        candidateContributions: compactContributions(row.contributionByRule),
        experimentalContributions: compactContributions(row.experimentalContributionByRule),
        critDamageContributions: compactContributions(row.critDamageContributionByRule),
        experimentalCritDamageContributions: compactContributions(row.experimentalCritDamageContributionByRule),
        chanceExpectedContributions: compactContributions(row.chanceContributionByRule),
        experimentalChanceExpectedContributions: compactContributions(row.experimentalChanceContributionByRule),
        attackSnapshotContributions: compactContributions(row.attackSnapshotContributionByRule),
        experimentalAttackSnapshotContributions: compactContributions(row.experimentalAttackSnapshotContributionByRule),
        files: [...row.files].sort(),
      };
    })
    .sort((left, right) => right.totalValue - left.totalValue || right.hits - left.hits);
}

function globalContributionRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    for (const contribution of asArray(row.candidateContributions)) {
      const key = contributionKey(contribution);
      const current = byKey.get(key) ?? {
        ...contribution,
        hits: 0,
        finalContribution: 0,
        decritContribution: 0,
        damageRows: new Set(),
      };
      current.hits += contribution.hits;
      current.finalContribution += contribution.finalContribution;
      current.decritContribution += contribution.decritContribution;
      current.damageRows.add(String(row.damageId));
      byKey.set(key, current);
    }
  }
  return [...byKey.values()]
    .map((row) => ({ ...row, damageRows: [...row.damageRows].sort((left, right) => Number(left) - Number(right)) }))
    .sort((left, right) => Math.abs(right.finalContribution) - Math.abs(left.finalContribution));
}

function validatedExperimentalToggles(rows, options) {
  const validations = [];
  for (const row of rows) {
    const contributionsByKey = new Map(row.experimentalContributions.map((item) => [contributionKey(item), item]));
    for (const test of row.experimentalToggleTests) {
      if ((test.activeHits ?? 0) < options.minToggleHits || (test.inactiveHits ?? 0) < options.minToggleHits) continue;
      if (test.deltaError === null || test.deltaError > options.toggleErrorLimit) continue;
      const contribution = contributionsByKey.get(test.key);
      validations.push({
        damageId: row.damageId,
        damageName: row.displayName,
        ruleId: contribution?.ruleId ?? test.key.split(":").slice(0, 2).join(":"),
        sourceId: contribution?.sourceId ?? null,
        label: test.label,
        proofType: "direct-percent-toggle",
        componentKey: test.componentKey,
        term: test.term,
        amount: test.amount,
        valueScope: contribution?.valueScope ?? null,
        rawText: contribution?.rawText ?? "",
        activeHits: test.activeHits,
        inactiveHits: test.inactiveHits,
        observedDelta: test.observedDelta,
        deltaError: test.deltaError,
        candidateFinalContribution: contribution?.finalContribution ?? 0,
        candidateDecritContribution: contribution?.decritContribution ?? 0,
        rowFinalDamage: row.totalValue,
        rowHits: row.hits,
        files: row.files,
        status: "experimental-toggle-validated",
      });
    }
  }
  return validations.sort(
    (left, right) =>
      (left.deltaError ?? Infinity) - (right.deltaError ?? Infinity) ||
      Math.abs(right.candidateFinalContribution) - Math.abs(left.candidateFinalContribution)
  );
}

function validatedCritDamageToggles(rows, options, mode = "safe") {
  const validations = [];
  const testField = mode === "experimental" ? "experimentalCritDamageSnapshotTests" : "critDamageSnapshotTests";
  const contributionField =
    mode === "experimental" ? "experimentalCritDamageContributions" : "critDamageContributions";
  for (const row of rows) {
    const contributionsByKey = new Map(asArray(row[contributionField]).map((item) => [contributionKey(item), item]));
    for (const test of asArray(row[testField])) {
      if ((test.activeHits ?? 0) < options.minToggleHits || (test.inactiveHits ?? 0) < options.minToggleHits) continue;
      if (test.deltaError === null || test.deltaError > options.toggleErrorLimit) continue;
      const contribution = contributionsByKey.get(test.key);
      validations.push({
        damageId: row.damageId,
        damageName: row.displayName,
        ruleId: contribution?.ruleId ?? test.key.split(":").slice(0, 2).join(":"),
        sourceId: contribution?.sourceId ?? null,
        label: test.label,
        proofType: mode === "experimental" ? "experimental-crit-damage-snapshot" : "crit-damage-snapshot",
        componentKey: test.componentKey,
        term: test.term,
        amount: test.amount,
        valueScope: contribution?.valueScope ?? null,
        rawText: contribution?.rawText ?? "",
        activeHits: test.activeHits,
        inactiveHits: test.inactiveHits,
        observedDelta: test.observedDelta,
        deltaError: test.deltaError,
        candidateFinalContribution: contribution?.finalContribution ?? 0,
        candidateDecritContribution: contribution?.decritContribution ?? 0,
        rowFinalDamage: row.totalValue,
        rowHits: row.hits,
        files: row.files,
        status:
          mode === "experimental" ? "experimental-crit-damage-toggle-validated" : "crit-damage-toggle-validated",
      });
    }
  }
  return validations.sort(
    (left, right) =>
      (left.deltaError ?? Infinity) - (right.deltaError ?? Infinity) ||
      Math.abs(right.candidateFinalContribution) - Math.abs(left.candidateFinalContribution)
  );
}

function validatedChanceToggles(rows, options, mode = "safe") {
  const validations = [];
  const testField = mode === "experimental" ? "experimentalChanceToggleTests" : "chanceToggleTests";
  const contributionField =
    mode === "experimental" ? "experimentalChanceExpectedContributions" : "chanceExpectedContributions";
  for (const row of rows) {
    if ((row.critHits ?? 0) <= 0) continue;
    const contributionsByKey = new Map(asArray(row[contributionField]).map((item) => [contributionKey(item), item]));
    for (const test of asArray(row[testField])) {
      if ((test.activeHits ?? 0) < options.minChanceToggleHits) continue;
      if ((test.inactiveHits ?? 0) < options.minChanceToggleHits) continue;
      if (((test.activeCrits ?? 0) + (test.inactiveCrits ?? 0)) <= 0) continue;
      if (test.deltaError === null || test.deltaError > options.chanceErrorLimit) continue;
      const contribution = contributionsByKey.get(test.key);
      validations.push({
        damageId: row.damageId,
        damageName: row.displayName,
        ruleId: contribution?.ruleId ?? test.key.split(":").slice(0, 2).join(":"),
        sourceId: contribution?.sourceId ?? null,
        label: test.label,
        proofType: mode === "experimental" ? "experimental-critical-rate-observed" : "critical-rate-observed",
        componentKey: test.componentKey,
        term: test.term,
        amount: test.amount,
        valueScope: contribution?.valueScope ?? null,
        rawText: contribution?.rawText ?? "",
        activeHits: test.activeHits,
        inactiveHits: test.inactiveHits,
        activeCrits: test.activeCrits,
        inactiveCrits: test.inactiveCrits,
        observedDelta: test.observedDelta,
        deltaError: test.deltaError,
        candidateFinalContribution: contribution?.finalContribution ?? 0,
        candidateDecritContribution: contribution?.decritContribution ?? 0,
        rowFinalDamage: row.totalValue,
        rowHits: row.hits,
        files: row.files,
        status:
          mode === "experimental" ? "experimental-critical-rate-toggle-validated" : "critical-rate-toggle-validated",
      });
    }
  }
  return validations.sort(
    (left, right) =>
      (left.deltaError ?? Infinity) - (right.deltaError ?? Infinity) ||
      Math.abs(right.candidateFinalContribution) - Math.abs(left.candidateFinalContribution)
  );
}

function validatedAttackSnapshotToggles(rows, options, mode = "safe") {
  const validations = [];
  const testField = mode === "experimental" ? "experimentalAttackSnapshotTests" : "attackSnapshotTests";
  const contributionField =
    mode === "experimental" ? "experimentalAttackSnapshotContributions" : "attackSnapshotContributions";
  for (const row of rows) {
    const contributionsByKey = new Map(asArray(row[contributionField]).map((item) => [contributionKey(item), item]));
    for (const test of asArray(row[testField])) {
      if ((test.activeHits ?? 0) < options.minAttackToggleHits) continue;
      if ((test.inactiveHits ?? 0) < options.minAttackToggleHits) continue;
      if (test.deltaError === null || test.deltaError > options.attackErrorLimit) continue;
      const contribution = contributionsByKey.get(test.key);
      validations.push({
        damageId: row.damageId,
        damageName: row.displayName,
        ruleId: contribution?.ruleId ?? test.key.split(":").slice(0, 2).join(":"),
        sourceId: contribution?.sourceId ?? null,
        label: test.label,
        proofType: mode === "experimental" ? "experimental-attack-snapshot" : "attack-snapshot",
        componentKey: test.componentKey,
        term: test.term,
        amount: test.amount,
        valueScope: contribution?.valueScope ?? null,
        rawText: contribution?.rawText ?? "",
        activeHits: test.activeHits,
        inactiveHits: test.inactiveHits,
        observedDelta: test.observedDelta,
        deltaError: test.deltaError,
        candidateFinalContribution: contribution?.finalContribution ?? 0,
        candidateDecritContribution: contribution?.decritContribution ?? 0,
        rowFinalDamage: row.totalValue,
        rowHits: row.hits,
        files: row.files,
        status:
          mode === "experimental" ? "experimental-attack-snapshot-validated" : "attack-snapshot-validated",
      });
    }
  }
  return validations.sort(
    (left, right) =>
      (left.deltaError ?? Infinity) - (right.deltaError ?? Infinity) ||
      Math.abs(right.candidateFinalContribution) - Math.abs(left.candidateFinalContribution)
  );
}

function buildReport(inputs, indexes, options) {
  const rows = new Map();
  const totals = {
    filesScanned: 0,
    filesWithoutSamples: 0,
    samplesScanned: 0,
    candidateFinalContribution: 0,
    candidateDecritContribution: 0,
    experimentalFinalContribution: 0,
    experimentalDecritContribution: 0,
    critDamageFinalContribution: 0,
    experimentalCritDamageFinalContribution: 0,
    chanceExpectedFinalContribution: 0,
    experimentalChanceExpectedFinalContribution: 0,
    attackSnapshotFinalContribution: 0,
    attackSnapshotDecritContribution: 0,
    experimentalAttackSnapshotFinalContribution: 0,
    experimentalAttackSnapshotDecritContribution: 0,
  };

  for (const input of inputs) {
    analyzeFile(input, indexes, rows, totals);
  }

  const damageRows = compactRows(rows, options);
  const contributionRows = globalContributionRows(damageRows);
  const experimentalContributionRows = globalContributionRows(
    damageRows.map((row) => ({ ...row, candidateContributions: row.experimentalContributions }))
  );
  const critDamageContributionRows = globalContributionRows(
    damageRows.map((row) => ({ ...row, candidateContributions: row.critDamageContributions }))
  );
  const experimentalCritDamageContributionRows = globalContributionRows(
    damageRows.map((row) => ({ ...row, candidateContributions: row.experimentalCritDamageContributions }))
  );
  const chanceExpectedContributionRows = globalContributionRows(
    damageRows
      .filter((row) => row.critHits > 0)
      .map((row) => ({ ...row, candidateContributions: row.chanceExpectedContributions }))
  );
  const experimentalChanceExpectedContributionRows = globalContributionRows(
    damageRows
      .filter((row) => row.critHits > 0)
      .map((row) => ({ ...row, candidateContributions: row.experimentalChanceExpectedContributions }))
  );
  const attackSnapshotContributionRows = globalContributionRows(
    damageRows.map((row) => ({ ...row, candidateContributions: row.attackSnapshotContributions }))
  );
  const experimentalAttackSnapshotContributionRows = globalContributionRows(
    damageRows.map((row) => ({ ...row, candidateContributions: row.experimentalAttackSnapshotContributions }))
  );
  const validatedExperimentalContributions = validatedExperimentalToggles(damageRows, options);
  const validatedCritDamageContributions = validatedCritDamageToggles(damageRows, options);
  const validatedExperimentalCritDamageContributions = validatedCritDamageToggles(damageRows, options, "experimental");
  const validatedChanceExpectedContributions = validatedChanceToggles(damageRows, options);
  const validatedExperimentalChanceExpectedContributions = validatedChanceToggles(damageRows, options, "experimental");
  const validatedAttackSnapshotContributions = validatedAttackSnapshotToggles(damageRows, options);
  const validatedExperimentalAttackSnapshotContributions = validatedAttackSnapshotToggles(damageRows, options, "experimental");
  return {
    generatedAt: new Date().toISOString(),
    inputs,
    semantics: {
      baseline: "final packet damage divided by captured crit multiplier and attack snapshot",
      stripped: "baseline additionally divided by unambiguous active direct percent replay candidates",
      contributionValues: "candidate source-on/source-off deltas for stripped terms only; not promoted unless row status is candidate-ready",
      experimentalValues: "ambiguous single-value percent hints are tested separately and remain promotion candidates only",
      criticalDamageValues: "crit-damage stats are validated against captured crit multiplier snapshots and only add final-damage contribution on crit hits",
      chanceValues: "crit-rate stats are expected-value contributions and require active/inactive observed crit-rate validation",
      attackValues: "attack stats are validated against captured attacker attack snapshots before final-damage contribution is promoted",
      blockedValues: "lucky chance, ambiguous stat values, mixed-term, and missing-component rows remain evidence-only",
    },
    summary: {
      filesScanned: totals.filesScanned,
      filesWithoutSamples: totals.filesWithoutSamples,
      samplesScanned: totals.samplesScanned,
      damageRowsObserved: damageRows.length,
      rowsWithStripCandidates: damageRows.filter((row) => row.stripHits > 0).length,
      rowsWithVariableStripFactors: damageRows.filter((row) => row.stripFactorDistinctValues > 1).length,
      rowsWithToggleTests: damageRows.filter((row) => row.toggleTests.length > 0).length,
      rowsWithExperimentalStripCandidates: damageRows.filter((row) => row.experimentalStripHits > 0).length,
      rowsWithExperimentalVariableStripFactors: damageRows.filter((row) => row.experimentalStripFactorDistinctValues > 1).length,
      rowsWithExperimentalToggleTests: damageRows.filter((row) => row.experimentalToggleTests.length > 0).length,
      rowsReadyForCoefficientCheck: damageRows.filter((row) => row.status === "candidate-ready-for-coefficient-check").length,
      candidateFinalContribution: totals.candidateFinalContribution,
      candidateDecritContribution: totals.candidateDecritContribution,
      candidateContributionSources: contributionRows.length,
      experimentalFinalContribution: totals.experimentalFinalContribution,
      experimentalDecritContribution: totals.experimentalDecritContribution,
      experimentalContributionSources: experimentalContributionRows.length,
      critDamageFinalContribution: totals.critDamageFinalContribution,
      critDamageContributionSources: critDamageContributionRows.length,
      experimentalCritDamageFinalContribution: totals.experimentalCritDamageFinalContribution,
      experimentalCritDamageContributionSources: experimentalCritDamageContributionRows.length,
      chanceExpectedFinalContribution: chanceExpectedContributionRows.reduce(
        (sum, row) => sum + row.finalContribution,
        0
      ),
      chanceExpectedContributionSources: chanceExpectedContributionRows.length,
      experimentalChanceExpectedFinalContribution: experimentalChanceExpectedContributionRows.reduce(
        (sum, row) => sum + row.finalContribution,
        0
      ),
      experimentalChanceExpectedContributionSources: experimentalChanceExpectedContributionRows.length,
      attackSnapshotFinalContribution: totals.attackSnapshotFinalContribution,
      attackSnapshotDecritContribution: totals.attackSnapshotDecritContribution,
      attackSnapshotContributionSources: attackSnapshotContributionRows.length,
      experimentalAttackSnapshotFinalContribution: totals.experimentalAttackSnapshotFinalContribution,
      experimentalAttackSnapshotDecritContribution: totals.experimentalAttackSnapshotDecritContribution,
      experimentalAttackSnapshotContributionSources: experimentalAttackSnapshotContributionRows.length,
      validatedExperimentalToggleRows: validatedExperimentalContributions.length,
      validatedExperimentalFinalContribution: validatedExperimentalContributions.reduce(
        (sum, row) => sum + row.candidateFinalContribution,
        0
      ),
      validatedExperimentalDecritContribution: validatedExperimentalContributions.reduce(
        (sum, row) => sum + row.candidateDecritContribution,
        0
      ),
      validatedCritDamageToggleRows: validatedCritDamageContributions.length,
      validatedCritDamageFinalContribution: validatedCritDamageContributions.reduce(
        (sum, row) => sum + row.candidateFinalContribution,
        0
      ),
      validatedExperimentalCritDamageToggleRows: validatedExperimentalCritDamageContributions.length,
      validatedExperimentalCritDamageFinalContribution: validatedExperimentalCritDamageContributions.reduce(
        (sum, row) => sum + row.candidateFinalContribution,
        0
      ),
      validatedChanceExpectedToggleRows: validatedChanceExpectedContributions.length,
      validatedChanceExpectedFinalContribution: validatedChanceExpectedContributions.reduce(
        (sum, row) => sum + row.candidateFinalContribution,
        0
      ),
      validatedExperimentalChanceExpectedToggleRows: validatedExperimentalChanceExpectedContributions.length,
      validatedExperimentalChanceExpectedFinalContribution: validatedExperimentalChanceExpectedContributions.reduce(
        (sum, row) => sum + row.candidateFinalContribution,
        0
      ),
      validatedAttackSnapshotToggleRows: validatedAttackSnapshotContributions.length,
      validatedAttackSnapshotFinalContribution: validatedAttackSnapshotContributions.reduce(
        (sum, row) => sum + row.candidateFinalContribution,
        0
      ),
      validatedAttackSnapshotDecritContribution: validatedAttackSnapshotContributions.reduce(
        (sum, row) => sum + row.candidateDecritContribution,
        0
      ),
      validatedExperimentalAttackSnapshotToggleRows: validatedExperimentalAttackSnapshotContributions.length,
      validatedExperimentalAttackSnapshotFinalContribution: validatedExperimentalAttackSnapshotContributions.reduce(
        (sum, row) => sum + row.candidateFinalContribution,
        0
      ),
      validatedExperimentalAttackSnapshotDecritContribution: validatedExperimentalAttackSnapshotContributions.reduce(
        (sum, row) => sum + row.candidateDecritContribution,
        0
      ),
    },
    damageRows,
    contributionRows,
    experimentalContributionRows,
    critDamageContributionRows,
    experimentalCritDamageContributionRows,
    chanceExpectedContributionRows,
    experimentalChanceExpectedContributionRows,
    attackSnapshotContributionRows,
    experimentalAttackSnapshotContributionRows,
    validatedExperimentalContributions,
    validatedCritDamageContributions,
    validatedExperimentalCritDamageContributions,
    validatedChanceExpectedContributions,
    validatedExperimentalChanceExpectedContributions,
    validatedAttackSnapshotContributions,
    validatedExperimentalAttackSnapshotContributions,
  };
}

function rollupValidatedSources(validations) {
  const byKey = new Map();
  for (const row of validations) {
    const key = `${row.proofType ?? row.status}:${row.ruleId}:${row.componentKey}:${row.term}:${row.amount}:${row.valueScope ?? ""}`;
    const current = byKey.get(key) ?? {
      ruleId: row.ruleId,
      sourceId: row.sourceId,
      label: row.label,
      proofType: row.proofType ?? row.status,
      componentKey: row.componentKey,
      term: row.term,
      amount: row.amount,
      valueScope: row.valueScope,
      rawText: row.rawText,
      validationStatus: row.status,
      validatedDamageRows: 0,
      activeHits: 0,
      inactiveHits: 0,
      finalContribution: 0,
      decritContribution: 0,
      maxDeltaError: 0,
      weightedObservedDeltaNumerator: 0,
      weightedObservedDeltaDenominator: 0,
      damageRows: [],
      files: new Set(),
    };
    current.validatedDamageRows += 1;
    current.activeHits += row.activeHits ?? 0;
    current.inactiveHits += row.inactiveHits ?? 0;
    current.finalContribution += row.candidateFinalContribution ?? 0;
    current.decritContribution += row.candidateDecritContribution ?? 0;
    current.maxDeltaError = Math.max(current.maxDeltaError, row.deltaError ?? 0);
    const weight = (row.activeHits ?? 0) + (row.inactiveHits ?? 0);
    if (row.observedDelta !== null && weight > 0) {
      current.weightedObservedDeltaNumerator += row.observedDelta * weight;
      current.weightedObservedDeltaDenominator += weight;
    }
    current.damageRows.push({
      damageId: row.damageId,
      damageName: row.damageName,
      activeHits: row.activeHits,
      inactiveHits: row.inactiveHits,
      observedDelta: row.observedDelta,
      deltaError: row.deltaError,
      finalContribution: row.candidateFinalContribution,
      decritContribution: row.candidateDecritContribution,
      rowFinalDamage: row.rowFinalDamage,
      rowHits: row.rowHits,
    });
    for (const file of asArray(row.files)) current.files.add(file);
    byKey.set(key, current);
  }

  return [...byKey.values()]
    .map((row) => ({
      ...row,
      weightedObservedDelta:
        row.weightedObservedDeltaDenominator > 0
          ? row.weightedObservedDeltaNumerator / row.weightedObservedDeltaDenominator
          : null,
      files: [...row.files].sort(),
      weightedObservedDeltaNumerator: undefined,
      weightedObservedDeltaDenominator: undefined,
    }))
    .sort((left, right) => Math.abs(right.finalContribution) - Math.abs(left.finalContribution));
}

function unvalidatedContributionRows(report) {
  const validatedKeys = new Set(
    report.validatedExperimentalContributions.map((row) => contributionKey(row))
  );
  return report.contributionRows
    .filter((row) => !validatedKeys.has(contributionKey(row)))
    .map((row) => ({
      ruleId: row.ruleId,
      sourceId: row.sourceId,
      label: row.label,
      componentKey: row.componentKey,
      term: row.term,
      amount: row.amount,
      hits: row.hits,
      candidateFinalContribution: row.finalContribution,
      candidateDecritContribution: row.decritContribution,
      reason: "no same-damage-row active/inactive toggle proof",
      damageRows: row.damageRows,
    }));
}

function buildDerivedContributionReport(report, options) {
  const promotedRows = [
    ...asArray(report.validatedExperimentalContributions),
    ...asArray(report.validatedCritDamageContributions),
    ...asArray(report.validatedExperimentalCritDamageContributions),
    ...asArray(report.validatedChanceExpectedContributions),
    ...asArray(report.validatedExperimentalChanceExpectedContributions),
    ...asArray(report.validatedAttackSnapshotContributions),
    ...asArray(report.validatedExperimentalAttackSnapshotContributions),
  ];
  const sourceRows = rollupValidatedSources(promotedRows);
  const unvalidatedRows = unvalidatedContributionRows(report);
  return {
    generatedAt: report.generatedAt,
    inputs: report.inputs,
    thresholds: {
      toggleErrorLimit: options.toggleErrorLimit,
      minToggleHits: options.minToggleHits,
      chanceErrorLimit: options.chanceErrorLimit,
      minChanceToggleHits: options.minChanceToggleHits,
      attackErrorLimit: options.attackErrorLimit,
      minAttackToggleHits: options.minAttackToggleHits,
      stabilityLimit: options.stabilityLimit,
    },
    semantics: {
      finalContribution:
        "net final packet damage attributable to removing the validated term from active hits only; crit-rate rows are expected-value contributions",
      decritContribution:
        "same validated term after dividing crit hits by the captured crit multiplier; useful before coefficient replay",
      promotionRule:
        "rows are included only when the same damage ID has active and inactive samples and observed delta is within threshold of the formula amount",
      notIncluded:
        "always-on candidates, unvalidated chance rows, unvalidated attack snapshot rows, mixed-term, missing-value, and failed-toggle rows stay out of this compact table",
    },
    summary: {
      validatedSources: sourceRows.length,
      validatedDamageRows: promotedRows.length,
      validatedFinalContribution: sourceRows.reduce((sum, row) => sum + row.finalContribution, 0),
      validatedDecritContribution: sourceRows.reduce((sum, row) => sum + row.decritContribution, 0),
      unvalidatedDirectPercentSources: unvalidatedRows.length,
    },
    sourceRows,
    damageRows: promotedRows,
    unvalidatedDirectPercentRows: unvalidatedRows,
  };
}

function renderDerivedMarkdown(derived, options) {
  const sourceTable = derived.sourceRows.slice(0, options.maxRows).map((row) => [
    row.label,
    row.proofType,
    row.ruleId,
    row.sourceId ?? "",
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    row.validatedDamageRows,
    `${row.activeHits}/${row.inactiveHits}`,
    row.weightedObservedDelta === null ? "" : formatPct(row.weightedObservedDelta, 2),
    formatPct(row.maxDeltaError, 2),
    formatNumber(row.finalContribution),
    formatNumber(row.decritContribution),
  ]);
  const damageTable = derived.damageRows.slice(0, options.maxRows).map((row) => [
    row.damageName || row.damageId,
    row.damageId,
    row.label,
    row.proofType ?? row.status,
    formatPct(row.amount, 2),
    `${row.activeHits}/${row.inactiveHits}`,
    row.observedDelta === null ? "" : formatPct(row.observedDelta, 2),
    row.deltaError === null ? "" : formatPct(row.deltaError, 2),
    formatNumber(row.candidateFinalContribution),
    formatNumber(row.candidateDecritContribution),
  ]);
  const blockedTable = derived.unvalidatedDirectPercentRows.slice(0, options.maxRows).map((row) => [
    row.label,
    row.ruleId,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    row.hits,
    formatNumber(row.candidateFinalContribution),
    row.reason,
  ]);

  return [
    "# Skill Modifier Derived Contributions",
    "",
    "This is the compact promotion table from the strip audit. It contains only modifier rows with same-damage-ID active/inactive proof. Direct-percent and attack-snapshot rows are deterministic; crit-rate rows are expected-value proof.",
    "",
    "## Summary",
    "",
    `- Validated sources: ${formatNumber(derived.summary.validatedSources)}`,
    `- Validated damage rows: ${formatNumber(derived.summary.validatedDamageRows)}`,
    `- Validated final contribution: ${formatNumber(derived.summary.validatedFinalContribution)}`,
    `- Validated decrit contribution: ${formatNumber(derived.summary.validatedDecritContribution)}`,
    `- Unvalidated direct percent sources kept out: ${formatNumber(derived.summary.unvalidatedDirectPercentSources)}`,
    "",
    "## Validated Source Rows",
    "",
    sourceTable.length
      ? markdownTable(
          [
            "Source",
            "Proof",
            "Rule",
            "Source ID",
            "Component",
            "Term",
            "Expected",
            "Damage Rows",
            "Active/Inactive Hits",
            "Weighted Observed",
            "Max Error",
            "Final Contribution",
            "Decrit Contribution",
          ],
          sourceTable
        )
      : "No modifier source has enough toggle evidence yet.",
    "",
    "## Validated Damage Rows",
    "",
    damageTable.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Source",
            "Proof",
            "Expected",
            "Active/Inactive Hits",
            "Observed Delta",
            "Abs Error",
            "Final Contribution",
            "Decrit Contribution",
          ],
          damageTable
        )
      : "No damage row met the validation thresholds.",
    "",
    "## Kept Out",
    "",
    blockedTable.length
      ? markdownTable(
          ["Source", "Rule", "Component", "Term", "Expected", "Hits", "Candidate Final Delta", "Reason"],
          blockedTable
        )
      : "No unvalidated direct percent rows were observed.",
    "",
    "## Inputs",
    "",
    ...derived.inputs.map((file) => `- ${file}`),
    "",
  ].join("\n");
}

function renderMarkdown(report, options) {
  const rowTable = report.damageRows.slice(0, options.maxRows).map((row) => [
    row.displayName || row.damageId,
    row.damageId,
    row.status,
    row.hits,
    formatNumber(row.totalValue),
    row.stripHits,
    row.stripFactorDistinctValues,
    row.before.spreadPct === null ? "" : formatPct(row.before.spreadPct),
    row.after.spreadPct === null ? "" : formatPct(row.after.spreadPct),
    row.experimentalAfter.spreadPct === null ? "" : formatPct(row.experimentalAfter.spreadPct),
    row.spreadDelta === null ? "" : formatPct(row.spreadDelta),
    row.experimentalSpreadDelta === null ? "" : formatPct(row.experimentalSpreadDelta),
    Object.entries(row.strippedTerms)
      .slice(0, 3)
      .map(([key, count]) => `${key} x${count}`)
      .join("; "),
    Object.entries(row.blockedReasons)
      .slice(0, 3)
      .map(([key, count]) => `${key} x${count}`)
      .join("; "),
    asArray(row.blockedActionDetails)
      .slice(0, 3)
      .map((item) => `${item.label || item.ruleId}: ${item.reason} x${item.hits}`)
      .join("; "),
  ]);

  const contributionTable = report.contributionRows.slice(0, options.maxRows).map((row) => [
    row.label,
    row.ruleId,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    row.hits,
    formatNumber(row.finalContribution),
    formatNumber(row.decritContribution),
    row.damageRows.slice(0, 6).join(", "),
  ]);
  const experimentalContributionTable = report.experimentalContributionRows.slice(0, options.maxRows).map((row) => [
    row.label,
    row.ruleId,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    row.hits,
    formatNumber(row.finalContribution),
    formatNumber(row.decritContribution),
    row.damageRows.slice(0, 6).join(", "),
  ]);
  const critDamageContributionTable = report.critDamageContributionRows.slice(0, options.maxRows).map((row) => [
    row.label,
    row.ruleId,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    row.hits,
    formatNumber(row.finalContribution),
    row.damageRows.slice(0, 6).join(", "),
  ]);
  const chanceContributionTable = report.chanceExpectedContributionRows.slice(0, options.maxRows).map((row) => [
    row.label,
    row.ruleId,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    row.hits,
    formatNumber(row.finalContribution),
    row.damageRows.slice(0, 6).join(", "),
  ]);
  const attackContributionTable = report.attackSnapshotContributionRows.slice(0, options.maxRows).map((row) => [
    row.label,
    row.ruleId,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    row.hits,
    formatNumber(row.finalContribution),
    formatNumber(row.decritContribution),
    row.damageRows.slice(0, 6).join(", "),
  ]);
  const experimentalAttackContributionTable = report.experimentalAttackSnapshotContributionRows
    .slice(0, options.maxRows)
    .map((row) => [
      row.label,
      row.ruleId,
      row.componentKey,
      row.term,
      formatPct(row.amount, 2),
      row.hits,
      formatNumber(row.finalContribution),
      formatNumber(row.decritContribution),
      row.damageRows.slice(0, 6).join(", "),
    ]);
  const validatedContributionTable = report.validatedExperimentalContributions.slice(0, options.maxRows).map((row) => [
    row.damageName || row.damageId,
    row.damageId,
    row.label,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    `${row.activeHits}/${row.inactiveHits}`,
    row.observedDelta === null ? "" : formatPct(row.observedDelta, 2),
    row.deltaError === null ? "" : formatPct(row.deltaError, 2),
    formatNumber(row.candidateFinalContribution),
    formatNumber(row.candidateDecritContribution),
  ]);
  const validatedCritDamageTable = report.validatedCritDamageContributions.slice(0, options.maxRows).map((row) => [
    row.damageName || row.damageId,
    row.damageId,
    row.label,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    `${row.activeHits}/${row.inactiveHits}`,
    row.observedDelta === null ? "" : formatPct(row.observedDelta, 2),
    row.deltaError === null ? "" : formatPct(row.deltaError, 2),
    formatNumber(row.candidateFinalContribution),
  ]);
  const validatedChanceTable = report.validatedChanceExpectedContributions.slice(0, options.maxRows).map((row) => [
    row.damageName || row.damageId,
    row.damageId,
    row.label,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    `${row.activeHits}/${row.inactiveHits}`,
    row.observedDelta === null ? "" : formatPct(row.observedDelta, 2),
    row.deltaError === null ? "" : formatPct(row.deltaError, 2),
    formatNumber(row.candidateFinalContribution),
  ]);
  const validatedAttackTable = report.validatedAttackSnapshotContributions.slice(0, options.maxRows).map((row) => [
    row.damageName || row.damageId,
    row.damageId,
    row.label,
    row.componentKey,
    row.term,
    formatPct(row.amount, 2),
    `${row.activeHits}/${row.inactiveHits}`,
    row.observedDelta === null ? "" : formatPct(row.observedDelta, 2),
    row.deltaError === null ? "" : formatPct(row.deltaError, 2),
    formatNumber(row.candidateFinalContribution),
    formatNumber(row.candidateDecritContribution),
  ]);
  const validatedExperimentalAttackTable = report.validatedExperimentalAttackSnapshotContributions
    .slice(0, options.maxRows)
    .map((row) => [
      row.damageName || row.damageId,
      row.damageId,
      row.label,
      row.componentKey,
      row.term,
      formatPct(row.amount, 2),
      `${row.activeHits}/${row.inactiveHits}`,
      row.observedDelta === null ? "" : formatPct(row.observedDelta, 2),
      row.deltaError === null ? "" : formatPct(row.deltaError, 2),
      formatNumber(row.candidateFinalContribution),
      formatNumber(row.candidateDecritContribution),
    ]);
  const renderSnapshotToggleTests = (field, emptyMessage) => {
    const toggleRows = report.damageRows
      .flatMap((row) =>
        asArray(row[field]).map((test) => [
          row.displayName || row.damageId,
          row.damageId,
          test.label,
          test.componentKey,
          test.term,
          formatPct(test.amount, 2),
          test.activeHits,
          test.inactiveHits,
          test.observedDelta === null ? "" : formatPct(test.observedDelta, 2),
          test.deltaError === null ? "" : formatPct(test.deltaError, 2),
        ])
      )
      .slice(0, options.maxRows);
    return toggleRows.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Source",
            "Component",
            "Term",
            "Expected",
            "Active Hits",
            "Inactive Hits",
            "Observed Snapshot Delta",
            "Abs Error",
          ],
          toggleRows
        )
      : emptyMessage;
  };

  return [
    "# Skill Active Modifier Strip Audit",
    "",
    "This report strips only active direct percent modifiers with unambiguous values. It is still an offline proof layer: candidate contribution values are not UI-safe until the stripped row becomes stable enough for coefficient validation.",
    "",
    "## Summary",
    "",
    `- Files scanned: ${report.summary.filesScanned}`,
    `- Files with no samples: ${report.summary.filesWithoutSamples}`,
    `- Hit samples scanned: ${formatNumber(report.summary.samplesScanned)}`,
    `- Damage rows observed: ${formatNumber(report.summary.damageRowsObserved)}`,
    `- Rows with strip candidates: ${formatNumber(report.summary.rowsWithStripCandidates)}`,
    `- Rows with variable strip factors: ${formatNumber(report.summary.rowsWithVariableStripFactors)}`,
    `- Rows with experimental strip candidates: ${formatNumber(report.summary.rowsWithExperimentalStripCandidates)}`,
    `- Rows with experimental variable strip factors: ${formatNumber(report.summary.rowsWithExperimentalVariableStripFactors)}`,
    `- Rows with experimental toggle tests: ${formatNumber(report.summary.rowsWithExperimentalToggleTests)}`,
    `- Rows ready for coefficient check: ${formatNumber(report.summary.rowsReadyForCoefficientCheck)}`,
    `- Candidate final contribution sum: ${formatNumber(report.summary.candidateFinalContribution)}`,
    `- Candidate decrit contribution sum: ${formatNumber(report.summary.candidateDecritContribution)}`,
    `- Experimental final contribution sum: ${formatNumber(report.summary.experimentalFinalContribution)}`,
    `- Experimental decrit contribution sum: ${formatNumber(report.summary.experimentalDecritContribution)}`,
    `- Crit-damage snapshot contribution sum: ${formatNumber(report.summary.critDamageFinalContribution)}`,
    `- Expected crit-rate contribution sum: ${formatNumber(report.summary.chanceExpectedFinalContribution)}`,
    `- Attack snapshot contribution sum: ${formatNumber(report.summary.attackSnapshotFinalContribution)}`,
    `- Experimental attack snapshot contribution sum: ${formatNumber(report.summary.experimentalAttackSnapshotFinalContribution)}`,
    `- Validated experimental toggle rows: ${formatNumber(report.summary.validatedExperimentalToggleRows)}`,
    `- Validated experimental final contribution: ${formatNumber(report.summary.validatedExperimentalFinalContribution)}`,
    `- Validated experimental decrit contribution: ${formatNumber(report.summary.validatedExperimentalDecritContribution)}`,
    `- Validated crit-damage snapshot rows: ${formatNumber(report.summary.validatedCritDamageToggleRows)}`,
    `- Validated crit-damage final contribution: ${formatNumber(report.summary.validatedCritDamageFinalContribution)}`,
    `- Validated expected crit-rate rows: ${formatNumber(report.summary.validatedChanceExpectedToggleRows)}`,
    `- Validated expected crit-rate contribution: ${formatNumber(report.summary.validatedChanceExpectedFinalContribution)}`,
    `- Validated attack snapshot rows: ${formatNumber(report.summary.validatedAttackSnapshotToggleRows)}`,
    `- Validated attack snapshot final contribution: ${formatNumber(report.summary.validatedAttackSnapshotFinalContribution)}`,
    `- Validated attack snapshot decrit contribution: ${formatNumber(report.summary.validatedAttackSnapshotDecritContribution)}`,
    `- Validated experimental attack snapshot rows: ${formatNumber(report.summary.validatedExperimentalAttackSnapshotToggleRows)}`,
    `- Validated experimental attack snapshot final contribution: ${formatNumber(report.summary.validatedExperimentalAttackSnapshotFinalContribution)}`,
    `- Validated experimental attack snapshot decrit contribution: ${formatNumber(report.summary.validatedExperimentalAttackSnapshotDecritContribution)}`,
    "",
    "## Damage Row Stability",
    "",
    rowTable.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Status",
            "Hits",
            "Final Sum",
            "Strip Hits",
            "Strip Factors",
            "Before Spread",
            "After Spread",
            "Exp After Spread",
            "Spread Delta",
            "Exp Spread Delta",
            "Stripped Terms",
            "Main Blockers",
            "Blocked Rule Details",
          ],
          rowTable
        )
      : "No damage rows were observed.",
    "",
    "## Candidate Contribution Deltas",
    "",
    contributionTable.length
      ? markdownTable(
          ["Source", "Rule", "Component", "Term", "Amount", "Hits", "Candidate Final Delta", "Candidate Decrit Delta", "Damage IDs"],
          contributionTable
        )
      : "No direct percent strip candidates were observed.",
    "",
    "## Experimental Contribution Deltas",
    "",
    experimentalContributionTable.length
      ? markdownTable(
          ["Source", "Rule", "Component", "Term", "Amount", "Hits", "Experimental Final Delta", "Experimental Decrit Delta", "Damage IDs"],
          experimentalContributionTable
        )
      : "No ambiguous single-value percent candidates were observed.",
    "",
    "## Crit-Damage Snapshot Deltas",
    "",
    critDamageContributionTable.length
      ? markdownTable(
          ["Source", "Rule", "Component", "Term", "Amount", "Crit Hits", "Final Delta", "Damage IDs"],
          critDamageContributionTable
        )
      : "No scoped critical-damage snapshot candidates were observed.",
    "",
    "## Expected Crit-Rate Deltas",
    "",
    chanceContributionTable.length
      ? markdownTable(
          ["Source", "Rule", "Component", "Term", "Amount", "Hits", "Expected Final Delta", "Damage IDs"],
          chanceContributionTable
        )
      : "No scoped critical-rate expected-value candidates were observed.",
    "",
    "## Attack Snapshot Deltas",
    "",
    attackContributionTable.length
      ? markdownTable(
          ["Source", "Rule", "Component", "Term", "Amount", "Hits", "Final Delta", "Decrit Delta", "Damage IDs"],
          attackContributionTable
        )
      : "No scoped attack snapshot candidates were observed.",
    "",
    "## Experimental Attack Snapshot Deltas",
    "",
    experimentalAttackContributionTable.length
      ? markdownTable(
          ["Source", "Rule", "Component", "Term", "Amount", "Hits", "Final Delta", "Decrit Delta", "Damage IDs"],
          experimentalAttackContributionTable
        )
      : "No ambiguous single-value attack snapshot candidates were observed.",
    "",
    "## Validated Experimental Toggle Contributions",
    "",
    validatedContributionTable.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Source",
            "Component",
            "Term",
            "Expected",
            "Active/Inactive Hits",
            "Observed Delta",
            "Abs Error",
            "Candidate Final Delta",
            "Candidate Decrit Delta",
          ],
          validatedContributionTable
        )
      : "No experimental toggle rows met the active/inactive hit and error thresholds.",
    "",
    "## Validated Crit-Damage Snapshot Contributions",
    "",
    validatedCritDamageTable.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Source",
            "Component",
            "Term",
            "Expected",
            "Active/Inactive Hits",
            "Observed Snapshot Delta",
            "Abs Error",
            "Candidate Final Delta",
          ],
          validatedCritDamageTable
        )
      : "No crit-damage snapshot rows met the active/inactive hit and error thresholds.",
    "",
    "## Validated Expected Crit-Rate Contributions",
    "",
    validatedChanceTable.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Source",
            "Component",
            "Term",
            "Expected",
            "Active/Inactive Hits",
            "Observed Crit-Rate Delta",
            "Abs Error",
            "Expected Final Delta",
          ],
          validatedChanceTable
        )
      : "No expected crit-rate rows met the active/inactive hit and error thresholds.",
    "",
    "## Validated Attack Snapshot Contributions",
    "",
    validatedAttackTable.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Source",
            "Component",
            "Term",
            "Expected",
            "Active/Inactive Hits",
            "Observed Snapshot Delta",
            "Abs Error",
            "Candidate Final Delta",
            "Candidate Decrit Delta",
          ],
          validatedAttackTable
        )
      : "No attack snapshot rows met the active/inactive hit and error thresholds.",
    "",
    "## Validated Experimental Attack Snapshot Contributions",
    "",
    validatedExperimentalAttackTable.length
      ? markdownTable(
          [
            "Damage Row",
            "Damage ID",
            "Source",
            "Component",
            "Term",
            "Expected",
            "Active/Inactive Hits",
            "Observed Snapshot Delta",
            "Abs Error",
            "Candidate Final Delta",
            "Candidate Decrit Delta",
          ],
          validatedExperimentalAttackTable
        )
      : "No experimental attack snapshot rows met the active/inactive hit and error thresholds.",
    "",
    "## Toggle Tests",
    "",
    (() => {
      const toggleRows = report.damageRows
        .flatMap((row) =>
          row.toggleTests.map((test) => [
            row.displayName || row.damageId,
            row.damageId,
            test.label,
            test.componentKey,
            test.term,
            formatPct(test.amount, 2),
            test.activeHits,
            test.inactiveHits,
            test.observedDelta === null ? "" : formatPct(test.observedDelta, 2),
            test.deltaError === null ? "" : formatPct(test.deltaError, 2),
          ])
        )
        .slice(0, options.maxRows);
      return toggleRows.length
        ? markdownTable(
            [
              "Damage Row",
              "Damage ID",
              "Source",
              "Component",
              "Term",
              "Expected",
              "Active Hits",
              "Inactive Hits",
              "Observed Delta",
              "Abs Error",
            ],
            toggleRows
          )
        : "No strip candidate had both active and inactive samples within the same damage row.";
    })(),
    "",
    "## Experimental Toggle Tests",
    "",
    (() => {
      const toggleRows = report.damageRows
        .flatMap((row) =>
          row.experimentalToggleTests.map((test) => [
            row.displayName || row.damageId,
            row.damageId,
            test.label,
            test.componentKey,
            test.term,
            formatPct(test.amount, 2),
            test.activeHits,
            test.inactiveHits,
            test.observedDelta === null ? "" : formatPct(test.observedDelta, 2),
            test.deltaError === null ? "" : formatPct(test.deltaError, 2),
          ])
        )
        .slice(0, options.maxRows);
      return toggleRows.length
        ? markdownTable(
            [
              "Damage Row",
              "Damage ID",
              "Source",
              "Component",
              "Term",
              "Expected",
              "Active Hits",
              "Inactive Hits",
              "Observed Delta",
              "Abs Error",
            ],
            toggleRows
          )
        : "No experimental strip candidate had both active and inactive samples within the same damage row.";
    })(),
    "",
    "## Attack Snapshot Toggle Tests",
    "",
    renderSnapshotToggleTests(
      "attackSnapshotTests",
      "No attack snapshot candidate had both active and inactive attack samples within the same damage row."
    ),
    "",
    "## Experimental Attack Snapshot Toggle Tests",
    "",
    renderSnapshotToggleTests(
      "experimentalAttackSnapshotTests",
      "No experimental attack snapshot candidate had both active and inactive attack samples within the same damage row."
    ),
    "",
    "## Inputs",
    "",
    ...report.inputs.map((file) => `- ${file}`),
    "",
  ].join("\n");
}

function writeReport(report, options) {
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.mkdirSync(path.dirname(options.outDerivedJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outDerivedMd), { recursive: true });
  const derived = buildDerivedContributionReport(report, options);
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(options.outMd, renderMarkdown(report, options));
  fs.writeFileSync(options.outDerivedJson, JSON.stringify(derived, null, 2));
  fs.writeFileSync(options.outDerivedMd, renderDerivedMarkdown(derived, options));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const inputs = options.inputs.length ? options.inputs : latestModifierEntityInputs(options);
  const indexes = buildIndexes();
  const report = buildReport(inputs, indexes, options);
  writeReport(report, options);

  console.log(`Files scanned: ${report.summary.filesScanned}`);
  console.log(`Hit samples scanned: ${report.summary.samplesScanned}`);
  console.log(`Damage rows observed: ${report.summary.damageRowsObserved}`);
  console.log(`Rows with strip candidates: ${report.summary.rowsWithStripCandidates}`);
  console.log(`Rows ready for coefficient check: ${report.summary.rowsReadyForCoefficientCheck}`);
  console.log(`Candidate final contribution sum: ${Math.round(report.summary.candidateFinalContribution)}`);
  console.log(`Validated experimental toggle rows: ${report.summary.validatedExperimentalToggleRows}`);
  console.log(`Validated crit-damage snapshot rows: ${report.summary.validatedCritDamageToggleRows}`);
  console.log(`Validated expected crit-rate rows: ${report.summary.validatedChanceExpectedToggleRows}`);
  console.log(`Validated attack snapshot rows: ${report.summary.validatedAttackSnapshotToggleRows}`);
  console.log(`Validated experimental attack snapshot rows: ${report.summary.validatedExperimentalAttackSnapshotToggleRows}`);
  console.log(`Output: ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Markdown: ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Derived output: ${path.relative(repoRoot, options.outDerivedJson)}`);
  console.log(`Derived markdown: ${path.relative(repoRoot, options.outDerivedMd)}`);
}

main();
