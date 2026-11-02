import { describe, expect, it } from "vitest";
import type { BuffUpdateState } from "$lib/bindings";
import {
  axeBallView,
  barMotionOf,
  dotSlots,
  getFightResTemplate,
  getResourceBarBuffIds,
  lastOpenResource,
  resolveResourceBar,
  resourceValue,
  shooterForm,
  type FightResTemplate,
} from "./resource-bar";

function buff(baseId: number, createTimeMs = 1_000, durationMs = 10_000) {
  return {
    baseId,
    layer: 1,
    createTimeMs,
    durationMs,
    sourceRemodelLevel: null,
  } satisfies BuffUpdateState;
}

function buffs(...items: BuffUpdateState[]) {
  return new Map(items.map((item) => [item.baseId, item]));
}

describe("resourceValue", () => {
  it("floors scaled attributes and keeps unscaled ones", () => {
    const map = new Map([
      [14011, 6_099],
      [14001, 3],
    ]);
    expect(resourceValue(map, 14011)).toBe(60);
    expect(resourceValue(map, 14001)).toBe(3);
  });

  it("is null until the attribute arrives", () => {
    expect(resourceValue(new Map(), 14011)).toBeNull();
  });
});

describe("getFightResTemplate", () => {
  it("reads the generated template rows in table order", () => {
    const template = getFightResTemplate("flame_berserker");
    expect(template?.resources.map((resource) => resource.ui)).toEqual([
      "line",
      "dot",
      "axeBall",
    ]);
    expect(template?.resources[1]?.openBuff).toBe(2208030);
  });

  it("appends the stormblade supplement to its empty template", () => {
    const template = getFightResTemplate("stormblade");
    expect(template?.resources.map((resource) => resource.id)).toEqual([
      12051, 12041,
    ]);
  });
});

describe("resolveResourceBar", () => {
  const template: FightResTemplate = {
    templateId: 0,
    resources: [
      { id: 100, name: "line", ui: "line", openBuff: 0 },
      { id: 200, name: "dot", ui: "dot", openBuff: 900 },
    ],
    effectShowBuff: [
      { type: 0, buffId: 800 },
      { type: 1, buffId: 801 },
      { type: 1, buffId: 802 },
      { type: 2, buffId: 803 },
    ],
  };
  const fightRes = new Map([
    [100, 40],
    [106, 100],
  ]);

  it("gates resources on their unlock buff", () => {
    const closed = resolveResourceBar(template, fightRes, buffs());
    expect(closed.typeOpen.has("line")).toBe(true);
    expect(closed.typeOpen.has("dot")).toBe(false);
    const open = resolveResourceBar(template, fightRes, buffs(buff(900)));
    expect(open.typeOpen.has("dot")).toBe(true);
  });

  it("reports values and whether they were received", () => {
    const bar = resolveResourceBar(template, fightRes, buffs());
    expect(bar.resources[0]).toMatchObject({
      now: 40,
      max: 100,
      received: true,
    });
    expect(bar.resources[1]).toMatchObject({ now: 0, max: 0, received: false });
  });

  it("gives the bar to the first present row in table order", () => {
    const both = resolveResourceBar(
      template,
      fightRes,
      buffs(buff(802, 5_000), buff(801, 1_000)),
    );
    expect(both.barBuff?.baseId).toBe(801);
    const second = resolveResourceBar(template, fightRes, buffs(buff(802)));
    expect(second.barBuff?.baseId).toBe(802);
  });

  it("tracks the effect rows separately", () => {
    const bar = resolveResourceBar(
      template,
      fightRes,
      buffs(buff(800), buff(803)),
    );
    expect(bar.barBuff).toBeNull();
    expect(bar.barEffectOpen).toBe(true);
    expect(bar.dotEffectOpen).toBe(true);
  });
});

describe("lastOpenResource", () => {
  it("lets the last open line in ResIDs order win", () => {
    const template = getFightResTemplate("beat_performer")!;
    const both = resolveResourceBar(
      template,
      new Map(),
      buffs(buff(2207620), buff(2207150)),
    );
    expect(lastOpenResource(both, "line")?.id).toBe(23031);
    const first = resolveResourceBar(template, new Map(), buffs(buff(2207620)));
    expect(lastOpenResource(first, "line")?.id).toBe(23021);
    const none = resolveResourceBar(template, new Map(), buffs());
    expect(lastOpenResource(none, "line")).toBeNull();
  });
});

describe("barMotionOf", () => {
  it("drains from the remaining part of the buff", () => {
    expect(barMotionOf(buff(1, 1_000, 10_000))).toEqual({
      kind: "countdown",
      deadlineMs: 11_000,
      spanMs: 10_000,
    });
  });

  it("stays empty without a buff or a duration", () => {
    expect(barMotionOf(null)).toEqual({ kind: "static", scale: 0 });
    expect(barMotionOf(buff(1, 1_000, 0))).toEqual({
      kind: "static",
      scale: 0,
    });
  });
});

describe("dotSlots", () => {
  it("shows one bean per cap point up to six", () => {
    expect(dotSlots(2, 4)).toEqual({
      lit: [true, true, false, false],
      overflowText: "",
    });
  });

  it("collapses to one bean plus xN beyond six", () => {
    expect(dotSlots(3, 8)).toEqual({ lit: [true], overflowText: "x3" });
    expect(dotSlots(0, 8)).toEqual({ lit: [false], overflowText: "x0" });
  });

  it("lights every bean while the dot effect hides cooldowns", () => {
    expect(dotSlots(1, 3, true).lit).toEqual([true, true, true]);
  });
});

describe("axeBallView", () => {
  it("floors the percentage and shows the adorn only when full", () => {
    expect(axeBallView(1, 3)).toEqual({
      percent: 33,
      fill: 1 / 3,
      full: false,
    });
    expect(axeBallView(100, 100)).toMatchObject({ percent: 100, full: true });
  });

  it("writes zero without a cap", () => {
    expect(axeBallView(5, 0)).toEqual({ percent: 0, fill: 0, full: false });
  });
});

describe("shooterForm", () => {
  it("checks wolf before hawk", () => {
    expect(shooterForm(buffs())).toBe("normal");
    expect(shooterForm(buffs(buff(2203290)))).toBe("hawk");
    expect(shooterForm(buffs(buff(2203290), buff(2203040)))).toBe("wolf");
  });
});

describe("getResourceBarBuffIds", () => {
  it("collects unlock buffs, effect rows and beast contracts", () => {
    expect(getResourceBarBuffIds("marksman")).toEqual([
      55223, 55237, 2203040, 2203290,
    ]);
    expect(getResourceBarBuffIds("verdant_oracle")).toEqual([
      2202050, 2202561, 2202716, 2202751,
    ]);
  });
});
