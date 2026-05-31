#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as common from "../../BPSR-UID-Extractors/generator-common.mjs";

const repoRoot = process.cwd();
const generatedRoot = path.join(repoRoot, "parser-data", "generated");
const localeRoot = path.join(repoRoot, "src", "lib", "locales");
const defaultOutJson = path.join(repoRoot, "DEV_exports", "game-localization-uid-bridge-scan.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "game-localization-uid-bridge-scan.md");

const GENERATED_FILES = [
  "skillnames.json",
  "SkillBreakdownDetails.json",
  "BuffName.json",
  "itemnames.json",
  "monsternames.json",
  "scenenames.json",
  "DamageAttrIdName.json",
  "EffectSources.json",
  "ModifierDisplayTable.json",
  "ModifierClassificationTable.json",
];

const DEFAULT_FOCUS_IDS = [
  522201,
  852220,
  882220,
  2202220,
  2208181,
  2302220,
  2402220,
];

const KNOWN_TABLE_NAMES = [
  "BasicAttrTable.ctb",
  "BuffTable.ctb",
  "DamageAttrTable.ctb",
  "FightAttrTable.ctb",
  "ItemTable.ctb",
  "ModEffectTable.ctb",
  "MonsterTable.ctb",
  "RecountTable.ctb",
  "RogueBuffTable.ctb",
  "SceneTable.ctb",
  "SkillAoyiTable.ctb",
  "SkillEffectTable.ctb",
  "SkillFightLevelTable.ctb",
  "SkillTable.ctb",
  "TalentTable.ctb",
  "TempAttrTable.ctb",
  "UnionBossBuffTable.ctb",
  "ValueCalTable.ctb",
  "FormulaTable.ctb",
  "DamageFormulaTable.ctb",
  "SkillDamageFormulaTable.ctb",
  "SkillRatioTable.ctb",
  "SeasonTalentTable.ctb",
  "SeasonEffectTable.ctb",
  "SeasonEffectDescription.ctb",
  "ProfessionTalentTable.ctb",
  "ProfessionTalentNodeTable.ctb",
  "ProfessionTable.ctb",
  "AttrLibTable.ctb",
  "AttrNameTable.ctb",
  "PassiveSkillTable.ctb",
  "StatusTable.ctb",
  "SkillDamageTable.ctb",
  "SkillCoefficientTable.ctb",
];

const KNOWN_HASH_LABELS = new Map(
  KNOWN_TABLE_NAMES.map((name) => [common.hash33(name), name]),
);
KNOWN_HASH_LABELS.set(3345237628, "TalentTable.ctb");
KNOWN_HASH_LABELS.set(4192598123, "SeasonEffectDescription.ctb");

const TABLE_LOCALIZATION_RULES = new Map([
  [
    common.hash33("BuffTable.ctb"),
    [
      { source: "BuffTable.NameId", targetOffsets: [0], textOffsets: [16], kind: "name", files: ["BuffName.json"] },
      { source: "BuffTable.DescriptionId", targetOffsets: [0], textOffsets: [24], kind: "description", files: ["BuffName.json"] },
    ],
  ],
  [
    common.hash33("ItemTable.ctb"),
    [{ source: "ItemTable.NameId", targetOffsets: [0], textOffsets: [4], kind: "name", files: ["itemnames.json"] }],
  ],
  [
    common.hash33("SceneTable.ctb"),
    [{ source: "SceneTable.NameId", targetOffsets: [0], textOffsets: [4], kind: "name", files: ["scenenames.json"] }],
  ],
  [
    common.hash33("MonsterTable.ctb"),
    [{ source: "MonsterTable.NameId", targetOffsets: [0], textOffsets: [4], kind: "name", files: ["monsternames.json"] }],
  ],
  [
    common.hash33("RecountTable.ctb"),
    [{ source: "RecountTable.NameId", targetOffsets: [0], textOffsets: [4], kind: "name", files: ["DamageAttrIdName.json", "SkillBreakdownDetails.json"] }],
  ],
  [
    common.hash33("SkillTable.ctb"),
    [
      { source: "SkillTable.NameId", targetOffsets: [0], textOffsets: [12], kind: "name", files: ["skillnames.json", "SkillBreakdownDetails.json"] },
      { source: "SkillTable.DescriptionId", targetOffsets: [0], textOffsets: [8], kind: "description", files: ["skillnames.json", "SkillBreakdownDetails.json"] },
    ],
  ],
  [
    3345237628,
    [
      {
        source: "TalentTable.NameId",
        targetOffsets: [0],
        textOffsets: [8],
        kind: "name",
        files: ["BuffName.json", "EffectSources.json", "ModifierDisplayTable.json", "ModifierClassificationTable.json", "skillnames.json", "SkillBreakdownDetails.json"],
      },
      {
        source: "TalentTable.DescriptionId",
        targetOffsets: [0],
        textOffsets: [12],
        kind: "description",
        files: ["BuffName.json", "EffectSources.json", "ModifierDisplayTable.json", "ModifierClassificationTable.json", "skillnames.json", "SkillBreakdownDetails.json"],
      },
    ],
  ],
  [
    4192598123,
    [{
      source: "SeasonEffectDescription.DescriptionId",
      targetOffsets: [0],
      textOffsets: [4],
      kind: "description",
      files: ["BuffName.json", "EffectSources.json", "ModifierDisplayTable.json", "ModifierClassificationTable.json"],
    }],
  ],
  [
    983121143,
    [{ source: "CTB:983121143.NameId", targetOffsets: [0], textOffsets: [16], kind: "name", files: ["BuffName.json", "EffectSources.json", "ModifierDisplayTable.json", "ModifierClassificationTable.json"] }],
  ],
  [
    4038258408,
    [{ source: "CTB:4038258408.NameId", targetOffsets: [8], textOffsets: [4], kind: "name", files: ["BuffName.json", "EffectSources.json", "ModifierDisplayTable.json", "ModifierClassificationTable.json"] }],
  ],
]);

const AUXILIARY_LOCALES = new Set(["design", "und"]);
const NAME_FIELD_PATTERN = /(^|\.)(Names|names|sourceNames|familyNames|DisplayNames|DamageNames|LinkedNames|LinkedBuffNames|ParentRecountNames|MonsterOwnerNames|OwnerNames)$/;
const PLACEHOLDER_PATTERN = /\b(?:Unmapped|Unknown|Active)\s+(?:Buff|Skill|Source|Item|Monster|Scene)\s+\d+\b/i;
const MARKUP_PATTERN = /<[^>]+>|\{\*[^}]+\*\}/;
const MiB = 1024 * 1024;

