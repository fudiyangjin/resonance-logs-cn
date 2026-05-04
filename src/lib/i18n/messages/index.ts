import type { AppLocale } from "../locales";
import { enUSMessages } from "./en-US";
import { zhCNMessages } from "./zh-CN";

export type MessageKey = keyof typeof zhCNMessages;
export type MessageCatalog = Partial<Record<MessageKey, string>>;

export const MESSAGES = {
  "zh-CN": zhCNMessages,
  "en-US": enUSMessages,
} satisfies Record<AppLocale, MessageCatalog>;
