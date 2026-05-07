import { GEAR_STAT_DECODER_SEED, GEAR_STAT_DECODER_SOURCE } from "./gear-stat-decoder.generated";
import itemNamesData from "$parserData/generated/itemnames.json";

export type GearStatLane = "legendary-affix" | "advanced-attribute" | "locked";

export type GearStatValueKind = "flat" | "percent" | "locked" | "unknown";

export type GearStatProofStatus =
  | "basic-attr-value-match"
  | "value-match"
  | "structural-match"
  | "grow-slot-only";

export type GearStatConfidence = "high" | "medium" | "low";

export type GearStatSource = "observed-proof" | "inferred-proof" | "locked-lane";

export type GearStatDecoderInput = {
  itemId?: number | string | null;
  pairSlot?: number | string | null;
  pairId?: number | string | null;
  attrLibId?: number | string | null;
};

export type GearStatSeedLine = {
  itemId: number;
  itemName: string;
  wearingLevel: number;
  pairSlot: number;
  pairId: number;
  attrLibId: number;
  attrLibIndex: string;
  label: string;
  value: number | null;
  valueKind: GearStatValueKind;
  lane: GearStatLane;
  basicGrowRangeId: number;
  basicAttrGrowRowId: number;
  proofStatus: GearStatProofStatus;
  proofConfidence: GearStatConfidence;
  evaluatorConfidence: GearStatConfidence;
  source: GearStatSource;
};

export type GearStatLine = GearStatSeedLine & {
  valueText: string | null;
  displayText: string;
  canDisplayValue: boolean;
};

type ItemNameEntry = {
  Id?: number | string | null;
  NameDesign?: string | null;
  Names?: string[] | Record<string, string> | null;
};

export { GEAR_STAT_DECODER_SEED, GEAR_STAT_DECODER_SOURCE };

export const GEAR_STAT_DECODER_VERSION = GEAR_STAT_DECODER_SOURCE.version;

const gearStatByItemSlot = new Map<string, GearStatSeedLine>();
const gearStatByItemPair = new Map<string, GearStatSeedLine>();
const gearStatByItemAttrLibSlot = new Map<string, GearStatSeedLine>();
const manualGearStatByItemSlot = new Map<string, GearStatSeedLine>();
const manualGearStatByItemPair = new Map<string, GearStatSeedLine>();
const gearStatsByPair = new Map<number, GearStatSeedLine[]>();
const gearNameByItem = new Map<number, string>();
const itemNameByItem = new Map<number, string>();
const itemNameEntryByItem = new Map<number, ItemNameEntry>();

const gearStatPairFallbacks: GearStatSeedLine[] = [
  buildPairFallback({ pairId: 2723, label: "DMG Bonus vs. Bosses", value: 1, valueKind: "percent" }),
  buildPairFallback({ pairId: 2724, label: "Armor", value: 64, valueKind: "flat" }),
  buildPairFallback({ pairId: 2732, label: "Agility", value: 1.5, valueKind: "percent" }),
  buildPairFallback({ pairId: 2733, label: "Agility", value: 1.5, valueKind: "percent" }),
  buildPairFallback({ pairId: 2741, label: "Attack SPD", value: 1.5, valueKind: "percent" }),
];

