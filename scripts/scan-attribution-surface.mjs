import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extractorRoot = path.resolve(repoRoot, "..", "BPSR-UID-Extractors");
const defaultGeneratedDir = path.join(repoRoot, "parser-data", "generated");
const defaultProbeDir = path.join(extractorRoot, "output", "probing-reports");
const defaultEventLogsDir = path.join(
  process.env.APPDATA || "",
  "com.resonance-logs-cn",
  "EventLogs",
);
const defaultOut = path.join(repoRoot, "DEV_exports", "attribution-surface-scan.json");
const defaultMarkdown = path.join(repoRoot, "DEV_exports", "attribution-surface-scan.md");

const CTB_NAME_HINTS = new Map([
  ["DamageAttrTable.ctb", "DamageAttrTable.ctb"],
  ["RecountTable.ctb", "RecountTable.ctb"],
  ["SkillTable.ctb", "SkillTable.ctb"],
  ["SkillEffectTable.ctb", "SkillEffectTable.ctb"],
  ["SkillFightLevelTable.ctb", "SkillFightLevelTable.ctb"],
  ["BuffTable.ctb", "BuffTable.ctb"],
  ["ItemTable.ctb", "ItemTable.ctb"],
  ["TempAttrTable.ctb", "TempAttrTable.ctb"],
]);

const CTB_HASH_HINTS = new Map([
  [164473594, "CTB:164473594 SeasonTalentNode"],
  [395604162, "CTB:395604162 SkillPair"],
  [1383488036, "CTB:1383488036 SkillPair"],
  [2200122700, "CTB:2200122700 RogueEntryDescription"],
  [2319498083, "CTB:2319498083 SkillPair"],
  [2553675475, "CTB:2553675475 SeasonPhantomFactor"],
  [3307381957, "CTB:3307381957 SkillPair"],
  [3345237628, "CTB:3345237628 TalentPassive"],
  [3518555200, "CTB:3518555200 VirtualSkillBridge"],
  [3701956197, "CTB:3701956197 ItemCategory"],
  [3754561411, "CTB:3754561411 SkillPair"],
  [4038258408, "CTB:4038258408 RogueEntry"],
  [4192598123, "CTB:4192598123 SeasonEffectDescription"],
]);

function parseArgs(argv) {
  const args = {
    generatedDir: defaultGeneratedDir,
    probeDir: defaultProbeDir,
    eventLogsDir: defaultEventLogsDir,
    out: defaultOut,
    markdown: defaultMarkdown,
    eventLogLimit: 0,
    game: "",
    maxCandidateRows: 250,
    maxRefsPerDamageId: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--generated-dir" && next) {
      args.generatedDir = path.resolve(next);
      index += 1;
    } else if (arg === "--probe-dir" && next) {
      args.probeDir = path.resolve(next);
      index += 1;
    } else if (arg === "--event-logs-dir" && next) {
      args.eventLogsDir = path.resolve(next);
      index += 1;
    } else if (arg === "--event-log-limit" && next) {
      args.eventLogLimit = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = path.resolve(next);
      index += 1;
    } else if (arg === "--markdown" && next) {
      args.markdown = path.resolve(next);
      index += 1;
    } else if (arg === "--game" && next) {
      args.game = next;
      index += 1;
    } else if (arg === "--max-candidate-rows" && next) {
      args.maxCandidateRows = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === "--max-refs-per-damage-id" && next) {
      args.maxRefsPerDamageId = Math.max(1, Number(next) || 1);
      index += 1;
    }
  }

  return args;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function uniqueNumbers(values) {
  return [...new Set((values ?? []).map(toNumber).filter((value) => value !== null))].sort(
    (left, right) => left - right,
  );
}

function addMapArray(map, key, value) {
  const textKey = String(key);
  const rows = map.get(textKey) ?? [];
  rows.push(value);
  map.set(textKey, rows);
}

function incNested(out, first, second, count = 1) {
  const firstKey = String(first || "unknown");
  const secondKey = String(second || "unknown");
  out[firstKey] = out[firstKey] ?? {};
  out[firstKey][secondKey] = (out[firstKey][secondKey] ?? 0) + count;
}

