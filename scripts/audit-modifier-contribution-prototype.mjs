#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extractorOutput = path.resolve(repoRoot, "..", "BPSR-UID-Extractors", "output");

const DEFAULT_TIMELINE_JSON = path.join(repoRoot, "DEV_exports", "modifier-accuracy-audit-latest4-proof-status.json");
const DEFAULT_VALUE_TABLE = path.join(extractorOutput, "ModifierValueProofTable.json");
const DEFAULT_OUT_JSON = path.join(repoRoot, "DEV_exports", "modifier-contribution-prototype.json");
const DEFAULT_OUT_MD = path.join(repoRoot, "DEV_exports", "modifier-contribution-prototype.md");

const READY_STATUSES = new Set(["formula-replay-proofed"]);
const SUPPORTED_GROUPS = new Set([
  "allRoundDamage",
  "elementalDamage",
  "finalDamage",
  "genericDamage",
  "physicalMagicEnhancement",
  "seasonDamage",
  "skillCoefficient",
]);

const ATTR_SUMMARY_PRIORITY = [
  "AttackPower",
  "PhysicalAttack",
  "MagicAttack",
  "SeasonStrength",
  "DefensePower",
  "Level",
  "MonsterId",
  "PhysicalPenetration",
  "MagicPenetration",
  "PanelAgility",
  "PanelCritRate",
  "PanelHaste",
  "PanelMastery",
  "PanelVersatility",
  "PanelCritDamage",
];

