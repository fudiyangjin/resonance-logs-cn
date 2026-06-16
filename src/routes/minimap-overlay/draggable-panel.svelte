<script lang="ts">
  import type { Snippet } from "svelte";
  import type { MinimapPanelRect } from "$lib/settings-store";

  type ScaleMode = "transform" | "width";

  type Props = {
    rect: MinimapPanelRect;
    editing: boolean;
    title: string;
    scaleMode?: ScaleMode;
    class?: string;
    children: Snippet;
  };

  let {
    rect,
    editing,
    title,
    scaleMode = "transform",
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
        startRect: MinimapPanelRect;
      }
    | {
        kind: "resize";
        startX: number;
        startY: number;
        startScale: number;
      };

  let dragState: DragState | null = $state(null);

  const panelScale = $derived(rect.scale ?? 1);
  const panelWidth = $derived(
    scaleMode === "width" ? rect.width * panelScale : rect.width,
  );
  const panelStyle = $derived(
    [
      `left: ${rect.x}px`,
      `top: ${rect.y}px`,
      `width: ${panelWidth}px`,
      scaleMode === "transform"
        ? `transform: scale(${panelScale}); transform-origin: top left`
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
    if (dragState.kind === "resize") {
      const delta =
        (e.clientX - dragState.startX + e.clientY - dragState.startY) / 300;
      rect.scale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, dragState.startScale + delta),
      );
      return;
    }

    const next = clampPosition(
      dragState.startRect.x + e.clientX - dragState.startX,
      dragState.startRect.y + e.clientY - dragState.startY,
    );
    rect.x = next.x;
    rect.y = next.y;
  }

  function stopDrag() {
    dragState = null;
    window.removeEventListener("pointermove", onPointerMove);
  }

  $effect(() => {
    return () => {
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
