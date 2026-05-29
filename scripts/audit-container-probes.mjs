import fs from "node:fs";
import path from "node:path";

function argValues(flag) {
  const values = [];
  for (let i = 2; i < process.argv.length - 1; i += 1) {
    if (process.argv[i] === flag) {
      values.push(process.argv[i + 1]);
      i += 1;
    }
  }
  return values;
}

function argValue(flag, fallback = null) {
  return argValues(flag).at(-1) ?? fallback;
}

function defaultInputRoots() {
  const roots = [];
  if (process.env.APPDATA) {
    roots.push(path.join(process.env.APPDATA, "com.resonance-logs-global", "EventLogs"));
  }
  if (process.env.LOCALAPPDATA) {
    roots.push(path.join(process.env.LOCALAPPDATA, "com.resonance-logs-global", "EventLogs"));
  }
  return roots;
}

function collectJsonFiles(inputPath, out) {
  if (!inputPath || !fs.existsSync(inputPath)) return;
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    if (inputPath.toLowerCase().endsWith(".json")) out.push(inputPath);
    return;
  }
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
    const child = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(child, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      out.push(child);
    }
  }
}

function readSessionFile(filePath) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    return { payload, entries };
  } catch {
    return null;
  }
}

function resolveExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function loadFactorCatalog(filePath) {
  if (!filePath) {
    return {
      path: null,
      factorByBuffId: new Map(),
      factorByFamilyId: new Map(),
      factorByGradeItemId: new Map(),
      factorByAffectedDamageId: new Map(),
    };
  }

  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const factorsByBuffId = payload?.factorsByBuffId ?? {};
  const factorByBuffId = new Map();
  const factorByFamilyId = new Map();
  const factorByGradeItemId = new Map();
  const factorByAffectedDamageId = new Map();

  for (const [buffIdText, factor] of Object.entries(factorsByBuffId)) {
    const buffId = Number(buffIdText);
    if (!Number.isFinite(buffId)) continue;

    const base = {
      factorBuffId: buffId,
      familyId: factor.familyId ?? null,
      familyName: factor.familyNames?.en ?? factor.familyName ?? `factor:${buffId}`,
      iconPath: factor.iconPath ?? null,
      classGateIds: Array.isArray(factor.classGateIds) ? factor.classGateIds : [],
      affectedDamageIds: Array.isArray(factor.affectedDamageIds) ? factor.affectedDamageIds : [],
      affectedRecountIds: Array.isArray(factor.affectedRecountIds) ? factor.affectedRecountIds : [],
      cleanDescription: factor.cleanDescriptions?.en ?? null,
    };
    factorByBuffId.set(String(buffId), base);
    if (base.familyId !== null && base.familyId !== undefined) {
      factorByFamilyId.set(String(base.familyId), base);
    }
    for (const damageId of base.affectedDamageIds) {
      const key = String(damageId);
      const existing = factorByAffectedDamageId.get(key) ?? [];
      existing.push(base);
      factorByAffectedDamageId.set(key, existing);
    }

    const gradeRows = Array.isArray(factor.modifierEvidence?.gradeRows)
      ? factor.modifierEvidence.gradeRows
      : [];
    for (const gradeRow of gradeRows) {
      const itemId = Number(gradeRow.itemId);
      if (!Number.isFinite(itemId)) continue;
      factorByGradeItemId.set(String(itemId), {
        ...base,
        grade: gradeRow.grade ?? null,
        itemId,
        itemQualityTier: gradeRow.itemQualityTier ?? null,
        parameterValues: Array.isArray(gradeRow.parameterValues) ? gradeRow.parameterValues : [],
        valueTexts: Array.isArray(gradeRow.valueTexts) ? gradeRow.valueTexts : [],
        cleanResolvedDescription: gradeRow.cleanResolvedDescription ?? base.cleanDescription,
      });
    }
  }

  return { path: filePath, factorByBuffId, factorByFamilyId, factorByGradeItemId, factorByAffectedDamageId };
}

function loadSeasonalTalentCatalog(filePath) {
  if (!filePath) {
    return {
      path: null,
      byUid: new Map(),
      findByValue: () => null,
    };
  }

  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const entriesByUid = payload?.entriesByUid ?? {};
  const byUid = new Map();
  for (const [uidText, entry] of Object.entries(entriesByUid)) {
    const uid = Number(uidText);
    if (!Number.isFinite(uid)) continue;
    byUid.set(String(uid), {
      uid,
      name: entry?.names?.en ?? entry?.name ?? `seasonal-talent:${uid}`,
      designName: entry?.names?.design ?? null,
      cleanDescription: entry?.cleanDescription ?? entry?.description ?? null,
      names: entry?.names ?? {},
    });
  }

  return {
    path: filePath,
    byUid,
    findByValue(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return null;
      const direct = byUid.get(String(numericValue));
      if (direct) {
        return {
          ...direct,
          runtimeNodeId: numericValue,
          canonicalNodeId: numericValue,
          nodeIdEncoding: "direct-seasonal-talent-node-id",
        };
      }
      if (numericValue >= 100_000 && numericValue <= 199_999) {
        const canonicalNodeId = numericValue - 100_000;
        const mapped = byUid.get(String(canonicalNodeId));
        if (mapped) {
          return {
            ...mapped,
            runtimeNodeId: numericValue,
            canonicalNodeId,
            nodeIdEncoding: "season-medal-core-node-id-minus-100000",
          };
        }
      }
      return null;
    },
  };
}

function parseEntryRaw(entry) {
  try {
    return JSON.parse(entry.raw ?? "null");
  } catch {
    return null;
  }
}

function formatCountMap(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([key, count]) => ({ key, count }));
}

function formatValueCountMap(map, valueMeta) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([key, count]) => ({
      key,
      count,
      label: valueMeta.get(String(key))?.label ?? "",
      evidenceType: valueMeta.get(String(key))?.evidenceType ?? "",
      grade: valueMeta.get(String(key))?.grade ?? null,
      values: valueMeta.get(String(key))?.values ?? [],
    }));
}

