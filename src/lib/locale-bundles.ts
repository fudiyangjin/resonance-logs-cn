import manifest from "$lib/locales/manifest.json";

export type LocaleManifest = {
  defaultLocale: string;
  fallbackLocale: string;
  locales: string[];
  categories: Record<string, string[]>;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

const MANIFEST = manifest as LocaleManifest;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const RAW_BUNDLED_LOCALE_FILES = import.meta.glob("./locales/*/{ui,parser,search}/**/*.json", {
  eager: true,
  import: "default",
}) as Record<string, JsonValue>;

const SMALL_BUNDLED_LOCALE_FILES: Record<string, JsonValue> = Object.fromEntries(
  Object.entries(RAW_BUNDLED_LOCALE_FILES).map(([path, value]) => [
    path.replace(/^\.\/locales\//, "/src/lib/locales/"),
    value,
  ]),
);

function getBundledLocaleValue(locale: string, category: string, fileName: string): JsonValue | null {
  const path = `/src/lib/locales/${locale}/${category}/${fileName}`;
  const value = SMALL_BUNDLED_LOCALE_FILES[path];
  return value === undefined ? null : cloneJson(value);
}

function combineGenericLocaleMaps(category: string, fileName: string): Record<string, Record<string, string>> {
  const combined: Record<string, Record<string, string>> = {};
  for (const locale of MANIFEST.locales) {
    const raw = getBundledLocaleValue(locale, category, fileName);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!combined[key]) combined[key] = {};
      combined[key][locale] = typeof value === "string" ? value : "";
    }
  }
  return combined;
}

function combineParserBuffNameMaps(fileName: string): JsonRecord {
  const combined: Record<string, {
    Id?: number;
    Icon?: string | null;
    NameDesign?: Record<string, string>;
    SpriteFile?: string | null;
  }> = {};

  for (const locale of MANIFEST.locales) {
    const raw = getBundledLocaleValue(locale, "parser", fileName);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      const target =
        combined[key] ??
        (combined[key] = {
          NameDesign: {},
        });

      if (typeof entry["Id"] === "number") target.Id = entry["Id"];
      if (typeof entry["Icon"] === "string" || entry["Icon"] === null) target.Icon = entry["Icon"] as string | null;
      if (typeof entry["SpriteFile"] === "string" || entry["SpriteFile"] === null) target.SpriteFile = entry["SpriteFile"] as string | null;
      if (typeof entry["NameDesign"] === "string") {
        target.NameDesign ??= {};
        target.NameDesign[locale] = entry["NameDesign"];
      }
    }
  }

  return combined;
}

function combineSearchLocaleMaps(fileName: string): JsonRecord {
  const combined: Record<string, {
    name?: Record<string, string>;
    keywords?: Record<string, string[]>;
    notes?: Record<string, string>;
    categories?: JsonValue;
    iconKey?: string | null;
    spriteFile?: string | null;
    hasSpriteFile?: boolean;
  }> = {};

  for (const locale of MANIFEST.locales) {
    const raw = getBundledLocaleValue(locale, "search", fileName);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      const target = combined[key] ?? (combined[key] = {});

      if (typeof entry["name"] === "string") {
        target.name ??= {};
        target.name[locale] = entry["name"];
      }
      if (Array.isArray(entry["keywords"])) {
        const normalizedKeywords = entry["keywords"].filter((item): item is string => typeof item === "string");
        target.keywords ??= {};
        target.keywords[locale] = normalizedKeywords;
      }
      if (typeof entry["notes"] === "string") {
        target.notes ??= {};
        target.notes[locale] = entry["notes"];
      }
      if (entry["categories"] !== undefined && target.categories === undefined) target.categories = cloneJson(entry["categories"] as JsonValue);
      if ((typeof entry["iconKey"] === "string" || entry["iconKey"] === null) && target.iconKey === undefined) target.iconKey = entry["iconKey"] as string | null;
      if ((typeof entry["spriteFile"] === "string" || entry["spriteFile"] === null) && target.spriteFile === undefined) target.spriteFile = entry["spriteFile"] as string | null;
      if (typeof entry["hasSpriteFile"] === "boolean" && target.hasSpriteFile === undefined) target.hasSpriteFile = entry["hasSpriteFile"];
    }
  }

  return combined;
}

export function getLocaleManifest(): LocaleManifest {
  return cloneJson(MANIFEST);
}

export function getVirtualTranslationFiles(): string[] {
  const files: string[] = [];
  for (const [category, names] of Object.entries(MANIFEST.categories)) {
    for (const name of names) files.push(`${category}/${name}`);
  }
  return files;
}

export function getBundledTranslationTable(virtualPath: string): JsonRecord {
  const [category, ...rest] = virtualPath.split("/");
  const fileName = rest.join("/");

  if (!category || !fileName) {
    return {};
  }

  if (category === "ui") {
    return combineGenericLocaleMaps(category, fileName);
  }

  if (
    category === "parser" &&
    ["class-labels.json", "MonsterName.json", "SceneName.json"].includes(fileName)
  ) {
    return combineGenericLocaleMaps(category, fileName);
  }

  if (category === "parser" && fileName === "BuffName.json") {
    return combineParserBuffNameMaps(fileName);
  }

  if (category === "search" && ["BuffNameSearch.json", "resonance-skill-search.json"].includes(fileName)) {
    return combineSearchLocaleMaps(fileName);
  }

  return {};
}