function parseArgs(argv) {
  const options = {
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    game: "",
    maxEntryMb: 80,
    maxCandidatesPerId: 8,
    maxTargets: 0,
    focusIds: DEFAULT_FOCUS_IDS,
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
      case "--game":
        options.game = next();
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--max-entry-mb":
        options.maxEntryMb = Math.max(1, Number(next()) || 1);
        break;
      case "--max-candidates-per-id":
        options.maxCandidatesPerId = Math.max(1, Number(next()) || 1);
        break;
      case "--max-targets":
        options.maxTargets = Math.max(0, Number(next()) || 0);
        break;
      case "--focus-ids":
        options.focusIds = next()
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value > 0);
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
  console.log(`Game Localization UID Bridge Scan

Usage:
  node scripts/scan-game-localization-bridges.mjs [options]

Options:
  --game <path|preset>             Game path or launcher preset; defaults to extractor config.
  --out-json <file>                JSON report path.
  --out-md <file>                  Markdown report path.
  --max-entry-mb <n>               Skip package entries larger than this. Default: 80.
  --max-candidates-per-id <n>      Stored candidates per UID. Default: 8.
  --max-targets <n>                Limit target IDs for quick probes. Default: all.
  --focus-ids <ids>                Comma-separated UIDs to highlight.
  --help                           Show this help.
`);
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeLocaleMap(value, localeKeys) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  const allowed = new Set([...localeKeys, ...AUXILIARY_LOCALES]);
  if (!keys.every((key) => allowed.has(key))) return false;
  return keys.some((key) => typeof value[key] === "string");
}

function collectLocaleMaps(value, localeKeys, out, fieldPath = "") {
  if (looksLikeLocaleMap(value, localeKeys)) {
    out.push({ fieldPath: fieldPath || "entry", map: value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (isRecord(item) || Array.isArray(item)) {
        collectLocaleMaps(item, localeKeys, out, `${fieldPath}[${index}]`);
      }
    });
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (!isRecord(child) && !Array.isArray(child)) continue;
    collectLocaleMaps(child, localeKeys, out, fieldPath ? `${fieldPath}.${key}` : key);
  }
}

