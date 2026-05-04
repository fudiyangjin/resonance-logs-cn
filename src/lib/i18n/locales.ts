export const APP_LOCALES = ["zh-CN", "en-US"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "zh-CN";

export const FALLBACK_LOCALES: Record<AppLocale, AppLocale[]> = {
  "zh-CN": [],
  "en-US": ["zh-CN"],
};

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    (APP_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizeLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export function getLocaleFallbackChain(value: unknown): AppLocale[] {
  const locale = normalizeLocale(value);
  return [locale, ...FALLBACK_LOCALES[locale]];
}
