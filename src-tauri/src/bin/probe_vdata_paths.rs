use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};

use blueprotobuf_lib::blueprotobuf;
use diesel::prelude::*;
use diesel::sql_types::{BigInt, Binary, Nullable};
use prost::Message;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, QueryableByName)]
struct LatestPlayerData {
    #[diesel(sql_type = BigInt)]
    player_id: i64,
    #[diesel(sql_type = BigInt)]
    last_seen_ms: i64,
    #[diesel(sql_type = Nullable<Binary>)]
    vdata_bytes: Option<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct FactorData {
    #[serde(default, rename = "factorBuffIds")]
    factor_buff_ids: Vec<i32>,
    #[serde(default, rename = "factorsByBuffId")]
    factors_by_buff_id: HashMap<String, FactorEntry>,
}

#[derive(Debug, Deserialize)]
struct FactorEntry {
    #[serde(default, rename = "familyId")]
    family_id: Option<i32>,
    #[serde(default, rename = "buffId")]
    buff_id: Option<i32>,
    #[serde(default, rename = "familyName")]
    family_name: Option<String>,
    #[serde(default, rename = "gradeItemIds")]
    grade_item_ids: Vec<i32>,
    #[serde(default, rename = "affectedDamageIds")]
    affected_damage_ids: Vec<i64>,
    #[serde(default, rename = "modifierEvidence")]
    modifier_evidence: Option<ModifierEvidence>,
}

#[derive(Debug, Deserialize)]
struct ModifierEvidence {
    #[serde(default, rename = "gradeRows")]
    grade_rows: Vec<ModifierGradeRow>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct ModifierGradeRow {
    grade: Option<i32>,
    #[serde(rename = "itemId")]
    item_id: Option<i32>,
    #[serde(rename = "itemQualityTier")]
    item_quality_tier: Option<i32>,
    #[serde(default, rename = "parameterValues")]
    parameter_values: Vec<i32>,
    #[serde(default, rename = "valueTexts")]
    value_texts: Vec<String>,
    #[serde(rename = "cleanResolvedDescription")]
    clean_resolved_description: Option<String>,
}

#[derive(Clone, Debug)]
struct FactorItemMeta {
    family_id: Option<i32>,
    factor_buff_id: Option<i32>,
    family_name: Option<String>,
    grade_row: Option<ModifierGradeRow>,
}

#[derive(Clone, Debug, Serialize)]
struct NeedleMeta {
    kind: String,
    value: String,
    family_id: Option<i32>,
    factor_buff_id: Option<i32>,
    family_name: Option<String>,
    grade: Option<i32>,
    item_id: Option<i32>,
    value_texts: Vec<String>,
}

#[derive(Debug, Serialize)]
struct OwnedFactorItem {
    package_key: i32,
    package_type: Option<i32>,
    item_key: i64,
    uuid: Option<i64>,
    config_id: i32,
    count: Option<i64>,
    quality: Option<i32>,
    family_id: Option<i32>,
    factor_buff_id: Option<i32>,
    family_name: Option<String>,
    grade: Option<i32>,
    value_texts: Vec<String>,
}

#[derive(Debug, Serialize)]
struct FactorUnlockItem {
    item_config_id: i32,
    unlock_value: i32,
    family_id: Option<i32>,
    factor_buff_id: Option<i32>,
    family_name: Option<String>,
    grade: Option<i32>,
    value_texts: Vec<String>,
}

#[derive(Debug, Serialize)]
struct PathMatch {
    path: String,
    location: String,
    value: String,
    context: String,
    needles: Vec<NeedleMeta>,
}

#[derive(Debug, Serialize)]
struct RawProtoMatch {
    path: String,
    offset: usize,
    value: String,
    context: String,
    needles: Vec<NeedleMeta>,
}

#[derive(Debug, Serialize)]
struct ReportSummary {
    top_level_sections: Vec<String>,
    needle_count: usize,
    owned_factor_item_count: usize,
    factor_unlock_item_count: usize,
    match_count: usize,
    raw_proto_match_count: usize,
    match_count_by_context: BTreeMap<String, usize>,
    match_count_by_kind: BTreeMap<String, usize>,
    raw_proto_match_count_by_context: BTreeMap<String, usize>,
}

#[derive(Debug, Serialize)]
struct Report {
    source: &'static str,
    database_path: String,
    factors_path: String,
    player_id: i64,
    last_seen_ms: i64,
    vdata_bytes_len: usize,
    summary: ReportSummary,
    owned_factor_items: Vec<OwnedFactorItem>,
    factor_unlock_items: Vec<FactorUnlockItem>,
    matches: Vec<PathMatch>,
    raw_proto_matches: Vec<RawProtoMatch>,
    notes: Vec<&'static str>,
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let db_path = arg_value(&args, "--db")
        .map(PathBuf::from)
        .unwrap_or_else(default_db_path);
    let factors_path = arg_value(&args, "--factors")
        .map(PathBuf::from)
        .unwrap_or_else(default_factors_path);
    let out_json_path = arg_value(&args, "--out-json").map(PathBuf::from);
    let max_matches = arg_value(&args, "--max-matches")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(400);
    let max_raw_depth = arg_value(&args, "--max-raw-depth")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(14);
    let max_raw_len = arg_value(&args, "--max-raw-len")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(1_000_000);
    let extra_needles = repeated_arg_values(&args, "--needle");

