<script lang="ts">
  import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
  import { SETTINGS } from "$lib/settings-store";
  import { slotColor } from "./colors";
  import { minimapSkillCasts } from "./minimap-runtime.svelte.js";
  import { resolveScene } from "./scene-registry";
  import {
    emptySceneView,
    type MechanicRegion,
    type SceneView,
  } from "./scene-types";

  let { snapshot }: { snapshot: MinimapSnapshot | null } = $props();

  let canvas: HTMLCanvasElement | null = $state(null);

  const PADDING = 10;
  // Radius of the upward triangle drawn for every non-team entity. Larger than
  // team-member circles so mechanic entities (orbs, etc.) read clearly.
  const NON_TEAM_TRIANGLE_RADIUS = 10;
  const DEFAULT_BOSS_COLOR = "#ef4444";
  const DEFAULT_LOCAL_RING_COLOR = "#ffffff";
  const DEFAULT_LOCAL_RING_WIDTH = 2;
  const minimapSettings = $derived(SETTINGS.minimap.state);

  type Projector = (x: number, z: number) => [number, number];

  function displayName(entity: MinimapEntity): string {
    return entity.name ?? entity.entityUuid;
  }

  const sceneView = $derived.by<SceneView>(() => {
    if (!snapshot) return emptySceneView();
    const scene = resolveScene(snapshot.sceneId);
    return (
      scene?.resolveView(snapshot, displayName, minimapSkillCasts()) ??
      emptySceneView(snapshot.entities)
    );
  });

  const aspect = $derived.by(() => {
    const { halfForHeight, halfForWidth } = rotatedHalfExtents(sceneView);
    return halfForHeight / halfForWidth;
  });

  function normalizedRotationQuarters(rotationQuarters: number): number {
    return ((Math.trunc(rotationQuarters) % 4) + 4) % 4;
  }

  function rotatedHalfExtents(view: SceneView): {
    halfForWidth: number;
    halfForHeight: number;
  } {
    const isQuarterTurn =
      normalizedRotationQuarters(view.rotationQuarters) % 2 === 1;
    return {
      halfForWidth: isQuarterTurn ? view.worldHalfX : view.worldHalfZ,
      halfForHeight: isQuarterTurn ? view.worldHalfZ : view.worldHalfX,
    };
  }

  function rotateMapPoint(x: number, z: number, rotationQuarters: number) {
    switch (normalizedRotationQuarters(rotationQuarters)) {
      case 1:
        return { x: -z, z: x };
      case 2:
        return { x: -x, z: -z };
      case 3:
        return { x: z, z: -x };
      default:
        return { x, z };
    }
  }

  function makeProjector(
    w: number,
    h: number,
    view: SceneView,
  ): { project: Projector; scale: number } {
    const { halfForWidth, halfForHeight } = rotatedHalfExtents(view);
    const scaleX = (w - PADDING * 2) / (halfForWidth * 2);
    const scaleY = (h - PADDING * 2) / (halfForHeight * 2);
    const scale = Math.min(scaleX, scaleY);
    const cx = w / 2;
    const cy = h / 2;
    return {
      project: (x, z) => {
        const point = rotateMapPoint(x, z, view.rotationQuarters);
        return [cx - point.z * scale, cy - point.x * scale];
      },
      scale,
    };
  }

  function colorFor(entity: MinimapEntity): string {
    const colors = minimapSettings.entityColors;
    if (entity.kind === "boss") return colors.boss ?? DEFAULT_BOSS_COLOR;
    return entity.kind === "local" ? colors.local : colors.teammate;
  }

  function radiusFor(): number {
    return 4;
  }

  function isTeamMember(entity: MinimapEntity): boolean {
    return entity.kind === "local" || entity.kind === "teammate";
  }

  function localRingWidth(): number {
    const width = Number(
      minimapSettings.localRing?.width ?? DEFAULT_LOCAL_RING_WIDTH,
    );
    return Number.isFinite(width) ? Math.max(1, Math.min(6, width)) : 2;
  }

  function shouldDrawLocalRing(): boolean {
    return minimapSettings.localRing?.enabled !== false;
  }

  function drawLocalRing(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    if (!shouldDrawLocalRing()) return;

    const width = localRingWidth();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.strokeStyle =
      minimapSettings.localRing?.color ?? DEFAULT_LOCAL_RING_COLOR;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, radiusFor() + width, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Upward-pointing triangle centered on (cx, cy), used for every non-team
  // entity so it reads distinctly from team members' circles.
  function drawTriangle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.866, cy + r * 0.5);
    ctx.lineTo(cx - r * 0.866, cy + r * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    const el = canvas;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = el.clientWidth || 360;
    const cssH = el.clientHeight || Math.round(cssW / aspect);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (el.width !== pxW || el.height !== pxH) {
      el.width = pxW;
      el.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    ctx.fillStyle = "rgba(15, 23, 42, 0.68)";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "rgba(203, 213, 225, 0.72)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, cssW - 2, cssH - 2);

    const view = sceneView;
    const { project, scale } = makeProjector(cssW, cssH, view);
    const [ox, oy] = project(0, 0);

    if (view.layout.squares.length > 0) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.lineWidth = 1;
      for (const half of view.layout.squares) {
        const s = half * scale;
        ctx.strokeRect(ox - s, oy - s, s * 2, s * 2);
      }
    }

    if (view.layout.circles.length > 0) {
      ctx.strokeStyle = "rgba(226, 232, 240, 0.85)";
      ctx.lineWidth = 1.5;
      for (const r of view.layout.circles) {
        ctx.beginPath();
        ctx.arc(ox, oy, r * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (view.layout.lines.length > 0) {
      ctx.strokeStyle = "rgba(226, 232, 240, 0.9)";
      ctx.lineWidth = 2;
      for (const line of view.layout.lines) {
        const [sx, sy] = project(line.x1, line.z1);
        const [ex, ey] = project(line.x2, line.z2);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    for (const region of view.regions) {
      drawRegion(ctx, region, project, scale, ox, oy);
    }

    for (const entity of view.entities) {
      if (entity.kind === "boss" && minimapSettings.showBoss !== true) {
        continue;
      }

      const colorSlot = view.entityColorSlots.get(entity.entityUuid);
      const hasMechanic = colorSlot !== undefined;
      if (
        minimapSettings.hideNormalTeammates &&
        entity.kind === "teammate" &&
        !hasMechanic
      ) {
        continue;
      }

      const [sx, sy] = project(entity.x, entity.z);
      const team = isTeamMember(entity);
      const dotColor =
        colorSlot === undefined ? colorFor(entity) : slotColor(colorSlot);

      ctx.globalAlpha = entity.isDead
        ? 0.35
        : hasMechanic || entity.kind !== "other"
          ? 1
          : 0.45;
      if (hasMechanic) {
        ctx.shadowColor = dotColor;
        ctx.shadowBlur = 12;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = dotColor;
      if (team) {
        ctx.beginPath();
        ctx.arc(sx, sy, radiusFor(), 0, Math.PI * 2);
        ctx.fill();
        if (entity.kind === "local") {
          drawLocalRing(ctx, sx, sy);
        }
      } else {
        drawTriangle(ctx, sx, sy, NON_TEAM_TRIANGLE_RADIUS);
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function fillRectRegion(
    ctx: CanvasRenderingContext2D,
    project: Projector,
    cx: number,
    cz: number,
    halfX: number,
    halfZ: number,
    color: string,
  ) {
    const [ax, ay] = project(cx - halfX, cz - halfZ);
    const [bx, by] = project(cx + halfX, cz + halfZ);
    const x = Math.min(ax, bx);
    const y = Math.min(ay, by);
    const w = Math.abs(bx - ax);
    const h = Math.abs(by - ay);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }

  function drawSectorRegion(
    ctx: CanvasRenderingContext2D,
    project: Projector,
    region: Extract<MechanicRegion, { kind: "sector" }>,
    color: string,
  ) {
    const steps = Math.max(
      6,
      Math.ceil(Math.abs(region.endDeg - region.startDeg) / 8),
    );
    const points: [number, number][] = [project(region.x, region.z)];
    for (let i = 0; i <= steps; i++) {
      const deg =
        region.startDeg + ((region.endDeg - region.startDeg) * i) / steps;
      const rad = (deg * Math.PI) / 180;
      points.push(
        project(
          region.x + Math.sin(rad) * region.radius,
          region.z + Math.cos(rad) * region.radius,
        ),
      );
    }

    ctx.beginPath();
    const [startX, startY] = points[0] ?? [0, 0];
    ctx.moveTo(startX, startY);
    for (const [x, y] of points.slice(1)) {
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawPolygonRegion(
    ctx: CanvasRenderingContext2D,
    project: Projector,
    region: Extract<MechanicRegion, { kind: "polygon" }>,
    color: string,
  ) {
    if (region.points.length < 3) return;

    const points = region.points.map((point) => project(point.x, point.z));
    ctx.beginPath();
    const [startX, startY] = points[0] ?? [0, 0];
    ctx.moveTo(startX, startY);
    for (const [x, y] of points.slice(1)) {
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawLineRegion(
    ctx: CanvasRenderingContext2D,
    project: Projector,
    region: Extract<MechanicRegion, { kind: "line" }>,
    color: string,
  ) {
    const [sx, sy] = project(region.x1, region.z1);
    const [ex, ey] = project(region.x2, region.z2);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = region.widthPx ?? 2;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    if (region.label) {
      ctx.fillStyle = color;
      ctx.font = "700 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(region.label, (sx + ex) / 2, (sy + ey) / 2);
    }
    ctx.restore();
  }

  function drawRegion(
    ctx: CanvasRenderingContext2D,
    region: MechanicRegion,
    project: Projector,
    scale: number,
    ox: number,
    oy: number,
  ) {
    const color = slotColor(region.colorSlot);
    if (region.kind === "ring") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ox, oy, region.rOuter * scale, 0, Math.PI * 2);
      ctx.arc(ox, oy, region.rInner * scale, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox, oy, region.rOuter * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    if (region.kind === "line") {
      drawLineRegion(ctx, project, region, color);
      return;
    }

    if (region.kind === "sector") {
      drawSectorRegion(ctx, project, region, color);
      if (region.label) {
        const midDeg = (region.startDeg + region.endDeg) / 2;
        const rad = (midDeg * Math.PI) / 180;
        const [tx, ty] = project(
          region.x + Math.sin(rad) * region.radius * 0.62,
          region.z + Math.cos(rad) * region.radius * 0.62,
        );
        ctx.fillStyle = color;
        ctx.font = "700 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(region.label, tx, ty);
      }
      return;
    }

    if (region.kind === "polygon") {
      if (region.points.length < 3) return;
      drawPolygonRegion(ctx, project, region, color);
      if (region.label) {
        const centroid = polygonCentroid(region.points);
        const [tx, ty] = project(centroid.x, centroid.z);
        ctx.fillStyle = color;
        ctx.font = "700 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(region.label, tx, ty);
      }
      return;
    }

    fillRectRegion(
      ctx,
      project,
      region.x,
      region.z,
      region.halfX,
      region.halfZ,
      color,
    );
    if (region.label) {
      const [tx, ty] = project(region.x, region.z);
      ctx.fillStyle = color;
      ctx.font = "700 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(region.label, tx, ty);
    }
  }

  function polygonCentroid(points: { x: number; z: number }[]): {
    x: number;
    z: number;
  } {
    if (points.length === 0) return { x: 0, z: 0 };
    const sum = points.reduce(
      (acc, point) => ({ x: acc.x + point.x, z: acc.z + point.z }),
      { x: 0, z: 0 },
    );
    return {
      x: sum.x / points.length,
      z: sum.z / points.length,
    };
  }

  $effect(() => {
    void snapshot;
    void aspect;
    void sceneView;
    void minimapSettings.hideNormalTeammates;
    void minimapSettings.showBoss;
    void minimapSettings.entityColors.local;
    void minimapSettings.entityColors.teammate;
    void minimapSettings.entityColors.boss;
    void minimapSettings.localRing?.enabled;
    void minimapSettings.localRing?.color;
    void minimapSettings.localRing?.width;
    if (typeof window === "undefined") return;
    const id = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(id);
  });
</script>

<canvas bind:this={canvas} class="minimap-canvas" style="aspect-ratio: {aspect}"
></canvas>

<style>
  .minimap-canvas {
    width: 100%;
    display: block;
    border-radius: 14px;
    box-shadow:
      0 16px 44px rgba(15, 23, 42, 0.28),
      inset 0 1px 0 rgba(248, 250, 252, 0.06);
  }
</style>
