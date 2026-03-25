<script lang="ts">
  import { tl } from "$lib/i18n/index.svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import SettingsSelect from "../settings/settings-select.svelte";
  import SettingsSlider from "../settings/settings-slider.svelte";
  import SettingsSwitch from "../settings/settings-switch.svelte";
  import SettingsColor from "../settings/settings-color.svelte";
  import SettingsColorAlpha from "../settings/settings-color-alpha.svelte";
  import SettingsFilePicker from "../settings/settings-file-picker.svelte";
  import {
    SETTINGS,
    DEFAULT_CLASS_COLORS,
    DEFAULT_CLASS_SPEC_COLORS,
    CLASS_SPEC_NAMES,
    DEFAULT_CUSTOM_THEME_COLORS,
    CUSTOM_THEME_COLOR_LABELS,
  } from "$lib/settings-store";
  import {
    setClickthrough,
    CLASS_NAMES,
    getClassColorRaw,
  } from "$lib/utils.svelte";
  import ChevronDown from "virtual:icons/lucide/chevron-down";

  const themesTabs = [
    { id: "general", label: "General" },
    { id: "live", label: "Live" },
    { id: "presets", label: "Presets" },
  ];

  // === COLOR THEME PRESETS (matching CSS data-theme selectors) ===
  // Color presets now include full variable mappings (from CSS data-theme blocks)
  const COLOR_PRESETS: Record<
    string,
    {
      name: string;
      description: string;
      theme: string;
      preview: { bg: string; primary: string; accent: string; fg: string };
      vars?: Record<string, string>;
    }
  > = {
    dark: {
      name: "Dark",
      description: "A clean dark theme built with neutral grays",
      theme: "dark",
      preview: {
        bg: "#212121",
        primary: "#a6a6a6",
        accent: "#525252",
        fg: "#e2e2e2",
      },
      vars: {
        backgroundMain: "oklch(0.2178 0 0)",
        backgroundLive: "oklch(0.2178 0 0)",
        foreground: "oklch(0.8853 0 0)",
        surface: "oklch(0.2435 0 0)",
        surfaceForeground: "oklch(0.8853 0 0)",
        primary: "oklch(0.7058 0 0)",
        primaryForeground: "oklch(0.2178 0 0)",
        secondary: "oklch(0.3092 0 0)",
        secondaryForeground: "oklch(0.8853 0 0)",
        muted: "oklch(0.2850 0 0)",
        mutedForeground: "oklch(0.5999 0 0)",
        accent: "oklch(0.3715 0 0)",
        accentForeground: "oklch(0.8853 0 0)",
        destructive: "oklch(0.6591 0.1530 22.1703)",
        destructiveForeground: "oklch(1 0 0)",
        border: "oklch(0.3290 0 0)",
        input: "oklch(0.3092 0 0)",
        tooltipBg: "oklch(0.275 0 0 / 0.92)",
        tooltipBorder: "oklch(0.38 0 0 / 0.55)",
        tooltipFg: "oklch(0.8853 0 0)",
        tableTextColor: "#ffffff",
        tableAbbreviatedColor: "#71717a",
      },
    },
    light: {
      name: "Light",
      description: "A bright theme suited for daytime use",
      theme: "light",
      preview: {
        bg: "#fbfbf9",
        primary: "#5b7fc7",
        accent: "#d4a84a",
        fg: "#2a2e40",
      },
      vars: {
        backgroundMain: "oklch(0.985 0.01 95)",
        backgroundLive: "oklch(0.985 0.01 95)",
        foreground: "oklch(0.19 0.02 250)",
        surface: "oklch(0.97 0.01 95)",
        surfaceForeground: "oklch(0.19 0.02 250)",
        primary: "oklch(0.65 0.12 250)",
        primaryForeground: "oklch(0.99 0.01 95)",
        secondary: "oklch(0.92 0.02 95)",
        secondaryForeground: "oklch(0.34 0.04 250)",
        muted: "oklch(0.9 0.015 95)",
        mutedForeground: "oklch(0.48 0.02 240)",
        accent: "oklch(0.78 0.14 60)",
        accentForeground: "oklch(0.18 0.03 250)",
        destructive: "oklch(0.62 0.24 25)",
        destructiveForeground: "oklch(0.98 0.01 95)",
        border: "oklch(0.88 0.02 95)",
        input: "oklch(0.94 0.015 95)",
        tooltipBg: "oklch(0.86 0.01 95 / 0.96)",
        tooltipBorder: "oklch(0.78 0.02 95 / 0.65)",
        tooltipFg: "oklch(0.19 0.02 250)",
        tableTextColor: "#2a2e40",
        tableAbbreviatedColor: "#71717a",
      },
    },
    pink: {
      name: "Pink UwU",
      description: "A cute soft pink muted style",
      theme: "pink",
      preview: {
        bg: "#F8E8EE",
        primary: "#F2BED1",
        accent: "#F2BED1",
        fg: "#582F3B",
      },
      vars: {
        backgroundMain: "#F8E8EE",
        backgroundLive: "#F8E8EE",
        foreground: "#582F3B",
        surface: "#F9F5F6",
        surfaceForeground: "#582F3B",
        primary: "#F2BED1",
        primaryForeground: "#402028",
        secondary: "#FDCEDF",
        secondaryForeground: "#5A2F3D",
        muted: "#F9F5F6",
        mutedForeground: "#7A5461",
        accent: "#F2BED1",
        accentForeground: "#402028",
        destructive: "#D35D6E",
        destructiveForeground: "#FFF9FB",
        border: "#F2BED1",
        input: "#FDCEDF",
        tooltipBg: "#F2BED1EE",
        tooltipBorder: "#F2BED1",
        tooltipFg: "#582F3B",
        tableTextColor: "#582F3B",
        tableAbbreviatedColor: "#7A5461",
      },
    },
    green: {
      name: "Muted Green",
      description: "A muted natural green palette",
      theme: "green",
      preview: {
        bg: "#e0f0e0",
        primary: "#6fbf6f",
        accent: "#7fcf8f",
        fg: "#1a2a1a",
      },
      vars: {
        backgroundMain: "oklch(0.94 0.03 150)",
        backgroundLive: "oklch(0.94 0.03 150)",
        foreground: "oklch(0.20 0.03 150)",
        surface: "oklch(0.95 0.025 150)",
        surfaceForeground: "oklch(0.20 0.03 150)",
        primary: "oklch(0.75 0.09 150)",
        primaryForeground: "oklch(0.98 0.015 95)",
        secondary: "oklch(0.90 0.02 145)",
        secondaryForeground: "oklch(0.34 0.04 160)",
        muted: "oklch(0.90 0.02 150)",
        mutedForeground: "oklch(0.42 0.03 140)",
        accent: "oklch(0.78 0.08 160)",
        accentForeground: "oklch(0.22 0.03 160)",
        destructive: "oklch(0.62 0.24 25)",
        destructiveForeground: "oklch(0.99 0.01 95)",
        border: "oklch(0.86 0.02 150)",
        input: "oklch(0.92 0.015 150)",
        tooltipBg: "oklch(0.90 0.02 150 / 0.96)",
        tooltipBorder: "oklch(0.80 0.02 150 / 0.55)",
        tooltipFg: "oklch(0.20 0.03 150)",
        tableTextColor: "#1a2a1a",
        tableAbbreviatedColor: "#71717a",
      },
    },
    matcha: {
      name: "Matcha",
      description: "An earthy green / matcha atmosphere",
      theme: "matcha",
      preview: {
        bg: "#d8e8d0",
        primary: "#5a9f5a",
        accent: "#6ab06a",
        fg: "#283828",
      },
      vars: {
        backgroundMain: "oklch(0.90 0.03 125)",
        backgroundLive: "oklch(0.90 0.03 125)",
        foreground: "oklch(0.24 0.04 125)",
        surface: "oklch(0.92 0.03 125)",
        surfaceForeground: "oklch(0.24 0.04 125)",
        primary: "oklch(0.70 0.11 125)",
        primaryForeground: "oklch(0.98 0.015 95)",
        secondary: "oklch(0.88 0.02 125)",
        secondaryForeground: "oklch(0.36 0.05 125)",
        muted: "oklch(0.87 0.02 125)",
        mutedForeground: "oklch(0.42 0.03 130)",
        accent: "oklch(0.74 0.10 135)",
        accentForeground: "oklch(0.25 0.04 125)",
        destructive: "oklch(0.62 0.24 25)",
        destructiveForeground: "oklch(0.99 0.01 95)",
        border: "oklch(0.84 0.02 125)",
        input: "oklch(0.90 0.02 125)",
        tooltipBg: "oklch(0.88 0.02 125 / 0.96)",
        tooltipBorder: "oklch(0.78 0.02 125 / 0.55)",
        tooltipFg: "oklch(0.24 0.04 125)",
        tableTextColor: "#283828",
        tableAbbreviatedColor: "#71717a",
      },
    },
    rainbow: {
      name: "Rainbow Gradient",
      description: "Colorful gradient background",
      theme: "rainbow",
      preview: {
        bg: "linear-gradient(120deg,#ffe5ec,#e0f7fa,#f3e8ff,#e9fbd5)",
        primary: "#b87fd0",
        accent: "#d09050",
        fg: "#383848",
      },
      vars: {
        backgroundMain:
          "linear-gradient(120deg,#ffe5ec,#e0f7fa,#f3e8ff,#e9fbd5)",
        backgroundLive:
          "linear-gradient(120deg,#ffe5ec,#e0f7fa,#f3e8ff,#e9fbd5)",
        foreground: "oklch(0.25 0.03 250)",
        surface: "oklch(0.97 0.02 95)",
        surfaceForeground: "oklch(0.25 0.03 250)",
        primary: "oklch(0.72 0.14 300)",
        primaryForeground: "oklch(0.99 0.01 95)",
        secondary: "oklch(0.80 0.10 140)",
        secondaryForeground: "oklch(0.28 0.03 240)",
        muted: "oklch(0.90 0.02 95)",
        mutedForeground: "oklch(0.45 0.03 250)",
        accent: "oklch(0.78 0.13 40)",
        accentForeground: "oklch(0.22 0.03 250)",
        destructive: "oklch(0.60 0.22 25)",
        destructiveForeground: "oklch(0.99 0.01 95)",
        border: "oklch(0.88 0.02 95)",
        input: "oklch(0.94 0.02 95)",
        tooltipBg: "oklch(0.93 0.02 95 / 0.94)",
        tooltipBorder: "oklch(0.83 0.02 95 / 0.5)",
        tooltipFg: "oklch(0.25 0.03 250)",
        tableTextColor: "#383848",
        tableAbbreviatedColor: "#71717a",
      },
    },
  };

  // === SIZE PRESETS ===
  const SIZE_PRESETS: Record<
    string,
    {
      name: string;
      description: string;
      table: Record<string, number | string | boolean>;
      header: Record<string, number | boolean>;
    }
  > = {
    compact: {
      name: "Minimal",
      description: "Minimal: no inner padding, no header bar",
      table: {
        playerRowHeight: 20,
        playerFontSize: 10,
        playerIconSize: 14,
        showTableHeader: false,
        tableHeaderHeight: 18,
        tableHeaderFontSize: 8,
        abbreviatedFontSize: 7,
        skillRowHeight: 18,
        skillFontSize: 9,
        skillIconSize: 12,
        skillShowHeader: false,
        skillHeaderHeight: 16,
        skillHeaderFontSize: 7,
        skillAbbreviatedFontSize: 6,
        rowGlowMode: "gradient-underline",
        skillRowGlowMode: "gradient-underline",
        rowGlowOpacity: 0.5,
        skillRowGlowOpacity: 0.5,
        rowBorderRadius: 0,
        skillRowBorderRadius: 0,
      },
      header: {
        windowPadding: 0,
        headerPadding: 0,
        showTimer: false,
        showActiveTimer: false,
        showSceneName: false,
        showResetButton: false,
        showPauseButton: false,
        showBossOnlyButton: false,
        showSettingsButton: false,
        showMinimizeButton: false,
        showTotalDamage: false,
        showTotalDps: false,
        showBossHealth: false,
        showNavigationTabs: false,
        timerLabelFontSize: 9,
        timerFontSize: 12,
        activeTimerFontSize: 12,
        sceneNameFontSize: 10,
        resetButtonSize: 14,
        resetButtonPadding: 4,
        pauseButtonSize: 14,
        pauseButtonPadding: 4,
        bossOnlyButtonSize: 14,
        bossOnlyButtonPadding: 4,
        settingsButtonSize: 14,
        settingsButtonPadding: 4,
        minimizeButtonSize: 14,
        minimizeButtonPadding: 4,
        totalDamageLabelFontSize: 9,
        totalDamageValueFontSize: 12,
        totalDpsLabelFontSize: 9,
        totalDpsValueFontSize: 12,
        bossHealthLabelFontSize: 9,
        bossHealthNameFontSize: 10,
        bossHealthValueFontSize: 10,
        bossHealthPercentFontSize: 10,
        navTabFontSize: 8,
        navTabPaddingX: 6,
        navTabPaddingY: 3,
      },
    },
    small: {
      name: "Small",
      description: "Compact layout that shows more rows",
      table: {
        playerRowHeight: 22,
        playerFontSize: 11,
        playerIconSize: 16,
        showTableHeader: true,
        tableHeaderHeight: 20,
        tableHeaderFontSize: 9,
        abbreviatedFontSize: 8,
        skillRowHeight: 20,
        skillFontSize: 10,
        skillIconSize: 14,
        skillShowHeader: true,
        skillHeaderHeight: 18,
        skillHeaderFontSize: 8,
        skillAbbreviatedFontSize: 7,
        rowGlowMode: "gradient-underline",
        skillRowGlowMode: "gradient-underline",
        rowGlowOpacity: 0.5,
        skillRowGlowOpacity: 0.5,
        rowBorderRadius: 0,
        skillRowBorderRadius: 0,
      },
      header: {
        windowPadding: 0,
        headerPadding: 6,
        // Enable only: timer, scene name, reset and pause
        showTimer: true,
        showActiveTimer: false,
        showSceneName: true,
        showResetButton: true,
        showPauseButton: true,
        // Keep other controls disabled by default
        showBossOnlyButton: false,
        showSettingsButton: false,
        showMinimizeButton: false,
        showTotalDamage: false,
        showTotalDps: false,
        showBossHealth: false,
        showNavigationTabs: false,
        timerLabelFontSize: 10,
        timerFontSize: 14,
        activeTimerFontSize: 14,
        sceneNameFontSize: 11,
        resetButtonSize: 16,
        resetButtonPadding: 6,
        pauseButtonSize: 16,
        pauseButtonPadding: 6,
        bossOnlyButtonSize: 16,
        bossOnlyButtonPadding: 6,
        settingsButtonSize: 16,
        settingsButtonPadding: 6,
        minimizeButtonSize: 16,
        minimizeButtonPadding: 6,
        totalDamageLabelFontSize: 10,
        totalDamageValueFontSize: 14,
        totalDpsLabelFontSize: 10,
        totalDpsValueFontSize: 14,
        bossHealthLabelFontSize: 10,
        bossHealthNameFontSize: 11,
        bossHealthValueFontSize: 11,
        bossHealthPercentFontSize: 11,
        navTabFontSize: 9,
        navTabPaddingX: 8,
        navTabPaddingY: 4,
      },
    },
    medium: {
      name: "Medium",
      description: "Balanced sizing suitable for most displays",
      table: {
        playerRowHeight: 28,
        playerFontSize: 13,
        playerIconSize: 20,
        showTableHeader: true,
        tableHeaderHeight: 24,
        tableHeaderFontSize: 11,
        abbreviatedFontSize: 10,
        skillRowHeight: 24,
        skillFontSize: 12,
        skillIconSize: 18,
        skillShowHeader: true,
        skillHeaderHeight: 22,
        skillHeaderFontSize: 10,
        skillAbbreviatedFontSize: 9,
        rowGlowMode: "gradient-underline",
        skillRowGlowMode: "gradient-underline",
        rowGlowOpacity: 0.5,
        skillRowGlowOpacity: 0.5,
        rowBorderRadius: 0,
        skillRowBorderRadius: 0,
      },
      header: {
        windowPadding: 12,
        headerPadding: 8,
        // Enable all header features for medium
        showTimer: true,
        showActiveTimer: false,
        showSceneName: true,
        showResetButton: true,
        showPauseButton: true,
        showBossOnlyButton: true,
        showSettingsButton: true,
        showMinimizeButton: true,
        showTotalDamage: true,
        showTotalDps: true,
        showBossHealth: true,
        showNavigationTabs: true,
        timerLabelFontSize: 12,
        timerFontSize: 18,
        activeTimerFontSize: 18,
        sceneNameFontSize: 14,
        resetButtonSize: 20,
        resetButtonPadding: 8,
        pauseButtonSize: 20,
        pauseButtonPadding: 8,
        bossOnlyButtonSize: 20,
        bossOnlyButtonPadding: 8,
        settingsButtonSize: 20,
        settingsButtonPadding: 8,
        minimizeButtonSize: 20,
        minimizeButtonPadding: 8,
        totalDamageLabelFontSize: 14,
        totalDamageValueFontSize: 18,
        totalDpsLabelFontSize: 14,
        totalDpsValueFontSize: 18,
        bossHealthLabelFontSize: 12,
        bossHealthNameFontSize: 14,
        bossHealthValueFontSize: 14,
        bossHealthPercentFontSize: 14,
        navTabFontSize: 11,
        navTabPaddingX: 12,
        navTabPaddingY: 6,
      },
    },
    large: {
      name: "Large",
      description: "A larger UI suited for high-resolution displays",
      table: {
        playerRowHeight: 36,
        playerFontSize: 16,
        playerIconSize: 26,
        showTableHeader: true,
        tableHeaderHeight: 30,
        tableHeaderFontSize: 13,
        abbreviatedFontSize: 12,
        skillRowHeight: 30,
        skillFontSize: 14,
        skillIconSize: 22,
        skillShowHeader: true,
        skillHeaderHeight: 26,
        skillHeaderFontSize: 12,
        skillAbbreviatedFontSize: 11,
        rowGlowMode: "gradient-underline",
        skillRowGlowMode: "gradient-underline",
        rowGlowOpacity: 0.5,
        skillRowGlowOpacity: 0.5,
        rowBorderRadius: 0,
        skillRowBorderRadius: 0,
      },
      header: {
        windowPadding: 16,
        headerPadding: 12,
        // Enable all header features for large
        showTimer: true,
        showActiveTimer: false,
        showSceneName: true,
        showResetButton: true,
        showPauseButton: true,
        showBossOnlyButton: true,
        showSettingsButton: true,
        showMinimizeButton: true,
        showTotalDamage: true,
        showTotalDps: true,
        showBossHealth: true,
        showNavigationTabs: true,
        timerLabelFontSize: 14,
        timerFontSize: 24,
        activeTimerFontSize: 24,
        sceneNameFontSize: 18,
        resetButtonSize: 26,
        resetButtonPadding: 10,
        pauseButtonSize: 26,
        pauseButtonPadding: 10,
        bossOnlyButtonSize: 26,
        bossOnlyButtonPadding: 10,
        settingsButtonSize: 26,
        settingsButtonPadding: 10,
        minimizeButtonSize: 26,
        minimizeButtonPadding: 10,
        totalDamageLabelFontSize: 16,
        totalDamageValueFontSize: 24,
        totalDpsLabelFontSize: 16,
        totalDpsValueFontSize: 24,
        bossHealthLabelFontSize: 14,
        bossHealthNameFontSize: 18,
        bossHealthValueFontSize: 18,
        bossHealthPercentFontSize: 18,
        navTabFontSize: 13,
        navTabPaddingX: 16,
        navTabPaddingY: 8,
      },
    },
  };

  function applyColorPreset(presetKey: string) {
    const preset = COLOR_PRESETS[presetKey];
    if (preset) {
      SETTINGS.accessibility.state.customThemeColors = {
        ...SETTINGS.accessibility.state.customThemeColors,
        ...preset.vars,
      };
    }
  }

  function applySizePreset(presetKey: string) {
    const preset = SIZE_PRESETS[presetKey];
    if (preset) {
      // Apply table settings
      for (const [key, value] of Object.entries(preset.table)) {
        (SETTINGS.live.tableCustomization.state as any)[key] = value;
      }
      // Apply header settings
      for (const [key, value] of Object.entries(preset.header)) {
        (SETTINGS.live.headerCustomization.state as any)[key] = value;
      }
    }
  }

  let activeTab = $state("general");

  // Collapsible section state - all collapsed by default
  let expandedSections = $state({
    colorThemes: false,
    classSpecColors: false,
    backgroundImage: false,
    customFonts: false,
    liveDisplay: false,
    headerSettings: false,
    tableSettings: false,
    tableRowSettings: false,
    skillTableSettings: false,
  });

  function toggleSection(section: keyof typeof expandedSections) {
    expandedSections[section] = !expandedSections[section];
  }

  // Table size presets removed — sliders shown by default

  // Class/Spec colors tab state - 'class' or 'spec'
  let colorMode = $state<"class" | "spec">("class");

  // Sync useClassSpecColors setting with colorMode
  $effect(() => {
    SETTINGS.accessibility.state.useClassSpecColors = colorMode === "spec";
  });

  // Group custom theme colors by category
  const colorCategories = $derived.by(() => {
    const categories: Record<
      string,
      Array<keyof typeof DEFAULT_CUSTOM_THEME_COLORS>
    > = {};
    for (const [key, info] of Object.entries(CUSTOM_THEME_COLOR_LABELS)) {
      if (!categories[info.category]) {
        categories[info.category] = [];
      }
      categories[info.category]!.push(
        key as keyof typeof DEFAULT_CUSTOM_THEME_COLORS,
      );
    }
    return categories;
  });

  // Category order for display
  const categoryOrder = [
    "Base",
    "Surfaces",
    "Tooltip",
    "Accents",
    "Tables",
    "Utility",
  ];

  const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
    Base: "Base",
    Surfaces: "Surfaces",
    Tooltip: "Tooltip",
    Accents: "Accents",
    Tables: "Tables",
    Utility: "Utility",
  };

  $effect(() => {
    setClickthrough(SETTINGS.accessibility.state.clickthrough);
  });

  function updateClassColor(className: string, color: string) {
    SETTINGS.accessibility.state.classColors = {
      ...SETTINGS.accessibility.state.classColors,
      [className]: color,
    };
  }

  function updateClassSpecColor(specName: string, color: string) {
    SETTINGS.accessibility.state.classSpecColors = {
      ...SETTINGS.accessibility.state.classSpecColors,
      [specName]: color,
    };
  }

  function resetClassColors() {
    SETTINGS.accessibility.state.classColors = { ...DEFAULT_CLASS_COLORS };
  }

  function resetClassSpecColors() {
    SETTINGS.accessibility.state.classSpecColors = {
      ...DEFAULT_CLASS_SPEC_COLORS,
    };
  }

  function updateCustomThemeColor(
    key: keyof typeof DEFAULT_CUSTOM_THEME_COLORS,
    value: string,
  ) {
    SETTINGS.accessibility.state.customThemeColors = {
      ...SETTINGS.accessibility.state.customThemeColors,
      [key]: value,
    };
  }

  function resetCustomThemeColors() {
    SETTINGS.accessibility.state.customThemeColors = {
      ...DEFAULT_CUSTOM_THEME_COLORS,
    };
  }

  // NOTE: preset theme selector removed — always show custom theme controls here
  // expose table customization state as any for optional skill-specific keys
  const tableCustomizationState: any = SETTINGS.live.tableCustomization.state;
