/**
 * Fixed dark "chart island" palette. Canvas (ECharts) cannot read CSS custom
 * properties, so this used to be duplicated by hand as both TS constants and
 * a `<style>` block. It now lives once here: `paletteCssVars()` seeds the CSS
 * variables consumed by component `<style>` blocks, and the same constants
 * feed the ECharts option builder directly.
 */
export const TIMELINE_PALETTE = {
  bg: "#14171d",
  headerBg: "#181c24",
  popoverBg: "#1b1f28",
  fg: "#e7e9ee",
  fgMuted: "#8b93a4",
  rowLine: "rgba(148,163,184,0.1)",
  grid: "rgba(148,163,184,0.10)",
  axis: "rgba(148,163,184,0.20)",
  tooltipBg: "rgba(15,18,24,0.94)",
  tooltipBorder: "rgba(148,163,184,0.22)",
  /** UI accent for selection / brush / minimap window / resize handles.
   * Never a player color: players (the local one included) use their
   * class/spec color, see `assignTimelineColors`. */
  accent: "#60a5fa",
  boss: "#f87171",
  /** Player color when the configured class/spec color is not a hex value. */
  fallbackPlayer: "#a78bfa",
  /** Inactive-combat gaps excluded from buff coverage (lanes + legend). */
  inactiveHatch:
    "repeating-linear-gradient(135deg,rgba(148,163,184,0.12) 0 3px,transparent 3px 7px)",
} as const;

/** `selfColor` is the local player's chart color (`--tl-self`), the one
 * per-encounter value the component styles need besides the fixed palette. */
export function timelinePaletteCssVars(selfColor: string): string {
  const p = TIMELINE_PALETTE;
  return (
    `--tl-bg:${p.bg};--tl-header-bg:${p.headerBg};--tl-popover-bg:${p.popoverBg};` +
    `--tl-fg:${p.fg};--tl-fg-muted:${p.fgMuted};--tl-row-line:${p.rowLine};` +
    `--tl-accent:${p.accent};--tl-self:${selfColor};` +
    `--tl-tooltip-bg:${p.tooltipBg};--tl-tooltip-border:${p.tooltipBorder};` +
    `--tl-inactive-hatch:${p.inactiveHatch};`
  );
}