function preferredName(row) {
  return row?.DisplayNames?.en
    ?? row?.Names?.en
    ?? row?.familyNames?.en
    ?? row?.sourceNames?.en
    ?? row?.DisplayName
    ?? row?.Name
    ?? row?.familyName
    ?? row?.sourceName
    ?? "";
}

function collectGeneratedSurface(generatedDir, probeDir) {
  const damage = readJson(path.join(generatedDir, "DamageAttrIdName.json"), {});
  const breakdown = readJson(path.join(generatedDir, "SkillBreakdownDetails.json"), {});
  const recount = readJson(path.join(generatedDir, "RecountTable.json"), {});
  const factors = readJson(path.join(generatedDir, "SeasonPhantomFactors.json"), {});
  const effectSources = readJson(path.join(generatedDir, "EffectSources.json"), {});
  const skills = readJson(path.join(generatedDir, "skillnames.json"), {});
  const buffs = readJson(path.join(generatedDir, "BuffName.json"), []);
  const talentProbe = readJson(path.join(probeDir, "TalentEffectModelProbe.json"), {});
  const seasonTalentProbe = readJson(path.join(probeDir, "SeasonTalentNodeProbe.json"), {});
  const seasonRogueProbe = readJson(path.join(probeDir, "SeasonRogueEntryProbe.json"), {});
  const phantomProbe = readJson(path.join(probeDir, "SeasonPhantomFactorProbe.json"), {});

  const damageIds = new Set(Object.keys(damage));
  const recountDamageIds = new Set();
  const recountByDamageId = new Map();
  for (const row of Object.values(recount)) {
    for (const damageId of row?.DamageId ?? []) {
      recountDamageIds.add(String(damageId));
      recountByDamageId.set(String(damageId), row);
    }
  }
  const allKnownDamageIds = new Set([...damageIds, ...recountDamageIds]);

  const exactNonBaseDamageIds = new Set();
  const exactNonBaseByCategory = {};
  for (const damageId of recountDamageIds) {
    const detail = breakdown[String(damageId)];
    if (!detail?.Category || detail.Category === "base-skill") continue;
    exactNonBaseDamageIds.add(String(damageId));
    exactNonBaseByCategory[detail.Category] = (exactNonBaseByCategory[detail.Category] ?? 0) + 1;
  }

  const directFactorDamageIds = new Set(Object.keys(factors.damageIdToFactorBuffIds ?? {}));
  const sourceOnlyFactorBuffIds = [];
  for (const factor of Object.values(factors.factorsByBuffId ?? {})) {
    if ((factor?.affectedRecountIds ?? []).length && !(factor?.affectedDamageIds ?? []).length) {
      sourceOnlyFactorBuffIds.push(factor.buffId);
    }
  }

  const exactEffectDamageIds = new Set(Object.keys(effectSources.damageIdToEffectSourceIds ?? {}));
  const effectRecountIds = new Set(Object.keys(effectSources.recountIdToEffectSourceIds ?? {}));
  const sourceIdIndex = new Map();

  function addSourceId(id, source) {
    const numberId = toNumber(id);
    if (numberId === null) return;
    addMapArray(sourceIdIndex, numberId, source);
  }

  for (const factor of Object.values(factors.factorsByBuffId ?? {})) {
    addSourceId(factor?.buffId, {
      kind: "phantom-factor-buff",
      sourceId: `phantom-factor:${factor?.buffId}`,
      name: factor?.familyName,
    });
  }
  for (const source of Object.values(effectSources.effectSourcesById ?? {})) {
    addSourceId(source?.sourceEntityId, {
      kind: source?.sourceKind || "effect-source",
      sourceId: source?.sourceId,
      name: source?.sourceName,
    });
    for (const buffId of source?.buffIds ?? []) {
      addSourceId(buffId, {
        kind: `${source?.sourceKind || "effect-source"}-buff`,
        sourceId: source?.sourceId,
        name: source?.sourceName,
      });
    }
  }
  for (const row of talentProbe.talentRows ?? []) {
    addSourceId(row?.id, {
      kind: "talent-passive",
      sourceId: `talent:${row?.id}`,
      name: row?.name,
    });
    for (const record of row?.buffEffectRecords ?? []) {
      addSourceId(record?.buffId, {
        kind: "talent-passive-buff",
        sourceId: `talent:${row?.id}`,
        name: row?.name,
      });
    }
  }
  for (const row of seasonTalentProbe.nodeRows ?? []) {
    addSourceId(row?.id, {
      kind: "season-talent-node",
      sourceId: `season-talent-node:${row?.id}`,
      name: row?.name,
    });
    addSourceId(row?.alignedBuffId, {
      kind: "season-talent-node-buff",
      sourceId: `season-talent-node:${row?.id}`,
      name: row?.name,
    });
    addSourceId(row?.computedAlignedBuffId, {
      kind: "season-talent-node-buff",
      sourceId: `season-talent-node:${row?.id}`,
      name: row?.name,
    });
  }
  for (const row of seasonRogueProbe.entries ?? []) {
    addSourceId(row?.entryId, {
      kind: "season-rogue-entry",
      sourceId: `season-rogue-entry:${row?.entryId}`,
      name: row?.name,
    });
    addSourceId(row?.buffId, {
      kind: "season-rogue-entry-buff",
      sourceId: `season-rogue-entry:${row?.entryId}`,
      name: row?.name,
    });
  }
  for (const row of buffs ?? []) {
    addSourceId(row?.Id, {
      kind: "buff",
      sourceId: `buff:${row?.Id}`,
      name: row?.NameDesign ?? preferredName(row),
    });
  }
  for (const row of Object.values(skills ?? {})) {
    addSourceId(row?.Id, {
      kind: "skill",
      sourceId: `skill:${row?.Id}`,
      name: row?.Name,
    });
  }

  return {
    damage,
    breakdown,
    recount,
    factors,
    effectSources,
    talentProbe,
    seasonTalentProbe,
    seasonRogueProbe,
    phantomProbe,
    damageIds,
    allKnownDamageIds,
    recountDamageIds,
    recountByDamageId,
    exactNonBaseDamageIds,
    exactNonBaseByCategory,
    directFactorDamageIds,
    exactEffectDamageIds,
    effectRecountIds,
    sourceOnlyFactorBuffIds,
    sourceIdIndex,
  };
}

