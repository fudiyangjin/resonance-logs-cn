import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as common from "../../BPSR-UID-Extractors/generator-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const MiB = 1024 * 1024;
const KiB = 1024;
const DEFAULT_SAMPLE_BYTES = 128 * KiB;
const MAX_LEADS_IN_JSON = 5000;
const MAX_MARKDOWN_ROWS = 80;

const defaultOutJson = path.join(repoRoot, "DEV_exports", "game-whole-index.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "game-whole-index.md");
const defaultFileCsv = path.join(repoRoot, "DEV_exports", "game-whole-index-files.csv");
const defaultPackageCsv = path.join(repoRoot, "DEV_exports", "game-whole-index-package-entries.csv");
const defaultLeadCsv = path.join(repoRoot, "DEV_exports", "game-whole-index-leads.csv");

const mediaExtensions = new Set([
  ".wem",
  ".bnk",
  ".bank",
  ".ogg",
  ".mp3",
  ".wav",
  ".mp4",
  ".webm",
  ".usm",
  ".bik",
]);

const packageExtensions = new Set([".pkg"]);

const knownTableNames = [
  "BasicAttrTable.ctb",
  "BuffTable.ctb",
  "DamageAttrTable.ctb",
  "FightAttrTable.ctb",
  "ItemTable.ctb",
  "ModEffectTable.ctb",
  "MonsterTable.ctb",
  "RecountTable.ctb",
  "RogueBuffTable.ctb",
  "SceneTable.ctb",
  "SkillAoyiTable.ctb",
  "SkillEffectTable.ctb",
  "SkillFightLevelTable.ctb",
  "SkillTable.ctb",
  "TalentTable.ctb",
  "TempAttrTable.ctb",
  "UnionBossBuffTable.ctb",
  "ValueCalTable.ctb",
  "FormulaTable.ctb",
  "DamageFormulaTable.ctb",
  "SkillDamageFormulaTable.ctb",
  "SkillRatioTable.ctb",
  "SeasonTalentTable.ctb",
  "SeasonEffectTable.ctb",
  "SeasonEffectDescription.ctb",
  "ProfessionTalentTable.ctb",
  "ProfessionTalentNodeTable.ctb",
  "ProfessionTable.ctb",
  "AttrLibTable.ctb",
  "AttrNameTable.ctb",
  "PassiveSkillTable.ctb",
  "StatusTable.ctb",
  "SkillDamageTable.ctb",
  "SkillCoefficientTable.ctb",
  ...common.GAME_LOCALIZATION_LANGUAGES.map((language) => `${language}.bytes`),
];

const knownHashLabels = new Map();
for (const name of knownTableNames) {
  knownHashLabels.set(common.hash33(name), name);
}
knownHashLabels.set(3345237628, "TalentTable.ctb");
knownHashLabels.set(4192598123, "SeasonEffectDescription");

const leadGroups = [
  {
    key: "inspiration_known_ids",
    label: "Inspiration known ids/names",
    terms: [
      "Inspiration",
      "Ultimate Inspiration",
      "Inspire and Strengthen",
      "2202040",
      "2202610",
      "2202720",
      "鼓舞",
      "极意鼓舞",
      "鼓舞强化",
    ],
  },
  {
    key: "damage_formula",
    label: "Damage formula/stat math",
    terms: [
      "DamageFormula",
      "DamageAttrFormula",
      "CalcDamage",
      "CalculateDamage",
      "SkillDamage",
      "DamageCoefficient",
      "Coefficient",
      "ValueCal",
      "Formula",
      "Multiplier",
      "FlatDamage",
      "Resistance",
      "Resist",
      "ATK",
      "MATK",
      "CritDamage",
      "CriticalDamage",
      "ElementalDamage",
      "Versatility",
      "伤害公式",
      "伤害系数",
      "倍率",
      "抗性",
      "元素伤害",
      "全能",
    ],
  },
  {
    key: "damage_skill_tables",
    label: "Damage/skill table names",
    terms: [
      "DamageAttrTable",
      "DamageAttrTableBase",
      "RecountTable",
      "SkillTable",
      "SkillEffectTable",
      "SkillFightLevelTable",
      "SkillFightLevelTableBase",
      "SkillAoyiTable",
      "TempAttrTable",
    ],
  },
  {
    key: "talent_passive",
    label: "Talent/passive surfaces",
    terms: [
      "TalentTable",
      "TalentTableBase",
      "ProfessionTalentInfo",
      "ProfessionTalent",
      "ProfessionTalentNode",
      "talent_node_ids",
      "talent_list",
      "PassiveSkillInfo",
      "SeqPassiveSkillInfo",
      "PassiveSkillComp",
      "passive_skill_infos",
      "passive_skill_end_infos",
      "天赋",
      "被动",
      "职业天赋",
    ],
  },
  {
    key: "buff_effects",
    label: "Buff/effect/status surfaces",
    terms: [
      "BuffTable",
      "BuffTableBase",
      "ModEffectTable",
      "BuffEffect",
      "AddBuff",
      "RemoveBuff",
      "StatusEffect",
      "TempAttr",
      "FightAttr",
      "BasicAttr",
      "增益",
      "状态",
      "效果",
      "属性",
    ],
  },
  {
    key: "external_team_support",
    label: "External/team support surfaces",
    terms: [
      "Team",
      "Party",
      "Ally",
      "OtherPlayer",
      "PlayerBuff",
      "Aura",
      "Caster",
      "SourcePlayer",
      "队友",
      "全队",
      "小队",
      "友方",
      "团队",
      "协同",
      "主属性",
      "副属性",
    ],
  },
  {
    key: "runtime_owner_source",
    label: "Runtime owner/source packet fields",
    terms: [
      "SyncDamageInfo",
      "AoiSyncDelta",
      "SyncNearDeltaInfo",
      "SyncToMeDeltaInfo",
      "CharSerialize",
      "EnterScene",
      "owner_id",
      "source_uid",
      "source_uuid",
      "attacker_uuid",
      "top_summoner_id",
      "summoner_id",
      "hit_event_id",
      "damage_source",
      "buff_owner",
      "caster_id",
    ],
  },
  {
    key: "stat_rating_modifiers",
    label: "Stat/rating modifiers",
    terms: [
      "CritRate",
      "CriticalRate",
      "CritDamage",
      "CriticalDamage",
      "Attack",
      "MagicAttack",
      "Strength",
      "Dexterity",
      "Intelligence",
      "Mind",
      "Agility",
      "Substat",
      "Rating",
      "会心",
      "暴击",
      "暴击率",
      "暴击伤害",
      "爆伤",
      "攻击",
      "魔法攻击",
      "力量",
      "灵巧",
      "智力",
      "精神",
    ],
  },
  {
    key: "managed_schema",
    label: "Managed/schema/code surfaces",
    terms: [
      "Panda.Table.dll",
      "Panda.ZRpcGen.dll",
      "Panda.AOT.AttrBase.dll",
      "Assembly-CSharp.dll",
      "global-metadata.dat",
      "ScriptingAssemblies",
      "Il2Cpp",
      "ZRpc",
      "protobuf",
      "proto",
      "DummyDll",
    ],
  },
];

function parseArgs(argv) {
  const generatorConfig = common.loadGeneratorConfig();
  const args = {
    game: generatorConfig.gamePath || "steam",
    gameRoot: "",
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    fileCsv: defaultFileCsv,
    packageCsv: defaultPackageCsv,
    leadCsv: defaultLeadCsv,
    maxFileFullScanBytes: 64 * MiB,
    maxEntryFullScanBytes: 4 * MiB,
    maxCtbFullScanBytes: 384 * MiB,
    sampleBytes: DEFAULT_SAMPLE_BYTES,
    maxSamplesPerSurface: 5,
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
      case "--game-root":
        args.gameRoot = path.resolve(next);
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
      case "--file-csv":
        args.fileCsv = path.resolve(next);
        index += 1;
        break;
      case "--package-csv":
        args.packageCsv = path.resolve(next);
        index += 1;
        break;
      case "--lead-csv":
        args.leadCsv = path.resolve(next);
        index += 1;
        break;
      case "--max-file-full-scan-mb":
        args.maxFileFullScanBytes = Math.max(1, Number(next) || 1) * MiB;
        index += 1;
        break;
      case "--max-entry-full-scan-mb":
        args.maxEntryFullScanBytes = Math.max(1, Number(next) || 1) * MiB;
        index += 1;
        break;
      case "--max-ctb-full-scan-mb":
        args.maxCtbFullScanBytes = Math.max(1, Number(next) || 1) * MiB;
        index += 1;
        break;
      case "--sample-kb":
        args.sampleBytes = Math.max(4, Number(next) || 4) * KiB;
        index += 1;
        break;
      case "--max-samples":
        args.maxSamplesPerSurface = Math.max(1, Number(next) || 1);
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
  console.log(`Usage: node scripts/index-whole-game-files.mjs [options]

Builds a whole-game offline index:
  - folder file inventory
  - meta.pkg/package-entry inventory
  - keyword lead log for formulas, buffs, talents, runtime ownership, and Inspiration-style support

Options:
  --game <path|preset>             Game path or preset. Default comes from BPSR-UID-Extractors/gamepath.json.
  --game-root <path>               Explicit folder to inventory. Default resolves from m0.pkg to the install root.
  --out-json <path>                JSON summary path.
  --out-md <path>                  Markdown summary path.
  --file-csv <path>                Folder index CSV path.
  --package-csv <path>             Package-entry index CSV path.
  --lead-csv <path>                Lead log CSV path.
  --max-file-full-scan-mb <n>      Full raw scan limit for normal files. Default: 64.
  --max-entry-full-scan-mb <n>     Full raw scan limit for non-CTB package entries. Default: 4.
  --max-ctb-full-scan-mb <n>       Full CTB parse/scan limit. Default: 384.
  --sample-kb <n>                  Head/middle/tail sample size for large files/entries. Default: 128.
  --max-samples <n>                Samples kept per lead group per surface. Default: 5.
`);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  if (bytes >= MiB) return `${(bytes / MiB).toFixed(2)} MiB`;
  if (bytes >= KiB) return `${(bytes / KiB).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
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

function findAncestorByName(startDir, name) {
  let current = path.resolve(startDir);
  const target = name.toLowerCase();
  while (true) {
    if (path.basename(current).toLowerCase() === target) return current;
    const parent = path.dirname(current);
    if (parent === current) return "";
    current = parent;
  }
}

function resolveRoots(args) {
  const m0Path = common.resolveM0Package(args.game);
  const containerDir = path.dirname(m0Path);
  const dataRoot = findAncestorByName(containerDir, "BPSR_STEAM_Data");
  const executableRoot = dataRoot ? path.dirname(dataRoot) : path.resolve(containerDir, "..", "..", "..");
  const installRoot = path.basename(executableRoot).toLowerCase() === "bpsr"
    ? path.dirname(executableRoot)
    : executableRoot;
  const gameRoot = args.gameRoot ? path.resolve(args.gameRoot) : installRoot;
  return {
    m0Path,
    containerDir,
    dataRoot,
    executableRoot,
    installRoot,
    gameRoot,
  };
}

function extensionFor(filePath) {
  return path.extname(filePath).toLowerCase() || "(none)";
}

function classifyFileRole(file) {
  const rel = normalizeSlashes(file.relativePath).toLowerCase();
  const ext = file.extension;
  if (rel.includes("/streamingassets/container/") && ext === ".pkg") return "container-package";
  if (rel.endsWith("/meta.pkg")) return "container-meta";
  if (rel.includes("/streamingassets/container/audio/")) return "container-audio";
  if (ext === ".dll" || ext === ".exe") return "binary-code";
  if (ext === ".json" || ext === ".xml" || ext === ".txt" || ext === ".config" || ext === ".ini") return "text-config";
  if (rel.includes("/managed/") || rel.includes("global-metadata.dat")) return "managed-schema";
  if (ext === ".assets" || ext === ".resource" || ext === ".resS".toLowerCase()) return "unity-asset";
  if (mediaExtensions.has(ext)) return "media";
  return "other";
}

function walkFiles(root) {
  const files = [];
  const stack = [path.resolve(root)];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      files.push({
        absolutePath: dir,
        relativePath: path.relative(root, dir),
        error: `readdir failed: ${error.message}`,
      });
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile()) {
        let stat;
        try {
          stat = fs.statSync(absolutePath);
        } catch (error) {
          files.push({
            absolutePath,
            relativePath: path.relative(root, absolutePath),
            error: `stat failed: ${error.message}`,
          });
          continue;
        }
        const file = {
          absolutePath,
          relativePath: path.relative(root, absolutePath),
          extension: extensionFor(absolutePath),
          bytes: stat.size,
          modifiedTime: stat.mtime.toISOString(),
        };
        file.role = classifyFileRole(file);
        files.push(file);
      }
    }
  }

  return files.sort((left, right) => String(left.relativePath).localeCompare(String(right.relativePath)));
}

function summarizeBy(files, keyFn) {
  const map = new Map();
  for (const file of files) {
    if (file.error) continue;
    const key = keyFn(file);
    const current = map.get(key) ?? { key, count: 0, bytes: 0, maxBytes: 0 };
    current.count += 1;
    current.bytes += file.bytes;
    current.maxBytes = Math.max(current.maxBytes, file.bytes);
    map.set(key, current);
  }
  return [...map.values()].sort((left, right) => right.bytes - left.bytes || right.count - left.count);
}

function readFileSlice(filePath, offset, length) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
    return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function sampleFile(filePath, bytes, sampleBytes) {
  if (bytes <= sampleBytes * 3) {
    return fs.readFileSync(filePath);
  }
  return Buffer.concat([
    readFileSlice(filePath, 0, sampleBytes),
    readFileSlice(filePath, Math.max(0, Math.floor(bytes / 2) - Math.floor(sampleBytes / 2)), sampleBytes),
    readFileSlice(filePath, Math.max(0, bytes - sampleBytes), sampleBytes),
  ]);
}

function fileSignature(filePath, bytes, sampleBytes) {
  if (!bytes) return { magicHex: "", quickHash: "" };
  const first = readFileSlice(filePath, 0, Math.min(sampleBytes, bytes));
  const last = bytes > sampleBytes
    ? readFileSlice(filePath, Math.max(0, bytes - sampleBytes), Math.min(sampleBytes, bytes))
    : Buffer.alloc(0);
  const hash = crypto.createHash("sha1");
  hash.update(String(bytes));
  hash.update(first);
  hash.update(last);
  return {
    magicHex: first.subarray(0, 16).toString("hex"),
    magicAscii: first.subarray(0, 16).toString("ascii").replace(/[^\x20-\x7e]/g, "."),
    quickHash: hash.digest("hex"),
  };
}

function isAsciiTerm(term) {
  return /^[\x00-\x7f]+$/.test(term);
}

function compileTerms() {
  const compiled = [];
  const seen = new Set();
  for (const group of leadGroups) {
    for (const term of group.terms) {
      for (const encoding of ["utf8", "utf16le"]) {
        const key = `${group.key}\0${term}\0${encoding}`;
        if (seen.has(key)) continue;
        seen.add(key);
        compiled.push({
          groupKey: group.key,
          groupLabel: group.label,
          term,
          encoding,
          needle: Buffer.from(term, encoding),
        });
      }
    }
  }
  return compiled;
}

function compileTextTerms() {
  return leadGroups.map((group) => ({
    key: group.key,
    label: group.label,
    terms: [...new Set(group.terms)].map((term) => ({ term, lower: term.toLowerCase() })),
  }));
}

function normalizeContext(text) {
  return String(text || "").replace(/\0/g, "").replace(/\s+/g, " ").trim().slice(0, 360);
}

function contextFor(buffer, offset, encoding) {
  const window = 240;
  if (encoding === "utf16le") {
    const start = Math.max(0, offset - window);
    const end = Math.min(buffer.length, offset + window);
    const alignedStart = start + (start % 2);
    const usableLength = end - alignedStart - ((end - alignedStart) % 2);
    if (usableLength <= 0) return "";
    return normalizeContext(buffer.subarray(alignedStart, alignedStart + usableLength).toString("utf16le"));
  }
  const start = Math.max(0, offset - window);
  const end = Math.min(buffer.length, offset + window);
  return normalizeContext(buffer.subarray(start, end).toString("utf8"));
}

function scanBuffer(buffer, compiledTerms, maxSamplesPerSurface) {
  const groups = new Map();
  for (const compiled of compiledTerms) {
    if (!compiled.needle.length) continue;
    let offset = 0;
    while (offset < buffer.length) {
      const foundAt = buffer.indexOf(compiled.needle, offset);
      if (foundAt === -1) break;
      const group = groups.get(compiled.groupKey) ?? {
        key: compiled.groupKey,
        label: compiled.groupLabel,
        occurrences: 0,
        terms: new Map(),
        samples: [],
      };
      group.occurrences += 1;
      group.terms.set(compiled.term, (group.terms.get(compiled.term) ?? 0) + 1);
      if (group.samples.length < maxSamplesPerSurface) {
        group.samples.push({
          term: compiled.term,
          encoding: compiled.encoding,
          offset: foundAt,
          context: contextFor(buffer, foundAt, compiled.encoding),
        });
      }
      groups.set(compiled.groupKey, group);
      offset = foundAt + Math.max(compiled.needle.length, 1);
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    terms: Object.fromEntries([...group.terms.entries()].sort((left, right) => right[1] - left[1])),
  })).sort((left, right) => right.occurrences - left.occurrences);
}

function scanTextFragments(fragments, compiledTextTerms, maxSamplesPerSurface) {
  const groups = new Map();
  for (const fragment of fragments) {
    const text = String(fragment.text || "");
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const groupTerms of compiledTextTerms) {
      for (const term of groupTerms.terms) {
        if (!lower.includes(term.lower)) continue;
        const group = groups.get(groupTerms.key) ?? {
          key: groupTerms.key,
          label: groupTerms.label,
          occurrences: 0,
          terms: new Map(),
          samples: [],
        };
        group.occurrences += 1;
        group.terms.set(term.term, (group.terms.get(term.term) ?? 0) + 1);
        if (group.samples.length < maxSamplesPerSurface) {
          group.samples.push({
            term: term.term,
            encoding: fragment.encoding ?? "text",
            offset: fragment.offset ?? 0,
            context: normalizeContext(text),
          });
        }
        groups.set(groupTerms.key, group);
      }
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    terms: Object.fromEntries([...group.terms.entries()].sort((left, right) => right[1] - left[1])),
  })).sort((left, right) => right.occurrences - left.occurrences);
}

function pushLead(leads, source) {
  for (const group of source.groups ?? []) {
    leads.push({
      surfaceKind: source.surfaceKind,
      path: source.path,
      packageIndex: source.packageIndex ?? "",
      packageKey: source.packageKey ?? "",
      packageOffset: source.packageOffset ?? "",
      packageLength: source.packageLength ?? "",
      tableLabel: source.tableLabel ?? "",
      scanMode: source.scanMode ?? "",
      groupKey: group.key,
      groupLabel: group.label,
      occurrences: group.occurrences,
      terms: Object.entries(group.terms ?? {}).map(([term, count]) => `${term}:${count}`).join("; "),
      samples: (group.samples ?? [])
        .map((sample) => `${sample.term}@${sample.offset}/${sample.encoding}: ${sample.context}`)
        .join(" || "),
    });
  }
}

function scanFolderFiles(files, compiledTerms, args) {
  const leads = [];
  const fileScanRows = [];
  let fullScannedBytes = 0;
  let sampledBytes = 0;
  let skippedMediaBytes = 0;
  let packageBytes = 0;
  let errors = 0;

  for (const file of files) {
    if (file.error) continue;
    const row = {
      relativePath: normalizeSlashes(file.relativePath),
      extension: file.extension,
      role: file.role,
      bytes: file.bytes,
      modifiedTime: file.modifiedTime,
      scanMode: "metadata-only",
      leadGroups: "",
    };

    try {
      const signature = fileSignature(file.absolutePath, file.bytes, Math.min(args.sampleBytes, 64 * KiB));
      row.magicHex = signature.magicHex;
      row.magicAscii = signature.magicAscii;
      row.quickHash = signature.quickHash;
    } catch (error) {
      row.signatureError = error.message;
    }

    const extension = file.extension === "(none)" ? "" : file.extension;
    if (packageExtensions.has(extension)) {
      packageBytes += file.bytes;
      row.scanMode = "package-indexed";
      fileScanRows.push(row);
      continue;
    }
    if (mediaExtensions.has(extension)) {
      skippedMediaBytes += file.bytes;
      row.scanMode = "media-metadata-only";
      fileScanRows.push(row);
      continue;
    }

    let buffer = null;
    try {
      if (file.bytes <= args.maxFileFullScanBytes) {
        buffer = fs.readFileSync(file.absolutePath);
        fullScannedBytes += file.bytes;
        row.scanMode = "full";
      } else {
        buffer = sampleFile(file.absolutePath, file.bytes, args.sampleBytes);
        sampledBytes += buffer.length;
        row.scanMode = "sample";
      }
    } catch (error) {
      row.scanMode = "read-error";
      row.scanError = error.message;
      errors += 1;
      fileScanRows.push(row);
      continue;
    }

    const groups = scanBuffer(buffer, compiledTerms, args.maxSamplesPerSurface);
    row.leadGroups = groups.map((group) => `${group.key}:${group.occurrences}`).join("; ");
    if (groups.length) {
      pushLead(leads, {
        surfaceKind: "file",
        path: normalizeSlashes(file.relativePath),
        scanMode: row.scanMode,
        groups,
      });
    }
    fileScanRows.push(row);
  }

  return {
    fileScanRows,
    leads,
    stats: {
      fullScannedBytes,
      sampledBytes,
      skippedMediaBytes,
      packageBytes,
      errors,
    },
  };
}

class PackageReader {
  constructor(containerDir) {
    this.containerDir = containerDir;
    this.fds = new Map();
  }

  fd(index) {
    if (!this.fds.has(index)) {
      const pkgPath = path.join(this.containerDir, `m${index}.pkg`);
      this.fds.set(index, fs.openSync(pkgPath, "r"));
    }
    return this.fds.get(index);
  }

  readSlice(entry, relativeOffset, length) {
    const safeOffset = Math.max(0, Math.min(relativeOffset, entry.length));
    const safeLength = Math.max(0, Math.min(length, entry.length - safeOffset));
    const buffer = Buffer.alloc(safeLength);
    if (!safeLength) return buffer;
    const bytesRead = fs.readSync(this.fd(entry.index), buffer, 0, safeLength, entry.offset + safeOffset);
    return bytesRead === safeLength ? buffer : buffer.subarray(0, bytesRead);
  }

  readEntry(entry) {
    return this.readSlice(entry, 0, entry.length);
  }

  sampleEntry(entry, sampleBytes) {
    if (entry.length <= sampleBytes * 3) return this.readEntry(entry);
    return Buffer.concat([
      this.readSlice(entry, 0, sampleBytes),
      this.readSlice(entry, Math.max(0, Math.floor(entry.length / 2) - Math.floor(sampleBytes / 2)), sampleBytes),
      this.readSlice(entry, Math.max(0, entry.length - sampleBytes), sampleBytes),
    ]);
  }

  close() {
    for (const fd of this.fds.values()) fs.closeSync(fd);
    this.fds.clear();
  }
}

function looksLikeCtbHeader(header, entryLength) {
  if (!header || header.length < 20 || entryLength < 20) return false;
  const rowCount = header.readInt32LE(8);
  const poolCount = header.readInt32LE(12);
  const rowDataBytes = header.readInt32LE(16);
  if (rowCount <= 0 || rowCount > 5_000_000) return false;
  if (poolCount < 0 || poolCount > 64) return false;
  if (rowDataBytes <= 0 || rowDataBytes % rowCount !== 0) return false;
  const rowSize = rowDataBytes / rowCount;
  if (rowSize < 4 || rowSize > 4096) return false;
  const rowStart = 20 + rowCount * 8;
  if (rowStart < 20 || rowStart + rowDataBytes > entryLength) return false;
  return true;
}

function parseCtbBuffer(buffer) {
  const rowCount = buffer.readInt32LE(8);
  const poolCount = buffer.readInt32LE(12);
  const rowDataBytes = buffer.readInt32LE(16);
  if (rowCount <= 0 || poolCount < 0 || rowDataBytes <= 0 || rowDataBytes % rowCount !== 0) {
    throw new Error("invalid CTB header");
  }
  const rowSize = rowDataBytes / rowCount;
  const indexStart = 20;
  const rowStart = indexStart + rowCount * 8;
  let offset = rowStart + rowDataBytes;
  const pools = [];
  for (let index = 0; index < poolCount; index += 1) {
    if (offset + 8 > buffer.length) throw new Error("invalid CTB pool header");
    const type = buffer.readInt32LE(offset);
    const length = buffer.readInt32LE(offset + 4);
    offset += 8;
    if (length < 0 || offset + length > buffer.length) throw new Error("invalid CTB pool length");
    pools.push({ type, length, offset, data: buffer.subarray(offset, offset + length) });
    offset += length;
  }
  return {
    rowCount,
    poolCount,
    rowDataBytes,
    rowSize,
    rowStart,
    pools,
  };
}

function extractCtbTextFragments(table) {
  const fragments = [];
  for (const pool of table.pools) {
    if (pool.type !== 1 || !pool.data?.length) continue;
    let offset = 0;
    while (offset + 2 <= pool.data.length) {
      const length = pool.data.readUInt16LE(offset);
      if (!length || length > 2048 || offset + 2 + length > pool.data.length) {
        offset += 1;
        continue;
      }
      const bytes = pool.data.subarray(offset + 2, offset + 2 + length);
      if (!bytes.includes(0)) {
        const text = bytes.toString("utf8").trim();
        if (text && /[\p{L}\p{N}]/u.test(text)) {
          fragments.push({
            text,
            offset,
            encoding: `ctb-pool-${pool.type}`,
          });
        }
      }
      offset += 2 + length;
    }
  }
  return fragments;
}

function packageLabel(entry) {
  return knownHashLabels.get(entry.key) ?? "";
}

function scanLocalizationStrings(localizationTables, args) {
  const groupTotals = new Map();
  const samplesByGroup = new Map();
  const lowerTerms = leadGroups.flatMap((group) => group.terms.map((term) => ({
    groupKey: group.key,
    groupLabel: group.label,
    term,
    lower: term.toLowerCase(),
  })));

  let totalStrings = 0;
  for (const table of localizationTables) {
    totalStrings += table.strings.length;
    for (const [index, text] of table.strings.entries()) {
      const normalized = String(text || "");
      if (!normalized) continue;
      const lower = normalized.toLowerCase();
      for (const term of lowerTerms) {
        if (!lower.includes(term.lower)) continue;
        const total = groupTotals.get(term.groupKey) ?? {
          key: term.groupKey,
          label: term.groupLabel,
          occurrences: 0,
          terms: new Map(),
        };
        total.occurrences += 1;
        total.terms.set(term.term, (total.terms.get(term.term) ?? 0) + 1);
        groupTotals.set(term.groupKey, total);
        const samples = samplesByGroup.get(term.groupKey) ?? [];
        if (samples.length < args.maxSamplesPerSurface) {
          samples.push({
            language: table.language,
            stringIndex: index,
            term: term.term,
            groupKey: term.groupKey,
            text: normalizeContext(normalized),
          });
          samplesByGroup.set(term.groupKey, samples);
        }
      }
    }
  }

  const groups = [...groupTotals.values()].map((group) => ({
    key: group.key,
    label: group.label,
    occurrences: group.occurrences,
    terms: Object.fromEntries([...group.terms.entries()].sort((left, right) => right[1] - left[1])),
    samples: (samplesByGroup.get(group.key) ?? []).map((sample) => ({
        term: sample.term,
        encoding: sample.language,
        offset: sample.stringIndex,
        context: `[${sample.language}#${sample.stringIndex}] ${sample.text}`,
      })),
  })).sort((left, right) => right.occurrences - left.occurrences);

  return { totalStrings, groups };
}