function enrichCandidate(candidate, factorCatalog) {
  const value = String(candidate.value ?? "");
  const gradeMatch = factorCatalog.factorByGradeItemId.get(value);
  if (gradeMatch) {
    return {
      ...candidate,
      evidenceType: "seasonal-factor-grade-item",
      label: `${gradeMatch.familyName} G${gradeMatch.grade}`,
      factorBuffId: gradeMatch.factorBuffId,
      familyId: gradeMatch.familyId,
      familyName: gradeMatch.familyName,
      itemId: gradeMatch.itemId,
      grade: gradeMatch.grade,
      itemQualityTier: gradeMatch.itemQualityTier,
      valueTexts: gradeMatch.valueTexts,
      cleanResolvedDescription: gradeMatch.cleanResolvedDescription,
      affectedDamageIds: gradeMatch.affectedDamageIds,
      affectedRecountIds: gradeMatch.affectedRecountIds,
    };
  }

  const familyMatch = factorCatalog.factorByFamilyId.get(value);
  if (familyMatch) {
    return {
      ...candidate,
      evidenceType: "seasonal-factor-family-id",
      label: familyMatch.familyName,
      factorBuffId: familyMatch.factorBuffId,
      familyId: familyMatch.familyId,
      familyName: familyMatch.familyName,
      iconPath: familyMatch.iconPath,
      classGateIds: familyMatch.classGateIds,
      affectedDamageIds: familyMatch.affectedDamageIds,
      affectedRecountIds: familyMatch.affectedRecountIds,
      cleanDescription: familyMatch.cleanDescription,
    };
  }

  const buffMatch = factorCatalog.factorByBuffId.get(value);
  if (buffMatch) {
    return {
      ...candidate,
      evidenceType: "seasonal-factor-buff-id",
      label: buffMatch.familyName,
      factorBuffId: buffMatch.factorBuffId,
      familyId: buffMatch.familyId,
      familyName: buffMatch.familyName,
      iconPath: buffMatch.iconPath,
      classGateIds: buffMatch.classGateIds,
      affectedDamageIds: buffMatch.affectedDamageIds,
      affectedRecountIds: buffMatch.affectedRecountIds,
      cleanDescription: buffMatch.cleanDescription,
    };
  }

  const affectedDamageMatches = factorCatalog.factorByAffectedDamageId.get(value) ?? [];
  if (affectedDamageMatches.length) {
    const primary = affectedDamageMatches[0];
    return {
      ...candidate,
      evidenceType: "seasonal-factor-affected-damage-id",
      label: affectedDamageMatches.map((match) => match.familyName).join(" / "),
      factorBuffId: affectedDamageMatches.length === 1 ? primary.factorBuffId : null,
      familyId: affectedDamageMatches.length === 1 ? primary.familyId : null,
      familyName: affectedDamageMatches.length === 1 ? primary.familyName : null,
      iconPath: affectedDamageMatches.length === 1 ? primary.iconPath : null,
      classGateIds: affectedDamageMatches.length === 1 ? primary.classGateIds : [],
      affectedDamageIds: [Number(value)].filter(Number.isFinite),
      affectedRecountIds: affectedDamageMatches.flatMap((match) => match.affectedRecountIds ?? []),
      cleanDescription: affectedDamageMatches.length === 1 ? primary.cleanDescription : null,
      matchedFactors: affectedDamageMatches.map((match) => ({
        factorBuffId: match.factorBuffId,
        familyId: match.familyId,
        familyName: match.familyName,
      })),
    };
  }

  return {
    ...candidate,
    evidenceType: "unresolved-factor-candidate",
    label: "",
  };
}

function enrichContainerCandidate(candidate, factorCatalog, seasonalTalentCatalog) {
  const value = String(candidate.value ?? "");
  const seasonalTalent = seasonalTalentCatalog.findByValue(value);
  if (seasonalTalent) {
    return {
      ...candidate,
      evidenceType:
        candidate.kind === "season-medal-core-node-id"
          ? "season-medal-core-node-id"
          : "seasonal-talent-node-id",
      label: seasonalTalent.name,
      seasonalTalentUid: seasonalTalent.uid,
      runtimeNodeId: seasonalTalent.runtimeNodeId,
      canonicalNodeId: seasonalTalent.canonicalNodeId,
      nodeIdEncoding: seasonalTalent.nodeIdEncoding,
      cleanDescription: seasonalTalent.cleanDescription,
      designName: seasonalTalent.designName,
    };
  }

  return enrichCandidate(candidate, factorCatalog);
}

function classifySeasonalTalentProbeValue(value, seasonalTalentCatalog) {
  const match = seasonalTalentCatalog.findByValue(value);
  if (!match) return null;
  if (Number(value) >= 100_000 && Number(value) <= 199_999) return "season-medal-core-node-id";
  if (Number(value) < 1_000) return null;
  return "seasonal-talent-node-id";
}

