import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaultGameRoot =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Blue Protocol Star Resonance\\bpsr";
const defaultOutJson = path.join(repoRoot, "DEV_exports", "game-file-attribution-scan.json");
const defaultOutMd = path.join(repoRoot, "DEV_exports", "game-file-attribution-scan.md");

const MiB = 1024 * 1024;
const neverScanExtensions = new Set([".mp4"]);

const keywordGroups = [
  {
    key: "runtime_passive_state",
    label: "Runtime passive state packet names",
    terms: [
      "AoiSyncDelta",
      "aoiSyncDelta",
      "aoisyncdelta",
      "SeqPassiveSkillInfo",
      "SeqPassiveSkillEndInfo",
      "PassiveSkillInfo",
      "passive_skill_infos",
      "passive_skill_end_infos",
      "PassiveSkillComp",
    ],
  },
  {
    key: "runtime_profession_talent_state",
    label: "Runtime profession talent state",
    terms: [
      "ProfessionTalentInfo",
      "ProfessionTalentInfoContainerArchive",
      "ProfessionList",
      "talent_list",
      "talent_node_ids",
      "ActiveProfessionTalent",
      "activeprofessiontalentrequest",
      "ResetProfessionTalent",
      "resetprofessiontalentrequest",
      "ResetProfessionTalentBySingleNode",
      "resetprofessiontalentbysinglenoderequest",
    ],
  },
  {
    key: "damage_and_skill_tables",
    label: "Damage/skill table class names",
    terms: [
      "DamageAttrTable",
      "DamageAttrTableBase",
      "RecountTable",
      "SkillTable",
      "SkillEffectTable",
      "SkillFightLevelTable",
      "SkillFightLevelTableBase",
      "TalentTable",
      "TalentTableBase",
      "BuffTable",
      "TempAttrTable",
    ],
  },
  {
    key: "formula_like_names",
    label: "Formula/coefficient-like names",
    terms: [
      "DamageAttrFormula",
      "DamageFormula",
      "SkillDamage",
      "CalcDamage",
      "ValueCal",
      "Coefficient",
      "DamageCoefficient",
      "Formula",
      "formula",
    ],
  },
  {
    key: "protobuf_damage_fields",
    label: "Damage protobuf field names",
    terms: [
      "skill_effects",
      "SkillEffect",
      "SyncDamageInfo",
      "damage_source",
      "owner_id",
      "owner_level",
      "hit_event_id",
      "type_flag",
      "top_summoner_id",
      "attacker_uuid",
    ],
  },
  {
    key: "managed_assembly_names",
    label: "Managed assembly names",
    terms: [
      "Assembly-CSharp.dll",
      "Panda.Table.dll",
      "Panda.ZRpcGen.dll",
      "Panda.AOT.AttrBase.dll",
      "ECSModel.dll",
      "Protobuf.dll",
      "ZRpc.dll",
      "Panda.Script.dll",
      "ZLuaFramework.dll",
    ],
  },
  {
    key: "known_generated_source_families",
    label: "Known generated source families",
    terms: [
      "SeasonTalent",
      "RogueEntry",
      "PhantomFactor",
      "SeasonPhantomFactor",
      "SeasonEffect",
      "TalentPassive",
    ],
  },
];

const protoStructs = [
  "AoiSyncDelta",
  "SeqPassiveSkillInfo",
  "PassiveSkillInfo",
  "SeqPassiveSkillEndInfo",
  "ProfessionList",
  "ProfessionTalentInfo",
  "Entity",
  "SyncNearDeltaInfo",
  "SyncToMeDeltaInfo",
];

const runtimeUsageTerms = [
  "passive_skill_infos",
  "passive_skill_end_infos",
  "passive_infos",
  "talent_node_ids",
  "talent_list",
  "profession_list",
  "SyncNearDeltaInfo",
  "SyncToMeDeltaInfo",
  "EnterScene",
  "CharSerialize",
];

const resourceRpcNames = [
  "ActiveProfessionTalent",
  "ResetProfessionTalent",
  "ResetProfessionTalentBySingleNode",
  "SyncNearDeltaInfo",
];

