import { describe, expect, it } from "vitest";
import {
  createDefaultHistoryViewPrefs,
  encodeCurvePick,
  encodePlayerPick,
  nextCurveMode,
  parseHistoryViewPrefs,
  resolveCurvePick,
  resolvePlayerPick,
  type PickCandidate,
} from "./history-view-prefs";

const me: PickCandidate = { entityUuid: "me", isLocalPlayer: true };
const a: PickCandidate = { entityUuid: "a", isLocalPlayer: false };
const b: PickCandidate = { entityUuid: "b", isLocalPlayer: false };
const c: PickCandidate = { entityUuid: "c", isLocalPlayer: false };

describe("resolvePlayerPick", () => {
  it("follows the default until touched", () => {
    expect(resolvePlayerPick({ kind: "default" }, [me, a], ["me"])).toEqual([
      "me",
    ]);
  });

  it("selects everyone present for 'all', in any party", () => {
    expect(resolvePlayerPick({ kind: "all" }, [me, b, c], [])).toEqual([
      "me",
      "b",
      "c",
    ]);
  });

  it("maps the self flag to whoever the local player is", () => {
    const pick = { kind: "custom" as const, self: true, uuids: ["a"] };
    const otherCharacter = { entityUuid: "alt", isLocalPlayer: true };
    expect(resolvePlayerPick(pick, [otherCharacter, a, b], [])).toEqual([
      "alt",
      "a",
    ]);
  });

  it("ignores remembered players who are not here", () => {
    const pick = { kind: "custom" as const, self: false, uuids: ["a", "x"] };
    expect(resolvePlayerPick(pick, [me, a, b], [])).toEqual(["a"]);
  });

  it("falls back to the default when nobody remembered is present", () => {
    const pick = { kind: "custom" as const, self: false, uuids: ["x"] };
    expect(resolvePlayerPick(pick, [a, b], ["b"])).toEqual(["b"]);
  });

  it("keeps an explicit clear empty", () => {
    const pick = { kind: "custom" as const, self: false, uuids: [] };
    expect(resolvePlayerPick(pick, [a, b], ["b"])).toEqual([]);
  });
});

describe("encodePlayerPick", () => {
  it("stores the local player as a flag and only players present", () => {
    expect(encodePlayerPick(["me", "b", "gone"], [me, a, b])).toEqual({
      kind: "custom",
      self: true,
      uuids: ["b"],
    });
  });

  it("round-trips through resolve", () => {
    const pick = encodePlayerPick(["a", "c"], [me, a, b, c]);
    expect(resolvePlayerPick(pick, [me, a, b, c], [])).toEqual(["a", "c"]);
  });
});

describe("curve picks", () => {
  it("resolves 'all' to every teammate's average", () => {
    expect([...resolveCurvePick({ kind: "all" }, [a, b])]).toEqual([
      ["a", "average"],
      ["b", "average"],
    ]);
  });

  it("keeps only teammates present, in candidate order", () => {
    const pick = {
      kind: "custom" as const,
      modes: {
        gone: "average" as const,
        b: "instant" as const,
        a: "average" as const,
      },
    };
    expect([...resolveCurvePick(pick, [a, b])]).toEqual([
      ["a", "average"],
      ["b", "instant"],
    ]);
  });

  it("cycles off → average → instant → off", () => {
    expect(nextCurveMode(undefined)).toBe("average");
    expect(nextCurveMode("average")).toBe("instant");
    expect(nextCurveMode("instant")).toBeUndefined();
  });

  it("encodes a mode map", () => {
    expect(encodeCurvePick(new Map([["a", "instant"]]))).toEqual({
      kind: "custom",
      modes: { a: "instant" },
    });
  });
});

describe("parseHistoryViewPrefs", () => {
  it("returns defaults for missing or malformed data", () => {
    const defaults = createDefaultHistoryViewPrefs();
    expect(parseHistoryViewPrefs(undefined)).toEqual(defaults);
    expect(
      parseHistoryViewPrefs({
        showAverageCurve: "yes",
        lanes: { kind: "custom", uuids: [1, "a"] },
        curves: { kind: "custom", modes: { a: "sideways", b: "instant" } },
        buff: { grouping: "nope", owners: 7 },
      }),
    ).toEqual({
      ...defaults,
      lanes: { kind: "custom", self: false, uuids: ["a"] },
      curves: { kind: "custom", modes: { b: "instant" } },
    });
  });

  it("keeps valid stored choices", () => {
    const stored = {
      showAverageCurve: false,
      lanes: { kind: "all" },
      curves: { kind: "all" },
      buff: {
        expanded: true,
        grouping: "buff",
        owners: { kind: "custom", self: true, uuids: ["a"] },
      },
      coverageTableOpen: true,
    };
    expect(parseHistoryViewPrefs(stored)).toEqual(stored);
  });
});
