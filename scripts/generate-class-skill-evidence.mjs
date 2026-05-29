#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const BETA_ROOT = path.resolve(ROOT, "..");
const BPSR_ROOT = path.join(BETA_ROOT, "BPSR-UID-Extractors");

const CLASS_SKILL_CONFIG_PATH = path.join(ROOT, "parser-data/app-rules/class_skill_configs.json");
const SKILLNAMES_PATH = path.join(ROOT, "parser-data/generated/skillnames.json");
const LOCALES_ROOT = path.join(ROOT, "src/lib/locales");
const OUTPUT_PATH = path.join(ROOT, "parser-data/generated/ClassSkillEvidence.json");
const ICON_MANIFEST_PATH = path.join(BPSR_ROOT, "output/icons/IconManifest.json");

const NON_REAL_LOCALES = new Set(["design", "und", "unknown"]);
const CLASS_ICON_PREFIXES = {
  beat_performer: ["ui/textures/skill_weapon_jt/"],
  flame_berserker: ["ui/textures/skill_weapon_sf/"],
  frost_mage: ["ui/textures/skill_weapon_mz/"],
  heavy_guardian: ["ui/textures/skill_weapon_wr/"],
  marksman: ["ui/textures/skill_weapon_gj/"],
  shield_knight: ["ui/textures/skill_weapon_jd/"],
  stormblade: ["ui/textures/skill_weapon_tdl/"],
  verdant_oracle: ["ui/textures/skill_weapon_fh/"],
  wind_knight: ["ui/textures/skill_weapon_cq/"],
};
const SYSTEM_ICON_PATTERNS = [
  {
    reason: "system-parkour-icon",
    pattern: /(^|\/)mainui\/skill\/parkour_/i,
  },
  {
    reason: "aoyi-or-monster-skill-icon",
    pattern: /(^|\/)skill_aoyi\//i,
  },
];

const PLACEHOLDER_NAME_PATTERNS = [
  /SKILL[_\s-]*\d+/i,
  /(?:^|[^A-Za-z])(?:ATK|EXATK|AIRATK|UTR_SKILL|SPECIAL_SKILL)(?:[_\d]|$)/i,
  /废弃/,
  /^skill[_\s-]*\d+$/i,
  /^buff-source:\d+$/i,
  /^source:\d+$/i,
  /^#?\d+$/,
];

function readJson(filePath, fallback = undefined) {
  if (!fs.existsSync(filePath)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return typeof value === "string"
    ? value.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim()
    : "";
}

function normalizeIconValue(value) {
  return normalizeText(value).replace(/\\/g, "/").toLowerCase();
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))]
    .sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }));
}

function assetTokenFromPath(value) {
  const normalized = normalizeIconValue(value);
  if (!normalized) return "";
  const filename = normalized.split("/").pop() ?? "";
  const stem = filename.replace(/\.png$/i, "");
  return stem.replace(/_-?\d{6,}$/i, "");
}

function isPlaceholderName(value) {
  const text = normalizeText(value);
  if (!text) return true;
  return PLACEHOLDER_NAME_PATTERNS.some((pattern) => pattern.test(text));
}

function classifyName(entry) {
  if (!entry) {
    return {
      status: "missing-generated-entry",
      realLocaleCount: 0,
      placeholderLocales: [],
    };
  }

  const names = entry.Names && typeof entry.Names === "object" ? entry.Names : {};
  const localeEntries = Object.entries(names)
    .map(([locale, text]) => [locale, normalizeText(text)])
    .filter(([, text]) => text);
  const realLocaleEntries = localeEntries.filter(
    ([locale, text]) => !NON_REAL_LOCALES.has(locale) && !isPlaceholderName(text),
  );
  const designEntries = localeEntries.filter(
    ([locale, text]) => NON_REAL_LOCALES.has(locale) && !isPlaceholderName(text),
  );
  const placeholderLocales = localeEntries
    .filter(([, text]) => isPlaceholderName(text))
    .map(([locale]) => locale);

  if (realLocaleEntries.length) {
    return {
      status: "localized",
      realLocaleCount: realLocaleEntries.length,
      placeholderLocales,
    };
  }

  if (designEntries.length) {
    return {
      status: "design-only",
      realLocaleCount: 0,
      placeholderLocales,
    };
  }

  return {
    status: "placeholder-only",
    realLocaleCount: 0,
    placeholderLocales,
  };
}

