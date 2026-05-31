import buffNameData from "$parserData/generated/BuffName.json";
import modifierDisplayTableData from "$parserData/generated/ModifierDisplayTable.json";
import monsterNameData from "$parserData/generated/monsternames.json";
import {
  DEFAULT_LOCALE,
  PRIMARY_FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  isLocaleCode,
  type LocaleCode,
} from "$lib/i18n";
import { settings } from "$lib/settings-store";
import { BUFF_ICON_FILE_BY_ID } from "./buff-icon-map.generated";
import { BUFF_ICON_FILES } from "./buff-icon-files.generated";

export type BuffAliasMap = Record<string, string>;
export type BuffCategoryKey = "food" | "alchemy";

export type BuffDefinition = {
  baseId: number;
  name: string;
  spriteFile: string;
  searchKeywords: string[];
};

export type BuffNameInfo = {
  baseId: number;
  name: string;
  hasSpriteFile: boolean;
};

export type BuffMeta = {
  baseId: number;
  defaultName: string;
  hasSpriteFile: boolean;
  spriteFile: string | null;
  iconKey: string | null;
  categories: BuffCategoryKey[];
  searchKeywords: string[];
};

export type BuffCategoryDefinition = {
  key: BuffCategoryKey;
  label: string;
  count: number;
};

type MultiLangValue = Partial<Record<LocaleCode | "design" | "und", string>>;
type MultiLangKeywords = Partial<Record<LocaleCode, string[]>>;

type RawBuffEntry = {
  Id: number;
  Icon?: string | null;
  IconPath?: string | null;
  DesignName?: string | null;
  Name?: string | null;
  NameDesign?: string | null;
  Names?: unknown;
  SpriteFile?: string | null;
};

type RawMonsterNameEntry = {
  Id?: number;
  Name?: string | null;
  NameDesign?: string | null;
  DesignName?: string | null;
  Names?: unknown;
};

type ModifierDisplaySourceEntry = {
  sourceId?: string;
  sourceName?: string;
  sourceNames?: unknown;
};

type ModifierDisplayTableData = {
  sourcesByRuleId?: Record<string, ModifierDisplaySourceEntry>;
};

type BuffSearchTranslationEntry = {
  name?: MultiLangValue;
  keywords?: MultiLangKeywords;
  notes?: MultiLangValue;
  overlayAlias?: MultiLangValue;
  categories?: BuffCategoryKey[];
  iconKey?: string | null;
  spriteFile?: string | null;
  hasSpriteFile?: boolean;
};

type BuffSearchIndexEntry = {
  baseId: number;
  texts: string[];
};

const DEFAULT_SEARCH_RESULT_LIMIT = 50;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function replaceRecordContents<T extends Record<string, any>>(target: T, source: T): void {
  for (const key of Object.keys(target)) {
    delete target[key as keyof T];
  }
  Object.assign(target, source);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRawDataEntries<T>(value: unknown): T[] {
  const values = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];

  return values.filter((entry): entry is T => isRecord(entry));
}

function collectMultiLangRecord(value: unknown): MultiLangValue {
  const out: MultiLangValue = {};
  if (!isRecord(value)) return out;

  for (const [locale, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "string") continue;
    const text = rawValue.trim();
    if (!text) continue;
    out[locale as keyof MultiLangValue] = text;
  }

  return out;
}

function collectAllMultiLangTexts(value: MultiLangValue | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const rawText of Object.values(value ?? {})) {
    const text = rawText?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }

  return out;
}

function addMergedMultiLangValue(
  target: MultiLangValue,
  source: MultiLangValue | undefined,
  overwrite = false,
): void {
  for (const [locale, rawValue] of Object.entries(source ?? {})) {
    const text = rawValue?.trim();
    if (!text) continue;
    const key = locale as keyof MultiLangValue;
    if (!overwrite && target[key]) continue;
    target[key] = text;
  }
}

