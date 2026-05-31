use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::PathBuf;

use diesel::prelude::*;
use diesel::sql_types::{Binary, Integer, Nullable, Text};
use resonance_logs_lib::live::commands_models::DamageSnapshot;
use resonance_logs_lib::live::opcodes_models::Entity;
use serde_json::Value;

#[derive(QueryableByName)]
struct EncounterBlob {
    #[diesel(sql_type = Integer)]
    id: i32,
    #[diesel(sql_type = Nullable<Text>)]
    scene_name: Option<String>,
    #[diesel(sql_type = Binary)]
    data: Vec<u8>,
}

#[derive(Debug, Default)]
struct Options {
    db_path: Option<PathBuf>,
    latest: usize,
    offset: usize,
    locale: String,
    out_json: Option<PathBuf>,
    out_md: Option<PathBuf>,
}

#[derive(Debug, Default)]
struct ObservedDeathSkill {
    skill_key: i64,
    monster_damage: bool,
    total_value: u128,
    hits: usize,
    encounter_ids: BTreeSet<i32>,
    scenes: BTreeSet<String>,
    victims: BTreeSet<String>,
    sources: BTreeSet<String>,
    attacker_monster_type_ids: BTreeSet<i32>,
}

#[derive(Debug, serde::Serialize)]
struct ReportRow {
    skill_key: i64,
    monster_damage: bool,
    total_value: String,
    hits: usize,
    encounter_count: usize,
    sample_encounter_ids: Vec<i32>,
    sample_scenes: Vec<String>,
    sample_victims: Vec<String>,
    sample_sources: Vec<String>,
    attacker_monster_type_ids: Vec<i32>,
    design_name: Option<String>,
    resolved_name: String,
    covered_by: Option<String>,
    needs_localization: bool,
    reason: String,
}

#[derive(Debug, serde::Serialize)]
struct AuditReport {
    database: String,
    latest_limit: usize,
    offset: usize,
    locale: String,
    encounters_scanned: usize,
    encounters_with_deaths: usize,
    decode_failures: Vec<String>,
    observed_skill_count: usize,
    needs_localization_count: usize,
    rows: Vec<ReportRow>,
}

#[derive(Debug, Default)]
struct RuntimeCoverage {
    damage_overrides: BTreeSet<String>,
    exact_monster_skill_labels: BTreeSet<String>,
    monster_skill_token_labels: Vec<(String, String)>,
}

fn default_db_path() -> PathBuf {
    if let Some(mut dir) = dirs::data_local_dir() {
        dir.push("resonance-logs-global");
        dir.join("resonance-logs-global.db")
    } else {
        PathBuf::from("resonance-logs-global.db")
    }
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf()
}

fn generated_path(name: &str) -> PathBuf {
    repo_root().join("parser-data").join("generated").join(name)
}

fn default_out_json() -> PathBuf {
    repo_root()
        .join("DEV_exports")
        .join("death-replay-localization-audit.json")
}

fn default_out_md() -> PathBuf {
    repo_root()
        .join("DEV_exports")
        .join("death-replay-localization-audit.md")
}

fn next_arg(args: &mut impl Iterator<Item = String>, name: &str) -> Result<String, String> {
    args.next()
        .ok_or_else(|| format!("Missing value for {name}"))
}

fn parse_options() -> Result<Options, String> {
    let mut options = Options {
        latest: 500,
        locale: "en".to_string(),
        ..Default::default()
    };
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--db" => options.db_path = Some(PathBuf::from(next_arg(&mut args, "--db")?)),
            "--latest" => {
                options.latest = next_arg(&mut args, "--latest")?
                    .parse::<usize>()
                    .map_err(|_| "--latest must be a positive integer".to_string())?;
            }
            "--offset" => {
                options.offset = next_arg(&mut args, "--offset")?
                    .parse::<usize>()
                    .map_err(|_| "--offset must be a non-negative integer".to_string())?;
            }
            "--locale" => options.locale = next_arg(&mut args, "--locale")?,
            "--out-json" => {
                options.out_json = Some(PathBuf::from(next_arg(&mut args, "--out-json")?))
            }
            "--out-md" => options.out_md = Some(PathBuf::from(next_arg(&mut args, "--out-md")?)),
            "--help" | "-h" => {
                println!(
                    "Usage: audit_death_replay_localization [--db <path>] [--latest <count>] [--offset <count>] [--locale <code>] [--out-json <path>] [--out-md <path>]"
                );
                std::process::exit(0);
            }
            _ => return Err(format!("Unknown option: {arg}")),
        }
    }
    if options.latest == 0 {
        return Err("--latest must be greater than zero".to_string());
    }
    Ok(options)
}