</script>

<Tabs.Root bind:value={activeTab}>
  <Tabs.List>
    {#each themesTabs as themesTab (themesTab.id)}
      <Tabs.Trigger value={themesTab.id}>{tl(themesTab.label)}</Tabs.Trigger>
    {/each}
  </Tabs.List>

  {#if activeTab === "general"}
    <Tabs.Content value="general">
      <div class="space-y-3">
        <!-- Color Themes Section -->
        <div
          class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onclick={() => toggleSection("colorThemes")}
          >
            <h2 class="text-base font-semibold text-foreground">
              {tl("Theme Colors")}
            </h2>
            <ChevronDown
              class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.colorThemes
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if expandedSections.colorThemes}
            <div class="px-4 pb-4 space-y-3">
              <div class="mt-3 pt-3 border-t border-border/50">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <h3 class="text-sm font-semibold text-foreground">
                      {tl("Custom Theme Colors")}
                    </h3>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {tl("Customize every color variable, including alpha.")}
                    </p>
                  </div>
                  <button
                    onclick={resetCustomThemeColors}
                    class="px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                    >{tl("Reset")}</button
                  >
                </div>

                {#each categoryOrder as category}
                  {#if colorCategories[category]}
                    <div class="mb-4">
                      <h4
                        class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1"
                      >
                        {tl(CATEGORY_DISPLAY_NAMES[category] ?? category)}
                      </h4>
                      <div class="space-y-1">
                        {#each colorCategories[category] ?? [] as colorKey}
                          {@const colorInfo =
                            CUSTOM_THEME_COLOR_LABELS[colorKey]}
                          {#if colorInfo}
                            <SettingsColorAlpha
                              label={colorInfo.label}
                              description={colorInfo.description}
                              value={SETTINGS.accessibility.state
                                .customThemeColors?.[colorKey] ??
                                DEFAULT_CUSTOM_THEME_COLORS[colorKey] ??
                                "rgba(128, 128, 128, 1)"}
                              oninput={(value: string) =>
                                updateCustomThemeColor(colorKey, value)}
                            />
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Class & Spec Colors Section -->
        <div
          class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onclick={() => toggleSection("classSpecColors")}
          >
            <h2 class="text-base font-semibold text-foreground">
              {tl("Class and Spec Colors")}
            </h2>
            <ChevronDown
              class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.classSpecColors
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if expandedSections.classSpecColors}
            <div class="px-4 pb-4 space-y-3">
              <p class="text-xs text-muted-foreground">
                {tl(
                  'Customize class or spec colors. Choose "Spec Colors" to show a specific color when the spec is detected.',
                )}
              </p>

              <!-- Tab buttons for Class/Spec -->
              <div
                class="flex items-center border border-border rounded-lg overflow-hidden bg-popover/30 w-fit"
              >
                <button
                  type="button"
                  class="px-4 py-2 text-sm font-medium transition-colors {colorMode ===
                  'class'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
                  onclick={() => (colorMode = "class")}
                >
                  {tl("Class Colors")}
                </button>
                <button
                  type="button"
                  class="px-4 py-2 text-sm font-medium transition-colors border-l border-border {colorMode ===
                  'spec'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
                  onclick={() => (colorMode = "spec")}
                >
                  {tl("Spec Colors")}
                </button>
              </div>

              {#if colorMode === "class"}
                <div class="flex items-center justify-between">
                  <p class="text-xs text-muted-foreground">
                    {tl("Customize class colors used in the live meter.")}
                  </p>
                  <button
                    onclick={resetClassColors}
                    class="px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                    >{tl("Reset")}</button
                  >
                </div>
                <div class="grid grid-cols-2 gap-2 mt-2">
                  {#each CLASS_NAMES as className}
                    <label
                      class="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-popover/50 transition-colors"
                    >
                      <input
                        type="color"
                        value={getClassColorRaw(className)}
                        oninput={(e) =>
                          updateClassColor(className, e.currentTarget.value)}
                        class="w-8 h-8 rounded cursor-pointer border border-border/50"
                      />
                      <span class="text-sm font-medium text-foreground"
                        >{className}</span
                      >
                    </label>
                  {/each}
                </div>
              {:else}
                <div class="flex items-center justify-between">
                  <p class="text-xs text-muted-foreground">
                    {tl("Customize colors for each spec.")}
                  </p>
                  <button
                    onclick={resetClassSpecColors}
                    class="px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                    >{tl("Reset")}</button
                  >
                </div>
                <div class="grid grid-cols-2 gap-2 mt-2">
                  {#each CLASS_SPEC_NAMES as specName}
                    <label
                      class="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-popover/50 transition-colors"
                    >
                      <input
                        type="color"
                        value={getClassColorRaw("", specName)}
                        oninput={(e) =>
                          updateClassSpecColor(specName, e.currentTarget.value)}
                        class="w-8 h-8 rounded cursor-pointer border border-border/50"
                      />
                      <span class="text-sm font-medium text-foreground"
                        >{specName}</span
                      >
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Custom Fonts Section -->
        <!-- Table Row Settings (moved from Live > Table Settings) -->
        <div
          class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onclick={() => toggleSection("tableRowSettings")}
          >
            <h2 class="text-base font-semibold text-foreground">
              {tl("Player Table Settings")}
            </h2>
            <ChevronDown
              class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tableRowSettings
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if expandedSections.tableRowSettings}
            <div class="px-4 pb-4 space-y-3">
              <p class="text-xs text-muted-foreground">
                {tl(
                  "Control row appearance and highlight mode. These settings apply to all live meter tables.",
                )}
              </p>
              <div class="mt-2 space-y-2">
                <h4 class="text-sm font-medium text-foreground">
                  {tl("Player Rows")}
                </h4>
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.playerRowHeight
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={tl("Row Height")}
                  description={tl("Height of each player row in pixels")}
                  unit="px"
                />
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.playerFontSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={tl("Font Size")}
                  description={tl("Font size for player names and stats")}
                  unit="px"
                />
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.playerIconSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={tl("Icon Size")}
                  description={tl("Class/spec icon size")}
                  unit="px"
                />

                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground">{tl("Mode")}</span>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {SETTINGS.live
                        .tableCustomization.state.rowGlowMode ===
                      'gradient-underline'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (SETTINGS.live.tableCustomization.state.rowGlowMode =
                          "gradient-underline")}>{tl("Gradient (Underline)")}</button
                    >
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {SETTINGS.live
                        .tableCustomization.state.rowGlowMode === 'gradient'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (SETTINGS.live.tableCustomization.state.rowGlowMode =
                          "gradient")}>{tl("Gradient")}</button
                    >
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {SETTINGS.live
                        .tableCustomization.state.rowGlowMode === 'solid'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (SETTINGS.live.tableCustomization.state.rowGlowMode =
                          "solid")}>{tl("Solid")}</button
                    >
                  </div>
                </div>

                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.rowGlowOpacity
                  }
                  min={0}
                  max={1}
                  step={0.01}
                  label={tl("Row Highlight Opacity")}
                  description={tl(
                    "Row highlight fill opacity (0 = transparent, 1 = opaque)",
                  )}
                />

                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.rowBorderRadius
                  }
                  min={0}
                  max={24}
                  step={1}
                  label={tl("Row Border Radius")}
                  description={tl("Border radius of the row highlight")}
                  unit="px"
                />
              </div>
              <!-- Table Header & Number Styling -->
              <div class="space-y-4 pt-4 border-t border-border/30">
                <!-- Table Header Customization -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Header Settings")}
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.tableCustomization.state.showTableHeader
                    }
                    label={tl("Show Header")}
                    description={tl("Toggle column title visibility")}
                  />
                  {#if SETTINGS.live.tableCustomization.state.showTableHeader}
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.tableCustomization.state.tableHeaderHeight
                      }
                      min={0}
                      max={100}
                      step={1}
                      label={tl("Header Height")}
                      description={tl("Height of the header row")}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.tableCustomization.state
                          .tableHeaderFontSize
                      }
                      min={0}
                      max={100}
                      step={1}
                      label={tl("Header Font Size")}
                      description={tl("Column title font size")}
                      unit="px"
                    />
                    <SettingsColor
                      bind:value={
                        SETTINGS.live.tableCustomization.state
                          .tableHeaderTextColor
                      }
                      label={tl("Column Title Text Color")}
                      description={tl("Color of column title text")}
                    />
                  {/if}
                </div>

                <!-- Abbreviated Numbers -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Abbreviated Numbers (K, M, %)")}
                  </h3>
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.tableCustomization.state.abbreviatedFontSize
                    }
                    min={0}
                    max={100}
                    step={1}
                    label={tl("Suffix Font Size")}
                    description={tl("Font size for K/M/% suffixes")}
                    unit="px"
                  />
                </div>
              </div>
            </div>
          {/if}
        </div>
        <!-- Skill Table Settings -->
        <div
          class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onclick={() => toggleSection("skillTableSettings")}
          >
            <h2 class="text-base font-semibold text-foreground">
              {tl("Skill Table Settings")}
            </h2>
            <ChevronDown
              class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.skillTableSettings
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if expandedSections.skillTableSettings}
            <div class="px-4 pb-4 space-y-4">
              <p class="text-xs text-muted-foreground">
                {tl(
                  "Customize skill table sizing, headers, and abbreviated number styles.",
                )}
              </p>

              <div class="space-y-2 pt-3 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">
                  {tl("Skill Rows")}
                </h3>
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.skillRowHeight
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={tl("Skill Row Height")}
                  description={tl("Height of each skill row in pixels")}
                  unit="px"
                />
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.skillFontSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={tl("Skill Font Size")}
                  description={tl("Font size for skill names and stats")}
                  unit="px"
                />
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.skillIconSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={tl("Skill Icon Size")}
                  description={tl("Skill icon size")}
                  unit="px"
                />
                <div class="flex items-center gap-2 mt-2">
                  <span class="text-sm text-muted-foreground">{tl("Mode")}</span>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {tableCustomizationState.skillRowGlowMode ===
                      'gradient-underline'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (tableCustomizationState.skillRowGlowMode =
                          "gradient-underline")}>{tl("Gradient (Underline)")}</button
                    >
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {tableCustomizationState.skillRowGlowMode ===
                      'gradient'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (tableCustomizationState.skillRowGlowMode = "gradient")}
                      >{tl("Gradient")}</button
                    >
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {tableCustomizationState.skillRowGlowMode ===
                      'solid'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (tableCustomizationState.skillRowGlowMode = "solid")}
                      >{tl("Solid")}</button
                    >
                  </div>
                </div>

                <SettingsSlider
                  bind:value={tableCustomizationState.skillRowGlowOpacity}
                  min={0}
                  max={1}
                  step={0.01}
                  label={tl("Skill Row Highlight Opacity")}
                  description={tl(
                    "Skill row highlight fill opacity (0 = transparent, 1 = opaque)",
                  )}
                />

                <SettingsSlider
                  bind:value={tableCustomizationState.skillRowBorderRadius}
                  min={0}
                  max={24}
                  step={1}
                  label={tl("Skill Row Border Radius")}
                  description={tl("Border radius of the skill row highlight")}
                  unit="px"
                />
              </div>

              <div class="space-y-2 pt-3 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">
                  {tl("Skill Headers")}
                </h3>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.live.tableCustomization.state.skillShowHeader
                  }
                  label={tl("Show Skill Headers")}
                  description={tl("Toggle skill table column title visibility")}
                />
                {#if SETTINGS.live.tableCustomization.state.skillShowHeader}
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.tableCustomization.state.skillHeaderHeight
                    }
                    min={0}
                    max={100}
                    step={1}
                    label={tl("Skill Header Height")}
                    description={tl("Height of the skill header row")}
                    unit="px"
                  />
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.tableCustomization.state.skillHeaderFontSize
                    }
                    min={0}
                    max={100}
                    step={1}
                    label={tl("Skill Header Font Size")}
                    description={tl("Font size of skill table column titles")}
                    unit="px"
                  />
                  <SettingsColor
                    bind:value={
                      SETTINGS.live.tableCustomization.state
                        .skillHeaderTextColor
                    }
                    label={tl("Skill Header Text Color")}
                    description={tl("Color of skill table column title text")}
                  />
                {/if}
              </div>

              <div class="space-y-2 pt-3 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">
                  {tl("Skill Abbreviated Numbers")}
                </h3>
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state
                      .skillAbbreviatedFontSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={tl("Skill Suffix Font Size")}
                  description={tl("Font size for K/M/% suffixes in skill rows")}
                  unit="px"
                />
              </div>
            </div>
          {/if}
        </div>
        <div
          class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onclick={() => toggleSection("backgroundImage")}
          >
            <h2 class="text-base font-semibold text-foreground">
              {tl("Background Image")}
            </h2>
            <ChevronDown
              class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.backgroundImage
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if expandedSections.backgroundImage}
            <div class="px-4 pb-4 space-y-2">
              <p class="text-xs text-muted-foreground">
                {tl(
                  "Use a custom background image for all windows. Note: the background color must be semi-transparent for the image to be visible.",
                )}
              </p>
              <SettingsSwitch
                bind:checked={
                  SETTINGS.accessibility.state.backgroundImageEnabled
                }
                label={tl("Enable Background Image")}
                description={tl("Use image as the background")}
              />
              {#if SETTINGS.accessibility.state.backgroundImageEnabled}
                <div class="mt-2 space-y-2">
                  <SettingsFilePicker
                    label={tl("Choose Image")}
                    description={tl("Choose an image file (PNG/JPG/WebP)")}
                    accept="image/*"
                    value={SETTINGS.accessibility.state.backgroundImage}
                    onchange={(dataUrl, _fileName) => {
                      SETTINGS.accessibility.state.backgroundImage = dataUrl;
                    }}
                    onclear={() => {
                      SETTINGS.accessibility.state.backgroundImage = "";
                    }}
                  />
                  <SettingsSelect
                    label={tl("Image Mode")}
                    description={tl("How the image should fit the window")}
                    bind:selected={
                      SETTINGS.accessibility.state.backgroundImageMode
                    }
                    values={["cover", "contain"]}
                  />
                  {#if SETTINGS.accessibility.state.backgroundImageMode === "contain"}
                    <SettingsColorAlpha
                      label={tl("Contain Fill Color")}
                      description={tl(
                        "Background color used for letterboxing when the image is fit using contain mode",
                      )}
                      value={SETTINGS.accessibility.state
                        .backgroundImageContainColor}
                      oninput={(value: string) => {
                        SETTINGS.accessibility.state.backgroundImageContainColor =
                          value;
                      }}
                    />
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
        <div
          class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onclick={() => toggleSection("customFonts")}
          >
            <h2 class="text-base font-semibold text-foreground">
              {tl("Custom Fonts")}
            </h2>
            <ChevronDown
              class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.customFonts
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if expandedSections.customFonts}
            <div class="px-4 pb-4 space-y-4">
              <p class="text-xs text-muted-foreground">
                {tl(
                  "Import custom fonts to replace the defaults. Supported formats: .woff2, .woff, .ttf, and .otf.",
                )}
              </p>

              <!-- Sans-serif Font -->
              <div class="space-y-2 pt-2 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">
                  {tl("Sans Serif Font (UI Text)")}
                </h3>
                <p class="text-xs text-muted-foreground">
                  {tl("Default: Inter Variable")}
                </p>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.accessibility.state.customFontSansEnabled
                  }
                  label={tl("Enable Custom Sans Serif Font")}
                  description={tl("Use the custom font for UI text")}
                />
                {#if SETTINGS.accessibility.state.customFontSansEnabled}
                  <SettingsFilePicker
                    label={tl("Choose font file")}
                    description={tl("Choose a font file (.woff2/.woff/.ttf/.otf)")}
                    accept=".woff2,.woff,.ttf,.otf"
                    value={SETTINGS.accessibility.state.customFontSansUrl}
                    onchange={(dataUrl, fileName) => {
                      SETTINGS.accessibility.state.customFontSansUrl = dataUrl;
                      // Extract font name from file name (remove extension)
                      const fontName = fileName.replace(
                        /\.(woff2?|ttf|otf)$/i,
                        "",
                      );
                      SETTINGS.accessibility.state.customFontSansName =
                        fontName;
                      // Register the font face
                      const fontFace = new FontFace(
                        fontName,
                        `url(${dataUrl})`,
                      );
                      fontFace
                        .load()
                        .then((loadedFace) => {
                          document.fonts.add(loadedFace);
                        })
                        .catch((e) => console.error("Failed to load font:", e));
                    }}
                    onclear={() => {
                      SETTINGS.accessibility.state.customFontSansUrl = "";
                      SETTINGS.accessibility.state.customFontSansName = "";
                    }}
                  />
                  {#if SETTINGS.accessibility.state.customFontSansName}
                    <p class="text-xs text-muted-foreground pl-3">
                      Loaded: {SETTINGS.accessibility.state.customFontSansName}
                    </p>
                  {/if}
                {/if}
              </div>

              <!-- Monospace Font -->
              <div class="space-y-2 pt-3 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">
                  {tl("Monospace Font (Numbers, Code)")}
                </h3>
                <p class="text-xs text-muted-foreground">
                  {tl("Default: Geist Mono Variable")}
                </p>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.accessibility.state.customFontMonoEnabled
                  }
                  label={tl("Enable Custom Monospace Font")}
                  description={tl("Use the custom monospace font for numbers and code")}
                />
                {#if SETTINGS.accessibility.state.customFontMonoEnabled}
                  <SettingsFilePicker
                    label={tl("Choose font file")}
                    description={tl("Choose a font file (.woff2/.woff/.ttf/.otf)")}
                    accept=".woff2,.woff,.ttf,.otf"
                    value={SETTINGS.accessibility.state.customFontMonoUrl}
                    onchange={(dataUrl, fileName) => {
                      SETTINGS.accessibility.state.customFontMonoUrl = dataUrl;
                      // Extract font name from file name (remove extension)
                      const fontName = fileName.replace(
                        /\.(woff2?|ttf|otf)$/i,
                        "",
                      );
                      SETTINGS.accessibility.state.customFontMonoName =
                        fontName;
                      // Register the font face
                      const fontFace = new FontFace(
                        fontName,
                        `url(${dataUrl})`,
                      );
                      fontFace
                        .load()
                        .then((loadedFace) => {
                          document.fonts.add(loadedFace);
                        })
                        .catch((e) => console.error("Failed to load font:", e));
                    }}
                    onclear={() => {
                      SETTINGS.accessibility.state.customFontMonoUrl = "";
                      SETTINGS.accessibility.state.customFontMonoName = "";
                    }}
                  />
                  {#if SETTINGS.accessibility.state.customFontMonoName}
                    <p class="text-xs text-muted-foreground pl-3">
                      Loaded: {SETTINGS.accessibility.state.customFontMonoName}
                    </p>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </Tabs.Content>
  {:else if activeTab === "live"}
    <Tabs.Content value="live">
      <div class="space-y-3">
        <!-- Live Meter Display Settings -->
        <div
          class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onclick={() => toggleSection("liveDisplay")}
          >
            <h2 class="text-base font-semibold text-foreground">
              {tl("Live Window Display Settings")}
            </h2>
            <ChevronDown
              class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.liveDisplay
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if expandedSections.liveDisplay}
            <div class="px-4 pb-4 space-y-2">
              <SettingsSwitch
                bind:checked={SETTINGS.accessibility.state.clickthrough}
                label={tl("Clickthrough Mode")}
                description={SETTINGS.accessibility.state.clickthrough
                  ? tl("Clickthrough Enabled - Mouse clicks pass through window")
                  : tl("Enable Clickthrough Mode")}
              />
            </div>
          {/if}
        </div>

        <!-- Header Settings -->
        <div
          class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onclick={() => toggleSection("headerSettings")}
          >
            <h2 class="text-base font-semibold text-foreground">
              {tl("Header Bar Settings")}
            </h2>
            <ChevronDown
              class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.headerSettings
                ? 'rotate-180'
                : ''}"
            />
          </button>
          {#if expandedSections.headerSettings}
            <div class="px-4 pb-4 space-y-4">
              <!-- Custom Header Settings -->
              <div class="space-y-4 pt-2 border-t border-border/50">
                <!-- Layout & Padding -->
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <h3 class="text-sm font-semibold text-foreground">
                      {tl("Layout and Padding")}
                    </h3>
                  </div>
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.headerCustomization.state.windowPadding
                    }
                    min={0}
                    max={24}
                    step={1}
                    label={tl("Window Padding")}
                    description={tl("Overall padding of the live window")}
                    unit="px"
                  />
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.headerCustomization.state.headerPadding
                    }
                    min={0}
                    max={16}
                    step={1}
                    label={tl("Header Padding")}
                    description={tl("Inner padding of the header bar area")}
                    unit="px"
                  />
                </div>

                <!-- Timer Settings -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Timer")}
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showTimer
                    }
                    label={tl("Show Timer")}
                    description={tl("Show encounter timer")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showTimer}
                    <SettingsSwitch
                      bind:checked={
                        SETTINGS.live.headerCustomization.state.showActiveTimer
                      }
                      label={tl("Show Active Combat Time")}
                      description={tl(
                        "Show the global active time used for True DPS next to the main timer",
                      )}
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .timerLabelFontSize
                      }
                      min={0}
                      max={20}
                      step={1}
                      label={tl("Label Font Size")}
                      description={tl('Font size for the "Timer" label (0 = hide)')}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state.timerFontSize
                      }
                      min={10}
                      max={32}
                      step={1}
                      label={tl("Timer Font Size")}
                      description={tl("Font size of the timer value")}
                      unit="px"
                    />
                    {#if SETTINGS.live.headerCustomization.state.showActiveTimer}
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .activeTimerFontSize
                        }
                        min={10}
                        max={32}
                        step={1}
                        label={tl("Active Time Font Size")}
                        description={tl("Font size of the active combat time value")}
                        unit="px"
                      />
                    {/if}
                  {/if}
                </div>

                <!-- Scene Name -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Scene Name")}
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showSceneName
                    }
                    label={tl("Show Scene Name")}
                    description={tl("Show the current dungeon / scene name")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showSceneName}
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .sceneNameFontSize
                      }
                      min={10}
                      max={24}
                      step={1}
                      label={tl("Scene Name Font Size")}
                      description={tl("Font size of the scene name")}
                      unit="px"
                    />
                  {/if}
                </div>

                <!-- Control Buttons -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Control Buttons")}
                  </h3>

                  <!-- Reset Button -->
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showResetButton
                    }
                    label={tl("Show Reset Button")}
                    description={tl("Button used to reset the encounter")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showResetButton}
                    <div class="grid grid-cols-2 gap-2 pl-4">
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .resetButtonSize
                        }
                        min={12}
                        max={32}
                        step={1}
                        label={tl("Icon Size")}
                        unit="px"
                      />
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .resetButtonPadding
                        }
                        min={2}
                        max={16}
                        step={1}
                        label={tl("Padding")}
                        unit="px"
                      />
                    </div>
                  {/if}

                  <!-- Pause Button -->
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showPauseButton
                    }
                    label={tl("Show Pause Button")}
                    description={tl("Button used to pause or resume the encounter")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showPauseButton}
                    <div class="grid grid-cols-2 gap-2 pl-4">
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .pauseButtonSize
                        }
                        min={12}
                        max={32}
                        step={1}
                        label={tl("Icon Size")}
                        unit="px"
                      />
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .pauseButtonPadding
                        }
                        min={2}
                        max={16}
                        step={1}
                        label={tl("Padding")}
                        unit="px"
                      />
                    </div>
                  {/if}

                  <!-- Settings Button -->
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showSettingsButton
                    }
                    label={tl("Show Settings Button")}
                    description={tl("Button that opens the settings window")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showSettingsButton}
                    <div class="grid grid-cols-2 gap-2 pl-4">
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .settingsButtonSize
                        }
                        min={12}
                        max={32}
                        step={1}
                        label={tl("Icon Size")}
                        unit="px"
                      />
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .settingsButtonPadding
                        }
                        min={2}
                        max={16}
                        step={1}
                        label={tl("Padding")}
                        unit="px"
                      />
                    </div>
                  {/if}

                  <!-- Minimize Button -->
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showMinimizeButton
                    }
                    label={tl("Show Minimize Button")}
                    description={tl("Button that minimizes the live window")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showMinimizeButton}
                    <div class="grid grid-cols-2 gap-2 pl-4">
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .minimizeButtonSize
                        }
                        min={12}
                        max={32}
                        step={1}
                        label={tl("Icon Size")}
                        unit="px"
                      />
                      <SettingsSlider
                        bind:value={
                          SETTINGS.live.headerCustomization.state
                            .minimizeButtonPadding
                        }
                        min={2}
                        max={16}
                        step={1}
                        label={tl("Padding")}
                        unit="px"
                      />
                    </div>
                  {/if}
                </div>

                <!-- Total Damage -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Total Damage")}
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showTotalDamage
                    }
                    label={tl("Show Total Damage")}
                    description={tl("Show total damage dealt")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showTotalDamage}
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .totalDamageLabelFontSize
                      }
                      min={8}
                      max={20}
                      step={1}
                      label={tl("Label Font Size")}
                      description={tl('Font size of the "T.DMG" label')}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .totalDamageValueFontSize
                      }
                      min={10}
                      max={32}
                      step={1}
                      label={tl("Value Font Size")}
                      description={tl("Font size of the damage value")}
                      unit="px"
                    />
                  {/if}
                </div>

                <!-- Total DPS -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Total DPS")}
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showTotalDps
                    }
                    label={tl("Show Total DPS")}
                    description={tl("Show total damage per second")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showTotalDps}
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .totalDpsLabelFontSize
                      }
                      min={8}
                      max={20}
                      step={1}
                      label={tl("Label Font Size")}
                      description={tl('Font size of the "T.DPS" label')}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .totalDpsValueFontSize
                      }
                      min={10}
                      max={32}
                      step={1}
                      label={tl("Value Font Size")}
                      description={tl("Font size of the DPS value")}
                      unit="px"
                    />
                  {/if}
                </div>

                <!-- Boss Health -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Boss Health")}
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showBossHealth
                    }
                    label={tl("Show Boss Health")}
                    description={tl("Show the current boss health bar")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showBossHealth}
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .bossHealthLabelFontSize
                      }
                      min={0}
                      max={20}
                      step={1}
                      label={tl("Label Font Size")}
                      description={tl('Font size of the "BOSS" label')}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .bossHealthNameFontSize
                      }
                      min={0}
                      max={24}
                      step={1}
                      label={tl("Boss Name Font Size")}
                      description={tl("Font size of the boss name")}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .bossHealthValueFontSize
                      }
                      min={0}
                      max={24}
                      step={1}
                      label={tl("Health Value Font Size")}
                      description={tl("Font size of the health values (1.5M / 3M)")}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .bossHealthPercentFontSize
                      }
                      min={0}
                      max={24}
                      step={1}
                      label={tl("Percent Font Size")}
                      description={tl("Font size of the health percentage")}
                      unit="px"
                    />
                  {/if}
                </div>

                <!-- Navigation Tabs -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {tl("Navigation Tabs (DPS / Healing / Damage Taken)")}
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showNavigationTabs
                    }
                    label={tl("Show Navigation Tabs")}
                    description={tl(
                      "Show the DPS / Healing / Damage Taken switch buttons",
                    )}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showNavigationTabs}
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state.navTabFontSize
                      }
                      min={8}
                      max={18}
                      step={1}
                      label={tl("Label Font Size")}
                      description={tl("Font size of the tab label text")}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state.navTabPaddingX
                      }
                      min={4}
                      max={24}
                      step={1}
                      label={tl("Horizontal Padding")}
                      description={tl("Horizontal padding for tabs")}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state.navTabPaddingY
                      }
                      min={2}
                      max={16}
                      step={1}
                      label={tl("Vertical Padding")}
                      description={tl("Vertical padding for tabs")}
                      unit="px"
                    />
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </Tabs.Content>
  {:else if activeTab === "presets"}
    <Tabs.Content value="presets">
      <div class="space-y-6">
        <!-- Color Theme Presets -->
        <div class="space-y-3">
          <div>
            <h2 class="text-base font-semibold text-foreground">
              {tl("Color Themes")}
            </h2>
            <p class="text-xs text-muted-foreground mt-0.5">
              {tl("Choose a preset color theme")}
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            {#each Object.entries(COLOR_PRESETS) as [key, preset]}
              <button
                type="button"
                class="group relative flex flex-col items-start p-4 rounded-lg border border-border/60 bg-card/40 hover:bg-card/60 hover:border-primary/50 transition-all text-left"
                onclick={() => applyColorPreset(key)}
              >
                <!-- Color preview dots -->
                <div class="flex gap-1.5 mb-2">
                  <span
                    class="w-4 h-4 rounded-full border border-black/20"
                    style="background: {preset.preview.bg}"
                  ></span>
                  <span
                    class="w-4 h-4 rounded-full border border-black/20"
                    style="background: {preset.preview.primary}"
                  ></span>
                  <span
                    class="w-4 h-4 rounded-full border border-black/20"
                    style="background: {preset.preview.accent}"
                  ></span>
                  <span
                    class="w-4 h-4 rounded-full border border-black/20"
                    style="background: {preset.preview.fg}"
                  ></span>
                </div>
                <span class="text-sm font-medium text-foreground"
                  >{tl(preset.name)}</span
                >
                <span class="text-xs text-muted-foreground mt-0.5"
                  >{tl(preset.description)}</span
                >
              </button>
            {/each}
          </div>
        </div>

        <!-- Size Presets -->
        <div class="space-y-3 pt-4 border-t border-border/50">
          <div>
            <h2 class="text-base font-semibold text-foreground">
              {tl("Size Presets")}
            </h2>
            <p class="text-xs text-muted-foreground mt-0.5">
              {tl("Adjust table and header sizing to match your display")}
            </p>
          </div>
          <div class="grid grid-cols-4 gap-3">
            {#each Object.entries(SIZE_PRESETS) as [key, preset]}
              <button
                type="button"
                class="group flex flex-col items-center justify-center p-4 rounded-lg border border-border/60 bg-card/40 hover:bg-card/60 hover:border-primary/50 transition-all"
                onclick={() => applySizePreset(key)}
              >
                <!-- Size indicator -->
                <div class="flex items-end gap-0.5 mb-2 h-6">
                  {#if key === "compact"}
                    <span class="w-2 h-2 bg-primary/60 rounded-sm"></span>
                    <span class="w-2 h-3 bg-primary/40 rounded-sm"></span>
                    <span class="w-2 h-4 bg-primary/20 rounded-sm"></span>
                    <span class="w-2 h-5 bg-primary/10 rounded-sm"></span>
                  {:else if key === "small"}
                    <span class="w-2 h-2 bg-primary/40 rounded-sm"></span>
                    <span class="w-2 h-3 bg-primary/60 rounded-sm"></span>
                    <span class="w-2 h-4 bg-primary/30 rounded-sm"></span>
                    <span class="w-2 h-5 bg-primary/10 rounded-sm"></span>
                  {:else if key === "medium"}
                    <span class="w-2 h-2 bg-primary/20 rounded-sm"></span>
                    <span class="w-2 h-3 bg-primary/40 rounded-sm"></span>
                    <span class="w-2 h-4 bg-primary/60 rounded-sm"></span>
                    <span class="w-2 h-5 bg-primary/30 rounded-sm"></span>
                  {:else}
                    <span class="w-2 h-2 bg-primary/10 rounded-sm"></span>
                    <span class="w-2 h-3 bg-primary/20 rounded-sm"></span>
                    <span class="w-2 h-4 bg-primary/40 rounded-sm"></span>
                    <span class="w-2 h-5 bg-primary/60 rounded-sm"></span>
                  {/if}
                </div>
                <span class="text-sm font-medium text-foreground"
                  >{tl(preset.name)}</span
                >
                <span class="text-xs text-muted-foreground mt-0.5 text-center"
                  >{tl(preset.description)}</span
                >
              </button>
            {/each}
          </div>
        </div>
      </div>
    </Tabs.Content>
  {/if}
</Tabs.Root>
