<script lang="ts">
  import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
  import { SETTINGS } from "$lib/settings-store";
  import { slotColor } from "./colors";
  import { resolveScene } from "./scene-registry";
  import {
    emptySceneView,
    type MechanicRegion,
    type SceneView,
  } from "./scene-types";

  let { snapshot }: { snapshot: MinimapSnapshot | null } = $props();

  let canvas: HTMLCanvasElement | null = $state(null);

  const PADDING = 10;
  const minimapSettings = $derived(SETTINGS.minimap.state);

  type Projector = (x: number, z: number) => [number, number];

  function displayName(entity: MinimapEntity): string {
    return entity.name ?? entity.entityUuid;
  }

  const sceneView = $derived.by<SceneView>(() => {
    if (!snapshot) return emptySceneView();
    const scene = resolveScene(snapshot.sceneId);
    return (
      scene?.resolveView(snapshot, displayName) ??
      emptySceneView(snapshot.entities)
    );
  });

  const aspect = $derived(sceneView.worldHalfZ / sceneView.worldHalfX);

  function makeProjector(
    w: number,
    h: number,
    view: SceneView,
  ): { project: Projector; scale: number } {
    const scaleX = (w - PADDING * 2) / (view.worldHalfZ * 2);
    const scaleY = (h - PADDING * 2) / (view.worldHalfX * 2);
    const scale = Math.min(scaleX, scaleY);
    const cx = w / 2;
    const cy = h / 2;
    return { project: (x, z) => [cx + -z * scale, cy - x * scale], scale };
  }

  function colorFor(entity: MinimapEntity): string {
    const colors = minimapSettings.entityColors;
    return entity.kind === "local" ? colors.local : colors.teammate;
  }

  function radiusFor(): number {
    return 4;
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
      const r = radiusFor();
      const dotColor =
        colorSlot === undefined ? colorFor(entity) : slotColor(colorSlot);

      ctx.globalAlpha = entity.isDead
        ? 0.35
        : entity.kind === "other"
          ? 0.45
          : 1;
      if (hasMechanic) {
        ctx.shadowColor = dotColor;
        ctx.shadowBlur = 12;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      if (hasMechanic) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(248, 250, 252, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
        ctx.stroke();
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

  $effect(() => {
    void snapshot;
    void aspect;
    void sceneView;
    void minimapSettings.hideNormalTeammates;
    void minimapSettings.entityColors.local;
    void minimapSettings.entityColors.teammate;
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
