import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as common from "../../BPSR-UID-Extractors/generator-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaultOutJson = path.join(repoRoot, "DEV_exports", "game-schema-source-map.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "game-schema-source-map.md");
const defaultFieldCsv = path.join(repoRoot, "DEV_exports", "game-schema-source-fields.csv");
const defaultSchemaTxt = path.join(repoRoot, "DEV_exports", "game-schema-source-selected.proto.txt");

const MAX_MARKDOWN_ROWS = 80;
const MAX_JSON_ROWS = 2000;

const typeNames = new Map([
  [1, "double"],
  [2, "float"],
  [3, "int64"],
  [4, "uint64"],
  [5, "int32"],
  [6, "fixed64"],
  [7, "fixed32"],
  [8, "bool"],
  [9, "string"],
  [10, "group"],
  [11, "message"],
  [12, "bytes"],
  [13, "uint32"],
  [14, "enum"],
  [15, "sfixed32"],
  [16, "sfixed64"],
  [17, "sint32"],
  [18, "sint64"],
]);

const labelNames = new Map([
  [1, "optional"],
  [2, "required"],
  [3, "repeated"],
]);

const relevanceGroups = [
  {
    key: "damage",
    label: "Damage/DPS",
    pattern: /\bdamage\b|damage|SkillDamage|DamageData|DamageInfo|Dps|DPS|Hit|Behit|Crit|Critical|EDamage|DungeonDamage/i,
  },
  {
    key: "buff_attr",
    label: "Buff/Attr/Temp Attr",
    pattern: /buff|TempAttr|FightAttr|BasicAttr|UserFightAttr|UserAttr|AttrCrit|AttrDamage|BuffEvent|AddBuff|RemoveBuff|PlayerBuff|EBuff|ETempAttr|EAttrType/i,
  },
  {
    key: "talent_passive",
    label: "Talent/Passive",
    pattern: /talent|passive|ProfessionTalent|TalentNode|TalentStage|talentNodeIds|currentTalent/i,
  },
  {
    key: "owner_source",
    label: "Owner/Source/Actor",
    pattern: /source|owner|attacker|caster|summon|summoner|uuid|charId|entity|actor|targetId|player|fightSource|EDamageSource|EFightSource/i,
  },
  {
    key: "team_external",
    label: "Team/External Support",
    pattern: /team|party|ally|member|TeamBuff|TeamMember|PlayerBuff|Aura|UnionEffect|BuffEventTeamBuffAdd|assist/i,
  },
  {
    key: "runtime_state",
    label: "Runtime State/Sync",
    pattern: /CharSerialize|Sync|Aoi|Delta|EnterScene|Container|ProjectExtra|professionList|talentList|currentSkill|currentTalent|DirtyMask/i,
  },
  {
    key: "formula",
    label: "Formula/Multiplier",
    pattern: /formula|coefficient|multiplier|ratio|percent|pct|rate|value|Param|Parameter|Decision|Calculate|Cal/i,
  },
];

const exactTargets = [
  "ActiveProfessionTalentRequest",
  "AttrCritDamage",
  "BuffAttrEffect",
  "BuffChange",
  "BuffDBData",
  "BuffDBInfo",
  "BuffEventTeamBuffAdd",
  "BuffProfessionEffectData",
  "CharSerialize",
  "DamageData",
  "DamageInfo",
  "EDamageSource",
  "EBuffEventType",
  "EFightSource",
  "ETempAttrEffectType",
  "EAttrType",
  "FightSourceInfo",
  "PlayerBuff",
  "ProfessionTalentInfo",
  "ProjectExtraSyncData",
  "SeqPassiveSkillInfo",
  "SyncContainerData",
  "SyncDamageInfo",
  "TempAttrSkillDamage",
  "UserFightAttr",
  "currentTalentIdList",
  "damage_source",
  "talentNodeIds",
  "usedTalentPoints",
];