function collectIconEvidence() {
  const byValue = new Map();
  const missingByValue = new Map();
  const topManifest = readJson(ICON_MANIFEST_PATH, {
    MissingAssets: [],
    GroupManifests: [],
  });

  for (const missing of topManifest.MissingAssets ?? []) {
    const key = normalizeIconValue(missing.Value);
    if (!key) continue;
    const list = missingByValue.get(key) ?? [];
    list.push({
      sourceFile: missing.SourceFile,
      sourceGroup: missing.SourceGroup,
      field: missing.Field,
      reason: missing.Reason,
      rows: missing.Rows ?? [],
    });
    missingByValue.set(key, list);
  }

  for (const group of topManifest.GroupManifests ?? []) {
    const manifestPath = path.join(path.dirname(ICON_MANIFEST_PATH), group.Manifest);
    const manifest = readJson(manifestPath, { Assets: [] });
    for (const asset of manifest.Assets ?? []) {
      const values = uniqueSorted([
        asset.Value,
        ...(Array.isArray(asset.Values) ? asset.Values : []),
      ]).map(normalizeIconValue);
      for (const value of values) {
        if (!value) continue;
        const list = byValue.get(value) ?? [];
        list.push({
          sourceFile: asset.SourceFile,
          sourceGroup: asset.SourceGroup,
          pngFile: asset.PngFile,
          pngExported: asset.PngExported === true,
          pngError: asset.PngError,
          resourceType: asset.ResourceType,
          matchKind: asset.MatchKind,
          bundleHash: asset.BundleHash,
          refCount: asset.RefCount,
          rows: asset.Rows ?? [],
        });
        byValue.set(value, list);
      }
    }
  }

  return { byValue, missingByValue };
}

function getIconStatus(iconPath, configuredImagePath, iconEvidence) {
  const normalized = normalizeIconValue(iconPath);
  const staticImageExists = configuredImagePath
    ? fs.existsSync(path.join(ROOT, "static", configuredImagePath.replace(/^\/+/, "")))
    : false;

  if (!normalized) {
    return {
      iconStatus: "no-generated-icon-path",
      staticImageStatus: staticImageExists ? "present" : "not-configured",
    };
  }

  const exported = iconEvidence.byValue.get(normalized) ?? [];
  if (exported.some((asset) => asset.pngExported)) {
    return {
      iconStatus: "exported",
      staticImageStatus: staticImageExists ? "present" : "not-configured",
      exportedPngFiles: uniqueSorted(exported.filter((asset) => asset.pngExported).map((asset) => asset.pngFile)),
      iconAssetSources: uniqueSorted(exported.map((asset) => asset.sourceGroup)),
    };
  }

  const missing = iconEvidence.missingByValue.get(normalized) ?? [];
  if (missing.length) {
    return {
      iconStatus: "missing-game-asset",
      staticImageStatus: staticImageExists ? "present" : "not-configured",
      missingReasons: uniqueSorted(missing.map((item) => item.reason)),
      missingSources: uniqueSorted(missing.map((item) => item.sourceGroup)),
      missingFields: uniqueSorted(missing.map((item) => item.field)).slice(0, 20),
    };
  }

  return {
    iconStatus: "not-in-icon-manifest",
    staticImageStatus: staticImageExists ? "present" : "not-configured",
  };
}

