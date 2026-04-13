import type { TranslationWorkspaceRow } from "./types";

function normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
}

export function filterTranslationRows(
    rows: TranslationWorkspaceRow[],
    query: string,
    showAll = false,
): TranslationWorkspaceRow[] {
    if (showAll) {
        return rows;
    }

    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
        return [];
    }

    return rows.filter((row) => row.searchBlob.includes(normalizedQuery));
}