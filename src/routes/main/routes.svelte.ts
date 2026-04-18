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

import { uiT } from "$lib/i18n";
import { SETTINGS } from "$lib/settings-store";

const tShell = uiT("shell", () => SETTINGS.live.general.state.language);
const tDps = uiT("dps/general", () => SETTINGS.live.general.state.language);

// Tool-level routes for the left sidebar
export const TOOL_ROUTES = {
  "/main/dps": { label: tShell("tool.dps", "DPS Meter"), icon: ActivityIcon },
  "/main/module-calc": { label: tShell("tool.moduleOptimizer", "Module Calculator"), icon: CalculatorIcon },
  "/main/skill-monitor": { label: tShell("tool.skillMonitor", "Skill Monitor"), icon: SwordsIcon },
  "/main/monster-monitor": { label: tShell("tool.monsterTracker", "Monster Monitor"), icon: ShieldAlertIcon },
  "/main/custom-triggers": { label: tShell("tool.customTriggers", "Custom Triggers"), icon: SparklesIcon },
  "/main/localization": { label: tShell("tool.localization", "Localization Tool"), icon: GlobeIcon },
};

// Sub-routes for DPS tool (tabs in the right panel)
export const DPS_SUB_ROUTES = {
  "/main/dps/history": { label: tDps("history", "History"), icon: HourglassIcon },
  "/main/dps/settings": { label: tDps("meterSettings", "Meter Settings"), icon: SettingsIcon },
};

// Sub-routes for global settings
export const SETTINGS_SUB_ROUTES = {
  "/main/settings/themes": { label: tShell("themes", "Themes"), icon: PaletteIcon },
  "/main/settings/network": { label: tDps("settings.network", "Network"), icon: WifiIcon },
  "/main/settings/hotkeys": { label: tDps("settings.shortcuts", "Hotkeys"), icon: KeyboardIcon },
  "/main/settings/profile": { label: tShell("settings.profile", "Profile"), icon: UsersIcon },
  "/main/settings/overlay": { label: tShell("settings.overlay", "Overlay"), icon: MonitorUpIcon },
  "/main/settings/locales": { label: tShell("settings.locales", "Locale Settings"), icon: LanguagesIcon },
  "/main/settings/debug": { label: tDps("settings.debug", "Debug"), icon: BugIcon },
};

// Legacy export for backward compatibility (if needed)
export const SIDEBAR_ROUTES = DPS_SUB_ROUTES;