function scanPackageEntries(containerDir, metaEntries, compiledTerms, compiledTextTerms, args) {
  const reader = new PackageReader(containerDir);
  const packageRows = [];
  const leads = [];
  const stats = {
    entries: 0,
    bytes: 0,
    ctbCandidates: 0,
    ctbParsed: 0,
    ctbParseErrors: 0,
    ctbTooLarge: 0,
    nonCtbFullScanned: 0,
    nonCtbSampled: 0,
    fullScannedBytes: 0,
    sampledBytes: 0,
    readErrors: 0,
  };

  try {
    const orderedEntries = [...metaEntries.values()].sort((left, right) => left.index - right.index || left.offset - right.offset);
    for (let entryIndex = 0; entryIndex < orderedEntries.length; entryIndex += 1) {
      const entry = orderedEntries[entryIndex];
      if (entryIndex > 0 && entryIndex % 500 === 0) {
        console.log(`Package entries scanned: ${entryIndex}/${orderedEntries.length}`);
      }
      stats.entries += 1;
      stats.bytes += entry.length;
      const label = packageLabel(entry);
      const row = {
        key: entry.key,
        type: entry.type,
        packageIndex: entry.index,
        offset: entry.offset,
        length: entry.length,
        label,
        kind: "unknown",
        rowCount: "",
        rowSize: "",
        poolCount: "",
        poolTypes: "",
        scanMode: "metadata-only",
        leadGroups: "",
      };

      let header;
      try {
        header = reader.readSlice(entry, 0, Math.min(128, entry.length));
      } catch (error) {
        row.kind = "read-error";
        row.scanError = error.message;
        stats.readErrors += 1;
        packageRows.push(row);
        continue;
      }

      row.magicHex = header.subarray(0, 16).toString("hex");
      row.magicAscii = header.subarray(0, 16).toString("ascii").replace(/[^\x20-\x7e]/g, ".");

      const ctbCandidate = looksLikeCtbHeader(header, entry.length);
      if (ctbCandidate) {
        stats.ctbCandidates += 1;
        row.kind = "ctb";
        if (entry.length > args.maxCtbFullScanBytes) {
          row.scanMode = "ctb-too-large";
          stats.ctbTooLarge += 1;
          const sample = reader.sampleEntry(entry, args.sampleBytes);
          stats.sampledBytes += sample.length;
          const groups = scanBuffer(sample, compiledTerms, args.maxSamplesPerSurface);
          row.leadGroups = groups.map((group) => `${group.key}:${group.occurrences}`).join("; ");
          if (groups.length) {
            pushLead(leads, {
              surfaceKind: "package-entry-sample",
              path: `m${entry.index}.pkg:${entry.offset}`,
              packageIndex: entry.index,
              packageKey: entry.key,
              packageOffset: entry.offset,
              packageLength: entry.length,
              tableLabel: label || `CTB:${entry.key}`,
              scanMode: row.scanMode,
              groups,
            });
          }
          packageRows.push(row);
          continue;
        }

        try {
          const buffer = reader.readEntry(entry);
          stats.fullScannedBytes += buffer.length;
          const table = parseCtbBuffer(buffer);
          stats.ctbParsed += 1;
          row.rowCount = table.rowCount;
          row.rowSize = table.rowSize;
          row.poolCount = table.poolCount;
          row.poolTypes = table.pools.map((pool) => `${pool.type}:${pool.length}`).join("; ");
          row.scanMode = "ctb-full";
          const tableText = extractCtbTextFragments(table);
          const groups = scanTextFragments(tableText, compiledTextTerms, args.maxSamplesPerSurface);
          row.leadGroups = groups.map((group) => `${group.key}:${group.occurrences}`).join("; ");
          if (groups.length) {
            pushLead(leads, {
              surfaceKind: "package-ctb",
              path: `m${entry.index}.pkg:${entry.offset}`,
              packageIndex: entry.index,
              packageKey: entry.key,
              packageOffset: entry.offset,
              packageLength: entry.length,
              tableLabel: label || `CTB:${entry.key}`,
              scanMode: row.scanMode,
              groups,
            });
          }
        } catch (error) {
          row.kind = "ctb-parse-error";
          row.scanMode = "ctb-parse-error";
          row.scanError = error.message;
          stats.ctbParseErrors += 1;
        }
        packageRows.push(row);
        continue;
      }

      try {
        let buffer;
        if (entry.length <= args.maxEntryFullScanBytes) {
          buffer = reader.readEntry(entry);
          stats.nonCtbFullScanned += 1;
          stats.fullScannedBytes += buffer.length;
          row.scanMode = "entry-full";
        } else {
          buffer = reader.sampleEntry(entry, args.sampleBytes);
          stats.nonCtbSampled += 1;
          stats.sampledBytes += buffer.length;
          row.scanMode = "entry-sample";
        }
        const groups = scanBuffer(buffer, compiledTerms, args.maxSamplesPerSurface);
        row.leadGroups = groups.map((group) => `${group.key}:${group.occurrences}`).join("; ");
        if (groups.length) {
          pushLead(leads, {
            surfaceKind: "package-entry",
            path: `m${entry.index}.pkg:${entry.offset}`,
            packageIndex: entry.index,
            packageKey: entry.key,
            packageOffset: entry.offset,
            packageLength: entry.length,
            tableLabel: label,
            scanMode: row.scanMode,
            groups,
          });
        }
      } catch (error) {
        row.kind = "read-error";
        row.scanMode = "read-error";
        row.scanError = error.message;
        stats.readErrors += 1;
      }
      packageRows.push(row);
    }
  } finally {
    reader.close();
  }

  return { packageRows, leads, stats };
}