    let factors = read_factors(&factors_path)?;
    let factor_by_item = index_factor_items(&factors);
    let latest = load_latest_playerdata(&db_path)?;
    let vdata_bytes = latest
        .vdata_bytes
        .as_deref()
        .ok_or_else(|| "Latest detailed_playerdata row has no vdata_bytes".to_string())?;
    let v_data = blueprotobuf::CharSerialize::decode(vdata_bytes)
        .map_err(|err| format!("Failed to decode CharSerialize: {err}"))?;

    let mut needles = build_base_needles(&factors, &factor_by_item);
    let owned_factor_items = collect_owned_factor_items(&v_data, &factor_by_item);
    let factor_unlock_items = collect_factor_unlock_items(&v_data, &factor_by_item);
    add_owned_item_uuid_needles(&mut needles, &owned_factor_items);
    for raw in extra_needles {
        add_needle(
            &mut needles,
            raw.clone(),
            NeedleMeta {
                kind: "manual".to_string(),
                value: raw,
                family_id: None,
                factor_buff_id: None,
                family_name: None,
                grade: None,
                item_id: None,
                value_texts: Vec::new(),
            },
        );
    }

    let json = serde_json::to_value(&v_data)
        .map_err(|err| format!("Failed to serialize CharSerialize to JSON value: {err}"))?;
    let top_level_sections = json
        .as_object()
        .map(|object| object.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    let mut matches = Vec::new();
    let mut per_needle_counts: HashMap<String, usize> = HashMap::new();
    scan_value(
        &json,
        "$",
        &needles,
        &mut matches,
        &mut per_needle_counts,
        max_matches,
    );

    matches.sort_by(|left, right| {
        left.context
            .cmp(&right.context)
            .then_with(|| left.path.cmp(&right.path))
            .then_with(|| left.value.cmp(&right.value))
    });

    let mut match_count_by_context: BTreeMap<String, usize> = BTreeMap::new();
    let mut match_count_by_kind: BTreeMap<String, usize> = BTreeMap::new();
    for row in &matches {
        *match_count_by_context
            .entry(row.context.clone())
            .or_insert(0) += 1;
        for needle in &row.needles {
            *match_count_by_kind.entry(needle.kind.clone()).or_insert(0) += 1;
        }
    }

    let mut raw_proto_matches = collect_proto_matches(
        vdata_bytes,
        0,
        vdata_bytes.len(),
        "$",
        0,
        max_raw_depth,
        max_raw_len,
        &needles,
    )
    .unwrap_or_default();
    raw_proto_matches.sort_by(|left, right| {
        left.context
            .cmp(&right.context)
            .then_with(|| left.path.cmp(&right.path))
            .then_with(|| left.offset.cmp(&right.offset))
            .then_with(|| left.value.cmp(&right.value))
    });
    let mut per_raw_needle_counts: HashMap<String, usize> = HashMap::new();
    raw_proto_matches.retain(|row| {
        let count = per_raw_needle_counts.entry(row.value.clone()).or_insert(0);
        if *count >= max_matches {
            return false;
        }
        *count += 1;
        true
    });
    let mut raw_proto_match_count_by_context: BTreeMap<String, usize> = BTreeMap::new();
    for row in &raw_proto_matches {
        *raw_proto_match_count_by_context
            .entry(row.context.clone())
            .or_insert(0) += 1;
    }

    let report = Report {
        source: "probe_vdata_paths",
        database_path: db_path.display().to_string(),
        factors_path: factors_path.display().to_string(),
        player_id: latest.player_id,
        last_seen_ms: latest.last_seen_ms,
        vdata_bytes_len: vdata_bytes.len(),
        summary: ReportSummary {
            top_level_sections,
            needle_count: needles.len(),
            owned_factor_item_count: owned_factor_items.len(),
            factor_unlock_item_count: factor_unlock_items.len(),
            match_count: matches.len(),
            raw_proto_match_count: raw_proto_matches.len(),
            match_count_by_context,
            match_count_by_kind,
            raw_proto_match_count_by_context,
        },
        owned_factor_items,
        factor_unlock_items,
        matches,
        raw_proto_matches,
        notes: vec![
            "This is a dev-only structured path scan. It does not change parser, DPS, monitor, or modifier runtime behavior.",
            "ItemPackage matches prove ownership/presence only. Equip matches prove selected equipment. Other contexts need follow-up before promotion.",
            "Raw protobuf matches expose tag paths for known and unknown serialized fields. They are evidence pointers, not runtime rules.",
        ],
    };

    let report_json = serde_json::to_string_pretty(&report)
        .map_err(|err| format!("Failed to serialize report: {err}"))?;
    let summary_match_count = report.summary.match_count;
    let summary_owned_count = report.summary.owned_factor_item_count;
    let summary_unlock_count = report.summary.factor_unlock_item_count;
    if let Some(path) = out_json_path {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
            }
        }
        std::fs::write(&path, report_json.as_bytes())
            .map_err(|err| format!("Failed to write {}: {err}", path.display()))?;
        println!(
            "wrote {} (matches={}, raw_proto_matches={}, owned_factor_items={}, factor_unlock_items={})",
            path.display(),
            summary_match_count,
            report.summary.raw_proto_match_count,
            summary_owned_count,
            summary_unlock_count
        );
    } else {
        println!("{report_json}");
    }
    Ok(())
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.windows(2)
        .find_map(|pair| (pair[0] == flag).then(|| pair[1].clone()))
}

fn repeated_arg_values(args: &[String], flag: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut index = 0;
    while index + 1 < args.len() {
        if args[index] == flag {
            values.push(args[index + 1].clone());
            index += 2;
        } else {
            index += 1;
        }
    }
    values
}

fn default_db_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("resonance-logs-global")
        .join("resonance-logs-global.db")
}