function pushSeasonalTalentBufferCandidate(rows, seen, offset, encoding, value, seasonalTalentCatalog) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 0xffffffff) return;
  const kind = classifySeasonalTalentProbeValue(numericValue, seasonalTalentCatalog);
  if (!kind) return;
  const key = `${offset}:${encoding}:${numericValue}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({
    offset,
    encoding,
    kind,
    value: numericValue,
    source: "buffer-hex-rescan",
  });
}

function scanBufferHexSeasonalTalentCandidates(bufferHex, seasonalTalentCatalog) {
  if (!bufferHex || typeof bufferHex !== "string") return [];
  let buffer;
  try {
    buffer = Buffer.from(bufferHex, "hex");
  } catch {
    return [];
  }
  const rows = [];
  const seen = new Set();
  for (let offset = 0; offset < buffer.length; offset += 1) {
    if (offset + 4 <= buffer.length) {
      pushSeasonalTalentBufferCandidate(
        rows,
        seen,
        offset,
        "u32-le",
        buffer.readUInt32LE(offset),
        seasonalTalentCatalog,
      );
    }

    let value = 0;
    let shift = 0;
    for (let width = 0; width < 5; width += 1) {
      const byte = buffer[offset + width];
      if (byte === undefined) break;
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        pushSeasonalTalentBufferCandidate(rows, seen, offset, "varint", value >>> 0, seasonalTalentCatalog);
        break;
      }
      shift += 7;
    }
    if (rows.length >= 512) break;
  }
  return rows.sort((left, right) => Number(left.value) - Number(right.value) || left.offset - right.offset);
}

const DIRTY_TREE_DELIMITER = 0xdeadbeef;

function findDirtyTreeDelimiter(buffer, startOffset) {
  for (let offset = startOffset; offset + 4 <= buffer.length; offset += 1) {
    if (buffer.readUInt32LE(offset) === DIRTY_TREE_DELIMITER) return offset;
  }
  return -1;
}

function decodeDirtyTreeScalar(segment) {
  if (!segment.length) return null;
  if (segment.length === 4) {
    const signed = segment.readInt32LE(0);
    return signed < 0 ? signed : segment.readUInt32LE(0);
  }
  if (segment.length === 8) {
    const highSigned = segment.readInt32LE(4);
    const lowSigned = segment.readInt32LE(0);
    if (highSigned === 0) return segment.readUInt32LE(0);
    if (highSigned === -1 && lowSigned < 0) return lowSigned;
    const big = segment.readBigInt64LE(0);
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    if (big <= maxSafe && big >= minSafe) return Number(big);
  }
  return null;
}

function dirtyTreeTokens(bufferHex) {
  if (!bufferHex || typeof bufferHex !== "string") return [];
  let buffer;
  try {
    buffer = Buffer.from(bufferHex, "hex");
  } catch {
    return [];
  }

  const tokens = [];
  let offset = 0;
  while (offset < buffer.length) {
    const delimiterOffset = findDirtyTreeDelimiter(buffer, offset);
    if (delimiterOffset < 0) break;
    const segment = buffer.subarray(offset, delimiterOffset);
    const value = decodeDirtyTreeScalar(segment);
    if (value !== null) {
      tokens.push({
        value,
        offset,
        byteLength: segment.length,
        delimiterOffset,
        rawHex: segment.toString("hex"),
      });
    }
    offset = delimiterOffset + 4;
  }
  return tokens;
}

function decodeDirtyContainerTree(bufferHex) {
  const tokens = dirtyTreeTokens(bufferHex);
  if (!tokens.length) return null;

  const valueNodes = [];
  let cursor = 0;

  function parseChildren(pathPrefix, bodyEndOffset, ancestors) {
    const children = [];
    let childIndex = 0;

    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (bodyEndOffset !== null && token.offset >= bodyEndOffset) break;
      if (token.value === -3) {
        cursor += 1;
        break;
      }

      const nodePath = pathPrefix ? `${pathPrefix}.${childIndex}` : String(childIndex);
      if (token.value === -2 && cursor + 1 < tokens.length) {
        const lengthToken = tokens[cursor + 1];
        const bodyStartOffset = tokens[cursor + 2]?.offset ?? lengthToken.delimiterOffset + 4;
        const blockLength = Number(lengthToken.value);
        cursor += 2;
        const blockEndOffset =
          Number.isFinite(blockLength) && blockLength >= 0 ? bodyStartOffset + blockLength : null;
        const blockAncestors = [...ancestors, { path: nodePath, length: blockLength }];
        const block = {
          kind: "block",
          path: nodePath,
          length: blockLength,
          offset: token.offset,
          bodyStartOffset,
          bodyEndOffset: blockEndOffset,
          children: parseChildren(nodePath, blockEndOffset, blockAncestors),
        };
        if (tokens[cursor]?.value === -3) cursor += 1;
        children.push(block);
      } else {
        const node = {
          kind: "value",
          path: nodePath,
          value: token.value,
          offset: token.offset,
          byteLength: token.byteLength,
          rawHex: token.rawHex,
          ancestorBlockLengths: ancestors.map((ancestor) => ancestor.length),
          treeSignature: ancestors.map((ancestor) => `${ancestor.path}:${ancestor.length}`).join(">"),
        };
        valueNodes.push(node);
        children.push(node);
        cursor += 1;
      }

      childIndex += 1;
    }

    return children;
  }

  const children = parseChildren("", null, []);
  return {
    tokenCount: tokens.length,
    valueNodes,
    children,
  };
}

function dirtyTreeFactorGradeCandidates(dirtyTree, factorCatalog) {
  if (!dirtyTree) return [];
  const rows = [];
  const seen = new Set();
  for (const node of dirtyTree.valueNodes) {
    const gradeMatch = factorCatalog.factorByGradeItemId.get(String(node.value));
    if (!gradeMatch) continue;
    const key = `${node.path}:${node.offset}:${node.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      offset: node.offset,
      encoding: node.byteLength === 8 ? "i64-le" : "i32-le",
      kind: "seasonal-factor-grade-item-id",
      value: node.value,
      source: "dirty-tree",
      treePath: node.path,
      treeSignature: node.treeSignature,
      ancestorBlockLengths: node.ancestorBlockLengths,
    });
  }
  return rows;
}

function compactDirtyTreeValueNode(node) {
  return {
    path: node.path,
    value: node.value,
    offset: node.offset,
    byteLength: node.byteLength,
    treeSignature: node.treeSignature,
    ancestorBlockLengths: node.ancestorBlockLengths,
  };
}

