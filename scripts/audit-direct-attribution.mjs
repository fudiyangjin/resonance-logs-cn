import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaultGeneratedDir = path.join(repoRoot, "parser-data", "generated");
const defaultEventLogsDir = path.join(
  process.env.APPDATA || "",
  "com.resonance-logs-cn",
  "EventLogs",
);
const defaultBpsrProbeDir = path.resolve(
  repoRoot,
  "..",
  "BPSR-UID-Extractors",
  "output",
  "probing-reports",
);

function parseArgs(argv) {
  const args = {
    generatedDir: defaultGeneratedDir,
    eventLogsDir: defaultEventLogsDir,
    bpsrProbeDir: defaultBpsrProbeDir,
    eventLogLimit: 12,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--generated-dir" && next) {
      args.generatedDir = path.resolve(next);
      index += 1;
    } else if (arg === "--event-logs-dir" && next) {
      args.eventLogsDir = path.resolve(next);
      index += 1;
    } else if (arg === "--bpsr-probe-dir" && next) {
      args.bpsrProbeDir = path.resolve(next);
      index += 1;
    } else if (arg === "--event-log-limit" && next) {
      args.eventLogLimit = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === "--all-event-logs") {
      args.eventLogLimit = 0;
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath, fallback) {
  try {
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

function preferredName(entry) {
  return entry?.DisplayNames?.en
    ?? entry?.Names?.en
    ?? entry?.familyNames?.en
    ?? entry?.DisplayName
    ?? entry?.Name
    ?? entry?.familyName
    ?? entry?.DamageName
    ?? "";
}

function groupCounts(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
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

function collectSeenSkillIds(eventLogsDir, limit) {
  const files = walkJsonFiles(eventLogsDir)
    .map((filePath) => ({
      filePath,
      modifiedMs: fs.statSync(filePath).mtimeMs,
    }))
    .sort((left, right) => right.modifiedMs - left.modifiedMs);
  const selectedFiles = limit > 0 ? files.slice(0, limit) : files;
  const seenIds = new Set();
  const keyPattern = /\\?"(\d{5,})\\?"\s*:/g;

  for (const file of selectedFiles) {
    const text = fs.readFileSync(file.filePath, "utf8");
    let match;
    while ((match = keyPattern.exec(text)) !== null) {
      seenIds.add(match[1]);
    }
  }

  return {
    fileCount: files.length,
    scannedFileCount: selectedFiles.length,
    seenIds,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const recount = readJson(path.join(args.generatedDir, "RecountTable.json"));
  const breakdown = readJson(path.join(args.generatedDir, "SkillBreakdownDetails.json"));
  const phantomFactors = readOptionalJson(
    path.join(args.generatedDir, "SeasonPhantomFactors.json"),
    {},
  );
  const talentProbe = readOptionalJson(
    path.join(args.bpsrProbeDir, "TalentEffectModelProbe.json"),
    null,
  );
  const phantomProbe = readOptionalJson(
    path.join(args.bpsrProbeDir, "SeasonPhantomFactorProbe.json"),
    null,
  );

  const recountDamage = new Map();
  for (const row of Object.values(recount)) {
    for (const damageId of row.DamageId ?? []) {
      recountDamage.set(String(damageId), row);
    }
  }

  const exactRecountChildren = [];
  for (const [damageId, recountRow] of recountDamage) {
    const detail = breakdown[damageId];
    if (!detail?.Category || detail.Category === "base-skill") continue;
    exactRecountChildren.push({
      damageId,
      category: detail.Category,
      name: preferredName(detail),
      recountId: recountRow.Id,
      recountName: recountRow.RecountName,
    });
  }

  const directFactorRows = [];
  const sourceOnlyFactorRows = [];
  for (const factor of Object.values(phantomFactors.factorsByBuffId ?? {})) {
    const directDamageIds = (factor.affectedDamageIds ?? []).map(String);
    const recountIds = factor.affectedRecountIds ?? [];
    const row = {
      buffId: factor.buffId,
      name: preferredName(factor),
      directDamageIds,
      recountIds,
      recountTableOwners: directDamageIds
        .map((damageId) => recountDamage.get(String(damageId)))
        .filter(Boolean)
        .map((recountRow) => `${recountRow.Id} ${recountRow.RecountName}`),
      description:
        factor.modifierEvidence?.gradeRows?.at(-1)?.cleanResolvedDescription
        ?? factor.cleanDescriptions?.en
        ?? "",
    };
    if (directDamageIds.length > 0) {
      directFactorRows.push(row);
    }
    if (recountIds.length > 0 && directDamageIds.length === 0) {
      sourceOnlyFactorRows.push(row);
    }
  }

  const eventScan = collectSeenSkillIds(args.eventLogsDir, args.eventLogLimit);
  const exactByDamageId = new Map(
    exactRecountChildren.map((row) => [row.damageId, row]),
  );
  const directFactorsByDamageId = new Map(
    directFactorRows.flatMap((row) =>
      row.directDamageIds.map((damageId) => [damageId, row]),
    ),
  );
  const seenExactChildren = [...eventScan.seenIds]
    .filter((damageId) => exactByDamageId.has(damageId))
    .map((damageId) => exactByDamageId.get(damageId));
  const seenDirectFactors = [...eventScan.seenIds]
    .filter((damageId) => directFactorsByDamageId.has(damageId))
    .map((damageId) => directFactorsByDamageId.get(damageId));

  const powerdrawRecount = recount["84"];
  const powerdrawFactors = [phantomFactors.factorsByBuffId?.["3053110"], phantomFactors.factorsByBuffId?.["3053150"]]
    .filter(Boolean)
    .map((factor) => ({
      buffId: factor.buffId,
      name: preferredName(factor),
      directDamageIds: factor.affectedDamageIds ?? [],
      recountIds: factor.affectedRecountIds ?? [],
      description:
        factor.modifierEvidence?.gradeRows?.at(-1)?.cleanResolvedDescription
        ?? factor.cleanDescriptions?.en
        ?? "",
      seenInScannedEventLogs: (factor.affectedDamageIds ?? []).some((damageId) =>
        eventScan.seenIds.has(String(damageId))
      ),
    }));

  console.log("Direct Attribution Audit");
  console.log("========================");
  console.log(`Generated dir: ${path.relative(repoRoot, args.generatedDir) || "."}`);
  console.log(`Event logs scanned: ${eventScan.scannedFileCount}/${eventScan.fileCount}`);
  console.log("");
  console.log("Game-file probe summaries:");
  if (talentProbe?.summary) {
    console.log(`- Talent probe skill rows with evidence: ${talentProbe.summary.skillRowsWithAnyTalentEvidence}`);
    console.log(`- Talent probe recount rows with evidence: ${talentProbe.summary.recountRowsWithProbeEvidence}`);
  }
  if (phantomProbe?.summary) {
    console.log(`- Phantom factor families: ${phantomProbe.summary.factorFamilies}`);
    console.log(`- Phantom factors with description-target recount rows: ${phantomProbe.summary.familiesWithDescriptionTargetRecountRows}`);
  }
  console.log("");
  console.log(`Exact non-base RecountTable children: ${exactRecountChildren.length}`);
  console.log(groupCounts(exactRecountChildren, "category"));
  console.log("");
  console.log(`Direct factor damage candidates: ${directFactorRows.length}`);
  for (const row of directFactorRows) {
    console.log(`- ${row.buffId} ${row.name}: damage ${row.directDamageIds.join(", ") || "none"} -> factor recount ${row.recountIds.join(", ") || "none"}; RecountTable ${row.recountTableOwners.join(", ") || "none"}`);
  }
  console.log("");
  console.log(`Source-only factor recount links: ${sourceOnlyFactorRows.length}`);
  console.log("");
  console.log(`Seen exact non-base children in scanned logs: ${seenExactChildren.length}`);
  console.log(groupCounts(seenExactChildren, "category"));
  for (const row of seenExactChildren.slice(0, 30)) {
    console.log(`- ${row.damageId} ${row.category} ${row.name} -> ${row.recountId} ${row.recountName}`);
  }
  console.log("");
  console.log(`Seen direct factor damage candidates in scanned logs: ${seenDirectFactors.length}`);
  for (const row of seenDirectFactors) {
    console.log(`- ${row.buffId} ${row.name}: damage ${row.directDamageIds.join(", ")}`);
  }
  console.log("");
  console.log("Powerdraw proof case:");
  console.log(`- Recount 84 damage ids: ${(powerdrawRecount?.DamageId ?? []).join(", ") || "none"}`);
  for (const row of powerdrawFactors) {
    console.log(`- ${row.buffId} ${row.name}: damage ${row.directDamageIds.join(", ") || "none"} -> recount ${row.recountIds.join(", ") || "none"}; seen=${row.seenInScannedEventLogs}; ${row.description}`);
  }
}

main();
