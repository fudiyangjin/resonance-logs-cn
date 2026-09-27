//! Buff presence shared by every projection that shows or tracks buffs.
//!
//! Defines once how instances of one base id merge and how a composite buff
//! derives from its members, so the HUD, coverage/history and voice cannot
//! drift apart. Composites are configured under negative ids (never a game
//! buff id) and flow through every consumer like an ordinary buff.

use std::cmp::Reverse;
use std::collections::HashMap;

use crate::live::bootstrap_snapshot::{BuffCompositeSpec, MAX_BUFF_COMPOSITE_MEMBERS};
use crate::live::runtime::events::{BuffState, MonoTimeMs};

/// One composite buff: present while at least `min_active` of its `members`
/// are.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuffComposite {
    pub id: i32,
    pub members: Box<[i32]>,
    /// In `1..=members.len()`; equal to the member count unless a threshold
    /// is configured.
    pub min_active: usize,
}

impl BuffComposite {
    /// Presence of the composite among one entity's `buffs`.
    ///
    /// It holds while at least `min_active` members are present, so its
    /// timing follows the member with the `min_active`-th latest expiry:
    /// with every member required that is the member ending first, with one
    /// required the member ending last. Members that never expire rank
    /// latest. The layer is the lowest member layer (complete sets) when
    /// every member is required, otherwise the number of members present.
    pub fn presence<'a, I>(&self, buffs: I) -> Option<BuffPresence<'a>>
    where
        I: IntoIterator<Item = &'a BuffState> + Clone,
    {
        let mut present = [None; MAX_BUFF_COMPOSITE_MEMBERS];
        let mut count = 0;
        let mut lowest_layer = i32::MAX;
        for member in &self.members {
            if let Some(presence) = buff_presence(*member, buffs.clone()) {
                lowest_layer = lowest_layer.min(presence.layer);
                present[count] = Some(presence);
                count += 1;
            }
        }
        if count < self.min_active {
            return None;
        }
        let present = &mut present[..count];
        present.sort_unstable_by_key(|presence| Reverse(presence.map(|p| expiry_rank(&p))));
        let limiting = present[self.min_active - 1]?;
        let layer = if self.min_active == self.members.len() {
            lowest_layer
        } else {
            i32::try_from(count).unwrap_or(i32::MAX)
        };
        Some(BuffPresence { layer, ..limiting })
    }
}

/// Ranks a later expiry higher; one that never expires ranks highest.
fn expiry_rank(presence: &BuffPresence<'_>) -> (bool, Option<MonoTimeMs>) {
    let expires = presence.expires_mono_ms();
    (expires.is_none(), expires)
}

/// Composite definitions, parsed once per configuration and shared by the
/// projections through an `Arc`.
#[derive(Debug, Default)]
pub struct BuffCompositeCatalog {
    composites: Vec<BuffComposite>,
    /// Member base id -> indices into `composites`.
    by_member: HashMap<i32, Vec<usize>>,
}

impl BuffCompositeCatalog {
    /// Builds the catalog from normalized specs (see
    /// `MonitorRuntimeSnapshot::normalize`); member counts and thresholds are
    /// clamped so evaluation can rely on them.
    #[must_use]
    pub fn from_specs(specs: &[BuffCompositeSpec]) -> Self {
        let mut by_member: HashMap<i32, Vec<usize>> = HashMap::new();
        let composites = specs
            .iter()
            .enumerate()
            .map(|(index, spec)| {
                let members: Box<[i32]> = spec
                    .member_ids
                    .iter()
                    .copied()
                    .take(MAX_BUFF_COMPOSITE_MEMBERS)
                    .collect();
                for member in &members {
                    by_member.entry(*member).or_default().push(index);
                }
                let member_count = members.len();
                let min_active = spec
                    .min_active
                    .map_or(member_count, |min_active| {
                        usize::try_from(min_active).unwrap_or(usize::MAX)
                    })
                    .clamp(1, member_count.max(1));
                BuffComposite {
                    id: spec.id,
                    members,
                    min_active,
                }
            })
            .collect();
        Self {
            composites,
            by_member,
        }
    }

    #[must_use]
    pub fn get(&self, id: i32) -> Option<&BuffComposite> {
        self.composites.iter().find(|composite| composite.id == id)
    }

    pub fn iter(&self) -> impl Iterator<Item = &BuffComposite> {
        self.composites.iter()
    }