function annotateDirtyTreeSelectedTransitions(rows, factorCatalog) {
  const groups = new Map();
  for (const row of rows) {
    for (const node of row._dirtyTreeValueNodes ?? []) {
      const gradeMatch = factorCatalog.factorByGradeItemId.get(String(node.value));
      if (node.value !== 0 && !gradeMatch) continue;
      const key = `${row.file}\u0000${node.path}\u0000${node.treeSignature}`;
      const entries = groups.get(key) ?? [];
      entries.push({ row, node, gradeMatch, isZero: node.value === 0 });
      groups.set(key, entries);
    }
  }

  const transitions = [];
  for (const entries of groups.values()) {
    entries.sort(
      (left, right) =>
        (Number(left.row.tsMs) || 0) - (Number(right.row.tsMs) || 0) ||
        (Number(left.row.rowIndex) || 0) - (Number(right.row.rowIndex) || 0) ||
        left.node.offset - right.node.offset,
    );

    const zeroEntries = [];
    const seen = new Set();
    for (const entry of entries) {
      if (entry.isZero) {
        zeroEntries.push(entry);
        continue;
      }
      if (!entry.gradeMatch) continue;
      const previousZero = [...zeroEntries]
        .reverse()
        .find((zero) => Number(zero.row.rowIndex) < Number(entry.row.rowIndex));
      if (!previousZero) continue;

      const gradeMatch = entry.gradeMatch;
      const transitionKey = `${entry.row.rowIndex}:${entry.node.path}:${entry.node.offset}:${gradeMatch.itemId}`;
      if (seen.has(transitionKey)) continue;
      seen.add(transitionKey);

      const transition = {
        evidenceType: "dirty-tree-zero-to-grade-selected-slot",
        proofClass: "dirty-tree-zero-to-grade-selected-slot",
        factorBuffId: gradeMatch.factorBuffId,
        familyId: gradeMatch.familyId,
        familyName: gradeMatch.familyName,
        itemConfigId: gradeMatch.itemId,
        grade: gradeMatch.grade,
        itemQualityTier: gradeMatch.itemQualityTier,
        valueTexts: gradeMatch.valueTexts,
        cleanResolvedDescription: gradeMatch.cleanResolvedDescription,
        treePath: entry.node.path,
        treeSignature: entry.node.treeSignature,
        ancestorBlockLengths: entry.node.ancestorBlockLengths,
        zeroValue: {
          rowIndex: previousZero.row.rowIndex,
          tsMs: previousZero.row.tsMs,
          offset: previousZero.node.offset,
          bufferLength: previousZero.row.bufferLength,
          file: path.basename(previousZero.row.file),
        },
        gradeValue: {
          rowIndex: entry.row.rowIndex,
          tsMs: entry.row.tsMs,
          offset: entry.node.offset,
          bufferLength: entry.row.bufferLength,
          file: path.basename(entry.row.file),
        },
        rowDistance: Number(entry.row.rowIndex) - Number(previousZero.row.rowIndex),
        msAfterZero:
          Number.isFinite(Number(entry.row.tsMs)) && Number.isFinite(Number(previousZero.row.tsMs))
            ? Number(entry.row.tsMs) - Number(previousZero.row.tsMs)
            : null,
      };
      entry.row.dirtyTreeSelectedTransitionCandidates.push(transition);
      transitions.push(transition);
    }
  }

  for (const row of rows) {
    row.dirtyTreeSelectedTransitionCandidateCount = row.dirtyTreeSelectedTransitionCandidates.length;
  }
  return transitions;
}

function enrichSeasonMedalNode(node, seasonalTalentCatalog) {
  const nodeId = Number(node?.nodeId ?? node?.node_id ?? node?.runtimeNodeId ?? node?.runtime_node_id);
  const canonicalNodeId = Number(
    node?.canonicalNodeId ?? node?.canonical_node_id ?? (nodeId >= 100_000 ? nodeId - 100_000 : nodeId),
  );
  const match =
    seasonalTalentCatalog.findByValue(nodeId) ??
    (Number.isFinite(canonicalNodeId) ? seasonalTalentCatalog.findByValue(canonicalNodeId) : null);
  return {
    ...node,
    label: match?.name ?? "",
    seasonalTalentUid: match?.uid ?? (Number.isFinite(canonicalNodeId) ? canonicalNodeId : null),
    canonicalNodeId: Number.isFinite(canonicalNodeId) ? canonicalNodeId : null,
    cleanDescription: match?.cleanDescription ?? null,
  };
}

function collectSeasonMedalSelectedNodes(raw, seasonalTalentCatalog) {
  const rows = Array.isArray(raw?.seasonMedal?.selectedCoreHoleNodeInfos)
    ? raw.seasonMedal.selectedCoreHoleNodeInfos
    : [];
  return rows.map((row) => enrichSeasonMedalNode(row, seasonalTalentCatalog));
}

function collectSeasonMedalChooseNodes(raw, seasonalTalentCatalog) {
  const rows = Array.isArray(raw?.chooseCoreSeasonHoleNode?.chosenNodeIds)
    ? raw.chooseCoreSeasonHoleNode.chosenNodeIds
    : [];
  return rows.map((row) => enrichSeasonMedalNode(row, seasonalTalentCatalog));
}

function compactCandidateMeta(candidate) {
  return {
    label: candidate.label ?? "",
    evidenceType: candidate.evidenceType ?? "",
    grade: candidate.grade ?? null,
    values: Array.isArray(candidate.valueTexts) ? candidate.valueTexts : [],
  };
}

function candidateFactorRefs(candidate) {
  if (candidate.factorBuffId) {
    return [
      {
        factorBuffId: candidate.factorBuffId,
        familyId: candidate.familyId ?? null,
        familyName: candidate.familyName ?? candidate.label ?? `factor:${candidate.factorBuffId}`,
      },
    ];
  }

  if (!Array.isArray(candidate.matchedFactors)) return [];
  return candidate.matchedFactors
    .map((match) => ({
      factorBuffId: match.factorBuffId,
      familyId: match.familyId ?? null,
      familyName: match.familyName ?? candidate.label ?? `factor:${match.factorBuffId}`,
    }))
    .filter((match) => match.factorBuffId);
}

