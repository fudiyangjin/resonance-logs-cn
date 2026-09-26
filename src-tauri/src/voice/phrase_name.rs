//! Content-addressed names of auto-managed voice phrases.
//!
//! A binding's generated phrase is named `{source}:{rule key}[:{variant}]~{h8}`,
//! where `h8` hashes the language and the spoken text. Every distinct text
//! therefore gets its own phrase: loadouts that speak different words for
//! the same subject each keep their audio, and identical texts share one
//! phrase. The frontend builds the same names (`src/lib/voice/phrase-key.ts`)
//! and both sides pin the hash with the same golden vectors. Bundled prompts
//! (`auto:voice:alert:*`) keep fixed names.
//!
//! The *slot* of a name — rule key plus tier variant, without source and
//! hash — identifies the binding it speaks for. While a slot's current
//! phrase has no audio yet (text just edited, loadout just switched), the
//! newest phrase of the same slot that has audio keeps playing.

use std::borrow::Cow;
use std::cmp::Reverse;
use std::collections::HashSet;

use super::models::{VoiceCatalog, VoiceLanguage, VoicePhraseMeta};

const HASH_LEN: usize = 8;
const SOURCE_PREFIXES: [&str; 2] = ["auto:", "custom:"];
const RULE_KEY_PREFIX: &str = "voice:";
/// Rule keys of bundled prompts, which keep fixed names.
const BUNDLED_RULE_KEY_PREFIX: &str = "voice:alert:";
const ENTITY_RULE_KEY_PREFIX: &str = "voice:entity:";

/// FNV-1a 32-bit over the UTF-8 of `"{language}\0{text}"`, as 8 lowercase
/// hex digits.
#[must_use]
pub(crate) fn content_hash(text: &str, language: VoiceLanguage) -> String {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in language.as_str().bytes().chain([0]).chain(text.bytes()) {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    format!("{hash:08x}")
}

/// The rule key and variant of a managed name, without its source prefix.
fn managed_key(name: &str) -> Option<&str> {
    SOURCE_PREFIXES
        .iter()
        .find_map(|source| name.strip_prefix(source))
        .filter(|key| key.starts_with(RULE_KEY_PREFIX))
}

/// The binding slot a content-addressed managed name speaks for; `None`
/// for every other name (hand-made phrases, bundled prompts, legacy names).
#[must_use]
pub(crate) fn managed_slot(name: &str) -> Option<&str> {
    let (body, hash) = name.rsplit_once('~')?;
    let is_hash = hash.len() == HASH_LEN
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
    if !is_hash {
        return None;
    }
    managed_key(body)
}

/// A managed name from before content addressing (bundled prompts excluded).
fn is_legacy_managed(name: &str) -> bool {
    !name.contains('~')
        && managed_key(name).is_some_and(|key| !key.starts_with(BUNDLED_RULE_KEY_PREFIX))
}

/// `legacy` under the current rule key: entity bindings were keyed by the
/// watch entry's scope (`voice:entity:{id}:{self|any}:{event}`) before one
/// entry per monster id owned them (`voice:entity:{id}:{event}`).
fn current_rule_name(legacy: &str) -> Cow<'_, str> {
    let Some((source, key)) = SOURCE_PREFIXES
        .iter()
        .find_map(|source| Some((*source, legacy.strip_prefix(source)?)))
    else {
        return Cow::Borrowed(legacy);
    };
    let Some(rest) = key.strip_prefix(ENTITY_RULE_KEY_PREFIX) else {
        return Cow::Borrowed(legacy);
    };
    let mut parts = rest.splitn(3, ':');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(monster_id), Some("self" | "any"), Some(event)) => Cow::Owned(format!(
            "{source}{ENTITY_RULE_KEY_PREFIX}{monster_id}:{event}"
        )),
        _ => Cow::Borrowed(legacy),
    }
}

/// Renames managed phrases from before content addressing to the name
/// their current text gets now (under the current rule key), keeping ids
/// and audio, so every binding whose text did not change finds its phrase
/// again. A phrase whose new name another phrase already holds keeps its
/// old name; it then shows up as unused. Idempotent. Returns how many
/// phrases were renamed.
pub(crate) fn migrate_to_content_names(catalog: &mut VoiceCatalog) -> usize {
    let mut taken: HashSet<String> = catalog
        .phrases
        .iter()
        .map(|phrase| phrase.name.clone())
        .collect();
    let mut renamed = 0;
    for phrase in &mut catalog.phrases {
        if !is_legacy_managed(&phrase.name) {
            continue;
        }
        let next = format!(
            "{}~{}",
            current_rule_name(&phrase.name),
            content_hash(&phrase.text, phrase.language)
        );
        if taken.insert(next.clone()) {
            phrase.name = next;
            renamed += 1;
        }
    }
    renamed
}

/// Phrases of `slot` other than `exclude_id`, newest first.
pub(crate) fn slot_siblings<'a>(
    catalog: &'a VoiceCatalog,
    slot: &str,
    exclude_id: Option<&str>,
) -> Vec<&'a VoicePhraseMeta> {
    let mut siblings: Vec<&VoicePhraseMeta> = catalog
        .phrases
        .iter()
        .filter(|phrase| {
            Some(phrase.id.as_str()) != exclude_id && managed_slot(&phrase.name) == Some(slot)
        })
        .collect();
    siblings.sort_by_key(|phrase| Reverse(phrase.updated_at_ms));
    siblings
}

#[cfg(test)]
mod tests {
    use super::*;

