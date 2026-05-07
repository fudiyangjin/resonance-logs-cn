#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GAME_ROOT =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Blue Protocol Star Resonance\\bpsr";
const DEFAULT_OUT = path.join(repoRoot, "src", "lib", "config", "itemnames.json");

const IDENTITY_REGION_START = 660_000_000;
const IDENTITY_REGION_END = 670_000_000;
const MIN_ITEM_ID = 1;
const MAX_ITEM_ID = 10_000_000;
const MIN_NAME_ID = 1_000_000;
const MAX_NAME_ID = 2_000_000_000;
const MAX_LABEL_BYTES = 160;

const GEAR_WORDS = [
  "armor",
  "belt",
  "blade",
  "boots",
  "bow",
  "bracer",
  "bracelet",
  "charm",
  "cloak",
  "clothes",
  "crossbow",
  "earring",
  "garb",
  "gloves",
  "helm",
  "helmet",
  "longbow",
  "necklace",
  "ring",
  "robe",
  "spear",
  "staff",
  "suit",
  "talisman",
  "weapon",
];

const ENGLISH_ITEM_WORDS = [
  "agile",
  "breaker",
  "deadly",
  "dominion",
  "dragonbreath",
  "fate",
  "flux",
  "fortune",
  "glazed",
  "highland",
  "jade",
  "jadeite",
  "jasper",
  "lethal",
  "mastery",
  "peerless",
  "plateau",
  "reign",
  "rupture",
  "shadowcloak",
  "stealth",
  "ultimate",
  "wane",
];

const NON_ENGLISH_HINTS = [
  "amuleto",
  "arc long",
  "atuendo",
  "botas",
  "bottes",
  "bracelete",
  "capasombra",
  "de jaspe",
  "de la",
  "der herrschaft",
  "dominante",
  "esmaltado",
  "fugaz",
  "hautes terres",
  "jaspis",
  "letal",
  "souffledragon",
  "talisman de",
  "terras altas",
  "yelmo",
];

const DESCRIPTION_HINTS = [
  "class",
  "contient",
  "contains",
  "damage",
  "effect",
  "equipment for",
  "grants",
  "increase",
  "item for",
  "material",
  "obtained",
  "quest",
  "reward",
  "skill",
  "used",
  "weapon epic",
  "打开箱子",
  "打開箱子",
  "箱を開ける",
];

