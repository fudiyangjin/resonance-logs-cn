<script lang="ts">
  import { onMount, tick } from "svelte";

  type ActiveTitleTooltip = {
    element: HTMLElement;
    title: string;
    left: number;
    top: number;
    width: number;
  };

  const TOOLTIP_MARGIN = 12;
  const TOOLTIP_GAP = 8;
  const TOOLTIP_WIDTH = 460;
  const SHOW_DELAY_MS = 180;
  const STORED_TITLE_ATTR = "data-resonance-title-tooltip";

  let activeTooltip = $state<ActiveTitleTooltip | null>(null);
  let tooltipElement = $state<HTMLDivElement | undefined>(undefined);
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTitleElement: HTMLElement | null = null;

  function clearShowTimer(): void {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  }

  function findTitleElement(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest<HTMLElement>("[title]");
    if (!element || element === document.documentElement) return null;
    const title = element.getAttribute("title")?.trim();
    return title ? element : null;
  }

  function restoreTitle(element: HTMLElement | undefined): void {
    if (!element?.isConnected) return;
    const storedTitle = element.getAttribute(STORED_TITLE_ATTR);
    if (storedTitle !== null) {
      element.setAttribute("title", storedTitle);
      element.removeAttribute(STORED_TITLE_ATTR);
    }
  }

  async function positionTooltip(): Promise<void> {
    await tick();
    if (!activeTooltip || !tooltipElement) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const rect = activeTooltip.element.getBoundingClientRect();
    const width = Math.min(TOOLTIP_WIDTH, Math.max(220, viewportWidth - TOOLTIP_MARGIN * 2));
    const tooltipHeight = tooltipElement.getBoundingClientRect().height;

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.min(
      Math.max(left, TOOLTIP_MARGIN),
      Math.max(TOOLTIP_MARGIN, viewportWidth - width - TOOLTIP_MARGIN),
    );

    const above = rect.top - tooltipHeight - TOOLTIP_GAP;
    const below = rect.bottom + TOOLTIP_GAP;
    let top = above >= TOOLTIP_MARGIN ? above : below;
    if (top + tooltipHeight + TOOLTIP_MARGIN > viewportHeight && above >= TOOLTIP_MARGIN) {
      top = above;
    }
    top = Math.min(
      Math.max(top, TOOLTIP_MARGIN),
      Math.max(TOOLTIP_MARGIN, viewportHeight - tooltipHeight - TOOLTIP_MARGIN),
    );

    activeTooltip = {
      ...activeTooltip,
      left,
      top,
      width,
    };
  }

  function tooltipStyle(): string {
    if (!activeTooltip) return "";
    return [
      `left: ${activeTooltip.left}px`,
      `top: ${activeTooltip.top}px`,
      `width: ${activeTooltip.width}px`,
      `max-height: calc(100vh - ${TOOLTIP_MARGIN * 2}px)`,
    ].join("; ");
  }

  function hideTooltip(): void {
    clearShowTimer();
    restoreTitle(activeTooltip?.element);
    restoreTitle(pendingTitleElement ?? undefined);
    pendingTitleElement = null;
    activeTooltip = null;
  }

  function scheduleTooltip(element: HTMLElement): void {
    clearShowTimer();

    if (activeTooltip?.element && activeTooltip.element !== element) {
      restoreTitle(activeTooltip.element);
      activeTooltip = null;
    }
    if (pendingTitleElement && pendingTitleElement !== element) {
      restoreTitle(pendingTitleElement);
    }

    const title = element.getAttribute("title")?.trim();
    if (!title) return;

    pendingTitleElement = element;
    element.setAttribute(STORED_TITLE_ATTR, title);
    element.removeAttribute("title");

    showTimer = setTimeout(() => {
      showTimer = null;
      pendingTitleElement = null;
      activeTooltip = {
        element,
        title,
        left: TOOLTIP_MARGIN,
        top: TOOLTIP_MARGIN,
        width: TOOLTIP_WIDTH,
      };
      void positionTooltip();
    }, SHOW_DELAY_MS);
  }

  function handlePointerOver(event: PointerEvent): void {
    const element = findTitleElement(event.target);
    if (!element || activeTooltip?.element === element || pendingTitleElement === element) return;
    scheduleTooltip(element);
  }

  function handlePointerOut(event: PointerEvent): void {
    const activeElement = activeTooltip?.element;
    const pendingElement = pendingTitleElement;
    const element = activeElement ?? pendingElement;
    if (!element) return;

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && element.contains(relatedTarget)) return;
    hideTooltip();
  }

  function handleFocusIn(event: FocusEvent): void {
    const element = findTitleElement(event.target);
    if (element) scheduleTooltip(element);
  }

  function handleFocusOut(event: FocusEvent): void {
    const activeElement = activeTooltip?.element;
    if (!activeElement) {
      hideTooltip();
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && activeElement.contains(relatedTarget)) return;
    hideTooltip();
  }

  function handleWindowChange(): void {
    if (activeTooltip?.element?.isConnected) {
      void positionTooltip();
    } else {
      hideTooltip();
    }
  }

  onMount(() => {
    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    window.addEventListener("scroll", handleWindowChange, true);
    window.addEventListener("resize", handleWindowChange);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("resize", handleWindowChange);
      hideTooltip();
    };
  });
</script>

{#if activeTooltip}
  <div
    bind:this={tooltipElement}
    class="pointer-events-none fixed z-[1000] overflow-y-auto whitespace-pre-line rounded-sm border px-2 py-1.5 text-left text-xs leading-snug shadow-2xl"
    style="{tooltipStyle()}; background: var(--tooltip-bg); color: var(--tooltip-fg); border-color: var(--tooltip-border);"
  >
    {activeTooltip.title}
  </div>
{/if}
