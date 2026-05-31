#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const generatedRoot = path.join(repoRoot, "parser-data", "generated");
const defaultOutJson = path.join(repoRoot, "DEV_exports", "visible-localization-surfaces.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "visible-localization-surfaces.md");

const CJK_PATTERN = /[\u3400-\u9fff]/u;
const PLACEHOLDER_PATTERN = /\b(?:Unmapped|Unknown|Active)\s+(?:Buff|Skill|Source|Item|Monster|Scene)\s+\d+\b/i;
const SHIELD_PATTERN = /(?:护盾|護盾|盾|屏障|屏障护盾|Shield|Barrier)/i;
const ATTACK_LIKE_DAMAGE_KIND = /(?:Attack|Damage|MstSpSkill|HpReduce|Shield)/i;

const HARDCODED_RUNTIME_DESIGN_BUFF_FALLBACKS = new Set([
  "【S2套装4B】",
  "【S2套装4B】-子BUFF",
  "蓝花花护盾",
]);

function parseArgs(argv) {
  const options = {
    locale: "en",
    maxExamples: 80,
    outJson: defaultOutJson,
    outMd: defaultOutMd,
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
      case "--locale":
        options.locale = next();
        break;
      case "--max-examples":
        options.maxExamples = Number(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
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
  console.log(`Visible Localization Surface Audit

Usage:
  node scripts/audit-visible-localization-surfaces.mjs [options]

Options:
  --locale <code>         Target locale to test for visible leaks. Default: en
  --max-examples <count>  Markdown examples per surface. Default: 80
  --out-json <file>       JSON report path. Default: DEV_exports/visible-localization-surfaces.json
  --out-md <file>         Markdown report path. Default: DEV_exports/visible-localization-surfaces.md
  --help                  Show this help.
`);
}

function readJson(fileName, fallback = {}) {
  const filePath = path.join(generatedRoot, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasCjk(value) {
  return CJK_PATTERN.test(cleanText(value));
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERN.test(cleanText(value));
}

function isCjkLocale(locale) {
  return /^zh(?:-|$)/i.test(locale);
}

function isSafeVisibleText(value, locale) {
  const text = cleanText(value);
  if (!text || isPlaceholder(text)) return false;
  return isCjkLocale(locale) || !hasCjk(text);
}

function preferredLocaleText(map, locale, fallback = "") {
  if (!map || typeof map !== "object") return cleanText(fallback);
  for (const key of [locale, "en", "zh-CN", "zh-TW", "design"]) {
    const value = cleanText(map[key]);
    if (value) return value;
  }
  for (const value of Object.values(map)) {
    const text = cleanText(value);
    if (text) return text;
  }
  return cleanText(fallback);
}

function hasSafeLocaleText(map, locale) {
  if (!map || typeof map !== "object") return false;
  return isSafeVisibleText(map[locale], locale) || isSafeVisibleText(map.en, locale);
}

function isDesignOnlyMap(map) {
  if (!map || typeof map !== "object") return false;
  return Object.entries(map).every(([locale, value]) => locale === "design" || !cleanText(value));
}

function asEntries(data) {
  if (Array.isArray(data)) {
    return data.map((entry, index) => [String(entry?.Id ?? entry?.id ?? index), entry]);
  }
  return Object.entries(data ?? {});
}

function entryId(entryKey, entry) {
  return String(entry?.Id ?? entry?.id ?? entry?.sourceId ?? entry?.buffId ?? entryKey);
}

function makeDamageToRecount(recountTable) {
  const out = new Map();
  for (const group of Object.values(recountTable ?? {})) {
    for (const damageId of group?.DamageId ?? []) {
      out.set(String(damageId), group);
    }
  }
  return out;
}

function makeModifierSourceNamesByBuffId(modifierDisplayTable) {
  const out = new Map();
  for (const source of Object.values(modifierDisplayTable?.sourcesByRuleId ?? {})) {
    const match = /^buff-source:(\d+)$/.exec(cleanText(source?.sourceId));
    if (!match) continue;
    const sourceNames = source?.sourceNames;
    if (!sourceNames || typeof sourceNames !== "object") continue;
    out.set(match[1], sourceNames);
  }
  return out;
}

function addLinkedBuffId(map, buffId, damageId) {
  const id = Number(buffId);
  if (!Number.isFinite(id) || id <= 0) return;
  const key = String(id);
  const list = map.get(key) ?? [];
  list.push(damageId);
  map.set(key, list);
}

function makeDamageIdsByLinkedBuffId(damageAttrById) {
  const out = new Map();
  for (const [key, entry] of asEntries(damageAttrById)) {
    if (!entry || typeof entry !== "object") continue;
    const damageId = entryId(key, entry);
    addLinkedBuffId(out, entry.LinkedBuffId, damageId);
    addLinkedBuffId(out, entry.BuffSourceId, damageId);
    if (!entry.LinkedSource || entry.LinkedSource === "BuffName") {
      addLinkedBuffId(out, entry.LinkedId, damageId);
    }
  }
  return out;
}

function extractDesignDamageName(entry, detail) {
  if (entry && typeof entry === "object") {
    const direct = cleanText(entry.Names?.design)
      || cleanText(entry.Name)
      || cleanText(entry.DamageName);
    if (direct) return direct;
  }

  return cleanText(detail?.DamageNames?.design)
    || cleanText(detail?.UnderlyingSkillNames?.design)
    || cleanText(detail?.LinkedNames?.design)
    || cleanText(detail?.DamageName)
    || cleanText(detail?.UnderlyingSkillName)
    || cleanText(detail?.LinkedName);
}

function collectRuntimeCoverage() {
  const recountSource = readText(path.join(repoRoot, "src", "lib", "config", "recount-table.ts"));
  const buffSource = readText(path.join(repoRoot, "src", "lib", "config", "buff-name-table.ts"));

  const damageOverrideIds = new Set();
  const effectSourceOverrideIds = new Set();
  const buffIdFallbackIds = new Set();
  const designBuffFallbackLabels = new Set(HARDCODED_RUNTIME_DESIGN_BUFF_FALLBACKS);
  const exactMonsterSkillLabels = new Set();
  const monsterSkillTokenLabels = [];

  for (const match of recountSource.matchAll(/"(\d+)":\s*[A-Z0-9_]+_NAMES/g)) {
    damageOverrideIds.add(match[1]);
  }
  for (const match of recountSource.matchAll(/"((?:buff|damage|item|factor)-source:[^"]+)":\s*[A-Z0-9_]+_NAMES/g)) {
    effectSourceOverrideIds.add(match[1]);
  }
  for (const match of buffSource.matchAll(/^\s*(\d+):\s*[A-Z0-9_]+_NAMES/gm)) {
    buffIdFallbackIds.add(match[1]);
  }
  for (const match of buffSource.matchAll(/^\s*"([^"]+)":\s*\{/gm)) {
    const label = match[1];
    if (hasCjk(label)) designBuffFallbackLabels.add(label);
  }
  for (const match of recountSource.matchAll(/^\s*"([^"]+)":\s*\{\s*en:/gm)) {
    const label = match[1];
    if (hasCjk(label)) exactMonsterSkillLabels.add(label);
  }
  for (const match of recountSource.matchAll(/\[\s*"([^"]+)",\s*"([^"]+)"\s*\]/g)) {
    const [token, label] = [match[1], match[2]];
    if (hasCjk(token) && label && !hasCjk(label)) {
      monsterSkillTokenLabels.push([token, label]);
    }
  }
  monsterSkillTokenLabels.sort((left, right) => right[0].length - left[0].length);

  return {
    damageOverrideIds,
    effectSourceOverrideIds,
    buffIdFallbackIds,
    designBuffFallbackLabels,
    exactMonsterSkillLabels,
    monsterSkillTokenLabels,
  };
}

function normalizeMonsterSkillCandidate(value) {
  return cleanText(value)
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, " ");
}

function trimLikelyOwnerPrefix(value) {
  const normalized = normalizeMonsterSkillCandidate(value);
  const dashIndex = normalized.search(/[-_－—–:：]/u);
  if (dashIndex > 0 && dashIndex < normalized.length - 1) {
    return normalized.slice(dashIndex + 1).replace(/^[-_－—–:：\s]+/u, "").trim();
  }
  return normalized;
}

function translateMonsterSkillCandidate(value, runtime) {
  const normalized = normalizeMonsterSkillCandidate(value);
  if (!normalized || !hasCjk(normalized)) return undefined;
  if (runtime.exactMonsterSkillLabels.has(normalized)) return "exact-runtime-monster-skill-label";

  let translated = normalized
    .replace(/普攻0?(\d+)/g, " Basic Attack $1 ")
    .replace(/(\d+)连发/gi, " $1-Round Burst ")
    .replace(/(\d+)连/g, " $1-Hit ");

  for (const [token, label] of runtime.monsterSkillTokenLabels) {
    translated = translated.replaceAll(token, ` ${label} `);
  }

  translated = translated
    .replaceAll("(", " (")
    .replaceAll(")", ") ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  return translated && translated !== normalized && !hasCjk(translated)
    ? "token-runtime-monster-skill-label"
    : undefined;
}

function monsterSkillRuntimeCoverage(value, runtime) {
  for (const candidate of [value, trimLikelyOwnerPrefix(value)]) {
    const coveredBy = translateMonsterSkillCandidate(candidate, runtime);
    if (coveredBy) return coveredBy;
  }
  return undefined;
}

function resolveEffectSourceApprox(sourceId, effectSourcesById, runtime, locale) {
  if (runtime.effectSourceOverrideIds.has(sourceId)) {
    return { text: sourceId, safe: true, coveredBy: "runtime-effect-source-override" };
  }

  const source = effectSourcesById[sourceId];
  const text = preferredLocaleText(source?.sourceNames, locale, source?.sourceName);
  if (hasSafeLocaleText(source?.sourceNames, locale)) {
    return { text, safe: true, coveredBy: "generated-effect-source-locale" };
  }
  return { text, safe: isSafeVisibleText(text, locale), coveredBy: null };
}

function linkedBuffSourceIds(entry, detail) {
  const ids = new Set();
  const addBuffId = (value) => {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue > 0) ids.add(`buff-source:${numberValue}`);
  };

  if (entry && typeof entry === "object") {
    addBuffId(entry.BuffSourceId);
    addBuffId(entry.LinkedBuffId);
    if (!entry.LinkedSource || entry.LinkedSource === "BuffName") addBuffId(entry.LinkedId);
  }
  if (detail && typeof detail === "object") {
    addBuffId(detail.BuffSourceId);
    addBuffId(detail.LinkedBuffId);
    if (!detail.LinkedSource || detail.LinkedSource === "BuffName") addBuffId(detail.LinkedId);
  }

  return Array.from(ids);
}

function resolveDamageNameApprox(id, entry, detail, context) {
  const { locale, runtime, recountTable, damageToRecount, effectSourcesById, monsterMode } = context;

  if (runtime.damageOverrideIds.has(id)) {
    return { text: id, safe: true, coveredBy: "runtime-damage-id-override" };
  }

  const designName = extractDesignDamageName(entry, detail);
  if (monsterMode && designName) {
    const monsterCoverage = monsterSkillRuntimeCoverage(designName, runtime);
    if (monsterCoverage) {
      return { text: designName, safe: true, coveredBy: monsterCoverage };
    }
  }

  const recount = damageToRecount.get(id);
  if (recount) {
    const recountName = preferredLocaleText(recount.Names, locale, recount.RecountName);
    if (isSafeVisibleText(recountName, locale)) {
      return { text: recountName, safe: true, coveredBy: "recount-damage-id-bridge" };
    }
    return { text: recountName, safe: false, coveredBy: null };
  }

  const sameIdRecount = recountTable[id];
  if (sameIdRecount && (!entry || typeof entry !== "object" || isDesignOnlyMap(entry.Names))) {
    const sameIdName = preferredLocaleText(sameIdRecount.Names, locale, sameIdRecount.RecountName);
    if (isSafeVisibleText(sameIdName, locale)) {
      return { text: sameIdName, safe: true, coveredBy: "same-id-recount-bridge" };
    }
  }

  const directName = preferredLocaleText(entry?.Names, locale, entry?.Name ?? entry?.DamageName);
  if (directName && !isDesignOnlyMap(entry?.Names) && isSafeVisibleText(directName, locale)) {
    return { text: directName, safe: true, coveredBy: "generated-damage-locale" };
  }

  for (const sourceId of linkedBuffSourceIds(entry, detail)) {
    const sourceResult = resolveEffectSourceApprox(sourceId, effectSourcesById, runtime, locale);
    if (sourceResult.safe) return sourceResult;
  }

  return {
    text: directName || designName || `Unknown (${id})`,
    safe: isSafeVisibleText(directName || designName, locale),
    coveredBy: null,
  };
}

function resolveBuffNameApprox(id, entry, context) {
  const { locale, runtime, modifierSourceNamesByBuffId } = context;
  const designName = cleanText(entry?.Names?.design)
    || cleanText(entry?.DesignName)
    || cleanText(entry?.NameDesign)
    || cleanText(entry?.Name);

  if (runtime.buffIdFallbackIds.has(id)) {
    return { text: id, safe: true, coveredBy: "runtime-buff-id-fallback" };
  }
  if (runtime.designBuffFallbackLabels.has(designName)) {
    return { text: designName, safe: true, coveredBy: "runtime-design-buff-fallback" };
  }

  const generatedName = preferredLocaleText(entry?.Names, locale, designName);
  if (hasSafeLocaleText(entry?.Names, locale)) {
    return { text: generatedName, safe: true, coveredBy: "generated-buff-locale" };
  }

  const modifierNames = modifierSourceNamesByBuffId.get(id);
  const modifierName = preferredLocaleText(modifierNames, locale);
  if (hasSafeLocaleText(modifierNames, locale)) {
    return { text: modifierName, safe: true, coveredBy: "modifier-display-source-bridge" };
  }

  return {
    text: generatedName || designName || `#${id}`,
    safe: isSafeVisibleText(generatedName || designName, locale),
    coveredBy: null,
  };
}

function issue(surface, priority, id, label, reason, details = {}) {
  return {
    surface,
    priority,
    id,
    label: cleanText(label),
    reason,
    ...details,
  };
}

function isLikelyVisibleDamage(entry, detail) {
  const kind = cleanText(entry?.DamageKind ?? detail?.DamageKind);
  return ATTACK_LIKE_DAMAGE_KIND.test(kind);
}

function analyzeDeathReplay(data, context) {
  const issues = [];
  const covered = [];

  for (const [key, entry] of asEntries(data.damageAttrById)) {
    if (!entry || typeof entry !== "object") continue;
    const id = entryId(key, entry);
    const detail = data.skillDetailsById[id];
    const designName = extractDesignDamageName(entry, detail);
    if (!hasCjk(designName) || !isLikelyVisibleDamage(entry, detail)) continue;

    const resolved = resolveDamageNameApprox(id, entry, detail, { ...context, monsterMode: true });
    if (resolved.safe) {
      if (resolved.coveredBy) covered.push({ id, designName, coveredBy: resolved.coveredBy });
      continue;
    }

    const priority = detail?.MonsterOwnerNames || monsterSkillRuntimeCoverage(designName, context.runtime)
      ? "P1"
      : "P2";
    issues.push(issue(
      "deathReplaySkill",
      priority,
      id,
      resolved.text || designName,
      "Incoming damage can show this damage-name path in death replay, and no generated/runtime target-locale label covers it.",
      {
        designName,
        damageKind: entry.DamageKind ?? detail?.DamageKind ?? null,
        linkedSource: entry.LinkedSource ?? detail?.LinkedSource ?? null,
        linkedId: entry.LinkedId ?? detail?.LinkedId ?? null,
        iconPath: entry.IconPath ?? detail?.IconPath ?? null,
      },
    ));
  }

  return { issues, covered };
}

function analyzeShieldDetails(data, context) {
  const issues = [];
  const covered = [];

  for (const [key, entry] of asEntries(data.buffNamesById)) {
    if (!entry || typeof entry !== "object") continue;
    const id = entryId(key, entry);
    const designName = cleanText(entry.Names?.design)
      || cleanText(entry.DesignName)
      || cleanText(entry.NameDesign)
      || cleanText(entry.Name);
    if (!hasCjk(designName)) continue;

    const linkedDamageIds = data.damageIdsByLinkedBuffId.get(id) ?? [];
    const linkedDamageEntries = linkedDamageIds
      .map((damageId) => data.damageAttrById[damageId])
      .filter(Boolean);
    const looksShield = SHIELD_PATTERN.test(designName)
      || linkedDamageEntries.some((damageEntry) =>
        SHIELD_PATTERN.test(cleanText(damageEntry?.Name) || cleanText(damageEntry?.Names?.design))
        || SHIELD_PATTERN.test(cleanText(damageEntry?.DamageKind))
      );
    if (!looksShield) continue;

    const resolved = resolveBuffNameApprox(id, entry, context);
    if (resolved.safe) {
      if (resolved.coveredBy) covered.push({ id, designName, coveredBy: resolved.coveredBy });
      continue;
    }

    issues.push(issue(
      "shieldDetailBuff",
      "P1",
      id,
      resolved.text || designName,
      "Overlay health/shield detail rows can use this buff label, but it has no generated/runtime target-locale fallback.",
      {
        designName,
        linkedDamageIds: linkedDamageIds.slice(0, 12),
      },
    ));
  }

  return { issues, covered };
}

function analyzeHistoryBreakdown(data, context) {
  const issues = [];
  const covered = [];

  for (const [key, detail] of asEntries(data.skillDetailsById)) {
    if (!detail || typeof detail !== "object") continue;
    const id = entryId(key, detail);
    const entry = data.damageAttrById[id];
    const displayName = preferredLocaleText(detail.DisplayNames, context.locale, detail.DisplayName);
    const displayIsCjk = hasCjk(displayName) || (isDesignOnlyMap(detail.DisplayNames) && hasCjk(detail.DisplayNames?.design));
    const hoverCandidates = [
      ["DamageNames", preferredLocaleText(detail.DamageNames, context.locale, detail.DamageName)],
      ["LinkedNames", preferredLocaleText(detail.LinkedNames, context.locale, detail.LinkedName)],
      ["DisplayDetailNames", preferredLocaleText(detail.DisplayDetailNames, context.locale, detail.DisplayDetailName)],
      ["DisplayVariantNames", preferredLocaleText(detail.DisplayVariantNames, context.locale, detail.DisplayVariantName)],
    ].filter(([, value]) => hasCjk(value));

    if (!displayIsCjk && hoverCandidates.length === 0) continue;

    const resolved = resolveDamageNameApprox(id, entry, detail, { ...context, monsterMode: false });
    const hasSafeDisplay = hasSafeLocaleText(detail.DisplayNames, context.locale);
    const mainCovered = hasSafeDisplay || resolved.safe;
    const unsafeHoverFields = hoverCandidates.filter(([field]) => {
      const map = detail[field];
      if (hasSafeLocaleText(map, context.locale)) return false;
      if ((field === "DamageNames" || field === "LinkedNames") && resolved.safe) return false;
      return true;
    });

    if (mainCovered && unsafeHoverFields.length === 0) {
      if (resolved.coveredBy) covered.push({ id, designName: displayName, coveredBy: resolved.coveredBy });
      continue;
    }

    issues.push(issue(
      "historyBreakdownSkill",
      unsafeHoverFields.length ? "P2" : "P1",
      id,
      mainCovered ? unsafeHoverFields.map(([, value]) => value).join("; ") : resolved.text || displayName,
      unsafeHoverFields.length
        ? "Skill breakdown hover/detail fields can still expose design-only CN text."
        : "Skill breakdown main row can still expose design-only CN text.",
      {
        displayName,
        category: detail.Category ?? null,
        sourceKind: detail.SourceKind ?? null,
        sourceType: detail.SourceType ?? null,
        sourceRole: detail.SourceRole ?? null,
        damageKind: detail.DamageKind ?? entry?.DamageKind ?? null,
        unsafeHoverFields: unsafeHoverFields.map(([field, value]) => ({ field, value })),
      },
    ));
  }

  return { issues, covered };
}

function analyzeEffectSources(data, context) {
  const issues = [];
  const covered = [];

  for (const [sourceId, source] of Object.entries(data.effectSourcesById ?? {})) {
    const designName = cleanText(source?.sourceNames?.design) || cleanText(source?.sourceName);
    if (!hasCjk(designName)) continue;

    const resolved = resolveEffectSourceApprox(sourceId, data.effectSourcesById, context.runtime, context.locale);
    if (resolved.safe) {
      if (resolved.coveredBy) covered.push({ id: sourceId, designName, coveredBy: resolved.coveredBy });
      continue;
    }

    const targetCount = Array.isArray(source?.targets) ? source.targets.length : 0;
    issues.push(issue(
      "effectSource",
      targetCount > 0 ? "P1" : "P2",
      sourceId,
      resolved.text || designName,
      "Effect/source attribution rows can use this source label, but it only has placeholder or design-only target-locale text.",
      {
        designName,
        sourceKind: source?.sourceKind ?? null,
        sourceType: source?.sourceType ?? null,
        sourceRole: source?.sourceRole ?? null,
        targetCount,
        targetSamples: (source?.targets ?? []).slice(0, 8),
      },
    ));
  }

  return { issues, covered };
}

function priorityWeight(priority) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[priority] ?? 9;
}

