//! The team, kept as the game client keeps it (`team_data.TeamInfo`): who is
//! in it, and which row of the in-game team panel draws each member.
//!
//! Every rule mirrors the decompiled client: `grpc_team_ntf_impl.lua` for how
//! notices change the table, `team_vm.lua` (`GetTeamMemData`) and
//! `team_view.lua` (`getTeamGroupMemberInfo`, `getMemberInfoByIndex`) for the
//! panel order. Only the notices the client applies change membership, so a
//! team is known once the plugin has seen it being joined or created.

use std::collections::BTreeMap;

use super::events::{ObservedTeamBase, ObservedTeamMember, TeamKind, TeamRosterUpdate};

const GROUP_COUNT: i32 = 4;
const ROWS_PER_GROUP: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Member {
    /// Unix seconds.
    enter_time: u32,
    group_id: i32,
}

/// One drawn row of the team panel.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TeamSlot {
    pub char_id: i64,
    /// 1..=4; always 1 for a five-member team. Group 1 is top left, 2 top
    /// right, 3 bottom left, 4 bottom right.
    pub group: u8,
    /// 1..=5 within the group, after empty slots are squeezed out.
    pub row: u8,
}

/// Where the game's team panel draws each member, in panel order.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TeamLayout {
    pub kind: TeamKind,
    pub slots: Vec<TeamSlot>,
}

/// Who is in the team, taken before a notice to diff membership against.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TeamMembership {
    /// `0` when not in a team.
    pub team_id: i64,
    /// `0` when unknown.
    pub leader_id: i64,
    /// Ascending char ids, the local character included.
    pub members: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
struct Table {
    team_id: i64,
    leader_id: i64,
    kind: TeamKind,
    create_time_ms: i64,
    /// `groupId` → slot char ids; empty slots are `0`.
    groups: BTreeMap<i32, Vec<i64>>,
    members: BTreeMap<i64, Member>,
}

/// The team as the game client tracks it.
#[derive(Debug, Default)]
pub struct TeamRoster {
    table: Table,
    revision: u64,
}

impl TeamRoster {
    /// Bumped whenever the team changes.
    #[must_use]
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// `0` when not in a team.
    #[must_use]
    pub fn team_id(&self) -> i64 {
        self.table.team_id
    }

    #[must_use]
    pub fn contains(&self, char_id: i64) -> bool {
        self.table.members.contains_key(&char_id)
    }

    /// Ascending char ids, the local character included.
    pub fn member_ids(&self) -> impl Iterator<Item = i64> + '_ {
        self.table.members.keys().copied()
    }

    #[must_use]
    pub fn membership(&self) -> TeamMembership {
        TeamMembership {
            team_id: self.table.team_id,
            leader_id: self.table.leader_id,
            members: self.member_ids().collect(),
        }
    }

    /// Applies one notice the way the game client does.
    pub fn apply(&mut self, update: TeamRosterUpdate, local_char_id: Option<i64>) {
        let before = self.table.clone();
        let table = &mut self.table;
        match update {
            TeamRosterUpdate::BaseReplaced(base) => table.replace_base(base, local_char_id),
            TeamRosterUpdate::Joined { base, members } => {
                if let Some(base) = base {
                    if base.team_id == 0 {
                        *table = Table::default();
                    } else {
                        // Joining: `SetTeamInfo(baseInfo, {})`; already in the
                        // team: the base info is replaced without regrouping.
                        if base.team_id != table.team_id {
                            table.members.clear();
                        }
                        table.set_base(base);
                    }
                }
                if table.team_id != 0 {
                    for member in members {
                        table.upsert(member);
                    }
                }
            }
            TeamRosterUpdate::MembersRefreshed(members) => {
                // The client only takes the social data from these, but the
                // enter time is the same server value; it fills the one gap
                // in the table: a team creator's own entry.
                for member in members {
                    if let (Some(existing), Some(enter_time)) =
                        (table.members.get_mut(&member.char_id), member.enter_time)
                    {
                        existing.enter_time = enter_time;
                    }
                }
            }
            TeamRosterUpdate::MemberLeft { char_id } => {
                if local_char_id == Some(char_id) {
                    *table = Table::default();
                } else {
                    // Slots keep the leaver until the next group update.
                    table.members.remove(&char_id);
                }
            }
            TeamRosterUpdate::Dissolved => *table = Table::default(),
            TeamRosterUpdate::Matched { base, members } => {
                *table = Table::default();
                if base.team_id != 0 {
                    table.set_base(base);
                    for member in members {
                        table.upsert(member);
                    }
                }
            }
            TeamRosterUpdate::GroupsReplaced(groups) => {
                if table.team_id != 0 {
                    table.groups = groups.into_iter().collect();
                    table.rewrite_group_ids();
                }
            }
        }
        if self.table != before {
            self.revision = self.revision.wrapping_add(1);
        }
    }

    /// Where the game's team panel draws each member.
    #[must_use]
    pub fn layout(&self) -> TeamLayout {
        let table = &self.table;
        let slots = match table.kind {
            TeamKind::Five => {
                let mut order: Vec<_> = table
                    .members
                    .iter()
                    .map(|(char_id, member)| (member.enter_time, *char_id))
                    .collect();
                order.sort_unstable();
                rows(order, 1)
            }
            TeamKind::Twenty => (1..=GROUP_COUNT)
                .flat_map(|group_id| table.group_slots(group_id))
                .collect(),
        };
        TeamLayout {
            kind: table.kind,
            slots,
        }
    }
}

