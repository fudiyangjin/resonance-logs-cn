import fs from "node:fs";
import path from "node:path";

const localeRoot = path.resolve("src/lib/locales");
const manifestPath = path.join(localeRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const fallbackLocale = manifest.fallbackLocale ?? "en";
const uiFiles = manifest.categories?.ui ?? [];

let issueCount = 0;

for (const relativePath of uiFiles) {
  const fallbackPath = path.join(localeRoot, fallbackLocale, "ui", relativePath);
  if (!fs.existsSync(fallbackPath)) continue;

  const fallbackData = JSON.parse(fs.readFileSync(fallbackPath, "utf8"));
  const fallbackKeys = Object.keys(fallbackData);
  const missingByLocale = [];

  for (const locale of manifest.locales ?? []) {
    if (locale === fallbackLocale) continue;

    const localePath = path.join(localeRoot, locale, "ui", relativePath);
    const localeData = fs.existsSync(localePath)
      ? JSON.parse(fs.readFileSync(localePath, "utf8"))
      : {};

    const missing = fallbackKeys.filter((key) => !(key in localeData));
    if (missing.length > 0) {
      missingByLocale.push({ locale, missing });
      issueCount += missing.length;
    }
  }

  if (missingByLocale.length === 0) continue;

  console.log(`\n${relativePath}`);
  for (const { locale, missing } of missingByLocale) {
    console.log(`  ${locale}: ${missing.length} missing`);
    for (const key of missing.slice(0, 20)) {
      console.log(`    - ${key}`);
    }
    if (missing.length > 20) {
      console.log(`    ... ${missing.length - 20} more`);
    }
  }
}

if (issueCount > 0) {
  console.error(`\nUI locale coverage failed: ${issueCount} missing entries.`);
  process.exitCode = 1;
} else {
  console.log("UI locale coverage passed.");
}
