#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as common from "../../BPSR-UID-Extractors/generator-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaultOpaqueJson = path.join(repoRoot, "DEV_exports", "game-formula-opaque-buff-slice.json");
const defaultOutJson = path.join(repoRoot, "DEV_exports", "game-formula-buff-effect-surface.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "game-formula-buff-effect-surface.md");
const defaultOutCsv = path.join(repoRoot, "DEV_exports", "game-formula-buff-effect-surface.csv");

const INT_POOL = 1;
const STRING_POOL = 6;
const MAX_INT_ARRAY_LENGTH = 256;
const MAX_RECURSION_DEPTH = 4;

const knownTableNames = [
  "BuffTable.ctb",
  "ModEffectTable.ctb",
  "TempAttrTable.ctb",
  "FightAttrTable.ctb",
  "BasicAttrTable.ctb",
  "DamageAttrTable.ctb",
  "RecountTable.ctb",
  "SkillTable.ctb",
  "SkillEffectTable.ctb",
  "SkillFightLevelTable.ctb",
  "TalentTable.ctb",
  "ItemTable.ctb",
];

const knownHashLabels = new Map([
  [164473594, "CTB:164473594 SeasonTalentNode"],
  [395604162, "CTB:395604162 SkillPair"],
  [1383488036, "CTB:1383488036 SkillPair"],
  [2200122700, "CTB:2200122700 RogueEntryDescription"],
  [2319498083, "CTB:2319498083 SkillPair"],
  [2553675475, "CTB:2553675475 SeasonPhantomFactor"],
  [3307381957, "CTB:3307381957 SkillPair"],
  [3345237628, "TalentTable.ctb"],
  [3518555200, "CTB:3518555200 VirtualSkillBridge"],
  [3701956197, "CTB:3701956197 ItemCategory"],
  [3754561411, "CTB:3754561411 SkillPair"],
  [4038258408, "CTB:4038258408 RogueEntry"],
  [4192598123, "CTB:4192598123 SeasonEffectDescription"],
]);

const sourceTableLabels = new Set([
  "BuffTable.ctb",
  "TalentTable.ctb",
  "CTB:164473594 SeasonTalentNode",
  "CTB:4038258408 RogueEntry",
  "CTB:4192598123 SeasonEffectDescription",
]);

const highValueSecondaryPattern =
  /ModEffect|TempAttr|FightAttr|BasicAttr|SkillEffect|SkillFightLevel|DamageAttr|RecountTable|SkillTable/i;

const formulaTextPatterns = [
  { category: "formula-token", re: /formula|valuecal|coefficient|multiplier|modifier|ratio|calc(?:ulate|ulation)?/i },
  { category: "damage-token", re: /\bdmg\b|damage|attack|atk|skill damage|dream(?:scape)? dmg/i },
  { category: "crit-luck-token", re: /crit|critical|lucky|luck/i },
  { category: "stat-token", re: /haste|mastery|versatility|resistance|defense|element|attribute|stat|rating/i },
  { category: "parameter-token", re: /percent|rate|bonus|increase|decrease|stack|duration|interval|cooldown/i },
  { category: "cjk-damage-token", re: /[\u4f24\u50b7]\u5bb3|\u30c0\u30e1\u30fc\u30b8|\ub300\ubbf8\uc9c0|\ud53c\ud574/u },
  { category: "cjk-multiplier-token", re: /\u500d\u7387|\u7cfb\u6570|\u4fc2\u6578|\u52a0\u6210|\u63d0\u5347|\u589e\u52a0/u },
];

for (const tableName of knownTableNames) {
  knownHashLabels.set(common.hash33(tableName), tableName);
}

function parseArgs(argv) {
  const config = common.loadGeneratorConfig();
  const options = {
    game: config.gamePath,
    opaqueJson: defaultOpaqueJson,
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    outCsv: defaultOutCsv,
    maxRows: 100,
    maxSamplesPerBuff: 12,
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
      case "--opaque-json":
        options.opaqueJson = path.resolve(next());
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
      case "--max-samples-per-buff":
        options.maxSamplesPerBuff = Number(next());
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
  console.log(`Buff Effect Surface Slice - inspect BuffTable rows and CTB references for opaque buff ids.

Usage:
  npm run lab:buff-effect-surface -- [options]

Options:
  --game <path|preset>          Game path or launcher preset. Default comes from BPSR-UID-Extractors/gamepath.json.
  --opaque-json <file>          Input opaque buff slice. Default: DEV_exports/game-formula-opaque-buff-slice.json
  --out-json <file>             Output JSON. Default: DEV_exports/game-formula-buff-effect-surface.json
  --out-md <file>               Output Markdown. Default: DEV_exports/game-formula-buff-effect-surface.md
  --out-csv <file>              Output CSV. Default: DEV_exports/game-formula-buff-effect-surface.csv
  --max-rows <count>            Max Markdown rows per section. Default: 100
  --max-samples-per-buff <n>    Max reference samples kept per buff id. Default: 12
  --help                        Show this help.
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

function uniqueNumbers(values) {
  return [...new Set(asArray(values).map(Number).filter(Number.isFinite))].sort((left, right) => left - right);
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

function readU32(buffer, offset) {
  if (!buffer || offset < 0 || offset + 4 > buffer.length) return 0;
  return buffer.readUInt32LE(offset);
}

function readI32(buffer, offset) {
  if (!buffer || offset < 0 || offset + 4 > buffer.length) return 0;
  return buffer.readInt32LE(offset);
}

function readFloat(buffer, offset) {
  if (!buffer || offset < 0 || offset + 4 > buffer.length) return null;
  const value = buffer.readFloatLE(offset);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) < 0.000001 || Math.abs(value) > 1000000) return null;
  return Number(value.toFixed(6));
}

function readIntArrayFromPool(pool, offset) {
  if (!pool || !Number.isInteger(offset) || offset <= 20 || offset + 2 > pool.length) return [];
  const length = pool.readInt16LE(offset);
  if (length <= 0 || length > MAX_INT_ARRAY_LENGTH || offset + 2 + length * 4 > pool.length) return [];
  const out = [];
  for (let index = 0; index < length; index += 1) {
    out.push(pool.readInt32LE(offset + 2 + index * 4));
  }
  return out;
}

function readStringFromPool(table, offset) {
  if (!Number.isInteger(offset) || offset <= 0) return "";
  return common.readCtbString(table, STRING_POOL, offset, { allowZero: false, maxLen: 512 });
}

function tableLabel(key) {
  return knownHashLabels.get(Number(key) >>> 0) ?? `CTB:${Number(key) >>> 0}`;
}

function tryReadCtbTable(containerDir, entry) {
  try {
    return common.readCtbTableEntry(containerDir, entry, tableLabel(entry.key), entry.key);
  } catch {
    return null;
  }
}

function matchFormulaText(text) {
  const categories = [];
  for (const pattern of formulaTextPatterns) {
    if (pattern.re.test(text)) categories.push(pattern.category);
  }
  return categories;
}

function buildTargetIndex(opaque) {
  const targetByBuffId = new Map();
  for (const source of asArray(opaque.rows)) {
    for (const buffId of uniqueNumbers(source.buffIds)) {
      const existing = targetByBuffId.get(buffId) ?? {
        buffId,
        sourceRows: [],
        sourceNames: new Set(),
        sourceKinds: new Set(),
        priorities: new Set(),
        mechanicTags: new Set(),
      };
      existing.sourceRows.push(source);
      existing.sourceNames.add(source.name);
      existing.sourceKinds.add(source.sourceKind);
      existing.priorities.add(source.priority);
      for (const tag of source.mechanicTags ?? []) existing.mechanicTags.add(tag);
      targetByBuffId.set(buffId, existing);
    }
  }
  return targetByBuffId;
}

function decodeBuffTableRows(buffTable, targetByBuffId) {
  const intPool = buffTable.pools.get(INT_POOL);
  const rowsByBuffId = new Map();

  for (let rowIndex = 0; rowIndex < buffTable.rowCount; rowIndex += 1) {
    const rowOffset = buffTable.rowStart + rowIndex * buffTable.rowSize;
    const buffId = readU32(buffTable.data, rowOffset);
    if (!targetByBuffId.has(buffId)) continue;

    const fields = [];
    const strings = [];
    const arrays = [];
    const formulaLikeStrings = [];
    for (let fieldOffset = 0; fieldOffset + 4 <= buffTable.rowSize; fieldOffset += 4) {
      const value = readU32(buffTable.data, rowOffset + fieldOffset);
      const signedValue = readI32(buffTable.data, rowOffset + fieldOffset);
      const text = readStringFromPool(buffTable, value);
      const arrayValues = readIntArrayFromPool(intPool, value);
      const floatValue = readFloat(buffTable.data, rowOffset + fieldOffset);
      if (text) {
        const categories = matchFormulaText(text);
        strings.push(stripUndefined({ fieldOffset, value, text, categories }));
        if (categories.length) formulaLikeStrings.push(stripUndefined({ fieldOffset, text, categories }));
      }
      if (arrayValues.length) {
        arrays.push({ fieldOffset, offset: value, length: arrayValues.length, sample: arrayValues.slice(0, 24) });
      }
      if (value || text || arrayValues.length || floatValue !== null) {
        fields.push(stripUndefined({
          fieldOffset,
          value,
          signedValue: signedValue !== value ? signedValue : undefined,
          floatValue,
          text,
          arrayLength: arrayValues.length || undefined,
          arraySample: arrayValues.length ? arrayValues.slice(0, 12) : undefined,
        }));
      }
    }

    const structureSignature = fields
      .filter((field) => ![0, 4, 8, 12, 16, 36].includes(field.fieldOffset))
      .map((field) => `${field.fieldOffset}:${field.value}`)
      .join("|");

    rowsByBuffId.set(buffId, stripUndefined({
      buffId,
      rowIndex,
      sourceOffset: buffTable.entry.offset + rowOffset,
      level: readU32(buffTable.data, rowOffset + 4),
      nameOffset: readU32(buffTable.data, rowOffset + 8),
      field12: readU32(buffTable.data, rowOffset + 12),
      nameId: readU32(buffTable.data, rowOffset + 16),
      designName: strings.find((entry) => entry.fieldOffset === 8)?.text,
      secondaryNameOrIconText: strings.find((entry) => entry.fieldOffset === 12)?.text,
      strings,
      formulaLikeStrings,
      arrays,
      fields,
      structureSignature,
      hasFormulaLikeText: Boolean(formulaLikeStrings.length),
      hasNonNameFormulaLikeText: formulaLikeStrings.some((entry) => ![8, 12, 16].includes(entry.fieldOffset)),
      stringSummary: uniqueStrings(strings.map((entry) => entry.text)),
    }));
  }

  return rowsByBuffId;
}

function findTargetsInIntPool(pool, offset, targetSet, seen = new Set(), depth = 0) {
  if (depth > MAX_RECURSION_DEPTH || !Number.isInteger(offset) || seen.has(offset)) return [];
  seen.add(offset);
  const values = readIntArrayFromPool(pool, offset);
  if (!values.length) return [];

  const hits = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (targetSet.has(value)) {
      hits.push({
        target: value,
        path: depth === 0 ? "int-array" : "nested-int-array",
        depth,
        arrayOffset: offset,
        arrayIndex: index,
        arraySample: values.slice(0, 24),
      });
    }
    if (value > 20 && value < pool.length) {
      hits.push(...findTargetsInIntPool(pool, value, targetSet, new Set(seen), depth + 1));
    }
  }
  return hits;
}

function scanReferenceTables(containerDir, metaEntries, targetByBuffId, options) {
  const targetSet = new Set(targetByBuffId.keys());
  const referencesByBuffId = new Map([...targetSet].map((buffId) => [buffId, []]));
  const tableSummaries = [];
  let ctbEntriesScanned = 0;
  let ctbParseFailures = 0;

  for (const entry of [...metaEntries.values()].sort((left, right) => left.key - right.key)) {
    const table = tryReadCtbTable(containerDir, entry);
    if (!table) {
      ctbParseFailures += 1;
      continue;
    }
    ctbEntriesScanned += 1;
    const intPool = table.pools.get(INT_POOL);
    const label = tableLabel(entry.key);
    const tableHits = {
      key: Number(entry.key) >>> 0,
      label,
      packageOffset: entry.offset,
      packageLength: entry.length,
      rowCount: table.rowCount,
      rowSize: table.rowSize,
      directHits: 0,
      intArrayHits: 0,
      nestedIntArrayHits: 0,
      totalHits: 0,
      targetBuffIds: new Set(),
      samples: [],
    };

    for (let rowIndex = 0; rowIndex < table.rowCount; rowIndex += 1) {
      const rowOffset = table.rowStart + rowIndex * table.rowSize;
      const rowId = readU32(table.data, rowOffset);
      for (let fieldOffset = 0; fieldOffset + 4 <= table.rowSize; fieldOffset += 4) {
        const value = readU32(table.data, rowOffset + fieldOffset);
        if (targetSet.has(value)) {
          addReference({
            referencesByBuffId,
            tableHits,
            buffId: value,
            hitKind: "direct-field",
            table,
            label,
            rowIndex,
            rowId,
            rowOffset,
            fieldOffset,
            value,
            options,
          });
        }
        if (intPool && value > 20 && value < intPool.length) {
          for (const hit of findTargetsInIntPool(intPool, value, targetSet)) {
            addReference({
              referencesByBuffId,
              tableHits,
              buffId: hit.target,
              hitKind: hit.path,
              table,
              label,
              rowIndex,
              rowId,
              rowOffset,
              fieldOffset,
              value,
              intArrayHit: hit,
              options,
            });
          }
        }
      }
    }

    if (tableHits.totalHits) {
      tableSummaries.push({
        ...tableHits,
        targetBuffIds: [...tableHits.targetBuffIds].sort((left, right) => left - right),
      });
    }
  }

  return {
    ctbEntriesScanned,
    ctbParseFailures,
    referencesByBuffId,
    tableSummaries: tableSummaries.sort((left, right) => (
      right.totalHits - left.totalHits
      || right.targetBuffIds.length - left.targetBuffIds.length
      || left.label.localeCompare(right.label)
    )),
  };
}

function addReference({
  referencesByBuffId,
  tableHits,
  buffId,
  hitKind,
  table,
  label,
  rowIndex,
  rowId,
  rowOffset,
  fieldOffset,
  value,
  intArrayHit,
  options,
}) {
  tableHits.totalHits += 1;
  tableHits.targetBuffIds.add(buffId);
  if (hitKind === "direct-field") tableHits.directHits += 1;
  else if (hitKind === "int-array") tableHits.intArrayHits += 1;
  else tableHits.nestedIntArrayHits += 1;

  const reference = stripUndefined({
    tableKey: Number(table.key) >>> 0,
    tableLabel: label,
    rowIndex,
    rowId,
    rowSourceOffset: table.entry.offset + rowOffset,
    fieldOffset,
    value,
    hitKind,
    arrayOffset: intArrayHit?.arrayOffset,
    arrayIndex: intArrayHit?.arrayIndex,
    arrayDepth: intArrayHit?.depth,
    arraySample: intArrayHit?.arraySample,
  });

  const list = referencesByBuffId.get(buffId) ?? [];
  if (list.length < options.maxSamplesPerBuff) {
    list.push(reference);
    referencesByBuffId.set(buffId, list);
  }
  if (tableHits.samples.length < options.maxSamplesPerBuff) {
    tableHits.samples.push({ buffId, ...reference });
  }
}

function classifyReferenceSurface(references) {
  const labels = uniqueStrings(references.map((reference) => reference.tableLabel));
  const secondaryLabels = labels.filter((label) => !sourceTableLabels.has(label));
  const highValueSecondaryLabels = secondaryLabels.filter((label) => highValueSecondaryPattern.test(label));
  if (highValueSecondaryLabels.length) return "high-value-secondary-reference";
  if (secondaryLabels.length) return "secondary-reference";
  return "bufftable-and-source-only";
}

function nextEvidenceFor(row) {
  if (row.referenceClass === "high-value-secondary-reference") {
    return "Inspect the high-value secondary table rows first; they may carry stat/effect semantics.";
  }
  if (row.referenceClass === "secondary-reference") {
    return "Inspect secondary CTB row context; if it is only naming/icon metadata, fall back to runtime deltas.";
  }
  if (row.mechanicTags?.includes("probable-party-or-support")) {
    return "No static payload table found; capture buff owner/source uid plus receiver stat deltas.";
  }
  if (row.mechanicTags?.includes("stat-or-rating-modifier")) {
    return "No static payload table found; compare pre/post stat snapshots for the active buff.";
  }
  if (row.mechanicTags?.includes("damage-or-extra-hit-source")) {
    return "No static payload table found; bridge emitted child damage ids or active passive/talent state.";
  }
  return "No static payload table found in this scan; needs runtime proof or deeper schema metadata.";
}

function buildRows({ targetByBuffId, buffRowsById, referencesByBuffId }) {
  const rows = [];
  for (const [buffId, target] of targetByBuffId.entries()) {
    const buffRow = buffRowsById.get(buffId) ?? null;
    const references = referencesByBuffId.get(buffId) ?? [];
    const referenceClass = classifyReferenceSurface(references);
    const referenceLabels = uniqueStrings(references.map((reference) => reference.tableLabel));
    const secondaryReferenceLabels = referenceLabels.filter((label) => !sourceTableLabels.has(label));
    const highValueSecondaryLabels = secondaryReferenceLabels.filter((label) => highValueSecondaryPattern.test(label));
    const sourceNames = uniqueStrings(target.sourceNames);
    const mechanicTags = uniqueStrings(target.mechanicTags);
    const row = stripUndefined({
      buffId,
      sourceNames,
      sourceKinds: uniqueStrings(target.sourceKinds),
      priorities: uniqueStrings(target.priorities),
      mechanicTags,
      sourceCount: target.sourceRows.length,
      buffTable: buffRow,
      buffTableFound: Boolean(buffRow),
      referenceClass,
      referenceTables: referenceLabels,
      secondaryReferenceTables: secondaryReferenceLabels,
      highValueSecondaryTables: highValueSecondaryLabels,
      referenceCount: references.length,
      referenceSamples: references,
      nextEvidence: "",
    });
    row.nextEvidence = nextEvidenceFor(row);
    rows.push(row);
  }

  return rows.sort((left, right) => (
    referenceClassRank(left.referenceClass) - referenceClassRank(right.referenceClass)
    || String(left.priorities?.[0] ?? "").localeCompare(String(right.priorities?.[0] ?? ""))
    || String(left.sourceNames?.[0] ?? "").localeCompare(String(right.sourceNames?.[0] ?? ""))
    || left.buffId - right.buffId
  ));
}

function referenceClassRank(value) {
  switch (value) {
    case "high-value-secondary-reference": return 0;
    case "secondary-reference": return 1;
    case "bufftable-and-source-only": return 2;
    default: return 3;
  }
}

function buildSummary(rows, tableScan) {
  const referenceClassCounts = new Map();
  const priorityCounts = new Map();
  const mechanicTagCounts = new Map();
  const structureSignatureCounts = new Map();
  const secondaryTableCounts = new Map();
  for (const row of rows) {
    addCount(referenceClassCounts, row.referenceClass);
    for (const priority of row.priorities ?? []) addCount(priorityCounts, priority);
    for (const tag of row.mechanicTags ?? []) addCount(mechanicTagCounts, tag);
    if (row.buffTable?.structureSignature) addCount(structureSignatureCounts, row.buffTable.structureSignature);
    for (const label of row.secondaryReferenceTables ?? []) addCount(secondaryTableCounts, label);
  }

  return {
    buffIdsScanned: rows.length,
    buffTableRowsFound: rows.filter((row) => row.buffTableFound).length,
    buffTableRowsWithFormulaLikeText: rows.filter((row) => row.buffTable?.hasFormulaLikeText).length,
    buffTableRowsWithNonNameFormulaLikeText: rows.filter((row) => row.buffTable?.hasNonNameFormulaLikeText).length,
    ctbEntriesScanned: tableScan.ctbEntriesScanned,
    ctbParseFailures: tableScan.ctbParseFailures,
    referenceTablesWithHits: tableScan.tableSummaries.length,
    referenceClassCounts: sortedCountMap(referenceClassCounts),
    priorityCounts: sortedCountMap(priorityCounts),
    mechanicTagCounts: sortedCountMap(mechanicTagCounts),
    secondaryTableCounts: sortedCountMap(secondaryTableCounts),
    structureSignatureCounts: sortedCountMap(structureSignatureCounts).slice(0, 20),
  };
}

function groupExamples(rows, maxRows) {
  return {
    inspirationCluster: rows.filter((row) => row.sourceNames?.some((name) => /\binspir(?:e|ation)/i.test(name))).slice(0, maxRows),
    highValueSecondary: rows.filter((row) => row.referenceClass === "high-value-secondary-reference").slice(0, maxRows),
    secondary: rows.filter((row) => row.referenceClass === "secondary-reference").slice(0, maxRows),
    sourceOnlySupport: rows.filter((row) => (
      row.referenceClass === "bufftable-and-source-only"
      && row.mechanicTags?.includes("probable-party-or-support")
    )).slice(0, maxRows),
    sourceOnlyStat: rows.filter((row) => (
      row.referenceClass === "bufftable-and-source-only"
      && row.mechanicTags?.includes("stat-or-rating-modifier")
    )).slice(0, maxRows),
    sourceOnlyDamage: rows.filter((row) => (
      row.referenceClass === "bufftable-and-source-only"
      && row.mechanicTags?.includes("damage-or-extra-hit-source")
    )).slice(0, maxRows),
  };
}

function buildReport(options) {
  const opaque = readJson(options.opaqueJson, {});
  const targetByBuffId = buildTargetIndex(opaque);
  const m0Path = common.resolveM0Package(options.game);
  const containerDir = path.dirname(m0Path);
  const metaEntries = common.loadMetaEntries(containerDir);
  const buffTable = common.readCtbTable(containerDir, metaEntries, "BuffTable.ctb");
  const buffRowsById = decodeBuffTableRows(buffTable, targetByBuffId);
  const tableScan = scanReferenceTables(containerDir, metaEntries, targetByBuffId, options);
  const rows = buildRows({
    targetByBuffId,
    buffRowsById,
    referencesByBuffId: tableScan.referencesByBuffId,
  });

  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : 100;
  return {
    generatedAt: new Date().toISOString(),
    inputPaths: {
      opaqueJson: options.opaqueJson,
      m0Path,
      game: options.game,
    },
    scope: "BuffTable rows plus all CTB references for opaque buff-backed source ids",
    summary: buildSummary(rows, tableScan),
    referenceTables: tableScan.tableSummaries.slice(0, 120),
    examples: groupExamples(rows, maxRows),
    rows,
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

function formatBuffRows(rows) {
  if (!rows.length) return "_None found._";
  return markdownTable(
    rows,
    ["Buff", "Sources", "Class", "Secondary tables", "BuffTable strings", "Next evidence"],
    (row) => [
      row.buffId,
      (row.sourceNames ?? []).join(", "),
      row.referenceClass,
      (row.secondaryReferenceTables ?? []).join(", "),
      shorten(row.buffTable?.stringSummary?.join("; "), 120),
      shorten(row.nextEvidence, 180),
    ],
  );
}

function formatMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Buff Effect Surface Slice");
  lines.push("");
  lines.push("Offline report for the BuffTable and CTB reference surface behind the opaque buff-backed source rows. This does not change parser or Skill Details behavior.");
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
  lines.push(`- opaque unique buff ids scanned: ${report.summary.buffIdsScanned}`);
  lines.push(`- BuffTable rows found: ${report.summary.buffTableRowsFound}`);
  lines.push(`- BuffTable rows with formula-like text: ${report.summary.buffTableRowsWithFormulaLikeText}`);
  lines.push(`- BuffTable rows with non-name formula-like text: ${report.summary.buffTableRowsWithNonNameFormulaLikeText}`);
  lines.push(`- CTB entries scanned for references: ${report.summary.ctbEntriesScanned}`);
  lines.push(`- CTB parse failures/skips: ${report.summary.ctbParseFailures}`);
  lines.push(`- CTB tables with target buff-id hits: ${report.summary.referenceTablesWithHits}`);
  lines.push("");
  lines.push("## Reference Classes");
  lines.push("");
  lines.push(markdownTable(report.summary.referenceClassCounts, ["Class", "Buff ids"], (row) => [row.key, row.count]));
  lines.push("");
  if (report.summary.secondaryTableCounts.length) {
    lines.push("## Secondary Tables");
    lines.push("");
    lines.push(markdownTable(report.summary.secondaryTableCounts, ["Table", "Buff ids"], (row) => [row.key, row.count]));
    lines.push("");
  }
  lines.push("## Top Reference Tables");
  lines.push("");
  lines.push(markdownTable(
    report.referenceTables.slice(0, 40),
    ["Table", "Target ids", "Hits", "Direct", "Int-array", "Nested"],
    (row) => [
      row.label,
      row.targetBuffIds.length,
      row.totalHits,
      row.directHits,
      row.intArrayHits,
      row.nestedIntArrayHits,
    ],
  ));
  lines.push("");
  lines.push("## BuffTable Structure Signatures");
  lines.push("");
  lines.push(markdownTable(
    report.summary.structureSignatureCounts.slice(0, 12),
    ["Signature", "Rows"],
    (row) => [shorten(row.key, 160), row.count],
  ));
  lines.push("");
  lines.push("## Inspiration Cluster");
  lines.push("");
  lines.push(formatBuffRows(report.examples.inspirationCluster.slice(0, maxRows)));
  lines.push("");
  lines.push("## High-Value Secondary References");
  lines.push("");
  lines.push(formatBuffRows(report.examples.highValueSecondary.slice(0, maxRows)));
  lines.push("");
  lines.push("## Other Secondary References");
  lines.push("");
  lines.push(formatBuffRows(report.examples.secondary.slice(0, maxRows)));
  lines.push("");
  lines.push("## Source-Only Support Rows");
  lines.push("");
  lines.push(formatBuffRows(report.examples.sourceOnlySupport.slice(0, maxRows)));
  lines.push("");
  lines.push("## Source-Only Stat Rows");
  lines.push("");
  lines.push(formatBuffRows(report.examples.sourceOnlyStat.slice(0, maxRows)));
  lines.push("");
  lines.push("## Source-Only Damage Rows");
  lines.push("");
  lines.push(formatBuffRows(report.examples.sourceOnlyDamage.slice(0, Math.min(maxRows, 80))));
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- A `bufftable-and-source-only` row means the broad CTB reference scan only found the BuffTable row and source selection rows such as TalentTable/season nodes. That is strong evidence that descriptions and obvious static reference tables are exhausted for that buff id.");
  lines.push("- `CTB:4192598123 SeasonEffectDescription` is treated as a source/description sidecar, not as a payload table. Its sampled rows are only 8-byte `buff id -> opaque id` records in this scan, and the second id did not resolve through the loaded locale tables.");
  lines.push("- A secondary reference is not automatically a formula. It is a queue for targeted row-context/schema inspection.");
  lines.push("- If Inspiration-style buffs remain source-only, numeric contribution splitting needs runtime owner/source uid and receiver stat deltas rather than more description scraping.");
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
    buffId: row.buffId,
    sourceNames: row.sourceNames,
    sourceKinds: row.sourceKinds,
    priorities: row.priorities,
    mechanicTags: row.mechanicTags,
    buffLevel: row.buffTable?.level,
    buffSourceOffset: row.buffTable?.sourceOffset,
    buffStrings: row.buffTable?.stringSummary,
    buffFormulaLikeStrings: (row.buffTable?.formulaLikeStrings ?? []).map((entry) => `${entry.fieldOffset}:${entry.text}`),
    buffStructureSignature: row.buffTable?.structureSignature,
    referenceClass: row.referenceClass,
    referenceTables: row.referenceTables,
    secondaryReferenceTables: row.secondaryReferenceTables,
    highValueSecondaryTables: row.highValueSecondaryTables,
    referenceCount: row.referenceCount,
    referenceSamples: (row.referenceSamples ?? []).map((sample) => `${sample.tableLabel}@${sample.rowIndex}:${sample.fieldOffset}:${sample.hitKind}`),
    nextEvidence: row.nextEvidence,
  };
}

function writeCsv(filePath, rows) {
  const headers = [
    "buffId",
    "sourceNames",
    "sourceKinds",
    "priorities",
    "mechanicTags",
    "buffLevel",
    "buffSourceOffset",
    "buffStrings",
    "buffFormulaLikeStrings",
    "buffStructureSignature",
    "referenceClass",
    "referenceTables",
    "secondaryReferenceTables",
    "highValueSecondaryTables",
    "referenceCount",
    "referenceSamples",
    "nextEvidence",
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
  console.log(`Buff ids scanned: ${report.summary.buffIdsScanned}`);
  console.log(`Reference classes: ${report.summary.referenceClassCounts.map((row) => `${row.key}=${row.count}`).join(", ")}`);
}

main();