fn default_factors_path() -> PathBuf {
    [
        PathBuf::from("../parser-data/generated/SeasonPhantomFactors.json"),
        PathBuf::from("parser-data/generated/SeasonPhantomFactors.json"),
    ]
    .into_iter()
    .find(|path| path.exists())
    .unwrap_or_else(|| PathBuf::from("../parser-data/generated/SeasonPhantomFactors.json"))
}

fn read_factors(path: &Path) -> Result<FactorData, String> {
    let contents = std::fs::read_to_string(path)
        .map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    serde_json::from_str(&contents)
        .map_err(|err| format!("Failed to parse {}: {err}", path.display()))
}

fn load_latest_playerdata(db_path: &Path) -> Result<LatestPlayerData, String> {
    let mut conn = SqliteConnection::establish(&db_path.to_string_lossy())
        .map_err(|err| format!("Failed to open {}: {err}", db_path.display()))?;
    diesel::sql_query(
        "SELECT player_id, last_seen_ms, vdata_bytes \
         FROM detailed_playerdata \
         ORDER BY last_seen_ms DESC \
         LIMIT 1",
    )
    .get_result::<LatestPlayerData>(&mut conn)
    .map_err(|err| format!("Failed to load latest detailed_playerdata row: {err}"))
}

fn index_factor_items(factors: &FactorData) -> HashMap<i32, FactorItemMeta> {
    let mut factor_by_item = HashMap::new();
    for entry in factors.factors_by_buff_id.values() {
        let mut grade_by_item = HashMap::new();
        if let Some(evidence) = entry.modifier_evidence.as_ref() {
            for row in &evidence.grade_rows {
                if let Some(item_id) = row.item_id {
                    grade_by_item.insert(item_id, row.clone());
                }
            }
        }
        for item_id in &entry.grade_item_ids {
            factor_by_item.insert(
                *item_id,
                FactorItemMeta {
                    family_id: entry.family_id,
                    factor_buff_id: entry.buff_id,
                    family_name: entry.family_name.clone(),
                    grade_row: grade_by_item.get(item_id).cloned(),
                },
            );
        }
    }
    factor_by_item
}