function trimString(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function designNameCandidates(entry: RawBuffEntry): string[] {
  return [
    entry.NameDesign,
    entry.DesignName,
    entry.Name,
    isRecord(entry.Names) ? entry.Names["design"] : null,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function designOwnerTokens(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const tokens: string[] = [];
  const leadingCjk = trimmed.match(/^[\u3400-\u9fff]+/u)?.[0]?.trim();
  if (leadingCjk) tokens.push(leadingCjk);

  const delimiterPrefix = trimmed.split(/[-_－—–:：]/u)[0]?.trim();
  if (delimiterPrefix && delimiterPrefix !== trimmed) {
    tokens.push(delimiterPrefix);
  }

  return tokens.filter((token, index, values) => token.length >= 2 && values.indexOf(token) === index);
}

function addOwnerToken(
  ownerNamesByToken: Map<string, MultiLangValue>,
  token: string | null | undefined,
  names: MultiLangValue,
): void {
  const trimmed = token?.trim();
  if (!trimmed || trimmed.length < 2) return;

  const existing = ownerNamesByToken.get(trimmed) ?? {};
  addMergedMultiLangValue(existing, names);
  ownerNamesByToken.set(trimmed, existing);
}

function buildMonsterOwnerNameMap(): Map<string, MultiLangValue> {
  const ownerNamesByToken = new Map<string, MultiLangValue>();
  const monsterEntries = normalizeRawDataEntries<RawMonsterNameEntry>(monsterNameData);

  for (const entry of monsterEntries) {
    const names = collectMultiLangRecord(entry.Names);
    if (!names[PRIMARY_FALLBACK_LOCALE]) {
      const fallbackName = trimString(entry.Name);
      if (fallbackName) names[PRIMARY_FALLBACK_LOCALE] = fallbackName;
    }
    if (!names.design) {
      const designName = trimString(entry.NameDesign) || trimString(entry.DesignName);
      if (designName) names.design = designName;
    }
    if (Object.keys(names).length === 0) continue;

    const aliases = [
      ...collectAllMultiLangTexts(names),
      trimString(entry.Name),
      trimString(entry.NameDesign),
      trimString(entry.DesignName),
    ];

    for (const alias of aliases) {
      if (!alias) continue;
      addOwnerToken(ownerNamesByToken, alias, names);
      for (const token of designOwnerTokens(alias)) {
        addOwnerToken(ownerNamesByToken, token, names);
      }
    }
  }

  return ownerNamesByToken;
}

function hasLocalizedName(value: MultiLangValue | undefined): boolean {
  return SUPPORTED_LOCALES.some((locale) => Boolean(value?.[locale]?.trim()));
}

function buildModifierDisplayBuffSourceNameMap(): Map<number, MultiLangValue> {
  const sourceNamesByBuffId = new Map<number, MultiLangValue>();
  const modifierDisplayTable = modifierDisplayTableData as ModifierDisplayTableData;

  for (const source of Object.values(modifierDisplayTable.sourcesByRuleId ?? {})) {
    const match = /^buff-source:(\d+)$/.exec(source.sourceId ?? "");
    if (!match) continue;

    const buffId = Number(match[1]);
    if (!Number.isFinite(buffId)) continue;

    const names = collectMultiLangRecord(source.sourceNames);
    const sourceName = source.sourceName?.trim();
    if (sourceName && !names[PRIMARY_FALLBACK_LOCALE]) {
      names[PRIMARY_FALLBACK_LOCALE] = sourceName;
    }

    if (!hasLocalizedName(names)) continue;

    const existing = sourceNamesByBuffId.get(buffId) ?? {};
    addMergedMultiLangValue(existing, names);
    sourceNamesByBuffId.set(buffId, existing);
  }

  return sourceNamesByBuffId;
}

const BUFF_SEARCH_TRANSLATIONS: Record<string, BuffSearchTranslationEntry> = {};

const BUFF_GENERATED_NAMES_BY_ID = new Map<number, MultiLangValue>();
const BUFF_SEARCH_INDEX: BuffSearchIndexEntry[] = [];
const BUFF_SEARCH_INDEX_MAP = new Map<number, string[]>();
const BUFF_ICON_FILE_BY_BASE_ID = BUFF_ICON_FILE_BY_ID as Record<string, string>;
const BUFF_ICON_FILE_BY_STEM = new Map<string, string>();
const MONSTER_OWNER_NAMES_BY_TOKEN = buildMonsterOwnerNameMap();
const MODIFIER_DISPLAY_BUFF_SOURCE_NAMES_BY_ID = buildModifierDisplayBuffSourceNameMap();

const BURN_EFFECT_NAMES: MultiLangValue = {
  en: "Burn",
  "zh-CN": "燃烧",
  "zh-TW": "燃燒",
  ja: "バーニング",
  "ko-KR": "연소",
  fr: "Brûlure",
  de: "Verbrennung",
  es: "Quemadura",
  "pt-BR": "Queimadura",
  th: "เผาไหม้",
  id: "Burn",
};

const S2_SET_4B_DESIGN_NAME = "\u3010S2\u5957\u88c54B\u3011";
const S2_SET_4B_SUB_BUFF_DESIGN_NAME = `${S2_SET_4B_DESIGN_NAME}-\u5b50BUFF`;

const S2_SET_4B_NAMES: MultiLangValue = {
  en: "S2 Set 4B",
  "zh-CN": "S2套装4B",
  "zh-TW": "S2套裝4B",
  ja: "S2セット4B",
  "ko-KR": "S2 세트 4B",
  fr: "S2 Set 4B",
  de: "S2-Set 4B",
  es: "S2 Set 4B",
  "pt-BR": "S2 Set 4B",
  th: "S2 Set 4B",
  id: "S2 Set 4B",
  design: S2_SET_4B_DESIGN_NAME,
};

const S2_SET_4B_SHIELD_NAMES: MultiLangValue = {
  en: "S2 Set 4B Shield",
  "zh-CN": "S2套装4B护盾",
  "zh-TW": "S2套裝4B護盾",
  ja: "S2セット4Bシールド",
  "ko-KR": "S2 세트 4B 보호막",
  fr: "Bouclier S2 Set 4B",
  de: "S2-Set-4B-Schild",
  es: "Escudo S2 Set 4B",
  "pt-BR": "Escudo S2 Set 4B",
  th: "โล่ S2 Set 4B",
  id: "Perisai S2 Set 4B",
  design: S2_SET_4B_SUB_BUFF_DESIGN_NAME,
};

const MOONLIGHT_SOLACE_SHIELD_DESIGN_NAME = "蓝花花护盾";
const MOONLIGHT_SOLACE_SHIELD_NAMES: MultiLangValue = {
  en: "Moonlight Solace Shield",
  "zh-CN": "苍月慰藉护盾",
  "zh-TW": "蒼月慰藉護盾",
  ja: "蒼月の慰めバリア",
  "ko-KR": "창월의 위로 보호막",
  fr: "Bouclier Réconfort du clair de Lune",
  de: "Mondschein-Trost-Schild",
  es: "Escudo Solaz Claroluna",
  "pt-BR": "Escudo Consolo Lunar",
  th: "โล่ Moonlight Solace",
  id: "Shield Moonlight Solace",
  design: MOONLIGHT_SOLACE_SHIELD_DESIGN_NAME,
};

const BUFF_ID_NAME_FALLBACKS: Record<number, MultiLangValue> = {
  // 2208181 is a Burn damage/buff source row. The generated parent-recount
  // bridge can incorrectly inherit Explosion, which is a separate TWAX proc.
  2208181: BURN_EFFECT_NAMES,
  2202705: MOONLIGHT_SOLACE_SHIELD_NAMES,
  2404271: S2_SET_4B_SHIELD_NAMES,
};

const DESIGN_ONLY_BUFF_NAME_FALLBACKS: Record<string, MultiLangValue> = {
  [S2_SET_4B_DESIGN_NAME]: S2_SET_4B_NAMES,
  [S2_SET_4B_SUB_BUFF_DESIGN_NAME]: S2_SET_4B_SHIELD_NAMES,
  [MOONLIGHT_SOLACE_SHIELD_DESIGN_NAME]: MOONLIGHT_SOLACE_SHIELD_NAMES,
  "生命屏障": {
    en: "Life Barrier",
    "zh-CN": "生命屏障",
    "zh-TW": "生命屏障",
    ja: "ライフバリア",
    "ko-KR": "체력 장벽",
    fr: "Barrière de vie",
    de: "Lebensbarriere",
    es: "Barrera Vital",
    "pt-BR": "Barreira de Vida",
    th: "บาเรียชีวิต",
    id: "Life Barrier",
    design: "生命屏障",
  },
  "生命屏障护盾": {
    en: "Life Barrier Shield",
    "zh-CN": "生命屏障护盾",
    "zh-TW": "生命屏障護盾",
    ja: "ライフバリアシールド",
    "ko-KR": "체력 장벽 보호막",
    fr: "Bouclier de barrière de vie",
    de: "Lebensbarriere-Schild",
    es: "Escudo de Barrera Vital",
    "pt-BR": "Escudo de Barreira de Vida",
    th: "โล่บาเรียชีวิต",
    id: "Shield Life Barrier",
    design: "生命屏障护盾",
  },
  "护盾": {
    en: "Shield",
    "zh-CN": "护盾",
    "zh-TW": "護盾",
    ja: "シールド",
    "ko-KR": "보호막",
    fr: "Bouclier",
    de: "Schild",
    es: "Escudo",
    "pt-BR": "Escudo",
    th: "โล่",
    id: "Shield",
    design: "护盾",
  },
  "生存小招-生命护盾": {
    en: "Survival Skill - Life Shield",
    "zh-CN": "生存小招-生命护盾",
    "zh-TW": "生存小招-生命護盾",
    ja: "サバイバルスキル - ライフシールド",
    "ko-KR": "생존 스킬 - 생명 보호막",
    fr: "Compétence de survie - Bouclier de vie",
    de: "Überlebensfähigkeit - Lebensschild",
    es: "Habilidad de supervivencia - Escudo de vida",
    "pt-BR": "Habilidade de sobrevivência - Escudo de vida",
    th: "สกิลเอาตัวรอด - โล่ชีวิต",
    id: "Skill Bertahan - Shield Nyawa",
    design: "生存小招-生命护盾",
  },
  "生存小招-生命护盾-护盾": {
    en: "Survival Skill - Life Shield",
    "zh-CN": "生存小招-生命护盾-护盾",
    "zh-TW": "生存小招-生命護盾-護盾",
    ja: "サバイバルスキル - ライフシールド",
    "ko-KR": "생존 스킬 - 생명 보호막",
    fr: "Compétence de survie - Bouclier de vie",
    de: "Überlebensfähigkeit - Lebensschild",
    es: "Habilidad de supervivencia - Escudo de vida",
    "pt-BR": "Habilidade de sobrevivência - Escudo de vida",
    th: "สกิลเอาตัวรอด - โล่ชีวิต",
    id: "Skill Bertahan - Shield Nyawa",
    design: "生存小招-生命护盾-护盾",
  },
  "献祭护盾": {
    en: "Sacrifice Shield",
    "zh-CN": "献祭护盾",
    "zh-TW": "獻祭護盾",
    ja: "サクリファイスシールド",
    "ko-KR": "희생 보호막",
    fr: "Bouclier de sacrifice",
    de: "Opferschild",
    es: "Escudo de sacrificio",
    "pt-BR": "Escudo de Sacrifício",
    th: "โล่สังเวย",
    id: "Shield Pengorbanan",
    design: "献祭护盾",
  },
  "罗罗拉-主动记时": {
    en: "Rorola - Active Timer",
    "zh-CN": "罗罗拉 - 主动计时",
    "zh-TW": "羅羅拉 - 主動計時",
    ja: "ロローラ - アクティブタイマー",
    "ko-KR": "로로라 - 액티브 타이머",
    fr: "Rorola - Minuteur actif",
    de: "Rorola - Aktiver Timer",
    es: "Rorola - Temporizador activo",
    "pt-BR": "Rorula - Temporizador ativo",
    th: "Rorola - ตัวจับเวลาใช้งาน",
    id: "Lorola - Timer Aktif",
    design: "罗罗拉-主动记时",
  },
  "梦幻之箭层数": {
    en: "Phantom Arrow stacks",
    "zh-CN": "梦幻之箭层数",
    "zh-TW": "夢幻之箭層數",
    ja: "幻影の矢スタック",
    "ko-KR": "환영 화살 중첩",
    fr: "Cumuls de Flèche fantôme",
    de: "Phantompfeil-Stapel",
    es: "Acumulaciones de Flecha fantasma",
    "pt-BR": "Acúmulos de Flecha Fantasma",
    th: "สแต็ก Phantom Arrow",
    id: "Stack Phantom Arrow",
    design: "梦幻之箭层数",
  },
  "梦幻之箭内置CD": {
    en: "Phantom Arrow internal CD",
    "zh-CN": "梦幻之箭内置CD",
    "zh-TW": "夢幻之箭內置CD",
    ja: "幻影の矢 内部CD",
    "ko-KR": "환영 화살 내부 재사용 대기시간",
    fr: "Temps de recharge interne de Flèche fantôme",
    de: "Interne Abklingzeit von Phantompfeil",
    es: "Recarga interna de Flecha fantasma",
    "pt-BR": "Recarga interna de Flecha Fantasma",
    th: "คูลดาวน์ภายใน Phantom Arrow",
    id: "Cooldown internal Phantom Arrow",
    design: "梦幻之箭内置CD",
  },
};

const DESIGN_ONLY_SUFFIX_FALLBACKS: Record<string, MultiLangValue> = {
  "主动记时": {
    en: "Active Timer",
    "zh-CN": "主动计时",
    "zh-TW": "主動計時",
    ja: "アクティブタイマー",
    "ko-KR": "액티브 타이머",
    fr: "Minuteur actif",
    de: "Aktiver Timer",
    es: "Temporizador activo",
    "pt-BR": "Temporizador ativo",
    th: "ตัวจับเวลาใช้งาน",
    id: "Timer Aktif",
    design: "主动记时",
  },
  "玩家身上监控": {
    en: "Player Monitor",
    "zh-CN": "玩家身上监控",
    "zh-TW": "玩家身上監控",
    ja: "プレイヤー監視",
    "ko-KR": "플레이어 모니터",
    fr: "Surveillance du joueur",
    de: "Spielerüberwachung",
    es: "Monitor de jugador",
    "pt-BR": "Monitor de jogador",
    th: "ติดตามผู้เล่น",
    id: "Monitor Pemain",
    design: "玩家身上监控",
  },
  "体力显示-中枢管理": {
    en: "Stamina Display - Core Control",
    "zh-CN": "体力显示-中枢管理",
    "zh-TW": "體力顯示-中樞管理",
    design: "体力显示-中枢管理",
  },
  "体力层数": {
    en: "Stamina Stacks",
    "zh-CN": "体力层数",
    "zh-TW": "體力層數",
    design: "体力层数",
  },
  "静止状态下回体力": {
    en: "Stamina Recovery While Stationary",
    "zh-CN": "静止状态下回体力",
    "zh-TW": "靜止狀態下回體力",
    design: "静止状态下回体力",
  },
};

export async function initializeBuffSearchRuntimeData(): Promise<void> {
  rebuildBuffSearchIndex();
}

export async function reloadBuffSearchRuntimeData(): Promise<void> {
  rebuildBuffSearchIndex();
}

const rawBuffEntries = normalizeRawDataEntries<RawBuffEntry>(buffNameData);

const BUFF_META_MAP = new Map<number, BuffMeta>();
const AVAILABLE_BUFF_IDS_WITH_SPRITE: number[] = [];
const BUFF_CATEGORY_CATALOG: Record<
  BuffCategoryKey,
  { label: string; buffIds: number[] }
> = {
  food: { label: "食物", buffIds: [] },
  alchemy: { label: "炼金", buffIds: [] },
};

for (const fileName of BUFF_ICON_FILES) {
  const stem = fileName
    .replace(/\.png$/i, "")
    .replace(/_[+-]?\d{10,}$/i, "");
  const existing = BUFF_ICON_FILE_BY_STEM.get(stem);
  if (!existing || fileName === `${stem}.png`) {
    BUFF_ICON_FILE_BY_STEM.set(stem, fileName);
  }
}

function iconStemFromReference(reference: string | null | undefined): string | null {
  const trimmed = reference?.trim();
  if (!trimmed) return null;

  const fileName = trimmed.split(/[\\/]/).pop()?.trim();
  if (!fileName) return null;

  return fileName
    .replace(/\.png$/i, "")
    .replace(/_[+-]?\d{10,}$/i, "");
}

function resolveBuffSpriteFile(...references: Array<string | null | undefined>): string | null {
  for (const reference of references) {
    const trimmed = reference?.trim();
    if (trimmed && /^[^\\/]+\.png$/i.test(trimmed)) {
      return trimmed;
    }

    const stem = iconStemFromReference(reference);
    if (!stem) continue;

    const matchedFile = BUFF_ICON_FILE_BY_STEM.get(stem);
    if (matchedFile) return matchedFile;
  }

  return null;
}

function resolveBuffCategories(
  _defaultName: string,
  iconKey: string | null,
): BuffCategoryKey[] {
  const categories: BuffCategoryKey[] = [];
  const iconStem = iconStemFromReference(iconKey);

  if (iconStem?.startsWith("buff_food_up")) {
    categories.push("food");
  }

  if (iconStem?.startsWith("buff_agentia_up")) {
    categories.push("alchemy");
  }

  return categories;
}

function collectGeneratedBuffNames(entry: RawBuffEntry): MultiLangValue {
  const out = collectMultiLangRecord(entry.Names);

  const fallback = trimString(entry.NameDesign) || trimString(entry.Name) || trimString(entry.DesignName);
  if (fallback && !out.design) {
    out.design = fallback;
  }

  return out;
}

function findDesignFallbackNames(entry: RawBuffEntry): MultiLangValue | undefined {
  for (const candidate of designNameCandidates(entry)) {
    const fallback = DESIGN_ONLY_BUFF_NAME_FALLBACKS[candidate];
    if (fallback) return fallback;
  }

  const ownerSuffixFallback = findDesignOwnerSuffixFallbackNames(entry);
  if (ownerSuffixFallback) return ownerSuffixFallback;

  return undefined;
}

function findBuffIdFallbackNames(entry: RawBuffEntry): MultiLangValue | undefined {
  return BUFF_ID_NAME_FALLBACKS[entry.Id];
}

function findModifierDisplayFallbackNames(
  entry: RawBuffEntry,
  names: MultiLangValue,
): MultiLangValue | undefined {
  if (hasLocalizedName(names)) return undefined;

  const sourceNames = MODIFIER_DISPLAY_BUFF_SOURCE_NAMES_BY_ID.get(entry.Id);
  return hasLocalizedName(sourceNames) ? sourceNames : undefined;
}

function findDesignMonsterOwnerNames(entry: RawBuffEntry): MultiLangValue | undefined {
  for (const candidate of designNameCandidates(entry)) {
    for (const token of designOwnerTokens(candidate)) {
      const names = MONSTER_OWNER_NAMES_BY_TOKEN.get(token);
      if (names) return names;
    }
  }

  return undefined;
}

function splitDesignOwnerSuffix(
  value: string,
): { ownerToken: string; suffix: string } | null {
  const trimmed = value.trim();
  const tokens = designOwnerTokens(trimmed)
    .filter((token) => MONSTER_OWNER_NAMES_BY_TOKEN.has(token))
    .sort((a, b) => b.length - a.length);

  for (const ownerToken of tokens) {
    if (!trimmed.startsWith(ownerToken)) continue;

    const suffix = trimmed
      .slice(ownerToken.length)
      .replace(/^[-_－—–:：\s]+/u, "")
      .trim();

    if (suffix) {
      return { ownerToken, suffix };
    }
  }

  return null;
}

function composeOwnerSuffixNames(
  ownerNames: MultiLangValue,
  suffixNames: MultiLangValue,
): MultiLangValue {
  const out: MultiLangValue = {};
  const localeKeys: Array<LocaleCode | "design"> = [...SUPPORTED_LOCALES, "design"];

  for (const locale of localeKeys) {
    const ownerName = ownerNames[locale]
      || ownerNames[PRIMARY_FALLBACK_LOCALE]
      || ownerNames[DEFAULT_LOCALE]
      || ownerNames.design;
    const suffixName = suffixNames[locale]
      || suffixNames[PRIMARY_FALLBACK_LOCALE]
      || suffixNames[DEFAULT_LOCALE]
      || suffixNames.design;

    if (ownerName && suffixName) {
      out[locale] = `${ownerName} - ${suffixName}`;
    }
  }

  return out;
}

function findDesignOwnerSuffixFallbackNames(entry: RawBuffEntry): MultiLangValue | undefined {
  for (const candidate of designNameCandidates(entry)) {
    const parts = splitDesignOwnerSuffix(candidate);
    if (!parts) continue;

    const ownerNames = MONSTER_OWNER_NAMES_BY_TOKEN.get(parts.ownerToken);
    const suffixNames = DESIGN_ONLY_SUFFIX_FALLBACKS[parts.suffix];
    if (!ownerNames || !suffixNames) continue;

    const composed = composeOwnerSuffixNames(ownerNames, suffixNames);
    if (Object.keys(composed).length > 0) {
      return composed;
    }
  }

  return undefined;
}

function composeOwnerQualifiedBuffNames(
  entry: RawBuffEntry,
  names: MultiLangValue,
): MultiLangValue | undefined {
  const ownerNames = findDesignMonsterOwnerNames(entry);
  if (!ownerNames) return undefined;

  const out: MultiLangValue = {};
  for (const locale of SUPPORTED_LOCALES) {
    const ownerName = ownerNames[locale]
      || ownerNames[PRIMARY_FALLBACK_LOCALE]
      || ownerNames[DEFAULT_LOCALE]
      || ownerNames.design;
    const buffName = names[locale]
      || names[PRIMARY_FALLBACK_LOCALE]
      || names[DEFAULT_LOCALE];

    if (ownerName && buffName && normalizeText(ownerName) !== normalizeText(buffName)) {
      out[locale] = `${ownerName} - ${buffName}`;
    }
  }

  const designName = designNameCandidates(entry)[0] ?? names.design;
  if (designName) {
    out.design = designName;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function enrichGeneratedBuffNames(entry: RawBuffEntry, names: MultiLangValue): MultiLangValue {
  const enriched: MultiLangValue = {};
  addMergedMultiLangValue(enriched, findDesignFallbackNames(entry));
  addMergedMultiLangValue(enriched, findBuffIdFallbackNames(entry));
  addMergedMultiLangValue(enriched, findModifierDisplayFallbackNames(entry, names));
  addMergedMultiLangValue(enriched, names, true);
  addMergedMultiLangValue(enriched, composeOwnerQualifiedBuffNames(entry, names), true);
  return enriched;
}

function collectBuffGeneratedSearchKeywords(
  entry: RawBuffEntry,
  generatedNames: MultiLangValue,
): string[] {
  const keywords = new Set<string>();

  for (const text of collectAllMultiLangTexts(findDesignFallbackNames(entry))) {
    keywords.add(text);
  }

  for (const text of collectAllMultiLangTexts(findDesignMonsterOwnerNames(entry))) {
    keywords.add(text);
  }

  for (const text of designNameCandidates(entry)) {
    keywords.add(text);
  }

  for (const text of collectAllMultiLangTexts(generatedNames)) {
    keywords.add(text);
  }

  return Array.from(keywords);
}

for (const entry of rawBuffEntries) {
  const generatedNames = enrichGeneratedBuffNames(entry, collectGeneratedBuffNames(entry));
  const defaultName = generatedNames[PRIMARY_FALLBACK_LOCALE]
    || generatedNames[DEFAULT_LOCALE]
    || generatedNames.design
    || trimString(entry.NameDesign)
    || trimString(entry.Name)
    || trimString(entry.DesignName);
  if (!defaultName) continue;
  BUFF_GENERATED_NAMES_BY_ID.set(entry.Id, generatedNames);

  const iconKey = entry.Icon?.trim() || entry.IconPath?.trim() || null;
  const spriteFile = resolveBuffSpriteFile(
    BUFF_ICON_FILE_BY_BASE_ID[String(entry.Id)] ?? null,
    entry.SpriteFile,
    entry.IconPath,
    entry.Icon,
  );
  const categories = resolveBuffCategories(defaultName, iconKey);
  const searchKeywords = [
    defaultName,
    ...collectBuffGeneratedSearchKeywords(entry, generatedNames),
  ];
  const meta: BuffMeta = {
    baseId: entry.Id,
    defaultName,
    hasSpriteFile: Boolean(spriteFile),
    spriteFile,
    iconKey,
    categories,
    searchKeywords,
  };
  BUFF_META_MAP.set(entry.Id, meta);

  for (const category of categories) {
    BUFF_CATEGORY_CATALOG[category].buffIds.push(entry.Id);
  }

  if (spriteFile) {
    AVAILABLE_BUFF_IDS_WITH_SPRITE.push(entry.Id);
  }
}

AVAILABLE_BUFF_IDS_WITH_SPRITE.sort((a, b) => a - b);
for (const category of Object.values(BUFF_CATEGORY_CATALOG)) {
  category.buffIds.sort((a, b) => a - b);
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/cooldowns?/g, "cd")
    .replace(/cool\s+downs?/g, "cd")
    .replace(/cds/g, "cd");
}

function getCurrentLocale(localeOverride?: LocaleCode): LocaleCode {
  if (localeOverride && isLocaleCode(localeOverride)) {
    return localeOverride;
  }

  const locale = String(settings.state.live.general.language);

  if (isLocaleCode(locale)) {
    return locale;
  }

  return DEFAULT_LOCALE;
}

function resolveMultiLangValue(
  value: MultiLangValue | undefined,
  fallback: string,
  localeOverride?: LocaleCode,
): string {
  const locale = getCurrentLocale(localeOverride);
  const selected = value?.[locale]?.trim();
  if (selected) return selected;

  if (locale !== PRIMARY_FALLBACK_LOCALE) {
    const en = value?.[PRIMARY_FALLBACK_LOCALE]?.trim();
    if (en) return en;
  }

  if (locale !== DEFAULT_LOCALE) {
    const zh = value?.[DEFAULT_LOCALE]?.trim();
    if (zh) return zh;
  }

  return fallback;
}

function getDirectMultiLangValue(
  value: MultiLangValue | undefined,
  locale = getCurrentLocale(),
): string {
  return value?.[locale]?.trim() ?? "";
}

function collectMultiLangTexts(value: MultiLangValue | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const locale of SUPPORTED_LOCALES) {
    const text = value?.[locale]?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }

  return out;
}

function collectKeywordTexts(value: MultiLangKeywords | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const locale of SUPPORTED_LOCALES) {
    for (const keyword of value?.[locale] ?? []) {
      const trimmed = keyword.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }

  return out;
}

function lookupBuffSearchEntry(baseId: number): BuffSearchTranslationEntry | undefined {
  return BUFF_SEARCH_TRANSLATIONS[String(baseId)];
}

function resolveEffectiveBuffCategories(meta: BuffMeta): BuffCategoryKey[] {
  const entryCategories = normalizeBuffCategoryKeys(
    lookupBuffSearchEntry(meta.baseId)?.categories,
  );

  if (entryCategories.length > 0) {
    return entryCategories;
  }

  return normalizeBuffCategoryKeys(meta.categories);
}


function rebuildBuffSearchIndex(): void {
  BUFF_SEARCH_INDEX.length = 0;
  BUFF_SEARCH_INDEX_MAP.clear();

  for (const meta of BUFF_META_MAP.values()) {
    const texts = collectBuffSearchTexts(meta);
    if (texts.length === 0) {
      continue;
    }

    BUFF_SEARCH_INDEX.push({
      baseId: meta.baseId,
      texts,
    });
    BUFF_SEARCH_INDEX_MAP.set(meta.baseId, texts);
  }
}

function resolveBuffTranslatedName(
  baseId: number,
  fallback: string,
  localeOverride?: LocaleCode,
): string {
  return resolveGeneratedBuffName(baseId, localeOverride) || fallback;
}

function resolveGeneratedBuffName(
  baseId: number,
  localeOverride?: LocaleCode,
): string {
  return resolveMultiLangValue(BUFF_GENERATED_NAMES_BY_ID.get(baseId), "", localeOverride);
}

function resolveBuffSearchTranslatedName(
  baseId: number,
  fallback: string,
  localeOverride?: LocaleCode,
): string {
  const generatedName = resolveGeneratedBuffName(baseId, localeOverride);
  if (generatedName) return generatedName;

  return resolveMultiLangValue(
    lookupBuffSearchEntry(baseId)?.name,
    fallback,
    localeOverride,
  );
}

function resolveBuffOverlayAlias(baseId: number, localeOverride?: LocaleCode): string {
  return resolveMultiLangValue(lookupBuffSearchEntry(baseId)?.overlayAlias, "", localeOverride);
}

export function getDirectBuffOverlayAlias(baseId: number): string {
  return getDirectMultiLangValue(lookupBuffSearchEntry(baseId)?.overlayAlias);
}

export function getConfiguredBuffOverlayAliasIds(
  aliases?: BuffAliasMap,
): number[] {
  const directLocale = getCurrentLocale();
  const idSet = new Set<number>();

  for (const [baseId, entry] of Object.entries(BUFF_SEARCH_TRANSLATIONS)) {
    const id = Number(baseId);
    if (!Number.isFinite(id)) continue;
    const directOverlayAlias = getDirectMultiLangValue(entry.overlayAlias, directLocale);
    if (directOverlayAlias) {
      idSet.add(id);
    }
  }

  for (const baseId of Object.keys(normalizeAliasMap(aliases))) {
    const id = Number(baseId);
    if (Number.isFinite(id)) {
      idSet.add(id);
    }
  }

  return Array.from(idSet).sort((a, b) => a - b);
}

function buildSearchTranslationSeed(baseId: number): BuffSearchTranslationEntry {
  const meta = lookupBuffMeta(baseId);
  const defaultName = meta?.defaultName ?? `#${baseId}`;

  return {
    name: {
      [DEFAULT_LOCALE]: resolveBuffTranslatedName(baseId, defaultName),
    },
    notes: {},
    overlayAlias: {},
    keywords: {},
    categories: meta ? resolveEffectiveBuffCategories(meta) : [],
    iconKey: meta?.iconKey ?? null,
    spriteFile: meta?.spriteFile ?? null,
    hasSpriteFile: meta?.hasSpriteFile ?? false,
  };
}

export async function saveBuffOverlayAlias(
  baseId: number,
  overlayAlias: string,
): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const locale = getCurrentLocale();
  const nextTranslations = cloneJson(BUFF_SEARCH_TRANSLATIONS);
  const key = String(baseId);
  const nextEntry = {
    ...buildSearchTranslationSeed(baseId),
    ...(nextTranslations[key] ?? {}),
  } satisfies BuffSearchTranslationEntry;

  nextEntry.overlayAlias = {
    ...(nextEntry.overlayAlias ?? {}),
    [locale]: overlayAlias.trim(),
  };

  nextTranslations[key] = nextEntry;

  replaceRecordContents(BUFF_SEARCH_TRANSLATIONS, nextTranslations);
  rebuildBuffSearchIndex();

  return { ok: true };
}

function collectBuffSearchTexts(meta: BuffMeta): string[] {
  const searchEntry = lookupBuffSearchEntry(meta.baseId);
  const texts = new Set<string>();

  const idText = String(meta.baseId);
  texts.add(idText);
  texts.add(`#${idText}`);

  const normalizedDefaultName = normalizeText(meta.defaultName);
  if (normalizedDefaultName) texts.add(normalizedDefaultName);

  for (const text of meta.searchKeywords) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  for (const text of collectMultiLangTexts(BUFF_GENERATED_NAMES_BY_ID.get(meta.baseId))) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  for (const text of collectKeywordTexts(searchEntry?.keywords)) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  for (const text of collectMultiLangTexts(searchEntry?.notes)) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  for (const text of collectMultiLangTexts(searchEntry?.overlayAlias)) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  return Array.from(texts);
}

rebuildBuffSearchIndex();

function getIndexedSearchTexts(baseId: number): string[] {
  return BUFF_SEARCH_INDEX_MAP.get(baseId) ?? [];
}

export function normalizeBuffCategoryKeys(
  categories?: BuffCategoryKey[] | null,
): BuffCategoryKey[] {
  const normalized = new Set<BuffCategoryKey>();
  for (const category of categories ?? []) {
    if (category === "food" || category === "alchemy") {
      normalized.add(category);
    }
  }
  return Array.from(normalized);
}

function normalizeAliasMap(aliases?: BuffAliasMap): BuffAliasMap {
  if (!aliases) return {};
  const next: BuffAliasMap = {};
  for (const [baseId, alias] of Object.entries(aliases)) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    next[baseId] = trimmed;
  }
  return next;
}

function getAlias(baseId: number, aliases?: BuffAliasMap): string | null {
  const normalizedAliases = normalizeAliasMap(aliases);
  const alias = normalizedAliases[String(baseId)]?.trim();
  return alias ? alias : null;
}

function getMatchRank(
  text: string | null | undefined,
  normalizedKeyword: string,
  exactRank: number,
  containsRank: number,
): number | null {
  if (!text) return null;
  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;
  if (normalizedText === normalizedKeyword) return exactRank;
  if (normalizedText.includes(normalizedKeyword)) return containsRank;
  return null;
}

export function lookupBuffMeta(baseId: number): BuffMeta | undefined {
  return BUFF_META_MAP.get(baseId);
}

export function lookupDefaultBuffName(baseId: number): string | undefined {
  return lookupBuffMeta(baseId)?.defaultName;
}

export function lookupBuffLocalizedNames(baseId: number): Record<string, string> | undefined {
  const names = BUFF_GENERATED_NAMES_BY_ID.get(baseId);
  if (!names) return undefined;

  const entries = Object.entries(names)
    .map(([locale, value]) => [locale, value?.trim() ?? ""] as const)
    .filter(([, value]) => value);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function getAvailableBuffDefinitions(): BuffDefinition[] {
  return AVAILABLE_BUFF_IDS_WITH_SPRITE.map((baseId) => {
    const meta = lookupBuffMeta(baseId);
    if (!meta?.spriteFile) {
      return {
        baseId,
        name: resolveBuffDisplayName(baseId),
        spriteFile: "",
        searchKeywords: [],
      };
    }

    return {
      baseId,
      name: resolveBuffDisplayName(baseId),
      spriteFile: meta.spriteFile,
      searchKeywords: getIndexedSearchTexts(baseId),
    };
  }).filter((definition) => Boolean(definition.spriteFile));
}

export function getBuffCategoryDefinitions(): BuffCategoryDefinition[] {
  const counts: Record<BuffCategoryKey, number> = {
    food: 0,
    alchemy: 0,
  };

  for (const meta of BUFF_META_MAP.values()) {
    for (const category of resolveEffectiveBuffCategories(meta)) {
      counts[category] += 1;
    }
  }

  return (Object.entries(BUFF_CATEGORY_CATALOG) as Array<
    [BuffCategoryKey, { label: string; buffIds: number[] }]
  >).map(([key, category]) => ({
    key,
    label: category.label,
    count: counts[key],
  }));
}

export function getBuffIdsByCategory(category: BuffCategoryKey): number[] {
  const buffIds: number[] = [];

  for (const meta of BUFF_META_MAP.values()) {
    if (resolveEffectiveBuffCategories(meta).includes(category)) {
      buffIds.push(meta.baseId);
    }
  }

  buffIds.sort((a, b) => a - b);
  return buffIds;
}

export function getBuffCategoryLabel(category: BuffCategoryKey): string {
  return BUFF_CATEGORY_CATALOG[category]?.label ?? category;
}

export function resolveBuffCategoryKey(
  baseId: number,
): BuffCategoryKey | undefined {
  const meta = lookupBuffMeta(baseId);
  if (!meta) return undefined;
  return resolveEffectiveBuffCategories(meta)[0];
}

export function expandBuffSelection(
  buffIds: number[],
  categories?: BuffCategoryKey[] | null,
): number[] {
  return Array.from(
    new Set([
      ...buffIds,
      ...normalizeBuffCategoryKeys(categories).flatMap((category) =>
        getBuffIdsByCategory(category),
      ),
    ]),
  );
}

export function lookupResolvedBuffBaseName(baseId: number): string | undefined {
  const defaultName = lookupDefaultBuffName(baseId);
  if (!defaultName) return undefined;
  return resolveBuffSearchTranslatedName(baseId, defaultName);
}

export function resolveBuffSearchDisplayName(
  baseId: number,
  aliases?: BuffAliasMap,
  localeOverride?: LocaleCode,
): string {
  const alias = getAlias(baseId, aliases);
  if (alias) return alias;

  return resolveBuffSearchTranslatedName(
    baseId,
    lookupDefaultBuffName(baseId) ?? `#${baseId}`,
    localeOverride,
  );
}

export function resolveBuffDisplayName(
  baseId: number,
  aliases?: BuffAliasMap,
  localeOverride?: LocaleCode,
): string {
  const alias = getAlias(baseId, aliases);
  if (alias) return alias;

  const defaultName = lookupDefaultBuffName(baseId) ?? `#${baseId}`;
  return resolveBuffTranslatedName(baseId, defaultName, localeOverride);
}

export function resolveBuffOverlayDisplayName(
  baseId: number,
  aliases?: BuffAliasMap,
  localeOverride?: LocaleCode,
): string {
  const alias = getAlias(baseId, aliases);
  if (alias) return alias;

  const overlayAlias = resolveBuffOverlayAlias(baseId, localeOverride);
  if (overlayAlias) return overlayAlias;

  return resolveBuffSearchDisplayName(baseId, aliases, localeOverride);
}

export function resolveBuffNameInfo(
  baseId: number,
  aliases?: BuffAliasMap,
  localeOverride?: LocaleCode,
): BuffNameInfo {
  const meta = lookupBuffMeta(baseId);
  return {
    baseId,
    name: resolveBuffSearchDisplayName(baseId, aliases, localeOverride),
    hasSpriteFile: meta?.hasSpriteFile ?? false,
  };
}

function isIconSearchableBuff(baseId: number): boolean {
  const meta = lookupBuffMeta(baseId);
  return Boolean(meta?.hasSpriteFile && meta.spriteFile);
}

function searchBuffs(
  keyword: string,
  aliases?: BuffAliasMap,
  limit?: number | null,
  matcher?: (baseId: number) => boolean,
): BuffNameInfo[] {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return [];

  const normalizedAliases = normalizeAliasMap(aliases);
  const matches: Array<{ baseId: number; rank: number }> = [];

  for (const entry of BUFF_SEARCH_INDEX) {
    if (matcher && !matcher(entry.baseId)) {
      continue;
    }

    const alias = normalizedAliases[String(entry.baseId)] ?? null;
    const aliasRank = getMatchRank(alias, normalizedKeyword, 1, 2);

    let searchRank: number | null = null;
    for (const text of entry.texts) {
      const textRank = getMatchRank(text, normalizedKeyword, 3, 4);
      if (textRank === null) continue;
      searchRank = searchRank === null ? textRank : Math.min(searchRank, textRank);
    }

    const rank = Math.min(
      aliasRank ?? Number.POSITIVE_INFINITY,
      searchRank ?? Number.POSITIVE_INFINITY,
    );

    if (!Number.isFinite(rank)) continue;
    matches.push({ baseId: entry.baseId, rank });
  }

  matches.sort((a, b) => a.rank - b.rank || a.baseId - b.baseId);

  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit ?? 0))
    : DEFAULT_SEARCH_RESULT_LIMIT;
  const visibleMatches = matches.slice(0, normalizedLimit);

  return visibleMatches.map((match) =>
    resolveBuffNameInfo(match.baseId, normalizedAliases),
  );
}

export function searchBuffsByName(
  keyword: string,
  aliases?: BuffAliasMap,
  limit?: number | null,
): BuffNameInfo[] {
  return searchBuffs(keyword, aliases, limit);
}

export function searchIconBuffsByName(
  keyword: string,
  aliases?: BuffAliasMap,
  limit?: number | null,
): BuffNameInfo[] {
  return searchBuffs(keyword, aliases, limit, isIconSearchableBuff);
}

void initializeBuffSearchRuntimeData();
