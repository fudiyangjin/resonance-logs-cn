#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultProbeDir = path.resolve(
  repoRoot,
  "..",
  "BPSR-UID-Extractors",
  "output",
  "probing-reports",
);
const defaultOutJson = path.join(repoRoot, "DEV_exports", "game-formula-source-inventory.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "game-formula-source-inventory.md");
const defaultSectionDir = path.join(repoRoot, "DEV_exports", "game-formula-source-sections");

const formulaFrame = [
  {
    key: "attack-base",
    formulaTerm: "ATK/MATK",
    contributionQuestion: "Did this source change the attack stat used before multipliers?",
  },
  {
    key: "resistance-or-defense",
    formulaTerm: "1 - Resistance, defense, or mitigation",
    contributionQuestion: "Did this source change enemy resistance/defense or incoming mitigation?",
  },
  {
    key: "refined-or-elemental-atk",
    formulaTerm: "Refined/Elemental ATK",
    contributionQuestion: "Did this source add a separate refined or elemental attack lane?",
  },
  {
    key: "skill-multiplier",
    formulaTerm: "Multiplier / skill-specific DMG",
    contributionQuestion: "Did this source change a skill, Dream DMG, class-skill, or hit multiplier?",
  },
  {
    key: "flat-damage",
    formulaTerm: "Flat Damage",
    contributionQuestion: "Did this source add a flat damage packet or fixed additive amount?",
  },
  {
    key: "proc-extra-hit",
    formulaTerm: "Extra hit, summon, proc, or child source",
    contributionQuestion: "Did this source create another damage source that should become its own child row?",
  },
  {
    key: "dot-or-status-damage",
    formulaTerm: "Damage-over-time or status damage",
    contributionQuestion: "Did this source apply a status that can deal damage over time or as a separate effect?",
  },
  {
    key: "control-or-status",
    formulaTerm: "Control/status marker",
    contributionQuestion: "Did this source apply a non-damage status that can gate other effects or source rows?",
  },
  {
    key: "crit-rate",
    formulaTerm: "CRIT rate/chance",
    contributionQuestion: "Did this source change whether a hit crits?",
  },
  {
    key: "crit-damage",
    formulaTerm: "CRIT damage",
    contributionQuestion: "Did this source change the crit multiplier once a hit crits?",
  },
  {
    key: "versatility-dmg",
    formulaTerm: "1 + Versatility DMG%",
    contributionQuestion: "Did this source change the versatility damage lane?",
  },
  {
    key: "mastery-stat",
    formulaTerm: "Mastery stat lane",
    contributionQuestion: "Did this source change Mastery, which can feed downstream class/passive formulas?",
  },
  {
    key: "elemental-dmg",
    formulaTerm: "1 + Elemental DMG%",
    contributionQuestion: "Did this source change physical/elemental damage boost lanes?",
  },
  {
    key: "generic-dmg",
    formulaTerm: "1 + Generic DMG%",
    contributionQuestion: "Did this source change broad damage dealt or generic damage boost?",
  },
  {
    key: "variable-stat-selector",
    formulaTerm: "Runtime-selected stat lane",
    contributionQuestion: "Does this source choose a stat at runtime, such as highest or corresponding stat?",
  },
  {
    key: "haste-cadence",
    formulaTerm: "DPS cadence, not per-hit formula",
    contributionQuestion: "Did this source change cast frequency, cooldowns, haste, or uptime?",
  },
  {
    key: "luck-proc",
    formulaTerm: "Lucky/proc lane",
    contributionQuestion: "Did this source change lucky strike chance or lucky strike multiplier?",
  },
  {
    key: "resource-state",
    formulaTerm: "Resource, stacks, or state gate",
    contributionQuestion: "Does this source gate another contribution behind resources or stacks?",
  },
  {
    key: "support-heal-defense",
    formulaTerm: "Healing, shield, HP, or defensive utility",
    contributionQuestion: "Does this source matter for support/defense instead of outgoing damage?",
  },
];

const formulaFrameByKey = new Map(formulaFrame.map((entry) => [entry.key, entry]));

function parseArgs(argv) {
  const options = {
    probeDir: defaultProbeDir,
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    sectionDir: defaultSectionDir,
    maxRows: 80,
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
      case "--probe-dir":
        options.probeDir = path.resolve(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--section-dir":
        options.sectionDir = path.resolve(next());
        break;
      case "--max-rows":
        options.maxRows = Number(next());
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
  console.log(`Game Formula Source Inventory - classify game-derived talents/passives/buffs into contribution buckets.

Usage:
  node scripts/analyze-game-formula-sources.mjs [options]

Options:
  --probe-dir <dir>   Directory containing game-derived probe reports.
                      Default: ${defaultProbeDir}
  --out-json <path>   JSON report path. Default: DEV_exports/game-formula-source-inventory.json
  --out-md <path>     Markdown report path. Default: DEV_exports/game-formula-source-inventory.md
  --section-dir <dir> Full CSV section output directory. Default: DEV_exports/game-formula-source-sections
  --max-rows <count>  Max rows per Markdown section. Default: 80
  --help              Show this help.

Notes:
  This is an offline evidence layer. It does not modify live Skill Details UI behavior.
  Inputs are probe reports sourced from game files and include source offsets and buff ids where known.
`);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  return [];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueNumbers(values) {
  return [...new Set(asArray(values).map(finiteNumber).filter((value) => value !== null))]
    .sort((left, right) => left - right);
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u200b/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\*Decision\.[^}]+\*\}/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preferredText(values, fallback = "") {
  if (typeof values === "string") return cleanText(values);
  if (!values || typeof values !== "object") return cleanText(fallback);
  return cleanText(
    values.en
      ?? values["zh-CN"]
      ?? values.design
      ?? Object.values(values).find((value) => typeof value === "string" && value.trim())
      ?? fallback
      ?? "",
  );
}

function preferredName(names, fallback = "") {
  return preferredText(names, fallback);
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    const items = value.map(stripUndefined).filter((entry) => entry !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || entry === null || entry === "") continue;
      const cleaned = stripUndefined(entry);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function addCount(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function addSet(map, key, value) {
  const set = map.get(key) ?? new Set();
  set.add(value);
  map.set(key, set);
}

function sortedCountMap(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([key, count]) => ({ key, count }));
}

function shorten(value, maxLength = 220) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function extractNumbers(text) {
  const seen = new Set();
  const out = [];
  const regex = /[+-]?\d+(?:\.\d+)?\s*(?:%|s|sec|secs|second|seconds|m|meter|meters|pt|pts|point|points|stack|stacks)?/gi;
  for (const match of cleanText(text).match(regex) ?? []) {
    const token = match.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    const value = finiteNumber(token.replace(/[^+\-\d.]/g, ""));
    const unit = token.replace(/[+\-\d.\s]/g, "").trim() || undefined;
    out.push(stripUndefined({ text: token, value, unit }));
  }
  return out;
}

function collectDescriptionEvidence(row) {
  const evidence = [];

  const push = ({ source, text, texts, cleanTexts, descriptionId, textId, sourceTable, sourceOffset }) => {
    const clean = preferredText(cleanTexts, preferredText(texts, text));
    if (!clean) return;
    evidence.push(stripUndefined({
      source,
      descriptionId: finiteNumber(descriptionId),
      textId: finiteNumber(textId),
      sourceTable,
      sourceOffset: finiteNumber(sourceOffset),
      text: clean,
    }));
  };

  push({
    source: "row.cleanResolvedDescriptions",
    text: row.resolvedDescription,
    texts: row.resolvedDescriptions,
    cleanTexts: row.cleanResolvedDescriptions,
    descriptionId: row.descriptionId,
    sourceTable: row.sourceTable,
    sourceOffset: row.sourceOffset,
  });
  push({
    source: "row.cleanDescriptions",
    text: row.description,
    texts: row.descriptions,
    cleanTexts: row.cleanDescriptions,
    descriptionId: row.descriptionId,
    sourceTable: row.sourceTable,
    sourceOffset: row.sourceOffset,
  });
  push({
    source: "row.description",
    text: row.description ?? row.resolvedDescription,
    texts: row.descriptions ?? row.resolvedDescriptions,
    descriptionId: row.descriptionId,
    sourceTable: row.sourceTable,
    sourceOffset: row.sourceOffset,
  });

  for (const candidate of asArray(row.descriptionCandidates)) {
    push({
      source: candidate.evidenceStatus || "row.descriptionCandidates",
      text: candidate.text,
      texts: candidate.texts,
      cleanTexts: candidate.cleanTexts,
      descriptionId: candidate.descriptionId,
      textId: candidate.textId,
      sourceTable: candidate.sourceTable,
      sourceOffset: candidate.sourceOffset,
    });
  }

  const seen = new Set();
  return evidence.filter((entry) => {
    const key = `${entry.descriptionId ?? ""}:${entry.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectBuffIds(row) {
  const ids = [
    row.buffId,
    row.primaryBuffId,
    row.alignedBuffId,
    row.computedAlignedBuffId,
    row.buffRow?.id,
    row.primaryBuff?.id,
    row.alignedBuff?.id,
    ...asArray(row.effectRecords).map((record) => record.buffId),
    ...asArray(row.buffEffectRecords).map((record) => record.buffId),
  ];
  return uniqueNumbers(ids);
}

function collectBuffNames(row) {
  const names = [
    preferredName(row.buffRow?.names, row.buffRow?.name),
    preferredName(row.primaryBuff?.names, row.primaryBuff?.name),
    preferredName(row.alignedBuff?.names, row.alignedBuff?.name),
    ...asArray(row.effectRecords).map((record) => preferredName(record.buffRow?.names, record.buffRow?.name)),
    ...asArray(row.buffEffectRecords).map((record) => preferredName(record.buffRow?.names, record.buffRow?.name)),
  ];
  return uniqueStrings(names);
}

function summarizeEffectRecords(row) {
  const records = [...asArray(row.effectRecords), ...asArray(row.buffEffectRecords)];
  const seen = new Set();
  const out = [];
  for (const record of records) {
    const summary = stripUndefined({
      kind: record.kind,
      opcode: finiteNumber(record.opcode),
      buffId: finiteNumber(record.buffId),
      value: finiteNumber(record.value),
      firstSkillTableId: finiteNumber(record.firstSkillTableId),
      firstSkillTableName: record.firstSkillTableName,
      secondSkillTableId: finiteNumber(record.secondSkillTableId),
      secondSkillTableName: record.secondSkillTableName,
      rawValues: asArray(record.rawValues).slice(0, 8),
    });
    const key = JSON.stringify(summary);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(summary);
  }
  return out;
}

function collectTargets(row) {
  const targets = [];
  for (const record of asArray(row.effectRecords)) {
    if (record.firstSkillTableId || record.firstSkillTableName) {
      targets.push(stripUndefined({
        targetKind: "skill-table-pair-first",
        skillTableId: finiteNumber(record.firstSkillTableId),
        name: record.firstSkillTableName,
      }));
    }
    if (record.secondSkillTableId || record.secondSkillTableName) {
      targets.push(stripUndefined({
        targetKind: "skill-table-pair-second",
        skillTableId: finiteNumber(record.secondSkillTableId),
        name: record.secondSkillTableName,
      }));
    }
  }

  const descriptionEvidence = collectDescriptionEvidence(row);
  for (const entry of descriptionEvidence) {
    const text = entry.text;
    const dreamMatch = text.match(/([A-Z][A-Za-z0-9 '\-]+?)\s+Dream DMG/i);
    if (dreamMatch?.[1]) {
      targets.push({ targetKind: "description-dream-dmg-skill", name: cleanText(dreamMatch[1]) });
    }
    const critMatch = text.match(/Crit DMG of ([A-Z][A-Za-z0-9 '\-]+)/i);
    if (critMatch?.[1]) {
      targets.push({ targetKind: "description-crit-dmg-skill", name: cleanText(critMatch[1]) });
    }
  }

  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.targetKind}:${target.skillTableId ?? ""}:${target.name ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyFormulaBuckets(text) {
  const clean = cleanText(text);
  const lower = clean.toLowerCase();
  const buckets = new Set();

  const nonRefinedAttackText = clean.replace(/\bRefined\s+(?:ATK|Attack|Armor|DEF|Defense)\b/gi, "");
  if (
    /\b(?:ATK|MATK|P\.?ATK|M\.?ATK)\b/i.test(nonRefinedAttackText)
    || /\b(?:main attributes?|main stats?|strength|agility|intelligence|intellect|spirit)\b/i.test(clean)
    || /\bMAG Boost\b/i.test(clean)
  ) {
    buckets.add("attack-base");
  }
  if (
    /\b(?:resistance|resist|defense|defence|armor|armour|damage reduction|dmg reduction|ignore defense|ignore defence|armor penetration|block dmg reduction|vulnerability)\b/i.test(clean)
  ) {
    buckets.add("resistance-or-defense");
  }
  if (
    /\bRefined\s+(?:ATK|Attack)\b/i.test(clean)
    || /\b(?:Elemental|Fire|Ice|Frost|Thunder|Lightning|Volt|Light|Dark|Wind|Physical|PHY|Rock)\s+(?:ATK|Attack)\b/i.test(clean)
  ) {
    buckets.add("refined-or-elemental-atk");
  }
  if (
    /\b(?:Dream DMG|Skill DMG|Expertise Skill DMG|Class Skill(?:s)? .*?(?:DMG|damage)|Basic Attack .*?(?:DMG|damage)|Special Attack .*?(?:DMG|damage)|Ultimate Skill .*?(?:DMG|damage)|Multiplier)\b/i.test(clean)
    || /\b(?:Final DMG|DMG dealt|Damage dealt)\b/i.test(clean)
    || /\b[A-Z][A-Za-z0-9 '\-]+ DMG (?:\+|by|is increased|increases|increased)/i.test(clean)
    || /\b(?:this hit|hit|attack|effect)\s+deals?\s+\d+(?:\.\d+)?%\s+[A-Za-z][A-Za-z0-9 '\-]+ DMG\b/i.test(clean)
    || /\bDMG bonus is increased\b/i.test(clean)
  ) {
    buckets.add("skill-multiplier");
  }
  if (/\b(?:flat damage|fixed damage|bonus damage|additional damage)\b/i.test(clean)) {
    buckets.add("flat-damage");
  }
  if (
    /\b(?:trigger|triggers|triggered|summon|summons|summoned|follow-up|extra hit|additional\s+[A-Za-z0-9 '\-]*hit|additional attack|additional projectiles?|final slash|adds? a final|casts? [A-Z][A-Za-z0-9 '\-]+|evolves into|fixed\s*\d+(?:\.\d+)?%\s+chance|dealing \d+(?:\.\d+)?%\s+ATK)\b/i.test(clean)
  ) {
    buckets.add("proc-extra-hit");
  }
  if (/\b(?:Burn|Bleed|Poison|DoT|damage over time|inflict(?:s|ed)? Burn|inflict(?:s|ed)? Poison|inflict(?:s|ed)? Bleed)\b/i.test(clean)) {
    buckets.add("dot-or-status-damage");
  }
  if (/\b(?:Suppress|Vulnerability|stun|stuns|stunned|Oblivion|inflicting Oblivion|control effect|status effect)\b/i.test(clean)) {
    buckets.add("control-or-status");
  }
  if (
    /\b(?:Crit Rate|Crit Chance|Critical Chance|Critical Rate)\b/i.test(clean)
    || /\bCrit\s*\+\s*\d/i.test(clean)
    || /\bCrit gained\b/i.test(clean)
  ) {
    buckets.add("crit-rate");
  }
  const nonCritDamageText = clean.replace(/\bCrit(?:ical)?\s+(?:DMG|Damage)\b/gi, "");
  if (/\bCrit\b/i.test(nonCritDamageText) && /\b(?:changes|entry|above|over|permanent|regular|corresponding stat)\b/i.test(nonCritDamageText)) {
    buckets.add("crit-rate");
  }
  if (/\b(?:Crit DMG|Crit Damage|Critical Damage)\b/i.test(clean)) {
    buckets.add("crit-damage");
  }
  if (/\bVersatility\b/i.test(clean)) {
    buckets.add("versatility-dmg");
  }
  if (/\bMastery\b/i.test(clean)) {
    buckets.add("mastery-stat");
  }
  if (
    /\b(?:Elemental DMG|Elemental Damage|Elemental Bonus|All-Element Bonus|All Element Bonus|All Elemental Bonus|Fire Bonus|Ice Bonus|Frost Bonus|Thunder Bonus|Lightning Bonus|Physical Bonus|Rock Bonus|Fire DMG|Fire Damage|Ice DMG|Ice Damage|Frost DMG|Frost Damage|Thunder DMG|Thunder Damage|Lightning DMG|Lightning Damage|Physical DMG|Physical Damage|PHY Boost|Physical Boost|Fire Boost|Ice Boost|Thunder Boost|Lightning Boost|Elemental Boost)\b/i.test(clean)
  ) {
    buckets.add("elemental-dmg");
  }

  const genericDamageText = lower
    .replace(/crit(?:ical)? (?:dmg|damage)/g, "")
    .replace(/dream dmg/g, "")
    .replace(/damage reduction|dmg reduction/g, "");
  if (
    /\b(?:generic dmg|all dmg|all damage|damage dealt|dmg boost|damage boost)\b/i.test(clean)
    || /\bdeal(?:s)?\s+\d+(?:\.\d+)?%\s+more\s+damage\b/i.test(clean)
    || /\bdamage\s+increases\s+by\s+\d+(?:\.\d+)?%/i.test(clean)
    || /\bincreases\s+damage\s+by\s+\d+(?:\.\d+)?%/i.test(clean)
    || /\bDMG dealt\s*\+\s*\d+(?:\.\d+)?%/i.test(clean)
    || /\bDMG dealt by\s+\d+(?:\.\d+)?%/i.test(clean)
    || /\b(?:higher|increased|more)\s+the\s+damage\b/i.test(clean)
    || /\bdamage\s*\(from\s+(?:a\s+)?minimum\b/i.test(clean)
    || /\bmore\s+damage\b/i.test(genericDamageText)
    || /\b(?:damage|dmg)\s*\+\s*\d+(?:\.\d+)?%/i.test(genericDamageText)
  ) {
    buckets.add("generic-dmg");
  }
  if (/\b(?:highest|highest stat|highest substat|corresponding stat|selected stat|main stats?|attribute transfer)\b/i.test(clean)) {
    buckets.add("variable-stat-selector");
  }
  if (/\b(?:Haste|Cooldown|Internal CD|\bCD\b|\bCDs\b|cast speed|attack speed|charge count|recast|interval|duration|per second|count required)\b/i.test(clean)) {
    buckets.add("haste-cadence");
  }
  if (/\b(?:Luck Chance|Lucky Strike|Lucky Block|Lucky|Luck)\b/i.test(clean)) {
    buckets.add("luck-proc");
  }
  if (/\b(?:Courage|Energy|Rage|Resource|stack|stacks|restore|recover|recovery|gauge|meter|HP|MP|mana|cap|state|sigil|soul|combo|surge|mark|charge seed|charge seeds|Performance Passion|Thundrage|Sharp|Moonblades|cost|no longer consumes|count required|efficiency of gaining)\b/i.test(clean)) {
    buckets.add("resource-state");
  }
  if (/\b(?:Heal|Healing|Shield|HP|Armor|Armour|Defense|Defence|Block|Parry|DMG Reduction|Damage Reduction|damage taken)\b/i.test(clean)) {
    buckets.add("support-heal-defense");
  }

  return [...buckets].sort();
}

function classifyScopeTags(text) {
  const clean = cleanText(text);
  const tags = new Set();
  if (/\b(?:self|yourself|you|your|own|caster|user)\b/i.test(clean)) tags.add("self");
  if (/\b(?:allies|ally|allied|teammate|teammates|party member|party members|party|team member|team members)\b/i.test(clean)) {
    tags.add("team-or-ally");
  }
  if (/\b(?:all allies|all teammates|all party members|whole party)\b/i.test(clean)) tags.add("party-wide");
  if (/\b(?:enemy|enemies|target|targets|boss|monster)\b/i.test(clean)) tags.add("enemy-or-target");
  if (/\b(?:within range|nearby|within \d+(?:\.\d+)?m|range|area)\b/i.test(clean)) tags.add("area-range");
  if (/\b(?:summon|pet|phantom|falcon|arrow|meteor|turret)\b/i.test(clean)) tags.add("summon-or-extra-hit");
  return [...tags].sort();
}

function classifyTriggerTags(text) {
  const clean = cleanText(text);
  const tags = new Set();
  if (/\b(?:when|whenever|after|upon|if|during|while|against|defeating|casting|cast|start combat|entering combat)\b/i.test(clean)) {
    tags.add("conditional");
  } else if (/\+\s*\d+(?:\.\d+)?%|\b(?:increases|decreases|grants|gain)\b/i.test(clean)) {
    tags.add("static-or-always");
  }
  if (/\b(?:crit|critical)\b/i.test(clean)) tags.add("crit-related");
  if (/\b(?:lucky|luck)\b/i.test(clean)) tags.add("luck-related");
  if (/\b(?:cast|casting|after casting|skill)\b/i.test(clean)) tags.add("cast-or-skill-related");
  if (/\b(?:hit|hits|dealing damage|deals damage|taking damage|when hit)\b/i.test(clean)) tags.add("hit-related");
  if (/\b(?:trigger|triggers|triggered|summon|summons|summoned|fixed\s*\d+(?:\.\d+)?%\s+chance|chance to trigger|follow-up|extra hit|additional hit)\b/i.test(clean)) {
    tags.add("proc-or-extra-hit");
  }
  if (/\b(?:defeat|defeating|kill|killing)\b/i.test(clean)) tags.add("on-defeat");
  if (/\b(?:stack|stacks|up to|max stack|max stacks)\b/i.test(clean)) tags.add("stacking");
  if (/\b(?:above|below|less than|more than|no less than|greater than|exceeding|over \d|under \d|HP)\b/i.test(clean)) tags.add("threshold");
  if (/\b(?:convert|converted|conversion|for every|each .* grants|permanent .* above|per \d)\b/i.test(clean)) tags.add("stat-conversion");
  if (/\b(?:each teammate|for each teammate|teammate within|allies within|affects up to)\b/i.test(clean)) tags.add("party-size-or-range-scaling");
  if (/\b(?:cooldown|internal cd|\bcd\b|duration|interval|per second)\b/i.test(clean)) tags.add("uptime-or-cadence");
  return [...tags].sort();
}

function isExternalCandidate(scopeTags, triggerTags, text) {
  if (scopeTags.includes("party-wide") || scopeTags.includes("team-or-ally")) return true;
  return /\b(?:grants? .*? allies|allies .*? gain|teammates .*? gain|affects up to .*? teammates|whole party)\b/i.test(text)
    || triggerTags.includes("party-size-or-range-scaling");
}

function classifyApplicationTags(sourceKind, formulaBuckets, scopeTags, triggerTags, text) {
  const clean = cleanText(text);
  const tags = new Set();
  const hasTeamScope = scopeTags.includes("team-or-ally") || scopeTags.includes("party-wide");
  const hasSelfScope = scopeTags.includes("self");
  const hasEnemyScope = scopeTags.includes("enemy-or-target");
  const hasDamageFormula = formulaBuckets.some((bucket) => ![
    "resource-state",
    "support-heal-defense",
  ].includes(bucket));
  const implicitLoadoutKinds = new Set([
    "profession-talent-passive",
    "season-talent-node",
    "season-rogue-entry",
    "season-phantom-factor",
  ]);

  if (hasSelfScope) tags.add("explicit-self");
  if (hasTeamScope) tags.add("external-or-party-capable");
  if (scopeTags.includes("party-wide")) tags.add("party-wide");
  if (hasEnemyScope) tags.add("enemy-or-target-effect");
  if (scopeTags.includes("summon-or-extra-hit")) tags.add("summon-or-extra-hit");
  if (triggerTags.includes("stat-conversion")) tags.add("stat-conversion");
  if (triggerTags.includes("uptime-or-cadence")) tags.add("uptime-or-cadence");
  if (formulaBuckets.includes("variable-stat-selector")) tags.add("runtime-selected-stat");
  if (formulaBuckets.includes("proc-extra-hit")) tags.add("child-damage-source");
  if (formulaBuckets.includes("dot-or-status-damage")) tags.add("status-damage-source");
  if (formulaBuckets.includes("control-or-status")) tags.add("control-or-status-source");

  const explicitOtherOnly = /\b(?:nearby allies gain|allies gain|teammates gain|affects up to \d+ teammates|grants allies|granting .*? to allies)\b/i.test(clean)
    && !/\b(?:yourself|your|you|user|caster|self)\b/i.test(clean);
  if (implicitLoadoutKinds.has(sourceKind) && !explicitOtherOnly) {
    tags.add("self-loadout-candidate");
  }
  if (hasDamageFormula && (tags.has("explicit-self") || tags.has("self-loadout-candidate"))) {
    tags.add("self-damage-contribution-candidate");
  }
  if (hasDamageFormula && hasTeamScope) {
    tags.add("external-damage-contribution-candidate");
  }
  if (!clean) {
    tags.add("missing-description");
  }
  if (!formulaBuckets.length) {
    tags.add("unclassified-formula");
  }

  return [...tags].sort();
}

function sourceRowId(sourceKind, row) {
  const id = row.id ?? row.entryId ?? row.itemId ?? row.familyId ?? row.name ?? "unknown";
  if (sourceKind === "season-phantom-factor" && row.grade) {
    return `${sourceKind}:${row.familyId ?? "family"}:${row.grade}:${id}`;
  }
  return `${sourceKind}:${id}`;
}

function buildSource(sourceKind, row) {
  const descriptions = collectDescriptionEvidence(row);
  const primaryDescription = descriptions[0]?.text ?? "";
  const name = preferredName(row.names, row.name ?? row.item?.name ?? row.entryId ?? row.itemId ?? row.id);
  const buffNames = collectBuffNames(row);
  const combinedText = cleanText([
    name,
    row.designName,
    ...buffNames,
    primaryDescription,
    ...descriptions.slice(1).map((entry) => entry.text),
  ].filter(Boolean).join(" "));
  const formulaBuckets = classifyFormulaBuckets(combinedText);
  const scopeTags = classifyScopeTags(combinedText);
  const triggerTags = classifyTriggerTags(combinedText);
  const externalCandidate = isExternalCandidate(scopeTags, triggerTags, combinedText);
  const numbers = extractNumbers(primaryDescription);
  const effectRecords = summarizeEffectRecords(row);
  const buffIds = collectBuffIds(row);
  const targets = collectTargets(row);
  const sourceId = sourceRowId(sourceKind, row);
  const damageRelevantBuckets = formulaBuckets.filter((bucket) => ![
    "haste-cadence",
    "resource-state",
    "support-heal-defense",
  ].includes(bucket));
  const applicationTags = classifyApplicationTags(
    sourceKind,
    formulaBuckets,
    scopeTags,
    triggerTags,
    combinedText,
  );

  return stripUndefined({
    sourceId,
    sourceKind,
    sourceEntityId: finiteNumber(row.id ?? row.entryId ?? row.itemId),
    familyId: row.familyId ?? row.entryFamily,
    grade: finiteNumber(row.grade),
    name,
    names: row.names,
    buffIds,
    buffNames,
    primaryBuffId: finiteNumber(row.primaryBuffId ?? row.buffId ?? row.alignedBuffId ?? row.computedAlignedBuffId),
    classGateIds: uniqueNumbers(row.classGateIds),
    sourceTable: row.sourceTable,
    sourceOffset: finiteNumber(row.sourceOffset),
    descriptionId: finiteNumber(row.descriptionId),
    description: primaryDescription,
    descriptionEvidence: descriptions.slice(0, 3),
    numbers,
    formulaBuckets,
    formulaTerms: formulaBuckets.map((bucket) => formulaFrameByKey.get(bucket)?.formulaTerm ?? bucket),
    damageRelevantBuckets,
    scopeTags,
    triggerTags,
    applicationTags,
    externalCandidate,
    selfCandidate: applicationTags.includes("self-loadout-candidate")
      || applicationTags.includes("explicit-self"),
    selfDamageContributionCandidate: applicationTags.includes("self-damage-contribution-candidate"),
    externalDamageContributionCandidate: applicationTags.includes("external-damage-contribution-candidate"),
    needsRuntimeState: externalCandidate || triggerTags.some((tag) => tag !== "static-or-always"),
    targets,
    effectRecords: effectRecords.slice(0, 8),
    rawInput: {
      probeType: row.type,
      tableRowIndex: finiteNumber(row.tableRowIndex),
      effectReferenceField: finiteNumber(row.effectReferenceField),
      descriptionReferenceField: finiteNumber(row.descriptionReferenceField),
      parameterValues: uniqueNumbers(row.parameterValues),
    },
  });
}

function collectSources(probes) {
  const sourceRows = [];
  for (const row of asArray(probes.talent?.talentRows)) {
    sourceRows.push(buildSource("profession-talent-passive", row));
  }
  for (const row of asArray(probes.seasonTalent?.nodeRows ?? probes.talent?.seasonTalentNodes)) {
    sourceRows.push(buildSource("season-talent-node", row));
  }
  for (const row of asArray(probes.seasonRogue?.entries ?? probes.talent?.seasonRogueEntries)) {
    sourceRows.push(buildSource("season-rogue-entry", row));
  }
  for (const row of asArray(probes.phantomFactor?.factorRows ?? probes.talent?.seasonPhantomFactors)) {
    sourceRows.push(buildSource("season-phantom-factor", row));
  }
  return sourceRows.filter(Boolean);
}

function summarizeInventory(sources, probes) {
  const sourceKindCounts = new Map();
  const bucketCounts = new Map();
  const bucketExternalCounts = new Map();
  const bucketSourceKindSets = new Map();
  const scopeCounts = new Map();
  const triggerCounts = new Map();
  const applicationTagCounts = new Map();
  const buffIdToSourceIds = {};
  let rowsWithDescription = 0;
  let rowsWithFormulaBucket = 0;
  let rowsWithDamageRelevantBucket = 0;
  let externalCandidates = 0;
  let selfCandidates = 0;
  let selfDamageContributionCandidates = 0;
  let externalDamageContributionCandidates = 0;
  let missingFormulaTextWithBuffIds = 0;

  for (const source of sources) {
    addCount(sourceKindCounts, source.sourceKind);
    if (source.description) rowsWithDescription += 1;
    if (source.formulaBuckets?.length) rowsWithFormulaBucket += 1;
    if (source.damageRelevantBuckets?.length) rowsWithDamageRelevantBucket += 1;
    if (source.externalCandidate) externalCandidates += 1;
    if (source.selfCandidate) selfCandidates += 1;
    if (source.selfDamageContributionCandidate) selfDamageContributionCandidates += 1;
    if (source.externalDamageContributionCandidate) externalDamageContributionCandidates += 1;
    if (!source.formulaBuckets?.length && source.buffIds?.length) missingFormulaTextWithBuffIds += 1;

    for (const bucket of source.formulaBuckets ?? []) {
      addCount(bucketCounts, bucket);
      if (source.externalCandidate) addCount(bucketExternalCounts, bucket);
      addSet(bucketSourceKindSets, bucket, source.sourceKind);
    }
    for (const scopeTag of source.scopeTags ?? []) addCount(scopeCounts, scopeTag);
    for (const triggerTag of source.triggerTags ?? []) addCount(triggerCounts, triggerTag);
    for (const applicationTag of source.applicationTags ?? []) addCount(applicationTagCounts, applicationTag);
    for (const buffId of source.buffIds ?? []) {
      buffIdToSourceIds[buffId] ??= [];
      buffIdToSourceIds[buffId].push(source.sourceId);
    }
  }

  const formulaBucketSummary = formulaFrame.map((bucket) => ({
    key: bucket.key,
    formulaTerm: bucket.formulaTerm,
    count: bucketCounts.get(bucket.key) ?? 0,
    externalCandidateCount: bucketExternalCounts.get(bucket.key) ?? 0,
    sourceKinds: [...(bucketSourceKindSets.get(bucket.key) ?? new Set())].sort(),
  }));

  return {
    rows: sources.length,
    rowsWithDescription,
    rowsWithFormulaBucket,
    rowsWithDamageRelevantBucket,
    externalCandidates,
    selfCandidates,
    selfDamageContributionCandidates,
    externalDamageContributionCandidates,
    missingFormulaTextWithBuffIds,
    sourceKindCounts: sortedCountMap(sourceKindCounts),
    formulaBucketSummary,
    scopeCounts: sortedCountMap(scopeCounts),
    triggerCounts: sortedCountMap(triggerCounts),
    applicationTagCounts: sortedCountMap(applicationTagCounts),
    buffIdIndexCount: Object.keys(buffIdToSourceIds).length,
    formulaSurfaceSummary: probes.formulaSurface?.summary,
  };
}

function rowMatchesSearch(source, terms) {
  const haystack = cleanText([
    source.name,
    source.description,
    ...(source.buffNames ?? []),
    ...(source.formulaTerms ?? []),
  ].join(" ")).toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function importantExamples(sources, maxRows) {
  const bySection = {
    inspiration: sources.filter((source) => rowMatchesSearch(source, ["Inspiration", "Inspire", "InspireEx"])),
    external: sources.filter((source) => source.externalCandidate && source.damageRelevantBuckets?.length),
    conversion: sources.filter((source) => source.triggerTags?.includes("stat-conversion")),
    critChain: sources.filter((source) => (
      source.formulaBuckets?.includes("crit-rate")
      && source.formulaBuckets?.includes("crit-damage")
    )),
    missingFormulaTextWithBuffIds: sources.filter((source) => !source.formulaBuckets?.length && source.buffIds?.length),
  };

  return Object.fromEntries(
    Object.entries(bySection).map(([key, rows]) => [
      key,
      rows
        .sort((left, right) => (
          Number(right.externalCandidate) - Number(left.externalCandidate)
          || (right.damageRelevantBuckets?.length ?? 0) - (left.damageRelevantBuckets?.length ?? 0)
          || left.sourceKind.localeCompare(right.sourceKind)
          || String(left.name).localeCompare(String(right.name))
        ))
        .slice(0, maxRows),
    ]),
  );
}

function bucketExamples(sources, maxRows) {
  const out = {};
  for (const bucket of formulaFrame) {
    out[bucket.key] = sources
      .filter((source) => source.formulaBuckets?.includes(bucket.key))
      .sort((left, right) => (
        Number(right.externalCandidate) - Number(left.externalCandidate)
        || left.sourceKind.localeCompare(right.sourceKind)
        || String(left.name).localeCompare(String(right.name))
      ))
      .slice(0, Math.min(maxRows, 20));
  }
  return out;
}

function buildSections(sources) {
  const withDescription = (source) => Boolean(source.description);
  const withDamageBucket = (source) => Boolean(source.damageRelevantBuckets?.length);
  const withBuff = (source) => Boolean(source.buffIds?.length);
  const sections = {
    "all-sources": sources,
    "all-description-damage-relevant": sources.filter((source) => withDescription(source) && withDamageBucket(source)),
    "self-damage-contribution-candidates": sources.filter((source) => (
      withDescription(source)
      && source.selfDamageContributionCandidate
    )),
    "self-loadout-candidates-all": sources.filter((source) => source.selfCandidate),
    "external-damage-contribution-candidates": sources.filter((source) => (
      withDescription(source)
      && source.externalDamageContributionCandidate
    )),
    "external-candidates-all": sources.filter((source) => source.externalCandidate),
    "enemy-target-effect-candidates": sources.filter((source) => (
      withDescription(source)
      && source.applicationTags?.includes("enemy-or-target-effect")
    )),
    "variable-stat-selectors": sources.filter((source) => source.formulaBuckets?.includes("variable-stat-selector")),
    "stat-conversions": sources.filter((source) => source.triggerTags?.includes("stat-conversion")),
    "crit-rate-to-crit-damage-chains": sources.filter((source) => (
      source.formulaBuckets?.includes("crit-rate")
      && source.formulaBuckets?.includes("crit-damage")
    )),
    "buff-backed-no-formula-text": sources.filter((source) => withBuff(source) && !source.formulaBuckets?.length),
    "buff-backed-missing-description": sources.filter((source) => withBuff(source) && !withDescription(source)),
    "ambiguous-description-damage-relevant": sources.filter((source) => (
      withDescription(source)
      && withDamageBucket(source)
      && !source.selfDamageContributionCandidate
      && !source.externalDamageContributionCandidate
    )),
  };

  for (const bucket of formulaFrame) {
    sections[`bucket-${bucket.key}`] = sources.filter((source) => source.formulaBuckets?.includes(bucket.key));
  }

  return sections;
}

function csvEscape(value) {
  const text = Array.isArray(value)
    ? value.join("; ")
    : value === undefined || value === null
      ? ""
      : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function sourceCsvRow(source) {
  return {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    name: source.name,
    sourceEntityId: source.sourceEntityId,
    familyId: source.familyId,
    grade: source.grade,
    buffIds: source.buffIds,
    buffNames: source.buffNames,
    formulaBuckets: source.formulaBuckets,
    damageRelevantBuckets: source.damageRelevantBuckets,
    scopeTags: source.scopeTags,
    triggerTags: source.triggerTags,
    applicationTags: source.applicationTags,
    selfCandidate: source.selfCandidate ? "true" : "false",
    selfDamageContributionCandidate: source.selfDamageContributionCandidate ? "true" : "false",
    externalCandidate: source.externalCandidate ? "true" : "false",
    externalDamageContributionCandidate: source.externalDamageContributionCandidate ? "true" : "false",
    numbers: (source.numbers ?? []).map((entry) => entry.text),
    targets: (source.targets ?? []).map((target) => target.name || target.skillTableId || target.targetKind),
    sourceTable: source.sourceTable,
    sourceOffset: source.sourceOffset,
    descriptionId: source.descriptionId,
    description: source.description,
  };
}

function writeCsv(filePath, rows) {
  const headers = [
    "sourceId",
    "sourceKind",
    "name",
    "sourceEntityId",
    "familyId",
    "grade",
    "buffIds",
    "buffNames",
    "formulaBuckets",
    "damageRelevantBuckets",
    "scopeTags",
    "triggerTags",
    "applicationTags",
    "selfCandidate",
    "selfDamageContributionCandidate",
    "externalCandidate",
    "externalDamageContributionCandidate",
    "numbers",
    "targets",
    "sourceTable",
    "sourceOffset",
    "descriptionId",
    "description",
  ];
  const lines = [headers.join(",")];
  for (const source of rows) {
    const row = sourceCsvRow(source);
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function writeSectionFiles(report, sectionDir) {
  fs.mkdirSync(sectionDir, { recursive: true });
  const sections = buildSections(report.sources);
  const manifest = [];
  for (const [name, rows] of Object.entries(sections)) {
    const fileName = `${name}.csv`;
    const filePath = path.join(sectionDir, fileName);
    writeCsv(filePath, rows);
    manifest.push({
      section: name,
      rows: rows.length,
      fileName,
      path: filePath,
    });
  }

  const lines = [];
  lines.push("# Game Formula Source Section Index");
  lines.push("");
  lines.push("Full CSV slices generated from the game-derived description inventory.");
  lines.push("");
  lines.push(markdownTable(manifest, ["Section", "Rows", "CSV"], (row) => [
    row.section,
    row.rows,
    row.fileName,
  ]));
  lines.push("");
  fs.writeFileSync(path.join(sectionDir, "README.md"), lines.join("\n"));
  return manifest.sort((left, right) => left.section.localeCompare(right.section));
}

function markdownTable(rows, headers, rowFactory) {
  const lines = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${rowFactory(row).map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return lines.join("\n");
}

function formatSourceList(rows) {
  if (!rows.length) return "_None found._";
  return markdownTable(
    rows,
    ["Source", "Kind", "Buff ids", "Buckets", "Scope", "Trigger", "Evidence"],
    (source) => [
      source.name,
      source.sourceKind,
      (source.buffIds ?? []).join(", "),
      (source.formulaBuckets ?? []).join(", "),
      (source.scopeTags ?? []).join(", "),
      (source.triggerTags ?? []).join(", "),
      shorten(source.description, 180),
    ],
  );
}

function formatMarkdown(report, maxRows) {
  const examples = report.examples;
  const lines = [];
  lines.push("# Game Formula Source Inventory");
  lines.push("");
  lines.push("Offline evidence report. It classifies game-derived talent/passive/buff surfaces into contribution-accounting buckets before any live Skill Details changes.");
  lines.push("");
  lines.push("## Inputs");
  lines.push("");
  lines.push(markdownTable(
    Object.entries(report.inputPaths).map(([key, value]) => ({ key, value })),
    ["Input", "Path"],
    (row) => [row.key, row.value],
  ));
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- sources inventoried: ${report.summary.rows}`);
  lines.push(`- sources with description text: ${report.summary.rowsWithDescription}`);
  lines.push(`- sources with formula buckets: ${report.summary.rowsWithFormulaBucket}`);
  lines.push(`- sources with damage-relevant buckets: ${report.summary.rowsWithDamageRelevantBucket}`);
  lines.push(`- self/loadout candidates: ${report.summary.selfCandidates}`);
  lines.push(`- self damage contribution candidates: ${report.summary.selfDamageContributionCandidates}`);
  lines.push(`- external/team candidates: ${report.summary.externalCandidates}`);
  lines.push(`- external damage contribution candidates: ${report.summary.externalDamageContributionCandidates}`);
  lines.push(`- buff-backed rows with no formula text yet: ${report.summary.missingFormulaTextWithBuffIds}`);
  if (report.summary.formulaSurfaceSummary) {
    lines.push(`- formula surface probe high-confidence numeric formula tables: ${report.summary.formulaSurfaceSummary.highConfidenceNumericFormulaTables ?? "unknown"}`);
    lines.push(`- formula surface probe parameterized description surfaces: ${report.summary.formulaSurfaceSummary.parameterizedDescriptionSurfaces ?? "unknown"}`);
  }
  lines.push("");
  lines.push("## Source Kinds");
  lines.push("");
  lines.push(markdownTable(report.summary.sourceKindCounts, ["Kind", "Count"], (row) => [row.key, row.count]));
  lines.push("");
  lines.push("## Application Tags");
  lines.push("");
  lines.push(markdownTable(report.summary.applicationTagCounts, ["Tag", "Count"], (row) => [row.key, row.count]));
  lines.push("");
  if (report.sectionFiles?.length) {
    lines.push("## Full Section CSVs");
    lines.push("");
    lines.push(markdownTable(
      report.sectionFiles,
      ["Section", "Rows", "CSV"],
      (row) => [row.section, row.rows, row.fileName],
    ));
    lines.push("");
  }
  lines.push("## Formula Buckets");
  lines.push("");
  lines.push(markdownTable(
    report.summary.formulaBucketSummary,
    ["Bucket", "Formula term", "Rows", "External rows", "Source kinds"],
    (row) => [row.key, row.formulaTerm, row.count, row.externalCandidateCount, row.sourceKinds.join(", ")],
  ));
  lines.push("");
  lines.push("## Inspiration / Inspire Candidates");
  lines.push("");
  lines.push(formatSourceList(examples.inspiration.slice(0, maxRows)));
  lines.push("");
  lines.push("## External Damage-Relevant Candidates");
  lines.push("");
  lines.push(formatSourceList(examples.external.slice(0, maxRows)));
  lines.push("");
  lines.push("## Stat Conversion Candidates");
  lines.push("");
  lines.push(formatSourceList(examples.conversion.slice(0, maxRows)));
  lines.push("");
  lines.push("## Crit Rate To Crit Damage Chains");
  lines.push("");
  lines.push(formatSourceList(examples.critChain.slice(0, maxRows)));
  lines.push("");
  lines.push("## Buff-Backed Rows Without Formula Text");
  lines.push("");
  lines.push("These are important because they can still need a 0%/unknown child row in Skill Details, but they do not expose useful contribution text in the current probe surface.");
  lines.push("");
  lines.push(formatSourceList(examples.missingFormulaTextWithBuffIds.slice(0, maxRows)));
  lines.push("");
  lines.push("## Bucket Examples");
  for (const bucket of formulaFrame) {
    const rows = report.bucketExamples[bucket.key] ?? [];
    lines.push("");
    lines.push(`### ${bucket.key}`);
    lines.push("");
    lines.push(formatSourceList(rows.slice(0, Math.min(maxRows, 20))));
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- The game-derived reports expose source ids, buff ids, source tables, offsets, descriptions, and many parameterized values, but they do not by themselves prove per-player activation, current stack, or live grade.");
  lines.push("- Runtime contribution attribution still needs host/source uid from buff state, selected talents/passives/factors, current stat snapshots, and damage events aligned by player and skill.");
  lines.push("- For parent skill rows, exact emitted child damage can stay as direct contribution. Modifier rows need formula-bucket placement plus runtime activation before we assign numeric deltas.");
  lines.push("- Party buffs should be treated as externally capable whenever the source text targets allies/teammates/party. Their contribution belongs under the receiver's parent skill row, but source ownership should point back to the buffing player when runtime source_uid is available.");
  return `${lines.join("\n")}\n`;
}

function buildReport(options) {
  const inputPaths = {
    talentEffectModelProbe: path.join(options.probeDir, "TalentEffectModelProbe.json"),
    seasonTalentNodeProbe: path.join(options.probeDir, "SeasonTalentNodeProbe.json"),
    seasonRogueEntryProbe: path.join(options.probeDir, "SeasonRogueEntryProbe.json"),
    seasonPhantomFactorProbe: path.join(options.probeDir, "SeasonPhantomFactorProbe.json"),
    formulaSurfaceProbe: path.join(options.probeDir, "FormulaSurfaceProbe.json"),
  };
  const probes = {
    talent: readJson(inputPaths.talentEffectModelProbe, {}),
    seasonTalent: readJson(inputPaths.seasonTalentNodeProbe, {}),
    seasonRogue: readJson(inputPaths.seasonRogueEntryProbe, {}),
    phantomFactor: readJson(inputPaths.seasonPhantomFactorProbe, {}),
    formulaSurface: readJson(inputPaths.formulaSurfaceProbe, {}),
  };
  const sources = collectSources(probes).sort((left, right) => (
    left.sourceKind.localeCompare(right.sourceKind)
    || String(left.familyId ?? "").localeCompare(String(right.familyId ?? ""))
    || (left.grade ?? 0) - (right.grade ?? 0)
    || String(left.name).localeCompare(String(right.name))
  ));
  const summary = summarizeInventory(sources, probes);
  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : 80;
  return {
    generatedAt: new Date().toISOString(),
    inputPaths,
    formulaFrame,
    summary,
    examples: importantExamples(sources, maxRows),
    bucketExamples: bucketExamples(sources, maxRows),
    sources,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = buildReport(options);
  report.sectionDir = options.sectionDir;
  report.sectionFiles = writeSectionFiles(report, options.sectionDir);
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(options.outMd, formatMarkdown(report, options.maxRows));
  console.log(`Wrote ${options.outJson}`);
  console.log(`Wrote ${options.outMd}`);
  console.log(`Wrote section CSVs under ${options.sectionDir}`);
  console.log(`Sources: ${report.summary.rows}`);
  console.log(`Self damage candidates: ${report.summary.selfDamageContributionCandidates}`);
  console.log(`Formula-bucket sources: ${report.summary.rowsWithFormulaBucket}`);
  console.log(`External/team candidates: ${report.summary.externalCandidates}`);
}

main();