fn build_base_needles(
    factors: &FactorData,
    factor_by_item: &HashMap<i32, FactorItemMeta>,
) -> HashMap<String, Vec<NeedleMeta>> {
    let mut needles = HashMap::new();
    let mut seen_factor_buff_ids = HashSet::new();
    let mut seen_family_ids = HashSet::new();
    let mut seen_affected_damage_ids = HashSet::new();
    for buff_id in &factors.factor_buff_ids {
        if !seen_factor_buff_ids.insert(*buff_id) {
            continue;
        }
        let entry = factors.factors_by_buff_id.get(&buff_id.to_string());
        add_needle(
            &mut needles,
            buff_id.to_string(),
            NeedleMeta {
                kind: "factor-buff-id".to_string(),
                value: buff_id.to_string(),
                family_id: entry.and_then(|row| row.family_id),
                factor_buff_id: Some(*buff_id),
                family_name: entry.and_then(|row| row.family_name.clone()),
                grade: None,
                item_id: None,
                value_texts: Vec::new(),
            },
        );
    }

    for entry in factors.factors_by_buff_id.values() {
        let Some(family_id) = entry.family_id else {
            continue;
        };
        if !seen_family_ids.insert(family_id) {
            continue;
        }
        add_needle(
            &mut needles,
            family_id.to_string(),
            NeedleMeta {
                kind: "factor-family-id".to_string(),
                value: family_id.to_string(),
                family_id: Some(family_id),
                factor_buff_id: entry.buff_id,
                family_name: entry.family_name.clone(),
                grade: None,
                item_id: None,
                value_texts: Vec::new(),
            },
        );
    }

    for entry in factors.factors_by_buff_id.values() {
        for damage_id in &entry.affected_damage_ids {
            if !seen_affected_damage_ids.insert(*damage_id) {
                continue;
            }
            add_needle(
                &mut needles,
                damage_id.to_string(),
                NeedleMeta {
                    kind: "factor-affected-damage-id".to_string(),
                    value: damage_id.to_string(),
                    family_id: entry.family_id,
                    factor_buff_id: entry.buff_id,
                    family_name: entry.family_name.clone(),
                    grade: None,
                    item_id: None,
                    value_texts: Vec::new(),
                },
            );
        }
    }

    for (item_id, meta) in factor_by_item {
        add_needle(
            &mut needles,
            item_id.to_string(),
            NeedleMeta {
                kind: "factor-grade-item-id".to_string(),
                value: item_id.to_string(),
                family_id: meta.family_id,
                factor_buff_id: meta.factor_buff_id,
                family_name: meta.family_name.clone(),
                grade: meta.grade_row.as_ref().and_then(|row| row.grade),
                item_id: Some(*item_id),
                value_texts: meta
                    .grade_row
                    .as_ref()
                    .map(|row| row.value_texts.clone())
                    .unwrap_or_default(),
            },
        );
    }

    needles
}

