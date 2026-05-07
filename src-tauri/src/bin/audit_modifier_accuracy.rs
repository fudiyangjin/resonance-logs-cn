use diesel::prelude::*;
use diesel::sql_types::{BigInt, Binary, Double, Integer, Nullable, Text};
use resonance_logs_lib::live::opcodes_models::{Entity, ObservedModifierHitBucket};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const IGNORED_MODIFIER_BUFF_IDS: [i64; 2] = [
    510072, // Hero dungeon wipe recovery: refill HP + clear cooldowns.
    900122, // Encounter reset utility: refill HP + clear cooldowns.
];

#[derive(Debug, Clone)]
struct Options {
    db_path: PathBuf,
    latest: usize,
    encounter_id: Option<i32>,
    player_uid: Option<i64>,
    max_rows: usize,
    out_json: PathBuf,
    out_md: PathBuf,
}

#[derive(QueryableByName)]
struct EncounterBlob {
    #[diesel(sql_type = Integer)]
    id: i32,
    #[diesel(sql_type = BigInt)]
    started_at_ms: i64,
    #[diesel(sql_type = Nullable<BigInt>)]
    ended_at_ms: Option<i64>,
    #[diesel(sql_type = Nullable<Text>)]
    scene_name: Option<String>,
    #[diesel(sql_type = Double)]
    duration: f64,
    #[diesel(sql_type = Binary)]
    data: Vec<u8>,
}

#[derive(Default)]
struct GeneratedIndex {
    damage_formula_id: String,
    damage_formula_status: String,
    damage_formula_expression: String,
    effect_sources_by_id: HashMap<String, Value>,
    buff_id_to_effect_source_ids: HashMap<String, Vec<String>>,
    damage_id_to_effect_source_ids: HashMap<String, Vec<String>>,
    factors_by_buff_id: HashMap<String, Value>,
    damage_id_to_factor_buff_ids: HashMap<String, Vec<i64>>,
    buff_names_by_id: HashMap<i64, Value>,
    skill_details: HashMap<String, Value>,
    recount_by_damage_id: HashMap<i64, String>,
}

#[derive(Debug, Clone)]
struct SourceMeta {
    source_id: String,
    label: String,
    source_kind: String,
    source_type: String,
    status: String,
    confidence: Option<String>,
    formula_term_ids: BTreeSet<String>,
    contribution_groups: BTreeSet<String>,
    predicate_tags: BTreeSet<String>,
    required_evidence: BTreeSet<String>,
    generated: bool,
}

#[derive(Default)]
struct SkillAgg {
    skill_key: i64,
    damage_id: i64,
    label: String,
    total_value: f64,
    effective_total_value: f64,
    hits: f64,
    crit_hits: f64,
    lucky_hits: f64,
}

struct SourceAgg {
    encounter_id: i32,
    scene_name: String,
    started_at_ms: i64,
    player_uid: i64,
    player_name: String,
    class_id: i32,
    class_spec: String,
    player_total: f64,
    player_effective_total: f64,
    player_hits: f64,
    source: SourceMeta,
    modifier_base_ids: BTreeSet<i64>,
    modifier_source_config_ids: BTreeSet<i64>,
    modifier_source_uids: BTreeSet<i64>,
    modifier_host_uids: BTreeSet<i64>,
    external_source_uids: BTreeSet<i64>,
    evidence_present: BTreeSet<String>,
    required_evidence: BTreeSet<String>,
    missing_evidence: BTreeSet<String>,
    window_keys: BTreeSet<String>,
    windows: Vec<(i64, i64)>,
    raw_bucket_rows: usize,
    deduped_bucket_rows: usize,
    duplicate_bucket_rows: usize,
    raw_total_value: f64,
    raw_effective_total_value: f64,
    raw_hits: f64,
    total_value: f64,
    effective_total_value: f64,
    hits: f64,
    crit_hits: f64,
    lucky_hits: f64,
    skill_rows: BTreeMap<String, SkillAgg>,
    bucket_identities: HashSet<String>,
    damage_linked_source_ids: BTreeSet<String>,
    warnings: BTreeSet<String>,
}

#[derive(Serialize)]
struct Report {
    generated_at: String,
    db_path: String,
    formula: FormulaSummary,
    options: ReportOptions,
    totals: Totals,
    readiness_counts: BTreeMap<String, usize>,
    top_missing_evidence: Vec<MissingEvidenceRow>,
    player_summaries: Vec<PlayerSummary>,
    source_rows: Vec<SourceRow>,
    duplicate_pressure_rows: Vec<SourceRow>,
    zero_hit_rows: Vec<SourceRow>,
    decode_failures: Vec<DecodeFailure>,
    notes: Vec<String>,
}

#[derive(Serialize)]
struct FormulaSummary {
    id: String,
    status: String,
    expression: String,
}

#[derive(Serialize)]
struct ReportOptions {
    latest: usize,
    encounter_id: Option<i32>,
    player_uid: Option<i64>,
    max_rows: usize,
}

#[derive(Default, Serialize)]
struct Totals {
    encounters_scanned: usize,
    entities_scanned: usize,
    entities_with_modifier_buckets: usize,
    modifier_bucket_rows: usize,
    modifier_bucket_rows_with_hits: usize,
    source_rows: usize,
    zero_hit_source_rows: usize,
    rows_with_duplicate_pressure: usize,
    rows_over_player_total: usize,
    rows_missing_generated_source: usize,
}

#[derive(Serialize)]
struct MissingEvidenceRow {
    evidence: String,
    rows: usize,
}

#[derive(Serialize)]
struct PlayerSummary {
    encounter_id: i32,
    scene_name: String,
    player_uid: i64,
    player_name: String,
    class_id: i32,
    class_spec: String,
    player_total: f64,
    player_hits: f64,
    source_rows: usize,
    modifier_bucket_rows: usize,
    observed_overlap_total: f64,
    observed_overlap_hits: f64,
    observed_overlap_damage_multiplier: f64,
    observed_overlap_hit_multiplier: f64,
    zero_hit_source_rows: usize,
    duplicate_bucket_rows: usize,
}

#[derive(Serialize, Clone)]
struct SourceRow {
    encounter_id: i32,
    scene_name: String,
    started_at_ms: i64,
    player_uid: i64,
    player_name: String,
    class_id: i32,
    class_spec: String,
    source_id: String,
    source_label: String,
    source_kind: String,
    source_type: String,
    generated_status: String,
    confidence: Option<String>,
    readiness: String,
    modifier_base_ids: Vec<i64>,
    modifier_source_config_ids: Vec<i64>,
    modifier_source_uids: Vec<i64>,
    modifier_host_uids: Vec<i64>,
    external_source_uids: Vec<i64>,
    player_total: f64,
    player_effective_total: f64,
    player_hits: f64,
    observed_total: f64,
    observed_effective_total: f64,
    observed_hits: f64,
    raw_observed_total: f64,
    raw_observed_hits: f64,
    duplicate_bucket_rows: usize,
    observed_damage_pct_of_player: f64,
    observed_hit_pct_of_player: f64,
    coverage_pct: f64,
    crit_rate: f64,
    lucky_rate: f64,
    formula_term_ids: Vec<String>,
    contribution_groups: Vec<String>,
    predicate_tags: Vec<String>,
    evidence_present: Vec<String>,
    required_evidence: Vec<String>,
    missing_evidence: Vec<String>,
    damage_linked_source_ids: Vec<String>,
    warnings: Vec<String>,
    top_skills: Vec<SkillRow>,
}

