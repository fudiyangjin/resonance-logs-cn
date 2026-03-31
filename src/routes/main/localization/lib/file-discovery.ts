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
    "common/skillnames.json": "Skill Names",
    "common/navigation.json": "UI",
    "common/buffnames.json": "Buff Names",
    "common/buffnamesearch.json": "Buff Name Search",
    "MonsterName.json": "Monster Names",
    "SceneName.json": "Scene Names",
    "localization.json": "Localization",
};

const SORT_PRIORITY: Record<string, number> = {
    "common/skillnames.json": 0,
    "common/navigation.json": 1,
    "common/buffnames.json": 2,
    "common/buffnamesearch.json": 3,
    "MonsterName.json": 4,
    "SceneName.json": 5,
    "localization.json": 6,
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

    if (normalized.endsWith("navigation.json")) {
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