    /// Composites that `base_id` is a member of; empty for most buffs, so
    /// the buff-event path can skip composites with one hash lookup.
    pub fn with_member(&self, base_id: i32) -> impl Iterator<Item = &BuffComposite> {
        self.by_member
            .get(&base_id)
            .into_iter()
            .flatten()
            .map(|index| &self.composites[*index])
    }
}

/// Merged presence of one buff key on one entity.
#[derive(Debug, Clone, Copy)]
pub struct BuffPresence<'a> {
    /// The instance whose timing the presence follows.
    pub timing: &'a BuffState,
    pub layer: i32,
}

impl BuffPresence<'_> {
    /// Expiry of the presence; `None` means it never runs out.
    #[must_use]
    pub fn expires_mono_ms(&self) -> Option<MonoTimeMs> {
        buff_expiry(self.timing)
    }
}

/// Expiry of one instance; `None` for an instance without (or with a zero)
/// duration, which never runs out.
#[must_use]
pub fn buff_expiry(buff: &BuffState) -> Option<MonoTimeMs> {
    if buff.duration_ms.is_none_or(|duration| duration == 0) {
        return None;
    }
    buff.expires_mono_ms
}

/// Merges every instance of `base_id` among `buffs`: timing follows the
/// instance that expires last (one that never expires wins) and the layer is
/// the highest one.
pub fn buff_presence<'a>(
    base_id: i32,
    buffs: impl IntoIterator<Item = &'a BuffState>,
) -> Option<BuffPresence<'a>> {
    buffs
        .into_iter()
        .filter(|buff| buff.base_id == base_id)
        .fold(None, |merged, buff| {
            Some(match merged {
                None => BuffPresence {
                    timing: buff,
                    layer: buff.layer,
                },
                Some(current) => BuffPresence {
                    timing: if expires_later(buff_expiry(buff), current.expires_mono_ms()) {
                        buff
                    } else {
                        current.timing
                    },
                    layer: current.layer.max(buff.layer),
                },
            })
        })
}

