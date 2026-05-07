import fs from "node:fs";
import path from "node:path";

const localeRoot = path.resolve("src/lib/locales");
const manifest = JSON.parse(
  fs.readFileSync(path.join(localeRoot, "manifest.json"), "utf8"),
);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

const issues = [];

for (const locale of manifest.locales ?? []) {
  const uiDir = path.join(localeRoot, locale, "ui");
  for (const filePath of walk(uiDir)) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(data)) {
      const questionCount = typeof value === "string"
        ? (value.match(/\?/g) ?? []).length
        : 0;
      if (
        typeof value === "string" &&
        (
          /\?{4,}/.test(value) ||
          /[A-Za-zÀ-ÿ]\?[A-Za-zÀ-ÿ]|\?[A-Za-zÀ-ÿ]/.test(value) ||
          questionCount >= 2 ||
          questionCount / Math.max(value.length, 1) > 0.25
        )
      ) {
        issues.push({
          locale,
          file: path.relative(localeRoot, filePath),
          key,
          value,
        });
      }
    }
  }
}

if (issues.length > 0) {
  console.error(`UI locale integrity failed: ${issues.length} suspicious replacement-string entries.`);
  for (const issue of issues.slice(0, 200)) {
    console.error(`- ${issue.locale}/${issue.file} :: ${issue.key} = ${issue.value}`);
  }
  if (issues.length > 200) {
    console.error(`... ${issues.length - 200} more`);
  }
  process.exitCode = 1;
} else {
  console.log("UI locale integrity passed.");
}
