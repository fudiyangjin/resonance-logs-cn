#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const DEFAULT_LOG_ROOT = path.join(
  process.env.APPDATA ?? "",
  "com.resonance-logs-cn",
  "EventLogs",
);
const DEFAULT_GAME_ROOT =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Blue Protocol Star Resonance\\bpsr";
const DEFAULT_EXPORT_DIR = "DEV_exports";
const DEAD_BEEF = Buffer.from("EFBEADDE", "hex");
const INTERESTING_TABLE_TERMS = [
  "EquipTable.proto",
  "EquipAttrLibTable.proto",
  "BasicAttrTable.proto",
  "BasicAttrGrowTable.proto",
  "FightAttrTable.proto",
  "EquipEffectDetileTable.proto",
  "EquipEffectLibTable.proto",
  "EquipTableBase",
  "EquipAttrLibTableBase",
  "BasicGrowRange",
  "BonusGrowTimes",
  "TypeAttrLibID",
  "ValueCal",
  "OfficialName",
];
const STRONG_TABLE_ANCHORS = new Set([
  "FightAttrTable.proto",
  "EquipAttrLibTable.proto",
  "EquipEffectDetileTable.proto",
  "EquipEffectLibTable.proto",
  "BasicAttrTable.proto",
  "BasicAttrGrowTable.proto",
  "EquipTable.proto",
  "EquipAttrLibTableBase",
  "EquipTableBase",
  "BasicGrowRange",
  "ValueCal",
]);
const SECONDARY_TABLE_ANCHORS = new Set([
  "BonusGrowTimes",
  "TypeAttrLibID",
]);
const NOISE_TABLE_ANCHORS = new Set([
  "OfficialName",
]);
const DEFAULT_FOCUS_TARGET_IDS = [
  121516545,
  114438657,
  124531201,
  124924417,
  1066213775,
];
const DEFAULT_NAME_TERMS = [
  "Attack SPD",
  "Casting SPD",
  "Armor",
  "Resistance",
  "Agility",
  "Luck",
  "Haste",
  "Mastery",
  "Versatility",
  "Crit",
  "Crit Chance",
  "Critical Chance",
  "Endurance",
  "Max HP",
  "ATK",
  "MATK",
  "Refined ATK",
  "Refined MATK",
  "Refined Armor",
  "Physical Boost",
  "Magical Boost",
  "Crit DMG",
  "Healing Strength",
  "Received Healing Strength",
  "Block",
  "Fortune Highland",
  "Peerless Swift",
  "Lethal Jade",
  "Lethal Glazed",
];
const DEFAULT_KNOWN_ITEM_IDS = [2030919, 2040815, 2040838, 2060913, 2101013];
const DIRECT_VALUECAL_TARGET_GROUPS = [
  { key: "149|150", values: [149, 150] },
  { key: "211|212", values: [211, 212] },
  { key: "301|2002|3446|12001", values: [301, 2002, 3446, 12001] },
  { key: "4352", values: [4352] },
  { key: "9658", values: [9658] },
];
const DIRECT_BASIC_GROW_RANGE_IDS = [1120, 1140, 1160];
const BASIC_ATTR_GROW_RECORD_SIZE = 28;
const BASIC_ATTR_GROW_RECORD_WORDS = BASIC_ATTR_GROW_RECORD_SIZE / 4;
const BASIC_ATTR_VALUE_SCAN_BEFORE_BYTES = 64_000;
const BASIC_ATTR_VALUE_SCAN_AFTER_BYTES = 128_000;
const STAT_VALUE_PROOF_MULTIPLIERS = [
  { key: "x1", multiplier: 1 },
  { key: "x1.07", multiplier: 1.07 },
  { key: "x2.14", multiplier: 2.14 },
];
const EQUIP_TABLE_ROW_SIZE = 88;
const PAIR_BRIDGE_REGION_START = 731_000_000;
const PAIR_BRIDGE_REGION_END = 733_000_000;
const EXTRA_STAT_NAME_IDS = new Map([
  [10_309_241, ["Haste"]],
  [10_309_242, ["Luck"]],
  [10_309_243, ["Mastery"]],
  [10_309_244, ["Versatility"]],
  [10_309_248, ["AGI", "Agility"]],
  [10_309_278, ["Attack SPD", "Attack Speed"]],
  [10_309_307, ["Armor", "PDEF"]],
  [487_377_792, ["Crit Chance", "Crit"]],
  [1_950_236_464, ["Crit"]],
]);
const KNOWN_VISIBLE_GEAR_OBSERVATIONS = [
  {
    itemId: 2_030_919,
    uniqueId: 12_048_235,
    source: "screenshot-calibration",
    lines: [
      { slot: 0, label: "Agility", nameId: 10_309_248, value: 1.5, valueKind: "percent" },
      { slot: 1, label: "Haste", nameId: 10_309_241, value: 230, valueKind: "flat" },
      { slot: 2, label: "Versatility", nameId: 10_309_244, value: 461, valueKind: "flat" },
      { slot: 3, label: "Locked", locked: true },
    ],
  },
  {
    itemId: 2_040_815,
    uniqueId: 12_048_382,
    source: "screenshot-calibration",
    lines: [
      { slot: 0, label: "Armor", nameId: 10_309_307, value: 64, valueKind: "flat" },
      { slot: 1, label: "Haste", nameId: 10_309_241, value: 225, valueKind: "flat" },
      { slot: 2, label: "Luck", nameId: 10_309_242, value: 450, valueKind: "flat" },
      { slot: 3, label: "Locked", locked: true },
    ],
  },
  {
    itemId: 2_101_013,
    uniqueId: 12_048_246,
    source: "screenshot-calibration",
    lines: [
      { slot: 0, label: "Attack SPD", nameId: 10_309_278, value: 1.5, valueKind: "percent" },
      { slot: 1, label: "Crit", nameId: 487_377_792, value: 677, valueKind: "flat" },
      { slot: 2, label: "Haste", nameId: 10_309_241, value: 338, valueKind: "flat" },
      { slot: 3, label: "Locked", locked: true },
    ],
  },
  {
    itemId: 2_001_036,
    source: "screenshot-calibration",
    lines: [
      { slot: 0, label: "Crit", nameId: 487_377_792, value: 677, valueKind: "flat" },
      { slot: 1, label: "Luck", nameId: 10_309_242, value: 1355, valueKind: "flat" },
      { slot: 2, label: "Locked", locked: true },
    ],
  },
  {
    itemId: 2_021_037,
    source: "screenshot-calibration",
    lines: [
      { slot: 0, label: "Luck", nameId: 10_309_242, value: 338, valueKind: "flat" },
      { slot: 1, label: "Haste", nameId: 10_309_241, value: 677, valueKind: "flat" },
      { slot: 2, label: "Locked", locked: true },
    ],
  },
  {
    itemId: 2_100_818,
    uniqueId: 12_048_400,
    source: "screenshot-calibration",
    lines: [
      { slot: 0, label: "DMG Bonus vs. Bosses", value: 1, valueKind: "percent" },
      { slot: 1, label: "Haste", nameId: 10_309_241, value: 225, valueKind: "flat" },
      { slot: 2, label: "Mastery", nameId: 10_309_243, value: 451, valueKind: "flat" },
      { slot: 3, label: "Locked", locked: true },
    ],
  },
];
const GEAR_GROUP_BY_SLOT = new Map([
  ["Weapon", "weapon"],
  ["Helmet", "armor"],
  ["Armor", "armor"],
  ["Gauntlets", "armor"],
  ["Boots", "armor"],
  ["Bracelet", "armor"],
  ["Bracelet (L)", "armor"],
  ["Bracelet (R)", "armor"],
  ["Earrings", "accessory"],
  ["Necklace", "accessory"],
  ["Ring", "accessory"],
  ["Charm", "accessory"],
]);
const BLOCKED_ADVANCED_ATTR_BY_SLOT_AND_BASIC = {
  "Helmet": { Strength: ["Versatility"], Intellect: ["Crit"], Agility: ["Haste"] },
  "Armor": { Strength: ["Luck"], Intellect: ["Crit"], Agility: ["Mastery"] },
  "Gauntlets": { Strength: ["Haste"], Intellect: ["Versatility"], Agility: ["Crit"] },
  "Boots": { Strength: ["Mastery"], Intellect: ["Luck"], Agility: ["Crit"] },
  "Earrings": { Strength: ["Mastery"], Intellect: ["Versatility"], Agility: ["Haste"] },
  "Necklace": { Strength: ["Haste"], Intellect: ["Luck"], Agility: ["Mastery"] },
  "Ring": { Strength: ["Luck"], Intellect: ["Mastery"], Agility: ["Versatility"] },
  "Bracelet (L)": { Strength: ["Crit"], Intellect: ["Haste"], Agility: ["Versatility"] },
  "Bracelet (R)": { Strength: ["Crit"], Intellect: ["Mastery"], Agility: ["Luck"] },
  "Charm": { Strength: ["Versatility"], Intellect: ["Haste"], Agility: ["Luck"] },
};
const GENERIC_BRACELET_BLOCKED_ADVANCED_ATTR = {
  Strength: ["Crit"],
  Intellect: ["Haste", "Mastery"],
  Agility: ["Versatility", "Luck"],
};
const LEGENDARY_AFFIX_VALUE_TABLE = {
  weapon: [
    { label: "ATK / MATK", values: [2.5, 3, 3.5] },
    { label: "Attack SPD", values: [2.5, 3, 3.5] },
    { label: "DMG Bonus vs. Bosses", values: [2.5, 3, 3.5] },
    { label: "Shield", values: [2.5, 3, 3.5] },
    { label: "Cast Speed", values: [5, 6, 7] },
    { label: "Healing Output", values: [3, 3.5, 4] },
    { label: "Resilience Break Efficiency", values: [12, 15, 18] },
  ],
  accessory: [
    { label: "ATK / MATK", values: [1, 1.5, 2] },
    { label: "Attack SPD", values: [1, 1.5, 2] },
    { label: "DMG Bonus vs. Bosses", values: [1, 1.5, 2] },
    { label: "Shield", values: [1, 1.5, 2] },
    { label: "Cast Speed", values: [2, 3, 4] },
    { label: "Healing Output", values: [1.5, 2, 2.5] },
    { label: "Resilience Break Efficiency", values: [3, 6, 9] },
  ],
  armor: [
    { label: "Strength / Intellect / Agility", values: [0.5, 1, 1.5] },
    { label: "All Resistance", valuesByLevel: { 120: [24, 48, 72], 140: [36, 72, 108], 160: [40, 80, 120] } },
    { label: "Armor", valuesByLevel: { 120: [32, 64, 96], 140: [48, 96, 144], 160: [64, 128, 192] } },
    { label: "Max HP", valuesByLevel: { 120: [800, 1200, 1600, 2000, 2400], 140: [1500, 1875, 2250, 2625, 3000], 160: [2000, 2500, 3000, 3500, 4000] } },
  ],
};
const ITEM_SLOT_PATTERNS = [
  ["Charm", /\bcharm\b/i],
  ["Bracelet", /\b(?:bracer|bracelet)\b/i],
  ["Boots", /\bboots?\b/i],
  ["Gauntlets", /\b(?:gauntlets?|gloves?)\b/i],
  ["Helmet", /\b(?:helmet|helm|hood|crown)\b/i],
  ["Armor", /\b(?:armor|armour|breastplate|chainmail|coat|robe|battlesuit|combatsuit|mail)\b/i],
  ["Earrings", /\b(?:earring|earrings)\b/i],
  ["Necklace", /\b(?:necklace|amulet)\b/i],
  ["Ring", /\bring\b/i],
  ["Weapon", /\b(?:weapon|blade|bow|staff|lance|wand|gun|sword|scythe|axe|hammer)\b/i],
];
function parseArgs(argv) {
  const args = {
    game: DEFAULT_GAME_ROOT,
    logs: DEFAULT_LOG_ROOT,
    latest: 5,
    windowMs: 1500,
    scanGame: true,
    fullPackageScan: false,
    ids: [...new Set(DEFAULT_KNOWN_ITEM_IDS)],
    pairIds: [],
    jsonOut: null,
    report: null,
    resolve: true,
    hitLimit: 8,
    contextBefore: 160,
    contextAfter: 360,
    cooccurrenceBefore: 8192,
    cooccurrenceAfter: 8192,
    nameTerms: [...DEFAULT_NAME_TERMS],
    exportDir: DEFAULT_EXPORT_DIR,
    maxHops: 4,
    branchLimit: 5,
    csvOut: null,
    exportHopResults: false,
    hopExportDir: "gear-hop-walk",
    focusTargets: [...DEFAULT_FOCUS_TARGET_IDS],
    exportAttributeWindows: false,
    attributeWindowCsvOut: null,
    exportAttributeBridge: false,
    attributeBridgeCsvOut: null,
    statNameCsvOut: null,
    observedAttributeCsvOut: null,
    attributeInferenceCsvOut: null,
    exportAttrLib: false,
    attrLibCandidatesCsvOut: null,
    attrLibLaneCsvOut: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--game" && next) {
      args.game = next;
      i += 1;
    } else if (arg === "--logs" && next) {
      args.logs = next;
      i += 1;
    } else if (arg === "--latest" && next) {
      args.latest = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--window-ms" && next) {
      args.windowMs = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--id" && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed)) args.ids.push(parsed);
      i += 1;
    } else if (arg === "--pair" && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed)) args.pairIds.push(parsed);
      i += 1;
    } else if (arg === "--json-out" && next) {
      args.jsonOut = next;
      i += 1;
    } else if (arg === "--report" && next) {
      args.report = next;
      i += 1;
    } else if (arg === "--hit-limit" && next) {
      args.hitLimit = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--context-before" && next) {
      args.contextBefore = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--context-after" && next) {
      args.contextAfter = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--name-term" && next) {
      args.nameTerms.push(next);
      i += 1;
    } else if (arg === "--cooccurrence-before" && next) {
      args.cooccurrenceBefore = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--cooccurrence-after" && next) {
      args.cooccurrenceAfter = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--export-dir" && next) {
      args.exportDir = next;
      i += 1;
    } else if (arg === "--max-hops" && next) {
      args.maxHops = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--branch-limit" && next) {
      args.branchLimit = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--csv-out" && next) {
      args.csvOut = next;
      i += 1;
    } else if (arg === "--hop-export-dir" && next) {
      args.hopExportDir = next;
      i += 1;
    } else if (arg === "--focus-target" && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed)) args.focusTargets.push(parsed);
      i += 1;
    } else if (arg === "--attribute-window-csv-out" && next) {
      args.attributeWindowCsvOut = next;
      i += 1;
    } else if (arg === "--attribute-bridge-csv-out" && next) {
      args.attributeBridgeCsvOut = next;
      i += 1;
    } else if (arg === "--stat-name-csv-out" && next) {
      args.statNameCsvOut = next;
      i += 1;
    } else if (arg === "--observed-attribute-csv-out" && next) {
      args.observedAttributeCsvOut = next;
      i += 1;
    } else if (arg === "--attribute-inference-csv-out" && next) {
      args.attributeInferenceCsvOut = next;
      i += 1;
    } else if (arg === "--attrlib-candidates-csv-out" && next) {
      args.attrLibCandidatesCsvOut = next;
      i += 1;
    } else if (arg === "--attrlib-lane-csv-out" && next) {
      args.attrLibLaneCsvOut = next;
      i += 1;
    } else if (arg === "--export-attrlib") {
      args.exportAttrLib = true;
    } else if (arg === "--export-hop-results") {
      args.exportHopResults = true;
    } else if (arg === "--export-attribute-windows") {
      args.exportAttributeWindows = true;
    } else if (arg === "--export-attribute-bridge") {
      args.exportAttributeBridge = true;
    } else if (arg === "--no-game-scan") {
      args.scanGame = false;
    } else if (arg === "--full-package-scan") {
      args.fullPackageScan = true;
    } else if (arg === "--no-resolve") {
      args.resolve = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  args.latest = Math.max(1, Number.isFinite(args.latest) ? args.latest : 5);
  args.windowMs = Math.max(250, Number.isFinite(args.windowMs) ? args.windowMs : 1500);
  args.hitLimit = Math.max(1, Number.isFinite(args.hitLimit) ? args.hitLimit : 8);
  args.contextBefore = Math.max(16, Number.isFinite(args.contextBefore) ? args.contextBefore : 160);
  args.contextAfter = Math.max(32, Number.isFinite(args.contextAfter) ? args.contextAfter : 360);
  args.cooccurrenceBefore = Math.max(
    256,
    Number.isFinite(args.cooccurrenceBefore) ? args.cooccurrenceBefore : 8192,
  );
  args.cooccurrenceAfter = Math.max(
    256,
    Number.isFinite(args.cooccurrenceAfter) ? args.cooccurrenceAfter : 8192,
  );
  args.ids = [...new Set(args.ids.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
  args.pairIds = [...new Set(args.pairIds.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
  args.nameTerms = [...new Set(args.nameTerms.filter((value) => typeof value === "string" && value.trim()))];
  args.exportDir = typeof args.exportDir === "string" && args.exportDir.trim() ? args.exportDir : DEFAULT_EXPORT_DIR;
  args.maxHops = Math.max(2, Number.isFinite(args.maxHops) ? args.maxHops : 4);
  args.branchLimit = Math.max(1, Number.isFinite(args.branchLimit) ? args.branchLimit : 5);
  args.csvOut = typeof args.csvOut === "string" && args.csvOut.trim() ? args.csvOut : null;
  args.hopExportDir = typeof args.hopExportDir === "string" && args.hopExportDir.trim() ? args.hopExportDir : "gear-hop-walk";
  args.focusTargets = [...new Set(args.focusTargets.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  args.attributeWindowCsvOut =
    typeof args.attributeWindowCsvOut === "string" && args.attributeWindowCsvOut.trim()
      ? args.attributeWindowCsvOut
      : null;
  args.attributeBridgeCsvOut =
    typeof args.attributeBridgeCsvOut === "string" && args.attributeBridgeCsvOut.trim()
      ? args.attributeBridgeCsvOut
      : null;
  args.statNameCsvOut =
    typeof args.statNameCsvOut === "string" && args.statNameCsvOut.trim()
      ? args.statNameCsvOut
      : null;
  args.observedAttributeCsvOut =
    typeof args.observedAttributeCsvOut === "string" && args.observedAttributeCsvOut.trim()
      ? args.observedAttributeCsvOut
      : null;
  args.attributeInferenceCsvOut =
    typeof args.attributeInferenceCsvOut === "string" && args.attributeInferenceCsvOut.trim()
      ? args.attributeInferenceCsvOut
      : null;
  args.attrLibCandidatesCsvOut =
    typeof args.attrLibCandidatesCsvOut === "string" && args.attrLibCandidatesCsvOut.trim()
      ? args.attrLibCandidatesCsvOut
      : null;
  args.attrLibLaneCsvOut =
    typeof args.attrLibLaneCsvOut === "string" && args.attrLibLaneCsvOut.trim()
      ? args.attrLibLaneCsvOut
      : null;
  args.exportHopResults = Boolean(args.exportHopResults || args.csvOut || args.maxHops > 2);
  args.exportAttributeWindows = Boolean(args.exportAttributeWindows || args.attributeWindowCsvOut);
  args.exportAttributeBridge = Boolean(
    args.exportAttributeBridge ||
      args.attributeBridgeCsvOut ||
      args.statNameCsvOut ||
      args.observedAttributeCsvOut ||
      args.attributeInferenceCsvOut,
  );
  args.exportAttrLib = Boolean(args.exportAttrLib || args.attrLibCandidatesCsvOut || args.attrLibLaneCsvOut);
  return args;
}
function printHelp() {
  console.log(`Usage: node scripts/gear-table-probe.mjs [options]
Options:
  --game <path>          Game install root. Defaults to the Steam BPSR path.
  --logs <path>          EventLogs root. Defaults to %APPDATA%\\com.resonance-logs-cn\\EventLogs.
  --latest <n>           Number of newest JSON logs to inspect. Default: 5.
  --window-ms <n>        Time window for pairing 0x39 with 0x16 detail rows. Default: 1500.
  --id <number>          Extra item id to search for in package anchors. Repeatable.
  --pair <number>        Extra pair id to search for in package anchors. Repeatable.
  --report <path>        Re-open an existing gear probe JSON report instead of reading logs.
  --json-out <path>      Write the full structured report to disk.
  --hit-limit <n>        Max anchors per searched term. Default: 8.
  --context-before <n>   ASCII/hex context size before each hit. Default: 160.
  --context-after <n>    ASCII/hex context size after each hit. Default: 360.
  --cooccurrence-before <n>  Bytes before each pair/item hit to scan for known stat ids. Default: 8192.
  --cooccurrence-after <n>   Bytes after each pair/item hit to scan for known stat ids. Default: 8192.
  --export-dir <path>    Base folder for relative report I/O. Default: DEV_exports.
  --max-hops <n>         Multi-hop walker depth. Default: 4.
  --branch-limit <n>     Max candidates kept per hop. Default: 5.
  --csv-out <path>       Optional CSV summary output path. Relative paths go under DEV_exports.
  --hop-export-dir <path> Folder for per-pair hop exports. Relative paths go under DEV_exports.
  --focus-target <id>    Extra target id for focused record-cluster dumps. Repeatable.
  --attribute-window-csv-out <path> CSV for per-item 0x16 deadbeef segment lanes.
  --attribute-bridge-csv-out <path> CSV joining gear items to EquipTable/pair bridge rows.
  --stat-name-csv-out <path> CSV for known stat name ids and table row candidates.
  --observed-attribute-csv-out <path> CSV joining screenshot-calibrated visible stat values to pair IDs.
  --export-hop-results   Write hop summary CSV + per-pair JSON exports.
  --export-attribute-windows Write the per-item 0x16 segment lane CSV.
  --export-attribute-bridge Write item/pair bridge and stat-name CSV exports.
  --name-term <text>     Extra localization/stat term to scan for. Repeatable.
  --no-game-scan         Only inspect event logs / report data.
  --full-package-scan    Slow: scan every m*.pkg for known item ids.
  --no-resolve           Skip the best-effort attribute resolver output.

Relative --json-out and --report paths are resolved under the export dir.
`);
}
function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  if (parent && parent !== "." && !fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
}
function normalizePathLike(filePath) {
  return String(filePath ?? "")
    .replace(/[\\/]+/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}
function isAlreadyUnderExportDir(filePath, exportDir = DEFAULT_EXPORT_DIR) {
  if (!filePath || typeof filePath !== "string" || path.isAbsolute(filePath)) return false;
  const normalizedFile = normalizePathLike(filePath);
  const normalizedExportDir = normalizePathLike(exportDir);
  return normalizedFile === normalizedExportDir || normalizedFile.startsWith(`${normalizedExportDir}/`);
}
function resolveExportPath(filePath, exportDir = DEFAULT_EXPORT_DIR) {
  if (!filePath || typeof filePath !== "string") return filePath;
  if (path.isAbsolute(filePath) || isAlreadyUnderExportDir(filePath, exportDir)) return filePath;
  return path.join(exportDir, filePath);
}
function resolveReportInputPath(filePath, exportDir = DEFAULT_EXPORT_DIR) {
  if (!filePath || typeof filePath !== "string") return filePath;
  if (path.isAbsolute(filePath) || fs.existsSync(filePath) || isAlreadyUnderExportDir(filePath, exportDir)) return filePath;
  const underExportDir = path.join(exportDir, filePath);
  return fs.existsSync(underExportDir) ? underExportDir : underExportDir;
}
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
function writeJsonFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function escapeCsvCell(value) {
  const raw = value == null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll("\"", "\"\"")}"` : raw;
}
function writeCsvFile(filePath, headers, rows) {
  ensureParentDir(filePath);
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}
function latestLogFiles(logRoot, limit) {
  if (!fs.existsSync(logRoot)) return [];
  const files = [];
  const datedDirs = fs
    .readdirSync(logRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(logRoot, entry.name));
  for (const dir of datedDirs) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      files.push({ fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}
function tryParseRaw(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function hexToBuffer(hex) {
  if (!hex || typeof hex !== "string") return Buffer.alloc(0);
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length < 2) return Buffer.alloc(0);
  return Buffer.from(clean.length % 2 === 0 ? clean : clean.slice(0, -1), "hex");
}
function readVarint(buffer, offset) {
  let value = 0n;
  let shift = 0n;
  let next = offset;
  for (let i = 0; i < 10 && next < buffer.length; i += 1) {
    const byte = buffer[next];
    next += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: Number(value), next };
    }
    shift += 7n;
  }
  return null;
}
function decodeProtoFields(buffer, depth = 0) {
  const fields = [];
  let offset = 0;
  while (offset < buffer.length) {
    const key = readVarint(buffer, offset);
    if (!key) break;
    offset = key.next;
    const fieldNo = Math.floor(key.value / 8);
    const wireType = key.value % 8;
    if (fieldNo <= 0) break;
    if (wireType === 0) {
      const value = readVarint(buffer, offset);
      if (!value) break;
      fields.push({ fieldNo, wireType, value: value.value });
      offset = value.next;
    } else if (wireType === 1) {
      if (offset + 8 > buffer.length) break;
      fields.push({ fieldNo, wireType, value: buffer.readBigUInt64LE(offset).toString() });
      offset += 8;
    } else if (wireType === 2) {
      const len = readVarint(buffer, offset);
      if (!len) break;
      offset = len.next;
      if (offset + len.value > buffer.length) break;
      const bytes = buffer.subarray(offset, offset + len.value);
      fields.push({
        fieldNo,
        wireType,
        bytes,
        children: depth < 5 ? decodeProtoFields(bytes, depth + 1) : [],
      });
      offset += len.value;
    } else if (wireType === 5) {
      if (offset + 4 > buffer.length) break;
      fields.push({ fieldNo, wireType, value: buffer.readUInt32LE(offset) });
      offset += 4;
    } else {
      break;
    }
  }
  return fields;
}
function valuesForField(fields, fieldNo) {
  return fields.filter((field) => field.fieldNo === fieldNo && "value" in field).map((field) => field.value);
}
function firstValue(fields, fieldNo) {
  return valuesForField(fields, fieldNo)[0] ?? null;
}
function nestedPairs(fields) {
  const pairs = [];
  for (const container of fields.filter((field) => (field.fieldNo === 10 || field.fieldNo === 11 || field.fieldNo === 14) && field.children)) {
    for (const field of container.children ?? []) {
      if (field.wireType !== 2 || !field.children?.length) continue;
      const id = firstValue(field.children, 1);
      const value = firstValue(field.children, 2);
      if (id !== null && value !== null) {
        pairs.push({ pathField: container.fieldNo, id, value });
      }
    }
  }
  return pairs;
}
function parseAcquisitionPayload(raw) {
  const buffer = hexToBuffer(raw.payloadHex);
  const root = decodeProtoFields(buffer);
  const msg = root.find((field) => field.fieldNo === 1 && field.children);
  if (!msg) return [];
  const entries = [];
  for (const field of msg.children ?? []) {
    if (field.fieldNo !== 2 || !field.children) continue;
    const children = field.children;
    const itemId = firstValue(children, 2);
    const count = firstValue(children, 3);
    if (!Number.isFinite(itemId) || !Number.isFinite(count)) continue;
    const detailField = children.find((child) => child.fieldNo === 10)?.children ?? [];
    entries.push({
      seq: firstValue(children, 1),
      itemId,
      count,
      timestamp: firstValue(children, 6),
      source: firstValue(children, 8),
      rarity: firstValue(children, 9),
      quality: firstValue(detailField, 15),
      uniqueId: firstValue(children, 16),
      pairs: nestedPairs(children),
    });
  }
  return entries;
}
function findBufferAll(buffer, needle) {
  const hits = [];
  let offset = buffer.indexOf(needle);
  while (offset >= 0) {
    hits.push(offset);
    offset = buffer.indexOf(needle, offset + 1);
  }
  return hits;
}
function readDeadBeefSegments(buffer) {
  const segments = [];
  let segmentStart = 0;
  let index = 0;
  for (const delimiterOffset of findBufferAll(buffer, DEAD_BEEF)) {
    const segment = buffer.subarray(segmentStart, delimiterOffset);
    const row = {
      index,
      startOffset: segmentStart,
      endOffset: delimiterOffset,
      length: segment.length,
      value: null,
      signed: null,
      low64: null,
      high64: null,
      hexTail: segment.toString("hex").slice(-96),
    };
    if (segment.length >= 4) {
      row.value = buffer.readUInt32LE(delimiterOffset - 4);
      row.signed = buffer.readInt32LE(delimiterOffset - 4);
    }
    if (segment.length >= 8) {
      row.low64 = buffer.readUInt32LE(delimiterOffset - 8);
      row.high64 = buffer.readUInt32LE(delimiterOffset - 4);
    }
    segments.push(row);
    index += 1;
    segmentStart = delimiterOffset + DEAD_BEEF.length;
  }
  return segments;
}
function readDeadBeefDelimitedValues(bufferOrSegments) {
  const segments = Buffer.isBuffer(bufferOrSegments)
    ? readDeadBeefSegments(bufferOrSegments)
    : (bufferOrSegments ?? []);
  const values = [];
  for (const segment of segments) {
    if (segment.length >= 4 && Number.isFinite(segment.value)) {
      const valueOffset = segment.endOffset - 4;
      const u32 = segment.value;
      const i32 = segment.signed;
      if (isInterestingValue(u32) || isInterestingValue(Math.abs(i32))) {
        values.push({ index: segment.index, offset: valueOffset, value: u32, signed: i32, width: 4 });
      }
    }
    if (segment.length >= 8 && Number.isFinite(segment.low64) && Number.isFinite(segment.high64)) {
      const valueOffset = segment.endOffset - 8;
      if (segment.high64 === 0 && isInterestingValue(segment.low64)) {
        values.push({
          index: segment.index,
          offset: valueOffset,
          value: segment.low64,
          signed: segment.low64,
          width: 8,
        });
      }
    }
  }
  return dedupeValues(values);
}
function dedupeValues(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = `${value.offset}:${value.value}:${value.width}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
function isInterestingValue(value) {
  if (!Number.isFinite(value)) return false;
  if (value >= 2_000_000 && value <= 2_200_000) return true;
  if (value >= 2_500 && value <= 3_600) return true;
  if (value >= 10 && value <= 120) return true;
  if (value >= 180 && value <= 2000) return true;
  if (value >= 12_000_000 && value <= 12_999_999) return true;
  return false;
}
function classifyEntrySegment(segment, entry, entryWindow) {
  const roles = [];
  const value = segment.value;
  const signed = segment.signed;
  if (!Number.isFinite(value)) return roles;
  if (value === entry.itemId) roles.push("item-id");
  if (entry.uniqueId && value === entry.uniqueId) roles.push("unique-id");
  if (entry.quality !== null && entry.quality !== undefined && value === entry.quality) roles.push("quality");
  if (entry.source !== null && entry.source !== undefined && value === entry.source) roles.push("source");
  if (entry.rarity !== null && entry.rarity !== undefined && value === entry.rarity) roles.push("rarity");
  if (entry.pairs?.some((pair) => pair.id === value)) roles.push("pair-id");
  if (entry.pairs?.some((pair) => pair.value === value)) roles.push("pair-value-or-flag");
  if (Number.isFinite(signed) && signed < 0) roles.push("control-negative");
  if (value <= 19) roles.push("field-or-small-control");

  const firstPairOffset = Math.min(
    ...entryWindow.pairOffsets.map((pair) => pair.offset).filter((offset) => Number.isFinite(offset)),
  );
  if (Number.isFinite(firstPairOffset) && segment.endOffset < firstPairOffset) roles.push("before-pair-list");
  if (entryWindow.endOffset > 0 && segment.startOffset > entryWindow.endOffset - 240) roles.push("tail-near-unique");

  const isIdentifier = roles.some((role) =>
    ["item-id", "unique-id", "quality", "source", "rarity", "pair-id"].includes(role),
  );
  if (!isIdentifier && value >= 180 && value <= 5000) roles.push("display-range-candidate");
  if (!isIdentifier && value >= 20 && value <= 2000) roles.push("numeric-attr-candidate");
  if (!isIdentifier && value === 15) roles.push("percent-tenths-candidate");
  return dedupeStrings(roles);
}
function buildEntrySegmentWindow(entry, entryWindow, deadBeefSegments) {
  if (entryWindow.itemOffset < 0 || entryWindow.endOffset <= entryWindow.itemOffset) return [];
  return (deadBeefSegments ?? [])
    .filter((segment) => segment.endOffset >= entryWindow.itemOffset - 40 && segment.startOffset <= entryWindow.endOffset + 80)
    .map((segment) => ({
      index: segment.index,
      startOffset: segment.startOffset,
      endOffset: segment.endOffset,
      relStart: segment.startOffset - entryWindow.itemOffset,
      relEnd: segment.endOffset - entryWindow.itemOffset,
      length: segment.length,
      value: segment.value,
      signed: segment.signed,
      low64: segment.low64,
      high64: segment.high64,
      roles: classifyEntrySegment(segment, entry, entryWindow),
      hexTail: segment.hexTail,
    }));
}
function summarizeDetailPayload(raw, acquisitionEntries) {
  const buffer = hexToBuffer(raw.payloadHex);
  const deadBeefSegments = readDeadBeefSegments(buffer);
  const needleValues = new Map();
  for (const entry of acquisitionEntries) {
    needleValues.set(entry.itemId, "item");
    if (entry.uniqueId) needleValues.set(entry.uniqueId, "unique");
    if (entry.quality) needleValues.set(entry.quality, "quality/perfection");
    for (const pair of entry.pairs) {
      needleValues.set(pair.id, "pair-id");
      if (pair.value !== 1) needleValues.set(pair.value, "pair-value");
    }
  }
  const hits = [];
  for (const [value, kind] of needleValues.entries()) {
    for (const offset of findValueOffsets(buffer, value)) hits.push({ value, kind, offset });
  }
  const streamValues = readDeadBeefDelimitedValues(deadBeefSegments)
    .filter((value) => {
      if (needleValues.has(value.value)) return false;
      return value.value !== 3735928559;
    })
    .slice(0, 120);
  const entryWindows = acquisitionEntries.map((entry) =>
    summarizeEntryWindow(buffer, entry, streamValues, deadBeefSegments),
  );
  return {
    payloadLength: raw.payloadLength ?? buffer.length,
    fingerprintHex: raw.fingerprintHex,
    hits: hits.sort((a, b) => a.offset - b.offset),
    streamValues,
    deadBeefSegmentCount: deadBeefSegments.length,
    entryWindows,
  };
}
function findValueOffsets(buffer, value) {
  const pattern = Buffer.alloc(4);
  pattern.writeUInt32LE(Number(value));
  const offsets = [];
  let offset = buffer.indexOf(pattern);
  while (offset >= 0) {
    offsets.push(offset);
    offset = buffer.indexOf(pattern, offset + 1);
  }
  return offsets;
}
function summarizeEntryWindow(buffer, entry, streamValues, deadBeefSegments = null) {
  const itemOffset = findValueOffsets(buffer, entry.itemId)[0] ?? -1;
  const uniqueOffset = entry.uniqueId
    ? findValueOffsets(buffer, entry.uniqueId).find((offset) => offset > itemOffset)
    : null;
  const rawPairOffsets = entry.pairs.flatMap((pair) =>
    findValueOffsets(buffer, pair.id).map((offset) => ({ id: pair.id, offset })),
  );
  const lastPairOffset = rawPairOffsets
    .filter((item) => itemOffset < 0 || item.offset > itemOffset)
    .reduce((max, item) => Math.max(max, item.offset), itemOffset);
  const endOffset =
    uniqueOffset ?? (lastPairOffset > itemOffset ? Math.min(buffer.length, lastPairOffset + 360) : -1);
  const pairOffsets = rawPairOffsets.filter((item) => {
    if (itemOffset >= 0 && item.offset <= itemOffset) return false;
    if (endOffset > itemOffset && item.offset > endOffset) return false;
    return true;
  });
  const focusValues =
    itemOffset >= 0 && endOffset > itemOffset
      ? streamValues.filter((value) => {
          if (value.offset < itemOffset || value.offset > endOffset) return false;
          if (value.value === entry.itemId || value.value === entry.uniqueId) return false;
          if (entry.pairs.some((pair) => pair.id === value.value)) return false;
          if (entry.quality === value.value) return false;
          return value.value === 15 || (value.value >= 20 && value.value <= 2000);
        })
      : [];
  const entryWindow = {
    itemId: entry.itemId,
    itemOffset,
    endOffset,
    pairOffsets,
    values: focusValues,
  };
  return {
    ...entryWindow,
    segments: buildEntrySegmentWindow(entry, entryWindow, deadBeefSegments ?? readDeadBeefSegments(buffer)),
  };
}
function extractProbeRows(logFiles) {
  const rows = [];
  for (const file of logFiles) {
    const json = readJsonFile(file.fullPath);
    const entries = Array.isArray(json.entries) ? json.entries : [];
    for (const entry of entries) {
      if (entry.category !== "capture_census" || entry.action !== "payload_probe") continue;
      const raw = tryParseRaw(entry.raw);
      if (!raw) continue;
      rows.push({
        file: file.fullPath,
        tsMs: Number(entry.tsMs),
        time: new Date(Number(entry.tsMs)).toLocaleTimeString(),
        nameHint: entry.nameHint,
        summary: entry.summary,
        raw,
      });
    }
  }
  return rows.sort((a, b) => a.tsMs - b.tsMs);
}
function buildGearClusters(rows, windowMs) {
  const clusters = [];
  for (const row of rows) {
    if (row.raw.serviceName !== "WorldNtf" || row.raw.methodIdHex !== "0x39") continue;
    const entries = parseAcquisitionPayload(row.raw);
    const gearEntries = entries.filter((entry) => entry.itemId >= 2_000_000 && entry.itemId <= 2_200_000);
    if (!gearEntries.length) continue;
    const nearbyDetails = rows
      .filter((candidate) => {
        if (candidate.raw.methodIdHex !== "0x16") return false;
        const delta = Math.abs(candidate.tsMs - row.tsMs);
        return delta <= windowMs && Number(candidate.raw.payloadLength ?? 0) >= 400;
      })
      .map((candidate) => ({
        row: candidate,
        detail: summarizeDetailPayload(candidate.raw, gearEntries),
      }));
    clusters.push({
      file: row.file,
      fileBase: path.basename(row.file),
      tsMs: row.tsMs,
      time: row.time,
      fingerprintHex: row.raw.fingerprintHex,
      entries,
      gearEntries,
      nearbyDetails,
    });
  }
  return clusters;
}
function formatEntry(entry) {
  const pairText = entry.pairs.length
    ? entry.pairs.map((pair) => `${pair.id}:${pair.value}`).join(", ")
    : "-";
  const quality = entry.quality === null || entry.quality === undefined ? "-" : entry.quality;
  const rarity = entry.rarity === null || entry.rarity === undefined ? "-" : entry.rarity;
  return `item=${entry.itemId} x${entry.count} seq=${entry.seq ?? "-"} rarity=${rarity} quality=${quality} source=${entry.source ?? "-"} unique=${entry.uniqueId ?? "-"} pairs=[${pairText}]`;
}
function printGearClusters(clusters) {
  console.log("\nGear acquisition clusters");
  console.log("=========================");
  if (!clusters.length) {
    console.log("No 0x39 gear acquisition clusters found in the selected logs.");
    return;
  }
  for (const cluster of clusters) {
    console.log(`\n${cluster.time}  ${path.basename(cluster.file)}  0x39=${cluster.fingerprintHex}`);
    for (const entry of cluster.gearEntries) {
      console.log(`  ${formatEntry(entry)}`);
    }
    if (!cluster.nearbyDetails.length) {
      console.log("  detail: no large 0x16 row found nearby");
      continue;
    }
    for (const detail of cluster.nearbyDetails) {
      console.log(
        `  detail 0x16 ${detail.detail.payloadLength}B ${detail.detail.fingerprintHex ?? ""}`,
      );
      const hits = detail.detail.hits
        .map((hit) => `${hit.kind}:${hit.value}@${hit.offset}`)
        .join(", ");
      console.log(`    target hits: ${hits || "-"}`);
      const valuePreview = detail.detail.streamValues
        .slice(0, 30)
        .map((value) => `${value.value}@${value.offset}`)
        .join(", ");
      console.log(`    other candidate values: ${valuePreview || "-"}`);
      for (const entryWindow of detail.detail.entryWindows) {
        const values = entryWindow.values
          .map((value) => `${value.value}@${value.offset}`)
          .join(", ");
        const pairs = entryWindow.pairOffsets
          .map((pair) => `${pair.id}@${pair.offset}`)
          .join(", ");
        console.log(
          `    item ${entryWindow.itemId} span ${entryWindow.itemOffset}-${entryWindow.endOffset}: pairs=[${pairs || "-"}] values=[${values || "-"}]`,
        );
      }
    }
  }
}
function readAsciiWindow(buffer, offset, before = 160, after = 360) {
  const start = Math.max(0, offset - before);
  const end = Math.min(buffer.length, offset + after);
  return buffer
    .subarray(start, end)
    .toString("latin1")
    .replace(/[^\x20-\x7e]+/g, ".")
    .replace(/\.+/g, ".")
    .slice(0, 900);
}
function readHexWindow(buffer, offset, before = 160, after = 360) {
  const start = Math.max(0, offset - before);
  const end = Math.min(buffer.length, offset + after);
  return buffer.subarray(start, end).toString("hex").replace(/(..)/g, "$1 ").trim().slice(0, 1200);
}
function findAll(buffer, needle, limit = 8) {
  const hits = [];
  let offset = buffer.indexOf(needle);
  while (offset >= 0 && hits.length < limit) {
    hits.push(offset);
    offset = buffer.indexOf(needle, offset + 1);
  }
  return hits;
}
function normalizeCatalogLabel(label) {
  return typeof label === "string" ? label.replace(/\s+/g, " ").trim() : "";
}
function isPrintableAsciiLabel(label) {
  return (
    typeof label === "string" &&
    !!label &&
    [...label].every((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code <= 0x7e;
    })
  );
}
function isStatLikeCatalogLabel(label) {
  const normalized = normalizeCatalogLabel(label);
  if (!normalized || normalized.length < 3 || normalized.length > 24) return false;
  if (!isPrintableAsciiLabel(normalized)) return false;
  if (normalized.split(" ").length > 4) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;
  if (/[<>{}\[\]=:\/\\'"`]/.test(normalized)) return false;
  const lowered = normalized.toLowerCase();
  const blockedFragments = [
    "increase",
    "damage",
    "during",
    "deals",
    "additional",
    "your",
    "immediately",
    "gains",
    "duration",
    "while",
    "healing",
    "enemy",
    "dealing",
    "trigger",
    "stack",
    "dream",
    "ultimate",
    "adventurer",
    "chainmail",
    "dessert",
    "island",
    "oracle",
    "guardian",
    "archer",
    "mage",
    "lancer",
    "helmet",
    "helm",
    "facehelm",
    "earring",
    "scarf",
    "coat",
  ];
  return !blockedFragments.some((fragment) => lowered.includes(fragment));
}
function readStructuredStringRecord(buffer, offset) {
  if (offset < 0 || offset + 6 > buffer.length) return null;
  const id = buffer.readUInt32LE(offset);
  const length = buffer.readUInt16LE(offset + 4);
  if (length < 3 || length > 64 || offset + 6 + length > buffer.length) return null;
  const bytes = buffer.subarray(offset + 6, offset + 6 + length);
  let text = null;
  try {
    text = bytes.toString("utf8");
  } catch {
    return null;
  }
  const label = normalizeCatalogLabel(text);
  if (!isPrintableAsciiLabel(label) || !/[A-Za-z]/.test(label)) return null;
  return { offset, id, length, label };
}
function extractStructuredStringRecords(buffer) {
  const records = [];
  for (let offset = 0; offset + 6 <= buffer.length; offset += 1) {
    const record = readStructuredStringRecord(buffer, offset);
    if (!record) continue;
    records.push(record);
  }
  return dedupeBy(records, (record) => `${record.offset}:${record.id}:${record.label}`);
}
function buildStatCatalog(localizationAnchors, exactTerms = []) {
  const wanted = new Set(exactTerms.map((term) => normalizeCatalogLabel(term).toLowerCase()).filter(Boolean));
  const catalog = new Map();
  for (const anchor of localizationAnchors ?? []) {
    for (const hit of anchor.hits ?? []) {
      if (!hit.hexWindow) continue;
      const buffer = Buffer.from(hit.hexWindow.replace(/\s+/g, ""), "hex");
      const records = extractStructuredStringRecords(buffer);
      const matchedIndexes = [];
      for (let index = 0; index < records.length; index += 1) {
        if (wanted.has(records[index].label.toLowerCase())) matchedIndexes.push(index);
      }
      if (!matchedIndexes.length) continue;
      for (const matchedIndex of matchedIndexes) {
        const start = Math.max(0, matchedIndex - 24);
        const end = Math.min(records.length, matchedIndex + 25);
        for (let index = start; index < end; index += 1) {
          const record = records[index];
          if (!isStatLikeCatalogLabel(record.label) && !wanted.has(record.label.toLowerCase())) continue;
          const entry = catalog.get(record.id) ?? {
            id: record.id,
            labels: new Set(),
            sourceTerms: new Set(),
            hitOffsets: [],
          };
          entry.labels.add(record.label);
          entry.sourceTerms.add(anchor.term);
          entry.hitOffsets.push(hit.offset ?? null);
          catalog.set(record.id, entry);
        }
      }
    }
  }
  return [...catalog.values()]
    .map((entry) => ({
      id: entry.id,
      labels: [...entry.labels].sort((a, b) => a.localeCompare(b)),
      sourceTerms: [...entry.sourceTerms].sort((a, b) => a.localeCompare(b)),
      hitCount: entry.hitOffsets.length,
    }))
    .sort((a, b) => a.id - b.id);
}
function buildLocalizationLabelLookup(localizationAnchors) {
  const lookup = new Map();
  for (const anchor of localizationAnchors ?? []) {
    for (const hit of anchor.hits ?? []) {
      if (!hit.hexWindow) continue;
      const buffer = Buffer.from(hit.hexWindow.replace(/\s+/g, ""), "hex");
      for (const record of extractStructuredStringRecords(buffer)) {
        const entry = lookup.get(record.id) ?? {
          id: record.id,
          labels: new Set(),
          sourceTerms: new Set(),
          offsets: [],
        };
        entry.labels.add(record.label);
        entry.sourceTerms.add(anchor.term);
        if (Number.isFinite(hit.offset)) entry.offsets.push(hit.offset);
        lookup.set(record.id, entry);
      }
    }
  }
  for (const [id, labels] of EXTRA_STAT_NAME_IDS.entries()) {
    const entry = lookup.get(id) ?? {
      id,
      labels: new Set(),
      sourceTerms: new Set(),
      offsets: [],
    };
    for (const label of labels) entry.labels.add(label);
    entry.sourceTerms.add("built-in");
    lookup.set(id, entry);
  }
  return [...lookup.values()]
    .map((entry) => ({
      id: entry.id,
      labels: [...entry.labels].sort((a, b) => a.localeCompare(b)),
      sourceTerms: [...entry.sourceTerms].sort((a, b) => a.localeCompare(b)),
      hitOffsets: [...new Set(entry.offsets)].sort((a, b) => a - b).slice(0, 12),
    }))
    .sort((a, b) => a.id - b.id);
}
function buildLabelMap(gameScan) {
  const map = new Map();
  for (const entry of gameScan?.labelLookup ?? []) {
    map.set(entry.id, entry.labels ?? []);
  }
  for (const entry of gameScan?.statCatalog ?? []) {
    const labels = new Set([...(map.get(entry.id) ?? []), ...(entry.labels ?? [])]);
    map.set(entry.id, [...labels].sort((a, b) => a.localeCompare(b)));
  }
  for (const [id, labels] of EXTRA_STAT_NAME_IDS.entries()) {
    const merged = new Set([...(map.get(id) ?? []), ...labels]);
    map.set(id, [...merged].sort((a, b) => a.localeCompare(b)));
  }
  return map;
}
function labelsForId(labelMap, id) {
  return Number.isFinite(id) ? normalizeStatLabels(labelMap.get(id) ?? []) : [];
}
function firstFriendlyLabel(labelMap, id) {
  return labelsForId(labelMap, id)[0] ?? null;
}
function findStructuredLabelsById(buffer, id, limit = 12) {
  if (!Number.isFinite(id)) return [];
  const labels = new Set();
  for (const offset of findValueOffsets(buffer, id)) {
    const record = readStructuredStringRecord(buffer, offset);
    if (!record || record.id !== id) continue;
    labels.add(record.label);
    if (labels.size >= limit) break;
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}
function readU32(buffer, offset) {
  return offset >= 0 && offset + 4 <= buffer.length ? buffer.readUInt32LE(offset) : null;
}
function readEquipTableRowAt(buffer, offset) {
  if (offset < 0 || offset + EQUIP_TABLE_ROW_SIZE > buffer.length) return null;
  const word = (rel) => buffer.readUInt32LE(offset + rel);
  const attrLibPacked = word(56);
  const attrLibIdC = attrLibPacked > 0 && attrLibPacked % 256 === 0 ? attrLibPacked / 256 : attrLibPacked;
  const rawWords = [];
  for (let rel = 0; rel < EQUIP_TABLE_ROW_SIZE; rel += 4) {
    rawWords.push({ rel, value: word(rel) });
  }
  return {
    offset,
    rowSize: EQUIP_TABLE_ROW_SIZE,
    id: word(0),
    model: word(4),
    suitId: word(8),
    suitPartId: word(12),
    equipPart: word(16),
    typeAttrLibId: word(20),
    styleEffectLibId: word(24),
    wearingLevel: word(32),
    rowKind: word(36),
    bonusGrowTimes: word(40),
    basicGrowRangeId: word(44),
    attrLibIdA: word(48),
    attrLibIdB: word(52),
    attrLibIdPacked: attrLibPacked,
    attrLibIdC,
    qualityGroup: word(60),
    mechanismType: word(64),
    extraFlag: word(72),
    extraLibId: word(76),
    valueBand: word(80),
    rawWords,
  };
}
function scoreEquipTableRow(row, itemId, buffer) {
  if (!row || row.id !== itemId) return -100;
  let score = 0;
  if (row.model === 311) score += 4;
  if (row.suitId >= 200 && row.suitId <= 220) score += 2;
  if (row.suitPartId === 2498) score += 4;
  if (row.equipPart >= 1 && row.equipPart <= 20) score += 2;
  if (row.wearingLevel >= 1 && row.wearingLevel <= 200) score += 8;
  if (row.basicGrowRangeId >= 1000 && row.basicGrowRangeId <= 1300) score += 8;
  if (row.attrLibIdA >= 2000 && row.attrLibIdA <= 5000) score += 4;
  if (row.attrLibIdB >= 2000 && row.attrLibIdB <= 5000) score += 4;
  if (row.attrLibIdC >= 2000 && row.attrLibIdC <= 5000) score += 4;
  const nextId = readU32(buffer, row.offset + EQUIP_TABLE_ROW_SIZE);
  if (nextId === itemId + 1 || (Number.isFinite(nextId) && nextId >= 2_000_000 && nextId <= 2_200_000)) {
    score += 4;
  }
  return score;
}
function scanEquipTableRows(m0Buffer, itemIds) {
  const rows = [];
  for (const itemId of itemIds ?? []) {
    const candidates = findValueOffsets(m0Buffer, itemId)
      .map((offset) => readEquipTableRowAt(m0Buffer, offset))
      .filter(Boolean)
      .map((row) => ({ ...row, score: scoreEquipTableRow(row, itemId, m0Buffer) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.offset - b.offset);
    rows.push({
      itemId,
      best: candidates[0] ?? null,
      candidates: candidates.slice(0, 8),
    });
  }
  return rows.sort((a, b) => a.itemId - b.itemId);
}
function scanItemIdentityRows(m0Buffer, itemIds, labelMap) {
  const rows = [];
  for (const itemId of itemIds ?? []) {
    const candidates = [];
    for (const offset of findValueOffsets(m0Buffer, itemId)) {
      if (offset < 660_000_000 || offset > 670_000_000) continue;
      const nameId = readU32(m0Buffer, offset + 4);
      if (!Number.isFinite(nameId) || nameId < 1_000_000 || nameId > 2_000_000_000) continue;
      const labels = labelsForId(labelMap, nameId);
      const resolvedLabels = labels.length ? labels : findStructuredLabelsById(m0Buffer, nameId);
      if (!resolvedLabels.length) continue;
      candidates.push({
        offset,
        itemId,
        nameId,
        labels: resolvedLabels,
      });
    }
    rows.push({
      itemId,
      best: candidates[0] ?? null,
      candidates: candidates.slice(0, 8),
    });
  }
  return rows.sort((a, b) => a.itemId - b.itemId);
}
function scanPairBridgeRows(m0Buffer, pairIds, labelMap, statCatalogMap) {
  const rows = [];
  for (const pairId of pairIds ?? []) {
    const linkRows = [];
    const smallCodeRows = [];
    for (const offset of findValueOffsets(m0Buffer, pairId)) {
      if (offset < PAIR_BRIDGE_REGION_START || offset > PAIR_BRIDGE_REGION_END) continue;
      const next = readU32(m0Buffer, offset + 4);
      const after = readU32(m0Buffer, offset + 8);
      if (Number.isFinite(next) && next >= 50_000_000 && next <= 2_000_000_000) {
        const normalizedTargetId = normalizeLinkedId(next);
        linkRows.push({
          offset,
          rawTargetId: next,
          normalizedTargetId,
          flag: after,
          linkKind: classifyLinkedId(normalizedTargetId, statCatalogMap),
          labels: normalizeStatLabels([
            ...labelsForId(labelMap, next),
            ...labelsForId(labelMap, normalizedTargetId),
          ]),
        });
      } else if (Number.isFinite(next) && next > 0 && next < 10_000) {
        smallCodeRows.push({
          offset,
          code: next,
          nextPairId: after,
        });
      }
    }
    rows.push({
      pairId,
      linkRows: dedupeBy(linkRows, (row) => `${row.rawTargetId}:${row.offset}`).slice(0, 12),
      smallCodeRows: dedupeBy(smallCodeRows, (row) => `${row.code}:${row.offset}`).slice(0, 24),
      smallCodes: [...new Set(smallCodeRows.map((row) => row.code))].sort((a, b) => a - b),
    });
  }
  return rows.sort((a, b) => a.pairId - b.pairId);
}
function scanKnownStatNameRows(m0Buffer, gameScan) {
  const labelMap = buildLabelMap(gameScan);
  const ids = new Set();
  for (const entry of gameScan?.statCatalog ?? []) {
    if ((entry.labels ?? []).some((label) => isProbablyStatLabel(label))) ids.add(entry.id);
  }
  for (const id of EXTRA_STAT_NAME_IDS.keys()) ids.add(id);
  const rows = [];
  for (const nameId of [...ids].sort((a, b) => a - b)) {
    const labels = labelsForId(labelMap, nameId);
    const fightAttrRows = [];
    const compactCodeRows = [];
    for (const offset of findValueOffsets(m0Buffer, nameId)) {
      const rowOffset = offset - 16;
      if (rowOffset >= 0) {
        const fields = [0, 4, 8, 12, 16].map((rel) => readU32(m0Buffer, rowOffset + rel));
        if (
          fields[4] === nameId &&
          fields[0] > 0 &&
          fields[0] < 1000 &&
          fields[2] > 0 &&
          fields[2] < 5000 &&
          fields[3] > 0 &&
          fields[3] < 50_000
        ) {
          fightAttrRows.push({
            offset: rowOffset,
            groupCode: fields[0],
            enumNameId: fields[1],
            fightAttrId: fields[2],
            enumValue: fields[3],
            nameId: fields[4],
          });
        }
      }
      const compactCode = readU32(m0Buffer, offset + 4);
      if (Number.isFinite(compactCode) && compactCode > 0 && compactCode < 5000) {
        compactCodeRows.push({ offset, code: compactCode });
      }
    }
    rows.push({
      nameId,
      labels,
      fightAttrRows: dedupeBy(fightAttrRows, (row) => `${row.offset}:${row.fightAttrId}:${row.enumValue}`).slice(0, 12),
      compactCodeRows: dedupeBy(compactCodeRows, (row) => `${row.offset}:${row.code}`).slice(0, 12),
    });
  }
  return rows;
}
function buildCompactCodeLabelLookup(gameScan) {
  const lookup = new Map();
  for (const entry of gameScan?.knownStatNameRows ?? []) {
    const canonicalLabels = [...new Set((entry.labels ?? [])
      .map((label) => canonicalizeAttributeLabel(label))
      .filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (!canonicalLabels.length) continue;
    for (const row of entry.compactCodeRows ?? []) {
      if (!Number.isFinite(row.code)) continue;
      const labels = lookup.get(row.code) ?? new Set();
      for (const label of canonicalLabels) labels.add(label);
      lookup.set(row.code, labels);
    }
  }
  return new Map([...lookup.entries()].map(([code, labels]) => [code, [...labels].sort((a, b) => a.localeCompare(b))]));
}
function collectAttrLibIdsFromGameScan(gameScan) {
  const ids = new Set();
  for (const row of gameScan?.equipTableRows ?? []) {
    for (const value of [row.best?.attrLibIdA, row.best?.attrLibIdB, row.best?.attrLibIdC]) {
      if (Number.isFinite(value) && value > 0) ids.add(value);
    }
  }
  return [...ids].sort((a, b) => a - b);
}
function buildAttrLibRowCandidate(buffer, attrLibId, hitOffset, rowOffset, labelMap, compactCodeLookup, tableAnchors) {
  if (!Number.isFinite(hitOffset) || !Number.isFinite(rowOffset) || rowOffset < 0 || rowOffset + 64 > buffer.length) return null;
  const words = [];
  const compactHits = [];
  const statHits = [];
  let attrRangeCount = 0;
  for (let index = 0; index < 12; index += 1) {
    const absOffset = rowOffset + index * 4;
    const value = readU32(buffer, absOffset);
    if (!Number.isFinite(value)) continue;
    const rel = absOffset - hitOffset;
    words.push({ index, offset: absOffset, rel, value });
    if (value >= 2000 && value <= 5000) attrRangeCount += 1;
    const compactLabels = compactCodeLookup.get(value) ?? [];
    if (compactLabels.length) compactHits.push({ code: value, labels: compactLabels, rel });
    const statLabels = value !== attrLibId ? labelsForId(labelMap, value) : [];
    if (statLabels.length) statHits.push({ id: value, labels: statLabels, rel });
  }
  const nearestTables = nearestTableTerms(tableAnchors, hitOffset, 4).map((entry) => entry.term ?? String(entry));
  const compactCodes = [...new Set(compactHits.map((hit) => hit.code))].sort((a, b) => a - b);
  const compactLabels = dedupeStrings(compactHits.flatMap((hit) => hit.labels ?? []).map(canonicalizeAttributeLabel).filter(Boolean));
  const statIds = [...new Set(statHits.map((hit) => hit.id))].sort((a, b) => a - b);
  const statLabels = dedupeStrings(statHits.flatMap((hit) => hit.labels ?? []).map(canonicalizeAttributeLabel).filter(Boolean));
  const strongCount = nearestTables.filter((term) => STRONG_TABLE_ANCHORS.has(term)).length;
  const secondaryCount = nearestTables.filter((term) => SECONDARY_TABLE_ANCHORS.has(term)).length;
  const noiseCount = nearestTables.filter((term) => NOISE_TABLE_ANCHORS.has(term)).length;
  let score = 0;
  if (hitOffset >= rowOffset && hitOffset - rowOffset <= 32) score += 8;
  if (words[0]?.value === attrLibId || words[1]?.value === attrLibId || words[2]?.value === attrLibId) score += 4;
  score += strongCount * 8;
  score += secondaryCount * 4;
  if (!strongCount && noiseCount) score -= 6;
  score += Math.min(8, attrRangeCount);
  score += compactCodes.length * 10;
  score += statIds.length * 6;
  if (compactLabels.length && strongCount) score += 6;
  const wordPreview = words
    .slice(0, 8)
    .map((word) => `${word.rel >= 0 ? '+' : ''}${word.rel}:${word.value}`)
    .join(' | ');
  return {
    attrLibId,
    hitOffset,
    rowOffset,
    relOffset: hitOffset - rowOffset,
    score,
    nearestTables,
    compactCodes,
    compactLabels,
    statIds,
    statLabels,
    attrRangeCount,
    wordPreview,
  };
}
function scanAttrLibRows(m0Buffer, gameScan) {
  const attrLibIds = collectAttrLibIdsFromGameScan(gameScan);
  const labelMap = buildLabelMap(gameScan);
  const compactCodeLookup = buildCompactCodeLabelLookup(gameScan);
  const rows = [];
  for (const attrLibId of attrLibIds) {
    const candidates = [];
    for (const hitOffset of findValueOffsets(m0Buffer, attrLibId)) {
      for (const back of [0, 4, 8, 12, 16, 20, 24, 28, 32]) {
        const rowOffset = hitOffset - back;
        const candidate = buildAttrLibRowCandidate(m0Buffer, attrLibId, hitOffset, rowOffset, labelMap, compactCodeLookup, gameScan?.tableAnchors ?? []);
        if (candidate) candidates.push(candidate);
      }
    }
    const deduped = dedupeBy(candidates, (candidate) => `${candidate.rowOffset}:${candidate.wordPreview}`)
      .sort((a, b) => b.score - a.score || a.rowOffset - b.rowOffset);
    rows.push({
      attrLibId,
      best: deduped[0] ?? null,
      candidates: deduped.slice(0, 12),
      hitCount: candidates.length,
    });
  }
  return rows.sort((a, b) => a.attrLibId - b.attrLibId);
}
function printAttrLibSummary(gameScan) {
  const rows = gameScan?.attrLibRows ?? [];
  if (!rows.length) return;
  console.log("\nAttr-lib candidate rows");
  console.log("=======================");
  for (const row of rows) {
    const best = row.best;
    const labels = best?.compactLabels?.length
      ? best.compactLabels.join(' / ')
      : best?.statLabels?.length
        ? best.statLabels.join(' / ')
        : '-';
    const tables = best?.nearestTables?.length ? best.nearestTables.join(', ') : '-';
    console.log(`  ${row.attrLibId}: @${best?.rowOffset ?? '-'} score=${best?.score ?? '-'} tables=${tables}`);
    console.log(`    labels: ${labels}`);
  }
}

function directValueCalTargetValues() {
  return [...new Set(DIRECT_VALUECAL_TARGET_GROUPS.flatMap((group) => group.values))].sort((a, b) => a - b);
}
function collectDirectBasicGrowRangeIds(gameScan) {
  const ids = new Set(DIRECT_BASIC_GROW_RANGE_IDS);
  for (const row of gameScan?.equipTableRows ?? []) {
    const value = row.best?.basicGrowRangeId;
    if (Number.isFinite(value) && value > 0) ids.add(value);
  }
  return [...ids].sort((a, b) => a - b);
}
function readU32WordsAt(buffer, offset, count = 16) {
  const words = [];
  if (!Number.isFinite(offset)) return words;
  for (let index = 0; index < count; index += 1) {
    const absOffset = offset + index * 4;
    if (absOffset < 0 || absOffset + 4 > buffer.length) break;
    words.push({ index, rel: index * 4, offset: absOffset, value: buffer.readUInt32LE(absOffset) });
  }
  return words;
}
function formatWordPreviewAt(buffer, offset, count = 12) {
  return readU32WordsAt(buffer, offset, count)
    .map((word) => `${word.rel >= 0 ? '+' : ''}${word.rel}:${word.value}`)
    .join(' | ');
}
function collectNearbyTargetHits(buffer, offset, targetValues, bytesBefore = 64, bytesAfter = 128) {
  const targets = new Set(targetValues ?? []);
  if (!targets.size || !Number.isFinite(offset)) return [];
  const start = Math.max(0, offset - bytesBefore);
  const end = Math.min(buffer.length - 4, offset + bytesAfter);
  const hits = [];
  for (let pos = start; pos <= end; pos += 1) {
    const value = buffer.readUInt32LE(pos);
    if (!targets.has(value)) continue;
    hits.push({ value, offset: pos, rel: pos - offset });
  }
  return dedupeBy(hits, (hit) => `${hit.value}:${hit.rel}`)
    .sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel) || a.value - b.value);
}
function collectAlignedFloatPreview(buffer, offset, bytesBefore = 16, bytesAfter = 96) {
  if (!Number.isFinite(offset)) return [];
  const floats = [];
  for (let rel = -bytesBefore; rel <= bytesAfter; rel += 4) {
    const pos = offset + rel;
    if (pos < 0 || pos + 4 > buffer.length) continue;
    const value = buffer.readFloatLE(pos);
    if (!Number.isFinite(value) || value <= 0.25 || value >= 10_000) continue;
    if (value < 1 || value > 1_000) continue;
    const rounded = Math.round(value);
    const hasUsefulFraction = Math.abs(value - rounded) > 0.001;
    if (!hasUsefulFraction && value > 10) continue;
    floats.push({
      rel,
      value: Number(value.toFixed(value < 10 ? 4 : 2)),
      valueTimes107: Number((value * 1.07).toFixed(value < 10 ? 4 : 2)),
    });
  }
  return dedupeBy(floats, (item) => `${item.rel}:${item.value}`).slice(0, 8);
}
function isLikelySmallAttrCode(value) {
  return Number.isFinite(value) && value > 0 && value <= 20_000;
}
function collectAttrLibPairRun(buffer, attrLibId, hitOffset) {
  if (readU32(buffer, hitOffset) !== attrLibId) return null;
  const next = readU32(buffer, hitOffset + 4);
  if (!isLikelySmallAttrCode(next)) return null;
  let startOffset = hitOffset;
  while (
    startOffset - 8 >= 0 &&
    readU32(buffer, startOffset - 8) === attrLibId &&
    isLikelySmallAttrCode(readU32(buffer, startOffset - 4))
  ) {
    startOffset -= 8;
  }
  const codes = [];
  let pos = startOffset;
  while (pos + 8 <= buffer.length && readU32(buffer, pos) === attrLibId) {
    const code = readU32(buffer, pos + 4);
    if (!isLikelySmallAttrCode(code)) break;
    codes.push(code);
    pos += 8;
  }
  return {
    startOffset,
    endOffset: pos,
    codes: [...new Set(codes)].sort((a, b) => a - b),
  };
}
function targetGroupMatches(values) {
  const valueSet = new Set((values ?? []).filter((value) => Number.isFinite(value)));
  return DIRECT_VALUECAL_TARGET_GROUPS
    .filter((group) => group.values.every((value) => valueSet.has(value)))
    .map((group) => group.key);
}
function inferDirectValueCalTargetsForAttrLibRow(attrLibRow, compactCodeLookup) {
  const candidate = attrLibRow?.best ?? null;
  if (!candidate) return [];
  const targetSet = new Set(directValueCalTargetValues());
  const previewEntries = parseAttrLibWordPreviewEntries(candidate.wordPreview);
  const rawCompactCodes = new Set([
    ...(candidate.compactCodes ?? []).filter((value) => Number.isFinite(value)),
    ...previewEntries.map((entry) => entry.value).filter((value) => compactCodeLookup.has(value)),
  ]);
  const siblingAttrLibRefs = new Set(previewEntries
    .map((entry) => entry.value)
    .filter((value) => Number.isFinite(value) && value >= attrLibRow.attrLibId - 8 && value <= attrLibRow.attrLibId + 8 && value !== attrLibRow.attrLibId));
  return [...new Set(previewEntries
    .map((entry) => entry.value)
    .filter((value) => targetSet.has(value))
    .filter((value) => !rawCompactCodes.has(value))
    .filter((value) => value !== attrLibRow.attrLibId && !siblingAttrLibRefs.has(value)))]
    .sort((a, b) => a - b);
}
function compactLabelsForCodes(compactCodeLookup, codes) {
  return dedupeStrings((codes ?? [])
    .flatMap((code) => compactCodeLookup.get(code) ?? [])
    .map((label) => canonicalizeAttributeLabel(label))
    .filter(Boolean));
}
function chooseDirectValueCalRowOffset(hitOffset, pairRun, targetHits) {
  if (pairRun?.codes?.length) return pairRun.startOffset;
  const adjacentBefore = [...(targetHits ?? [])]
    .filter((hit) => hit.rel < 0 && hit.rel >= -16)
    .sort((a, b) => b.rel - a.rel)[0];
  return Number.isFinite(adjacentBefore?.rel) ? hitOffset + adjacentBefore.rel : hitOffset;
}
function scanDirectAttrLibValueCalRows(m0Buffer, gameScan) {
  const attrLibIds = collectAttrLibIdsFromGameScan(gameScan);
  const growRangeIds = collectDirectBasicGrowRangeIds(gameScan);
  const compactCodeLookup = buildCompactCodeLabelLookup(gameScan);
  const attrLibRowById = new Map((gameScan?.attrLibRows ?? []).map((row) => [row.attrLibId, row]));
  const rowsByAttrLib = new Map();
  for (const attrLibId of attrLibIds) {
    const attrLibRow = attrLibRowById.get(attrLibId) ?? null;
    const targetValues = inferDirectValueCalTargetsForAttrLibRow(attrLibRow, compactCodeLookup);
    const targetSet = new Set(targetValues);
    if (!targetValues.length) {
      rowsByAttrLib.set(attrLibId, []);
      continue;
    }
    const anchorOffsets = [
      attrLibRow?.best?.hitOffset,
      attrLibRow?.best?.rowOffset,
    ].filter((value) => Number.isFinite(value));
    const rows = [];
    for (const hitOffset of findValueOffsets(m0Buffer, attrLibId)) {
      const pairRun = collectAttrLibPairRun(m0Buffer, attrLibId, hitOffset);
      const pairCodes = (pairRun?.codes?.length ?? 0) >= 2 ? pairRun.codes : [];
      const directTargetCodes = pairCodes.filter((code) => targetSet.has(code));
      const targetHits = collectNearbyTargetHits(m0Buffer, hitOffset, targetValues, 64, 128);
      const targetHitValues = [...new Set(targetHits.map((hit) => hit.value))].sort((a, b) => a - b);
      const growHits = collectNearbyTargetHits(m0Buffer, hitOffset, growRangeIds, 64, 128);
      const growHitValues = [...new Set(growHits.map((hit) => hit.value))].sort((a, b) => a - b);
      const floats = collectAlignedFloatPreview(m0Buffer, hitOffset);
      const groupMatches = targetGroupMatches([...targetHitValues, ...directTargetCodes]);
      const closeTargetCount = targetHits.filter((hit) => Math.abs(hit.rel) <= 24).length;
      if (
        !directTargetCodes.length &&
        !groupMatches.length &&
        !(targetHitValues.length && floats.length) &&
        !(targetHitValues.length >= 3 && growHitValues.length)
      ) {
        continue;
      }
      let mode = 'target-neighborhood';
      if (directTargetCodes.length) {
        mode = 'attr-array-pair';
      } else if (targetHitValues.length && floats.length) {
        mode = 'number-table-neighborhood';
      } else if (targetHitValues.length >= 3 && growHitValues.length) {
        mode = 'grow-joined-neighborhood';
      }
      let score = 0;
      score += directTargetCodes.length * 18;
      score += groupMatches.length * 14;
      score += closeTargetCount * 5;
      score += targetHitValues.length * 2;
      score += growHitValues.length * 6;
      score += floats.length ? 10 : 0;
      if (pairCodes.length) score += Math.min(8, pairCodes.length);
      if (mode === 'number-table-neighborhood') score += 8;
      if (mode === 'grow-joined-neighborhood') score += 6;
      const rowOffset = chooseDirectValueCalRowOffset(hitOffset, pairRun, targetHits);
      if (anchorOffsets.some((anchor) => Math.abs(hitOffset - anchor) <= 64 || Math.abs(rowOffset - anchor) <= 64)) {
        score += 50;
      }
      rows.push({
        attrLibId,
        mode,
        score,
        rowOffset,
        hitOffset,
        targetGroups: groupMatches,
        targetValues: targetHitValues,
        directAttrCodes: pairCodes,
        directTargetCodes,
        directAttrLabels: compactLabelsForCodes(compactCodeLookup, pairCodes),
        basicGrowRangeIds: growHitValues,
        floatValues: floats.map((item) => `${item.rel}:${item.value}`),
        floatTimes107: floats.map((item) => `${item.rel}:${item.valueTimes107}`),
        wordPreview: formatWordPreviewAt(m0Buffer, rowOffset, 14),
      });
    }
    const deduped = dedupeBy(rows, (row) => `${row.mode}:${row.rowOffset}:${row.targetValues.join('|')}:${row.directAttrCodes.join('|')}`)
      .sort((a, b) => b.score - a.score || a.rowOffset - b.rowOffset)
      .slice(0, 20);
    rowsByAttrLib.set(attrLibId, deduped);
  }
  return [...rowsByAttrLib.entries()]
    .map(([attrLibId, rows]) => ({ attrLibId, rows }))
    .filter((entry) => entry.rows.length)
    .sort((a, b) => a.attrLibId - b.attrLibId);
}
function scoreBasicGrowCandidateWords(words, growRangeId) {
  if (!words.length || words[0]?.value !== growRangeId) return -100;
  const values = words.map((word) => word.value);
  let score = 0;
  if (values[1] >= 2_000 && values[1] <= 5_000) score += 10;
  if (values[2] >= 2_000 && values[2] <= 5_000) score += 8;
  if (values.slice(1, 20).some((value) => value >= 10_000 && value <= 10_000_000)) score += 8;
  if (values.slice(1, 20).filter((value) => value === 0).length >= 2) score += 3;
  if (values.slice(0, 12).every((value, index, list) => index === 0 || value >= list[index - 1] - 2)) score -= 12;
  if (values.slice(1, 8).some((value) => value === growRangeId || value === growRangeId - 1 || value === growRangeId + 1)) score -= 5;
  return score;
}
function scanBasicGrowJoinRows(m0Buffer, gameScan) {
  const growRangeIds = collectDirectBasicGrowRangeIds(gameScan);
  const focusAttrLibIds = new Set(collectAttrLibIdsFromGameScan(gameScan));
  const focusItemIds = new Set((gameScan?.equipTableRows ?? []).map((row) => row.itemId).filter((value) => Number.isFinite(value)));
  const identityByItem = new Map((gameScan?.itemIdentityRows ?? []).map((row) => [row.itemId, row.best]));
  const rows = [];
  for (const growRangeId of growRangeIds) {
    const candidates = [];
    for (const hitOffset of findValueOffsets(m0Buffer, growRangeId)) {
      const equipOffset = hitOffset - 44;
      const equip = readEquipTableRowAt(m0Buffer, equipOffset);
      if (equip?.basicGrowRangeId === growRangeId && scoreEquipTableRow(equip, equip.id, m0Buffer) > 10) {
        const attrLibIds = [equip.attrLibIdA, equip.attrLibIdB, equip.attrLibIdC]
          .filter((value) => Number.isFinite(value) && value > 0);
        const overlap = attrLibIds.filter((value) => focusAttrLibIds.has(value));
        if (!overlap.length && !focusItemIds.has(equip.id)) continue;
        candidates.push({
          basicGrowRangeId: growRangeId,
          sourceKind: 'equip-table-grow-field',
          score: 40 + overlap.length * 8 + (focusItemIds.has(equip.id) ? 8 : 0),
          rowOffset: equip.offset,
          hitOffset,
          itemId: equip.id,
          itemName: identityByItem.get(equip.id)?.labels?.[0] ?? '',
          wearingLevel: equip.wearingLevel,
          attrLibIds,
          attrLibOverlap: overlap,
          wordPreview: formatWordPreviewAt(m0Buffer, equip.offset, 22),
        });
        continue;
      }
      const words = readU32WordsAt(m0Buffer, hitOffset, 24);
      const score = scoreBasicGrowCandidateWords(words, growRangeId);
      if (score < 18) continue;
      candidates.push({
        basicGrowRangeId: growRangeId,
        sourceKind: 'basic-grow-row-candidate',
        score,
        rowOffset: hitOffset,
        hitOffset,
        itemId: '',
        itemName: '',
        wearingLevel: '',
        attrLibIds: [],
        attrLibOverlap: [],
        wordPreview: formatWordPreviewAt(m0Buffer, hitOffset, 22),
      });
    }
    rows.push(...dedupeBy(candidates, (row) => `${row.sourceKind}:${row.rowOffset}:${row.wordPreview}`)
      .sort((a, b) => b.score - a.score || a.rowOffset - b.rowOffset)
      .slice(0, 28));
  }
  return rows.sort((a, b) => a.basicGrowRangeId - b.basicGrowRangeId || b.score - a.score || a.rowOffset - b.rowOffset);
}
function basicAttrGrowRoleForSlot(growSlot) {
  if (growSlot === 0) return 'legendary-affix';
  if (growSlot === 1) return 'advanced-attribute-bundle';
  if (growSlot === 2) return 'locked-or-special';
  return 'unknown';
}
function readBasicAttrGrowRecordAt(buffer, offset) {
  if (!Number.isFinite(offset) || offset < 0 || offset + BASIC_ATTR_GROW_RECORD_SIZE > buffer.length) return null;
  const words = readU32WordsAt(buffer, offset, BASIC_ATTR_GROW_RECORD_WORDS).map((word) => word.value);
  if (words.length !== BASIC_ATTR_GROW_RECORD_WORDS) return null;
  const [
    basicGrowRangeId,
    growSlot,
    attrGrowValueA,
    attrGrowValueB,
    attrGrowValueC,
    attrGrowValueD,
    basicAttrGrowId,
  ] = words;
  return {
    recordOffset: offset,
    basicGrowRangeId,
    growSlot,
    role: basicAttrGrowRoleForSlot(growSlot),
    attrGrowValueA,
    attrGrowValueB,
    attrGrowValueC,
    attrGrowValueD,
    basicAttrGrowId,
    valueBandA: `${attrGrowValueA}-${attrGrowValueD}`,
    valueBandB: `${attrGrowValueB}-${attrGrowValueC}`,
    wordPreview: formatWordPreviewAt(buffer, offset, BASIC_ATTR_GROW_RECORD_WORDS),
  };
}
function isLikelyBasicAttrGrowRecord(record, growRangeIds) {
  if (!record) return false;
  if (!growRangeIds.has(record.basicGrowRangeId)) return false;
  if (!Number.isFinite(record.growSlot) || record.growSlot < 0 || record.growSlot > 8) return false;
  if (!Number.isFinite(record.basicAttrGrowId) || record.basicAttrGrowId <= 0 || record.basicAttrGrowId > 20_000) return false;
  const valueWords = [
    record.attrGrowValueA,
    record.attrGrowValueB,
    record.attrGrowValueC,
    record.attrGrowValueD,
  ];
  return valueWords.every((value) => Number.isFinite(value) && value >= 0 && value <= 20_000);
}
function collectBasicAttrGrowRun(buffer, centerOffset, growRangeIds) {
  const records = [];
  for (let delta = -12; delta <= 12; delta += 1) {
    const offset = centerOffset + delta * BASIC_ATTR_GROW_RECORD_SIZE;
    const record = readBasicAttrGrowRecordAt(buffer, offset);
    if (!isLikelyBasicAttrGrowRecord(record, growRangeIds)) continue;
    records.push(record);
  }
  const sorted = dedupeBy(records, (record) => record.recordOffset).sort((a, b) => a.recordOffset - b.recordOffset);
  const rangeSlotKeys = new Set(sorted.map((record) => `${record.basicGrowRangeId}:${record.growSlot}`));
  const hasCompleteDirectRangeRun = DIRECT_BASIC_GROW_RANGE_IDS.every((basicGrowRangeId) =>
    [0, 1, 2].every((growSlot) => rangeSlotKeys.has(`${basicGrowRangeId}:${growSlot}`)),
  );
  return {
    records: sorted,
    runOffset: sorted[0]?.recordOffset ?? centerOffset,
    runEndOffset: sorted.length ? sorted[sorted.length - 1].recordOffset + BASIC_ATTR_GROW_RECORD_SIZE : centerOffset,
    rangeSlotKeys,
    hasCompleteDirectRangeRun,
  };
}
function scanBasicAttrGrowRows(m0Buffer, gameScan) {
  const growRangeIds = new Set(collectDirectBasicGrowRangeIds(gameScan));
  const rows = [];
  for (const basicGrowRangeId of growRangeIds) {
    for (const hitOffset of findValueOffsets(m0Buffer, basicGrowRangeId)) {
      const record = readBasicAttrGrowRecordAt(m0Buffer, hitOffset);
      if (!isLikelyBasicAttrGrowRecord(record, growRangeIds)) continue;
      const run = collectBasicAttrGrowRun(m0Buffer, hitOffset, growRangeIds);
      if (!run.hasCompleteDirectRangeRun) continue;
      const sameRangeRecords = run.records.filter((entry) => entry.basicGrowRangeId === record.basicGrowRangeId);
      const sameRangeSlots = new Set(sameRangeRecords.map((entry) => entry.growSlot));
      let score = 70;
      score += sameRangeSlots.size * 8;
      score += run.records.length;
      if (DIRECT_BASIC_GROW_RANGE_IDS.includes(record.basicGrowRangeId)) score += 12;
      if ([0, 1, 2].includes(record.growSlot)) score += 8;
      rows.push({
        ...record,
        score,
        runOffset: run.runOffset,
        runEndOffset: run.runEndOffset,
        runRecordCount: run.records.length,
        runRangeSlots: [...run.rangeSlotKeys].sort((a, b) => a.localeCompare(b)),
      });
    }
  }
  return dedupeBy(rows, (row) => row.recordOffset)
    .sort((a, b) =>
      a.basicGrowRangeId - b.basicGrowRangeId ||
      a.growSlot - b.growSlot ||
      b.score - a.score ||
      a.recordOffset - b.recordOffset,
    );
}
function basicAttrValueProofKey(itemId, pairSlot, label, observedValue) {
  const value = Number.isFinite(observedValue) ? observedValue : Number(observedValue);
  return [
    itemId,
    pairSlot,
    canonicalizeAttributeLabel(label),
    Number.isFinite(value) ? String(value) : '',
  ].join('|');
}
function isLikelyBasicAttrValueWord(value) {
  return Number.isFinite(value) && value > 0 && value <= 5_000;
}
function collectContiguousSmallValueRun(buffer, hitOffset, maxWordsBefore = 48, maxWordsAfter = 80) {
  let startOffset = hitOffset;
  for (let step = 1; step <= maxWordsBefore; step += 1) {
    const pos = hitOffset - step * 4;
    if (pos < 0) break;
    const value = readU32(buffer, pos);
    if (!isLikelyBasicAttrValueWord(value)) break;
    startOffset = pos;
  }
  let endOffset = hitOffset + 4;
  for (let step = 1; step <= maxWordsAfter; step += 1) {
    const pos = hitOffset + step * 4;
    if (pos + 4 > buffer.length) break;
    const value = readU32(buffer, pos);
    if (!isLikelyBasicAttrValueWord(value)) break;
    endOffset = pos + 4;
  }
  const values = [];
  for (let pos = startOffset; pos < endOffset; pos += 4) {
    values.push(readU32(buffer, pos));
  }
  let monotonicPairs = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] >= values[index - 1]) monotonicPairs += 1;
  }
  return {
    startOffset,
    endOffset,
    values,
    wordCount: values.length,
    monotonicPairs,
    minValue: values.length ? Math.min(...values) : '',
    maxValue: values.length ? Math.max(...values) : '',
  };
}
function formatBasicAttrValuePreview(values, limit = 56) {
  return (values ?? []).slice(0, limit).join('|');
}
function collectBasicAttrValueTargets(gameScan) {
  const equipByItem = new Map((gameScan?.equipTableRows ?? []).map((row) => [row.itemId, row.best]));
  const growByRangeSlot = new Map((gameScan?.basicAttrGrowRows ?? []).map((row) => [`${row.basicGrowRangeId}|${row.growSlot}`, row]));
  const targets = [];
  for (const observation of KNOWN_VISIBLE_GEAR_OBSERVATIONS) {
    const equip = equipByItem.get(observation.itemId) ?? null;
    if (!equip) continue;
    for (const line of observation.lines ?? []) {
      if (line.locked || !Number.isFinite(line.value)) continue;
      if (line.valueKind && line.valueKind !== 'flat') continue;
      if (!Number.isInteger(line.value) || line.value < 10) continue;
      const growSlot = line.slot === 0 ? 0 : line.slot <= 2 ? 1 : 2;
      const basicAttrGrow = growByRangeSlot.get(`${equip.basicGrowRangeId}|${growSlot}`) ?? null;
      if (!basicAttrGrow) continue;
      targets.push({
        itemId: observation.itemId,
        pairSlot: line.slot,
        observedLabel: canonicalizeAttributeLabel(line.label),
        observedValue: line.value,
        valueKind: line.valueKind,
        basicGrowRangeId: equip.basicGrowRangeId,
        wearingLevel: equip.wearingLevel,
        basicAttrGrowSlot: growSlot,
        basicAttrGrowId: basicAttrGrow.basicAttrGrowId,
      });
    }
  }
  return dedupeBy(targets, (target) =>
    basicAttrValueProofKey(target.itemId, target.pairSlot, target.observedLabel, target.observedValue),
  );
}
function scanBasicAttrValueRows(m0Buffer, gameScan) {
  const targets = collectBasicAttrValueTargets(gameScan);
  const growRows = gameScan?.basicAttrGrowRows ?? [];
  if (!targets.length || !growRows.length) return [];
  const runStart = Math.min(...growRows.map((row) => row.runOffset).filter((value) => Number.isFinite(value)));
  const runEnd = Math.max(...growRows.map((row) => row.runEndOffset).filter((value) => Number.isFinite(value)));
  const scanStart = Math.max(0, runStart - BASIC_ATTR_VALUE_SCAN_BEFORE_BYTES);
  const scanEnd = Math.min(m0Buffer.length, runEnd + BASIC_ATTR_VALUE_SCAN_AFTER_BYTES);
  const rows = [];
  for (const target of targets) {
    const needle = Buffer.alloc(4);
    needle.writeUInt32LE(target.observedValue);
    const candidates = [];
    let hitOffset = m0Buffer.indexOf(needle, scanStart);
    while (hitOffset >= 0 && hitOffset < scanEnd) {
      const run = collectContiguousSmallValueRun(m0Buffer, hitOffset);
      if (run.wordCount >= 8) {
        const exactCount = run.values.filter((value) => value === target.observedValue).length;
        const nearbyTargetCount = targets
          .filter((other) => other.basicAttrGrowId === target.basicAttrGrowId)
          .filter((other) => run.values.includes(other.observedValue)).length;
        let score = 40 + exactCount * 12 + Math.min(48, run.wordCount) + Math.min(24, run.monotonicPairs);
        score += nearbyTargetCount * 10;
        if (run.minValue <= target.observedValue && run.maxValue >= target.observedValue) score += 8;
        candidates.push({
          ...target,
          proofKey: basicAttrValueProofKey(target.itemId, target.pairSlot, target.observedLabel, target.observedValue),
          score,
          valueOffset: hitOffset,
          sequenceStartOffset: run.startOffset,
          sequenceEndOffset: run.endOffset,
          sequenceWordCount: run.wordCount,
          exactValueCount: exactCount,
          nearbyTargetCount,
          monotonicPairs: run.monotonicPairs,
          sequenceMinValue: run.minValue,
          sequenceMaxValue: run.maxValue,
          predictedValue: target.observedValue,
          predictionFormula: 'BasicAttr value-array exact',
          predictionSource: `basic-attr-values@${hitOffset}`,
          valuePreview: formatBasicAttrValuePreview(run.values),
        });
      }
      hitOffset = m0Buffer.indexOf(needle, hitOffset + 1);
    }
    rows.push(...dedupeBy(candidates, (row) => `${row.proofKey}:${row.sequenceStartOffset}:${row.sequenceEndOffset}`)
      .sort((a, b) => b.score - a.score || a.valueOffset - b.valueOffset)
      .slice(0, 8));
  }
  return rows.sort((a, b) =>
    a.itemId - b.itemId ||
    a.pairSlot - b.pairSlot ||
    b.score - a.score ||
    a.valueOffset - b.valueOffset,
  );
}

function printItemTableBridgeSummary(gameScan) {
  const identityByItem = new Map((gameScan?.itemIdentityRows ?? []).map((row) => [row.itemId, row.best]));
  const equipByItem = new Map((gameScan?.equipTableRows ?? []).map((row) => [row.itemId, row.best]));
  const pairBridgeRows = gameScan?.pairBridgeRows ?? [];
  if (equipByItem.size || pairBridgeRows.length) {
    console.log("\nItem/table bridge");
    console.log("=================");
  }
  for (const itemId of [...equipByItem.keys()].sort((a, b) => a - b)) {
    const equip = equipByItem.get(itemId);
    const identity = identityByItem.get(itemId);
    if (!equip) continue;
    const name = identity?.labels?.[0] ?? "-";
    const libs = [equip.attrLibIdA, equip.attrLibIdB, equip.attrLibIdC].filter((value) => Number.isFinite(value) && value > 0);
    console.log(
      `  item ${itemId}: ${name} @${equip.offset} lv=${equip.wearingLevel} basic=${equip.basicGrowRangeId} libs=[${libs.join(", ")}] score=${equip.score}`,
    );
  }
  if (pairBridgeRows.length) {
    console.log("  pair bridges:");
    for (const row of pairBridgeRows.slice(0, 24)) {
      const link = row.linkRows?.[0];
      const linked = link ? ` target=${link.normalizedTargetId ?? link.rawTargetId}` : "";
      console.log(`    ${row.pairId}: codes=[${(row.smallCodes ?? []).join(", ")}]${linked}`);
    }
  }
}
function printKnownStatNameSummary(gameScan) {
  const wanted = ["Crit", "Haste", "Versatility", "Mastery", "Luck", "Agility", "Armor", "Attack SPD"];
  const rows = (gameScan?.knownStatNameRows ?? []).filter((row) =>
    row.labels?.some((label) => wanted.some((term) => label.toLowerCase().includes(term.toLowerCase()))),
  );
  if (!rows.length) return;
  console.log("\nKnown stat name rows");
  console.log("====================");
  for (const row of rows.slice(0, 32)) {
    const fight = row.fightAttrRows?.[0];
    const compact = row.compactCodeRows?.[0];
    const parts = [
      `nameId=${row.nameId}`,
      row.labels?.length ? `label=${row.labels.join(" / ")}` : null,
      fight ? `fightAttr=${fight.fightAttrId}` : null,
      fight ? `enum=${fight.enumValue}` : null,
      compact ? `compact=${compact.code}` : null,
    ].filter(Boolean);
    console.log(`  ${parts.join(" ")}`);
  }
}
function collectNearbyKnownIds(buffer, offset, knownIdSet, bytesBefore = 8192, bytesAfter = 8192) {
  if (!(knownIdSet instanceof Set) || knownIdSet.size === 0) return [];
  const start = Math.max(0, offset - bytesBefore);
  const end = Math.min(buffer.length, offset + bytesAfter);
  const matches = [];
  for (let pos = start; pos + 4 <= end; pos += 1) {
    const value = buffer.readUInt32LE(pos);
    if (!knownIdSet.has(value)) continue;
    matches.push({ id: value, offset: pos, distance: Math.abs(pos - offset) });
  }
  return dedupeBy(matches, (item) => `${item.id}:${item.offset}`);
}
function collectNearbyU32(buffer, offset, bytesBefore = 96, bytesAfter = 160) {
  const start = Math.max(0, offset - bytesBefore);
  const end = Math.min(buffer.length, offset + bytesAfter);
  const alignedStart = start - (start % 4);
  const values = [];
  for (let pos = alignedStart; pos + 4 <= end; pos += 4) {
    const value = buffer.readUInt32LE(pos);
    if (value === 0 || value === 0xffffffff) continue;
    if (value > 50_000_000) continue;
    values.push({ value, offset: pos });
  }
  return dedupeBy(values, (item) => `${item.offset}:${item.value}`);
}
function dedupeBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function readVarintAt(buffer, offset, maxBytes = 5) {
  let value = 0;
  let shift = 0;
  let length = 0;
  for (let index = 0; index < maxBytes && offset + index < buffer.length; index += 1) {
    const byte = buffer[offset + index];
    value |= (byte & 0x7f) << shift;
    length += 1;
    if ((byte & 0x80) === 0) {
      return { value, length };
    }
    shift += 7;
  }
  return null;
}
function collectNearbyKnownVarints(buffer, offset, knownIdSet, bytesBefore = 8192, bytesAfter = 8192) {
  if (!(knownIdSet instanceof Set) || knownIdSet.size === 0) return [];
  const start = Math.max(0, offset - bytesBefore);
  const end = Math.min(buffer.length, offset + bytesAfter);
  const matches = [];
  for (let pos = start; pos < end; pos += 1) {
    const decoded = readVarintAt(buffer, pos, 5);
    if (!decoded) continue;
    if (!knownIdSet.has(decoded.value)) continue;
    matches.push({
      id: decoded.value,
      offset: pos,
      distance: Math.abs(pos - offset),
      encoding: "varint",
      byteLength: decoded.length,
    });
  }
  return dedupeBy(matches, (item) => `${item.id}:${item.offset}:${item.encoding}`);
}
function collectNearbyKnownStatHints(buffer, offset, knownIdSet, bytesBefore = 8192, bytesAfter = 8192) {
  const rawHits = collectNearbyKnownIds(buffer, offset, knownIdSet, bytesBefore, bytesAfter).map((item) => ({
    ...item,
    encoding: "u32le",
    byteLength: 4,
  }));
  const varintHits = collectNearbyKnownVarints(buffer, offset, knownIdSet, bytesBefore, bytesAfter);
  return dedupeBy([...rawHits, ...varintHits], (item) => `${item.id}:${item.offset}:${item.encoding}`)
    .sort((a, b) => a.distance - b.distance || a.id - b.id || a.offset - b.offset);
}
const LINK_ID_OFFSET = 68_800_000;
function normalizeLinkedId(rawId) {
  if (!Number.isFinite(rawId)) return null;
  return rawId > LINK_ID_OFFSET ? rawId - LINK_ID_OFFSET : rawId;
}
function classifyLinkedId(normalizedId, statCatalogMap) {
  if (!Number.isFinite(normalizedId)) return "unknown";
  if (statCatalogMap.has(normalizedId)) return "direct-stat-id";
  if (normalizedId >= 10_300_000 && normalizedId < 10_400_000) return "10m-family";
  if (normalizedId >= 14_000_000 && normalizedId < 15_000_000) return "14m-family";
  if (normalizedId >= 15_000_000 && normalizedId < 16_000_000) return "15m-family";
  if (normalizedId >= 23_000_000 && normalizedId < 24_000_000) return "23m-family";
  if (normalizedId >= 35_000_000 && normalizedId < 36_000_000) return "35m-family";
  return "linked-id";
}
function extractPairLinkCandidatesFromHit(pairId, hit) {
  if (!hit?.hexWindow || !Number.isFinite(hit.offset)) return [];
  const hex = hit.hexWindow.replace(/\s+/g, "");
  if (!hex) return [];
  const buffer = Buffer.from(hex, "hex");
  const windowStart = Number.isFinite(hit.hexWindowStartOffset)
    ? hit.hexWindowStartOffset
    : Math.max(0, hit.offset - (hit.hexWindowBytesBefore ?? 96));
  const candidates = [];
  for (let pos = 0; pos + 8 <= buffer.length; pos += 1) {
    const key = buffer.readUInt32LE(pos);
    if (key !== pairId) continue;
    const rawTargetId = buffer.readUInt32LE(pos + 4);
    if (!Number.isFinite(rawTargetId) || rawTargetId < 50_000_000) continue;
    const absoluteOffset = windowStart + pos;
    candidates.push({
      pairId,
      rawTargetId,
      normalizedTargetId: normalizeLinkedId(rawTargetId),
      recordOffset: absoluteOffset,
      distance: Math.abs(absoluteOffset - hit.offset),
    });
  }
  return dedupeBy(
    candidates.sort((a, b) => a.distance - b.distance || a.rawTargetId - b.rawTargetId),
    (item) => `${item.rawTargetId}:${item.recordOffset}`,
  );
}
function buildPairLinkages(gameScan) {
  const statCatalogMap = new Map((gameScan?.statCatalog ?? []).map((entry) => [entry.id, entry.labels]));
  const linkages = [];
  for (const anchor of gameScan?.numericAnchors?.pairIds ?? []) {
    const aggregated = new Map();
    for (const hit of anchor.hits ?? []) {
      for (const candidate of extractPairLinkCandidatesFromHit(anchor.value, hit)) {
        const key = `${candidate.rawTargetId}`;
        const normalizedIdLabels = statCatalogMap.get(candidate.normalizedTargetId) ?? [];
        const entry = aggregated.get(key) ?? {
          pairId: anchor.value,
          rawTargetId: candidate.rawTargetId,
          normalizedTargetId: candidate.normalizedTargetId,
          rawIdLabels: [],
          normalizedIdLabels,
          exactStatLabels: normalizedIdLabels,
          linkKind: classifyLinkedId(candidate.normalizedTargetId, statCatalogMap),
          occurrences: 0,
          minDistance: Number.POSITIVE_INFINITY,
          recordOffsets: [],
        };
        entry.occurrences += 1;
        entry.minDistance = Math.min(entry.minDistance, candidate.distance);
        entry.recordOffsets.push(candidate.recordOffset);
        aggregated.set(key, entry);
      }
    }
    const candidates = [...aggregated.values()]
      .map((entry) => ({
        ...entry,
        recordOffsets: [...new Set(entry.recordOffsets)].sort((a, b) => a - b).slice(0, 12),
      }))
      .sort((a, b) =>
        b.occurrences - a.occurrences ||
        a.minDistance - b.minDistance ||
        a.rawTargetId - b.rawTargetId
      );
    linkages.push({
      pairId: anchor.value,
      bestLink: candidates[0] ?? null,
      candidates,
    });
  }
  return linkages.sort((a, b) => a.pairId - b.pairId);
}
function decodeU16Words(buffer, baseOffset, recordOffset, start, end) {
  const rows = [];
  for (let pos = start; pos + 2 <= end; pos += 2) {
    const value = buffer.readUInt16LE(pos);
    rows.push({
      rel: baseOffset + pos - recordOffset,
      absOffset: baseOffset + pos,
      value,
      hex: `0x${value.toString(16).padStart(4, "0").toUpperCase()}`,
    });
  }
  return rows;
}
function decodeU32Words(buffer, baseOffset, recordOffset, start, end) {
  const rows = [];
  for (let pos = start; pos + 4 <= end; pos += 4) {
    const value = buffer.readUInt32LE(pos);
    rows.push({
      rel: baseOffset + pos - recordOffset,
      absOffset: baseOffset + pos,
      value,
      signed: buffer.readInt32LE(pos),
      hex: `0x${value.toString(16).padStart(8, "0").toUpperCase()}`,
      lo16: value & 0xffff,
      hi16: (value >>> 16) & 0xffff,
    });
  }
  return rows;
}
function decodeF32Words(buffer, baseOffset, recordOffset, start, end) {
  const rows = [];
  for (let pos = start; pos + 4 <= end; pos += 4) {
    const value = buffer.readFloatLE(pos);
    if (!Number.isFinite(value)) continue;
    rows.push({
      rel: baseOffset + pos - recordOffset,
      absOffset: baseOffset + pos,
      value: Number(value.toFixed(6)),
    });
  }
  return rows;
}
function findPairAnchorHit(gameScan, pairId, recordOffset) {
  const anchor = (gameScan?.numericAnchors?.pairIds ?? []).find((entry) => entry.value === pairId);
  if (!anchor) return null;
  for (const hit of anchor.hits ?? []) {
    const startOffset = Number.isFinite(hit.hexWindowStartOffset)
      ? hit.hexWindowStartOffset
      : Math.max(0, hit.offset - (hit.hexWindowBytesBefore ?? 96));
    const byteLength = hit.hexWindow ? hit.hexWindow.replace(/\s+/g, "").length / 2 : 0;
    const endOffset = startOffset + byteLength;
    if (recordOffset >= startOffset && recordOffset + 4 <= endOffset) {
      return hit;
    }
  }
  return anchor.hits?.[0] ?? null;
}
function classifyPackedWord(word, knownPairIdSet) {
  const notes = [];
  if (knownPairIdSet?.has(word.lo16)) notes.push(`lo16=pair:${word.lo16}`);
  if (knownPairIdSet?.has(word.hi16)) notes.push(`hi16=pair:${word.hi16}`);
  if (word.lo16 === 1 || word.hi16 === 1) notes.push("contains-flag-1");
  if (word.lo16 === 0 || word.hi16 === 0) notes.push("contains-zero-half");
  return notes;
}
function buildPairRowSlices(gameScan) {
  const knownPairIdSet = new Set((gameScan?.numericAnchors?.pairIds ?? []).map((entry) => entry.value));
  const pairRowSlices = [];
  for (const linkage of gameScan?.pairLinkages ?? []) {
    const sliceEntries = [];
    const candidateList = linkage.bestLink
      ? [linkage.bestLink, ...(linkage.candidates ?? []).slice(0, 4)]
      : (linkage.candidates ?? []).slice(0, 5);
    const seen = new Set();
    for (const candidate of candidateList) {
      for (const recordOffset of candidate.recordOffsets ?? []) {
        const key = `${candidate.rawTargetId}:${recordOffset}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hit = findPairAnchorHit(gameScan, linkage.pairId, recordOffset);
        if (!hit?.hexWindow) continue;
        const buffer = Buffer.from(hit.hexWindow.replace(/\s+/g, ""), "hex");
        const windowStart = Number.isFinite(hit.hexWindowStartOffset)
          ? hit.hexWindowStartOffset
          : Math.max(0, hit.offset - (hit.hexWindowBytesBefore ?? 96));
        const localOffset = recordOffset - windowStart;
        if (localOffset < 0 || localOffset + 4 > buffer.length) continue;
        const sliceStart = Math.max(0, localOffset - 24);
        const sliceEnd = Math.min(buffer.length, localOffset + 72);
        const u16Start = Math.max(0, localOffset - 16);
        const u16End = Math.min(buffer.length, localOffset + 32);
        const rawU32Start = Math.max(0, localOffset - 16);
        const u32Start = rawU32Start - (rawU32Start % 4);
        const u32End = Math.min(buffer.length, localOffset + 32);
        const u16Words = decodeU16Words(buffer, windowStart, recordOffset, u16Start, u16End);
        const u32Words = decodeU32Words(buffer, windowStart, recordOffset, u32Start, u32End).map((word) => ({
          ...word,
          packedHints: classifyPackedWord(word, knownPairIdSet),
        }));
        const f32Words = decodeF32Words(buffer, windowStart, recordOffset, u32Start, u32End);
        sliceEntries.push({
          pairId: linkage.pairId,
          recordOffset,
          hitOffset: hit.offset,
          rawTargetId: candidate.rawTargetId,
          normalizedTargetId: candidate.normalizedTargetId,
          linkKind: candidate.linkKind,
          minDistance: candidate.minDistance,
          sliceHex: buffer.slice(sliceStart, sliceEnd).toString("hex").replace(/(.{2})/g, "$1 ").trim(),
          sliceStartOffset: windowStart + sliceStart,
          sliceEndOffset: windowStart + sliceEnd,
          u16Words,
          u32Words,
          f32Words,
        });
      }
    }
    pairRowSlices.push({
      pairId: linkage.pairId,
      rowSlices: sliceEntries.sort((a, b) => a.recordOffset - b.recordOffset),
    });
  }
  return pairRowSlices.sort((a, b) => a.pairId - b.pairId);
}
function printPairRowSliceSummary(gameScan) {
  const pairRowSlices = gameScan?.pairRowSlices ?? [];
  if (!pairRowSlices.length) return;
  console.log("\nPair row slices");
  console.log("===============");
  for (const entry of pairRowSlices) {
    const first = entry.rowSlices?.[0];
    if (!first) {
      console.log(`  ${entry.pairId}: no row slice captured`);
      continue;
    }
    const compactU32 = first.u32Words
      .slice(0, 6)
      .map((word) => `${word.value}${word.packedHints?.length ? ` (${word.packedHints.join("|")})` : ""}`)
      .join(", ");
    console.log(`  ${entry.pairId}: @${first.recordOffset} ${first.linkKind ?? "row"} -> ${first.normalizedTargetId ?? first.rawTargetId ?? "-"} | ${compactU32}`);
  }
}

function gatherLinkTargetIds(pairLinkages) {
  const targetIds = new Set();
  for (const linkage of pairLinkages ?? []) {
    for (const candidate of linkage?.candidates ?? []) {
      for (const id of [candidate.normalizedTargetId, candidate.rawTargetId]) {
        if (!Number.isFinite(id)) continue;
        if (id <= 0 || id > 2_000_000_000) continue;
        targetIds.add(id);
      }
    }
  }
  return [...targetIds].sort((a, b) => a - b);
}
function nearestTableTerms(tableAnchors, offset, limit = 3) {
  const rows = [];
  for (const anchor of tableAnchors ?? []) {
    for (const hit of anchor.hits ?? []) {
      if (!Number.isFinite(hit.offset)) continue;
      rows.push({ term: anchor.term, offset: hit.offset, distance: Math.abs(hit.offset - offset) });
    }
  }
  return rows.sort((a, b) => a.distance - b.distance || a.term.localeCompare(b.term)).slice(0, limit);
}
function extractLabelsNearTargetHit(hit) {
  if (!hit?.hexWindow) return [];
  const buffer = Buffer.from(hit.hexWindow.replace(/\s+/g, ""), "hex");
  const windowStart = Number.isFinite(hit.hexWindowStartOffset)
    ? hit.hexWindowStartOffset
    : Math.max(0, hit.offset - (hit.hexWindowBytesBefore ?? 96));
  const localOffset = hit.offset - windowStart;
  const labels = new Set();
  const direct = readStructuredStringRecord(buffer, localOffset);
  if (direct) labels.add(direct.label);
  const start = Math.max(0, localOffset - 160);
  const end = Math.min(buffer.length, localOffset + 320);
  for (let pos = start; pos + 6 <= end; pos += 1) {
    const record = readStructuredStringRecord(buffer, pos);
    if (!record) continue;
    if (record.id === hit.targetId || record.id === hit.targetIdNormalized || record.id === hit.targetIdRaw) {
      labels.add(record.label);
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}
function scanTargetIdAnchors(m0Buffer, pairLinkages, gameScan, options = {}) {
  const targetIds = gatherLinkTargetIds(pairLinkages).filter((id) => id >= 1_000_000 && id <= 200_000_000);
  const anchors = [];
  for (const id of targetIds) {
    const needle = Buffer.alloc(4);
    needle.writeUInt32LE(id);
    const hits = scanNeedleHits(m0Buffer, String(id), needle, {
      hitLimit: options.hitLimit ?? 8,
      contextBefore: Math.max(options.contextBefore ?? 160, 224),
      contextAfter: Math.max(options.contextAfter ?? 360, 512),
    }).map((hit) => {
      const enriched = {
        ...hit,
        targetId: id,
        targetIdNormalized: id,
        targetIdRaw: id,
      };
      return {
        ...enriched,
        exactLabels: extractLabelsNearTargetHit(enriched),
        nearestTables: nearestTableTerms(gameScan?.tableAnchors ?? [], hit.offset),
      };
    });
    anchors.push({ value: id, kind: "targetId", hits });
  }
  return anchors;
}
function buildTargetIdLabelMap(targetIdAnchors) {
  const map = new Map();
  for (const anchor of targetIdAnchors ?? []) {
    const labels = new Set();
    for (const hit of anchor.hits ?? []) {
      for (const label of hit.exactLabels ?? []) labels.add(label);
    }
    if (labels.size) map.set(anchor.value, [...labels].sort((a, b) => a.localeCompare(b)));
  }
  return map;
}
function inferNextHopHint(linkKind, rawLabelFamily, normalizedLabelFamily) {
  if (linkKind === "10m-family") {
    return "needs a second hop through EffectLib/EffectConfig; current target ids still look item-family";
  }
  if (linkKind === "15m-family") {
    return "needs a second hop through set/style effect rows; current target ids still look set-family";
  }
  if (rawLabelFamily === "item-like") {
    return "raw target ids are still item-like; follow the effect/config row instead of the localization row";
  }
  if (rawLabelFamily === "set-like") {
    return "raw target ids are still set-like; follow the linked row chain one step deeper";
  }
  if (normalizedLabelFamily === "other-label") {
    return "normalized ids still resolve to non-stat labels; keep decoding the row chain";
  }
  return null;
}
function enrichPairLinkagesWithTargetLabels(pairLinkages, targetIdLabelMap) {
  return (pairLinkages ?? []).map((linkage) => ({
    ...linkage,
    bestLink: linkage.bestLink
      ? (() => {
          const normalizedIdLabels = [
            ...new Set([
              ...(linkage.bestLink.normalizedIdLabels ?? []),
              ...(targetIdLabelMap.get(linkage.bestLink.normalizedTargetId) ?? []),
            ]),
          ];
          const rawIdLabels = [
            ...new Set([
              ...(linkage.bestLink.rawIdLabels ?? []),
              ...(targetIdLabelMap.get(linkage.bestLink.rawTargetId) ?? []),
            ]),
          ];
          return {
            ...linkage.bestLink,
            normalizedIdLabels,
            rawIdLabels,
            exactStatLabels: [...new Set([...(normalizedIdLabels ?? []), ...(rawIdLabels ?? [])])],
          };
        })()
      : linkage.bestLink,
    candidates: (linkage.candidates ?? []).map((candidate) => {
      const normalizedIdLabels = [
        ...new Set([
          ...(candidate.normalizedIdLabels ?? []),
          ...(targetIdLabelMap.get(candidate.normalizedTargetId) ?? []),
        ]),
      ];
      const rawIdLabels = [
        ...new Set([
          ...(candidate.rawIdLabels ?? []),
          ...(targetIdLabelMap.get(candidate.rawTargetId) ?? []),
        ]),
      ];
      return {
        ...candidate,
        normalizedIdLabels,
        rawIdLabels,
        exactStatLabels: [...new Set([...(normalizedIdLabels ?? []), ...(rawIdLabels ?? [])])],
      };
    }),
  }));
}
function printTargetIdAnchorSummary(targetIdAnchors) {
  if (!targetIdAnchors?.length) return;
  console.log("\nTarget-id anchors");
  console.log("=================");
  for (const anchor of targetIdAnchors.slice(0, 24)) {
    const labels = [...new Set((anchor.hits ?? []).flatMap((hit) => hit.exactLabels ?? []))];
    const nearest = anchor.hits?.[0]?.nearestTables?.[0]?.term ?? "-";
    console.log(`  ${anchor.value}: hits=${anchor.hits?.length ?? 0} labels=${labels.length ? labels.join(" / ") : "-"} nearest=${nearest}`);
  }
}


function isProbablyStatLabel(label) {
  if (typeof label !== "string") return false;
  const value = label.trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (/\[(ultimate|dreambound|dream)\]/i.test(value)) return false;
  if (/bracelet/i.test(value)) return false;
  if (/set/i.test(value)) return false;
  if (/jade/i.test(value)) return false;
  if (/corium/i.test(value)) return false;
  if (/magma/i.test(value)) return false;
  if (/concerto/i.test(value)) return false;
  if (/nocturne/i.test(value)) return false;
  if (/luw/i.test(value)) return false;
  return /(atk|damage|armor|resistance|crit|speed|spd|haste|mastery|versatility|luck|healing|shield|max hp|endurance|matk|element)/i.test(value);
}
function normalizeStatLabels(labels) {
  return [...new Set((labels ?? []).filter((label) => typeof label === "string" && label.trim()))]
    .map((label) => label.trim())
    .sort((a, b) => a.localeCompare(b));
}
function filterStatLikeLabels(labels) {
  return normalizeStatLabels(labels).filter((label) => isProbablyStatLabel(label));
}
function classifyLabelFamily(labels) {
  const normalized = normalizeStatLabels(labels);
  if (!normalized.length) return "unknown";
  if (normalized.some((label) => isProbablyStatLabel(label))) return "stat-like";
  if (normalized.some((label) => /set/i.test(label))) return "set-like";
  if (normalized.some((label) => /bracelet/i.test(label))) return "item-like";
  if (normalized.some((label) => /luw/i.test(label))) return "npc-like";
  return "other-label";
}
function buildSchemaFamilyHints(gameScan) {
  const pairRowSlices = gameScan?.pairRowSlices ?? [];
  const pairLinkages = gameScan?.pairLinkages ?? [];
  const hints = [];
  for (const linkage of pairLinkages) {
    const rowSlice = pairRowSlices.find((entry) => entry.pairId === linkage.pairId)?.rowSlices?.[0] ?? null;
    const best = linkage.bestLink ?? null;
    const labels = normalizeStatLabels(best?.exactStatLabels ?? []);
    const statLikeLabels = filterStatLikeLabels(labels);
    const u32Words = rowSlice?.u32Words ?? [];
    const firstStructured = u32Words.slice(0, 6).map((word) => ({
      rel: word.rel,
      value: word.value,
      lo16: word.lo16,
      hi16: word.hi16,
    }));
    const familyHi16 = u32Words.length ? [...new Set(u32Words.map((word) => word.hi16).filter((value) => value > 0))] : [];
    const rawIdLabels = normalizeStatLabels(best?.rawIdLabels ?? []);
    const normalizedIdLabels = normalizeStatLabels(best?.normalizedIdLabels ?? []);
    hints.push({
      pairId: linkage.pairId,
      linkKind: best?.linkKind ?? null,
      normalizedTargetId: best?.normalizedTargetId ?? null,
      rawTargetId: best?.rawTargetId ?? null,
      labelFamily: classifyLabelFamily(labels),
      rawLabelFamily: classifyLabelFamily(rawIdLabels),
      normalizedLabelFamily: classifyLabelFamily(normalizedIdLabels),
      exactLabels: labels,
      rawIdLabels,
      normalizedIdLabels,
      statLikeLabels,
      recordOffsets: best?.recordOffsets ?? [],
      familyHi16,
      firstStructured,
    });
  }
  return hints.sort((a, b) => a.pairId - b.pairId);
}
function printSchemaFamilyHints(gameScan) {
  const hints = gameScan?.schemaFamilyHints ?? [];
  if (!hints.length) return;
  console.log("\nSchema-family hints");
  console.log("===================");
  for (const hint of hints) {
    const labelText = hint.statLikeLabels[0] ?? hint.exactLabels[0] ?? "-";
    const family = hint.familyHi16.length
      ? hint.familyHi16.map((value) => `0x${value.toString(16).toUpperCase()}`).join(", ")
      : "-";
    console.log(`  ${hint.pairId}: ${hint.linkKind ?? "-"} ${hint.labelFamily} hi16=${family} label=${labelText}`);
  }
}

function scanNeedleHits(buffer, term, needle, options = {}) {
  const hitLimit = options.hitLimit ?? 8;
  const contextBefore = options.contextBefore ?? 160;
  const contextAfter = options.contextAfter ?? 360;
  const hexBeforeBytes = Math.min(contextBefore, 96);
  const hexAfterBytes = Math.min(contextAfter, 224);
  return findAll(buffer, needle, hitLimit).map((offset) => ({
    offset,
    asciiWindow: readAsciiWindow(buffer, offset, contextBefore, contextAfter),
    hexWindow: readHexWindow(buffer, offset, hexBeforeBytes, hexAfterBytes),
    hexWindowStartOffset: Math.max(0, offset - hexBeforeBytes),
    hexWindowBytesBefore: hexBeforeBytes,
    hexWindowBytesAfter: hexAfterBytes,
    nearbyU32: collectNearbyU32(buffer, offset),
  }));
}
function scanGameAnchors(gameRoot, ids, pairIds, nameTerms, fullPackageScan, options = {}) {
  const containerRoot = path.join(gameRoot, "BPSR_STEAM_Data", "StreamingAssets", "container");
  const m0 = path.join(containerRoot, "m0.pkg");
  if (!fs.existsSync(m0)) {
    console.log(`\nGame package scan skipped: m0.pkg not found at ${m0}`);
    return {
      enabled: false,
      gameRoot,
      containerRoot,
      packagePath: m0,
      packageMissing: true,
    };
  }
  const m0Buffer = fs.readFileSync(m0);
  const gameScan = {
    enabled: true,
    gameRoot,
    containerRoot,
    packagePath: m0,
    packageSize: m0Buffer.length,
    tableAnchors: [],
    localizationAnchors: [],
    numericAnchors: {
      itemIds: [],
      pairIds: [],
    },
  };
  console.log("\nGame table/schema anchors");
  console.log("=========================");
  console.log(`m0.pkg: ${(m0Buffer.length / 1024 / 1024).toFixed(1)} MiB`);
  for (const term of INTERESTING_TABLE_TERMS) {
    const hits = scanNeedleHits(m0Buffer, term, Buffer.from(term, "utf8"), options);
    if (!hits.length) continue;
    gameScan.tableAnchors.push({ term, hits: hits.map((hit) => ({ offset: hit.offset, asciiWindow: hit.asciiWindow })) });
    console.log(`\n${term}: ${hits.map((hit) => hit.offset).join(", ")}`);
    console.log(`  ${hits[0].asciiWindow}`);
  }
  console.log("\nName/stat localization anchors");
  for (const term of nameTerms) {
    const hits = scanNeedleHits(m0Buffer, term, Buffer.from(term, "utf8"), options);
    if (!hits.length) continue;
    gameScan.localizationAnchors.push({ term, hits });
    console.log(`  ${term}: ${hits.map((hit) => hit.offset).join(", ")}`);
  }
  gameScan.statCatalog = buildStatCatalog(gameScan.localizationAnchors, nameTerms);
  gameScan.labelLookup = buildLocalizationLabelLookup(gameScan.localizationAnchors);
  const knownStatIdSet = new Set(gameScan.statCatalog.map((entry) => entry.id));
  const statLabelsById = new Map(gameScan.statCatalog.map((entry) => [entry.id, entry.labels]));
  if (gameScan.statCatalog.length) {
    console.log("\nResolved stat/id catalog");
    console.log("========================");
    for (const entry of gameScan.statCatalog.slice(0, 32)) {
      console.log(`  ${entry.id}: ${entry.labels.join(" / ")}`);
    }
  }
  console.log("\nKnown item-id anchors in m0.pkg");
  for (const id of ids) {
    const needle = Buffer.alloc(4);
    needle.writeUInt32LE(id);
    const hits = scanNeedleHits(m0Buffer, String(id), needle, options).map((hit) => {
      const nearbyKnownStatIds = collectNearbyKnownStatHints(
        m0Buffer,
        hit.offset,
        knownStatIdSet,
        options.cooccurrenceBefore ?? 8192,
        options.cooccurrenceAfter ?? 8192,
      ).map((item) => ({
        ...item,
        labels: statLabelsById.get(item.id) ?? [],
      }));
      return { ...hit, nearbyKnownStatIds };
    });
    gameScan.numericAnchors.itemIds.push({ value: id, kind: "itemId", hits });
    console.log(`  ${id}: ${hits.length ? hits.map((hit) => hit.offset).join(", ") : "-"}`);
  }
  if (pairIds.length) {
    console.log("\nKnown pair-id anchors in m0.pkg");
    for (const id of pairIds) {
      const needle = Buffer.alloc(4);
      needle.writeUInt32LE(id);
      const hits = scanNeedleHits(m0Buffer, String(id), needle, options).map((hit) => {
        const nearbyKnownStatIds = collectNearbyKnownIds(
          m0Buffer,
          hit.offset,
          knownStatIdSet,
          options.cooccurrenceBefore ?? 8192,
          options.cooccurrenceAfter ?? 8192,
        ).map((item) => ({
          ...item,
          labels: statLabelsById.get(item.id) ?? [],
        }));
        return { ...hit, nearbyKnownStatIds };
      });
      gameScan.numericAnchors.pairIds.push({ value: id, kind: "pairId", hits });
      console.log(`  ${id}: ${hits.length ? hits.map((hit) => hit.offset).join(", ") : "-"}`);
    }
  }
  const labelMap = buildLabelMap(gameScan);
  const statCatalogMap = new Map((gameScan.statCatalog ?? []).map((entry) => [entry.id, entry.labels]));
  gameScan.itemIdentityRows = scanItemIdentityRows(m0Buffer, ids, labelMap);
  gameScan.equipTableRows = scanEquipTableRows(m0Buffer, ids);
  gameScan.pairBridgeRows = scanPairBridgeRows(m0Buffer, pairIds, labelMap, statCatalogMap);
  gameScan.knownStatNameRows = scanKnownStatNameRows(m0Buffer, gameScan);
  gameScan.attrLibRows = scanAttrLibRows(m0Buffer, gameScan);
  gameScan.directAttrLibValueCalRows = scanDirectAttrLibValueCalRows(m0Buffer, gameScan);
  gameScan.basicGrowJoinRows = scanBasicGrowJoinRows(m0Buffer, gameScan);
  gameScan.basicAttrGrowRows = scanBasicAttrGrowRows(m0Buffer, gameScan);
  gameScan.basicAttrValueRows = scanBasicAttrValueRows(m0Buffer, gameScan);
  printItemTableBridgeSummary(gameScan);
  printKnownStatNameSummary(gameScan);
  printAttrLibSummary(gameScan);
  gameScan.pairLinkages = buildPairLinkages(gameScan);
  gameScan.targetIdAnchors = scanTargetIdAnchors(m0Buffer, gameScan.pairLinkages, gameScan, options);
  const targetIdLabelMap = buildTargetIdLabelMap(gameScan.targetIdAnchors);
  gameScan.pairLinkages = enrichPairLinkagesWithTargetLabels(gameScan.pairLinkages, targetIdLabelMap);
  gameScan.pairRowSlices = buildPairRowSlices(gameScan);
  gameScan.schemaFamilyHints = buildSchemaFamilyHints(gameScan);
  printPairRowSliceSummary(gameScan);
  printSchemaFamilyHints(gameScan);
  printTargetIdAnchorSummary(gameScan.targetIdAnchors);
  if (!fullPackageScan) {
    return gameScan;
  }
  console.log("\nFull package item-id scan");
  const pkgFiles = fs
    .readdirSync(containerRoot)
    .filter((name) => /^m\d+\.pkg$/i.test(name))
    .sort((a, b) => Number(a.slice(1, -4)) - Number(b.slice(1, -4)));
  const hitsByPackage = [];
  for (const pkg of pkgFiles) {
    const filePath = path.join(containerRoot, pkg);
    const buffer = fs.readFileSync(filePath);
    const hits = [];
    for (const id of ids) {
      const needle = Buffer.alloc(4);
      needle.writeUInt32LE(id);
      const offset = buffer.indexOf(needle);
      if (offset >= 0) hits.push(`${id}@${offset}`);
    }
    if (hits.length) {
      console.log(`  ${pkg}: ${hits.join(", ")}`);
      hitsByPackage.push({ pkg, hits });
    }
  }
  gameScan.fullPackageHits = hitsByPackage;
  return gameScan;
}
function dedupeStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}
function buildTableChainHints(report, pairProfiles = []) {
  const linkagesByPair = new Map((report.gameScan?.pairLinkages ?? []).map((entry) => [entry.pairId, entry]));
  const schemaHintsByPair = new Map((report.gameScan?.schemaFamilyHints ?? []).map((entry) => [entry.pairId, entry]));
  const hints = [];
  for (const profile of pairProfiles) {
    const linkage = linkagesByPair.get(profile.pairId) ?? null;
    const schemaHint = schemaHintsByPair.get(profile.pairId) ?? null;
    const statCandidates = [];
    for (const candidate of linkage?.candidates ?? []) {
      const statLabels = filterStatLikeLabels(candidate.exactStatLabels ?? []);
      if (!statLabels.length) continue;
      statCandidates.push({
        linkKind: candidate.linkKind ?? null,
        rawTargetId: candidate.rawTargetId ?? null,
        normalizedTargetId: candidate.normalizedTargetId ?? null,
        labels: statLabels,
        occurrences: candidate.occurrences ?? 0,
        minDistance: candidate.minDistance ?? Number.POSITIVE_INFINITY,
      });
    }
    statCandidates.sort((a, b) => a.minDistance - b.minDistance || b.occurrences - a.occurrences || a.rawTargetId - b.rawTargetId);
    const best = statCandidates[0] ?? null;
    let confidence = "none";
    if (best) {
      confidence = best.minDistance === 0 ? "medium" : best.minDistance <= 64 ? "low" : "speculative";
    }
    const rawIdLabels = normalizeStatLabels(linkage?.bestLink?.rawIdLabels ?? []);
    const normalizedIdLabels = normalizeStatLabels(linkage?.bestLink?.normalizedIdLabels ?? []);
    const rawLabelFamily = classifyLabelFamily(rawIdLabels);
    const normalizedLabelFamily = classifyLabelFamily(normalizedIdLabels);
    const secondHopNeeded = !statCandidates.length && ["10m-family", "15m-family", "linked-id"].includes(linkage?.bestLink?.linkKind ?? "") && (
      rawLabelFamily === "item-like" ||
      rawLabelFamily === "set-like" ||
      normalizedLabelFamily === "other-label" ||
      normalizedLabelFamily === "unknown"
    );
    hints.push({
      pairId: profile.pairId,
      observedValues: profile.observedValues ?? [],
      linkKind: linkage?.bestLink?.linkKind ?? schemaHint?.linkKind ?? null,
      family: schemaHint?.labelFamily ?? null,
      rawLabelFamily,
      normalizedLabelFamily,
      rawIdLabels,
      normalizedIdLabels,
      secondHopNeeded,
      nextHopHint: secondHopNeeded ? inferNextHopHint(linkage?.bestLink?.linkKind ?? null, rawLabelFamily, normalizedLabelFamily) : null,
      recordOffsets: dedupeStrings([...(schemaHint?.recordOffsets ?? []), ...((linkage?.bestLink?.recordOffsets ?? []) || [])].map(String)).map((v) => Number.parseInt(v,10)).filter((v)=>Number.isFinite(v)),
      rawTargetId: linkage?.bestLink?.rawTargetId ?? null,
      normalizedTargetId: linkage?.bestLink?.normalizedTargetId ?? null,
      statCandidates,
      bestStatLabels: best?.labels ?? [],
      confidence,
    });
  }
  return hints.sort((a, b) => a.pairId - b.pairId);
}
function buildTargetAnchorMap(targetIdAnchors) {
  const map = new Map();
  for (const anchor of targetIdAnchors ?? []) {
    const exactLabels = dedupeStrings((anchor.hits ?? []).flatMap((hit) => hit.exactLabels ?? []));
    const nearestTables = dedupeStrings(
      (anchor.hits ?? []).flatMap((hit) => (hit.nearestTables ?? []).map((entry) => entry.term ?? String(entry))),
    );
    map.set(anchor.value, {
      targetId: anchor.value,
      hitCount: anchor.hits?.length ?? 0,
      exactLabels,
      nearestTables,
    });
  }
  return map;
}
function normalizeTableTerm(term) {
  if (typeof term === "string") return term;
  if (term && typeof term === "object" && typeof term.term === "string") return term.term;
  return "";
}
function collectCandidateTableTerms(candidate, targetAnchorInfo) {
  return dedupeStrings([
    ...(candidate?.nearestTables ?? []).map(normalizeTableTerm),
    ...(candidate?.viaTables ?? []).map(normalizeTableTerm),
    ...(targetAnchorInfo?.nearestTables ?? []).map(normalizeTableTerm),
  ].filter(Boolean));
}
function scoreTableAnchorTerms(terms) {
  const normalized = dedupeStrings((terms ?? []).map(normalizeTableTerm).filter(Boolean));
  let score = 0;
  const reasons = [];
  for (const term of normalized) {
    if (STRONG_TABLE_ANCHORS.has(term)) {
      score += 14;
      reasons.push(`+${term}`);
    } else if (SECONDARY_TABLE_ANCHORS.has(term)) {
      score += 5;
      reasons.push(`~${term}`);
    } else if (NOISE_TABLE_ANCHORS.has(term)) {
      score -= 10;
      reasons.push(`-${term}`);
    }
  }
  const hasStrong = normalized.some((term) => STRONG_TABLE_ANCHORS.has(term));
  const hasOnlyNoise = normalized.length > 0 && normalized.every((term) => NOISE_TABLE_ANCHORS.has(term));
  if (hasStrong) score += 8;
  if (hasOnlyNoise) score -= 14;
  return {
    score: Number(score.toFixed(2)),
    terms: normalized,
    reasons,
    hasStrong,
    hasOnlyNoise,
  };
}
function scoreSecondHopCandidate(candidate, bestLink, targetAnchorInfo) {
  let score = 0;
  if ((candidate?.linkKind ?? null) === "direct-stat-id") score += 40;
  if ((candidate?.linkKind ?? null) === "linked-id") score += 18;
  if ((candidate?.linkKind ?? null) !== (bestLink?.linkKind ?? null)) score += 8;
  if ((candidate?.occurrences ?? 0) > 0) score += Math.min(candidate.occurrences, 4);
  if (Number.isFinite(candidate?.minDistance)) {
    score += Math.max(0, 8 - Math.min(candidate.minDistance, 4096) / 512);
  }
  const labelFamily = classifyLabelFamily([
    ...(candidate?.exactStatLabels ?? []),
    ...(candidate?.rawIdLabels ?? []),
    ...(candidate?.normalizedIdLabels ?? []),
    ...(targetAnchorInfo?.exactLabels ?? []),
  ]);
  if (labelFamily === "stat-like") score += 24;
  if (labelFamily === "item-like") score -= 8;
  if (labelFamily === "set-like") score -= 6;
  if ((targetAnchorInfo?.exactLabels?.length ?? 0) > 0) score += 10;
  const tableScore = scoreTableAnchorTerms(collectCandidateTableTerms(candidate, targetAnchorInfo));
  score += tableScore.score;
  return Number(score.toFixed(2));
}
function summarizeSecondHopCandidate(candidate, bestLink, targetAnchorMap) {
  const targetAnchorInfo = targetAnchorMap.get(candidate?.normalizedTargetId) ?? targetAnchorMap.get(candidate?.rawTargetId) ?? null;
  const exactLabels = normalizeStatLabels([
    ...(candidate?.exactStatLabels ?? []),
    ...(targetAnchorInfo?.exactLabels ?? []),
  ]);
  const rawIdLabels = normalizeStatLabels(candidate?.rawIdLabels ?? []);
  const normalizedIdLabels = normalizeStatLabels(candidate?.normalizedIdLabels ?? []);
  const allLabels = normalizeStatLabels([...exactLabels, ...rawIdLabels, ...normalizedIdLabels]);
  const labelFamily = classifyLabelFamily(allLabels);
  const tableAnchor = scoreTableAnchorTerms(collectCandidateTableTerms(candidate, targetAnchorInfo));
  return {
    rawTargetId: candidate?.rawTargetId ?? null,
    normalizedTargetId: candidate?.normalizedTargetId ?? null,
    linkKind: candidate?.linkKind ?? null,
    occurrences: candidate?.occurrences ?? 0,
    minDistance: candidate?.minDistance ?? null,
    recordOffsets: candidate?.recordOffsets ?? [],
    rawIdLabels,
    normalizedIdLabels,
    exactLabels,
    labelFamily,
    nearestTables: tableAnchor.terms,
    tableAnchorScore: tableAnchor.score,
    tableAnchorReasons: tableAnchor.reasons,
    hasStrongTableAnchor: tableAnchor.hasStrong,
    hasOnlyNoiseTableAnchor: tableAnchor.hasOnlyNoise,
    score: scoreSecondHopCandidate(candidate, bestLink, targetAnchorInfo),
  };
}
function buildSecondHopHints(report, pairProfiles = [], tableChainHints = []) {
  const linkagesByPair = new Map((report.gameScan?.pairLinkages ?? []).map((entry) => [entry.pairId, entry]));
  const chainHintsByPair = new Map((tableChainHints ?? []).map((entry) => [entry.pairId, entry]));
  const targetAnchorMap = buildTargetAnchorMap(report.gameScan?.targetIdAnchors ?? []);
  const hints = [];
  for (const profile of pairProfiles ?? []) {
    const linkage = linkagesByPair.get(profile.pairId) ?? null;
    const chainHint = chainHintsByPair.get(profile.pairId) ?? null;
    if (!chainHint?.secondHopNeeded || !linkage?.bestLink) continue;
    const familySiblings = (linkage.candidates ?? [])
      .filter((candidate) =>
        candidate.rawTargetId !== linkage.bestLink.rawTargetId &&
        candidate.linkKind === linkage.bestLink.linkKind,
      )
      .map((candidate) => summarizeSecondHopCandidate(candidate, linkage.bestLink, targetAnchorMap))
      .sort((a, b) => b.score - a.score || a.rawTargetId - b.rawTargetId)
      .slice(0, 6);
    const hop2Candidates = (linkage.candidates ?? [])
      .filter((candidate) => candidate.rawTargetId !== linkage.bestLink.rawTargetId)
      .map((candidate) => summarizeSecondHopCandidate(candidate, linkage.bestLink, targetAnchorMap))
      .sort((a, b) => b.score - a.score || a.rawTargetId - b.rawTargetId)
      .slice(0, 8);
    const recommended = hop2Candidates[0] ?? null;
    hints.push({
      pairId: profile.pairId,
      observedValues: profile.observedValues ?? [],
      currentLinkKind: linkage.bestLink.linkKind ?? null,
      currentRawTargetId: linkage.bestLink.rawTargetId ?? null,
      currentNormalizedTargetId: linkage.bestLink.normalizedTargetId ?? null,
      currentLabels: normalizeStatLabels([
        ...(linkage.bestLink.exactStatLabels ?? []),
        ...(linkage.bestLink.rawIdLabels ?? []),
        ...(linkage.bestLink.normalizedIdLabels ?? []),
      ]),
      nextHopHint: chainHint.nextHopHint ?? null,
      familySiblings,
      hop2Candidates,
      recommended,
    });
  }
  return hints.sort((a, b) => a.pairId - b.pairId);
}

function extractLabelsNearNumericOffset(buffer, offset, targetIds = []) {
  const wanted = new Set((targetIds ?? []).filter((value) => Number.isFinite(value)));
  const labels = new Set();
  const start = Math.max(0, offset - 192);
  const end = Math.min(buffer.length, offset + 256);
  for (let pos = start; pos + 6 <= end; pos += 1) {
    const record = readStructuredStringRecord(buffer, pos);
    if (!record) continue;
    if (!wanted.size || wanted.has(record.id)) labels.add(record.label);
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}
function extractLinkedIdCandidatesFromTargetHit(targetId, hit, statCatalogMap) {
  if (!hit?.hexWindow || !Number.isFinite(hit.offset)) return [];
  const hex = hit.hexWindow.replace(/\s+/g, "");
  if (!hex) return [];
  const buffer = Buffer.from(hex, "hex");
  const windowStart = Number.isFinite(hit.hexWindowStartOffset)
    ? hit.hexWindowStartOffset
    : Math.max(0, hit.offset - (hit.hexWindowBytesBefore ?? 96));
  const localOffset = hit.offset - windowStart;
  const start = Math.max(0, localOffset - 192);
  const end = Math.min(buffer.length, localOffset + 512);
  const aggregated = new Map();
  for (let pos = start; pos + 4 <= end; pos += 1) {
    const rawTargetId = buffer.readUInt32LE(pos);
    if (!Number.isFinite(rawTargetId) || rawTargetId < 50_000_000 || rawTargetId > 2_000_000_000) continue;
    if (rawTargetId === targetId) continue;
    const normalizedTargetId = normalizeLinkedId(rawTargetId);
    if (!Number.isFinite(normalizedTargetId) || normalizedTargetId === targetId) continue;
    const recordOffset = windowStart + pos;
    const key = `${rawTargetId}`;
    const normalizedIdLabels = statCatalogMap.get(normalizedTargetId) ?? [];
    const rawIdLabels = extractLabelsNearNumericOffset(buffer, pos, [rawTargetId]);
    const exactStatLabels = filterStatLikeLabels([...normalizedIdLabels, ...rawIdLabels]);
    const entry = aggregated.get(key) ?? {
      rawTargetId,
      normalizedTargetId,
      rawIdLabels,
      normalizedIdLabels,
      exactStatLabels,
      linkKind: classifyLinkedId(normalizedTargetId, statCatalogMap),
      occurrences: 0,
      minDistance: Number.POSITIVE_INFINITY,
      recordOffsets: [],
    };
    entry.occurrences += 1;
    entry.minDistance = Math.min(entry.minDistance, Math.abs(recordOffset - hit.offset));
    entry.recordOffsets.push(recordOffset);
    aggregated.set(key, entry);
  }
  return [...aggregated.values()]
    .map((entry) => ({
      ...entry,
      recordOffsets: [...new Set(entry.recordOffsets)].sort((a, b) => a - b).slice(0, 12),
      rawIdLabels: normalizeStatLabels(entry.rawIdLabels),
      normalizedIdLabels: normalizeStatLabels(entry.normalizedIdLabels),
      exactStatLabels: normalizeStatLabels(entry.exactStatLabels),
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.minDistance - b.minDistance || a.rawTargetId - b.rawTargetId);
}
function scanSpecificTargetAnchors(m0Buffer, targetIds, gameScan, options = {}) {
  const anchors = [];
  const uniqueTargetIds = [...new Set((targetIds ?? []).filter((id) => Number.isFinite(id) && id >= 1_000_000 && id <= 2_000_000_000))].sort((a, b) => a - b);
  for (const id of uniqueTargetIds) {
    const needle = Buffer.alloc(4);
    needle.writeUInt32LE(id);
    const hits = scanNeedleHits(m0Buffer, String(id), needle, {
      hitLimit: options.hitLimit ?? 8,
      contextBefore: Math.max(options.contextBefore ?? 256, 256),
      contextAfter: Math.max(options.contextAfter ?? 640, 640),
    }).map((hit) => {
      const enriched = {
        ...hit,
        targetId: id,
        targetIdNormalized: id,
        targetIdRaw: id,
      };
      return {
        ...enriched,
        exactLabels: extractLabelsNearTargetHit(enriched),
        nearestTables: nearestTableTerms(gameScan?.tableAnchors ?? [], hit.offset),
      };
    });
    anchors.push({ value: id, kind: "targetId", hits });
  }
  return anchors;
}
function buildMultiHopWalk(report, options = {}) {
  const secondHopHints = report?.resolved?.secondHopHints ?? [];
  const packagePath = report?.gameScan?.packagePath;
  if (!secondHopHints.length || !packagePath || !fs.existsSync(packagePath)) return [];
  const m0Buffer = fs.readFileSync(packagePath);
  const statCatalogMap = new Map((report.gameScan?.statCatalog ?? []).map((entry) => [entry.id, entry.labels]));
  const maxHops = Math.max(2, Number.isFinite(options.maxHops) ? options.maxHops : 4);
  const branchLimit = Math.max(1, Number.isFinite(options.branchLimit) ? options.branchLimit : 5);
  const scanCache = new Map();
  const anchorMap = buildTargetAnchorMap(report.gameScan?.targetIdAnchors ?? []);
  function getAnchorsForId(targetId) {
    if (!Number.isFinite(targetId)) return null;
    if (scanCache.has(targetId)) return scanCache.get(targetId);
    const anchor = scanSpecificTargetAnchors(m0Buffer, [targetId], report.gameScan ?? {}, options)[0] ?? { value: targetId, hits: [] };
    scanCache.set(targetId, anchor);
    anchorMap.set(targetId, {
      targetId,
      hitCount: anchor.hits?.length ?? 0,
      exactLabels: dedupeStrings((anchor.hits ?? []).flatMap((hit) => hit.exactLabels ?? [])),
      nearestTables: dedupeStrings((anchor.hits ?? []).flatMap((hit) => (hit.nearestTables ?? []).map((entry) => entry.term ?? String(entry)))),
    });
    return anchor;
  }
  const walks = [];
  for (const hint of secondHopHints) {
    const walk = {
      pairId: hint.pairId,
      observedValues: hint.observedValues ?? [],
      start: {
        currentLinkKind: hint.currentLinkKind ?? null,
        currentRawTargetId: hint.currentRawTargetId ?? null,
        currentNormalizedTargetId: hint.currentNormalizedTargetId ?? null,
        currentLabels: hint.currentLabels ?? [],
        nextHopHint: hint.nextHopHint ?? null,
      },
      hops: [],
      terminalCandidates: [],
    };
    let frontier = (hint.hop2Candidates ?? []).slice(0, branchLimit).map((candidate) => ({
      ...candidate,
      fromTargetId: hint.currentNormalizedTargetId ?? hint.currentRawTargetId ?? null,
      fromPairId: hint.pairId,
      hop: 2,
      source: "secondHopHint",
    }));
    const visited = new Set(frontier.map((candidate) => candidate.normalizedTargetId ?? candidate.rawTargetId).filter((value) => Number.isFinite(value)));
    if (frontier.length) walk.hops.push({ hop: 2, candidates: frontier });
    for (let hop = 3; hop <= maxHops; hop += 1) {
      if (!frontier.length) break;
      const nextCandidates = [];
      const pairSeen = new Set();
      for (const candidate of frontier) {
        const targetId = candidate.normalizedTargetId ?? candidate.rawTargetId;
        if (!Number.isFinite(targetId)) continue;
        const anchor = getAnchorsForId(targetId);
        for (const hit of anchor?.hits ?? []) {
          const extracted = extractLinkedIdCandidatesFromTargetHit(targetId, hit, statCatalogMap);
          for (const linkedCandidate of extracted) {
            linkedCandidate.viaTables = (hit.nearestTables ?? []).map((entry) => entry.term ?? String(entry));
            const nextId = linkedCandidate.normalizedTargetId ?? linkedCandidate.rawTargetId;
            const dedupeKey = `${targetId}->${linkedCandidate.rawTargetId}`;
            if (pairSeen.has(dedupeKey)) continue;
            pairSeen.add(dedupeKey);
            const summary = summarizeSecondHopCandidate(linkedCandidate, candidate, anchorMap);
            summary.fromTargetId = targetId;
            summary.fromRawTargetId = candidate.rawTargetId ?? null;
            summary.fromNormalizedTargetId = candidate.normalizedTargetId ?? null;
            summary.hop = hop;
            summary.source = `scan:${targetId}`;
            summary.viaTables = linkedCandidate.viaTables;
            summary.anchorOffset = hit.offset ?? null;
            summary.visitedAlready = visited.has(nextId);
            if (summary.visitedAlready) summary.score -= 6;
            nextCandidates.push(summary);
          }
        }
      }
      const ranked = dedupeBy(
        nextCandidates.sort((a, b) => b.score - a.score || a.rawTargetId - b.rawTargetId),
        (item) => `${item.fromTargetId}:${item.rawTargetId}`,
      ).slice(0, branchLimit);
      if (!ranked.length) break;
      walk.hops.push({ hop, candidates: ranked });
      frontier = ranked.filter((candidate) => {
        const nextId = candidate.normalizedTargetId ?? candidate.rawTargetId;
        if (!Number.isFinite(nextId) || visited.has(nextId)) return false;
        visited.add(nextId);
        return true;
      });
    }
    walk.terminalCandidates = (walk.hops[walk.hops.length - 1]?.candidates ?? []).slice(0, branchLimit);
    walks.push(walk);
  }
  return walks.sort((a, b) => a.pairId - b.pairId);
}
function gatherFocusTargetIds(report, options = {}) {
  const ids = new Set((options.focusTargets ?? []).filter((value) => Number.isFinite(value) && value > 0));
  for (const hint of report?.resolved?.secondHopHints ?? []) {
    for (const candidate of [
      hint.recommended,
      ...(hint.hop2Candidates ?? []).slice(0, 4),
      ...(hint.familySiblings ?? []).slice(0, 2),
    ]) {
      if (!candidate) continue;
      for (const id of [candidate.rawTargetId, candidate.normalizedTargetId]) {
        if (Number.isFinite(id) && id > 0) ids.add(id);
      }
    }
  }
  for (const walk of report?.resolved?.multiHopWalk ?? []) {
    for (const candidate of walk.terminalCandidates ?? []) {
      for (const id of [candidate.rawTargetId, candidate.normalizedTargetId]) {
        if (Number.isFinite(id) && id > 0) ids.add(id);
      }
    }
  }
  return [...ids].sort((a, b) => a - b);
}
function readU32Cluster(buffer, centerOffset, before = 96, after = 192, statCatalogMap = new Map()) {
  const start = Math.max(0, centerOffset - before);
  const end = Math.min(buffer.length - 4, centerOffset + after);
  const rows = [];
  for (let offset = start; offset <= end; offset += 4) {
    const value = buffer.readUInt32LE(offset);
    if (!value && Math.abs(offset - centerOffset) > 32) continue;
    const normalized = normalizeLinkedId(value);
    const labels = statCatalogMap.get(value) ?? statCatalogMap.get(normalized) ?? [];
    rows.push({
      rel: offset - centerOffset,
      offset,
      value,
      hex: `0x${value.toString(16).toUpperCase().padStart(8, "0")}`,
      normalized: normalized !== value ? normalized : null,
      linkKind: classifyLinkedId(normalized, statCatalogMap),
      labels: normalizeStatLabels(labels).slice(0, 4),
    });
  }
  return rows;
}
function buildFocusedTargetDumps(report, options = {}) {
  const packagePath = report?.gameScan?.packagePath;
  if (!packagePath || !fs.existsSync(packagePath)) return [];
  const m0Buffer = fs.readFileSync(packagePath);
  const statCatalogMap = new Map((report.gameScan?.statCatalog ?? []).map((entry) => [entry.id, entry.labels]));
  const targetAnchorMap = buildTargetAnchorMap(report.gameScan?.targetIdAnchors ?? []);
  const targetIds = gatherFocusTargetIds(report, options);
  const dumps = [];
  for (const targetId of targetIds) {
    const anchor = scanSpecificTargetAnchors(m0Buffer, [targetId], report.gameScan ?? {}, {
      ...options,
      hitLimit: options.focusHitLimit ?? Math.min(options.hitLimit ?? 8, 8),
      contextBefore: Math.max(options.contextBefore ?? 256, 320),
      contextAfter: Math.max(options.contextAfter ?? 640, 960),
    })[0] ?? { value: targetId, hits: [] };
    const hits = (anchor.hits ?? []).map((hit) => {
      const tableAnchor = scoreTableAnchorTerms((hit.nearestTables ?? []).map((entry) => entry.term ?? String(entry)));
      const linkedCandidates = extractLinkedIdCandidatesFromTargetHit(targetId, hit, statCatalogMap)
        .slice(0, options.branchLimit ?? 5)
        .map((candidate) => summarizeSecondHopCandidate(candidate, { linkKind: null }, targetAnchorMap));
      return {
        offset: hit.offset,
        exactLabels: hit.exactLabels ?? [],
        nearestTables: (hit.nearestTables ?? []).map((entry) => ({
          term: entry.term,
          distance: entry.distance,
          offset: entry.offset,
        })),
        tableAnchorScore: tableAnchor.score,
        tableAnchorReasons: tableAnchor.reasons,
        hasStrongTableAnchor: tableAnchor.hasStrong,
        asciiWindow: hit.asciiWindow,
        hexWindow: hit.hexWindow,
        u32Cluster: readU32Cluster(m0Buffer, hit.offset, 128, 256, statCatalogMap),
        linkedCandidates,
      };
    }).sort((a, b) => b.tableAnchorScore - a.tableAnchorScore || a.offset - b.offset);
    dumps.push({
      targetId,
      hitCount: hits.length,
      bestTableAnchorScore: hits.reduce((best, hit) => Math.max(best, hit.tableAnchorScore ?? 0), 0),
      hits,
    });
  }
  return dumps.sort((a, b) => b.bestTableAnchorScore - a.bestTableAnchorScore || a.targetId - b.targetId);
}
function printFocusedTargetSummary(focusedTargetDumps) {
  if (!focusedTargetDumps?.length) return;
  console.log("\nFocused target dumps");
  console.log("====================");
  for (const dump of focusedTargetDumps.slice(0, 16)) {
    const bestHit = dump.hits?.[0] ?? null;
    const tables = bestHit?.nearestTables?.length
      ? bestHit.nearestTables.slice(0, 4).map((entry) => `${entry.term}@${entry.distance}`).join(", ")
      : "-";
    const labels = bestHit?.exactLabels?.length ? bestHit.exactLabels.join(" / ") : "-";
    console.log(`  ${dump.targetId}: hits=${dump.hitCount} tableScore=${dump.bestTableAnchorScore} labels=${labels}`);
    console.log(`    nearest: ${tables}`);
    if (bestHit?.linkedCandidates?.length) {
      const linked = bestHit.linkedCandidates
        .slice(0, 4)
        .map((candidate) => `${candidate.normalizedTargetId ?? candidate.rawTargetId} score=${candidate.score}`)
        .join(", ");
      console.log(`    next ids: ${linked}`);
    }
  }
}
function flattenMultiHopWalkRows(walks = []) {
  const rows = [];
  for (const walk of walks) {
    for (const hopEntry of walk.hops ?? []) {
      for (const candidate of hopEntry.candidates ?? []) {
        rows.push({
          pairId: walk.pairId,
          observedValues: (walk.observedValues ?? []).join("|"),
          hop: hopEntry.hop,
          fromTargetId: candidate.fromTargetId ?? null,
          rawTargetId: candidate.rawTargetId ?? null,
          normalizedTargetId: candidate.normalizedTargetId ?? null,
          linkKind: candidate.linkKind ?? null,
          score: candidate.score ?? null,
          labelFamily: candidate.labelFamily ?? null,
          exactLabels: (candidate.exactLabels ?? []).join(" | "),
          rawIdLabels: (candidate.rawIdLabels ?? []).join(" | "),
          normalizedIdLabels: (candidate.normalizedIdLabels ?? []).join(" | "),
          nearestTables: (candidate.nearestTables ?? candidate.viaTables ?? []).join(" | "),
          tableAnchorScore: candidate.tableAnchorScore ?? null,
          tableAnchorReasons: (candidate.tableAnchorReasons ?? []).join(" | "),
          hasStrongTableAnchor: candidate.hasStrongTableAnchor ?? false,
          recordOffsets: (candidate.recordOffsets ?? []).join("|"),
          minDistance: candidate.minDistance ?? null,
          source: candidate.source ?? null,
        });
      }
    }
  }
  return rows;
}
function writeMultiHopExports(report, multiHopWalk, options = {}) {
  if (!multiHopWalk?.length) return null;
  const exportDir = options.exportDir ?? DEFAULT_EXPORT_DIR;
  const hopExportDir = resolveExportPath(options.hopExportDir ?? "gear-hop-walk", exportDir);
  const csvOut = resolveExportPath(options.csvOut ?? "gear-hop-walk-summary.csv", exportDir);
  const pairDir = path.join(hopExportDir, "pairs");
  const rows = flattenMultiHopWalkRows(multiHopWalk);
  writeCsvFile(csvOut, [
    "pairId",
    "observedValues",
    "hop",
    "fromTargetId",
    "rawTargetId",
    "normalizedTargetId",
    "linkKind",
    "score",
    "labelFamily",
    "exactLabels",
    "rawIdLabels",
    "normalizedIdLabels",
    "nearestTables",
    "tableAnchorScore",
    "tableAnchorReasons",
    "hasStrongTableAnchor",
    "recordOffsets",
    "minDistance",
    "source",
  ], rows.map((row) => [
    row.pairId,
    row.observedValues,
    row.hop,
    row.fromTargetId,
    row.rawTargetId,
    row.normalizedTargetId,
    row.linkKind,
    row.score,
    row.labelFamily,
    row.exactLabels,
    row.rawIdLabels,
    row.normalizedIdLabels,
    row.nearestTables,
    row.tableAnchorScore,
    row.tableAnchorReasons,
    row.hasStrongTableAnchor,
    row.recordOffsets,
    row.minDistance,
    row.source,
  ]));
  for (const walk of multiHopWalk) {
    writeJsonFile(path.join(pairDir, `pair-${walk.pairId}.json`), walk);
  }
  return {
    csvOut,
    pairDir,
    pairCount: multiHopWalk.length,
    rowCount: rows.length,
  };
}
function flattenAttributeWindowRows(report) {
  const rows = [];
  for (const cluster of report?.clusters ?? []) {
    for (const detail of cluster.nearbyDetails ?? []) {
      const detailFingerprint = detail.detail?.fingerprintHex ?? detail.row?.raw?.fingerprintHex ?? "";
      for (const entryWindow of detail.detail?.entryWindows ?? []) {
        const gearEntry = (cluster.gearEntries ?? []).find(
          (entry) => entry.itemId === entryWindow.itemId,
        );
        const pairText = (entryWindow.pairOffsets ?? [])
          .map((pair) => `${pair.id}@${pair.offset}`)
          .join(" | ");
        for (const segment of entryWindow.segments ?? []) {
          rows.push({
            fileBase: cluster.fileBase ?? path.basename(cluster.file ?? ""),
            time: cluster.time ?? "",
            detailFingerprint,
            itemId: entryWindow.itemId,
            quality: gearEntry?.quality ?? "",
            rarity: gearEntry?.rarity ?? "",
            uniqueId: gearEntry?.uniqueId ?? "",
            pairs: pairText,
            segmentIndex: segment.index,
            relStart: segment.relStart,
            relEnd: segment.relEnd,
            startOffset: segment.startOffset,
            endOffset: segment.endOffset,
            length: segment.length,
            value: segment.value,
            signed: segment.signed,
            low64: segment.low64,
            high64: segment.high64,
            roles: (segment.roles ?? []).join(" | "),
            hexTail: segment.hexTail,
          });
        }
      }
    }
  }
  return rows;
}
function summarizeAttributeWindowCandidates(report) {
  const rows = [];
  for (const cluster of report?.clusters ?? []) {
    for (const detail of cluster.nearbyDetails ?? []) {
      for (const entryWindow of detail.detail?.entryWindows ?? []) {
        const segments = entryWindow.segments ?? [];
        const candidates = segments.filter((segment) =>
          segment.relEnd >= 0 &&
          (segment.roles ?? []).some((role) =>
            ["display-range-candidate", "numeric-attr-candidate", "percent-tenths-candidate"].includes(role),
          ),
        );
        rows.push({
          time: cluster.time ?? "",
          fileBase: cluster.fileBase ?? path.basename(cluster.file ?? ""),
          itemId: entryWindow.itemId,
          pairIds: (entryWindow.pairOffsets ?? []).map((pair) => pair.id).join("|"),
          candidateText: candidates
            .map((segment) => `${segment.value}@${segment.relEnd}`)
            .join(", "),
        });
      }
    }
  }
  return rows;
}
function printAttributeWindowSummary(report) {
  const rows = summarizeAttributeWindowCandidates(report);
  if (!rows.length) return;
  console.log("\n0x16 attribute segment candidates");
  console.log("=================================");
  for (const row of rows.slice(0, 16)) {
    console.log(
      `  ${row.time} item=${row.itemId} pairs=[${row.pairIds || "-"}] candidates=${row.candidateText || "-"}`,
    );
  }
}
function writeAttributeWindowExports(report, options = {}) {
  const rows = flattenAttributeWindowRows(report);
  if (!rows.length) return null;
  const exportDir = options.exportDir ?? DEFAULT_EXPORT_DIR;
  const csvOut = resolveExportPath(options.attributeWindowCsvOut ?? "gear-attribute-windows.csv", exportDir);
  writeCsvFile(csvOut, [
    "fileBase",
    "time",
    "detailFingerprint",
    "itemId",
    "quality",
    "rarity",
    "uniqueId",
    "pairs",
    "segmentIndex",
    "relStart",
    "relEnd",
    "startOffset",
    "endOffset",
    "length",
    "value",
    "signed",
    "low64",
    "high64",
    "roles",
    "hexTail",
  ], rows.map((row) => [
    row.fileBase,
    row.time,
    row.detailFingerprint,
    row.itemId,
    row.quality,
    row.rarity,
    row.uniqueId,
    row.pairs,
    row.segmentIndex,
    row.relStart,
    row.relEnd,
    row.startOffset,
    row.endOffset,
    row.length,
    row.value,
    row.signed,
    row.low64,
    row.high64,
    row.roles,
    row.hexTail,
  ]));
  return {
    csvOut,
    rowCount: rows.length,
  };
}
function buildAttributeBridgeSummary(report) {
  const identityByItem = new Map((report.gameScan?.itemIdentityRows ?? []).map((row) => [row.itemId, row.best]));
  const equipByItem = new Map((report.gameScan?.equipTableRows ?? []).map((row) => [row.itemId, row.best]));
  const pairBridgeById = new Map((report.gameScan?.pairBridgeRows ?? []).map((row) => [row.pairId, row]));
  const rows = [];
  for (const cluster of report?.clusters ?? []) {
    for (const gearEntry of cluster.gearEntries ?? []) {
      const identity = identityByItem.get(gearEntry.itemId) ?? null;
      const equip = equipByItem.get(gearEntry.itemId) ?? null;
      const entryWindow = findMatchingEntryWindow(cluster, gearEntry);
      for (const pair of gearEntry.pairs ?? []) {
        const bridge = pairBridgeById.get(pair.id) ?? null;
        const link = bridge?.linkRows?.[0] ?? null;
        const relatedSegments = (entryWindow?.segments ?? []).filter((segment) =>
          (segment.roles ?? []).some((role) =>
            ["display-range-candidate", "numeric-attr-candidate", "percent-tenths-candidate"].includes(role),
          ),
        );
        rows.push({
          fileBase: cluster.fileBase ?? path.basename(cluster.file ?? ""),
          time: cluster.time ?? "",
          itemId: gearEntry.itemId,
          itemNameId: identity?.nameId ?? null,
          itemName: identity?.labels?.[0] ?? null,
          quality: gearEntry.quality ?? null,
          uniqueId: gearEntry.uniqueId ?? null,
          equipRowOffset: equip?.offset ?? null,
          wearingLevel: equip?.wearingLevel ?? null,
          basicGrowRangeId: equip?.basicGrowRangeId ?? null,
          attrLibIds: equip
            ? [equip.attrLibIdA, equip.attrLibIdB, equip.attrLibIdC].filter((value) => Number.isFinite(value) && value > 0)
            : [],
          pairId: pair.id,
          pairValue: pair.value,
          pairLinkTarget: link?.normalizedTargetId ?? link?.rawTargetId ?? null,
          pairLinkRawTarget: link?.rawTargetId ?? null,
          pairLinkKind: link?.linkKind ?? null,
          pairLinkLabels: link?.labels ?? [],
          pairSmallCodes: bridge?.smallCodes ?? [],
          pairSmallCodeOffsets: (bridge?.smallCodeRows ?? []).map((row) => `${row.code}@${row.offset}`),
          segmentValueCandidates: relatedSegments.map((segment) => `${segment.value}@${segment.relEnd}`),
        });
      }
    }
  }
  return rows;
}
function flattenKnownStatNameRows(report) {
  const rows = [];
  for (const entry of report.gameScan?.knownStatNameRows ?? []) {
    const fightRows = entry.fightAttrRows?.length ? entry.fightAttrRows : [null];
    const compactRows = entry.compactCodeRows?.length ? entry.compactCodeRows : [null];
    for (const fight of fightRows) {
      for (const compact of compactRows.slice(0, 4)) {
        rows.push({
          nameId: entry.nameId,
          labels: (entry.labels ?? []).join(" | "),
          fightAttrId: fight?.fightAttrId ?? "",
          groupCode: fight?.groupCode ?? "",
          enumValue: fight?.enumValue ?? "",
          enumNameId: fight?.enumNameId ?? "",
          fightRowOffset: fight?.offset ?? "",
          compactCode: compact?.code ?? "",
          compactOffset: compact?.offset ?? "",
        });
      }
    }
  }
  return rows;
}

function canonicalizeAttributeLabel(label) {
  if (typeof label !== "string") return "";
  const value = label.trim().toLowerCase();
  if (!value) return "";
  if (value.includes("attack spd") || value.includes("attack speed")) return "Attack SPD";
  if (value.includes("cast speed") || value.includes("casting spd")) return "Cast Speed";
  if (value.includes("crit")) return "Crit";
  if (value.includes("haste")) return "Haste";
  if (value.includes("luck")) return "Luck";
  if (value.includes("mastery")) return "Mastery";
  if (value.includes("versatility")) return "Versatility";
  if (value.includes("agility") || value === "agi") return "Agility";
  if (value.includes("strength")) return "Strength";
  if (value.includes("intellect")) return "Intellect";
  if (value.includes("armor") || value.includes("pdef")) return "Armor";
  if (value.includes("all resistance") || value.includes("resistance")) return "All Resistance";
  if (value.includes("max hp") || value === "hp") return "Max HP";
  if (value.includes("healing")) return "Healing Output";
  if (value.includes("shield")) return "Shield";
  if (value.includes("boss")) return "DMG Bonus vs. Bosses";
  if (value.includes("resilience")) return "Resilience Break Efficiency";
  if (value.includes("atk") && value.includes("matk")) return "ATK / MATK";
  return label.trim();
}
function inferItemSlot(itemName) {
  if (typeof itemName !== "string") return "";
  for (const [slot, pattern] of ITEM_SLOT_PATTERNS) {
    if (pattern.test(itemName)) return slot;
  }
  return "";
}
function gearGroupForSlot(slot) {
  return GEAR_GROUP_BY_SLOT.get(slot) ?? "";
}
function getBlockedAdvancedAttrHints(slot) {
  if (!slot) return null;
  if (slot === "Bracelet") return GENERIC_BRACELET_BLOCKED_ADVANCED_ATTR;
  return BLOCKED_ADVANCED_ATTR_BY_SLOT_AND_BASIC[slot] ?? null;
}
function getLegendaryValueCandidates(gearGroup, wearingLevel, observedValue) {
  if (!gearGroup || !Number.isFinite(observedValue)) return [];
  const rows = LEGENDARY_AFFIX_VALUE_TABLE[gearGroup] ?? [];
  const tolerance = Math.abs(observedValue) < 10 ? 0.0001 : 0.51;
  const matches = [];
  for (const row of rows) {
    const values = row.valuesByLevel?.[wearingLevel] ?? row.values ?? [];
    if (!values.length) continue;
    if (values.some((value) => Math.abs(value - observedValue) <= tolerance)) {
      matches.push({
        label: row.label,
        allowedValues: values,
      });
    }
  }
  return matches;
}
function formatBlockedHint(hints, key) {
  const values = hints?.[key] ?? [];
  return values.join(" / ");
}
function smallCodeSignature(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== "" && entry !== null && entry !== undefined).join("|");
  if (typeof value === "string") return value;
  if (Number.isFinite(value)) return String(value);
  return "";
}
function targetIdFamily(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value / 1_000_000) : null;
}
function buildObservedTrainingRows(report) {
  return buildObservedAttributeRows(report)
    .filter((row) => !row.locked && row.observedLabel)
    .map((row) => ({
      ...row,
      canonicalLabel: canonicalizeAttributeLabel(row.observedLabel),
      itemSlot: inferItemSlot(row.itemName),
      gearGroup: gearGroupForSlot(inferItemSlot(row.itemName)),
      smallCodeSignature: smallCodeSignature(row.pairSmallCodes),
      targetFamily: targetIdFamily(row.pairLinkTarget),
    }));
}
function aggregateInferenceCandidates(candidates) {
  const byLabel = new Map();
  for (const candidate of candidates) {
    const key = candidate.canonicalLabel;
    if (!key) continue;
    const existing = byLabel.get(key) ?? {
      canonicalLabel: key,
      suggestedNameId: candidate.suggestedNameId ?? "",
      maxScore: -Infinity,
      reasons: new Set(),
      sources: new Set(),
    };
    existing.maxScore = Math.max(existing.maxScore, candidate.score ?? 0);
    if (!existing.suggestedNameId && candidate.suggestedNameId) existing.suggestedNameId = candidate.suggestedNameId;
    if (candidate.reason) existing.reasons.add(candidate.reason);
    if (candidate.sourceLabel) existing.sources.add(candidate.sourceLabel);
    byLabel.set(key, existing);
  }
  return [...byLabel.values()]
    .map((entry) => ({
      canonicalLabel: entry.canonicalLabel,
      suggestedNameId: entry.suggestedNameId,
      score: entry.maxScore,
      confidence: entry.maxScore >= 90 ? "high" : entry.maxScore >= 70 ? "medium" : "low",
      reasons: [...entry.reasons],
      sources: [...entry.sources],
    }))
    .sort((a, b) => b.score - a.score || a.canonicalLabel.localeCompare(b.canonicalLabel));
}
function buildInferenceCandidatesForRow(context, observedTrainingRows) {
  const candidates = [];
  for (const observed of observedTrainingRows) {
    if (!observed.canonicalLabel) continue;
    if (observed.pairId === context.pairId) {
      candidates.push({
        canonicalLabel: observed.canonicalLabel,
        suggestedNameId: observed.observedNameId,
        score: 100,
        reason: `pairId already observed on item ${observed.itemId}`,
        sourceLabel: observed.observedLabel,
      });
    }
    if (context.smallCodeSignature && observed.smallCodeSignature && context.smallCodeSignature === observed.smallCodeSignature) {
      candidates.push({
        canonicalLabel: observed.canonicalLabel,
        suggestedNameId: observed.observedNameId,
        score: 92,
        reason: `same pair small-code signature (${context.smallCodeSignature})`,
        sourceLabel: observed.observedLabel,
      });
    }
    if (context.itemSlot && observed.itemSlot && context.itemSlot === observed.itemSlot && context.pairSlot === observed.pairSlot && context.pairLinkKind && observed.pairLinkKind === context.pairLinkKind) {
      candidates.push({
        canonicalLabel: observed.canonicalLabel,
        suggestedNameId: observed.observedNameId,
        score: 74,
        reason: `same slot (${context.itemSlot}), pair slot ${context.pairSlot}, and link family ${context.pairLinkKind}`,
        sourceLabel: observed.observedLabel,
      });
    }
    if (context.targetFamily && observed.targetFamily && context.targetFamily === observed.targetFamily && context.pairSlot === observed.pairSlot) {
      candidates.push({
        canonicalLabel: observed.canonicalLabel,
        suggestedNameId: observed.observedNameId,
        score: 82,
        reason: `same normalized target-id family (${context.targetFamily}m) at pair slot ${context.pairSlot}`,
        sourceLabel: observed.observedLabel,
      });
    }
    if (context.itemSlot && observed.itemSlot && context.itemSlot === observed.itemSlot && context.pairSlot === observed.pairSlot) {
      candidates.push({
        canonicalLabel: observed.canonicalLabel,
        suggestedNameId: observed.observedNameId,
        score: 60,
        reason: `same item slot (${context.itemSlot}) and pair slot ${context.pairSlot}`,
        sourceLabel: observed.observedLabel,
      });
    }
    if (context.gearGroup && observed.gearGroup && context.gearGroup === observed.gearGroup && context.pairSlot === observed.pairSlot && context.pairLinkKind && observed.pairLinkKind === context.pairLinkKind) {
      candidates.push({
        canonicalLabel: observed.canonicalLabel,
        suggestedNameId: observed.observedNameId,
        score: 68,
        reason: `same gear group (${context.gearGroup}), pair slot ${context.pairSlot}, and link family ${context.pairLinkKind}`,
        sourceLabel: observed.observedLabel,
      });
    }
  }
  if (context.pairSlot === 0 && Number.isFinite(context.observedValue)) {
    for (const legend of getLegendaryValueCandidates(context.gearGroup, context.wearingLevel, context.observedValue)) {
      candidates.push({
        canonicalLabel: legend.label,
        suggestedNameId: "",
        score: 65,
        reason: `legendary affix value match for ${context.gearGroup} gear at lv${context.wearingLevel}`,
        sourceLabel: `${legend.label} (${legend.allowedValues.join(" / ")})`,
      });
    }
  }
  return aggregateInferenceCandidates(candidates);
}
function buildAttributeInferenceRows(report) {
  const identityByItem = new Map((report.gameScan?.itemIdentityRows ?? []).map((row) => [row.itemId, row.best]));
  const equipByItem = new Map((report.gameScan?.equipTableRows ?? []).map((row) => [row.itemId, row.best]));
  const pairBridgeById = new Map((report.gameScan?.pairBridgeRows ?? []).map((row) => [row.pairId, row]));
  const observedTrainingRows = buildObservedTrainingRows(report);
  const rows = [];
  for (const cluster of report?.clusters ?? []) {
    for (const gearEntry of cluster.gearEntries ?? []) {
      const identity = identityByItem.get(gearEntry.itemId) ?? null;
      const equip = equipByItem.get(gearEntry.itemId) ?? null;
      const itemName = identity?.labels?.[0] ?? "";
      const itemLabelText = identity?.labels?.join(" / ") ?? itemName;
      const itemSlot = inferItemSlot(itemLabelText);
      const gearGroup = gearGroupForSlot(itemSlot);
      const blockedHints = getBlockedAdvancedAttrHints(itemSlot);
      const observation = findVisibleObservation(gearEntry);
      for (const [pairSlot, pair] of (gearEntry.pairs ?? []).entries()) {
        const bridge = pairBridgeById.get(pair.id) ?? null;
        const link = bridge?.linkRows?.[0] ?? null;
        const observedLine = observation?.lines?.find((line) => line.slot === pairSlot) ?? null;
        const context = {
          pairId: pair.id,
          pairSlot,
          itemSlot,
          gearGroup,
          pairLinkKind: link?.linkKind ?? "",
          smallCodeSignature: smallCodeSignature(bridge?.smallCodes ?? []),
          targetFamily: targetIdFamily(link?.normalizedTargetId ?? link?.rawTargetId ?? null),
          observedValue: Number.isFinite(observedLine?.value) ? observedLine.value : null,
          wearingLevel: equip?.wearingLevel ?? null,
        };
        const inferred = buildInferenceCandidatesForRow(context, observedTrainingRows);
        rows.push({
          fileBase: cluster.fileBase ?? path.basename(cluster.file ?? ""),
          time: cluster.time ?? "",
          itemId: gearEntry.itemId,
          itemNameId: identity?.nameId ?? "",
          itemName,
          itemSlot,
          gearGroup,
          quality: gearEntry.quality ?? "",
          wearingLevel: equip?.wearingLevel ?? "",
          basicGrowRangeId: equip?.basicGrowRangeId ?? "",
          pairSlot,
          pairId: pair.id,
          pairValue: pair.value ?? "",
          pairLinkKind: link?.linkKind ?? "",
          pairLinkTarget: link?.normalizedTargetId ?? link?.rawTargetId ?? "",
          pairSmallCodes: (bridge?.smallCodes ?? []).join("|"),
          blockedIfBasicStrength: formatBlockedHint(blockedHints, "Strength"),
          blockedIfBasicIntellect: formatBlockedHint(blockedHints, "Intellect"),
          blockedIfBasicAgility: formatBlockedHint(blockedHints, "Agility"),
          observedLabel: observedLine?.label ?? "",
          observedNameId: observedLine?.nameId ?? "",
          observedValue: observedLine?.value ?? "",
          valueKind: observedLine?.valueKind ?? "",
          lane: pairSlot === 0 ? "legendary-affix" : observedLine?.locked ? "locked" : "advanced-attribute",
          inferredLabel: inferred[0]?.canonicalLabel ?? "",
          inferredNameId: inferred[0]?.suggestedNameId ?? "",
          inferenceConfidence: inferred[0]?.confidence ?? "",
          inferenceReasons: inferred[0]?.reasons?.join(" | ") ?? "",
          alternateCandidates: inferred.slice(1, 4).map((entry) => `${entry.canonicalLabel} (${entry.confidence})`).join(" | "),
        });
      }
    }
  }
  return rows;
}
function buildKnownStatByNameId(report) {
  const map = new Map();
  for (const entry of report.gameScan?.knownStatNameRows ?? []) {
    const compactCodes = [
      ...new Set((entry.compactCodeRows ?? []).map((row) => row.code).filter((value) => Number.isFinite(value))),
    ].sort((a, b) => a - b);
    map.set(entry.nameId, {
      nameId: entry.nameId,
      labels: entry.labels ?? [],
      fightAttr: entry.fightAttrRows?.[0] ?? null,
      compactCodes,
    });
  }
  return map;
}
function findVisibleObservation(gearEntry) {
  return KNOWN_VISIBLE_GEAR_OBSERVATIONS.find((observation) => {
    if (observation.itemId !== gearEntry.itemId) return false;
    if (observation.uniqueId && gearEntry.uniqueId && observation.uniqueId !== gearEntry.uniqueId) return false;
    return true;
  }) ?? null;
}
function buildObservedAttributeRows(report) {
  const identityByItem = new Map((report.gameScan?.itemIdentityRows ?? []).map((row) => [row.itemId, row.best]));
  const pairBridgeById = new Map((report.gameScan?.pairBridgeRows ?? []).map((row) => [row.pairId, row]));
  const statByNameId = buildKnownStatByNameId(report);
  const rows = [];
  for (const cluster of report?.clusters ?? []) {
    for (const gearEntry of cluster.gearEntries ?? []) {
      const observation = findVisibleObservation(gearEntry);
      if (!observation) continue;
      const identity = identityByItem.get(gearEntry.itemId) ?? null;
      const entryWindow = findMatchingEntryWindow(cluster, gearEntry);
      const resolvedWindow = resolveEntryWindow(entryWindow, gearEntry);
      const relatedSegments = (entryWindow?.segments ?? []).filter((segment) =>
        (segment.roles ?? []).some((role) =>
          ["display-range-candidate", "numeric-attr-candidate", "percent-tenths-candidate"].includes(role),
        ),
      );
      for (const line of observation.lines ?? []) {
        const pair = gearEntry.pairs?.[line.slot] ?? null;
        const bridge = pair ? pairBridgeById.get(pair.id) : null;
        const link = bridge?.linkRows?.[0] ?? null;
        const stat = Number.isFinite(line.nameId) ? statByNameId.get(line.nameId) : null;
        const packetLine = resolvedWindow.mappedLines?.find((candidate) => candidate.slot === line.slot) ?? null;
        rows.push({
          fileBase: cluster.fileBase ?? path.basename(cluster.file ?? ""),
          time: cluster.time ?? "",
          itemId: gearEntry.itemId,
          itemNameId: identity?.nameId ?? null,
          itemName: identity?.labels?.[0] ?? null,
          uniqueId: gearEntry.uniqueId ?? null,
          quality: gearEntry.quality ?? null,
          pairSlot: line.slot,
          pairId: pair?.id ?? null,
          pairValue: pair?.value ?? null,
          observedLabel: line.label ?? "",
          observedNameId: line.nameId ?? "",
          resolvedLabels: stat?.labels ?? [],
          fightAttrId: stat?.fightAttr?.fightAttrId ?? "",
          enumValue: stat?.fightAttr?.enumValue ?? "",
          compactCodes: stat?.compactCodes ?? [],
          observedValue: line.value ?? "",
          valueKind: line.valueKind ?? "",
          locked: Boolean(line.locked),
          packetMappedValue: packetLine?.value ?? "",
          packetMappedOffset: packetLine?.valueOffset ?? "",
          pairLinkTarget: link?.normalizedTargetId ?? link?.rawTargetId ?? "",
          pairLinkRawTarget: link?.rawTargetId ?? "",
          pairLinkKind: link?.linkKind ?? "",
          pairSmallCodes: bridge?.smallCodes ?? [],
          segmentValueCandidates: relatedSegments.map((segment) => `${segment.value}@${segment.relEnd}`),
          source: observation.source ?? "manual-observation",
        });
      }
    }
  }
  return rows;
}
function buildAttrLibRoleEvidence(report) {
  const bridgeRows = buildAttributeBridgeSummary(report);
  const items = new Map();
  for (const row of bridgeRows) {
    const key = `${row.itemId}:${row.uniqueId ?? ''}`;
    const entry = items.get(key) ?? {
      itemId: row.itemId,
      uniqueId: row.uniqueId ?? '',
      itemName: row.itemName ?? '',
      itemSlot: inferItemSlot(row.itemName ?? ''),
      basicGrowRangeId: row.basicGrowRangeId ?? '',
      attrLibIds: row.attrLibIds ?? [],
      pairsBySlot: new Map(),
    };
    entry.pairsBySlot.set(entry.pairsBySlot.size, row.pairId);
    items.set(key, entry);
  }
  let legendaryA = 0;
  let advancedB = 0;
  let lockedC = 0;
  const samples = [];
  const values = [...items.values()];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const left = values[i];
      const right = values[j];
      if (!left.itemSlot || left.itemSlot !== right.itemSlot) continue;
      if (!Number.isFinite(left.basicGrowRangeId) || left.basicGrowRangeId !== right.basicGrowRangeId) continue;
      if ((left.attrLibIds?.length ?? 0) < 3 || (right.attrLibIds?.length ?? 0) < 3) continue;
      if (left.attrLibIds[0] === right.attrLibIds[0] && left.attrLibIds[2] === right.attrLibIds[2] && left.attrLibIds[1] !== right.attrLibIds[1]) {
        if (left.pairsBySlot.get(0) && left.pairsBySlot.get(0) === right.pairsBySlot.get(0)) {
          legendaryA += 1;
          samples.push(`${left.itemId}/${right.itemId}: same A+C, slot0 pair ${left.pairsBySlot.get(0)} matched`);
        }
        if ((left.pairsBySlot.get(1) && right.pairsBySlot.get(1) && left.pairsBySlot.get(1) !== right.pairsBySlot.get(1)) || (left.pairsBySlot.get(2) && right.pairsBySlot.get(2) && left.pairsBySlot.get(2) !== right.pairsBySlot.get(2))) {
          advancedB += 1;
        }
        if ((left.pairsBySlot.get(3) ?? null) !== (right.pairsBySlot.get(3) ?? null)) {
          lockedC += 1;
        }
      }
    }
  }
  return { legendaryA, advancedB, lockedC, samples: samples.slice(0, 6) };
}
function buildAttrLibLaneMapRows(report) {
  const equipByItem = new Map((report.gameScan?.equipTableRows ?? []).map((row) => [row.itemId, row.best]));
  const attrLibById = new Map((report.gameScan?.attrLibRows ?? []).map((row) => [row.attrLibId, row]));
  const inferenceRows = buildAttributeInferenceRows(report);
  const evidence = buildAttrLibRoleEvidence(report);
  const rows = [];
  for (const row of inferenceRows) {
    const equip = equipByItem.get(row.itemId) ?? null;
    const attrLibIds = equip ? [equip.attrLibIdA, equip.attrLibIdB, equip.attrLibIdC] : [];
    let attrLibIndex = '';
    let attrLibId = null;
    let confidence = 'medium';
    const reasons = [];
    if (Number(row.pairSlot) === 0) {
      attrLibIndex = 'A';
      attrLibId = attrLibIds[0] ?? null;
      confidence = evidence.legendaryA > 0 ? 'high' : 'medium';
      reasons.push(evidence.legendaryA > 0
        ? 'shared calibrated families kept pair slot 0 when attrLibIdA matched'
        : 'slot 0 behaves like the shared legendary-affix lane');
    } else if (row.lane === 'locked' || Number(row.pairSlot) >= 3) {
      attrLibIndex = 'C';
      attrLibId = attrLibIds[2] ?? null;
      confidence = evidence.lockedC > 0 ? 'medium' : 'low';
      reasons.push(evidence.lockedC > 0
        ? 'shared calibrated families differed in the fourth/locked lane while attrLibIdC stayed constant'
        : 'remaining attrLibIdC is the best fit for the locked/special lane');
    } else {
      attrLibIndex = 'B';
      attrLibId = attrLibIds[1] ?? null;
      confidence = evidence.advancedB > 0 ? 'high' : 'medium';
      reasons.push(evidence.advancedB > 0
        ? 'shared calibrated families changed advanced lanes only when attrLibIdB changed'
        : 'mid attr-lib is the best fit for the advanced-attribute bundle');
    }
    const candidate = Number.isFinite(attrLibId) ? attrLibById.get(attrLibId)?.best ?? null : null;
    if (candidate?.compactLabels?.length) reasons.push(`candidate compact-code labels: ${candidate.compactLabels.join(' / ')}`);
    if (candidate?.nearestTables?.length) reasons.push(`nearest tables: ${candidate.nearestTables.join(', ')}`);
    rows.push({
      ...row,
      attrLibIndex,
      attrLibId: attrLibId ?? '',
      attrLibRowOffset: candidate?.rowOffset ?? '',
      attrLibScore: candidate?.score ?? '',
      attrLibNearestTables: candidate?.nearestTables ?? [],
      attrLibCompactCodes: candidate?.compactCodes ?? [],
      attrLibCompactLabels: candidate?.compactLabels ?? [],
      attrLibStatIds: candidate?.statIds ?? [],
      attrLibStatLabels: candidate?.statLabels ?? [],
      attrLibWordPreview: candidate?.wordPreview ?? '',
      attrLibConfidence: confidence,
      attrLibReasons: reasons.join(' | '),
    });
  }
  return rows;
}
function parseAttrLibWordPreviewEntries(wordPreview) {
  if (typeof wordPreview !== "string" || !wordPreview.trim()) return [];
  return wordPreview
    .split('|')
    .map((chunk) => chunk.trim())
    .map((chunk) => {
      const match = chunk.match(/^([+-]?\d+):(\d+)$/);
      if (!match) return null;
      return {
        rel: Number.parseInt(match[1], 10),
        value: Number.parseInt(match[2], 10),
      };
    })
    .filter(Boolean);
}
function buildCanonicalNameIdLookup(report) {
  const lookup = new Map();
  for (const row of buildObservedAttributeRows(report)) {
    const canonical = canonicalizeAttributeLabel(row.observedLabel);
    if (canonical && Number.isFinite(row.observedNameId)) lookup.set(canonical, row.observedNameId);
  }
  for (const entry of report.gameScan?.knownStatNameRows ?? []) {
    for (const label of entry.labels ?? []) {
      const canonical = canonicalizeAttributeLabel(label);
      if (canonical && Number.isFinite(entry.nameId) && !lookup.has(canonical)) lookup.set(canonical, entry.nameId);
    }
  }
  return lookup;
}
function buildDirectValueCalRowLookup(report) {
  return new Map((report.gameScan?.directAttrLibValueCalRows ?? []).map((entry) => [entry.attrLibId, entry.rows ?? []]));
}
function buildDirectGrowJoinLookup(report) {
  const lookup = new Map();
  for (const row of report.gameScan?.basicGrowJoinRows ?? []) {
    for (const attrLibId of row.attrLibOverlap ?? []) {
      if (!Number.isFinite(attrLibId)) continue;
      const rows = lookup.get(attrLibId) ?? [];
      rows.push(row);
      lookup.set(attrLibId, rows);
    }
  }
  return lookup;
}
function summarizeDirectValueCalRows(rows, limit = 3) {
  return (rows ?? [])
    .slice(0, limit)
    .map((row) => {
      const parts = [
        row.mode,
        `@${row.rowOffset}`,
        `targets=${(row.targetValues ?? []).join('|') || '-'}`,
      ];
      if ((row.targetGroups ?? []).length) parts.push(`groups=${row.targetGroups.join('&')}`);
      if ((row.directAttrCodes ?? []).length) parts.push(`attr=${row.directAttrCodes.join('|')}`);
      if ((row.basicGrowRangeIds ?? []).length) parts.push(`grow=${row.basicGrowRangeIds.join('|')}`);
      if ((row.floatValues ?? []).length) parts.push(`float=${row.floatValues.join('|')}`);
      return parts.join(' ');
    })
    .join(' || ');
}
function uniqueDirectValueCalValues(rows, key) {
  return [...new Set((rows ?? []).flatMap((row) => row[key] ?? []).filter((value) => Number.isFinite(value)))]
    .sort((a, b) => a - b);
}
function uniqueDirectValueCalStrings(rows, key) {
  return dedupeStrings((rows ?? []).flatMap((row) => row[key] ?? []));
}
function buildBasicAttrGrowRowLookup(report) {
  const lookup = new Map();
  for (const row of report.gameScan?.basicAttrGrowRows ?? []) {
    lookup.set(`${row.basicGrowRangeId}|${row.growSlot}`, row);
  }
  return lookup;
}
function buildBasicAttrValueRowLookup(report) {
  const lookup = new Map();
  for (const row of report.gameScan?.basicAttrValueRows ?? []) {
    if (!row.proofKey) continue;
    const rows = lookup.get(row.proofKey) ?? [];
    rows.push(row);
    lookup.set(row.proofKey, rows);
  }
  return lookup;
}
function basicAttrGrowSlotForEvaluation(row) {
  const pairSlot = Number.isFinite(row?.pairSlot) ? row.pairSlot : Number.parseInt(row?.pairSlot, 10);
  if (row?.lane === 'legendary-affix' || pairSlot === 0) return 0;
  if (row?.lane === 'advanced-attribute' || pairSlot === 1 || pairSlot === 2) return 1;
  if (row?.lane === 'locked' || pairSlot >= 3) return 2;
  return '';
}
function parseRelFloatEntry(entry) {
  if (typeof entry !== 'string' || !entry.includes(':')) return null;
  const [relText, valueText] = entry.split(':');
  const rel = Number.parseInt(relText, 10);
  const value = Number.parseFloat(valueText);
  if (!Number.isFinite(rel) || !Number.isFinite(value)) return null;
  return { rel, value };
}
function roundProofValue(value) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(Math.abs(value) < 10 ? 4 : 2));
}
function collectDirectValuePredictionCandidates(directRows) {
  const candidates = [];
  for (const row of directRows ?? []) {
    for (const entry of row.floatValues ?? []) {
      const parsed = parseRelFloatEntry(entry);
      if (!parsed) continue;
      for (const proof of STAT_VALUE_PROOF_MULTIPLIERS) {
        const predictedValue = roundProofValue(parsed.value * proof.multiplier);
        candidates.push({
          predictedValue,
          baseValue: parsed.value,
          multiplier: proof.multiplier,
          formula: `${parsed.value} ${proof.key}`,
          source: `${row.mode}@${row.rowOffset}${parsed.rel >= 0 ? '+' : ''}${parsed.rel}`,
        });
      }
    }
  }
  return dedupeBy(candidates, (candidate) =>
    `${candidate.predictedValue}:${candidate.formula}:${candidate.source}`,
  ).sort((a, b) => a.predictedValue - b.predictedValue || a.source.localeCompare(b.source));
}
function observedValueTolerance(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) < 10 ? 0.05 : 0.75;
}
function selectBestPredictionMatch(observedValue, candidates) {
  if (!Number.isFinite(observedValue)) return null;
  const tolerance = observedValueTolerance(observedValue);
  return (candidates ?? [])
    .map((candidate) => ({
      ...candidate,
      diff: Number(Math.abs(candidate.predictedValue - observedValue).toFixed(4)),
    }))
    .filter((candidate) => candidate.diff <= tolerance)
    .sort((a, b) => a.diff - b.diff || a.predictedValue - b.predictedValue)[0] ?? null;
}
function selectBestBasicAttrValueMatch(observedValue, candidates) {
  if (!Number.isFinite(observedValue)) return null;
  return (candidates ?? [])
    .map((candidate) => ({
      ...candidate,
      diff: Number(Math.abs(Number(candidate.predictedValue) - observedValue).toFixed(4)),
    }))
    .filter((candidate) => candidate.diff <= observedValueTolerance(observedValue))
    .sort((a, b) => b.score - a.score || a.diff - b.diff || a.valueOffset - b.valueOffset)[0] ?? null;
}
function formatPredictionCandidates(candidates, limit = 8) {
  return (candidates ?? [])
    .slice(0, limit)
    .map((candidate) => `${candidate.formula}=${candidate.predictedValue} ${candidate.source}`)
    .join(' | ');
}
function summarizeBasicAttrGrowRow(row) {
  if (!row) return '';
  return `${row.role} @${row.recordOffset} slot=${row.growSlot} growRow=${row.basicAttrGrowId} values=${row.attrGrowValueA}|${row.attrGrowValueB}|${row.attrGrowValueC}|${row.attrGrowValueD}`;
}
function summarizeBasicAttrValueRows(rows, limit = 3) {
  return (rows ?? [])
    .slice(0, limit)
    .map((row) => `@${row.valueOffset} score=${row.score} words=${row.sequenceWordCount} range=${row.sequenceMinValue}-${row.sequenceMaxValue}`)
    .join(' || ');
}
function buildGearStatProofRows(report) {
  const directRowsByAttrLib = buildDirectValueCalRowLookup(report);
  const basicAttrGrowByRangeSlot = buildBasicAttrGrowRowLookup(report);
  const basicAttrValueRowsByProofKey = buildBasicAttrValueRowLookup(report);
  const rows = [];
  for (const evaluation of buildAttrLibEvaluationRows(report)) {
    const attrLibId = Number.isFinite(evaluation.attrLibId)
      ? evaluation.attrLibId
      : Number.parseInt(evaluation.attrLibId, 10);
    const basicGrowRangeId = Number.isFinite(evaluation.basicGrowRangeId)
      ? evaluation.basicGrowRangeId
      : Number.parseInt(evaluation.basicGrowRangeId, 10);
    const growSlot = basicAttrGrowSlotForEvaluation(evaluation);
    const basicAttrGrow = Number.isFinite(basicGrowRangeId) && Number.isFinite(growSlot)
      ? basicAttrGrowByRangeSlot.get(`${basicGrowRangeId}|${growSlot}`) ?? null
      : null;
    const directRows = Number.isFinite(attrLibId) ? directRowsByAttrLib.get(attrLibId) ?? [] : [];
    const directTargets = uniqueDirectValueCalValues(directRows, 'targetValues');
    const directTargetCodes = uniqueDirectValueCalValues(directRows, 'directTargetCodes');
    const directCandidates = collectDirectValuePredictionCandidates(directRows);
    const observedValue = Number.isFinite(evaluation.observedValue)
      ? evaluation.observedValue
      : Number.isFinite(Number(evaluation.observedValue))
        ? Number(evaluation.observedValue)
        : null;
    const basicAttrValueRows = basicAttrValueRowsByProofKey.get(
      basicAttrValueProofKey(evaluation.itemId, evaluation.pairSlot, evaluation.finalLabel, observedValue),
    ) ?? [];
    const predictionMatch = selectBestPredictionMatch(observedValue, directCandidates);
    const basicAttrValueMatch = selectBestBasicAttrValueMatch(observedValue, basicAttrValueRows);
    const hasDirectEvidence = directTargets.length > 0 || directTargetCodes.length > 0 || directRows.length > 0;
    const proofStatus = basicAttrValueMatch
      ? 'basic-attr-value-match'
      : predictionMatch
        ? 'value-match'
        : hasDirectEvidence && basicAttrGrow
        ? 'structural-match'
        : basicAttrGrow
          ? 'grow-slot-only'
          : hasDirectEvidence
            ? 'valuecal-only'
            : 'unresolved';
    const proofConfidence = basicAttrValueMatch || predictionMatch
      ? 'high'
      : hasDirectEvidence && basicAttrGrow
        ? 'high'
        : basicAttrGrow && evaluation.finalLabel
          ? 'medium'
          : hasDirectEvidence
            ? 'medium'
            : 'low';
    rows.push({
      fileBase: evaluation.fileBase,
      time: evaluation.time,
      itemId: evaluation.itemId,
      itemName: evaluation.itemName,
      wearingLevel: evaluation.wearingLevel,
      basicGrowRangeId: evaluation.basicGrowRangeId,
      pairSlot: evaluation.pairSlot,
      pairId: evaluation.pairId,
      lane: evaluation.lane,
      attrLibIndex: evaluation.attrLibIndex,
      attrLibId: evaluation.attrLibId,
      finalLabel: evaluation.finalLabel,
      observedValue: evaluation.observedValue,
      basicAttrGrowSlot: growSlot,
      basicAttrGrowRole: basicAttrGrow?.role ?? '',
      basicAttrGrowRowId: basicAttrGrow?.basicAttrGrowId ?? '',
      basicAttrGrowOffset: basicAttrGrow?.recordOffset ?? '',
      attrGrowValueA: basicAttrGrow?.attrGrowValueA ?? '',
      attrGrowValueB: basicAttrGrow?.attrGrowValueB ?? '',
      attrGrowValueC: basicAttrGrow?.attrGrowValueC ?? '',
      attrGrowValueD: basicAttrGrow?.attrGrowValueD ?? '',
      attrGrowBandA: basicAttrGrow?.valueBandA ?? '',
      attrGrowBandB: basicAttrGrow?.valueBandB ?? '',
      basicAttrGrowEvidence: summarizeBasicAttrGrowRow(basicAttrGrow),
      basicAttrValueEvidence: summarizeBasicAttrValueRows(basicAttrValueRows),
      basicAttrValueOffset: basicAttrValueMatch?.valueOffset ?? '',
      basicAttrValueScore: basicAttrValueMatch?.score ?? '',
      basicAttrValuePreview: basicAttrValueMatch?.valuePreview ?? '',
      directValueCalTargets: directTargets.join('|'),
      directTargetCodes: directTargetCodes.join('|'),
      directValueCandidates: formatPredictionCandidates(directCandidates),
      predictedValue: basicAttrValueMatch?.predictedValue ?? predictionMatch?.predictedValue ?? '',
      predictionFormula: basicAttrValueMatch?.predictionFormula ?? predictionMatch?.formula ?? '',
      predictionSource: basicAttrValueMatch?.predictionSource ?? predictionMatch?.source ?? '',
      predictionDiff: basicAttrValueMatch?.diff ?? predictionMatch?.diff ?? '',
      proofStatus,
      proofConfidence,
      evaluatorConfidence: evaluation.evaluatorConfidence,
      evaluatorReasons: evaluation.evaluatorReasons,
    });
  }
  return rows;
}
function buildAttrLibFieldRows(report) {
  const compactCodeLookup = buildCompactCodeLabelLookup(report.gameScan);
  const directRowsByAttrLib = buildDirectValueCalRowLookup(report);
  const growJoinRowsByAttrLib = buildDirectGrowJoinLookup(report);
  const rows = [];
  for (const row of report.gameScan?.attrLibRows ?? []) {
    const candidate = row.best ?? null;
    if (!candidate) continue;
    const directRows = directRowsByAttrLib.get(row.attrLibId) ?? [];
    const growJoinRows = growJoinRowsByAttrLib.get(row.attrLibId) ?? [];
    const directBasicGrowRangeIds = [...new Set([
      ...uniqueDirectValueCalValues(directRows, 'basicGrowRangeIds'),
      ...growJoinRows.map((growJoin) => growJoin.basicGrowRangeId).filter((value) => Number.isFinite(value)),
    ])].sort((a, b) => a - b);
    const previewEntries = parseAttrLibWordPreviewEntries(candidate.wordPreview);
    const rawCompactCodes = [...new Set([
      ...(candidate.compactCodes ?? []).filter((value) => Number.isFinite(value)),
      ...previewEntries.map((entry) => entry.value).filter((value) => compactCodeLookup.has(value)),
    ])].sort((a, b) => a - b);
    const resolvedCompactLabels = dedupeStrings(rawCompactCodes
      .flatMap((code) => compactCodeLookup.get(code) ?? [])
      .map((label) => canonicalizeAttributeLabel(label))
      .filter(Boolean));
    const siblingAttrLibRefs = [...new Set(previewEntries
      .map((entry) => entry.value)
      .filter((value) => Number.isFinite(value) && value >= row.attrLibId - 8 && value <= row.attrLibId + 8 && value !== row.attrLibId))].sort((a, b) => a - b);
    const likelyValueCalWords = [...new Set(previewEntries
      .map((entry) => entry.value)
      .filter((value) => Number.isFinite(value) && value > 32 && value <= 20000)
      .filter((value) => !rawCompactCodes.includes(value))
      .filter((value) => value !== row.attrLibId && !siblingAttrLibRefs.includes(value)))].sort((a, b) => a - b);
    const parserMode = rawCompactCodes.length && likelyValueCalWords.length
      ? 'compact+valuecal'
      : rawCompactCodes.length
        ? 'compact-only'
        : likelyValueCalWords.length
          ? 'valuecal-only'
          : 'preview-only';
    const hasEquipAttrTables = (candidate.nearestTables ?? []).some((term) => term === 'EquipAttrLibTable.proto' || term === 'EquipAttrLibTableBase');
    const parserConfidence = hasEquipAttrTables && rawCompactCodes.length
      ? 'high'
      : rawCompactCodes.length || likelyValueCalWords.length
        ? 'medium'
        : 'low';
    rows.push({
      attrLibId: row.attrLibId,
      rowOffset: candidate.rowOffset ?? '',
      score: candidate.score ?? '',
      parserMode,
      parserConfidence,
      nearestTables: candidate.nearestTables ?? [],
      rawCompactCodes,
      resolvedCompactLabels,
      likelyValueCalWords,
      siblingAttrLibRefs,
      attrRangeCount: candidate.attrRangeCount ?? '',
      directValueCalModes: dedupeStrings(directRows.map((direct) => direct.mode)),
      directValueCalTargetGroups: dedupeStrings(directRows.flatMap((direct) => direct.targetGroups ?? [])),
      directValueCalTargets: uniqueDirectValueCalValues(directRows, 'targetValues'),
      directTargetCodes: uniqueDirectValueCalValues(directRows, 'directTargetCodes'),
      directAttrCodes: uniqueDirectValueCalValues(directRows, 'directAttrCodes'),
      directAttrLabels: dedupeStrings(directRows.flatMap((direct) => direct.directAttrLabels ?? [])),
      directBasicGrowRangeIds,
      directFloatValues: uniqueDirectValueCalStrings(directRows.slice(0, 3), 'floatValues'),
      directFloatTimes107: uniqueDirectValueCalStrings(directRows.slice(0, 3), 'floatTimes107'),
      directValueCalEvidence: summarizeDirectValueCalRows(directRows),
      wordPreview: candidate.wordPreview ?? '',
    });
  }
  return rows.sort((a, b) => a.attrLibId - b.attrLibId);
}
function buildAttrLibEvaluationRows(report) {
  const fieldByAttrLib = new Map(buildAttrLibFieldRows(report).map((row) => [row.attrLibId, row]));
  const directRowsByAttrLib = buildDirectValueCalRowLookup(report);
  const growJoinRowsByAttrLib = buildDirectGrowJoinLookup(report);
  const observedByKey = new Map(buildObservedAttributeRows(report).map((row) => [`${row.fileBase}|${row.itemId}|${row.pairId}|${row.pairSlot}`, row]));
  const nameIdByCanonical = buildCanonicalNameIdLookup(report);
  const rows = [];
  for (const lane of buildAttrLibLaneMapRows(report)) {
    const observed = observedByKey.get(`${lane.fileBase}|${lane.itemId}|${lane.pairId}|${lane.pairSlot}`) ?? null;
    const attrLibId = Number.isFinite(lane.attrLibId) ? lane.attrLibId : Number.parseInt(lane.attrLibId, 10);
    const field = Number.isFinite(attrLibId) ? fieldByAttrLib.get(attrLibId) ?? null : null;
    const directRows = Number.isFinite(attrLibId) ? directRowsByAttrLib.get(attrLibId) ?? [] : [];
    const growJoinRows = Number.isFinite(attrLibId) ? growJoinRowsByAttrLib.get(attrLibId) ?? [] : [];
    const directTargets = uniqueDirectValueCalValues(directRows, 'targetValues');
    const directTargetCodes = uniqueDirectValueCalValues(directRows, 'directTargetCodes');
    const directGrowIds = [...new Set([
      ...uniqueDirectValueCalValues(directRows, 'basicGrowRangeIds'),
      ...growJoinRows.map((growJoin) => growJoin.basicGrowRangeId).filter((value) => Number.isFinite(value)),
    ])].sort((a, b) => a - b);
    const finalLabel = canonicalizeAttributeLabel(lane.observedLabel || lane.inferredLabel || '');
    const finalNameId = finalLabel ? (nameIdByCanonical.get(finalLabel) ?? '') : '';
    const observedValue = Number.isFinite(observed?.observedValue)
      ? observed.observedValue
      : Number.isFinite(Number(observed?.observedValue))
        ? Number(observed.observedValue)
        : '';
    const legendaryMatches = finalLabel && Number.isFinite(observedValue) && lane.lane === 'legendary-affix'
      ? getLegendaryValueCandidates(lane.gearGroup, Number(lane.wearingLevel), observedValue)
      : [];
    const legendaryLabels = dedupeStrings(legendaryMatches.map((entry) => canonicalizeAttributeLabel(entry.label)).filter(Boolean));
    const supportReasons = [];
    if (finalLabel && (field?.resolvedCompactLabels ?? []).includes(finalLabel)) supportReasons.push('attr compact-code match');
    if (finalLabel && legendaryLabels.includes(finalLabel)) supportReasons.push('legendary value-table match');
    if ((field?.likelyValueCalWords?.length ?? 0) > 0) supportReasons.push(`ValueCal candidates ${field.likelyValueCalWords.join('|')}`);
    if ((field?.siblingAttrLibRefs?.length ?? 0) > 0) supportReasons.push(`sibling attr-lib refs ${field.siblingAttrLibRefs.join('|')}`);
    if (directTargetCodes.length) supportReasons.push(`direct attr-array target codes ${directTargetCodes.join('|')}`);
    if (directTargets.length) supportReasons.push(`direct ValueCal targets ${directTargets.join('|')}`);
    if (directGrowIds.includes(Number(lane.basicGrowRangeId))) supportReasons.push(`direct grow join ${lane.basicGrowRangeId}`);
    const hasDirectDecodeSupport = directTargetCodes.length > 0 || directTargets.length > 0;
    const evaluatorConfidence = supportReasons.some((reason) => reason.includes('match'))
      ? 'high'
      : hasDirectDecodeSupport
        ? 'high'
      : finalLabel && field?.parserConfidence === 'high'
        ? 'medium'
        : finalLabel
          ? 'medium'
          : 'low';
    rows.push({
      fileBase: lane.fileBase,
      time: lane.time,
      itemId: lane.itemId,
      itemName: lane.itemName,
      itemSlot: lane.itemSlot,
      gearGroup: lane.gearGroup,
      wearingLevel: lane.wearingLevel,
      basicGrowRangeId: lane.basicGrowRangeId,
      pairSlot: lane.pairSlot,
      pairId: lane.pairId,
      lane: lane.lane,
      attrLibIndex: lane.attrLibIndex,
      attrLibId: attrLibId ?? '',
      observedLabel: lane.observedLabel ?? '',
      inferredLabel: lane.inferredLabel ?? '',
      finalLabel,
      finalNameId,
      observedValue,
      parserMode: field?.parserMode ?? '',
      parserConfidence: field?.parserConfidence ?? '',
      parserCompactCodes: (field?.rawCompactCodes ?? []).join('|'),
      parserResolvedLabels: (field?.resolvedCompactLabels ?? []).join(' | '),
      parserValueCalWords: (field?.likelyValueCalWords ?? []).join('|'),
      parserSiblingAttrLibRefs: (field?.siblingAttrLibRefs ?? []).join('|'),
      parserNearestTables: (field?.nearestTables ?? []).join(' | '),
      directValueCalEvidence: summarizeDirectValueCalRows(directRows),
      directValueCalTargets: directTargets.join('|'),
      directTargetCodes: directTargetCodes.join('|'),
      directBasicGrowRangeIds: directGrowIds.join('|'),
      directFloatValues: uniqueDirectValueCalStrings(directRows.slice(0, 3), 'floatValues').join('|'),
      directFloatTimes107: uniqueDirectValueCalStrings(directRows.slice(0, 3), 'floatTimes107').join('|'),
      valueTableMatches: legendaryLabels.join(' | '),
      evaluatorConfidence,
      evaluatorReasons: supportReasons.join(' | '),
      wordPreview: field?.wordPreview ?? '',
    });
  }
  return rows;
}

function writeAttrLibExports(report, options = {}) {
  const exportDir = options.exportDir ?? DEFAULT_EXPORT_DIR;
  const candidateCsvOut = resolveExportPath(options.attrLibCandidatesCsvOut ?? 'gear-attrlib-candidates.csv', exportDir);
  const laneCsvOut = resolveExportPath(options.attrLibLaneCsvOut ?? 'gear-attrlib-lane-map.csv', exportDir);
  const fieldCsvOut = resolveExportPath('gear-attrlib-fields.csv', exportDir);
  const evaluationCsvOut = resolveExportPath('gear-attrlib-evaluation.csv', exportDir);
  const valueCalCsvOut = resolveExportPath('gear-attrlib-valuecal.csv', exportDir);
  const growJoinCsvOut = resolveExportPath('gear-basic-grow-joins.csv', exportDir);
  const basicGrowDecodedCsvOut = resolveExportPath('gear-basic-grow-decoded.csv', exportDir);
  const basicAttrValuesCsvOut = resolveExportPath('gear-basic-attr-values.csv', exportDir);
  const statProofCsvOut = resolveExportPath('gear-stat-proof.csv', exportDir);
  const candidateRows = [];
  for (const row of report.gameScan?.attrLibRows ?? []) {
    for (const candidate of row.candidates ?? []) {
      candidateRows.push({
        attrLibId: row.attrLibId,
        hitCount: row.hitCount ?? 0,
        rowOffset: candidate.rowOffset,
        hitOffset: candidate.hitOffset,
        relOffset: candidate.relOffset,
        score: candidate.score,
        nearestTables: (candidate.nearestTables ?? []).join(' | '),
        compactCodes: (candidate.compactCodes ?? []).join('|'),
        compactLabels: (candidate.compactLabels ?? []).join(' | '),
        statIds: (candidate.statIds ?? []).join('|'),
        statLabels: (candidate.statLabels ?? []).join(' | '),
        attrRangeCount: candidate.attrRangeCount,
        wordPreview: candidate.wordPreview,
      });
    }
  }
  const laneRows = buildAttrLibLaneMapRows(report);
  const fieldRows = buildAttrLibFieldRows(report);
  const evaluationRows = buildAttrLibEvaluationRows(report);
  const valueCalRows = [];
  for (const entry of report.gameScan?.directAttrLibValueCalRows ?? []) {
    for (const row of entry.rows ?? []) {
      valueCalRows.push(row);
    }
  }
  const growJoinRows = report.gameScan?.basicGrowJoinRows ?? [];
  const basicGrowDecodedRows = report.gameScan?.basicAttrGrowRows ?? [];
  const basicAttrValueRows = report.gameScan?.basicAttrValueRows ?? [];
  const statProofRows = buildGearStatProofRows(report);
  if (candidateRows.length) {
    writeCsvFile(candidateCsvOut, [
      'attrLibId', 'hitCount', 'rowOffset', 'hitOffset', 'relOffset', 'score', 'nearestTables',
      'compactCodes', 'compactLabels', 'statIds', 'statLabels', 'attrRangeCount', 'wordPreview',
    ], candidateRows.map((row) => [
      row.attrLibId, row.hitCount, row.rowOffset, row.hitOffset, row.relOffset, row.score, row.nearestTables,
      row.compactCodes, row.compactLabels, row.statIds, row.statLabels, row.attrRangeCount, row.wordPreview,
    ]));
  }
  if (laneRows.length) {
    writeCsvFile(laneCsvOut, [
      'fileBase','time','itemId','itemName','itemSlot','gearGroup','wearingLevel','basicGrowRangeId','pairSlot','pairId','lane','observedLabel','inferredLabel','attrLibIndex','attrLibId','attrLibRowOffset','attrLibScore','attrLibNearestTables','attrLibCompactCodes','attrLibCompactLabels','attrLibStatIds','attrLibStatLabels','attrLibConfidence','attrLibReasons'
    ], laneRows.map((row) => [
      row.fileBase,row.time,row.itemId,row.itemName,row.itemSlot,row.gearGroup,row.wearingLevel,row.basicGrowRangeId,row.pairSlot,row.pairId,row.lane,row.observedLabel,row.inferredLabel,row.attrLibIndex,row.attrLibId,row.attrLibRowOffset,row.attrLibScore,(row.attrLibNearestTables ?? []).join(' | '),(row.attrLibCompactCodes ?? []).join('|'),(row.attrLibCompactLabels ?? []).join(' | '),(row.attrLibStatIds ?? []).join('|'),(row.attrLibStatLabels ?? []).join(' | '),row.attrLibConfidence,row.attrLibReasons
    ]));
  }
  if (fieldRows.length) {
    writeCsvFile(fieldCsvOut, [
      'attrLibId','rowOffset','score','parserMode','parserConfidence','nearestTables','rawCompactCodes','resolvedCompactLabels','likelyValueCalWords','siblingAttrLibRefs','attrRangeCount','directValueCalModes','directValueCalTargetGroups','directValueCalTargets','directTargetCodes','directAttrCodes','directAttrLabels','directBasicGrowRangeIds','directFloatValues','directFloatTimes107','directValueCalEvidence','wordPreview'
    ], fieldRows.map((row) => [
      row.attrLibId,row.rowOffset,row.score,row.parserMode,row.parserConfidence,(row.nearestTables ?? []).join(' | '),(row.rawCompactCodes ?? []).join('|'),(row.resolvedCompactLabels ?? []).join(' | '),(row.likelyValueCalWords ?? []).join('|'),(row.siblingAttrLibRefs ?? []).join('|'),row.attrRangeCount,(row.directValueCalModes ?? []).join('|'),(row.directValueCalTargetGroups ?? []).join('|'),(row.directValueCalTargets ?? []).join('|'),(row.directTargetCodes ?? []).join('|'),(row.directAttrCodes ?? []).join('|'),(row.directAttrLabels ?? []).join(' | '),(row.directBasicGrowRangeIds ?? []).join('|'),(row.directFloatValues ?? []).join('|'),(row.directFloatTimes107 ?? []).join('|'),row.directValueCalEvidence,row.wordPreview
    ]));
  }
  if (evaluationRows.length) {
    writeCsvFile(evaluationCsvOut, [
      'fileBase','time','itemId','itemName','itemSlot','gearGroup','wearingLevel','basicGrowRangeId','pairSlot','pairId','lane','attrLibIndex','attrLibId','observedLabel','inferredLabel','finalLabel','finalNameId','observedValue','parserMode','parserConfidence','parserCompactCodes','parserResolvedLabels','parserValueCalWords','parserSiblingAttrLibRefs','parserNearestTables','directValueCalEvidence','directValueCalTargets','directTargetCodes','directBasicGrowRangeIds','directFloatValues','directFloatTimes107','valueTableMatches','evaluatorConfidence','evaluatorReasons','wordPreview'
    ], evaluationRows.map((row) => [
      row.fileBase,row.time,row.itemId,row.itemName,row.itemSlot,row.gearGroup,row.wearingLevel,row.basicGrowRangeId,row.pairSlot,row.pairId,row.lane,row.attrLibIndex,row.attrLibId,row.observedLabel,row.inferredLabel,row.finalLabel,row.finalNameId,row.observedValue,row.parserMode,row.parserConfidence,row.parserCompactCodes,row.parserResolvedLabels,row.parserValueCalWords,row.parserSiblingAttrLibRefs,row.parserNearestTables,row.directValueCalEvidence,row.directValueCalTargets,row.directTargetCodes,row.directBasicGrowRangeIds,row.directFloatValues,row.directFloatTimes107,row.valueTableMatches,row.evaluatorConfidence,row.evaluatorReasons,row.wordPreview
    ]));
  }
  if (valueCalRows.length) {
    writeCsvFile(valueCalCsvOut, [
      'attrLibId','mode','score','rowOffset','hitOffset','targetGroups','targetValues','directTargetCodes','directAttrCodes','directAttrLabels','basicGrowRangeIds','floatValues','floatTimes107','wordPreview'
    ], valueCalRows.map((row) => [
      row.attrLibId,row.mode,row.score,row.rowOffset,row.hitOffset,(row.targetGroups ?? []).join('|'),(row.targetValues ?? []).join('|'),(row.directTargetCodes ?? []).join('|'),(row.directAttrCodes ?? []).join('|'),(row.directAttrLabels ?? []).join(' | '),(row.basicGrowRangeIds ?? []).join('|'),(row.floatValues ?? []).join('|'),(row.floatTimes107 ?? []).join('|'),row.wordPreview
    ]));
  }
  if (growJoinRows.length) {
    writeCsvFile(growJoinCsvOut, [
      'basicGrowRangeId','sourceKind','score','rowOffset','hitOffset','itemId','itemName','wearingLevel','attrLibIds','attrLibOverlap','wordPreview'
    ], growJoinRows.map((row) => [
      row.basicGrowRangeId,row.sourceKind,row.score,row.rowOffset,row.hitOffset,row.itemId,row.itemName,row.wearingLevel,(row.attrLibIds ?? []).join('|'),(row.attrLibOverlap ?? []).join('|'),row.wordPreview
    ]));
  }
  if (basicGrowDecodedRows.length) {
    writeCsvFile(basicGrowDecodedCsvOut, [
      'basicGrowRangeId','growSlot','role','basicAttrGrowId','recordOffset','score','runOffset','runEndOffset','runRecordCount','attrGrowValueA','attrGrowValueB','attrGrowValueC','attrGrowValueD','valueBandA','valueBandB','runRangeSlots','wordPreview'
    ], basicGrowDecodedRows.map((row) => [
      row.basicGrowRangeId,row.growSlot,row.role,row.basicAttrGrowId,row.recordOffset,row.score,row.runOffset,row.runEndOffset,row.runRecordCount,row.attrGrowValueA,row.attrGrowValueB,row.attrGrowValueC,row.attrGrowValueD,row.valueBandA,row.valueBandB,(row.runRangeSlots ?? []).join('|'),row.wordPreview
    ]));
  }
  if (basicAttrValueRows.length) {
    writeCsvFile(basicAttrValuesCsvOut, [
      'proofKey','itemId','pairSlot','observedLabel','observedValue','valueKind','wearingLevel','basicGrowRangeId','basicAttrGrowSlot','basicAttrGrowId','score','valueOffset','sequenceStartOffset','sequenceEndOffset','sequenceWordCount','exactValueCount','nearbyTargetCount','monotonicPairs','sequenceMinValue','sequenceMaxValue','predictedValue','predictionFormula','predictionSource','valuePreview'
    ], basicAttrValueRows.map((row) => [
      row.proofKey,row.itemId,row.pairSlot,row.observedLabel,row.observedValue,row.valueKind,row.wearingLevel,row.basicGrowRangeId,row.basicAttrGrowSlot,row.basicAttrGrowId,row.score,row.valueOffset,row.sequenceStartOffset,row.sequenceEndOffset,row.sequenceWordCount,row.exactValueCount,row.nearbyTargetCount,row.monotonicPairs,row.sequenceMinValue,row.sequenceMaxValue,row.predictedValue,row.predictionFormula,row.predictionSource,row.valuePreview
    ]));
  }
  if (statProofRows.length) {
    writeCsvFile(statProofCsvOut, [
      'fileBase','time','itemId','itemName','wearingLevel','basicGrowRangeId','pairSlot','pairId','lane','attrLibIndex','attrLibId','finalLabel','observedValue','basicAttrGrowSlot','basicAttrGrowRole','basicAttrGrowRowId','basicAttrGrowOffset','attrGrowValueA','attrGrowValueB','attrGrowValueC','attrGrowValueD','attrGrowBandA','attrGrowBandB','basicAttrGrowEvidence','basicAttrValueEvidence','basicAttrValueOffset','basicAttrValueScore','basicAttrValuePreview','directValueCalTargets','directTargetCodes','directValueCandidates','predictedValue','predictionFormula','predictionSource','predictionDiff','proofStatus','proofConfidence','evaluatorConfidence','evaluatorReasons'
    ], statProofRows.map((row) => [
      row.fileBase,row.time,row.itemId,row.itemName,row.wearingLevel,row.basicGrowRangeId,row.pairSlot,row.pairId,row.lane,row.attrLibIndex,row.attrLibId,row.finalLabel,row.observedValue,row.basicAttrGrowSlot,row.basicAttrGrowRole,row.basicAttrGrowRowId,row.basicAttrGrowOffset,row.attrGrowValueA,row.attrGrowValueB,row.attrGrowValueC,row.attrGrowValueD,row.attrGrowBandA,row.attrGrowBandB,row.basicAttrGrowEvidence,row.basicAttrValueEvidence,row.basicAttrValueOffset,row.basicAttrValueScore,row.basicAttrValuePreview,row.directValueCalTargets,row.directTargetCodes,row.directValueCandidates,row.predictedValue,row.predictionFormula,row.predictionSource,row.predictionDiff,row.proofStatus,row.proofConfidence,row.evaluatorConfidence,row.evaluatorReasons
    ]));
  }
  return {
    candidateCsvOut: candidateRows.length ? candidateCsvOut : null,
    laneCsvOut: laneRows.length ? laneCsvOut : null,
    fieldCsvOut: fieldRows.length ? fieldCsvOut : null,
    evaluationCsvOut: evaluationRows.length ? evaluationCsvOut : null,
    valueCalCsvOut: valueCalRows.length ? valueCalCsvOut : null,
    growJoinCsvOut: growJoinRows.length ? growJoinCsvOut : null,
    basicGrowDecodedCsvOut: basicGrowDecodedRows.length ? basicGrowDecodedCsvOut : null,
    basicAttrValuesCsvOut: basicAttrValueRows.length ? basicAttrValuesCsvOut : null,
    statProofCsvOut: statProofRows.length ? statProofCsvOut : null,
    candidateRowCount: candidateRows.length,
    laneRowCount: laneRows.length,
    fieldRowCount: fieldRows.length,
    evaluationRowCount: evaluationRows.length,
    valueCalRowCount: valueCalRows.length,
    growJoinRowCount: growJoinRows.length,
    basicGrowDecodedRowCount: basicGrowDecodedRows.length,
    basicAttrValueRowCount: basicAttrValueRows.length,
    statProofRowCount: statProofRows.length,
  };
}

function writeAttributeBridgeExports(report, options = {}) {
  const exportDir = options.exportDir ?? DEFAULT_EXPORT_DIR;
  const bridgeRows = buildAttributeBridgeSummary(report);
  const statRows = flattenKnownStatNameRows(report);
  const observedRows = buildObservedAttributeRows(report);
  const inferenceRows = buildAttributeInferenceRows(report);
  const bridgeCsvOut = resolveExportPath(options.attributeBridgeCsvOut ?? "gear-attribute-bridge.csv", exportDir);
  const statCsvOut = resolveExportPath(options.statNameCsvOut ?? "gear-stat-name-catalog.csv", exportDir);
  const observedCsvOut = resolveExportPath(options.observedAttributeCsvOut ?? "gear-observed-attributes.csv", exportDir);
  const inferenceCsvOut = resolveExportPath(options.attributeInferenceCsvOut ?? "gear-attribute-inference.csv", exportDir);
  if (bridgeRows.length) {
    writeCsvFile(bridgeCsvOut, [
      "fileBase",
      "time",
      "itemId",
      "itemNameId",
      "itemName",
      "quality",
      "uniqueId",
      "equipRowOffset",
      "wearingLevel",
      "basicGrowRangeId",
      "attrLibIds",
      "pairId",
      "pairValue",
      "pairLinkTarget",
      "pairLinkRawTarget",
      "pairLinkKind",
      "pairLinkLabels",
      "pairSmallCodes",
      "pairSmallCodeOffsets",
      "segmentValueCandidates",
    ], bridgeRows.map((row) => [
      row.fileBase,
      row.time,
      row.itemId,
      row.itemNameId,
      row.itemName,
      row.quality,
      row.uniqueId,
      row.equipRowOffset,
      row.wearingLevel,
      row.basicGrowRangeId,
      row.attrLibIds.join("|"),
      row.pairId,
      row.pairValue,
      row.pairLinkTarget,
      row.pairLinkRawTarget,
      row.pairLinkKind,
      (row.pairLinkLabels ?? []).join(" | "),
      (row.pairSmallCodes ?? []).join("|"),
      (row.pairSmallCodeOffsets ?? []).join(" | "),
      (row.segmentValueCandidates ?? []).join(" | "),
    ]));
  }
  if (statRows.length) {
    writeCsvFile(statCsvOut, [
      "nameId",
      "labels",
      "fightAttrId",
      "groupCode",
      "enumValue",
      "enumNameId",
      "fightRowOffset",
      "compactCode",
      "compactOffset",
    ], statRows.map((row) => [
      row.nameId,
      row.labels,
      row.fightAttrId,
      row.groupCode,
      row.enumValue,
      row.enumNameId,
      row.fightRowOffset,
      row.compactCode,
      row.compactOffset,
    ]));
  }
  if (observedRows.length) {
    writeCsvFile(observedCsvOut, [
      "fileBase",
      "time",
      "itemId",
      "itemNameId",
      "itemName",
      "uniqueId",
      "quality",
      "pairSlot",
      "pairId",
      "pairValue",
      "observedLabel",
      "observedNameId",
      "resolvedLabels",
      "fightAttrId",
      "enumValue",
      "compactCodes",
      "observedValue",
      "valueKind",
      "locked",
      "packetMappedValue",
      "packetMappedOffset",
      "pairLinkTarget",
      "pairLinkRawTarget",
      "pairLinkKind",
      "pairSmallCodes",
      "segmentValueCandidates",
      "source",
    ], observedRows.map((row) => [
      row.fileBase,
      row.time,
      row.itemId,
      row.itemNameId,
      row.itemName,
      row.uniqueId,
      row.quality,
      row.pairSlot,
      row.pairId,
      row.pairValue,
      row.observedLabel,
      row.observedNameId,
      (row.resolvedLabels ?? []).join(" | "),
      row.fightAttrId,
      row.enumValue,
      (row.compactCodes ?? []).join("|"),
      row.observedValue,
      row.valueKind,
      row.locked,
      row.packetMappedValue,
      row.packetMappedOffset,
      row.pairLinkTarget,
      row.pairLinkRawTarget,
      row.pairLinkKind,
      (row.pairSmallCodes ?? []).join("|"),
      (row.segmentValueCandidates ?? []).join(" | "),
      row.source,
    ]));
  }
  if (inferenceRows.length) {
    writeCsvFile(inferenceCsvOut, [
      "fileBase",
      "time",
      "itemId",
      "itemNameId",
      "itemName",
      "itemSlot",
      "gearGroup",
      "quality",
      "wearingLevel",
      "basicGrowRangeId",
      "pairSlot",
      "pairId",
      "pairValue",
      "lane",
      "pairLinkKind",
      "pairLinkTarget",
      "pairSmallCodes",
      "blockedIfBasicStrength",
      "blockedIfBasicIntellect",
      "blockedIfBasicAgility",
      "observedLabel",
      "observedNameId",
      "observedValue",
      "valueKind",
      "inferredLabel",
      "inferredNameId",
      "inferenceConfidence",
      "inferenceReasons",
      "alternateCandidates",
    ], inferenceRows.map((row) => [
      row.fileBase,
      row.time,
      row.itemId,
      row.itemNameId,
      row.itemName,
      row.itemSlot,
      row.gearGroup,
      row.quality,
      row.wearingLevel,
      row.basicGrowRangeId,
      row.pairSlot,
      row.pairId,
      row.pairValue,
      row.lane,
      row.pairLinkKind,
      row.pairLinkTarget,
      row.pairSmallCodes,
      row.blockedIfBasicStrength,
      row.blockedIfBasicIntellect,
      row.blockedIfBasicAgility,
      row.observedLabel,
      row.observedNameId,
      row.observedValue,
      row.valueKind,
      row.inferredLabel,
      row.inferredNameId,
      row.inferenceConfidence,
      row.inferenceReasons,
      row.alternateCandidates,
    ]));
  }
  return {
    bridgeCsvOut: bridgeRows.length ? bridgeCsvOut : null,
    statCsvOut: statRows.length ? statCsvOut : null,
    observedCsvOut: observedRows.length ? observedCsvOut : null,
    inferenceCsvOut: inferenceRows.length ? inferenceCsvOut : null,
    bridgeRowCount: bridgeRows.length,
    statRowCount: statRows.length,
    observedRowCount: observedRows.length,
    inferenceRowCount: inferenceRows.length,
  };
}
function printMultiHopSummary(multiHopWalk) {
  if (!multiHopWalk?.length) return;
  console.log("\nMulti-hop walk");
  console.log("==============");
  for (const walk of multiHopWalk) {
    const terminal = walk.terminalCandidates?.[0] ?? null;
    const label = terminal?.exactLabels?.[0] ?? terminal?.normalizedIdLabels?.[0] ?? terminal?.rawIdLabels?.[0] ?? "-";
    console.log(`  ${walk.pairId}: hops=${walk.hops?.length ?? 0} best=${terminal?.normalizedTargetId ?? terminal?.rawTargetId ?? "-"} ${terminal?.linkKind ?? "-"} ${label}`);
  }
}
function normalizeReport(report) {
  report.args ??= {};
  report.selectedLogs ??= [];
  report.payloadProbeRowCount ??= 0;
  report.clusters ??= [];
  return report;
}
function gatherPairIdsFromClusters(clusters) {
  return [...new Set(clusters.flatMap((cluster) => cluster.gearEntries.flatMap((entry) => entry.pairs.map((pair) => pair.id))))].sort((a, b) => a - b);
}
function gatherItemIdsFromClusters(clusters) {
  return [...new Set(clusters.flatMap((cluster) => cluster.gearEntries.map((entry) => entry.itemId)))].sort((a, b) => a - b);
}
function buildReportFromLogs(args) {
  const logFiles = latestLogFiles(args.logs, args.latest);
  console.log("Gear table probe");
  console.log("================");
  console.log(`Logs: ${args.logs}`);
  console.log(`Selected logs: ${logFiles.length}`);
  for (const file of logFiles) {
    console.log(`  ${path.basename(path.dirname(file.fullPath))}\\${path.basename(file.fullPath)}`);
  }
  const rows = extractProbeRows(logFiles);
  console.log(`Payload probe rows: ${rows.length}`);
  const clusters = buildGearClusters(rows, args.windowMs);
  printGearClusters(clusters);
  const itemIds = [...new Set([...args.ids, ...gatherItemIdsFromClusters(clusters)])].sort((a, b) => a - b);
  const pairIds = [...new Set([...args.pairIds, ...gatherPairIdsFromClusters(clusters)])].sort((a, b) => a - b);
  const report = {
    generatedAt: new Date().toISOString(),
    args: {
      game: args.game,
      logs: args.logs,
      latest: args.latest,
      windowMs: args.windowMs,
      scanGame: args.scanGame,
      fullPackageScan: args.fullPackageScan,
      ids: itemIds,
      pairIds,
      jsonOut: args.jsonOut,
      hitLimit: args.hitLimit,
      contextBefore: args.contextBefore,
      contextAfter: args.contextAfter,
      cooccurrenceBefore: args.cooccurrenceBefore,
      cooccurrenceAfter: args.cooccurrenceAfter,
    },
    selectedLogs: logFiles,
    payloadProbeRowCount: rows.length,
    clusters,
  };
  if (args.scanGame) {
    report.gameScan = scanGameAnchors(
      args.game,
      itemIds,
      pairIds,
      args.nameTerms,
      args.fullPackageScan,
      {
        hitLimit: args.hitLimit,
        contextBefore: args.contextBefore,
        contextAfter: args.contextAfter,
        cooccurrenceBefore: args.cooccurrenceBefore,
        cooccurrenceAfter: args.cooccurrenceAfter,
      },
    );
  } else {
    report.gameScan = { enabled: false, gameRoot: args.game };
  }
  return report;
}
function findMatchingEntryWindow(cluster, gearEntry) {
  for (const detail of cluster.nearbyDetails ?? []) {
    const matched = (detail.detail?.entryWindows ?? []).find((entryWindow) => entryWindow.itemId === gearEntry.itemId);
    if (matched) return matched;
  }
  return null;
}
function isLikelyDisplayValue(value) {
  return Number.isFinite(value) && value >= 180 && value <= 5000;
}
function pickLikelyDisplayValues(entryWindow) {
  const firstPairOffset = Math.min(...entryWindow.pairOffsets.map((pair) => pair.offset).filter((offset) => Number.isFinite(offset)));
  let picked = entryWindow.values.filter((value) => isLikelyDisplayValue(value.value) && (!Number.isFinite(firstPairOffset) || value.offset < firstPairOffset));
  if (!picked.length) {
    picked = entryWindow.values.filter((value) => isLikelyDisplayValue(value.value));
  }
  return dedupeBy(picked, (value) => `${value.offset}:${value.value}`);
}
function resolveEntryWindow(entryWindow, gearEntry) {
  if (!entryWindow) {
    return {
      itemId: gearEntry.itemId,
      quality: gearEntry.quality ?? null,
      mappedLines: [],
      unresolvedPairs: gearEntry.pairs.map((pair) => pair.id),
      visibleValueCandidates: [],
      metadataCandidates: [],
      note: "No matching 0x16 entry window found.",
    };
  }
  const pairIds = entryWindow.pairOffsets.map((pair) => pair.id);
  const likelyDisplayValues = pickLikelyDisplayValues(entryWindow);
  const metadataCandidates = entryWindow.values.filter((value) => !likelyDisplayValues.some((picked) => picked.offset === value.offset && picked.value === value.value));
  const lineCount = Math.min(pairIds.length, likelyDisplayValues.length);
  const mappedLines = [];
  for (let index = 0; index < lineCount; index += 1) {
    mappedLines.push({
      slot: index,
      pairId: pairIds[index],
      value: likelyDisplayValues[index].value,
      valueOffset: likelyDisplayValues[index].offset,
      pairOffset: entryWindow.pairOffsets[index]?.offset ?? null,
      resolution: likelyDisplayValues[index].offset < (entryWindow.pairOffsets[index]?.offset ?? Number.POSITIVE_INFINITY) ? "ordered-prefix" : "ordered-fallback",
    });
  }
  return {
    itemId: gearEntry.itemId,
    quality: gearEntry.quality ?? null,
    uniqueId: gearEntry.uniqueId ?? null,
    mappedLines,
    unresolvedPairs: pairIds.slice(lineCount),
    visibleValueCandidates: likelyDisplayValues.map((value) => ({ value: value.value, offset: value.offset })),
    metadataCandidates: metadataCandidates.map((value) => ({ value: value.value, offset: value.offset })),
    note: lineCount === 0 ? "No confident visible stat values found yet." : null,
  };
}
function buildResolvedClusters(report) {
  return report.clusters.map((cluster) => ({
    file: cluster.file,
    fileBase: cluster.fileBase ?? path.basename(cluster.file),
    time: cluster.time,
    fingerprintHex: cluster.fingerprintHex,
    items: cluster.gearEntries.map((gearEntry) => resolveEntryWindow(findMatchingEntryWindow(cluster, gearEntry), gearEntry)),
  }));
}
function buildPairProfiles(resolvedClusters) {
  const profiles = new Map();
  for (const cluster of resolvedClusters) {
    for (const item of cluster.items) {
      for (const line of item.mappedLines) {
        const profile = profiles.get(line.pairId) ?? {
          pairId: line.pairId,
          observedValues: [],
          itemIds: new Set(),
          qualities: new Set(),
          occurrences: 0,
          unresolvedSpecial: false,
        };
        profile.observedValues.push(line.value);
        profile.itemIds.add(item.itemId);
        if (item.quality !== null && item.quality !== undefined) profile.qualities.add(item.quality);
        profile.occurrences += 1;
        profiles.set(line.pairId, profile);
      }
      for (const pairId of item.unresolvedPairs) {
        const profile = profiles.get(pairId) ?? {
          pairId,
          observedValues: [],
          itemIds: new Set(),
          qualities: new Set(),
          occurrences: 0,
          unresolvedSpecial: false,
        };
        profile.itemIds.add(item.itemId);
        if (item.quality !== null && item.quality !== undefined) profile.qualities.add(item.quality);
        profile.unresolvedSpecial = true;
        profiles.set(pairId, profile);
      }
    }
  }
  return [...profiles.values()]
    .map((profile) => ({
      pairId: profile.pairId,
      observedValues: [...new Set(profile.observedValues)].sort((a, b) => a - b),
      itemIds: [...profile.itemIds].sort((a, b) => a - b),
      qualities: [...profile.qualities].sort((a, b) => a - b),
      occurrences: profile.occurrences,
      unresolvedSpecial: profile.unresolvedSpecial,
    }))
    .sort((a, b) => a.pairId - b.pairId);
}
function buildNameNeighborhoods(gameScan) {
  const neighborhoods = new Map();
  for (const anchor of gameScan?.localizationAnchors ?? []) {
    const counts = new Map();
    for (const hit of anchor.hits ?? []) {
      for (const nearby of hit.nearbyU32 ?? []) {
        counts.set(nearby.value, (counts.get(nearby.value) ?? 0) + 1);
      }
    }
    neighborhoods.set(anchor.term, counts);
  }
  return neighborhoods;
}
function buildPairNeighborhoods(gameScan) {
  const neighborhoods = new Map();
  for (const anchor of gameScan?.numericAnchors?.pairIds ?? []) {
    const counts = new Map();
    for (const hit of anchor.hits ?? []) {
      for (const nearby of hit.nearbyU32 ?? []) {
        counts.set(nearby.value, (counts.get(nearby.value) ?? 0) + 1);
      }
    }
    neighborhoods.set(anchor.value, counts);
  }
  return neighborhoods;
}
function buildPairStatCandidates(gameScan) {
  const labelsById = new Map((gameScan?.statCatalog ?? []).map((entry) => [entry.id, entry.labels]));
  const candidates = new Map();
  for (const anchor of gameScan?.numericAnchors?.pairIds ?? []) {
    const counts = new Map();
    for (const hit of anchor.hits ?? []) {
      for (const nearby of hit.nearbyKnownStatIds ?? []) {
        const current = counts.get(nearby.id) ?? {
          attrId: nearby.id,
          labels: labelsById.get(nearby.id) ?? [],
          score: 0,
          occurrences: 0,
          minDistance: Number.POSITIVE_INFINITY,
          encodings: new Set(),
          offsets: [],
        };
        const weight = nearby.encoding === "varint" ? 4 : 2;
        current.score += weight;
        current.occurrences += 1;
        current.minDistance = Math.min(current.minDistance, nearby.distance ?? Number.POSITIVE_INFINITY);
        current.encodings.add(nearby.encoding ?? "u32le");
        current.offsets.push(nearby.offset);
        counts.set(nearby.id, current);
      }
    }
    candidates.set(
      anchor.value,
      [...counts.values()]
        .map((entry) => ({
          ...entry,
          encodings: [...entry.encodings].sort((a, b) => a.localeCompare(b)),
          offsets: [...new Set(entry.offsets)].sort((a, b) => a - b).slice(0, 16),
        }))
        .sort((a, b) => b.score - a.score || a.minDistance - b.minDistance || a.attrId - b.attrId)
        .slice(0, 8),
    );
  }
  return candidates;
}
function scorePairNameCandidates(pairId, pairNeighborhoods, nameNeighborhoods) {
  const pairCounts = pairNeighborhoods.get(pairId);
  if (!pairCounts || pairCounts.size === 0) return [];
  const candidates = [];
  for (const [term, nameCounts] of nameNeighborhoods.entries()) {
    let overlap = 0;
    const shared = [];
    for (const [value, pairCount] of pairCounts.entries()) {
      const nameCount = nameCounts.get(value);
      if (!nameCount) continue;
      overlap += Math.min(pairCount, nameCount);
      shared.push(value);
    }
    if (overlap <= 0) continue;
    candidates.push({ term, overlap, sharedValues: shared.slice(0, 12) });
  }
  return candidates.sort((a, b) => b.overlap - a.overlap || a.term.localeCompare(b.term)).slice(0, 6);
}
function buildResolvedSummary(report) {
  let resolvedClusters = buildResolvedClusters(report);
  const pairProfiles = buildPairProfiles(resolvedClusters);
  const nameNeighborhoods = buildNameNeighborhoods(report.gameScan ?? {});
  const pairNeighborhoods = buildPairNeighborhoods(report.gameScan ?? {});
  const pairStatCandidates = buildPairStatCandidates(report.gameScan ?? {});
  const pairLinkagesById = new Map((report.gameScan?.pairLinkages ?? []).map((entry) => [entry.pairId, entry]));
  const pairResolutions = pairProfiles.map((profile) => ({
    ...profile,
    pairLinkage: pairLinkagesById.get(profile.pairId) ?? null,
    candidateNames: scorePairNameCandidates(profile.pairId, pairNeighborhoods, nameNeighborhoods),
    candidateStatIds: pairStatCandidates.get(profile.pairId) ?? [],
  }));
  const bestStatLabelByPair = new Map();
  const bestLinkByPair = new Map();
  const schemaHintsByPair = new Map((report.gameScan?.schemaFamilyHints ?? []).map((entry) => [entry.pairId, entry]));
  for (const profile of pairResolutions) {
    const schemaHint = schemaHintsByPair.get(profile.pairId) ?? null;
    const directLinkLabel = filterStatLikeLabels(profile.pairLinkage?.bestLink?.exactStatLabels ?? [])[0] ?? null;
    const strongNearbyLabel =
      profile.candidateStatIds?.[0] &&
      profile.candidateStatIds[0].minDistance <= 4096 &&
      profile.candidateStatIds[0].encodings?.includes("varint")
        ? filterStatLikeLabels(profile.candidateStatIds[0].labels ?? [])[0] ?? null
        : null;
    const nameOverlapLabel =
      profile.candidateNames?.[0] && profile.candidateNames[0].overlap >= 3 && isProbablyStatLabel(profile.candidateNames[0].term)
        ? profile.candidateNames[0].term
        : null;
    const schemaLabel = schemaHint?.statLikeLabels?.[0] ?? null;
    const bestLabel = directLinkLabel ?? strongNearbyLabel ?? schemaLabel ?? nameOverlapLabel ?? null;
    if (bestLabel) bestStatLabelByPair.set(profile.pairId, bestLabel);
    if (profile.pairLinkage?.bestLink) bestLinkByPair.set(profile.pairId, profile.pairLinkage.bestLink);
  }
  resolvedClusters = resolvedClusters.map((cluster) => ({
    ...cluster,
    items: cluster.items.map((item) => ({
      ...item,
      mappedLines: item.mappedLines.map((line) => {
        const bestLink = bestLinkByPair.get(line.pairId) ?? null;
        return {
          ...line,
          linkedId: bestLink?.rawTargetId ?? null,
          linkedIdNormalized: bestLink?.normalizedTargetId ?? null,
          linkKind: bestLink?.linkKind ?? null,
          candidateStat: bestStatLabelByPair.get(line.pairId) ?? null,
        };
      }),
    })),
  }));
  const tableChainHints = buildTableChainHints(report, pairResolutions);
  return {
    resolvedClusters,
    pairProfiles: pairResolutions,
    pairLinkages: report.gameScan?.pairLinkages ?? [],
    schemaFamilyHints: report.gameScan?.schemaFamilyHints ?? [],
    tableChainHints,
    secondHopHints: buildSecondHopHints(report, pairResolutions, tableChainHints),
  };
}
function printResolvedSummary(resolved) {
  console.log("\nResolved gear attribute hypotheses");
  console.log("=================================");
  for (const cluster of resolved.resolvedClusters) {
    console.log(`\n${cluster.time}  ${cluster.fileBase}  ${cluster.fingerprintHex}`);
    for (const item of cluster.items) {
      console.log(`  item=${item.itemId} quality=${item.quality ?? "-"} unique=${item.uniqueId ?? "-"}`);
      if (!item.mappedLines.length) {
        console.log(`    ${item.note ?? "No mapped lines yet."}`);
      }
      for (const line of item.mappedLines) {
        const label = line.candidateStat ? ` [${line.candidateStat}]` : "";
        const linked = line.linkedIdNormalized
          ? ` <${line.linkedIdNormalized}>`
          : line.linkedId
            ? ` <${line.linkedId}>`
            : "";
        console.log(`    pair ${line.pairId} => ${line.value}${label}${linked} (${line.resolution})`);
      }
      if (item.unresolvedPairs.length) {
        console.log(`    unresolved/special pairs: ${item.unresolvedPairs.join(", ")}`);
      }
      if (item.metadataCandidates.length) {
        const metadata = item.metadataCandidates.map((value) => `${value.value}@${value.offset}`).join(", " );
        console.log(`    metadata tail: ${metadata}`);
      }
    }
  }
  console.log("\nPair resolution candidates");
  console.log("==========================");
  if (!resolved.pairProfiles.length) {
    console.log("No pair profiles were built.");
    return;
  }
  for (const profile of resolved.pairProfiles) {
    const values = profile.observedValues.length ? profile.observedValues.join(", ") : "-";
    const names = profile.candidateNames.length
      ? profile.candidateNames.map((candidate) => `${candidate.term} (overlap ${candidate.overlap})`).join(", " )
      : "no neighborhood-overlap candidate yet";
    const directStats = profile.candidateStatIds?.length
      ? profile.candidateStatIds
          .map((candidate) => `${candidate.labels.join(" / ")} [${candidate.attrId}] score=${candidate.score} d=${candidate.minDistance}`)
          .join(", " )
      : "no nearby stat-id candidate yet";
    const linkage = profile.pairLinkage?.bestLink
      ? `${profile.pairLinkage.bestLink.rawTargetId} -> ${profile.pairLinkage.bestLink.normalizedTargetId ?? "-"}${
          profile.pairLinkage.bestLink.exactStatLabels?.[0]
            ? ` [${profile.pairLinkage.bestLink.exactStatLabels[0]}]`
            : ""
        }`
      : "no direct pair-link candidate yet";
    const special = profile.unresolvedSpecial ? " special/unmapped" : "";
    console.log(`  ${profile.pairId}: values=[${values}] items=[${profile.itemIds.join(", ")}]${special}`);
    console.log(`    pair link: ${linkage}`);
    console.log(`    direct stat ids: ${directStats}`);
    console.log(`    neighborhood names: ${names}`);
  }
  if (resolved.tableChainHints?.length) {
    console.log("\nTable-chain hints");
    console.log("=================");
    for (const hint of resolved.tableChainHints) {
      const values = hint.observedValues?.length ? hint.observedValues.join(", ") : "-";
      const best = hint.bestStatLabels?.length ? hint.bestStatLabels.join(" / ") : "no stat-like label yet";
      console.log(`  ${hint.pairId}: values=[${values}] kind=${hint.linkKind ?? "-"} confidence=${hint.confidence}`);
      console.log(`    best: ${best}`);
      if (hint.secondHopNeeded && hint.nextHopHint) {
        console.log(`    next hop: ${hint.nextHopHint}`);
      }
    }
  }
  if (resolved.secondHopHints?.length) {
    console.log("\nSecond-hop hints");
    console.log("================");
    for (const hint of resolved.secondHopHints) {
      const values = hint.observedValues?.length ? hint.observedValues.join(", ") : "-";
      console.log(`  ${hint.pairId}: values=[${values}] current=${hint.currentLinkKind ?? "-"} -> ${hint.currentNormalizedTargetId ?? hint.currentRawTargetId ?? "-"}`);
      if (hint.nextHopHint) {
        console.log(`    reason: ${hint.nextHopHint}`);
      }
      if (hint.recommended) {
        const labels = hint.recommended.exactLabels?.length
          ? hint.recommended.exactLabels.join(" / ")
          : hint.recommended.rawIdLabels?.length
            ? hint.recommended.rawIdLabels.join(" / ")
            : hint.recommended.normalizedIdLabels?.length
              ? hint.recommended.normalizedIdLabels.join(" / ")
              : "no labels yet";
        console.log(`    recommended: ${hint.recommended.linkKind ?? "-"} -> ${hint.recommended.normalizedTargetId ?? hint.recommended.rawTargetId ?? "-"} score=${hint.recommended.score}`);
        console.log(`      labels: ${labels}`);
        if (hint.recommended.recordOffsets?.length) {
          console.log(`      offsets: ${hint.recommended.recordOffsets.join(", ")}`);
        }
      }
      if (hint.familySiblings?.length) {
        const siblingText = hint.familySiblings
          .slice(0, 4)
          .map((candidate) => `${candidate.normalizedTargetId ?? candidate.rawTargetId ?? "-"} (${candidate.linkKind}, score=${candidate.score})`)
          .join(", ");
        console.log(`    siblings: ${siblingText}`);
      }
    }
  }
}
function summarizeReportFromFile(reportPath) {
  const report = normalizeReport(readJsonFile(reportPath));
  console.log("Gear table probe");
  console.log("================");
  console.log(`Report: ${reportPath}`);
  console.log(`Selected logs: ${report.selectedLogs.length}`);
  console.log(`Payload probe rows: ${report.payloadProbeRowCount}`);
  printGearClusters(report.clusters);
  return report;
}
function main() {
  const args = parseArgs(process.argv);
  const resolvedReportPath = args.report ? resolveReportInputPath(args.report, args.exportDir) : null;
  const resolvedJsonOut = args.jsonOut ? resolveExportPath(args.jsonOut, args.exportDir) : null;
  const resolvedCsvOut = args.csvOut ? resolveExportPath(args.csvOut, args.exportDir) : null;
  const report = resolvedReportPath ? summarizeReportFromFile(resolvedReportPath) : buildReportFromLogs(args);
  const mergedItemIds = [...new Set([...(report.args?.ids ?? []), ...args.ids, ...gatherItemIdsFromClusters(report.clusters)])].sort((a, b) => a - b);
  const mergedPairIds = [...new Set([...(report.args?.pairIds ?? []), ...args.pairIds, ...gatherPairIdsFromClusters(report.clusters)])].sort((a, b) => a - b);
  report.args = {
    ...(report.args ?? {}),
    game: args.game,
    logs: args.logs,
    latest: args.latest,
    windowMs: args.windowMs,
    scanGame: args.scanGame,
    fullPackageScan: args.fullPackageScan,
    ids: mergedItemIds,
    pairIds: mergedPairIds,
    jsonOut: resolvedJsonOut,
    csvOut: resolvedCsvOut,
    exportDir: args.exportDir,
    maxHops: args.maxHops,
    branchLimit: args.branchLimit,
    hopExportDir: args.hopExportDir,
    exportHopResults: args.exportHopResults,
    focusTargets: args.focusTargets,
    exportAttributeWindows: args.exportAttributeWindows,
    attributeWindowCsvOut: args.attributeWindowCsvOut,
    exportAttributeBridge: args.exportAttributeBridge,
    attributeBridgeCsvOut: args.attributeBridgeCsvOut,
    statNameCsvOut: args.statNameCsvOut,
    observedAttributeCsvOut: args.observedAttributeCsvOut,
    attributeInferenceCsvOut: args.attributeInferenceCsvOut,
    exportAttrLib: args.exportAttrLib,
    attrLibCandidatesCsvOut: args.attrLibCandidatesCsvOut,
    attrLibLaneCsvOut: args.attrLibLaneCsvOut,
    hitLimit: args.hitLimit,
    contextBefore: args.contextBefore,
    contextAfter: args.contextAfter,
    cooccurrenceBefore: args.cooccurrenceBefore,
    cooccurrenceAfter: args.cooccurrenceAfter,
  };
  const gameScanNeedsRefresh =
    !report.gameScan ||
    report.gameScan.enabled !== true ||
    !(report.gameScan?.statCatalog?.length > 0) ||
    !(report.gameScan?.pairLinkages?.length > 0) ||
    !(report.gameScan?.pairRowSlices?.length > 0) ||
    !(report.gameScan?.schemaFamilyHints?.length > 0) ||
    !(report.gameScan?.targetIdAnchors?.length > 0) ||
    !(report.gameScan?.labelLookup?.length > 0) ||
    !(report.gameScan?.equipTableRows?.length > 0) ||
    !(report.gameScan?.pairBridgeRows?.length > 0) ||
    !(report.gameScan?.knownStatNameRows?.length > 0) ||
    !(report.gameScan?.attrLibRows?.length > 0) ||
    mergedPairIds.some((pairId) => !(report.gameScan?.numericAnchors?.pairIds ?? []).some((anchor) => anchor.value === pairId)) ||
    (report.gameScan?.numericAnchors?.pairIds ?? []).some(
      (anchor) => (anchor.hits ?? []).some(
        (hit) => hit.nearbyKnownStatIds === undefined || hit.hexWindowStartOffset === undefined,
      ),
    );
  if (args.scanGame && gameScanNeedsRefresh) {
    report.gameScan = scanGameAnchors(
      args.game,
      mergedItemIds,
      mergedPairIds,
      args.nameTerms,
      args.fullPackageScan,
      {
        hitLimit: args.hitLimit,
        contextBefore: args.contextBefore,
        contextAfter: args.contextAfter,
        cooccurrenceBefore: args.cooccurrenceBefore,
        cooccurrenceAfter: args.cooccurrenceAfter,
      },
    );
  }
  if (args.resolve) {
    report.resolved = buildResolvedSummary(report);
    report.resolved.multiHopWalk = buildMultiHopWalk(report, {
      maxHops: args.maxHops,
      branchLimit: args.branchLimit,
      hitLimit: args.hitLimit,
      contextBefore: Math.max(args.contextBefore, 256),
      contextAfter: Math.max(args.contextAfter, 640),
    });
    report.resolved.focusedTargetDumps = buildFocusedTargetDumps(report, {
      focusTargets: args.focusTargets,
      maxHops: args.maxHops,
      branchLimit: args.branchLimit,
      hitLimit: args.hitLimit,
      contextBefore: Math.max(args.contextBefore, 320),
      contextAfter: Math.max(args.contextAfter, 960),
    });
    printResolvedSummary(report.resolved);
    printMultiHopSummary(report.resolved.multiHopWalk);
    printFocusedTargetSummary(report.resolved.focusedTargetDumps);
    printAttributeWindowSummary(report);
    if (args.exportHopResults && report.resolved.multiHopWalk.length) {
      report.resolved.multiHopExports = writeMultiHopExports(report, report.resolved.multiHopWalk, {
        exportDir: args.exportDir,
        hopExportDir: args.hopExportDir,
        csvOut: resolvedCsvOut ?? "gear-hop-walk-summary.csv",
      });
      if (report.resolved.multiHopExports) {
        console.log(`\nWrote hop CSV: ${report.resolved.multiHopExports.csvOut}`);
        console.log(`Wrote pair exports: ${report.resolved.multiHopExports.pairDir}`);
      }
    }
    if (args.exportAttributeWindows) {
      report.resolved.attributeWindowExport = writeAttributeWindowExports(report, {
        exportDir: args.exportDir,
        attributeWindowCsvOut: args.attributeWindowCsvOut,
      });
      if (report.resolved.attributeWindowExport) {
        console.log(`\nWrote attribute window CSV: ${report.resolved.attributeWindowExport.csvOut}`);
      }
    }
    if (args.exportAttributeBridge) {
      report.resolved.attributeBridgeExport = writeAttributeBridgeExports(report, {
        exportDir: args.exportDir,
        attributeBridgeCsvOut: args.attributeBridgeCsvOut,
        statNameCsvOut: args.statNameCsvOut,
        observedAttributeCsvOut: args.observedAttributeCsvOut,
    attributeInferenceCsvOut: args.attributeInferenceCsvOut,
      });
      if (report.resolved.attributeBridgeExport) {
        if (report.resolved.attributeBridgeExport.bridgeCsvOut) {
          console.log(`\nWrote attribute bridge CSV: ${report.resolved.attributeBridgeExport.bridgeCsvOut}`);
        }
        if (report.resolved.attributeBridgeExport.statCsvOut) {
          console.log(`Wrote stat name CSV: ${report.resolved.attributeBridgeExport.statCsvOut}`);
        }
        if (report.resolved.attributeBridgeExport.observedCsvOut) {
          console.log(`Wrote observed attribute CSV: ${report.resolved.attributeBridgeExport.observedCsvOut}`);
        }
        if (report.resolved.attributeBridgeExport.inferenceCsvOut) {
          console.log(`Wrote attribute inference CSV: ${report.resolved.attributeBridgeExport.inferenceCsvOut}`);
        }
      }
    }
    if (args.exportAttrLib) {
      report.resolved.attrLibExport = writeAttrLibExports(report, {
        exportDir: args.exportDir,
        attrLibCandidatesCsvOut: args.attrLibCandidatesCsvOut,
        attrLibLaneCsvOut: args.attrLibLaneCsvOut,
      });
      if (report.resolved.attrLibExport) {
        if (report.resolved.attrLibExport.candidateCsvOut) {
          console.log(`Wrote attr-lib candidate CSV: ${report.resolved.attrLibExport.candidateCsvOut}`);
        }
        if (report.resolved.attrLibExport.laneCsvOut) {
          console.log(`Wrote attr-lib lane CSV: ${report.resolved.attrLibExport.laneCsvOut}`);
        }
        if (report.resolved.attrLibExport.fieldCsvOut) {
          console.log(`Wrote attr-lib field CSV: ${report.resolved.attrLibExport.fieldCsvOut}`);
        }
        if (report.resolved.attrLibExport.evaluationCsvOut) {
          console.log(`Wrote attr-lib evaluation CSV: ${report.resolved.attrLibExport.evaluationCsvOut}`);
        }
        if (report.resolved.attrLibExport.valueCalCsvOut) {
          console.log(`Wrote attr-lib ValueCal CSV: ${report.resolved.attrLibExport.valueCalCsvOut}`);
        }
        if (report.resolved.attrLibExport.growJoinCsvOut) {
          console.log(`Wrote BasicGrow join CSV: ${report.resolved.attrLibExport.growJoinCsvOut}`);
        }
        if (report.resolved.attrLibExport.basicGrowDecodedCsvOut) {
          console.log(`Wrote BasicGrow decoded CSV: ${report.resolved.attrLibExport.basicGrowDecodedCsvOut}`);
        }
        if (report.resolved.attrLibExport.basicAttrValuesCsvOut) {
          console.log(`Wrote BasicAttr values CSV: ${report.resolved.attrLibExport.basicAttrValuesCsvOut}`);
        }
        if (report.resolved.attrLibExport.statProofCsvOut) {
          console.log(`Wrote gear stat proof CSV: ${report.resolved.attrLibExport.statProofCsvOut}`);
        }
      }
    }
  }
  if (resolvedJsonOut) {
    writeJsonFile(resolvedJsonOut, report);
    console.log(`\nWrote report: ${resolvedJsonOut}`);
  }
}
main();
