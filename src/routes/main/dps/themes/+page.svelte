<script lang="ts">
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
  import { uiT } from "$lib/i18n";

  const themesTabs = [
    { id: "general", key: "tab.general", label: "通用" },
    { id: "live", key: "tab.live", label: "实时" },
    { id: "presets", key: "tab.presets", label: "预设" },
  ];

  const t = uiT("dps/themes", () => SETTINGS.live.general.state.language);

  function themeLabel(colorKey: keyof typeof DEFAULT_CUSTOM_THEME_COLORS, fallback: string): string {
    return t(`themeLabel.${String(colorKey)}.label`, fallback);
  }

  function themeDescription(colorKey: keyof typeof DEFAULT_CUSTOM_THEME_COLORS, fallback: string): string {
    return t(`themeLabel.${String(colorKey)}.description`, fallback);
  }

  function themeCategoryName(category: string): string {
    switch (category) {
      case "Base":
        return t("themeCategory.base", "基础");
      case "Surfaces":
        return t("themeCategory.surfaces", "表面");
      case "Tooltip":
        return t("themeCategory.tooltip", "提示");
      case "Accents":
        return t("themeCategory.accents", "强调");
      case "Tables":
        return t("themeCategory.tables", "表格");
      case "Utility":
        return t("themeCategory.utility", "工具");
      default:
        return category;
    }
  }

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
      description: "Clean dark theme with neutral grays",
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
      description: "Bright theme suitable for daytime use",
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
      description: "Cute soft pink theme",
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
      name: "Soft Green",
      description: "Soft natural green palette",
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
      description: "Earthy green / matcha mood",
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
      description: "Minimal: no padding, no header",
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
      description: "Balanced size for most screens",
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
      description: "Larger UI for high-resolution screens",
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
      <Tabs.Trigger value={themesTab.id}>{t(themesTab.key, themesTab.label)}</Tabs.Trigger>
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
              {t("themes.general.colorThemes", "主题颜色")}
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
                      {t("themes.general.customColorThemeTitle", "自定义颜色主题")}
                    </h3>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {t("themes.general.customColorThemeDescription", "自定义每个颜色变量（支持设置透明度）")}
                    </p>
                  </div>
                  <button
                    onclick={resetCustomThemeColors}
                    class="px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                    >{t("common.reset", "重置")}</button
                  >
                </div>

                {#each categoryOrder as category}
                  {#if colorCategories[category]}
                    <div class="mb-4">
                      <h4
                        class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1"
                      >
                        {themeCategoryName(category)}
                      </h4>
                      <div class="space-y-1">
                        {#each colorCategories[category] ?? [] as colorKey}
                          {@const colorInfo =
                            CUSTOM_THEME_COLOR_LABELS[colorKey]}
                          {#if colorInfo}
                            <SettingsColorAlpha
                              label={themeLabel(colorKey, colorInfo.label)}
                              description={themeDescription(colorKey, colorInfo.description)}
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
              {t("themes.general.classSpecColors", "职业与专精颜色")}
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
                {t("themes.general.classSpecIntro", "自定义职业或专精的颜色。选择“专精颜色”可在检测到专精时显示特定颜色。")}
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
                  {t("themes.general.classColorsTab", "职业颜色")}
                </button>
                <button
                  type="button"
                  class="px-4 py-2 text-sm font-medium transition-colors border-l border-border {colorMode ===
                  'spec'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
                  onclick={() => (colorMode = "spec")}
                >
                  {t("themes.general.specColorsTab", "专精颜色")}
                </button>
              </div>

              {#if colorMode === "class"}
                <div class="flex items-center justify-between">
                  <p class="text-xs text-muted-foreground">
                    {t("themes.general.classColorsDescription", "自定义实时统计中各职业的颜色。")}
                  </p>
                  <button
                    onclick={resetClassColors}
                    class="px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                    >{t("common.reset", "重置")}</button
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
                    {t("themes.general.specColorsDescription", "自定义各专精的颜色。")}
                  </p>
                  <button
                    onclick={resetClassSpecColors}
                    class="px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                    >{t("common.reset", "重置")}</button
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
              {t("themes.general.playerTableSettings", "玩家表格设置")}
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
                {t("playerTableSettings.description", "控制行外观与高亮模式。这些设置适用于所有实时表格。")}
              </p>
              <div class="mt-2 space-y-2">
                <h4 class="text-sm font-medium text-foreground">{t("playerTableSettings.playerRows", "玩家行")}</h4>
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.playerRowHeight
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={t("common.rowHeight", "行高")}
                  description={t("playerTableSettings.rowHeight.description", "每个玩家行的高度（像素）")}
                  unit="px"
                />
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.playerFontSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={t("common.fontSize", "字体大小")}
                  description={t("playerTableSettings.fontSize.description", "玩家名称和统计数据的字体大小")}
                  unit="px"
                />
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.playerIconSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={t("common.iconSize", "图标大小")}
                  description={t("playerTableSettings.iconSize.description", "职业/专精图标大小")}
                  unit="px"
                />

                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground">{t("common.mode", "模式")}</span>
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
                          "gradient-underline")}>{t("common.gradientUnderline", "渐变（下划线）")}</button
                    >
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {SETTINGS.live
                        .tableCustomization.state.rowGlowMode === 'gradient'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (SETTINGS.live.tableCustomization.state.rowGlowMode =
                          "gradient")}>{t("common.gradient", "渐变")}</button
                    >
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {SETTINGS.live
                        .tableCustomization.state.rowGlowMode === 'solid'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (SETTINGS.live.tableCustomization.state.rowGlowMode =
                          "solid")}>{t("common.solid", "纯色")}</button
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
                  label={t("playerTableSettings.rowHighlightOpacity", "行高亮透明度")}
                  description={t("playerTableSettings.rowHighlightOpacity.description", "行高亮填充透明度（0 = 透明，1 = 不透明）")}
                />

                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.rowBorderRadius
                  }
                  min={0}
                  max={24}
                  step={1}
                  label={t("playerTableSettings.rowCornerRadius", "行圆角")}
                  description={t("playerTableSettings.rowCornerRadius.description", "行高亮的圆角半径")}
                  unit="px"
                />
              </div>
              <!-- Table Header & Number Styling -->
              <div class="space-y-4 pt-4 border-t border-border/30">
                <!-- Table Header Customization -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    {t("common.headerSettings", "表头设置")}
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.tableCustomization.state.showTableHeader
                    }
                    label={t("common.showHeader", "显示表头")}
                    description={t("playerTableSettings.showHeader.description", "切换列标题的显示/隐藏")}
                  />
                  {#if SETTINGS.live.tableCustomization.state.showTableHeader}
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.tableCustomization.state.tableHeaderHeight
                      }
                      min={0}
                      max={100}
                      step={1}
                      label={t("common.headerHeight", "表头高度")}
                      description={t("playerTableSettings.headerHeight.description", "表头行高度")}
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
                      label={t("common.headerFontSize", "表头字体大小")}
                      description={t("playerTableSettings.headerFontSize.description", "列标题字体大小")}
                      unit="px"
                    />
                    <SettingsColor
                      bind:value={
                        SETTINGS.live.tableCustomization.state
                          .tableHeaderTextColor
                      }
                      label={t("playerTableSettings.headerTextColor", "表头文字颜色")}
                      description={t("playerTableSettings.headerTextColor.description", "列标题文本颜色")}
                    />
                  {/if}
                </div>

                <!-- Abbreviated Numbers -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    Abbreviated Numbers (K, M, %)
                  </h3>
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.tableCustomization.state.abbreviatedFontSize
                    }
                    min={0}
                    max={100}
                    step={1}
                    label={t("playerTableSettings.suffixFontSize", "后缀字体大小")}
                    description={t("playerTableSettings.suffixFontSize.description", "K/M/% 后缀的字体大小")}
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
              {t("skillTableSettings.title", "技能表格设置")}
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
                {t("skillTableSettings.description", "自定义技能表格的尺寸、表头与缩写数字样式。")}
              </p>

              <div class="space-y-2 pt-3 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">{t("skillTableSettings.skillRows", "技能行")}</h3>
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.skillRowHeight
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={t("skillTableSettings.skillRowHeight", "技能行高度")}
                  description={t("skillTableSettings.skillRowHeight.description", "每个技能行的高度（像素）")}
                  unit="px"
                />
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.skillFontSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={t("skillTableSettings.skillFontSize", "技能字体大小")}
                  description={t("skillTableSettings.skillFontSize.description", "技能名称和统计数据的字体大小")}
                  unit="px"
                />
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state.skillIconSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={t("skillTableSettings.skillIconSize", "技能图标大小")}
                  description={t("skillTableSettings.skillIconSize.description", "技能图标大小")}
                  unit="px"
                />
                <div class="flex items-center gap-2 mt-2">
                  <span class="text-sm text-muted-foreground">{t("common.mode", "模式")}</span>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {tableCustomizationState.skillRowGlowMode ===
                      'gradient-underline'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (tableCustomizationState.skillRowGlowMode =
                          "gradient-underline")}>{t("common.gradientUnderline", "渐变（下划线）")}</button
                    >
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {tableCustomizationState.skillRowGlowMode ===
                      'gradient'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (tableCustomizationState.skillRowGlowMode = "gradient")}
                      >{t("common.gradient", "渐变")}</button
                    >
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded {tableCustomizationState.skillRowGlowMode ===
                      'solid'
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-popover/30'}"
                      onclick={() =>
                        (tableCustomizationState.skillRowGlowMode = "solid")}
                      >{t("common.solid", "纯色")}</button
                    >
                  </div>
                </div>

                <SettingsSlider
                  bind:value={tableCustomizationState.skillRowGlowOpacity}
                  min={0}
                  max={1}
                  step={0.01}
                  label={t("skillTableSettings.skillRowHighlightOpacity", "技能行高亮透明度")}
                  description={t("skillTableSettings.skillRowHighlightOpacity.description", "技能行高亮填充透明度（0 = 透明，1 = 不透明）")}
                />

                <SettingsSlider
                  bind:value={tableCustomizationState.skillRowBorderRadius}
                  min={0}
                  max={24}
                  step={1}
                  label={t("skillTableSettings.skillRowCornerRadius", "技能行圆角")}
                  description={t("skillTableSettings.skillRowCornerRadius.description", "技能行高亮的圆角半径")}
                  unit="px"
                />
              </div>

              <div class="space-y-2 pt-3 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">
                  Skill Header
                </h3>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.live.tableCustomization.state.skillShowHeader
                  }
                  label={t("skillTableSettings.showSkillHeader", "显示技能表头")}
                  description={t("skillTableSettings.showSkillHeader.description", "切换技能表列标题的显示/隐藏")}
                />
                {#if SETTINGS.live.tableCustomization.state.skillShowHeader}
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.tableCustomization.state.skillHeaderHeight
                    }
                    min={0}
                    max={100}
                    step={1}
                    label={t("skillTableSettings.skillHeaderHeight", "技能表头高度")}
                    description={t("skillTableSettings.skillHeaderHeight.description", "技能表头行高度")}
                    unit="px"
                  />
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.tableCustomization.state.skillHeaderFontSize
                    }
                    min={0}
                    max={100}
                    step={1}
                    label={t("skillTableSettings.skillHeaderFontSize", "技能表头字体大小")}
                    description={t("skillTableSettings.skillHeaderFontSize.description", "技能表列标题字体大小")}
                    unit="px"
                  />
                  <SettingsColor
                    bind:value={
                      SETTINGS.live.tableCustomization.state
                        .skillHeaderTextColor
                    }
                    label={t("skillTableSettings.skillHeaderTextColor", "技能表头文字颜色")}
                    description={t("skillTableSettings.skillHeaderTextColor.description", "技能表列标题文本颜色")}
                  />
                {/if}
              </div>

              <div class="space-y-2 pt-3 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">
                  Skill Abbreviated Numbers
                </h3>
                <SettingsSlider
                  bind:value={
                    SETTINGS.live.tableCustomization.state
                      .skillAbbreviatedFontSize
                  }
                  min={0}
                  max={100}
                  step={1}
                  label={t("skillTableSettings.skillSuffixFontSize", "技能后缀字体大小")}
                  description={t("skillTableSettings.skillSuffixFontSize.description", "技能行中 K/M/% 后缀的字体大小")}
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
              {t("themes.general.backgroundImage", "背景图片")}
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
                {t("themes.general.backgroundImageDescription", "为所有窗口使用自定义背景图片。注意：需要将背景颜色设置为半透明，图片才能显示出来。")}
              </p>
              <SettingsSwitch
                bind:checked={
                  SETTINGS.accessibility.state.backgroundImageEnabled
                }
                label={t("themes.general.enableBackgroundImage", "启用背景图片")}
                description={t("themes.general.enableBackgroundImageDescription", "使用图片作为背景")}
              />
              {#if SETTINGS.accessibility.state.backgroundImageEnabled}
                <div class="mt-2 space-y-2">
                  <SettingsFilePicker
                    label={t("themes.general.selectImage", "选择图片")}
                    description={t("themes.general.selectImageDescription", "选择图片文件（PNG/JPG/WebP）")}
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
                    label={t("themes.general.imageMode", "图片模式")}
                    description={t("themes.general.imageModeDescription", "图片如何适配窗口")}
                    bind:selected={
                      SETTINGS.accessibility.state.backgroundImageMode
                    }
                    values={["cover", "contain"]}
                  />
                  {#if SETTINGS.accessibility.state.backgroundImageMode === "contain"}
                    <SettingsColorAlpha
                      label={t("themes.general.containFillColor", "留白填充颜色")}
                      description={t("themes.general.containFillColorDescription", "当图片以“包含”方式适配时，周围留白的背景色")}
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
              {t("themes.general.customFonts", "自定义字体")}
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
                {t("themes.general.customFontsIntro", "Import custom fonts to replace the defaults. Supported font file formats: .woff2, .woff, .ttf, and .otf.")}
              </p>

              <!-- Sans-serif Font -->
              <div class="space-y-2 pt-2 border-t border-border/30">
                <h3 class="text-sm font-semibold text-foreground">
                  {t("themes.general.sansFont", "无衬线字体（UI 文本）")}
                </h3>
                <p class="text-xs text-muted-foreground">
                  {t("themes.general.sansFontDefault", "默认：Inter Variable")}
                </p>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.accessibility.state.customFontSansEnabled
                  }
                  label={t("themes.general.enableCustomSans", "启用自定义无衬线字体")}
                  description={t("themes.general.enableCustomSansDescription", "UI 文本使用自定义字体")}
                />
                {#if SETTINGS.accessibility.state.customFontSansEnabled}
                  <SettingsFilePicker
                    label={t("themes.general.pickFontFile", "选择字体文件")}
                    description={t("themes.general.pickFontFileDescription", "选择字体文件（.woff2/.woff/.ttf/.otf）")}
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
                  {t("themes.general.monoFont", "等宽字体（数字、代码）")}
                </h3>
                <p class="text-xs text-muted-foreground">
                  {t("themes.general.monoFontDefault", "默认：Geist Mono Variable")}
                </p>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.accessibility.state.customFontMonoEnabled
                  }
                  label={t("themes.general.enableCustomMono", "启用自定义等宽字体")}
                  description={t("themes.general.enableCustomMonoDescription", "数字/代码使用自定义等宽字体")}
                />
                {#if SETTINGS.accessibility.state.customFontMonoEnabled}
                  <SettingsFilePicker
                    label={t("themes.general.pickFontFile", "选择字体文件")}
                    description={t("themes.general.pickFontFileDescription", "选择字体文件（.woff2/.woff/.ttf/.otf）")}
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
              {t("liveWindowDisplay.title", "实时窗口显示设置")}
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
                label={t("liveWindowDisplay.clickthroughMode", "穿透模式")}
                description={SETTINGS.accessibility.state.clickthrough
                  ? t("liveWindowDisplay.clickthroughEnabledDescription", "已启用点击穿透 - 鼠标点击将穿透窗口")
                  : t("liveWindowDisplay.clickthroughMode.description", "启用点击穿透模式")}
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
              {t("common.headerSettings", "表头设置")}
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
                      {t("liveHeader.layoutPadding", "布局与边距")}
                    </h3>
                  </div>
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.headerCustomization.state.windowPadding
                    }
                    min={0}
                    max={24}
                    step={1}
                    label={t("liveHeader.windowPadding", "窗口内边距")}
                    description={t("liveHeader.windowPadding.description", "实时窗口整体内边距")}
                    unit="px"
                  />
                  <SettingsSlider
                    bind:value={
                      SETTINGS.live.headerCustomization.state.headerPadding
                    }
                    min={0}
                    max={16}
                    step={1}
                    label={t("liveHeader.headerPadding", "表头内边距")}
                    description={t("liveHeader.headerPadding.description", "表头区域内部间距")}
                    unit="px"
                  />
                </div>

                <!-- Timer Settings -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">{t("liveHeader.timer", "计时器")}</h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showTimer
                    }
                    label={t("liveHeader.showTimer", "显示计时器")}
                    description={t("liveHeader.showTimer.description", "显示战斗计时器")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showTimer}
                    <SettingsSwitch
                      bind:checked={
                        SETTINGS.live.headerCustomization.state.showActiveTimer
                      }
                      label={t("liveHeader.showActiveCombatTime", "显示活跃战斗时间")}
                      description={t("liveHeader.showActiveCombatTime.description", "在主计时器旁显示全局活跃战斗时间，用于真 DPS")}
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state
                          .timerLabelFontSize
                      }
                      min={0}
                      max={20}
                      step={1}
                      label={t("common.labelFontSize", "标签字体大小")}
                      description={t("liveHeader.timerLabelFontSize.description", "“计时器”标签字体大小（0 = 隐藏）")}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state.timerFontSize
                      }
                      min={10}
                      max={32}
                      step={1}
                      label={t("liveHeader.timerFontSize", "计时器字体大小")}
                      description={t("liveHeader.timerFontSize.description", "计时器数值字体大小")}
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
                        label={t("liveHeader.activeTimeFontSize", "活跃时间字体大小")}
                        description={t("liveHeader.activeTimeFontSize.description", "活跃战斗时间数值字体大小")}
                        unit="px"
                      />
                    {/if}
                  {/if}
                </div>

                <!-- Scene Name -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    Scene Name
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showSceneName
                    }
                    label={t("liveHeader.showSceneName", "显示场景名称")}
                    description={t("liveHeader.showSceneName.description", "显示当前副本/场景名称")}
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
                      label={t("liveHeader.sceneNameFontSize", "场景名称字体大小")}
                      description={t("liveHeader.sceneNameFontSize.description", "场景名称字体大小")}
                      unit="px"
                    />
                  {/if}
                </div>

                <!-- Control Buttons -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    Control Buttons
                  </h3>

                  <!-- Reset Button -->
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showResetButton
                    }
                    label={t("liveHeader.showResetButton", "显示重置按钮")}
                    description={t("liveHeader.showResetButton.description", "用于重置战斗的按钮")}
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
                        label={t("common.iconSize", "图标大小")}
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
                        label={t("common.padding", "内边距")}
                        unit="px"
                      />
                    </div>
                  {/if}

                  <!-- Pause Button -->
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showPauseButton
                    }
                    label={t("liveHeader.showPauseButton", "显示暂停按钮")}
                    description={t("liveHeader.showPauseButton.description", "用于暂停/恢复战斗的按钮")}
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
                        label={t("common.iconSize", "图标大小")}
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
                        label={t("common.padding", "内边距")}
                        unit="px"
                      />
                    </div>
                  {/if}

                  <!-- Settings Button -->
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showSettingsButton
                    }
                    label={t("liveHeader.showSettingsButton", "显示设置按钮")}
                    description={t("liveHeader.showSettingsButton.description", "用于打开设置窗口的按钮")}
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
                        label={t("common.iconSize", "图标大小")}
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
                        label={t("common.padding", "内边距")}
                        unit="px"
                      />
                    </div>
                  {/if}

                  <!-- Minimize Button -->
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showMinimizeButton
                    }
                    label={t("liveHeader.showMinimizeButton", "显示最小化按钮")}
                    description={t("liveHeader.showMinimizeButton.description", "用于最小化实时窗口的按钮")}
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
                        label={t("common.iconSize", "图标大小")}
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
                        label={t("common.padding", "内边距")}
                        unit="px"
                      />
                    </div>
                  {/if}
                </div>

                <!-- Total Damage -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    Total Damage
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showTotalDamage
                    }
                    label={t("liveHeader.showTotalDamage", "显示总伤害")}
                    description={t("liveHeader.showTotalDamage.description", "显示造成的总伤害")}
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
                      label={t("common.labelFontSize", "标签字体大小")}
                      description={t("liveHeader.totalDamageLabelFontSize.description", "“T.DMG” 标签字体大小")}
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
                      label={t("common.valueFontSize", "数值字体大小")}
                      description={t("liveHeader.totalDamageValueFontSize.description", "伤害数值字体大小")}
                      unit="px"
                    />
                  {/if}
                </div>

                <!-- Total DPS -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    Total DPS
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showTotalDps
                    }
                    label={t("liveHeader.showTotalDps", "显示总 DPS")}
                    description={t("liveHeader.showTotalDps.description", "显示总每秒伤害")}
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
                      label={t("common.labelFontSize", "标签字体大小")}
                      description={t("liveHeader.totalDpsLabelFontSize.description", "“T.DPS” 标签字体大小")}
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
                      label={t("common.valueFontSize", "数值字体大小")}
                      description={t("liveHeader.totalDpsValueFontSize.description", "DPS 数值字体大小")}
                      unit="px"
                    />
                  {/if}
                </div>

                <!-- Boss Health -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    Boss Health
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showBossHealth
                    }
                    label={t("liveHeader.showBossHealth", "显示首领血量")}
                    description={t("liveHeader.showBossHealth.description", "显示当前首领血条")}
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
                      label={t("common.labelFontSize", "标签字体大小")}
                      description={t("liveHeader.bossHealthLabelFontSize.description", "“BOSS” 标签字体大小")}
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
                      label={t("liveHeader.bossNameFontSize", "首领名称字体大小")}
                      description={t("liveHeader.bossNameFontSize.description", "首领名称字体大小")}
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
                      label={t("liveHeader.healthValueFontSize", "血量数值字体大小")}
                      description={t("liveHeader.healthValueFontSize.description", "血量数值字体大小（1.5M / 3M）")}
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
                      label={t("liveHeader.percentageFontSize", "百分比字体大小")}
                      description={t("liveHeader.percentageFontSize.description", "血量百分比字体大小")}
                      unit="px"
                    />
                  {/if}
                </div>

                <!-- Navigation Tabs -->
                <div class="space-y-2 pt-3 border-t border-border/30">
                  <h3 class="text-sm font-semibold text-foreground">
                    Navigation Tabs (DPS / Heal / Tanked)
                  </h3>
                  <SettingsSwitch
                    bind:checked={
                      SETTINGS.live.headerCustomization.state.showNavigationTabs
                    }
                    label={t("liveHeader.showNavigationTabs", "显示导航标签")}
                    description={t("liveHeader.showNavigationTabs.description", "显示 DPS / 治疗 / 承伤 切换按钮")}
                  />
                  {#if SETTINGS.live.headerCustomization.state.showNavigationTabs}
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state.navTabFontSize
                      }
                      min={8}
                      max={18}
                      step={1}
                      label={t("common.labelFontSize", "标签字体大小")}
                      description={t("liveHeader.navigationTabLabelFontSize.description", "标签文字字体大小")}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state.navTabPaddingX
                      }
                      min={4}
                      max={24}
                      step={1}
                      label={t("liveHeader.horizontalPadding", "水平内边距")}
                      description={t("liveHeader.horizontalPadding.description", "标签左右内边距")}
                      unit="px"
                    />
                    <SettingsSlider
                      bind:value={
                        SETTINGS.live.headerCustomization.state.navTabPaddingY
                      }
                      min={2}
                      max={16}
                      step={1}
                      label={t("liveHeader.verticalPadding", "垂直内边距")}
                      description={t("liveHeader.verticalPadding.description", "标签上下内边距")}
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
              {t("presets.colorThemes", "颜色主题")}
            </h2>
            <p class="text-xs text-muted-foreground mt-0.5">
              {t("presets.colorThemes.description", "选择一个预设颜色主题")}
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
                  >{t(`presets.colorPreset.${key}.name`, preset.name)}</span
                >
                <span class="text-xs text-muted-foreground mt-0.5"
                  >{t(`presets.colorPreset.${key}.description`, preset.description)}</span
                >
              </button>
            {/each}
          </div>
        </div>

        <!-- Size Presets -->
        <div class="space-y-3 pt-4 border-t border-border/50">
          <div>
            <h2 class="text-base font-semibold text-foreground">
              {t("presets.sizePresets", "尺寸预设")}
            </h2>
            <p class="text-xs text-muted-foreground mt-0.5">
              {t("presets.sizePresets.description", "根据你的显示器调整表格和表头尺寸")}
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
                  >{t(`presets.sizePreset.${key}.name`, preset.name)}</span
                >
                <span class="text-xs text-muted-foreground mt-0.5 text-center"
                  >{t(`presets.sizePreset.${key}.description`, preset.description)}</span
                >
              </button>
            {/each}
          </div>
        </div>
      </div>
    </Tabs.Content>
  {/if}
</Tabs.Root>