function buildDamagePatternIndex(damageIds) {
  const byLow = new Map();
  for (const id of damageIds) {
    const big = BigInt(id);
    const low = Number(big & 0xffffffffn) >>> 0;
    const high = Number((big >> 32n) & 0xffffffffn) >>> 0;
    const highMap = byLow.get(low) ?? new Map();
    highMap.set(high, String(id));
    byLow.set(low, highMap);
  }
  return byLow;
}

function tryParseCtb(entry, data) {
  if (!data || data.length < 20) return null;
  const rowCount = data.readInt32LE(8);
  const poolCount = data.readInt32LE(12);
  const rowDataBytes = data.readInt32LE(16);
  if (rowCount <= 0 || poolCount < 0 || rowDataBytes <= 0 || rowDataBytes % rowCount !== 0) {
    return null;
  }
  const rowSize = rowDataBytes / rowCount;
  const indexStart = 20;
  const rowStart = indexStart + rowCount * 8;
  if (rowSize <= 0 || rowStart < 20 || rowStart + rowDataBytes > data.length) {
    return null;
  }

  let offset = rowStart + rowDataBytes;
  const pools = [];
  for (let index = 0; index < poolCount; index += 1) {
    if (offset + 8 > data.length) return null;
    const type = data.readInt32LE(offset);
    const length = data.readInt32LE(offset + 4);
    offset += 8;
    if (length < 0 || offset + length > data.length) return null;
    pools.push({
      type,
      start: offset,
      length,
      end: offset + length,
    });
    offset += length;
  }

  return {
    key: entry.key,
    rowCount,
    poolCount,
    rowDataBytes,
    rowSize,
    rowStart,
    pools,
  };
}

function tableLabel(key) {
  return CTB_HASH_HINTS.get(Number(key) >>> 0) ?? `CTB:${Number(key) >>> 0}`;
}

