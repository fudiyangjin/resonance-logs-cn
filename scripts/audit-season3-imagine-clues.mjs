import fs from "node:fs";
import path from "node:path";

const APP_ROOT = process.cwd();
const EXTRACTOR_OUTPUT = path.resolve(APP_ROOT, "..", "BPSR-UID-Extractors", "output");
const OUT_DIR = path.join(APP_ROOT, "DEV_exports");

const CLUES = [
  "Predatory Spider",
  "Hollow Overseer",
  "Paradox King",
  "Ridge Fang",
  "Leeching Furball",
  "Denver",
  "Igoreus",
  "Plague Nappo",
  "Katgreve",
  "Kartgriff",
  "Killer Spider",
  "Verdant Fang",
  "Man-Eating Furball",
  "Dogman",
  "Eyes of the Sanctuary",
];

const BROAD_TOKENS = [
  "spider",
  "overseer",
  "paradox",
  "fang",
  "furball",
  "denver",
  "igoreus",
  "nappo",
  "katgreve",
  "kartgriff",
  "dogman",
  "sanctuary",
];

const TEXT_FILES = [
  ["aoyi", "skill_aoyi_icons.json"],
  ["aoyiSearch", "resonance_skill_search.json"],
  ["battleImagines", "BattleImagineDescriptions.json"],
  ["items", "ItemDescriptions.json"],
  ["itemNames", "itemnames.json"],
  ["monsters", "monsternames.json"],
  ["skillCooldowns", "SkillCooldowns.json"],
  ["skillBreakdown", "SkillBreakdownDetails.json"],
  ["damageNames", "DamageAttrIdName.json"],
  ["iconManifest", path.join("icons", "IconManifest.json")],
];

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readJson(filePath, fallback) {
  const text = readText(filePath);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function collectStrings(value, out = []) {
  if (value == null) return out;
  if (typeof value === "string" || typeof value === "number") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

function sampleLineMatches(text, needle, limit = 5) {
  const loweredNeedle = normalize(needle);
  if (!text || !loweredNeedle) return { count: 0, samples: [] };

  let count = 0;
  const samples = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!normalize(line).includes(loweredNeedle)) continue;
    count += 1;
    if (samples.length < limit) {
      samples.push({
        line: index + 1,
        text: line.trim().slice(0, 240),
      });
    }
  }
  return { count, samples };
}

function summarizeRows(rows, token) {
  const lowered = normalize(token);
  const matches = [];
  for (const row of rows) {
    const haystack = normalize(collectStrings(row).join(" "));
    if (!haystack.includes(lowered)) continue;
    matches.push({
      id: row.id ?? row.Id ?? row.uid,
      name: row.Name ?? row.name,
      en: row.Names?.en ?? row.names?.en,
      imagine: row.MonsterNames?.en,
      icon: row.Icon,
      source: row.Source ?? row.provenance?.sourceFiles?.join(", "),
    });
  }
  return matches;
}