impl Table {
    /// One group of a twenty-member team: members by their own group id,
    /// ordered by their index in that group's slots (`0` when absent), with
    /// empty slots squeezed out.
    fn group_slots(&self, group_id: i32) -> Vec<TeamSlot> {
        let slots = self.groups.get(&group_id);
        let mut order: Vec<_> = self
            .members
            .iter()
            .filter(|(_, member)| member.group_id == group_id)
            .map(|(char_id, _)| {
                let index = slots
                    .and_then(|slots| slots.iter().position(|slot| slot == char_id))
                    .map_or(0, |index| index + 1);
                (index, *char_id)
            })
            .collect();
        order.sort_unstable();
        rows(order, u8::try_from(group_id).unwrap_or_default())
    }

    fn replace_base(&mut self, base: ObservedTeamBase, local_char_id: Option<i64>) {
        if base.team_id == 0 {
            *self = Self::default();
            return;
        }
        if base.team_id != self.team_id {
            self.members.clear();
            // A creator gets its own entry from the `CreateTeam` reply,
            // which is never captured; its enter time is the creation time.
            if let Some(local) = local_char_id
                .filter(|local| base.groups.iter().any(|(_, slots)| slots.contains(local)))
            {
                self.members.insert(
                    local,
                    Member {
                        enter_time: seconds(base.create_time_ms),
                        group_id: 0,
                    },
                );
            }
        }
        self.set_base(base);
        self.rewrite_group_ids();
    }

    fn set_base(&mut self, base: ObservedTeamBase) {
        self.team_id = base.team_id;
        self.leader_id = base.leader_id;
        self.kind = base.kind;
        self.create_time_ms = base.create_time_ms;
        self.groups = base.groups.into_iter().collect();
    }

    /// `SetTeamMember`: the new entry replaces the old one.
    fn upsert(&mut self, member: ObservedTeamMember) {
        let enter_time = member
            .enter_time
            .or_else(|| {
                self.members
                    .get(&member.char_id)
                    .map(|existing| existing.enter_time)
            })
            .unwrap_or_else(|| seconds(self.create_time_ms));
        self.members.insert(
            member.char_id,
            Member {
                enter_time,
                group_id: member.group_id.unwrap_or_default(),
            },
        );
    }

    /// `setTeamGroupInfo`: members found in a group's slots take its id.
    fn rewrite_group_ids(&mut self) {
        for (group_id, slots) in &self.groups {
            for char_id in slots {
                if let Some(member) = self.members.get_mut(char_id) {
                    member.group_id = *group_id;
                }
            }
        }
    }
}

