/**
 * @file This file defines the tool routes for the toolbox sidebar.
 */
import ActivityIcon from "virtual:icons/lucide/activity";
import CalculatorIcon from "virtual:icons/lucide/calculator";
import HourglassIcon from "virtual:icons/lucide/hourglass";
import PaletteIcon from "virtual:icons/lucide/palette";
import SettingsIcon from "virtual:icons/lucide/settings";
import ShieldAlertIcon from "virtual:icons/lucide/shield-alert";
import SwordsIcon from "virtual:icons/lucide/swords";

export type SidebarRoute = {
  labelKey: string;
  icon: typeof ActivityIcon;
};

// Tool-level routes for the left sidebar
export const TOOL_ROUTES: Record<string, SidebarRoute> = {
  "/main/dps": { labelKey: "DPS Meter", icon: ActivityIcon },
  "/main/module-calc": { labelKey: "Module Calculator", icon: CalculatorIcon },
  "/main/skill-monitor": { labelKey: "Skill Monitor", icon: SwordsIcon },
  "/main/monster-monitor": { labelKey: "Monster Monitor", icon: ShieldAlertIcon },
};

// Sub-routes for DPS tool (tabs in the right panel)
export const DPS_SUB_ROUTES: Record<string, SidebarRoute> = {
  "/main/dps/history": { labelKey: "History", icon: HourglassIcon },
  "/main/dps/themes": { labelKey: "Themes", icon: PaletteIcon },
  "/main/dps/settings": { labelKey: "Settings", icon: SettingsIcon },
};

// Legacy export for backward compatibility (if needed)
export const SIDEBAR_ROUTES = DPS_SUB_ROUTES;
