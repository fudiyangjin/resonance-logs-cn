use crate::live::effect_sources;
use crate::parser_data;
use log::warn;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

const TEMP_ATTR_TABLE_RELATIVE: &str = "logic/TempAttrTable.json";

#[derive(Debug, Deserialize)]
struct RawTempAttrDef {
    #[serde(rename = "Id")]
    id: i32,
    #[serde(rename = "AttrType")]
    attr_type: i32,
    #[serde(rename = "LogicType")]
    logic_type: i32,
    #[serde(rename = "AttrParams", default)]
    attr_params: Vec<i32>,
    #[serde(rename = "IsSyncClient", default)]
    is_sync_client: bool,
}

static TEMP_ATTR_MODIFIER_BUFF_IDS: OnceLock<HashMap<i32, i32>> = OnceLock::new();

pub fn modifier_buff_id_for_temp_attr(temp_attr_id: i32) -> Option<i32> {
    TEMP_ATTR_MODIFIER_BUFF_IDS
        .get_or_init(load_temp_attr_modifier_buff_ids)
        .get(&temp_attr_id)
        .copied()
}

fn load_temp_attr_modifier_buff_ids() -> HashMap<i32, i32> {
    let contents = match parser_data::read_to_string(TEMP_ATTR_TABLE_RELATIVE) {
        Ok(contents) => contents,
        Err(err) => {
            warn!(
                target: "app::live",
                "temp_attr_sources_load_failed path={} error={}",
                TEMP_ATTR_TABLE_RELATIVE,
                err
            );
            return HashMap::new();
        }
    };

    let raw_map: HashMap<String, RawTempAttrDef> = match serde_json::from_str(&contents) {
        Ok(raw_map) => raw_map,
        Err(err) => {
            warn!(
                target: "app::live",
                "temp_attr_sources_parse_failed path={} error={}",
                TEMP_ATTR_TABLE_RELATIVE,
                err
            );
            return HashMap::new();
        }
    };

    raw_map
        .into_values()
        .filter(|raw| raw.is_sync_client && raw.attr_type == 502 && raw.logic_type == 4)
        .filter_map(|raw| {
            let buff_id = raw.attr_params.iter().copied().find(|id| *id > 0)?;
            if effect_sources::is_effect_buff_id(buff_id) {
                Some((raw.id, buff_id))
            } else {
                None
            }
        })
        .collect()
}