#[derive(Serialize, Clone)]
struct SkillRow {
    skill_key: i64,
    damage_id: i64,
    label: String,
    observed_total: f64,
    observed_effective_total: f64,
    observed_hits: f64,
    crit_rate: f64,
    lucky_rate: f64,
}

#[derive(Serialize)]
struct DecodeFailure {
    encounter_id: i32,
    error: String,
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
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf()
}

fn generated_path(name: &str) -> PathBuf {
    repo_root().join("parser-data").join("generated").join(name)
}

fn logic_path(name: &str) -> PathBuf {
    repo_root().join("parser-data").join("logic").join(name)
}

fn default_out_json() -> PathBuf {
    repo_root()
        .join("DEV_exports")
        .join("modifier-accuracy-audit.json")
}

fn default_out_md() -> PathBuf {
    repo_root()
        .join("DEV_exports")
        .join("modifier-accuracy-audit.md")
}

fn parse_args() -> Result<Options, String> {
    let mut options = Options {
        db_path: default_db_path(),
        latest: 40,
        encounter_id: None,
        player_uid: None,
        max_rows: 160,
        out_json: default_out_json(),
        out_md: default_out_md(),
    };

    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut index = 0usize;
    while index < args.len() {
        let arg = &args[index];
        let mut next = || -> Result<String, String> {
            index += 1;
            args.get(index)
                .cloned()
                .ok_or_else(|| format!("Missing value for {arg}"))
        };
        match arg.as_str() {
            "--db" => options.db_path = PathBuf::from(next()?),
            "--latest" => {
                options.latest = next()?
                    .parse()
                    .map_err(|_| "--latest must be a number".to_string())?
            }
            "--encounter-id" => {
                options.encounter_id = Some(
                    next()?
                        .parse()
                        .map_err(|_| "--encounter-id must be a number".to_string())?,
                )
            }
            "--player-uid" => {
                options.player_uid = Some(
                    next()?
                        .parse()
                        .map_err(|_| "--player-uid must be a number".to_string())?,
                )
            }
            "--max-rows" => {
                options.max_rows = next()?
                    .parse()
                    .map_err(|_| "--max-rows must be a number".to_string())?
            }
            "--out-json" => options.out_json = PathBuf::from(next()?),
            "--out-md" => options.out_md = PathBuf::from(next()?),
            "--help" | "-h" => {
                println!(
                    "Modifier Accuracy Audit\n\n\
Usage:\n  cargo run --bin audit_modifier_accuracy -- [options]\n\n\
Options:\n  --db <path>             SQLite DB path. Default: {}\n  \
--latest <count>        Recent encounters to scan. Default: 40\n  \
--encounter-id <id>     Scan one encounter id.\n  \
--player-uid <uid>      Restrict to one player/entity uid.\n  \
--max-rows <count>      Max rows per report section. Default: 160\n  \
--out-json <path>       JSON report path. Default: DEV_exports/modifier-accuracy-audit.json\n  \
--out-md <path>         Markdown report path. Default: DEV_exports/modifier-accuracy-audit.md\n\n\
Notes:\n  This audit reports observed overlap and replay readiness. It does not compute net-added damage yet.",
                    default_db_path().display()
                );
                std::process::exit(0);
            }
            _ => return Err(format!("Unknown option: {arg}")),
        }
        index += 1;
    }

    Ok(options)
}

fn read_json(path: PathBuf) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn as_object_map(value: &Value, key: &str) -> HashMap<String, Value> {
    value
        .get(key)
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect()
        })
        .unwrap_or_default()
}

fn as_string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn as_i64_array(value: Option<&Value>) -> Vec<i64> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_i64).collect())
        .unwrap_or_default()
}

fn localized_string(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        return (!trimmed.is_empty()).then(|| trimmed.to_string());
    }
    let object = value.as_object()?;
    for key in ["en", "zh-CN", "zh-TW", "design"] {
        if let Some(text) = object.get(key).and_then(Value::as_str) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    object.values().find_map(|item| {
        item.as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    })
}

fn value_label(row: &Value, fallback: &str) -> String {
    localized_string(row.get("sourceNames"))
        .or_else(|| localized_string(row.get("familyNames")))
        .or_else(|| localized_string(row.get("DisplayNames")))
        .or_else(|| localized_string(row.get("DamageNames")))
        .or_else(|| localized_string(row.get("Names")))
        .or_else(|| localized_string(row.get("sourceName")))
        .or_else(|| localized_string(row.get("familyName")))
        .or_else(|| localized_string(row.get("DisplayName")))
        .or_else(|| localized_string(row.get("DamageName")))
        .or_else(|| localized_string(row.get("Name")))
        .unwrap_or_else(|| fallback.to_string())
}

