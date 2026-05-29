import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const DEFAULT_TIER_PROOF = "DEV_exports/modifier-tier-proof-audit.json";
const DEFAULT_SOURCE_INDEX = "parser-data/generated/ModifierSourceIndex.json";
const DEFAULT_AOYI_ICONS = "parser-data/generated/skill_aoyi_icons.json";
const DEFAULT_CURRENT_VDATA = [
  "DEV_exports/factor-vdata-current.json",
  "DEV_exports/factor-vdata-current-fresh-factors.json",
  "DEV_exports/factor-vdata-current-equipment.json",
];
const DEFAULT_OUT_JSON = "DEV_exports/battle-imagine-tier-source-bridge-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/battle-imagine-tier-source-bridge-audit.md";

function usage() {
  return `Usage: node scripts/audit-battle-imagine-tier-source-bridge.mjs [options]

Options:
  --tier-proof <path>     Modifier tier proof audit. Default: ${DEFAULT_TIER_PROOF}
  --source-index <path>   Modifier source index. Default: ${DEFAULT_SOURCE_INDEX}
  --current-vdata <path>  Current VData probe. Repeatable. Defaults to known current probes.
  --max-rows <count>      Max rows in markdown. Default: 80
  --out-json <path>       JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>         Markdown report path. Default: ${DEFAULT_OUT_MD}
`;
}

function parseArgs(argv) {
  const args = {
    tierProof: DEFAULT_TIER_PROOF,
    sourceIndex: DEFAULT_SOURCE_INDEX,
    currentVdata: [],
    maxRows: 80,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--tier-proof") {
      args.tierProof = next();
    } else if (arg === "--source-index") {
      args.sourceIndex = next();
    } else if (arg === "--current-vdata") {
      args.currentVdata.push(next());
    } else if (arg === "--max-rows") {
      args.maxRows = Number(next());
    } else if (arg === "--out-json") {
      args.outJson = next();
    } else if (arg === "--out-md") {
      args.outMd = next();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.currentVdata.length === 0) args.currentVdata = [...DEFAULT_CURRENT_VDATA];
  return args;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!fs.existsSync(resolved)) return fallback;
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, value, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function maybeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstName(names) {
  if (!names || typeof names !== "object") return "";
  return String(names.en || names["zh-CN"] || names.design || Object.values(names)[0] || "").trim();
}

