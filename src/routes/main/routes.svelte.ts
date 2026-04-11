/**
 * @file This file defines the tool routes for the toolbox sidebar.
 */
import ActivityIcon from "virtual:icons/lucide/activity";
import CalculatorIcon from "virtual:icons/lucide/calculator";
import GlobeIcon from "virtual:icons/lucide/globe";
import HourglassIcon from "virtual:icons/lucide/hourglass";
import PaletteIcon from "virtual:icons/lucide/palette";
import SettingsIcon from "virtual:icons/lucide/settings";
import ShieldAlertIcon from "virtual:icons/lucide/shield-alert";
import SwordsIcon from "virtual:icons/lucide/swords";

import { uiT } from "$lib/i18n";
import { SETTINGS } from "$lib/settings-store";

const tShell = uiT("shell", () => SETTINGS.live.general.state.language);

const tDps = uiT("dps/general", () => SETTINGS.live.general.state.language);

// Tool-level routes for the left sidebar
export const TOOL_ROUTES = {
  "/main/dps": { label: tShell("tool.dps", "DPS检测"), icon: ActivityIcon },
  "/main/module-calc": { label: tShell("tool.moduleOptimizer", "模组计算"), icon: CalculatorIcon },
  "/main/skill-monitor": { label: tShell("tool.skillMonitor", "实时监控"), icon: SwordsIcon },
  "/main/monster-monitor": { label: tShell("tool.monsterTracker", "怪物监控"), icon: ShieldAlertIcon },
  "/main/localization": { label: tShell("tool.localization", "本地化工具"), icon: GlobeIcon },
};

// Sub-routes for DPS tool (tabs in the right panel)
export const DPS_SUB_ROUTES = {
  "/main/dps/history": { label: tDps("history", "历史"), icon: HourglassIcon },
  "/main/dps/themes": { label: tDps("themes", "主题"), icon: PaletteIcon },
  "/main/dps/settings": { label: tDps("settings", "设置"), icon: SettingsIcon },
};

// Legacy export for backward compatibility (if needed)
export const SIDEBAR_ROUTES = DPS_SUB_ROUTES;
