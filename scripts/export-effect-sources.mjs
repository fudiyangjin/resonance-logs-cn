import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extractorRoot = path.resolve(repoRoot, "..", "BPSR-UID-Extractors");

const defaultPaths = {
  factors: path.join(repoRoot, "parser-data", "generated", "SeasonPhantomFactors.json"),
  breakdown: path.join(repoRoot, "parser-data", "generated", "SkillBreakdownDetails.json"),
  recount: path.join(repoRoot, "parser-data", "generated", "RecountTable.json"),
  talentProbe: path.join(extractorRoot, "output", "probing-reports", "TalentEffectModelProbe.json"),
  seasonTalentProbe: path.join(extractorRoot, "output", "probing-reports", "SeasonTalentNodeProbe.json"),
  seasonRogueProbe: path.join(extractorRoot, "output", "probing-reports", "SeasonRogueEntryProbe.json"),
  out: path.join(repoRoot, "parser-data", "generated", "EffectSources.json"),
};

const LOCALES = ["en", "zh-CN", "zh-TW", "ja", "ko-KR", "fr", "de", "es", "pt-BR", "th", "id"];
const DREAM_MARKERS = [
  /Dream(?:scape)? DMG/gi,
  /\u68a6\u5883\u4f24\u5bb3/g,
  /\u5922\u5883\u50b7\u5bb3/g,
  /\u5922\u754c\u30c0\u30e1\u30fc\u30b8/g,
  /\uafc8\s*\ub300\ubbf8\uc9c0/gi,
  /D\u00e9g\u00e2ts oniriques/gi,
  /d\u00e9g\u00e2ts oniriques/gi,
  /Traum-SCH/gi,
  /D\u00d1O on\u00edrico/gi,
  /Dano On\u00edrico/gi,
];

