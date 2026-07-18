/**
 * @file This file defines the tool routes for the toolbox sidebar.
 */
import type { MessageKey } from "$lib/i18n/index.svelte";
import ActivityIcon from "virtual:icons/lucide/activity";
import CalculatorIcon from "virtual:icons/lucide/calculator";
import CogIcon from "virtual:icons/lucide/cog";
import HourglassIcon from "virtual:icons/lucide/hourglass";
import LayersIcon from "virtual:icons/lucide/layers";
import MapIcon from "virtual:icons/lucide/map";
import MicIcon from "virtual:icons/lucide/mic";
import PaletteIcon from "virtual:icons/lucide/palette";
import SettingsIcon from "virtual:icons/lucide/settings";
import ShieldAlertIcon from "virtual:icons/lucide/shield-alert";
import SwordsIcon from "virtual:icons/lucide/swords";

type RouteDefinition = {
  labelKey: MessageKey;
  icon: typeof ActivityIcon;
};

// Tool-level routes for the left sidebar
export const TOOL_ROUTES = {
  "/main/dps": { labelKey: "routes.tools.dps", icon: ActivityIcon },
  "/main/loadouts": {
    labelKey: "routes.tools.loadouts",
    icon: LayersIcon,
  },
  "/main/module-calc": {
    labelKey: "routes.tools.moduleCalc",
    icon: CalculatorIcon,
  },
  "/main/skill-monitor": {
    labelKey: "routes.tools.skillMonitor",
    icon: SwordsIcon,
  },
  "/main/monster-monitor": {
    labelKey: "routes.tools.monsterMonitor",
    icon: ShieldAlertIcon,
  },
  "/main/minimap": {
    labelKey: "routes.tools.minimap",
    icon: MapIcon,
  },
  "/main/voice": {
    labelKey: "routes.tools.voice",
    icon: MicIcon,
  },
  "/main/app-settings": {
    labelKey: "routes.tools.appSettings",
    icon: CogIcon,
  },
} satisfies Record<string, RouteDefinition>;

// Sub-routes for DPS tool (tabs in the right panel)
export const DPS_SUB_ROUTES = {
  "/main/dps/history": { labelKey: "routes.dps.history", icon: HourglassIcon },
  "/main/dps/themes": { labelKey: "routes.dps.themes", icon: PaletteIcon },
  "/main/dps/settings": { labelKey: "routes.dps.settings", icon: SettingsIcon },
} satisfies Record<string, RouteDefinition>;

// Legacy export for backward compatibility (if needed)
export const SIDEBAR_ROUTES = DPS_SUB_ROUTES;
