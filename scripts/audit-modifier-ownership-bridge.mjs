import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function generatedPath(fileName) {
  return path.join(root, "parser-data", "generated", fileName);
}

function isTalentRule(source) {
  return String(source?.sourceId || "").toLowerCase().startsWith("talent:");
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = String(value || "unknown");
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function hasUidEdge(edges, edgeKind, uidKind, uid) {
  const expectedUid = String(uid);
  return (edges || []).some(
    (edge) => edge.edgeKind === edgeKind
      && edge.uidKind === uidKind
      && String(edge.uid) === expectedUid,
  );
}

const recount = readJson(generatedPath("ModifierRecountTable.json"));
const relationships = readJson(generatedPath("ModifierRelationshipTable.json"));

const missingRecountOwnership = [];
const missingRelationshipOwnership = [];
const missingClassEdges = [];
const missingSpecEdges = [];
const ownershipKinds = [];
const ownershipStatuses = [];
let talentRules = 0;
let hardFilterEligible = 0;

for (const [ruleId, source] of Object.entries(recount.sourcesById || {})) {
  if (!isTalentRule(source)) continue;
  talentRules += 1;
  const ownership = source.talentOwnership;
  const relationship = relationships.sourcesByRuleId?.[ruleId];
  if (!ownership) {
    missingRecountOwnership.push({ ruleId, sourceId: source.sourceId });
    continue;
  }
  ownershipKinds.push(ownership.ownershipKind);
  ownershipStatuses.push(ownership.ownershipStatus);
  if (ownership.hardFilterEligible === true) hardFilterEligible += 1;
  if (!relationship?.talentOwnership) {
    missingRelationshipOwnership.push({ ruleId, sourceId: source.sourceId });
  }
  if (ownership.classId && !hasUidEdge(relationship?.uidEdges, "owner-class", "class", ownership.classId)) {
    missingClassEdges.push({ ruleId, sourceId: source.sourceId, classId: ownership.classId });
  }
  for (const specId of ownership.specIds || []) {
    if (!hasUidEdge(relationship?.uidEdges, "owner-spec", "spec", specId)) {
      missingSpecEdges.push({ ruleId, sourceId: source.sourceId, specId });
    }
  }
}

const report = {
  generatedFrom: {
    recount: "parser-data/generated/ModifierRecountTable.json",
    relationships: "parser-data/generated/ModifierRelationshipTable.json",
  },
  summary: {
    talentRules,
    withRecountOwnership: talentRules - missingRecountOwnership.length,
    withRelationshipOwnership: talentRules - missingRelationshipOwnership.length,
    hardFilterEligible,
    ownershipKindCounts: countBy(ownershipKinds),
    ownershipStatusCounts: countBy(ownershipStatuses),
    missingRecountOwnership: missingRecountOwnership.length,
    missingRelationshipOwnership: missingRelationshipOwnership.length,
    missingClassEdges: missingClassEdges.length,
    missingSpecEdges: missingSpecEdges.length,
  },
  blockers: {
    missingRecountOwnership: missingRecountOwnership.slice(0, 50),
    missingRelationshipOwnership: missingRelationshipOwnership.slice(0, 50),
    missingClassEdges: missingClassEdges.slice(0, 50),
    missingSpecEdges: missingSpecEdges.slice(0, 50),
  },
};

console.log(JSON.stringify(report, null, 2));

if (
  missingRecountOwnership.length
  || missingRelationshipOwnership.length
  || missingClassEdges.length
  || missingSpecEdges.length
) {
  process.exitCode = 1;
}
