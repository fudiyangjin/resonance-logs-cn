import {
  DEFAULT_LOCALE,
  getLocaleFallbackChain,
  normalizeLocale,
  type AppLocale,
} from "./locales";
import { MESSAGES, type MessageKey } from "./messages";

export type { AppLocale, MessageKey };

export type MessageParams = Record<
  string,
  string | number | boolean | null | undefined
>;

let currentLocale = $state<AppLocale>(DEFAULT_LOCALE);

export function getLocale(): AppLocale {
  return currentLocale;
}

export function setLocale(locale: unknown): AppLocale {
  currentLocale = normalizeLocale(locale);
  return currentLocale;
}

function interpolate(message: string, params?: MessageParams): string {
  if (!params) return message;

  return message.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function lookupMessage(locale: AppLocale, key: MessageKey): string | undefined {
  return MESSAGES[locale][key];
}

export function t(key: MessageKey, params?: MessageParams): string {
  const locale = getLocale();
  for (const candidate of getLocaleFallbackChain(locale)) {
    const message = lookupMessage(candidate, key);
    if (message) return interpolate(message, params);
  }

  return key;
}

// Constructing an Intl.NumberFormat costs far more than formatting with one,
// and overlays format numbers on every data frame. Callers pass a handful of
// literal option sets, so the cache stays small. A plain (non-reactive)
// record: nothing should re-render because a formatter got cached.
const numberFormats: Partial<Record<string, Intl.NumberFormat>> = {};

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  const locale = getLocale();
  const key = options ? `${locale}\u0000${JSON.stringify(options)}` : locale;
  const format = (numberFormats[key] ??= new Intl.NumberFormat(
    locale,
    options,
  ));
  return format.format(value);
}

export function formatDateTime(
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(getLocale(), options).format(date);
}
