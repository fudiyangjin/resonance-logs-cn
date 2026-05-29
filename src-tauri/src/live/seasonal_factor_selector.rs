use crate::live::opcodes_models::ObservedFactorItem;
use blueprotobuf_lib::blueprotobuf;
use std::collections::HashSet;

const DIRTY_TREE_DELIMITER: u32 = 0xDEADBEEF;
const SELECTED_FACTOR_RUNTIME_SOURCE: &str =
    "SyncContainerDirtyData.v_data.dirty_tree.selected_factor_grade_item";
pub const SELECTED_FACTOR_TRANSITION_RUNTIME_SOURCE: &str =
    "SyncContainerDirtyData.v_data.dirty_tree.zero_to_grade_selected_slot";

#[derive(Debug, Clone, Copy)]
struct SelectedFactorTreeLayout {
    buffer_len: usize,
    value_offset: usize,
    tree_path: &'static str,
    tree_signature: &'static str,
}

const SELECTED_FACTOR_TREE_LAYOUTS: &[SelectedFactorTreeLayout] = &[
    SelectedFactorTreeLayout {
        buffer_len: 472,
        value_offset: 416,
        tree_path: "0.3.5.5.5.5.1",
        tree_signature: "0:448>0.3:272>0.3.5:208>0.3.5.5:144>0.3.5.5.5:80>0.3.5.5.5.5:16",
    },
    SelectedFactorTreeLayout {
        buffer_len: 1117,
        value_offset: 184,
        tree_path: "0.1.5.5.3",
        tree_signature: "0:1093>0.1:1061>0.1.5:981>0.1.5.5:857",
    },
];

#[derive(Debug, Clone)]
struct DirtyTreeToken {
    value: i64,
    offset: usize,
    delimiter_offset: usize,
}

#[derive(Debug, Clone)]
struct DirtyTreeValueNode {
    value: i64,
    path: String,
    offset: usize,
    tree_signature: String,
}

#[derive(Debug, Clone)]
pub struct FactorSelectorDirtyNode {
    pub value: i64,
    pub path: String,
    pub offset: usize,
    pub tree_signature: String,
    pub item_config_id: Option<i32>,
    pub factor_buff_id: Option<i32>,
    pub grade: Option<i32>,
    pub family_id: Option<i32>,
}

pub fn selected_factor_items_from_dirty_data(
    sync_container_dirty_data: &blueprotobuf::SyncContainerDirtyData,
) -> Vec<ObservedFactorItem> {
    let Some(buffer) = sync_container_dirty_data
        .v_data
        .as_ref()
        .and_then(|stream| stream.buffer.as_deref())
    else {
        return Vec::new();
    };

    selected_factor_items_from_dirty_buffer(buffer)
}

pub fn factor_selector_dirty_nodes_from_dirty_data(
    sync_container_dirty_data: &blueprotobuf::SyncContainerDirtyData,
) -> Vec<FactorSelectorDirtyNode> {
    let Some(buffer) = sync_container_dirty_data
        .v_data
        .as_ref()
        .and_then(|stream| stream.buffer.as_deref())
    else {
        return Vec::new();
    };

    factor_selector_dirty_nodes_from_dirty_buffer(buffer)
}

fn selected_factor_items_from_dirty_buffer(buffer: &[u8]) -> Vec<ObservedFactorItem> {
    let matching_layouts: Vec<_> = SELECTED_FACTOR_TREE_LAYOUTS
        .iter()
        .filter(|layout| layout.buffer_len == buffer.len())
        .collect();
    if matching_layouts.is_empty() {
        return Vec::new();
    }

    let tokens = dirty_tree_tokens(buffer);
    if tokens.is_empty() {
        return Vec::new();
    }

    let value_nodes = dirty_tree_value_nodes(&tokens);
    let mut seen_item_config_ids = HashSet::new();
    let mut items = Vec::new();

    for node in value_nodes {
        if node.value <= 0 {
            continue;
        }
        if !matching_layouts.iter().any(|layout| {
            node.path == layout.tree_path
                && node.tree_signature == layout.tree_signature
                && node.offset == layout.value_offset
        }) {
            continue;
        }
        let Ok(item_config_id) = i32::try_from(node.value) else {
            continue;
        };
        if !seen_item_config_ids.insert(item_config_id) {
            continue;
        }
        let Some(factor_grade) =
            crate::live::season_phantom_factors::factor_grade_item_for_config_id(item_config_id)
        else {
            continue;
        };
        items.push(ObservedFactorItem {
            factor_buff_id: factor_grade.factor_buff_id,
            item_config_id: factor_grade.item_config_id,
            item_uuid: None,
            package_key: 0,
            package_type: None,
            grade: factor_grade.grade,
            family_id: factor_grade.family_id,
            runtime_source: SELECTED_FACTOR_RUNTIME_SOURCE.to_string(),
            selector_path: Some(node.path.clone()),
            selector_signature: Some(node.tree_signature.clone()),
            selector_offset: i32::try_from(node.offset).ok(),
        });
    }

    items.sort_by_key(|item| {
        (
            item.factor_buff_id,
            item.grade.unwrap_or(0),
            item.item_config_id,
        )
    });
    items
}

