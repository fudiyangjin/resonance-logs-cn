import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const DEFAULT_OUT_JSON = "DEV_exports/runtime-tier-bridge-audit.json";
const DEFAULT_OUT_MD = "DEV_exports/runtime-tier-bridge-audit.md";
const DEFAULT_LATEST_INPUTS = 3;
const DEFAULT_CURRENT_VDATA = "DEV_exports/factor-vdata-current-equipment.json";
const GENERATED_ROOTS = [
  path.join(repoRoot, "..", "BPSR-UID-Extractors", "output"),
  path.join(repoRoot, "parser-data", "generated"),
];
const generatedFilesRead = new Map();

function usage() {
  return `Usage: node scripts/audit-runtime-tier-bridge.mjs [options]

Options:
  --input <path>          Add a modifier-entity export. Repeatable.
  --latest <count>        Use newest DEV_exports/modifier-entity-*.json files. Default: ${DEFAULT_LATEST_INPUTS}
  --current-vdata <path>  Optional probe_factor_vdata report for current snapshot fallback.
                          Default: ${DEFAULT_CURRENT_VDATA}
  --max-rows <count>      Max tier rows in markdown. Default: 80
  --out-json <path>       JSON report path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>         Markdown report path. Default: ${DEFAULT_OUT_MD}
`;
}

