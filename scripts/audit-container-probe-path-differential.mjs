import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT = "DEV_exports/container-probe-audit-current.json";
const DEFAULT_CURRENT_VDATA = "DEV_exports/seasonal-factor-current-vdata.json";
const DEFAULT_OUT_JSON = "DEV_exports/container-probe-path-differential-current.json";
const DEFAULT_OUT_MD = "DEV_exports/container-probe-path-differential-current.md";

function argValue(flag, fallback = null) {
  for (let index = 2; index < process.argv.length - 1; index += 1) {
    if (process.argv[index] === flag) return process.argv[index + 1];
  }
  return fallback;
}

function usage() {
  return `Usage: node scripts/audit-container-probe-path-differential.mjs [options]

Options:
  --input <path>          Container probe audit JSON. Default: ${DEFAULT_INPUT}
  --current-vdata <path>  Current vdata probe JSON. Default: ${DEFAULT_CURRENT_VDATA}
  --out-json <path>       Output JSON path. Default: ${DEFAULT_OUT_JSON}
  --out-md <path>         Output markdown path. Default: ${DEFAULT_OUT_MD}
`;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

const inputPath = argValue("--input", DEFAULT_INPUT);
const currentVdataPath = argValue("--current-vdata", DEFAULT_CURRENT_VDATA);
const outJson = argValue("--out-json", DEFAULT_OUT_JSON);
const outMd = argValue("--out-md", DEFAULT_OUT_MD);

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortedNumbers(values) {
  return [...new Set(values.map(finiteNumber).filter((value) => value !== null))].sort(
    (left, right) => left - right,
  );
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function formatCountMap(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([key, count]) => ({ key, count }));
}

function basename(filePath) {
  return path.basename(String(filePath ?? ""));
}

function classifyProbePath(rawPath) {
  const value = String(rawPath ?? "");
  if (!value) return "unknown";
  if (/equipped|selected|loadout|equip_list|EquipList/i.test(value)) return "selected-loadout-like";
  if (value.includes("ItemPackage.Packages")) return "owned-item-package";
  if (value.includes("ItemPackage.UnlockItems")) return "unlock-catalog";
  if (value.includes("FunctionData.UnlockedMap") || value.includes("FunctionData.DrawnFunctionIds")) {
    return "function-unlock-catalog";
  }
  if (value.includes("Attr.CdInfo")) return "raw-cd-info-shadow";
  if (/^\$\.16\[0\]\.9\[\d+\]\.1\[0\]$/.test(value) || /^\$\.36\[0\]\.1\[\d+\]\.1\[0\]$/.test(value)) {
    return "raw-numeric-shadow";
  }
  if (/SeasonMedal|season_medal|Slumber/i.test(value)) return "season-node";
  return "unknown";
}

function groupPathClasses(group) {
  const classes = new Set();
  for (const rawPath of asArray(group.rawProtoPaths)) {
    classes.add(classifyProbePath(rawPath));
  }
  if (!classes.size) classes.add("no-path");
  return [...classes].sort((left, right) => left.localeCompare(right));
}

function collectCurrentFactorCandidates(currentVdata) {
  const rows = [];
  for (const item of asArray(currentVdata?.factor_item_matches)) {
    const factorBuffId = finiteNumber(item.factor_buff_id ?? item.factorBuffId);
    if (factorBuffId === null) continue;
    rows.push({
      factorBuffId,
      familyId: finiteNumber(item.family_id ?? item.familyId),
      familyName: item.family_name ?? item.familyName ?? `factor:${factorBuffId}`,
      itemConfigId: finiteNumber(item.config_id ?? item.configId),
      grade: finiteNumber(item.grade_row?.grade ?? item.grade),
      values: asArray(item.grade_row?.valueTexts ?? item.grade_row?.value_texts),
    });
  }
  return rows.sort((left, right) => left.factorBuffId - right.factorBuffId);
}

function summarizeGroupInstances(rows, currentFactorIds) {
  const instances = [];
  for (const row of rows) {
    for (const group of asArray(row.factorGroups)) {
      const proofClass = String(group.proofClass ?? "unknown");
      const pathClasses = groupPathClasses(group);
      const factorBuffId = finiteNumber(group.factorBuffId);
      instances.push({
        file: row.file ?? "",
        fileName: basename(row.file),
        tsMs: finiteNumber(row.tsMs),
        action: row.action ?? "",
        factorBuffId,
        familyName: group.familyName ?? group.label ?? (factorBuffId === null ? "unknown" : `factor:${factorBuffId}`),
        proofClass,
        status: group.status ?? "",
        grades: sortedNumbers(asArray(group.grades)),
        gradeItems: sortedNumbers(asArray(group.gradeItems)),
        pathClasses,
        paths: asArray(group.rawProtoPaths).map(String),
        candidateSources: asArray(group.candidateSources).map(String).sort((left, right) => left.localeCompare(right)),
        isCurrentOwnedFactor: factorBuffId !== null && currentFactorIds.has(factorBuffId),
      });
    }
  }
  return instances.sort(
    (left, right) =>
      (left.tsMs ?? 0) - (right.tsMs ?? 0) ||
      String(left.fileName).localeCompare(String(right.fileName)) ||
      (left.factorBuffId ?? 0) - (right.factorBuffId ?? 0),
  );
}

function summarizeFamilies(instances) {
  const byFactor = new Map();
  for (const instance of instances) {
    if (instance.factorBuffId === null) continue;
    const row = byFactor.get(instance.factorBuffId) ?? {
      factorBuffId: instance.factorBuffId,
      familyName: instance.familyName,
      groupCount: 0,
      entryFiles: new Set(),
      actions: new Set(),
      proofClasses: new Set(),
      pathClasses: new Set(),
      grades: new Set(),
      gradeItems: new Set(),
      currentOwnedHits: 0,
      firstTsMs: instance.tsMs,
      lastTsMs: instance.tsMs,
    };
    row.groupCount += 1;
    row.entryFiles.add(instance.fileName);
    row.actions.add(instance.action);
    row.proofClasses.add(instance.proofClass);
    for (const value of instance.pathClasses) row.pathClasses.add(value);
    for (const value of instance.grades) row.grades.add(value);
    for (const value of instance.gradeItems) row.gradeItems.add(value);
    if (instance.isCurrentOwnedFactor) row.currentOwnedHits += 1;
    row.firstTsMs = row.firstTsMs === null ? instance.tsMs : Math.min(row.firstTsMs ?? instance.tsMs ?? 0, instance.tsMs ?? 0);
    row.lastTsMs = row.lastTsMs === null ? instance.tsMs : Math.max(row.lastTsMs ?? instance.tsMs ?? 0, instance.tsMs ?? 0);
    byFactor.set(instance.factorBuffId, row);
  }

  return [...byFactor.values()]
    .map((row) => ({
      ...row,
      entryFiles: [...row.entryFiles].sort((left, right) => left.localeCompare(right)),
      actions: [...row.actions].sort((left, right) => left.localeCompare(right)),
      proofClasses: [...row.proofClasses].sort((left, right) => left.localeCompare(right)),
      pathClasses: [...row.pathClasses].sort((left, right) => left.localeCompare(right)),
      grades: sortedNumbers([...row.grades]),
      gradeItems: sortedNumbers([...row.gradeItems]),
      isCurrentOwnedFactor: row.currentOwnedHits > 0,
    }))
    .sort((left, right) => right.groupCount - left.groupCount || left.familyName.localeCompare(right.familyName));
}

function renderList(values, limit = 6) {
  const items = asArray(values).map(String).filter(Boolean);
  if (!items.length) return "-";
  const shown = items.slice(0, limit).join(", ");
  return items.length > limit ? `${shown}, +${items.length - limit}` : shown;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Container Probe Path Differential", "");
  lines.push("- dev-only audit: reads generated probe reports only; no live parser, DPS, recount, monitor, hotkey, or modifier worker behavior is changed");
  lines.push(`- generated at: ${report.generatedAt}`);
  lines.push(`- input: ${report.inputPath}`);
  lines.push(`- current vdata: ${report.currentVdataPath}`);
  lines.push("");
  lines.push("## Summary", "");
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("## Interpretation", "");
  for (const note of report.interpretation) lines.push(`- ${note}`);
  lines.push("");
  lines.push("## Path Classes", "");
  lines.push("| Class | Groups |");
  lines.push("| --- | ---: |");
  for (const row of report.groupCountByPathClass) lines.push(`| ${row.key} | ${row.count} |`);
  lines.push("");
  lines.push("## Proof Classes", "");
  lines.push("| Class | Groups |");
  lines.push("| --- | ---: |");
  for (const row of report.groupCountByProofClass) lines.push(`| ${row.key} | ${row.count} |`);
  lines.push("");
  lines.push("## Current Owned Factor Candidates", "");
  lines.push("| Factor | Grade | Item | Values |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const row of report.currentFactorCandidates) {
    lines.push(`| ${row.familyName} (${row.factorBuffId}) | ${row.grade ?? ""} | ${row.itemConfigId ?? ""} | ${renderList(row.values, 4)} |`);
  }
  lines.push("");
  lines.push("## Top Probe Families", "");
  lines.push("| Factor | Groups | Current owned? | Proof classes | Path classes | Grades | Files |");
  lines.push("| --- | ---: | --- | --- | --- | --- | ---: |");
  for (const row of report.factorSummaries.slice(0, 30)) {
    lines.push(
      `| ${row.familyName} (${row.factorBuffId}) | ${row.groupCount} | ${row.isCurrentOwnedFactor ? "yes" : "no"} | ${renderList(row.proofClasses, 3)} | ${renderList(row.pathClasses, 5)} | ${renderList(row.grades, 8)} | ${row.entryFiles.length} |`,
    );
  }
  lines.push("");
  lines.push("## Candidate Next Captures", "");
  lines.push("- Run `npm run tauri:dev:factor-probes`, change one Phantom Factor slot/grade, then run `npm run probe:seasonal-factor:selector -- --latest 14 --max-event-files 100 --max-event-bytes 536870912 --prefix current`.");
  lines.push("- A useful selected-loadout path should change with that action and overlap the factor family you changed; unlock/catalog paths that stay stable should remain blocked.");
  lines.push("");
  return lines.join("\n");
}

const containerReport = readJson(inputPath, {});
const currentVdata = readJson(currentVdataPath, {});
const currentFactorCandidates = collectCurrentFactorCandidates(currentVdata);
const currentFactorIds = new Set(currentFactorCandidates.map((row) => row.factorBuffId));
const groupInstances = summarizeGroupInstances(asArray(containerReport.rows), currentFactorIds);
const factorSummaries = summarizeFamilies(groupInstances);

const proofClassCounts = new Map();
const pathClassCounts = new Map();
let selectedLikeGroupCount = 0;
let samePayloadGroupCount = 0;
let samePayloadCurrentOwnedGroupCount = 0;
let gradeOnlyGroupCount = 0;
let gradeOnlyCurrentOwnedGroupCount = 0;

for (const instance of groupInstances) {
  increment(proofClassCounts, instance.proofClass);
  for (const pathClass of instance.pathClasses) increment(pathClassCounts, pathClass);
  if (instance.pathClasses.includes("selected-loadout-like") || instance.proofClass === "typed-equipped-factor-item") {
    selectedLikeGroupCount += 1;
  }
  if (instance.proofClass === "same-payload-identity-grade-candidate" || instance.proofClass === "same-payload-affected-grade-candidate") {
    samePayloadGroupCount += 1;
    if (instance.isCurrentOwnedFactor) samePayloadCurrentOwnedGroupCount += 1;
  }
  if (instance.proofClass === "grade-only-capture-clue") {
    gradeOnlyGroupCount += 1;
    if (instance.isCurrentOwnedFactor) gradeOnlyCurrentOwnedGroupCount += 1;
  }
}

const unlockCatalogGroupCount = groupInstances.filter((instance) =>
  instance.pathClasses.some((pathClass) =>
    ["unlock-catalog", "function-unlock-catalog", "owned-item-package"].includes(pathClass),
  ),
).length;

const interpretation = [
  "Same-payload identity+grade rows are capture clues, not selected loadout proof.",
  `${samePayloadCurrentOwnedGroupCount} same-payload groups overlap the current owned factor candidates; non-overlap is strong evidence that these rows are unlock/catalog state rather than the selected Phantom Factor loadout.`,
  `${selectedLikeGroupCount} groups expose selected/equipped/loadout-like paths in this report.`,
  `${unlockCatalogGroupCount} groups include owned item-package or unlock/catalog paths and must stay blocked unless a future capture shows they move with selected loadout changes.`,
];

const report = {
  source: "audit-container-probe-path-differential",
  generatedAt: new Date().toISOString(),
  inputPath,
  currentVdataPath,
  summary: {
    probeEntryCount: containerReport.probeEntryCount ?? asArray(containerReport.rows).length,
    groupCount: groupInstances.length,
    currentOwnedFactorCandidates: currentFactorCandidates.length,
    samePayloadGroupCount,
    samePayloadCurrentOwnedGroupCount,
    gradeOnlyGroupCount,
    gradeOnlyCurrentOwnedGroupCount,
    selectedLikeGroupCount,
    unlockCatalogGroupCount,
  },
  currentFactorCandidates,
  groupCountByProofClass: formatCountMap(proofClassCounts),
  groupCountByPathClass: formatCountMap(pathClassCounts),
  factorSummaries,
  groupSamples: groupInstances.slice(0, 120),
  interpretation,
};

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, `${renderMarkdown(report)}\n`);

console.log(
  `wrote ${outJson} and ${outMd} (groups=${report.summary.groupCount}, samePayload=${samePayloadGroupCount}, selectedLike=${selectedLikeGroupCount})`,
);