function buildFactorGroups(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    for (const factorRef of candidateFactorRefs(candidate)) {
      const key = String(factorRef.factorBuffId);
      let group = groups.get(key);
      if (!group) {
        group = {
          factorBuffId: factorRef.factorBuffId,
          familyId: factorRef.familyId,
          familyName: factorRef.familyName,
          familyCandidateCount: 0,
          buffCandidateCount: 0,
          affectedDamageCandidateCount: 0,
          gradeCandidateCount: 0,
          familyCandidateValues: [],
          buffCandidateValues: [],
          affectedDamageCandidateValues: [],
          gradeItems: [],
          grades: [],
          valueTexts: [],
          candidateSources: [],
          rawProtoPaths: [],
          minOffset: null,
          maxOffset: null,
        };
        groups.set(key, group);
      }

      group.candidateSources.push(candidate.source ?? "unknown");
      if (candidate.path) group.rawProtoPaths.push(candidate.path);
      if (Number.isFinite(Number(candidate.offset))) {
        const offset = Number(candidate.offset);
        group.minOffset = group.minOffset === null ? offset : Math.min(group.minOffset, offset);
        group.maxOffset = group.maxOffset === null ? offset : Math.max(group.maxOffset, offset);
      }

      if (candidate.evidenceType === "seasonal-factor-family-id") {
        group.familyCandidateCount += 1;
        group.familyCandidateValues.push(candidate.value);
      } else if (candidate.evidenceType === "seasonal-factor-buff-id") {
        group.buffCandidateCount += 1;
        group.buffCandidateValues.push(candidate.value);
      } else if (candidate.evidenceType === "seasonal-factor-affected-damage-id") {
        group.affectedDamageCandidateCount += 1;
        group.affectedDamageCandidateValues.push(candidate.value);
      } else if (candidate.evidenceType === "seasonal-factor-grade-item") {
        group.gradeCandidateCount += 1;
        group.gradeItems.push(candidate.itemId);
        group.grades.push(candidate.grade);
        for (const valueText of candidate.valueTexts ?? []) group.valueTexts.push(valueText);
      }
    }
  }

  return [...groups.values()].map((group) => {
    const hasIdentity = group.familyCandidateCount > 0 || group.buffCandidateCount > 0;
    const hasAffectedIdentity = group.affectedDamageCandidateCount > 0;
    const hasGrade = group.gradeCandidateCount > 0;
    const identityLabel =
      group.familyCandidateCount > 0 && group.buffCandidateCount > 0
        ? "family-buff"
        : group.familyCandidateCount > 0
          ? "family"
          : group.buffCandidateCount > 0
            ? "buff"
            : "affected-damage";
    const status =
      hasIdentity && hasGrade
        ? `${identityLabel}-and-grade-seen`
        : hasAffectedIdentity && hasGrade
          ? "affected-damage-and-grade-seen"
          : hasGrade
          ? "grade-item-only-seen"
          : group.familyCandidateCount > 0
            ? "family-id-only-seen"
            : group.buffCandidateCount > 0
              ? "buff-id-only-seen"
              : "affected-damage-only-seen";
    const proofClass =
      hasIdentity && hasGrade
        ? "same-payload-identity-grade-candidate"
        : hasAffectedIdentity && hasGrade
          ? "same-payload-affected-grade-candidate"
          : hasGrade
            ? "grade-only-capture-clue"
            : hasIdentity
              ? "identity-only-capture-clue"
              : "affected-only-capture-clue";
    return {
      ...group,
      status,
      proofClass,
      familyCandidateValues: [...new Set(group.familyCandidateValues)],
      buffCandidateValues: [...new Set(group.buffCandidateValues)],
      affectedDamageCandidateValues: [...new Set(group.affectedDamageCandidateValues)],
      gradeItems: [...new Set(group.gradeItems)],
      grades: [...new Set(group.grades)].sort((left, right) => Number(left) - Number(right)),
      valueTexts: [...new Set(group.valueTexts)],
      candidateSources: [...new Set(group.candidateSources)].sort((left, right) => left.localeCompare(right)),
      rawProtoPaths: [...new Set(group.rawProtoPaths)].slice(0, 12).sort((left, right) => left.localeCompare(right)),
    };
  });
}

const inputs = argValues("--input");
const roots = inputs.length ? inputs : defaultInputRoots();
const outJson = argValue("--out-json", "DEV_exports/container-probe-audit.json");
const outMd = argValue("--out-md", "DEV_exports/container-probe-audit.md");
const maxBytes = Number(argValue("--max-bytes", "0"));
const factorCatalogPath = resolveExistingPath([
  argValue("--factors"),
  "parser-data/generated/SeasonPhantomFactors.json",
  "../BPSR-UID-Extractors/output/SeasonPhantomFactors.json",
]);
const factorCatalog = loadFactorCatalog(factorCatalogPath);
const seasonalTalentCatalogPath = resolveExistingPath([
  argValue("--seasonal-talents"),
  "parser-data/generated/SeasonalTalentDescriptions.json",
  "../BPSR-UID-Extractors/output/SeasonalTalentDescriptions.json",
]);
const seasonalTalentCatalog = loadSeasonalTalentCatalog(seasonalTalentCatalogPath);

const files = [];
for (const root of roots) collectJsonFiles(root, files);
files.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

const maxFiles = Number(argValue("--max-files", "80"));
const sizeLimitedFiles = [];
const skippedLargeFiles = [];
for (const filePath of files) {
  const size = fs.statSync(filePath).size;
  if (Number.isFinite(maxBytes) && maxBytes > 0 && size > maxBytes) {
    skippedLargeFiles.push({ file: filePath, bytes: size });
    continue;
  }
  sizeLimitedFiles.push(filePath);
}
const scannedFiles = sizeLimitedFiles.slice(0, Number.isFinite(maxFiles) && maxFiles > 0 ? maxFiles : 80);
const byValue = new Map();
const byKind = new Map();
const byLabel = new Map();
const byEvidenceType = new Map();
const bySource = new Map();
const byAction = new Map();
const valueMeta = new Map();
const rows = [];

