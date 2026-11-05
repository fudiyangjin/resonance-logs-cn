/**
 * @file Loads uploaded skill damage fonts into the current window once per
 * font id. Ids are content hashes, so a loaded family never goes stale.
 */
import { findSkillDamageFont } from "./skill-damage-profile.svelte";
import type { SkillDamageGroup } from "./skill-damage-settings";

const families = $state<Record<string, string>>({});
const pending = new Set<string>();

/** Starts loading every font the groups reference (call from an effect). */
export function ensureSkillDamageFonts(
  groups: readonly Pick<SkillDamageGroup, "fontId">[],
): void {
  for (const { fontId } of groups) {
    if (!fontId || fontId in families || pending.has(fontId)) continue;
    const font = findSkillDamageFont(fontId);
    if (!font) continue;
    pending.add(fontId);
    const family = `skill-damage-${fontId}`;
    new FontFace(family, `url(${JSON.stringify(font.dataUrl)})`)
      .load()
      .then((face) => {
        document.fonts.add(face);
        families[fontId] = family;
      })
      .catch((error) =>
        console.warn("[skill-damage] failed to load font", fontId, error),
      )
      .finally(() => pending.delete(fontId));
  }
}

/** CSS `font-family` for a group: its uploaded font once loaded, else its family name. */
export function skillDamageFontFamily(
  group: Pick<SkillDamageGroup, "fontId" | "fontFamily">,
): string | undefined {
  const loaded = group.fontId ? families[group.fontId] : undefined;
  const name = loaded ?? group.fontFamily.trim();
  return name ? `${JSON.stringify(name)}, sans-serif` : undefined;
}
