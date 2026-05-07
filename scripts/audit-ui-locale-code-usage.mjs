import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const localeRoot = path.join(repoRoot, "src/lib/locales");
const manifest = JSON.parse(fs.readFileSync(path.join(localeRoot, "manifest.json"), "utf8"));
const fallbackLocale = manifest.fallbackLocale ?? "en";
const uiFiles = manifest.categories?.ui ?? [];
const sourceRoots = [path.join(repoRoot, "src/routes"), path.join(repoRoot, "src/lib")];
const sourceExts = new Set([".svelte", ".ts"]);

function normalizeUiPath(relativePath) {
  let normalized = String(relativePath).replace(/^\/+/, "").trim();
  if (!normalized.startsWith("ui/")) normalized = `ui/${normalized}`;
  if (!normalized.endsWith(".json")) normalized = `${normalized}.json`;
  return normalized;
}

function readJson(relativePath) {
  const filePath = path.join(localeRoot, fallbackLocale, relativePath);
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : {};
}

const uiTables = new Map();
for (const relativePath of uiFiles) {
  const normalizedPath = normalizeUiPath(relativePath);
  uiTables.set(normalizedPath, readJson(normalizedPath));
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "locales" || entry.name === "config") continue;
      walk(fullPath, files);
    } else if (sourceExts.has(path.extname(entry.name)) && !entry.name.endsWith(".generated.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tableHasKey(relativePath, key) {
  if (key.includes("${")) return true;
  const normalizedPath = normalizeUiPath(relativePath);
  return Object.prototype.hasOwnProperty.call(uiTables.get(normalizedPath) ?? {}, key);
}

function anyTableHasKey(paths, key) {
  if (key.includes("${")) return true;
  return paths.some((relativePath) => tableHasKey(relativePath, key));
}

const dpsUiPaths = uiFiles.filter((p) => p.startsWith("dps/")).map(normalizeUiPath);
const skillMonitorUiPaths = uiFiles.filter((p) => p.startsWith("overlay/skill-monitor/")).map(normalizeUiPath);
const navigationUiPaths = ["ui/shell.json", ...dpsUiPaths];

const resolverGroups = [
  {
    name: "resolveUiTranslation",
    regex: /resolveUiTranslation\(\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g,
    paths: (match) => [normalizeUiPath(match[1])],
    key: (match) => match[2],
  },
  {
    name: "resolveNavigationTranslation",
    regex: /resolveNavigationTranslation\(\s*["'`]([^"'`]+)["'`]/g,
    paths: () => navigationUiPaths,
    key: (match) => match[1],
  },
  {
    name: "resolveModuleCalcTranslation",
    regex: /resolveModuleCalcTranslation\(\s*["'`]([^"'`]+)["'`]/g,
    paths: () => ["ui/module-calc.json"],
    key: (match) => match[1],
  },
  {
    name: "resolveMonsterMonitorTranslation",
    regex: /resolveMonsterMonitorTranslation\(\s*["'`]([^"'`]+)["'`]/g,
    paths: () => ["ui/overlay/monster-monitor.json"],
    key: (match) => match[1],
  },
  {
    name: "resolveSkillMonitorTranslation",
    regex: /resolveSkillMonitorTranslation\(\s*["'`]([^"'`]+)["'`]/g,
    paths: () => skillMonitorUiPaths,
    key: (match) => match[1],
  },
  {
    name: "resolveLocalizationTranslation",
    regex: /resolveLocalizationTranslation\(\s*["'`]([^"'`]+)["'`]/g,
    paths: () => ["ui/localization-tool.json"],
    key: (match) => match[1],
  },
];

const issues = [];

for (const filePath of sourceRoots.flatMap((root) => walk(root))) {
  const text = fs.readFileSync(filePath, "utf8");
  const relativeFile = path.relative(repoRoot, filePath);
  const uiTBindings = [];
  const bindingRegex = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*uiT\(\s*["'`]([^"'`]+)["'`]/g;

  for (const match of text.matchAll(bindingRegex)) {
    uiTBindings.push({ name: match[1], path: normalizeUiPath(match[2]) });
  }

  for (const binding of uiTBindings) {
    const callRegex = new RegExp(`(?<![\\w$])${escapeRegExp(binding.name)}\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g");
    for (const match of text.matchAll(callRegex)) {
      const key = match[1];
      if (!tableHasKey(binding.path, key)) {
        issues.push({
          file: relativeFile,
          source: `${binding.name} -> ${binding.path}`,
          key,
        });
      }
    }
  }

  for (const resolver of resolverGroups) {
    for (const match of text.matchAll(resolver.regex)) {
      const key = resolver.key(match);
      const paths = resolver.paths(match);
      if (!anyTableHasKey(paths, key)) {
        issues.push({
          file: relativeFile,
          source: resolver.name,
          key,
          paths: paths.join(", "),
        });
      }
    }
  }
}

function checkStaticKey(file, source, tablePath, key) {
  if (!tableHasKey(tablePath, key)) {
    issues.push({
      file,
      source,
      key,
      paths: normalizeUiPath(tablePath),
    });
  }
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const settingsStoreText = readSource("src/lib/settings-store.ts");
for (const match of settingsStoreText.matchAll(/labelKey:\s*["'`](panelAttr\.\d+)["'`]/g)) {
  checkStaticKey(
    "src/lib/settings-store.ts",
    "AVAILABLE_PANEL_ATTRS.labelKey",
    "ui/overlay/skill-monitor/panel-attr.json",
    match[1],
  );
}

const customThemeDefaults = settingsStoreText.match(
  /export const DEFAULT_CUSTOM_THEME_COLORS[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
)?.[1] ?? "";
for (const match of customThemeDefaults.matchAll(/^\s*([A-Za-z]\w*):/gm)) {
  const colorKey = match[1];
  checkStaticKey(
    "src/lib/settings-store.ts",
    "DEFAULT_CUSTOM_THEME_COLORS.label",
    "ui/dps/themes.json",
    `themeLabel.${colorKey}.label`,
  );
  checkStaticKey(
    "src/lib/settings-store.ts",
    "DEFAULT_CUSTOM_THEME_COLORS.description",
    "ui/dps/themes.json",
    `themeLabel.${colorKey}.description`,
  );
}

const shortcutsText = readSource("src/routes/main/dps/settings/shortcuts.ts");
for (const match of shortcutsText.matchAll(/labelKey:\s*["'`]([^"'`]+)["'`]/g)) {
  const key = match[1];
  const tablePath = key.startsWith("hotkeys.")
    ? "ui/custom-triggers/general.json"
    : "ui/dps/settings-hotkeys.json";
  checkStaticKey(
    "src/routes/main/dps/settings/shortcuts.ts",
    "shortcut.labelKey",
    tablePath,
    key,
  );
}

if (issues.length > 0) {
  console.error(`UI locale code usage failed: ${issues.length} missing fallback-locale keys.`);
  for (const issue of issues.slice(0, 200)) {
    const pathText = issue.paths ? ` [${issue.paths}]` : "";
    console.error(`- ${issue.file}: ${issue.source}${pathText} :: ${issue.key}`);
  }
  if (issues.length > 200) {
    console.error(`... ${issues.length - 200} more`);
  }
  process.exitCode = 1;
} else {
  console.log("UI locale code usage passed.");
}
