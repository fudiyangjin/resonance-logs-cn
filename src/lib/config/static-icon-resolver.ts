import { STATIC_IMAGE_PATHS } from "$lib/config/static-image-paths.generated";

const ICON_URL_BY_STEM = new Map<string, string>();

function filenameStem(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.(png|jpg|jpeg|webp)$/i, "")
    ?? "";
}

function stripHashSuffix(stem: string): string {
  return stem.replace(/_[+-]?\d+$/, "");
}

for (const path of STATIC_IMAGE_PATHS) {
  const stem = filenameStem(path);
  const url = `/${path}`;
  if (!stem || !url) continue;
  ICON_URL_BY_STEM.set(stem.toLowerCase(), url);
  ICON_URL_BY_STEM.set(stripHashSuffix(stem).toLowerCase(), url);
}

function stemFromReference(reference: unknown): string {
  if (typeof reference !== "string") return "";
  const trimmed = reference.trim();
  if (!trimmed) return "";
  return filenameStem(trimmed);
}

export function resolveStaticIconUrl(
  ...references: Array<string | null | undefined>
): string | undefined {
  for (const reference of references) {
    const stem = stemFromReference(reference);
    if (!stem) continue;
    const direct = ICON_URL_BY_STEM.get(stem.toLowerCase());
    if (direct) return direct;
    const stripped = ICON_URL_BY_STEM.get(stripHashSuffix(stem).toLowerCase());
    if (stripped) return stripped;
  }
  return undefined;
}