function parseArgs(argv) {
  const args = {
    gameRoot: DEFAULT_GAME_ROOT,
    out: DEFAULT_OUT,
    regionStart: IDENTITY_REGION_START,
    regionEnd: IDENTITY_REGION_END,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--game" && argv[i + 1]) {
      args.gameRoot = argv[++i];
    } else if (arg === "--out" && argv[i + 1]) {
      args.out = path.resolve(argv[++i]);
    } else if (arg === "--region-start" && argv[i + 1]) {
      args.regionStart = Number(argv[++i]);
    } else if (arg === "--region-end" && argv[i + 1]) {
      args.regionEnd = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage: node scripts/export-item-names.mjs [options]

Options:
  --game <path>          Game install root. Defaults to the Steam BPSR path.
  --out <path>           Output JSON path. Defaults to src/lib/config/itemnames.json.
  --region-start <byte>  Start byte for item identity row scan. Default: ${IDENTITY_REGION_START}.
  --region-end <byte>    End byte for item identity row scan. Default: ${IDENTITY_REGION_END}.
`);
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  if (parent && parent !== "." && !fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
}

function readU32(buffer, offset) {
  return offset >= 0 && offset + 4 <= buffer.length ? buffer.readUInt32LE(offset) : null;
}

function normalizeLabel(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasControlCharacters(value) {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isReadableLabel(label) {
  if (label.length < 3 || label.length > MAX_LABEL_BYTES) return false;
  if (label.includes("\uFFFD") || label.includes("ï¿½")) return false;
  if (!/\p{L}/u.test(label)) return false;

  const letterCount = [...label.matchAll(/\p{L}/gu)].length;
  if (letterCount < 2) return false;
  if (isAscii(label) && label.length <= 4 && !/[aeiou]/i.test(label)) return false;

  const suspiciousCount =
    label.match(/[^\p{L}\p{N}\s[\]\-:!'’()./,&+]/gu)?.length ?? 0;
  return suspiciousCount <= Math.max(1, Math.floor(label.length * 0.08));
}

function isAscii(value) {
  return /^[\x20-\x7e]+$/.test(value);
}

function isLikelyDescription(label) {
  const lowered = label.toLowerCase();
  if (label.length > 92) return true;
  if (/[.!?]$/.test(label) && label.split(/\s+/).length > 3) return true;
  return DESCRIPTION_HINTS.some((hint) => lowered.includes(hint));
}

function wordHit(label, words) {
  const lowered = label.toLowerCase();
  return words.some((word) => new RegExp(`\\b${word}\\b`, "i").test(lowered));
}

function isLikelyNonEnglish(label) {
  const lowered = label.toLowerCase();
  return NON_ENGLISH_HINTS.some((hint) => lowered.includes(hint));
}

function labelScore(label, index) {
  if (!label || label.length < 3 || !/[A-Za-z]/.test(label)) return -100;

  let score = 0;
  if (isAscii(label)) score += 8;
  if (/^[A-Za-z0-9][A-Za-z0-9'’/ [\]\-:!().]+$/.test(label)) score += 3;
  if (wordHit(label, GEAR_WORDS)) score += 9;
  if (wordHit(label, ENGLISH_ITEM_WORDS)) score += 5;
  if (/\b(R|L)\)$/.test(label)) score += 1;
  if (/\bRupture\b/i.test(label)) score += 3;
  if (/\bWane\b/i.test(label)) score += 2;
  if (/\bDominion\b/i.test(label)) score += 2;
  if (/^\[[^\]]+\]\s/.test(label)) score -= 4;
  if (isLikelyNonEnglish(label)) score -= 18;
  if (isLikelyDescription(label)) score -= 80;

  return score + index / 1000;
}

function choosePreferredLabel(labels) {
  const scored = labels.map((label, index) => ({
    label,
    score: labelScore(label, index),
  }));
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored[0]?.score > -20 ? scored[0].label : labels[0] ?? "";
}

function readStructuredStringRecord(buffer, offset, wantedIds) {
  if (offset < 0 || offset + 6 > buffer.length) return null;
  const id = buffer.readUInt32LE(offset);
  if (!wantedIds.has(id)) return null;
  const length = buffer.readUInt16LE(offset + 4);
  if (length < 2 || length > MAX_LABEL_BYTES || offset + 6 + length > buffer.length) return null;

  const bytes = buffer.subarray(offset + 6, offset + 6 + length);
  let text = "";
  try {
    text = bytes.toString("utf8");
  } catch {
    return null;
  }

  const label = normalizeLabel(text);
  if (!label || hasControlCharacters(label) || !isReadableLabel(label)) return null;
  return { offset, id, label };
}

function addMapSet(map, key, value) {
  let values = map.get(key);
  if (!values) {
    values = new Set();
    map.set(key, values);
  }
  values.add(value);
}

function collectIdentityCandidates(buffer, regionStart, regionEnd) {
  const candidates = [];
  const wantedNameIds = new Set();
  const start = Math.max(0, Number(regionStart) || IDENTITY_REGION_START);
  const end = Math.min(buffer.length - 8, Number(regionEnd) || IDENTITY_REGION_END);

  for (let offset = start; offset <= end; offset += 1) {
    const itemId = buffer.readUInt32LE(offset);
    if (itemId < MIN_ITEM_ID || itemId > MAX_ITEM_ID) continue;

    const nameId = buffer.readUInt32LE(offset + 4);
    if (nameId < MIN_NAME_ID || nameId > MAX_NAME_ID) continue;

    candidates.push({ offset, itemId, nameId });
    wantedNameIds.add(nameId);
  }

  return { candidates, wantedNameIds };
}

function collectLabelsForNameIds(buffer, wantedNameIds) {
  const labelsById = new Map();
  if (!wantedNameIds.size) return labelsById;

  for (let offset = 0; offset + 6 <= buffer.length; offset += 1) {
    const record = readStructuredStringRecord(buffer, offset, wantedNameIds);
    if (!record) continue;
    addMapSet(labelsById, record.id, record.label);
  }

  return labelsById;
}

function sortLabels(labels) {
  return [...new Set(labels.map(normalizeLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function scoreCandidate(candidate) {
  const labels = candidate.names ?? [];
  if (!labels.length) return -100;
  return Math.max(...labels.map((label, index) => labelScore(label, index)));
}

function buildItemEntries(candidates, labelsById) {
  const byItem = new Map();

  for (const candidate of candidates) {
    const rawLabels = labelsById.get(candidate.nameId);
    if (!rawLabels?.size) continue;

    const names = sortLabels([...rawLabels]).filter((label) => !isLikelyDescription(label));
    if (!names.length) continue;

    const entry = {
      offset: candidate.offset,
      itemId: candidate.itemId,
      nameId: candidate.nameId,
      names,
      preferredName: choosePreferredLabel(names),
    };
    const score = scoreCandidate(entry);
    if (score < 0) continue;

    const existing = byItem.get(candidate.itemId);
    if (!existing || score > existing.score || (score === existing.score && candidate.offset < existing.offset)) {
      byItem.set(candidate.itemId, { ...entry, score });
    }
  }

  return [...byItem.values()]
    .sort((a, b) => a.itemId - b.itemId)
    .map((entry) => ({
      Id: entry.itemId,
      NameDesign: entry.preferredName,
      NameId: entry.nameId,
      Names: entry.names,
      SourceOffset: entry.offset,
    }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packagePath = path.join(
    args.gameRoot,
    "BPSR_STEAM_Data",
    "StreamingAssets",
    "container",
    "m0.pkg",
  );

  if (!fs.existsSync(packagePath)) {
    throw new Error(`m0.pkg not found at ${packagePath}`);
  }

  console.log(`Reading ${packagePath}`);
  const buffer = fs.readFileSync(packagePath);
  console.log(`Scanning item identity region ${args.regionStart}-${args.regionEnd}`);
  const { candidates, wantedNameIds } = collectIdentityCandidates(
    buffer,
    args.regionStart,
    args.regionEnd,
  );
  console.log(`Candidate rows: ${candidates.length.toLocaleString()}`);
  console.log(`Referenced name ids: ${wantedNameIds.size.toLocaleString()}`);

  console.log("Resolving linked string records");
  const labelsById = collectLabelsForNameIds(buffer, wantedNameIds);
  console.log(`Resolved name ids: ${labelsById.size.toLocaleString()}`);

  const entries = buildItemEntries(candidates, labelsById);
  ensureParentDir(args.out);
  fs.writeFileSync(args.out, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  console.log(`Wrote ${entries.length.toLocaleString()} item names to ${args.out}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
