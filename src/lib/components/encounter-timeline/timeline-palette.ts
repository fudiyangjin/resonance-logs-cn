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
  mine: "#60a5fa",
  /** Cumulative-DPS curve. A distinct hue from `mine` on purpose: the two
   * readings used to share one colour, which left the legend unable to tell
   * them apart. Kept clear of `boss` red and `fallbackPlayer` purple. */
  average: "#fbbf24",
  boss: "#f87171",
  fallbackPlayer: "#a78bfa",
  /** Inactive-combat gaps excluded from buff coverage (lanes + legend). */
  inactiveHatch:
    "repeating-linear-gradient(135deg,rgba(148,163,184,0.12) 0 3px,transparent 3px 7px)",
} as const;

export function timelinePaletteCssVars(): string {
  const p = TIMELINE_PALETTE;
  return (
    `--tl-bg:${p.bg};--tl-header-bg:${p.headerBg};--tl-popover-bg:${p.popoverBg};` +
    `--tl-fg:${p.fg};--tl-fg-muted:${p.fgMuted};--tl-row-line:${p.rowLine};` +
    `--tl-mine:${p.mine};--tl-average:${p.average};` +
    `--tl-tooltip-bg:${p.tooltipBg};--tl-tooltip-border:${p.tooltipBorder};` +
    `--tl-inactive-hatch:${p.inactiveHatch};`
  );
}
