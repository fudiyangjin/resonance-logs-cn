<script lang="ts">
  /**
   * @file This is the root layout for the application.
   * It imports the global stylesheet and disables the context menu.
  */
  import "../app.css";
  import { onMount } from "svelte";
  import { SETTINGS } from "$lib/settings-store";
  // Only allow warnings and errors to be printed to console in production builds
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    // Keep warn and error; disable verbose logging
    console.log = (..._args: any[]) => {};
    console.debug = (..._args: any[]) => {};
    console.info = (..._args: any[]) => {};
  }

  let { children } = $props();
  let isMainWindow = $state(false);
  let lastSyncedHideMainWindowToTray: boolean | null = null;

  const customThemeKeyToCssVar: Record<string, string | string[]> = {
    backgroundMain: "--background-main",
    backgroundLive: "--background-live",
    foreground: "--foreground",
    surface: ["--card", "--popover"],
    surfaceForeground: ["--card-foreground", "--popover-foreground"],
    primary: ["--primary", "--ring"],
    primaryForeground: "--primary-foreground",
    secondary: "--secondary",
    secondaryForeground: "--secondary-foreground",
    muted: "--muted",
    mutedForeground: "--muted-foreground",
    accent: "--accent",
    accentForeground: "--accent-foreground",
    destructive: "--destructive",
    destructiveForeground: "--destructive-foreground",
    border: "--border",
    input: "--input",
    tooltipBg: "--tooltip-bg",
    tooltipBorder: "--tooltip-border",
    tooltipFg: "--tooltip-fg",
    tableTextColor: ["--player-text-color", "--skill-text-color"],
    tableAbbreviatedColor: ["--abbreviated-color", "--skill-abbreviated-color"],
  };

  // Apply custom theme colors to CSS variables
  function applyCustomThemeColors(colors: Record<string, string>) {
    const root = document.documentElement;
    for (const [key, cssVars] of Object.entries(customThemeKeyToCssVar)) {
      const colorValue = colors[key];
      if (colorValue) {
        if (Array.isArray(cssVars)) {
          cssVars.forEach(v => root.style.setProperty(v, colorValue));
        } else {
          root.style.setProperty(cssVars, colorValue);
        }
      }
    }
  }


  onMount(() => {
    void (async () => {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const { hideEventLoggerWindow, showEventLoggerWindow } = await import("$lib/event-logger-window");
      const currentWindow = getCurrentWebviewWindow();
      if (currentWindow.label !== "main") return;
      isMainWindow = true;

      if (SETTINGS.customTriggers.state.loggerStartWithMeter) {
        await showEventLoggerWindow();
      } else {
        await hideEventLoggerWindow();
      }
    })();
  });

  async function syncHideMainWindowToTray(enabled: boolean) {
    const { commands } = await import("$lib/bindings");
    const result = await commands.setHideMainWindowToTray(enabled);
    if (result.status === "error") {
      console.error("Failed to sync main-window tray behavior", result.error);
    }
  }

  // Remove custom theme inline styles
  function clearCustomThemeColors() {
    const root = document.documentElement;
    for (const cssVars of Object.values(customThemeKeyToCssVar)) {
      if (Array.isArray(cssVars)) {
        cssVars.forEach(v => root.style.removeProperty(v));
      } else {
        root.style.removeProperty(cssVars);
      }
    }
  }


</script>

<svelte:window oncontextmenu={(e) => e.preventDefault()} />

<!-- Apply theme on the document element -->
{(() => {
  $effect(() => {
    if (typeof document !== "undefined") {
      const customThemeColors = SETTINGS.accessibility.state.customThemeColors;

      // Always operate in 'custom' theme mode. Apply any custom colors if present.
      document.documentElement.setAttribute("data-theme", "custom");

      if (customThemeColors) {
        applyCustomThemeColors(customThemeColors);
      } else {
        clearCustomThemeColors();
      }
    }
  });
})()}

{(() => {
  $effect(() => {
    if (!isMainWindow) return;

    const enabled = SETTINGS.appBehavior.state.hideMainWindowToTray === true;
    if (lastSyncedHideMainWindowToTray === enabled) return;
    lastSyncedHideMainWindowToTray = enabled;
    void syncHideMainWindowToTray(enabled);
  });
})()}

{@render children()}
