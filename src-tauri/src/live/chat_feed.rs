use crate::live::event_logger::EventLoggerEntry;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConversationNotice {
    pub channel: Option<i32>,
    pub channel_label: Option<String>,
    pub message_id: Option<i64>,
    pub sender_uid: Option<i64>,
    pub sender_name: Option<String>,
    pub sender_level: Option<i32>,
    pub timestamp: Option<i64>,
    pub message_type: Option<i32>,
    pub message_type_label: Option<String>,
    pub target_id: Option<i64>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct ConversationEnvelope {
    channel: Option<i32>,
    chat_msg: Option<ConversationMessage>,
}

#[derive(Debug, Clone, Default)]
struct ConversationMessage {
    message_id: Option<i64>,
    sender: Option<ConversationSender>,
    timestamp: Option<i64>,
    message_info: Option<ConversationMessageInfo>,
}

#[derive(Debug, Clone, Default)]
struct ConversationSender {
    uid: Option<i64>,
    name: Option<String>,
    level: Option<i32>,
}

#[derive(Debug, Clone, Default)]
struct ConversationMessageInfo {
    message_type: Option<i32>,
    target_id: Option<i64>,
    text: Option<String>,
}

pub fn decode_conversation_notice(payload: &[u8]) -> Option<ConversationNotice> {
    let envelope = parse_wrapped_or_direct_envelope(payload)?;
    let message = envelope.chat_msg?;
    let message_info = message.message_info.unwrap_or_default();
    let sender = message.sender.unwrap_or_default();

    Some(ConversationNotice {
        channel: envelope.channel,
        channel_label: envelope
            .channel
            .map(|value| channel_label(value).to_string()),
        message_id: message.message_id,
        sender_uid: sender.uid,
        sender_name: sender.name,
        sender_level: sender.level,
        timestamp: message.timestamp,
        message_type: message_info.message_type,
        message_type_label: message_info
            .message_type
            .map(|value| message_type_label(value).to_string()),
        target_id: message_info.target_id,
        text: message_info.text,
    })
}

pub fn build_conversation_logger_entries(ts_ms: i64, payload: &[u8]) -> Vec<EventLoggerEntry> {
    let Some(decoded) = decode_conversation_notice(payload) else {
        return Vec::new();
    };

    let message_type = decoded.message_type.unwrap_or_default();
    let raw_text = decoded.text.clone().unwrap_or_default();
    let text = normalize_chat_text(raw_text.trim(), message_type);
    if text.is_empty() {
        return Vec::new();
    }

    let channel_label = decoded
        .channel_label
        .clone()
        .unwrap_or_else(|| "unknown".to_string());
    let sender_label = decoded
        .sender_name
        .clone()
        .or_else(|| decoded.sender_uid.map(|uid| format!("UID {uid}")));

    let summary = match sender_label.as_deref() {
        Some(sender) if !sender.trim().is_empty() => {
            Some(format!("[{channel_label}] {sender}: {text}"))
        }
        _ => Some(format!("[{channel_label}] {text}")),
    };

    vec![EventLoggerEntry {
        ts_ms,
        category: "chat".into(),
        action: "message".into(),
        uid: decoded.message_id.or(decoded.sender_uid),
        target_uid: None,
        source_uid: decoded.sender_uid,
        source_label: sender_label.clone(),
        target_label: Some(channel_label.clone()),
        name_hint: sender_label,
        summary,
        stacks: None,
        duration_ms: None,
        remaining_ms: None,
        value: Some(text),
        raw: serde_json::to_string_pretty(&serde_json::json!({
            "decoded": decoded,
            "extra": {
                "decodePath": "notify_newest_chit_chat_msgs"
            }
        }))
        .unwrap_or_else(|_| "null".to_string()),
    }]
}

fn channel_label(value: i32) -> &'static str {
    match value {
        0 => "null",
        1 => "world",
        2 => "general",
        3 => "team",
        4 => "guild",
        5 => "private",
        6 => "group",
        7 => "notice",
        99 => "system",
        _ => "unknown",
    }
}

fn message_type_label(value: i32) -> &'static str {
    match value {
        0 => "text",
        1 => "notice",
        2 => "multi_lang_notice",
        3 => "sticker",
        4 => "image",
        5 => "voice",
        6 => "hypertext",
        _ => "unknown",
    }
}

fn normalize_chat_text(text: &str, message_type: i32) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if message_type == 3 || trimmed.contains("sticker_") {
        let sticker_id = extract_sticker_id(trimmed);
        return match sticker_id {
            Some(value) => format!("[sticker] {value}"),
            None => "[sticker]".to_string(),
        };
    }

    trimmed.to_string()
}

fn extract_sticker_id(text: &str) -> Option<String> {
    text.split(|ch: char| ch.is_whitespace() || ch == '=' || ch == ',' || ch == ';')
        .find(|part| part.contains("sticker_"))
        .map(|part| {
            part.trim_matches(|ch: char| {
                ch == '%' || ch == ':' || ch == '"' || ch == '\'' || ch == '\\'
            })
            .to_string()
        })
}

fn parse_wrapped_or_direct_envelope(bytes: &[u8]) -> Option<ConversationEnvelope> {
    if let Some(wrapped) = parse_top_level_wrapper(bytes) {
        return Some(wrapped);
    }
    parse_conversation_envelope(bytes)
}