function compactName(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function rel(filePath) {
  return path.relative(repoRoot, resolveRepoPath(filePath)).replaceAll("\\", "/");
}

function uniqueBy(values, keyFn) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function fieldValues(groups, key) {
  const rows = asArray(groups).filter((entry) => entry?.key === key);
  const values = [];
  for (const row of rows) {
    for (const value of asArray(row.values)) {
      const id = positiveNumber(value?.key);
      if (id === null) continue;
      values.push({ id, count: maybeNumber(value.count) ?? 0 });
    }
  }
  return values.sort((left, right) => right.count - left.count || left.id - right.id);
}

function sourceConfigValues(row) {
  const values = [
    ...fieldValues(row.ids, "modifierSourceConfigId"),
    ...fieldValues(row.ids, "sourceConfigId"),
    ...fieldValues(row.fields, "modifierSourceConfigId"),
    ...fieldValues(row.fields, "sourceConfigId"),
  ];
  return uniqueBy(values, (value) => value.id).sort((left, right) => right.count - left.count || left.id - right.id);
}

function buildAoyiNameIndex(filePath) {
  const rows = readJson(filePath, []);
  const byId = new Map();
  for (const row of asArray(rows)) {
    const id = positiveNumber(row.Id ?? row.id);
    if (id === null) continue;
    byId.set(id, {
      skillId: id,
      skillName: compactName(firstName(row.Names), `Skill ${id}`),
      imagineName: compactName(firstName(row.MonsterNames), ""),
      technicalName: compactName(row.Name, ""),
    });
  }
  return byId;
}

function summarizeSourceEntry(entry) {
  return {
    sourceId: entry?.sourceId ?? null,
    sourceKind: entry?.sourceKind ?? null,
    sourceType: entry?.sourceType ?? null,
    sourceEntityId: positiveNumber(entry?.sourceEntityId),
    sourceName: compactName(entry?.sourceName ?? firstName(entry?.sourceNames), ""),
    runtimeDetection: entry?.runtimeDetection ?? null,
    reportPolicy: entry?.reportPolicy ?? null,
    rowPolicy: entry?.rowPolicy ?? null,
    contributionStatus: entry?.contributionStatus ?? null,
    buffIds: asArray(entry?.buffIds).map(positiveNumber).filter((id) => id !== null),
    relationshipKinds: asArray(entry?.relationshipKinds),
  };
}

function buildSourceIndex(filePath) {
  const sourceIndex = readJson(filePath, {});
  const byId = new Map();
  const add = (id, entry) => {
    const key = positiveNumber(id);
    if (key === null) return;
    const rows = byId.get(key) ?? [];
    rows.push(summarizeSourceEntry(entry));
    byId.set(key, rows);
  };

  for (const [buffId, entries] of Object.entries(sourceIndex.byBuffId ?? {})) {
    for (const entry of asArray(entries)) {
      add(buffId, entry);
      add(entry?.sourceEntityId, entry);
      for (const id of asArray(entry?.buffIds)) add(id, entry);
      for (const edge of asArray(entry?.edges)) add(edge?.uid, entry);
    }
  }

  for (const [id, rows] of byId.entries()) {
    byId.set(id, uniqueBy(rows, (row) => [
      row.sourceId,
      row.sourceKind,
      row.sourceType,
      row.sourceEntityId,
      row.sourceName,
    ].join("|")));
  }

  return byId;
}

function normalizeProfessionSkill(row, source, nameIndex, playerId = null) {
  const skillId = positiveNumber(row?.skill_id ?? row?.skillId);
  if (skillId === null) return null;
  const baseSkillId = positiveNumber(row?.base_skill_id ?? row?.baseSkillId);
  const skillLevelId = positiveNumber(row?.skill_level_id ?? row?.skillLevelId);
  const replaceSkillIds = asArray(row?.replace_skill_ids ?? row?.replaceSkillIds)
    .map(positiveNumber)
    .filter((id) => id !== null);
  const nameRow = nameIndex.get(skillId) ?? nameIndex.get(baseSkillId);
  return {
    source,
    playerId,
    skillId,
    baseSkillId,
    skillLevelId,
    level: maybeNumber(row?.level),
    remodelLevel: maybeNumber(row?.remodel_level ?? row?.remodelLevel),
    slot: maybeNumber(row?.slot),
    equipped: typeof row?.equipped === "boolean" ? row.equipped : null,
    sourceKind: String(row?.source_kind ?? row?.sourceKind ?? ""),
    replaceSkillIds,
    skillName: nameRow?.skillName ?? `Skill ${skillId}`,
    imagineName: nameRow?.imagineName ?? "",
  };
}

function buildCurrentVdataIndex(filePaths, nameIndex) {
  const byId = new Map();
  const reports = [];
  const add = (id, row) => {
    const key = positiveNumber(id);
    if (key === null) return;
    const rows = byId.get(key) ?? [];
    rows.push(row);
    byId.set(key, rows);
  };

  for (const filePath of filePaths) {
    const report = readJson(filePath, null);
    if (!report) continue;
    const source = rel(filePath);
    const playerId = positiveNumber(report.player_id ?? report.playerId);
    const section = report.profession_skills ?? report.professionSkills ?? {};
    const rawRows = [
      ...asArray(section.profession_skills ?? section.professionSkills),
      ...asArray(section.battle_imagine_skills ?? section.battleImagineSkills),
    ];
    const rows = rawRows
      .map((row) => normalizeProfessionSkill(row, source, nameIndex, playerId))
      .filter(Boolean);
    reports.push({ source, playerId, rows: rows.length });
    for (const row of rows) {
      add(row.skillId, row);
      add(row.baseSkillId, row);
      add(row.skillLevelId, row);
      for (const id of row.replaceSkillIds) add(id, row);
    }
  }

  for (const [id, rows] of byId.entries()) {
    byId.set(id, uniqueBy(rows, (row) => [
      row.source,
      row.playerId,
      row.skillId,
      row.baseSkillId,
      row.skillLevelId,
      row.remodelLevel,
    ].join("|")));
  }

  return { byId, reports };
}

function buildEncounterProfessionIndex(inputFiles, nameIndex) {
  const byId = new Map();
  const scanned = [];
  const add = (id, row) => {
    const key = positiveNumber(id);
    if (key === null) return;
    const rows = byId.get(key) ?? [];
    rows.push(row);
    byId.set(key, rows);
  };

  for (const filePath of inputFiles) {
    const report = readJson(filePath, null);
    if (!report) continue;
    const rows = asArray(report.activeProfessionSkills ?? report.active_profession_skills)
      .map((row) => normalizeProfessionSkill(row, rel(filePath), nameIndex, positiveNumber(report.uid)))
      .filter(Boolean);
    scanned.push({ source: rel(filePath), rows: rows.length });
    for (const row of rows) {
      add(row.skillId, row);
      add(row.baseSkillId, row);
      add(row.skillLevelId, row);
      for (const id of row.replaceSkillIds) add(id, row);
    }
  }

  for (const [id, rows] of byId.entries()) {
    byId.set(id, uniqueBy(rows, (row) => [
      row.source,
      row.playerId,
      row.skillId,
      row.baseSkillId,
      row.skillLevelId,
      row.remodelLevel,
    ].join("|")));
  }

  return { byId, scanned };
}

function selectedCandidateValues(row, remodelLevel) {
  const level = maybeNumber(remodelLevel);
  if (level === null) return { baseValues: [], tierValues: [], summedValues: [] };
  const baseValues = asArray(row.candidateValues)
    .filter((value) => value?.tierKind === "base-active-effect" || value?.tier === 0);
  const tierValues = asArray(row.candidateValues)
    .filter((value) => value?.tierKind === "modification-stage" && Number(value?.tier) === level);

  const summed = new Map();
  for (const value of [...baseValues, ...tierValues]) {
    if (value?.unit !== "percent") continue;
    const key = `${value.scope ?? "unknown"}|${value.key ?? "value"}`;
    const existing = summed.get(key) ?? {
      scope: value.scope ?? "unknown",
      key: value.key ?? "value",
      unit: value.unit,
      value: 0,
      decimalValue: 0,
      parts: [],
    };
    existing.value += maybeNumber(value.value) ?? 0;
    existing.decimalValue += maybeNumber(value.decimalValue) ?? 0;
    existing.parts.push({
      tier: value.tier,
      tierKind: value.tierKind,
      rawText: value.rawText,
    });
    summed.set(key, existing);
  }

  return {
    baseValues,
    tierValues,
    summedValues: [...summed.values()].map((value) => ({
      ...value,
      value: Number(value.value.toFixed(6)),
      decimalValue: Number(value.decimalValue.toFixed(8)),
      rawText: `${Number(value.value.toFixed(3))}%`,
    })),
  };
}

function summarizeSkill(row) {
  return {
    source: row.source,
    playerId: row.playerId,
    skillId: row.skillId,
    baseSkillId: row.baseSkillId,
    skillLevelId: row.skillLevelId,
    level: row.level,
    remodelLevel: row.remodelLevel,
    sourceKind: row.sourceKind,
    skillName: row.skillName,
    imagineName: row.imagineName,
  };
}

function valueText(values) {
  return asArray(values)
    .map((value) => `${value.scope ?? "?"}:${value.rawText ?? value.value ?? "?"}`)
    .join(", ");
}

function rowVerdict(row, encounterMatches, currentMatches, sourceIndexMatches) {
  if (String(row.status).startsWith("not-observed")) return "not-observed";
  if (encounterMatches.length > 0) return "historical-tier-selector-present";
  if (currentMatches.length > 0) return "historical-tier-capture-gap-current-only-clue";
  if (sourceIndexMatches.length > 0) return "historical-tier-capture-gap-source-identity-only";
  return "historical-tier-capture-gap-no-source-bridge";
}

function markdownTable(rows, maxRows) {
  const header = [
    "| UID | Label | Component | Source configs | Source index | Current VData clue | Candidate values | Verdict |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.slice(0, maxRows).map((row) => {
    const sourceConfigs = row.observedSourceConfigs
      .map((entry) => `${entry.id} (${entry.count})`)
      .join(", ") || "-";
    const sourceIndex = row.sourceIndexMatches
      .map((entry) => `${entry.sourceName || entry.sourceId || "source"}:${entry.sourceType || entry.sourceKind || "?"}`)
      .join("<br>") || "-";
    const current = row.currentVdataMatches
      .map((entry) => {
        const name = entry.imagineName ? `${entry.imagineName} / ${entry.skillName}` : entry.skillName;
        const tier = entry.remodelLevel === null ? "tier ?" : `tier ${entry.remodelLevel}`;
        return `${name} (${entry.skillId}, ${tier})`;
      })
      .join("<br>") || "-";
    const values = row.currentOnlySelectedValues
      .map((entry) => {
        const label = entry.imagineName ? `${entry.imagineName}` : `skill ${entry.skillId}`;
        const sum = valueText(entry.summedValues) || valueText(entry.tierValues) || valueText(entry.baseValues) || "-";
        return `${label}: ${sum}`;
      })
      .join("<br>") || "-";
    return `| ${row.uid} | ${row.label} | ${row.componentKey} | ${sourceConfigs} | ${sourceIndex} | ${current} | ${values} | ${row.verdict} |`;
  });
  return [...header, ...body].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tierProof = readJson(args.tierProof, null);
  if (!tierProof) throw new Error(`Missing tier proof: ${args.tierProof}`);

  const nameIndex = buildAoyiNameIndex(DEFAULT_AOYI_ICONS);
  const sourceIndex = buildSourceIndex(args.sourceIndex);
  const currentVdata = buildCurrentVdataIndex(args.currentVdata, nameIndex);
  const encounterInputs = asArray(tierProof.inputs).map((input) => path.join("DEV_exports", path.basename(input)));
  const encounterSkills = buildEncounterProfessionIndex(encounterInputs, nameIndex);

  const rows = asArray(tierProof.rows)
    .filter((row) => row?.runtimeKind === "battle-imagine" || row?.category === "battle-imagines")
    .map((row) => {
      const observedSourceConfigs = sourceConfigValues(row);
      const sourceIndexMatches = uniqueBy(
        observedSourceConfigs.flatMap((entry) => sourceIndex.get(entry.id) ?? []),
        (entry) => [entry.sourceId, entry.sourceKind, entry.sourceType, entry.sourceEntityId, entry.sourceName].join("|"),
      );
      const currentVdataMatches = uniqueBy(
        observedSourceConfigs.flatMap((entry) => currentVdata.byId.get(entry.id) ?? []).map(summarizeSkill),
        (entry) => [entry.source, entry.playerId, entry.skillId, entry.baseSkillId, entry.skillLevelId, entry.remodelLevel].join("|"),
      );
      const encounterTierMatches = uniqueBy(
        observedSourceConfigs.flatMap((entry) => encounterSkills.byId.get(entry.id) ?? []).map(summarizeSkill),
        (entry) => [entry.source, entry.playerId, entry.skillId, entry.baseSkillId, entry.skillLevelId, entry.remodelLevel].join("|"),
      );
      const currentOnlySelectedValues = currentVdataMatches
        .filter((match) => match.remodelLevel !== null)
        .map((match) => ({
          skillId: match.skillId,
          skillName: match.skillName,
          imagineName: match.imagineName,
          remodelLevel: match.remodelLevel,
          ...selectedCandidateValues(row, match.remodelLevel),
        }));
      return {
        id: row.id,
        key: row.key,
        uid: row.uid,
        label: row.label,
        componentKey: row.componentKey,
        valueResolution: row.valueResolution,
        valueProofStatus: row.valueProofStatus,
        status: row.status,
        formulaZoneIds: asArray(row.formulaZoneIds),
        candidateScopes: asArray(row.candidateScopes),
        candidateTiers: asArray(row.candidateTiers),
        hits: row.hits ?? 0,
        damage: row.damage ?? 0,
        observedSourceConfigs,
        sourceIndexMatches,
        currentVdataMatches,
        encounterTierMatches,
        currentOnlySelectedValues,
        valueBlockers: asArray(row.valueBlockers),
        proofRequirements: asArray(row.proofRequirements),
        verdict: rowVerdict(row, encounterTierMatches, currentVdataMatches, sourceIndexMatches),
      };
    });

  const summary = {
    generatedAt: new Date().toISOString(),
    tierProof: rel(args.tierProof),
    sourceIndex: rel(args.sourceIndex),
    currentVdataReports: currentVdata.reports,
    encounterSkillInputs: encounterSkills.scanned,
    rows: rows.length,
    observedRows: rows.filter((row) => !String(row.status).startsWith("not-observed")).length,
    rowsWithObservedSourceConfig: rows.filter((row) => row.observedSourceConfigs.length > 0).length,
    rowsWithSourceIndexMatch: rows.filter((row) => row.sourceIndexMatches.length > 0).length,
    rowsWithCurrentVdataMatch: rows.filter((row) => row.currentVdataMatches.length > 0).length,
    rowsWithEncounterTierMatch: rows.filter((row) => row.encounterTierMatches.length > 0).length,
    rowsWithCurrentOnlySelectedValues: rows.filter((row) => row.currentOnlySelectedValues.length > 0).length,
    verdictCounts: rows.reduce((counts, row) => {
      counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
      return counts;
    }, {}),
  };

  const report = {
    schemaVersion: 1,
    generatedBy: "audit-battle-imagine-tier-source-bridge.mjs",
    summary,
    rows,
  };

  const markdown = [
    "# Battle Imagine Tier Source Bridge Audit",
    "",
    "Dev-only audit. Current VData matches are useful clues for today's equipped loadout, but they are not historical proof for an encounter unless the encounter export also carries an active profession skill/tier selector.",
    "",
    "## Summary",
    "",
    `- Rows: ${summary.rows}`,
    `- Observed rows: ${summary.observedRows}`,
    `- Rows with observed source config: ${summary.rowsWithObservedSourceConfig}`,
    `- Rows with generated source-index match: ${summary.rowsWithSourceIndexMatch}`,
    `- Rows with current VData battle-imagine match: ${summary.rowsWithCurrentVdataMatch}`,
    `- Rows with encounter-local tier match: ${summary.rowsWithEncounterTierMatch}`,
    `- Rows with current-only selected values: ${summary.rowsWithCurrentOnlySelectedValues}`,
    "",
    "## Verdict Counts",
    "",
    ...Object.entries(summary.verdictCounts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Rows",
    "",
    markdownTable(rows, args.maxRows),
    "",
  ].join("\n");

  writeJson(args.outJson, report);
  writeText(args.outMd, markdown);

  console.log(`Wrote ${rel(args.outJson)}`);
  console.log(`Wrote ${rel(args.outMd)}`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