for (const filePath of scannedFiles) {
  const session = readSessionFile(filePath);
  if (!session) continue;
  const probeEntries = session.entries.filter((entry) => {
    if (
      entry.category === "container_probe" &&
      (entry.action === "sync_container_dirty" ||
        entry.action === "sync_container" ||
        entry.action === "choose_core_season_hole_node")
    ) {
      return true;
    }
    return entry.category === "raw_service_probe" || entry.category === "service_probe";
  });
  if (!probeEntries.length) continue;

  for (const entry of probeEntries) {
    const raw = parseEntryRaw(entry);
    const hasStructuredContainerProbe =
      raw?.probe === "sync-container" ||
      raw?.probe === "sync-container-dirty" ||
      raw?.probe === "choose-core-season-hole-node";
    const hasRawServiceSeasonalProbe =
      Array.isArray(raw?.seasonalCandidates) || Array.isArray(raw?.seasonalRawProtoCandidates);
    if (!hasStructuredContainerProbe && !hasRawServiceSeasonalProbe) continue;

    const dirtyTree =
      raw?.probe === "sync-container-dirty" && typeof raw?.bufferHex === "string"
        ? decodeDirtyContainerTree(raw.bufferHex)
        : null;
    const dirtyTreeRawCandidates = dirtyTreeFactorGradeCandidates(dirtyTree, factorCatalog);
    const rawCandidates = [
      ...(Array.isArray(raw?.factorCandidates)
        ? raw.factorCandidates.map((candidate) => ({ ...candidate, source: "offset-scan" }))
        : []),
      ...(Array.isArray(raw?.rawProtoCandidates)
        ? raw.rawProtoCandidates.map((candidate) => ({ ...candidate, source: "raw-proto" }))
        : []),
      ...(Array.isArray(raw?.seasonalCandidates)
        ? raw.seasonalCandidates.map((candidate) => ({
            ...candidate,
            source: "raw-service-offset-scan",
          }))
        : []),
      ...(Array.isArray(raw?.seasonalRawProtoCandidates)
        ? raw.seasonalRawProtoCandidates.map((candidate) => ({
            ...candidate,
            source: "raw-service-raw-proto",
          }))
        : []),
      ...(Array.isArray(raw?.jsonCandidates)
        ? raw.jsonCandidates.map((candidate) => ({ ...candidate, source: "typed-json" }))
        : []),
      ...(Array.isArray(raw?.equippedFactorItems)
        ? raw.equippedFactorItems.map((item) => ({
            value: item.itemConfigId,
            kind: "seasonal-factor-grade-item",
            source: "equipped-factor-item",
            equippedFactorItem: item,
          }))
        : []),
      ...scanBufferHexSeasonalTalentCandidates(raw?.bufferHex, seasonalTalentCatalog),
      ...dirtyTreeRawCandidates,
    ];
    const candidates = rawCandidates.map((candidate) =>
      enrichContainerCandidate(candidate, factorCatalog, seasonalTalentCatalog),
    );
    const action = String(entry.action ?? "unknown");
    const seasonMedalSelectedNodes = collectSeasonMedalSelectedNodes(raw, seasonalTalentCatalog);
    const seasonMedalChooseNodes = collectSeasonMedalChooseNodes(raw, seasonalTalentCatalog);
    byAction.set(action, (byAction.get(action) ?? 0) + 1);
    for (const candidate of candidates) {
      const value = String(candidate.value ?? "");
      if (!value) continue;
      byValue.set(value, (byValue.get(value) ?? 0) + 1);
      const kind = String(candidate.kind ?? "unknown");
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      const evidenceType = String(candidate.evidenceType ?? "unknown");
      byEvidenceType.set(evidenceType, (byEvidenceType.get(evidenceType) ?? 0) + 1);
      const source = String(candidate.source ?? "unknown");
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
      if (candidate.label) byLabel.set(candidate.label, (byLabel.get(candidate.label) ?? 0) + 1);
      if (!valueMeta.has(value)) valueMeta.set(value, compactCandidateMeta(candidate));
    }
    const factorGroups = buildFactorGroups(candidates);
    const samePayloadSelectorCandidateGroups = factorGroups.filter(
      (group) =>
        group.proofClass === "same-payload-identity-grade-candidate" ||
        group.proofClass === "same-payload-affected-grade-candidate",
    );
    const dirtyTreeGradeCandidates = candidates.filter(
      (candidate) => candidate.source === "dirty-tree" && candidate.evidenceType === "seasonal-factor-grade-item",
    );
    const dirtyTreeValuePreview = (dirtyTree?.valueNodes ?? [])
      .filter((node) => node.value === 0 || factorCatalog.factorByGradeItemId.has(String(node.value)))
      .slice(0, 80)
      .map(compactDirtyTreeValueNode);
    rows.push({
      rowIndex: rows.length,
      file: filePath,
      tsMs: entry.tsMs ?? entry.ts_ms ?? null,
      category: entry.category ?? null,
      action,
      probe: raw?.probe ?? null,
      summary: entry.summary ?? null,
      bufferLength: raw?.bufferLength ?? raw?.vdataBytesLength ?? raw?.payloadLength ?? null,
      candidateCount: candidates.length,
      offsetCandidateCount: raw?.factorCandidateCount ?? raw?.seasonalCandidateCount ?? null,
      rawProtoCandidateCount: raw?.rawProtoCandidateCount ?? raw?.seasonalRawProtoCandidateCount ?? null,
      jsonCandidateCount: raw?.jsonCandidateCount ?? null,
      equippedFactorItemCount: Array.isArray(raw?.equippedFactorItems)
        ? raw.equippedFactorItems.length
        : null,
      seasonMedalSelectedNodeCount: seasonMedalSelectedNodes.length,
      seasonMedalSelectedNodes,
      seasonMedalChooseNodeCount: seasonMedalChooseNodes.length,
      seasonMedalChooseNodes,
      samePayloadSelectorCandidateGroupCount: samePayloadSelectorCandidateGroups.length,
      samePayloadSelectorCandidateGroups,
      dirtyTreeDecoded: Boolean(dirtyTree),
      dirtyTreeTokenCount: dirtyTree?.tokenCount ?? 0,
      dirtyTreeValueNodeCount: dirtyTree?.valueNodes.length ?? 0,
      dirtyTreeGradeCandidateCount: dirtyTreeGradeCandidates.length,
      dirtyTreeGradeCandidates,
      dirtyTreeValuePreview,
      dirtyTreeSelectedTransitionCandidateCount: 0,
      dirtyTreeSelectedTransitionCandidates: [],
      factorGroups,
      candidates: candidates.slice(0, 40),
      _dirtyTreeValueNodes: dirtyTree?.valueNodes ?? [],
    });
  }
}

const dirtyTreeSelectedTransitions = annotateDirtyTreeSelectedTransitions(rows, factorCatalog);
for (const row of rows) delete row._dirtyTreeValueNodes;

