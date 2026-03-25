<script lang="ts">
  /**
   * @file This is the root layout for the application.
   * It imports the global stylesheet and disables the context menu.
   */
  import { browser } from "$app/environment";
  import "../app.css";
  import {
    initI18n,
    resolvedLanguage,
    setLanguage,
    tw,
  } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  // Only allow warnings and errors to be printed to console in production builds
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    // Keep warn and error; disable verbose logging
    console.log = (..._args: any[]) => {};
    console.debug = (..._args: any[]) => {};
    console.info = (..._args: any[]) => {};
  }

  let { children } = $props();
  let i18nReady = $state(false);

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

  function titleKeyForPath(pathname: string) {
    if (pathname.startsWith("/live")) return "window.live";
    if (pathname.startsWith("/game-overlay")) return "window.gameOverlay";
    if (pathname.startsWith("/monster-overlay")) return "window.monsterOverlay";
    if (pathname.startsWith("/main/dps/settings")) return "window.settings";
    if (pathname.startsWith("/main/dps/history")) return "window.history";
    if (pathname.startsWith("/main/dps/themes")) return "window.themes";
    if (pathname.startsWith("/main/skill-monitor")) return "window.skillMonitor";
    if (pathname.startsWith("/main/monster-monitor")) return "window.monsterMonitor";
    if (pathname.startsWith("/main/module-calc")) return "window.moduleCalc";
    return "window.main";
  }

  function syncLanguageDocumentState() {
    document.documentElement.lang = resolvedLanguage();
    document.title = tw(titleKeyForPath(window.location.pathname));
  }

  $effect(() => {
    if (!browser) return;
    let disposed = false;

    void (async () => {
      try {
        await initI18n(SETTINGS.app.state.language);
        if (disposed) return;
        syncLanguageDocumentState();
      } catch (error) {
        console.error("Failed to initialize i18n:", error);
      } finally {
        if (!disposed) {
          i18nReady = true;
        }
      }
    })();

    return () => {
      disposed = true;
    };
  });

  $effect(() => {
    if (!browser || !i18nReady) return;
    const selectedLanguage = SETTINGS.app.state.language;
    void setLanguage(selectedLanguage)
      .then(() => {
        syncLanguageDocumentState();
      })
      .catch((error) => {
        console.error("Failed to switch language:", error);
      });
  });


</script>

<svelte:window oncontextmenu={(e) => e.preventDefault()} onpopstate={() => browser && i18nReady && syncLanguageDocumentState()} />

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

{@render children()}