fn collect_owned_factor_items(
    v_data: &blueprotobuf::CharSerialize,
    factor_by_item: &HashMap<i32, FactorItemMeta>,
) -> Vec<OwnedFactorItem> {
    let Some(item_package) = v_data.item_package.as_ref() else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for (package_key, package) in &item_package.packages {
        for (item_key, item) in &package.items {
            let Some(config_id) = item.config_id else {
                continue;
            };
            let Some(meta) = factor_by_item.get(&config_id) else {
                continue;
            };
            rows.push(OwnedFactorItem {
                package_key: *package_key,
                package_type: package.r#type,
                item_key: *item_key,
                uuid: item.uuid,
                config_id,
                count: item.count,
                quality: item.quality,
                family_id: meta.family_id,
                factor_buff_id: meta.factor_buff_id,
                family_name: meta.family_name.clone(),
                grade: meta.grade_row.as_ref().and_then(|row| row.grade),
                value_texts: meta
                    .grade_row
                    .as_ref()
                    .map(|row| row.value_texts.clone())
                    .unwrap_or_default(),
            });
        }
    }
    rows.sort_by_key(|row| {
        (
            row.factor_buff_id.unwrap_or(0),
            row.config_id,
            row.uuid.unwrap_or(0),
        )
    });
    rows
}

fn collect_factor_unlock_items(
    v_data: &blueprotobuf::CharSerialize,
    factor_by_item: &HashMap<i32, FactorItemMeta>,
) -> Vec<FactorUnlockItem> {
    let Some(item_package) = v_data.item_package.as_ref() else {
        return Vec::new();
    };

    let mut rows = Vec::new();
    for (item_config_id, unlock_value) in &item_package.unlock_items {
        let Some(meta) = factor_by_item.get(item_config_id) else {
            continue;
        };
        rows.push(FactorUnlockItem {
            item_config_id: *item_config_id,
            unlock_value: *unlock_value,
            family_id: meta.family_id,
            factor_buff_id: meta.factor_buff_id,
            family_name: meta.family_name.clone(),
            grade: meta.grade_row.as_ref().and_then(|row| row.grade),
            value_texts: meta
                .grade_row
                .as_ref()
                .map(|row| row.value_texts.clone())
                .unwrap_or_default(),
        });
    }
    rows.sort_by_key(|row| {
        (
            row.factor_buff_id.unwrap_or(0),
            row.grade.unwrap_or(0),
            row.item_config_id,
            row.unlock_value,
        )
    });
    rows
}

fn add_owned_item_uuid_needles(
    needles: &mut HashMap<String, Vec<NeedleMeta>>,
    owned_factor_items: &[OwnedFactorItem],
) {
    for item in owned_factor_items {
        let Some(uuid) = item.uuid else {
            continue;
        };
        add_needle(
            needles,
            uuid.to_string(),
            NeedleMeta {
                kind: "owned-factor-item-uuid".to_string(),
                value: uuid.to_string(),
                family_id: item.family_id,
                factor_buff_id: item.factor_buff_id,
                family_name: item.family_name.clone(),
                grade: item.grade,
                item_id: Some(item.config_id),
                value_texts: item.value_texts.clone(),
            },
        );
    }
}

fn add_needle(needles: &mut HashMap<String, Vec<NeedleMeta>>, value: String, meta: NeedleMeta) {
    let rows = needles.entry(value).or_default();
    if rows.iter().any(|row| {
        row.kind == meta.kind
            && row.family_id == meta.family_id
            && row.factor_buff_id == meta.factor_buff_id
            && row.grade == meta.grade
            && row.item_id == meta.item_id
    }) {
        return;
    }
    rows.push(meta);
}