fn generated_index() -> Result<GeneratedIndex, Box<dyn std::error::Error>> {
    let damage_formula = read_json(logic_path("DamageFormula.json"))?;
    let effect_sources = read_json(generated_path("EffectSources.json"))?;
    let factors = read_json(generated_path("SeasonPhantomFactors.json"))?;
    let buff_names = read_json(generated_path("BuffName.json"))?;
    let skill_details = read_json(generated_path("SkillBreakdownDetails.json"))?;
    let recount = read_json(generated_path("RecountTable.json"))?;

    let mut index = GeneratedIndex {
        damage_formula_id: damage_formula
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        damage_formula_status: damage_formula
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        damage_formula_expression: damage_formula
            .get("formula")
            .and_then(|value| value.get("perHitExpression"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        effect_sources_by_id: as_object_map(&effect_sources, "effectSourcesById"),
        buff_id_to_effect_source_ids: HashMap::new(),
        damage_id_to_effect_source_ids: HashMap::new(),
        factors_by_buff_id: as_object_map(&factors, "factorsByBuffId"),
        damage_id_to_factor_buff_ids: HashMap::new(),
        buff_names_by_id: HashMap::new(),
        skill_details: skill_details
            .as_object()
            .map(|map| {
                map.iter()
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect()
            })
            .unwrap_or_default(),
        recount_by_damage_id: HashMap::new(),
    };

    for (buff_id, value) in as_object_map(&effect_sources, "buffIdToEffectSourceIds") {
        index
            .buff_id_to_effect_source_ids
            .insert(buff_id, as_string_array(Some(&value)));
    }
    for (damage_id, value) in as_object_map(&effect_sources, "damageIdToEffectSourceIds") {
        index
            .damage_id_to_effect_source_ids
            .insert(damage_id, as_string_array(Some(&value)));
    }
    for (damage_id, value) in as_object_map(&factors, "damageIdToFactorBuffIds") {
        index
            .damage_id_to_factor_buff_ids
            .insert(damage_id, as_i64_array(Some(&value)));
    }

    for row in buff_names.as_array().into_iter().flatten() {
        if let Some(id) = row
            .get("Id")
            .or_else(|| row.get("id"))
            .and_then(Value::as_i64)
        {
            index.buff_names_by_id.insert(id, row.clone());
        }
    }

    if let Some(recount_rows) = recount.as_object() {
        for (recount_id, row) in recount_rows {
            let label = value_label(row, &format!("Recount {recount_id}"));
            for damage_id in as_i64_array(row.get("DamageId")) {
                index
                    .recount_by_damage_id
                    .entry(damage_id)
                    .or_insert(label.clone());
            }
        }
    }

    Ok(index)
}

fn collect_model_strings(model: Option<&Value>, key: &str) -> BTreeSet<String> {
    let mut values = BTreeSet::new();
    if let Some(model) = model {
        for item in as_string_array(model.get(key)) {
            values.insert(item);
        }
        for component in model
            .get("components")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            for item in as_string_array(component.get(key)) {
                values.insert(item);
            }
        }
    }
    values
}

fn source_meta(index: &GeneratedIndex, source_id: &str) -> SourceMeta {
    if let Some(row) = index.effect_sources_by_id.get(source_id) {
        let model = row.get("attributionModel");
        let mut required_evidence = collect_model_strings(model, "requiredRuntimeEvidence");
        required_evidence.insert("modifier windows".to_string());
        required_evidence.insert("observed final hit value".to_string());
        required_evidence.insert("damage id".to_string());
        return SourceMeta {
            source_id: source_id.to_string(),
            label: value_label(row, source_id),
            source_kind: row
                .get("sourceKind")
                .and_then(Value::as_str)
                .unwrap_or("effect-source")
                .to_string(),
            source_type: row
                .get("sourceType")
                .and_then(Value::as_str)
                .unwrap_or("generated")
                .to_string(),
            status: model
                .and_then(|value| value.get("status"))
                .and_then(Value::as_str)
                .unwrap_or("generated")
                .to_string(),
            confidence: model
                .and_then(|value| value.get("confidence"))
                .and_then(Value::as_str)
                .map(str::to_string),
            formula_term_ids: collect_model_strings(model, "formulaTermIds"),
            contribution_groups: collect_model_strings(model, "contributionGroups"),
            predicate_tags: collect_model_strings(model, "predicateTags"),
            required_evidence,
            generated: true,
        };
    }

    if let Some(buff_id) = source_id.strip_prefix("phantom-factor:") {
        if let Some(row) = index.factors_by_buff_id.get(buff_id) {
            let mut required_evidence = BTreeSet::new();
            required_evidence.insert("modifier windows".to_string());
            required_evidence.insert("observed final hit value".to_string());
            required_evidence.insert("damage id".to_string());
            required_evidence.insert("modifier to formula-term classification".to_string());
            return SourceMeta {
                source_id: source_id.to_string(),
                label: value_label(row, source_id),
                source_kind: "phantom-factor".to_string(),
                source_type: "season-phantom-factor".to_string(),
                status: "uptime-only".to_string(),
                confidence: Some("low".to_string()),
                formula_term_ids: BTreeSet::new(),
                contribution_groups: BTreeSet::new(),
                predicate_tags: BTreeSet::new(),
                required_evidence,
                generated: true,
            };
        }
    }

    let buff_id = source_id
        .strip_prefix("active-buff:")
        .and_then(|value| value.parse::<i64>().ok());
    let label = buff_id
        .and_then(|id| {
            index
                .buff_names_by_id
                .get(&id)
                .map(|row| value_label(row, source_id))
        })
        .unwrap_or_else(|| source_id.to_string());
    let mut required_evidence = BTreeSet::new();
    required_evidence.insert("generated effect-source bridge".to_string());
    SourceMeta {
        source_id: source_id.to_string(),
        label,
        source_kind: "active-buff".to_string(),
        source_type: "runtime-only".to_string(),
        status: "runtime-only".to_string(),
        confidence: Some("low".to_string()),
        formula_term_ids: BTreeSet::new(),
        contribution_groups: BTreeSet::new(),
        predicate_tags: BTreeSet::new(),
        required_evidence,
        generated: false,
    }
}

fn is_ignored_modifier_buff_id(id: i64) -> bool {
    IGNORED_MODIFIER_BUFF_IDS.contains(&id)
}

fn positive_id(value: i64) -> Option<i64> {
    (value > 0).then_some(value)
}

fn has_primary_buff_name(index: &GeneratedIndex, buff_id: i64) -> bool {
    index
        .buff_names_by_id
        .get(&buff_id)
        .and_then(|row| {
            localized_string(row.get("Names")).or_else(|| localized_string(row.get("Name")))
        })
        .is_some()
}

fn lookup_default_buff_name(index: &GeneratedIndex, buff_id: i64) -> Option<String> {
    index
        .buff_names_by_id
        .get(&buff_id)
        .map(|row| value_label(row, &format!("Active Buff {buff_id}")))
}

fn mapped_sources_for_buff(index: &GeneratedIndex, buff_id: i64) -> Vec<String> {
    let mut result = index
        .buff_id_to_effect_source_ids
        .get(&buff_id.to_string())
        .cloned()
        .unwrap_or_default();
    if result.is_empty() && index.factors_by_buff_id.contains_key(&buff_id.to_string()) {
        result.push(format!("phantom-factor:{buff_id}"));
    }
    result
}

fn has_known_buff_source(index: &GeneratedIndex, buff_id: i64) -> bool {
    !mapped_sources_for_buff(index, buff_id).is_empty()
        || lookup_default_buff_name(index, buff_id).is_some()
}

fn preferred_observed_buff_source_id(
    index: &GeneratedIndex,
    base_id: i64,
    source_config_id: Option<i64>,
) -> i64 {
    let Some(source_config_id) = source_config_id else {
        return base_id;
    };
    if source_config_id == base_id || is_ignored_modifier_buff_id(source_config_id) {
        return base_id;
    }
    if !has_known_buff_source(index, source_config_id) {
        return base_id;
    }
    let base_name = lookup_default_buff_name(index, base_id);
    let source_name = lookup_default_buff_name(index, source_config_id);
    if !has_primary_buff_name(index, base_id) || source_name == base_name {
        return source_config_id;
    }
    base_id
}

fn source_ids_for_bucket(
    index: &GeneratedIndex,
    bucket: &ObservedModifierHitBucket,
) -> Vec<String> {
    let Some(base_id) = positive_id(bucket.modifier_base_id as i64) else {
        return Vec::new();
    };
    if is_ignored_modifier_buff_id(base_id) {
        return Vec::new();
    }
    let source_config_id = bucket
        .modifier_source_config_id
        .and_then(|id| positive_id(id as i64));
    if source_config_id.is_some_and(is_ignored_modifier_buff_id) {
        return Vec::new();
    }

    let preferred_id = preferred_observed_buff_source_id(index, base_id, source_config_id);
    if is_ignored_modifier_buff_id(preferred_id) {
        return Vec::new();
    }

    let mut ids = mapped_sources_for_buff(index, preferred_id);
    if ids.is_empty() && source_config_id != Some(preferred_id) {
        if let Some(source_config_id) = source_config_id {
            ids = mapped_sources_for_buff(index, source_config_id);
        }
    }
    if ids.is_empty() {
        ids.push(format!("active-buff:{preferred_id}"));
    }
    ids.sort();
    ids.dedup();
    ids
}

fn has_formula_classification(meta: &SourceMeta) -> bool {
    !meta.formula_term_ids.is_empty() || !meta.contribution_groups.is_empty()
}

fn row_has_coefficient_data(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, value)| {
            let key = key.to_ascii_lowercase();
            key.contains("multiplier")
                || key.contains("coefficient")
                || key.contains("formula")
                || key.contains("flatdamage")
                || key.contains("flat_damage")
                || row_has_coefficient_data(value)
        }),
        Value::Array(items) => items.iter().any(row_has_coefficient_data),
        _ => false,
    }
}

