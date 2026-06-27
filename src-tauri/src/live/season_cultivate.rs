use crate::live::counter_tracker::{CounterRule, CounterSource, EffectSlotConfig};
use blueprotobuf_lib::blueprotobuf;
use log::debug;
use std::collections::{HashMap, HashSet};

const FACTOR_RULE_ID_BASE: i32 = 900_000_000;
const CHAR_SERIALIZE_FIELD_SEASON_CULTIVATE: i32 = 101;
const DIRTY_BEGIN: i32 = -2;
const DIRTY_END: i32 = -3;
const SEASON_CULTIVATE_FUNCTION_DEEP_SLEEP: i32 = 800_522;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FactorCounterTemplate {
    #[serde(default)]
    pub item_ids: Vec<i32>,
    #[serde(default)]
    pub sources: Vec<CounterSource>,
    #[serde(default)]
    pub effect_slots: Vec<EffectSlotConfig>,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonCultivateFactorSelection {
    pub source_item_ids: Vec<i32>,
    pub slot_item_ids: Vec<i32>,
}

#[derive(Debug, Clone, Default)]
pub struct SeasonCultivateRuntimeState {
    data: Option<blueprotobuf::SeasonCultivateLineData>,
    templates: Vec<FactorCounterTemplate>,
    active_signature: String,
    active_selection: SeasonCultivateFactorSelection,
}

impl SeasonCultivateRuntimeState {
    pub fn set_templates(
        &mut self,
        templates: Vec<FactorCounterTemplate>,
    ) -> Option<Vec<CounterRule>> {
        self.templates = normalize_factor_templates(templates);
        self.active_signature.clear();
        self.rebuild_factor_rules()
    }

    pub fn replace_data(
        &mut self,
        data: blueprotobuf::SeasonCultivateLineData,
    ) -> Option<Vec<CounterRule>> {
        self.data = Some(data);
        self.rebuild_factor_rules()
    }

    pub fn clear_data(&mut self) -> Option<Vec<CounterRule>> {
        self.data = None;
        self.rebuild_factor_rules()
    }

    pub fn apply_dirty_bytes(&mut self, bytes: &[u8]) -> Option<Vec<CounterRule>> {
        let Some(current) = self.data.as_mut() else {
            return None;
        };
        let mut reader = DirtyReader::new(bytes);
        if let Err(err) = merge_char_serialize_dirty(&mut reader, current) {
            debug!(target: "app::live", "season cultivate dirty parse failed: {err:?}");
            return None;
        }
        self.rebuild_factor_rules()
    }

    pub fn active_selection(&self) -> SeasonCultivateFactorSelection {
        self.active_selection.clone()
    }

    pub fn rebuild_factor_rules(&mut self) -> Option<Vec<CounterRule>> {
        let selection = self.extract_active_selection();
        let signature = build_selection_signature(&selection);
        if signature == self.active_signature {
            return None;
        }
        self.active_signature = signature;
        self.active_selection = selection.clone();
        Some(self.build_counter_rules(&selection))
    }

    fn extract_active_selection(&self) -> SeasonCultivateFactorSelection {
        let Some(data) = self.data.as_ref() else {
            return SeasonCultivateFactorSelection::default();
        };
        let source_ids = template_item_id_set(
            self.templates
                .iter()
                .filter(|template| !template.sources.is_empty()),
        );
        let slot_ids = template_item_id_set(
            self.templates
                .iter()
                .filter(|template| !template.effect_slots.is_empty()),
        );
        let active_item_ids = data.active_item_ids();
        let mut source_item_ids: Vec<i32> = active_item_ids
            .iter()
            .copied()
            .filter(|item_id| source_ids.contains(item_id))
            .collect();
        let mut slot_item_ids: Vec<i32> = active_item_ids
            .iter()
            .copied()
            .filter(|item_id| slot_ids.contains(item_id))
            .collect();
        source_item_ids.sort_unstable();
        source_item_ids.dedup();
        slot_item_ids.sort_unstable();
        slot_item_ids.dedup();
        SeasonCultivateFactorSelection {
            source_item_ids,
            slot_item_ids,
        }
    }

    fn build_counter_rules(&self, selection: &SeasonCultivateFactorSelection) -> Vec<CounterRule> {
        if selection.source_item_ids.is_empty() || selection.slot_item_ids.is_empty() {
            return Vec::new();
        }
        let source_templates: Vec<&FactorCounterTemplate> = self
            .templates
            .iter()
            .filter(|template| {
                !template.sources.is_empty()
                    && template_matches_any_item_id(template, &selection.source_item_ids)
            })
            .collect();
        if source_templates.is_empty() {
            return Vec::new();
        }
        let sources: Vec<CounterSource> = source_templates
            .iter()
            .flat_map(|template| template.sources.iter().cloned())
            .collect();
        selection
            .slot_item_ids
            .iter()
            .filter_map(|slot_item_id| {
                let template = self.templates.iter().find(|template| {
                    !template.effect_slots.is_empty()
                        && template_matches_item_id(template, *slot_item_id)
                })?;
                Some(CounterRule {
                    rule_id: factor_rule_id(*slot_item_id),
                    sources: sources.clone(),
                    effect_slots: template
                        .effect_slots
                        .iter()
                        .enumerate()
                        .map(|(idx, slot)| {
                            let mut next = slot.clone();
                            next.slot_id = i32::try_from(idx + 1).unwrap_or(i32::MAX);
                            next
                        })
                        .collect(),
                })
            })
            .collect()
    }
}

pub fn factor_rule_id(item_id: i32) -> i32 {
    FACTOR_RULE_ID_BASE.saturating_add(item_id)
}

fn build_selection_signature(selection: &SeasonCultivateFactorSelection) -> String {
    format!(
        "{:?}|{:?}",
        selection.source_item_ids, selection.slot_item_ids
    )
}

fn template_item_id_set<'a>(
    templates: impl Iterator<Item = &'a FactorCounterTemplate>,
) -> HashSet<i32> {
    let mut result = HashSet::new();
    for template in templates {
        result.extend(template.item_ids.iter().copied());
    }
    result
}