function nameField(fieldPath) {
  return NAME_FIELD_PATTERN.test(fieldPath);
}

function hasRealEnglish(map) {
  const en = cleanText(map?.en);
  return Boolean(en && !PLACEHOLDER_PATTERN.test(en));
}

function shouldScanGap(map, localeKeys) {
  if (hasRealEnglish(map)) return false;
  return Boolean(
    cleanText(map?.["zh-CN"])
    || cleanText(map?.["zh-TW"])
    || cleanText(map?.design)
    || localeKeys.some((locale) => cleanText(map?.[locale])),
  );
}

function preferredLabel(map, fallback = "") {
  for (const key of ["en", "zh-CN", "zh-TW", "design", "ja", "ko-KR", "fr", "de", "es", "pt-BR", "th", "id"]) {
    const value = cleanText(map?.[key]);
    if (value) return value;
  }
  return fallback;
}

function generatedEntries(data, fileName) {
  if (Array.isArray(data)) {
    return data.map((entry, index) => [String(entry?.Id ?? entry?.id ?? index), entry]);
  }
  if (fileName === "EffectSources.json") {
    return Object.entries(data?.effectSourcesById ?? {});
  }
  if (fileName === "ModifierDisplayTable.json" || fileName === "ModifierClassificationTable.json") {
    return Object.entries(data?.sourcesByRuleId ?? data?.sourcesById ?? {});
  }
  return Object.entries(data ?? {});
}

function numericIdsFromEntry(entry, entryKey) {
  const ids = new Set();
  const add = (value) => {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) ids.add(number);
  };

  add(entryKey);
  for (const key of [
    "Id",
    "id",
    "sourceEntityId",
    "buffId",
    "observedBuffId",
    "LinkedId",
    "LinkedBuffId",
    "BuffSourceId",
    "ParentRecountId",
  ]) {
    add(entry?.[key]);
  }
  for (const key of ["LinkedIds", "buffIds", "debugBuffIds", "targetDamageIds", "DamageId", "RecountIds"]) {
    for (const value of Array.isArray(entry?.[key]) ? entry[key] : []) add(value);
  }
  const sourceId = cleanText(entry?.sourceId);
  const sourceMatch = /(?:buff-source|observed-buff):(\d+)/.exec(sourceId);
  if (sourceMatch) add(sourceMatch[1]);

  return [...ids].sort((left, right) => left - right);
}

function collectLocalizationTargets(localeKeys, focusIds, maxTargets) {
  const byId = new Map();
  for (const fileName of GENERATED_FILES) {
    const filePath = path.join(generatedRoot, fileName);
    const data = readJson(filePath, null);
    if (!data) continue;

    for (const [entryKey, entry] of generatedEntries(data, fileName)) {
      if (!isRecord(entry)) continue;
      const maps = [];
      collectLocaleMaps(entry, localeKeys, maps);

      for (const { fieldPath, map } of maps) {
        if (!nameField(fieldPath) || !shouldScanGap(map, localeKeys)) continue;
        const label = preferredLabel(map, String(entryKey));
        const numericIds = numericIdsFromEntry(entry, entryKey);
        for (const id of numericIds) {
          const current = byId.get(id) ?? {
            id,
            labels: new Set(),
            generatedFiles: new Set(),
            generatedRefs: [],
            focus: focusIds.has(id),
          };
          current.labels.add(label);
          current.generatedFiles.add(fileName);
          if (current.generatedRefs.length < 6) {
            current.generatedRefs.push({ fileName, entryKey, fieldPath, label });
          }
          current.focus = current.focus || focusIds.has(id);
          byId.set(id, current);
        }
      }
    }
  }

  let targets = [...byId.values()].sort((left, right) => {
    if (left.focus !== right.focus) return left.focus ? -1 : 1;
    return left.id - right.id;
  });
  if (maxTargets > 0) {
    targets = targets.slice(0, maxTargets);
  }

  return {
    targetSet: new Set(targets.map((target) => target.id)),
    targetsById: new Map(targets.map((target) => [target.id, target])),
  };
}

