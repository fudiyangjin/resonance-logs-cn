/**
 * @file Shared visibility state for the overlay/companion windows that are
 * toggled from buttons in the main window (game-overlay, monster-overlay,
 * minimap-overlay, live). All consumers of this module run inside the same
 * "main" window JS context, so a single module-level $state is sufficient -
 * no cross-window event broadcasting is needed.
 */
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type OverlayWindowLabel =
  | "game-overlay"
  | "monster-overlay"
  | "minimap-overlay"
  | "live";

const visibility = $state<Record<OverlayWindowLabel, boolean>>({
  "game-overlay": false,
  "monster-overlay": false,
  "minimap-overlay": false,
  live: false,
});

async function resolveActuallyVisible(win: WebviewWindow): Promise<boolean> {
  // isVisible() can still report true while the window is minimized, so both
  // checks are needed to know whether the user can actually see the window.
  const [visible, minimized] = await Promise.all([
    win.isVisible(),
    win.isMinimized(),
  ]);
  return visible && !minimized;
}

export function isOverlayWindowVisible(label: OverlayWindowLabel): boolean {
  return visibility[label];
}

export async function refreshOverlayWindowVisibility(
  label: OverlayWindowLabel,
): Promise<void> {
  try {
    const win = await WebviewWindow.getByLabel(label);
    visibility[label] = win ? await resolveActuallyVisible(win) : false;
  } catch (error) {
    console.error(`[overlay-visibility] failed to refresh ${label}`, error);
  }
}

export async function setOverlayWindowVisible(
  label: OverlayWindowLabel,
  shouldShow: boolean,
  opts: { focus?: boolean } = {},
): Promise<void> {
  try {
    const win = await WebviewWindow.getByLabel(label);
    if (!win) return;
    if (shouldShow) {
      await win.show();
      await win.unminimize();
      if (opts.focus) await win.setFocus();
    } else {
      await win.hide();
    }
    visibility[label] = shouldShow;
  } catch (error) {
    console.error(`[overlay-visibility] failed to set ${label}`, error);
  }
}

export async function toggleOverlayWindow(
  label: OverlayWindowLabel,
): Promise<void> {
  await refreshOverlayWindowVisibility(label);
  await setOverlayWindowVisible(label, !isOverlayWindowVisible(label), {
    focus: true,
  });
}