fn template_matches_any_item_id(template: &FactorCounterTemplate, item_ids: &[i32]) -> bool {
    item_ids
        .iter()
        .any(|item_id| template_matches_item_id(template, *item_id))
}

fn template_matches_item_id(template: &FactorCounterTemplate, item_id: i32) -> bool {
    template.item_ids.contains(&item_id)
}

pub fn normalize_factor_templates(
    templates: Vec<FactorCounterTemplate>,
) -> Vec<FactorCounterTemplate> {
    templates
        .into_iter()
        .filter_map(|mut template| {
            template.item_ids.retain(|item_id| *item_id > 0);
            template.item_ids.sort_unstable();
            template.item_ids.dedup();
            (!template.item_ids.is_empty()).then_some(template)
        })
        .collect()
}

trait SeasonCultivateActiveItems {
    fn active_item_ids(&self) -> Vec<i32>;
}

impl SeasonCultivateActiveItems for blueprotobuf::SeasonCultivateLineData {
    fn active_item_ids(&self) -> Vec<i32> {
        let mut result = Vec::new();
        for line_data in self.season_cultivate_line_map.values() {
            for (function_id, sub_type) in line_data.cultivate_line_map.iter() {
                if *function_id != SEASON_CULTIVATE_FUNCTION_DEEP_SLEEP {
                    continue;
                }
                for area in active_areas(sub_type) {
                    result.extend(
                        area.cultivate_middle_node_map
                            .values()
                            .filter_map(|node| node.item_id),
                    );
                }
            }
        }
        result.sort_unstable();
        result.dedup();
        result
    }
}

fn active_areas(
    sub_type: &blueprotobuf::CultivateLineSubTypeData,
) -> Vec<&blueprotobuf::CultivateAreaData> {
    if !sub_type.cultivate_line_area_list.is_empty() {
        return sub_type
            .cultivate_line_area_list
            .iter()
            .filter_map(|area_id| sub_type.cultivate_line_data_map.get(area_id))
            .collect();
    }
    sub_type
        .cultivate_line_data_map
        .values()
        .filter(|area| area.is_active.unwrap_or(false))
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DirtyParseError {
    UnexpectedEnd,
    InvalidMarker(i32),
    InvalidBlockSize(i32),
    InvalidFieldId(i32),
}

type DirtyResult<T> = Result<T, DirtyParseError>;

struct DirtyReader<'a> {
    data: &'a [u8],
    off: usize,
}

impl<'a> DirtyReader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, off: 0 }
    }

    fn i32(&mut self) -> DirtyResult<i32> {
        if self.off + 4 > self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        let value = i32::from_le_bytes([
            self.data[self.off],
            self.data[self.off + 1],
            self.data[self.off + 2],
            self.data[self.off + 3],
        ]);
        self.off += 4;
        Ok(value)
    }

    fn bool(&mut self) -> DirtyResult<bool> {
        if self.off >= self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        let value = self.data[self.off] != 0;
        self.off += 1;
        Ok(value)
    }

    fn skip_to(&mut self, off: usize) -> DirtyResult<()> {
        if off > self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        self.off = off;
        Ok(())
    }

    fn peek_i32(&self) -> DirtyResult<i32> {
        if self.off + 4 > self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        Ok(i32::from_le_bytes([
            self.data[self.off],
            self.data[self.off + 1],
            self.data[self.off + 2],
            self.data[self.off + 3],
        ]))
    }
}