fn skill_has_coefficient_data(index: &GeneratedIndex, damage_id: i64) -> bool {
    index
        .skill_details
        .get(&damage_id.to_string())
        .is_some_and(row_has_coefficient_data)
}

fn evidence_for_bucket(
    bucket: &ObservedModifierHitBucket,
    meta: &SourceMeta,
    index: &GeneratedIndex,
) -> BTreeSet<String> {
    let mut evidence = BTreeSet::new();
    if bucket.total_value > 0 {
        evidence.insert("observed final hit value".to_string());
        evidence.insert("damage hit value".to_string());
    }
    if bucket.effective_total_value > 0 {
        evidence.insert("effective damage value".to_string());
    }
    if bucket.skill_key > 0 {
        evidence.insert("skill key".to_string());
    }
    if bucket.damage_id > 0 {
        evidence.insert("damage id".to_string());
        evidence.insert("produced damage row id".to_string());
    }
    if bucket.target_uid > 0 {
        evidence.insert("target uid".to_string());
    }
    if bucket.target_monster_type_id.is_some() {
        evidence.insert("target monster config id".to_string());
        evidence.insert("target predicate evaluation, such as elite-or-stronger".to_string());
    }
    if bucket.attacker_uid > 0 {
        evidence.insert("attacker uid".to_string());
    }
    if bucket.original_attacker_uid > 0 {
        evidence.insert("original attacker uid".to_string());
    }
    if bucket.top_summoner_uid.is_some_and(|uid| uid > 0) {
        evidence.insert("top summoner uid".to_string());
        evidence.insert("source predicate evaluation, such as companion or summon".to_string());
    }
    if bucket.property.is_some() {
        evidence.insert("damage element mapping by damage id".to_string());
    }
    if bucket.damage_mode.is_some() {
        evidence.insert("damage mode".to_string());
    }
    if bucket.modifier_start_time_ms > 0 {
        evidence.insert("modifier windows".to_string());
    }
    if bucket.crit_hits > 0 || bucket.hits > 0 {
        evidence.insert("crit aggregate only".to_string());
    }
    if bucket.lucky_hits > 0 || bucket.hits > 0 {
        evidence.insert("lucky aggregate only".to_string());
    }
    if has_formula_classification(meta) {
        evidence.insert("modifier to formula-term classification".to_string());
    }
    if skill_has_coefficient_data(index, bucket.damage_id) {
        evidence.insert("skill coefficient mapping by damage id".to_string());
    }
    evidence
}

fn skill_label(index: &GeneratedIndex, skill_key: i64, damage_id: i64) -> String {
    for id in [skill_key, damage_id] {
        if let Some(row) = index.skill_details.get(&id.to_string()) {
            let label = value_label(row, "");
            if !label.is_empty() {
                return label;
            }
        }
        if let Some(label) = index.recount_by_damage_id.get(&id) {
            return label.clone();
        }
    }
    format!("Damage {damage_id}")
}

fn bucket_identity_key(bucket: &ObservedModifierHitBucket) -> String {
    [
        bucket.skill_key.to_string(),
        bucket.damage_id.to_string(),
        bucket.owner_id.to_string(),
        bucket
            .owner_level
            .map(|value| value.to_string())
            .unwrap_or_default(),
        bucket
            .hit_event_id
            .map(|value| value.to_string())
            .unwrap_or_default(),
        bucket
            .damage_source
            .map(|value| value.to_string())
            .unwrap_or_default(),
        bucket
            .property
            .map(|value| value.to_string())
            .unwrap_or_default(),
        bucket
            .damage_mode
            .map(|value| value.to_string())
            .unwrap_or_default(),
        bucket.attacker_uid.to_string(),
        bucket.original_attacker_uid.to_string(),
        bucket
            .top_summoner_uid
            .map(|value| value.to_string())
            .unwrap_or_default(),
        bucket.target_uid.to_string(),
        bucket
            .target_monster_type_id
            .map(|value| value.to_string())
            .unwrap_or_default(),
        if bucket.is_heal { "heal" } else { "damage" }.to_string(),
        bucket.hits.to_string(),
        bucket.total_value.to_string(),
        bucket.effective_total_value.to_string(),
        bucket.first_hit_time_ms.to_string(),
        bucket.last_hit_time_ms.to_string(),
    ]
    .join(":")
}

fn bucket_interval(
    bucket: &ObservedModifierHitBucket,
    encounter: &EncounterBlob,
) -> Option<(i64, i64)> {
    let start = bucket.modifier_start_time_ms;
    let mut end = bucket.modifier_end_time_ms.unwrap_or_else(|| {
        if bucket.modifier_duration > 0 {
            start + bucket.modifier_duration as i64
        } else {
            encounter
                .ended_at_ms
                .unwrap_or(start + (encounter.duration.max(0.0) * 1000.0) as i64)
        }
    });
    if end <= start {
        end = bucket.last_hit_time_ms.max(start);
    }
    (end > start).then_some((start, end))
}

fn coverage_pct(windows: &[(i64, i64)], encounter: &EncounterBlob) -> f64 {
    let encounter_start = encounter.started_at_ms;
    let encounter_end = encounter
        .ended_at_ms
        .unwrap_or_else(|| encounter_start + (encounter.duration.max(0.0) * 1000.0) as i64);
    let duration_ms = (encounter_end - encounter_start).max(1);
    let mut intervals: Vec<(i64, i64)> = windows
        .iter()
        .map(|(start, end)| ((*start).max(encounter_start), (*end).min(encounter_end)))
        .filter(|(start, end)| end > start)
        .collect();
    intervals.sort();

    let mut covered = 0i64;
    let mut active: Option<(i64, i64)> = None;
    for (start, end) in intervals {
        match active {
            None => active = Some((start, end)),
            Some((active_start, active_end)) if start <= active_end => {
                active = Some((active_start, active_end.max(end)));
            }
            Some((active_start, active_end)) => {
                covered += active_end - active_start;
                active = Some((start, end));
            }
        }
    }
    if let Some((start, end)) = active {
        covered += end - start;
    }
    ((covered as f64 / duration_ms as f64) * 100.0).clamp(0.0, 100.0)
}