function buildLocalizationTextIndex(localizationTables) {
  const entriesByTextId = new Map();
  for (const table of localizationTables) {
    const localeId = common.localeIdFromGameLanguage(table.language);
    for (const [textId, stringIndex] of table.index.entries()) {
      if (stringIndex < 0 || stringIndex >= table.strings.length) continue;
      const text = cleanText(table.strings[stringIndex]);
      if (!text) continue;
      const entries = entriesByTextId.get(textId) ?? [];
      entries.push({ localeId, language: table.language, stringIndex, text });
      entriesByTextId.set(textId, entries);
    }
  }

  const out = new Map();
  for (const [textId, entries] of entriesByTextId.entries()) {
    const names = common.buildLocaleTextObject(entries, { includeDesign: false });
    if (!hasRealEnglish(names)) continue;
    out.set(textId, {
      textId,
      names,
      preferredName: common.choosePreferredLocaleText(names),
      localeCount: Object.keys(names).length,
    });
  }
  return out;
}

function readU32Safe(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) return null;
  return buffer.readUInt32LE(offset);
}

function readRowValues(table, rowOffset) {
  const values = [];
  for (let fieldOffset = 0; fieldOffset + 4 <= table.rowSize; fieldOffset += 4) {
    values.push({
      fieldOffset,
      value: readU32Safe(table.data, rowOffset + fieldOffset),
    });
  }
  return values;
}

function rowStringHints(table, rowValues) {
  const hints = [];
  for (const { fieldOffset, value } of rowValues) {
    if (!Number.isInteger(value) || value < 0) continue;
    const text = common.readCtbString(table, 6, value, { allowZero: false, maxLen: 160 });
    if (!text || hints.some((hint) => hint.text === text)) continue;
    if (/^ui[\\/]/i.test(text) || /\.(?:png|dds|tga|ktx)$/i.test(text)) continue;
    hints.push({ fieldOffset, text });
    if (hints.length >= 6) break;
  }
  return hints;
}

function scoreCandidate({ targetOffset, rowId, targetId, textOffset, textId, text, kind }) {
  let score = 0;
  if (rowId === targetId) score += 80;
  if (targetOffset === 0) score += 35;
  if (kind === "name") score += 30;
  if (kind === "description") score += 10;
  if (textOffset > 0 && textOffset <= 32) score += 16;
  if (textOffset > 32 && textOffset <= 80) score += 8;
  if (textId !== targetId) score += 4;
  if (text.length <= 80) score += 8;
  if (text.length > 160) score -= 15;
  if (MARKUP_PATTERN.test(text)) score -= 18;
  if (/^\d+$/.test(text)) score -= 25;
  return score;
}

function ruleValueHits(rowValues, offsets, targetSet) {
  return offsets
    .map((fieldOffset) => rowValues.find((rowValue) => rowValue.fieldOffset === fieldOffset) ?? null)
    .filter((rowValue) => rowValue && targetSet.has(rowValue.value));
}

function ruleTextHits(rowValues, offsets, localizedTextById) {
  return offsets
    .map((fieldOffset) => {
      const rowValue = rowValues.find((value) => value.fieldOffset === fieldOffset);
      const text = rowValue ? localizedTextById.get(rowValue.value) : null;
      return rowValue && text ? { fieldOffset, value: rowValue.value, text } : null;
    })
    .filter(Boolean);
}

function ruleAppliesToTarget(rule, targetsById, targetId) {
  if (!Array.isArray(rule.files) || !rule.files.length) return true;
  const target = targetsById.get(targetId);
  if (!target?.generatedFiles?.size) return false;
  return rule.files.some((fileName) => target.generatedFiles.has(fileName));
}

function candidateKey(candidate) {
  return [
    candidate.tableKey,
    candidate.rowIndex,
    candidate.targetFieldOffset,
    candidate.textFieldOffset,
    candidate.textId,
  ].join(":");
}

function addCandidate(candidatesById, targetId, candidate, maxCandidatesPerId) {
  const list = candidatesById.get(targetId) ?? [];
  if (list.some((entry) => candidateKey(entry) === candidateKey(candidate))) return;
  list.push(candidate);
  list.sort((left, right) =>
    right.score - left.score
    || left.tableLabel.localeCompare(right.tableLabel)
    || left.rowIndex - right.rowIndex
    || left.textFieldOffset - right.textFieldOffset,
  );
  candidatesById.set(targetId, list.slice(0, maxCandidatesPerId));
}

