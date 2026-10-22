import { describe, expect, it } from "vitest";
import {
  DEFAULT_MINIMAP_MARKER_COLORS,
  normalizeMinimapMarkerSettings,
} from "./minimap-marker-settings";

describe("minimap marker settings migration", () => {
  it("defaults party icons to off independently of ground markers and preserves explicit choices", () => {
    expect(normalizeMinimapMarkerSettings({}).showTeamMarks).toBe(false);
    expect(
      normalizeMinimapMarkerSettings({ showMarkers: true }).showTeamMarks,
    ).toBe(false);
    expect(
      normalizeMinimapMarkerSettings({ showMarkers: false }).showTeamMarks,
    ).toBe(false);
    expect(
      normalizeMinimapMarkerSettings({
        showMarkers: true,
        showTeamMarks: false,
      }).showTeamMarks,
    ).toBe(false);
    expect(
      normalizeMinimapMarkerSettings({
        showMarkers: false,
        showTeamMarks: true,
      }).showTeamMarks,
    ).toBe(true);
  });

  it("keeps customized colors while filling all ten digits without mutating the input", () => {
    const legacy = {
      showMarkers: true,
      markerColors: { m1: "#123456", m6: "#abcdef" },
    };
    const migrated = normalizeMinimapMarkerSettings(legacy);
    expect(migrated.markerColors).toEqual({
      ...DEFAULT_MINIMAP_MARKER_COLORS,
      ...legacy.markerColors,
    });
    expect(legacy.markerColors).toEqual({ m1: "#123456", m6: "#abcdef" });
    expect(normalizeMinimapMarkerSettings(migrated)).toEqual(migrated);
    expect(
      normalizeMinimapMarkerSettings({ ...migrated, showMarkers: false })
        .showTeamMarks,
    ).toBe(false);
  });
});