function parseArgs(argv) {
  const args = {
    gameRoot: defaultGameRoot,
    outJson: defaultOutJson,
    outMd: defaultOutMd,
    maxFileBytes: 300 * MiB,
    maxSamplesPerGroupFile: 5,
    includePackages: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--game-root" || arg === "--game") && next) {
      args.gameRoot = path.resolve(next);
      index += 1;
    } else if (arg === "--out-json" && next) {
      args.outJson = path.resolve(next);
      index += 1;
    } else if (arg === "--out-md" && next) {
      args.outMd = path.resolve(next);
      index += 1;
    } else if (arg === "--max-file-mb" && next) {
      args.maxFileBytes = Math.max(1, Number(next) || 1) * MiB;
      index += 1;
    } else if (arg === "--max-samples" && next) {
      args.maxSamplesPerGroupFile = Math.max(1, Number(next) || 1);
      index += 1;
    } else if (arg === "--include-packages") {
      args.includePackages = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/scan-game-file-attribution-sources.mjs [options]

Options:
  --game-root <path>   Game install root. Defaults to the Steam BPSR path.
  --out-json <path>    JSON report path. Defaults to DEV_exports/game-file-attribution-scan.json.
  --out-md <path>      Markdown report path. Defaults to DEV_exports/game-file-attribution-scan.md.
  --max-file-mb <n>    Skip individual files above this size. Defaults to 300.
  --max-samples <n>    Context samples per keyword group per file. Defaults to 5.
  --include-packages   Also scan .pkg payloads. This is slow; the default skips them.
`);
}

function fileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  if (bytes >= MiB) return `${(bytes / MiB).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function markdownTable(headers, rows) {
  const escapeCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function walkFiles(root) {
  const files = [];
  const stack = [root];

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
        files.push({
          absolutePath,
          relativePath: path.relative(root, absolutePath),
          extension: fileExtension(absolutePath) || "(none)",
          bytes: stat.size,
          modifiedTime: stat.mtime.toISOString(),
        });
      }
    }
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function summarizeExtensions(files) {
  const byExtension = new Map();
  for (const file of files) {
    if (file.error) continue;
    const current = byExtension.get(file.extension) ?? {
      extension: file.extension,
      count: 0,
      bytes: 0,
      maxBytes: 0,
    };
    current.count += 1;
    current.bytes += file.bytes;
    current.maxBytes = Math.max(current.maxBytes, file.bytes);
    byExtension.set(file.extension, current);
  }
  return [...byExtension.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return right.bytes - left.bytes;
  });
}

function pushLimited(array, value, limit) {
  if (array.length < limit) array.push(value);
}

function normalizeContext(text) {
  return text.replace(/\s+/g, " ").replace(/\0/g, "").trim().slice(0, 500);
}

function isAsciiPrintable(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

function extractAsciiStrings(buffer) {
  const strings = [];
  let current = "";
  for (const byte of buffer) {
    if (isAsciiPrintable(byte)) {
      current += String.fromCharCode(byte);
      if (current.length > 220) {
        strings.push(current);
        current = "";
      }
    } else {
      if (current.length >= 4 && /[A-Za-z]/.test(current)) strings.push(current);
      current = "";
    }
  }
  if (current.length >= 4 && /[A-Za-z]/.test(current)) strings.push(current);
  return [...new Set(strings.map(normalizeContext).filter(Boolean))].slice(0, 8);
}

function extractUtf16Strings(buffer, offset) {
  const start = Math.max(0, offset - 260);
  const end = Math.min(buffer.length, offset + 260);
  const alignedStart = start + ((offset - start) % 2);
  const usableLength = end - alignedStart - ((end - alignedStart) % 2);
  if (usableLength <= 0) return [];

  const text = buffer.subarray(alignedStart, alignedStart + usableLength).toString("utf16le");
  const strings = [];
  let current = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x20 && code <= 0x7e) {
      current += char;
    } else {
      if (current.length >= 4 && /[A-Za-z]/.test(current)) strings.push(current);
      current = "";
    }
  }
  if (current.length >= 4 && /[A-Za-z]/.test(current)) strings.push(current);
  return [...new Set(strings.map(normalizeContext).filter(Boolean))].slice(0, 8);
}

function contextFor(buffer, offset, encoding) {
  if (encoding === "utf16le") {
    return extractUtf16Strings(buffer, offset).join(" | ");
  }
  const start = Math.max(0, offset - 260);
  const end = Math.min(buffer.length, offset + 260);
  return extractAsciiStrings(buffer.subarray(start, end)).join(" | ");
}

function compileSearchTerms() {
  const compiled = [];
  for (const group of keywordGroups) {
    for (const term of [...new Set(group.terms)]) {
      compiled.push({
        groupKey: group.key,
        groupLabel: group.label,
        term,
        ascii: Buffer.from(term, "ascii"),
        utf16le: Buffer.from(term, "utf16le"),
      });
    }
  }
  return compiled;
}

function scanBufferForTerms(buffer, compiledTerms, maxSamplesPerGroupFile) {
  const groups = new Map();

  for (const compiled of compiledTerms) {
    for (const [encoding, needle] of [
      ["ascii", compiled.ascii],
      ["utf16le", compiled.utf16le],
    ]) {
      let offset = 0;
      while (offset < buffer.length) {
        const foundAt = buffer.indexOf(needle, offset);
        if (foundAt === -1) break;

        const group = groups.get(compiled.groupKey) ?? {
          key: compiled.groupKey,
          label: compiled.groupLabel,
          occurrences: 0,
          terms: {},
          samples: [],
        };
        group.occurrences += 1;
        group.terms[compiled.term] = (group.terms[compiled.term] ?? 0) + 1;
        pushLimited(
          group.samples,
          {
            offset: foundAt,
            encoding,
            term: compiled.term,
            context: contextFor(buffer, foundAt, encoding),
          },
          maxSamplesPerGroupFile,
        );
        groups.set(compiled.groupKey, group);

        offset = foundAt + Math.max(needle.length, 1);
      }
    }
  }

  return [...groups.values()].sort((left, right) => right.occurrences - left.occurrences);
}

function scanGameFiles(files, args) {
  const compiledTerms = compileSearchTerms();
  const scannedFiles = [];
  const skipped = {
    packages: { count: 0, bytes: 0 },
    tooLarge: { count: 0, bytes: 0, samples: [] },
    unsupported: { count: 0, bytes: 0, samples: [] },
    errors: [],
  };
  const groupTotals = new Map();
  let scannedBytes = 0;

  for (const file of files) {
    if (file.error) continue;
    const extension = file.extension === "(none)" ? "" : file.extension;
    if (!args.includePackages && extension === ".pkg") {
      skipped.packages.count += 1;
      skipped.packages.bytes += file.bytes;
      continue;
    }
    if (neverScanExtensions.has(extension)) {
      skipped.unsupported.count += 1;
      skipped.unsupported.bytes += file.bytes;
      pushLimited(skipped.unsupported.samples, file.relativePath, 8);
      continue;
    }
    if (file.bytes > args.maxFileBytes) {
      skipped.tooLarge.count += 1;
      skipped.tooLarge.bytes += file.bytes;
      pushLimited(
        skipped.tooLarge.samples,
        { path: file.relativePath, bytes: file.bytes },
        12,
      );
      continue;
    }

    let buffer;
    try {
      buffer = fs.readFileSync(file.absolutePath);
    } catch (error) {
      skipped.errors.push({ path: file.relativePath, error: error.message });
      continue;
    }

    scannedBytes += file.bytes;
    const groups = scanBufferForTerms(buffer, compiledTerms, args.maxSamplesPerGroupFile);
    if (!groups.length) continue;

    const result = {
      path: file.relativePath,
      extension: file.extension,
      bytes: file.bytes,
      groups,
    };
    scannedFiles.push(result);

    for (const group of groups) {
      const total = groupTotals.get(group.key) ?? {
        key: group.key,
        label: group.label,
        files: 0,
        occurrences: 0,
        topFiles: [],
        terms: {},
      };
      total.files += 1;
      total.occurrences += group.occurrences;
      total.topFiles.push({
        path: file.relativePath,
        occurrences: group.occurrences,
        bytes: file.bytes,
      });
      for (const [term, count] of Object.entries(group.terms)) {
        total.terms[term] = (total.terms[term] ?? 0) + count;
      }
      groupTotals.set(group.key, total);
    }
  }

  const groups = [...groupTotals.values()]
    .map((group) => ({
      ...group,
      topFiles: group.topFiles
        .sort((left, right) => right.occurrences - left.occurrences)
        .slice(0, 8),
      topTerms: Object.entries(group.terms)
        .map(([term, count]) => ({ term, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 12),
    }))
    .sort((left, right) => right.occurrences - left.occurrences);

  return {
    scannedFiles: scannedFiles.sort((left, right) => {
      const rightHits = right.groups.reduce((sum, group) => sum + group.occurrences, 0);
      const leftHits = left.groups.reduce((sum, group) => sum + group.occurrences, 0);
      return rightHits - leftHits;
    }),
    groups,
    stats: {
      scannedFileCount: files.length - skipped.packages.count - skipped.tooLarge.count - skipped.unsupported.count,
      scannedBytes,
      skipped,
    },
  };
}

function readJsonLoose(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function flattenAssemblyNames(value) {
  if (Array.isArray(value)) {
    return value.flatMap(flattenAssemblyNames);
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? [value] : [];
  }
  const direct =
    value.name ??
    value.Name ??
    value.assembly ??
    value.Assembly ??
    value.assemblyName ??
    value.AssemblyName ??
    value.fileName ??
    value.FileName;
  return [
    ...(typeof direct === "string" ? [direct] : []),
    ...Object.values(value).flatMap(flattenAssemblyNames),
  ];
}

function collectSpecialFiles(gameRoot) {
  const globalMetadata = path.join(
    gameRoot,
    "BPSR_STEAM_Data",
    "il2cpp_data",
    "Metadata",
    "global-metadata.dat",
  );
  const scriptingAssemblies = path.join(gameRoot, "BPSR_STEAM_Data", "ScriptingAssemblies.json");
  const managedDir = path.join(gameRoot, "BPSR_STEAM_Data", "Managed");

  const specialPaths = [
    globalMetadata,
    scriptingAssemblies,
    path.join(gameRoot, "GameAssembly.dll"),
    path.join(gameRoot, "BPSR_STEAMBase.dll"),
    path.join(gameRoot, "UnityPlayer.dll"),
    path.join(gameRoot, "BPSR_STEAM_Data", "globalgamemanagers.assets"),
    path.join(gameRoot, "BPSR_STEAM_Data", "resources.assets"),
  ];

  const files = specialPaths.map((absolutePath) => {
    if (!fs.existsSync(absolutePath)) {
      return { path: path.relative(gameRoot, absolutePath), exists: false };
    }
    const stat = fs.statSync(absolutePath);
    return {
      path: path.relative(gameRoot, absolutePath),
      exists: true,
      bytes: stat.size,
      modifiedTime: stat.mtime.toISOString(),
    };
  });

  const scriptingAssembliesJson = fs.existsSync(scriptingAssemblies)
    ? readJsonLoose(scriptingAssemblies)
    : null;
  const assemblyNames = [...new Set(flattenAssemblyNames(scriptingAssembliesJson))]
    .filter((name) => /\.dll$/i.test(name))
    .sort((left, right) => left.localeCompare(right));

  return {
    files,
    globalMetadata: files.find((file) => file.path.endsWith("global-metadata.dat")) ?? null,
    managedDirectoryExists: fs.existsSync(managedDir),
    scriptingAssemblies: {
      path: path.relative(gameRoot, scriptingAssemblies),
      parsed: scriptingAssembliesJson !== null,
      count: assemblyNames.length,
      names: assemblyNames,
      interestingNames: assemblyNames.filter((name) =>
        /Assembly-CSharp|Panda\.Table|Panda\.ZRpcGen|Protobuf|ECSModel|AttrBase|ZRpc|Script/i.test(
          name,
        ),
      ),
    },
  };
}

function collectResourceRpcCandidates(gameRoot) {
  const resourcesPath = path.join(gameRoot, "BPSR_STEAM_Data", "resources.assets");
  if (!fs.existsSync(resourcesPath)) {
    return {
      path: path.relative(gameRoot, resourcesPath),
      exists: false,
      candidates: [],
    };
  }

  const buffer = fs.readFileSync(resourcesPath);
  const candidates = [];
  for (const name of resourceRpcNames) {
    const needle = Buffer.from(`"name": "${name}"`, "ascii");
    const offset = buffer.indexOf(needle);
    if (offset === -1) {
      candidates.push({ name, found: false });
      continue;
    }

    const window = buffer
      .subarray(offset, Math.min(buffer.length, offset + 900))
      .toString("ascii")
      .replace(/\0/g, "");
    const retMatch = window.match(/"ret":\s*"([^"]+)"/);
    const scopedWindow = retMatch
      ? window.slice(0, (retMatch.index ?? 0) + retMatch[0].length)
      : window;
    const index = Number(scopedWindow.match(/"index":\s*([0-9]+)/)?.[1] ?? NaN);
    const paramTypes = [...scopedWindow.matchAll(/"type":\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    const ret = retMatch?.[1] ?? "";
    candidates.push({
      name,
      found: true,
      offset,
      index: Number.isFinite(index) ? index : null,
      paramTypes,
      ret,
      context: normalizeContext(scopedWindow),
    });
  }

  return {
    path: path.relative(gameRoot, resourcesPath),
    exists: true,
    candidates,
  };
}

function collectParserProtoSurfaces() {
  const protoPath = path.join(
    repoRoot,
    "src-tauri",
    "src",
    "blueprotobuf-lib",
    "src",
    "blueprotobuf_package.rs",
  );
  if (!fs.existsSync(protoPath)) {
    return { path: path.relative(repoRoot, protoPath), exists: false, structs: [] };
  }

  const lines = fs.readFileSync(protoPath, "utf8").split(/\r?\n/);
  const structs = [];

  for (const structName of protoStructs) {
    const start = lines.findIndex((line) => line.includes(`pub struct ${structName}`));
    if (start === -1) continue;
    let end = lines.findIndex(
      (line, index) => index > start && line.startsWith("pub struct "),
    );
    if (end === -1) end = Math.min(lines.length, start + 120);

    const fields = [];
    let lastProst = "";
    for (let index = start + 1; index < end; index += 1) {
      const line = lines[index].trim();
      if (line.startsWith("#[prost(")) {
        lastProst = line;
        continue;
      }
      const match = line.match(/^pub\s+([A-Za-z0-9_]+):\s+(.+),$/);
      if (!match) continue;
      const [, name, type] = match;
      const tag = lastProst.match(/tag = "([0-9]+)"/)?.[1] ?? "";
      const repeated = /repeated/.test(lastProst);
      const optional = /optional/.test(lastProst);
      const map = /map\s*=/.test(lastProst);
      fields.push({
        name,
        type,
        tag,
        repeated,
        optional,
        map,
        line: index + 1,
      });
      lastProst = "";
    }

    structs.push({
      name: structName,
      line: start + 1,
      fields,
    });
  }

  return {
    path: path.relative(repoRoot, protoPath),
    exists: true,
    structs,
  };
}

function walkTextFiles(root, extensions) {
  if (!fs.existsSync(root)) return [];
  return walkFiles(root).filter((file) => {
    if (file.error) return false;
    const extension = file.extension === "(none)" ? "" : file.extension;
    return extensions.has(extension);
  });
}

function collectRuntimeUsage() {
  const roots = [
    path.join(repoRoot, "src-tauri", "src", "live"),
    path.join(repoRoot, "src-tauri", "src", "packets"),
    path.join(repoRoot, "src-tauri", "src", "database"),
    path.join(repoRoot, "src-tauri", "src", "parser_data.rs"),
  ];
  const files = roots.flatMap((root) => {
    if (!fs.existsSync(root)) return [];
    if (fs.statSync(root).isFile()) {
      return [
        {
          absolutePath: root,
          relativePath: path.relative(repoRoot, root),
          extension: fileExtension(root),
        },
      ];
    }
    return walkTextFiles(root, new Set([".rs"])).map((file) => ({
      ...file,
      relativePath: path.relative(repoRoot, file.absolutePath),
    }));
  });

  const terms = Object.fromEntries(
    runtimeUsageTerms.map((term) => [term, { term, count: 0, files: [], samples: [] }]),
  );

  for (const file of files) {
    let text = "";
    try {
      text = fs.readFileSync(file.absolutePath, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (const term of runtimeUsageTerms) {
      let fileCount = 0;
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].includes(term)) continue;
        fileCount += 1;
        terms[term].count += 1;
        pushLimited(
          terms[term].samples,
          {
            path: file.relativePath,
            line: index + 1,
            text: lines[index].trim(),
          },
          8,
        );
      }
      if (fileCount) {
        terms[term].files.push({ path: file.relativePath, count: fileCount });
      }
    }
  }

  return Object.values(terms).sort((left, right) => right.count - left.count);
}

function buildFindings(report) {
  const byGroup = new Map(report.scan.groups.map((group) => [group.key, group]));
  const runtimePassive = byGroup.get("runtime_passive_state");
  const runtimeTalent = byGroup.get("runtime_profession_talent_state");
  const formula = byGroup.get("formula_like_names");
  const highConfidenceFormulaTerms = new Set([
    "DamageAttrFormula",
    "DamageFormula",
    "SkillDamage",
    "CalcDamage",
    "DamageCoefficient",
  ]);
  const hasHighConfidenceFormulaTerm = (formula?.topTerms ?? []).some((term) =>
    highConfidenceFormulaTerms.has(term.term),
  );
  const metadataBytes = report.special.globalMetadata?.bytes ?? null;
  const passiveUsage = report.parserRuntimeUsage.find((usage) => usage.term === "passive_skill_infos");
  const talentUsage = report.parserRuntimeUsage.find((usage) => usage.term === "talent_node_ids");

  const findings = [];
  if (metadataBytes === 0) {
    findings.push({
      title: "Standard IL2CPP metadata is stripped or relocated",
      detail:
        "BPSR_STEAM_Data/il2cpp_data/Metadata/global-metadata.dat exists but is 0 bytes, so a normal metadata-based decompile path will not directly expose damage code or formulas from this install.",
    });
  }
  if (runtimePassive?.occurrences) {
    findings.push({
      title: "The game assets expose passive-skill runtime state names",
      detail:
        "Unity assets contain AoiSyncDelta, SeqPassiveSkillInfo, PassiveSkillInfo, and SeqPassiveSkillEndInfo names. The generated parser protobuf already has fields for these packets, so this is an actionable runtime-state surface for attribution.",
    });
  }
  if (runtimeTalent?.occurrences) {
    const talentRpcSummary = (report.resourceRpcCandidates?.candidates ?? [])
      .filter((candidate) => candidate.found && /ProfessionTalent/.test(candidate.name))
      .map((candidate) => `${candidate.name}=${candidate.index ?? "unknown"}`)
      .join(", ");
    findings.push({
      title: "Profession talent state is visible, but the request path is only partially mapped",
      detail: `The game assets expose ProfessionTalentInfo and Active/ResetProfessionTalent strings${
        talentRpcSummary ? ` (${talentRpcSummary})` : ""
      }. The parser protobuf has saved ProfessionList.talent_list/talent_node_ids, but the generated Rust file does not contain ActiveProfessionTalent request structs by name.`,
    });
  }
  if ((passiveUsage?.count ?? 0) === 0) {
    findings.push({
      title: "Passive runtime state is decoded structurally but not harvested by live attribution",
      detail:
        "The live parser decodes EnterScene, SyncToMeDeltaInfo, and SyncNearDeltaInfo, but current non-generated runtime code has no passive_skill_infos references. That is the cleanest next parser addition.",
    });
  }
  if ((talentUsage?.count ?? 0) === 0) {
    findings.push({
      title: "Selected profession talent nodes are available in CharSerialize but not recorded",
      detail:
        "CharSerialize.profession_list is already read for class id, while ProfessionList.talent_list/talent_node_ids is not used. Recording those nodes would link controlled captures back to selected talents.",
    });
  }
  if (!hasHighConfidenceFormulaTerm) {
    findings.push({
      title: "No high-confidence numeric damage formula surfaced in non-package binaries",
      detail:
        "This scan found table/type names and generic formula-like strings, but no DamageFormula/CalcDamage/DamageCoefficient-style surface. Most formula-like hits came from Chromium/CEF browser assets or generic engine text.",
    });
  }

  return findings;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Game File Attribution Surface Scan");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Game root: \`${report.gameRoot}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  for (const finding of report.findings) {
    lines.push(`- **${finding.title}.** ${finding.detail}`);
  }
  lines.push("");
  lines.push("## Inventory");
  lines.push("");
  lines.push(
    markdownTable(
      ["Metric", "Value"],
      [
        ["Files inventoried", report.inventory.totalFiles],
        ["Install bytes inventoried", formatBytes(report.inventory.totalBytes)],
        ["Files scanned for strings", report.scan.stats.scannedFileCount],
        ["Bytes scanned for strings", formatBytes(report.scan.stats.scannedBytes)],
        ["Package files skipped by default", report.scan.stats.skipped.packages.count],
        ["Package bytes skipped by default", formatBytes(report.scan.stats.skipped.packages.bytes)],
        ["Files skipped as too large", report.scan.stats.skipped.tooLarge.count],
        ["Max file size", formatBytes(report.options.maxFileBytes)],
      ],
    ),
  );
  lines.push("");
  lines.push("### Top Extensions");
  lines.push("");
  lines.push(
    markdownTable(
      ["Extension", "Count", "Total", "Largest"],
      report.inventory.extensions
        .slice(0, 18)
        .map((row) => [row.extension, row.count, formatBytes(row.bytes), formatBytes(row.maxBytes)]),
    ),
  );
  lines.push("");
  lines.push("## Special Files");
  lines.push("");
  lines.push(
    markdownTable(
      ["File", "Exists", "Size"],
      report.special.files.map((file) => [
        file.path,
        file.exists ? "yes" : "no",
        file.exists ? formatBytes(file.bytes) : "",
      ]),
    ),
  );
  lines.push("");
  lines.push(
    `Managed directory present: \`${report.special.managedDirectoryExists ? "yes" : "no"}\``,
  );
  lines.push(
    `ScriptingAssemblies parsed: \`${report.special.scriptingAssemblies.parsed ? "yes" : "no"}\`, assemblies listed: \`${report.special.scriptingAssemblies.count}\``,
  );
  if (report.special.scriptingAssemblies.interestingNames.length) {
    lines.push("");
    lines.push("Interesting assemblies from ScriptingAssemblies.json:");
    for (const name of report.special.scriptingAssemblies.interestingNames) {
      lines.push(`- \`${name}\``);
    }
  }
  lines.push("");
  lines.push("## Game String Hits");
  lines.push("");
  lines.push(
    markdownTable(
      ["Group", "Files", "Occurrences", "Top Terms", "Top Files"],
      report.scan.groups.map((group) => [
        group.label,
        group.files,
        group.occurrences,
        group.topTerms.map((term) => `${term.term} (${term.count})`).join(", "),
        group.topFiles.map((file) => `${file.path} (${file.occurrences})`).join("<br>"),
      ]),
    ),
  );
  lines.push("");
  lines.push("## Resource RPC Candidates");
  lines.push("");
  lines.push(`Source: \`${report.resourceRpcCandidates.path}\``);
  lines.push("");
  lines.push(
    markdownTable(
      ["Name", "Found", "Index", "Param Types", "Return", "Offset"],
      report.resourceRpcCandidates.candidates.map((candidate) => [
        candidate.name,
        candidate.found ? "yes" : "no",
        candidate.index ?? "",
        (candidate.paramTypes ?? []).join(", "),
        candidate.ret ?? "",
        candidate.offset ?? "",
      ]),
    ),
  );
  lines.push("");
  lines.push("### Representative Context");
  lines.push("");
  const actionableGroupKeys = new Set([
    "runtime_passive_state",
    "runtime_profession_talent_state",
    "damage_and_skill_tables",
    "known_generated_source_families",
    "managed_assembly_names",
    "protobuf_damage_fields",
  ]);
  const noisyRepresentativePath = /BPSR_STEAM_Data\\Plugins\\/i;
  const representativeFiles = report.scan.scannedFiles.filter((file) =>
    !noisyRepresentativePath.test(file.path) &&
    file.groups.some((group) => actionableGroupKeys.has(group.key)),
  );
  for (const file of representativeFiles.slice(0, 12)) {
    lines.push(`#### ${file.path}`);
    lines.push("");
    for (const group of file.groups.slice(0, 4)) {
      lines.push(`- ${group.label}: ${group.occurrences} occurrence(s)`);
      for (const sample of group.samples.slice(0, 3)) {
        const context = sample.context || "(no printable context)";
        lines.push(
          `  - \`${sample.term}\` at byte \`${sample.offset}\` (${sample.encoding}): ${context}`,
        );
      }
    }
    lines.push("");
  }
  lines.push("## Parser Cross-Reference");
  lines.push("");
  lines.push(`Generated protobuf source: \`${report.parserProto.path}\``);
  lines.push("");
  for (const struct of report.parserProto.structs) {
    lines.push(`### ${struct.name}`);
    lines.push("");
    lines.push(
      markdownTable(
        ["Field", "Tag", "Kind", "Line"],
        struct.fields.map((field) => [
          field.name,
          field.tag,
          field.map ? "map" : field.repeated ? "repeated" : field.optional ? "optional" : "",
          field.line,
        ]),
      ),
    );
    lines.push("");
  }
  lines.push("## Runtime Parser Usage");
  lines.push("");
  lines.push(
    markdownTable(
      ["Term", "References", "Files"],
      report.parserRuntimeUsage.map((usage) => [
        usage.term,
        usage.count,
        usage.files.map((file) => `${file.path} (${file.count})`).join("<br>"),
      ]),
    ),
  );
  lines.push("");
  lines.push("## Actionable Next Steps");
  lines.push("");
  lines.push(
    "- Add a small runtime census/logger for `AoiSyncDelta.passive_skill_infos` and `AoiSyncDelta.passive_skill_end_infos` on `EnterScene`, `SyncToMeDeltaInfo`, and `SyncNearDeltaInfo` paths.",
  );
  lines.push(
    "- Record `CharSerialize.profession_list.talent_list[*].talent_node_ids` alongside the existing class id/playerdata capture so controlled encounters can be tied to selected talents.",
  );
  lines.push(
    "- Feed those active passive/talent observations into `formula-semantics-lab.mjs` as source-state evidence before attempting parent-damage contribution splits.",
  );
  lines.push(
    "- Keep using the CTB/formula probes for static table coverage; this scan did not change the boundary that parent-skill modifier contributions need runtime captures.",
  );
  lines.push("");
  lines.push("## Limits");
  lines.push("");
  lines.push(
    "- `.pkg` payloads were inventoried but skipped by default in this scanner because they total tens of GiB and are already covered by the CTB-focused extractor probes.",
  );
  lines.push(
    "- String hits prove that names/types exist in shipped assets; they do not by themselves prove packet timing or numeric formula semantics.",
  );

  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!fs.existsSync(args.gameRoot)) {
    throw new Error(`Game root does not exist: ${args.gameRoot}`);
  }

  const files = walkFiles(args.gameRoot);
  const inventory = {
    totalFiles: files.filter((file) => !file.error).length,
    totalBytes: files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
    errors: files.filter((file) => file.error),
    extensions: summarizeExtensions(files),
  };
  const special = collectSpecialFiles(args.gameRoot);
  const resourceRpcCandidates = collectResourceRpcCandidates(args.gameRoot);
  const scan = scanGameFiles(files, args);
  const parserProto = collectParserProtoSurfaces();
  const parserRuntimeUsage = collectRuntimeUsage();

  const report = {
    generatedAt: new Date().toISOString(),
    gameRoot: args.gameRoot,
    repoRoot,
    options: {
      maxFileBytes: args.maxFileBytes,
      includePackages: args.includePackages,
      maxSamplesPerGroupFile: args.maxSamplesPerGroupFile,
    },
    inventory,
    special,
    resourceRpcCandidates,
    scan,
    parserProto,
    parserRuntimeUsage,
  };
  report.findings = buildFindings(report);

  fs.mkdirSync(path.dirname(args.outJson), { recursive: true });
  fs.writeFileSync(args.outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(args.outMd, buildMarkdown(report));

  console.log(`Wrote ${args.outJson}`);
  console.log(`Wrote ${args.outMd}`);
  console.log(
    `Scanned ${scan.stats.scannedFileCount} files (${formatBytes(scan.stats.scannedBytes)}); found ${scan.groups.length} keyword groups.`,
  );
}

main();
