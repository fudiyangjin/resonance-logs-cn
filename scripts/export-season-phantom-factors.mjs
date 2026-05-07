import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultProbePath = path.resolve(
  repoRoot,
  "..",
  "BPSR-UID-Extractors",
  "output",
  "probing-reports",
  "SeasonPhantomFactorProbe.json",
);
const defaultBreakdownPath = path.join(
  repoRoot,
  "parser-data",
  "generated",
  "SkillBreakdownDetails.json",
);
const defaultOutPath = path.join(
  repoRoot,
  "parser-data",
  "generated",
  "SeasonPhantomFactors.json",
);

function parseArgs(argv) {
  const args = {
    probePath: defaultProbePath,
    breakdownPath: defaultBreakdownPath,
    outPath: defaultOutPath,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--probe" && next) {
      args.probePath = path.resolve(next);
      index += 1;
    } else if (arg === "--breakdown" && next) {
      args.breakdownPath = path.resolve(next);
      index += 1;
    } else if (arg === "--out" && next) {
      args.outPath = path.resolve(next);
      index += 1;
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function uniqueNumbers(values) {
  return [...new Set(values.map(toNumber).filter((value) => value !== null))].sort(
    (left, right) => left - right,
  );
}

function extractValueTexts(value) {
  return [...new Set(
    String(value || "")
      .match(/[+-]?\d+(?:[.,]\d+)?\s*(?:%|s|sec|seconds?)?/gi) ?? [],
  )].map((entry) => entry.trim());
}

function preferredText(values) {
  return values?.en
    ?? values?.["zh-CN"]
    ?? values?.design
    ?? Object.values(values ?? {}).find(Boolean)
    ?? "";
}

function buildFactorModifierEvidence(gradeRows) {
  const rows = gradeRows
    .map((row) => {
      const text = preferredText(row.cleanResolvedDescriptions)
        || preferredText(row.resolvedDescriptions)
        || row.resolvedDescription
        || "";
      return stripUndefined({
        grade: toNumber(row.grade),
        itemId: toNumber(row.itemId),
        itemQualityTier: toNumber(row.itemQualityTier),
        parameterValues: uniqueNumbers(row.parameterValues ?? []),
        valueTexts: extractValueTexts(text),
        cleanResolvedDescription: text,
        sourceOffset: toNumber(row.sourceOffset),
      });
    })
    .filter((row) => row.grade !== undefined || row.cleanResolvedDescription);

  if (!rows.length) return undefined;

  return {
    source: "SeasonPhantomFactorProbe.gradeRows",
    valueStatus: "grade-table-rendered-description",
    runtimeSelectionStatus: "active-buff-observed-grade-not-exposed",
    gradeRows: rows,
  };
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)]),
    );
  }
  return value;
}

function buildFactorsByBuffId(probe) {
  const factorsByBuffId = {};
  const factorBuffIds = [];

  for (const family of probe.families ?? []) {
    const primaryBuffIds = uniqueNumbers(family.primaryBuffIds ?? []);
    for (const buffId of primaryBuffIds) {
      factorBuffIds.push(buffId);
      const gradeRows = Array.isArray(family.gradeRows) ? family.gradeRows : [];
      factorsByBuffId[String(buffId)] = stripUndefined({
        familyId: toNumber(family.familyId),
        buffId,
        familyName: family.familyName ?? "",
        familyNames: family.familyNames ?? {},
        iconPath: family.iconPath,
        classGateIds: uniqueNumbers(family.classGateIds ?? []),
        descriptionId: toNumber(family.descriptionId),
        descriptions: family.descriptions ?? {},
        cleanDescriptions: family.cleanDescriptions ?? {},
        gradeCount: gradeRows.length,
        gradeIds: uniqueNumbers(gradeRows.map((row) => row.grade)),
        gradeItemIds: uniqueNumbers(gradeRows.map((row) => row.itemId)),
        modifierEvidence: buildFactorModifierEvidence(gradeRows),
        affectedDamageIds: [],
        affectedRecountIds: [],
        affectedDamageEvidence: {},
        affectedRecountEvidence: {},
      });
    }
  }

  return {
    factorBuffIds: uniqueNumbers(factorBuffIds),
    factorsByBuffId,
  };
}

function directLinkedFactorIds(detail, factorBuffIdSet) {
  const candidates = [
    ["LinkedBuffId", detail.LinkedBuffId],
    ["BuffSourceId", detail.BuffSourceId],
    ["LinkedId", detail.LinkedId],
  ];
  const linkedSource = String(detail.LinkedSource ?? "");
  const directIds = [];

  for (const [field, rawId] of candidates) {
    const id = toNumber(rawId);
    if (id === null || !factorBuffIdSet.has(id)) continue;
    if (field === "LinkedId" && linkedSource && linkedSource !== "BuffName") continue;
    directIds.push({ field, id });
  }

  const byId = new Map();
  for (const row of directIds) {
    if (!byId.has(row.id)) byId.set(row.id, row.field);
  }
  return [...byId].map(([id, field]) => ({ id, field }));
}

