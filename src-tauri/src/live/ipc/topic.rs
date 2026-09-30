//! Per-window live publication topics and dirty masks.

use crate::WINDOW_MAIN_LABEL;

/// Bitmask of dirty publication topics.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TopicMask(u16);

impl TopicMask {
    pub const EMPTY: Self = Self(0);
    pub const COMBAT: Self = Self(1 << 0);
    pub const STATUS: Self = Self(1 << 1);
    pub const BUFFS: Self = Self(1 << 2);
    pub const MONSTER: Self = Self(1 << 3);
    pub const FANTASY: Self = Self(1 << 4);
    pub const MINIMAP: Self = Self(1 << 5);
    pub const DEATHS: Self = Self(1 << 6);
    pub const SCENE: Self = Self(1 << 7);
    pub const TEAM: Self = Self(1 << 8);

    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }

    #[must_use]
    pub const fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0
    }

    #[must_use]
    pub const fn intersects(self, other: Self) -> bool {
        self.0 & other.0 != 0
    }

    #[must_use]
    pub const fn union(self, other: Self) -> Self {
        Self(self.0 | other.0)
    }

    #[must_use]
    pub const fn intersection(self, other: Self) -> Self {
        Self(self.0 & other.0)
    }

    pub fn insert(&mut self, other: Self) {
        self.0 |= other.0;
    }

    pub fn remove(&mut self, other: Self) {
        self.0 &= !other.0;
    }

    /// Iterate set topic bits as named topics.
    pub fn iter(self) -> impl Iterator<Item = Topic> {
        Topic::ALL
            .into_iter()
            .filter(move |topic| self.contains(topic.mask()))
    }
}

impl std::ops::BitOr for TopicMask {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self::Output {
        self.union(rhs)
    }
}

impl std::ops::BitOrAssign for TopicMask {
    fn bitor_assign(&mut self, rhs: Self) {
        self.insert(rhs);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Topic {
    Combat,
    Status,
    Buffs,
    Monster,
    Fantasy,
    Minimap,
    Deaths,
    Scene,
    Team,
}

impl Topic {
    /// Every topic, in the order used to index per-topic publication state.
    pub const ALL: [Self; Self::COUNT] = [
        Self::Combat,
        Self::Status,
        Self::Buffs,
        Self::Monster,
        Self::Fantasy,
        Self::Minimap,
        Self::Deaths,
        Self::Scene,
        Self::Team,
    ];

    pub const COUNT: usize = 9;

    /// Position of this topic in [`Topic::ALL`].
    #[must_use]
    pub const fn index(self) -> usize {
        match self {
            Self::Combat => 0,
            Self::Status => 1,
            Self::Buffs => 2,
            Self::Monster => 3,
            Self::Fantasy => 4,
            Self::Minimap => 5,
            Self::Deaths => 6,
            Self::Scene => 7,
            Self::Team => 8,
        }
    }

    #[must_use]
    pub const fn mask(self) -> TopicMask {
        match self {
            Self::Combat => TopicMask::COMBAT,
            Self::Status => TopicMask::STATUS,
            Self::Buffs => TopicMask::BUFFS,
            Self::Monster => TopicMask::MONSTER,
            Self::Fantasy => TopicMask::FANTASY,
            Self::Minimap => TopicMask::MINIMAP,
            Self::Deaths => TopicMask::DEATHS,
            Self::Scene => TopicMask::SCENE,
            Self::Team => TopicMask::TEAM,
        }
    }

    #[must_use]
    pub const fn event_name(self) -> Option<&'static str> {
        match self {
            Self::Scene => Some("live-scene"),
            _ => None,
        }
    }

    /// Target window labels for the remaining low-frequency event path.
    /// High-frequency topics are exposed exclusively through invoke pull.
    #[must_use]
    pub const fn window_labels(self) -> &'static [&'static str] {
        match self {
            Self::Scene => &[WINDOW_MAIN_LABEL],
            _ => &[],
        }
    }

    #[must_use]
    pub const fn throttle_ms(self) -> Option<u64> {
        match self {
            Self::Combat => None, // uses configured event_update_rate_ms
            Self::Status
            | Self::Buffs
            | Self::Monster
            | Self::Fantasy
            | Self::Minimap
            | Self::Deaths
            | Self::Scene
            | Self::Team => Some(50),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_is_the_only_webview_event_topic() {
        for topic in Topic::ALL {
            if topic == Topic::Scene {
                assert_eq!(topic.window_labels(), &[WINDOW_MAIN_LABEL]);
                assert_eq!(topic.event_name(), Some("live-scene"));
            } else {
                assert!(topic.window_labels().is_empty());
                assert_eq!(topic.event_name(), None);
            }
        }
    }

    #[test]
    fn status_shares_fifty_ms_throttle_with_other_pull_topics() {
        for topic in [
            Topic::Status,
            Topic::Buffs,
            Topic::Monster,
            Topic::Fantasy,
            Topic::Minimap,
            Topic::Deaths,
            Topic::Scene,
            Topic::Team,
        ] {
            assert_eq!(topic.throttle_ms(), Some(50));
        }
        assert_eq!(Topic::Combat.throttle_ms(), None);
    }

    #[test]
    fn topic_index_and_mask_are_consistent() {
        for (index, topic) in Topic::ALL.into_iter().enumerate() {
            assert_eq!(topic.index(), index);
            assert_eq!(topic.mask(), TopicMask(1 << index));
        }
    }
}