fn parse_top_level_wrapper(bytes: &[u8]) -> Option<ConversationEnvelope> {
    let mut offset = 0usize;
    while offset < bytes.len() {
        let key = read_varint(bytes, &mut offset)?;
        let field_number = key >> 3;
        let wire_type = (key & 0x07) as u8;

        match (field_number, wire_type) {
            (1, 2) => {
                let nested = read_len_delimited(bytes, &mut offset)?;
                return parse_conversation_envelope(nested);
            }
            _ => skip_field(bytes, &mut offset, wire_type)?,
        }
    }
    None
}

fn parse_conversation_envelope(bytes: &[u8]) -> Option<ConversationEnvelope> {
    let mut offset = 0usize;
    let mut out = ConversationEnvelope::default();

    while offset < bytes.len() {
        let key = read_varint(bytes, &mut offset)?;
        let field_number = key >> 3;
        let wire_type = (key & 0x07) as u8;

        match (field_number, wire_type) {
            (1, 0) => out.channel = Some(read_varint(bytes, &mut offset)? as i32),
            (2, 2) => {
                let nested = read_len_delimited(bytes, &mut offset)?;
                out.chat_msg = parse_conversation_message(nested);
            }
            _ => skip_field(bytes, &mut offset, wire_type)?,
        }
    }

    Some(out)
}

fn parse_conversation_message(bytes: &[u8]) -> Option<ConversationMessage> {
    let mut offset = 0usize;
    let mut out = ConversationMessage::default();

    while offset < bytes.len() {
        let key = read_varint(bytes, &mut offset)?;
        let field_number = key >> 3;
        let wire_type = (key & 0x07) as u8;

        match (field_number, wire_type) {
            (1, 0) => out.message_id = Some(read_varint(bytes, &mut offset)? as i64),
            (2, 2) => {
                let nested = read_len_delimited(bytes, &mut offset)?;
                out.sender = parse_conversation_sender(nested);
            }
            (3, 0) => out.timestamp = Some(read_varint(bytes, &mut offset)? as i64),
            (4, 2) => {
                let nested = read_len_delimited(bytes, &mut offset)?;
                out.message_info = parse_conversation_message_info(nested);
            }
            _ => skip_field(bytes, &mut offset, wire_type)?,
        }
    }

    Some(out)
}

fn parse_conversation_sender(bytes: &[u8]) -> Option<ConversationSender> {
    let mut offset = 0usize;
    let mut out = ConversationSender::default();

    while offset < bytes.len() {
        let key = read_varint(bytes, &mut offset)?;
        let field_number = key >> 3;
        let wire_type = (key & 0x07) as u8;

        match (field_number, wire_type) {
            (1, 0) => out.uid = Some(read_varint(bytes, &mut offset)? as i64),
            (2, 2) => {
                let value = read_len_delimited(bytes, &mut offset)?;
                out.name = Some(String::from_utf8_lossy(value).to_string());
            }
            (5, 0) => out.level = Some(read_varint(bytes, &mut offset)? as i32),
            _ => skip_field(bytes, &mut offset, wire_type)?,
        }
    }

    Some(out)
}

fn parse_conversation_message_info(bytes: &[u8]) -> Option<ConversationMessageInfo> {
    let mut offset = 0usize;
    let mut out = ConversationMessageInfo::default();

    while offset < bytes.len() {
        let key = read_varint(bytes, &mut offset)?;
        let field_number = key >> 3;
        let wire_type = (key & 0x07) as u8;

        match (field_number, wire_type) {
            (1, 0) => out.message_type = Some(read_varint(bytes, &mut offset)? as i32),
            (2, 0) => out.target_id = Some(read_varint(bytes, &mut offset)? as i64),
            (3, 2) => {
                let value = read_len_delimited(bytes, &mut offset)?;
                out.text = Some(String::from_utf8_lossy(value).to_string());
            }
            _ => skip_field(bytes, &mut offset, wire_type)?,
        }
    }

    Some(out)
}

fn read_varint(bytes: &[u8], offset: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    let mut shift = 0u32;

    while *offset < bytes.len() && shift < 64 {
        let byte = bytes.get(*offset).copied()?;
        *offset += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if (byte & 0x80) == 0 {
            return Some(value);
        }
        shift += 7;
    }

    None
}

fn read_len_delimited<'a>(bytes: &'a [u8], offset: &mut usize) -> Option<&'a [u8]> {
    let len = usize::try_from(read_varint(bytes, offset)?).ok()?;
    let end = offset.checked_add(len)?;
    let slice = bytes.get(*offset..end)?;
    *offset = end;
    Some(slice)
}

fn skip_field(bytes: &[u8], offset: &mut usize, wire_type: u8) -> Option<()> {
    match wire_type {
        0 => {
            read_varint(bytes, offset)?;
            Some(())
        }
        1 => {
            let end = offset.checked_add(8)?;
            bytes.get(*offset..end)?;
            *offset = end;
            Some(())
        }
        2 => {
            let len = usize::try_from(read_varint(bytes, offset)?).ok()?;
            let end = offset.checked_add(len)?;
            bytes.get(*offset..end)?;
            *offset = end;
            Some(())
        }
        5 => {
            let end = offset.checked_add(4)?;
            bytes.get(*offset..end)?;
            *offset = end;
            Some(())
        }
        _ => None,
    }
}
