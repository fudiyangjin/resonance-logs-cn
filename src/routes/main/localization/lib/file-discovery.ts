import { invoke } from "@tauri-apps/api/core";

import type { TranslationFileKind, TranslationFileTab } from "./types";

type RuntimeTranslationFileEntry =
    | string
    | {
        relative_path?: string;
        relativePath?: string;
        path?: string;
    };

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
    "ui/shell.json": "UI / Shell",
    "ui/module-calc.json": "UI / Module Calc",
    "ui/monster-monitor.json": "UI / Monster Monitor",
    "ui/localization-tool.json": "UI / Localization Tool",
    "parser/skillnames.json": "Skill Names",
    "parser/BuffName.json": "Buff Names",
    "parser/MonsterName.json": "Monster Names",
    "parser/SceneName.json": "Scene Names",
    "parser/class-labels.json": "Class Labels",
    "search/BuffNameSearch.json": "Buff Name Search",
    "search/resonance-skill-search.json": "Resonance Skill Search",
};

const SORT_PRIORITY: Record<string, number> = {
    "ui/shell.json": 0,
    "ui/dps/general.json": 1,
    "ui/dps/live.json": 2,
    "ui/dps/history.json": 3,
    "ui/dps/themes.json": 4,
    "ui/dps/settings-live.json": 5,
    "ui/dps/settings-network.json": 6,
    "ui/dps/settings-history.json": 7,
    "ui/dps/settings-hotkeys.json": 8,
    "ui/dps/settings-debug.json": 9,
    "ui/module-calc.json": 10,
    "ui/monster-monitor.json": 11,
    "ui/skill-monitor/general.json": 12,
    "ui/skill-monitor/skill-cd.json": 13,
    "ui/skill-monitor/buff-monitor.json": 14,
    "ui/skill-monitor/panel-attr.json": 15,
    "ui/skill-monitor/custom-panel.json": 16,
    "ui/localization-tool.json": 17,
    "parser/class-labels.json": 18,
    "parser/skillnames.json": 19,
    "parser/MonsterName.json": 20,
    "parser/SceneName.json": 21,
    "parser/BuffName.json": 22,
    "search/BuffNameSearch.json": 23,
    "search/resonance-skill-search.json": 24,
};

function normalizeRelativePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

function getFileName(relativePath: string): string {
    const parts = relativePath.split("/");
    return parts[parts.length - 1] ?? relativePath;
}

function getFolderPath(relativePath: string): string {
    const parts = relativePath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function titleCaseWords(value: string): string {
    return value
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function buildFallbackDisplayName(relativePath: string): string {
    const normalized = normalizeRelativePath(relativePath).replace(/\.json$/i, "");
    const segments = normalized.split("/").filter(Boolean);
    return segments.map(titleCaseWords).join(" / ");
}

function detectFileKind(relativePath: string): TranslationFileKind {
    const normalized = normalizeRelativePath(relativePath).toLowerCase();

    if (normalized.endsWith("skillnames.json")) {
        return "skillnames";
    }

    if (normalized.endsWith("json")) {
        return "navigation";
    }

    return "generic";
}

export function getTranslationFileDisplayName(relativePath: string): string {
    const normalized = normalizeRelativePath(relativePath);
    return (
        DISPLAY_NAME_OVERRIDES[normalized] ??
        DISPLAY_NAME_OVERRIDES[getFileName(normalized)] ??
        buildFallbackDisplayName(normalized)
    );
}

function toTranslationFileTab(relativePath: string): TranslationFileTab {
    const normalized = normalizeRelativePath(relativePath);
    const fileName = getFileName(normalized);
    const folderPath = getFolderPath(normalized);
    const displayName = getTranslationFileDisplayName(normalized);
    const priority = SORT_PRIORITY[normalized] ?? 999;
    const sortKey = `${String(priority).padStart(4, "0")}::${displayName.toLowerCase()}::${normalized.toLowerCase()}`;

    return {
        relativePath: normalized,
        fileName,
        folderPath,
        displayName,
        kind: detectFileKind(normalized),
        sortKey,
    };
}

function extractRelativePath(entry: RuntimeTranslationFileEntry): string | null {
    if (typeof entry === "string") {
        const normalized = normalizeRelativePath(entry);
        return normalized.toLowerCase().endsWith(".json") ? normalized : null;
    }

    const candidate = entry.relative_path ?? entry.relativePath ?? entry.path;
    if (!candidate) {
        return null;
    }

    const normalized = normalizeRelativePath(candidate);
    return normalized.toLowerCase().endsWith(".json") ? normalized : null;
}

export async function discoverTranslationFileTabs(): Promise<TranslationFileTab[]> {
    try {
        const rawEntries = await invoke<RuntimeTranslationFileEntry[]>(
            "list_translation_runtime_files",
        );

        const seen = new Set<string>();
        const tabs: TranslationFileTab[] = [];

        for (const entry of rawEntries ?? []) {
            const relativePath = extractRelativePath(entry);
            if (!relativePath || seen.has(relativePath)) {
                continue;
            }

            seen.add(relativePath);
            tabs.push(toTranslationFileTab(relativePath));
        }

        return tabs.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    } catch (error) {
        console.warn("[localization] Failed to discover translation runtime files:", error);
        return [];
    }
}