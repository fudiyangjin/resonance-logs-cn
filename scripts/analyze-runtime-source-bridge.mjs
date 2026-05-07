#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DIR_NAME = "com.resonance-logs-cn";
const DEFAULT_EVENT_LIMIT = 64;
const DEFAULT_MAX_ROWS = 80;

const repoRoot = process.cwd();
const defaultEventRoot = process.env.APPDATA
  ? path.join(process.env.APPDATA, APP_DIR_NAME, "EventLogs")
  : path.join(os.homedir(), "AppData", "Roaming", APP_DIR_NAME, "EventLogs");
const defaultTalentProbePath = path.resolve(
  repoRoot,
  "..",
  "BPSR-UID-Extractors",
  "output",
  "probing-reports",
  "TalentEffectModelProbe.json",
);

function parseArgs(argv) {
  const options = {
    eventRoot: defaultEventRoot,
    latest: DEFAULT_EVENT_LIMIT,
    all: false,
    outJson: path.join(repoRoot, "DEV_exports", "runtime-source-bridge.json"),
    outMd: path.join(repoRoot, "DEV_exports", "runtime-source-bridge.md"),
    talentProbe: defaultTalentProbePath,
    maxRows: DEFAULT_MAX_ROWS,
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
      case "--event-root":
        options.eventRoot = path.resolve(next());
        break;
      case "--latest":
        options.latest = Number(next());
        break;
      case "--all":
        options.all = true;
        break;
      case "--out-json":
        options.outJson = path.resolve(next());
        break;
      case "--out-md":
        options.outMd = path.resolve(next());
        break;
      case "--talent-probe":
        options.talentProbe = path.resolve(next());
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
  console.log(`Runtime Source Bridge - connect observed passive/talent runtime IDs to generated source rows.

Usage:
  node scripts/analyze-runtime-source-bridge.mjs [options]

Options:
  --event-root <dir>     EventLogs root. Default: ${defaultEventRoot}
  --latest <count>       Latest JSON files to scan when --all is not set. Default: ${DEFAULT_EVENT_LIMIT}
  --all                  Scan all event/census JSON files under the event root.
  --out-json <path>      JSON report path. Default: DEV_exports/runtime-source-bridge.json
  --out-md <path>        Markdown report path. Default: DEV_exports/runtime-source-bridge.md
  --talent-probe <path>  Optional TalentEffectModelProbe report. Default: ${defaultTalentProbePath}
  --max-rows <count>     Max Markdown rows per section. Default: ${DEFAULT_MAX_ROWS}
  --help                 Show this help.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function readGenerated(fileName) {
  return readJson(path.join(repoRoot, "parser-data", "generated", fileName));
}

function walkJsonFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, result);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      result.push(fullPath);
    }
  }
  return result;
}

function basename(filePath) {
  return path.basename(filePath);
}

function fileMtime(filePath) {
  return fs.statSync(filePath).mtimeMs;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueNumbers(values) {
  return [...new Set(asArray(values).map(finiteNumber).filter((value) => value !== null))];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map((value) => String(value)).filter(Boolean))];
}

function rawJson(entry) {
  if (!entry?.raw) return null;
  try {
    return JSON.parse(entry.raw);
  } catch {
    return null;
  }
}

function pickName(row) {
  return (
    row?.sourceNames?.en ??
    row?.familyNames?.en ??
    row?.Names?.en ??
    row?.names?.en ??
    row?.DisplayNames?.en ??
    row?.Name ??
    row?.name ??
    row?.sourceName ??
    row?.familyName ??
    null
  );
}

function addMapList(map, key, value) {
  if (key === null || key === undefined) return;
  const list = map.get(Number(key)) ?? [];
  list.push(value);
  map.set(Number(key), list);
}

function incrementCounter(map, key, amount = 1) {
  if (key === null || key === undefined) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function addLimited(list, value, limit = 8) {
  if (list.length >= limit) return;
  list.push(value);
}

function emptyObserved(id) {
  return {
    id,
    eventSnapshots: 0,
    censusRows: 0,
    files: new Set(),
    damageIds: new Map(),
    players: new Set(),
    examples: [],
  };
}

function getObserved(map, id) {
  const number = finiteNumber(id);
  if (number === null) return null;
  let row = map.get(number);
  if (!row) {
    row = emptyObserved(number);
    map.set(number, row);
  }
  return row;
}

function observeId(map, id, context) {
  const row = getObserved(map, id);
  if (!row) return;
  if (context.kind === "event") row.eventSnapshots += 1;
  if (context.kind === "census") row.censusRows += 1;
  if (context.file) row.files.add(context.file);
  if (context.playerUid !== null && context.playerUid !== undefined) row.players.add(Number(context.playerUid));
  for (const damageId of uniqueNumbers(context.damageIds)) incrementCounter(row.damageIds, damageId, 1);
  addLimited(row.examples, {
    file: context.file ? basename(context.file) : null,
    kind: context.kind,
    playerUid: context.playerUid ?? null,
    damageIds: uniqueNumbers(context.damageIds).slice(0, 6),
  });
}

function extractActivePassiveSkillIds(raw) {
  return uniqueNumbers([
    ...asArray(raw?.activePassiveSkillIds ?? raw?.active_passive_skill_ids),
    ...asArray(raw?.activePassiveSkills ?? raw?.active_passive_skills).map((skill) => skill.skill_id ?? skill.skillId),
  ]);
}

function extractActivePassiveSkillUuids(raw) {
  return uniqueNumbers([
    ...asArray(raw?.activePassiveSkillUuids ?? raw?.active_passive_skill_uuids),
    ...asArray(raw?.activePassiveSkills ?? raw?.active_passive_skills).map((skill) => skill.passive_uuid ?? skill.passiveUuid),
  ]);
}

function extractActiveProfessionTalentNodeIds(raw) {
  return uniqueNumbers([
    ...asArray(raw?.activeProfessionTalentNodeIds ?? raw?.active_profession_talent_node_ids),
    ...asArray(raw?.activeProfessionTalents ?? raw?.active_profession_talents).map(
      (talent) => talent.talent_node_id ?? talent.talentNodeId,
    ),
  ]);
}

function extractActiveProfessionTalentStageCfgIds(raw) {
  return uniqueNumbers([
    ...asArray(raw?.activeProfessionTalentStageCfgIds ?? raw?.active_profession_talent_stage_cfg_ids),
    ...asArray(raw?.activeProfessionTalents ?? raw?.active_profession_talents).map(
      (talent) => talent.talent_stage_cfg_id ?? talent.talentStageCfgId,
    ),
  ]);
}

function decodeProfessionTalentNodeId(nodeId) {
  const id = finiteNumber(nodeId);
  if (id === null) return null;
  if (id >= 1_000_000) return Math.floor(id / 1000);
  return null;
}

function effectSourceSummary(source) {
  return {
    sourceId: source.sourceId ?? null,
    sourceKind: source.sourceKind ?? null,
    sourceEntityId: finiteNumber(source.sourceEntityId),
    sourceName: pickName(source),
    buffIds: uniqueNumbers(source.buffIds),
    targetCount: asArray(source.targets).length,
    targetDamageIds: uniqueNumbers(asArray(source.targets).map((target) => target.damageId ?? target.targetId)).slice(0, 12),
    targetRecountIds: uniqueNumbers(asArray(source.targets).map((target) => target.recountId)).slice(0, 12),
  };
}

function talentPassiveSources(sources) {
  return asArray(sources).filter((source) => source.sourceKind === "talent-passive");
}

function buildGeneratedIndex(options) {
  const effectSources = readGenerated("EffectSources.json");
  const skillNames = readGenerated("skillnames.json");
  const buffNames = readGenerated("BuffName.json");
  const breakdown = readGenerated("SkillBreakdownDetails.json");
  const talentProbe = readOptionalJson(options.talentProbe);

  const effectSourcesByEntityId = new Map();
  const effectSourcesByBuffId = new Map();
  for (const source of Object.values(effectSources.effectSourcesById ?? {})) {
    const entityId = finiteNumber(source.sourceEntityId);
    if (entityId !== null) addMapList(effectSourcesByEntityId, entityId, source);
    for (const buffId of uniqueNumbers(source.buffIds)) addMapList(effectSourcesByBuffId, buffId, source);
  }

  const skillNamesById = new Map();
  for (const [idText, row] of Object.entries(skillNames ?? {})) {
    const id = finiteNumber(row?.Id ?? idText);
    if (id !== null) skillNamesById.set(id, row);
  }

  const buffNamesById = new Map();
  if (Array.isArray(buffNames)) {
    for (const row of buffNames) {
      const id = finiteNumber(row?.Id ?? row?.id);
      if (id !== null) buffNamesById.set(id, row);
    }
  } else {
    for (const [idText, row] of Object.entries(buffNames ?? {})) {
      const id = finiteNumber(row?.Id ?? row?.id ?? idText);
      if (id !== null) buffNamesById.set(id, row);
    }
  }

  const damageNamesById = new Map();
  for (const [idText, row] of Object.entries(breakdown ?? {})) {
    const id = finiteNumber(idText);
    if (id !== null) {
      damageNamesById.set(
        id,
        row.DisplayNames?.en ?? row.DisplayName ?? row.DamageNames?.en ?? row.DamageName ?? `Damage ${id}`,
      );
    }
  }

  const talentRowsById = new Map();
  for (const row of asArray(talentProbe?.talentRows)) {
    const id = finiteNumber(row.id ?? row.Id);
    if (id !== null) talentRowsById.set(id, row);
  }

  return {
    effectSources,
    effectSourcesByEntityId,
    effectSourcesByBuffId,
    skillNamesById,
    buffNamesById,
    damageNamesById,
    talentRowsById,
    talentProbeLoaded: Boolean(talentProbe),
    talentProbePath: options.talentProbe,
  };
}

function selectedFiles(options) {
  const allFiles = walkJsonFiles(options.eventRoot).sort((left, right) => fileMtime(right) - fileMtime(left));
  return options.all ? allFiles : allFiles.slice(0, options.latest);
}

function scanRuntimeFiles(files) {
  const passiveSkills = new Map();
  const passiveUuids = new Map();
  const professionTalentNodes = new Map();
  const professionTalentStageCfgIds = new Map();
  const decodedProfessionTalentIds = new Map();
  const counters = {
    filesSelected: files.length,
    filesRead: 0,
    eventFiles: 0,
    censusFiles: 0,
    unreadableFiles: 0,
    eventEntries: 0,
    playerSnapshots: 0,
    playerSnapshotsWithPassiveSkills: 0,
    playerSnapshotsWithProfessionTalents: 0,
    censusRows: 0,
    censusRowsWithPassiveSkills: 0,
    censusRowsWithProfessionTalents: 0,
  };

  for (const filePath of files) {
    let payload;
    try {
      payload = readJson(filePath);
    } catch {
      counters.unreadableFiles += 1;
      continue;
    }
    counters.filesRead += 1;

    if (Array.isArray(payload.entries)) {
      counters.eventFiles += 1;
      for (const entry of payload.entries) {
        counters.eventEntries += 1;
        if (entry.action !== "snapshot" || entry.category !== "player") continue;
        const raw = rawJson(entry);
        if (!raw) continue;
        counters.playerSnapshots += 1;
        const playerUid = finiteNumber(raw.uid ?? raw.playerUid ?? entry.uid ?? entry.source_uid ?? entry.sourceUid);
        const passiveIds = extractActivePassiveSkillIds(raw);
        const passiveUuidIds = extractActivePassiveSkillUuids(raw);
        const nodeIds = extractActiveProfessionTalentNodeIds(raw);
        const stageCfgIds = extractActiveProfessionTalentStageCfgIds(raw);
        if (passiveIds.length || passiveUuidIds.length) counters.playerSnapshotsWithPassiveSkills += 1;
        if (nodeIds.length) counters.playerSnapshotsWithProfessionTalents += 1;
        const context = { kind: "event", file: filePath, playerUid, damageIds: [] };
        for (const id of passiveIds) observeId(passiveSkills, id, context);
        for (const id of passiveUuidIds) observeId(passiveUuids, id, context);
        for (const id of nodeIds) {
          observeId(professionTalentNodes, id, context);
          const decoded = decodeProfessionTalentNodeId(id);
          if (decoded !== null) observeId(decodedProfessionTalentIds, decoded, context);
        }
        for (const id of stageCfgIds) observeId(professionTalentStageCfgIds, id, context);
      }
      continue;
    }

    if (Array.isArray(payload.rows)) {
      counters.censusFiles += 1;
      for (const row of payload.rows) {
        counters.censusRows += 1;
        const damageId = finiteNumber(row.damageId ?? row.damage_id);
        const playerUid = finiteNumber(row.playerUid ?? row.player_uid ?? row.sourceUid ?? row.source_uid);
        const passiveIds = extractActivePassiveSkillIds(row);
        const passiveUuidIds = extractActivePassiveSkillUuids(row);
        const nodeIds = extractActiveProfessionTalentNodeIds(row);
        const stageCfgIds = extractActiveProfessionTalentStageCfgIds(row);
        if (passiveIds.length || passiveUuidIds.length) counters.censusRowsWithPassiveSkills += 1;
        if (nodeIds.length) counters.censusRowsWithProfessionTalents += 1;
        const context = { kind: "census", file: filePath, playerUid, damageIds: damageId === null ? [] : [damageId] };
        for (const id of passiveIds) observeId(passiveSkills, id, context);
        for (const id of passiveUuidIds) observeId(passiveUuids, id, context);
        for (const id of nodeIds) {
          observeId(professionTalentNodes, id, context);
          const decoded = decodeProfessionTalentNodeId(id);
          if (decoded !== null) observeId(decodedProfessionTalentIds, decoded, context);
        }
        for (const id of stageCfgIds) observeId(professionTalentStageCfgIds, id, context);
      }
    }
  }

  return {
    counters,
    passiveSkills,
    passiveUuids,
    professionTalentNodes,
    professionTalentStageCfgIds,
    decodedProfessionTalentIds,
  };
}

function observedBase(row) {
  const damageIds = [...row.damageIds.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .map(([id, count]) => ({ id: Number(id), count }));
  return {
    id: row.id,
    observations: row.eventSnapshots + row.censusRows,
    eventSnapshots: row.eventSnapshots,
    censusRows: row.censusRows,
    files: row.files.size,
    players: row.players.size,
    damageIds,
    examples: row.examples,
  };
}

function decoratePassiveSkill(row, index) {
  const base = observedBase(row);
  const skillRow = index.skillNamesById.get(row.id) ?? null;
  const directSources = asArray(index.effectSourcesByEntityId.get(row.id)).map(effectSourceSummary);
  const buffSources = asArray(index.effectSourcesByBuffId.get(row.id)).map(effectSourceSummary);
  const talentRow = index.talentRowsById.get(row.id) ?? null;
  const skillName = pickName(skillRow);
  const directTargetCount = directSources.reduce((total, source) => total + source.targetCount, 0);
  return {
    ...base,
    skillName,
    skillKind: skillRow?.Kind ?? skillRow?.kind ?? null,
    directEffectSources: directSources,
    buffIdEffectSources: buffSources,
    directTalentProbeName: pickName(talentRow),
    bridgeStatus:
      directTargetCount > 0
        ? "direct-source-match-with-targets"
        : skillName
          ? "runtime-skill-id"
          : directSources.length > 0
            ? "direct-source-match-no-targets"
            : "unresolved-runtime-passive-id",
  };
}

function decorateTalentNode(row, index) {
  const base = observedBase(row);
  const decodedTalentId = decodeProfessionTalentNodeId(row.id);
  const directSources = asArray(index.effectSourcesByEntityId.get(row.id)).map(effectSourceSummary);
  const decodedSources =
    decodedTalentId === null
      ? []
      : talentPassiveSources(index.effectSourcesByEntityId.get(decodedTalentId)).map(effectSourceSummary);
  const directProbeRow = index.talentRowsById.get(row.id) ?? null;
  const decodedProbeRow = decodedTalentId === null ? null : (index.talentRowsById.get(decodedTalentId) ?? null);
  const decodedTargetCount = decodedSources.reduce((total, source) => total + source.targetCount, 0);
  return {
    ...base,
    decodedTalentId,
    directEffectSources: directSources,
    decodedEffectSources: decodedSources,
    directTalentProbeName: pickName(directProbeRow),
    decodedTalentProbeName: pickName(decodedProbeRow),
    bridgeStatus:
      decodedTalentId !== null && decodedSources.length > 0
        ? decodedTargetCount > 0
          ? "decoded-node-prefix-source-with-targets"
          : "decoded-node-prefix-source-no-targets"
        : directSources.length > 0
          ? "direct-node-source-match"
          : "unresolved-node-id",
  };
}

function decorateDecodedTalent(row, index, nodeRows) {
  const base = observedBase(row);
  const sources = talentPassiveSources(index.effectSourcesByEntityId.get(row.id)).map(effectSourceSummary);
  const probeRow = index.talentRowsById.get(row.id) ?? null;
  const nodes = nodeRows
    .filter((node) => node.decodedTalentId === row.id)
    .map((node) => node.id)
    .sort((left, right) => left - right);
  return {
    ...base,
    talentName: pickName(probeRow) ?? sources[0]?.sourceName ?? null,
    effectSources: sources,
    nodeIds: nodes,
    bridgeStatus: sources.length > 0 ? "decoded-source-match" : "decoded-source-missing",
  };
}

function toSortedRows(map, decorate) {
  return [...map.values()]
    .map(decorate)
    .sort(
      (left, right) =>
        right.observations - left.observations ||
        right.censusRows - left.censusRows ||
        Number(left.id) - Number(right.id),
    );
}

function summarize(report) {
  const passiveRows = report.passiveSkillRows;
  const nodeRows = report.professionTalentNodeRows;
  const decodedRows = report.decodedProfessionTalentRows;
  return {
    uniquePassiveSkillIds: passiveRows.length,
    uniquePassiveSkillIdsWithSkillNames: passiveRows.filter((row) => row.skillName).length,
    uniquePassiveSkillIdsWithDirectSources: passiveRows.filter((row) => row.directEffectSources.length > 0).length,
    uniquePassiveSkillIdsWithTargetedSources: passiveRows.filter((row) =>
      row.directEffectSources.some((source) => source.targetCount > 0),
    ).length,
    uniqueProfessionTalentNodeIds: nodeRows.length,
    uniqueProfessionTalentNodeIdsDecoded: nodeRows.filter((row) => row.decodedTalentId !== null).length,
    uniqueProfessionTalentNodeIdsDecodedToSources: nodeRows.filter((row) => row.decodedEffectSources.length > 0).length,
    uniqueProfessionTalentNodeIdsDecodedToTargetedSources: nodeRows.filter((row) =>
      row.decodedEffectSources.some((source) => source.targetCount > 0),
    ).length,
    uniqueDecodedProfessionTalentIds: decodedRows.length,
    uniqueDecodedProfessionTalentIdsWithSources: decodedRows.filter((row) => row.effectSources.length > 0).length,
  };
}

function damageLabel(damageId, index) {
  const name = index.damageNamesById.get(Number(damageId));
  return name ? `${damageId} ${name}` : String(damageId);
}

function tableCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function topDamageText(row, index) {
  return row.damageIds
    .slice(0, 5)
    .map((damage) => `${damageLabel(damage.id, index)} (${damage.count})`)
    .join(", ");
}

function sourceText(sources) {
  if (!sources.length) return "";
  return sources
    .slice(0, 4)
    .map((source) => {
      const targetSuffix = source.targetCount > 0 ? `, targets=${source.targetCount}` : "";
      const buffSuffix = source.buffIds.length ? `, buffs=${source.buffIds.slice(0, 4).join(",")}` : "";
      return `${source.sourceId} ${source.sourceName ?? ""}${buffSuffix}${targetSuffix}`;
    })
    .join("; ");
}

function writeMarkdown(report, index, options) {
  const summary = report.summary;
  const counters = report.counters;
  const lines = [];
  lines.push("# Runtime Source Bridge");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Event root: \`${report.eventRoot}\``);
  lines.push("");
  lines.push("## Short Answer");
  lines.push("");
  lines.push(
    `- The new runtime fields are populated: ${counters.playerSnapshotsWithPassiveSkills.toLocaleString("en-US")} player snapshots and ${counters.censusRowsWithPassiveSkills.toLocaleString("en-US")} census rows had active passive skill state; ${counters.playerSnapshotsWithProfessionTalents.toLocaleString("en-US")} player snapshots and ${counters.censusRowsWithProfessionTalents.toLocaleString("en-US")} census rows had selected profession talent nodes.`,
  );
  lines.push(
    `- Profession talent node IDs have a usable bridge for 7-digit nodes: ${summary.uniqueProfessionTalentNodeIdsDecodedToSources} of ${summary.uniqueProfessionTalentNodeIdsDecoded} decoded node IDs matched generated talent/passive source rows by \`Math.floor(nodeId / 1000)\`.`,
  );
  lines.push(
    `- Active passive skill IDs mostly resolve as SkillTable/base-skill IDs, not as generated modifier source IDs. They are still valuable state, but they need a separate PassiveSkillInfo.skill_id -> source/effect bridge before they can safely split parent damage.`,
  );
  lines.push("");
  lines.push("## Input Coverage");
  lines.push("");
  lines.push(`- JSON files selected: ${counters.filesSelected}`);
  lines.push(`- JSON files read: ${counters.filesRead}`);
  lines.push(`- Event files read: ${counters.eventFiles}`);
  lines.push(`- Attribution census files read: ${counters.censusFiles}`);
  lines.push(`- Event entries scanned: ${counters.eventEntries.toLocaleString("en-US")}`);
  lines.push(`- Player snapshots scanned: ${counters.playerSnapshots.toLocaleString("en-US")}`);
  lines.push(`- Census rows scanned: ${counters.censusRows.toLocaleString("en-US")}`);
  lines.push(`- Unique active passive skill IDs: ${summary.uniquePassiveSkillIds}`);
  lines.push(`- Unique selected profession talent node IDs: ${summary.uniqueProfessionTalentNodeIds}`);
  lines.push(`- Unique decoded profession talent IDs: ${summary.uniqueDecodedProfessionTalentIds}`);
  lines.push("");
  lines.push("## Profession Talent Node Decode");
  lines.push("");
  lines.push(
    "| node id | decoded talent id | status | decoded source | observations | census rows | sample damage rows |",
  );
  lines.push("| --- | --- | --- | --- | ---: | ---: | --- |");
  for (const row of report.professionTalentNodeRows.slice(0, options.maxRows)) {
    const sources = row.decodedEffectSources.length > 0 ? row.decodedEffectSources : row.directEffectSources;
    lines.push(
      `| ${row.id} | ${row.decodedTalentId ?? ""} | ${tableCell(row.bridgeStatus)} | ${tableCell(sourceText(sources))} | ${row.observations} | ${row.censusRows} | ${tableCell(topDamageText(row, index))} |`,
    );
  }
  lines.push("");
  lines.push("## Decoded Talent Sources");
  lines.push("");
  lines.push("| talent id | name | node ids | generated source | observations | census rows | sample damage rows |");
  lines.push("| --- | --- | --- | --- | ---: | ---: | --- |");
  for (const row of report.decodedProfessionTalentRows.slice(0, options.maxRows)) {
    lines.push(
      `| ${row.id} | ${tableCell(row.talentName ?? "")} | ${tableCell(row.nodeIds.slice(0, 12).join(", "))} | ${tableCell(sourceText(row.effectSources))} | ${row.observations} | ${row.censusRows} | ${tableCell(topDamageText(row, index))} |`,
    );
  }
  lines.push("");
  lines.push("## Active Passive Skill IDs");
  lines.push("");
  lines.push("| passive skill id | skill name | status | direct generated source | observations | census rows | sample damage rows |");
  lines.push("| --- | --- | --- | --- | ---: | ---: | --- |");
  for (const row of report.passiveSkillRows.slice(0, options.maxRows)) {
    lines.push(
      `| ${row.id} | ${tableCell(row.skillName ?? "")} | ${tableCell(row.bridgeStatus)} | ${tableCell(sourceText(row.directEffectSources))} | ${row.observations} | ${row.censusRows} | ${tableCell(topDamageText(row, index))} |`,
    );
  }
  lines.push("");
  lines.push("## Method Notes");
  lines.push("");
  lines.push(
    "- Event-log player snapshots provide active state but no direct damage row on that exact line; AttributionCensus rows provide active state plus damage IDs.",
  );
  lines.push(
    "- The profession talent node decode is intentionally conservative: only 7-digit node IDs are decoded with `Math.floor(nodeId / 1000)`.",
  );
  lines.push(
    "- Direct passive skill ID matches can be ID collisions. Treat them as weak until they also have target links or independent packet/table evidence.",
  );
  lines.push(
    "- This report is a bridge inventory, not a final contribution formula. Formula validation still needs baseline-vs-active samples for each source and target row.",
  );
  lines.push("");
  fs.mkdirSync(path.dirname(options.outMd), { recursive: true });
  fs.writeFileSync(options.outMd, `${lines.join("\n")}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const index = buildGeneratedIndex(options);
  const files = selectedFiles(options);
  const runtime = scanRuntimeFiles(files);

  const passiveSkillRows = toSortedRows(runtime.passiveSkills, (row) => decoratePassiveSkill(row, index));
  const professionTalentNodeRows = toSortedRows(runtime.professionTalentNodes, (row) => decorateTalentNode(row, index));
  const decodedProfessionTalentRows = toSortedRows(runtime.decodedProfessionTalentIds, (row) =>
    decorateDecodedTalent(row, index, professionTalentNodeRows),
  );
  const passiveUuidRows = toSortedRows(runtime.passiveUuids, observedBase);
  const professionTalentStageCfgRows = toSortedRows(runtime.professionTalentStageCfgIds, observedBase);

  const report = {
    generatedAt: new Date().toISOString(),
    eventRoot: options.eventRoot,
    files: files.map(basename),
    counters: runtime.counters,
    generated: {
      effectSourceRows: Object.keys(index.effectSources.effectSourcesById ?? {}).length,
      talentProbeLoaded: index.talentProbeLoaded,
      talentProbePath: index.talentProbePath,
    },
    passiveSkillRows,
    passiveUuidRows,
    professionTalentNodeRows,
    professionTalentStageCfgRows,
    decodedProfessionTalentRows,
  };
  report.summary = summarize(report);

  fs.mkdirSync(path.dirname(options.outJson), { recursive: true });
  fs.writeFileSync(options.outJson, JSON.stringify(report, null, 2));
  writeMarkdown(report, index, options);

  console.log(`Scanned ${runtime.counters.filesRead} JSON files.`);
  console.log(`Active passive skill IDs: ${report.summary.uniquePassiveSkillIds}`);
  console.log(
    `Profession talent nodes decoded to generated sources: ${report.summary.uniqueProfessionTalentNodeIdsDecodedToSources}/${report.summary.uniqueProfessionTalentNodeIdsDecoded}`,
  );
  console.log(`Wrote ${path.relative(repoRoot, options.outJson)}`);
  console.log(`Wrote ${path.relative(repoRoot, options.outMd)}`);
}

main();
