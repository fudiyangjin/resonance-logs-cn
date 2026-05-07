/**
 * @file This file defines the tool routes for the toolbox sidebar.
 */
import ActivityIcon from "virtual:icons/lucide/activity";
import BugIcon from "virtual:icons/lucide/bug";
import CalculatorIcon from "virtual:icons/lucide/calculator";
import GlobeIcon from "virtual:icons/lucide/globe";
import HourglassIcon from "virtual:icons/lucide/hourglass";
import KeyboardIcon from "virtual:icons/lucide/keyboard";
import LanguagesIcon from "virtual:icons/lucide/languages";
import MonitorUpIcon from "virtual:icons/lucide/monitor-up";
import PaletteIcon from "virtual:icons/lucide/palette";
import UsersIcon from "virtual:icons/lucide/users";
import SettingsIcon from "virtual:icons/lucide/settings";
import ShieldAlertIcon from "virtual:icons/lucide/shield-alert";
import SparklesIcon from "virtual:icons/lucide/sparkles";
import SwordsIcon from "virtual:icons/lucide/swords";
import WifiIcon from "virtual:icons/lucide/wifi";

// Tool-level routes for the left sidebar
export const TOOL_ROUTES = {
  "/main/dps": { label: "DPS Meter", icon: ActivityIcon },
  "/main/module-calc": { label: "Module Calculator", icon: CalculatorIcon },
  "/main/overlay": { label: "Overlay", icon: MonitorUpIcon },
  "/main/custom-triggers": { label: "Custom Triggers", icon: SparklesIcon },
  "/main/localization": { label: "Localization Tool", icon: GlobeIcon },
};

// Sub-routes for DPS tool (tabs in the right panel)
export const DPS_SUB_ROUTES = {
  "/main/dps/history": { label: "History", icon: HourglassIcon },
  "/main/dps/settings": { label: "Meter Settings", icon: SettingsIcon },
};

// Sub-routes for the overlay tool
export const OVERLAY_SUB_ROUTES = {
  "/main/overlay/skill-monitor": { label: "Skill Monitor", icon: SwordsIcon },
  "/main/overlay/monster-monitor": { label: "Monster Monitor", icon: ShieldAlertIcon },
};

// Sub-routes for global settings
export const SETTINGS_SUB_ROUTES = {
  "/main/settings/themes": { label: "Themes", icon: PaletteIcon },
  "/main/settings/network": { label: "Network", icon: WifiIcon },
  "/main/settings/hotkeys": { label: "Hotkeys", icon: KeyboardIcon },
  "/main/settings/profile": { label: "Profile", icon: UsersIcon },
  "/main/settings/overlay": { label: "Overlay", icon: MonitorUpIcon },
  "/main/settings/locales": { label: "Locale Settings", icon: LanguagesIcon },
  "/main/settings/debug": { label: "Debug", icon: BugIcon },
};

// Legacy export for backward compatibility (if needed)
export const SIDEBAR_ROUTES = DPS_SUB_ROUTES;