fn pct(part: f64, total: f64) -> f64 {
    if total > 0.0 && part.is_finite() {
        (part / total) * 100.0
    } else {
        0.0
    }
}

fn rate(part: f64, total: f64) -> f64 {
    pct(part, total)
}

fn u128_to_f64(value: u128) -> f64 {
    value as f64
}

fn missing_evidence(required: &BTreeSet<String>, present: &BTreeSet<String>) -> BTreeSet<String> {
    required
        .iter()
        .filter(|item| !present.contains(*item))
        .cloned()
        .collect()
}

fn classify_readiness(
    meta: &SourceMeta,
    missing: &BTreeSet<String>,
    hits: f64,
    total_value: f64,
) -> String {
    if hits <= 0.0 || total_value <= 0.0 {
        return "no-hit-observation".to_string();
    }
    if meta.status == "defensive-or-non-damage" {
        return "not-offensive-damage".to_string();
    }
    if meta.status == "timing-only" {
        return "timing-only".to_string();
    }
    if meta.status == "proc-damage" {
        return "proc-damage".to_string();
    }
    if missing.contains("generated effect-source bridge") {
        return "missing-generated-source".to_string();
    }
    if missing.contains("attacker stat snapshot at hit time")
        || missing.contains("target resistance or defense snapshot at hit time")
    {
        return "missing-runtime-stat-snapshot".to_string();
    }
    if missing.contains("skill coefficient mapping by damage id") {
        return "missing-skill-coefficient".to_string();
    }
    if missing
        .iter()
        .any(|item| item.contains("predicate evaluation"))
    {
        return "needs-predicate-evidence".to_string();
    }
    if missing.contains("modifier to formula-term classification") {
        return "uptime-only".to_string();
    }
    if missing.contains("crit flag") || missing.contains("lucky flag") {
        return "aggregate-only".to_string();
    }
    if missing.is_empty() && has_formula_classification(meta) {
        return "ready-for-formula-replay".to_string();
    }
    if has_formula_classification(meta) {
        return "blocked-by-evidence-gap".to_string();
    }
    "overlap-only".to_string()
}

fn decode_entities(row: &EncounterBlob) -> Result<HashMap<i64, Entity>, String> {
    let decompressed = zstd::decode_all(&row.data[..]).map_err(|error| error.to_string())?;
    rmp_serde::from_slice::<HashMap<i64, Entity>>(&decompressed).map_err(|error| error.to_string())
}

fn query_encounters(options: &Options) -> Result<Vec<EncounterBlob>, Box<dyn std::error::Error>> {
    let mut conn = diesel::sqlite::SqliteConnection::establish(&options.db_path.to_string_lossy())?;
    let sql = if let Some(id) = options.encounter_id {
        format!(
            "SELECT e.id, e.started_at_ms, e.ended_at_ms, e.scene_name, e.duration, ed.data
             FROM encounters e
             INNER JOIN encounter_data ed ON ed.encounter_id = e.id
             WHERE e.id = {id}
             ORDER BY e.started_at_ms DESC, e.id DESC"
        )
    } else {
        format!(
            "SELECT e.id, e.started_at_ms, e.ended_at_ms, e.scene_name, e.duration, ed.data
             FROM encounters e
             INNER JOIN encounter_data ed ON ed.encounter_id = e.id
             WHERE e.ended_at_ms IS NOT NULL
             ORDER BY e.started_at_ms DESC, e.id DESC
             LIMIT {}",
            options.latest
        )
    };
    Ok(diesel::sql_query(sql).load(&mut conn)?)
}

fn source_key(encounter: &EncounterBlob, entity_uid: i64, source_id: &str) -> String {
    format!("{}|{}|{}", encounter.id, entity_uid, source_id)
}

fn ensure_source_agg<'a>(
    rows: &'a mut BTreeMap<String, SourceAgg>,
    encounter: &EncounterBlob,
    entity_uid: i64,
    entity: &Entity,
    source: SourceMeta,
) -> &'a mut SourceAgg {
    let key = source_key(encounter, entity_uid, &source.source_id);
    rows.entry(key).or_insert_with(|| SourceAgg {
        encounter_id: encounter.id,
        scene_name: encounter
            .scene_name
            .clone()
            .unwrap_or_else(|| "Unknown Scene".to_string()),
        started_at_ms: encounter.started_at_ms,
        player_uid: entity_uid,
        player_name: entity.name.clone(),
        class_id: entity.class_id,
        class_spec: format!("{:?}", entity.class_spec),
        player_total: u128_to_f64(entity.damage.total),
        player_effective_total: u128_to_f64(entity.damage.effective_total),
        player_hits: u128_to_f64(entity.damage.hits),
        source,
        modifier_base_ids: BTreeSet::new(),
        modifier_source_config_ids: BTreeSet::new(),
        modifier_source_uids: BTreeSet::new(),
        modifier_host_uids: BTreeSet::new(),
        external_source_uids: BTreeSet::new(),
        evidence_present: BTreeSet::new(),
        required_evidence: BTreeSet::new(),
        missing_evidence: BTreeSet::new(),
        window_keys: BTreeSet::new(),
        windows: Vec::new(),
        raw_bucket_rows: 0,
        deduped_bucket_rows: 0,
        duplicate_bucket_rows: 0,
        raw_total_value: 0.0,
        raw_effective_total_value: 0.0,
        raw_hits: 0.0,
        total_value: 0.0,
        effective_total_value: 0.0,
        hits: 0.0,
        crit_hits: 0.0,
        lucky_hits: 0.0,
        skill_rows: BTreeMap::new(),
        bucket_identities: HashSet::new(),
        damage_linked_source_ids: BTreeSet::new(),
        warnings: BTreeSet::new(),
    })
}