fn scan_value(
    value: &Value,
    path: &str,
    needles: &HashMap<String, Vec<NeedleMeta>>,
    matches: &mut Vec<PathMatch>,
    per_needle_counts: &mut HashMap<String, usize>,
    max_matches: usize,
) {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                let child_path = format!("{path}.{}", escape_path_segment(key));
                if let Some(metas) = needles.get(key) {
                    push_match(
                        matches,
                        per_needle_counts,
                        max_matches,
                        child_path.clone(),
                        "object-key",
                        key.clone(),
                        metas,
                    );
                }
                scan_value(
                    child,
                    &child_path,
                    needles,
                    matches,
                    per_needle_counts,
                    max_matches,
                );
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                let child_path = format!("{path}[{index}]");
                scan_value(
                    child,
                    &child_path,
                    needles,
                    matches,
                    per_needle_counts,
                    max_matches,
                );
            }
        }
        Value::Number(number) => {
            let raw = number.to_string();
            if let Some(metas) = needles.get(&raw) {
                push_match(
                    matches,
                    per_needle_counts,
                    max_matches,
                    path.to_string(),
                    "number-value",
                    raw,
                    metas,
                );
            }
        }
        Value::String(raw) => {
            if let Some(metas) = needles.get(raw) {
                push_match(
                    matches,
                    per_needle_counts,
                    max_matches,
                    path.to_string(),
                    "string-value",
                    raw.clone(),
                    metas,
                );
            }
        }
        Value::Bool(_) | Value::Null => {}
    }
}

fn push_match(
    matches: &mut Vec<PathMatch>,
    per_needle_counts: &mut HashMap<String, usize>,
    max_matches: usize,
    path: String,
    location: &str,
    value: String,
    metas: &[NeedleMeta],
) {
    let count = per_needle_counts.entry(value.clone()).or_insert(0);
    if *count >= max_matches {
        return;
    }
    *count += 1;
    matches.push(PathMatch {
        context: classify_path(&path),
        path,
        location: location.to_string(),
        value,
        needles: metas.to_vec(),
    });
}

fn classify_path(path: &str) -> String {
    if path.starts_with("$.ItemPackage.") {
        "item-package-owned-state".to_string()
    } else if path.starts_with("$.Equip.") {
        "equip-selected-state".to_string()
    } else if path.starts_with("$.BuffInfo.") {
        "buff-runtime-state".to_string()
    } else if path.starts_with("$.SeasonMedalInfo.") {
        "season-medal-state".to_string()
    } else if path.starts_with("$.SeasonActivation.") {
        "season-activation-state".to_string()
    } else if path.starts_with("$.Slots.") {
        "slot-state".to_string()
    } else if path.starts_with("$.ProfessionList.") {
        "profession-state".to_string()
    } else if path.starts_with("$.FunctionData.") {
        "function-unlock-state".to_string()
    } else if path.starts_with("$.Attr.CdInfo") {
        "attr-cooldown-state".to_string()
    } else if path.starts_with("$.Mod.") {
        "mod-state".to_string()
    } else {
        "other-vdata-state".to_string()
    }
}

fn escape_path_segment(value: &str) -> String {
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        value.to_string()
    } else {
        format!("{value:?}")
    }
}