function uniqueByKey(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = JSON.stringify([row.id, row.name, row.en, row.imagine, row.icon, row.source]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function tableLine(values) {
  return `| ${values.map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const fileTexts = Object.fromEntries(
  TEXT_FILES.map(([key, rel]) => [key, readText(path.join(EXTRACTOR_OUTPUT, rel))]),
);

const aoyiRows = readJson(path.join(EXTRACTOR_OUTPUT, "skill_aoyi_icons.json"), []);
const battleCatalog = readJson(path.join(EXTRACTOR_OUTPUT, "BattleImagineDescriptions.json"), {});
const battleRows = Object.values(battleCatalog.entriesByUid ?? {});

const exact = {};
for (const clue of CLUES) {
  exact[clue] = {};
  for (const [key, text] of Object.entries(fileTexts)) {
    const result = sampleLineMatches(text, clue, 4);
    if (result.count > 0) exact[clue][key] = result;
  }
}

const broad = {};
for (const token of BROAD_TOKENS) {
  broad[token] = {
    aoyiRows: uniqueByKey(summarizeRows(aoyiRows, token)).slice(0, 20),
    battleImagineRows: uniqueByKey(summarizeRows(battleRows, token)).slice(0, 30),
  };
}

const exactBattleOrAoyiHits = Object.entries(exact)
  .filter(([, files]) => files.aoyi || files.aoyiSearch || files.battleImagines)
  .map(([clue, files]) => ({
    clue,
    aoyi: files.aoyi?.count ?? 0,
    search: files.aoyiSearch?.count ?? 0,
    battleImagines: files.battleImagines?.count ?? 0,
  }));

const exactOtherHits = Object.entries(exact)
  .filter(([, files]) => Object.keys(files).some((key) => !["aoyi", "aoyiSearch", "battleImagines"].includes(key)))
  .map(([clue, files]) => ({
    clue,
    files: Object.fromEntries(
      Object.entries(files)
        .filter(([key]) => !["aoyi", "aoyiSearch", "battleImagines"].includes(key))
        .map(([key, value]) => [key, value.count]),
    ),
  }));

const report = {
  generatedAt: new Date().toISOString(),
  extractorOutput: EXTRACTOR_OUTPUT,
  counts: {
    aoyiRows: aoyiRows.length,
    battleImagineRows: battleRows.length,
    battleImagineSources: battleCatalog.sources ?? [],
    battleImagineStats: battleCatalog.stats ?? {},
  },
  exactBattleOrAoyiHits,
  exactOtherHits,
  exact,
  broad,
};

const jsonPath = path.join(OUT_DIR, "season3-imagine-clue-audit.json");
const mdPath = path.join(OUT_DIR, "season3-imagine-clue-audit.md");
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const md = [];
md.push("# Season 3 Imagine Clue Audit");
md.push("");
md.push(`Generated: ${report.generatedAt}`);
md.push("");
md.push("## Game-File Generated Counts");
md.push("");
md.push(tableLine(["Source", "Count"]));
md.push(tableLine(["---", "---"]));
md.push(tableLine(["skill_aoyi_icons rows", report.counts.aoyiRows]));
md.push(tableLine(["BattleImagineDescriptions entries", report.counts.battleImagineRows]));
md.push(tableLine(["BattleImagineDescriptions with descriptions", report.counts.battleImagineStats.withDescriptions ?? ""]));
md.push(tableLine(["BattleImagineDescriptions item-page bridges", report.counts.battleImagineStats.withBridgedPageContexts ?? ""]));
md.push("");
md.push("## Exact Hits In Searchable Imagine Tables");
md.push("");
if (exactBattleOrAoyiHits.length === 0) {
  md.push("No exact clue names were found in `skill_aoyi_icons.json`, `resonance_skill_search.json`, or `BattleImagineDescriptions.json`.");
} else {
  md.push(tableLine(["Clue", "skill_aoyi", "search sidecar", "battle imagines"]));
  md.push(tableLine(["---", "---", "---", "---"]));
  for (const row of exactBattleOrAoyiHits) {
    md.push(tableLine([row.clue, row.aoyi, row.search, row.battleImagines]));
  }
}
md.push("");
md.push("## Exact Hits Elsewhere");
md.push("");
if (exactOtherHits.length === 0) {
  md.push("No exact clue names were found in the broader generated outputs.");
} else {
  md.push(tableLine(["Clue", "Generated files"]));
  md.push(tableLine(["---", "---"]));
  for (const row of exactOtherHits) {
    md.push(tableLine([row.clue, Object.entries(row.files).map(([key, count]) => `${key}:${count}`).join(", ")]));
  }
}
md.push("");
md.push("## Broad Searchable Imagine Matches");
for (const token of BROAD_TOKENS) {
  const rows = broad[token].battleImagineRows.length ? broad[token].battleImagineRows : broad[token].aoyiRows;
  if (rows.length === 0) continue;
  md.push("");
  md.push(`### ${token}`);
  md.push("");
  md.push(tableLine(["ID", "Name", "Imagine/EN", "Icon", "Source"]));
  md.push(tableLine(["---", "---", "---", "---", "---"]));
  for (const row of rows.slice(0, 12)) {
    md.push(tableLine([row.id, row.name ?? row.en, row.imagine ?? row.en ?? "", row.icon ?? "", row.source ?? ""]));
  }
}
md.push("");
md.push("## Notes");
md.push("");
md.push("- Exact clue matches outside the searchable imagine tables are evidence that the name exists somewhere in current game-derived data, not proof that it is a Battle Imagine/resonance skill row.");
md.push("- Do not promote item-only or monster-only matches into the resonance skill monitor until a `skill_aoyi_icons`/BattleImagine bridge or real skill id/icon is found.");
fs.writeFileSync(mdPath, `${md.join("\n")}\n`);

console.log(`Wrote ${path.relative(APP_ROOT, jsonPath)}`);
console.log(`Wrote ${path.relative(APP_ROOT, mdPath)}`);
console.log(JSON.stringify({
  aoyiRows: report.counts.aoyiRows,
  battleImagineRows: report.counts.battleImagineRows,
  exactBattleOrAoyiHits,
  exactOtherHits,
}, null, 2));