fn add_bucket_to_agg(
    agg: &mut SourceAgg,
    encounter: &EncounterBlob,
    bucket: &ObservedModifierHitBucket,
    index: &GeneratedIndex,
) {
    agg.raw_bucket_rows += 1;
    agg.raw_total_value += u128_to_f64(bucket.total_value);
    agg.raw_effective_total_value += u128_to_f64(bucket.effective_total_value);
    agg.raw_hits += u128_to_f64(bucket.hits);

    if let Some(id) = positive_id(bucket.modifier_base_id as i64) {
        agg.modifier_base_ids.insert(id);
    }
    if let Some(id) = bucket
        .modifier_source_config_id
        .and_then(|id| positive_id(id as i64))
    {
        agg.modifier_source_config_ids.insert(id);
    }
    if bucket.modifier_source_uid > 0 {
        agg.modifier_source_uids.insert(bucket.modifier_source_uid);
        if bucket.modifier_source_uid != agg.player_uid {
            agg.external_source_uids.insert(bucket.modifier_source_uid);
        }
    }
    if bucket.modifier_host_uid > 0 {
        agg.modifier_host_uids.insert(bucket.modifier_host_uid);
    }

    if let Some((start, end)) = bucket_interval(bucket, encounter) {
        let key = format!("{start}:{end}");
        if agg.window_keys.insert(key) {
            agg.windows.push((start, end));
        }
    }

    for evidence in evidence_for_bucket(bucket, &agg.source, index) {
        agg.evidence_present.insert(evidence);
    }
    for evidence in &agg.source.required_evidence {
        agg.required_evidence.insert(evidence.clone());
    }
    if let Some(ids) = index
        .damage_id_to_effect_source_ids
        .get(&bucket.damage_id.to_string())
    {
        for source_id in ids {
            agg.damage_linked_source_ids.insert(source_id.clone());
        }
    }
    if let Some(ids) = index
        .damage_id_to_factor_buff_ids
        .get(&bucket.damage_id.to_string())
    {
        for buff_id in ids {
            agg.damage_linked_source_ids
                .insert(format!("phantom-factor:{buff_id}"));
        }
    }

    let identity = bucket_identity_key(bucket);
    if !agg.bucket_identities.insert(identity) {
        agg.duplicate_bucket_rows += 1;
        return;
    }

    agg.deduped_bucket_rows += 1;
    agg.total_value += u128_to_f64(bucket.total_value);
    agg.effective_total_value += u128_to_f64(bucket.effective_total_value);
    agg.hits += u128_to_f64(bucket.hits);
    agg.crit_hits += u128_to_f64(bucket.crit_hits);
    agg.lucky_hits += u128_to_f64(bucket.lucky_hits);

    let skill_key = if bucket.skill_key > 0 {
        bucket.skill_key
    } else {
        bucket.damage_id
    };
    let label = skill_label(index, skill_key, bucket.damage_id);
    let skill = agg
        .skill_rows
        .entry(format!("{skill_key}|{}", bucket.damage_id))
        .or_insert_with(|| SkillAgg {
            skill_key,
            damage_id: bucket.damage_id,
            label,
            ..Default::default()
        });
    skill.total_value += u128_to_f64(bucket.total_value);
    skill.effective_total_value += u128_to_f64(bucket.effective_total_value);
    skill.hits += u128_to_f64(bucket.hits);
    skill.crit_hits += u128_to_f64(bucket.crit_hits);
    skill.lucky_hits += u128_to_f64(bucket.lucky_hits);
}

fn finalize_source_row(agg: &mut SourceAgg, encounter: &EncounterBlob) -> SourceRow {
    agg.missing_evidence = missing_evidence(&agg.required_evidence, &agg.evidence_present);
    if !agg.source.generated {
        agg.warnings
            .insert("no generated effect source bridge".to_string());
    }
    if agg.total_value > agg.player_total && agg.player_total > 0.0 {
        agg.warnings
            .insert("observed overlap exceeds player recorded total".to_string());
    }
    if agg.raw_total_value > agg.total_value {
        agg.warnings
            .insert("duplicate bucket pressure was de-duplicated for audit totals".to_string());
    }
    if agg.damage_linked_source_ids.len() > 0
        && !agg.damage_linked_source_ids.contains(&agg.source.source_id)
    {
        agg.warnings
            .insert("damage row links to additional generated sources".to_string());
    }

    let mut skills: Vec<SkillRow> = agg
        .skill_rows
        .values()
        .map(|skill| SkillRow {
            skill_key: skill.skill_key,
            damage_id: skill.damage_id,
            label: skill.label.clone(),
            observed_total: skill.total_value,
            observed_effective_total: skill.effective_total_value,
            observed_hits: skill.hits,
            crit_rate: rate(skill.crit_hits, skill.hits),
            lucky_rate: rate(skill.lucky_hits, skill.hits),
        })
        .collect();
    skills.sort_by(|left, right| {
        right
            .observed_total
            .partial_cmp(&left.observed_total)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                right
                    .observed_hits
                    .partial_cmp(&left.observed_hits)
                    .unwrap()
            })
    });
    skills.truncate(12);

    let readiness = classify_readiness(
        &agg.source,
        &agg.missing_evidence,
        agg.hits,
        agg.total_value,
    );

    SourceRow {
        encounter_id: agg.encounter_id,
        scene_name: agg.scene_name.clone(),
        started_at_ms: agg.started_at_ms,
        player_uid: agg.player_uid,
        player_name: agg.player_name.clone(),
        class_id: agg.class_id,
        class_spec: agg.class_spec.clone(),
        source_id: agg.source.source_id.clone(),
        source_label: agg.source.label.clone(),
        source_kind: agg.source.source_kind.clone(),
        source_type: agg.source.source_type.clone(),
        generated_status: agg.source.status.clone(),
        confidence: agg.source.confidence.clone(),
        readiness,
        modifier_base_ids: agg.modifier_base_ids.iter().copied().collect(),
        modifier_source_config_ids: agg.modifier_source_config_ids.iter().copied().collect(),
        modifier_source_uids: agg.modifier_source_uids.iter().copied().collect(),
        modifier_host_uids: agg.modifier_host_uids.iter().copied().collect(),
        external_source_uids: agg.external_source_uids.iter().copied().collect(),
        player_total: agg.player_total,
        player_effective_total: agg.player_effective_total,
        player_hits: agg.player_hits,
        observed_total: agg.total_value,
        observed_effective_total: agg.effective_total_value,
        observed_hits: agg.hits,
        raw_observed_total: agg.raw_total_value,
        raw_observed_hits: agg.raw_hits,
        duplicate_bucket_rows: agg.duplicate_bucket_rows,
        observed_damage_pct_of_player: pct(agg.total_value, agg.player_total),
        observed_hit_pct_of_player: pct(agg.hits, agg.player_hits),
        coverage_pct: coverage_pct(&agg.windows, encounter),
        crit_rate: rate(agg.crit_hits, agg.hits),
        lucky_rate: rate(agg.lucky_hits, agg.hits),
        formula_term_ids: agg.source.formula_term_ids.iter().cloned().collect(),
        contribution_groups: agg.source.contribution_groups.iter().cloned().collect(),
        predicate_tags: agg.source.predicate_tags.iter().cloned().collect(),
        evidence_present: agg.evidence_present.iter().cloned().collect(),
        required_evidence: agg.required_evidence.iter().cloned().collect(),
        missing_evidence: agg.missing_evidence.iter().cloned().collect(),
        damage_linked_source_ids: agg.damage_linked_source_ids.iter().cloned().collect(),
        warnings: agg.warnings.iter().cloned().collect(),
        top_skills: skills,
    }
}

fn markdown_table(headers: &[&str], rows: Vec<Vec<String>>) -> String {
    if rows.is_empty() {
        return "No rows.".to_string();
    }
    let escape = |value: &str| value.replace('|', "\\|").replace('\n', " ");
    let mut lines = vec![
        format!("| {} |", headers.join(" | ")),
        format!(
            "| {} |",
            headers
                .iter()
                .map(|_| "---")
                .collect::<Vec<_>>()
                .join(" | ")
        ),
    ];
    for row in rows {
        lines.push(format!(
            "| {} |",
            row.iter()
                .map(|value| escape(value))
                .collect::<Vec<_>>()
                .join(" | ")
        ));
    }
    lines.join("\n")
}