const manualGearStatOverrides: GearStatSeedLine[] = [
  buildManualGearStat({
    itemId: 2050818,
    itemName: "Dominion Jasper Earrings",
    wearingLevel: 120,
    pairSlot: 0,
    pairId: 2723,
    label: "DMG Bonus vs. Bosses",
    value: 2,
    valueKind: "percent",
    lane: "legendary-affix",
  }),
  buildManualGearStat({
    itemId: 2050818,
    itemName: "Dominion Jasper Earrings",
    wearingLevel: 120,
    pairSlot: 1,
    pairId: 2957,
    label: "Luck",
    value: 225,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2050818,
    itemName: "Dominion Jasper Earrings",
    wearingLevel: 120,
    pairSlot: 2,
    pairId: 2809,
    label: "Mastery",
    value: 450,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2050818,
    itemName: "Dominion Jasper Earrings",
    wearingLevel: 120,
    pairSlot: 3,
    pairId: 3201,
    label: "Locked",
    value: null,
    valueKind: "locked",
    lane: "locked",
  }),
  buildManualGearStat({
    itemId: 2051014,
    itemName: "[Ultimate] Deadly Glaze Earring",
    wearingLevel: 160,
    pairSlot: 0,
    pairId: 2741,
    label: "Attack SPD",
    value: 1,
    valueKind: "percent",
    lane: "legendary-affix",
  }),
  buildManualGearStat({
    itemId: 2051014,
    itemName: "[Ultimate] Deadly Glaze Earring",
    wearingLevel: 160,
    pairSlot: 1,
    pairId: 2883,
    label: "Crit",
    value: 680,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2051014,
    itemName: "[Ultimate] Deadly Glaze Earring",
    wearingLevel: 160,
    pairSlot: 2,
    pairId: 3039,
    label: "Mastery",
    value: 339,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2051014,
    itemName: "[Ultimate] Deadly Glaze Earring",
    wearingLevel: 160,
    pairSlot: 3,
    pairId: 3445,
    label: "Locked",
    value: null,
    valueKind: "locked",
    lane: "locked",
  }),
  buildManualGearStat({
    itemId: 2030814,
    itemName: "Agility Highland Bracers",
    wearingLevel: 120,
    pairSlot: 0,
    pairId: 2724,
    label: "All Element Resistance",
    value: 24,
    valueKind: "flat",
    lane: "legendary-affix",
  }),
  buildManualGearStat({
    itemId: 2030814,
    itemName: "Agility Highland Bracers",
    wearingLevel: 120,
    pairSlot: 1,
    pairId: 2959,
    label: "Haste",
    value: 451,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2030814,
    itemName: "Agility Highland Bracers",
    wearingLevel: 120,
    pairSlot: 2,
    pairId: 2805,
    label: "Mastery",
    value: 225,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2030814,
    itemName: "Agility Highland Bracers",
    wearingLevel: 120,
    pairSlot: 3,
    pairId: 3172,
    label: "Locked",
    value: null,
    valueKind: "locked",
    lane: "locked",
  }),
  buildManualGearStat({
    itemId: 2030819,
    itemName: "Peerless Highland Bracers",
    wearingLevel: 120,
    pairSlot: 0,
    pairId: 2724,
    label: "All Element Resistance",
    value: 48,
    valueKind: "flat",
    lane: "legendary-affix",
  }),
  buildManualGearStat({
    itemId: 2030819,
    itemName: "Peerless Highland Bracers",
    wearingLevel: 120,
    pairSlot: 1,
    pairId: 2955,
    label: "Versatility",
    value: 451,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2030819,
    itemName: "Peerless Highland Bracers",
    wearingLevel: 120,
    pairSlot: 2,
    pairId: 2811,
    label: "Haste",
    value: 225,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2030819,
    itemName: "Peerless Highland Bracers",
    wearingLevel: 120,
    pairSlot: 3,
    pairId: 3173,
    label: "Locked",
    value: null,
    valueKind: "locked",
    lane: "locked",
  }),
  buildManualGearStat({
    itemId: 2050816,
    itemName: "Fortune Jasper Earrings",
    wearingLevel: 120,
    pairSlot: 0,
    pairId: 2723,
    label: "DMG Bonus vs. Bosses",
    value: 1.5,
    valueKind: "percent",
    lane: "legendary-affix",
  }),
  buildManualGearStat({
    itemId: 2050816,
    itemName: "Fortune Jasper Earrings",
    wearingLevel: 120,
    pairSlot: 1,
    pairId: 2959,
    label: "Mastery",
    value: 225,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2050816,
    itemName: "Fortune Jasper Earrings",
    wearingLevel: 120,
    pairSlot: 2,
    pairId: 2807,
    label: "Luck",
    value: 451,
    valueKind: "flat",
    lane: "advanced-attribute",
  }),
  buildManualGearStat({
    itemId: 2050816,
    itemName: "Fortune Jasper Earrings",
    wearingLevel: 120,
    pairSlot: 3,
    pairId: 3200,
    label: "Locked",
    value: null,
    valueKind: "locked",
    lane: "locked",
  }),
];