function scanCtbTable({
  table,
  tableKey,
  tableLabel,
  targetSet,
  localizedTextById,
  candidatesById,
  maxCandidatesPerId,
  targetsById,
}) {
  const rules = TABLE_LOCALIZATION_RULES.get(tableKey) ?? [];
  if (!rules.length) return 0;

  let matchedRows = 0;
  for (let rowIndex = 0; rowIndex < table.rowCount; rowIndex += 1) {
    const rowOffset = table.rowStart + rowIndex * table.rowSize;
    const rowValues = readRowValues(table, rowOffset);
    const rowId = rowValues[0]?.value ?? null;
    let rowMatched = false;
    let hints = null;

    for (const rule of rules) {
      if (!rule.textOffsets.length) continue;

      const targetHits = ruleValueHits(rowValues, rule.targetOffsets, targetSet);
      const scopedTargetHits = targetHits.filter((target) => ruleAppliesToTarget(rule, targetsById, target.value));
      if (!scopedTargetHits.length) continue;

      const textHits = ruleTextHits(rowValues, rule.textOffsets, localizedTextById);
      if (!textHits.length) continue;

      rowMatched = true;
      hints ??= rowStringHints(table, rowValues);
      for (const target of scopedTargetHits) {
        for (const textHit of textHits) {
        const score = scoreCandidate({
          targetOffset: target.fieldOffset,
          rowId,
          targetId: target.value,
          textOffset: textHit.fieldOffset,
          textId: textHit.value,
          text: textHit.text.preferredName,
          kind: rule.kind,
        });
        if (score < 60) continue;

        addCandidate(candidatesById, target.value, {
          tableKey,
          tableLabel,
          rowIndex,
          rowId,
          rowOffset,
          targetFieldOffset: target.fieldOffset,
          textFieldOffset: textHit.fieldOffset,
          textId: textHit.value,
          score,
          kind: rule.kind,
          source: rule.source,
          preferredName: textHit.text.preferredName,
          names: textHit.text.names,
          localeCount: textHit.text.localeCount,
          stringHints: hints,
        }, maxCandidatesPerId);
      }
    }
    }

    if (rowMatched) matchedRows += 1;
  }
  return matchedRows;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>")
    .slice(0, 260);
}

function namesSummary(names) {
  const en = cleanText(names?.en);
  const zh = cleanText(names?.["zh-CN"]);
  return zh && zh !== en ? `${en} / ${zh}` : en;
}

function makeMarkdown(report) {
  const lines = [];
  lines.push("# Game Localization UID Bridge Scan");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Game package: \`${report.gamePackage}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | ---: |");
  lines.push(`| Target IDs from generated gaps | ${formatCount(report.summary.targetIds)} |`);
  lines.push(`| Localization text IDs with English | ${formatCount(report.summary.localizedTextIds)} |`);
  lines.push(`| Package entries checked | ${formatCount(report.summary.packageEntriesChecked)} |`);
  lines.push(`| CTB-like tables scanned | ${formatCount(report.summary.ctbTablesScanned)} |`);
  lines.push(`| CTB-like tables skipped by size | ${formatCount(report.summary.entriesSkippedBySize)} |`);
  lines.push(`| Rows with target/localization candidates | ${formatCount(report.summary.matchedRows)} |`);
  lines.push(`| Target IDs with candidates | ${formatCount(report.summary.targetIdsWithCandidates)} |`);
  lines.push("");
  lines.push("## Focus IDs");
  lines.push("");
  lines.push(`Focus IDs: ${report.focusIds.join(", ")}`);
  lines.push("");
  lines.push("| UID | Current Labels | Candidates | Best Candidate | Evidence |");
  lines.push("| ---: | --- | ---: | --- | --- |");
  for (const row of report.focus) {
    const best = row.candidates[0];
    lines.push([
      row.id,
      markdownCell(row.labels.join(", ")),
      formatCount(row.candidates.length),
      best ? markdownCell(namesSummary(best.names)) : "",
      best ? markdownCell(`${best.tableLabel} row ${best.rowIndex}, uid@${best.targetFieldOffset}, textId ${best.textId}@${best.textFieldOffset}, score ${best.score}`) : "",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  lines.push("## Highest Confidence Candidates");
  lines.push("");
  if (!report.highConfidence.length) {
    lines.push("_No candidates found._");
  } else {
    lines.push("| UID | Current Labels | Candidate | Table Row | Offsets | Score |");
    lines.push("| ---: | --- | --- | --- | --- | ---: |");
    for (const row of report.highConfidence) {
      const best = row.candidates[0];
      lines.push([
        row.id,
        markdownCell(row.labels.join(", ")),
        markdownCell(namesSummary(best.names)),
        markdownCell(`${best.tableLabel} #${best.rowIndex}`),
        markdownCell(`uid@${best.targetFieldOffset}, textId ${best.textId}@${best.textFieldOffset}`),
        best.score,
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This report is source evidence, not automatic runtime promotion.");
  lines.push("- Candidates are limited to known CTB UID fields and known localized name/description fields.");
  lines.push("- Description-like localized strings are evidence only and should not become display names without a separate display-name bridge.");
  return `${lines.join("\n")}\n`;
}

