export const SUPPORTED_LANGUAGES = ["zh-CN", "en"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type AppLanguage = "system" | SupportedLanguage;