function parseArgs(argv) {
  const config = common.loadGeneratorConfig();
  const args = {
    game: config.gamePath || "steam",
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    fieldCsv: defaultFieldCsv,
    schemaTxt: defaultSchemaTxt,
    maxMarkdownRows: MAX_MARKDOWN_ROWS,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case "--game":
        args.game = next;
        index += 1;
        break;
      case "--out-json":
        args.outJson = path.resolve(next);
        index += 1;
        break;
      case "--out-md":
        args.outMd = path.resolve(next);
        index += 1;
        break;
      case "--field-csv":
        args.fieldCsv = path.resolve(next);
        index += 1;
        break;
      case "--schema-txt":
        args.schemaTxt = path.resolve(next);
        index += 1;
        break;
      case "--max-rows":
        args.maxMarkdownRows = Math.max(10, Number(next) || MAX_MARKDOWN_ROWS);
        index += 1;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/extract-game-schema-source-map.mjs [options]

Decode protobuf FileDescriptorSet package entries from the game container and
write an offline contribution-oriented schema/source map.

Options:
  --game <path|preset>       Game path or preset. Default comes from BPSR-UID-Extractors/gamepath.json.
  --out-json <path>          JSON report path.
  --out-md <path>            Markdown report path.
  --field-csv <path>         CSV field map path.
  --schema-txt <path>        Selected .proto-like text output path.
  --max-rows <n>             Max Markdown rows per large table. Default: ${MAX_MARKDOWN_ROWS}.
`);
}

function readVarint(buffer, offset) {
  let value = 0n;
  let shift = 0n;
  let next = offset;
  for (let count = 0; count < 10 && next < buffer.length; count += 1) {
    const byte = buffer[next];
    next += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: Number(value), next };
    }
    shift += 7n;
  }
  return null;
}

function decodeProtoFields(buffer) {
  const fields = [];
  let offset = 0;
  while (offset < buffer.length) {
    const key = readVarint(buffer, offset);
    if (!key) break;
    offset = key.next;
    const fieldNo = Math.floor(key.value / 8);
    const wireType = key.value % 8;
    if (fieldNo <= 0) break;

    if (wireType === 0) {
      const value = readVarint(buffer, offset);
      if (!value) break;
      fields.push({ fieldNo, wireType, value: value.value });
      offset = value.next;
    } else if (wireType === 1) {
      if (offset + 8 > buffer.length) break;
      fields.push({ fieldNo, wireType, value: buffer.readBigUInt64LE(offset).toString() });
      offset += 8;
    } else if (wireType === 2) {
      const len = readVarint(buffer, offset);
      if (!len) break;
      offset = len.next;
      if (len.value < 0 || offset + len.value > buffer.length) break;
      fields.push({ fieldNo, wireType, bytes: buffer.subarray(offset, offset + len.value) });
      offset += len.value;
    } else if (wireType === 5) {
      if (offset + 4 > buffer.length) break;
      fields.push({ fieldNo, wireType, value: buffer.readUInt32LE(offset) });
      offset += 4;
    } else {
      break;
    }
  }
  return fields;
}

function fieldBytes(fields, fieldNo) {
  return fields.filter((field) => field.fieldNo === fieldNo && field.wireType === 2 && field.bytes);
}

function fieldString(fields, fieldNo) {
  const field = fieldBytes(fields, fieldNo)[0];
  return field ? safeString(field.bytes) : "";
}

function fieldStrings(fields, fieldNo) {
  return fieldBytes(fields, fieldNo).map((field) => safeString(field.bytes)).filter(Boolean);
}

function fieldNumber(fields, fieldNo) {
  const field = fields.find((item) => item.fieldNo === fieldNo && "value" in item);
  return field ? Number(field.value) : null;
}

function safeString(buffer) {
  if (!buffer?.length) return "";
  if (buffer.includes(0)) return "";
  return buffer.toString("utf8").trim();
}

function parseFileDescriptorSet(buffer) {
  const outerFields = decodeProtoFields(buffer);
  const descriptors = [];
  for (const field of outerFields) {
    if (field.fieldNo !== 1 || field.wireType !== 2 || !field.bytes) continue;
    descriptors.push(parseFileDescriptor(field.bytes));
  }
  return descriptors;
}

function parseFileDescriptor(buffer) {
  const fields = decodeProtoFields(buffer);
  return {
    name: fieldString(fields, 1),
    package: fieldString(fields, 2),
    dependency: fieldStrings(fields, 3),
    messages: fieldBytes(fields, 4).map((field) => parseDescriptorProto(field.bytes)),
    enums: fieldBytes(fields, 5).map((field) => parseEnumDescriptor(field.bytes)),
    services: fieldBytes(fields, 6).map((field) => parseServiceDescriptor(field.bytes)),
    syntax: fieldString(fields, 12),
    rawLength: buffer.length,
  };
}

function parseDescriptorProto(buffer) {
  const fields = decodeProtoFields(buffer);
  return {
    name: fieldString(fields, 1),
    fields: fieldBytes(fields, 2).map((field) => parseFieldDescriptor(field.bytes)),
    nestedMessages: fieldBytes(fields, 3).map((field) => parseDescriptorProto(field.bytes)),
    enums: fieldBytes(fields, 4).map((field) => parseEnumDescriptor(field.bytes)),
    oneofs: fieldBytes(fields, 8).map((field) => parseOneofDescriptor(field.bytes)),
  };
}

function parseFieldDescriptor(buffer) {
  const fields = decodeProtoFields(buffer);
  const type = fieldNumber(fields, 5);
  const label = fieldNumber(fields, 4);
  return {
    name: fieldString(fields, 1),
    extendee: fieldString(fields, 2),
    number: fieldNumber(fields, 3),
    label,
    labelName: labelNames.get(label) ?? "",
    type,
    typeName: typeNames.get(type) ?? "",
    messageOrEnumType: fieldString(fields, 6),
    defaultValue: fieldString(fields, 7),
    oneofIndex: fieldNumber(fields, 9),
    jsonName: fieldString(fields, 10),
    proto3Optional: Boolean(fieldNumber(fields, 17)),
  };
}

function parseEnumDescriptor(buffer) {
  const fields = decodeProtoFields(buffer);
  return {
    name: fieldString(fields, 1),
    values: fieldBytes(fields, 2).map((field) => parseEnumValue(field.bytes)),
  };
}

function parseEnumValue(buffer) {
  const fields = decodeProtoFields(buffer);
  return {
    name: fieldString(fields, 1),
    number: fieldNumber(fields, 2),
  };
}

function parseOneofDescriptor(buffer) {
  const fields = decodeProtoFields(buffer);
  return {
    name: fieldString(fields, 1),
  };
}

function parseServiceDescriptor(buffer) {
  const fields = decodeProtoFields(buffer);
  return {
    name: fieldString(fields, 1),
    methods: fieldBytes(fields, 2).map((field) => parseMethodDescriptor(field.bytes)),
  };
}

function parseMethodDescriptor(buffer) {
  const fields = decodeProtoFields(buffer);
  return {
    name: fieldString(fields, 1),
    inputType: fieldString(fields, 2),
    outputType: fieldString(fields, 3),
  };
}

function readEntrySlice(containerDir, entry, length = 256) {
  const filePath = path.join(containerDir, `m${entry.index}.pkg`);
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(length, entry.length));
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, entry.offset);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function isFileDescriptorSetHeader(buffer, entryLength) {
  const outer = readVarint(buffer, 0);
  if (!outer || outer.value !== 10) return null;
  const len = readVarint(buffer, outer.next);
  if (!len || len.value <= 0) return null;
  if (len.next + len.value > buffer.length && len.next + len.value > entryLength) return null;
  const innerStart = len.next;
  const inner = readVarint(buffer, innerStart);
  if (!inner || inner.value !== 10) return null;
  const nameLen = readVarint(buffer, inner.next);
  if (!nameLen || nameLen.value <= 0 || nameLen.value > 160) return null;
  if (nameLen.next + nameLen.value > buffer.length) return null;
  const firstFileName = safeString(buffer.subarray(nameLen.next, nameLen.next + nameLen.value));
  if (!/^[A-Za-z0-9_./-]+\.proto$/.test(firstFileName)) return null;
  return { firstFileName, firstDescriptorLength: len.value };
}

function findDescriptorSetEntries(containerDir, metaEntries) {
  const entries = [];
  for (const entry of [...metaEntries.values()].sort((left, right) => left.index - right.index || left.offset - right.offset)) {
    let header;
    try {
      header = readEntrySlice(containerDir, entry, 512);
    } catch {
      continue;
    }
    const probe = isFileDescriptorSetHeader(header, entry.length);
    if (!probe) continue;
    entries.push({ ...entry, ...probe });
  }
  return entries;
}

function flattenMessages(file, bundle, message, parentName = "") {
  const localFullName = parentName ? `${parentName}.${message.name}` : message.name;
  const fullName = file.package ? `.${file.package}.${localFullName}` : `.${localFullName}`;
  const rows = [{
    bundleKey: bundle.key,
    bundleOffset: bundle.offset,
    bundleName: bundle.firstFileName,
    fileName: file.name,
    package: file.package,
    name: message.name,
    fullName,
    fieldCount: message.fields.length,
    nestedMessageCount: message.nestedMessages.length,
    enumCount: message.enums.length,
    fields: message.fields,
    oneofs: message.oneofs,
    groups: relevanceForText(`${file.name} ${file.package} ${fullName} ${message.fields.map((field) => field.name).join(" ")}`),
  }];
  for (const nested of message.nestedMessages) {
    rows.push(...flattenMessages(file, bundle, nested, localFullName));
  }
  return rows;
}

function flattenEnums(file, bundle, enumRow, parentName = "") {
  const localFullName = parentName ? `${parentName}.${enumRow.name}` : enumRow.name;
  const fullName = file.package ? `.${file.package}.${localFullName}` : `.${localFullName}`;
  return [{
    bundleKey: bundle.key,
    bundleOffset: bundle.offset,
    bundleName: bundle.firstFileName,
    fileName: file.name,
    package: file.package,
    name: enumRow.name,
    fullName,
    valueCount: enumRow.values.length,
    values: enumRow.values,
    groups: relevanceForText(`${file.name} ${file.package} ${fullName} ${enumRow.values.map((value) => value.name).join(" ")}`),
  }];
}

function collectSchemaRows(bundles) {
  const fileRows = [];
  const messageRows = [];
  const enumRows = [];
  const fieldRows = [];
  const serviceRows = [];

  for (const bundle of bundles) {
    for (const file of bundle.files) {
      const fileText = `${file.name} ${file.package} ${file.dependency.join(" ")}`;
      fileRows.push({
        bundleKey: bundle.key,
        bundleOffset: bundle.offset,
        bundleName: bundle.firstFileName,
        name: file.name,
        package: file.package,
        syntax: file.syntax,
        dependencyCount: file.dependency.length,
        messageCount: file.messages.length,
        enumCount: file.enums.length,
        serviceCount: file.services.length,
        rawLength: file.rawLength,
        groups: relevanceForText(fileText),
      });

      for (const message of file.messages) {
        const flattened = flattenMessages(file, bundle, message);
        messageRows.push(...flattened);
      }
      for (const enumRow of file.enums) {
        enumRows.push(...flattenEnums(file, bundle, enumRow));
      }
      for (const service of file.services) {
        serviceRows.push({
          bundleKey: bundle.key,
          bundleOffset: bundle.offset,
          bundleName: bundle.firstFileName,
          fileName: file.name,
          package: file.package,
          name: service.name,
          methods: service.methods,
          methodCount: service.methods.length,
          groups: relevanceForText(`${file.name} ${service.name} ${service.methods.map((method) => `${method.name} ${method.inputType} ${method.outputType}`).join(" ")}`),
        });
      }
    }
  }

  const messageByFullName = new Map(messageRows.map((row) => [row.fullName, row]));
  for (const message of messageRows) {
    for (const field of message.fields) {
      const fieldText = `${message.fileName} ${message.fullName} ${field.name} ${field.jsonName} ${field.messageOrEnumType}`;
      const fieldGroups = relevanceForText(fieldText);
      const resolvedType = field.messageOrEnumType || field.typeName;
      fieldRows.push({
        bundleKey: message.bundleKey,
        bundleOffset: message.bundleOffset,
        bundleName: message.bundleName,
        fileName: message.fileName,
        package: message.package,
        messageName: message.name,
        messageFullName: message.fullName,
        fieldName: field.name,
        jsonName: field.jsonName,
        number: field.number,
        label: field.labelName,
        type: field.typeName,
        resolvedType,
        targetMessageKnown: messageByFullName.has(resolvedType),
        proto3Optional: field.proto3Optional,
        groups: fieldGroups,
      });
    }
  }

  return { fileRows, messageRows, enumRows, fieldRows, serviceRows };
}

function relevanceForText(text) {
  const hits = [];
  for (const group of relevanceGroups) {
    if (group.pattern.test(text)) hits.push(group.key);
  }
  return hits;
}

function groupLabels(keys) {
  return keys.map((key) => relevanceGroups.find((group) => group.key === key)?.label ?? key);
}

function scoreGroups(keys) {
  const weights = {
    damage: 5,
    buff_attr: 5,
    talent_passive: 5,
    owner_source: 4,
    team_external: 4,
    runtime_state: 4,
    formula: 2,
  };
  return keys.reduce((sum, key) => sum + (weights[key] ?? 1), 0);
}

function scoreRow(row) {
  const base = scoreGroups(row.groups ?? []);
  const text = [
    row.name,
    row.fullName,
    row.fieldName,
    row.messageFullName,
    row.fileName,
    row.resolvedType,
    row.values?.map((value) => value.name).join(" "),
  ].filter(Boolean).join(" ");
  const exactScore = exactTargets.some((target) => text.toLowerCase().includes(target.toLowerCase())) ? 10 : 0;
  return base + exactScore;
}

function sortInteresting(rows) {
  return rows
    .map((row) => ({ ...row, score: scoreRow(row) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || String(left.fullName ?? left.name ?? "").localeCompare(String(right.fullName ?? right.name ?? "")));
}

function findExactTargets({ fileRows, messageRows, enumRows, fieldRows, serviceRows }) {
  const targets = [];
  for (const target of exactTargets) {
    const lower = target.toLowerCase();
    const matches = [];
    for (const row of messageRows) {
      if (`${row.fullName} ${row.fileName}`.toLowerCase().includes(lower)) {
        matches.push({ kind: "message", name: row.fullName, fileName: row.fileName, bundleKey: row.bundleKey });
      }
    }
    for (const row of enumRows) {
      const valueText = row.values.map((value) => value.name).join(" ");
      if (`${row.fullName} ${row.fileName} ${valueText}`.toLowerCase().includes(lower)) {
        matches.push({ kind: "enum", name: row.fullName, fileName: row.fileName, bundleKey: row.bundleKey });
      }
    }
    for (const row of fieldRows) {
      if (`${row.messageFullName} ${row.fieldName} ${row.jsonName} ${row.resolvedType}`.toLowerCase().includes(lower)) {
        matches.push({ kind: "field", name: `${row.messageFullName}.${row.fieldName}`, fileName: row.fileName, bundleKey: row.bundleKey });
      }
    }
    for (const row of serviceRows) {
      const methodText = row.methods.map((method) => `${method.name} ${method.inputType} ${method.outputType}`).join(" ");
      if (`${row.name} ${row.fileName} ${methodText}`.toLowerCase().includes(lower)) {
        matches.push({ kind: "service", name: row.name, fileName: row.fileName, bundleKey: row.bundleKey });
      }
    }
    for (const row of fileRows) {
      if (`${row.name} ${row.package}`.toLowerCase().includes(lower)) {
        matches.push({ kind: "file", name: row.name, fileName: row.name, bundleKey: row.bundleKey });
      }
    }
    targets.push({
      target,
      found: matches.length,
      matches: matches.slice(0, 20),
    });
  }
  return targets.sort((left, right) => {
    if (Boolean(right.found) !== Boolean(left.found)) return Number(Boolean(right.found)) - Number(Boolean(left.found));
    return left.target.localeCompare(right.target);
  });
}

function summarize({ bundles, rows, exactTargetMatches }) {
  const groupCounts = new Map();
  for (const row of [...rows.fileRows, ...rows.messageRows, ...rows.enumRows, ...rows.fieldRows, ...rows.serviceRows]) {
    for (const group of row.groups ?? []) {
      groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    }
  }
  return {
    descriptorSets: bundles.length,
    files: rows.fileRows.length,
    messages: rows.messageRows.length,
    enums: rows.enumRows.length,
    fields: rows.fieldRows.length,
    services: rows.serviceRows.length,
    methods: rows.serviceRows.reduce((sum, row) => sum + row.methodCount, 0),
    exactTargetsFound: exactTargetMatches.filter((row) => row.found).length,
    exactTargetsMissing: exactTargetMatches.filter((row) => !row.found).map((row) => row.target),
    groupCounts: [...groupCounts.entries()]
      .map(([key, count]) => ({ key, label: relevanceGroups.find((group) => group.key === key)?.label ?? key, count }))
      .sort((left, right) => right.count - left.count),
  };
}

function typeForProto(field) {
  const type = field.messageOrEnumType
    ? field.messageOrEnumType.replace(/^\./, "")
    : field.typeName || "unknown";
  const label = field.labelName === "optional" ? "" : `${field.labelName} `;
  return `${label}${type}`;
}

function renderMessage(message, indent = "") {
  const lines = [];
  lines.push(`${indent}message ${message.name} {`);
  for (const oneof of message.oneofs ?? []) {
    lines.push(`${indent}  oneof ${oneof.name} {}`);
  }
  for (const field of message.fields) {
    lines.push(`${indent}  ${typeForProto(field)} ${field.name} = ${field.number};`);
  }
  for (const enumRow of message.enums ?? []) {
    lines.push(...renderEnum(enumRow, `${indent}  `));
  }
  for (const nested of message.nestedMessages ?? []) {
    lines.push(...renderMessage(nested, `${indent}  `));
  }
  lines.push(`${indent}}`);
  return lines;
}

function renderEnum(enumRow, indent = "") {
  const lines = [];
  lines.push(`${indent}enum ${enumRow.name} {`);
  for (const value of enumRow.values) {
    lines.push(`${indent}  ${value.name} = ${value.number};`);
  }
  lines.push(`${indent}}`);
  return lines;
}

function fileRelevanceScore(file) {
  const text = [
    file.name,
    file.package,
    ...file.messages.map((message) => JSON.stringify(message)),
    ...file.enums.map((enumRow) => JSON.stringify(enumRow)),
    ...file.services.map((service) => JSON.stringify(service)),
  ].join(" ");
  const lower = text.toLowerCase();
  const groups = relevanceForText(text);
  const exactHitCount = exactTargets.filter((target) => lower.includes(target.toLowerCase())).length;
  return {
    file,
    score: scoreGroups(groups) + exactHitCount * 20,
    groups,
    exactHitCount,
  };
}

function selectedProtoFiles(files, limit = 160) {
  return files
    .map(fileRelevanceScore)
    .filter((row) => row.score > 0)
    .sort((left, right) => (
      right.exactHitCount - left.exactHitCount
      || right.score - left.score
      || left.file.name.localeCompare(right.file.name)
    ))
    .slice(0, limit);
}

function renderSelectedProtoText(files) {
  const interestingFiles = selectedProtoFiles(files, 160).map((row) => row.file);

  const lines = [];
  lines.push("// Selected contribution-relevant schemas, sorted by exact target hits and relevance.");
  lines.push("");
  for (const file of interestingFiles) {
    const ranked = fileRelevanceScore(file);
    lines.push(`// ${file.name}`);
    lines.push(`// score=${ranked.score} exactTargets=${ranked.exactHitCount} groups=${groupLabels(ranked.groups).join(", ") || "none"}`);
    lines.push(`syntax = "${file.syntax || "proto3"}";`);
    if (file.package) lines.push(`package ${file.package};`);
    for (const dep of file.dependency) lines.push(`import "${dep}";`);
    for (const enumRow of file.enums) lines.push(...renderEnum(enumRow));
    for (const message of file.messages) lines.push(...renderMessage(message));
    for (const service of file.services) {
      lines.push(`service ${service.name} {`);
      for (const method of service.methods) {
        lines.push(`  rpc ${method.name}(${method.inputType.replace(/^\./, "") || "unknown"}) returns (${method.outputType.replace(/^\./, "") || "unknown"});`);
      }
      lines.push("}");
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function countSelectedProtoFiles(files) {
  return selectedProtoFiles(files, 200).map((row) => ({
    name: row.file.name,
    score: row.score,
    exactHitCount: row.exactHitCount,
    groups: row.groups,
  }));
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(filePath, headers, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function renderMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Game Schema Source Map");
  lines.push("");
  lines.push("Offline report decoded from game protobuf descriptor sets. This does not change parser or Skill Details behavior.");
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(`- generatedAt: \`${report.generatedAt}\``);
  lines.push(`- gamePackage: \`${report.input.m0Path}\``);
  lines.push(`- descriptor sets: ${report.summary.descriptorSets}`);
  lines.push("");
  lines.push("## Outputs");
  lines.push("");
  lines.push(`- JSON: \`${report.outputs.json}\``);
  lines.push(`- field CSV: \`${report.outputs.fieldCsv}\``);
  lines.push(`- selected schema text: \`${report.outputs.schemaTxt}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(markdownTable(["Metric", "Value"], [
    ["Files", report.summary.files],
    ["Messages", report.summary.messages],
    ["Enums", report.summary.enums],
    ["Fields", report.summary.fields],
    ["Services", report.summary.services],
    ["Methods", report.summary.methods],
    ["Exact targets found", report.summary.exactTargetsFound],
    ["Exact targets missing", report.summary.exactTargetsMissing.join(", ") || "none"],
  ]));
  lines.push("");
  lines.push("## Descriptor Sets");
  lines.push("");
  lines.push(markdownTable(
    ["Key", "Offset", "Length", "First File", "Files", "Messages", "Enums", "Fields"],
    report.descriptorSets.map((bundle) => [
      bundle.key,
      bundle.offset,
      bundle.length,
      bundle.firstFileName,
      bundle.fileCount,
      bundle.messageCount,
      bundle.enumCount,
      bundle.fieldCount,
    ]),
  ));
  lines.push("");
  lines.push("## Relevance Counts");
  lines.push("");
  lines.push(markdownTable(["Group", "Rows"], report.summary.groupCounts.map((row) => [row.label, row.count])));
  lines.push("");
  lines.push("## Exact Targets");
  lines.push("");
  lines.push(markdownTable(
    ["Target", "Found", "Examples"],
    report.exactTargetMatches.map((row) => [
      row.target,
      row.found,
      row.matches.slice(0, 4).map((match) => `${match.kind}: ${match.name}`).join("<br>"),
    ]),
  ));
  lines.push("");
  lines.push("## Interesting Messages");
  lines.push("");
  lines.push(markdownTable(
    ["Score", "Groups", "Message", "File", "Fields"],
    report.interesting.messages.slice(0, maxRows).map((row) => [
      row.score,
      groupLabels(row.groups).join(", "),
      row.fullName,
      row.fileName,
      row.fields.slice(0, 16).map((field) => `${field.name}:${field.messageOrEnumType || field.typeName}`).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Interesting Fields");
  lines.push("");
  lines.push(markdownTable(
    ["Score", "Groups", "Field", "Type", "File"],
    report.interesting.fields.slice(0, maxRows).map((row) => [
      row.score,
      groupLabels(row.groups).join(", "),
      `${row.messageFullName}.${row.fieldName} #${row.number}`,
      row.resolvedType,
      row.fileName,
    ]),
  ));
  lines.push("");
  lines.push("## Interesting Enums");
  lines.push("");
  lines.push(markdownTable(
    ["Score", "Groups", "Enum", "File", "Values"],
    report.interesting.enums.slice(0, maxRows).map((row) => [
      row.score,
      groupLabels(row.groups).join(", "),
      row.fullName,
      row.fileName,
      row.values.slice(0, 20).map((value) => `${value.name}=${value.number}`).join(", "),
    ]),
  ));
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- The `zproto` descriptor set is the current best static map for runtime state and RPC structs.");
  lines.push("- Missing exact targets mean they were not in the decoded descriptor sets, even if the name appeared elsewhere such as Unity metadata.");
  lines.push("- For calculated contribution rows, the most useful next step is connecting these schema fields to captured runtime packets/log rows.");
  return `${lines.join("\n")}\n`;
}

function relativeOutput(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function buildReport(args) {
  const m0Path = common.resolveM0Package(args.game);
  const containerDir = path.dirname(m0Path);
  const metaEntries = common.loadMetaEntries(containerDir);
  const descriptorEntries = findDescriptorSetEntries(containerDir, metaEntries);
  const bundles = [];

  for (const entry of descriptorEntries) {
    const data = common.readPkgEntry(containerDir, entry);
    const files = parseFileDescriptorSet(data);
    const rows = collectSchemaRows([{ ...entry, files }]);
    bundles.push({
      key: entry.key,
      type: entry.type,
      index: entry.index,
      offset: entry.offset,
      length: entry.length,
      firstFileName: entry.firstFileName,
      firstDescriptorLength: entry.firstDescriptorLength,
      files,
      fileCount: files.length,
      messageCount: rows.messageRows.length,
      enumCount: rows.enumRows.length,
      fieldCount: rows.fieldRows.length,
      serviceCount: rows.serviceRows.length,
    });
  }

  const rows = collectSchemaRows(bundles);
  const exactTargetMatches = findExactTargets(rows);
  const interesting = {
    files: sortInteresting(rows.fileRows).slice(0, MAX_JSON_ROWS),
    messages: sortInteresting(rows.messageRows).slice(0, MAX_JSON_ROWS),
    enums: sortInteresting(rows.enumRows).slice(0, MAX_JSON_ROWS),
    fields: sortInteresting(rows.fieldRows).slice(0, MAX_JSON_ROWS),
    services: sortInteresting(rows.serviceRows).slice(0, MAX_JSON_ROWS),
  };

  return {
    generatedAt: new Date().toISOString(),
    input: { m0Path, containerDir },
    outputs: {
      json: relativeOutput(args.outJson),
      markdown: relativeOutput(args.outMd),
      fieldCsv: relativeOutput(args.fieldCsv),
      schemaTxt: relativeOutput(args.schemaTxt),
    },
    descriptorSets: bundles.map((bundle) => ({
      key: bundle.key,
      type: bundle.type,
      index: bundle.index,
      offset: bundle.offset,
      length: bundle.length,
      firstFileName: bundle.firstFileName,
      firstDescriptorLength: bundle.firstDescriptorLength,
      fileCount: bundle.fileCount,
      messageCount: bundle.messageCount,
      enumCount: bundle.enumCount,
      fieldCount: bundle.fieldCount,
      serviceCount: bundle.serviceCount,
    })),
    summary: summarize({ bundles, rows, exactTargetMatches }),
    exactTargetMatches,
    interesting,
    rows: {
      files: rows.fileRows,
      messages: rows.messageRows.map((row) => ({ ...row, fields: row.fields.map((field) => field.name) })),
      enums: rows.enumRows.map((row) => ({ ...row, values: row.values.slice(0, 80) })),
      services: rows.serviceRows,
    },
    selectedFiles: countSelectedProtoFiles(bundles.flatMap((bundle) => bundle.files)),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const report = buildReport(args);

  const fieldRows = report.interesting.fields.map((row) => ({
    score: row.score,
    groups: groupLabels(row.groups).join("; "),
    bundleKey: row.bundleKey,
    bundleOffset: row.bundleOffset,
    fileName: row.fileName,
    package: row.package,
    messageFullName: row.messageFullName,
    fieldName: row.fieldName,
    jsonName: row.jsonName,
    number: row.number,
    label: row.label,
    type: row.type,
    resolvedType: row.resolvedType,
    targetMessageKnown: row.targetMessageKnown,
  }));

  fs.mkdirSync(path.dirname(args.outJson), { recursive: true });
  fs.writeFileSync(args.outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(args.outMd, renderMarkdown(report, args.maxMarkdownRows), "utf8");
  writeCsv(args.fieldCsv, [
    "score",
    "groups",
    "bundleKey",
    "bundleOffset",
    "fileName",
    "package",
    "messageFullName",
    "fieldName",
    "jsonName",
    "number",
    "label",
    "type",
    "resolvedType",
    "targetMessageKnown",
  ], fieldRows);

  const m0Path = common.resolveM0Package(args.game);
  const containerDir = path.dirname(m0Path);
  const metaEntries = common.loadMetaEntries(containerDir);
  const descriptorEntries = findDescriptorSetEntries(containerDir, metaEntries);
  const allFiles = descriptorEntries.flatMap((entry) => {
    const data = common.readPkgEntry(containerDir, entry);
    return parseFileDescriptorSet(data);
  });
  fs.writeFileSync(args.schemaTxt, renderSelectedProtoText(allFiles), "utf8");

  console.log(`Descriptor sets: ${report.summary.descriptorSets}`);
  console.log(`Messages: ${report.summary.messages}, enums: ${report.summary.enums}, fields: ${report.summary.fields}`);
  console.log(`Exact targets found: ${report.summary.exactTargetsFound}/${exactTargets.length}`);
  console.log(`Markdown: ${relativeOutput(args.outMd)}`);
}

main();
