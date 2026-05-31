#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const generatedRoot = path.join(repoRoot, "parser-data", "generated");
const localeRoot = path.join(repoRoot, "src", "lib", "locales");
const defaultOutJson = path.join(repoRoot, "DEV_exports", "runtime-localization-gaps.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "runtime-localization-gaps.md");

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
  "ModifierDisplayTable.json",
  "ModifierRecountTable.json",
  "ModifierClassificationTable.json",
  "SeasonEffectDescriptions.json",
  "SeasonPhantomFactors.json",
  "TalentSpecOwnership.json",
];

const DEFAULT_FOCUS_IDS = [
  522201,
  852220,
  882220,
  2202220,
  2208181,
  2302220,
  2402220,
];

const AUXILIARY_LOCALES = new Set(["design", "und"]);
const NAME_FIELD_PATTERN = /(^|\.)(Names|names|sourceNames|familyNames|DisplayNames|DamageNames|LinkedNames|LinkedBuffNames|ParentRecountNames|MonsterOwnerNames|OwnerNames)$/;
const PLACEHOLDER_PATTERN = /\b(?:Unmapped|Unknown|Active)\s+(?:Buff|Skill|Source|Item|Monster|Scene)\s+\d+\b/i;
const CJK_PATTERN = /[\u3400-\u9fff]/u;