function resolveGamePaths(options) {
  const args = {};
  if (options.game) args.game = options.game;
  args.out = options.outJson;
  return common.resolvePaths(args, path.basename(options.outJson));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const manifest = readJson(path.join(localeRoot, "manifest.json"));
  const locales = manifest.locales ?? [];
  const focusIds = new Set(options.focusIds);
  const { targetSet, targetsById } = collectLocalizationTargets(locales, focusIds, options.maxTargets);
  const paths = resolveGamePaths(options);
  const containerDir = path.dirname(paths.m0Path);
  const metaEntries = common.loadMetaEntries(containerDir);
  const localizationTables = common.loadLocalizationTables(containerDir, { metaEntries });
  const localizedTextById = buildLocalizationTextIndex(localizationTables);
  const candidatesById = new Map();
  const maxEntryBytes = options.maxEntryMb * MiB;
  const stats = {
    packageEntriesChecked: 0,
    ctbTablesScanned: 0,
    entriesSkippedBySize: 0,
    matchedRows: 0,
  };

  for (const [tableKey, entry] of metaEntries.entries()) {
    stats.packageEntriesChecked += 1;
    if (entry.length > maxEntryBytes) {
      stats.entriesSkippedBySize += 1;
      continue;
    }

    let table;
    try {
      table = common.readCtbTableEntry(containerDir, entry, KNOWN_HASH_LABELS.get(tableKey) ?? `CTB:${tableKey}`, tableKey);
    } catch {
      continue;
    }

    if (!table || table.rowSize < 4 || table.rowSize > 4096 || table.rowCount <= 0) {
      continue;
    }

    stats.ctbTablesScanned += 1;
    stats.matchedRows += scanCtbTable({
      table,
      tableKey,
      tableLabel: KNOWN_HASH_LABELS.get(tableKey) ?? `CTB:${tableKey}`,
      targetSet,
      localizedTextById,
      candidatesById,
      maxCandidatesPerId: options.maxCandidatesPerId,
      targetsById,
    });
  }

  const rows = [...targetsById.values()].map((target) => ({
    id: target.id,
    labels: [...target.labels].sort((left, right) => left.localeCompare(right)),
    generatedFiles: [...target.generatedFiles].sort((left, right) => left.localeCompare(right)),
    generatedRefs: target.generatedRefs,
    focus: target.focus,
    candidates: candidatesById.get(target.id) ?? [],
  }));
  const withCandidates = rows
    .filter((row) => row.candidates.length)
    .sort((left, right) =>
      right.candidates[0].score - left.candidates[0].score
      || left.id - right.id,
    );
  const report = {
    generatedAt: new Date().toISOString(),
    gamePackage: paths.m0Path,
    focusIds: options.focusIds,
    summary: {
      targetIds: targetSet.size,
      localizedTextIds: localizedTextById.size,
      targetIdsWithCandidates: withCandidates.length,
      ...stats,
    },
    focus: rows.filter((row) => row.focus).sort((left, right) => left.id - right.id),
    highConfidence: withCandidates.slice(0, 100),
    rowsWithCandidates: withCandidates,
  };

  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(options.outMd, makeMarkdown(report), "utf8");

  console.log(`Game localization bridge scan written to ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Game localization bridge JSON written to ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Target IDs scanned: ${formatCount(targetSet.size)}`);
  console.log(`Target IDs with candidates: ${formatCount(withCandidates.length)}`);
  console.log(`CTB-like tables scanned: ${formatCount(stats.ctbTablesScanned)}`);
}

main();