/// Whether `left` expires strictly later than `right`; `None` never expires.
fn expires_later(left: Option<MonoTimeMs>, right: Option<MonoTimeMs>) -> bool {
    match (left, right) {
        (None, right) => right.is_some(),
        (Some(_), None) => false,
        (Some(left), Some(right)) => left > right,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::events::{EntityRef, EntityUuid};
    use std::sync::Arc;

    fn buff(instance_id: i64, base_id: i32, layer: i32, expires: Option<u64>) -> BuffState {
        BuffState {
            target: EntityRef {
                uuid: EntityUuid(1),
                generation: 1,
            },
            instance_id,
            base_id,
            layer,
            source: None,
            resolved_owner: None,
            source_config_id: None,
            duration_ms: expires.map(|_| 10_000),
            started_wall_ms: Some(1_000),
            expires_wall_ms: None,
            started_mono_ms: Some(MonoTimeMs(0)),
            expires_mono_ms: expires.map(MonoTimeMs),
            effect_ids: Arc::from([]),
        }
    }

    #[test]
    fn instances_merge_to_latest_expiry_and_highest_layer() {
        let buffs = [buff(1, 7, 1, Some(5_000)), buff(2, 7, 3, Some(9_000))];
        let presence = buff_presence(7, &buffs).expect("present");
        assert_eq!(presence.timing.instance_id, 2);
        assert_eq!(presence.layer, 3);
        assert!(buff_presence(8, &buffs).is_none());
    }

    #[test]
    fn a_permanent_instance_dominates_the_merge() {
        let buffs = [buff(1, 7, 1, None), buff(2, 7, 1, Some(9_000))];
        let presence = buff_presence(7, &buffs).expect("present");
        assert_eq!(presence.expires_mono_ms(), None);
    }

    #[test]
    fn zero_duration_counts_as_permanent() {
        let mut instance = buff(1, 7, 1, Some(5_000));
        instance.duration_ms = Some(0);
        assert_eq!(buff_expiry(&instance), None);
    }

    fn at_least(members: &[i32], min_active: usize) -> BuffComposite {
        BuffComposite {
            id: -1,
            members: members.into(),
            min_active,
        }
    }

    fn all_of(members: &[i32]) -> BuffComposite {
        at_least(members, members.len())
    }

    #[test]
    fn composite_needs_every_member() {
        let buffs = [buff(1, 1, 1, Some(5_000)), buff(2, 2, 1, Some(6_000))];
        assert!(all_of(&[1, 2, 3]).presence(&buffs).is_none());
        assert!(all_of(&[1, 2]).presence(&buffs).is_some());
    }

    #[test]
    fn composite_follows_the_member_expiring_first_with_the_lowest_layer() {
        let buffs = [
            buff(1, 1, 2, Some(9_000)),
            buff(2, 2, 3, Some(4_000)),
            buff(3, 3, 1, None),
        ];
        let presence = all_of(&[1, 2, 3]).presence(&buffs).expect("present");
        assert_eq!(presence.timing.instance_id, 2);
        assert_eq!(presence.expires_mono_ms(), Some(MonoTimeMs(4_000)));
        assert_eq!(presence.layer, 1);
    }

    #[test]
    fn composite_of_permanent_members_never_expires() {
        let buffs = [buff(1, 1, 1, None), buff(2, 2, 1, None)];
        let presence = all_of(&[1, 2]).presence(&buffs).expect("present");
        assert_eq!(presence.expires_mono_ms(), None);
    }

    #[test]
    fn threshold_needs_that_many_members() {
        let composite = at_least(&[1, 2, 3, 4, 5], 3);
        let two = [buff(1, 1, 1, Some(5_000)), buff(2, 2, 1, Some(6_000))];
        assert!(composite.presence(&two).is_none());
        let three = [
            buff(1, 1, 1, Some(5_000)),
            buff(2, 2, 1, Some(6_000)),
            buff(3, 5, 1, Some(7_000)),
        ];
        assert!(composite.presence(&three).is_some());
    }

    #[test]
    fn threshold_lasts_until_too_few_members_remain() {
        // Four of five present; with three required the composite ends once
        // the second member to expire (6 s) is gone.
        let buffs = [
            buff(1, 1, 2, Some(10_000)),
            buff(2, 2, 2, Some(8_000)),
            buff(3, 3, 2, Some(6_000)),
            buff(4, 4, 2, Some(4_000)),
        ];
        let presence = at_least(&[1, 2, 3, 4, 5], 3)
            .presence(&buffs)
            .expect("present");
        assert_eq!(presence.expires_mono_ms(), Some(MonoTimeMs(6_000)));
        assert_eq!(presence.timing.instance_id, 3);
        // A threshold composite counts the members present.
        assert_eq!(presence.layer, 4);
    }

    #[test]
    fn threshold_ranks_permanent_members_latest() {
        let buffs = [
            buff(1, 1, 1, None),
            buff(2, 2, 1, Some(8_000)),
            buff(3, 3, 1, Some(6_000)),
        ];
        let presence = at_least(&[1, 2, 3], 2).presence(&buffs).expect("present");
        assert_eq!(presence.expires_mono_ms(), Some(MonoTimeMs(8_000)));
    }

    #[test]
    fn any_one_follows_the_member_ending_last() {
        let buffs = [buff(1, 1, 1, Some(5_000)), buff(2, 3, 1, Some(9_000))];
        let presence = at_least(&[1, 2, 3], 1).presence(&buffs).expect("present");
        assert_eq!(presence.expires_mono_ms(), Some(MonoTimeMs(9_000)));
        assert_eq!(presence.layer, 2);
        assert!(at_least(&[1, 2, 3], 1).presence(&[]).is_none());
    }

    #[test]
    fn catalog_resolves_thresholds_and_indexes_members() {
        let catalog = BuffCompositeCatalog::from_specs(&[
            BuffCompositeSpec {
                id: -1,
                member_ids: vec![1, 2],
                min_active: None,
            },
            BuffCompositeSpec {
                id: -2,
                member_ids: vec![2, 3, 4],
                min_active: Some(2),
            },
        ]);
        assert_eq!(
            catalog.get(-1).map(|composite| composite.min_active),
            Some(2)
        );
        assert_eq!(
            catalog.get(-2).map(|composite| composite.min_active),
            Some(2)
        );
        let ids = |base_id| {
            catalog
                .with_member(base_id)
                .map(|composite| composite.id)
                .collect::<Vec<_>>()
        };
        assert_eq!(ids(2), vec![-1, -2]);
        assert_eq!(ids(3), vec![-2]);
        assert!(ids(5).is_empty());
        assert_eq!(
            catalog.get(-2).map(|composite| composite.members.len()),
            Some(3)
        );
    }
}