function scanDamageIds(buffer, start, end, damagePatternIndex) {
  const hits = [];
  const safeEnd = Math.min(end, buffer.length - 8);
  for (let offset = Math.max(0, start); offset <= safeEnd; offset += 2) {
    const low = buffer.readUInt32LE(offset);
    const highMap = damagePatternIndex.get(low);
    if (!highMap) continue;
    const high = buffer.readUInt32LE(offset + 4);
    const damageId = highMap.get(high);
    if (!damageId) continue;
    hits.push({ damageId, offset });
  }
  return hits;
}

function collectSourceHits(buffer, start, end, sourceIdIndex) {
  const hits = [];
  const seen = new Set();
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(end, buffer.length - 4);
  for (let offset = safeStart; offset <= safeEnd; offset += 4) {
    const value = buffer.readUInt32LE(offset);
    const sources = sourceIdIndex.get(String(value));
    if (!sources) continue;
    for (const source of sources) {
      const key = `${value}|${source.kind}|${source.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        value,
        kind: source.kind,
        sourceId: source.sourceId,
        name: source.name,
        offset,
      });
    }
  }
  return hits;
}

function scanCtbSurface({ common, containerDir, metaEntries, generated, args }) {
  const damagePatternIndex = buildDamagePatternIndex(generated.allKnownDamageIds);
  const ctbStats = {
    metaEntries: metaEntries.size,
    ctbEntries: 0,
    ctbParseFailures: 0,
    rowBytesScanned: 0,
    poolBytesScanned: 0,
    damageReferenceCount: 0,
    uniqueDamageIdsReferenced: 0,
    tableDamageCounts: {},
    sourceCandidateCount: 0,
  };
  const damageReferenceTables = new Map();
  const candidateRows = [];
  const sourceHitKindCounts = {};
  const tableSummaries = [];

  const entries = [...metaEntries.values()].sort((left, right) => left.key - right.key);
  for (const entry of entries) {
    let data;
    try {
      data = common.readPkgEntry(containerDir, entry);
    } catch {
      continue;
    }

    const table = tryParseCtb(entry, data);
    if (!table) continue;
    ctbStats.ctbEntries += 1;
    ctbStats.rowBytesScanned += table.rowDataBytes;
    ctbStats.poolBytesScanned += table.pools.reduce((sum, pool) => sum + pool.length, 0);

    const label = tableLabel(entry.key);
    const tableSummary = {
      key: entry.key,
      label,
      rowCount: table.rowCount,
      rowSize: table.rowSize,
      poolCount: table.poolCount,
      damageReferences: 0,
      uniqueDamageIds: new Set(),
      sourceCandidates: 0,
    };

    for (let rowIndex = 0; rowIndex < table.rowCount; rowIndex += 1) {
      const rowStart = table.rowStart + rowIndex * table.rowSize;
      const rowEnd = rowStart + table.rowSize;
      const damageHits = scanDamageIds(data, rowStart, rowEnd, damagePatternIndex);
      if (!damageHits.length) continue;
      const sourceHits = collectSourceHits(data, rowStart, rowEnd, generated.sourceIdIndex);
      recordDamageHits({
        damageHits,
        sourceHits,
        entry,
        label,
        locationKind: "row",
        rowIndex,
        tableSummary,
        damageReferenceTables,
        sourceHitKindCounts,
        candidateRows,
        args,
      });
    }

    for (const pool of table.pools) {
      const damageHits = scanDamageIds(data, pool.start, pool.end, damagePatternIndex);
      if (!damageHits.length) continue;
      for (const hit of damageHits) {
        const contextStart = Math.max(pool.start, hit.offset - 96);
        const contextEnd = Math.min(pool.end, hit.offset + 104);
        const sourceHits = collectSourceHits(data, contextStart, contextEnd, generated.sourceIdIndex);
        recordDamageHits({
          damageHits: [hit],
          sourceHits,
          entry,
          label,
          locationKind: `pool:${pool.type}`,
          rowIndex: null,
          tableSummary,
          damageReferenceTables,
          sourceHitKindCounts,
          candidateRows,
          args,
        });
      }
    }

    if (tableSummary.damageReferences) {
      ctbStats.damageReferenceCount += tableSummary.damageReferences;
      ctbStats.tableDamageCounts[label] = tableSummary.damageReferences;
      tableSummaries.push({
        ...tableSummary,
        uniqueDamageIds: tableSummary.uniqueDamageIds.size,
      });
    }
  }

  ctbStats.uniqueDamageIdsReferenced = damageReferenceTables.size;
  ctbStats.sourceCandidateCount = candidateRows.length;

  return {
    ctbStats,
    tableSummaries: tableSummaries.sort(
      (left, right) => right.damageReferences - left.damageReferences || left.label.localeCompare(right.label),
    ),
    damageReferenceTables: Object.fromEntries(
      [...damageReferenceTables.entries()]
        .sort(([left], [right]) => compareNumericStrings(left, right))
        .map(([damageId, refs]) => [
          damageId,
          refs.slice(0, args.maxRefsPerDamageId),
        ]),
    ),
    sourceHitKindCounts,
    candidateRows: candidateRows.slice(0, args.maxCandidateRows),
  };
}

function recordDamageHits({
  damageHits,
  sourceHits,
  entry,
  label,
  locationKind,
  rowIndex,
  tableSummary,
  damageReferenceTables,
  sourceHitKindCounts,
  candidateRows,
  args,
}) {
  tableSummary.damageReferences += damageHits.length;
  for (const hit of damageHits) {
    tableSummary.uniqueDamageIds.add(hit.damageId);
    addMapArray(damageReferenceTables, hit.damageId, {
      tableKey: entry.key,
      table: label,
      locationKind,
      rowIndex,
      offset: hit.offset,
    });
  }

  if (!sourceHits.length) return;

  for (const sourceHit of sourceHits) {
    sourceHitKindCounts[sourceHit.kind] = (sourceHitKindCounts[sourceHit.kind] ?? 0) + 1;
  }

  tableSummary.sourceCandidates += 1;
  for (const damageHit of damageHits) {
    if (candidateRows.length >= args.maxCandidateRows) break;
    candidateRows.push({
      damageId: damageHit.damageId,
      tableKey: entry.key,
      table: label,
      locationKind,
      rowIndex,
      damageOffset: damageHit.offset,
      sourceHits: sourceHits.slice(0, 20),
    });
  }
}

function collectEventLogSurface(eventLogsDir, limit) {
  const files = walkJsonFiles(eventLogsDir)
    .map((filePath) => ({ filePath, modifiedMs: fs.statSync(filePath).mtimeMs }))
    .sort((left, right) => right.modifiedMs - left.modifiedMs);
  const selected = limit > 0 ? files.slice(0, limit) : files;
  const seenIds = new Set();
  const keyPattern = /\\?"(\d{5,})\\?"\s*:/g;

  for (const file of selected) {
    const text = fs.readFileSync(file.filePath, "utf8");
    let match;
    while ((match = keyPattern.exec(text)) !== null) {
      seenIds.add(match[1]);
    }
  }

  return {
    fileCount: files.length,
    scannedFileCount: selected.length,
    seenIds,
  };
}

function walkJsonFiles(dir, target = []) {
  if (!dir || !fs.existsSync(dir)) return target;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, target);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      target.push(fullPath);
    }
  }
  return target;
}

function buildReport({ args, generated, ctbSurface, eventSurface, m0Path }) {
  const seenExactNonBase = [...eventSurface.seenIds].filter((id) =>
    generated.exactNonBaseDamageIds.has(String(id)),
  );
  const seenDirectFactors = [...eventSurface.seenIds].filter((id) =>
    generated.directFactorDamageIds.has(String(id)),
  );
  const seenEffectDamage = [...eventSurface.seenIds].filter((id) =>
    generated.exactEffectDamageIds.has(String(id)),
  );
  const ctbDirectFactorRefs = [...generated.directFactorDamageIds].filter((id) =>
    ctbSurface.damageReferenceTables[String(id)],
  );
  const ctbRecountDamageRefs = [...generated.recountDamageIds].filter((id) =>
    ctbSurface.damageReferenceTables[String(id)],
  );
  const ctbKnownDamageRefs = [...generated.allKnownDamageIds].filter((id) =>
    ctbSurface.damageReferenceTables[String(id)],
  );
  const nonIndexDamageReferences = Object.fromEntries(
    Object.entries(ctbSurface.damageReferenceTables)
      .map(([damageId, refs]) => [
        damageId,
        refs.filter((ref) => ref.table !== "DamageAttrTable.ctb" && ref.table !== "RecountTable.ctb"),
      ])
      .filter(([, refs]) => refs.length)
      .sort(([left], [right]) => compareNumericStrings(left, right)),
  );
  const nonIndexDirectFactorDamageRefs = [...generated.directFactorDamageIds].filter((id) =>
    nonIndexDamageReferences[String(id)]?.length,
  );

  const missingRecountDamageInCtb = [...generated.recountDamageIds].filter(
    (id) => !ctbSurface.damageReferenceTables[String(id)],
  );
  const powerdraw = {
    baseRecount: generated.recount["84"],
    x11Factor: generated.factors.factorsByBuffId?.["3053110"],
    rhapsodyX4Factor: generated.factors.factorsByBuffId?.["3053150"],
    x11SeenInEvents: seenDirectFactors.includes("2305311004"),
    x11ReferencedInCtb: Boolean(ctbSurface.damageReferenceTables["2305311004"]),
  };

  return {
    summary: {
      generatedDir: path.relative(repoRoot, args.generatedDir).replaceAll("\\", "/"),
      probeDir: path.relative(repoRoot, args.probeDir).replaceAll("\\", "/"),
      gamePackage: m0Path,
      damageRows: generated.damageIds.size,
      knownDamageIdsScanned: generated.allKnownDamageIds.size,
      recountRows: Object.keys(generated.recount).length,
      recountDamageIds: generated.recountDamageIds.size,
      exactNonBaseRecountDamageIds: generated.exactNonBaseDamageIds.size,
      exactNonBaseByCategory: generated.exactNonBaseByCategory,
      directFactorDamageIds: generated.directFactorDamageIds.size,
      sourceOnlyFactorBuffIds: generated.sourceOnlyFactorBuffIds.length,
      effectSources: Object.keys(generated.effectSources.effectSourcesById ?? {}).length,
      effectDamageIds: generated.exactEffectDamageIds.size,
      effectRecountIds: generated.effectRecountIds.size,
      eventLogsScanned: eventSurface.scannedFileCount,
      eventLogsAvailable: eventSurface.fileCount,
      seenExactNonBaseDamageIds: seenExactNonBase.length,
      seenDirectFactorDamageIds: seenDirectFactors.length,
      seenEffectDamageIds: seenEffectDamage.length,
      ctbEntriesScanned: ctbSurface.ctbStats.ctbEntries,
      ctbDamageReferences: ctbSurface.ctbStats.damageReferenceCount,
      ctbUniqueKnownDamageIdsReferenced: ctbKnownDamageRefs.length,
      ctbRecountDamageIdsReferenced: ctbRecountDamageRefs.length,
      ctbDirectFactorDamageIdsReferenced: ctbDirectFactorRefs.length,
      ctbNonIndexDamageIdsReferenced: Object.keys(nonIndexDamageReferences).length,
      ctbNonIndexDirectFactorDamageIdsReferenced: nonIndexDirectFactorDamageRefs.length,
      missingRecountDamageIdsFromRawCtbScan: missingRecountDamageInCtb.length,
      sourceCandidateRowsSampled: ctbSurface.candidateRows.length,
      strictAttributionRule:
        "Exact contribution requires a separately emitted damage id. Source-only relationships stay non-numeric.",
    },
    powerdraw,
    eventValidation: {
      seenExactNonBase,
      seenDirectFactors,
      seenEffectDamage,
    },
    ctbSurface,
    nonIndexDamageReferences,
    missingRecountDamageInCtb: missingRecountDamageInCtb.slice(0, 200),
  };
}

function writeMarkdown(report, markdownPath) {
  const lines = [];
  lines.push("# Attribution Surface Scan");
  lines.push("");
  lines.push("## Summary");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`- ${key}: ${formatSummaryValue(value)}`);
  }
  lines.push("");
  lines.push("## Powerdraw");
  lines.push(`- Recount 84 damage ids: ${(report.powerdraw.baseRecount?.DamageId ?? []).join(", ") || "none"}`);
  lines.push(`- Marksman X11 direct damage ids: ${(report.powerdraw.x11Factor?.affectedDamageIds ?? []).join(", ") || "none"}`);
  lines.push(`- Marksman X11 seen in events: ${report.powerdraw.x11SeenInEvents}`);
  lines.push(`- Marksman X11 referenced in raw CTB scan: ${report.powerdraw.x11ReferencedInCtb}`);
  lines.push(`- Marksman Rhapsody X4 direct damage ids: ${(report.powerdraw.rhapsodyX4Factor?.affectedDamageIds ?? []).join(", ") || "none"}`);
  lines.push(`- Marksman Rhapsody X4 source-only recount ids: ${(report.powerdraw.rhapsodyX4Factor?.affectedRecountIds ?? []).join(", ") || "none"}`);
  lines.push("");
  lines.push("## CTB Tables With Damage References");
  for (const row of report.ctbSurface.tableSummaries.slice(0, 40)) {
    lines.push(`- ${row.table ?? row.label}: ${row.damageReferences} refs, ${row.uniqueDamageIds} unique ids, ${row.sourceCandidates} source candidates`);
  }
  lines.push("");
  lines.push("## Non-Index CTB Damage References");
  const nonIndexEntries = Object.entries(report.nonIndexDamageReferences ?? {});
  if (!nonIndexEntries.length) {
    lines.push("- none");
  } else {
    for (const [damageId, refs] of nonIndexEntries.slice(0, 40)) {
      const tables = [...new Set(refs.map((ref) => ref.table))].join(", ");
      lines.push(`- ${damageId}: ${refs.length} refs in ${tables}`);
    }
  }
  lines.push("");
  lines.push("## Source Candidate Kinds");
  for (const [kind, count] of Object.entries(report.ctbSurface.sourceHitKindCounts)) {
    lines.push(`- ${kind}: ${count}`);
  }
  lines.push("");
  lines.push("## Rule");
  lines.push(report.summary.strictAttributionRule);
  lines.push("");
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`, "utf8");
}

function formatSummaryValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function compareNumericStrings(left, right) {
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  } catch {
    return String(left).localeCompare(String(right));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const common = await import(pathToFileURL(path.join(extractorRoot, "generator-common.mjs")).href);
  const config = common.loadGeneratorConfig();
  const m0Path = common.resolveM0Package(args.game || config.gamePath);
  const containerDir = path.dirname(m0Path);
  const metaEntries = common.loadMetaEntries(containerDir);

  for (const [name, label] of CTB_NAME_HINTS) {
    CTB_HASH_HINTS.set(common.hash33(name), label);
  }

  const generated = collectGeneratedSurface(args.generatedDir, args.probeDir);
  const eventSurface = collectEventLogSurface(args.eventLogsDir, args.eventLogLimit);
  const ctbSurface = scanCtbSurface({ common, containerDir, metaEntries, generated, args });
  const report = buildReport({ args, generated, ctbSurface, eventSurface, m0Path });

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeMarkdown(report, args.markdown);

  console.log(`Attribution surface scan complete.`);
  console.log(`CTB entries scanned: ${report.summary.ctbEntriesScanned}`);
  console.log(`Known damage ids referenced in raw CTB scan: ${report.summary.ctbUniqueKnownDamageIdsReferenced}/${report.summary.knownDamageIdsScanned}`);
  console.log(`Recount damage ids referenced in raw CTB scan: ${report.summary.ctbRecountDamageIdsReferenced}/${report.summary.recountDamageIds}`);
  console.log(`Direct factor damage ids referenced in raw CTB scan: ${report.summary.ctbDirectFactorDamageIdsReferenced}/${report.summary.directFactorDamageIds}`);
  console.log(`Non-index CTB damage ids referenced: ${report.summary.ctbNonIndexDamageIdsReferenced}`);
  console.log(`Event logs scanned: ${report.summary.eventLogsScanned}/${report.summary.eventLogsAvailable}`);
  console.log(`Output: ${path.relative(repoRoot, args.out)}`);
  console.log(`Markdown: ${path.relative(repoRoot, args.markdown)}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