fn factor_selector_dirty_nodes_from_dirty_buffer(buffer: &[u8]) -> Vec<FactorSelectorDirtyNode> {
    let tokens = dirty_tree_tokens(buffer);
    if tokens.is_empty() {
        return Vec::new();
    }

    dirty_tree_value_nodes(&tokens)
        .into_iter()
        .filter_map(factor_selector_dirty_node_from_value_node)
        .collect()
}

fn factor_selector_dirty_node_from_value_node(
    node: DirtyTreeValueNode,
) -> Option<FactorSelectorDirtyNode> {
    if node.value == 0 {
        return Some(FactorSelectorDirtyNode {
            value: node.value,
            path: node.path,
            offset: node.offset,
            tree_signature: node.tree_signature,
            item_config_id: None,
            factor_buff_id: None,
            grade: None,
            family_id: None,
        });
    }
    if node.value <= 0 {
        return None;
    }

    let Ok(item_config_id) = i32::try_from(node.value) else {
        return None;
    };
    let factor_grade =
        crate::live::season_phantom_factors::factor_grade_item_for_config_id(item_config_id)?;

    Some(FactorSelectorDirtyNode {
        value: node.value,
        path: node.path,
        offset: node.offset,
        tree_signature: node.tree_signature,
        item_config_id: Some(factor_grade.item_config_id),
        factor_buff_id: Some(factor_grade.factor_buff_id),
        grade: factor_grade.grade,
        family_id: factor_grade.family_id,
    })
}

fn dirty_tree_tokens(buffer: &[u8]) -> Vec<DirtyTreeToken> {
    let mut tokens = Vec::new();
    let mut offset = 0usize;

    while offset < buffer.len() {
        let Some(delimiter_offset) = find_dirty_tree_delimiter(buffer, offset) else {
            break;
        };
        if let Some(value) = decode_dirty_tree_scalar(&buffer[offset..delimiter_offset]) {
            tokens.push(DirtyTreeToken {
                value,
                offset,
                delimiter_offset,
            });
        }
        offset = delimiter_offset.saturating_add(4);
    }

    tokens
}

fn find_dirty_tree_delimiter(buffer: &[u8], start_offset: usize) -> Option<usize> {
    if start_offset >= buffer.len() {
        return None;
    }
    let mut offset = start_offset;
    while offset + 4 <= buffer.len() {
        let mut bytes = [0u8; 4];
        bytes.copy_from_slice(&buffer[offset..offset + 4]);
        if u32::from_le_bytes(bytes) == DIRTY_TREE_DELIMITER {
            return Some(offset);
        }
        offset += 1;
    }
    None
}

fn decode_dirty_tree_scalar(segment: &[u8]) -> Option<i64> {
    match segment.len() {
        4 => {
            let mut bytes = [0u8; 4];
            bytes.copy_from_slice(segment);
            let signed = i32::from_le_bytes(bytes);
            if signed < 0 {
                Some(i64::from(signed))
            } else {
                Some(i64::from(u32::from_le_bytes(bytes)))
            }
        }
        8 => {
            let mut low_bytes = [0u8; 4];
            low_bytes.copy_from_slice(&segment[0..4]);
            let mut high_bytes = [0u8; 4];
            high_bytes.copy_from_slice(&segment[4..8]);
            let high_signed = i32::from_le_bytes(high_bytes);
            let low_signed = i32::from_le_bytes(low_bytes);
            if high_signed == 0 {
                Some(i64::from(u32::from_le_bytes(low_bytes)))
            } else if high_signed == -1 && low_signed < 0 {
                Some(i64::from(low_signed))
            } else {
                let mut bytes = [0u8; 8];
                bytes.copy_from_slice(segment);
                Some(i64::from_le_bytes(bytes))
            }
        }
        _ => None,
    }
}

fn dirty_tree_value_nodes(tokens: &[DirtyTreeToken]) -> Vec<DirtyTreeValueNode> {
    let mut cursor = 0usize;
    let mut value_nodes = Vec::new();
    parse_dirty_tree_children(tokens, &mut cursor, "", None, &[], &mut value_nodes);
    value_nodes
}