fn read_generated_json(name: &str) -> Value {
    let path = generated_path(name);
    let Ok(bytes) = fs::read(path) else {
        return Value::Object(Default::default());
    };
    serde_json::from_slice(&bytes).unwrap_or_else(|_| Value::Object(Default::default()))
}

fn clean_text(value: Option<&Value>) -> Option<String> {
    value?
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn named_text(entry: Option<&Value>, locale: &str) -> Option<String> {
    let entry = entry?;
    let names = entry.get("Names").or_else(|| entry.get("names"));
    for key in [locale, "en", "zh-CN", "zh-TW", "design"] {
        if let Some(text) = clean_text(names.and_then(|map| map.get(key))) {
            return Some(text);
        }
    }
    clean_text(entry.get("Name"))
        .or_else(|| clean_text(entry.get("DamageName")))
        .or_else(|| clean_text(entry.get("RecountName")))
}

fn design_damage_name(entry: Option<&Value>, detail: Option<&Value>) -> Option<String> {
    clean_text(
        entry
            .and_then(|entry| entry.get("Names"))
            .and_then(|names| names.get("design")),
    )
    .or_else(|| clean_text(entry.and_then(|entry| entry.get("Name"))))
    .or_else(|| clean_text(entry.and_then(|entry| entry.get("DamageName"))))
    .or_else(|| {
        clean_text(
            detail
                .and_then(|detail| detail.get("DamageNames"))
                .and_then(|names| names.get("design")),
        )
    })
    .or_else(|| {
        clean_text(
            detail
                .and_then(|detail| detail.get("UnderlyingSkillNames"))
                .and_then(|names| names.get("design")),
        )
    })
    .or_else(|| {
        clean_text(
            detail
                .and_then(|detail| detail.get("LinkedNames"))
                .and_then(|names| names.get("design")),
        )
    })
    .or_else(|| clean_text(detail.and_then(|detail| detail.get("DamageName"))))
    .or_else(|| clean_text(detail.and_then(|detail| detail.get("UnderlyingSkillName"))))
    .or_else(|| clean_text(detail.and_then(|detail| detail.get("LinkedName"))))
}

fn has_cjk(value: &str) -> bool {
    value
        .chars()
        .any(|ch| ('\u{3400}'..='\u{9fff}').contains(&ch))
}

fn is_safe_visible_text(value: &str, locale: &str) -> bool {
    !value.trim().is_empty()
        && (locale.to_ascii_lowercase().starts_with("zh") || !has_cjk(value))
        && !value.starts_with("Unknown")
}

fn parse_first_quoted_pair(line: &str) -> Option<(String, String)> {
    let mut values = Vec::new();
    let mut rest = line;
    while let Some(start) = rest.find('"') {
        let after_start = &rest[start + 1..];
        let Some(end) = after_start.find('"') else {
            break;
        };
        values.push(after_start[..end].to_string());
        rest = &after_start[end + 1..];
        if values.len() >= 2 {
            break;
        }
    }
    match values.as_slice() {
        [left, right, ..] => Some((left.clone(), right.clone())),
        _ => None,
    }
}

fn parse_first_quoted_value(line: &str) -> Option<String> {
    let start = line.find('"')?;
    let after_start = &line[start + 1..];
    let end = after_start.find('"')?;
    Some(after_start[..end].to_string())
}

fn load_runtime_coverage() -> RuntimeCoverage {
    let source = fs::read_to_string(
        repo_root()
            .join("src")
            .join("lib")
            .join("config")
            .join("recount-table.ts"),
    )
    .unwrap_or_default();
    let mut runtime = RuntimeCoverage::default();
    let mut in_damage_overrides = false;
    let mut in_exact = false;
    let mut in_tokens = false;

    for raw_line in source.lines() {
        let line = raw_line.trim();
        if line.starts_with("const DAMAGE_ID_NAME_OVERRIDES") {
            in_damage_overrides = true;
            continue;
        }
        if line.starts_with("const DESIGN_MONSTER_SKILL_EXACT_LABELS") {
            in_exact = true;
            continue;
        }
        if line.starts_with("const DESIGN_MONSTER_SKILL_TOKEN_LABELS") {
            in_tokens = true;
            continue;
        }
        if in_damage_overrides && line.starts_with("};") {
            in_damage_overrides = false;
        }
        if in_exact && line.starts_with("};") {
            in_exact = false;
        }
        if in_tokens && line.starts_with("];") {
            in_tokens = false;
        }

        if in_damage_overrides {
            if let Some(id) = parse_first_quoted_value(line) {
                if id.chars().all(|ch| ch.is_ascii_digit()) {
                    runtime.damage_overrides.insert(id);
                }
            }
        } else if in_exact {
            if let Some(label) = parse_first_quoted_value(line) {
                if has_cjk(&label) {
                    runtime
                        .exact_monster_skill_labels
                        .insert(normalize_monster_skill_candidate(&label));
                    runtime.exact_monster_skill_labels.insert(label);
                }
            }
        } else if in_tokens && line.starts_with('[') {
            if let Some((token, en)) = parse_first_quoted_pair(line) {
                if has_cjk(&token) && !has_cjk(&en) {
                    runtime.monster_skill_token_labels.push((token, en));
                }
            }
        }
    }

    runtime
        .monster_skill_token_labels
        .sort_by(|left, right| right.0.len().cmp(&left.0.len()));
    runtime
}

fn normalize_monster_skill_candidate(value: &str) -> String {
    value
        .replace('（', "(")
        .replace('）', ")")
        .replace('_', "-")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn trim_likely_owner_prefix(value: &str) -> String {
    let normalized = normalize_monster_skill_candidate(value);
    for separator in ["-", "：", ":", "—", "–"] {
        if let Some(index) = normalized.find(separator) {
            if index > 0 && index + separator.len() < normalized.len() {
                return normalized[index + separator.len()..].trim().to_string();
            }
        }
    }
    normalized
}

fn monster_skill_coverage(value: &str, runtime: &RuntimeCoverage) -> Option<String> {
    let normalized = normalize_monster_skill_candidate(value);
    let mut candidates = vec![normalized.clone(), trim_likely_owner_prefix(value)];
    for (token, _) in &runtime.monster_skill_token_labels {
        if let Some(index) = normalized.find(token) {
            if index > 0 {
                candidates.push(normalized[index..].trim().to_string());
            }
        }
    }
    candidates.sort();
    candidates.dedup();

    for candidate in candidates {
        if runtime.exact_monster_skill_labels.contains(&candidate) {
            return Some("exact-runtime-monster-skill-label".to_string());
        }

        let mut translated = candidate.clone();
        for (token, label) in &runtime.monster_skill_token_labels {
            translated = translated.replace(token, label);
        }
        if translated != candidate && !has_cjk(&translated) {
            return Some("token-runtime-monster-skill-label".to_string());
        }
    }
    None
}

fn make_damage_to_recount(recount_table: &Value, locale: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Some(groups) = recount_table.as_object() else {
        return out;
    };

    for group in groups.values() {
        let Some(ids) = group.get("DamageId").and_then(Value::as_array) else {
            continue;
        };
        let Some(label) = named_text(Some(group), locale) else {
            continue;
        };
        for id in ids {
            if let Some(id) = id.as_i64() {
                out.insert(id.to_string(), label.clone());
            }
        }
    }
    out
}

fn resolve_observed_name(
    skill_key: i64,
    monster_damage: bool,
    locale: &str,
    runtime: &RuntimeCoverage,
    damage_attr: &Value,
    skill_details: &Value,
    damage_to_recount: &HashMap<String, String>,
) -> (Option<String>, String, Option<String>, bool, String) {
    let key = skill_key.to_string();
    let entry = damage_attr.get(&key);
    let detail = skill_details.get(&key);
    let design_name = design_damage_name(entry, detail);

    if runtime.damage_overrides.contains(&key) {
        return (
            design_name,
            key,
            Some("runtime-damage-id-override".to_string()),
            false,
            "covered by runtime damage override".to_string(),
        );
    }

    if monster_damage {
        if let Some(name) = design_name.as_deref() {
            if let Some(covered_by) = monster_skill_coverage(name, runtime) {
                return (
                    design_name.clone(),
                    name.to_string(),
                    Some(covered_by),
                    false,
                    "covered by runtime monster skill fallback".to_string(),
                );
            }
        }
    }

    if let Some(recount_name) = damage_to_recount.get(&key) {
        let safe = is_safe_visible_text(recount_name, locale);
        return (
            design_name,
            recount_name.clone(),
            safe.then(|| "recount-damage-id-bridge".to_string()),
            !safe,
            if safe {
                "covered by recount damage bridge".to_string()
            } else {
                "recount bridge label is not safe for target locale".to_string()
            },
        );
    }

    if let Some(generated) = named_text(entry, locale) {
        let safe = is_safe_visible_text(&generated, locale);
        if !safe && !monster_damage {
            if let Some(name) = design_name.clone() {
                if let Some(covered_by) = monster_skill_coverage(&name, runtime) {
                    return (
                        design_name,
                        name,
                        Some(covered_by),
                        false,
                        "covered by post-locale design fallback".to_string(),
                    );
                }
            }
        }
        return (
            design_name,
            generated,
            safe.then(|| "generated-damage-locale".to_string()),
            !safe,
            if safe {
                "covered by generated damage locale".to_string()
            } else {
                "generated damage label is missing target-locale text".to_string()
            },
        );
    }

    if let Some(name) = design_name.clone() {
        return (
            design_name,
            name.clone(),
            None,
            !is_safe_visible_text(&name, locale),
            "fell back to design damage name".to_string(),
        );
    }

    (
        None,
        format!("Unknown ({skill_key})"),
        None,
        true,
        "no generated label found for observed skillKey".to_string(),
    )
}

fn sample_set<T: Clone + Ord>(set: &BTreeSet<T>, limit: usize) -> Vec<T> {
    set.iter().take(limit).cloned().collect()
}

fn entity_name(entity: Option<&Entity>, fallback_uid: i64) -> String {
    entity
        .and_then(|entity| (!entity.name.trim().is_empty()).then(|| entity.name.clone()))
        .unwrap_or_else(|| format!("UID {fallback_uid}"))
}

fn observe_damage(
    observed: &mut BTreeMap<(i64, bool), ObservedDeathSkill>,
    damage: &DamageSnapshot,
    encounter_id: i32,
    scene_name: &str,
    victim_name: &str,
    source_name: &str,
) {
    let monster_damage = damage.attacker_monster_type_id.is_some();
    let entry = observed
        .entry((damage.skill_key, monster_damage))
        .or_insert_with(|| ObservedDeathSkill {
            skill_key: damage.skill_key,
            monster_damage,
            ..Default::default()
        });
    entry.total_value = entry.total_value.saturating_add(damage.value);
    entry.hits += 1;
    entry.encounter_ids.insert(encounter_id);
    entry.scenes.insert(scene_name.to_string());
    entry.victims.insert(victim_name.to_string());
    entry.sources.insert(source_name.to_string());
    if let Some(monster_type_id) = damage.attacker_monster_type_id {
        entry.attacker_monster_type_ids.insert(monster_type_id);
    }
}

fn write_markdown(
    report: &AuditReport,
    out_md: &PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut lines = Vec::new();
    lines.push("# Death Replay Localization Audit".to_string());
    lines.push(String::new());
    lines.push(format!("- Database: `{}`", report.database));
    lines.push(format!(
        "- Latest encounters scanned: {}",
        report.latest_limit
    ));
    lines.push(format!("- Encounter offset: {}", report.offset));
    lines.push(format!(
        "- Encounters with death replays: {}",
        report.encounters_with_deaths
    ));
    lines.push(format!(
        "- Observed death replay skill keys: {}",
        report.observed_skill_count
    ));
    lines.push(format!(
        "- Needs localization: {}",
        report.needs_localization_count
    ));
    lines.push(String::new());
    lines.push("| Skill Key | Hits | Design Name | Resolved | Samples | Reason |".to_string());
    lines.push("|---:|---:|---|---|---|---|".to_string());
    for row in report.rows.iter().filter(|row| row.needs_localization) {
        let samples = row
            .sample_sources
            .iter()
            .chain(row.sample_scenes.iter())
            .take(4)
            .cloned()
            .collect::<Vec<_>>()
            .join("; ");
        lines.push(format!(
            "| {} | {} | {} | {} | {} | {} |",
            row.skill_key,
            row.hits,
            row.design_name.as_deref().unwrap_or(""),
            row.resolved_name,
            samples,
            row.reason,
        ));
    }
    if report.needs_localization_count == 0 {
        lines.push("| | | | | | No observed death replay gaps in this scan. |".to_string());
    }
    fs::write(out_md, lines.join("\n"))?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let options = parse_options().map_err(|err| format!("argument error: {err}"))?;
    let db_path = options.db_path.unwrap_or_else(default_db_path);
    let db_label = db_path.to_string_lossy().to_string();
    let mut conn = diesel::sqlite::SqliteConnection::establish(&db_label)?;
    let query = format!(
        "SELECT e.id, e.scene_name, ed.data
         FROM encounters e
         INNER JOIN encounter_data ed ON ed.encounter_id = e.id
         WHERE e.ended_at_ms IS NOT NULL
         ORDER BY e.started_at_ms DESC, e.id DESC
         LIMIT {} OFFSET {}",
        options.latest, options.offset,
    );
    let encounters: Vec<EncounterBlob> = diesel::sql_query(query).load(&mut conn)?;

    let runtime = load_runtime_coverage();
    let damage_attr = read_generated_json("DamageAttrIdName.json");
    let skill_details = read_generated_json("SkillBreakdownDetails.json");
    let recount_table = read_generated_json("RecountTable.json");
    let damage_to_recount = make_damage_to_recount(&recount_table, &options.locale);

    let mut observed = BTreeMap::<(i64, bool), ObservedDeathSkill>::new();
    let mut decode_failures = Vec::new();
    let mut encounters_with_deaths = 0usize;

    for encounter in &encounters {
        let scene_name = encounter
            .scene_name
            .clone()
            .unwrap_or_else(|| "Unknown Scene".to_string());
        let decompressed = match zstd::decode_all(&encounter.data[..]) {
            Ok(bytes) => bytes,
            Err(err) => {
                decode_failures.push(format!("{}: zstd decode failed: {err}", encounter.id));
                continue;
            }
        };
        let entities = match rmp_serde::from_slice::<HashMap<i64, Entity>>(&decompressed) {
            Ok(entities) => entities,
            Err(err) => {
                decode_failures.push(format!("{}: msgpack decode failed: {err}", encounter.id));
                continue;
            }
        };

        let mut had_death = false;
        for (victim_uid, entity) in &entities {
            if entity.deaths.is_empty() {
                continue;
            }
            had_death = true;
            let victim_name = entity_name(Some(entity), *victim_uid);
            for death in &entity.deaths {
                for damage in &death.recent_damages {
                    let source_name =
                        entity_name(entities.get(&damage.attacker_uid), damage.attacker_uid);
                    observe_damage(
                        &mut observed,
                        damage,
                        encounter.id,
                        &scene_name,
                        &victim_name,
                        &source_name,
                    );
                }
            }
        }
        if had_death {
            encounters_with_deaths += 1;
        }
    }

    let mut rows = observed
        .values()
        .map(|entry| {
            let (design_name, resolved_name, covered_by, needs_localization, reason) =
                resolve_observed_name(
                    entry.skill_key,
                    entry.monster_damage,
                    &options.locale,
                    &runtime,
                    &damage_attr,
                    &skill_details,
                    &damage_to_recount,
                );
            ReportRow {
                skill_key: entry.skill_key,
                monster_damage: entry.monster_damage,
                total_value: entry.total_value.to_string(),
                hits: entry.hits,
                encounter_count: entry.encounter_ids.len(),
                sample_encounter_ids: sample_set(&entry.encounter_ids, 10),
                sample_scenes: sample_set(&entry.scenes, 5),
                sample_victims: sample_set(&entry.victims, 8),
                sample_sources: sample_set(&entry.sources, 8),
                attacker_monster_type_ids: sample_set(&entry.attacker_monster_type_ids, 8),
                design_name,
                resolved_name,
                covered_by,
                needs_localization,
                reason,
            }
        })
        .collect::<Vec<_>>();

    rows.sort_by(|left, right| {
        right
            .needs_localization
            .cmp(&left.needs_localization)
            .then_with(|| right.hits.cmp(&left.hits))
            .then_with(|| left.skill_key.cmp(&right.skill_key))
    });

    let needs_localization_count = rows.iter().filter(|row| row.needs_localization).count();
    let report = AuditReport {
        database: db_label,
        latest_limit: options.latest,
        offset: options.offset,
        locale: options.locale,
        encounters_scanned: encounters.len(),
        encounters_with_deaths,
        decode_failures,
        observed_skill_count: rows.len(),
        needs_localization_count,
        rows,
    };

    let out_json = options.out_json.unwrap_or_else(default_out_json);
    let out_md = options.out_md.unwrap_or_else(default_out_md);
    if let Some(parent) = out_json.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&out_json, serde_json::to_vec_pretty(&report)?)?;
    write_markdown(&report, &out_md)?;

    println!(
        "Scanned {} encounters, found {} death replay skill keys, {} need localization. Wrote {} and {}",
        report.encounters_scanned,
        report.observed_skill_count,
        report.needs_localization_count,
        out_json.display(),
        out_md.display()
    );
    Ok(())
}