fn read_object_header(reader: &mut DirtyReader<'_>) -> DirtyResult<Option<usize>> {
    let begin = reader.i32()?;
    if begin != DIRTY_BEGIN {
        return Err(DirtyParseError::InvalidMarker(begin));
    }
    let size = reader.i32()?;
    if size == DIRTY_END {
        return Ok(None);
    }
    if size < 0 {
        return Err(DirtyParseError::InvalidBlockSize(size));
    }
    let end = reader
        .off
        .checked_add(usize::try_from(size).map_err(|_| DirtyParseError::InvalidBlockSize(size))?)
        .ok_or(DirtyParseError::UnexpectedEnd)?;
    if end + 4 > reader.data.len() {
        return Err(DirtyParseError::UnexpectedEnd);
    }
    Ok(Some(end))
}

fn finish_object(reader: &mut DirtyReader<'_>, end: usize) -> DirtyResult<()> {
    reader.skip_to(end)?;
    let marker = reader.i32()?;
    if marker != DIRTY_END {
        return Err(DirtyParseError::InvalidMarker(marker));
    }
    Ok(())
}

fn skip_object(reader: &mut DirtyReader<'_>) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    finish_object(reader, end)
}

fn merge_char_serialize_dirty(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::SeasonCultivateLineData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.off < end {
        let field_id = reader.i32()?;
        if field_id <= 0 {
            return Err(DirtyParseError::InvalidFieldId(field_id));
        }
        if field_id == CHAR_SERIALIZE_FIELD_SEASON_CULTIVATE {
            merge_season_cultivate_line_data(reader, data)?;
        } else if reader.peek_i32()? == DIRTY_BEGIN {
            skip_object(reader)?;
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_season_cultivate_line_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::SeasonCultivateLineData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.off < end {
        let field_id = reader.i32()?;
        if field_id == 1 {
            merge_i32_object_map(
                reader,
                &mut data.season_cultivate_line_map,
                merge_cultivate_line_data,
                blueprotobuf::CultivateLineData::default,
            )?;
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_line_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateLineData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.off < end {
        let field_id = reader.i32()?;
        if field_id == 1 {
            merge_i32_object_map(
                reader,
                &mut data.cultivate_line_map,
                merge_cultivate_line_sub_type_data,
                blueprotobuf::CultivateLineSubTypeData::default,
            )?;
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_line_sub_type_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateLineSubTypeData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.off < end {
        let field_id = reader.i32()?;
        match field_id {
            1 => {
                merge_i32_object_map(
                    reader,
                    &mut data.cultivate_line_data_map,
                    merge_cultivate_area_data,
                    blueprotobuf::CultivateAreaData::default,
                )?;
            }
            2 => {
                data.cultivate_line_area_list = parse_repeated_i32(reader)?;
            }
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_area_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateAreaData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.off < end {
        let field_id = reader.i32()?;
        match field_id {
            2 => {
                merge_i32_object_map(
                    reader,
                    &mut data.cultivate_middle_node_map,
                    merge_cultivate_middle_node_data,
                    blueprotobuf::CultivateMiddleNodeData::default,
                )?;
            }
            5 => data.is_active = Some(reader.bool()?),
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_middle_node_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateMiddleNodeData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.off < end {
        let field_id = reader.i32()?;
        if field_id == 1 {
            data.item_id = Some(reader.i32()?);
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_i32_object_map<T>(
    reader: &mut DirtyReader<'_>,
    map: &mut HashMap<i32, T>,
    merge_value: fn(&mut DirtyReader<'_>, &mut T) -> DirtyResult<()>,
    default_value: fn() -> T,
) -> DirtyResult<()> {
    let first = reader.i32()?;
    if first == -4 {
        return Ok(());
    }
    let (update_count, remove_count, add_count) = if first == -1 {
        (reader.i32()?, 0, 0)
    } else {
        (first, reader.i32()?, reader.i32()?)
    };
    for _ in 0..update_count {
        let key = reader.i32()?;
        let entry = map.entry(key).or_insert_with(default_value);
        merge_value(reader, entry)?;
    }
    for _ in 0..remove_count {
        let key = reader.i32()?;
        map.remove(&key);
    }
    for _ in 0..add_count {
        let key = reader.i32()?;
        let entry = map.entry(key).or_insert_with(default_value);
        merge_value(reader, entry)?;
    }
    Ok(())
}

fn parse_repeated_i32(reader: &mut DirtyReader<'_>) -> DirtyResult<Vec<i32>> {
    let count = reader.i32()?;
    if count < 0 {
        return Err(DirtyParseError::InvalidBlockSize(count));
    }
    let capacity = usize::try_from(count).map_err(|_| DirtyParseError::InvalidBlockSize(count))?;
    let mut result = Vec::with_capacity(capacity);
    for _ in 0..count {
        result.push(reader.i32()?);
    }
    Ok(result)
}
