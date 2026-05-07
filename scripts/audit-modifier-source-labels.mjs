#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const options = {
    sourceReport: path.join(repoRoot, "DEV_exports", "modifier-uptime-skill-activity.json"),
    outJson: path.join(repoRoot, "DEV_exports", "modifier-source-label-audit.json"),
    outMd: path.join(repoRoot, "DEV_exports", "modifier-source-label-audit.md"),
    maxRows: 80,
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
      case "--source-report":
        options.sourceReport = path.resolve(next());
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--max-rows":
        options.maxRows = Number(next());
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
  console.log(`Modifier Source Label Audit - explain active-buff fallbacks and duplicate parent rows.

Usage:
  node scripts/audit-modifier-source-labels.mjs [options]

Options:
  --source-report <file>  Modifier uptime JSON report. Default: DEV_exports/modifier-uptime-skill-activity.json
  --out-json <file>      Output JSON path. Default: DEV_exports/modifier-source-label-audit.json
  --out-md <file>        Output Markdown path. Default: DEV_exports/modifier-source-label-audit.md
  --max-rows <count>     Max duplicate rows in Markdown. Default: 80
  --help                 Show this help.
`);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGenerated(fileName, fallback = null) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName), fallback);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sortedNumbers(values) {
  return [...new Set(values.map(finiteNumber).filter((value) => value !== null))]
    .sort((left, right) => left - right);
}

function sortedStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function namesFromBuffEntry(entry) {
  const names = {};
  if (entry?.Names && typeof entry.Names === "object" && !Array.isArray(entry.Names)) {
    for (const [locale, value] of Object.entries(entry.Names)) {
      if (typeof value === "string" && value.trim()) {
        names[locale] = value.trim();
      }
    }
  }
  for (const [locale, value] of [
    ["design", entry?.NameDesign],
    ["design", entry?.DesignName],
    ["und", entry?.Name],
  ]) {
    if (typeof value === "string" && value.trim() && !names[locale]) {
      names[locale] = value.trim();
    }
  }
  return names;
}

function preferredName(names, fallback = "") {
  for (const locale of ["en", "zh-CN", "zh-TW", "ja", "ko-KR", "design", "und"]) {
    const value = names?.[locale]?.trim();
    if (value) return value;
  }
  for (const value of Object.values(names ?? {})) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function collectRows(report) {
  return [
    ...asArray(report?.sourceUptime),
    ...asArray(report?.skillActivity),
  ];
}

function collectActiveBuffIds(report) {
  const ids = [];
  for (const row of collectRows(report)) {
    const sourceMatch = String(row?.sourceId ?? "").match(/^active-buff:(-?\d+)$/);
    if (sourceMatch) ids.push(Number(sourceMatch[1]));

    const nameMatch = String(row?.sourceName ?? "").match(/^Active Buff (-?\d+)$/i);
    if (nameMatch) ids.push(Number(nameMatch[1]));
  }
  return sortedNumbers(ids);
}

function collectDuplicateSourceGroups(report) {
  const groups = new Map();
  for (const row of asArray(report?.sourceUptime)) {
    const name = String(row?.sourceName ?? "").trim();
    if (!name) continue;

    const key = [
      normalizeKey(name),
      normalizeKey(row?.sourceKind),
      normalizeKey(row?.sourceType),
    ].join("|");
    const group = groups.get(key) ?? {
      sourceName: name,
      sourceKind: row?.sourceKind ?? "",
      sourceType: row?.sourceType ?? "",
      sourceIds: new Set(),
      buffIds: new Set(),
      evidence: new Set(),
      files: new Set(),
    };
    if (row?.sourceId) group.sourceIds.add(String(row.sourceId));
    for (const buffId of asArray(row?.buffIds).map(finiteNumber).filter((value) => value !== null)) {
      group.buffIds.add(buffId);
    }
    for (const evidence of asArray(row?.evidence)) group.evidence.add(String(evidence));
    for (const file of asArray(row?.files)) group.files.add(String(file));
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.sourceIds.size > 1)
    .map((group) => ({
      sourceName: group.sourceName,
      sourceKind: group.sourceKind,
      sourceType: group.sourceType,
      sourceIds: sortedStrings([...group.sourceIds]),
      buffIds: sortedNumbers([...group.buffIds]),
      evidence: sortedStrings([...group.evidence]),
      fileCount: group.files.size,
    }))
    .sort((left, right) =>
      right.sourceIds.length - left.sourceIds.length
      || left.sourceName.localeCompare(right.sourceName),
    );
}

function collectIndexHits(buffIds) {
  const files = [
    path.join(repoRoot, "DEV_exports", "game-whole-index-leads.csv"),
    path.join(repoRoot, "DEV_exports", "game-whole-index-package-entries.csv"),
  ].filter((filePath) => fs.existsSync(filePath));

  const hits = new Map(buffIds.map((buffId) => [buffId, []]));
  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      for (const buffId of buffIds) {
        if (line.includes(String(buffId))) {
          const list = hits.get(buffId) ?? [];
          if (list.length < 8) {
            list.push({
              file: path.relative(repoRoot, filePath),
              line: line.slice(0, 240),
            });
          }
          hits.set(buffId, list);
        }
      }
    }
  }
  return hits;
}

