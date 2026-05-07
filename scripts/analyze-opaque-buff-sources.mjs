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
const defaultInventoryJson = path.join(repoRoot, "DEV_exports", "game-formula-source-inventory.json");
const defaultOutJson = path.join(repoRoot, "DEV_exports", "game-formula-opaque-buff-slice.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "game-formula-opaque-buff-slice.md");
const defaultOutCsv = path.join(repoRoot, "DEV_exports", "game-formula-opaque-buff-slice.csv");

const iconStemHints = new Map([
  ["taidao", "taidao icon family"],
  ["mozhang", "mozhang icon family"],
  ["changqiang", "changqiang icon family"],
  ["fahuan", "fahuan icon family"],
  ["weiren", "weiren icon family"],
  ["gongjian", "gongjian icon family"],
  ["jiandun", "jiandun icon family"],
  ["gita", "gita icon family"],
]);

const tagRules = [
  {
    tag: "probable-party-or-support",
    pattern: /\b(?:inspiration|inspire|encourage|center stage|concerto|anthem|aria|rhapsody|sympho|melody|chord|harmony|duet|song|aura|grace|blessing|therapy|rescue|heal|nourish|life|vitality|support|protection)\b/i,
  },
  {
    tag: "stat-or-rating-modifier",
    pattern: /\b(?:crit|critical|haste|swift|luck|mastery|advancement|stat|dexterity|intellect|agility|vitality|fortitude|attack|power|keen|strong|valor|valiant|expertise|overload|scale)\b/i,
  },
  {
    tag: "damage-or-extra-hit-source",
    pattern: /\b(?:arrow|falcon|eagle|wolf|beast|blade|slash|strike|shot|barrage|explosive|frost|ice|flame|fire|thunder|lightning|meteor|lance|spear|scythe|pulse|prism|judgment|condemn|rupture|shatter|thorn|seed|stone|rock|storm|vortex|tornado|wind|moon|star|radiant|dragon|break|pursuit)\b/i,
  },
  {
    tag: "resource-or-state",
    pattern: /\b(?:charge|intent|bud|bloom|breath|rhythm|encore|bravery|courage|fury|rage|overdrive|overcharge|drive|resonance|core|heart|revelation|retention|domain|stance|pact|conversion|acquisition)\b/i,
  },
  {
    tag: "defense-or-target-effect",
    pattern: /\b(?:aegis|barrier|shield|guard|ward|fortitude|protection|shelter|bastion|rampart|block|holy|lightforged|condemn|vulnerable|weakness|intimidation|fearless)\b/i,
  },
  {
    tag: "season-or-entry-meta",
    pattern: /\b(?:entry|entries|drop|probability|chance of obtaining|guaranteed|quality|available only|nightmare|vestige|dreamscape)\b/i,
  },
];

function parseArgs(argv) {
  const options = {
    probeDir: defaultProbeDir,
    inventoryJson: defaultInventoryJson,
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    outCsv: defaultOutCsv,
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
      case "--inventory-json":
        options.inventoryJson = path.resolve(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--out-csv":
        options.outCsv = path.resolve(next());
        break;
      case "--max-rows":
        options.maxRows = Number(next());
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Opaque Buff Source Slice - group buff-backed sources with no formula bucket.

Usage:
  npm run lab:opaque-buffs -- [options]

Options:
  --probe-dir <dir>       Probe report directory. Default: ../BPSR-UID-Extractors/output/probing-reports
  --inventory-json <file> Prior game formula inventory JSON. Default: DEV_exports/game-formula-source-inventory.json
  --out-json <file>       Output JSON. Default: DEV_exports/game-formula-opaque-buff-slice.json
  --out-md <file>         Output Markdown. Default: DEV_exports/game-formula-opaque-buff-slice.md
  --out-csv <file>        Output CSV. Default: DEV_exports/game-formula-opaque-buff-slice.csv
  --max-rows <count>      Max rows per Markdown section. Default: 80
  --help                  Show this help.
`);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === undefined || value === null) return [];
  return [value];
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
  return [...new Set(asArray(values).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u200b/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preferredText(values, fallback = "") {
  if (typeof values === "string") return cleanText(values);
  if (!values || typeof values !== "object") return cleanText(fallback);
  for (const locale of ["en", "id", "th", "zh-CN", "zh-TW", "ja", "ko-KR", "design", "und"]) {
    const text = cleanText(values[locale]);
    if (text) return text;
  }
  for (const value of Object.values(values)) {
    const text = cleanText(value);
    if (text) return text;
  }
  return cleanText(fallback);
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

function sortedCountMap(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([key, count]) => ({ key, count }));
}

function shorten(value, maxLength = 180) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function sourceKey(sourceKind, id) {
  return `${sourceKind}:${id}`;
}

function buildRawIndexes(probes) {
  const sourceRows = new Map();
  for (const row of asArray(probes.talent?.talentRows)) {
    sourceRows.set(sourceKey("profession-talent-passive", row.id), row);
  }
  for (const row of asArray(probes.seasonTalent?.nodeRows ?? probes.talent?.seasonTalentNodes)) {
    sourceRows.set(sourceKey("season-talent-node", row.id), row);
  }
  for (const row of asArray(probes.seasonRogue?.entries ?? probes.talent?.seasonRogueEntries)) {
    sourceRows.set(sourceKey("season-rogue-entry", row.entryId), row);
  }

  const classRows = new Map();
  for (const row of asArray(probes.classSpec?.talentPassiveRows)) {
    classRows.set(sourceKey("profession-talent-passive", row.id), row);
  }
  for (const row of asArray(probes.classSpec?.talentSpecRows)) {
    classRows.set(sourceKey("profession-talent-passive", row.id), row);
  }

  const specHints = new Map();
  for (const group of asArray(probes.classSpec?.weaponStyleGroups)) {
    for (const spec of asArray(group.specs)) {
      for (const candidate of asArray(spec.candidateTalentPassiveSpecs)) {
        specHints.set(sourceKey("profession-talent-passive", candidate.id), stripUndefined({
          bridge: candidate.bridge,
          bridgeStatus: candidate.bridgeStatus,
          specName: spec.specName,
          weaponStyleBuffId: spec.weaponStyleBuff?.id,
          weaponStyleBuffName: spec.weaponStyleBuff?.name,
          classGroupIconPath: group.evidence?.iconPath,
          classGroupIndex: group.groupIndex,
        }));
      }
    }
  }

  const evidenceEntries = [];
  for (const [key, entry] of Object.entries(probes.talent?.skillEvidenceIndex ?? {})) {
    evidenceEntries.push({ kind: "skillEvidenceIndex", key, entry, text: JSON.stringify(entry) });
  }
  for (const [key, entry] of Object.entries(probes.talent?.recountEvidenceIndex ?? {})) {
    evidenceEntries.push({ kind: "recountEvidenceIndex", key, entry, text: JSON.stringify(entry) });
  }

  return { sourceRows, classRows, specHints, evidenceEntries };
}

function effectRecordsFor(row) {
  return [
    ...asArray(row?.effectRecords),
    ...asArray(row?.buffEffectRecords),
  ];
}

function summarizeEffectRecords(row) {
  const seen = new Set();
  const out = [];
  for (const record of effectRecordsFor(row)) {
    const summary = stripUndefined({
      kind: record.kind,
      opcode: finiteNumber(record.opcode),
      buffId: finiteNumber(record.buffId),
      value: finiteNumber(record.value),
      fieldOffset: finiteNumber(record.fieldOffset),
      recordOffset: finiteNumber(record.recordOffset),
      rawValues: uniqueNumbers(record.rawValues),
    });
    if (!summary) continue;
    const key = JSON.stringify(summary);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(summary);
  }
  return out;
}

function collectBuffDetails(source, row) {
  const details = [];
  const seen = new Set();
  const push = (buffRow, record = null) => {
    const id = finiteNumber(buffRow?.id ?? record?.buffId);
    if (id === null) return;
    const key = `${id}:${record?.recordOffset ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    details.push(stripUndefined({
      id,
      name: preferredName(buffRow?.names, buffRow?.name),
      names: buffRow?.names,
      level: finiteNumber(buffRow?.level),
      sourceTable: buffRow?.sourceTable,
      sourceOffset: finiteNumber(buffRow?.sourceOffset),
      nameId: finiteNumber(buffRow?.nameId),
      nameIdSource: buffRow?.nameIdSource,
      iconPath: buffRow?.iconPath,
      effectRecordOffset: finiteNumber(record?.recordOffset),
      effectFieldOffset: finiteNumber(record?.fieldOffset),
      effectValue: finiteNumber(record?.value),
    }));
  };

  for (const record of effectRecordsFor(row)) {
    push(record.buffRow, record);
  }
  for (const buffId of asArray(source.buffIds)) {
    if (!details.some((detail) => detail.id === buffId)) {
      details.push(stripUndefined({ id: finiteNumber(buffId), name: source.buffNames?.[0] }));
    }
  }
  return details;
}

function iconInfoFor(row, source) {
  const iconPath = row?.iconPath ?? row?.textureIconPath ?? row?.buffRow?.iconPath ?? source.rawInput?.iconPath;
  const fileName = iconPath ? path.posix.basename(iconPath) : "";
  const folder = iconPath ? path.posix.dirname(iconPath) : "";
  const talentFolder = iconPath?.match(/talent_passive_(\d+)/)?.[1];
  const stemMatch = fileName.match(/^([a-z_]+?)(?:\d+)?$/i);
  const stem = stemMatch?.[1] ?? fileName.replace(/\d+$/g, "");
  const iconFamilyHint = [...iconStemHints.entries()].find(([key]) => stem.toLowerCase().includes(key))?.[1];
  return stripUndefined({
    iconPath,
    iconFileName: fileName,
    iconFolder: folder,
    talentFolder,
    iconStem: stem,
    iconFamilyHint,
  }) ?? {};
}

function textForHeuristics(source, row, buffDetails) {
  return cleanText([
    source.name,
    source.description,
    row?.designName,
    preferredName(row?.names, row?.name),
    ...buffDetails.map((buff) => preferredName(buff.names, buff.name)),
    row?.iconPath,
  ].filter(Boolean).join(" "));
}

function classifyMechanicTags(text, row, source) {
  const tags = new Set();
  for (const rule of tagRules) {
    if (rule.pattern.test(text)) tags.add(rule.tag);
  }
  if (!source.description && source.sourceKind === "profession-talent-passive") {
    tags.add("description-missing");
  }
  const effects = summarizeEffectRecords(row);
  const opcodes = uniqueNumbers(effects.map((entry) => entry.opcode));
  if (opcodes.length === 1 && opcodes[0] === 3) {
    tags.add("opcode-3-buff-link-only");
  }
  if (source.buffIds?.length && !source.formulaBuckets?.length) {
    tags.add("needs-buff-effect-decode");
  }
  if (source.description && !source.formulaBuckets?.length) {
    tags.add("description-nonformula");
  }
  return [...tags].sort();
}

function priorityFor(row) {
  const tags = new Set(row.mechanicTags ?? []);
  if (tags.has("season-or-entry-meta") && !tags.has("stat-or-rating-modifier") && !tags.has("damage-or-extra-hit-source")) {
    return "low-meta";
  }
  if (
    row.name?.toLowerCase().includes("inspiration")
    || row.name?.toLowerCase().includes("inspire")
    || tags.has("probable-party-or-support")
  ) {
    return "high-support-or-external";
  }
  if (tags.has("stat-or-rating-modifier")) return "high-stat-modifier";
  if (tags.has("damage-or-extra-hit-source")) return "medium-damage-source";
  if (tags.has("defense-or-target-effect")) return "medium-target-or-defense";
  return "medium-opaque";
}

function findEvidenceMentions(source, row, indexes) {
  const buffIds = uniqueNumbers(source.buffIds);
  const name = cleanText(source.name);
  const matches = [];
  for (const entry of indexes.evidenceEntries) {
    const text = entry.text;
    const reasons = [];
    for (const buffId of buffIds) {
      if (text.includes(String(buffId))) reasons.push(`buff:${buffId}`);
    }
    if (name.length >= 8 && text.toLowerCase().includes(name.toLowerCase())) {
      reasons.push("name");
    }
    if (!reasons.length) continue;
    matches.push(stripUndefined({
      indexKind: entry.kind,
      indexKey: entry.key,
      reasons: uniqueStrings(reasons),
      skillId: finiteNumber(entry.entry?.skill?.id ?? entry.entry?.linkedBaseSkill?.skillId),
      skillName: entry.entry?.skill?.name ?? entry.entry?.linkedBaseSkill?.skillName,
      recountId: finiteNumber(entry.entry?.recountId),
      recountName: entry.entry?.recountName,
      evidenceCounts: entry.entry?.evidenceCounts ?? entry.entry?.skillEvidenceSummary,
    }));
  }
  return matches.slice(0, 8);
}

function enrichOpaqueSource(source, indexes) {
  const key = sourceKey(source.sourceKind, source.sourceEntityId ?? source.entryId);
  const rawRow = indexes.sourceRows.get(key) ?? indexes.classRows.get(key) ?? {};
  const classRow = indexes.classRows.get(key);
  const specHint = indexes.specHints.get(key);
  const effectRecords = summarizeEffectRecords(rawRow);
  const buffDetails = collectBuffDetails(source, rawRow);
  const icon = iconInfoFor(rawRow, source);
  const heuristicText = textForHeuristics(source, rawRow, buffDetails);
  const mechanicTags = classifyMechanicTags(heuristicText, rawRow, source);
  const evidenceMatches = findEvidenceMentions(source, rawRow, indexes);
  const opcodeSummary = uniqueStrings(effectRecords.map((record) => (
    record.opcode === undefined ? "unknown" : `opcode-${record.opcode}`
  )));

  const row = stripUndefined({
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    sourceEntityId: source.sourceEntityId,
    name: source.name,
    names: source.names,
    designName: rawRow.designName,
    sourceTable: source.sourceTable ?? rawRow.sourceTable,
    sourceOffset: source.sourceOffset ?? rawRow.sourceOffset,
    descriptionId: source.descriptionId ?? rawRow.descriptionId,
    hasDescription: Boolean(source.description),
    description: source.description,
    buffIds: source.buffIds,
    buffNames: source.buffNames,
    buffDetails,
    icon,
    classSpecHint: specHint,
    classSpecRowPresent: Boolean(classRow),
    effectReferenceField: finiteNumber(rawRow.effectReferenceField),
    effectRecords,
    opcodeSummary,
    mechanicTags,
    priority: "medium-opaque",
    evidenceMatches,
    applicationTags: source.applicationTags,
    selfCandidate: source.selfCandidate,
    externalCandidate: source.externalCandidate,
    recommendedNextEvidence: recommendedNextEvidence({ source, mechanicTags, evidenceMatches }),
  });
  row.priority = priorityFor(row);
  return row;
}

function recommendedNextEvidence({ source, mechanicTags, evidenceMatches }) {
  const tags = new Set(mechanicTags);
  const actions = [];
  if (tags.has("needs-buff-effect-decode")) {
    actions.push("Decode linked BuffTable/secondary effect payload for the buff ids.");
  }
  if (tags.has("description-missing")) {
    actions.push("Treat description evidence as exhausted for this row; use buff payload or runtime stat deltas.");
  }
  if (tags.has("probable-party-or-support")) {
    actions.push("Capture active buff owner/source uid and receiver stat snapshot deltas to split external contribution.");
  }
  if (tags.has("stat-or-rating-modifier")) {
    actions.push("Compare pre/post rating snapshot against damage formula buckets before assigning numeric contribution.");
  }
  if (tags.has("damage-or-extra-hit-source")) {
    actions.push("Bridge emitted child damage ids/recount ids before creating calculated modifier rows.");
  }
  if (!evidenceMatches.length && source.sourceKind === "profession-talent-passive") {
    actions.push("No current skill/recount evidence index match; needs a separate passive/talent-source bridge.");
  }
  return uniqueStrings(actions);
}

function buildSummary(rows) {
  const sourceKindCounts = new Map();
  const priorityCounts = new Map();
  const mechanicTagCounts = new Map();
  const iconFolderCounts = new Map();
  const iconStemCounts = new Map();
  const opcodeCounts = new Map();
  const buffIdCounts = new Map();

  for (const row of rows) {
    addCount(sourceKindCounts, row.sourceKind);
    addCount(priorityCounts, row.priority);
    for (const tag of row.mechanicTags ?? []) addCount(mechanicTagCounts, tag);
    addCount(iconFolderCounts, row.icon?.iconFolder || "(none)");
    addCount(iconStemCounts, row.icon?.iconStem || "(none)");
    for (const opcode of row.opcodeSummary ?? []) addCount(opcodeCounts, opcode);
    for (const buffId of row.buffIds ?? []) addCount(buffIdCounts, buffId);
  }

  return {
    rows: rows.length,
    rowsWithDescription: rows.filter((row) => row.hasDescription).length,
    rowsMissingDescription: rows.filter((row) => !row.hasDescription).length,
    professionTalentRows: rows.filter((row) => row.sourceKind === "profession-talent-passive").length,
    opcode3OnlyRows: rows.filter((row) => row.mechanicTags?.includes("opcode-3-buff-link-only")).length,
    rowsWithEvidenceMatches: rows.filter((row) => row.evidenceMatches?.length).length,
    sourceKindCounts: sortedCountMap(sourceKindCounts),
    priorityCounts: sortedCountMap(priorityCounts),
    mechanicTagCounts: sortedCountMap(mechanicTagCounts),
    iconFolderCounts: sortedCountMap(iconFolderCounts),
    iconStemCounts: sortedCountMap(iconStemCounts),
    opcodeCounts: sortedCountMap(opcodeCounts),
    repeatedBuffIds: sortedCountMap(buffIdCounts).filter((entry) => entry.count > 1),
  };
}

function groupExamples(rows, maxRows) {
  const byTag = (tag) => rows.filter((row) => row.mechanicTags?.includes(tag)).slice(0, maxRows);
  const nameIncludes = (pattern) => rows.filter((row) => pattern.test(row.name ?? "")).slice(0, maxRows);
  return {
    inspirationCluster: nameIncludes(/\b(?:inspiration|inspire)\b/i),
    supportOrExternal: byTag("probable-party-or-support"),
    statModifiers: byTag("stat-or-rating-modifier"),
    damageOrExtraHit: byTag("damage-or-extra-hit-source"),
    missingDescription: rows.filter((row) => !row.hasDescription).slice(0, maxRows),
    describedNonFormula: rows.filter((row) => row.hasDescription).slice(0, maxRows),
    evidenceMatches: rows.filter((row) => row.evidenceMatches?.length).slice(0, maxRows),
    highPriority: rows.filter((row) => String(row.priority).startsWith("high")).slice(0, maxRows),
  };
}

function buildReport(options) {
  const inputPaths = {
    inventoryJson: options.inventoryJson,
    talentEffectModelProbe: path.join(options.probeDir, "TalentEffectModelProbe.json"),
    classSpecSkillModelProbe: path.join(options.probeDir, "ClassSpecSkillModelProbe.json"),
    seasonTalentNodeProbe: path.join(options.probeDir, "SeasonTalentNodeProbe.json"),
    seasonRogueEntryProbe: path.join(options.probeDir, "SeasonRogueEntryProbe.json"),
  };
  const inventory = readJson(inputPaths.inventoryJson, {});
  const probes = {
    talent: readJson(inputPaths.talentEffectModelProbe, {}),
    classSpec: readJson(inputPaths.classSpecSkillModelProbe, {}),
    seasonTalent: readJson(inputPaths.seasonTalentNodeProbe, {}),
    seasonRogue: readJson(inputPaths.seasonRogueEntryProbe, {}),
  };
  const indexes = buildRawIndexes(probes);
  const opaqueSources = asArray(inventory.sources)
    .filter((source) => source.buffIds?.length && !source.formulaBuckets?.length)
    .map((source) => enrichOpaqueSource(source, indexes))
    .sort((left, right) => (
      String(left.priority).localeCompare(String(right.priority))
      || String(left.sourceKind).localeCompare(String(right.sourceKind))
      || String(left.icon?.talentFolder ?? "").localeCompare(String(right.icon?.talentFolder ?? ""))
      || String(left.name).localeCompare(String(right.name))
      || (left.sourceEntityId ?? 0) - (right.sourceEntityId ?? 0)
    ));

  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : 80;
  return {
    generatedAt: new Date().toISOString(),
    inputPaths,
    scope: "buff-backed sources from game-formula-source-inventory with no formula buckets",
    summary: buildSummary(opaqueSources),
    examples: groupExamples(opaqueSources, maxRows),
    rows: opaqueSources,
  };
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

function formatRowList(rows) {
  if (!rows.length) return "_None found._";
  return markdownTable(
    rows,
    ["Source", "Kind", "Buff ids", "Icon", "Tags", "Next evidence"],
    (row) => [
      `${row.name} (${row.sourceEntityId ?? ""})`,
      row.sourceKind,
      (row.buffIds ?? []).join(", "),
      row.icon?.iconStem || row.icon?.iconFolder || "",
      (row.mechanicTags ?? []).join(", "),
      shorten((row.recommendedNextEvidence ?? []).join(" "), 220),
    ],
  );
}

function formatMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Opaque Buff Source Slice");
  lines.push("");
  lines.push("Offline report for buff-backed sources that the description classifier could not place into a formula bucket. This is meant to sit on top of the current code and guide the next decode/runtime-capture work.");
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
  lines.push(`- opaque buff-backed rows: ${report.summary.rows}`);
  lines.push(`- profession talent/passive rows: ${report.summary.professionTalentRows}`);
  lines.push(`- rows with descriptions: ${report.summary.rowsWithDescription}`);
  lines.push(`- rows missing descriptions: ${report.summary.rowsMissingDescription}`);
  lines.push(`- opcode-3-only buff links: ${report.summary.opcode3OnlyRows}`);
  lines.push(`- rows with skill/recount buff-id or name mentions: ${report.summary.rowsWithEvidenceMatches}`);
  lines.push("");
  lines.push("Interpretation: the large remaining set is not a description-classifier miss. The profession/passive rows mostly have no description id and only expose a talent row linked to a BuffTable id. That means the next evidence has to come from BuffTable/secondary-effect decoding or runtime buff/stat deltas.");
  lines.push("");
  lines.push("## Priorities");
  lines.push("");
  lines.push(markdownTable(report.summary.priorityCounts, ["Priority", "Rows"], (row) => [row.key, row.count]));
  lines.push("");
  lines.push("## Mechanic Tags");
  lines.push("");
  lines.push(markdownTable(report.summary.mechanicTagCounts, ["Tag", "Rows"], (row) => [row.key, row.count]));
  lines.push("");
  lines.push("## Icon Families");
  lines.push("");
  lines.push(markdownTable(report.summary.iconFolderCounts.slice(0, 20), ["Icon folder", "Rows"], (row) => [row.key, row.count]));
  lines.push("");
  lines.push("## Icon Stems");
  lines.push("");
  lines.push(markdownTable(report.summary.iconStemCounts.slice(0, 30), ["Icon stem", "Rows"], (row) => [row.key, row.count]));
  lines.push("");
  if (report.summary.repeatedBuffIds.length) {
    lines.push("## Reused Buff IDs");
    lines.push("");
    lines.push(markdownTable(report.summary.repeatedBuffIds.slice(0, 40), ["Buff id", "Rows"], (row) => [row.key, row.count]));
    lines.push("");
  }
  lines.push("## Inspiration Cluster");
  lines.push("");
  lines.push(formatRowList(report.examples.inspirationCluster.slice(0, maxRows)));
  lines.push("");
  lines.push("## High Priority Rows");
  lines.push("");
  lines.push(formatRowList(report.examples.highPriority.slice(0, maxRows)));
  lines.push("");
  lines.push("## Support Or External-Looking Rows");
  lines.push("");
  lines.push(formatRowList(report.examples.supportOrExternal.slice(0, maxRows)));
  lines.push("");
  lines.push("## Stat Modifier-Looking Rows");
  lines.push("");
  lines.push(formatRowList(report.examples.statModifiers.slice(0, maxRows)));
  lines.push("");
  lines.push("## Damage Or Extra-Hit-Looking Rows");
  lines.push("");
  lines.push(formatRowList(report.examples.damageOrExtraHit.slice(0, maxRows)));
  lines.push("");
  lines.push("## Described But Non-Formula Rows");
  lines.push("");
  lines.push(markdownTable(
    report.examples.describedNonFormula.slice(0, maxRows),
    ["Source", "Kind", "Buff ids", "Description"],
    (row) => [row.name, row.sourceKind, (row.buffIds ?? []).join(", "), shorten(row.description, 220)],
  ));
  lines.push("");
  lines.push("## Evidence Index Mentions");
  lines.push("");
  lines.push(formatRowList(report.examples.evidenceMatches.slice(0, maxRows)));
  lines.push("");
  lines.push("## Next Step");
  lines.push("");
  lines.push("- Descriptions are exhausted for the 405 profession talent/passive rows in this slice: they have `descriptionId: 0`.");
  lines.push("- The report preserves BuffTable source offsets and effect record offsets so the next decode can start from exact game-file rows instead of parser labels.");
  lines.push("- For Inspiration-style effects, the key runtime question is source ownership plus receiver stat delta. Once we can observe the buff owner and affected stat bucket, the contribution child row can be calculated under the receiving player's parent skill row.");
  return `${lines.join("\n")}\n`;
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

function csvRow(row) {
  return {
    priority: row.priority,
    sourceId: row.sourceId,
    sourceKind: row.sourceKind,
    sourceEntityId: row.sourceEntityId,
    name: row.name,
    buffIds: row.buffIds,
    buffNames: row.buffNames,
    buffSourceOffsets: (row.buffDetails ?? []).map((buff) => buff.sourceOffset),
    iconFolder: row.icon?.iconFolder,
    iconStem: row.icon?.iconStem,
    talentFolder: row.icon?.talentFolder,
    mechanicTags: row.mechanicTags,
    opcodeSummary: row.opcodeSummary,
    hasDescription: row.hasDescription ? "true" : "false",
    descriptionId: row.descriptionId,
    sourceTable: row.sourceTable,
    sourceOffset: row.sourceOffset,
    effectReferenceField: row.effectReferenceField,
    evidenceMatches: (row.evidenceMatches ?? []).map((match) => `${match.indexKind}:${match.skillName ?? match.recountName ?? match.indexKey}`),
    recommendedNextEvidence: row.recommendedNextEvidence,
    description: row.description,
  };
}

function writeCsv(filePath, rows) {
  const headers = [
    "priority",
    "sourceId",
    "sourceKind",
    "sourceEntityId",
    "name",
    "buffIds",
    "buffNames",
    "buffSourceOffsets",
    "iconFolder",
    "iconStem",
    "talentFolder",
    "mechanicTags",
    "opcodeSummary",
    "hasDescription",
    "descriptionId",
    "sourceTable",
    "sourceOffset",
    "effectReferenceField",
    "evidenceMatches",
    "recommendedNextEvidence",
    "description",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const flat = csvRow(row);
    lines.push(headers.map((header) => csvEscape(flat[header])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const report = buildReport(options);
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.mkdirSync(path.dirname(options.outCsv), { recursive: true });
  fs.writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(options.outMd, formatMarkdown(report, options.maxRows));
  writeCsv(options.outCsv, report.rows);
  console.log(`Wrote ${options.outJson}`);
  console.log(`Wrote ${options.outMd}`);
  console.log(`Wrote ${options.outCsv}`);
  console.log(`Opaque rows: ${report.summary.rows}`);
  console.log(`Missing descriptions: ${report.summary.rowsMissingDescription}`);
  console.log(`Opcode-3-only rows: ${report.summary.opcode3OnlyRows}`);
}

main();