/// Numbers ordered `(sort key, char id)` pairs as the rows of one group.
fn rows<K>(order: Vec<(K, i64)>, group: u8) -> Vec<TeamSlot> {
    order
        .into_iter()
        .take(ROWS_PER_GROUP)
        .zip(1_u8..)
        .map(|((_, char_id), row)| TeamSlot {
            char_id,
            group,
            row,
        })
        .collect()
}

fn seconds(unix_ms: i64) -> u32 {
    u32::try_from(unix_ms.max(0) / 1000).unwrap_or(u32::MAX)
}

/// Builders for tests elsewhere in the live runtime.
#[cfg(test)]
pub(crate) mod test_support {
    use super::super::events::{
        EntityUuid, ObservedTeamBase, ObservedTeamMember, ProtocolObservation, TeamKind,
        TeamRosterUpdate,
    };
    use crate::live::entity_id::{canonical_player_uuid, uid_from_uuid};

    pub(crate) fn player(char_id: i64) -> EntityUuid {
        EntityUuid(canonical_player_uuid(char_id))
    }

    /// A five-member team `team_id` joined with player `members`, in panel
    /// order; the first is the leader. Joining the same team again adds.
    pub(crate) fn joined_team(team_id: i64, members: &[EntityUuid]) -> ProtocolObservation {
        let char_ids: Vec<i64> = members
            .iter()
            .map(|uuid| {
                let char_id = uid_from_uuid(uuid.0);
                assert_eq!(player(char_id), *uuid, "team members are players");
                char_id
            })
            .collect();
        ProtocolObservation::TeamRoster(TeamRosterUpdate::Joined {
            base: Some(ObservedTeamBase {
                team_id,
                leader_id: char_ids.first().copied().unwrap_or_default(),
                kind: TeamKind::Five,
                create_time_ms: 0,
                groups: vec![(1, char_ids.clone())],
            }),
            members: char_ids
                .into_iter()
                .zip(1..)
                .map(|(char_id, enter_time)| ObservedTeamMember {
                    char_id,
                    enter_time: Some(enter_time),
                    group_id: Some(1),
                })
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SELF_ID: i64 = 5_126_482;

    fn base(team_id: i64, kind: TeamKind, groups: &[(i32, &[i64])]) -> ObservedTeamBase {
        ObservedTeamBase {
            team_id,
            leader_id: SELF_ID,
            kind,
            create_time_ms: 1_790_690_684_520,
            groups: groups
                .iter()
                .map(|(group_id, slots)| (*group_id, slots.to_vec()))
                .collect(),
        }
    }

    fn member(char_id: i64, enter_time: u32, group_id: i32) -> ObservedTeamMember {
        ObservedTeamMember {
            char_id,
            enter_time: Some(enter_time),
            group_id: Some(group_id),
        }
    }

    fn rows(roster: &TeamRoster) -> Vec<(i64, u8, u8)> {
        roster
            .layout()
            .slots
            .iter()
            .map(|slot| (slot.char_id, slot.group, slot.row))
            .collect()
    }

    fn joined(roster: &mut TeamRoster, slots: &[i64], members: Vec<ObservedTeamMember>) {
        roster.apply(
            TeamRosterUpdate::Joined {
                base: Some(base(7, TeamKind::Twenty, &[(1, slots)])),
                members,
            },
            Some(SELF_ID),
        );
    }

    /// Replays `team.log` of capture 1790690668526: the local player creates
    /// a team and four bots join within the same second.
    #[test]
    fn five_member_order_follows_enter_time_then_char_id_not_slots() {
        let mut roster = TeamRoster::default();
        let team = 731_802_104;
        let empty: &[i64] = &[0, 0, 0, 0, 0];
        roster.apply(
            TeamRosterUpdate::BaseReplaced(base(
                team,
                TeamKind::Twenty,
                &[
                    (1, &[SELF_ID, 0, 0, 0, 0]),
                    (2, empty),
                    (3, empty),
                    (4, empty),
                ],
            )),
            Some(SELF_ID),
        );
        assert_eq!(rows(&roster), vec![(SELF_ID, 1, 1)]);
        assert_eq!(
            roster.membership(),
            TeamMembership {
                team_id: team,
                leader_id: SELF_ID,
                members: vec![SELF_ID],
            },
            "a creator's own entry comes from the team slots"
        );

        roster.apply(
            TeamRosterUpdate::BaseReplaced(base(
                team,
                TeamKind::Five,
                &[(1, &[SELF_ID, 0, 0, 0, 0])],
            )),
            Some(SELF_ID),
        );
        let mut slots = vec![SELF_ID];
        for bot in [2_796_945, 2_796_943, 2_796_942, 2_796_944] {
            slots.push(bot);
            let mut padded = slots.clone();
            padded.resize(5, 0);
            roster.apply(
                TeamRosterUpdate::Joined {
                    base: Some(base(team, TeamKind::Five, &[(1, &padded)])),
                    members: vec![member(bot, 1_790_690_705, 1)],
                },
                Some(SELF_ID),
            );
        }
        let order: Vec<_> = roster
            .layout()
            .slots
            .iter()
            .map(|slot| slot.char_id)
            .collect();
        assert_eq!(
            order,
            vec![SELF_ID, 2_796_942, 2_796_943, 2_796_944, 2_796_945],
            "enter time first, char id breaks ties; slot order is ignored"
        );

        let revision = roster.revision();
        roster.apply(
            TeamRosterUpdate::MembersRefreshed(vec![member(SELF_ID, 1_790_690_684, 1)]),
            Some(SELF_ID),
        );
        assert_eq!(roster.revision(), revision, "nothing changed, no bump");

        roster.apply(TeamRosterUpdate::Dissolved, Some(SELF_ID));
        assert!(roster.layout().slots.is_empty());
        assert_eq!(roster.membership(), TeamMembership::default());
        assert!(roster.revision() > revision);
    }

    #[test]
    fn member_info_refreshes_enter_times_but_never_adds_members() {
        let mut roster = TeamRoster::default();
        roster.apply(
            TeamRosterUpdate::BaseReplaced(base(7, TeamKind::Five, &[(1, &[SELF_ID, 0])])),
            Some(SELF_ID),
        );
        roster.apply(
            TeamRosterUpdate::Joined {
                base: Some(base(7, TeamKind::Five, &[(1, &[SELF_ID, 3])])),
                members: vec![member(3, 1_790_690_684, 1)],
            },
            Some(SELF_ID),
        );
        assert_eq!(rows(&roster), vec![(3, 1, 1), (SELF_ID, 1, 2)]);

        roster.apply(
            TeamRosterUpdate::MembersRefreshed(vec![
                member(SELF_ID, 1_790_690_600, 1),
                member(99, 1, 1),
            ]),
            Some(SELF_ID),
        );
        assert_eq!(rows(&roster), vec![(SELF_ID, 1, 1), (3, 1, 2)]);
        assert!(!roster.contains(99));
    }

    #[test]
    fn twenty_member_groups_squeeze_empty_slots() {
        let mut roster = TeamRoster::default();
        roster.apply(
            TeamRosterUpdate::Joined {
                base: Some(base(
                    7,
                    TeamKind::Twenty,
                    &[(1, &[SELF_ID, 0, 0, 0, 0]), (2, &[10, 0, 20, 0, 30])],
                )),
                members: vec![
                    member(SELF_ID, 1, 1),
                    member(30, 1, 2),
                    member(10, 1, 2),
                    member(20, 1, 2),
                ],
            },
            Some(SELF_ID),
        );
        assert_eq!(
            rows(&roster),
            vec![(SELF_ID, 1, 1), (10, 2, 1), (20, 2, 2), (30, 2, 3)]
        );

        // Leaving keeps the slots; the rows below move up.
        roster.apply(TeamRosterUpdate::MemberLeft { char_id: 10 }, Some(SELF_ID));
        assert_eq!(rows(&roster), vec![(SELF_ID, 1, 1), (20, 2, 1), (30, 2, 2)]);
        assert!(!roster.contains(10));
    }

    #[test]
    fn join_keeps_group_ids_until_a_regrouping_notice() {
        let mut roster = TeamRoster::default();
        joined(
            &mut roster,
            &[SELF_ID, 10, 0, 0, 0],
            vec![member(SELF_ID, 1, 1), member(10, 1, 1)],
        );
        // Member 10 moved to group 2, but a join notice does not regroup.
        roster.apply(
            TeamRosterUpdate::Joined {
                base: Some(base(
                    7,
                    TeamKind::Twenty,
                    &[(1, &[SELF_ID, 20, 0, 0, 0]), (2, &[10, 0, 0, 0, 0])],
                )),
                members: vec![member(20, 2, 1)],
            },
            Some(SELF_ID),
        );
        assert_eq!(
            rows(&roster),
            vec![(10, 1, 1), (SELF_ID, 1, 2), (20, 1, 3)],
            "10 keeps group 1 and, missing from its slots, sorts first"
        );

        roster.apply(
            TeamRosterUpdate::GroupsReplaced(vec![
                (1, vec![SELF_ID, 20, 0, 0, 0]),
                (2, vec![10, 0, 0, 0, 0]),
            ]),
            Some(SELF_ID),
        );
        assert_eq!(rows(&roster), vec![(SELF_ID, 1, 1), (20, 1, 2), (10, 2, 1)]);
    }

    #[test]
    fn base_info_regroups_members() {
        let mut roster = TeamRoster::default();
        joined(
            &mut roster,
            &[SELF_ID, 10, 0, 0, 0],
            vec![member(SELF_ID, 1, 1), member(10, 1, 1)],
        );
        roster.apply(
            TeamRosterUpdate::BaseReplaced(base(
                7,
                TeamKind::Twenty,
                &[(1, &[SELF_ID, 0, 0, 0, 0]), (4, &[0, 0, 10, 0, 0])],
            )),
            Some(SELF_ID),
        );
        assert_eq!(rows(&roster), vec![(SELF_ID, 1, 1), (10, 4, 1)]);
    }

    #[test]
    fn a_new_team_or_match_replaces_members_and_leaving_clears() {
        let mut roster = TeamRoster::default();
        joined(
            &mut roster,
            &[SELF_ID, 10],
            vec![member(SELF_ID, 1, 1), member(10, 1, 1)],
        );
        roster.apply(
            TeamRosterUpdate::BaseReplaced(base(8, TeamKind::Five, &[(1, &[SELF_ID])])),
            Some(SELF_ID),
        );
        assert_eq!(roster.membership().members, vec![SELF_ID]);

        roster.apply(
            TeamRosterUpdate::Matched {
                base: base(9, TeamKind::Five, &[(1, &[SELF_ID, 40])]),
                members: vec![member(40, 2, 1), member(SELF_ID, 3, 1)],
            },
            Some(SELF_ID),
        );
        assert_eq!(rows(&roster), vec![(40, 1, 1), (SELF_ID, 1, 2)]);
        assert_eq!(roster.team_id(), 9);

        roster.apply(TeamRosterUpdate::MemberLeft { char_id: 40 }, Some(SELF_ID));
        assert_eq!(rows(&roster), vec![(SELF_ID, 1, 1)]);
        roster.apply(
            TeamRosterUpdate::MemberLeft { char_id: SELF_ID },
            Some(SELF_ID),
        );
        assert_eq!(roster.membership(), TeamMembership::default());

        // Members without a team are ignored.
        roster.apply(
            TeamRosterUpdate::Joined {
                base: None,
                members: vec![member(40, 2, 1)],
            },
            Some(SELF_ID),
        );
        assert!(!roster.contains(40));
    }

    #[test]
    fn zero_team_id_clears_the_team() {
        let mut roster = TeamRoster::default();
        joined(&mut roster, &[SELF_ID], vec![member(SELF_ID, 1, 1)]);
        roster.apply(
            TeamRosterUpdate::BaseReplaced(base(0, TeamKind::Five, &[(1, &[SELF_ID])])),
            Some(SELF_ID),
        );
        assert_eq!(roster.membership(), TeamMembership::default());
    }
}
