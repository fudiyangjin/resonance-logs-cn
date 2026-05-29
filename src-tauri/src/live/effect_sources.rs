use crate::parser_data;
use log::warn;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

const EFFECT_SOURCES_RELATIVE: &str = "generated/EffectSources.json";

#[derive(Debug, Default, Deserialize)]
struct EffectSourcesData {
    #[serde(default, rename = "effectSourceIds")]
    effect_source_ids: Vec<String>,
    #[serde(default, rename = "buffIdToEffectSourceIds")]
    buff_id_to_effect_source_ids: HashMap<String, Vec<String>>,
}

static EFFECT_BUFF_IDS: OnceLock<HashSet<i32>> = OnceLock::new();
static EFFECT_SOURCE_IDS: OnceLock<HashSet<String>> = OnceLock::new();
static EFFECT_SOURCE_IDS_BY_BUFF_ID: OnceLock<HashMap<i32, Vec<String>>> = OnceLock::new();

pub fn effect_buff_ids() -> &'static HashSet<i32> {
    EFFECT_BUFF_IDS.get_or_init(load_effect_buff_ids)
}

pub fn is_effect_buff_id(buff_id: i32) -> bool {
    effect_buff_ids().contains(&buff_id)
}

pub fn effect_source_ids() -> &'static HashSet<String> {
    EFFECT_SOURCE_IDS.get_or_init(load_effect_source_ids)
}

pub fn is_effect_source_id(source_id: &str) -> bool {
    effect_source_ids().contains(source_id)
}

pub fn effect_source_ids_for_buff_id(buff_id: i32) -> Vec<String> {
    EFFECT_SOURCE_IDS_BY_BUFF_ID
        .get_or_init(load_effect_source_ids_by_buff_id)
        .get(&buff_id)
        .cloned()
        .unwrap_or_default()
}

fn load_effect_buff_ids() -> HashSet<i32> {
    let contents = match parser_data::read_to_string(EFFECT_SOURCES_RELATIVE) {
        Ok(contents) => contents,
        Err(err) => {
            warn!(
                target: "app::live",
                "effect_sources_load_failed path={} error={}",
                EFFECT_SOURCES_RELATIVE,
                err
            );
            return HashSet::new();
        }
    };

    match serde_json::from_str::<EffectSourcesData>(&contents) {
        Ok(data) => data
            .buff_id_to_effect_source_ids
            .keys()
            .filter_map(|key| key.parse::<i32>().ok())
            .collect(),
        Err(err) => {
            warn!(
                target: "app::live",
                "effect_sources_parse_failed path={} error={}",
                EFFECT_SOURCES_RELATIVE,
                err
            );
            HashSet::new()
        }
    }
}

fn load_effect_source_ids_by_buff_id() -> HashMap<i32, Vec<String>> {
    let contents = match parser_data::read_to_string(EFFECT_SOURCES_RELATIVE) {
        Ok(contents) => contents,
        Err(err) => {
            warn!(
                target: "app::live",
                "effect_sources_load_failed path={} error={}",
                EFFECT_SOURCES_RELATIVE,
                err
            );
            return HashMap::new();
        }
    };

    match serde_json::from_str::<EffectSourcesData>(&contents) {
        Ok(data) => data
            .buff_id_to_effect_source_ids
            .into_iter()
            .filter_map(|(key, source_ids)| {
                key.parse::<i32>().ok().map(|buff_id| (buff_id, source_ids))
            })
            .collect(),
        Err(err) => {
            warn!(
                target: "app::live",
                "effect_sources_parse_failed path={} error={}",
                EFFECT_SOURCES_RELATIVE,
                err
            );
            HashMap::new()
        }
    }
}

fn load_effect_source_ids() -> HashSet<String> {
    let contents = match parser_data::read_to_string(EFFECT_SOURCES_RELATIVE) {
        Ok(contents) => contents,
        Err(err) => {
            warn!(
                target: "app::live",
                "effect_sources_load_failed path={} error={}",
                EFFECT_SOURCES_RELATIVE,
                err
            );
            return HashSet::new();
        }
    };

    match serde_json::from_str::<EffectSourcesData>(&contents) {
        Ok(data) => data.effect_source_ids.into_iter().collect(),
        Err(err) => {
            warn!(
                target: "app::live",
                "effect_sources_parse_failed path={} error={}",
                EFFECT_SOURCES_RELATIVE,
                err
            );
            HashSet::new()
        }
    }
}
