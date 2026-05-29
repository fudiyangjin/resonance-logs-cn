#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function pct(value) {
  if (!Number.isFinite(value)) return "";
  return `${(value * 100).toFixed(2)}%`;
}

function signedPct(value) {
  if (!Number.isFinite(value)) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function whole(value) {
  if (!Number.isFinite(value)) return "";
  return Math.round(value).toLocaleString("en-US");
}

function csvList(values) {
  return (values ?? []).filter(Boolean).join(", ");
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function topDetails(details, limit = 8) {
  return [...(details ?? [])]
    .sort((left, right) => (right.hits ?? 0) - (left.hits ?? 0))
    .slice(0, limit)
    .map((detail) => ({
      reason: detail.reason ?? "",
      ruleId: detail.ruleId ?? "",
      label: detail.label ?? detail.ruleId ?? "",
      componentKey: detail.componentKey ?? "",
      terms: detail.terms ?? [],
      hits: detail.hits ?? 0,
    }));
}

function compactContributions(contributions) {
  return [...(contributions ?? [])]
    .sort((left, right) => Math.abs(right.finalContribution ?? 0) - Math.abs(left.finalContribution ?? 0))
    .map((contribution) => ({
      label: contribution.label ?? contribution.ruleId ?? "",
      contributionRuleId: contribution.ruleId ?? "",
      activeProofRuleId: contribution.activeRuleId ?? "",
      aliasReason: contribution.activeRuleAliasReason ?? "",
      term: contribution.term ?? "",
      amount: contribution.amount ?? null,
      hits: contribution.hits ?? 0,
      finalContribution: contribution.finalContribution ?? 0,
    }));
}

function hasBlockedDetail(row, predicate) {
  return (row.blockedActionDetails ?? []).some(predicate);
}

function replayBlockers(coefficientRow, stripRow) {
  const blockers = new Set();
  for (const blocker of coefficientRow.blockers ?? []) blockers.add(blocker);

  if (!stripRow) {
    blockers.add("missing-modifier-strip-report-row");
    return [...blockers];
  }

  const afterSpread = stripRow.after?.spreadPct;
  const spreadDelta = Math.abs(stripRow.spreadDelta ?? 0);
  if ((stripRow.stripFactorDistinctValues ?? 0) === 1 && spreadDelta < 0.000001) {
    blockers.add("constant-strip-factor-did-not-reduce-hit-spread");
  }
  if (Number.isFinite(afterSpread) && afterSpread > 0.05) {
    blockers.add("post-strip-hit-spread-too-wide");
  }
  if ((stripRow.blockedReasons?.["missing-contribution-runtime-row"] ?? 0) > 0) {
    blockers.add("active-source-contribution-row-missing");
  }
  if (hasBlockedDetail(stripRow, (detail) => (detail.reason ?? "").startsWith("observed-only-value-bridge-required"))) {
    blockers.add("observed-only-source-value-bridge-required");
  }
  if (hasBlockedDetail(stripRow, (detail) => (detail.terms ?? []).includes("seasonDamagePct"))) {
    blockers.add("seasonal-factor-model-required");
  }
  if (hasBlockedDetail(stripRow, (detail) => (detail.terms ?? []).includes("primaryAttack"))) {
    blockers.add("attack-stat-snapshot-model-required");
  }
  if (hasBlockedDetail(stripRow, (detail) => (detail.reason ?? "").startsWith("ambiguous-component-values"))) {
    blockers.add("component-value-disambiguation-required");
  }
  if ((stripRow.candidateContributions ?? []).length > 0 && (stripRow.status ?? "") !== "coefficient-ready") {
    blockers.add("candidate-terms-are-evidence-only");
  }

  return [...blockers].sort();
}

function readinessFor(blockers) {
  if (!blockers.length) return "ready-for-replay-check";
  if (blockers.includes("constant-strip-factor-did-not-reduce-hit-spread")) return "blocked-constant-strip-factor";
  if (blockers.includes("seasonal-factor-model-required")) return "blocked-seasonal-factor-model";
  if (blockers.includes("attack-stat-snapshot-model-required")) return "blocked-attack-stat-model";
  if (blockers.includes("active-source-contribution-row-missing")) return "blocked-active-source-map";
  return "blocked";
}

function nextActionFor(blockers) {
  if (blockers.includes("seasonal-factor-model-required")) {
    return "model seasonal factor terms before replaying this row";
  }
  if (blockers.includes("observed-only-source-value-bridge-required")) {
    return "bridge observed-only runtime buffs to source/value rows or mark them as state-only evidence";
  }
  if (blockers.includes("attack-stat-snapshot-model-required")) {
    return "resolve primary-attack snapshot terms from stat evidence before replay";
  }
  if (blockers.includes("active-source-contribution-row-missing")) {
    return "map missing active source rows to contribution runtime terms";
  }
  if (blockers.includes("component-value-disambiguation-required")) {
    return "disambiguate multi-value component rows by scope or runtime owner";
  }
  if (blockers.includes("constant-strip-factor-did-not-reduce-hit-spread")) {
    return "collect or isolate active/inactive windows; constant modifiers cannot solve base spread";
  }
  return "inspect coefficient and strip blockers";
}

function buildReport(coefficient, strip) {
  const stripByDamageId = new Map((strip.damageRows ?? []).map((row) => [Number(row.damageId), row]));
  const candidateRows = (coefficient.rows ?? []).filter((row) => {
    const stripRow = stripByDamageId.get(Number(row.damageId));
    return (
      row.readiness === "modifier-strip-required" ||
      (stripRow?.candidateContributions?.length ?? 0) > 0 ||
      (stripRow?.stripHits ?? 0) > 0
    );
  });

  const rows = candidateRows.map((row) => {
    const stripRow = stripByDamageId.get(Number(row.damageId));
    const blockers = replayBlockers(row, stripRow);
    return {
      damageId: row.damageId,
      name: row.name,
      finalValue: row.finalValue,
      hits: row.hits,
      coefficientValues: row.coefficientValues ?? [],
      coefficientStatus: row.coefficientStatus,
      chainAllocation: row.chainAllocation,
      chainReplayStatus: row.chainReplayStatus,
      coefficientReadiness: row.readiness,
      beforeSpreadPct: stripRow?.before?.spreadPct ?? row.decritAttackSpreadPct ?? null,
      afterSpreadPct: stripRow?.after?.spreadPct ?? null,
      spreadDelta: stripRow?.spreadDelta ?? null,
      stripFactorDistinctValues: stripRow?.stripFactorDistinctValues ?? null,
      stripHits: stripRow?.stripHits ?? 0,
      candidateContributions: compactContributions(stripRow?.candidateContributions),
      blockedActionDetails: topDetails(stripRow?.blockedActionDetails),
      replayBlockers: blockers,
      replayReadiness: readinessFor(blockers),
      nextAction: nextActionFor(blockers),
      files: stripRow?.files ?? [],
    };
  });

  const summaryByReadiness = {};
  for (const row of rows) {
    summaryByReadiness[row.replayReadiness] = (summaryByReadiness[row.replayReadiness] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      coefficient: coefficient.inputs ?? {},
      modifierStrip: strip.inputs ?? {},
    },
    summary: {
      candidateRows: rows.length,
      byReplayReadiness: summaryByReadiness,
      rowsWithCandidateContributions: rows.filter((row) => row.candidateContributions.length > 0).length,
      rowsWithMissingContributionRows: rows.filter((row) => row.replayBlockers.includes("active-source-contribution-row-missing")).length,
      rowsWithObservedOnlyBridgeBlockers: rows.filter((row) => row.replayBlockers.includes("observed-only-source-value-bridge-required")).length,
      rowsWithSeasonalFactorBlockers: rows.filter((row) => row.replayBlockers.includes("seasonal-factor-model-required")).length,
      rowsWithAttackStatBlockers: rows.filter((row) => row.replayBlockers.includes("attack-stat-snapshot-model-required")).length,
    },
    rows,
  };
}

function toMarkdown(report, maxRows) {
  const lines = [];
  lines.push("# Skill Replay Candidate Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Candidate rows: ${report.summary.candidateRows}`);
  lines.push(`- Rows with candidate contribution terms: ${report.summary.rowsWithCandidateContributions}`);
  lines.push(`- Rows blocked by missing contribution rows: ${report.summary.rowsWithMissingContributionRows}`);
  lines.push(`- Rows blocked by observed-only source/value bridges: ${report.summary.rowsWithObservedOnlyBridgeBlockers}`);
  lines.push(`- Rows blocked by seasonal factor terms: ${report.summary.rowsWithSeasonalFactorBlockers}`);
  lines.push(`- Rows blocked by attack stat terms: ${report.summary.rowsWithAttackStatBlockers}`);
  lines.push("");
  lines.push("## Candidate Rows");
  lines.push("");
  lines.push("| Damage ID | Skill | Coeff | Readiness | Before Spread | After Spread | Strip Terms | Blockers | Next Action |");
  lines.push("| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |");
  for (const row of report.rows.slice(0, maxRows)) {
    const terms = row.candidateContributions
      .slice(0, 6)
      .map((contribution) => {
        const proof = contribution.activeProofRuleId ? ` proof:${contribution.activeProofRuleId}` : "";
        return `${contribution.label} ${signedPct(contribution.amount)} ${contribution.term}${proof}`;
      })
      .join("<br>");
    lines.push(
      [
        row.damageId,
        row.name,
        csvList(row.coefficientValues),
        row.replayReadiness,
        pct(row.beforeSpreadPct),
        pct(row.afterSpreadPct),
        terms,
        row.replayBlockers.join("<br>"),
        row.nextAction,
      ]
        .map(markdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  lines.push("");
  lines.push("## Top Blocked Rules");
  lines.push("");
  for (const row of report.rows.slice(0, maxRows)) {
    lines.push(`### ${row.damageId} ${row.name}`);
    lines.push("");
    lines.push("| Hits | Reason | Rule | Label | Component | Terms |");
    lines.push("| ---: | --- | --- | --- | --- | --- |");
    for (const detail of row.blockedActionDetails) {
      lines.push(
        [
          whole(detail.hits),
          detail.reason,
          detail.ruleId,
          detail.label,
          detail.componentKey,
          csvList(detail.terms),
        ]
          .map(markdownCell)
          .join(" | ")
          .replace(/^/, "| ")
          .replace(/$/, " |"),
      );
    }
    if (!row.blockedActionDetails.length) {
      lines.push("|  |  |  |  |  |  |");
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
const coefficientPath = args["coefficient-json"] ?? "DEV_exports/skill-coefficient-blockers-latest4.json";
const stripPath = args["strip-json"] ?? "DEV_exports/skill-modifier-strip-audit-latest4.json";
const outJson = args["out-json"] ?? "DEV_exports/skill-replay-candidates-latest4.json";
const outMd = args["out-md"] ?? "DEV_exports/skill-replay-candidates-latest4.md";
const maxRows = Number.parseInt(args["max-rows"] ?? "40", 10);

const report = buildReport(readJson(coefficientPath), readJson(stripPath));
ensureDir(outJson);
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
ensureDir(outMd);
fs.writeFileSync(outMd, toMarkdown(report, Number.isFinite(maxRows) ? maxRows : 40));

console.log(`Replay candidate rows: ${report.summary.candidateRows}`);
console.log(`Rows with candidate contribution terms: ${report.summary.rowsWithCandidateContributions}`);
console.log(`Rows blocked by seasonal factor terms: ${report.summary.rowsWithSeasonalFactorBlockers}`);
console.log(`Rows blocked by attack stat terms: ${report.summary.rowsWithAttackStatBlockers}`);
console.log(`Rows blocked by observed-only source/value bridges: ${report.summary.rowsWithObservedOnlyBridgeBlockers}`);
console.log(`Output: ${outJson}`);
console.log(`Markdown: ${outMd}`);