fn parse_dirty_tree_children(
    tokens: &[DirtyTreeToken],
    cursor: &mut usize,
    path_prefix: &str,
    body_end_offset: Option<usize>,
    ancestors: &[(String, i64)],
    value_nodes: &mut Vec<DirtyTreeValueNode>,
) {
    let mut child_index = 0usize;

    while *cursor < tokens.len() {
        let token = &tokens[*cursor];
        if body_end_offset.is_some_and(|end| token.offset >= end) {
            break;
        }
        if token.value == -3 {
            *cursor += 1;
            break;
        }

        let node_path = if path_prefix.is_empty() {
            child_index.to_string()
        } else {
            format!("{path_prefix}.{child_index}")
        };

        if token.value == -2 && *cursor + 1 < tokens.len() {
            let length_token = &tokens[*cursor + 1];
            let body_start_offset = tokens
                .get(*cursor + 2)
                .map(|token| token.offset)
                .unwrap_or_else(|| length_token.delimiter_offset.saturating_add(4));
            let block_length = length_token.value;
            *cursor += 2;

            let block_end_offset = usize::try_from(block_length)
                .ok()
                .and_then(|length| body_start_offset.checked_add(length));
            let mut block_ancestors = ancestors.to_vec();
            block_ancestors.push((node_path.clone(), block_length));
            parse_dirty_tree_children(
                tokens,
                cursor,
                &node_path,
                block_end_offset,
                &block_ancestors,
                value_nodes,
            );
            if tokens.get(*cursor).is_some_and(|token| token.value == -3) {
                *cursor += 1;
            }
        } else {
            value_nodes.push(DirtyTreeValueNode {
                value: token.value,
                path: node_path,
                offset: token.offset,
                tree_signature: ancestors
                    .iter()
                    .map(|(path, length)| format!("{path}:{length}"))
                    .collect::<Vec<_>>()
                    .join(">"),
            });
            *cursor += 1;
        }

        child_index += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_i32_token(buffer: &mut Vec<u8>, value: i32) {
        buffer.extend_from_slice(&value.to_le_bytes());
        buffer.extend_from_slice(&DIRTY_TREE_DELIMITER.to_le_bytes());
    }

    fn selected_slot_fixture(item_config_id: i32) -> Vec<u8> {
        let mut tokens = [0i32; 59];
        tokens[0] = -2;
        tokens[1] = 448;
        tokens[3] = -2;
        tokens[4] = 112;
        tokens[19] = -3;
        tokens[21] = -2;
        tokens[22] = 272;
        tokens[28] = -2;
        tokens[29] = 208;
        tokens[35] = -2;
        tokens[36] = 144;
        tokens[42] = -2;
        tokens[43] = 80;
        tokens[49] = -2;
        tokens[50] = 16;
        tokens[52] = item_config_id;
        tokens[53] = -3;
        tokens[54] = -3;
        tokens[55] = -3;
        tokens[56] = -3;
        tokens[57] = -3;
        tokens[58] = -3;

        let mut buffer = Vec::new();
        for token in tokens {
            push_i32_token(&mut buffer, token);
        }
        buffer
    }

    fn selected_slot_full_sync_fixture() -> Vec<u8> {
        hex::decode(concat!(
            "feffffffefbeadde45040000efbeadde07000000efbeaddefeffffffefbeadde25040000efbeadde01000000efbeadde00000000efbeadde00000000efbeadde01000000efbeadde01000000efbeadde",
            "feffffffefbeadded5030000efbeadde04000000efbeadde01000000efbeadde00000000efbeadde01000000efbeadde693f000000000000efbeaddefeffffffefbeadde59030000efbeadde01000000",
            "efbeadde693f000000000000efbeadde02000000efbeaddeb2573101efbeadde03000000efbeadde0100000000000000efbeadde04000000efbeadde00000000efbeadde05000000efbeadde00000000",
            "efbeadde06000000efbeaddef87b4b619e010000efbeadde07000000efbeadde0000000000000000efbeadde08000000efbeadde00000000efbeadde09000000efbeadde03000000efbeadde0a000000",
            "efbeaddefeffffffefbeadde58010000efbeadde04000000efbeaddeffffffffefbeadde00000000efbeadde07000000efbeadde00000000efbeadde08000000efbeadde00000000efbeadde09000000",
            "efbeadde00000000efbeadde0a000000efbeaddeffffffffefbeadde00000000efbeadde0b000000efbeaddeffffffffefbeadde00000000efbeadde0c000000efbeaddeffffffffefbeadde00000000",
            "efbeadde0d000000efbeadde00000000efbeadde0e000000efbeaddeffffffffefbeadde00000000efbeadde0f000000efbeadde00000000efbeadde11000000efbeaddefeffffffefbeadde60000000",
            "efbeadde01000000efbeaddeffffffffefbeadde00000000efbeadde02000000efbeaddeffffffffefbeadde00000000efbeadde03000000efbeaddeffffffffefbeadde00000000efbeadde04000000",
            "efbeaddeffffffffefbeadde00000000efbeaddefdffffffefbeadde12000000efbeadde00000000efbeaddefdffffffefbeadde0b000000efbeaddefeffffffefbeadde40000000efbeadde01000000",
            "efbeadde00000000efbeadde02000000efbeadde00000000efbeadde03000000efbeadde00000000efbeadde04000000efbeadde00000000efbeaddefdffffffefbeadde0c000000efbeadde00000000",
            "00000000efbeadde0d000000efbeaddefeffffffefbeadde20000000efbeadde01000000efbeadde00000000efbeadde02000000efbeadde00000000efbeaddefdffffffefbeadde0e000000efbeadde",
            "feffffffefbeadde10000000efbeadde01000000efbeadde00000000efbeaddefdffffffefbeadde0f000000efbeaddeffffffffefbeadde00000000efbeadde10000000efbeadde00000000efbeadde",
            "11000000efbeaddeffffffffefbeadde00000000efbeadde12000000efbeadde00000000efbeadde13000000efbeadde00efbeaddefdffffffefbeadde743c000000000000efbeaddefeffffffefbead",
            "de14000000efbeadde03000000efbeaddeec13000000000000efbeaddefdffffffefbeaddefdffffffefbeadde04000000efbeadde693f0000efbeaddefdffffffefbeaddefdffffffefbeadde",
        ))
        .expect("valid full-sync selected factor fixture hex")
    }

    #[test]
    fn decodes_selected_polarity_x5_g8_fixture() {
        let buffer = selected_slot_fixture(20010928);
        assert_eq!(buffer.len(), 472);

        let items = selected_factor_items_from_dirty_buffer(&buffer);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].factor_buff_id, 3058050);
        assert_eq!(items[0].item_config_id, 20010928);
        assert_eq!(items[0].grade, Some(8));
        assert_eq!(items[0].runtime_source, SELECTED_FACTOR_RUNTIME_SOURCE);
        assert_eq!(items[0].selector_path.as_deref(), Some("0.3.5.5.5.5.1"));
        assert_eq!(
            items[0].selector_signature.as_deref(),
            Some("0:448>0.3:272>0.3.5:208>0.3.5.5:144>0.3.5.5.5:80>0.3.5.5.5.5:16")
        );
        assert_eq!(items[0].selector_offset, Some(416));
    }

    #[test]
    fn decodes_selected_polarity_x5_g10_full_sync_fixture() {
        let buffer = selected_slot_full_sync_fixture();
        assert_eq!(buffer.len(), 1117);

        let items = selected_factor_items_from_dirty_buffer(&buffer);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].factor_buff_id, 3058050);
        assert_eq!(items[0].item_config_id, 20010930);
        assert_eq!(items[0].grade, Some(10));
        assert_eq!(items[0].runtime_source, SELECTED_FACTOR_RUNTIME_SOURCE);
        assert_eq!(items[0].selector_path.as_deref(), Some("0.1.5.5.3"));
        assert_eq!(
            items[0].selector_signature.as_deref(),
            Some("0:1093>0.1:1061>0.1.5:981>0.1.5.5:857")
        );
        assert_eq!(items[0].selector_offset, Some(184));
    }

    #[test]
    fn ignores_grade_item_outside_selected_offset() {
        let mut buffer = selected_slot_fixture(0);
        buffer[64..68].copy_from_slice(&20010928i32.to_le_bytes());

        let items = selected_factor_items_from_dirty_buffer(&buffer);

        assert!(items.is_empty());
    }

    #[test]
    fn exposes_zero_dirty_node_for_transition_cache() {
        let buffer = selected_slot_fixture(0);

        let nodes = factor_selector_dirty_nodes_from_dirty_buffer(&buffer);

        assert!(nodes.iter().any(|node| {
            node.value == 0
                && node.path == "0.3.5.5.5.5.1"
                && node.tree_signature
                    == "0:448>0.3:272>0.3.5:208>0.3.5.5:144>0.3.5.5.5:80>0.3.5.5.5.5:16"
                && node.item_config_id.is_none()
        }));
    }

    #[test]
    fn exposes_factor_grade_dirty_node_for_transition_cache() {
        let buffer = selected_slot_fixture(20010928);

        let nodes = factor_selector_dirty_nodes_from_dirty_buffer(&buffer);

        let node = nodes
            .iter()
            .find(|node| node.path == "0.3.5.5.5.5.1")
            .expect("selected slot node");
        assert_eq!(node.item_config_id, Some(20010928));
        assert_eq!(node.factor_buff_id, Some(3058050));
        assert_eq!(node.grade, Some(8));
    }
}
