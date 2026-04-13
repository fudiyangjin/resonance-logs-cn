import { SETTINGS } from "$lib/settings-store";
import type { LocaleCode } from "$lib/i18n";
import { resolveClassLabelTranslation } from "$lib/i18n";

function currentLocale(): LocaleCode {
  return SETTINGS.live.general.state.language;
}

export function toClassLabel(className: string, locale: LocaleCode = currentLocale()): string {
  return resolveClassLabelTranslation(`class.${className}`, locale, className);
}

export function toSpecLabel(specName: string, locale: LocaleCode = currentLocale()): string {
  return resolveClassLabelTranslation(`spec.${specName}`, locale, specName);
}

export function formatClassSpecLabel(
  className: string,
  specName?: string,
  locale: LocaleCode = currentLocale(),
): string {
  const classLabel = toClassLabel(className, locale);
  const specLabel = specName ? toSpecLabel(specName, locale) : "";
  if (!classLabel && !specLabel) return "";
  if (!classLabel) return specLabel;
  if (!specLabel) return classLabel;
  return `${classLabel} - ${specLabel}`;
}
