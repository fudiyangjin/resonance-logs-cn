use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::PathBuf;

use diesel::prelude::*;
use diesel::sql_types::{Binary, Double, Integer, Nullable, Text};
use resonance_logs_lib::live::opcodes_models::{Entity, Skill};
use serde::de::{self, Visitor};
use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
struct IdKey(i64);

impl<'de> Deserialize<'de> for IdKey {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct IdKeyVisitor;

        impl<'de> Visitor<'de> for IdKeyVisitor {
            type Value = IdKey;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("an integer id or an integer id string")
            }

            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E> {
                Ok(IdKey(value))
            }

            fn visit_i128<E>(self, value: i128) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                i64::try_from(value)
                    .map(IdKey)
                    .map_err(|_| E::custom("id does not fit i64"))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                i64::try_from(value)
                    .map(IdKey)
                    .map_err(|_| E::custom("id does not fit i64"))
            }

            fn visit_u128<E>(self, value: u128) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                i64::try_from(value)
                    .map(IdKey)
                    .map_err(|_| E::custom("id does not fit i64"))
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                value
                    .parse::<i64>()
                    .map(IdKey)
                    .map_err(|_| E::custom("id string is not an integer"))
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                self.visit_str(&value)
            }
        }

        deserializer.deserialize_any(IdKeyVisitor)
    }
}

#[derive(QueryableByName)]
struct EncounterBlob {
    #[diesel(sql_type = Integer)]
    id: i32,
    #[diesel(sql_type = Nullable<Text>)]
    scene_name: Option<String>,
    #[diesel(sql_type = Double)]
    duration: f64,
    #[diesel(sql_type = Nullable<Double>)]
    active_combat_duration: Option<f64>,
    #[diesel(sql_type = Binary)]
    data: Vec<u8>,
}

#[derive(Debug, Default)]
struct ObservedSkill {
    skill_id: i64,
    mode: String,
    total_value: u128,
    effective_total_value: u128,
    hits: u128,
    crit_hits: u128,
    crit_total_value: u128,
    lucky_hits: u128,
    lucky_total_value: u128,
    encounter_ids: BTreeSet<i32>,
    players: BTreeSet<String>,
    scenes: BTreeSet<String>,
}

#[derive(Debug, Deserialize)]
struct RecountEntry {
    #[serde(default, rename = "Id")]
    id: i64,
    #[serde(default, rename = "RecountName")]
    recount_name: String,
    #[serde(default, rename = "Names")]
    names: HashMap<String, String>,
    #[serde(default, rename = "DamageId")]
    damage_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum DamageAttrEntry {
    Text(String),
    Object {
        #[serde(default, rename = "Name")]
        name: Option<String>,
        #[serde(default, rename = "Names")]
        names: HashMap<String, String>,
        #[serde(default, rename = "DamageName")]
        damage_name: Option<String>,
    },
}

#[derive(Debug, Default, Deserialize)]
struct BreakdownEntry {
    #[serde(default, rename = "DisplayName")]
    display_name: Option<String>,
    #[serde(default, rename = "DisplayNames")]
    display_names: HashMap<String, String>,
    #[serde(default, rename = "DisplayDetailName")]
    display_detail_name: Option<String>,
    #[serde(default, rename = "DisplayDetailNames")]
    display_detail_names: HashMap<String, String>,
    #[serde(default, rename = "DisplayVariantName")]
    display_variant_name: Option<String>,
    #[serde(default, rename = "DisplayVariantNames")]
    display_variant_names: HashMap<String, String>,
    #[serde(default, rename = "DisplayDetailKind")]
    display_detail_kind: Option<String>,
    #[serde(default, rename = "DisplayDetailSource")]
    display_detail_source: Option<String>,
    #[serde(default, rename = "Category")]
    category: Option<String>,
    #[serde(default, rename = "Badge")]
    badge: Option<String>,
    #[serde(default, rename = "SourceRole")]
    source_role: Option<String>,
    #[serde(default, rename = "LinkedSource")]
    linked_source: Option<String>,
    #[serde(default, rename = "LinkedId")]
    linked_id: Option<serde_json::Value>,
    #[serde(default, rename = "ParentRecountId")]
    parent_recount_id: Option<serde_json::Value>,
    #[serde(default, rename = "ParentTalentId")]
    parent_talent_id: Option<serde_json::Value>,
    #[serde(default, rename = "DamageName")]
    damage_name: Option<String>,
    #[serde(default, rename = "DamageNames")]
    damage_names: HashMap<String, String>,
    #[serde(default, rename = "UnderlyingSkillId")]
    underlying_skill_id: Option<serde_json::Value>,
    #[serde(default, rename = "UnderlyingRelatedSkillIds")]
    underlying_related_skill_ids: Vec<serde_json::Value>,
    #[serde(default, rename = "UnderlyingSkillRelations")]
    underlying_skill_relations: Vec<serde_json::Value>,
    #[serde(default, rename = "Reason")]
    reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
struct AuditIssue {
    skill_id: i64,
    mode: String,
    total_value: u128,
    hits: u128,
    encounter_count: usize,
    encounter_ids: Vec<i32>,
    sample_encounter_ids: Vec<i32>,
    sample_players: Vec<String>,
    sample_scenes: Vec<String>,
    parent_recount_id: Option<i64>,
    parent_recount_label: Option<String>,
    display_label: String,
    detail_label: String,
    full_label: String,
    badge: Option<String>,
    category: Option<String>,
    source_role: Option<String>,
    display_detail_kind: Option<String>,
    display_detail_source: Option<String>,
    damage_label: String,
    underlying_skill_id: Option<i64>,
    underlying_related_skill_ids: Vec<i64>,
    underlying_skill_relations: Vec<serde_json::Value>,
    visible_unresolved: bool,
    source_unresolved: bool,
    visible_reasons: Vec<String>,
    source_reasons: Vec<String>,
    reasons: Vec<String>,
    generator_reason: Option<String>,
}

#[derive(Debug, Serialize)]
struct AuditReport {
    database: String,
    encounter_count: usize,
    observed_skill_count: usize,
    issue_count: usize,
    visible_issue_count: usize,
    source_evidence_issue_count: usize,
    observed_rows: Vec<AuditIssue>,
    visible_issues: Vec<AuditIssue>,
    source_evidence_issues: Vec<AuditIssue>,
    issues: Vec<AuditIssue>,
}

fn default_db_path() -> PathBuf {
    if let Some(mut dir) = dirs::data_local_dir() {
        dir.push("resonance-logs-global");
        dir.join("resonance-logs-global.db")
    } else {
        PathBuf::from("resonance-logs-global.db")
    }
}

fn generated_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("parser-data")
        .join("generated")
        .join(name)
}

fn output_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("DEV_exports")
        .join("history-label-audit.json")
}

