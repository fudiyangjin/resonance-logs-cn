import { invoke } from "@tauri-apps/api/core";

export type WriteTranslationRuntimeResult =
    | {
        ok: true;
        message?: string;
    }
    | {
        ok: false;
        error: string;
    };

export async function readTranslationRuntimeFile(
    relativePath: string,
): Promise<string | null> {
    try {
        const raw = await invoke<string>("read_translation_runtime_file", {
            relativePath,
        });

        return typeof raw === "string" ? raw : null;
    } catch (error) {
        console.warn(
            `[localization] Failed to read translation runtime file: ${relativePath}`,
            error,
        );
        return null;
    }
}

export async function readTranslationRuntimeJson<T>(
    relativePath: string,
): Promise<T | null> {
    const raw = await readTranslationRuntimeFile(relativePath);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as T;
    } catch (error) {
        console.warn(
            `[localization] Failed to parse translation runtime JSON: ${relativePath}`,
            error,
        );
        return null;
    }
}

export async function writeTranslationRuntimeFile(
    relativePath: string,
    contents: string,
): Promise<WriteTranslationRuntimeResult> {
    try {
        const result = await invoke<string>("write_translation_runtime_file", {
            relativePath,
            contents,
        });

        if (typeof result === "string" && result.length > 0) {
            return {
                ok: true,
                message: result,
            };
        }

        return {
            ok: true,
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        console.warn(
            `[localization] Failed to write translation runtime file: ${relativePath}`,
            error,
        );

        return {
            ok: false,
            error: errorMessage,
        };
    }
}

export async function writeTranslationRuntimeJson(
    relativePath: string,
    value: unknown,
): Promise<WriteTranslationRuntimeResult> {
    try {
        const contents = JSON.stringify(value, null, 2);
        return await writeTranslationRuntimeFile(relativePath, contents);
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        console.warn(
            `[localization] Failed to serialize translation runtime JSON: ${relativePath}`,
            error,
        );

        return {
            ok: false,
            error: errorMessage,
        };
    }
}