for (const line of manualGearStatOverrides) {
  manualGearStatByItemSlot.set(itemSlotKey(line.itemId, line.pairSlot), line);
  manualGearStatByItemPair.set(itemPairKey(line.itemId, line.pairId), line);
  if (!gearNameByItem.has(line.itemId) && line.itemName) {
    gearNameByItem.set(line.itemId, line.itemName);
  }
}

for (const line of GEAR_STAT_DECODER_SEED) {
  gearStatByItemSlot.set(itemSlotKey(line.itemId, line.pairSlot), line);
  gearStatByItemPair.set(itemPairKey(line.itemId, line.pairId), line);
  gearStatByItemAttrLibSlot.set(itemAttrLibSlotKey(line.itemId, line.attrLibId, line.pairSlot), line);
  pushGearStatPairLine(line);
  if (!gearNameByItem.has(line.itemId) && line.itemName) {
    gearNameByItem.set(line.itemId, line.itemName);
  }
}

for (const line of gearStatPairFallbacks) {
  pushGearStatPairLine(line);
}

const itemNameEntries = itemNamesData as ItemNameEntry[];

for (const entry of itemNameEntries) {
  const itemId = toInteger(entry.Id);
  if (itemId === null || itemNameByItem.has(itemId)) continue;
  itemNameEntryByItem.set(itemId, entry);

  const name = chooseItemName(entry, "en");

  if (name) {
    itemNameByItem.set(itemId, name);
  }
}

export function decodeGearStatLine(input: GearStatDecoderInput): GearStatLine | null {
  const itemId = toInteger(input.itemId);

  if (itemId === null) {
    return null;
  }

  const pairSlot = toInteger(input.pairSlot);

  if (pairSlot !== null) {
    const manualSlotMatch = manualGearStatByItemSlot.get(itemSlotKey(itemId, pairSlot));

    if (manualSlotMatch) {
      return toGearStatLine(manualSlotMatch);
    }

    const itemSlotMatch = gearStatByItemSlot.get(itemSlotKey(itemId, pairSlot));

    if (itemSlotMatch) {
      return toGearStatLine(itemSlotMatch);
    }
  }

  const pairId = toInteger(input.pairId);

  if (pairId !== null) {
    const manualPairMatch = manualGearStatByItemPair.get(itemPairKey(itemId, pairId));

    if (manualPairMatch) {
      return toGearStatLine(manualPairMatch);
    }

    const itemPairMatch = gearStatByItemPair.get(itemPairKey(itemId, pairId));

    if (itemPairMatch) {
      return toGearStatLine(itemPairMatch);
    }
  }

  const attrLibId = toInteger(input.attrLibId);

  if (attrLibId !== null && pairSlot !== null) {
    const attrLibMatch = gearStatByItemAttrLibSlot.get(itemAttrLibSlotKey(itemId, attrLibId, pairSlot));

    if (attrLibMatch) {
      return toGearStatLine(attrLibMatch);
    }
  }

  return null;
}

export function decodeGearStatLineByPairId(input: GearStatDecoderInput): GearStatLine | null {
  const pairId = toInteger(input.pairId);
  if (pairId === null) return null;

  let candidates = gearStatsByPair.get(pairId);
  if (!candidates?.length) return null;

  const itemId = toInteger(input.itemId);
  if (itemId !== null) {
    candidates = candidates.filter((line) => line.itemId === itemId);
    if (!candidates.length) return null;
  }

  const pairSlot = toInteger(input.pairSlot);
  const selected = [...candidates].sort((left, right) => {
    if (pairSlot !== null) {
      const leftSlotMatch = left.pairSlot === pairSlot;
      const rightSlotMatch = right.pairSlot === pairSlot;
      if (leftSlotMatch !== rightSlotMatch) return leftSlotMatch ? -1 : 1;
    }
    return gearStatCandidateRank(right) - gearStatCandidateRank(left);
  })[0];
  if (!selected) return null;

  return toGearStatLine(selected);
}