function parseArgs(argv) {
  const options = {
    timelineJson: DEFAULT_TIMELINE_JSON,
    valueTable: DEFAULT_VALUE_TABLE,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
    maxRows: Number.POSITIVE_INFINITY,
    top: 40,
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
      case "--timeline-json":
        options.timelineJson = resolvePath(next());
        break;
      case "--value-table":
        options.valueTable = resolvePath(next());
        break;
      case "--out-json":
        options.outJson = resolvePath(next());
        break;
      case "--out-md":
        options.outMd = resolvePath(next());
        break;
      case "--max-rows":
        options.maxRows = Math.max(1, Number(next()) || 1);
        break;
      case "--top":
        options.top = Math.max(1, Number(next()) || options.top);
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
  console.log(`Modifier Contribution Prototype

Usage:
  node scripts/audit-modifier-contribution-prototype.mjs [options]

Options:
  --timeline-json <file>  Modifier accuracy audit JSON with proof_timeline rows.
  --value-table <file>    Generated ModifierValueProofTable JSON.
  --out-json <file>       Output JSON path.
  --out-md <file>         Output Markdown path.
  --max-rows <n>          Maximum timeline rows to inspect.
  --top <n>               Top rows in Markdown tables. Default: 40.
  --help                  Show this help.
`);
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushUnique(array, value) {
  if (value == null || value === "") return;
  if (!array.includes(value)) array.push(value);
}

function addMapValue(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function topGrouped(rows, keyFn, patchFn, maxRows = 40) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const existing = groups.get(key) ?? { key, rows: 0 };
    existing.rows += 1;
    patchFn(existing, row);
    groups.set(key, existing);
  }
  return [...groups.values()]
    .sort((a, b) => b.rows - a.rows || String(a.key).localeCompare(String(b.key)))
    .slice(0, maxRows);
}

function attrKey(attr) {
  return attr.attr_name || `attr:${attr.attr_id ?? "unknown"}`;
}

function attrSortIndex(attr) {
  const index = ATTR_SUMMARY_PRIORITY.indexOf(attr.attrName);
  return index === -1 ? ATTR_SUMMARY_PRIORITY.length : index;
}

function mergeAttrStat(target, attr) {
  const key = attrKey(attr);
  const samples = Number(attr.samples ?? 1) || 1;
  const min = Number(attr.min ?? attr.first ?? attr.last ?? attr.max ?? 0);
  const max = Number(attr.max ?? attr.first ?? attr.last ?? attr.min ?? 0);
  const first = Number(attr.first ?? min);
  const last = Number(attr.last ?? max);
  const existing = target[key] ?? {
    attrId: attr.attr_id,
    attrName: key,
    samples: 0,
    min,
    max,
    first,
    last,
  };
  existing.samples += samples;
  existing.min = Math.min(existing.min, min);
  existing.max = Math.max(existing.max, max);
  if (existing.samples === samples) existing.first = first;
  existing.last = last;
  target[key] = existing;
}

function mergeAttrStats(target, attrs) {
  for (const attr of asArray(attrs)) mergeAttrStat(target, attr);
}

function finalizeAttrStats(stats) {
  return Object.values(stats).sort(
    (a, b) => attrSortIndex(a) - attrSortIndex(b) || String(a.attrName).localeCompare(String(b.attrName)),
  );
}

function sourceRuleIds(entry) {
  const ids = [];
  for (const id of asArray(entry.sourceRuleIds)) pushUnique(ids, id);
  for (const id of asArray(entry.directSourceRuleIds)) pushUnique(ids, id);
  for (const value of asArray(entry.selectedValues)) pushUnique(ids, value.sourceRuleId);
  for (const component of asArray(entry.components)) pushUnique(ids, component.sourceRuleId);
  return ids;
}

function buildValueIndex(valueTable) {
  const byRuleId = new Map();
  for (const entry of Object.values(valueTable.entriesByKey ?? {})) {
    for (const sourceRuleId of sourceRuleIds(entry)) {
      if (!sourceRuleId) continue;
      if (!byRuleId.has(sourceRuleId)) byRuleId.set(sourceRuleId, []);
      byRuleId.get(sourceRuleId).push(entry);
    }
  }
  return { byRuleId };
}

function selectedValuesForEffect(effect, valueIndex) {
  const values = [];
  const seen = new Set();
  for (const entry of asArray(valueIndex.byRuleId.get(effect.source_id))) {
    for (const selected of asArray(entry.selectedValues)) {
      const key = [
        entry.key,
        selected.sourceRuleId ?? effect.source_id,
        selected.componentKey,
        selected.scope,
        selected.rawText,
        selected.decimalValue,
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      values.push({
        sourceRuleId: selected.sourceRuleId ?? effect.source_id,
        entryKey: entry.key,
        sourceLabel: entry.sourceLabel ?? effect.source_label,
        sourceKind: effect.source_kind,
        sourceType: effect.source_type,
        componentKey: selected.componentKey,
        effectClass: selected.effectClass,
        formulaTermIds: asArray(selected.formulaTermIds),
        contributionGroups: asArray(selected.contributionGroups),
        value: selected.value,
        decimalValue: selected.decimalValue,
        unit: selected.unit,
        scope: selected.scope,
        rawText: selected.rawText,
        sourceText: selected.sourceText,
      });
    }
  }
  return values;
}

function contributionGroupForValue(value) {
  for (const group of asArray(value.contributionGroups)) {
    if (SUPPORTED_GROUPS.has(group)) return group;
  }
  const componentToGroup = {
    "all-round-damage": "allRoundDamage",
    "element-damage": "elementalDamage",
    "elemental-damage": "elementalDamage",
    "final-damage": "finalDamage",
    "generic-damage": "genericDamage",
    "physical-magic-enhancement": "physicalMagicEnhancement",
    "season-damage": "seasonDamage",
    "skill-multiplier": "skillCoefficient",
  };
  return componentToGroup[value.componentKey] ?? null;
}

function unsupportedReason(value) {
  if (value.unit !== "percent") return `unsupported-unit:${value.unit ?? "unknown"}`;
  if (!Number.isFinite(Number(value.decimalValue))) return "missing-decimal-value";
  if (Number(value.decimalValue) === 0) return "zero-value";
  if (!contributionGroupForValue(value)) return "unsupported-contribution-group";
  return null;
}

function damageValue(row) {
  const effective = Number(row.effective_value ?? 0);
  if (effective > 0) return effective;
  return Number(row.total_value ?? 0);
}

function rowKey(row, effect, value, group) {
  return [
    row.encounter_id,
    row.player_uid,
    effect.source_id,
    value.entryKey,
    value.componentKey,
    group,
  ].join("|");
}

function accumulateRollup(map, key, patch) {
  const existing = map.get(key) ?? {
    encounterIds: [],
    playerUids: [],
    playerNames: [],
    sourceId: patch.sourceId,
    sourceLabel: patch.sourceLabel,
    sourceKind: patch.sourceKind,
    entryKey: patch.entryKey,
    componentKey: patch.componentKey,
    contributionGroup: patch.contributionGroup,
    decimalValue: patch.decimalValue,
    rawText: patch.rawText,
    hits: 0,
    bins: 0,
    activeDamage: 0,
    estimatedContribution: 0,
  };
  pushUnique(existing.encounterIds, patch.encounterId);
  pushUnique(existing.playerUids, patch.playerUid);
  pushUnique(existing.playerNames, patch.playerName);
  existing.hits += patch.hits;
  existing.bins += 1;
  existing.activeDamage += patch.activeDamage;
  existing.estimatedContribution += patch.estimatedContribution;
  map.set(key, existing);
}

function flatInputKey(effect, value, reason) {
  return [reason, effect.source_id, value.entryKey, value.componentKey, value.rawText].join("|");
}

function accumulateFlatTermInput(map, key, patch) {
  const existing = map.get(key) ?? {
    reason: patch.reason,
    blocker: "flat-base-term-conversion-model-required",
    encounterIds: [],
    playerUids: [],
    playerNames: [],
    sourceId: patch.sourceId,
    sourceLabel: patch.sourceLabel,
    sourceKind: patch.sourceKind,
    entryKey: patch.entryKey,
    componentKey: patch.componentKey,
    unit: patch.unit,
    rawText: patch.rawText,
    rows: 0,
    hits: 0,
    activeDamage: 0,
    attackerAttrs: {},
    targetAttrs: {},
  };
  existing.rows += 1;
  existing.hits += patch.hits;
  existing.activeDamage += patch.activeDamage;
  pushUnique(existing.encounterIds, patch.encounterId);
  pushUnique(existing.playerUids, patch.playerUid);
  pushUnique(existing.playerNames, patch.playerName);
  mergeAttrStats(existing.attackerAttrs, patch.attackerAttrs);
  mergeAttrStats(existing.targetAttrs, patch.targetAttrs);
  map.set(key, existing);
}

function estimateRows(timelineRows, valueIndex, options) {
  const rollups = new Map();
  const unsupported = [];
  const flatTermInputs = new Map();
  const rowSummaries = [];
  let activeEffectsSeen = 0;
  let readyEffectsSeen = 0;
  let valueLinksSeen = 0;
  let supportedValueLinks = 0;

  for (const row of timelineRows.slice(0, options.maxRows)) {
    const rowDamage = damageValue(row);
    if (!(rowDamage > 0)) continue;
    const rowValues = [];

    for (const effect of asArray(row.active_effects)) {
      activeEffectsSeen += 1;
      if (!READY_STATUSES.has(effect.proof_status)) continue;
      readyEffectsSeen += 1;
      for (const value of selectedValuesForEffect(effect, valueIndex)) {
        valueLinksSeen += 1;
        const reason = unsupportedReason(value);
        if (reason) {
          const hits = Number(effect.hits ?? row.hits ?? 0);
          unsupported.push({
            reason,
            encounterId: row.encounter_id,
            playerUid: row.player_uid,
            playerName: row.player_name,
            sourceId: effect.source_id,
            sourceLabel: effect.source_label,
            sourceKind: effect.source_kind,
            entryKey: value.entryKey,
            componentKey: value.componentKey,
            unit: value.unit,
            rawText: value.rawText,
            hits,
            activeDamage: rowDamage,
          });
          if (reason.startsWith("unsupported-unit:flat")) {
            accumulateFlatTermInput(flatTermInputs, flatInputKey(effect, value, reason), {
              reason,
              encounterId: row.encounter_id,
              playerUid: row.player_uid,
              playerName: row.player_name,
              sourceId: effect.source_id,
              sourceLabel: effect.source_label,
              sourceKind: effect.source_kind,
              entryKey: value.entryKey,
              componentKey: value.componentKey,
              unit: value.unit,
              rawText: value.rawText,
              hits,
              activeDamage: rowDamage,
              attackerAttrs: row.attacker_attrs,
              targetAttrs: row.target_attrs,
            });
          }
          continue;
        }
        const group = contributionGroupForValue(value);
        rowValues.push({ effect, value, group, decimalValue: Number(value.decimalValue) });
        supportedValueLinks += 1;
      }
    }

    if (!rowValues.length) continue;

    const groupTotals = new Map();
    for (const item of rowValues) addMapValue(groupTotals, item.group, item.decimalValue);

    let rowEstimated = 0;
    for (const item of rowValues) {
      const groupTotal = groupTotals.get(item.group) ?? 0;
      const denominator = 1 + groupTotal;
      if (!(denominator > 0)) continue;
      const estimatedContribution = rowDamage * (item.decimalValue / denominator);
      rowEstimated += estimatedContribution;
      accumulateRollup(rollups, rowKey(row, item.effect, item.value, item.group), {
        encounterId: row.encounter_id,
        playerUid: row.player_uid,
        playerName: row.player_name,
        sourceId: item.effect.source_id,
        sourceLabel: item.effect.source_label,
        sourceKind: item.effect.source_kind,
        entryKey: item.value.entryKey,
        componentKey: item.value.componentKey,
        contributionGroup: item.group,
        decimalValue: item.decimalValue,
        rawText: item.value.rawText,
        hits: Number(item.effect.hits ?? row.hits ?? 0),
        activeDamage: rowDamage,
        estimatedContribution,
      });
    }

    rowSummaries.push({
      encounterId: row.encounter_id,
      playerUid: row.player_uid,
      playerName: row.player_name,
      skillKey: row.skill_key,
      skillLabel: row.skill_label,
      damageId: row.damage_id,
      hits: row.hits,
      activeDamage: rowDamage,
      activeValueLinks: rowValues.length,
      estimatedContribution: rowEstimated,
      activeGroups: Object.fromEntries(groupTotals),
    });
  }

  return {
    activeEffectsSeen,
    readyEffectsSeen,
    valueLinksSeen,
    supportedValueLinks,
    rollups: [...rollups.values()].sort((a, b) => b.estimatedContribution - a.estimatedContribution),
    unsupported,
    flatTermInputs: [...flatTermInputs.values()]
      .map((row) => ({
        ...row,
        attackerAttrs: finalizeAttrStats(row.attackerAttrs),
        targetAttrs: finalizeAttrStats(row.targetAttrs),
      }))
      .sort((a, b) => b.rows - a.rows || b.activeDamage - a.activeDamage || String(a.sourceLabel).localeCompare(String(b.sourceLabel))),
    rowSummaries,
  };
}

function formatNumber(value) {
  return Math.round(Number(value ?? 0)).toLocaleString("en-US");
}

function formatAttrValue(attr) {
  const min = Number(attr.min ?? 0);
  const max = Number(attr.max ?? min);
  const value = min === max ? formatNumber(min) : `${formatNumber(min)}-${formatNumber(max)}`;
  return `${attr.attrName}=${value}`;
}

function formatAttrSummary(attrs, maxRows = 8) {
  const rows = asArray(attrs).slice(0, maxRows).map(formatAttrValue);
  return rows.length ? rows.join("; ") : "-";
}

function escapeMd(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(escapeMd).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeMd).join(" | ")} |`),
  ].join("\n");
}

function buildMarkdown(report, options) {
  const lines = [
    "# Modifier Contribution Prototype",
    "",
    "- Dev-audit report only.",
    "- Uses only formula-replay-proofed active effects from the audit proof timeline.",
    "- Uses generated percent values from ModifierValueProofTable.",
    "- Estimate model: for each additive formula bucket, contribution = observed damage * value / (1 + active bucket sum).",
    "- This is provisional and does not modify parser, DPS totals, worker, monitor, overlay, hotkeys, runtime capture, or shipped modifier UI paths.",
    "",
    "## Summary",
    "",
    `- Timeline rows available: ${report.summary.timelineRowsAvailable}`,
    `- Timeline rows truncated upstream: ${report.summary.timelineRowsTruncated}`,
    `- Timeline rows with supported value links: ${report.summary.timelineRowsWithContributions}`,
    `- Ready effects seen: ${report.summary.readyEffectsSeen}`,
    `- Supported value links: ${report.summary.supportedValueLinks}`,
    `- Estimated contribution total: ${formatNumber(report.summary.estimatedContributionTotal)}`,
    "",
    "### By Contribution Group",
    "",
    markdownTable(
      ["Group", "Estimated Contribution", "Rows"],
      Object.entries(report.summary.byContributionGroup).map(([group, row]) => [
        group,
        formatNumber(row.estimatedContribution),
        row.rows,
      ]),
    ),
    "",
    "## Top Source Estimates",
    "",
    markdownTable(
      ["Source", "Kind", "Group", "Value", "Hits", "Active Damage", "Estimated Contribution"],
      report.rollups.slice(0, options.top).map((row) => [
        row.sourceLabel,
        row.sourceKind,
        row.contributionGroup,
        row.rawText,
        row.hits,
        formatNumber(row.activeDamage),
        formatNumber(row.estimatedContribution),
      ]),
    ),
    "",
    "## Unsupported Value Links",
    "",
    markdownTable(
      ["Reason", "Rows"],
      Object.entries(report.summary.unsupportedReasons).map(([reason, rows]) => [reason, rows]),
    ),
    "",
    "### Top Unsupported Components",
    "",
    markdownTable(
      ["Reason", "Component", "Rows", "Example Source", "Example Value"],
      report.summary.unsupportedByComponent.map((row) => [
        row.reason,
        row.componentKey,
        row.rows,
        row.exampleSourceLabel,
        row.exampleRawText,
      ]),
    ),
    "",
    "### Flat Term Conversion Inputs",
    "",
    markdownTable(
      ["Source", "Component", "Flat Value", "Rows", "Hits", "Active Damage", "Attacker Attrs", "Target Attrs", "Blocker"],
      report.flatTermInputs.slice(0, options.top).map((row) => [
        row.sourceLabel,
        row.componentKey,
        row.rawText,
        row.rows,
        row.hits,
        formatNumber(row.activeDamage),
        formatAttrSummary(row.attackerAttrs),
        formatAttrSummary(row.targetAttrs),
        row.blocker,
      ]),
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildReport(options) {
  const timelineReport = readJson(options.timelineJson);
  const valueTable = readJson(options.valueTable);
  const valueIndex = buildValueIndex(valueTable);
  const timelineRows = asArray(timelineReport.proof_timeline);
  const estimates = estimateRows(timelineRows, valueIndex, options);
  const estimatedContributionTotal = estimates.rollups.reduce((sum, row) => sum + row.estimatedContribution, 0);
  const byContributionGroup = {};
  for (const row of estimates.rollups) {
    byContributionGroup[row.contributionGroup] ??= { rows: 0, estimatedContribution: 0 };
    byContributionGroup[row.contributionGroup].rows += 1;
    byContributionGroup[row.contributionGroup].estimatedContribution += row.estimatedContribution;
  }

  return {
    generatedAt: new Date().toISOString(),
    inputPaths: {
      timelineJson: path.relative(repoRoot, options.timelineJson),
      valueTable: path.relative(repoRoot, options.valueTable),
    },
    boundaries: [
      "Dev-audit report only.",
      "Uses only formula-replay-proofed active effects from the audit proof timeline.",
      "Uses generated percent values from ModifierValueProofTable.",
      "Estimate model: for each additive formula bucket, contribution = observed damage * value / (1 + active bucket sum).",
      "Does not modify parser, DPS totals, worker, monitor, overlay, hotkeys, runtime capture, or shipped modifier UI paths.",
    ],
    summary: {
      timelineRowsAvailable: timelineRows.length,
      timelineRowsTruncated: timelineReport.totals?.proof_timeline_rows_truncated ?? 0,
      activeEffectsSeen: estimates.activeEffectsSeen,
      readyEffectsSeen: estimates.readyEffectsSeen,
      valueLinksSeen: estimates.valueLinksSeen,
      supportedValueLinks: estimates.supportedValueLinks,
      timelineRowsWithContributions: estimates.rowSummaries.length,
      estimatedContributionTotal,
      byContributionGroup,
      unsupportedReasons: countBy(estimates.unsupported, (row) => row.reason),
      unsupportedByComponent: topGrouped(
        estimates.unsupported,
        (row) => `${row.reason}|${row.componentKey}`,
        (group, row) => {
          group.reason = row.reason;
          group.componentKey = row.componentKey;
          group.exampleSourceLabel ??= row.sourceLabel;
          group.exampleRawText ??= row.rawText;
        },
      ),
      unsupportedBySource: topGrouped(
        estimates.unsupported,
        (row) => `${row.reason}|${row.sourceLabel}|${row.componentKey}|${row.rawText}`,
        (group, row) => {
          group.reason = row.reason;
          group.sourceLabel = row.sourceLabel;
          group.sourceKind = row.sourceKind;
          group.componentKey = row.componentKey;
          group.rawText = row.rawText;
        },
      ),
      flatTermInputGroups: estimates.flatTermInputs.length,
      flatTermInputRows: estimates.flatTermInputs.reduce((sum, row) => sum + row.rows, 0),
    },
    rollups: estimates.rollups,
    rowSummaries: estimates.rowSummaries,
    unsupported: estimates.unsupported,
    flatTermInputs: estimates.flatTermInputs,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = buildReport(options);
  writeJson(options.outJson, report);
  writeText(options.outMd, buildMarkdown(report, options));

  console.log(`Timeline rows with contributions: ${report.summary.timelineRowsWithContributions}`);
  console.log(`Supported value links: ${report.summary.supportedValueLinks}`);
  console.log(`Estimated contribution total: ${Math.round(report.summary.estimatedContributionTotal)}`);
  console.log(JSON.stringify(report.summary.byContributionGroup, null, 2));
  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
}

main();