function sortIssues(issues) {
  return [...issues].sort((left, right) =>
    priorityWeight(left.priority) - priorityWeight(right.priority)
    || String(left.surface).localeCompare(String(right.surface))
    || String(left.id).localeCompare(String(right.id), "en", { numeric: true })
  );
}

function summarizeIssues(issuesBySurface, coveredBySurface) {
  const summary = {};
  for (const [surface, issues] of Object.entries(issuesBySurface)) {
    const byPriority = {};
    for (const item of issues) {
      byPriority[item.priority] = (byPriority[item.priority] ?? 0) + 1;
    }
    summary[surface] = {
      issues: issues.length,
      byPriority,
      runtimeCoveredSamples: coveredBySurface[surface]?.length ?? 0,
    };
  }
  summary.totalIssues = Object.values(issuesBySurface).reduce((sum, list) => sum + list.length, 0);
  return summary;
}

function markdownCell(value) {
  const text = cleanText(value)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|");
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function formatIssueTable(title, issues, maxExamples) {
  const lines = [
    `## ${title}`,
    "",
  ];

  if (issues.length === 0) {
    lines.push("No visible target-locale leaks found for this surface.", "");
    return lines;
  }

  lines.push(`Showing ${Math.min(maxExamples, issues.length).toLocaleString("en-US")} of ${issues.length.toLocaleString("en-US")} candidates. Full detail is in the JSON report.`, "");
  lines.push("| Priority | ID | Label | Reason |");
  lines.push("| --- | ---: | --- | --- |");
  for (const item of issues.slice(0, maxExamples)) {
    lines.push(`| ${item.priority} | ${markdownCell(item.id)} | ${markdownCell(item.label)} | ${markdownCell(item.reason)} |`);
  }
  lines.push("");
  return lines;
}

function writeReport(report, options) {
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const lines = [
    "# Visible Localization Surface Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Locale: ${report.locale}`,
    "",
    "This report filters broad generated locale gaps down to strings that can plausibly appear in user-visible parser surfaces. Runtime overrides/fallbacks are counted as covered so this does not re-report labels already patched in code.",
    "",
    "## Summary",
    "",
    "| Surface | Issues | P1 | P2 | Runtime-covered samples |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];

  for (const surface of ["deathReplaySkill", "shieldDetailBuff", "historyBreakdownSkill", "effectSource"]) {
    const item = report.summary[surface] ?? { issues: 0, byPriority: {}, runtimeCoveredSamples: 0 };
    lines.push(`| ${surface} | ${item.issues ?? 0} | ${item.byPriority?.P1 ?? 0} | ${item.byPriority?.P2 ?? 0} | ${item.runtimeCoveredSamples ?? 0} |`);
  }
  lines.push("", `Total issues: ${report.summary.totalIssues.toLocaleString("en-US")}`, "");

  lines.push(...formatIssueTable("Death Replay Skills", report.issuesBySurface.deathReplaySkill, options.maxExamples));
  lines.push(...formatIssueTable("Overlay Shield Detail Buffs", report.issuesBySurface.shieldDetailBuff, options.maxExamples));
  lines.push(...formatIssueTable("History/Breakdown Skills", report.issuesBySurface.historyBreakdownSkill, options.maxExamples));
  lines.push(...formatIssueTable("Effect Sources", report.issuesBySurface.effectSource, options.maxExamples));

  fs.writeFileSync(options.outMd, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const data = {
    damageAttrById: readJson("DamageAttrIdName.json"),
    skillDetailsById: readJson("SkillBreakdownDetails.json"),
    buffNamesById: readJson("BuffName.json"),
    recountTable: readJson("RecountTable.json"),
    effectSourcesById: readJson("EffectSources.json").effectSourcesById ?? {},
    modifierDisplayTable: readJson("ModifierDisplayTable.json"),
  };
  data.damageToRecount = makeDamageToRecount(data.recountTable);
  data.modifierSourceNamesByBuffId = makeModifierSourceNamesByBuffId(data.modifierDisplayTable);
  data.damageIdsByLinkedBuffId = makeDamageIdsByLinkedBuffId(data.damageAttrById);

  const runtime = collectRuntimeCoverage();
  const context = {
    locale: options.locale,
    runtime,
    recountTable: data.recountTable,
    damageToRecount: data.damageToRecount,
    effectSourcesById: data.effectSourcesById,
    modifierSourceNamesByBuffId: data.modifierSourceNamesByBuffId,
  };

  const deathReplay = analyzeDeathReplay(data, context);
  const shieldDetails = analyzeShieldDetails(data, context);
  const historyBreakdown = analyzeHistoryBreakdown(data, context);
  const effectSources = analyzeEffectSources(data, context);

  const issuesBySurface = {
    deathReplaySkill: sortIssues(deathReplay.issues),
    shieldDetailBuff: sortIssues(shieldDetails.issues),
    historyBreakdownSkill: sortIssues(historyBreakdown.issues),
    effectSource: sortIssues(effectSources.issues),
  };
  const coveredBySurface = {
    deathReplaySkill: deathReplay.covered,
    shieldDetailBuff: shieldDetails.covered,
    historyBreakdownSkill: historyBreakdown.covered,
    effectSource: effectSources.covered,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    locale: options.locale,
    summary: summarizeIssues(issuesBySurface, coveredBySurface),
    runtimeCoverage: {
      damageOverrideIds: Array.from(runtime.damageOverrideIds).sort((a, b) => Number(a) - Number(b)),
      effectSourceOverrideIds: Array.from(runtime.effectSourceOverrideIds).sort(),
      buffIdFallbackIds: Array.from(runtime.buffIdFallbackIds).sort((a, b) => Number(a) - Number(b)),
      designBuffFallbackLabels: Array.from(runtime.designBuffFallbackLabels).sort(),
      exactMonsterSkillLabels: runtime.exactMonsterSkillLabels.size,
      monsterSkillTokenLabels: runtime.monsterSkillTokenLabels.length,
    },
    issuesBySurface,
    coveredBySurface,
  };

  writeReport(report, options);

  console.log(`Visible localization surface audit wrote:`);
  console.log(`  ${path.relative(repoRoot, options.outMd)}`);
  console.log(`  ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Total issues: ${report.summary.totalIssues.toLocaleString("en-US")}`);
}

main();