    fn phrase(id: &str, name: &str, text: &str, updated_at_ms: i64) -> VoicePhraseMeta {
        VoicePhraseMeta {
            id: id.to_string(),
            name: name.to_string(),
            text: text.to_string(),
            language: VoiceLanguage::ZhCn,
            active_asset_id: None,
            updated_at_ms,
        }
    }

    #[test]
    fn content_hash_matches_the_frontend_golden_vectors() {
        // Same vectors as `src/lib/voice/phrase-key.test.ts`.
        assert_eq!(content_hash("", VoiceLanguage::ZhCn), "0f03554a");
        assert_eq!(
            content_hash("镰车还有5秒消失", VoiceLanguage::ZhCn),
            "76ddfb4a"
        );
        assert_eq!(
            content_hash("镰车还有3秒消失", VoiceLanguage::ZhCn),
            "bbf8b0a8"
        );
        assert_eq!(content_hash("Ready check", VoiceLanguage::EnUs), "1295c939");
        assert_eq!(content_hash("準備完了", VoiceLanguage::JaJp), "849889d1");
    }

    #[test]
    fn slot_is_rule_key_and_variant_of_content_addressed_names_only() {
        assert_eq!(
            managed_slot("custom:voice:skill:1420:readyIn~76ddfb4a"),
            Some("voice:skill:1420:readyIn")
        );
        assert_eq!(
            managed_slot("auto:voice:buff:101:gained:tier3~0f03554a"),
            Some("voice:buff:101:gained:tier3")
        );
        assert_eq!(managed_slot("auto:voice:skill:1420:ready"), None);
        assert_eq!(managed_slot("auto:voice:skill:1420:ready~XYZ"), None);
        assert_eq!(managed_slot("auto:voice:skill:1420:ready~0F03554A"), None);
        assert_eq!(managed_slot("机制来了~0f03554a"), None);
        assert_eq!(managed_slot("auto:other~0f03554a"), None);
    }

    #[test]
    fn migration_renames_legacy_managed_names_once_and_skips_the_rest() {
        let mut catalog = VoiceCatalog {
            phrases: vec![
                phrase("skill", "auto:voice:skill:1420:ready", "技能就绪", 1),
                phrase("tier", "custom:voice:buff:101:lost:tier3", "", 1),
                phrase("alert", "auto:voice:alert:matchReady", "匹配成功", 1),
                phrase("mine", "机制来了", "机制来了", 1),
                phrase("done", "auto:voice:buff:1:gained~12345678", "x", 1),
            ],
            ..VoiceCatalog::default()
        };
        assert_eq!(migrate_to_content_names(&mut catalog), 2);
        let skill_hash = content_hash("技能就绪", VoiceLanguage::ZhCn);
        let names: Vec<&str> = catalog
            .phrases
            .iter()
            .map(|phrase| phrase.name.as_str())
            .collect();
        assert_eq!(
            names,
            [
                format!("auto:voice:skill:1420:ready~{skill_hash}").as_str(),
                "custom:voice:buff:101:lost:tier3~0f03554a",
                "auto:voice:alert:matchReady",
                "机制来了",
                "auto:voice:buff:1:gained~12345678",
            ]
        );
        assert_eq!(migrate_to_content_names(&mut catalog), 0);
    }

    #[test]
    fn migration_drops_the_entity_scope_and_skips_taken_names() {
        let mut catalog = VoiceCatalog {
            phrases: vec![
                phrase(
                    "self",
                    "custom:voice:entity:179901:self:expiring",
                    "镰车还有5秒消失",
                    1,
                ),
                // The other scope's copy of the same text: its new name is taken.
                phrase(
                    "any",
                    "custom:voice:entity:179901:any:expiring",
                    "镰车还有5秒消失",
                    2,
                ),
                phrase(
                    "other",
                    "auto:voice:entity:179901:any:expiring",
                    "镰车还有3秒消失",
                    3,
                ),
            ],
            ..VoiceCatalog::default()
        };
        assert_eq!(migrate_to_content_names(&mut catalog), 2);
        let names: Vec<&str> = catalog
            .phrases
            .iter()
            .map(|phrase| phrase.name.as_str())
            .collect();
        assert_eq!(
            names,
            [
                "custom:voice:entity:179901:expiring~76ddfb4a",
                "custom:voice:entity:179901:any:expiring",
                "auto:voice:entity:179901:expiring~bbf8b0a8",
            ]
        );
        assert_eq!(migrate_to_content_names(&mut catalog), 0);
    }

    #[test]
    fn siblings_share_the_slot_across_sources_and_come_newest_first() {
        let catalog = VoiceCatalog {
            phrases: vec![
                phrase("current", "custom:voice:skill:1420:ready~aaaaaaaa", "新", 3),
                phrase("older", "auto:voice:skill:1420:ready~bbbbbbbb", "旧", 1),
                phrase("newer", "custom:voice:skill:1420:ready~cccccccc", "中", 2),
                phrase(
                    "tier",
                    "custom:voice:skill:1420:ready:tier1~dddddddd",
                    "阶",
                    9,
                ),
                phrase("legacy", "custom:voice:skill:1420:ready", "旧", 9),
            ],
            ..VoiceCatalog::default()
        };
        let ids: Vec<&str> = slot_siblings(&catalog, "voice:skill:1420:ready", Some("current"))
            .into_iter()
            .map(|phrase| phrase.id.as_str())
            .collect();
        assert_eq!(ids, ["newer", "older"]);
    }
}