const report = {
  source: "audit-container-probes",
  scannedRoots: roots,
  maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : null,
  scannedFileCount: scannedFiles.length,
  skippedLargeFileCount: skippedLargeFiles.length,
  skippedLargeFiles: skippedLargeFiles.slice(0, 40),
  factorCatalogPath: factorCatalog.path,
  seasonalTalentCatalogPath: seasonalTalentCatalog.path,
  factorCatalogCounts: {
    factorBuffIds: factorCatalog.factorByBuffId.size,
    factorFamilyIds: factorCatalog.factorByFamilyId.size,
    factorGradeItemIds: factorCatalog.factorByGradeItemId.size,
    factorAffectedDamageIds: factorCatalog.factorByAffectedDamageId.size,
  },
  seasonalTalentCatalogCounts: {
    entries: seasonalTalentCatalog.byUid.size,
  },
  probeEntryCount: rows.length,
  candidateCount: rows.reduce((sum, row) => sum + row.candidateCount, 0),
  seasonalTalentCandidateCount: rows.reduce(
    (sum, row) =>
      sum +
      row.candidates.filter(
        (candidate) =>
          candidate.evidenceType === "seasonal-talent-node-id" ||
          candidate.evidenceType === "season-medal-core-node-id",
      ).length,
    0,
  ),
  seasonMedalSelectedNodeRowCount: rows.filter((row) => row.seasonMedalSelectedNodeCount > 0).length,
  seasonMedalSelectedNodeCount: rows.reduce((sum, row) => sum + row.seasonMedalSelectedNodeCount, 0),
  seasonMedalChooseNodeRowCount: rows.filter((row) => row.seasonMedalChooseNodeCount > 0).length,
  seasonMedalChooseNodeCount: rows.reduce((sum, row) => sum + row.seasonMedalChooseNodeCount, 0),
  dirtyTreeDecodedRowCount: rows.filter((row) => row.dirtyTreeDecoded).length,
  dirtyTreeGradeCandidateRowCount: rows.filter((row) => row.dirtyTreeGradeCandidateCount > 0).length,
  dirtyTreeGradeCandidateCount: rows.reduce((sum, row) => sum + row.dirtyTreeGradeCandidateCount, 0),
  dirtyTreeSelectedTransitionRowCount: rows.filter(
    (row) => row.dirtyTreeSelectedTransitionCandidateCount > 0,
  ).length,
  dirtyTreeSelectedTransitionCount: dirtyTreeSelectedTransitions.length,
  probeEntryCountByAction: formatCountMap(byAction),
  candidateCountByValue: formatValueCountMap(byValue, valueMeta),
  candidateCountByKind: formatCountMap(byKind),
  candidateCountByEvidenceType: formatCountMap(byEvidenceType),
  candidateCountBySource: formatCountMap(bySource),
  candidateCountByLabel: formatCountMap(byLabel),
  factorGroupCountByStatus: formatCountMap(
    rows.reduce((map, row) => {
      for (const group of row.factorGroups) map.set(group.status, (map.get(group.status) ?? 0) + 1);
      return map;
    }, new Map()),
  ),
  factorGroupCountByProofClass: formatCountMap(
    rows.reduce((map, row) => {
      for (const group of row.factorGroups) map.set(group.proofClass, (map.get(group.proofClass) ?? 0) + 1);
      return map;
    }, new Map()),
  ),
  samePayloadSelectorCandidateRowCount: rows.filter((row) => row.samePayloadSelectorCandidateGroupCount > 0).length,
  samePayloadSelectorCandidateGroupCount: rows.reduce(
    (sum, row) => sum + row.samePayloadSelectorCandidateGroupCount,
    0,
  ),
  dirtyTreeSelectedTransitions: dirtyTreeSelectedTransitions.slice(0, 200),
  rows,
  notes: [
    "Dev-only audit for event logger rows emitted by RESONANCE_ENABLE_CONTAINER_PROBES.",
    "Candidates prove that a dirty container payload carried a factor-like ID. They do not prove selected value until linked to a UI/loadout action.",
    "same-payload-identity-grade-candidate is a stronger capture clue, but still requires encounter/timestamp loadout linkage before contribution math can consume it.",
    "dirty-tree-zero-to-grade-selected-slot means the same decoded dirty-container tree path changed from 0 to a factor grade item in the same event capture. Treat it as strong selected-slot evidence, but still keep it dev-only until repeated across more loadout toggles.",
    "SyncContainerData typed-json and equipped-factor-item rows are opt-in evidence probes. They do not run unless the debug env flag is enabled.",
    "SeasonMedal selected node rows expose Deep-Slumber Psychoscope choices from packet vdata, but still need encounter/timestamp linkage before contribution math can consume them.",
    "Affected-damage ID candidates only prove the container mentioned a generated factor damage surface; they are not selected grade/value proof by themselves.",
    "No live DPS, monitor, history, or modifier runtime behavior is changed by this script.",
  ],
};

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  "# Container Probe Audit",
  "",
  `- scanned files: ${report.scannedFileCount}`,
  `- skipped large files: ${report.skippedLargeFileCount}`,
  `- factor catalog: ${report.factorCatalogPath ?? "not found"}`,
  `- seasonal talent catalog: ${report.seasonalTalentCatalogPath ?? "not found"}`,
  `- probe entries: ${report.probeEntryCount}`,
  `- factor candidates: ${report.candidateCount}`,
  `- seasonal talent candidates: ${report.seasonalTalentCandidateCount}`,
  `- SeasonMedal selected node rows: ${report.seasonMedalSelectedNodeRowCount}`,
  `- SeasonMedal selected nodes: ${report.seasonMedalSelectedNodeCount}`,
  `- SeasonMedal choose node rows: ${report.seasonMedalChooseNodeRowCount}`,
  `- SeasonMedal choose nodes: ${report.seasonMedalChooseNodeCount}`,
  `- dirty-tree decoded rows: ${report.dirtyTreeDecodedRowCount}`,
  `- dirty-tree grade candidate rows: ${report.dirtyTreeGradeCandidateRowCount}`,
  `- dirty-tree grade candidates: ${report.dirtyTreeGradeCandidateCount}`,
  `- dirty-tree selected transition rows: ${report.dirtyTreeSelectedTransitionRowCount}`,
  `- dirty-tree selected transitions: ${report.dirtyTreeSelectedTransitionCount}`,
  `- same-payload selector candidate rows: ${report.samePayloadSelectorCandidateRowCount}`,
  `- same-payload selector candidate groups: ${report.samePayloadSelectorCandidateGroupCount}`,
  "",
  "## Probe Actions",
  "",
  "| Action | Count |",
  "| --- | ---: |",
  ...report.probeEntryCountByAction.map((row) => `| ${row.key} | ${row.count} |`),
  "",
  "## Candidate Values",
  "",
  "| Value | Count | Label | Evidence | Grade | Values |",
  "| --- | ---: | --- | --- | ---: | --- |",
  ...report.candidateCountByValue
    .slice(0, 80)
    .map(
      (row) =>
        `| ${row.key} | ${row.count} | ${row.label.replaceAll("|", "\\|")} | ${row.evidenceType} | ${row.grade ?? ""} | ${(row.values ?? []).join(", ").replaceAll("|", "\\|")} |`,
    ),
  "",
  "## Candidate Kinds",
  "",
  "| Kind | Count |",
  "| --- | ---: |",
  ...report.candidateCountByKind.map((row) => `| ${row.key} | ${row.count} |`),
  "",
  "## Evidence Types",
  "",
  "| Evidence | Count |",
  "| --- | ---: |",
  ...report.candidateCountByEvidenceType.map((row) => `| ${row.key} | ${row.count} |`),
  "",
  "## Candidate Sources",
  "",
  "| Source | Count |",
  "| --- | ---: |",
  ...report.candidateCountBySource.map((row) => `| ${row.key} | ${row.count} |`),
  "",
  "## Candidate Labels",
  "",
  "| Label | Count |",
  "| --- | ---: |",
  ...report.candidateCountByLabel.slice(0, 80).map((row) => `| ${row.key.replaceAll("|", "\\|")} | ${row.count} |`),
  "",
  "## Factor Group Status",
  "",
  "| Status | Count |",
  "| --- | ---: |",
  ...report.factorGroupCountByStatus.map((row) => `| ${row.key} | ${row.count} |`),
  "",
  "## Factor Group Proof Class",
  "",
  "| Proof Class | Count |",
  "| --- | ---: |",
  ...report.factorGroupCountByProofClass.map((row) => `| ${row.key} | ${row.count} |`),
  "",
  "## SeasonMedal Selected Nodes",
  "",
  "| File | Action | Runtime Node | Canonical Node | Slot | Level | Label |",
  "| --- | --- | ---: | ---: | ---: | ---: | --- |",
  ...report.rows
    .flatMap((row) =>
      row.seasonMedalSelectedNodes.map((node) => ({
        file: row.file,
        action: row.action,
        node,
      })),
    )
    .slice(0, 80)
    .map(
      (row) =>
        `| ${path.basename(row.file)} | ${row.action} | ${row.node.nodeId ?? ""} | ${row.node.canonicalNodeId ?? ""} | ${row.node.slot ?? ""} | ${row.node.nodeLevel ?? ""} | ${(row.node.label ?? "").replaceAll("|", "\\|")} |`,
    ),
  "",
  "## SeasonMedal Choose Nodes",
  "",
  "| File | Action | Runtime Node | Canonical Node | Slot | Level | Label |",
  "| --- | --- | ---: | ---: | ---: | ---: | --- |",
  ...report.rows
    .flatMap((row) =>
      row.seasonMedalChooseNodes.map((node) => ({
        file: row.file,
        action: row.action,
        node,
      })),
    )
    .slice(0, 80)
    .map(
      (row) =>
        `| ${path.basename(row.file)} | ${row.action} | ${row.node.nodeId ?? ""} | ${row.node.canonicalNodeId ?? ""} | ${row.node.slot ?? ""} | ${row.node.nodeLevel ?? ""} | ${(row.node.label ?? "").replaceAll("|", "\\|")} |`,
    ),
  "",
  "## Dirty Tree Selected Transitions",
  "",
  "| File | Path | Factor | Grade | Values | Zero Row | Grade Row | Delta ms |",
  "| --- | --- | --- | ---: | --- | ---: | ---: | ---: |",
  ...report.dirtyTreeSelectedTransitions.map(
    (transition) =>
      `| ${transition.gradeValue.file} | ${transition.treePath} | ${transition.familyName.replaceAll("|", "\\|")} | ${transition.grade ?? ""} | ${(transition.valueTexts ?? []).join(", ").replaceAll("|", "\\|")} | ${transition.zeroValue.rowIndex} | ${transition.gradeValue.rowIndex} | ${transition.msAfterZero ?? ""} |`,
  ),
  "",
  "## Rows",
  "",
  "| File | Category | Action | Bytes | Candidates | JSON | Equipped | SeasonMedal | Choose | DirtyTree | Same-payload | Factor Groups | Summary |",
  "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  ...report.rows
    .slice(0, 80)
    .map(
      (row) => {
        const groups = row.factorGroups
          .map((group) => {
            const gradeText = group.grades.length ? ` G${group.grades.join("/")}` : "";
            const valueText = group.valueTexts.length ? ` ${group.valueTexts.join(", ")}` : "";
            const sourceText = group.candidateSources.length ? ` via ${group.candidateSources.join("/")}` : "";
            return `${group.familyName}${gradeText}${valueText} (${group.proofClass}${sourceText})`;
          })
          .join("; ")
          .replaceAll("|", "\\|");
        return `| ${path.basename(row.file)} | ${row.category ?? ""} | ${row.action} | ${row.bufferLength ?? ""} | ${row.candidateCount} | ${row.jsonCandidateCount ?? ""} | ${row.equippedFactorItemCount ?? ""} | ${row.seasonMedalSelectedNodeCount} | ${row.seasonMedalChooseNodeCount} | ${row.dirtyTreeSelectedTransitionCandidateCount} | ${row.samePayloadSelectorCandidateGroupCount} | ${groups} | ${(row.summary ?? "").replaceAll("|", "\\|")} |`;
      },
    ),
  "",
].join("\n");

fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, `${md}\n`);

console.log(
  `wrote ${outJson} and ${outMd} (probeEntries=${report.probeEntryCount}, candidates=${report.candidateCount})`,
);
