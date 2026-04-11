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

  return {};
}
