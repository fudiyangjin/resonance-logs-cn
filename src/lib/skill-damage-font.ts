const fonts = new Map<string, Promise<string>>();
let sequence = 0;

/** Load each embedded font once per overlay window, without changing other panels. */
export function loadSkillDamageFont(url: string): Promise<string> {
  const existing = fonts.get(url);
  if (existing) return existing;
  const family = `skill-damage-${++sequence}`;
  const pending = new FontFace(family, `url(${JSON.stringify(url)})`)
    .load()
    .then((face) => {
      document.fonts.add(face);
      return family;
    })
    .catch((error) => {
      fonts.delete(url);
      throw error;
    });
  fonts.set(url, pending);
  return pending;
}
