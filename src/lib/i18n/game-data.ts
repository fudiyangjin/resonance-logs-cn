import damageAttrIdNamesZhCN from "$lib/config/DamageAttrIdName.json";
import monsterIdNameTypeZhCN from "$lib/config/MonsterIdNameType.json";
import recountTableZhCN from "$lib/config/RecountTable.json";
import sceneNamesZhCN from "$lib/config/SceneName.json";
import buffNamesZhCN from "$lib/config/BuffName.json";
import {
  getLocaleFallbackChain,
  normalizeLocale,
  type AppLocale,
} from "./locales";

export type RawMonsterInfo = {
  Name?: string | null;
  MonsterType?: number | null;
};

export type RawRecountEntry = {
  Id: number;
  RecountName: string;
  DamageId: number[];
};

export type RawBuffEntry = {
  Id: number;
  Icon?: string | null;
  NameDesign?: string | null;
  SpriteFile?: string | null;
};

export type GameDataBundle = {
  sceneNames: Record<string, string>;
  monsterInfoById: Record<string, RawMonsterInfo>;
  recountTable: Record<string, RawRecountEntry>;
  damageAttrIdNames: Record<string, string>;
  buffNames: RawBuffEntry[];
};

const EMPTY_GAME_DATA: GameDataBundle = {
  sceneNames: {},
  monsterInfoById: {},
  recountTable: {},
  damageAttrIdNames: {},
  buffNames: [],
};

export const GAME_DATA_BY_LOCALE = {
  "zh-CN": {
    sceneNames: sceneNamesZhCN,
    monsterInfoById: monsterIdNameTypeZhCN,
    recountTable: recountTableZhCN,
    damageAttrIdNames: damageAttrIdNamesZhCN,
    buffNames: buffNamesZhCN,
  },
  "en-US": EMPTY_GAME_DATA,
} satisfies Record<AppLocale, GameDataBundle>;

export function getGameData(locale: unknown): GameDataBundle {
  return GAME_DATA_BY_LOCALE[normalizeLocale(locale)];
}

export function getGameDataFallbackChain(locale: unknown): AppLocale[] {
  return getLocaleFallbackChain(locale);
}

export function normalizeGameDataText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
