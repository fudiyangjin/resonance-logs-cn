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
    "parser/skillnames.json": "Skill Names",
    "ui/DPS.json": "DPS UI",
    "ui/module-calc.json": "Module Calculator UI",
    "ui/monster-monitor.json": "Monster Monitor UI",
    "ui/skill-monitor.json": "Skill Monitor UI",
    "ui/settings-store.json": "Settings Store UI",
    "ui/localization.json": "Localization UI",
    "parser/BuffName.json": "Buff Names",
    "search/BuffNameSearch.json": "Buff Name Search",
    "search/resonance-skill-search.json": "Resonance Skill Search",
    "parser/MonsterName.json": "Monster Names",
    "parser/SceneName.json": "Scene Names",
};

const SORT_PRIORITY: Record<string, number> = {
    "ui/DPS.json": 0,
    "ui/module-calc.json": 1,
    "ui/monster-monitor.json": 2,
    "ui/skill-monitor.json": 3,
    "ui/settings-store.json": 4,
    "ui/localization.json": 5,
    "parser/class-labels.json": 6,
    "parser/skillnames.json": 7,
    "parser/MonsterName.json": 8,
    "parser/SceneName.json": 9,
    "parser/BuffName.json": 10,
    "search/BuffNameSearch.json": 11,
    "search/resonance-skill-search.json": 12,
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
    const fileName = getFileName(relativePath);
    const withoutExtension = fileName.replace(/\.json$/i, "");
    return titleCaseWords(withoutExtension);
}

function detectFileKind(relativePath: string): TranslationFileKind {
    const normalized = normalizeRelativePath(relativePath).toLowerCase();

    if (normalized.endsWith("skillnames.json")) {
        return "skillnames";
    }

    if (normalized.endsWith("dps.json")) {
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