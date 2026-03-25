import i18next, { type TOptions } from "i18next";
import type { AppLanguage, SupportedLanguage } from "./types";
import { SUPPORTED_LANGUAGES } from "./types";
import zhLiteral from "./locales/zh-CN/literal";
import enLiteral from "./locales/en/literal";
import zhMessages from "./locales/zh-CN/messages";
import enMessages from "./locales/en/messages";
import zhWindows from "./locales/zh-CN/windows";
import enWindows from "./locales/en/windows";

const resources: Record<
  SupportedLanguage,
  {
    literal: Record<string, string>;
    messages: Record<string, string>;
    windows: Record<string, string>;
  }
> = {
  "zh-CN": {
    literal: zhLiteral,
    messages: zhMessages,
    windows: zhWindows,
  },
  en: {
    literal: enLiteral,
    messages: enMessages,
    windows: enWindows,
  },
};

const i18nState = $state({
  initialized: false,
  ready: false,
  language: "zh-CN" as SupportedLanguage,
  version: 0,
});

const textNodeSource = new WeakMap<Text, string>();
const attributeSource = new WeakMap<Element, Map<string, string>>();

const translatableAttributes = ["placeholder", "title", "aria-label"] as const;

let observer: MutationObserver | null = null;

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function detectSystemLanguage(raw = typeof navigator !== "undefined" ? navigator.language : ""): SupportedLanguage {
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("zh")) return "zh-CN";
  return "zh-CN";
}

export function resolveAppLanguage(language: AppLanguage, systemLanguage?: string): SupportedLanguage {
  if (language === "system") {
    return detectSystemLanguage(systemLanguage);
  }
  return isSupportedLanguage(language) ? language : "zh-CN";
}

function touch(language: SupportedLanguage) {
  i18nState.language = language;
  i18nState.version += 1;
}

export async function initI18n(language: AppLanguage = "system") {
  const resolved = resolveAppLanguage(language);
  if (!i18nState.initialized) {
    await i18next.init({
      resources,
      lng: resolved,
      fallbackLng: "zh-CN",
      defaultNS: "literal",
      ns: ["literal", "messages", "windows"],
      interpolation: {
        escapeValue: false,
      },
    });
    i18nState.initialized = true;
  } else if (i18next.resolvedLanguage !== resolved) {
    await i18next.changeLanguage(resolved);
  }
  i18nState.ready = true;
  touch((i18next.resolvedLanguage as SupportedLanguage | undefined) ?? resolved);
}

export async function setLanguage(language: AppLanguage) {
  const resolved = resolveAppLanguage(language);
  if (!i18nState.initialized) {
    await initI18n(language);
    return;
  }
  if (i18next.resolvedLanguage !== resolved) {
    await i18next.changeLanguage(resolved);
  }
  touch((i18next.resolvedLanguage as SupportedLanguage | undefined) ?? resolved);
}

export function ready() {
  return i18nState.ready;
}

export function resolvedLanguage() {
  i18nState.version;
  return i18nState.language;
}

export function t(key: string, options?: TOptions) {
  i18nState.version;
  if (!i18nState.initialized) return key;
  if (options) {
    return i18next.t(key as never, options as never) as unknown as string;
  }
  return i18next.t(key) as string;
}

export function tl(key: string, options?: TOptions) {
  return t(key, { ns: "literal", ...options });
}

export function tm(key: string, options?: TOptions) {
  return t(key, { ns: "messages", ...options });
}

export function tw(key: string, options?: TOptions) {
  return t(key, { ns: "windows", ...options });
}

export function bootstrapLiteral(key: string) {
  const language = detectSystemLanguage();
  return resources[language].literal[key] ?? resources["zh-CN"].literal[key] ?? key;
}

export function bootstrapMessage(key: string, options?: Record<string, string | number>) {
  const language = detectSystemLanguage();
  let template = resources[language].messages[key] ?? resources["zh-CN"].messages[key] ?? key;
  for (const [name, value] of Object.entries(options ?? {})) {
    template = template.replaceAll(`{{${name}}}`, String(value));
  }
  return template;
}

function hasLiteralKey(value: string) {
  if (!i18nState.initialized) return false;
  return i18next.exists(value, { ns: "literal" });
}

function translateDynamic(value: string) {
  const targetMatch = value.match(/^Target (\d+)$/);
  if (targetMatch) {
    return tm("Target {{id}}", { id: targetMatch[1] });
  }

  const moduleCountMatch = value.match(/^Need at least (\d+) modules$/);
  if (moduleCountMatch) {
    return tm("Need at least {{count}} modules", { count: Number(moduleCountMatch[1]) });
  }

  return null;
}

function translateExact(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !hasLiteralKey(trimmed)) return value;
  const translated = tl(trimmed);
  const prefix = value.match(/^\s*/)?.[0] ?? "";
  const suffix = value.match(/\s*$/)?.[0] ?? "";
  return `${prefix}${translated}${suffix}`;
}

function translateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const dynamic = translateDynamic(trimmed);
  if (dynamic !== null) {
    const prefix = value.match(/^\s*/)?.[0] ?? "";
    const suffix = value.match(/\s*$/)?.[0] ?? "";
    return `${prefix}${dynamic}${suffix}`;
  }

  return translateExact(value);
}

function translateTextNode(node: Text) {
  const original = textNodeSource.get(node) ?? node.nodeValue ?? "";
  if (!textNodeSource.has(node)) {
    textNodeSource.set(node, original);
  }
  const nextValue = translateValue(original);
  if (node.nodeValue !== nextValue) {
    node.nodeValue = nextValue;
  }
}

function translateElementAttributes(element: Element) {
  let map = attributeSource.get(element);
  if (!map) {
    map = new Map();
    attributeSource.set(element, map);
  }
  for (const attribute of translatableAttributes) {
    if (!element.hasAttribute(attribute)) continue;
    if (!map.has(attribute)) {
      map.set(attribute, element.getAttribute(attribute) ?? "");
    }
    const original = map.get(attribute) ?? "";
    const nextValue = translateValue(original);
    if ((element.getAttribute(attribute) ?? "") !== nextValue) {
      element.setAttribute(attribute, nextValue);
    }
  }
}

function localizeNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    translateTextNode(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  if (tagName === "script" || tagName === "style") return;
  translateElementAttributes(element);
  for (const child of element.childNodes) {
    localizeNode(child);
  }
}

export function localizeDocument(root: ParentNode) {
  for (const node of root.childNodes) {
    localizeNode(node);
  }
}

export function startDocumentLocalization(root: ParentNode) {
  if (typeof MutationObserver === "undefined") return () => {};
  if (observer) observer.disconnect();
  localizeDocument(root);
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
        translateTextNode(mutation.target as Text);
        continue;
      }
      if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
        translateElementAttributes(mutation.target as Element);
      }
      for (const node of mutation.addedNodes) {
        localizeNode(node);
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...translatableAttributes],
  });
  return () => {
    observer?.disconnect();
    observer = null;
  };
}