export function decodeGearStatLinesForItem(itemIdInput: number | string | null | undefined): GearStatLine[] {
  const itemId = toInteger(itemIdInput);

  if (itemId === null) {
    return [];
  }

  return [...manualGearStatOverrides, ...GEAR_STAT_DECODER_SEED]
    .filter((line) => line.itemId === itemId)
    .slice()
    .sort((left, right) => left.pairSlot - right.pairSlot)
    .map(toGearStatLine);
}

export function resolveGearItemName(itemIdInput: number | string | null | undefined, locale = "en"): string | null {
  const itemId = toInteger(itemIdInput);
  if (itemId === null) return null;
  return resolveItemName(itemId, locale) ?? gearNameByItem.get(itemId) ?? null;
}

export function resolveItemName(itemIdInput: number | string | null | undefined, locale = "en"): string | null {
  const itemId = toInteger(itemIdInput);
  if (itemId === null) return null;
  const entry = itemNameEntryByItem.get(itemId);
  const localizedName = entry ? chooseItemName(entry, locale) : null;
  if (localizedName) return localizedName;
  return itemNameByItem.get(itemId) ?? null;
}

export function formatGearStatValue(line: Pick<GearStatSeedLine, "value" | "valueKind">): string | null {
  if (line.valueKind === "locked") {
    return "Locked";
  }

  if (line.value === null) {
    return null;
  }

  const valueText = Number.isInteger(line.value) ? line.value.toString() : line.value.toFixed(2).replace(/\.?0+$/, "");

  if (line.valueKind === "percent") {
    return `${valueText}%`;
  }

  return valueText;
}

export function formatGearStatLine(line: Pick<GearStatSeedLine, "label" | "value" | "valueKind">): string {
  const valueText = formatGearStatValue(line);

  if (valueText === null || valueText === line.label) {
    return line.label;
  }

  return `${line.label} ${valueText}`;
}

export function canDisplayGearStatValue(line: Pick<GearStatSeedLine, "value" | "valueKind">): boolean {
  return formatGearStatValue(line) !== null;
}

function toGearStatLine(line: GearStatSeedLine): GearStatLine {
  return {
    ...line,
    valueText: formatGearStatValue(line),
    displayText: formatGearStatLine(line),
    canDisplayValue: canDisplayGearStatValue(line),
  };
}

function chooseItemName(entry: ItemNameEntry, locale: string): string | null {
  const localized = resolveLocalizedItemName(entry, locale);
  if (localized) return localized;

  const candidates = itemNameCandidates(entry);
  if (!candidates.length) return null;

  if (locale.toLowerCase().startsWith("en")) {
    return chooseEnglishItemName(candidates);
  }

  return (
    candidates.find((candidate) => candidate === entry.NameDesign?.trim()) ??
    chooseEnglishItemName(candidates) ??
    candidates[0] ??
    null
  );
}

function resolveLocalizedItemName(entry: ItemNameEntry, locale: string): string | null {
  if (!entry.Names || Array.isArray(entry.Names) || typeof entry.Names !== "object") {
    return null;
  }

  const requested = locale.trim();
  const lowered = requested.toLowerCase();
  const entries = Object.entries(entry.Names);
  const exact = entries.find(([key]) => key.toLowerCase() === lowered)?.[1];
  if (typeof exact === "string" && exact.trim()) return exact.trim();

  const base = lowered.split("-")[0];
  const sameLanguage = entries.find(([key]) => key.toLowerCase().split("-")[0] === base)?.[1];
  if (typeof sameLanguage === "string" && sameLanguage.trim()) return sameLanguage.trim();

  const english = entries.find(([key]) => key.toLowerCase() === "en")?.[1];
  if (typeof english === "string" && english.trim()) return english.trim();

  return null;
}