fn resolve_text(values: &HashMap<String, String>, fallback: &str) -> String {
    for key in ["en", "zh-CN", "zh-TW", "design"] {
        if let Some(value) = values.get(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    fallback.trim().to_string()
}

fn join_label_parts<const N: usize>(parts: [&str; N]) -> String {
    parts
        .into_iter()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

fn damage_attr_name(entry: Option<&DamageAttrEntry>) -> String {
    match entry {
        Some(DamageAttrEntry::Text(value)) => value.clone(),
        Some(DamageAttrEntry::Object {
            name,
            names,
            damage_name,
        }) => resolve_text(
            names,
            name.as_deref().or(damage_name.as_deref()).unwrap_or(""),
        ),
        None => String::new(),
    }
}

fn has_cjk(value: &str) -> bool {
    value
        .chars()
        .any(|ch| matches!(ch as u32, 0x3400..=0x9fff | 0xf900..=0xfaff))
}

fn has_mojibake(value: &str) -> bool {
    value.contains('Ã') || value.contains('�') || value.contains("å") || value.contains("ç")
}

fn has_internal_token(value: &str) -> bool {
    let upper = value.to_ascii_uppercase();
    upper.contains("ATK_")
        || upper.contains("EXATK")
        || upper.contains("BUFF")
        || upper.contains("SKILL_")
        || upper.contains("SUBBUFF")
        || upper.contains("FORMULA")
}

fn looks_unresolved(label: &str) -> Vec<String> {
    let mut reasons = Vec::new();
    if label.trim().is_empty() {
        reasons.push("empty label".to_string());
    }
    if label.starts_with("Unknown (") {
        reasons.push("unknown damage id".to_string());
    }
    if has_cjk(label) {
        reasons.push("contains CJK fallback".to_string());
    }
    if has_mojibake(label) {
        reasons.push("contains mojibake fallback".to_string());
    }
    if has_internal_token(label) {
        reasons.push("contains internal formula/design token".to_string());
    }
    reasons
}

fn json_i64(value: &Option<serde_json::Value>) -> Option<i64> {
    json_value_i64(value.as_ref()?)
}

fn json_value_i64(value: &serde_json::Value) -> Option<i64> {
    match value {
        serde_json::Value::Number(n) => n.as_i64().or_else(|| n.as_u64().map(|v| v as i64)),
        serde_json::Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

fn json_i64_vec(values: &[serde_json::Value]) -> Vec<i64> {
    values.iter().filter_map(json_value_i64).collect()
}

fn add_skill(
    observed: &mut BTreeMap<(String, i64), ObservedSkill>,
    mode: &str,
    encounter: &EncounterBlob,
    entity: &Entity,
    skill_id: i64,
    stats: &Skill,
) {
    if stats.hits == 0 && stats.total_value == 0 {
        return;
    }
    let key = (mode.to_string(), skill_id);
    let row = observed.entry(key).or_insert_with(|| ObservedSkill {
        skill_id,
        mode: mode.to_string(),
        ..Default::default()
    });
    row.total_value += stats.total_value;
    row.effective_total_value += stats.effective_total_value;
    row.hits += stats.hits;
    row.crit_hits += stats.crit_hits;
    row.crit_total_value += stats.crit_total_value;
    row.lucky_hits += stats.lucky_hits;
    row.lucky_total_value += stats.lucky_total_value;
    row.encounter_ids.insert(encounter.id);
    if !entity.name.trim().is_empty() {
        row.players
            .insert(format!("{}#{}", entity.name, entity.class_id));
    }
    if let Some(scene) = &encounter.scene_name {
        if !scene.trim().is_empty() {
            row.scenes.insert(scene.clone());
        }
    }
}

fn sample_set<T: Clone + Ord>(set: &BTreeSet<T>, limit: usize) -> Vec<T> {
    set.iter().take(limit).cloned().collect()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(default_db_path);
    let db_label = db_path.to_string_lossy().to_string();
    let mut conn = diesel::sqlite::SqliteConnection::establish(&db_label)?;
    let encounters: Vec<EncounterBlob> = diesel::sql_query(
        "SELECT e.id, e.scene_name, e.duration, e.active_combat_duration, ed.data
         FROM encounters e
         INNER JOIN encounter_data ed ON ed.encounter_id = e.id
         WHERE e.ended_at_ms IS NOT NULL
         ORDER BY e.started_at_ms DESC, e.id DESC",
    )
    .load(&mut conn)?;

    let recount_entries: HashMap<String, RecountEntry> =
        serde_json::from_str(&fs::read_to_string(generated_path("RecountTable.json"))?)?;
    let damage_names: HashMap<String, DamageAttrEntry> = serde_json::from_str(
        &fs::read_to_string(generated_path("DamageAttrIdName.json"))?,
    )?;
    let breakdown: HashMap<String, BreakdownEntry> = serde_json::from_str(&fs::read_to_string(
        generated_path("SkillBreakdownDetails.json"),
    )?)?;

    let mut damage_to_recount: HashMap<i64, (i64, String)> = HashMap::new();
    for entry in recount_entries.values() {
        let label = resolve_text(&entry.names, &entry.recount_name);
        for damage_id in &entry.damage_ids {
            damage_to_recount.insert(*damage_id, (entry.id, label.clone()));
        }
    }

    let mut observed: BTreeMap<(String, i64), ObservedSkill> = BTreeMap::new();
    for encounter in &encounters {
        let decompressed = zstd::decode_all(&encounter.data[..])?;
        let entities: HashMap<IdKey, Entity> = rmp_serde::from_slice(&decompressed)?;
        for entity in entities.values() {
            for (skill_id, stats) in &entity.skill_uid_to_dmg_skill {
                add_skill(&mut observed, "damage", encounter, entity, *skill_id, stats);
            }
            for (skill_id, stats) in &entity.skill_uid_to_heal_skill {
                add_skill(
                    &mut observed,
                    "healing",
                    encounter,
                    entity,
                    *skill_id,
                    stats,
                );
            }
            for (skill_id, stats) in &entity.skill_uid_to_taken_skill {
                add_skill(&mut observed, "taken", encounter, entity, *skill_id, stats);
            }
        }
    }

    let mut observed_rows = Vec::new();
    let mut issues = Vec::new();
    for row in observed.values() {
        let detail = breakdown.get(&row.skill_id.to_string());
        let damage_label = damage_attr_name(damage_names.get(&row.skill_id.to_string()));
        let (parent_recount_id, parent_recount_label) = damage_to_recount
            .get(&row.skill_id)
            .map(|(id, label)| (Some(*id), Some(label.clone())))
            .unwrap_or((None, None));

        let display_label = detail
            .map(|entry| {
                resolve_text(
                    &entry.display_names,
                    entry.display_name.as_deref().unwrap_or(""),
                )
            })
            .filter(|value| !value.is_empty())
            .or_else(|| parent_recount_label.clone())
            .or_else(|| (!damage_label.is_empty()).then_some(damage_label.clone()))
            .unwrap_or_else(|| format!("Unknown ({})", row.skill_id));
        let detail_label = detail
            .map(|entry| {
                resolve_text(
                    &entry.display_detail_names,
                    entry.display_detail_name.as_deref().unwrap_or(""),
                )
            })
            .unwrap_or_default();
        let variant_label = detail
            .map(|entry| {
                resolve_text(
                    &entry.display_variant_names,
                    entry.display_variant_name.as_deref().unwrap_or(""),
                )
            })
            .unwrap_or_default();
        let combined_detail_label =
            join_label_parts([detail_label.as_str(), variant_label.as_str()]);
        let full_label = if combined_detail_label.is_empty() {
            display_label.clone()
        } else {
            format!("{} · {}", display_label, combined_detail_label)
        };

        let mut visible_reasons = looks_unresolved(&full_label);
        if detail.is_none() {
            visible_reasons.push("missing SkillBreakdownDetails entry".to_string());
        }
        let mut source_reasons = Vec::new();
        if damage_label.is_empty() {
            source_reasons.push("missing DamageAttrIdName entry".to_string());
        } else {
            source_reasons.extend(
                looks_unresolved(&damage_label)
                    .into_iter()
                    .map(|reason| format!("damage row {reason}")),
            );
        }
        let visible_unresolved = !visible_reasons.is_empty();
        let source_unresolved = !source_reasons.is_empty();
        let reasons = visible_reasons
            .iter()
            .chain(source_reasons.iter())
            .cloned()
            .collect::<Vec<_>>();
        let audit_row = AuditIssue {
            skill_id: row.skill_id,
            mode: row.mode.clone(),
            total_value: row.total_value,
            hits: row.hits,
            encounter_count: row.encounter_ids.len(),
            encounter_ids: row.encounter_ids.iter().cloned().collect(),
            sample_encounter_ids: sample_set(&row.encounter_ids, 8),
            sample_players: sample_set(&row.players, 8),
            sample_scenes: sample_set(&row.scenes, 5),
            parent_recount_id: detail
                .and_then(|entry| json_i64(&entry.parent_recount_id))
                .or(parent_recount_id),
            parent_recount_label,
            display_label,
            detail_label: combined_detail_label,
            full_label,
            badge: detail.and_then(|entry| entry.badge.clone()),
            category: detail.and_then(|entry| entry.category.clone()),
            source_role: detail.and_then(|entry| entry.source_role.clone()),
            display_detail_kind: detail.and_then(|entry| entry.display_detail_kind.clone()),
            display_detail_source: detail.and_then(|entry| entry.display_detail_source.clone()),
            damage_label,
            underlying_skill_id: detail.and_then(|entry| json_i64(&entry.underlying_skill_id)),
            underlying_related_skill_ids: detail
                .map(|entry| json_i64_vec(&entry.underlying_related_skill_ids))
                .unwrap_or_default(),
            underlying_skill_relations: detail
                .map(|entry| entry.underlying_skill_relations.clone())
                .unwrap_or_default(),
            visible_unresolved,
            source_unresolved,
            visible_reasons,
            source_reasons,
            reasons,
            generator_reason: detail.and_then(|entry| entry.reason.clone()),
        };
        if !audit_row.reasons.is_empty() {
            issues.push(audit_row.clone());
        }
        observed_rows.push(audit_row);
    }

    issues.sort_by(|left, right| {
        right
            .total_value
            .cmp(&left.total_value)
            .then_with(|| right.hits.cmp(&left.hits))
            .then_with(|| left.skill_id.cmp(&right.skill_id))
    });
    observed_rows.sort_by(|left, right| {
        right
            .total_value
            .cmp(&left.total_value)
            .then_with(|| right.hits.cmp(&left.hits))
            .then_with(|| left.skill_id.cmp(&right.skill_id))
    });

    let visible_issues = issues
        .iter()
        .filter(|issue| issue.visible_unresolved)
        .cloned()
        .collect::<Vec<_>>();
    let source_evidence_issues = issues
        .iter()
        .filter(|issue| issue.source_unresolved)
        .cloned()
        .collect::<Vec<_>>();

    let report = AuditReport {
        database: "AppData/resonance-logs-global/resonance-logs-global.db".to_string(),
        encounter_count: encounters.len(),
        observed_skill_count: observed.len(),
        issue_count: issues.len(),
        visible_issue_count: visible_issues.len(),
        source_evidence_issue_count: source_evidence_issues.len(),
        observed_rows,
        visible_issues,
        source_evidence_issues,
        issues,
    };

    let out = output_path();
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&out, serde_json::to_vec_pretty(&report)?)?;
    println!(
        "Audited {} encounters, {} observed skill ids, {} visible issues, {} source-evidence issues. Wrote {}",
        report.encounter_count,
        report.observed_skill_count,
        report.visible_issue_count,
        report.source_evidence_issue_count,
        out.display()
    );
    Ok(())
}
