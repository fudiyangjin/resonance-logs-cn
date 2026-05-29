#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const LOCALES_ROOT = path.join(ROOT, "src/lib/locales");

const CONFIG_PATH = path.join(ROOT, "parser-data/app-rules/class_skill_configs.json");
const SKILLNAMES_PATH = path.join(ROOT, "parser-data/generated/skillnames.json");
const CLASS_LABELS_PATH = path.join(ROOT, "parser-data/generated/class-labels.json");
const MANIFEST_PATH = path.join(LOCALES_ROOT, "manifest.json");

const CLASS_LABEL_KEYS = {
  beat_performer: "class.Beat Performer",
  flame_berserker: "class.Flame Berserker",
  frost_mage: "class.Frost Mage",
  heavy_guardian: "class.Heavy Guardian",
  marksman: "class.Marksman",
  shield_knight: "class.Shield Knight",
  stormblade: "class.Stormblade",
  verdant_oracle: "class.Verdant Oracle",
  wind_knight: "class.Wind Knight",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return typeof value === "string"
    ? value.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim()
    : "";
}

function pickLocalizedName(names, locale, fallback, currentValue = "") {
  const candidates = [
    names?.[locale],
    locale === "en" ? undefined : names?.en,
    currentValue,
    locale === "en" ? fallback : undefined,
    locale === "en" ? undefined : names?.["zh-CN"],
    ...(locale === "en"
      ? []
      : Object.entries(names ?? [])
          .filter(([key]) => !["design", "und", "unknown"].includes(key))
          .map(([, value]) => value)),
    fallback,
  ];

  return candidates.map(normalizeText).find(Boolean) ?? "";
}

function setIfChanged(bundle, key, value) {
  if (!value || bundle[key] === value) return false;
  bundle[key] = value;
  return true;
}

function main() {
  const configs = readJson(CONFIG_PATH);
  const skillnames = readJson(SKILLNAMES_PATH);
  const classLabels = readJson(CLASS_LABELS_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const locales = manifest.locales ?? [];
  const changedByLocale = {};

  for (const locale of locales) {
    const filePath = path.join(LOCALES_ROOT, locale, "ui/overlay/skill-monitor/skill-cd.json");
    const bundle = readJson(filePath);
    let changed = 0;

    for (const [classKey, config] of Object.entries(configs)) {
      const labelKey = CLASS_LABEL_KEYS[classKey];
      const classNameKey = `className.${classKey}`;
      const className = pickLocalizedName(classLabels[labelKey], locale, config.className, bundle[classNameKey]);
      if (setIfChanged(bundle, classNameKey, className)) changed += 1;

      for (const skill of config.skills ?? []) {
        const entry = skillnames[String(skill.skillId)];
        const key = `classSkill.${classKey}.${skill.skillId}`;
        const name = pickLocalizedName(entry?.Names, locale, skill.name, bundle[key]);
        if (setIfChanged(bundle, key, name)) changed += 1;
      }

      for (const derivation of config.derivations ?? []) {
        const entry = skillnames[String(derivation.derivedSkillId)];
        const key = `classSkillDerived.${classKey}.${derivation.sourceSkillId}.${derivation.triggerBuffBaseId}`;
        const name = pickLocalizedName(entry?.Names, locale, derivation.derivedName, bundle[key]);
        if (setIfChanged(bundle, key, name)) changed += 1;
      }
    }

    if (changed) {
      writeJson(filePath, bundle);
    }
    changedByLocale[locale] = changed;
  }

  console.log(JSON.stringify({ updatedLocales: changedByLocale }, null, 2));
}

main();