function aggregateLeadGroups(leads) {
  const groups = new Map();
  for (const lead of leads) {
    const current = groups.get(lead.groupKey) ?? {
      key: lead.groupKey,
      label: lead.groupLabel,
      surfaces: 0,
      occurrences: 0,
      topSurfaces: [],
    };
    current.surfaces += 1;
    current.occurrences += Number(lead.occurrences) || 0;
    current.topSurfaces.push({
      surfaceKind: lead.surfaceKind,
      path: lead.path,
      tableLabel: lead.tableLabel,
      occurrences: Number(lead.occurrences) || 0,
      scanMode: lead.scanMode,
    });
    groups.set(lead.groupKey, current);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    topSurfaces: group.topSurfaces
      .sort((left, right) => right.occurrences - left.occurrences)
      .slice(0, 12),
  })).sort((left, right) => right.occurrences - left.occurrences);
}

function buildSummary({ roots, files, fileScan, packageScan, localizationScan, leads }) {
  const totalBytes = files.filter((file) => !file.error).reduce((sum, file) => sum + file.bytes, 0);
  const packageFiles = files.filter((file) => file.role === "container-package");
  return {
    gameRoot: roots.gameRoot,
    executableRoot: roots.executableRoot,
    dataRoot: roots.dataRoot,
    containerDir: roots.containerDir,
    m0Path: roots.m0Path,
    files: files.filter((file) => !file.error).length,
    fileErrors: files.filter((file) => file.error).length,
    totalBytes,
    packageFiles: packageFiles.length,
    packageFileBytes: packageFiles.reduce((sum, file) => sum + file.bytes, 0),
    extensions: summarizeBy(files, (file) => file.extension).slice(0, 30),
    roles: summarizeBy(files, (file) => file.role).slice(0, 30),
    topDirs: summarizeBy(files, (file) => normalizeSlashes(file.relativePath).split("/")[0] || ".").slice(0, 30),
    fileScan: fileScan.stats,
    packageScan: packageScan.stats,
    localizationStrings: localizationScan.totalStrings,
    leadGroups: aggregateLeadGroups(leads),
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Whole Game File Index");
  lines.push("");
  lines.push("Offline report for mapping the resolved game install folder and package container. This does not change parser or Skill Details behavior.");
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(`- generatedAt: \`${report.generatedAt}\``);
  lines.push(`- gameRoot: \`${report.summary.gameRoot}\``);
  lines.push(`- executableRoot: \`${report.summary.executableRoot}\``);
  lines.push(`- dataRoot: \`${report.summary.dataRoot}\``);
  lines.push(`- containerDir: \`${report.summary.containerDir}\``);
  lines.push(`- m0Path: \`${report.summary.m0Path}\``);
  lines.push("");
  lines.push("## Outputs");
  lines.push("");
  lines.push(`- JSON: \`${report.outputs.json}\``);
  lines.push(`- folder CSV: \`${report.outputs.fileCsv}\``);
  lines.push(`- package-entry CSV: \`${report.outputs.packageCsv}\``);
  lines.push(`- lead CSV: \`${report.outputs.leadCsv}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(markdownTable(["Metric", "Value"], [
    ["Files indexed", report.summary.files],
    ["File stat/read errors", report.summary.fileErrors],
    ["Total indexed bytes", formatBytes(report.summary.totalBytes)],
    ["Container package files", report.summary.packageFiles],
    ["Container package bytes", formatBytes(report.summary.packageFileBytes)],
    ["Package meta entries", report.summary.packageScan.entries],
    ["Package meta bytes", formatBytes(report.summary.packageScan.bytes)],
    ["CTB candidates", report.summary.packageScan.ctbCandidates],
    ["CTB parsed", report.summary.packageScan.ctbParsed],
    ["CTB parse errors", report.summary.packageScan.ctbParseErrors],
    ["Localization strings scanned", report.summary.localizationStrings],
    ["Lead rows", report.leadCount],
  ]));
  lines.push("");
  lines.push("## Scan Modes");
  lines.push("");
  lines.push(markdownTable(["Surface", "Value"], [
    ["Normal files full-scanned", formatBytes(report.summary.fileScan.fullScannedBytes)],
    ["Normal files sampled", formatBytes(report.summary.fileScan.sampledBytes)],
    ["Media metadata-only", formatBytes(report.summary.fileScan.skippedMediaBytes)],
    ["Package files indexed through meta.pkg", formatBytes(report.summary.fileScan.packageBytes)],
    ["Package entries full-scanned/parsed", formatBytes(report.summary.packageScan.fullScannedBytes)],
    ["Package entries sampled", formatBytes(report.summary.packageScan.sampledBytes)],
    ["Non-CTB package entries full-scanned", report.summary.packageScan.nonCtbFullScanned],
    ["Non-CTB package entries sampled", report.summary.packageScan.nonCtbSampled],
  ]));
  lines.push("");
  lines.push("## File Roles");
  lines.push("");
  lines.push(markdownTable(
    ["Role", "Files", "Bytes", "Largest"],
    report.summary.roles.slice(0, MAX_MARKDOWN_ROWS).map((row) => [
      row.key,
      row.count,
      formatBytes(row.bytes),
      formatBytes(row.maxBytes),
    ]),
  ));
  lines.push("");
  lines.push("## Extensions");
  lines.push("");
  lines.push(markdownTable(
    ["Extension", "Files", "Bytes", "Largest"],
    report.summary.extensions.slice(0, MAX_MARKDOWN_ROWS).map((row) => [
      row.key,
      row.count,
      formatBytes(row.bytes),
      formatBytes(row.maxBytes),
    ]),
  ));
  lines.push("");
  lines.push("## Lead Groups");
  lines.push("");
  if (report.summary.leadGroups.length) {
    lines.push(markdownTable(
      ["Group", "Surfaces", "Occurrences", "Top surface"],
      report.summary.leadGroups.map((group) => {
        const top = group.topSurfaces[0];
        return [
          group.label,
          group.surfaces,
          group.occurrences,
          top ? `${top.surfaceKind}: ${top.tableLabel || top.path} (${top.occurrences})` : "",
        ];
      }),
    ));
  } else {
    lines.push("No keyword lead groups found.");
  }
  lines.push("");
  lines.push("## Highest-Value Leads");
  lines.push("");
  const rankedLeads = report.leads
    .slice()
    .sort((left, right) => Number(right.occurrences) - Number(left.occurrences))
    .slice(0, MAX_MARKDOWN_ROWS);
  if (rankedLeads.length) {
    lines.push(markdownTable(
      ["Surface", "Group", "Occurrences", "Label/Path", "Terms"],
      rankedLeads.map((lead) => [
        lead.surfaceKind,
        lead.groupLabel,
        lead.occurrences,
        lead.tableLabel || lead.path,
        lead.terms,
      ]),
    ));
  } else {
    lines.push("No lead rows found.");
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Every file under the resolved game root is indexed in the folder CSV.");
  lines.push("- Every `meta.pkg` entry is indexed in the package-entry CSV.");
  lines.push("- Large opaque media and non-CTB package entries may be sampled for raw text leads; CTB-like entries under the configured limit are parsed and scanned fully.");
  lines.push("- Treat this as an index and lead map. A lead row means \"inspect here next\", not proof of a usable formula or attribution edge.");
  return `${lines.join("\n")}\n`;
}

function relativeOutput(filePath) {
  return normalizeSlashes(path.relative(repoRoot, filePath));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const roots = resolveRoots(args);
  if (!fs.existsSync(roots.gameRoot)) {
    throw new Error(`Game root does not exist: ${roots.gameRoot}`);
  }

  console.log(`Indexing game root: ${roots.gameRoot}`);
  const files = walkFiles(roots.gameRoot);
  console.log(`Files discovered: ${files.filter((file) => !file.error).length}`);

  const compiledTerms = compileTerms();
  const compiledTextTerms = compileTextTerms();
  const fileScan = scanFolderFiles(files, compiledTerms, args);
  console.log(`Folder lead rows: ${fileScan.leads.length}`);

  const metaEntries = common.loadMetaEntries(roots.containerDir);
  const packageScan = scanPackageEntries(roots.containerDir, metaEntries, compiledTerms, compiledTextTerms, args);
  console.log(`Package entries indexed: ${packageScan.stats.entries}; CTB parsed: ${packageScan.stats.ctbParsed}`);

  const localizationTables = common.loadLocalizationTables(roots.containerDir, { metaEntries });
  const localizationScan = scanLocalizationStrings(localizationTables, args);
  const localizationLeads = [];
  if (localizationScan.groups.length) {
    pushLead(localizationLeads, {
      surfaceKind: "localization",
      path: "localization/*.bytes",
      scanMode: "parsed-strings",
      groups: localizationScan.groups,
    });
  }

  const leads = [
    ...fileScan.leads,
    ...packageScan.leads,
    ...localizationLeads,
  ].sort((left, right) => Number(right.occurrences) - Number(left.occurrences));

  const summary = buildSummary({ roots, files, fileScan, packageScan, localizationScan, leads });
  const report = {
    generatedAt: new Date().toISOString(),
    args: {
      game: args.game,
      gameRoot: args.gameRoot || "",
      maxFileFullScanBytes: args.maxFileFullScanBytes,
      maxEntryFullScanBytes: args.maxEntryFullScanBytes,
      maxCtbFullScanBytes: args.maxCtbFullScanBytes,
      sampleBytes: args.sampleBytes,
      maxSamplesPerSurface: args.maxSamplesPerSurface,
    },
    outputs: {
      json: relativeOutput(args.outJson),
      markdown: relativeOutput(args.outMd),
      fileCsv: relativeOutput(args.fileCsv),
      packageCsv: relativeOutput(args.packageCsv),
      leadCsv: relativeOutput(args.leadCsv),
    },
    summary,
    leadCount: leads.length,
    leads: leads.slice(0, MAX_LEADS_IN_JSON),
  };

  writeCsv(args.fileCsv, [
    "relativePath",
    "extension",
    "role",
    "bytes",
    "modifiedTime",
    "magicHex",
    "magicAscii",
    "quickHash",
    "scanMode",
    "leadGroups",
    "signatureError",
    "scanError",
  ], fileScan.fileScanRows);

  writeCsv(args.packageCsv, [
    "key",
    "type",
    "packageIndex",
    "offset",
    "length",
    "label",
    "kind",
    "rowCount",
    "rowSize",
    "poolCount",
    "poolTypes",
    "magicHex",
    "magicAscii",
    "scanMode",
    "leadGroups",
    "scanError",
  ], packageScan.packageRows);

  writeCsv(args.leadCsv, [
    "surfaceKind",
    "path",
    "packageIndex",
    "packageKey",
    "packageOffset",
    "packageLength",
    "tableLabel",
    "scanMode",
    "groupKey",
    "groupLabel",
    "occurrences",
    "terms",
    "samples",
  ], leads);

  fs.mkdirSync(path.dirname(args.outJson), { recursive: true });
  fs.writeFileSync(args.outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(args.outMd, renderMarkdown(report), "utf8");

  console.log(`Markdown: ${relativeOutput(args.outMd)}`);
  console.log(`JSON: ${relativeOutput(args.outJson)}`);
  console.log(`Lead rows: ${leads.length}`);
}

main();