function parseArgs(argv) {
  const args = { ...defaultPaths };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--out" && next) {
      args.out = path.resolve(next);
      index += 1;
    } else if (arg === "--factors" && next) {
      args.factors = path.resolve(next);
      index += 1;
    } else if (arg === "--breakdown" && next) {
      args.breakdown = path.resolve(next);
      index += 1;
    } else if (arg === "--recount" && next) {
      args.recount = path.resolve(next);
      index += 1;
    } else if (arg === "--talent-probe" && next) {
      args.talentProbe = path.resolve(next);
      index += 1;
    } else if (arg === "--season-talent-probe" && next) {
      args.seasonTalentProbe = path.resolve(next);
      index += 1;
    } else if (arg === "--season-rogue-probe" && next) {
      args.seasonRogueProbe = path.resolve(next);
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
  return [...new Set((values ?? []).map(toNumber).filter((value) => value !== null))]
    .sort((left, right) => left - right);
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map(String).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((entry) => entry !== undefined);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || entry === null || entry === "") continue;
      const cleaned = stripUndefined(entry);
      if (cleaned !== undefined && (!Array.isArray(cleaned) || cleaned.length)) {
        out[key] = cleaned;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function preferredName(names, fallback = "") {
  return names?.en || names?.["zh-CN"] || names?.design || fallback || "";
}

function preferredText(values, fallback = "") {
  return values?.en
    ?? values?.["zh-CN"]
    ?? values?.design
    ?? Object.values(values ?? {}).find(Boolean)
    ?? fallback
    ?? "";
}

function extractValueTexts(value) {
  const seen = new Set();
  const out = [];
  for (const match of String(value || "")
    .match(/[+-]?\d+(?:[.,]\d+)?\s*(?:%|s|sec|seconds?)?/gi) ?? []) {
    const text = match.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function buildDescriptionModifierEvidence({
  source,
  valueStatus,
  descriptionId,
  cleanDescriptions,
}) {
  const cleanDescription = preferredText(cleanDescriptions);
  if (!cleanDescription) return undefined;
  return stripUndefined({
    source,
    valueStatus,
    descriptionId: toNumber(descriptionId),
    cleanDescription,
    valueTexts: extractValueTexts(cleanDescription),
  });
}

function normalizedNames(names, fallback = "") {
  const out = {};
  for (const [locale, value] of Object.entries(names ?? {})) {
    const text = String(value || "").trim();
    if (text) out[locale] = text;
  }
  if (!Object.keys(out).length && fallback) out.en = fallback;
  return out;
}

class EffectSourceBuilder {
  constructor(recountRows) {
    this.effectSourcesById = {};
    this.buffIdToEffectSourceIds = {};
    this.damageIdToEffectSourceIds = {};
    this.recountIdToEffectSourceIds = {};
    this.recountRows = recountRows;
    this.recountNameIndex = buildRecountNameIndex(recountRows);
  }

  upsertSource(source) {
    const sourceId = source.sourceId;
    const existing = this.effectSourcesById[sourceId] ?? {
      sourceId,
      sourceKind: source.sourceKind,
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      sourceNames: source.sourceNames,
      iconPath: source.iconPath,
      runtimeDetection: source.runtimeDetection,
      sourceTable: source.sourceTable,
      sourceEntityId: source.sourceEntityId,
      familyId: source.familyId,
      classGateIds: source.classGateIds,
      buffIds: [],
      descriptions: source.descriptions,
      cleanDescriptions: source.cleanDescriptions,
      modifierEvidence: source.modifierEvidence,
      targets: [],
      evidence: [],
    };

    existing.buffIds = uniqueNumbers([...(existing.buffIds ?? []), ...(source.buffIds ?? [])]);
    existing.classGateIds = uniqueNumbers([
      ...(existing.classGateIds ?? []),
      ...(source.classGateIds ?? []),
    ]);
    existing.targets = mergeTargets(existing.targets, source.targets ?? []);
    existing.evidence = mergeEvidence(existing.evidence, source.evidence ?? []);
    existing.modifierEvidence = existing.modifierEvidence ?? source.modifierEvidence;

    this.effectSourcesById[sourceId] = stripUndefined(existing);

    for (const buffId of existing.buffIds ?? []) {
      addIndex(this.buffIdToEffectSourceIds, buffId, sourceId);
    }
    for (const target of source.targets ?? []) {
      if (target.targetKind === "damage" && target.damageId) {
        addIndex(this.damageIdToEffectSourceIds, target.damageId, sourceId);
      } else if (target.targetKind === "recount" && target.recountId) {
        addIndex(this.recountIdToEffectSourceIds, target.recountId, sourceId);
      }
    }
  }

  addDescriptionTargetSources(sourceFactory, rows) {
    for (const row of rows) {
      const source = sourceFactory(row);
      if (!source) continue;
      const targets = matchDescriptionTargets(row.cleanDescriptions, this.recountNameIndex, this.recountRows)
        .map((target) => ({
          targetKind: "recount",
          recountId: target.recountId,
          recountName: target.recountName,
          relationshipKind: "affected-dream-damage-target",
          evidenceSource: "EffectSources.DescriptionTextDreamDmgTarget",
          evidenceStatus: target.evidenceStatus,
          sourceTable: row.descriptionSourceTable,
          descriptionId: row.descriptionId,
          localeId: target.localeId,
          targetText: target.targetText,
          candidateText: target.candidateText,
          matchedText: target.matchedText,
        }));
      this.upsertSource({ ...source, targets });
    }
  }
}

function mergeTargets(left, right) {
  const byKey = new Map();
  for (const target of [...(left ?? []), ...(right ?? [])]) {
    const key = [
      target.targetKind,
      target.damageId ?? target.recountId ?? "",
      target.relationshipKind ?? "",
      target.evidenceSource ?? "",
      target.evidenceStatus ?? "",
    ].join("|");
    byKey.set(key, stripUndefined(target));
  }
  return [...byKey.values()].sort((a, b) =>
    String(a.targetKind).localeCompare(String(b.targetKind))
      || Number(a.damageId ?? a.recountId ?? 0) - Number(b.damageId ?? b.recountId ?? 0),
  );
}

function mergeEvidence(left, right) {
  const byKey = new Map();
  for (const evidence of [...(left ?? []), ...(right ?? [])]) {
    const key = JSON.stringify(evidence);
    byKey.set(key, stripUndefined(evidence));
  }
  return [...byKey.values()];
}

function addIndex(index, rawId, sourceId) {
  const id = toNumber(rawId);
  if (id === null) return;
  const key = String(id);
  index[key] = uniqueStrings([...(index[key] ?? []), sourceId]);
}

function collectRecountRows(recount) {
  return Object.values(recount ?? {})
    .map((row) => stripUndefined({
      recountId: toNumber(row.Id),
      recountName: row.RecountName ?? row.Name,
      recountNames: normalizedNames(row.Names, row.RecountName ?? row.Name),
      damageIds: uniqueNumbers(row.DamageId ?? []),
      linkedTalentId: toNumber(row.LinkedTalentId),
      linkedTalentName: row.LinkedTalentName,
      linkedTalentNames: row.LinkedTalentNames,
      linkedTalentBuffIds: uniqueNumbers(row.LinkedTalentBuffIds ?? []),
      linkedTalentFormulaIds: uniqueNumbers(row.LinkedTalentFormulaIds ?? []),
      talentBridge: row.TalentBridge,
    }))
    .filter((row) => row?.recountId);
}

function buildRecountNameIndex(recountRows) {
  const index = new Map();
  for (const row of recountRows) {
    for (const [localeId, name] of Object.entries(row.recountNames ?? {})) {
      const normalized = normalizeLabel(name);
      if (!normalized) continue;
      const key = `${localeId}|${normalized}`;
      const current = index.get(key) ?? [];
      current.push(row);
      index.set(key, current);
    }
  }
  return index;
}

function addPhantomFactors(builder, factorData) {
  for (const factor of Object.values(factorData?.factorsByBuffId ?? {})) {
    const sourceId = `phantom-factor:${factor.buffId}`;
    const targets = [];
    for (const [damageId, evidence] of Object.entries(factor.affectedDamageEvidence ?? {})) {
      targets.push({
        targetKind: "damage",
        damageId: toNumber(damageId),
        relationshipKind: "direct-linked-factor-damage-row",
        evidenceSource: evidence.source,
        evidenceStatus: "current-production-direct-id-link",
        sourceKind: evidence.sourceKind,
        sourceType: evidence.sourceType,
      });
    }
    for (const [recountId, evidence] of Object.entries(factor.affectedRecountEvidence ?? {})) {
      targets.push({
        targetKind: "recount",
        recountId: toNumber(recountId),
        recountName: evidence.recountName,
        relationshipKind: evidence.relationshipKind,
        evidenceSource: evidence.source,
        evidenceStatus: (evidence.evidenceStatuses ?? []).join(","),
        sourceTable: evidence.sourceTable,
        descriptionId: evidence.descriptionId,
        localeId: evidence.localeId,
        targetText: evidence.targetText,
        candidateText: evidence.candidateText,
        matchedText: evidence.matchedText,
      });
    }
    builder.upsertSource({
      sourceId,
      sourceKind: "phantom-factor",
      sourceType: "season-phantom-factor",
      sourceEntityId: factor.buffId,
      familyId: factor.familyId,
      sourceName: factor.familyName,
      sourceNames: factor.familyNames,
      iconPath: factor.iconPath,
      runtimeDetection: factor.runtimeDetection ?? "active-buff",
      sourceTable: "SeasonPhantomFactorProbe",
      classGateIds: factor.classGateIds,
      buffIds: [factor.buffId],
      descriptions: factor.descriptions,
      cleanDescriptions: factor.cleanDescriptions,
      modifierEvidence: factor.modifierEvidence,
      targets,
      evidence: [{
        source: "SeasonPhantomFactors",
        relationshipPolicy: factorData.summary?.relationshipPolicy,
      }],
    });
  }
}

function addRecountTalentLinks(builder, recountRows) {
  for (const row of recountRows) {
    if (!row.linkedTalentId) continue;
    builder.upsertSource({
      sourceId: `talent:${row.linkedTalentId}`,
      sourceKind: "talent-passive",
      sourceType: "talent",
      sourceEntityId: row.linkedTalentId,
      sourceName: row.linkedTalentName,
      sourceNames: row.linkedTalentNames,
      runtimeDetection: "row-observed",
      sourceTable: "CTB:3345237628",
      buffIds: row.linkedTalentBuffIds,
      targets: [{
        targetKind: "recount",
        recountId: row.recountId,
        recountName: row.recountName,
        relationshipKind: "produces-recount-row",
        evidenceSource: "RecountTable.LinkedTalentId",
        evidenceStatus: "current-production-recount-talent-bridge",
        bridge: row.talentBridge,
        linkedFormulaIds: row.linkedTalentFormulaIds,
      }],
    });
  }
}

function addSkillBreakdownLinks(builder, breakdown) {
  for (const detail of Object.values(breakdown ?? {})) {
    const damageId = toNumber(detail.Id);
    if (damageId === null) continue;
    const parentRecountId = toNumber(detail.ParentRecountId);
    const parentTalentId = toNumber(detail.ParentTalentId);
    const sourceTalentId = toNumber(detail.SourceTalentId);

    if (parentTalentId !== null) {
      builder.upsertSource({
        sourceId: `talent:${parentTalentId}`,
        sourceKind: "talent-passive",
        sourceType: "talent",
        sourceEntityId: parentTalentId,
        sourceName: detail.ParentTalentName,
        sourceNames: detail.ParentTalentNames,
        runtimeDetection: "row-observed",
        sourceTable: "SkillBreakdownDetails",
        targets: [
          {
            targetKind: "damage",
            damageId,
            relationshipKind: "produces-damage-row",
            evidenceSource: "SkillBreakdownDetails.ParentTalentId",
            evidenceStatus: "current-production-breakdown-talent-bridge",
            parentRecountId,
            category: detail.Category,
          },
        ],
      });
    }

    if (sourceTalentId !== null) {
      builder.upsertSource({
        sourceId: `talent:${sourceTalentId}`,
        sourceKind: "talent-passive",
        sourceType: "talent",
        sourceEntityId: sourceTalentId,
        sourceName: detail.SourceTalentName,
        sourceNames: detail.SourceTalentNames,
        runtimeDetection: "row-observed",
        sourceTable: "SkillBreakdownDetails",
        targets: [{
          targetKind: "damage",
          damageId,
          relationshipKind: "affects-damage-row",
          evidenceSource: "SkillBreakdownDetails.SourceTalentId",
          evidenceStatus: "current-production-source-talent-bridge",
          parentRecountId,
          sourceTalentBridge: detail.SourceTalentBridge,
          category: detail.Category,
        }],
      });
    }
  }
}

function addTalentProbeCatalog(builder, talentProbe) {
  for (const row of talentProbe?.talentRows ?? []) {
    const talentId = toNumber(row.id);
    if (talentId === null) continue;
    builder.upsertSource({
      sourceId: `talent:${talentId}`,
      sourceKind: "talent-passive",
      sourceType: "talent",
      sourceEntityId: talentId,
      sourceName: row.name,
      sourceNames: row.names,
      iconPath: row.iconPath,
      runtimeDetection: "row-observed-or-active-buff",
      sourceTable: row.sourceTable,
      buffIds: uniqueNumbers((row.buffEffectRecords ?? []).map((record) => record.buffId)),
      descriptions: row.descriptions,
      cleanDescriptions: row.cleanDescriptions,
      modifierEvidence: buildDescriptionModifierEvidence({
        source: "TalentEffectModelProbe.talentRows",
        valueStatus: "fixed-description-text",
        descriptionId: row.descriptionId,
        cleanDescriptions: row.cleanDescriptions,
      }),
      evidence: [{
        source: "TalentEffectModelProbe.talentRows",
        sourceOffset: row.sourceOffset,
        descriptionId: row.descriptionId,
      }],
    });
  }
}

function addSeasonTalentNodes(builder, seasonTalentProbe) {
  builder.addDescriptionTargetSources((row) => {
    const nodeId = toNumber(row.id);
    if (nodeId === null) return null;
    return {
      sourceId: `season-talent-node:${nodeId}`,
      sourceKind: "season-talent-node",
      sourceType: "deep-slumber-mind-projection-node",
      sourceEntityId: nodeId,
      sourceName: row.name,
      sourceNames: row.names,
      iconPath: row.alignedBuff?.iconPath,
      runtimeDetection: "active-buff",
      sourceTable: row.sourceTable,
      buffIds: uniqueNumbers([
        row.alignedBuffId,
        row.computedAlignedBuffId,
        ...(row.buffEffectRecords ?? []).map((record) => record.buffId),
      ]),
      descriptions: row.descriptionCandidates?.[0]?.texts,
      cleanDescriptions: row.descriptionCandidates?.[0]?.cleanTexts,
      modifierEvidence: buildDescriptionModifierEvidence({
        source: "SeasonTalentNodeProbe.descriptionCandidates",
        valueStatus: "fixed-description-text",
        descriptionId: row.descriptionCandidates?.[0]?.descriptionId,
        cleanDescriptions: row.descriptionCandidates?.[0]?.cleanTexts,
      }),
      evidence: [{
        source: "SeasonTalentNodeProbe.nodeRows",
        groupIndex: row.groupIndex,
        slotIndex: row.slotIndex,
        alignedBuffBridge: row.alignedBuffBridge,
      }],
    };
  }, (seasonTalentProbe?.nodeRows ?? []).map((row) => ({
    ...row,
    descriptionId: row.descriptionCandidates?.[0]?.descriptionId,
    cleanDescriptions: row.descriptionCandidates?.[0]?.cleanTexts,
    descriptionSourceTable: seasonTalentProbe?.summary?.descriptionSourceTable,
  })));
}

function addSeasonRogueEntries(builder, seasonRogueProbe) {
  builder.addDescriptionTargetSources((row) => {
    const entryId = toNumber(row.entryId);
    if (entryId === null) return null;
    return {
      sourceId: `season-rogue-entry:${entryId}`,
      sourceKind: "season-rogue-entry",
      sourceType: row.entryFamily,
      sourceEntityId: entryId,
      sourceName: row.name,
      sourceNames: row.names,
      iconPath: row.textureIconPath,
      runtimeDetection: "active-buff",
      sourceTable: row.sourceTable,
      buffIds: uniqueNumbers([row.buffId]),
      descriptions: row.descriptions,
      cleanDescriptions: row.cleanDescriptions,
      modifierEvidence: buildDescriptionModifierEvidence({
        source: "SeasonRogueEntryProbe.entries",
        valueStatus: "fixed-description-text",
        descriptionId: row.descriptionId,
        cleanDescriptions: row.cleanDescriptions,
      }),
      evidence: [{
        source: "SeasonRogueEntryProbe.entries",
        difficultyAvailability: row.difficultyAvailability,
        buffIdStatus: row.buffIdStatus,
      }],
    };
  }, (seasonRogueProbe?.entries ?? []).map((row) => ({
    ...row,
    descriptionSourceTable: seasonRogueProbe?.summary?.descriptionSourceTable,
  })));
}

function matchDescriptionTargets(cleanDescriptions, nameIndex, recountRows) {
  const byRecountId = new Map();
  for (const localeId of LOCALES) {
    const text = cleanDescriptions?.[localeId];
    if (!text) continue;
    for (const mention of extractDreamTargets(text, localeId)) {
      for (const candidateText of expandTargetLabels(mention.targetText)) {
        const match = matchLabel(candidateText, localeId, nameIndex, recountRows);
        if (match.rows.length !== 1) continue;
        const row = match.rows[0];
        byRecountId.set(String(row.recountId), {
          recountId: row.recountId,
          recountName: row.recountName,
          localeId,
          targetText: mention.targetText,
          candidateText,
          matchedText: match.matchedText,
          evidenceStatus: match.evidenceStatus,
        });
      }
    }
  }
  return [...byRecountId.values()].sort((left, right) => left.recountId - right.recountId);
}

function extractDreamTargets(text, localeId) {
  const cleanText = cleanMarkup(text);
  const targets = [];
  for (const regex of DREAM_MARKERS) {
    regex.lastIndex = 0;
    for (const match of cleanText.matchAll(regex)) {
      const markerStart = match.index ?? 0;
      const markerEnd = markerStart + match[0].length;
      const beforeTarget = cleanupTargetText(lastClause(cleanText.slice(0, markerStart)));
      const afterTarget = cleanupTargetText(
        firstClause(cleanText.slice(markerEnd).replace(/^\s*(?:of|from|dari|de|da|do|du|del|von|des|\u7684|\u306e|\uc758|\u0e02\u0e2d\u0e07)\s+/i, "")),
      );
      const targetText = afterTarget && (!beforeTarget || /^(?:the|a|an)$/i.test(beforeTarget))
        ? afterTarget
        : beforeTarget;
      if (!targetText || isDefensiveText(targetText) || isDefensiveText(cleanText.slice(markerEnd))) {
        continue;
      }
      targets.push({ localeId, targetText });
    }
  }
  return dedupeBy(targets, (entry) => `${entry.localeId}|${entry.targetText}`);
}

function lastClause(value) {
  return splitTopLevel(value, /[.;\u3002\uff1b]/).at(-1) ?? "";
}

function firstClause(value) {
  return splitTopLevel(value, /[.;\u3002\uff1b+]/)[0] ?? "";
}

function splitTopLevel(value, delimiterRegex) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const char of String(value || "")) {
    if (char === "(" || char === "\uff08") depth += 1;
    else if ((char === ")" || char === "\uff09") && depth > 0) depth -= 1;
    if (depth === 0 && delimiterRegex.test(char)) {
      parts.push(current);
      current = "";
      delimiterRegex.lastIndex = 0;
      continue;
    }
    current += char;
    delimiterRegex.lastIndex = 0;
  }
  parts.push(current);
  return parts;
}

function cleanupTargetText(value) {
  return cleanMarkup(value)
    .replace(/^.*(?:\bafter\b|\bduring\b|\bwhen\b|\bwhile\b)[^,]*,\s*/i, "")
    .replace(/\([^)]*(?:does not affect|unchanged)[^)]*\)/gi, "")
    .replace(/(?:\u306e|\uc758|\u7684)$/g, "")
    .replace(/^(?:and|or|of|from|de|da|do|du|del|von|dari|the|les|le|la|der|die|das|el|los|las|o|os|as)\s+/i, "")
    .replace(/\s*(?:\+|increases(?: by)?|is increased(?: by)?|are increased(?: by)?|increased from|wird um erh\u00f6ht|aumenta(?: em)?|aumentado(?: en)?|เพิ่ม|증가합니다).*$/i, "")
    .replace(/[:：,，;；.。]+$/g, "")
    .trim();
}

