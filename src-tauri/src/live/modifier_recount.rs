use std::collections::HashSet;
use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Default)]
struct ModifierRecountFilter {
    reportable_buff_ids: HashSet<i32>,
    ignored_buff_ids: HashSet<i32>,
    loaded: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModifierRecountTable {
    reportable_buff_ids: Option<Vec<i32>>,
    ignored_buff_ids: Option<Vec<i32>>,
}

static MODIFIER_RECOUNT_FILTER: OnceLock<ModifierRecountFilter> = OnceLock::new();

fn load_modifier_recount_filter() -> ModifierRecountFilter {
    let Ok(contents) = crate::parser_data::read_to_string("generated/ModifierRecountTable.json")
    else {
        log::warn!(
            target: "app::history",
            "modifier_recount_table_missing path=generated/ModifierRecountTable.json"
        );
        return ModifierRecountFilter::default();
    };

    let Ok(table) = serde_json::from_str::<ModifierRecountTable>(&contents) else {
        log::warn!(
            target: "app::history",
            "modifier_recount_table_parse_failed path=generated/ModifierRecountTable.json"
        );
        return ModifierRecountFilter::default();
    };

    ModifierRecountFilter {
        reportable_buff_ids: table
            .reportable_buff_ids
            .unwrap_or_default()
            .into_iter()
            .filter(|id| *id > 0)
            .collect(),
        ignored_buff_ids: table
            .ignored_buff_ids
            .unwrap_or_default()
            .into_iter()
            .filter(|id| *id > 0)
            .collect(),
        loaded: true,
    }
}

fn modifier_recount_filter() -> &'static ModifierRecountFilter {
    MODIFIER_RECOUNT_FILTER.get_or_init(load_modifier_recount_filter)
}

pub fn is_reportable_modifier_bucket(base_id: i32, source_config_id: Option<i32>) -> bool {
    let filter = modifier_recount_filter();
    if !filter.loaded || filter.reportable_buff_ids.is_empty() {
        return true;
    }

    let source_config_id = source_config_id.unwrap_or_default();
    if filter.ignored_buff_ids.contains(&base_id)
        || (source_config_id > 0 && filter.ignored_buff_ids.contains(&source_config_id))
    {
        return false;
    }

    filter.reportable_buff_ids.contains(&base_id)
        || (source_config_id > 0 && filter.reportable_buff_ids.contains(&source_config_id))
}
