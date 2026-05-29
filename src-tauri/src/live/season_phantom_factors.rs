use crate::parser_data;
use log::warn;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

const SEASON_PHANTOM_FACTORS_RELATIVE: &str = "generated/SeasonPhantomFactors.json";

#[derive(Debug, Default, Deserialize)]
struct SeasonPhantomFactorData {
    #[serde(default, rename = "factorBuffIds")]
    factor_buff_ids: Vec<i32>,
    #[serde(default, rename = "factorsByBuffId")]
    factors_by_buff_id: HashMap<String, SeasonPhantomFactorEntry>,
}

#[derive(Debug, Default, Deserialize)]
struct SeasonPhantomFactorEntry {
    #[serde(default, rename = "familyId")]
    family_id: Option<i32>,
    #[serde(default, rename = "buffId")]
    buff_id: Option<i32>,
    #[serde(default, rename = "affectedDamageIds")]
    affected_damage_ids: Vec<u32>,
    #[serde(default, rename = "gradeItemIds")]
    grade_item_ids: Vec<i32>,
    #[serde(default, rename = "modifierEvidence")]
    modifier_evidence: Option<ModifierEvidence>,
}

#[derive(Debug, Default, Deserialize)]
struct ModifierEvidence {
    #[serde(default, rename = "gradeRows")]
    grade_rows: Vec<ModifierGradeRow>,
}

#[derive(Debug, Default, Deserialize)]
struct ModifierGradeRow {
    grade: Option<i32>,
    #[serde(rename = "itemId")]
    item_id: Option<i32>,
}

#[derive(Debug, Default, Clone)]
pub struct FactorGradeItem {
    pub factor_buff_id: i32,
    pub item_config_id: i32,
    pub grade: Option<i32>,
    pub family_id: Option<i32>,
}

static FACTOR_BUFF_IDS: OnceLock<HashSet<i32>> = OnceLock::new();
static FACTOR_GRADE_ITEMS_BY_CONFIG_ID: OnceLock<HashMap<i32, FactorGradeItem>> = OnceLock::new();
static FACTOR_AFFECTED_DAMAGE_IDS: OnceLock<HashSet<u32>> = OnceLock::new();

pub fn factor_buff_ids() -> &'static HashSet<i32> {
    FACTOR_BUFF_IDS.get_or_init(load_factor_buff_ids)
}

pub fn is_factor_buff_id(buff_id: i32) -> bool {
    factor_buff_ids().contains(&buff_id)
}

pub fn factor_grade_item_for_config_id(config_id: i32) -> Option<&'static FactorGradeItem> {
    FACTOR_GRADE_ITEMS_BY_CONFIG_ID
        .get_or_init(load_factor_grade_items_by_config_id)
        .get(&config_id)
}

pub fn is_factor_affected_damage_id(damage_id: u32) -> bool {
    FACTOR_AFFECTED_DAMAGE_IDS
        .get_or_init(load_factor_affected_damage_ids)
        .contains(&damage_id)
}

fn load_factor_buff_ids() -> HashSet<i32> {
    load_factor_data().factor_buff_ids.into_iter().collect()
}

fn load_factor_grade_items_by_config_id() -> HashMap<i32, FactorGradeItem> {
    let data = load_factor_data();
    let mut items = HashMap::new();

    for (buff_id_text, entry) in data.factors_by_buff_id {
        let factor_buff_id = entry
            .buff_id
            .or_else(|| buff_id_text.parse::<i32>().ok())
            .unwrap_or_default();
        if factor_buff_id == 0 {
            continue;
        }
        for item_config_id in entry.grade_item_ids {
            let grade = entry
                .modifier_evidence
                .as_ref()
                .and_then(|evidence| {
                    evidence
                        .grade_rows
                        .iter()
                        .find(|row| row.item_id == Some(item_config_id))
                })
                .and_then(|row| row.grade);
            items.insert(
                item_config_id,
                FactorGradeItem {
                    factor_buff_id,
                    item_config_id,
                    grade,
                    family_id: entry.family_id,
                },
            );
        }
    }

    items
}

fn load_factor_affected_damage_ids() -> HashSet<u32> {
    let data = load_factor_data();
    let mut damage_ids = HashSet::new();

    for entry in data.factors_by_buff_id.into_values() {
        damage_ids.extend(entry.affected_damage_ids);
    }

    damage_ids
}

fn load_factor_data() -> SeasonPhantomFactorData {
    let contents = match parser_data::read_to_string(SEASON_PHANTOM_FACTORS_RELATIVE) {
        Ok(contents) => contents,
        Err(err) => {
            warn!(
                target: "app::live",
                "season_phantom_factors_load_failed path={} error={}",
                SEASON_PHANTOM_FACTORS_RELATIVE,
                err
            );
            return SeasonPhantomFactorData::default();
        }
    };

    match serde_json::from_str::<SeasonPhantomFactorData>(&contents) {
        Ok(data) => data,
        Err(err) => {
            warn!(
                target: "app::live",
                "season_phantom_factors_parse_failed path={} error={}",
                SEASON_PHANTOM_FACTORS_RELATIVE,
                err
            );
            SeasonPhantomFactorData::default()
        }
    }
}