function expandTargetLabels(value) {
  const out = new Set();
  const cleaned = cleanupTargetText(value);
  if (!cleaned) return [];
  out.add(cleaned);
  for (const grouped of expandGroupedLabels(cleaned)) out.add(grouped);
  for (const part of splitConjoined(cleaned)) out.add(part);
  return [...out]
    .map(cleanupTargetText)
    .filter((entry) => entry && !isGenericLabel(entry))
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function expandGroupedLabels(value) {
  const out = [];
  for (const match of String(value || "").matchAll(/([^\(\uff08]{1,48})[\(\uff08]([^\)\uff09]+)[\)\uff09]/g)) {
    const prefix = cleanupTargetText(match[1]).replace(/^.*[\s,，、]/, "").trim();
    for (const part of splitConjoined(match[2])) {
      out.push(part);
      if (prefix && !normalizeLabel(part).startsWith(normalizeLabel(prefix))) {
        out.push(/^[A-Za-z0-9]/.test(prefix) && /^[A-Za-z0-9]/.test(part)
          ? `${prefix} ${part}`
          : `${prefix}${part}`);
      }
    }
  }
  return out;
}

function splitConjoined(value) {
  return splitTopLevel(value, /[,，、/]/)
    .flatMap((part) => part.split(/\s+(?:and|or|und|et|y|e|dan)\s+/i))
    .map(cleanupTargetText)
    .filter(Boolean);
}

function matchLabel(label, localeId, nameIndex, recountRows) {
  const normalized = normalizeLabel(label);
  if (!normalized || isGenericLabel(label)) return { rows: [] };
  const exact = uniqueRows(nameIndex.get(`${localeId}|${normalized}`) ?? []);
  if (exact.length) {
    return {
      rows: exact,
      matchedText: label,
      evidenceStatus: "description-target-exact-localized-name",
    };
  }
  const suffix = uniqueRows(recountRows.filter((row) => {
    const name = normalizeLabel(row.recountNames?.[localeId]);
    return isSafeSuffix(normalized, name);
  }));
  return suffix.length === 1
    ? {
      rows: suffix,
      matchedText: label,
      evidenceStatus: "description-target-unique-localized-suffix",
    }
    : { rows: [] };
}

function isSafeSuffix(target, name) {
  if (!target || !name || target === name || !name.endsWith(target)) return false;
  return /^[a-z0-9 ]+$/.test(target)
    ? target.length >= 8 && target.includes(" ")
    : target.length >= 4;
}

function isGenericLabel(value) {
  const normalized = normalizeLabel(value);
  return normalized.length < 3
    || new Set([
      "dream dmg",
      "dreamscape dmg",
      "class skill",
      "ultimate",
      "lucky strike",
      "basic attack",
      "normal attack",
      "\u666e\u901a\u653b\u51fb",
      "\u666e\u901a\u653b\u64ca",
      "\u901a\u5e38\u653b\u6483",
      "\uc77c\ubc18 \uacf5\uaca9",
      "ataque b\u00e1sico",
    ]).has(normalized);
}

function isDefensiveText(value) {
  return /(?:Resistance|Reduction|Resist|Mitigation|Taken|DEF|Reducci|R\u00e9duction|Redu\u00e7|Resist\u00eancia|\u51cf\u514d|\u6e1b\u514d|\u62b5\u6297|\u6297\u6027|\u8efd\u6e1b|\uac10\uba74|\uac10\uc18c|\uc800\ud56d)/i
    .test(String(value || ""));
}

function normalizeLabel(value) {
  return cleanMarkup(value)
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanMarkup(value) {
  return String(value || "")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueRows(rows) {
  const byId = new Map();
  for (const row of rows ?? []) {
    byId.set(String(row.recountId), row);
  }
  return [...byId.values()].sort((left, right) => left.recountId - right.recountId);
}

function dedupeBy(values, keyFn) {
  const seen = new Set();
  const out = [];
  for (const value of values ?? []) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const factorData = readJson(args.factors, {});
  const breakdown = readJson(args.breakdown, {});
  const recount = readJson(args.recount, {});
  const talentProbe = readJson(args.talentProbe, {});
  const seasonTalentProbe = readJson(args.seasonTalentProbe, {});
  const seasonRogueProbe = readJson(args.seasonRogueProbe, {});
  const recountRows = collectRecountRows(recount);

  const builder = new EffectSourceBuilder(recountRows);
  addPhantomFactors(builder, factorData);
  addTalentProbeCatalog(builder, talentProbe);
  addRecountTalentLinks(builder, recountRows);
  addSkillBreakdownLinks(builder, breakdown);
  addSeasonTalentNodes(builder, seasonTalentProbe);
  addSeasonRogueEntries(builder, seasonRogueProbe);

  const effectSourceIds = Object.keys(builder.effectSourcesById).sort((a, b) => a.localeCompare(b));
  const data = {
    summary: {
      source: "export-effect-sources",
      generatedFrom: {
        factors: path.relative(repoRoot, args.factors).replaceAll("\\", "/"),
        breakdown: path.relative(repoRoot, args.breakdown).replaceAll("\\", "/"),
        recount: path.relative(repoRoot, args.recount).replaceAll("\\", "/"),
        talentProbe: path.relative(repoRoot, args.talentProbe).replaceAll("\\", "/"),
        seasonTalentProbe: path.relative(repoRoot, args.seasonTalentProbe).replaceAll("\\", "/"),
        seasonRogueProbe: path.relative(repoRoot, args.seasonRogueProbe).replaceAll("\\", "/"),
      },
      effectSources: effectSourceIds.length,
      activeBuffDetectableSources: effectSourceIds.filter((id) =>
        builder.effectSourcesById[id]?.runtimeDetection?.includes("active-buff")
        && builder.effectSourcesById[id]?.buffIds?.length,
      ).length,
      buffIds: Object.keys(builder.buffIdToEffectSourceIds).length,
      recountRowsWithEffectSources: Object.keys(builder.recountIdToEffectSourceIds).length,
      damageRowsWithEffectSources: Object.keys(builder.damageIdToEffectSourceIds).length,
      sourcesWithModifierEvidence: effectSourceIds.filter((id) =>
        builder.effectSourcesById[id]?.modifierEvidence,
      ).length,
      relationshipPolicy:
        "This file is an evidence index. It exposes affected-by/produced-by relationships only; it does not calculate damage contribution unless a later source proves formula semantics and runtime selection.",
    },
    effectSourceIds,
    effectSourcesById: Object.fromEntries(
      effectSourceIds.map((id) => [id, builder.effectSourcesById[id]]),
    ),
    buffIdToEffectSourceIds: sortIndex(builder.buffIdToEffectSourceIds),
    damageIdToEffectSourceIds: sortIndex(builder.damageIdToEffectSourceIds),
    recountIdToEffectSourceIds: sortIndex(builder.recountIdToEffectSourceIds),
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${path.relative(repoRoot, args.out)} (${data.summary.effectSources} sources, ${data.summary.recountRowsWithEffectSources} recount rows, ${data.summary.damageRowsWithEffectSources} damage rows).`,
  );
}

function sortIndex(index) {
  return Object.fromEntries(
    Object.entries(index)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([key, value]) => [key, uniqueStrings(value)]),
  );
}

main();