function loadSkillMonitorLocales() {
  const out = {};
  if (!fs.existsSync(LOCALES_ROOT)) return out;

  for (const entry of fs.readdirSync(LOCALES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const localePath = path.join(LOCALES_ROOT, entry.name, "ui/overlay/skill-monitor/skill-cd.json");
    if (fs.existsSync(localePath)) {
      out[entry.name] = readJson(localePath, {});
    }
  }

  return out;
}

function inferClassSkillPrefix(config) {
  const counts = new Map();
  for (const skill of config.skills ?? []) {
    const id = Number(skill.skillId);
    if (!Number.isFinite(id)) continue;
    const prefix = Math.trunc(id / 100);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null;
}

function collectUiNames(locales, classKey, skillId) {
  const key = `classSkill.${classKey}.${skillId}`;
  const names = {};
  for (const [locale, bundle] of Object.entries(locales)) {
    const value = normalizeText(bundle[key]);
    if (value) names[locale] = value;
  }
  return names;
}

function collectReviewContext(config) {
  const configuredAssetTokens = new Set();
  const derivedSkillIds = new Set();

  for (const skill of config.skills ?? []) {
    const token = assetTokenFromPath(skill.imagePath);
    if (token) configuredAssetTokens.add(token);
  }

  for (const derivation of config.derivations ?? []) {
    const derivedId = Number(derivation.derivedSkillId);
    if (Number.isFinite(derivedId)) derivedSkillIds.add(derivedId);
    const token = assetTokenFromPath(derivation.derivedImagePath);
    if (token) configuredAssetTokens.add(token);
  }

  return {
    configuredAssetTokens,
    derivedSkillIds,
  };
}

function classifyUnconfiguredReview({ classKey, skillId, iconPath, generatedEntry, reviewContext }) {
  const suppressions = [];
  const annotations = [];
  const normalizedIconPath = normalizeIconValue(iconPath);
  const assetToken = assetTokenFromPath(iconPath);
  const expectedPrefixes = CLASS_ICON_PREFIXES[classKey] ?? [];
  const sources = Array.isArray(generatedEntry?.Sources) ? generatedEntry.Sources : [];

  if (reviewContext.derivedSkillIds.has(Number(skillId))) {
    suppressions.push("covered-by-configured-derivation");
  }

  if (assetToken && reviewContext.configuredAssetTokens.has(assetToken)) {
    suppressions.push("duplicate-configured-icon");
  }

  for (const { reason, pattern } of SYSTEM_ICON_PATTERNS) {
    if (pattern.test(normalizedIconPath)) {
      suppressions.push(reason);
    }
  }

  if (
    normalizedIconPath &&
    expectedPrefixes.length &&
    !expectedPrefixes.some((prefix) => normalizedIconPath.startsWith(prefix))
  ) {
    suppressions.push("icon-family-mismatch");
  }

  if (sources.includes("MonsterTable.SkillPool")) {
    annotations.push("has-monster-skill-pool-source");
  }

  return {
    suppressions: uniqueSorted(suppressions),
    annotations: uniqueSorted(annotations),
  };
}

function buildSkillEvidence({
  classKey,
  skillId,
  configuredSkill,
  generatedEntry,
  locales,
  iconEvidence,
  reviewContext,
}) {
  const nameEvidence = classifyName(generatedEntry);
  const iconPath = normalizeText(generatedEntry?.IconPath);
  const configuredImagePath = normalizeText(configuredSkill?.imagePath);
  const iconStatus = getIconStatus(iconPath, configuredImagePath, iconEvidence);
  const uiNames = collectUiNames(locales, classKey, skillId);
  const isConfigured = Boolean(configuredSkill);
  const blockers = [];

  if (!isConfigured) {
    blockers.push("not-in-current-monitor-config");
  }
  if (nameEvidence.status === "placeholder-only") {
    blockers.push("placeholder-generated-name");
  } else if (nameEvidence.status === "missing-generated-entry") {
    blockers.push("missing-generated-name-entry");
  }
  if (iconStatus.iconStatus !== "exported" && iconStatus.staticImageStatus !== "present") {
    blockers.push(`icon-${iconStatus.iconStatus}`);
  }
  const evidenceBlockers = blockers.filter((blocker) => blocker !== "not-in-current-monitor-config");
  const review = isConfigured
    ? { suppressions: [], annotations: [] }
    : classifyUnconfiguredReview({ classKey, skillId, iconPath, generatedEntry, reviewContext });
  const evidenceStatus = isConfigured
    ? "configured-ready"
    : evidenceBlockers.length
      ? "blocked-generated-evidence"
      : review.suppressions.length
        ? "suppressed-unconfigured-candidate"
        : "reviewable-unconfigured-candidate";

  return {
    skillId,
    evidenceStatus,
    configStatus: isConfigured ? "configured" : "generated-base-candidate",
    ...(configuredSkill?.name ? { configuredName: configuredSkill.name } : {}),
    ...(configuredImagePath ? { configuredImagePath } : {}),
    ...(generatedEntry?.Name ? { generatedName: generatedEntry.Name } : {}),
    ...(generatedEntry?.Names ? { generatedNames: generatedEntry.Names } : {}),
    nameStatus: nameEvidence.status,
    realLocaleCount: nameEvidence.realLocaleCount,
    ...(nameEvidence.placeholderLocales.length
      ? { placeholderLocales: uniqueSorted(nameEvidence.placeholderLocales) }
      : {}),
    ...(Object.keys(uiNames).length ? { uiNames } : {}),
    ...(iconPath ? { generatedIconPath: iconPath } : {}),
    ...iconStatus,
    ...(generatedEntry?.Sources ? { nameSources: uniqueSorted(generatedEntry.Sources) } : {}),
    ...(generatedEntry?.IconSources ? { iconSources: uniqueSorted(generatedEntry.IconSources) } : {}),
    ...(generatedEntry?.SourceOffsets ? { sourceOffsets: generatedEntry.SourceOffsets } : {}),
    ...(blockers.length ? { blockers: uniqueSorted(blockers) } : {}),
    ...(review.suppressions.length ? { reviewSuppressions: review.suppressions } : {}),
    ...(review.annotations.length ? { reviewAnnotations: review.annotations } : {}),
  };
}

function main() {
  const configs = readJson(CLASS_SKILL_CONFIG_PATH);
  const skillnames = readJson(SKILLNAMES_PATH);
  const locales = loadSkillMonitorLocales();
  const iconEvidence = collectIconEvidence();
  const classes = {};
  const summary = {
    classCount: 0,
    configuredSkillCount: 0,
    generatedBaseCandidateCount: 0,
    unconfiguredGeneratedBaseCandidateCount: 0,
    reviewableUnconfiguredCandidateCount: 0,
    suppressedUnconfiguredCandidateCount: 0,
    blockedUnconfiguredCandidateCount: 0,
    configuredMissingStaticImages: 0,
    configuredMissingUiTranslations: 0,
    placeholderNameCandidates: 0,
    actionablePlaceholderNameCandidates: 0,
    blockedOrSuppressedPlaceholderNameCandidates: 0,
    missingGameAssetCandidates: 0,
    actionableMissingGameAssetCandidates: 0,
    blockedOrSuppressedMissingGameAssetCandidates: 0,
  };

  const generatedBaseSkillsByPrefix = new Map();
  for (const entry of Object.values(skillnames)) {
    const id = Number(entry?.Id);
    if (!Number.isFinite(id) || !entry?.IsBaseSkill) continue;
    const prefix = Math.trunc(id / 100);
    const list = generatedBaseSkillsByPrefix.get(prefix) ?? [];
    list.push(id);
    generatedBaseSkillsByPrefix.set(prefix, list);
  }

  for (const [classKey, config] of Object.entries(configs)) {
    summary.classCount += 1;
    const prefix = inferClassSkillPrefix(config);
    const configuredSkills = new Map((config.skills ?? []).map((skill) => [Number(skill.skillId), skill]));
    const reviewContext = collectReviewContext(config);
    const generatedIds = prefix === null ? [] : (generatedBaseSkillsByPrefix.get(prefix) ?? []);
    const allSkillIds = uniqueSorted([
      ...configuredSkills.keys(),
      ...generatedIds,
    ]).map(Number);
    const skillEvidence = {};

    for (const skillId of allSkillIds) {
      const evidence = buildSkillEvidence({
        classKey,
        skillId,
        configuredSkill: configuredSkills.get(skillId),
        generatedEntry: skillnames[String(skillId)],
        locales,
        iconEvidence,
        reviewContext,
      });

      skillEvidence[String(skillId)] = evidence;

      if (evidence.configStatus === "configured") {
        summary.configuredSkillCount += 1;
        if (evidence.staticImageStatus !== "present") summary.configuredMissingStaticImages += 1;
        if (!evidence.uiNames || !evidence.uiNames.en) summary.configuredMissingUiTranslations += 1;
      } else {
        summary.unconfiguredGeneratedBaseCandidateCount += 1;
        if (evidence.evidenceStatus === "reviewable-unconfigured-candidate") {
          summary.reviewableUnconfiguredCandidateCount += 1;
        } else if (evidence.evidenceStatus === "suppressed-unconfigured-candidate") {
          summary.suppressedUnconfiguredCandidateCount += 1;
        } else if (evidence.evidenceStatus === "blocked-generated-evidence") {
          summary.blockedUnconfiguredCandidateCount += 1;
        }
      }
      if (generatedIds.includes(skillId)) summary.generatedBaseCandidateCount += 1;
      if (evidence.nameStatus === "placeholder-only") {
        summary.placeholderNameCandidates += 1;
        if (evidence.configStatus === "configured" || evidence.evidenceStatus === "reviewable-unconfigured-candidate") {
          summary.actionablePlaceholderNameCandidates += 1;
        } else {
          summary.blockedOrSuppressedPlaceholderNameCandidates += 1;
        }
      }
      if (evidence.iconStatus === "missing-game-asset") {
        summary.missingGameAssetCandidates += 1;
        if (evidence.configStatus === "configured" || evidence.evidenceStatus === "reviewable-unconfigured-candidate") {
          summary.actionableMissingGameAssetCandidates += 1;
        } else {
          summary.blockedOrSuppressedMissingGameAssetCandidates += 1;
        }
      }
    }

    classes[classKey] = {
      classKey,
      classId: config.classId,
      skillPrefix: prefix,
      configuredSkillIds: uniqueSorted([...configuredSkills.keys()]).map(Number),
      generatedBaseSkillIds: uniqueSorted(generatedIds).map(Number),
      skills: skillEvidence,
    };
  }

  const out = {
    GeneratedBy: "scripts/generate-class-skill-evidence.mjs",
    Sources: {
      classSkillConfigs: path.relative(ROOT, CLASS_SKILL_CONFIG_PATH).replace(/\\/g, "/"),
      skillNames: path.relative(ROOT, SKILLNAMES_PATH).replace(/\\/g, "/"),
      iconManifest: path.relative(ROOT, ICON_MANIFEST_PATH).replace(/\\/g, "/"),
      skillMonitorLocales: path.relative(ROOT, LOCALES_ROOT).replace(/\\/g, "/"),
    },
    Summary: summary,
    Classes: classes,
  };

  writeJson(OUTPUT_PATH, out);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH).replace(/\\/g, "/")}`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
