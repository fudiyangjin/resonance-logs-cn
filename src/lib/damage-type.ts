export const NO_DAMAGE_INFO = "-" as const;

export const DAMAGE_PROPERTY_LABELS: Readonly<Record<number, string>> = {
  0: "Generic",
  1: "Fire",
  2: "Water",
  3: "Lightning",
  4: "Wood",
  5: "Wind",
  6: "Earth",
  7: "Light",
  8: "Dark",
};

export const DAMAGE_MODE_LABELS: Readonly<Record<number, string>> = {
  1: "Physical",
  2: "Magical",
};

export function propertyLabel(value: number | null | undefined): string {
  if (value == null) return NO_DAMAGE_INFO;
  return DAMAGE_PROPERTY_LABELS[value] ?? NO_DAMAGE_INFO;
}

export function damageModeLabel(value: number | null | undefined): string {
  if (value == null) return NO_DAMAGE_INFO;
  return DAMAGE_MODE_LABELS[value] ?? NO_DAMAGE_INFO;
}
