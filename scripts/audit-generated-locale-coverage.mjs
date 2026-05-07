#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const localeRoot = path.join(repoRoot, "src", "lib", "locales");
const generatedRoot = path.join(repoRoot, "parser-data", "generated");
const defaultOutJson = path.join(repoRoot, "DEV_exports", "generated-locale-coverage.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "generated-locale-coverage.md");

const GENERATED_FILES = [
  "skillnames.json",
  "SkillBreakdownDetails.json",
  "BuffName.json",
  "itemnames.json",
  "monsternames.json",
  "scenenames.json",
  "DamageAttrIdName.json",
  "RecountTable.json",
  "EffectSources.json",
  "SeasonPhantomFactors.json",
  "class-labels.json",
];

const AUXILIARY_LOCALE_KEYS = ["design", "und"];
const PLACEHOLDER_PATTERNS = [
  /\bUnmapped Buff \d+\b/i,
  /\bActive Buff \d+\b/i,
  /\bUnknown (?:Skill|Buff|Source|Item|Monster|Scene) \d+\b/i,
  /\bProfession Talent Stage \d+\b/i,
  /^#?\d+$/,
];
const SUSPICIOUS_TEXT_PATTERNS = [
  /\uFFFD/,
  /\?{4,}/,
  /[A-Za-zÀ-ÿ]\?[A-Za-zÀ-ÿ]|\?[A-Za-zÀ-ÿ]/,
  /Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â[\u0080-\u00BF€]/,
];

function parseArgs(argv) {
  const options = {
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    maxExamples: 20,
    strict: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    switch (arg) {
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--max-examples":
        options.maxExamples = Number(next());
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Generated Locale Coverage Audit

Usage:
  node scripts/audit-generated-locale-coverage.mjs [options]

Options:
  --out-json <file>       JSON report path. Default: DEV_exports/generated-locale-coverage.json
  --out-md <file>         Markdown report path. Default: DEV_exports/generated-locale-coverage.md
  --max-examples <count>  Examples per issue bucket. Default: 20
  --strict                Exit non-zero when missing/corrupt/generated-placeholder text is found.
  --help                  Show this help.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asEntries(data, fileName) {
  if (Array.isArray(data)) {
    return data.map((value, index) => [String(index), value]);
  }

  if (fileName === "EffectSources.json") {
    return Object.entries(data.effectSourcesById ?? {});
  }

  if (fileName === "SeasonPhantomFactors.json") {
    return Object.entries(data.factorsByBuffId ?? {});
  }

  return Object.entries(data ?? {});
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function percent(part, total) {
  if (!total) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function sortedObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function looksLikeLocaleMap(value, localeKeys) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  const allowed = new Set([...localeKeys, ...AUXILIARY_LOCALE_KEYS]);
  if (!keys.every((key) => allowed.has(key))) return false;
  return keys.some((key) => allowed.has(key) && typeof value[key] === "string");
}

function isDescriptionPath(fieldPath) {
  return /(^|\.)(Notes|notes|descriptions|cleanDescriptions|resolvedDescriptions|cleanResolvedDescriptions)$/i.test(fieldPath);
}

function isNamePath(fieldPath) {
  return /(^|\.)(Names|names|sourceNames|familyNames|DisplayNames|DamageNames|LinkedNames|.*Name.*Names)$/i.test(fieldPath)
    || fieldPath === "entry";
}

function hasPlaceholder(text) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function hasSuspiciousText(text) {
  return SUSPICIOUS_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function hasUnexpectedEnglishScript(text) {
  return /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F]/.test(text);
}

function entryId(entryKey, entry) {
  return entry?.Id
    ?? entry?.id
    ?? entry?.sourceId
    ?? entry?.SourceId
    ?? entry?.buffId
    ?? entry?.familyId
    ?? entryKey;
}

function preferredLabel(map, fallback = "") {
  for (const key of ["en", "zh-CN", "zh-TW", "ja", "ko-KR", "design", "und"]) {
    const value = cleanText(map?.[key]);
    if (value) return value;
  }
  for (const value of Object.values(map ?? {})) {
    const text = cleanText(value);
    if (text) return text;
  }
  return fallback;
}

function collectLocaleMaps(value, localeKeys, out, fieldPath = "") {
  if (looksLikeLocaleMap(value, localeKeys)) {
    out.push({ fieldPath: fieldPath || "entry", map: value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (isPlainObject(item) || Array.isArray(item)) {
        collectLocaleMaps(item, localeKeys, out, `${fieldPath}[${index}]`);
      }
    });
    return;
  }

  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (!isPlainObject(child) && !Array.isArray(child)) continue;
    const childPath = fieldPath ? `${fieldPath}.${key}` : key;
    collectLocaleMaps(child, localeKeys, out, childPath);
  }
}

function makeEmptyFieldSummary(locales) {
  return {
    maps: 0,
    full: 0,
    partial: 0,
    designOnly: 0,
    empty: 0,
    withEnglish: 0,
    missingByLocale: Object.fromEntries(locales.map((locale) => [locale, 0])),
    placeholderTexts: 0,
    suspiciousTexts: 0,
    englishScriptMismatches: 0,
    examples: {
      partial: [],
      designOnly: [],
      empty: [],
      placeholder: [],
      suspicious: [],
      englishScriptMismatch: [],
    },
  };
}

function addExample(list, example, maxExamples) {
  if (list.length < maxExamples) list.push(example);
}

function summarizeLocaleMap({
  fileName,
  fieldPath,
  entryKey,
  entry,
  map,
  locales,
  summary,
  maxExamples,
}) {
  summary.maps += 1;

  const present = locales.filter((locale) => cleanText(map[locale]));
  const missing = locales.filter((locale) => !cleanText(map[locale]));
  const hasDesign = AUXILIARY_LOCALE_KEYS.some((key) => cleanText(map[key]));
  const label = preferredLabel(map, String(entryId(entryKey, entry)));
  const example = {
    file: fileName,
    id: entryId(entryKey, entry),
    field: fieldPath,
    label,
    presentLocales: present,
    missingLocales: missing,
    design: cleanText(map.design),
    en: cleanText(map.en),
  };

  if (present.length === locales.length) {
    summary.full += 1;
  } else if (present.length > 0) {
    summary.partial += 1;
    for (const locale of missing) summary.missingByLocale[locale] += 1;
    addExample(summary.examples.partial, example, maxExamples);
  } else if (hasDesign) {
    summary.designOnly += 1;
    for (const locale of missing) summary.missingByLocale[locale] += 1;
    addExample(summary.examples.designOnly, example, maxExamples);
  } else {
    summary.empty += 1;
    for (const locale of missing) summary.missingByLocale[locale] += 1;
    addExample(summary.examples.empty, example, maxExamples);
  }

  if (cleanText(map.en)) summary.withEnglish += 1;

  for (const [locale, rawText] of Object.entries(map)) {
    const text = cleanText(rawText);
    if (!text) continue;

    if (hasPlaceholder(text)) {
      summary.placeholderTexts += 1;
      addExample(summary.examples.placeholder, { ...example, locale, text }, maxExamples);
    }

    if (hasSuspiciousText(text)) {
      summary.suspiciousTexts += 1;
      addExample(summary.examples.suspicious, { ...example, locale, text }, maxExamples);
    }
  }

  const englishText = cleanText(map.en);
  if (englishText && hasUnexpectedEnglishScript(englishText)) {
    summary.englishScriptMismatches += 1;
    addExample(summary.examples.englishScriptMismatch, { ...example, locale: "en", text: englishText }, maxExamples);
  }
}

function buildFileAudit(fileName, data, locales, maxExamples) {
  const entries = asEntries(data, fileName);
  const fields = new Map();
  const localizableMaps = [];
  let entriesWithAnyMap = 0;

  for (const [entryKey, entry] of entries) {
    const maps = [];
    collectLocaleMaps(entry, locales, maps);
    if (maps.length > 0) entriesWithAnyMap += 1;

    for (const { fieldPath, map } of maps) {
      localizableMaps.push({
        entryKey,
        entry,
        fieldPath,
        map,
      });
      if (!fields.has(fieldPath)) {
        fields.set(fieldPath, makeEmptyFieldSummary(locales));
      }
      summarizeLocaleMap({
        fileName,
        fieldPath,
        entryKey,
        entry,
        map,
        locales,
        summary: fields.get(fieldPath),
        maxExamples,
      });
    }
  }

  const totals = makeEmptyFieldSummary(locales);
  for (const mapEntry of localizableMaps) {
    summarizeLocaleMap({
      fileName,
      fieldPath: mapEntry.fieldPath,
      entryKey: mapEntry.entryKey,
      entry: mapEntry.entry,
      map: mapEntry.map,
      locales,
      summary: totals,
      maxExamples,
    });
  }

  const byField = Object.fromEntries(
    [...fields.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, summary]) => [field, summary]),
  );

  const descriptionFields = Object.fromEntries(
    Object.entries(byField).filter(([field]) => isDescriptionPath(field)),
  );
  const nameFields = Object.fromEntries(
    Object.entries(byField).filter(([field]) => isNamePath(field)),
  );

  return {
    fileName,
    entries: entries.length,
    entriesWithAnyLocaleMap: entriesWithAnyMap,
    localizableMaps: localizableMaps.length,
    totals,
    nameFields,
    descriptionFields,
    byField,
  };
}

function makeMarkdown(report) {
  const lines = [];
  lines.push("# Generated Locale Coverage");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Locales: ${report.locales.join(", ")}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| File | Entries | Locale maps | Full | Partial | Design-only | Empty | Placeholders | Suspicious |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const file of report.files) {
    lines.push([
      `\`${file.fileName}\``,
      formatCount(file.entries),
      formatCount(file.localizableMaps),
      `${formatCount(file.totals.full)} (${percent(file.totals.full, file.localizableMaps)})`,
      formatCount(file.totals.partial),
      formatCount(file.totals.designOnly),
      formatCount(file.totals.empty),
      formatCount(file.totals.placeholderTexts),
      formatCount(file.totals.suspiciousTexts),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  lines.push("## Missing By Locale");
  lines.push("");
  lines.push("| File | " + report.locales.join(" | ") + " |");
  lines.push("| --- | " + report.locales.map(() => "---:").join(" | ") + " |");
  for (const file of report.files) {
    lines.push(`| \`${file.fileName}\` | ${report.locales.map((locale) => formatCount(file.totals.missingByLocale[locale])).join(" | ")} |`);
  }
  lines.push("");
  lines.push("## Description Fields");
  lines.push("");
  lines.push("| File | Field | Maps | Full | Partial | Design-only | Empty |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const file of report.files) {
    for (const [field, summary] of Object.entries(file.descriptionFields)) {
      lines.push(`| \`${file.fileName}\` | \`${field}\` | ${formatCount(summary.maps)} | ${formatCount(summary.full)} | ${formatCount(summary.partial)} | ${formatCount(summary.designOnly)} | ${formatCount(summary.empty)} |`);
    }
  }
  lines.push("");
  lines.push("## Highest-Risk Examples");
  lines.push("");
  lines.push("These are generated rows most likely to leak into UI as raw design text, UID placeholders, or corrupted text.");
  lines.push("");
  for (const bucket of ["designOnly", "partial", "placeholder", "englishScriptMismatch", "suspicious"]) {
    lines.push(`### ${bucket}`);
    lines.push("");
    const rows = report.examples[bucket] ?? [];
    if (!rows.length) {
      lines.push("_None found._");
      lines.push("");
      continue;
    }
    lines.push("| File | ID | Field | Label | Missing |");
    lines.push("| --- | ---: | --- | --- | --- |");
    for (const row of rows) {
      const label = String(row.text ?? row.label ?? "").replace(/\|/g, "\\|").slice(0, 140);
      const missing = Array.isArray(row.missingLocales) ? row.missingLocales.join(", ") : "";
      lines.push(`| \`${row.file}\` | ${row.id} | \`${row.field}\` | ${label} | ${missing} |`);
    }
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("");
  lines.push("- `full` means all supported app locales are present in that generated locale map.");
  lines.push("- `design-only` means the game table only exposed a design/internal string for that map; those are the rows that produce Chinese/internal names unless a generator can bridge them to localized siblings.");
  lines.push("- `placeholder` flags generated fallback labels like `Unmapped Buff 510072`; those are expected to remain until we find a real game-file relationship.");
  lines.push("- `skillnames.json` carries direct game-file `Notes` when a structured skill or proven talent/passive description id exists; modifier-specific descriptions still come from effect/factor/source reports.");
  return `${lines.join("\n")}\n`;
}

function collectGlobalExamples(files, maxExamples) {
  const examples = {
    partial: [],
    designOnly: [],
    empty: [],
    placeholder: [],
    suspicious: [],
    englishScriptMismatch: [],
  };

  for (const file of files) {
    for (const summary of Object.values(file.byField)) {
      for (const [bucket, rows] of Object.entries(summary.examples)) {
        for (const row of rows) {
          addExample(examples[bucket], row, maxExamples);
        }
      }
    }
  }
  return examples;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const manifest = readJson(path.join(localeRoot, "manifest.json"));
  const locales = manifest.locales ?? [];
  if (locales.length === 0) {
    throw new Error("No locales found in src/lib/locales/manifest.json");
  }

  const files = GENERATED_FILES.map((fileName) => {
    const filePath = path.join(generatedRoot, fileName);
    const data = readJson(filePath);
    return buildFileAudit(fileName, data, locales, options.maxExamples);
  });

  const report = {
    generatedAt: new Date().toISOString(),
    locales,
    generatedRoot: path.relative(repoRoot, generatedRoot),
    files,
    examples: collectGlobalExamples(files, options.maxExamples),
  };

  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(options.outMd, makeMarkdown(report));

  const issueCount = files.reduce((sum, file) => (
    sum
    + file.totals.partial
    + file.totals.designOnly
    + file.totals.empty
    + file.totals.placeholderTexts
    + file.totals.suspiciousTexts
    + file.totals.englishScriptMismatches
  ), 0);

  console.log(`Generated locale coverage written to ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Generated locale coverage JSON written to ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Tracked ${formatCount(files.reduce((sum, file) => sum + file.localizableMaps, 0))} generated locale maps across ${files.length} files.`);
  console.log(`Potential issues: ${formatCount(issueCount)}`);

  if (options.strict && issueCount > 0) {
    process.exitCode = 1;
  }
}

main();
