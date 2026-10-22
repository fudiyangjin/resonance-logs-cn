export const MINIMAP_MARKER_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type MinimapMarkerDigit = (typeof MINIMAP_MARKER_DIGITS)[number];
export type MinimapMarkerColors = Record<`m${MinimapMarkerDigit}`, string>;

export const DEFAULT_MINIMAP_MARKER_COLORS: Readonly<MinimapMarkerColors> = {
  m0: "#f8fafc",
  m1: "#facc15",
  m2: "#fb923c",
  m3: "#4ade80",
  m4: "#67e8f9",
  m5: "#c084fc",
  m6: "#2563eb",
  m7: "#f472b6",
  m8: "#ef4444",
  m9: "#14b8a6",
};

/** Fill missing marker settings while preserving explicit user choices. */
export function normalizeMinimapMarkerSettings(state: {
  showMarkers?: boolean;
  showTeamMarks?: boolean;
  markerColors?: Partial<MinimapMarkerColors>;
}) {
  const markerColors = { ...DEFAULT_MINIMAP_MARKER_COLORS };
  for (const digit of MINIMAP_MARKER_DIGITS) {
    const key = `m${digit}` as const;
    markerColors[key] = state.markerColors?.[key] ?? markerColors[key];
  }
  return {
    showMarkers: state.showMarkers ?? false,
    showTeamMarks: state.showTeamMarks ?? false,
    markerColors,
  };
}