function applyDamageLinks(factorsByBuffId, factorBuffIds, breakdown) {
  const factorBuffIdSet = new Set(factorBuffIds);
  const damageIdToFactorBuffIds = {};

  for (const detail of Object.values(breakdown)) {
    const damageId = toNumber(detail.Id);
    if (damageId === null) continue;

    for (const link of directLinkedFactorIds(detail, factorBuffIdSet)) {
      const key = String(link.id);
      const factor = factorsByBuffId[key];
      if (!factor) continue;

      factor.affectedDamageIds = uniqueNumbers([
        ...(factor.affectedDamageIds ?? []),
        damageId,
      ]);
      factor.affectedDamageEvidence[String(damageId)] = stripUndefined({
        source: `SkillBreakdownDetails.${link.field}`,
        category: detail.Category,
        categoryLabel: detail.CategoryLabel,
        sourceKind: detail.SourceKind,
        sourceType: detail.SourceType,
        linkedSource: detail.LinkedSource,
        linkedId: toNumber(detail.LinkedId),
        linkedBuffId: toNumber(detail.LinkedBuffId),
        buffSourceId: toNumber(detail.BuffSourceId),
      });

      damageIdToFactorBuffIds[String(damageId)] = uniqueNumbers([
        ...(damageIdToFactorBuffIds[String(damageId)] ?? []),
        link.id,
      ]);
    }
  }

  return damageIdToFactorBuffIds;
}

function applyRecountLinks(factorsByBuffId, probe) {
  const recountIdToFactorBuffIds = {};

  for (const family of probe.families ?? []) {
    const primaryBuffIds = uniqueNumbers(family.primaryBuffIds ?? []);
    const targets = Array.isArray(family.descriptionTargetRecountRows)
      ? family.descriptionTargetRecountRows
      : [];

    for (const target of targets) {
      const recountId = toNumber(target.recountId);
      if (recountId === null || target.relationshipKind !== "affected-dream-damage-target") {
        continue;
      }

      for (const buffId of primaryBuffIds) {
        const factor = factorsByBuffId[String(buffId)];
        if (!factor) continue;

        const firstEvidence = Array.isArray(target.evidence) ? target.evidence[0] : null;
        factor.affectedRecountIds = uniqueNumbers([
          ...(factor.affectedRecountIds ?? []),
          recountId,
        ]);
        factor.affectedRecountEvidence[String(recountId)] = stripUndefined({
          source: target.evidenceSource ?? firstEvidence?.source,
          sourceTable: firstEvidence?.sourceTable,
          relationshipKind: target.relationshipKind,
          evidenceStatuses: target.evidenceStatuses ?? [],
          descriptionId: firstEvidence?.descriptionId ?? family.descriptionId,
          localeId: firstEvidence?.localeId,
          targetText: firstEvidence?.targetText,
          candidateText: firstEvidence?.candidateText,
          matchedText: firstEvidence?.matchedText,
          recountName: target.recountName,
          damageIds: uniqueNumbers(target.damageIds ?? []),
        });

        recountIdToFactorBuffIds[String(recountId)] = uniqueNumbers([
          ...(recountIdToFactorBuffIds[String(recountId)] ?? []),
          buffId,
        ]);
      }
    }
  }

  return recountIdToFactorBuffIds;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const probe = readJson(args.probePath);
  const breakdown = readJson(args.breakdownPath);

  const { factorBuffIds, factorsByBuffId } = buildFactorsByBuffId(probe);
  const damageIdToFactorBuffIds = applyDamageLinks(
    factorsByBuffId,
    factorBuffIds,
    breakdown,
  );
  const recountIdToFactorBuffIds = applyRecountLinks(factorsByBuffId, probe);

  const data = {
    summary: {
      source: "SeasonPhantomFactorProbe",
      sourcePath: path.relative(repoRoot, args.probePath).replaceAll("\\", "/"),
      breakdownSource: path.relative(repoRoot, args.breakdownPath).replaceAll("\\", "/"),
      factorFamilies: Object.values(factorsByBuffId).length,
      factorBuffIds: factorBuffIds.length,
      directlyLinkedDamageRows: Object.keys(damageIdToFactorBuffIds).length,
      descriptionTargetRecountRows: Object.keys(recountIdToFactorBuffIds).length,
      gradeProvenByRuntime: false,
      relationshipPolicy:
        "Direct game-file ID links map child damage rows. Structured Dream DMG target clauses from localized factor descriptions map parent Recount rows as description-target evidence, not formula evidence.",
    },
    factorBuffIds,
    factorsByBuffId,
    damageIdToFactorBuffIds,
    recountIdToFactorBuffIds,
  };

  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  fs.writeFileSync(args.outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${path.relative(repoRoot, args.outPath)} (${factorBuffIds.length} factor buff IDs, ${Object.keys(damageIdToFactorBuffIds).length} linked damage rows, ${Object.keys(recountIdToFactorBuffIds).length} linked recount rows).`,
  );
}

main();