function itemNameCandidates(entry: ItemNameEntry): string[] {
  const seen = new Set<string>();
  const names = Array.isArray(entry.Names)
    ? entry.Names
    : entry.Names && typeof entry.Names === "object"
      ? Object.values(entry.Names)
      : [];
  const values = [...names, entry.NameDesign]
    .filter((candidate): candidate is string => typeof candidate === "string")
    .map((candidate) => candidate.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return values.filter((candidate) => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

function chooseEnglishItemName(candidates: string[]): string | null {
  const scored = candidates
    .map((name, index) => ({ name, score: englishItemNameScore(name, index) }))
    .filter((entry) => entry.score > -100)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.name ?? candidates[0] ?? null;
}

function englishItemNameScore(name: string, index: number): number {
  if (!/^[\x20-\x7e]+$/.test(name)) return -1000 + index / 1000;

  const lower = name.toLowerCase();
  let score = 10 + index / 1000;
  const englishTerms = [
    "advanced",
    "advance",
    "agility",
    "bracer",
    "bracers",
    "book",
    "boots",
    "charm",
    "dominion",
    "earring",
    "earrings",
    "gauntlets",
    "gloves",
    "guardian",
    "highland",
    "jasper",
    "legendary",
    "lethal",
    "lv.",
    "mastery",
    "ring",
  ];
  for (const term of englishTerms) {
    if (lower.includes(term)) score += 4;
  }

  if (/\blv\.\s*\d+/i.test(name)) score += 8;
  if (/\blegendary\b/i.test(name)) score += 8;
  if (/\badvanced\b/i.test(name)) score += 3;
  if (/^\[[^\]]+\]/.test(name)) score -= 10;
  if (/\b(?:de|des|das|der|niv|nv|st)\.?\b/i.test(name)) score -= 20;
  if (/(gantelets|boucles|aros|brincos|manoplas|bracelete|brassards|libro|manuel|fortschritts)/i.test(name)) {
    score -= 40;
  }

  return score;
}

function gearStatCandidateRank(line: GearStatSeedLine): number {
  let rank = 0;
  if (line.source === "observed-proof") rank += 8;
  if (line.value !== null && line.valueKind !== "unknown") rank += 4;
  if (line.label && line.label !== "Locked") rank += 2;
  if (line.proofConfidence === "high") rank += 2;
  if (line.evaluatorConfidence === "high") rank += 1;
  return rank;
}

function pushGearStatPairLine(line: GearStatSeedLine): void {
  const pairLines = gearStatsByPair.get(line.pairId) ?? [];
  pairLines.push(line);
  gearStatsByPair.set(line.pairId, pairLines);
}

function buildPairFallback(input: {
  pairId: number;
  label: string;
  value: number;
  valueKind: GearStatValueKind;
}): GearStatSeedLine {
  return {
    itemId: 0,
    itemName: "",
    wearingLevel: 0,
    pairSlot: 0,
    pairId: input.pairId,
    attrLibId: 0,
    attrLibIndex: "",
    label: input.label,
    value: input.value,
    valueKind: input.valueKind,
    lane: "legendary-affix",
    basicGrowRangeId: 0,
    basicAttrGrowRowId: 0,
    proofStatus: "structural-match",
    proofConfidence: "high",
    evaluatorConfidence: "high",
    source: "inferred-proof",
  };
}

function buildManualGearStat(input: {
  itemId: number;
  itemName: string;
  wearingLevel: number;
  pairSlot: number;
  pairId: number;
  label: string;
  value: number | null;
  valueKind: GearStatValueKind;
  lane: GearStatLane;
}): GearStatSeedLine {
  return {
    itemId: input.itemId,
    itemName: input.itemName,
    wearingLevel: input.wearingLevel,
    pairSlot: input.pairSlot,
    pairId: input.pairId,
    attrLibId: 0,
    attrLibIndex: "",
    label: input.label,
    value: input.value,
    valueKind: input.valueKind,
    lane: input.lane,
    basicGrowRangeId: 0,
    basicAttrGrowRowId: 0,
    proofStatus: input.valueKind === "locked" ? "structural-match" : "value-match",
    proofConfidence: "high",
    evaluatorConfidence: "high",
    source: "observed-proof",
  };
}

function itemSlotKey(itemId: number, pairSlot: number): string {
  return `${itemId}:${pairSlot}`;
}

function itemPairKey(itemId: number, pairId: number): string {
  return `${itemId}:${pairId}`;
}

function itemAttrLibSlotKey(itemId: number, attrLibId: number, pairSlot: number): string {
  return `${itemId}:${attrLibId}:${pairSlot}`;
}

function toInteger(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);

    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}