function parseArgs(argv) {
  const options = {
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    maxExamples: 80,
    focusIds: DEFAULT_FOCUS_IDS,
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
      case "--focus-ids":
        options.focusIds = next()
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value > 0);
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
  console.log(`Runtime Localization Gap Audit

Usage:
  node scripts/audit-runtime-localization-gaps.mjs [options]

Options:
  --out-json <file>       JSON report path. Default: DEV_exports/runtime-localization-gaps.json
  --out-md <file>         Markdown report path. Default: DEV_exports/runtime-localization-gaps.md
  --max-examples <count>  Examples per file/status. Default: 80
  --focus-ids <ids>       Comma-separated UIDs to highlight.
  --help                  Show this help.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName, fallback = null) {
  const filePath = path.join(generatedRoot, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return readJson(filePath);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasRealEnglish(map) {
  const en = cleanText(map?.en);
  return Boolean(en && !PLACEHOLDER_PATTERN.test(en));
}

function preferredLabel(map, fallback = "") {
  for (const key of ["en", "zh-CN", "zh-TW", "design", "ja", "ko-KR", "fr", "de", "es", "pt-BR", "th", "id"]) {
    const value = cleanText(map?.[key]);
    if (value) return value;
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
      if (isRecord(item) || Array.isArray(item)) {
        collectLocaleMaps(item, localeKeys, out, `${fieldPath}[${index}]`);
      }
    });
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (!isRecord(child) && !Array.isArray(child)) continue;
    collectLocaleMaps(child, localeKeys, out, fieldPath ? `${fieldPath}.${key}` : key);
  }
}

function looksLikeLocaleMap(value, localeKeys) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  const allowed = new Set([...localeKeys, ...AUXILIARY_LOCALES]);
  if (!keys.every((key) => allowed.has(key))) return false;
  return keys.some((key) => typeof value[key] === "string");
}

function nameField(fieldPath) {
  return NAME_FIELD_PATTERN.test(fieldPath);
}

function asEntries(data, fileName) {
  if (Array.isArray(data)) {
    return data.map((value, index) => [String(value?.Id ?? value?.id ?? index), value]);
  }

  if (fileName === "EffectSources.json") {
    return Object.entries(data?.effectSourcesById ?? {});
  }

  if (fileName === "ModifierDisplayTable.json") {
    return Object.entries(data?.sourcesByRuleId ?? {});
  }

  if (fileName === "ModifierRecountTable.json" || fileName === "ModifierClassificationTable.json") {
    return Object.entries(data?.sourcesById ?? data?.sourcesByRuleId ?? {});
  }

  if (fileName === "SeasonEffectDescriptions.json") {
    return Object.entries(data?.byBuffId ?? {});
  }

  if (fileName === "SeasonPhantomFactors.json") {
    return Object.entries(data?.factorsByBuffId ?? {});
  }

  if (fileName === "TalentSpecOwnership.json") {
    return Object.entries(data?.talentsById ?? {});
  }

  return Object.entries(data ?? {});
}

function entryId(entryKey, entry) {
  return entry?.Id
    ?? entry?.id
    ?? entry?.sourceEntityId
    ?? entry?.buffId
    ?? entry?.observedBuffId
    ?? entry?.sourceId
    ?? entryKey;
}

function numericIdsFromEntry(entry, entryKey) {
  const ids = new Set();
  const add = (value) => {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) ids.add(number);
  };

  add(entryKey);
  for (const key of [
    "Id",
    "id",
    "sourceEntityId",
    "buffId",
    "observedBuffId",
    "LinkedId",
    "LinkedBuffId",
    "BuffSourceId",
  ]) {
    add(entry?.[key]);
  }

  for (const key of ["LinkedIds", "buffIds", "debugBuffIds", "runtimeBaseIds", "targetDamageIds"]) {
    for (const value of Array.isArray(entry?.[key]) ? entry[key] : []) {
      add(value);
    }
  }

  const sourceId = cleanText(entry?.sourceId);
  const sourceMatch = /(?:buff-source|observed-buff):(\d+)/.exec(sourceId);
  if (sourceMatch) add(sourceMatch[1]);

  return [...ids].sort((left, right) => left - right);
}

function relatedBuffIds(entry, entryKey, fileName) {
  const ids = new Set();
  const add = (value) => {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) ids.add(number);
  };

  if (fileName === "BuffName.json" || fileName === "SeasonEffectDescriptions.json") {
    add(entryId(entryKey, entry));
  }

  for (const key of ["buffId", "observedBuffId", "LinkedBuffId", "BuffSourceId"]) {
    add(entry?.[key]);
  }

  for (const value of Array.isArray(entry?.buffIds) ? entry.buffIds : []) add(value);

  const sourceId = cleanText(entry?.sourceId);
  const sourceMatch = /(?:buff-source|observed-buff):(\d+)/.exec(sourceId);
  if (sourceMatch) add(sourceMatch[1]);

  return [...ids].sort((left, right) => left - right);
}

function compactNames(map) {
  const out = {};
  for (const key of ["en", "zh-CN", "zh-TW", "ja", "ko-KR", "fr", "de", "es", "pt-BR", "th", "id", "design"]) {
    const value = cleanText(map?.[key]);
    if (value) out[key] = value;
  }
  return out;
}

function bridgeIndexes() {
  const modifierDisplay = readGenerated("ModifierDisplayTable.json", {});
  const effectSources = readGenerated("EffectSources.json", {});
  const recount = readGenerated("ModifierRecountTable.json", {});
  const seasonEffects = readGenerated("SeasonEffectDescriptions.json", {});
  const itemDescriptions = readGenerated("ItemDescriptionSources.json", {});
  const observedBridge = readGenerated("ModifierObservedUidBridge.json", {});

  return {
    modifierDisplay,
    effectSources,
    recount,
    seasonEffects,
    itemDescriptions,
    observedBridge,
  };
}

function modifierDisplaySource(indexes, sourceId) {
  const ruleIds = indexes.modifierDisplay?.sourceRuleIdsBySourceId?.[sourceId] ?? [];
  for (const ruleId of ruleIds) {
    const source = indexes.modifierDisplay?.sourcesByRuleId?.[ruleId];
    if (!source) continue;
    const names = source.sourceNames;
    if (hasRealEnglish(names)) {
      return {
        kind: "strong-source-name",
        source: "ModifierDisplayTable",
        sourceId,
        ruleId,
        names: compactNames(names),
      };
    }
  }
  return null;
}

function effectSource(indexes, sourceId) {
  const source = indexes.effectSources?.effectSourcesById?.[sourceId];
  if (!source) return null;
  if (hasRealEnglish(source.sourceNames)) {
    return {
      kind: "strong-source-name",
      source: "EffectSources",
      sourceId,
      names: compactNames(source.sourceNames),
    };
  }
  if (PLACEHOLDER_PATTERN.test(cleanText(source.sourceNames?.en))) {
    return {
      kind: "placeholder-source-name",
      source: "EffectSources",
      sourceId,
      names: compactNames(source.sourceNames),
    };
  }
  return null;
}

function recountBridge(indexes, buffId) {
  const ruleIds = indexes.recount?.byBuffId?.[String(buffId)] ?? [];
  for (const ruleId of ruleIds) {
    const source = indexes.recount?.sourcesById?.[ruleId];
    if (!source) continue;
    const sourceId = cleanText(source.sourceId);
    if (sourceId.startsWith("observed-buff:") || source.contributionStatus === "observed-only") {
      return {
        kind: "observed-only",
        source: "ModifierRecountTable",
        sourceId,
        ruleId,
        contributionStatus: source.contributionStatus ?? "",
        reportPolicy: source.reportPolicy ?? "",
        evidence: source.evidence ?? [],
      };
    }
    if (source.contributionStatus === "needs-source-localization") {
      return {
        kind: "needs-source-localization",
        source: "ModifierRecountTable",
        sourceId,
        ruleId,
        contributionStatus: source.contributionStatus,
        reportPolicy: source.reportPolicy ?? "",
        evidence: source.evidence ?? [],
      };
    }
  }
  return null;
}

function descriptionBridge(indexes, fileName, id, buffIds) {
  for (const buffId of buffIds) {
    const season = indexes.seasonEffects?.byBuffId?.[String(buffId)];
    if (hasRealEnglish(season?.descriptions) || cleanText(season?.description)) {
      return {
        kind: "description-only",
        source: "SeasonEffectDescriptions",
        buffId,
        description: cleanText(season.description) || cleanText(season.descriptions?.en),
      };
    }
  }

  if (fileName === "itemnames.json") {
    const item = indexes.itemDescriptions?.descriptionsByItemId?.[String(id)];
    if (hasRealEnglish(item?.descriptions) || cleanText(item?.description)) {
      return {
        kind: "description-only",
        source: "ItemDescriptionSources",
        itemId: id,
        description: cleanText(item.description) || cleanText(item.descriptions?.en),
      };
    }
  }

  return null;
}

function observedBridgeAlias(indexes, buffId) {
  const alias = indexes.observedBridge?.aliasesByBuffId?.[String(buffId)];
  if (!alias) return null;
  return {
    kind: "observed-alias-candidate",
    source: "ModifierObservedUidBridge",
    buffId,
    alias,
  };
}

function classifyBridge(indexes, fileName, entryKey, entry, id) {
  const buffIds = relatedBuffIds(entry, entryKey, fileName);
  const sourceIds = new Set();

  for (const buffId of buffIds) {
    sourceIds.add(`buff-source:${buffId}`);
    sourceIds.add(`observed-buff:${buffId}`);
  }
  const directSourceId = cleanText(entry?.sourceId);
  if (directSourceId) sourceIds.add(directSourceId);

  for (const sourceId of sourceIds) {
    const modifierBridge = modifierDisplaySource(indexes, sourceId);
    if (modifierBridge) return modifierBridge;

    const effectBridge = effectSource(indexes, sourceId);
    if (effectBridge) return effectBridge;
  }

  for (const buffId of buffIds) {
    const recount = recountBridge(indexes, buffId);
    if (recount?.kind === "needs-source-localization") return recount;
  }

  const description = descriptionBridge(indexes, fileName, Number(id), buffIds);
  if (description) return description;

  for (const buffId of buffIds) {
    const alias = observedBridgeAlias(indexes, buffId);
    if (alias) return alias;
  }

  for (const buffId of buffIds) {
    const recount = recountBridge(indexes, buffId);
    if (recount) return recount;
  }

  return { kind: "no-bridge", source: "" };
}

function shouldReportGap(map, localeKeys) {
  if (hasRealEnglish(map)) return false;
  const hasAnySupportedLocale = localeKeys.some((locale) => cleanText(map?.[locale]));
  const hasCn = cleanText(map?.["zh-CN"]) || cleanText(map?.["zh-TW"]);
  const design = cleanText(map?.design);
  return Boolean(hasCn || design || hasAnySupportedLocale);
}

function scanFile(fileName, localeKeys, indexes, focusSet, maxExamples) {
  const data = readGenerated(fileName, null);
  if (!data) {
    return { fileName, missing: true, gaps: 0, byStatus: {}, examples: [], focus: [] };
  }

  const byStatus = {};
  const examples = [];
  const focus = [];
  let gaps = 0;

  for (const [entryKey, entry] of asEntries(data, fileName)) {
    if (!isRecord(entry)) continue;
    const maps = [];
    collectLocaleMaps(entry, localeKeys, maps);

    for (const { fieldPath, map } of maps) {
      if (!nameField(fieldPath) || !shouldReportGap(map, localeKeys)) continue;

      const id = entryId(entryKey, entry);
      const bridge = classifyBridge(indexes, fileName, entryKey, entry, id);
      const status = bridge.kind;
      const label = preferredLabel(map, String(id));
      const presentLocales = [...localeKeys, "design"].filter((locale) => cleanText(map?.[locale]));
      const row = {
        fileName,
        id,
        fieldPath,
        label,
        presentLocales,
        numericIds: numericIdsFromEntry(entry, entryKey),
        bridge,
      };

      gaps += 1;
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      const statusExamples = examples.filter((example) => example.bridge.kind === status).length;
      if (examples.length < maxExamples || statusExamples < Math.ceil(maxExamples / 5)) {
        examples.push(row);
      }

      if (row.numericIds.some((value) => focusSet.has(value))) {
        focus.push(row);
      }
    }
  }

  return {
    fileName,
    gaps,
    byStatus,
    examples: examples.slice(0, maxExamples),
    focus,
  };
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>")
    .slice(0, 240);
}

function bridgeSummary(bridge) {
  if (!bridge) return "";
  if (bridge.kind === "strong-source-name") {
    return `${bridge.source} ${bridge.sourceId}: ${bridge.names?.en ?? ""}`;
  }
  if (bridge.kind === "description-only") {
    return `${bridge.source}: ${bridge.description ?? ""}`;
  }
  if (bridge.kind === "observed-only") {
    return `${bridge.source} ${bridge.sourceId}: observed-only ${bridge.reportPolicy}`;
  }
  if (bridge.kind === "needs-source-localization") {
    return `${bridge.source} ${bridge.sourceId}: needs-source-localization`;
  }
  if (bridge.kind === "placeholder-source-name") {
    return `${bridge.source} ${bridge.sourceId}: placeholder`;
  }
  if (bridge.kind === "observed-alias-candidate") {
    return `${bridge.source}: alias candidate`;
  }
  return bridge.kind ?? "";
}

function makeMarkdown(report) {
  const lines = [];
  lines.push("# Runtime Localization Gaps");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Locales: ${report.locales.join(", ")}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| File | Name-like maps without English | Strong bridge | Needs localization | Description-only | Observed-only | Placeholder | No bridge |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const file of report.files) {
    lines.push([
      `\`${file.fileName}\``,
      formatCount(file.gaps),
      formatCount(file.byStatus["strong-source-name"]),
      formatCount(file.byStatus["needs-source-localization"]),
      formatCount(file.byStatus["description-only"]),
      formatCount(file.byStatus["observed-only"]),
      formatCount(file.byStatus["placeholder-source-name"]),
      formatCount(file.byStatus["no-bridge"]),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  lines.push("## Focus IDs");
  lines.push("");
  lines.push(`Focus IDs: ${report.focusIds.join(", ")}`);
  lines.push("");
  if (report.focus.length === 0) {
    lines.push("_No focus ID gaps found._");
  } else {
    lines.push("| File | ID | Field | Label | Bridge |");
    lines.push("| --- | ---: | --- | --- | --- |");
    for (const row of report.focus) {
      lines.push(`| \`${row.fileName}\` | ${row.id} | \`${row.fieldPath}\` | ${markdownCell(row.label)} | ${markdownCell(bridgeSummary(row.bridge))} |`);
    }
  }
  lines.push("");
  lines.push("## Examples");
  lines.push("");
  for (const file of report.files) {
    if (!file.examples.length) continue;
    lines.push(`### ${file.fileName}`);
    lines.push("");
    lines.push("| ID | Field | Label | Status | Bridge |");
    lines.push("| ---: | --- | --- | --- | --- |");
    for (const row of file.examples) {
      lines.push(`| ${row.id} | \`${row.fieldPath}\` | ${markdownCell(row.label)} | ${row.bridge.kind} | ${markdownCell(bridgeSummary(row.bridge))} |`);
    }
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("");
  lines.push("- This is a dev audit only; it does not promote inferred labels into runtime.");
  lines.push("- `strong-source-name` means another generated source table has a real English/source-localized name for the same UID bridge.");
  lines.push("- `description-only` means localized explanatory text exists, but it is not safe to treat it as the display name without a generator rule.");
  lines.push("- `observed-only` means runtime saw the buff/state but current generated tables do not prove a display label.");
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const manifest = readJson(path.join(localeRoot, "manifest.json"));
  const locales = manifest.locales ?? [];
  const focusSet = new Set(options.focusIds);
  const indexes = bridgeIndexes();
  const files = GENERATED_FILES.map((fileName) =>
    scanFile(fileName, locales, indexes, focusSet, options.maxExamples),
  );
  const focus = files.flatMap((file) => file.focus);

  const report = {
    generatedAt: new Date().toISOString(),
    generatedRoot: path.relative(repoRoot, generatedRoot),
    locales,
    focusIds: options.focusIds,
    files,
    focus,
  };

  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(options.outMd, makeMarkdown(report));

  const total = files.reduce((sum, file) => sum + file.gaps, 0);
  console.log(`Runtime localization gap audit written to ${path.relative(repoRoot, options.outMd)}`);
  console.log(`Runtime localization gap JSON written to ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Tracked ${formatCount(total)} name-like maps without English across ${files.length} generated files.`);
  console.log(`Focus ID hits: ${formatCount(focus.length)}`);
}

main();
