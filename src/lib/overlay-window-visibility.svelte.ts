/**
 * @file Shared visibility state for the overlay/companion windows that are
 * toggled from buttons in the main window. The game/monster/minimap keys are
 * logical domains backed by one `hud-overlay` WebView; `live` remains physical.
 */
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { emitLivePullGate } from "$lib/live-pull-gate";
import {
  isHudDomainEnabled,
  toggleHudDomainEnabled,
} from "$lib/hud-domain-rules.svelte";
import {
  HUD_EDIT_REQUEST_EVENT,
  HUD_OVERLAY_LABEL,
  HUD_READY_EVENT,
  HUD_STATE_SYNC_EVENT,
  isHudDomain,
  shouldShowHudWindow,
  type HudEditRequestEvent,
  type HudDomain,
  type HudDomainVisibility,
} from "$lib/hud-overlay";

export type OverlayWindowLabel = HudDomain | "live";

const visibility = $state<Record<OverlayWindowLabel, boolean>>({
  game: false,
  monster: false,
  minimap: false,
  live: false,
});
let hudEditing = false;
let hudReady = false;

if (typeof window !== "undefined") {
  void listen<HudEditRequestEvent>(HUD_EDIT_REQUEST_EVENT, (event) => {
    hudEditing = event.payload.editing;
    if (hudReady) void synchronizeHudWindow();
  });
  void listen(HUD_READY_EVENT, () => {
    hudReady = true;
    void synchronizeHudWindow();
  });
}

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

export async function toggleHudEditing(): Promise<void> {
  hudEditing = !hudEditing;
  if (hudReady) await synchronizeHudWindow();
}

export async function toggleHudDomainWithRestore(
  domain: HudDomain,
): Promise<void> {
  // When the domain is still enabled but the OS minimized the window, the
  // click means "bring it back", not "turn it off".
  if (isHudDomainEnabled(domain)) {
    const win = await WebviewWindow.getByLabel(HUD_OVERLAY_LABEL);
    if (win && (await win.isMinimized())) {
      await win.show();
      await win.unminimize();
      return;
    }
  }
  toggleHudDomainEnabled(domain);
}

export async function refreshOverlayWindowVisibility(
  label: OverlayWindowLabel,
): Promise<void> {
  try {
    // Logical HUD visibility is authoritative. A hidden shared HWND says
    // nothing about which of its three domains should be restored.
    if (isHudDomain(label)) return;
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
    if (isHudDomain(label)) {
      await setHudDomainVisible(label, shouldShow);
      return;
    }

    const win = await WebviewWindow.getByLabel(label);
    if (!win) return;
    if (shouldShow) {
      await win.show();
      await win.unminimize();
      await emitLivePullGate(win, true);
      if (opts.focus) await win.setFocus();
    } else {
      await emitLivePullGate(win, false);
      await win.hide();
    }
    visibility[label] = shouldShow;
  } catch (error) {
    console.error(`[overlay-visibility] failed to set ${label}`, error);
  }
}

async function setHudDomainVisible(
  domain: HudDomain,
  shouldShow: boolean,
): Promise<void> {
  visibility[domain] = shouldShow;
  if (!hudReady) return;

  const win = await WebviewWindow.getByLabel(HUD_OVERLAY_LABEL);
  if (!win) return;
  await synchronizeHudWindow(win);
}

function hudVisibilitySnapshot(): HudDomainVisibility {
  return {
    game: visibility.game,
    monster: visibility.monster,
    minimap: visibility.minimap,
  };
}

async function synchronizeHudWindow(existing?: WebviewWindow): Promise<void> {
  try {
    const win = existing ?? (await WebviewWindow.getByLabel(HUD_OVERLAY_LABEL));
    if (!win) {
      hudReady = false;
      return;
    }

    const snapshot = hudVisibilitySnapshot();
    await win.emit(HUD_STATE_SYNC_EVENT, {
      visibility: snapshot,
      editing: hudEditing,
    });
    if (shouldShowHudWindow(snapshot, hudEditing)) {
      await win.show();
      await win.unminimize();
      await emitLivePullGate(win, true);
    } else {
      await emitLivePullGate(win, false);
      await win.hide();
    }
  } catch (error) {
    hudReady = false;
    console.error(
      "[overlay-visibility] failed to synchronize hud-overlay",
      error,
    );
  }
}

export async function toggleOverlayWindow(
  label: OverlayWindowLabel,
): Promise<void> {
  await refreshOverlayWindowVisibility(label);
  await setOverlayWindowVisible(label, !isOverlayWindowVisible(label), {
    focus: label === "live",
  });
}

export async function toggleMinimizeMonitorWindows(): Promise<void> {
  try {
    const windows = (
      await Promise.all(
        (["live", HUD_OVERLAY_LABEL] as const).map((label) =>
          WebviewWindow.getByLabel(label),
        ),
      )
    ).filter((win): win is WebviewWindow => win !== null);

    const states = await Promise.all(
      windows.map(async (win) => ({
        win,
        visible: await win.isVisible(),
        minimized: await win.isMinimized(),
      })),
    );

    if (states.some((s) => s.visible && !s.minimized)) {
      await Promise.all(
        states
          .filter((s) => s.visible && !s.minimized)
          .map((s) => s.win.minimize()),
      );
      return;
    }

    await Promise.all(
      states.map(async (s) => {
        if (s.minimized) {
          await s.win.unminimize();
          return;
        }
        if (s.visible) return;
        // This shortcut is the master switch: bring the window back no matter
        // how it left the screen (the DPS toggle and the live header button
        // both hide instead of minimizing). The HUD window only shows when one
        // of its domains is on, otherwise there is nothing to render.
        if (s.win.label === "live") {
          await setOverlayWindowVisible("live", true);
        } else if (shouldShowHudWindow(hudVisibilitySnapshot(), hudEditing)) {
          await s.win.show();
          await emitLivePullGate(s.win, true);
        }
      }),
    );
  } catch (error) {
    console.error("[overlay-visibility] failed to toggle minimize", error);
  }
}
