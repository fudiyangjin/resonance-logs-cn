import { tl } from "$lib/i18n/index.svelte";

export function toClassLabel(className: string): string {
  return tl(className);
}

export function toSpecLabel(specName: string): string {
  return tl(specName);
}

export function formatClassSpecLabel(
  className: string,
  specName?: string,
): string {
  const classLabel = className ? toClassLabel(className) : "";
  const specLabel = specName ? toSpecLabel(specName) : "";
  if (!classLabel && !specLabel) return "";
  if (!classLabel) return specLabel;
  if (!specLabel) return classLabel;
  return `${classLabel} - ${specLabel}`;
}
