#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const staticImagesDir = path.join(repoRoot, "static", "images");
const buffImagesDir = path.join(staticImagesDir, "buff");
const assetMapPath = path.join(
  repoRoot,
  "..",
  "BPSR-UID-Extractors",
  "output",
  "parser-assets",
  "asset-path-map.json",
);

const staticImagePathsOut = path.join(repoRoot, "src", "lib", "config", "static-image-paths.generated.ts");
const buffIconFilesOut = path.join(repoRoot, "src", "lib", "config", "buff-icon-files.generated.ts");
const buffIconMapOut = path.join(repoRoot, "src", "lib", "config", "buff-icon-map.generated.ts");

function portablePath(value) {
  return value.replace(/\\/g, "/");
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files.sort((a, b) => portablePath(a).localeCompare(portablePath(b)));
}

function writeTsConst(filePath, comment, exportName, value) {
  fs.writeFileSync(
    filePath,
    `${comment}\nexport const ${exportName} = ${JSON.stringify(value, null, 2)} as const;\n`,
    "utf8",
  );
}

function toPositiveInteger(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function basenameFromParserPath(value) {
  if (typeof value !== "string") return "";
  return portablePath(value).split("/").pop() ?? "";
}

function buildBuffIconMap(assetMap) {
  const byId = {};
  for (const asset of assetMap.Assets ?? []) {
    if (asset?.Bucket !== "buff") continue;
    const fileName = basenameFromParserPath(asset.ParserPath);
    if (!fileName) continue;
    for (const row of asset.Rows ?? []) {
      const id = toPositiveInteger(row?.Id);
      if (id === null) continue;
      const key = String(id);
      if (!byId[key]) byId[key] = fileName;
    }
  }
  return Object.fromEntries(Object.entries(byId).sort(([a], [b]) => Number(a) - Number(b)));
}

const staticImagePaths = walkFiles(staticImagesDir)
  .map((filePath) => `images/${portablePath(path.relative(staticImagesDir, filePath))}`)
  .sort((a, b) => a.localeCompare(b));

const buffIconFiles = walkFiles(buffImagesDir)
  .map((filePath) => portablePath(path.relative(buffImagesDir, filePath)))
  .sort((a, b) => a.localeCompare(b));

const assetMap = JSON.parse(fs.readFileSync(assetMapPath, "utf8"));
const buffIconMap = buildBuffIconMap(assetMap);

writeTsConst(
  staticImagePathsOut,
  "// Generated from static/images so icon lookup does not bundle image bytes. Do not edit by hand.",
  "STATIC_IMAGE_PATHS",
  staticImagePaths,
);
writeTsConst(
  buffIconFilesOut,
  "// Generated from BPSR-UID-Extractors/output/parser-assets/static/images/buff. Do not edit by hand.",
  "BUFF_ICON_FILES",
  buffIconFiles,
);
writeTsConst(
  buffIconMapOut,
  "// Generated from parser-data/generated/BuffName.json and BPSR parser-assets/asset-path-map.json. Do not edit by hand.",
  "BUFF_ICON_FILE_BY_ID",
  buffIconMap,
);

console.log(`static image paths: ${staticImagePaths.length}`);
console.log(`buff icon files: ${buffIconFiles.length}`);
console.log(`buff icon id links: ${Object.keys(buffIconMap).length}`);
