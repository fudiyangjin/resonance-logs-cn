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

const RAW_BOOTSTRAP_LOCALE_FILES = {
  ...import.meta.glob("./locales/en/ui/**/*.json", {
    eager: true,
    import: "default",
  }),
  ...import.meta.glob("./locales/zh-CN/ui/**/*.json", {
    eager: true,
    import: "default",
  }),
} as Record<string, JsonValue>;

const LAZY_BUNDLED_LOCALE_FILES = import.meta.glob("./locales/*/ui/**/*.json", {
  import: "default",
}) as Record<string, () => Promise<JsonValue>>;

function normalizeBundledLocalePath(path: string): string {
  return path.replace(/^\.\/locales\//, "/src/lib/locales/");
}

const SMALL_BUNDLED_LOCALE_FILES: Record<string, JsonValue> = Object.fromEntries(
  Object.entries(RAW_BOOTSTRAP_LOCALE_FILES).map(([path, value]) => [
    normalizeBundledLocalePath(path),
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

  return {};
}

export async function loadBundledLocale(locale: string): Promise<boolean> {
  if (!MANIFEST.locales.includes(locale)) {
    return false;
  }

  const prefix = `./locales/${locale}/ui/`;
  const loaders = Object.entries(LAZY_BUNDLED_LOCALE_FILES).filter(([path]) =>
    path.startsWith(prefix),
  );

  if (loaders.length === 0) {
    return false;
  }

  const missingLoaders = loaders.filter(
    ([path]) => SMALL_BUNDLED_LOCALE_FILES[normalizeBundledLocalePath(path)] === undefined,
  );

  if (missingLoaders.length === 0) {
    return false;
  }

  await Promise.all(
    missingLoaders.map(async ([path, load]) => {
      SMALL_BUNDLED_LOCALE_FILES[normalizeBundledLocalePath(path)] = await load();
    }),
  );

  return true;
}

export async function hydrateAllBundledUiLocales(): Promise<boolean> {
  const results = await Promise.all(MANIFEST.locales.map((locale) => loadBundledLocale(locale)));
  return results.some(Boolean);
}