function classifyBuff({ buffId, buffEntry, effectSourceIds, factor }) {
  if (buffId <= 0) return "invalid-runtime-buff-id";
  if (effectSourceIds.length > 0) return "effect-source-bridged";
  if (factor) return "season-phantom-factor";
  if (buffEntry) {
    const names = namesFromBuffEntry(buffEntry);
    return names.en ? "bufftable-localized-missing-effect-source-bridge" : "bufftable-design-only-missing-effect-source-bridge";
  }
  return "runtime-only-unmapped";
}

function buildAudit(options) {
  const report = readJson(options.sourceReport, {});
  const buffNameData = readGenerated("BuffName.json", []);
  const effectSources = readGenerated("EffectSources.json", {});
  const seasonFactors = readGenerated("SeasonPhantomFactors.json", {});
  const buffEntries = new Map(asArray(buffNameData).map((entry) => [Number(entry.Id), entry]));
  const activeBuffIds = collectActiveBuffIds(report);
  const indexHits = collectIndexHits(activeBuffIds);

  const activeBuffs = activeBuffIds.map((buffId) => {
    const buffEntry = buffEntries.get(buffId) ?? null;
    const names = namesFromBuffEntry(buffEntry);
    const effectSourceIds = asArray(effectSources?.buffIdToEffectSourceIds?.[String(buffId)])
      .map(String)
      .filter(Boolean);
    const factor = seasonFactors?.factorsByBuffId?.[String(buffId)] ?? null;
    return {
      buffId,
      reportedNames: sortedStrings(
        collectRows(report)
          .filter((row) => String(row?.sourceId ?? "") === `active-buff:${buffId}` || String(row?.sourceName ?? "") === `Active Buff ${buffId}`)
          .map((row) => row?.sourceName),
      ),
      preferredName: preferredName(names, buffEntry ? `#${buffId}` : `Active Buff ${buffId}`),
      names,
      buffNameTable: buffEntry
        ? {
            id: buffEntry.Id,
            level: buffEntry.Level ?? null,
            nameId: buffEntry.NameId ?? null,
            sourceOffset: buffEntry.SourceOffset ?? null,
            nameSourceOffset: buffEntry.NameSourceOffset ?? null,
            iconPath: buffEntry.IconPath ?? buffEntry.Icon ?? null,
            spriteFile: buffEntry.SpriteFile ?? null,
          }
        : null,
      effectSourceIds,
      factor: factor
        ? {
            buffId: factor.buffId,
            familyId: factor.familyId ?? null,
            familyName: factor.familyName ?? null,
          }
        : null,
      gameWholeIndexHits: indexHits.get(buffId) ?? [],
      classification: classifyBuff({ buffId, buffEntry, effectSourceIds, factor }),
    };
  });

  const duplicateSourceGroups = collectDuplicateSourceGroups(report);
  return {
    summary: {
      sourceReport: path.relative(repoRoot, options.sourceReport),
      activeBuffFallbackCount: activeBuffs.length,
      duplicateSourceGroupCount: duplicateSourceGroups.length,
      generatedData: {
        buffNameRows: buffEntries.size,
        effectSources: Object.keys(effectSources?.effectSourcesById ?? {}).length,
        seasonFactors: Object.keys(seasonFactors?.factorsByBuffId ?? {}).length,
      },
    },
    activeBuffs,
    duplicateSourceGroups,
  };
}

function tableRow(values) {
  return `| ${values.map((value) => String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|")).join(" | ")} |`;
}

function writeMarkdown(audit, options) {
  const lines = [
    "# Modifier Source Label Audit",
    "",
    `Source report: \`${audit.summary.sourceReport}\``,
    "",
    "## Active Buff Fallbacks",
    "",
  ];

  if (audit.activeBuffs.length === 0) {
    lines.push("No active-buff fallback rows were found in the source report.", "");
  } else {
    lines.push(tableRow(["Buff ID", "Resolved name", "Classification", "Effect bridge", "Factor", "BuffName proof"]));
    lines.push(tableRow(["---", "---", "---", "---", "---", "---"]));
    for (const row of audit.activeBuffs) {
      const bridge = row.effectSourceIds.length ? row.effectSourceIds.join(", ") : "none";
      const factor = row.factor ? `family #${row.factor.familyId ?? "?"}` : "none";
      const proof = row.buffNameTable
        ? `BuffName row, source offset ${row.buffNameTable.sourceOffset ?? "?"}`
        : "none";
      lines.push(tableRow([row.buffId, row.preferredName, row.classification, bridge, factor, proof]));
    }
    lines.push("");
  }

  lines.push("## Duplicate Source Names");
  lines.push("");
  if (audit.duplicateSourceGroups.length === 0) {
    lines.push("No duplicate source-name groups were found in the source report.", "");
  } else {
    lines.push(tableRow(["Source name", "Kind", "Type", "Source IDs", "Buff IDs", "Files"]));
    lines.push(tableRow(["---", "---", "---", "---", "---", "---"]));
    for (const row of audit.duplicateSourceGroups.slice(0, options.maxRows)) {
      lines.push(tableRow([
        row.sourceName,
        row.sourceKind,
        row.sourceType,
        row.sourceIds.join(", "),
        row.buffIds.join(", "),
        row.fileCount,
      ]));
    }
    lines.push("");
  }

  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outMd, `${lines.join("\n")}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const audit = buildAudit(options);
  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.writeFileSync(options.outJson, `${JSON.stringify(audit, null, 2)}\n`);
  writeMarkdown(audit, options);
  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
}

main();