function parseArgs(argv) {
  const args = {
    inputs: [],
    latest: DEFAULT_LATEST_INPUTS,
    currentVdata: DEFAULT_CURRENT_VDATA,
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
    } else if (arg === "--input") {
      args.inputs.push(next());
    } else if (arg === "--latest") {
      args.latest = Number(next());
    } else if (arg === "--current-vdata") {
      args.currentVdata = next();
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
  return args;
}

function resolveRepoPath(filePath) {
  if (!filePath) return filePath;
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved || !fs.existsSync(resolved)) return fallback;
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function readGeneratedJson(fileName, fallback = null) {
  for (const root of GENERATED_ROOTS) {
    const filePath = path.join(root, fileName);
    if (!fs.existsSync(filePath)) continue;
    generatedFilesRead.set(fileName, path.relative(repoRoot, filePath).replaceAll("\\", "/"));
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  return fallback;
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

function latestModifierEntityFiles(count) {
  if (!Number.isFinite(count) || count <= 0) return [];
  const dir = path.join(repoRoot, "DEV_exports");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^modifier-entity-.+\.json$/i.test(name))
    .map((name) => {
      const filePath = path.join(dir, name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, count)
    .map((entry) => entry.filePath);
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

function uniqueNumbers(values) {
  return [...new Set(values.map(positiveNumber).filter((value) => value !== null))]
    .sort((left, right) => left - right);
}

function sourceIdNumber(sourceId) {
  const match = String(sourceId ?? "").match(/(\d+)$/);
  return match ? positiveNumber(match[1]) : null;
}

function skillIdFromLevelId(skillLevelId) {
  const id = positiveNumber(skillLevelId);
  return id === null ? null : Math.floor(id / 100);
}

function skillLevelFromLevelId(skillLevelId) {
  const id = positiveNumber(skillLevelId);
  return id === null ? null : id % 100;
}

function firstLocalizedName(names) {
  if (!names || typeof names !== "object") return "";
  return String(names.en || names["zh-CN"] || names.design || Object.values(names)[0] || "").trim();
}

function buildAoyiNameIndex() {
  const rows = readGeneratedJson("skill_aoyi_icons.json", []);
  const bySkillId = new Map();
  for (const row of asArray(rows)) {
    const id = positiveNumber(row.Id ?? row.id);
    if (id === null) continue;
    const imagineName = firstLocalizedName(row.MonsterNames) || firstLocalizedName(row.Names) || row.Name || `Skill ${id}`;
    const technicalName = firstLocalizedName(row.Names) || row.Name || "";
    bySkillId.set(id, {
      skillId: id,
      name: imagineName,
      technicalName,
    });
  }
  return bySkillId;
}

function normalizeProfessionSkill(row) {
  const skillId = positiveNumber(row?.skillId ?? row?.skill_id);
  if (skillId === null) return null;
  const level = maybeNumber(row?.level);
  const remodelLevel = maybeNumber(row?.remodelLevel ?? row?.remodel_level);
  const skillLevelId = positiveNumber(row?.skillLevelId ?? row?.skill_level_id)
    ?? (level !== null ? skillId * 100 + level : null);
  return {
    skillId,
    baseSkillId: positiveNumber(row?.baseSkillId ?? row?.base_skill_id),
    skillLevelId,
    level,
    remodelLevel,
    slot: maybeNumber(row?.slot),
    equipped: typeof row?.equipped === "boolean" ? row.equipped : null,
    sourceKind: String(row?.sourceKind ?? row?.source_kind ?? ""),
    runtimeSource: String(row?.runtimeSource ?? row?.runtime_source ?? ""),
  };
}

function professionSkillsForEntity(entity) {
  return asArray(entity?.activeProfessionSkills ?? entity?.active_profession_skills)
    .map(normalizeProfessionSkill)
    .filter(Boolean);
}

function currentVdataProfessionSkills(report) {
  const playerId = positiveNumber(report?.player_id ?? report?.playerId);
  const section = report?.profession_skills ?? report?.professionSkills ?? {};
  const rows = [
    ...asArray(section.profession_skills ?? section.professionSkills),
    ...asArray(section.battle_imagine_skills ?? section.battleImagineSkills),
  ]
    .map(normalizeProfessionSkill)
    .filter(Boolean);
  return {
    playerId,
    source: report ? "probe_factor_vdata latest detailed_playerdata" : "missing",
    rows,
  };
}

function buildEntityIndex(entities) {
  const byUid = new Map();
  const byName = new Map();
  for (const entity of entities) {
    const uid = positiveNumber(entity?.uid);
    if (uid !== null) byUid.set(uid, entity);
    const name = typeof entity?.name === "string" ? entity.name.trim() : "";
    if (name) {
      const rows = byName.get(name) ?? [];
      rows.push(entity);
      byName.set(name, rows);
    }
  }
  return { byUid, byName };
}

function buildActorIndex(entity) {
  const byUid = new Map();
  const ownUid = positiveNumber(entity?.uid);
  if (ownUid !== null) {
    byUid.set(ownUid, {
      uid: ownUid,
      name: entity?.name || `#${ownUid}`,
      entityType: "EntChar",
      ownerUid: null,
      ownerName: null,
    });
  }
  for (const actor of asArray(entity?.modifierSourceActors ?? entity?.modifier_source_actors)) {
    const uid = positiveNumber(actor.uid);
    if (uid === null) continue;
    byUid.set(uid, {
      uid,
      name: actor.name || `#${uid}`,
      entityType: actor.entityType ?? actor.entity_type ?? "Unknown",
      ownerUid: positiveNumber(actor.ownerUid ?? actor.owner_uid),
      ownerName: actor.ownerName ?? actor.owner_name ?? null,
    });
  }
  return byUid;
}

function providerForSourceUid(entity, actorIndex, sourceUid) {
  const uid = positiveNumber(sourceUid);
  if (uid === null) return null;
  const actor = actorIndex.get(uid);
  const ownUid = positiveNumber(entity.uid);
  if (!actor) {
    return {
      sourceUid: uid,
      sourceName: uid === ownUid ? entity.name : `#${uid}`,
      ownerUid: uid === ownUid ? ownUid : null,
      ownerName: uid === ownUid ? entity.name : null,
      source: "source-uid",
    };
  }
  return {
    sourceUid: uid,
    sourceName: actor.name,
    ownerUid: actor.ownerUid ?? (uid === ownUid ? ownUid : null),
    ownerName: actor.ownerName ?? (uid === ownUid ? entity.name : null),
    source: "modifierSourceActors",
  };
}

function indexSkillsByEntity(entities, currentVdata) {
  const byEntityUid = new Map();
  for (const entity of entities) {
    const uid = positiveNumber(entity.uid);
    if (uid === null) continue;
    const rows = professionSkillsForEntity(entity);
    const bySkillId = new Map();
    for (const row of rows) {
      bySkillId.set(row.skillId, row);
    }
    byEntityUid.set(uid, {
      source: rows.length ? "encounter-activeProfessionSkills" : "missing",
      bySkillId,
      rows,
    });
  }
  if (currentVdata.playerId !== null && currentVdata.rows.length) {
    const bySkillId = new Map();
    for (const row of currentVdata.rows) bySkillId.set(row.skillId, row);
    byEntityUid.set(`current:${currentVdata.playerId}`, {
      source: "latest-detailed-playerdata-not-encounter-local",
      bySkillId,
      rows: currentVdata.rows,
    });
  }
  return byEntityUid;
}

function skillSnapshotSummary(indexed) {
  if (!indexed) {
    return {
      source: "missing",
      rowCount: 0,
      battleImagineRows: 0,
      professionRows: 0,
    };
  }
  return {
    source: indexed.source,
    rowCount: indexed.rows.length,
    battleImagineRows: indexed.rows.filter((row) => row.sourceKind === "battle-imagine").length,
    professionRows: indexed.rows.filter((row) => row.sourceKind === "profession-skill").length,
  };
}

function cooldownSkillLevels(entity) {
  const bySkillId = new Map();
  for (const event of asArray(entity?.skillCooldownEvents ?? entity?.skill_cooldown_events)) {
    const skillLevelId = positiveNumber(event.skillLevelId ?? event.skill_level_id);
    const skillId = positiveNumber(event.skillId ?? event.skill_id) ?? skillIdFromLevelId(skillLevelId);
    if (skillId === null) continue;
    let row = bySkillId.get(skillId);
    if (!row) {
      row = { skillId, skillLevelIds: new Set(), levels: new Set() };
      bySkillId.set(skillId, row);
    }
    if (skillLevelId !== null) {
      row.skillLevelIds.add(skillLevelId);
      const level = skillLevelFromLevelId(skillLevelId);
      if (level !== null) row.levels.add(level);
    }
  }
  return bySkillId;
}

function uniqueEntityUidByName(entityIndex, name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return null;
  const rows = entityIndex.byName.get(trimmed) ?? [];
  const uids = uniqueNumbers(rows.map((row) => row?.uid));
  return uids.length === 1 ? uids[0] : null;
}

function resolveSkillContext({ entity, entityIndex, skillIndex, currentVdata, ownerUid, providerName, skillId }) {
  const ownUid = positiveNumber(entity.uid);
  const candidates = [];
  if (ownerUid !== null) candidates.push(ownerUid);
  const nameUid = uniqueEntityUidByName(entityIndex, providerName);
  if (nameUid !== null && !candidates.includes(nameUid)) candidates.push(nameUid);
  if (ownUid !== null && !candidates.includes(ownUid)) candidates.push(ownUid);
  const candidateSkillSnapshots = candidates.map((uid) => ({
    uid,
    ...skillSnapshotSummary(skillIndex.get(uid)),
    hasRequiredSkill: Boolean(skillIndex.get(uid)?.bySkillId.has(skillId)),
  }));

  for (const uid of candidates) {
    const indexed = skillIndex.get(uid);
    const row = indexed?.bySkillId.get(skillId);
    if (row) {
      return {
        status: "resolved",
        source: indexed.source,
        ownerUid: uid,
        skill: row,
        encounterLocal: true,
        candidateSkillSnapshots,
      };
    }
  }

  const currentKey = ownerUid !== null ? `current:${ownerUid}` : ownUid !== null ? `current:${ownUid}` : null;
  if (currentKey !== null) {
    const indexed = skillIndex.get(currentKey);
    const row = indexed?.bySkillId.get(skillId);
    if (row) {
      return {
        status: "fallback",
        source: indexed.source,
        ownerUid: ownerUid ?? ownUid,
        skill: row,
        encounterLocal: false,
        candidateSkillSnapshots,
      };
    }
  }

  const cooldowns = cooldownSkillLevels(entity);
  const cooldown = cooldowns.get(skillId);
  if (cooldown) {
    const levels = [...cooldown.levels].sort((left, right) => left - right);
    return {
      status: "level-only",
      source: "encounter-skillCooldownEvents",
      ownerUid: ownUid,
      encounterLocal: true,
      blockedReason: "cooldown-only-no-remodel",
      skill: {
        skillId,
        skillLevelId: [...cooldown.skillLevelIds][0] ?? null,
        level: levels.length === 1 ? levels[0] : null,
        remodelLevel: null,
      },
      notes: levels.length > 1 ? [`multiple cooldown levels observed: ${levels.join(", ")}`] : [],
      candidateSkillSnapshots,
    };
  }

  const isExternalProvider = ownerUid !== null && ownUid !== null && ownerUid !== ownUid;
  const localSnapshot = ownUid !== null ? skillIndex.get(ownUid) : null;
  const ownerSnapshot = ownerUid !== null ? skillIndex.get(ownerUid) : null;
  const currentSnapshot = currentKey !== null ? skillIndex.get(currentKey) : null;
  let blockedReason = "missing-runtime-skill-state";
  if (isExternalProvider) {
    blockedReason = ownerSnapshot?.rows.length
      ? "external-provider-snapshot-missing-required-skill"
      : "external-provider-no-loadout-snapshot";
  } else if (!localSnapshot?.rows.length) {
    blockedReason = "missing-encounter-profession-snapshot";
  } else if (!localSnapshot.bySkillId.has(skillId)) {
    blockedReason = "encounter-snapshot-missing-required-skill";
  } else if (currentSnapshot?.rows.length && !currentSnapshot.bySkillId.has(skillId)) {
    blockedReason = "current-snapshot-missing-required-skill";
  }

  return {
    status: "blocked",
    source: "missing-runtime-skill-state",
    ownerUid: ownerUid ?? ownUid,
    encounterLocal: false,
    skill: null,
    blockedReason,
    candidateSkillSnapshots,
  };
}

function contributionRulesNeedingTier() {
  const table = readGeneratedJson("ModifierContributionRuntime.json", {});
  const rows = [];
  for (const rule of Object.values(table.sourcesByRuleId ?? {})) {
    const hints = asArray(rule.componentValueHints);
    const tierHints = hints.filter((hint) => hint?.tierSelectionRequired);
    if (!tierHints.length) continue;
    const skillIds = uniqueNumbers(tierHints.map((hint) => skillIdFromLevelId(hint?.baseValues?.skillLevelId)));
    const sourceNumericId = sourceIdNumber(rule.sourceId);
    rows.push({
      sourceRuleId: rule.sourceRuleId,
      sourceId: rule.sourceId,
      sourceNumericId,
      contributionGroups: asArray(rule.contributionGroups),
      formulaTermIds: asArray(rule.formulaTermIds),
      skillIds,
      hints: tierHints,
    });
  }
  return rows;
}

function selectedTierValues(hint, remodelLevel) {
  const tier = maybeNumber(remodelLevel) ?? 0;
  const baseValues = asArray(hint?.baseValues?.values).map((value) => ({
    scope: value.scope,
    rawText: value.rawText,
    decimalValue: maybeNumber(value.decimalValue),
  }));
  const tierRow = asArray(hint?.tierValues).find((row) => maybeNumber(row?.tier) === tier) ?? null;
  return {
    selectedTier: tier,
    baseValues,
    tierValues: asArray(tierRow?.values).map((value) => ({
      scope: value.scope,
      rawText: value.rawText,
      decimalValue: maybeNumber(value.decimalValue),
    })),
    tierValuesFound: Boolean(tierRow),
  };
}

function observedRuleProviders(entity, rule) {
  const sourceId = rule.sourceNumericId;
  if (sourceId === null) return [];
  const byProvider = new Map();
  const include = (sourceUidValue, baseIdValue, sourceConfigIdValue) => {
    const baseId = positiveNumber(baseIdValue);
    const sourceConfigId = positiveNumber(sourceConfigIdValue);
    if (baseId !== sourceId && sourceConfigId !== sourceId) return;
    const sourceUid = positiveNumber(sourceUidValue) ?? 0;
    const row = byProvider.get(sourceUid) ?? {
      sourceUid,
      observedWindows: 0,
      observedBuckets: 0,
      baseIds: new Set(),
      sourceConfigIds: new Set(),
    };
    if (baseId !== null) row.baseIds.add(baseId);
    if (sourceConfigId !== null) row.sourceConfigIds.add(sourceConfigId);
    byProvider.set(sourceUid, row);
  };
  for (const window of asArray(entity.modifierWindows ?? entity.modifier_windows)) {
    const sourceUid = window.sourceUid ?? window.source_uid;
    include(sourceUid, window.baseId ?? window.base_id, window.sourceConfigId ?? window.source_config_id);
    const row = byProvider.get(positiveNumber(sourceUid) ?? 0);
    if (row) row.observedWindows += 1;
  }
  for (const bucket of asArray(entity.modifierHitBuckets ?? entity.modifier_hit_buckets)) {
    const sourceUid = bucket.modifierSourceUid ?? bucket.modifier_source_uid;
    include(
      sourceUid,
      bucket.modifierBaseId ?? bucket.modifier_base_id,
      bucket.modifierSourceConfigId ?? bucket.modifier_source_config_id,
    );
    const row = byProvider.get(positiveNumber(sourceUid) ?? 0);
    if (row) row.observedBuckets += 1;
  }
  return [...byProvider.values()].map((row) => ({
    ...row,
    baseIds: [...row.baseIds].sort((left, right) => left - right),
    sourceConfigIds: [...row.sourceConfigIds].sort((left, right) => left - right),
  }));
}

function auditEntity({ filePath, entity, entities, rules, skillIndex, currentVdata, aoyiNames }) {
  const actorIndex = buildActorIndex(entity);
  const entityIndex = buildEntityIndex(entities);
  const tierRows = [];
  for (const rule of rules) {
    const providers = observedRuleProviders(entity, rule);
    if (!providers.length) continue;
    for (const providerRow of providers) {
      const provider = providerForSourceUid(entity, actorIndex, providerRow.sourceUid);
      const ownerUid = positiveNumber(provider?.ownerUid) ?? positiveNumber(provider?.sourceUid);
      for (const skillId of rule.skillIds) {
        const skillContext = resolveSkillContext({
          entity,
          entityIndex,
          skillIndex,
          currentVdata,
          ownerUid,
          providerName: provider?.ownerName ?? provider?.sourceName,
          skillId,
        });
        const hint = rule.hints[0];
        const values = skillContext.skill
          ? selectedTierValues(hint, skillContext.skill.remodelLevel)
          : null;
        const aoyi = aoyiNames.get(skillId);
        tierRows.push({
          file: path.basename(filePath),
          uid: entity.uid,
          name: entity.name,
          sourceRuleId: rule.sourceRuleId,
          sourceId: rule.sourceId,
          sourceNumericId: rule.sourceNumericId,
          skillId,
          skillName: aoyi?.name || aoyi?.technicalName || `Skill ${skillId}`,
          technicalName: aoyi?.technicalName || "",
          provider,
          observedWindows: providerRow.observedWindows,
          observedBuckets: providerRow.observedBuckets,
          baseIds: providerRow.baseIds,
          sourceConfigIds: providerRow.sourceConfigIds,
          status: skillContext.status,
          contextSource: skillContext.source,
          encounterLocal: skillContext.encounterLocal,
          level: skillContext.skill?.level ?? null,
          skillLevelId: skillContext.skill?.skillLevelId ?? null,
          remodelLevel: skillContext.skill?.remodelLevel ?? null,
          selectedValues: values,
          blockedReason: skillContext.blockedReason ?? null,
          candidateSkillSnapshots: skillContext.candidateSkillSnapshots ?? [],
          notes: skillContext.notes ?? [],
        });
      }
    }
  }

  const professionSkills = professionSkillsForEntity(entity);
  const cooldowns = cooldownSkillLevels(entity);
  const skillLevelRows = professionSkills.map((skill) => ({
    skillId: skill.skillId,
    sourceKind: skill.sourceKind,
    level: skill.level,
    remodelLevel: skill.remodelLevel,
    skillLevelId: skill.skillLevelId,
    slot: skill.slot,
    equipped: skill.equipped,
    source: "encounter-activeProfessionSkills",
  }));
  for (const [skillId, cooldown] of cooldowns) {
    if (skillLevelRows.some((row) => row.skillId === skillId)) continue;
    skillLevelRows.push({
      skillId,
      sourceKind: "cooldown-observed",
      level: [...cooldown.levels].length === 1 ? [...cooldown.levels][0] : null,
      remodelLevel: null,
      skillLevelId: [...cooldown.skillLevelIds][0] ?? null,
      slot: null,
      equipped: null,
      source: "encounter-skillCooldownEvents",
    });
  }

  return {
    file: path.basename(filePath),
    uid: entity.uid,
    name: entity.name,
    activeProfessionSkillCount: professionSkills.length,
    skillCooldownSkillCount: cooldowns.size,
    tierRows,
    skillLevelRows: skillLevelRows.sort((left, right) => left.skillId - right.skillId),
  };
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
}

function captureGapRows(tierRows) {
  const byReason = new Map();
  for (const row of tierRows) {
    if (!row.blockedReason) continue;
    const reason = row.blockedReason;
    const group = byReason.get(reason) ?? {
      reason,
      count: 0,
      files: new Set(),
      providers: new Set(),
      skills: new Map(),
      examples: [],
    };
    group.count += 1;
    group.files.add(row.file);
    const provider = row.provider?.ownerName || row.provider?.sourceName || "";
    if (provider) group.providers.add(provider);
    group.skills.set(row.skillId, row.skillName);
    if (group.examples.length < 6) {
      group.examples.push({
        file: row.file,
        player: row.name || row.uid,
        provider,
        skillId: row.skillId,
        skillName: row.skillName,
        sourceId: row.sourceId,
        contextSource: row.contextSource,
      });
    }
    byReason.set(reason, group);
  }
  return [...byReason.values()]
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .map((group) => ({
      reason: group.reason,
      count: group.count,
      files: [...group.files].sort(),
      providers: [...group.providers].sort(),
      skills: [...group.skills.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([skillId, skillName]) => ({ skillId, skillName })),
      examples: group.examples,
    }));
}

function skillCoverageRows({ requiredSkillIds, tierRows, currentVdataSkillRows }) {
  const currentSkillIds = new Set(currentVdataSkillRows.map((row) => row.skillId));
  return requiredSkillIds.map((skillId) => {
    const rows = tierRows.filter((row) => row.skillId === skillId);
    const resolved = rows.filter((row) => row.status === "resolved").length;
    const fallback = rows.filter((row) => row.status === "fallback").length;
    const levelOnly = rows.filter((row) => row.status === "level-only").length;
    const blocked = rows.filter((row) => row.status === "blocked").length;
    const reasonCounts = countBy(rows.filter((row) => row.blockedReason), (row) => row.blockedReason);
    return {
      skillId,
      observedRows: rows.length,
      resolved,
      fallback,
      levelOnly,
      blocked,
      currentSnapshotHasSkill: currentSkillIds.has(skillId),
      blockedReasons: reasonCounts,
    };
  });
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Runtime Tier Bridge Audit");
  lines.push("");
  lines.push("Dev-only audit. Encounter-local `activeProfessionSkills` is authoritative for contribution math; current detailed-playerdata fallback is labeled and must not be used as historical proof.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Inputs: ${report.inputs.length}`);
  lines.push(`- Tier-required contribution rules: ${report.summary.tierRequiredRules}`);
  lines.push(`- Observed tier rows: ${report.summary.observedTierRows}`);
  lines.push(`- Encounter-local resolved rows: ${report.summary.encounterLocalResolvedRows}`);
  lines.push(`- Current-snapshot fallback rows: ${report.summary.currentSnapshotFallbackRows}`);
  lines.push(`- Blocked rows: ${report.summary.blockedRows}`);
  lines.push(`- Level-only rows without remodel tier: ${report.summary.levelOnlyRows}`);
  lines.push(`- Required tier skill ids missing from current snapshot: ${report.summary.currentSnapshotMissingRequiredSkillIds}`);
  lines.push(`- Blocked reasons: ${Object.entries(report.summary.blockedReasons).map(([reason, count]) => `${reason}=${count}`).join(", ") || "none"}`);
  lines.push(`- Generated source root: ${Object.values(report.generatedSources ?? {})[0]?.startsWith("../BPSR-UID-Extractors/") ? "../BPSR-UID-Extractors/output" : "parser-data/generated"}`);
  lines.push("");
  lines.push("## Capture Gaps");
  lines.push("");
  lines.push("| Reason | Rows | Skills | Providers | Example |");
  lines.push("| --- | ---: | --- | --- | --- |");
  for (const gap of report.captureGaps) {
    const skills = gap.skills.map((skill) => `${skill.skillName} (${skill.skillId})`).join(", ");
    const providers = gap.providers.slice(0, 8).join(", ");
    const example = gap.examples[0]
      ? `${gap.examples[0].file} / ${gap.examples[0].provider || "unknown"} / ${gap.examples[0].sourceId}`
      : "";
    lines.push(`| ${gap.reason} | ${gap.count} | ${skills} | ${providers}${gap.providers.length > 8 ? ", ..." : ""} | ${example} |`);
  }
  if (!report.captureGaps.length) lines.push("| none | 0 |  |  |  |");
  lines.push("");
  lines.push("## Required Skill Coverage");
  lines.push("");
  lines.push("| Skill | Observed Rows | Encounter | Current Snapshot | Blocked Reasons |");
  lines.push("| --- | ---: | --- | --- | --- |");
  for (const row of report.requiredSkillCoverage) {
    const skillName = report.skillNames[String(row.skillId)] || `Skill ${row.skillId}`;
    const encounter = `resolved=${row.resolved}, levelOnly=${row.levelOnly}, blocked=${row.blocked}`;
    const reasons = Object.entries(row.blockedReasons).map(([reason, count]) => `${reason}=${count}`).join(", ");
    lines.push(`| ${skillName} (${row.skillId}) | ${row.observedRows} | ${encounter} | ${row.currentSnapshotHasSkill ? "has skill" : "missing skill"} | ${reasons || ""} |`);
  }
  lines.push("");
  lines.push("## Tier Rows");
  lines.push("");
  lines.push("| File | Player | Source | Provider | Skill | Status | Reason | Level | Remodel | Values |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- |");
  for (const row of report.tierRows.slice(0, maxRows)) {
    const provider = row.provider?.ownerName || row.provider?.sourceName || "";
    const values = row.selectedValues
      ? [
        ...row.selectedValues.baseValues.map((value) => `${value.scope}:${value.rawText}`),
        ...row.selectedValues.tierValues.map((value) => `tier${row.selectedValues.selectedTier}.${value.scope}:${value.rawText}`),
      ].join(", ")
      : "";
    lines.push(`| ${row.file} | ${row.name || row.uid} | ${row.sourceId} | ${provider} | ${row.skillName} (${row.skillId}) | ${row.status} / ${row.contextSource} | ${row.blockedReason ?? ""} | ${row.level ?? ""} | ${row.remodelLevel ?? ""} | ${values} |`);
  }
  if (report.tierRows.length > maxRows) {
    lines.push(`| ... | ... | ... | ... | ... | ${report.tierRows.length - maxRows} more rows |  |  |  |  |`);
  }
  lines.push("");
  lines.push("## Current Snapshot Skill Rows");
  lines.push("");
  lines.push("These rows come from the latest detailed-playerdata snapshot, not the historical encounter. They are only fallback clues.");
  lines.push("");
  lines.push(`- Required tier skill ids: ${report.requiredSkillIds.join(", ") || "none"}`);
  lines.push(`- Missing required ids in current snapshot: ${report.currentVdataMissingRequiredSkillIds.join(", ") || "none"}`);
  lines.push("");
  lines.push("| Skill | Kind | Level | Remodel | Slot | Equipped | Source |");
  lines.push("| --- | --- | ---: | ---: | ---: | --- | --- |");
  for (const row of report.currentVdataSkillRows.slice(0, maxRows)) {
    lines.push(`| ${row.name} (${row.skillId}) | ${row.sourceKind} | ${row.level ?? ""} | ${row.remodelLevel ?? ""} | ${row.slot ?? ""} | ${row.equipped ?? ""} | ${row.runtimeSource || row.source || ""} |`);
  }
  if (report.currentVdataSkillRows.length > maxRows) {
    lines.push(`| ... | ... | ... | ... | ... | ${report.currentVdataSkillRows.length - maxRows} more rows |  |`);
  }
  lines.push("");
  lines.push("## Skill Context");
  lines.push("");
  for (const file of report.files) {
    const equipped = file.skillLevelRows.filter((row) => row.equipped === true).slice(0, 20);
    lines.push(`### ${file.file}`);
    lines.push("");
    lines.push(`- Active profession skill rows: ${file.activeProfessionSkillCount}`);
    lines.push(`- Cooldown-observed skill ids: ${file.skillCooldownSkillCount}`);
    if (!equipped.length) {
      lines.push("- Equipped skill rows: none in this export");
    } else {
      lines.push(`- Equipped skill rows: ${equipped.map((row) => `${row.skillId}@L${row.level ?? "?"}/R${row.remodelLevel ?? "?"}`).join(", ")}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPaths = args.inputs.length
    ? args.inputs.map(resolveRepoPath)
    : latestModifierEntityFiles(args.latest);
  if (!inputPaths.length) {
    throw new Error("No modifier-entity inputs found.");
  }

  const entities = inputPaths.map((filePath) => readJson(filePath));
  const currentVdata = currentVdataProfessionSkills(readJson(args.currentVdata, null));
  const skillIndex = indexSkillsByEntity(entities, currentVdata);
  const rules = contributionRulesNeedingTier();
  const aoyiNames = buildAoyiNameIndex();
  const requiredSkillIds = uniqueNumbers(rules.flatMap((rule) => rule.skillIds));
  const currentVdataSkillRows = currentVdata.rows
    .map((row) => ({
      skillId: row.skillId,
      name: aoyiNames.get(row.skillId)?.name || aoyiNames.get(row.skillId)?.technicalName || `Skill ${row.skillId}`,
      technicalName: aoyiNames.get(row.skillId)?.technicalName || "",
      sourceKind: row.sourceKind,
      level: row.level,
      remodelLevel: row.remodelLevel,
      skillLevelId: row.skillLevelId,
      slot: row.slot,
      equipped: row.equipped,
      runtimeSource: row.runtimeSource,
      source: currentVdata.source,
    }))
    .sort((left, right) => String(left.sourceKind).localeCompare(String(right.sourceKind)) || left.skillId - right.skillId);
  const currentVdataSkillIdSet = new Set(currentVdata.rows.map((row) => row.skillId));
  const currentVdataMissingRequiredSkillIds = requiredSkillIds.filter((skillId) => !currentVdataSkillIdSet.has(skillId));

  const files = inputPaths.map((filePath, index) => auditEntity({
    filePath,
    entity: entities[index],
    entities,
    rules,
    skillIndex,
    currentVdata,
    aoyiNames,
  }));
  const tierRows = files.flatMap((file) => file.tierRows)
    .sort((left, right) =>
      Number(right.encounterLocal) - Number(left.encounterLocal)
      || right.observedBuckets - left.observedBuckets
      || right.observedWindows - left.observedWindows
      || String(left.file).localeCompare(String(right.file)));

  const skillNames = Object.fromEntries(requiredSkillIds.map((skillId) => [
    String(skillId),
    aoyiNames.get(skillId)?.name || aoyiNames.get(skillId)?.technicalName || `Skill ${skillId}`,
  ]));
  const captureGaps = captureGapRows(tierRows);
  const requiredSkillCoverage = skillCoverageRows({ requiredSkillIds, tierRows, currentVdataSkillRows });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputs: inputPaths.map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/")),
    generatedSources: Object.fromEntries([...generatedFilesRead.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
    currentVdata: {
      source: currentVdata.source,
      playerId: currentVdata.playerId,
      professionSkillRows: currentVdata.rows.length,
    },
    summary: {
      tierRequiredRules: rules.length,
      observedTierRows: tierRows.length,
      encounterLocalResolvedRows: tierRows.filter((row) => row.status === "resolved" && row.encounterLocal).length,
      currentSnapshotFallbackRows: tierRows.filter((row) => row.status === "fallback").length,
      blockedRows: tierRows.filter((row) => row.status === "blocked").length,
      levelOnlyRows: tierRows.filter((row) => row.status === "level-only").length,
      currentSnapshotBattleImagineRows: currentVdataSkillRows.filter((row) => row.sourceKind === "battle-imagine").length,
      currentSnapshotMissingRequiredSkillIds: currentVdataMissingRequiredSkillIds.length,
      blockedReasons: countBy(tierRows.filter((row) => row.blockedReason), (row) => row.blockedReason),
    },
    files,
    tierRows,
    requiredSkillIds,
    skillNames,
    requiredSkillCoverage,
    captureGaps,
    currentVdataMissingRequiredSkillIds,
    currentVdataSkillRows,
  };

  writeJson(args.outJson, report);
  writeText(args.outMd, renderMarkdown(report, args.maxRows));
  console.log(`Runtime tier bridge audit: ${report.summary.observedTierRows} observed tier rows, ${report.summary.encounterLocalResolvedRows} encounter-local resolved, ${report.summary.currentSnapshotFallbackRows} current-snapshot fallback, ${report.summary.blockedRows} blocked.`);
  console.log(`Wrote ${args.outJson} and ${args.outMd}`);
}

main();
