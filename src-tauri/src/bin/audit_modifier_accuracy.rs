use diesel::prelude::*;
use diesel::sql_types::{BigInt, Binary, Double, Integer, Nullable, Text};
use resonance_logs_lib::live::opcodes_models::{
    AttrType, Entity, ObservedFormulaAttr, ObservedModifierHitBucket, ObservedModifierReplayHit,
    ObservedModifierReplaySource,
};
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
    latest_offset: usize,
    encounter_id: Option<i32>,
    player_uid: Option<i64>,
    max_rows: usize,
    max_timeline_rows: usize,
    timeline_bin_ms: i64,
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
    modifier_sources_by_id: HashMap<String, Value>,
    modifier_display_by_rule_id: HashMap<String, Value>,
    modifier_contribution_by_rule_id: HashMap<String, Value>,
    modifier_display_rule_ids_by_source_id: HashMap<String, Vec<String>>,
    modifier_contribution_rule_ids_by_source_id: HashMap<String, Vec<String>>,
    modifier_formula_terms_by_key: HashMap<String, Value>,
    modifier_value_proof_by_key: HashMap<String, Value>,
    modifier_formula_keys_by_rule_id: HashMap<String, Vec<String>>,
    modifier_value_proof_keys_by_rule_id: HashMap<String, Vec<String>>,
    modifier_source_ids_by_buff_id: HashMap<String, Vec<String>>,
    modifier_ignored_buff_ids: HashSet<i64>,
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
    timeline_proof_status_counts: BTreeMap<String, usize>,
    timeline_next_action_counts: BTreeMap<String, usize>,
    top_missing_evidence: Vec<MissingEvidenceRow>,
    top_blocked_timeline_missing_evidence: Vec<MissingEvidenceRow>,
    top_timeline_missing_evidence: Vec<MissingEvidenceRow>,
    player_summaries: Vec<PlayerSummary>,
    source_rows: Vec<SourceRow>,
    duplicate_pressure_rows: Vec<SourceRow>,
    zero_hit_rows: Vec<SourceRow>,
    proof_timeline: Vec<ProofTimelineRow>,
    timeline_source_blockers: Vec<TimelineSourceProofRow>,
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
    latest_offset: usize,
    encounter_id: Option<i32>,
    player_uid: Option<i64>,
    max_rows: usize,
    max_timeline_rows: usize,
    timeline_bin_ms: i64,
}

