<script lang="ts" module>
  /**
   * Position and scale of a HUD panel, persisted by mutating this object
   * (pass a reactive settings proxy). Without `width` the panel sizes to its
   * content.
   */
  export type HudPanelRect = {
    x: number;
    y: number;
    scale: number;
    width?: number;
  };
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  type ScaleMode = "transform" | "width";

  type Props = {
    rect: HudPanelRect;
    editing: boolean;
    title: string;
    scaleMode?: ScaleMode;
    /** `bottom` pins the panel's bottom edge to `rect.y`, so it grows upward. */
    anchor?: "top" | "bottom";
    class?: string;
    children: Snippet;
  };

  let {
    rect,
    editing,
    title,
    scaleMode = "transform",
    anchor = "top",
    class: className = "",
    children,
  }: Props = $props();

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 2.5;

  type DragState =
    | {
        kind: "move";
        startX: number;
        startY: number;
        startRect: HudPanelRect;
      }
    | {
        kind: "resize";
        startX: number;
        startY: number;
        startScale: number;
      };

  let dragState: DragState | null = $state(null);
  let previewOffset = $state({ x: 0, y: 0 });
  let previewScale = $state(1);
  let pendingPointer = $state<{ x: number; y: number } | null>(null);
  let previewRafId: number | null = null;

  const panelScale = $derived((rect.scale ?? 1) * previewScale);
  const panelWidth = $derived(
    rect.width === undefined
      ? undefined
      : scaleMode === "width"
        ? rect.width * panelScale
        : rect.width,
  );
  const panelTransform = $derived(
    [
      scaleMode === "transform" ? `scale(${panelScale})` : "",
      anchor === "bottom" ? "translateY(-100%)" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  const panelStyle = $derived(
    [
      `left: ${rect.x + previewOffset.x}px`,
      `top: ${rect.y + previewOffset.y}px`,
      panelWidth === undefined ? "" : `width: ${panelWidth}px`,
      panelTransform
        ? `transform: ${panelTransform}; transform-origin: top left`
        : "",
    ]
      .filter(Boolean)
      .join("; "),
  );

  function clampPosition(x: number, y: number) {
    if (typeof window === "undefined") return { x, y };
    return {
      x: Math.max(0, Math.min(window.innerWidth - 24, x)),
      y: Math.max(0, Math.min(window.innerHeight - 24, y)),
    };
  }

  function startMove(e: PointerEvent) {
    if (!editing || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button,input,select,textarea,a")) return;

    e.preventDefault();
    e.stopPropagation();
    dragState = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...rect },
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function startResize(e: PointerEvent) {
    if (!editing || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragState = {
      kind: "resize",
      startX: e.clientX,
      startY: e.clientY,
      startScale: panelScale,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragState) return;
    pendingPointer = { x: e.clientX, y: e.clientY };
    if (previewRafId !== null) return;
    previewRafId = window.requestAnimationFrame(() => {
      previewRafId = null;
      applyPendingPreview();
    });
  }

  function applyPendingPreview() {
    if (!dragState || !pendingPointer) return;
    if (dragState.kind === "resize") {
      const delta =
        (pendingPointer.x -
          dragState.startX +
          pendingPointer.y -
          dragState.startY) /
        300;
      const nextScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, dragState.startScale + delta),
      );
      previewScale =
        dragState.startScale > 0 ? nextScale / dragState.startScale : 1;
      return;
    }

    const next = clampPosition(
      dragState.startRect.x + pendingPointer.x - dragState.startX,
      dragState.startRect.y + pendingPointer.y - dragState.startY,
    );
    previewOffset = {
      x: next.x - dragState.startRect.x,
      y: next.y - dragState.startRect.y,
    };
  }

  function stopDrag() {
    if (previewRafId !== null) {
      window.cancelAnimationFrame(previewRafId);
      previewRafId = null;
    }
    applyPendingPreview();
    if (dragState?.kind === "move") {
      rect.x = dragState.startRect.x + previewOffset.x;
      rect.y = dragState.startRect.y + previewOffset.y;
    } else if (dragState?.kind === "resize") {
      rect.scale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, dragState.startScale * previewScale),
      );
    }
    dragState = null;
    pendingPointer = null;
    previewOffset = { x: 0, y: 0 };
    previewScale = 1;
    window.removeEventListener("pointermove", onPointerMove);
  }

  $effect(() => {
    return () => {
      if (previewRafId !== null) {
        window.cancelAnimationFrame(previewRafId);
        previewRafId = null;
      }
      window.removeEventListener("pointermove", onPointerMove);
    };
  });
</script>

<section
  class={`overlay-group ${className}`}
  class:editable={editing}
  style={panelStyle}
  aria-label={title}
  onpointerdown={startMove}
>
  {#if editing}
    <div class="group-tag">
      <span>{title}</span>
    </div>
  {/if}
  <div class="panel-content">
    {@render children()}
  </div>
  {#if editing}
    <button
      class="resize-handle"
      type="button"
      aria-label={`调整${title}缩放`}
      onpointerdown={startResize}
    ></button>
  {/if}
</section>

<style>
  .overlay-group {
    box-sizing: border-box;
    transition:
      box-shadow 180ms ease,
      border-color 180ms ease;
  }

  .panel-content {
    width: 100%;
  }

  .resize-handle:focus-visible {
    outline: 2px solid #f8fafc;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay-group {
      transition: none;
    }
  }
</style>