fn collect_proto_matches(
    bytes: &[u8],
    start: usize,
    end: usize,
    path: &str,
    depth: usize,
    max_depth: usize,
    max_len: usize,
    needles: &HashMap<String, Vec<NeedleMeta>>,
) -> Option<Vec<RawProtoMatch>> {
    if start > end || end > bytes.len() {
        return None;
    }
    let mut pos = start;
    let mut saw_field = false;
    let mut field_counts: HashMap<u64, usize> = HashMap::new();
    let mut matches = Vec::new();

    while pos < end {
        let field_offset = pos;
        let (key, next_pos) = decode_varint(bytes, pos, end)?;
        pos = next_pos;
        let field_number = key >> 3;
        let wire_type = key & 0x07;
        if field_number == 0 {
            return None;
        }
        let occurrence = field_counts.entry(field_number).or_insert(0);
        let field_path = format!("{path}.{field_number}[{occurrence}]");
        *occurrence += 1;

        match wire_type {
            0 => {
                let (value, next_pos) = decode_varint(bytes, pos, end)?;
                pos = next_pos;
                let raw = value.to_string();
                if let Some(metas) = needles.get(&raw) {
                    matches.push(RawProtoMatch {
                        context: classify_raw_proto_path(&field_path),
                        path: field_path,
                        offset: field_offset,
                        value: raw,
                        needles: metas.to_vec(),
                    });
                }
            }
            1 => {
                pos = pos.checked_add(8)?;
                if pos > end {
                    return None;
                }
            }
            2 => {
                let (len, next_pos) = decode_varint(bytes, pos, end)?;
                pos = next_pos;
                let len = usize::try_from(len).ok()?;
                let child_start = pos;
                let child_end = pos.checked_add(len)?;
                if child_end > end {
                    return None;
                }
                if len > 0 && len <= max_len && depth < max_depth {
                    if let Some(mut child_matches) = collect_proto_matches(
                        bytes,
                        child_start,
                        child_end,
                        &field_path,
                        depth + 1,
                        max_depth,
                        max_len,
                        needles,
                    ) {
                        matches.append(&mut child_matches);
                    }
                }
                pos = child_end;
            }
            5 => {
                pos = pos.checked_add(4)?;
                if pos > end {
                    return None;
                }
            }
            _ => return None,
        }
        saw_field = true;
    }

    (saw_field && pos == end).then_some(matches)
}

fn decode_varint(bytes: &[u8], mut pos: usize, end: usize) -> Option<(u64, usize)> {
    let mut value = 0u64;
    let mut shift = 0u32;
    for _ in 0..10 {
        if pos >= end {
            return None;
        }
        let byte = bytes[pos];
        pos += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Some((value, pos));
        }
        shift += 7;
    }
    None
}

fn classify_raw_proto_path(path: &str) -> String {
    if path.starts_with("$.6[") {
        "raw-buff-field".to_string()
    } else if path.starts_with("$.7[") {
        "raw-item-package-field".to_string()
    } else if path.starts_with("$.12[") {
        "raw-equip-field".to_string()
    } else if path.starts_with("$.16[") {
        "raw-attr-field".to_string()
    } else if path.starts_with("$.25[") {
        "raw-planet-memory-field".to_string()
    } else if path.starts_with("$.28[") {
        "raw-resonance-field".to_string()
    } else if path.starts_with("$.36[") {
        "raw-function-field".to_string()
    } else if path.starts_with("$.50[") {
        "raw-season-center-field".to_string()
    } else if path.starts_with("$.52[") {
        "raw-season-medal-field".to_string()
    } else if path.starts_with("$.54[") {
        "raw-season-activation-field".to_string()
    } else if path.starts_with("$.55[") {
        "raw-slot-field".to_string()
    } else if path.starts_with("$.57[") {
        "raw-mod-field".to_string()
    } else if path.starts_with("$.61[") {
        "raw-profession-field".to_string()
    } else if path.starts_with("$.83[") {
        "raw-player-order-container-field".to_string()
    } else if path.starts_with("$.84[") {
        "raw-player-box-field".to_string()
    } else if path.starts_with("$.85[") {
        "raw-launch-privilege-field".to_string()
    } else if path.starts_with("$.90[") {
        "raw-master-mode-dungeon-field".to_string()
    } else if path.starts_with("$.93[") {
        "raw-bubble-act-field".to_string()
    } else {
        "raw-other-field".to_string()
    }
}