#[derive(Default, Serialize)]
struct Totals {
    encounters_scanned: usize,
    entities_scanned: usize,
    entities_with_modifier_buckets: usize,
    modifier_bucket_rows: usize,
    modifier_bucket_rows_with_hits: usize,
    modifier_replay_hit_rows: usize,
    modifier_replay_hit_rows_with_sources: usize,
    modifier_replay_source_links: usize,
    source_rows: usize,
    proof_timeline_rows: usize,
    proof_timeline_rows_truncated: usize,
    proof_timeline_effect_links: usize,
    proof_timeline_ready_effect_links: usize,
    proof_timeline_blocked_effect_links: usize,
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

#[derive(Default, Serialize)]
struct TimelineSourceProofRow {
    source_id: String,
    source_label: String,
    source_kind: String,
    source_type: String,
    generated_status: String,
    formula_term_ids: Vec<String>,
    contribution_groups: Vec<String>,
    effect_links: usize,
    ready_effect_links: usize,
    blocked_effect_links: usize,
    next_dev_action: String,
    next_dev_action_counts: BTreeMap<String, usize>,
    proof_status_counts: BTreeMap<String, usize>,
    top_missing_evidence: Vec<MissingEvidenceRow>,
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

#[derive(Serialize, Clone)]
struct ProofTimelineRow {
    encounter_id: i32,
    scene_name: String,
    started_at_ms: i64,
    bin_start_ms: i64,
    bin_end_ms: i64,
    bin_offset_ms: i64,
    first_hit_ms: i64,
    last_hit_ms: i64,
    player_uid: i64,
    player_name: String,
    skill_key: i64,
    damage_id: i64,
    skill_label: String,
    target_uid: i64,
    target_monster_type_id: Option<i32>,
    active_effect_uids: Vec<i32>,
    active_source_uids: Vec<i64>,
    active_source_rule_ids: Vec<String>,
    proof_status_counts: BTreeMap<String, usize>,
    missing_evidence_counts: BTreeMap<String, usize>,
    active_effects: Vec<ProofTimelineEffectRow>,
    hit_event_count_with_id: u64,
    first_hit_event_id: Option<i32>,
    last_hit_event_id: Option<i32>,
    hits: u64,
    total_value: f64,
    effective_value: f64,
    hp_loss_value: f64,
    shield_loss_value: f64,
    crit_hits: u64,
    lucky_hits: u64,
    crit_rate: f64,
    lucky_rate: f64,
    attacker_attr_ids: Vec<i32>,
    target_attr_ids: Vec<i32>,
    attacker_attrs: Vec<ProofTimelineAttrStats>,
    target_attrs: Vec<ProofTimelineAttrStats>,
}

#[derive(Serialize, Clone)]
struct ProofTimelineAttrStats {
    attr_id: i32,
    attr_name: String,
    samples: u64,
    min: f64,
    max: f64,
    first: f64,
    last: f64,
}

#[derive(Serialize, Clone)]
struct ProofTimelineEffectRow {
    source_id: String,
    source_label: String,
    source_kind: String,
    source_type: String,
    generated_status: String,
    proof_status: String,
    effect_uid: i32,
    modifier_base_id: i32,
    modifier_source_config_id: Option<i32>,
    modifier_buff_level: Option<i32>,
    modifier_count: Option<i32>,
    modifier_layer: i32,
    modifier_host_uid: i64,
    modifier_source_uid: i64,
    external_source: bool,
    hits: u64,
    formula_term_ids: Vec<String>,
    contribution_groups: Vec<String>,
    predicate_tags: Vec<String>,
    evidence_present: Vec<String>,
    required_evidence: Vec<String>,
    missing_evidence: Vec<String>,
}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
struct ProofTimelineKey {
    encounter_id: i32,
    player_uid: i64,
    bin_start_ms: i64,
    skill_key: i64,
    damage_id: i64,
    target_uid: i64,
}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
struct ProofTimelineEffectKey {
    source_id: String,
    effect_uid: i32,
    modifier_base_id: i32,
    modifier_source_config_id: Option<i32>,
    modifier_host_uid: i64,
    modifier_source_uid: i64,
    modifier_count: Option<i32>,
    modifier_layer: i32,
}

struct ProofTimelineEffectAgg {
    source: SourceMeta,
    effect_uid: i32,
    modifier_base_id: i32,
    modifier_source_config_id: Option<i32>,
    modifier_buff_level: Option<i32>,
    modifier_count: Option<i32>,
    modifier_layer: i32,
    modifier_host_uid: i64,
    modifier_source_uid: i64,
    hits: u64,
    evidence_present: BTreeSet<String>,
    required_evidence: BTreeSet<String>,
}

struct ProofTimelineAgg {
    encounter_id: i32,
    scene_name: String,
    started_at_ms: i64,
    bin_start_ms: i64,
    bin_end_ms: i64,
    first_hit_ms: i64,
    last_hit_ms: i64,
    player_uid: i64,
    player_name: String,
    skill_key: i64,
    damage_id: i64,
    skill_label: String,
    target_uid: i64,
    target_monster_type_id: Option<i32>,
    active_effects: BTreeMap<ProofTimelineEffectKey, ProofTimelineEffectAgg>,
    hit_event_count_with_id: u64,
    first_hit_event_id: Option<i32>,
    last_hit_event_id: Option<i32>,
    hits: u64,
    total_value: f64,
    effective_value: f64,
    hp_loss_value: f64,
    shield_loss_value: f64,
    crit_hits: u64,
    lucky_hits: u64,
    attacker_attr_ids: BTreeSet<i32>,
    target_attr_ids: BTreeSet<i32>,
    attacker_attr_values: BTreeMap<i32, AttrValueAgg>,
    target_attr_values: BTreeMap<i32, AttrValueAgg>,
}

#[derive(Clone, Debug)]
struct AttrValueAgg {
    samples: u64,
    min: f64,
    max: f64,
    first: f64,
    last: f64,
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

fn extractor_output_path(name: &str) -> PathBuf {
    let root = repo_root();
    root.parent()
        .unwrap_or_else(|| Path::new("."))
        .join("BPSR-UID-Extractors")
        .join("output")
        .join(name)
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
        latest_offset: 0,
        encounter_id: None,
        player_uid: None,
        max_rows: 160,
        max_timeline_rows: 2000,
        timeline_bin_ms: 250,
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
            "--latest-offset" => {
                options.latest_offset = next()?
                    .parse()
                    .map_err(|_| "--latest-offset must be a number".to_string())?
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
            "--max-timeline-rows" => {
                options.max_timeline_rows = next()?
                    .parse()
                    .map_err(|_| "--max-timeline-rows must be a number".to_string())?
            }
            "--timeline-bin-ms" => {
                options.timeline_bin_ms = next()?
                    .parse()
                    .map_err(|_| "--timeline-bin-ms must be a number".to_string())?
            }
            "--out-json" => options.out_json = PathBuf::from(next()?),
            "--out-md" => options.out_md = PathBuf::from(next()?),
            "--help" | "-h" => {
                println!(
                    "Modifier Accuracy Audit\n\n\
Usage:\n  cargo run --bin audit_modifier_accuracy -- [options]\n\n\
Options:\n  --db <path>             SQLite DB path. Default: {}\n  \
--latest <count>        Recent encounters to scan. Default: 40\n  \
--latest-offset <count> Skip this many recent encounters before --latest. Default: 0\n  \
--encounter-id <id>     Scan one encounter id.\n  \
--player-uid <uid>      Restrict to one player/entity uid.\n  \
--max-rows <count>      Max rows per report section. Default: 160\n  \
--max-timeline-rows <count> Max compact proof timeline rows. Default: 2000\n  \
--timeline-bin-ms <ms>  Timeline aggregation bin size. Default: 250\n  \
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

    options.timeline_bin_ms = options.timeline_bin_ms.max(1);
    Ok(options)
}

fn read_json(path: PathBuf) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn read_json_if_exists(path: PathBuf) -> Result<Value, Box<dyn std::error::Error>> {
    if path.exists() {
        read_json(path)
    } else {
        Ok(Value::Null)
    }
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

fn source_rule_entry_index(
    entries_by_key: &HashMap<String, Value>,
) -> HashMap<String, Vec<String>> {
    let mut index = HashMap::<String, Vec<String>>::new();
    for (entry_key, entry) in entries_by_key {
        for source_rule_id in as_string_array(entry.get("sourceRuleIds"))
            .into_iter()
            .chain(as_string_array(entry.get("directSourceRuleIds")))
        {
            let keys = index.entry(source_rule_id).or_default();
            if !keys.iter().any(|key| key == entry_key) {
                keys.push(entry_key.clone());
            }
        }
    }
    index
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

fn label_for_prefixed_source_id(index: &GeneratedIndex, source_id: &str) -> Option<String> {
    for prefix in [
        "buff-source:",
        "observed-buff:",
        "active-buff:",
        "runtime-buff:",
    ] {
        if let Some(id) = source_id.strip_prefix(prefix) {
            let buff_id = id.parse::<i64>().ok()?;
            let row = index.buff_names_by_id.get(&buff_id)?;
            let label = value_label(row, "");
            return (!label.is_empty()).then_some(label);
        }
    }

    if let Some(id) = source_id.strip_prefix("phantom-factor:") {
        let row = index.factors_by_buff_id.get(id)?;
        let label = value_label(row, "");
        return (!label.is_empty()).then_some(label);
    }

    None
}

fn generated_index() -> Result<GeneratedIndex, Box<dyn std::error::Error>> {
    let damage_formula = read_json(logic_path("DamageFormula.json"))?;
    let effect_sources = read_json(generated_path("EffectSources.json"))?;
    let factors = read_json(generated_path("SeasonPhantomFactors.json"))?;
    let modifier_recount = read_json(generated_path("ModifierRecountTable.json"))?;
    let modifier_display = read_json(generated_path("ModifierDisplayTable.json"))?;
    let modifier_contribution = read_json(generated_path("ModifierContributionTable.json"))?;
    let modifier_formula_terms =
        read_json_if_exists(extractor_output_path("ModifierFormulaTermTable.json"))?;
    let modifier_value_proof =
        read_json_if_exists(extractor_output_path("ModifierValueProofTable.json"))?;
    let buff_names = read_json(generated_path("BuffName.json"))?;
    let skill_details = read_json(generated_path("SkillBreakdownDetails.json"))?;
    let recount = read_json(generated_path("RecountTable.json"))?;
    let modifier_formula_terms_by_key = as_object_map(&modifier_formula_terms, "entriesByKey");
    let modifier_value_proof_by_key = as_object_map(&modifier_value_proof, "entriesByKey");
    let modifier_formula_keys_by_rule_id = source_rule_entry_index(&modifier_formula_terms_by_key);
    let modifier_value_proof_keys_by_rule_id =
        source_rule_entry_index(&modifier_value_proof_by_key);

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
        modifier_sources_by_id: as_object_map(&modifier_recount, "sourcesById"),
        modifier_display_by_rule_id: as_object_map(&modifier_display, "sourcesByRuleId"),
        modifier_contribution_by_rule_id: as_object_map(&modifier_contribution, "sourcesByRuleId"),
        modifier_display_rule_ids_by_source_id: HashMap::new(),
        modifier_contribution_rule_ids_by_source_id: HashMap::new(),
        modifier_formula_terms_by_key,
        modifier_value_proof_by_key,
        modifier_formula_keys_by_rule_id,
        modifier_value_proof_keys_by_rule_id,
        modifier_source_ids_by_buff_id: HashMap::new(),
        modifier_ignored_buff_ids: HashSet::new(),
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
    for (buff_id, value) in as_object_map(&modifier_recount, "byBuffId") {
        index
            .modifier_source_ids_by_buff_id
            .insert(buff_id, as_string_array(Some(&value)));
    }
    for (source_id, value) in as_object_map(&modifier_display, "sourceRuleIdsBySourceId") {
        for rule_id in as_string_array(Some(&value)) {
            push_unique(
                index
                    .modifier_display_rule_ids_by_source_id
                    .entry(source_id.clone())
                    .or_default(),
                rule_id,
            );
        }
    }
    let display_source_links: Vec<(String, String)> = index
        .modifier_display_by_rule_id
        .iter()
        .filter_map(|(rule_id, row)| {
            row.get("sourceId")
                .and_then(Value::as_str)
                .map(|source_id| (source_id.to_string(), rule_id.clone()))
        })
        .collect();
    for (source_id, rule_id) in display_source_links {
        push_unique(
            index
                .modifier_display_rule_ids_by_source_id
                .entry(source_id)
                .or_default(),
            rule_id,
        );
    }
    let contribution_source_links: Vec<(String, String)> = index
        .modifier_contribution_by_rule_id
        .iter()
        .filter_map(|(rule_id, row)| {
            row.get("sourceId")
                .and_then(Value::as_str)
                .map(|source_id| (source_id.to_string(), rule_id.clone()))
        })
        .collect();
    for (source_id, rule_id) in contribution_source_links {
        push_unique(
            index
                .modifier_contribution_rule_ids_by_source_id
                .entry(source_id)
                .or_default(),
            rule_id,
        );
    }
    for buff_id in as_i64_array(modifier_recount.get("ignoredBuffIds")) {
        index.modifier_ignored_buff_ids.insert(buff_id);
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

fn source_meta_from_generated_row(
    source_id: &str,
    row: &Value,
    default_kind: &str,
    default_type: &str,
) -> SourceMeta {
    let model = row.get("attributionModel");
    let mut required_evidence = collect_model_strings(model, "requiredRuntimeEvidence");
    required_evidence.insert("modifier windows".to_string());
    required_evidence.insert("observed final hit value".to_string());
    required_evidence.insert("damage id".to_string());

    let mut formula_term_ids = collect_model_strings(model, "formulaTermIds");
    for value in as_string_array(row.get("formulaTermIds")) {
        formula_term_ids.insert(value);
    }

    let mut contribution_groups = collect_model_strings(model, "contributionGroups");
    for value in as_string_array(row.get("contributionGroups")) {
        contribution_groups.insert(value);
    }

    let mut predicate_tags = collect_model_strings(model, "predicateTags");
    for value in as_string_array(row.get("predicateTags")) {
        predicate_tags.insert(value);
    }

    let status = model
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        .or_else(|| row.get("contributionStatus").and_then(Value::as_str))
        .or_else(|| row.get("rowPolicy").and_then(Value::as_str))
        .unwrap_or("generated")
        .to_string();

    if status == "uptime-only" && formula_term_ids.is_empty() && contribution_groups.is_empty() {
        required_evidence.insert("modifier to formula-term classification".to_string());
    }

    SourceMeta {
        source_id: source_id.to_string(),
        label: value_label(row, source_id),
        source_kind: row
            .get("sourceKind")
            .and_then(Value::as_str)
            .unwrap_or(default_kind)
            .to_string(),
        source_type: row
            .get("sourceType")
            .and_then(Value::as_str)
            .unwrap_or(default_type)
            .to_string(),
        status,
        confidence: model
            .and_then(|value| value.get("confidence"))
            .and_then(Value::as_str)
            .map(str::to_string),
        formula_term_ids,
        contribution_groups,
        predicate_tags,
        required_evidence,
        generated: true,
    }
}

fn merge_source_meta_from_generated_row(meta: &mut SourceMeta, row: &Value) {
    let model = row.get("attributionModel");

    for value in collect_model_strings(model, "requiredRuntimeEvidence") {
        meta.required_evidence.insert(value);
    }
    for value in as_string_array(row.get("requiredRuntimeEvidence")) {
        meta.required_evidence.insert(value);
    }
    for value in collect_model_strings(model, "formulaTermIds") {
        meta.formula_term_ids.insert(value);
    }
    for value in as_string_array(row.get("formulaTermIds")) {
        meta.formula_term_ids.insert(value);
    }
    for value in collect_model_strings(model, "contributionGroups") {
        meta.contribution_groups.insert(value);
    }
    for value in as_string_array(row.get("contributionGroups")) {
        meta.contribution_groups.insert(value);
    }
    for value in collect_model_strings(model, "predicateTags") {
        meta.predicate_tags.insert(value);
    }
    for value in as_string_array(row.get("predicateTags")) {
        meta.predicate_tags.insert(value);
    }

    let contribution_mode = row
        .get("contributionMode")
        .and_then(Value::as_str)
        .unwrap_or("");
    if contribution_mode == "exact-produced-damage" {
        meta.contribution_groups
            .insert("packetExactDamage".to_string());
        meta.required_evidence
            .remove("modifier to formula-term classification");
    }

    let contribution_status = row
        .get("contributionStatus")
        .and_then(Value::as_str)
        .unwrap_or("");
    if contribution_status == "proc-damage" || meta.contribution_groups.contains("procDamage") {
        meta.status = "proc-damage".to_string();
    } else if contribution_mode == "exact-produced-damage" && meta.status == "uptime-only" {
        meta.status = "packet-exact".to_string();
    } else if meta.status == "generated" || meta.status == "uptime" {
        if let Some(status) = model
            .and_then(|value| value.get("status"))
            .and_then(Value::as_str)
            .or_else(|| row.get("contributionStatus").and_then(Value::as_str))
            .or_else(|| row.get("rowPolicy").and_then(Value::as_str))
        {
            meta.status = status.to_string();
        }
    }

    if meta.confidence.is_none() {
        meta.confidence = model
            .and_then(|value| value.get("confidence"))
            .and_then(Value::as_str)
            .or_else(|| row.get("confidence").and_then(Value::as_str))
            .map(str::to_string);
    }

    if meta.status == "uptime-only"
        && meta.formula_term_ids.is_empty()
        && meta.contribution_groups.is_empty()
    {
        meta.required_evidence
            .insert("modifier to formula-term classification".to_string());
    }
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

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn push_category_key(keys: &mut Vec<String>, category: &str, id: &str) {
    let id = id.trim();
    if !id.is_empty() {
        push_unique(keys, format!("{category}:{id}"));
    }
}

fn push_source_id_category_keys(keys: &mut Vec<String>, source_id: &str) {
    for prefix in [
        "buffs:",
        "skills:",
        "talents:",
        "seasonal-talents:",
        "factors:",
        "items:",
        "battle-imagines:",
        "linktext-tooltips:",
    ] {
        if source_id.starts_with(prefix) {
            push_unique(keys, source_id.to_string());
            return;
        }
    }

    if let Some(id) = source_id.strip_prefix("buff-source:") {
        push_category_key(keys, "buffs", id);
    }
    if let Some(id) = source_id.strip_prefix("observed-buff:") {
        push_category_key(keys, "buffs", id);
    }
    if let Some(id) = source_id.strip_prefix("active-buff:") {
        push_category_key(keys, "buffs", id);
    }
    if let Some(id) = source_id.strip_prefix("runtime-buff:") {
        push_category_key(keys, "buffs", id);
    }
    if let Some(id) = source_id.strip_prefix("talent:") {
        push_category_key(keys, "talents", id);
    }
    if let Some(id) = source_id.strip_prefix("season-talent-node:") {
        push_category_key(keys, "seasonal-talents", id);
    }
    if let Some(id) = source_id.strip_prefix("skill:") {
        push_category_key(keys, "skills", id);
    }
    if let Some(id) = source_id.strip_prefix("active-skill:") {
        push_category_key(keys, "skills", id);
    }
    if let Some(id) = source_id.strip_prefix("item:") {
        push_category_key(keys, "items", id);
    }
    if let Some(id) = source_id.strip_prefix("battle-imagine:") {
        push_category_key(keys, "battle-imagines", id);
    }
    if let Some(id) = source_id.strip_prefix("imagine:") {
        push_category_key(keys, "battle-imagines", id);
    }
    if let Some(id) = source_id.strip_prefix("phantom-factor:") {
        push_category_key(keys, "factors", id);
        push_category_key(keys, "buffs", id);
    }
}

fn source_entity_id(row: &Value) -> Option<String> {
    row.get("sourceEntityId").and_then(|value| {
        value
            .as_i64()
            .map(|id| id.to_string())
            .or_else(|| value.as_u64().map(|id| id.to_string()))
            .or_else(|| value.as_str().map(str::to_string))
    })
}

fn category_keys_for_source_row(source_id: &str, row: &Value) -> Vec<String> {
    let mut keys = Vec::new();
    if let Some(row_source_id) = row.get("sourceId").and_then(Value::as_str) {
        push_source_id_category_keys(&mut keys, row_source_id);
    }
    push_source_id_category_keys(&mut keys, source_id);

    if keys.is_empty() {
        if let Some(id) = source_entity_id(row) {
            let kind = row
                .get("sourceKind")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            let source_type = row
                .get("sourceType")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            let combined = format!("{kind} {source_type}");
            if combined.contains("phantom-factor") || combined.contains("season-phantom-factor") {
                push_category_key(&mut keys, "factors", &id);
                push_category_key(&mut keys, "buffs", &id);
            } else if combined.contains("season-talent")
                || combined.contains("deep-slumber")
                || combined.contains("slumber")
            {
                push_category_key(&mut keys, "seasonal-talents", &id);
            } else if combined.contains("talent") {
                push_category_key(&mut keys, "talents", &id);
            } else if combined.contains("battle-imagine") || combined.contains("imagine") {
                push_category_key(&mut keys, "battle-imagines", &id);
                push_category_key(&mut keys, "buffs", &id);
            } else if combined.contains("item") || combined.contains("consumable") {
                push_category_key(&mut keys, "items", &id);
                push_category_key(&mut keys, "buffs", &id);
            } else if combined.contains("buff") || combined.contains("set-effect") {
                push_category_key(&mut keys, "buffs", &id);
            }
        }
    }

    keys
}

fn merge_formula_terms_from_value(meta: &mut SourceMeta, value: &Value) {
    for term in as_string_array(value.get("formulaTermIds")) {
        meta.formula_term_ids.insert(term);
    }
    for group in as_string_array(value.get("contributionGroups")) {
        meta.contribution_groups.insert(group);
    }
}

fn merge_formula_terms_from_array(meta: &mut SourceMeta, entry: &Value, key: &str) {
    for item in entry
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        merge_formula_terms_from_value(meta, item);
    }
}

fn has_value_rows(entry: &Value, key: &str) -> bool {
    entry
        .get(key)
        .and_then(Value::as_array)
        .map(|items| !items.is_empty())
        .unwrap_or(false)
}

fn entry_has_selected_value_data(entry: &Value) -> bool {
    has_value_rows(entry, "selectedValues")
        || has_value_rows(entry, "valueRows")
        || entry
            .get("components")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .any(|component| {
                has_value_rows(component, "selectedValues")
                    || has_value_rows(component, "valueRows")
            })
        || entry
            .get("valueSelectors")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .any(|selector| {
                has_value_rows(selector, "selectedValues") || has_value_rows(selector, "valueRows")
            })
}

fn add_normalized_requirement(meta: &mut SourceMeta, requirement: &str) {
    let lower = requirement.to_ascii_lowercase();
    if lower.contains("description-derived value mapped") {
        return;
    }
    if lower.contains("not an outgoing damage formula value") {
        meta.status = "defensive-or-non-damage".to_string();
        return;
    }
    if lower.contains("decision placeholder") || lower.contains("parameter source") {
        meta.required_evidence
            .insert("modifier value or component amount".to_string());
    } else if lower.contains("seasonal factor") || lower.contains("factor grade") {
        meta.required_evidence
            .insert("selected seasonal factor grade/loadout".to_string());
    } else if lower.contains("cast timeline")
        || lower.contains("cooldown")
        || lower.contains("resource model")
    {
        meta.required_evidence
            .insert("cast timeline/cooldown state".to_string());
    } else if lower.contains("hit timestamp") || lower.contains("per-hit") {
        meta.required_evidence.insert("hit timestamp".to_string());
    } else if lower.contains("stat snapshot") || lower.contains("stat conversion") {
        meta.required_evidence
            .insert("attacker stat snapshot at hit time".to_string());
    } else if lower.contains("stack") {
        meta.required_evidence
            .insert("stack count/max stack at hit time".to_string());
    } else if lower.contains("battle imagine owner") || lower.contains("source actor uid") {
        meta.required_evidence
            .insert("battle imagine owner/source actor uid".to_string());
    } else if lower.contains("recipient actor")
        || lower.contains("owner")
        || lower.contains("party")
        || lower.contains("target scope")
    {
        meta.required_evidence
            .insert("owner/party/target scope selector".to_string());
    } else if lower.contains("uid observed")
        || lower.contains("selected, equipped")
        || lower.contains("otherwise active")
    {
        meta.required_evidence
            .insert("modifier windows".to_string());
    } else {
        meta.required_evidence.insert(requirement.to_string());
    }
}

fn add_value_blocker_requirement(meta: &mut SourceMeta, blocker: &str) {
    let lower = blocker.to_ascii_lowercase();
    if lower.contains("missing-component-value")
        || lower.contains("value-selection")
        || lower.contains("value-data")
        || lower.contains("scope-value")
        || lower.contains("decision")
    {
        meta.required_evidence
            .insert("modifier value or component amount".to_string());
    } else if lower.contains("seasonal-factor") {
        meta.required_evidence
            .insert("selected seasonal factor grade/loadout".to_string());
    } else if lower.contains("timing") || lower.contains("cast") || lower.contains("cooldown") {
        meta.required_evidence
            .insert("cast timeline/cooldown state".to_string());
    } else if lower.contains("skill-stage") || lower.contains("charge") {
        meta.required_evidence
            .insert("skill stage/charge selector".to_string());
    } else if lower.contains("ladder") {
        meta.required_evidence
            .insert("value ladder selector".to_string());
    } else if lower.contains("threshold") || lower.contains("counter") {
        meta.required_evidence
            .insert("threshold/counter state".to_string());
    } else if lower.contains("ramp") || lower.contains("stack") {
        meta.required_evidence
            .insert("stack count/max stack at hit time".to_string());
    } else if lower.contains("polarity") {
        meta.required_evidence
            .insert("modifier value polarity".to_string());
    } else {
        meta.required_evidence.insert(blocker.to_string());
    }
}

fn add_entry_status_requirements(meta: &mut SourceMeta, entry: &Value) {
    for zone in as_string_array(entry.get("formulaZoneIds")) {
        meta.contribution_groups
            .insert(format!("formulaZone:{zone}"));
    }

    let formula_readiness = entry
        .get("formulaReadiness")
        .and_then(Value::as_str)
        .unwrap_or("");
    let value_status = entry
        .get("valueProofStatus")
        .and_then(Value::as_str)
        .unwrap_or("");
    let value_resolution = entry
        .get("valueResolution")
        .and_then(Value::as_str)
        .unwrap_or("");
    let stack_policy = entry
        .get("stackPolicy")
        .and_then(Value::as_str)
        .unwrap_or("");
    let combined_status =
        format!("{formula_readiness} {value_status} {value_resolution} {stack_policy}")
            .to_ascii_lowercase();

    if combined_status.contains("packet-exact-produced-damage") {
        meta.contribution_groups
            .insert("packetExactDamage".to_string());
        if meta.status == "uptime-only" || meta.status == "generated" || meta.status == "uptime" {
            meta.status = "packet-exact".to_string();
        }
    }
    if combined_status.contains("proc-damage") {
        meta.contribution_groups.insert("procDamage".to_string());
        meta.status = "proc-damage".to_string();
    }
    if combined_status.contains("non-damage-or-support") {
        meta.contribution_groups
            .insert("nonDamageOrSupport".to_string());
        meta.status = "defensive-or-non-damage".to_string();
        meta.required_evidence
            .remove("modifier to formula-term classification");
    } else if formula_readiness == "overlap-only" {
        meta.contribution_groups.insert("overlapOnly".to_string());
        if meta.status == "uptime-only" || meta.status == "generated" || meta.status == "uptime" {
            meta.status = "overlap-only".to_string();
        }
        meta.required_evidence
            .remove("modifier to formula-term classification");
    } else if formula_readiness == "identity-only" {
        meta.contribution_groups.insert("identityOnly".to_string());
        if meta.status == "uptime-only" || meta.status == "generated" || meta.status == "uptime" {
            meta.status = "identity-only".to_string();
        }
        meta.required_evidence
            .remove("modifier to formula-term classification");
    }
    let direct_packet_damage_value_not_required = value_status == "packet-exact-value-not-required"
        || formula_readiness == "packet-exact-produced-damage";
    let value_not_required =
        direct_packet_damage_value_not_required || formula_readiness == "non-damage-or-support";
    if !value_not_required
        && (combined_status.contains("no-value")
            || combined_status.contains("missing-value-data")
            || combined_status.contains("parameter-unresolved")
            || combined_status.contains("ambiguous"))
    {
        meta.required_evidence
            .insert("modifier value or component amount".to_string());
    }

    if direct_packet_damage_value_not_required {
        meta.required_evidence
            .remove("modifier value or component amount");
        meta.required_evidence
            .remove("modifier to formula-term classification");
        return;
    }

    if combined_status.contains("stat-conversion") {
        meta.required_evidence
            .insert("attacker stat snapshot at hit time".to_string());
    }
    if combined_status.contains("timing-model") || combined_status.contains("timing-cadence") {
        meta.required_evidence
            .insert("cast timeline/cooldown state".to_string());
        meta.required_evidence
            .insert("timing/cadence contribution model".to_string());
    }
    if combined_status.contains("seasonal-factor-selector") {
        meta.required_evidence
            .insert("selected seasonal factor grade/loadout".to_string());
    }
    if combined_status.contains("skill-stage") {
        meta.required_evidence
            .insert("skill stage/charge selector".to_string());
    }
    if combined_status.contains("ladder") {
        meta.required_evidence
            .insert("value ladder selector".to_string());
    }
    if combined_status.contains("threshold") {
        meta.required_evidence
            .insert("threshold/counter state".to_string());
    }
    if combined_status.contains("ramp") || combined_status.contains("runtime-stack") {
        meta.required_evidence
            .insert("stack count/max stack at hit time".to_string());
    }
    if combined_status.contains("polarity") {
        meta.required_evidence
            .insert("modifier value polarity".to_string());
    }

    let scopes = as_string_array(entry.get("scopeKinds"));
    let scoped = scopes
        .iter()
        .filter(|scope| {
            matches!(
                scope.as_str(),
                "owner" | "self" | "party" | "target" | "ally" | "recipient"
            )
        })
        .count();
    if scoped > 1 {
        meta.required_evidence
            .insert("owner/party/target scope selector".to_string());
    }

    for key in ["runtimeProofRequired", "proofRequirements"] {
        for requirement in as_string_array(entry.get(key)) {
            add_normalized_requirement(meta, &requirement);
        }
    }
    for key in ["valueBlockers", "proofBlockers"] {
        for blocker in as_string_array(entry.get(key)) {
            add_value_blocker_requirement(meta, &blocker);
        }
    }
}

fn merge_formula_value_entry(meta: &mut SourceMeta, entry: &Value) {
    add_entry_status_requirements(meta, entry);
    merge_formula_terms_from_array(meta, entry, "selectedValues");
    merge_formula_terms_from_array(meta, entry, "valueRows");
    for component in entry
        .get("components")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        merge_formula_terms_from_value(meta, component);
        merge_formula_terms_from_array(meta, component, "selectedValues");
    }
    for selector in entry
        .get("valueSelectors")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        merge_formula_terms_from_value(meta, selector);
        merge_formula_terms_from_array(meta, selector, "selectedValues");
        add_entry_status_requirements(meta, selector);
    }
    if entry_has_selected_value_data(entry) {
        meta.required_evidence
            .remove("modifier value or component amount");
    }
}

fn merge_formula_value_meta(
    index: &GeneratedIndex,
    meta: &mut SourceMeta,
    source_rule_id: &str,
    category_keys: &[String],
) {
    let mut formula_keys = category_keys.to_vec();
    if let Some(keys) = index.modifier_formula_keys_by_rule_id.get(source_rule_id) {
        for key in keys {
            push_unique(&mut formula_keys, key.clone());
        }
    }
    let mut value_keys = category_keys.to_vec();
    if let Some(keys) = index
        .modifier_value_proof_keys_by_rule_id
        .get(source_rule_id)
    {
        for key in keys {
            push_unique(&mut value_keys, key.clone());
        }
    }

    for key in &formula_keys {
        if let Some(entry) = index.modifier_formula_terms_by_key.get(key) {
            merge_formula_value_entry(meta, entry);
        }
    }
    for key in &value_keys {
        if let Some(entry) = index.modifier_value_proof_by_key.get(key) {
            merge_formula_value_entry(meta, entry);
        }
    }

    if has_formula_classification(meta) {
        meta.required_evidence
            .remove("modifier to formula-term classification");
    } else if meta.status == "uptime-only" {
        meta.required_evidence
            .insert("modifier to formula-term classification".to_string());
    }
}

fn source_meta(index: &GeneratedIndex, source_id: &str) -> SourceMeta {
    if let Some(row) = index.effect_sources_by_id.get(source_id) {
        let mut meta = source_meta_from_generated_row(source_id, row, "effect-source", "generated");
        let keys = category_keys_for_source_row(source_id, row);
        merge_formula_value_meta(index, &mut meta, source_id, &keys);
        return meta;
    }

    if let Some(row) = index.modifier_sources_by_id.get(source_id) {
        let mut meta =
            source_meta_from_generated_row(source_id, row, "modifier-source", "generated");
        let row_source_id = row.get("sourceId").and_then(Value::as_str);
        let mut merged_contribution_rule_ids = BTreeSet::new();
        if let Some(contribution) = index.modifier_contribution_by_rule_id.get(source_id) {
            merge_source_meta_from_generated_row(&mut meta, contribution);
            merged_contribution_rule_ids.insert(source_id.to_string());
        }
        if let Some(row_source_id) = row_source_id {
            if let Some(rule_ids) = index
                .modifier_contribution_rule_ids_by_source_id
                .get(row_source_id)
            {
                for rule_id in rule_ids {
                    if merged_contribution_rule_ids.insert(rule_id.clone()) {
                        if let Some(contribution) =
                            index.modifier_contribution_by_rule_id.get(rule_id)
                        {
                            merge_source_meta_from_generated_row(&mut meta, contribution);
                        }
                    }
                }
            }
        }
        if let Some(display) = index.modifier_display_by_rule_id.get(source_id) {
            meta.label = value_label(display, &meta.label);
        } else if let Some(row_source_id) = row_source_id {
            if let Some(rule_ids) = index
                .modifier_display_rule_ids_by_source_id
                .get(row_source_id)
            {
                if let Some(display) = rule_ids
                    .iter()
                    .find_map(|rule_id| index.modifier_display_by_rule_id.get(rule_id))
                {
                    meta.label = value_label(display, &meta.label);
                }
            }
        }
        if (meta.label == source_id || meta.label.starts_with("mrs:")) && row_source_id.is_some() {
            if let Some(label) = row_source_id
                .and_then(|row_source_id| label_for_prefixed_source_id(index, row_source_id))
            {
                meta.label = label;
            }
        }
        let keys = category_keys_for_source_row(source_id, row);
        merge_formula_value_meta(index, &mut meta, source_id, &keys);
        return meta;
    }

    if let Some(buff_id) = source_id.strip_prefix("phantom-factor:") {
        if let Some(row) = index.factors_by_buff_id.get(buff_id) {
            let mut required_evidence = BTreeSet::new();
            required_evidence.insert("modifier windows".to_string());
            required_evidence.insert("observed final hit value".to_string());
            required_evidence.insert("damage id".to_string());
            required_evidence.insert("modifier to formula-term classification".to_string());
            let mut meta = SourceMeta {
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
            let mut keys = Vec::new();
            push_category_key(&mut keys, "factors", buff_id);
            push_category_key(&mut keys, "buffs", buff_id);
            merge_formula_value_meta(index, &mut meta, source_id, &keys);
            return meta;
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
    let mut meta = SourceMeta {
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
    };
    let mut keys = Vec::new();
    push_source_id_category_keys(&mut keys, source_id);
    merge_formula_value_meta(index, &mut meta, source_id, &keys);
    meta
}

fn is_ignored_modifier_buff_id(id: i64) -> bool {
    IGNORED_MODIFIER_BUFF_IDS.contains(&id)
}

fn is_ignored_modifier_buff(index: &GeneratedIndex, id: i64) -> bool {
    is_ignored_modifier_buff_id(id) || index.modifier_ignored_buff_ids.contains(&id)
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
        .modifier_source_ids_by_buff_id
        .get(&buff_id.to_string())
        .cloned()
        .unwrap_or_default();
    if !result.is_empty() {
        result.sort();
        result.dedup();
        return result;
    }

    result = index
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
    if source_config_id == base_id || is_ignored_modifier_buff(index, source_config_id) {
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
    source_ids_for_modifier_ids(
        index,
        bucket.modifier_base_id as i64,
        bucket.modifier_source_config_id.map(i64::from),
    )
}

fn source_ids_for_replay_source(
    index: &GeneratedIndex,
    source: &ObservedModifierReplaySource,
) -> Vec<String> {
    source_ids_for_modifier_ids(
        index,
        source.modifier_base_id as i64,
        source.modifier_source_config_id.map(i64::from),
    )
}

fn source_ids_for_modifier_ids(
    index: &GeneratedIndex,
    modifier_base_id: i64,
    modifier_source_config_id: Option<i64>,
) -> Vec<String> {
    let Some(base_id) = positive_id(modifier_base_id) else {
        return Vec::new();
    };
    if is_ignored_modifier_buff(index, base_id) {
        return Vec::new();
    }
    let source_config_id = modifier_source_config_id.and_then(positive_id);
    if source_config_id.is_some_and(|id| is_ignored_modifier_buff(index, id)) {
        return Vec::new();
    }

    let preferred_id = preferred_observed_buff_source_id(index, base_id, source_config_id);
    if is_ignored_modifier_buff(index, preferred_id) {
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

fn has_damage_formula_candidate(meta: &SourceMeta) -> bool {
    !meta.formula_term_ids.is_empty()
        || meta.contribution_groups.iter().any(|group| {
            group.starts_with("formulaZone:")
                || group == "packetExactDamage"
                || group == "procDamage"
                || group == "skillCoefficient"
        })
}

fn is_timing_only_formula_candidate(meta: &SourceMeta) -> bool {
    meta.formula_term_ids.is_empty()
        && meta
            .contribution_groups
            .contains("formulaZone:timingCadence")
        && !meta
            .contribution_groups
            .iter()
            .any(|group| group.starts_with("formulaZone:") && group != "formulaZone:timingCadence")
}

fn is_direct_proc_damage(meta: &SourceMeta) -> bool {
    meta.formula_term_ids.is_empty() && meta.contribution_groups.contains("procDamage")
}

fn is_packet_exact_damage(meta: &SourceMeta) -> bool {
    meta.contribution_groups.contains("packetExactDamage")
}

fn is_packet_exact_window_only(meta: &SourceMeta, missing: &BTreeSet<String>) -> bool {
    (is_packet_exact_damage(meta) || is_direct_proc_damage(meta))
        && !missing.is_empty()
        && missing.iter().all(|item| {
            item == "target damage/recount id match"
                || item == "packet emitted damage row is the contribution truth for this UID"
        })
}

fn missing_contains_any<'a, I>(missing: &BTreeSet<String>, needles: I) -> bool
where
    I: IntoIterator<Item = &'a str>,
{
    let needles: Vec<&str> = needles.into_iter().collect();
    missing
        .iter()
        .any(|item| needles.iter().any(|needle| item.contains(needle)))
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

fn damage_linked_source_ids(index: &GeneratedIndex, damage_id: i64) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    if damage_id <= 0 {
        return ids;
    }
    if let Some(source_ids) = index
        .damage_id_to_effect_source_ids
        .get(&damage_id.to_string())
    {
        for source_id in source_ids {
            ids.insert(source_id.clone());
        }
    }
    if let Some(buff_ids) = index
        .damage_id_to_factor_buff_ids
        .get(&damage_id.to_string())
    {
        for buff_id in buff_ids {
            ids.insert(format!("phantom-factor:{buff_id}"));
        }
    }
    ids
}

fn contribution_rule_targets_damage_id(
    index: &GeneratedIndex,
    source_id: &str,
    damage_id: i64,
) -> bool {
    if damage_id <= 0 {
        return false;
    }
    index
        .modifier_contribution_by_rule_id
        .get(source_id)
        .map(|row| as_i64_array(row.get("targetDamageIds")).contains(&damage_id))
        .unwrap_or(false)
}

fn timeline_evidence_for_effect(
    hit: &ObservedModifierReplayHit,
    active_source: &ObservedModifierReplaySource,
    player_uid: i64,
    meta: &SourceMeta,
    index: &GeneratedIndex,
) -> BTreeSet<String> {
    let mut evidence = BTreeSet::new();
    if hit.timestamp_ms > 0 {
        evidence.insert("hit timestamp".to_string());
    }
    if hit.value > 0 {
        evidence.insert("observed final hit value".to_string());
        evidence.insert("damage hit value".to_string());
    }
    if hit.effective_value > 0 {
        evidence.insert("effective damage value".to_string());
    }
    if hit.skill_key > 0 {
        evidence.insert("skill key".to_string());
        evidence.insert("skill id".to_string());
    }
    if hit.damage_id > 0 {
        evidence.insert("damage id".to_string());
        evidence.insert("produced damage row id".to_string());
        evidence.insert("damage element mapping by damage id".to_string());
    }
    if hit.target_uid > 0 {
        evidence.insert("target uid".to_string());
    }
    if player_uid > 0 {
        evidence.insert("attacker uid".to_string());
    }
    if hit.target_monster_type_id.is_some() {
        evidence.insert("target monster config id".to_string());
        evidence.insert("target predicate evaluation, such as elite-or-stronger".to_string());
    }
    if active_source.modifier_base_id > 0 || active_source.modifier_source_config_id.is_some() {
        evidence.insert("modifier windows".to_string());
        evidence.insert("sourceRuleId active on hit".to_string());
        evidence.insert("active buff window".to_string());
        evidence.insert("cast timeline/cooldown state".to_string());
        evidence.insert("cast timeline or cooldown state".to_string());
        evidence.insert("cast timeline or per-hit window buckets".to_string());
        evidence.insert("target-side buff/debuff/window state at hit time".to_string());
    }
    if active_source.modifier_source_uid > 0 {
        evidence.insert("battle imagine owner/source actor uid".to_string());
        evidence.insert("owner/party/target scope selector".to_string());
        evidence.insert("source actor".to_string());
        evidence.insert("source predicate evaluation, such as companion or summon".to_string());
    }
    if active_source.modifier_source_uid > 0 && hit.target_uid > 0 {
        evidence.insert("target/source predicate evaluation".to_string());
    }
    if active_source.modifier_host_uid > 0 {
        evidence.insert("modifier host uid".to_string());
    }
    if active_source.modifier_count.is_some() || active_source.modifier_layer > 0 {
        evidence.insert("stack count/max stack at hit time".to_string());
    }
    if !hit.attacker_attrs.is_empty() {
        evidence.insert("attacker stat snapshot at hit time".to_string());
        evidence.insert("attacker crit-rate snapshot at hit time".to_string());
        evidence.insert("attacker crit-damage snapshot at hit time".to_string());
        evidence.insert("attacker elemental damage snapshot at hit time".to_string());
        evidence.insert("damage row ATK/MATK lane".to_string());
    }
    if !hit.target_attrs.is_empty() {
        evidence.insert("target resistance or defense snapshot at hit time".to_string());
    }
    if hit.hit_event_id.is_some() {
        evidence.insert("hit event id".to_string());
    }
    evidence.insert("crit flag".to_string());
    evidence.insert("lucky flag".to_string());

    if has_formula_classification(meta) {
        evidence.insert("modifier to formula-term classification".to_string());
    }
    if skill_has_coefficient_data(index, hit.damage_id) {
        evidence.insert("skill coefficient mapping by damage id".to_string());
    }
    let linked_source_ids = damage_linked_source_ids(index, hit.damage_id);
    if linked_source_ids.contains(&meta.source_id)
        || contribution_rule_targets_damage_id(index, &meta.source_id, hit.damage_id)
    {
        evidence.insert("target damage/recount id match".to_string());
        evidence
            .insert("packet emitted damage row is the contribution truth for this UID".to_string());
    }
    if meta.source_id.starts_with("phantom-factor:")
        && (active_source.modifier_count.is_some() || active_source.modifier_buff_level.is_some())
    {
        evidence.insert("selected seasonal factor grade/loadout".to_string());
    }
    evidence
}

fn classify_timeline_proof(meta: &SourceMeta, missing: &BTreeSet<String>) -> String {
    if meta.status == "defensive-or-non-damage" {
        return "not-offensive-damage".to_string();
    }
    if meta.status == "timing-only" {
        return "timing-only".to_string();
    }
    if meta.status == "identity-only" {
        return "identity-only".to_string();
    }
    if missing.contains("generated effect-source bridge") {
        return "missing-generated-source".to_string();
    }
    if missing.contains("owner/party/target scope selector") {
        return "needs-scope-proof".to_string();
    }
    if missing.contains("stack count/max stack at hit time") {
        return "needs-stack-proof".to_string();
    }
    if missing.contains("attacker stat snapshot at hit time")
        || missing.contains("target resistance or defense snapshot at hit time")
    {
        return "needs-stat-snapshot".to_string();
    }
    if missing.contains("skill coefficient mapping by damage id") {
        return "needs-skill-coefficient".to_string();
    }
    if missing_contains_any(missing, ["timing/cadence contribution model"]) {
        return "needs-timing-model".to_string();
    }
    if missing_contains_any(
        missing,
        [
            "tier",
            "level",
            "value ladder",
            "grade/loadout",
            "skill stage",
            "skill variant",
        ],
    ) {
        return "needs-runtime-selector".to_string();
    }
    if missing_contains_any(missing, ["expected-value model"]) {
        return "needs-expected-value-model".to_string();
    }
    if missing_contains_any(
        missing,
        [
            "stat-conversion",
            "damage row ATK/MATK",
            "physical/magic lane",
        ],
    ) {
        return "needs-stat-conversion".to_string();
    }
    if missing.contains("modifier value or component amount") {
        if is_timing_only_formula_candidate(meta) {
            return "needs-timing-model".to_string();
        }
        if meta.status == "observed-only" || meta.source_kind == "runtime-buff" {
            return "needs-static-description-bridge".to_string();
        }
        if !has_damage_formula_candidate(meta) {
            return "needs-formula-zone-proof".to_string();
        }
    }
    if is_packet_exact_window_only(meta, missing) {
        if is_packet_exact_damage(meta) {
            return "packet-exact-window-only".to_string();
        }
        return "proc-damage-window-only".to_string();
    }
    if missing.contains("target damage/recount id match")
        || missing.contains("packet emitted damage row is the contribution truth for this UID")
    {
        return "needs-damage-link".to_string();
    }
    if missing
        .iter()
        .any(|item| item.contains("predicate evaluation"))
    {
        return "needs-predicate-proof".to_string();
    }
    if missing.contains("sourceRuleId active on hit") {
        return "needs-active-window-proof".to_string();
    }
    if missing.contains("modifier value or component amount") {
        return "needs-value-proof".to_string();
    }
    if !missing.is_empty() && is_packet_exact_damage(meta) {
        return "packet-exact-blocked".to_string();
    }
    if !missing.is_empty() && is_direct_proc_damage(meta) {
        return "proc-damage-blocked".to_string();
    }
    if !missing.is_empty() && has_formula_classification(meta) {
        return "formula-replay-blocked".to_string();
    }
    if missing.is_empty() && is_packet_exact_damage(meta) {
        return "packet-exact-proofed".to_string();
    }
    if missing.is_empty() && is_direct_proc_damage(meta) {
        return "proc-damage-proofed".to_string();
    }
    if missing.is_empty() && has_formula_classification(meta) {
        return "formula-replay-proofed".to_string();
    }
    if missing.is_empty() {
        return "identity-proofed".to_string();
    }
    "overlap-only".to_string()
}

fn is_timeline_proof_ready(status: &str) -> bool {
    status.ends_with("-proofed")
}

fn is_timeline_proof_blocked(status: &str) -> bool {
    status.contains("blocked") || status.starts_with("needs-") || status.starts_with("missing-")
}

fn next_dev_action_for_effect(status: &str, missing: &[String]) -> String {
    if status == "packet-exact-window-only" || status == "proc-damage-window-only" {
        return "window-only-not-contribution".to_string();
    }
    if !is_timeline_proof_blocked(status) {
        return "no-blocker".to_string();
    }
    if status == "needs-static-description-bridge" {
        return "resolve-static-description-bridge".to_string();
    }
    if status == "needs-formula-zone-proof" {
        return "classify-formula-zone".to_string();
    }
    if status == "needs-timing-model" {
        return "model-timing-cadence".to_string();
    }
    if missing.iter().any(|item| {
        item.contains("tier")
            || item.contains("level")
            || item.contains("value ladder")
            || item.contains("grade/loadout")
    }) {
        return "resolve-runtime-selector".to_string();
    }
    if missing
        .iter()
        .any(|item| item.contains("expected-value model"))
    {
        return "model-expected-value".to_string();
    }
    if missing
        .iter()
        .any(|item| item.contains("timing/cadence contribution model"))
    {
        return "model-timing-cadence".to_string();
    }
    if missing.iter().any(|item| {
        item.contains("damage/recount id match")
            || item.contains("packet emitted damage row")
            || item.contains("parent hit pairing")
    }) {
        return "map-damage-link".to_string();
    }
    if missing.iter().any(|item| {
        item.contains("stat snapshot")
            || item.contains("stat-conversion")
            || item.contains("damage row ATK/MATK")
            || item.contains("physical/magic lane")
    }) {
        return "prove-stat-conversion".to_string();
    }
    if missing
        .iter()
        .any(|item| item.contains("stack count") || item.contains("threshold/counter"))
    {
        return "prove-stack-state".to_string();
    }
    if missing.iter().any(|item| {
        item.contains("predicate")
            || item.contains("target-side")
            || item.contains("source actor")
            || item.contains("scope selector")
    }) {
        return "prove-scope-or-predicate".to_string();
    }
    if missing
        .iter()
        .any(|item| item.contains("skill stage") || item.contains("skill variant"))
    {
        return "resolve-skill-variant".to_string();
    }
    if missing
        .iter()
        .any(|item| item.contains("modifier value") || item.contains("component amount"))
    {
        return "extract-modifier-value".to_string();
    }
    status.to_string()
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
    player_total: f64,
    duplicate_bucket_rows: usize,
    linked_source_ambiguous: bool,
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
    if meta.status == "overlap-only" {
        return "overlap-only".to_string();
    }
    if meta.status == "identity-only" {
        return "uptime-only".to_string();
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
    if duplicate_bucket_rows > 0 {
        return "duplicate-pressure".to_string();
    }
    if player_total > 0.0 && total_value > player_total {
        return "overlap-over-player-total".to_string();
    }
    if missing.is_empty() && is_direct_proc_damage(meta) {
        return "proc-damage".to_string();
    }
    if missing.is_empty() && is_packet_exact_damage(meta) {
        return "packet-exact-produced-damage".to_string();
    }
    if missing.is_empty() && linked_source_ambiguous && !meta.formula_term_ids.is_empty() {
        return "linked-source-ambiguity".to_string();
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
             LIMIT {}
             OFFSET {}",
            options.latest, options.latest_offset
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

fn timeline_bin_start(timestamp_ms: i64, encounter: &EncounterBlob, bin_ms: i64) -> i64 {
    let relative_ms = (timestamp_ms - encounter.started_at_ms).max(0);
    encounter.started_at_ms + (relative_ms / bin_ms.max(1)) * bin_ms.max(1)
}

fn observed_attr_value(attr: &ObservedFormulaAttr) -> Option<f64> {
    if let Some(value) = attr.value_float {
        return Some(value);
    }
    if let Some(value) = attr.value_int {
        return Some(value as f64);
    }
    attr.value_bool.map(|value| if value { 1.0 } else { 0.0 })
}

fn add_attr_value(agg: &mut BTreeMap<i32, AttrValueAgg>, attr: &ObservedFormulaAttr) {
    if attr.attr_id <= 0 {
        return;
    }
    let Some(value) = observed_attr_value(attr) else {
        return;
    };
    agg.entry(attr.attr_id)
        .and_modify(|existing| {
            existing.samples += 1;
            existing.min = existing.min.min(value);
            existing.max = existing.max.max(value);
            existing.last = value;
        })
        .or_insert_with(|| AttrValueAgg {
            samples: 1,
            min: value,
            max: value,
            first: value,
            last: value,
        });
}

fn formula_attr_name(attr_id: i32) -> String {
    match attr_id {
        11010 => "PanelStrength".to_string(),
        11020 => "PanelIntelligence".to_string(),
        11030 => "PanelAgility".to_string(),
        11340 => "PanelMagicAttack".to_string(),
        11710 => "PanelCritRate".to_string(),
        11730 => "PanelCastSpeed".to_string(),
        11780 => "PanelLucky".to_string(),
        11930 => "PanelHaste".to_string(),
        11940 => "PanelMastery".to_string(),
        11950 => "PanelVersatility".to_string(),
        11970 => "PanelBlock".to_string(),
        12510 => "PanelCritDamage".to_string(),
        12530 => "PanelLuckyDamageMultiplier".to_string(),
        12540 => "PanelBlockDamageReduction".to_string(),
        _ => AttrType::from_id(attr_id)
            .map(|attr| format!("{attr:?}"))
            .unwrap_or_else(|| format!("Unknown({attr_id})")),
    }
}

fn finalize_attr_values(values: BTreeMap<i32, AttrValueAgg>) -> Vec<ProofTimelineAttrStats> {
    values
        .into_iter()
        .map(|(attr_id, agg)| ProofTimelineAttrStats {
            attr_id,
            attr_name: formula_attr_name(attr_id),
            samples: agg.samples,
            min: agg.min,
            max: agg.max,
            first: agg.first,
            last: agg.last,
        })
        .collect()
}

fn add_replay_hit_to_timeline(
    timeline: &mut BTreeMap<ProofTimelineKey, ProofTimelineAgg>,
    encounter: &EncounterBlob,
    player_uid: i64,
    entity: &Entity,
    hit: &ObservedModifierReplayHit,
    index: &GeneratedIndex,
    source_meta_cache: &mut HashMap<String, SourceMeta>,
    replay_source_id_cache: &mut HashMap<(i32, Option<i32>), Vec<String>>,
    bin_ms: i64,
) -> usize {
    if hit.is_heal || hit.active_modifiers.is_empty() {
        return 0;
    }

    let bin_start_ms = timeline_bin_start(hit.timestamp_ms, encounter, bin_ms);
    let bin_end_ms = bin_start_ms + bin_ms.max(1);
    let skill_key = if hit.skill_key > 0 {
        hit.skill_key
    } else {
        hit.damage_id
    };
    let skill_label = skill_label(index, skill_key, hit.damage_id);
    let mut source_links = 0usize;

    let key = ProofTimelineKey {
        encounter_id: encounter.id,
        player_uid,
        bin_start_ms,
        skill_key,
        damage_id: hit.damage_id,
        target_uid: hit.target_uid,
    };
    let agg = timeline.entry(key).or_insert_with(|| ProofTimelineAgg {
        encounter_id: encounter.id,
        scene_name: encounter
            .scene_name
            .clone()
            .unwrap_or_else(|| "Unknown Scene".to_string()),
        started_at_ms: encounter.started_at_ms,
        bin_start_ms,
        bin_end_ms,
        first_hit_ms: hit.timestamp_ms,
        last_hit_ms: hit.timestamp_ms,
        player_uid,
        player_name: entity.name.clone(),
        skill_key,
        damage_id: hit.damage_id,
        skill_label,
        target_uid: hit.target_uid,
        target_monster_type_id: hit.target_monster_type_id,
        active_effects: BTreeMap::new(),
        hit_event_count_with_id: 0,
        first_hit_event_id: None,
        last_hit_event_id: None,
        hits: 0,
        total_value: 0.0,
        effective_value: 0.0,
        hp_loss_value: 0.0,
        shield_loss_value: 0.0,
        crit_hits: 0,
        lucky_hits: 0,
        attacker_attr_ids: BTreeSet::new(),
        target_attr_ids: BTreeSet::new(),
        attacker_attr_values: BTreeMap::new(),
        target_attr_values: BTreeMap::new(),
    });

    agg.first_hit_ms = agg.first_hit_ms.min(hit.timestamp_ms);
    agg.last_hit_ms = agg.last_hit_ms.max(hit.timestamp_ms);
    agg.hits += 1;
    agg.total_value += u128_to_f64(hit.value);
    agg.effective_value += u128_to_f64(hit.effective_value);
    agg.hp_loss_value += u128_to_f64(hit.hp_loss_value);
    agg.shield_loss_value += u128_to_f64(hit.shield_loss_value);
    if hit.is_crit {
        agg.crit_hits += 1;
    }
    if hit.is_lucky {
        agg.lucky_hits += 1;
    }
    if let Some(hit_event_id) = hit.hit_event_id {
        agg.hit_event_count_with_id += 1;
        if agg.first_hit_event_id.is_none() {
            agg.first_hit_event_id = Some(hit_event_id);
        }
        agg.last_hit_event_id = Some(hit_event_id);
    }
    for attr in &hit.attacker_attrs {
        if attr.attr_id > 0 {
            agg.attacker_attr_ids.insert(attr.attr_id);
        }
        add_attr_value(&mut agg.attacker_attr_values, attr);
    }
    for attr in &hit.target_attrs {
        if attr.attr_id > 0 {
            agg.target_attr_ids.insert(attr.attr_id);
        }
        add_attr_value(&mut agg.target_attr_values, attr);
    }

    for active_source in &hit.active_modifiers {
        let source_ids = replay_source_id_cache
            .entry((
                active_source.modifier_base_id,
                active_source.modifier_source_config_id,
            ))
            .or_insert_with(|| source_ids_for_replay_source(index, active_source))
            .clone();

        for source_id in source_ids {
            let source = source_meta_cache
                .entry(source_id.clone())
                .or_insert_with(|| source_meta(index, &source_id))
                .clone();
            let evidence_present =
                timeline_evidence_for_effect(hit, active_source, player_uid, &source, index);
            source_links += 1;

            let effect_uid = active_source
                .modifier_source_config_id
                .unwrap_or(active_source.modifier_base_id);
            let effect_key = ProofTimelineEffectKey {
                source_id,
                effect_uid,
                modifier_base_id: active_source.modifier_base_id,
                modifier_source_config_id: active_source.modifier_source_config_id,
                modifier_host_uid: active_source.modifier_host_uid,
                modifier_source_uid: active_source.modifier_source_uid,
                modifier_count: active_source.modifier_count,
                modifier_layer: active_source.modifier_layer,
            };
            let effect =
                agg.active_effects
                    .entry(effect_key)
                    .or_insert_with(|| ProofTimelineEffectAgg {
                        source,
                        effect_uid,
                        modifier_base_id: active_source.modifier_base_id,
                        modifier_source_config_id: active_source.modifier_source_config_id,
                        modifier_buff_level: active_source.modifier_buff_level,
                        modifier_count: active_source.modifier_count,
                        modifier_layer: active_source.modifier_layer,
                        modifier_host_uid: active_source.modifier_host_uid,
                        modifier_source_uid: active_source.modifier_source_uid,
                        hits: 0,
                        evidence_present: BTreeSet::new(),
                        required_evidence: BTreeSet::new(),
                    });
            effect.hits += 1;
            for evidence in evidence_present {
                effect.evidence_present.insert(evidence);
            }
            for evidence in &effect.source.required_evidence {
                effect.required_evidence.insert(evidence.clone());
            }
        }
    }

    source_links
}

fn finalize_proof_timeline_row(agg: ProofTimelineAgg) -> ProofTimelineRow {
    let mut active_effects: Vec<ProofTimelineEffectRow> = agg
        .active_effects
        .into_values()
        .map(|effect| {
            let missing_evidence =
                missing_evidence(&effect.required_evidence, &effect.evidence_present);
            let proof_status = classify_timeline_proof(&effect.source, &missing_evidence);
            ProofTimelineEffectRow {
                source_id: effect.source.source_id,
                source_label: effect.source.label,
                source_kind: effect.source.source_kind,
                source_type: effect.source.source_type,
                generated_status: effect.source.status,
                proof_status,
                effect_uid: effect.effect_uid,
                modifier_base_id: effect.modifier_base_id,
                modifier_source_config_id: effect.modifier_source_config_id,
                modifier_buff_level: effect.modifier_buff_level,
                modifier_count: effect.modifier_count,
                modifier_layer: effect.modifier_layer,
                modifier_host_uid: effect.modifier_host_uid,
                modifier_source_uid: effect.modifier_source_uid,
                external_source: effect.modifier_source_uid > 0
                    && effect.modifier_source_uid != agg.player_uid,
                hits: effect.hits,
                formula_term_ids: effect.source.formula_term_ids.into_iter().collect(),
                contribution_groups: effect.source.contribution_groups.into_iter().collect(),
                predicate_tags: effect.source.predicate_tags.into_iter().collect(),
                evidence_present: effect.evidence_present.into_iter().collect(),
                required_evidence: effect.required_evidence.into_iter().collect(),
                missing_evidence: missing_evidence.into_iter().collect(),
            }
        })
        .collect();
    active_effects.sort_by(|left, right| {
        right.hits.cmp(&left.hits).then_with(|| {
            left.effect_uid
                .cmp(&right.effect_uid)
                .then_with(|| left.modifier_source_uid.cmp(&right.modifier_source_uid))
        })
    });
    let active_effect_uids: Vec<i32> = active_effects
        .iter()
        .map(|effect| effect.effect_uid)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let active_source_uids: Vec<i64> = active_effects
        .iter()
        .filter_map(|effect| (effect.modifier_source_uid > 0).then_some(effect.modifier_source_uid))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let active_source_rule_ids: Vec<String> = active_effects
        .iter()
        .map(|effect| effect.source_id.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut proof_status_counts = BTreeMap::<String, usize>::new();
    let mut missing_evidence_counts = BTreeMap::<String, usize>::new();
    for effect in &active_effects {
        *proof_status_counts
            .entry(effect.proof_status.clone())
            .or_default() += 1;
        for evidence in &effect.missing_evidence {
            *missing_evidence_counts.entry(evidence.clone()).or_default() += 1;
        }
    }

    ProofTimelineRow {
        encounter_id: agg.encounter_id,
        scene_name: agg.scene_name,
        started_at_ms: agg.started_at_ms,
        bin_start_ms: agg.bin_start_ms,
        bin_end_ms: agg.bin_end_ms,
        bin_offset_ms: agg.bin_start_ms - agg.started_at_ms,
        first_hit_ms: agg.first_hit_ms,
        last_hit_ms: agg.last_hit_ms,
        player_uid: agg.player_uid,
        player_name: agg.player_name,
        skill_key: agg.skill_key,
        damage_id: agg.damage_id,
        skill_label: agg.skill_label,
        target_uid: agg.target_uid,
        target_monster_type_id: agg.target_monster_type_id,
        active_effect_uids,
        active_source_uids,
        active_source_rule_ids,
        proof_status_counts,
        missing_evidence_counts,
        active_effects,
        hit_event_count_with_id: agg.hit_event_count_with_id,
        first_hit_event_id: agg.first_hit_event_id,
        last_hit_event_id: agg.last_hit_event_id,
        hits: agg.hits,
        total_value: agg.total_value,
        effective_value: agg.effective_value,
        hp_loss_value: agg.hp_loss_value,
        shield_loss_value: agg.shield_loss_value,
        crit_hits: agg.crit_hits,
        lucky_hits: agg.lucky_hits,
        crit_rate: rate(agg.crit_hits as f64, agg.hits as f64),
        lucky_rate: rate(agg.lucky_hits as f64, agg.hits as f64),
        attacker_attr_ids: agg.attacker_attr_ids.into_iter().collect(),
        target_attr_ids: agg.target_attr_ids.into_iter().collect(),
        attacker_attrs: finalize_attr_values(agg.attacker_attr_values),
        target_attrs: finalize_attr_values(agg.target_attr_values),
    }
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
        agg.player_total,
        agg.duplicate_bucket_rows,
        agg.damage_linked_source_ids.len() > 0
            && !agg.damage_linked_source_ids.contains(&agg.source.source_id),
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

fn short_timeline_effects(effects: &[ProofTimelineEffectRow]) -> String {
    let mut parts: Vec<String> = effects
        .iter()
        .take(4)
        .map(|effect| {
            if effect.modifier_source_uid > 0 {
                format!(
                    "{} from {} [{}] ({}x)",
                    effect.effect_uid, effect.modifier_source_uid, effect.proof_status, effect.hits
                )
            } else {
                format!(
                    "{} [{}] ({}x)",
                    effect.effect_uid, effect.proof_status, effect.hits
                )
            }
        })
        .collect();
    if effects.len() > 4 {
        parts.push(format!("+{} more", effects.len() - 4));
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
    let timeline_status_rows = report
        .timeline_proof_status_counts
        .iter()
        .map(|(key, value)| vec![key.clone(), value.to_string()])
        .collect();
    let timeline_action_rows = report
        .timeline_next_action_counts
        .iter()
        .map(|(key, value)| vec![key.clone(), value.to_string()])
        .collect();
    let timeline_gap_rows = report
        .top_timeline_missing_evidence
        .iter()
        .map(|row| vec![row.evidence.clone(), row.rows.to_string()])
        .collect();
    let blocked_timeline_gap_rows = report
        .top_blocked_timeline_missing_evidence
        .iter()
        .map(|row| vec![row.evidence.clone(), row.rows.to_string()])
        .collect();
    let timeline_source_blocker_rows = report
        .timeline_source_blockers
        .iter()
        .take(options.max_rows)
        .map(|row| {
            vec![
                row.source_label.clone(),
                row.source_id.clone(),
                row.source_kind.clone(),
                row.generated_status.clone(),
                short_list(&row.formula_term_ids, 5),
                short_list(&row.contribution_groups, 5),
                row.next_dev_action.clone(),
                row.effect_links.to_string(),
                row.ready_effect_links.to_string(),
                row.blocked_effect_links.to_string(),
                row.top_missing_evidence
                    .iter()
                    .take(4)
                    .map(|missing| format!("{} ({})", missing.evidence, missing.rows))
                    .collect::<Vec<_>>()
                    .join(", "),
            ]
        })
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
    let timeline_rows = report
        .proof_timeline
        .iter()
        .take(80)
        .map(|row| {
            vec![
                format!("#{}", row.encounter_id),
                format!("{}ms", row.bin_offset_ms),
                row.player_name.clone(),
                format!("{}:{}", row.skill_key, row.damage_id),
                row.target_uid.to_string(),
                short_list(&row.active_effect_uids, 8),
                short_list(&row.active_source_uids, 6),
                short_list(&row.active_source_rule_ids, 4),
                short_timeline_effects(&row.active_effects),
                row.hits.to_string(),
                format_number(row.total_value),
                format_pct(row.crit_rate),
                format_pct(row.lucky_rate),
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
        format!("- Modifier replay hit rows: {}", report.totals.modifier_replay_hit_rows),
        format!(
            "- Modifier replay hits with active sources: {}",
            report.totals.modifier_replay_hit_rows_with_sources
        ),
        format!(
            "- Modifier replay source links: {}",
            report.totals.modifier_replay_source_links
        ),
        format!("- Source rows: {}", report.totals.source_rows),
        format!(
            "- Proof timeline effect links: {} (ready {}, blocked {})",
            report.totals.proof_timeline_effect_links,
            report.totals.proof_timeline_ready_effect_links,
            report.totals.proof_timeline_blocked_effect_links
        ),
        format!(
            "- Proof timeline rows: {}{}",
            report.totals.proof_timeline_rows,
            if report.totals.proof_timeline_rows_truncated > 0 {
                format!(
                    " ({} omitted by --max-timeline-rows)",
                    report.totals.proof_timeline_rows_truncated
                )
            } else {
                String::new()
            }
        ),
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
        "## Timeline Proof Status Counts".to_string(),
        "".to_string(),
        markdown_table(&["Proof Status", "Effect Links"], timeline_status_rows),
        "".to_string(),
        "## Timeline Next Action Counts".to_string(),
        "".to_string(),
        markdown_table(&["Next Dev Action", "Effect Links"], timeline_action_rows),
        "".to_string(),
        "## Blocked Timeline Evidence Gaps".to_string(),
        "".to_string(),
        markdown_table(
            &["Missing Evidence", "Blocked Effect Links"],
            blocked_timeline_gap_rows,
        ),
        "".to_string(),
        "## Timeline Evidence Gaps".to_string(),
        "".to_string(),
        markdown_table(&["Missing Evidence", "Effect Links"], timeline_gap_rows),
        "".to_string(),
        "## Timeline Source Blockers".to_string(),
        "".to_string(),
        markdown_table(
            &[
                "Source",
                "Source ID",
                "Kind",
                "Generated Status",
                "Formula Terms",
                "Groups",
                "Next Action",
                "Effect Links",
                "Ready",
                "Blocked",
                "Top Missing",
            ],
            timeline_source_blocker_rows,
        ),
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
        "## Proof Timeline Sample".to_string(),
        "".to_string(),
        markdown_table(
            &[
                "Encounter",
                "t",
                "Player",
                "Skill:Damage UID",
                "Target UID",
                "Effect UIDs",
                "Source UIDs",
                "Source Rules",
                "Effect Links",
                "Hits",
                "Damage",
                "Crit",
                "Lucky",
            ],
            timeline_rows,
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
    let mut source_meta_cache = HashMap::<String, SourceMeta>::new();
    let mut replay_source_id_cache = HashMap::<(i32, Option<i32>), Vec<String>>::new();
    let mut proof_timeline_aggs = BTreeMap::<ProofTimelineKey, ProofTimelineAgg>::new();

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
                    let source = source_meta_cache
                        .entry(source_id.clone())
                        .or_insert_with(|| source_meta(&generated, &source_id))
                        .clone();
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

            for hit in &entity.modifier_replay_hits {
                totals.modifier_replay_hit_rows += 1;
                let source_links = add_replay_hit_to_timeline(
                    &mut proof_timeline_aggs,
                    &encounter,
                    *entity_uid,
                    entity,
                    hit,
                    &generated,
                    &mut source_meta_cache,
                    &mut replay_source_id_cache,
                    options.timeline_bin_ms,
                );
                if source_links > 0 {
                    totals.modifier_replay_hit_rows_with_sources += 1;
                    totals.modifier_replay_source_links += source_links;
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

    let mut proof_timeline: Vec<ProofTimelineRow> = proof_timeline_aggs
        .into_values()
        .map(finalize_proof_timeline_row)
        .collect();
    proof_timeline.sort_by(|left, right| {
        left.encounter_id
            .cmp(&right.encounter_id)
            .then_with(|| left.bin_start_ms.cmp(&right.bin_start_ms))
            .then_with(|| left.player_uid.cmp(&right.player_uid))
            .then_with(|| left.skill_key.cmp(&right.skill_key))
            .then_with(|| left.damage_id.cmp(&right.damage_id))
            .then_with(|| left.target_uid.cmp(&right.target_uid))
    });
    totals.proof_timeline_rows = proof_timeline.len();
    let mut timeline_proof_status_counts = BTreeMap::<String, usize>::new();
    let mut timeline_next_action_counts = BTreeMap::<String, usize>::new();
    let mut timeline_missing_counts = BTreeMap::<String, usize>::new();
    let mut blocked_timeline_missing_counts = BTreeMap::<String, usize>::new();
    for row in &proof_timeline {
        totals.proof_timeline_effect_links += row.active_effects.len();
        for effect in &row.active_effects {
            *timeline_proof_status_counts
                .entry(effect.proof_status.clone())
                .or_default() += 1;
            let next_action =
                next_dev_action_for_effect(&effect.proof_status, &effect.missing_evidence);
            *timeline_next_action_counts.entry(next_action).or_default() += 1;
            if is_timeline_proof_ready(&effect.proof_status) {
                totals.proof_timeline_ready_effect_links += 1;
            }
            if is_timeline_proof_blocked(&effect.proof_status) {
                totals.proof_timeline_blocked_effect_links += 1;
                for evidence in &effect.missing_evidence {
                    *blocked_timeline_missing_counts
                        .entry(evidence.clone())
                        .or_default() += 1;
                }
            }
            for evidence in &effect.missing_evidence {
                *timeline_missing_counts.entry(evidence.clone()).or_default() += 1;
            }
        }
    }
    let mut top_blocked_timeline_missing_evidence: Vec<MissingEvidenceRow> =
        blocked_timeline_missing_counts
            .into_iter()
            .map(|(evidence, rows)| MissingEvidenceRow { evidence, rows })
            .collect();
    top_blocked_timeline_missing_evidence.sort_by(|left, right| {
        right
            .rows
            .cmp(&left.rows)
            .then_with(|| left.evidence.cmp(&right.evidence))
    });
    top_blocked_timeline_missing_evidence.truncate(options.max_rows);

    let mut top_timeline_missing_evidence: Vec<MissingEvidenceRow> = timeline_missing_counts
        .into_iter()
        .map(|(evidence, rows)| MissingEvidenceRow { evidence, rows })
        .collect();
    top_timeline_missing_evidence.sort_by(|left, right| {
        right
            .rows
            .cmp(&left.rows)
            .then_with(|| left.evidence.cmp(&right.evidence))
    });
    top_timeline_missing_evidence.truncate(options.max_rows);

    let mut timeline_source_map = BTreeMap::<String, TimelineSourceProofRow>::new();
    let mut timeline_source_missing_counts = BTreeMap::<String, BTreeMap<String, usize>>::new();
    for row in &proof_timeline {
        for effect in &row.active_effects {
            let entry = timeline_source_map
                .entry(effect.source_id.clone())
                .or_insert_with(|| TimelineSourceProofRow {
                    source_id: effect.source_id.clone(),
                    source_label: effect.source_label.clone(),
                    source_kind: effect.source_kind.clone(),
                    source_type: effect.source_type.clone(),
                    generated_status: effect.generated_status.clone(),
                    ..Default::default()
                });
            entry.effect_links += 1;
            for term in &effect.formula_term_ids {
                push_unique(&mut entry.formula_term_ids, term.clone());
            }
            for group in &effect.contribution_groups {
                push_unique(&mut entry.contribution_groups, group.clone());
            }
            if is_timeline_proof_ready(&effect.proof_status) {
                entry.ready_effect_links += 1;
            }
            if is_timeline_proof_blocked(&effect.proof_status) {
                entry.blocked_effect_links += 1;
            }
            *entry
                .proof_status_counts
                .entry(effect.proof_status.clone())
                .or_default() += 1;
            let next_action =
                next_dev_action_for_effect(&effect.proof_status, &effect.missing_evidence);
            *entry.next_dev_action_counts.entry(next_action).or_default() += 1;

            let source_missing = timeline_source_missing_counts
                .entry(effect.source_id.clone())
                .or_default();
            for evidence in &effect.missing_evidence {
                *source_missing.entry(evidence.clone()).or_default() += 1;
            }
        }
    }
    let mut timeline_source_blockers: Vec<TimelineSourceProofRow> = timeline_source_map
        .into_values()
        .map(|mut row| {
            let mut missing: Vec<MissingEvidenceRow> = timeline_source_missing_counts
                .remove(&row.source_id)
                .unwrap_or_default()
                .into_iter()
                .map(|(evidence, rows)| MissingEvidenceRow { evidence, rows })
                .collect();
            missing.sort_by(|left, right| {
                right
                    .rows
                    .cmp(&left.rows)
                    .then_with(|| left.evidence.cmp(&right.evidence))
            });
            missing.truncate(8);
            row.top_missing_evidence = missing;
            row.next_dev_action = row
                .next_dev_action_counts
                .iter()
                .max_by(|left, right| left.1.cmp(right.1).then_with(|| right.0.cmp(left.0)))
                .map(|(action, _)| action.clone())
                .unwrap_or_else(|| "no-blocker".to_string());
            row
        })
        .collect();
    timeline_source_blockers.sort_by(|left, right| {
        right
            .blocked_effect_links
            .cmp(&left.blocked_effect_links)
            .then_with(|| right.effect_links.cmp(&left.effect_links))
            .then_with(|| left.source_label.cmp(&right.source_label))
    });
    timeline_source_blockers.truncate(options.max_rows);
    if proof_timeline.len() > options.max_timeline_rows {
        totals.proof_timeline_rows_truncated = proof_timeline.len() - options.max_timeline_rows;
        proof_timeline.truncate(options.max_timeline_rows);
    }

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
            latest_offset: options.latest_offset,
            encounter_id: options.encounter_id,
            player_uid: options.player_uid,
            max_rows: options.max_rows,
            max_timeline_rows: options.max_timeline_rows,
            timeline_bin_ms: options.timeline_bin_ms,
        },
        totals,
        readiness_counts,
        timeline_proof_status_counts,
        timeline_next_action_counts,
        top_missing_evidence,
        top_blocked_timeline_missing_evidence,
        top_timeline_missing_evidence,
        player_summaries,
        source_rows,
        duplicate_pressure_rows,
        zero_hit_rows,
        proof_timeline,
        timeline_source_blockers,
        decode_failures,
        notes: vec![
            "Observed damage/hits are overlap measurements. Multiple always-on modifiers can each overlap the same recorded hit, so source row totals are not net-added contribution.".to_string(),
            "Rows marked ready-for-formula-replay have generated formula terms and the persisted bucket evidence requested by that source model; they still need controlled validation before becoming UI contribution math.".to_string(),
            "Proof timeline rows are compact, time-binned replay evidence from persisted modifier_replay_hits; they prove which generated source ids were active on recorded hits without changing the live DPS truth path.".to_string(),
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