fn short_list<T: ToString>(values: &[T], limit: usize) -> String {
    let mut parts: Vec<String> = values.iter().take(limit).map(ToString::to_string).collect();
    if values.len() > limit {
        parts.push(format!("+{} more", values.len() - limit));
    }
    parts.join(", ")
}

fn format_number(value: f64) -> String {
    if !value.is_finite() {
        return "n/a".to_string();
    }
    let abs = value.abs();
    if abs >= 1_000_000_000.0 {
        format!("{:.2}b", value / 1_000_000_000.0)
    } else if abs >= 1_000_000.0 {
        format!("{:.1}m", value / 1_000_000.0)
    } else if abs >= 1_000.0 {
        format!("{:.1}k", value / 1_000.0)
    } else {
        format!("{:.0}", value)
    }
}

fn format_pct(value: f64) -> String {
    format!("{value:.1}%")
}

fn write_report(report: &Report, options: &Options) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(dir) = options.out_json.parent() {
        fs::create_dir_all(dir)?;
    }
    if let Some(dir) = options.out_md.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(&options.out_json, serde_json::to_string_pretty(report)?)?;

    let summary_rows = report
        .player_summaries
        .iter()
        .take(options.max_rows.min(40))
        .map(|row| {
            vec![
                format!("#{}", row.encounter_id),
                row.scene_name.clone(),
                format!("{} ({})", row.player_name, row.player_uid),
                format_number(row.player_total),
                row.source_rows.to_string(),
                format!("{:.2}x", row.observed_overlap_damage_multiplier),
                format!("{:.2}x", row.observed_overlap_hit_multiplier),
                row.duplicate_bucket_rows.to_string(),
            ]
        })
        .collect();
    let source_rows = report
        .source_rows
        .iter()
        .take(options.max_rows)
        .map(|row| {
            vec![
                format!("#{}", row.encounter_id),
                row.player_name.clone(),
                row.source_label.clone(),
                row.readiness.clone(),
                row.generated_status.clone(),
                format_number(row.observed_total),
                format_pct(row.observed_damage_pct_of_player),
                format_number(row.observed_hits),
                format_pct(row.coverage_pct),
                short_list(&row.missing_evidence, 4),
            ]
        })
        .collect();
    let gap_rows = report
        .top_missing_evidence
        .iter()
        .map(|row| vec![row.evidence.clone(), row.rows.to_string()])
        .collect();
    let duplicate_rows = report
        .duplicate_pressure_rows
        .iter()
        .take(40)
        .map(|row| {
            vec![
                format!("#{}", row.encounter_id),
                row.player_name.clone(),
                row.source_label.clone(),
                row.duplicate_bucket_rows.to_string(),
                format_number(row.raw_observed_total),
                format_number(row.observed_total),
            ]
        })
        .collect();

    let md = [
        "# Modifier Accuracy Audit".to_string(),
        "".to_string(),
        "Temporary calibration report. This reads persisted history modifier hit buckets and generated source metadata, then separates recorded damage, observed overlap, and formula replay readiness. It does not claim net-added damage yet.".to_string(),
        "".to_string(),
        "## Summary".to_string(),
        "".to_string(),
        format!("- DB: `{}`", report.db_path),
        format!("- Formula: `{}` ({})", report.formula.id, report.formula.status),
        format!("- Encounters scanned: {}", report.totals.encounters_scanned),
        format!("- Entities scanned: {}", report.totals.entities_scanned),
        format!("- Entities with modifier buckets: {}", report.totals.entities_with_modifier_buckets),
        format!("- Modifier bucket rows: {}", report.totals.modifier_bucket_rows),
        format!("- Source rows: {}", report.totals.source_rows),
        format!("- Zero-hit source rows: {}", report.totals.zero_hit_source_rows),
        format!("- Rows with duplicate bucket pressure: {}", report.totals.rows_with_duplicate_pressure),
        format!("- Rows over player total: {}", report.totals.rows_over_player_total),
        format!("- Rows missing generated source bridge: {}", report.totals.rows_missing_generated_source),
        "".to_string(),
        "## Readiness Counts".to_string(),
        "".to_string(),
        markdown_table(
            &["Readiness", "Rows"],
            report
                .readiness_counts
                .iter()
                .map(|(key, value)| vec![key.clone(), value.to_string()])
                .collect(),
        ),
        "".to_string(),
        "## Player Overlap".to_string(),
        "".to_string(),
        markdown_table(
            &["Encounter", "Scene", "Player", "Recorded Damage", "Source Rows", "Damage Overlap", "Hit Overlap", "Duplicate Buckets"],
            summary_rows,
        ),
        "".to_string(),
        "## Main Evidence Gaps".to_string(),
        "".to_string(),
        markdown_table(&["Missing Evidence", "Rows"], gap_rows),
        "".to_string(),
        "## Top Source Rows".to_string(),
        "".to_string(),
        markdown_table(
            &["Encounter", "Player", "Source", "Readiness", "Generated Status", "Observed", "Observed %", "Hits", "Coverage", "Missing"],
            source_rows,
        ),
        "".to_string(),
        "## Duplicate Bucket Pressure".to_string(),
        "".to_string(),
        markdown_table(
            &["Encounter", "Player", "Source", "Duplicate Buckets", "Raw Observed", "Deduped Observed"],
            duplicate_rows,
        ),
        "".to_string(),
        "## Notes".to_string(),
        "".to_string(),
        report.notes.iter().map(|note| format!("- {note}")).collect::<Vec<_>>().join("\n"),
        "".to_string(),
    ]
    .join("\n");

    fs::write(&options.out_md, md)?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let options = parse_args().map_err(|error| format!("argument error: {error}"))?;
    let generated = generated_index()?;
    let encounters = query_encounters(&options)?;
    let mut totals = Totals::default();
    let mut decode_failures = Vec::new();
    let mut source_aggs: BTreeMap<String, SourceAgg> = BTreeMap::new();
    let mut encounter_by_id = BTreeMap::<i32, EncounterBlob>::new();
    let mut player_bucket_counts = BTreeMap::<(i32, i64), usize>::new();

    for encounter in encounters {
        totals.encounters_scanned += 1;
        let entities = match decode_entities(&encounter) {
            Ok(entities) => entities,
            Err(error) => {
                decode_failures.push(DecodeFailure {
                    encounter_id: encounter.id,
                    error,
                });
                continue;
            }
        };

        for (entity_uid, entity) in &entities {
            if options.player_uid.is_some_and(|uid| uid != *entity_uid) {
                continue;
            }
            if entity.class_id <= 0
                && entity.damage.hits == 0
                && entity.modifier_hit_buckets.is_empty()
            {
                continue;
            }
            totals.entities_scanned += 1;
            if !entity.modifier_hit_buckets.is_empty() {
                totals.entities_with_modifier_buckets += 1;
            }

            for bucket in &entity.modifier_hit_buckets {
                if bucket.is_heal {
                    continue;
                }
                if is_ignored_modifier_buff_id(bucket.modifier_base_id as i64)
                    || bucket
                        .modifier_source_config_id
                        .map(|id| is_ignored_modifier_buff_id(id as i64))
                        .unwrap_or(false)
                {
                    continue;
                }
                totals.modifier_bucket_rows += 1;
                if bucket.hits > 0 {
                    totals.modifier_bucket_rows_with_hits += 1;
                }
                *player_bucket_counts
                    .entry((encounter.id, *entity_uid))
                    .or_default() += 1;
                for source_id in source_ids_for_bucket(&generated, bucket) {
                    let source = source_meta(&generated, &source_id);
                    let agg = ensure_source_agg(
                        &mut source_aggs,
                        &encounter,
                        *entity_uid,
                        entity,
                        source,
                    );
                    add_bucket_to_agg(agg, &encounter, bucket, &generated);
                }
            }
        }
        encounter_by_id.insert(encounter.id, encounter);
    }

    let mut rows = Vec::new();
    for agg in source_aggs.values_mut() {
        if let Some(encounter) = encounter_by_id.get(&agg.encounter_id) {
            rows.push(finalize_source_row(agg, encounter));
        }
    }

    rows.sort_by(|left, right| {
        right
            .observed_total
            .partial_cmp(&left.observed_total)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                right
                    .observed_hits
                    .partial_cmp(&left.observed_hits)
                    .unwrap()
            })
            .then_with(|| left.source_label.cmp(&right.source_label))
    });

    totals.source_rows = rows.len();
    totals.zero_hit_source_rows = rows.iter().filter(|row| row.observed_hits <= 0.0).count();
    totals.rows_with_duplicate_pressure = rows
        .iter()
        .filter(|row| row.duplicate_bucket_rows > 0)
        .count();
    totals.rows_over_player_total = rows
        .iter()
        .filter(|row| row.observed_total > row.player_total && row.player_total > 0.0)
        .count();
    totals.rows_missing_generated_source = rows
        .iter()
        .filter(|row| {
            row.missing_evidence
                .iter()
                .any(|item| item == "generated effect-source bridge")
        })
        .count();

    let mut readiness_counts = BTreeMap::<String, usize>::new();
    let mut missing_counts = BTreeMap::<String, usize>::new();
    for row in &rows {
        *readiness_counts.entry(row.readiness.clone()).or_default() += 1;
        for item in &row.missing_evidence {
            *missing_counts.entry(item.clone()).or_default() += 1;
        }
    }
    let mut top_missing_evidence: Vec<MissingEvidenceRow> = missing_counts
        .into_iter()
        .map(|(evidence, rows)| MissingEvidenceRow { evidence, rows })
        .collect();
    top_missing_evidence.sort_by(|left, right| {
        right
            .rows
            .cmp(&left.rows)
            .then_with(|| left.evidence.cmp(&right.evidence))
    });
    top_missing_evidence.truncate(options.max_rows);

    let mut player_map = BTreeMap::<(i32, i64), PlayerSummary>::new();
    for row in &rows {
        let entry = player_map
            .entry((row.encounter_id, row.player_uid))
            .or_insert_with(|| PlayerSummary {
                encounter_id: row.encounter_id,
                scene_name: row.scene_name.clone(),
                player_uid: row.player_uid,
                player_name: row.player_name.clone(),
                class_id: row.class_id,
                class_spec: row.class_spec.clone(),
                player_total: row.player_total,
                player_hits: row.player_hits,
                source_rows: 0,
                modifier_bucket_rows: *player_bucket_counts
                    .get(&(row.encounter_id, row.player_uid))
                    .unwrap_or(&0),
                observed_overlap_total: 0.0,
                observed_overlap_hits: 0.0,
                observed_overlap_damage_multiplier: 0.0,
                observed_overlap_hit_multiplier: 0.0,
                zero_hit_source_rows: 0,
                duplicate_bucket_rows: 0,
            });
        entry.source_rows += 1;
        entry.observed_overlap_total += row.observed_total;
        entry.observed_overlap_hits += row.observed_hits;
        if row.observed_hits <= 0.0 {
            entry.zero_hit_source_rows += 1;
        }
        entry.duplicate_bucket_rows += row.duplicate_bucket_rows;
    }
    let mut player_summaries: Vec<PlayerSummary> = player_map
        .into_values()
        .map(|mut row| {
            row.observed_overlap_damage_multiplier = if row.player_total > 0.0 {
                row.observed_overlap_total / row.player_total
            } else {
                0.0
            };
            row.observed_overlap_hit_multiplier = if row.player_hits > 0.0 {
                row.observed_overlap_hits / row.player_hits
            } else {
                0.0
            };
            row
        })
        .collect();
    player_summaries.sort_by(|left, right| {
        right
            .observed_overlap_damage_multiplier
            .partial_cmp(&left.observed_overlap_damage_multiplier)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.source_rows.cmp(&left.source_rows))
    });

    let mut duplicate_pressure_rows: Vec<SourceRow> = rows
        .iter()
        .filter(|row| row.duplicate_bucket_rows > 0)
        .cloned()
        .collect();
    duplicate_pressure_rows.sort_by(|left, right| {
        right
            .duplicate_bucket_rows
            .cmp(&left.duplicate_bucket_rows)
            .then_with(|| {
                right
                    .raw_observed_total
                    .partial_cmp(&left.raw_observed_total)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    duplicate_pressure_rows.truncate(options.max_rows);

    let mut zero_hit_rows: Vec<SourceRow> = rows
        .iter()
        .filter(|row| row.observed_hits <= 0.0)
        .cloned()
        .collect();
    zero_hit_rows.truncate(options.max_rows);

    let mut source_rows = rows;
    source_rows.truncate(options.max_rows);

    let report = Report {
        generated_at: chrono::Utc::now().to_rfc3339(),
        db_path: options.db_path.to_string_lossy().to_string(),
        formula: FormulaSummary {
            id: generated.damage_formula_id,
            status: generated.damage_formula_status,
            expression: generated.damage_formula_expression,
        },
        options: ReportOptions {
            latest: options.latest,
            encounter_id: options.encounter_id,
            player_uid: options.player_uid,
            max_rows: options.max_rows,
        },
        totals,
        readiness_counts,
        top_missing_evidence,
        player_summaries,
        source_rows,
        duplicate_pressure_rows,
        zero_hit_rows,
        decode_failures,
        notes: vec![
            "Observed damage/hits are overlap measurements. Multiple always-on modifiers can each overlap the same recorded hit, so source row totals are not net-added contribution.".to_string(),
            "Rows marked ready-for-formula-replay have generated formula terms and the persisted bucket evidence requested by that source model; they still need controlled validation before becoming UI contribution math.".to_string(),
            "missing-runtime-stat-snapshot means the bucket lacks attacker/target stat state at damage time, which is currently required for replaying the adjustable damage formula.".to_string(),
            "duplicate bucket pressure indicates saved rows repeated the same damage identity inside a source, often from stacked or overlapping windows; the audit de-duplicates these for its observed totals.".to_string(),
        ],
    };

    write_report(&report, &options)?;
    println!("Modifier accuracy audit written:");
    println!("  {}", options.out_json.display());
    println!("  {}", options.out_md.display());
    Ok(())
}
