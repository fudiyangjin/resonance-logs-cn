use std::sync::Arc;

use super::buff::{BuffAggregate, BuffAggregateBuilder, BuffEdge};
use super::*;
use crate::live::runtime::events::{
    BatchId, BossMechanicObservation, BuffState, EntityIdentityPatch, EntityKind, EntityRef,
    EntityUuid, EventMeta, FieldPatch, ObservedBuff, ObservedBuffChange, ProtocolBatch,
    ProtocolObservation, TimerScope, VoiceBuffScope, VoiceLeadSubject,
};
use crate::voice::models::{MonsterBuffSourceScope, VoiceSubject, VoiceTrigger};

fn trigger(subject: VoiceSubject, event: VoiceEvent) -> VoiceTrigger {
    VoiceTrigger::new(subject, event)
}

fn local_buff(buff_id: i32) -> VoiceSubject {
    VoiceSubject::Buff { buff_id }
}

fn monster_buff(buff_id: i32, source_scope: MonsterBuffSourceScope) -> VoiceSubject {
    VoiceSubject::MonsterBuff {
        buff_id,
        source_scope,
    }
}

fn alert(alert: AlertKind) -> VoiceTrigger {
    trigger(VoiceSubject::Alert { alert }, VoiceEvent::Started)
}

fn expiring(seconds_before: u32) -> VoiceEvent {
    VoiceEvent::ExpiringIn { seconds_before }
}

fn buff(instance_id: i64, expires_mono_ms: Option<u64>) -> ObservedBuff {
    ObservedBuff {
        instance_id,
        base_id: 77,
        layer: 1,
        source_uuid: Some(EntityUuid(1)),
        source_config_id: None,
        duration_ms: expires_mono_ms.map(|_| 1_000),
        started_wall_ms: Some(1_000),
        expires_wall_ms: expires_mono_ms.map(|value| value as i64),
        started_mono_ms: Some(MonoTimeMs(1_000)),
        expires_mono_ms: expires_mono_ms.map(MonoTimeMs),
        effect_ids: Arc::from([]),
    }
}

fn batch(sequence: u64, observations: Vec<ProtocolObservation>) -> ProtocolBatch {
    ProtocolBatch {
        meta: EventMeta {
            batch_id: BatchId(sequence),
            capture_sequence: sequence,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: sequence as i64 * 100,
            captured_mono_ns: sequence * 100_000_000,
            source_time_ms: None,
        },
        observations,
    }
}

fn local_context() -> EntityContext {
    let mut entities = EntityContext::new();
    entities.apply_batch(batch(
        1,
        vec![
            ProtocolObservation::EntityAppeared {
                uuid: EntityUuid(1),
                kind: EntityKind::Character,
            },
            ProtocolObservation::LocalPlayerChanged {
                uuid: Some(EntityUuid(1)),
            },
        ],
    ));
    entities
}

fn buff_state(
    instance_id: i64,
    duration_ms: Option<u64>,
    expires_mono_ms: Option<u64>,
) -> BuffState {
    BuffState {
        target: EntityRef {
            uuid: EntityUuid(1),
            generation: 1,
        },
        instance_id,
        base_id: 77,
        layer: 1,
        source: None,
        resolved_owner: None,
        source_config_id: None,
        duration_ms,
        started_wall_ms: Some(1_000),
        expires_wall_ms: expires_mono_ms.map(|value| value as i64),
        started_mono_ms: Some(MonoTimeMs(1_000)),
        expires_mono_ms: expires_mono_ms.map(MonoTimeMs),
        effect_ids: Arc::from([]),
    }
}

fn rule(id: &str, trigger: VoiceTrigger, phrase_id: &str, cooldown_ms: u64) -> VoiceRule {
    VoiceRule {
        id: id.to_string(),
        enabled: true,
        trigger,
        phrase_id: phrase_id.to_string(),
        priority: 1,
        cooldown_ms,
        phrase_id_by_tier: None,
    }
}

/// `rules` as `LiveCore` hands them over: normalized.
fn snapshot_of(rules: Vec<VoiceRule>) -> VoiceRuntimeSnapshot {
    let mut snapshot = VoiceRuntimeSnapshot {
        enabled: true,
        volume: 1.0,
        queue_policy: Default::default(),
        rules,
    };
    snapshot.normalize();
    snapshot
}

fn projection_with(rules: Vec<VoiceRule>) -> VoiceProjection {
    let mut projection = VoiceProjection::default();
    projection.apply_config(
        &snapshot_of(rules),
        &EntityContext::new(),
        0,
        MonoTimeMs(0),
        &mut DeadlineScheduler::new(),
    );
    projection
}

fn domain_event(sequence: u64, event: DomainEvent) -> DomainEnvelope {
    DomainEnvelope {
        sequence,
        batch_id: BatchId(sequence),
        occurred_at_ms: sequence as i64 * 1_000,
        meta: EventMeta {
            batch_id: BatchId(sequence),
            capture_sequence: sequence,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: sequence as i64 * 1_000,
            captured_mono_ns: sequence * 1_000_000,
            source_time_ms: None,
        },
        event_index: 0,
        segment_id: None,
        event,
    }
}

fn fired_phrases(projection: &mut VoiceProjection) -> Vec<String> {
    projection
        .take_cues()
        .into_iter()
        .map(|cue| cue.phrase_id)
        .collect()
}

fn boss_mechanic(base_skill_id: i32, expires_mono_ms: u64) -> DomainEvent {
    DomainEvent::BossMechanicStarted(BossMechanicObservation {
        base_skill_id,
        skill_effect_id: 0,
        insertion: 0,
        server_timestamp_ms: None,
        duration_ms: 0,
        expires_mono_ms: MonoTimeMs(expires_mono_ms),
    })
}

fn apply_observations(
    projection: &mut VoiceProjection,
    entities: &mut EntityContext,
    scheduler: &mut DeadlineScheduler,
    sequence: u64,
    observations: Vec<ProtocolObservation>,
) {
    for event in entities.apply_batch(batch(sequence, observations)) {
        projection.apply(&event, entities, scheduler);
    }
}

// ---------------------------------------------------------------------------
// Buff aggregates, edges and lead cues.
// ---------------------------------------------------------------------------

#[test]
fn multiple_instances_emit_only_first_gained_and_last_lost() {
    let mut aggregates = BuffAggregates::default();
    let mut entities = local_context();
    entities.apply_batch(batch(
        2,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Applied {
                buff: buff(10, Some(2_000)),
            },
        }],
    ));
    let gained = aggregates.replace(
        collect_buff_aggregates(&entities, &BuffCompositeCatalog::default()),
        true,
    );
    assert_eq!(gained.len(), 1);
    assert!(gained[0].gained);

    entities.apply_batch(batch(
        3,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Applied {
                buff: buff(11, Some(3_000)),
            },
        }],
    ));
    assert!(
        aggregates
            .replace(
                collect_buff_aggregates(&entities, &BuffCompositeCatalog::default()),
                true
            )
            .is_empty()
    );

    entities.apply_batch(batch(
        4,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Remove { instance_id: 10 },
        }],
    ));
    assert!(
        aggregates
            .replace(
                collect_buff_aggregates(&entities, &BuffCompositeCatalog::default()),
                true
            )
            .is_empty()
    );

    entities.apply_batch(batch(
        5,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Remove { instance_id: 11 },
        }],
    ));
    let lost = aggregates.replace(
        collect_buff_aggregates(&entities, &BuffCompositeCatalog::default()),
        true,
    );
    assert_eq!(lost.len(), 1);
    assert!(!lost[0].gained);
}

#[test]
fn composite_aggregate_follows_its_members() {
    let catalog =
        BuffCompositeCatalog::from_specs(&[crate::live::bootstrap_snapshot::BuffCompositeSpec {
            id: -1,
            member_ids: vec![77, 78],
            min_active: None,
        }]);
    let applied = |buff: ObservedBuff| ProtocolObservation::BuffChanged {
        target_uuid: EntityUuid(1),
        change: ObservedBuffChange::Applied { buff },
    };
    let composite_edges = |edges: Vec<BuffEdge>| {
        edges
            .into_iter()
            .filter(|edge| edge.base_id == -1)
            .collect::<Vec<_>>()
    };
    let mut aggregates = BuffAggregates::default();
    let mut entities = local_context();

    entities.apply_batch(batch(2, vec![applied(buff(10, Some(2_000)))]));
    let edges = aggregates.replace(collect_buff_aggregates(&entities, &catalog), true);
    assert!(composite_edges(edges).is_empty());

    // The second member expires first (started at 1_000, lasts 500).
    let mut other = buff(11, Some(1_500));
    other.base_id = 78;
    other.duration_ms = Some(500);
    entities.apply_batch(batch(3, vec![applied(other)]));
    let gained =
        composite_edges(aggregates.replace(collect_buff_aggregates(&entities, &catalog), true));
    assert_eq!(gained.len(), 1);
    assert!(gained[0].gained);
    assert_eq!(gained[0].scope, VoiceBuffScope::LocalPlayer);
    assert_eq!(gained[0].fantasy_tier, None);
    assert_eq!(
        aggregates
            .get(VoiceBuffScope::LocalPlayer, -1)
            .and_then(|aggregate| aggregate.expires_mono_ms),
        Some(MonoTimeMs(1_500))
    );

    entities.apply_batch(batch(
        4,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Remove { instance_id: 10 },
        }],
    ));
    let lost =
        composite_edges(aggregates.replace(collect_buff_aggregates(&entities, &catalog), true));
    assert_eq!(lost.len(), 1);
    assert!(!lost[0].gained);
}

#[test]
fn entity_disappearance_emits_one_lost_edge_for_each_aggregate() {
    let mut aggregates = BuffAggregates::default();
    let mut entities = local_context();
    entities.apply_batch(batch(
        2,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Applied {
                buff: buff(10, Some(2_000)),
            },
        }],
    ));
    aggregates.replace(
        collect_buff_aggregates(&entities, &BuffCompositeCatalog::default()),
        false,
    );

    entities.apply_batch(batch(
        3,
        vec![ProtocolObservation::EntityDisappeared {
            uuid: EntityUuid(1),
        }],
    ));
    let lost = aggregates.replace(
        collect_buff_aggregates(&entities, &BuffCompositeCatalog::default()),
        true,
    );

    assert_eq!(lost.len(), 1);
    assert_eq!(lost[0].scope, VoiceBuffScope::LocalPlayer);
    assert_eq!(lost[0].base_id, 77);
    assert!(!lost[0].gained);
}

#[test]
fn permanent_instance_suppresses_aggregate_expiry() {
    let finite = buff_state(1, Some(1_000), Some(2_000));
    let permanent = buff_state(2, Some(0), None);

    let entities = EntityContext::new();
    let mut builder = BuffAggregateBuilder::default();
    builder.record(&finite, &entities);
    builder.record(&permanent, &entities);
    assert_eq!(builder.finish().expires_mono_ms, None);
}

#[test]
fn local_source_scope_uses_original_source_not_summoner() {
    let mut entities = local_context();
    entities.apply_batch(batch(
        2,
        vec![
            ProtocolObservation::EntityAppeared {
                uuid: EntityUuid(2),
                kind: EntityKind::Monster,
            },
            ProtocolObservation::EntityAppeared {
                uuid: EntityUuid(3),
                kind: EntityKind::Monster,
            },
            ProtocolObservation::IdentityUpdated {
                uuid: EntityUuid(3),
                patch: EntityIdentityPatch {
                    owner_uuid: FieldPatch::Set(EntityUuid(1)),
                    ..Default::default()
                },
            },
            ProtocolObservation::AttackTargetChanged {
                actor_uuid: EntityUuid(1),
                target_uuid: Some(EntityUuid(2)),
            },
            ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(2),
                change: ObservedBuffChange::Applied {
                    buff: ObservedBuff {
                        source_uuid: Some(EntityUuid(3)),
                        ..buff(10, Some(2_000))
                    },
                },
            },
        ],
    ));

    // A summon owned by the local player is not the local player: raw
    // source matching excludes it from the local-player scope.
    let aggregates = collect_buff_aggregates(&entities, &BuffCompositeCatalog::default());
    assert!(aggregates[&VoiceBuffScope::MonsterAnySource].contains_key(&77));
    assert!(
        !aggregates
            .get(&VoiceBuffScope::MonsterLocalPlayerSource)
            .is_some_and(|buffs| buffs.contains_key(&77))
    );

    entities.apply_batch(batch(
        3,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(2),
            change: ObservedBuffChange::Applied {
                buff: ObservedBuff {
                    source_uuid: Some(EntityUuid(1)),
                    ..buff(11, Some(2_000))
                },
            },
        }],
    ));
    let aggregates = collect_buff_aggregates(&entities, &BuffCompositeCatalog::default());
    assert!(aggregates[&VoiceBuffScope::MonsterLocalPlayerSource].contains_key(&77));
}

#[test]
fn aggregate_expiry_uses_latest_finite_instance() {
    let entities = EntityContext::new();
    let mut builder = BuffAggregateBuilder::default();
    builder.record(&buff_state(10, Some(1_000), Some(2_000)), &entities);
    builder.record(&buff_state(11, Some(2_000), Some(3_000)), &entities);
    assert_eq!(builder.finish().expires_mono_ms, Some(MonoTimeMs(3_000)));
}

fn aggregate(expires_mono_ms: Option<u64>) -> BuffAggregate {
    BuffAggregate {
        expires_mono_ms: expires_mono_ms.map(MonoTimeMs),
        fantasy_tier: None,
    }
}

#[test]
fn permanent_aggregate_cancels_existing_expiry_timer() {
    let mut projection = projection_with(vec![rule(
        "buff-expiry",
        trigger(local_buff(77), expiring(1)),
        "buff-expiry",
        0,
    )]);
    let mut scheduler = DeadlineScheduler::new();
    projection
        .buffs
        .set(VoiceBuffScope::LocalPlayer, 77, aggregate(Some(5_000)));
    projection.sync_buff_leads(
        VoiceSyncReason::Runtime,
        1_000,
        MonoTimeMs(1_000),
        &mut scheduler,
    );
    assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(4_000)));

    projection
        .buffs
        .set(VoiceBuffScope::LocalPlayer, 77, aggregate(None));
    projection.sync_buff_leads(
        VoiceSyncReason::Runtime,
        2_000,
        MonoTimeMs(2_000),
        &mut scheduler,
    );
    assert!(scheduler.is_empty());
    assert!(projection.take_cues().is_empty());
}

#[test]
fn expired_lead_time_is_not_scheduled() {
    let mut projection = projection_with(vec![rule(
        "buff-expiry",
        trigger(local_buff(77), expiring(1)),
        "buff-expiry",
        0,
    )]);
    let mut scheduler = DeadlineScheduler::new();
    projection
        .buffs
        .set(VoiceBuffScope::LocalPlayer, 77, aggregate(Some(2_000)));
    projection.sync_buff_leads(
        VoiceSyncReason::Runtime,
        1_001,
        MonoTimeMs(1_001),
        &mut scheduler,
    );
    assert!(scheduler.is_empty());
    assert_eq!(projection.tracker.len(), 0);
}

/// Buff 77 on the local player (uuid 1), counted from the batch's clock.
fn local_buff_applied(instance_id: i64, duration_ms: u64) -> ObservedBuff {
    ObservedBuff {
        instance_id,
        base_id: 77,
        layer: 1,
        source_uuid: Some(EntityUuid(1)),
        source_config_id: None,
        duration_ms: Some(duration_ms),
        started_wall_ms: None,
        expires_wall_ms: None,
        started_mono_ms: None,
        expires_mono_ms: None,
        effect_ids: Arc::from([]),
    }
}

/// A local buff with 10 s left and a "5 s left" rule, gained at 200 ms: the
/// cue is armed for 5 200 ms.
fn buff_expiring_in_five_seconds() -> (VoiceProjection, EntityContext, DeadlineScheduler) {
    let mut projection = projection_with(vec![rule(
        "soon",
        trigger(local_buff(77), expiring(5)),
        "soon",
        0,
    )]);
    let mut entities = local_context();
    let mut scheduler = DeadlineScheduler::new();
    apply_observations(
        &mut projection,
        &mut entities,
        &mut scheduler,
        2,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Applied {
                buff: local_buff_applied(10, 10_000),
            },
        }],
    );
    assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(5_200)));
    (projection, entities, scheduler)
}

fn shorten_local_buff(duration_ms: u64) -> ProtocolObservation {
    ProtocolObservation::BuffChanged {
        target_uuid: EntityUuid(1),
        change: ObservedBuffChange::Delta {
            instance_id: 10,
            layer: None,
            duration_ms: Some(duration_ms),
            create_time: None,
            effect_ids: None,
        },
    }
}

#[test]
fn buff_shortened_inside_lead_fires_expiring_immediately() {
    let (mut projection, mut entities, mut scheduler) = buff_expiring_in_five_seconds();

    // At 1 000 ms the server leaves 3 s: the 5 s mark is gone, the buff is not.
    apply_observations(
        &mut projection,
        &mut entities,
        &mut scheduler,
        10,
        vec![shorten_local_buff(3_000)],
    );
    let cues = projection.take_cues();
    assert_eq!(cues.len(), 1);
    assert_eq!(cues[0].phrase_id, "soon");
    // The warning is only worth playing until the buff actually runs out.
    assert_eq!(cues[0].valid_for_ms, Some(3_000));
    assert!(scheduler.is_empty());

    // Further updates inside the same window stay quiet.
    apply_observations(
        &mut projection,
        &mut entities,
        &mut scheduler,
        20,
        vec![shorten_local_buff(1_500)],
    );
    assert!(projection.take_cues().is_empty());
}

#[test]
fn buff_expiry_pulled_past_its_moment_stays_silent() {
    let (mut projection, _entities, mut scheduler) = buff_expiring_in_five_seconds();

    // Seen at 1 000 ms, the aggregate already ran out at 900 ms: nothing is
    // left to warn about, and the "lost" edge speaks when it goes.
    projection
        .buffs
        .set(VoiceBuffScope::LocalPlayer, 77, aggregate(Some(900)));
    projection.sync_buff_leads(
        VoiceSyncReason::Runtime,
        1_000,
        MonoTimeMs(1_000),
        &mut scheduler,
    );
    assert!(projection.take_cues().is_empty());
    assert!(scheduler.is_empty());
}

#[test]
fn buff_snapshot_inside_lead_rebuilds_silently() {
    let (mut projection, mut entities, mut scheduler) = buff_expiring_in_five_seconds();

    // A full snapshot at 1 000 ms with 3 s left is a baseline, not an update.
    apply_observations(
        &mut projection,
        &mut entities,
        &mut scheduler,
        10,
        vec![ProtocolObservation::BuffSnapshot {
            target_uuid: EntityUuid(1),
            buffs: vec![local_buff_applied(10, 3_000)],
        }],
    );
    assert!(projection.take_cues().is_empty());
    assert!(scheduler.is_empty());
}

#[test]
fn alert_events_fire_only_their_matching_voice_rules() {
    let mut projection = projection_with(vec![
        rule(
            "match",
            alert(AlertKind::MatchmakingPopped),
            "match-phrase",
            0,
        ),
        rule(
            "ready",
            alert(AlertKind::ReadyCheckStarted),
            "ready-phrase",
            0,
        ),
        rule("vote", alert(AlertKind::TeamVoteStarted), "vote-phrase", 0),
    ]);
    let entities = EntityContext::new();
    let mut scheduler = DeadlineScheduler::new();

    projection.apply(
        &domain_event(1, DomainEvent::MatchmakingPopped),
        &entities,
        &mut scheduler,
    );
    assert_eq!(
        fired_phrases(&mut projection),
        vec!["match-phrase".to_string()]
    );

    projection.apply(
        &domain_event(2, DomainEvent::ReadyCheckStarted),
        &entities,
        &mut scheduler,
    );
    assert_eq!(
        fired_phrases(&mut projection),
        vec!["ready-phrase".to_string()]
    );

    projection.apply(
        &domain_event(3, DomainEvent::TeamVoteStarted),
        &entities,
        &mut scheduler,
    );
    assert_eq!(
        fired_phrases(&mut projection),
        vec!["vote-phrase".to_string()]
    );
}

/// Applies `edges` and returns the phrases that fired.
fn fire(projection: &mut VoiceProjection, now_ms: i64, edges: &[BuffEdge]) -> Vec<String> {
    projection.fire_buff_edges(edges, now_ms);
    fired_phrases(projection)
}

fn edge(scope: VoiceBuffScope, base_id: i32, gained: bool) -> BuffEdge {
    BuffEdge {
        scope,
        base_id,
        gained,
        fantasy_tier: None,
    }
}

#[test]
fn local_and_monster_scopes_do_not_cross_talk() {
    let mut projection = projection_with(vec![
        rule(
            "local",
            trigger(local_buff(42), VoiceEvent::Started),
            "p1",
            0,
        ),
        rule(
            "monster",
            trigger(
                monster_buff(42, MonsterBuffSourceScope::AnySource),
                VoiceEvent::Started,
            ),
            "p2",
            0,
        ),
    ]);

    // Same base id in both scopes: only the scope that saw the edge fires.
    assert_eq!(
        fire(
            &mut projection,
            1,
            &[edge(VoiceBuffScope::LocalPlayer, 42, true)]
        ),
        vec!["p1".to_string()]
    );
    assert_eq!(
        fire(
            &mut projection,
            2,
            &[edge(VoiceBuffScope::MonsterAnySource, 42, true)]
        ),
        vec!["p2".to_string()]
    );
}

#[test]
fn monster_source_scopes_do_not_cross_talk() {
    let mut projection = projection_with(vec![
        rule(
            "any-gained",
            trigger(
                monster_buff(42, MonsterBuffSourceScope::AnySource),
                VoiceEvent::Started,
            ),
            "any-phrase",
            0,
        ),
        rule(
            "local-gained",
            trigger(
                monster_buff(42, MonsterBuffSourceScope::LocalPlayerSource),
                VoiceEvent::Started,
            ),
            "local-phrase",
            0,
        ),
    ]);

    // A buff applied by someone else only satisfies the any-source rule.
    assert_eq!(
        fire(
            &mut projection,
            1,
            &[edge(VoiceBuffScope::MonsterAnySource, 42, true)]
        ),
        vec!["any-phrase".to_string()]
    );
    assert_eq!(
        fire(
            &mut projection,
            2,
            &[edge(VoiceBuffScope::MonsterLocalPlayerSource, 42, true)]
        ),
        vec!["local-phrase".to_string()]
    );
}

#[test]
fn gained_and_lost_triggers_only_match_their_own_direction() {
    let mut projection = projection_with(vec![
        rule(
            "gained",
            trigger(local_buff(42), VoiceEvent::Started),
            "on",
            0,
        ),
        rule("lost", trigger(local_buff(42), VoiceEvent::Ended), "off", 0),
    ]);

    assert_eq!(
        fire(
            &mut projection,
            1,
            &[edge(VoiceBuffScope::LocalPlayer, 42, true)]
        ),
        vec!["on".to_string()]
    );
    assert_eq!(
        fire(
            &mut projection,
            2,
            &[edge(VoiceBuffScope::LocalPlayer, 42, false)]
        ),
        vec!["off".to_string()]
    );
}

#[test]
fn respects_cooldown() {
    let mut projection = projection_with(vec![rule(
        "cooling",
        trigger(local_buff(42), VoiceEvent::Started),
        "p1",
        5_000,
    )]);
    let gained = [edge(VoiceBuffScope::LocalPlayer, 42, true)];

    assert_eq!(
        fire(&mut projection, 1_000, &gained),
        vec!["p1".to_string()]
    );
    // Within the cooldown window the same rule stays silent.
    assert!(fire(&mut projection, 3_000, &gained).is_empty());
    // Once the window elapses it fires again.
    assert_eq!(
        fire(&mut projection, 6_000, &gained),
        vec!["p1".to_string()]
    );
}

#[test]
fn cooldown_survives_a_rule_set_rebuild_for_the_same_rule() {
    let cooling = rule(
        "cooling",
        trigger(local_buff(42), VoiceEvent::Started),
        "p1",
        5_000,
    );
    let mut projection = projection_with(vec![cooling.clone()]);
    let gained = [edge(VoiceBuffScope::LocalPlayer, 42, true)];
    assert_eq!(fire(&mut projection, 1_000, &gained), ["p1"]);

    // Another binding materializes mid-fight: the rule set is rebuilt, but
    // the surviving rule keeps its cooldown clock.
    let mut scheduler = DeadlineScheduler::new();
    assert!(projection.apply_config(
        &snapshot_of(vec![
            cooling,
            rule("other", alert(AlertKind::TeamVoteStarted), "p2", 0),
        ]),
        &EntityContext::new(),
        2_000,
        MonoTimeMs(2_000),
        &mut scheduler,
    ));
    assert!(fire(&mut projection, 3_000, &gained).is_empty());
    assert_eq!(fire(&mut projection, 6_000, &gained), ["p1"]);
}

#[test]
fn disabled_rule_never_fires() {
    let mut disabled = rule("off", trigger(local_buff(42), VoiceEvent::Started), "p1", 0);
    disabled.enabled = false;
    let mut projection = projection_with(vec![disabled]);

    assert!(
        fire(
            &mut projection,
            1,
            &[edge(VoiceBuffScope::LocalPlayer, 42, true)]
        )
        .is_empty()
    );
}

#[test]
fn buff_gained_selects_phrase_variant_by_fantasy_tier() {
    let mut tiered = rule(
        "tiered",
        trigger(local_buff(42), VoiceEvent::Started),
        "base",
        0,
    );
    tiered.phrase_id_by_tier = Some(HashMap::from([(3, "tier-3".to_string())]));
    let mut projection = projection_with(vec![tiered]);

    projection.fire_buff_edges(
        &[BuffEdge {
            scope: VoiceBuffScope::LocalPlayer,
            base_id: 42,
            gained: true,
            fantasy_tier: Some(3),
        }],
        1,
    );
    assert_eq!(fired_phrases(&mut projection), vec!["tier-3".to_string()]);
}

#[test]
fn buff_gained_falls_back_to_base_phrase_for_unmapped_tier() {
    let mut tiered = rule(
        "tiered",
        trigger(local_buff(42), VoiceEvent::Started),
        "base",
        0,
    );
    tiered.phrase_id_by_tier = Some(HashMap::from([(3, "tier-3".to_string())]));
    let mut projection = projection_with(vec![tiered]);

    projection.fire_buff_edges(
        &[BuffEdge {
            scope: VoiceBuffScope::LocalPlayer,
            base_id: 42,
            gained: true,
            fantasy_tier: Some(5),
        }],
        1,
    );
    assert_eq!(fired_phrases(&mut projection), vec!["base".to_string()]);
}

#[test]
fn baseline_buff_snapshot_rebaselines_without_firing() {
    let mut projection = projection_with(vec![rule(
        "gained",
        trigger(local_buff(77), VoiceEvent::Started),
        "p1",
        0,
    )]);
    let mut entities = local_context();
    entities.apply_batch(batch(
        2,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Applied {
                buff: buff(10, Some(2_000)),
            },
        }],
    ));
    let mut scheduler = DeadlineScheduler::new();

    // A container resync arrives as a Baseline transition: it must seed the
    // aggregate silently, exactly like the retired tracker's reset did.
    projection.refresh_buffs(
        &entities,
        VoiceSyncReason::Baseline,
        100,
        MonoTimeMs(100),
        &mut scheduler,
    );
    assert!(projection.take_cues().is_empty());
    assert!(
        projection
            .buffs
            .get(VoiceBuffScope::LocalPlayer, 77)
            .is_some()
    );
}

// ---------------------------------------------------------------------------
// Counter slots.
// ---------------------------------------------------------------------------

#[test]
fn counter_rules_stay_silent_when_no_slot_matches() {
    let mut projection = projection_with(vec![rule(
        "counter",
        trigger(
            VoiceSubject::Counter {
                rule_id: 7,
                slot_id: 1,
            },
            VoiceEvent::Threshold,
        ),
        "p1",
        0,
    )]);
    let mut scheduler = DeadlineScheduler::new();

    // No configured counter rule means no slot state, so the threshold
    // reads as uncrossed and the rule must not fire.
    projection.sync_counters(
        VoiceSyncReason::Runtime,
        &CounterEngine::new(),
        1_000,
        MonoTimeMs(1_000),
        &mut scheduler,
    );

    assert!(projection.take_cues().is_empty());
    assert_eq!(projection.counter_crossed.get(&(7, 1)), Some(&false));
}

#[test]
fn counter_threshold_config_baseline_is_silent_but_later_edge_fires() {
    use crate::live::counter::engine::{CounterNamespace, CounterRule, EffectSlotConfig};
    let mut counters = CounterEngine::new();
    let mut scheduler = DeadlineScheduler::new();
    let slot: EffectSlotConfig = serde_json::from_value(
        serde_json::json!({ "slotId": 1, "threshold": 0, "resetBuffId": 0 }),
    )
    .unwrap();
    let config = CounterRule {
        rule_id: 7,
        sources: vec![],
        effect_slots: vec![slot],
    };
    counters
        .apply_config(
            CounterNamespace::Normal,
            vec![config.clone()],
            &mut scheduler,
        )
        .unwrap();
    let mut projection = projection_with(vec![rule(
        "threshold",
        trigger(
            VoiceSubject::Counter {
                rule_id: 7,
                slot_id: 1,
            },
            VoiceEvent::Threshold,
        ),
        "threshold",
        0,
    )]);
    projection.sync_counters(
        VoiceSyncReason::Baseline,
        &counters,
        100,
        MonoTimeMs(100),
        &mut scheduler,
    );
    assert_eq!(projection.counter_crossed.get(&(7, 1)), Some(&true));
    assert!(projection.take_cues().is_empty());
    // Nothing moved in the engine: the sync is a no-op.
    projection.sync_counters(
        VoiceSyncReason::Runtime,
        &counters,
        200,
        MonoTimeMs(200),
        &mut scheduler,
    );
    assert!(projection.take_cues().is_empty());
    counters
        .apply_config(CounterNamespace::Normal, vec![], &mut scheduler)
        .unwrap();
    projection.sync_counters(
        VoiceSyncReason::Runtime,
        &counters,
        300,
        MonoTimeMs(300),
        &mut scheduler,
    );
    counters
        .apply_config(CounterNamespace::Normal, vec![config], &mut scheduler)
        .unwrap();
    projection.sync_counters(
        VoiceSyncReason::Runtime,
        &counters,
        400,
        MonoTimeMs(400),
        &mut scheduler,
    );
    assert_eq!(fired_phrases(&mut projection), ["threshold"]);
}

// ---------------------------------------------------------------------------
// Rule set configuration.
// ---------------------------------------------------------------------------

#[test]
fn normalize_drops_unsupported_subject_event_pairs() {
    let mut snapshot = VoiceRuntimeSnapshot {
        enabled: true,
        volume: 2.0,
        queue_policy: Default::default(),
        rules: vec![
            rule("ok", alert(AlertKind::MatchmakingPopped), "p", 0),
            rule(
                "bad-alert",
                trigger(
                    VoiceSubject::Alert {
                        alert: AlertKind::ReadyCheckStarted,
                    },
                    VoiceEvent::Ended,
                ),
                "p",
                0,
            ),
            rule(
                "bad-counter",
                trigger(
                    VoiceSubject::Counter {
                        rule_id: 1,
                        slot_id: 1,
                    },
                    VoiceEvent::Started,
                ),
                "p",
                0,
            ),
            rule(
                "bad-dbm",
                trigger(
                    VoiceSubject::BossDbm { base_skill_id: 1 },
                    VoiceEvent::Threshold,
                ),
                "p",
                0,
            ),
            rule(
                "bad-skill",
                trigger(
                    VoiceSubject::Skill { skill_id: 1420 },
                    VoiceEvent::Threshold,
                ),
                "p",
                0,
            ),
            rule(
                "bad-entity",
                trigger(
                    VoiceSubject::Entity {
                        monster_id: 179_901,
                        scope: EntityOwnerScope::Any,
                    },
                    VoiceEvent::Threshold,
                ),
                "p",
                0,
            ),
            rule(
                "ok-skill",
                trigger(VoiceSubject::Skill { skill_id: 1420 }, VoiceEvent::Ended),
                "p",
                0,
            ),
            rule(
                "ok-entity",
                trigger(
                    VoiceSubject::Entity {
                        monster_id: 179_901,
                        scope: EntityOwnerScope::LocalPlayer,
                    },
                    expiring(5),
                ),
                "p",
                0,
            ),
        ],
    };
    snapshot.normalize();
    assert_eq!(snapshot.volume, 1.0);
    let ids: Vec<&str> = snapshot.rules.iter().map(|rule| rule.id.as_str()).collect();
    assert_eq!(ids, vec!["ok", "ok-entity", "ok-skill"]);
}

// ---------------------------------------------------------------------------
// Batch-scoped subjects (skills, entities, boss mechanics), driven through
// the entity monitor exactly as `ProjectionSet` does at batch end.
// ---------------------------------------------------------------------------

mod entity_monitor_bridge {
    use super::*;
    use crate::live::bootstrap_snapshot::{MonitorRuntimeSnapshot, WatchedEntitySpec};
    use crate::live::projections::entity_monitor::EntityMonitorProjection;
    use crate::live::runtime::events::SkillCooldownState;

    const LOCAL: EntityUuid = EntityUuid(1);
    const OTHER_PLAYER: EntityUuid = EntityUuid(2);
    const SCYTHE_CART: i32 = 179_901;
    const SKILL: i32 = 1420;
    const RESOURCE_SKILL: i32 = 1431;

    struct Harness {
        entities: EntityContext,
        monitor: EntityMonitorProjection,
        counters: CounterEngine,
        voice: VoiceProjection,
        scheduler: DeadlineScheduler,
    }

    impl Harness {
        /// Local player (uuid 1) is present; `rules` are already active.
        fn new(rules: Vec<VoiceRule>, specs: Vec<WatchedEntitySpec>) -> Self {
            Self::with_monster_enabled(rules, specs, true)
        }

        fn with_monster_enabled(
            rules: Vec<VoiceRule>,
            specs: Vec<WatchedEntitySpec>,
            monster_enabled: bool,
        ) -> Self {
            let mut entities = local_context();
            entities.apply_batch(batch(
                1,
                vec![ProtocolObservation::EntityAppeared {
                    uuid: OTHER_PLAYER,
                    kind: EntityKind::Character,
                }],
            ));
            let mut monitor = EntityMonitorProjection::default();
            let mut scheduler = DeadlineScheduler::new();
            let local = entities.local_player();
            monitor.apply(
                &domain_event(
                    1,
                    DomainEvent::LocalPlayerChanged {
                        previous: None,
                        current: local,
                    },
                ),
                &entities,
                &mut scheduler,
            );
            let mut config = MonitorRuntimeSnapshot::default();
            config.monster.enabled = monster_enabled;
            config.monster.watched_entities = specs;
            monitor.apply_config(&config, Arc::default(), &entities, MonoTimeMs(100));
            let mut harness = Self {
                entities,
                monitor,
                counters: CounterEngine::new(),
                voice: projection_with(rules),
                scheduler,
            };
            harness.flush(1);
            harness
        }

        /// Mirrors `ProjectionSet::apply` + `end_batch` for one batch at
        /// `sequence` (mono = wall = sequence * 100 ms).
        fn step(&mut self, sequence: u64, observations: Vec<ProtocolObservation>) {
            let events = self.entities.apply_batch(batch(sequence, observations));
            for event in &events {
                self.dispatch(event);
            }
            self.flush(sequence);
        }

        /// One domain event at `sequence`, followed by the batch-end sync.
        fn event(&mut self, sequence: u64, event: DomainEvent) {
            let mut envelope = domain_event(sequence, event);
            envelope.occurred_at_ms = sequence as i64 * 100;
            envelope.meta.captured_mono_ns = sequence * 100_000_000;
            self.dispatch(&envelope);
            self.flush(sequence);
        }

        fn dispatch(&mut self, envelope: &DomainEnvelope) {
            self.monitor
                .apply(envelope, &self.entities, &mut self.scheduler);
            self.voice
                .apply(envelope, &self.entities, &mut self.scheduler);
        }

        fn sync(&mut self, reason: VoiceSyncReason, sequence: u64) {
            let inputs = VoiceInputs {
                entities: &self.entities,
                monitor: &self.monitor,
                counters: &self.counters,
            };
            self.voice.sync_inputs(
                reason,
                &inputs,
                sequence as i64 * 100,
                MonoTimeMs(sequence * 100),
                &mut self.scheduler,
            );
        }

        fn flush(&mut self, sequence: u64) {
            self.sync(VoiceSyncReason::Runtime, sequence);
        }

        /// Delivers every timer due at `sequence` and flushes like the
        /// runtime's deadline batch does.
        fn drain(&mut self, sequence: u64) {
            let now = MonoTimeMs(sequence * 100);
            for due in self.scheduler.drain_due(now) {
                let event = DomainEvent::DeadlineReached {
                    key: due.key,
                    scheduled_for: due.scheduled_for,
                    fired_at: now,
                    kind: due.kind,
                    scope: due.scope,
                    generation: due.generation,
                };
                let mut envelope = domain_event(sequence, event);
                envelope.occurred_at_ms = sequence as i64 * 100;
                envelope.meta.captured_mono_ns = sequence * 100_000_000;
                self.dispatch(&envelope);
            }
            self.flush(sequence);
        }

        fn reconfigure(&mut self, rules: Vec<VoiceRule>, sequence: u64) -> bool {
            let changed = self.voice.apply_config(
                &snapshot_of(rules),
                &self.entities,
                sequence as i64 * 100,
                MonoTimeMs(sequence * 100),
                &mut self.scheduler,
            );
            if changed {
                self.sync(VoiceSyncReason::Baseline, sequence);
            }
            changed
        }

        fn fired(&mut self) -> Vec<String> {
            fired_phrases(&mut self.voice)
        }
    }

    fn skill(skill_id: i32, event: VoiceEvent) -> VoiceTrigger {
        trigger(VoiceSubject::Skill { skill_id }, event)
    }

    fn entity(monster_id: i32, scope: EntityOwnerScope, event: VoiceEvent) -> VoiceTrigger {
        trigger(VoiceSubject::Entity { monster_id, scope }, event)
    }

    fn boss(event: VoiceEvent) -> VoiceTrigger {
        trigger(VoiceSubject::BossDbm { base_skill_id: 9 }, event)
    }

    /// The local player's own casts reach the domain as the authoritative
    /// `LocalSkillRequested` (-> `CastStarted`); everyone else's, and the
    /// local echo, arrive as `SkillLifecycleChanged` observations.
    fn cast(caster: EntityUuid, skill_id: i32, phase: SkillPhase) -> ProtocolObservation {
        if caster == LOCAL && phase == SkillPhase::CastStarted {
            return ProtocolObservation::LocalSkillRequested {
                skill_id,
                target_uuid: None,
            };
        }
        ProtocolObservation::SkillLifecycleChanged {
            caster_uuid: caster,
            skill_id,
            phase,
            target_uuid: None,
        }
    }

    fn cooldown(skill_id: i32, duration: i32, valid: i32) -> ProtocolObservation {
        ProtocolObservation::SkillCooldownUpdated {
            entity_uuid: LOCAL,
            cooldowns: vec![SkillCooldownState {
                skill_level_id: skill_id * 100 + 1,
                begin_time: Some(0),
                duration: Some(duration),
                cooldown_type: Some(0),
                valid_time: Some(valid),
            }],
        }
    }

    fn resource_slot(skill_id: i32, valid: i32) -> ProtocolObservation {
        ProtocolObservation::SkillCooldownUpdated {
            entity_uuid: LOCAL,
            cooldowns: vec![SkillCooldownState {
                skill_level_id: skill_id * 100 + 1,
                begin_time: Some(0),
                duration: Some(-1),
                cooldown_type: Some(1),
                valid_time: Some(valid),
            }],
        }
    }

    fn summon(uuid: EntityUuid, owner: EntityUuid) -> Vec<ProtocolObservation> {
        vec![
            ProtocolObservation::EntityAppeared {
                uuid,
                kind: EntityKind::Monster,
            },
            ProtocolObservation::IdentityUpdated {
                uuid,
                patch: EntityIdentityPatch {
                    monster_id: FieldPatch::Set(SCYTHE_CART),
                    owner_uuid: FieldPatch::Set(owner),
                    ..Default::default()
                },
            },
        ]
    }

    fn spec(duration_ms: Option<u64>, scope: EntityOwnerScope) -> WatchedEntitySpec {
        WatchedEntitySpec {
            monster_id: SCYTHE_CART,
            duration_ms,
            scope,
            merge: false,
        }
    }

    fn merged_spec(duration_ms: u64, scope: EntityOwnerScope) -> WatchedEntitySpec {
        WatchedEntitySpec {
            merge: true,
            ..spec(Some(duration_ms), scope)
        }
    }

    fn remove(uuid: i64) -> Vec<ProtocolObservation> {
        vec![ProtocolObservation::EntityDisappeared {
            uuid: EntityUuid(uuid),
        }]
    }

    // -- Skills ------------------------------------------------------------

    #[test]
    fn local_cast_started_fires_once_and_other_phases_or_casters_do_not() {
        let mut h = Harness::new(
            vec![rule("cast", skill(SKILL, VoiceEvent::Started), "cast", 0)],
            vec![],
        );
        h.step(2, vec![cast(LOCAL, SKILL, SkillPhase::CastStarted)]);
        assert_eq!(h.fired(), vec!["cast".to_string()]);

        h.step(3, vec![cast(LOCAL, SKILL, SkillPhase::DurationStarted)]);
        h.step(4, vec![cast(LOCAL, SKILL, SkillPhase::Completed)]);
        h.step(5, vec![cast(OTHER_PLAYER, SKILL, SkillPhase::CastStarted)]);
        h.step(6, vec![cast(LOCAL, SKILL + 1, SkillPhase::CastStarted)]);
        assert!(h.fired().is_empty());
        // A cast-only skill needs no cooldown tracking.
        h.step(7, vec![cooldown(SKILL, 10_000, 0)]);
        assert!(h.voice.skills.is_empty());
        assert!(h.scheduler.is_empty());
    }

    #[test]
    fn cooldown_ready_and_ready_in_fire_from_one_deadline_each() {
        let mut h = Harness::new(
            vec![
                rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0),
                rule("soon", skill(SKILL, expiring(3)), "soon", 0),
            ],
            vec![],
        );
        // 10 s cooldown received at t = 200 ms: ready at 10 200, "soon" at 7 200.
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        assert!(h.fired().is_empty());
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(7_200)));

        h.drain(72);
        assert_eq!(h.fired(), vec!["soon".to_string()]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(10_200)));

        h.drain(102);
        assert_eq!(h.fired(), vec!["ready".to_string()]);
        assert!(h.scheduler.is_empty());

        // Idle flushes after the deadline never re-announce.
        h.flush(110);
        h.flush(120);
        assert!(h.fired().is_empty());
    }

    #[test]
    fn skill_cues_do_not_depend_on_the_skill_cd_monitor_list() {
        // Arrange: voice rules on SKILL while the cooldown HUD monitors only
        // another skill. A skill needs no HUD slot to be voiced.
        let mut h = Harness::new(
            vec![
                rule("cast", skill(SKILL, VoiceEvent::Started), "cast", 0),
                rule("soon", skill(SKILL, expiring(3)), "soon", 0),
                rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0),
            ],
            vec![],
        );
        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.enabled = true;
        config.skill.monitored_skill_ids = vec![SKILL + 1];
        h.monitor
            .apply_config(&config, Arc::default(), &h.entities, MonoTimeMs(100));

        // Act: a cast, then a 10 s cooldown received at t = 200 ms.
        h.step(
            2,
            vec![
                cast(LOCAL, SKILL, SkillPhase::CastStarted),
                cooldown(SKILL, 10_000, 0),
            ],
        );
        let cast_cues = h.fired();
        h.drain(72);
        let ready_in_cues = h.fired();
        h.drain(102);
        let ready_cues = h.fired();

        // Assert: every cue fires as it would for a monitored skill.
        assert_eq!(cast_cues, vec!["cast".to_string()]);
        assert_eq!(ready_in_cues, vec!["soon".to_string()]);
        assert_eq!(ready_cues, vec!["ready".to_string()]);
    }

    #[test]
    fn repeated_cooldown_packet_is_idempotent_and_reduction_reschedules() {
        let mut h = Harness::new(
            vec![rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0)],
            vec![],
        );
        // "Ready" rides the per-skill refill wakeup, which the tracker owns
        // like every other voice timer.
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(10_200)));
        assert_eq!(h.voice.tracker.len(), 1);
        assert_eq!(
            h.voice
                .tracker
                .armed_deadline(VoiceTimer::SkillRefill { skill_id: SKILL }),
            Some(MonoTimeMs(10_200))
        );

        // Same packet again (server echo) keeps the same wakeup.
        h.step(3, vec![cooldown(SKILL, 10_000, 100)]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(10_200)));
        assert_eq!(h.scheduler.len(), 1);

        // Server reports most of the cooldown already elapsed: pull in.
        h.step(4, vec![cooldown(SKILL, 10_000, 8_000)]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(2_400)));
        assert_eq!(h.scheduler.len(), 1);
        h.drain(24);
        assert_eq!(h.fired(), vec!["ready".to_string()]);
        assert!(h.scheduler.is_empty());
        assert_eq!(h.voice.tracker.len(), 0);
    }

    #[test]
    fn cooldown_reduction_across_lead_fires_ready_in_immediately() {
        let mut h = Harness::new(
            vec![
                rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0),
                rule("soon", skill(SKILL, expiring(5)), "soon", 0),
            ],
            vec![],
        );
        // 10 s cooldown at 200 ms: "soon" armed for 5 200, ready at 10 200.
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(5_200)));

        // At 3 000 ms a reduction leaves 2 s: past the 5 s mark, so speak now.
        h.step(30, vec![cooldown(SKILL, 10_000, 8_000)]);
        assert_eq!(h.fired(), ["soon"]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(5_000)));

        h.drain(50);
        assert_eq!(h.fired(), ["ready"]);
        assert!(h.scheduler.is_empty());
    }

    #[test]
    fn cooldown_reset_announces_ready_only() {
        let mut h = Harness::new(
            vec![
                rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0),
                rule("soon", skill(SKILL, expiring(5)), "soon", 0),
            ],
            vec![],
        );
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);

        // A full refund at 3 000 ms: ready at once, and "5 s left" is moot.
        h.step(30, vec![cooldown(SKILL, 10_000, 10_000)]);
        assert_eq!(h.fired(), ["ready"]);
        assert!(h.scheduler.is_empty());
        assert_eq!(h.voice.tracker.len(), 0);
    }

    #[test]
    fn packet_that_is_already_ready_fires_edge_and_cancels_timer() {
        let mut h = Harness::new(
            vec![rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0)],
            vec![],
        );
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        assert_eq!(h.scheduler.len(), 1);

        // Cooldown fully refunded: no timer, announced right away.
        h.step(3, vec![cooldown(SKILL, 10_000, 10_000)]);
        assert_eq!(h.fired(), vec!["ready".to_string()]);
        assert!(h.scheduler.is_empty());

        // Still ready on the next packet: no second cue.
        h.step(4, vec![cooldown(SKILL, 10_000, 10_000)]);
        assert!(h.fired().is_empty());

        // A skill with no cooldown is ready on first sight, which is not an
        // edge; only a not-ready -> ready transition speaks.
        h.step(5, vec![cooldown(SKILL + 1, 0, 0)]);
        assert!(h.fired().is_empty());
        assert!(h.scheduler.is_empty());
    }

    #[test]
    fn resource_slot_fires_on_threshold_edge_without_timer() {
        let mut h = Harness::new(
            vec![rule(
                "ready",
                skill(RESOURCE_SKILL, VoiceEvent::Ended),
                "ready",
                0,
            )],
            vec![],
        );
        // SkillChargeTable: 1431 has maxValidCdTime 10 000.
        h.step(2, vec![resource_slot(RESOURCE_SKILL, 2_000)]);
        h.step(3, vec![resource_slot(RESOURCE_SKILL, 6_000)]);
        assert!(h.fired().is_empty());
        assert!(h.scheduler.is_empty());

        h.step(4, vec![resource_slot(RESOURCE_SKILL, 10_000)]);
        assert_eq!(h.fired(), vec!["ready".to_string()]);

        h.step(5, vec![resource_slot(RESOURCE_SKILL, 10_000)]);
        assert!(h.fired().is_empty());

        // Spent and refilled: announces again.
        h.step(6, vec![resource_slot(RESOURCE_SKILL, 0)]);
        h.step(7, vec![resource_slot(RESOURCE_SKILL, 10_000)]);
        assert_eq!(h.fired(), vec!["ready".to_string()]);
    }

    fn charged_cooldown(skill_id: i32, duration: i32, valid: i32) -> ProtocolObservation {
        ProtocolObservation::SkillCooldownUpdated {
            entity_uuid: LOCAL,
            cooldowns: vec![SkillCooldownState {
                skill_level_id: skill_id * 100 + 1,
                begin_time: Some(0),
                duration: Some(duration),
                cooldown_type: Some(1),
                valid_time: Some(valid),
            }],
        }
    }

    #[test]
    fn configuration_silently_rebases_readiness_before_subsequent_game_edges() {
        let mut h = Harness::new(
            vec![rule(
                "ready",
                skill(RESOURCE_SKILL, VoiceEvent::Ended),
                "ready",
                0,
            )],
            vec![],
        );
        h.step(2, vec![resource_slot(RESOURCE_SKILL, 0)]);
        // Change the input without a runtime voice flush, like a config
        // recalculation of the monitor's current readiness.
        let events = h
            .entities
            .apply_batch(batch(3, vec![resource_slot(RESOURCE_SKILL, 10_000)]));
        for event in events {
            h.monitor.apply(&event, &h.entities, &mut h.scheduler);
        }
        h.sync(VoiceSyncReason::Baseline, 3);
        assert!(h.fired().is_empty());
        h.flush(4);
        assert!(h.fired().is_empty());
        h.step(5, vec![resource_slot(RESOURCE_SKILL, 0)]);
        h.step(6, vec![resource_slot(RESOURCE_SKILL, 10_000)]);
        assert_eq!(h.fired(), ["ready"]);
    }

    #[test]
    fn multi_charge_announces_every_refill() {
        // SkillChargeTable: 1420 has maxCharges 2. Mirrors capture
        // 1790300898228: a cast from full, then another 5.5 s later.
        let mut h = Harness::new(
            vec![
                rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0),
                rule("soon", skill(SKILL, expiring(5)), "soon", 0),
            ],
            vec![],
        );
        // The first cast at 200 ms leaves one charge; the other is back at
        // 30 200.
        h.step(2, vec![charged_cooldown(SKILL, 30_000, 30_000)]);
        assert!(h.fired().is_empty());
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(25_200)));

        // The second cast at 5 700 ms spends it with 5 500 ms banked: the same
        // moment now brings back the first charge, and the next one follows.
        h.step(57, vec![charged_cooldown(SKILL, 30_000, 5_500)]);
        assert!(h.fired().is_empty());
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(25_200)));

        for (soon, ready) in [(252, 302), (552, 602)] {
            h.drain(soon);
            assert_eq!(h.fired(), ["soon"]);
            h.drain(ready);
            assert_eq!(h.fired(), ["ready"]);
        }
        assert!(h.scheduler.is_empty());

        // A later packet that still reads full is no edge.
        h.step(700, vec![charged_cooldown(SKILL, 30_000, 60_000)]);
        assert!(h.fired().is_empty());
        assert!(h.scheduler.is_empty());
    }

    #[test]
    fn duty_skill_with_charges_is_voiced_without_a_hud_slot() {
        // Arrange: duty skill 3612 (SkillChargeTable maxCharges 2) is voiced
        // while the cooldown HUD monitors only a class skill.
        const DUTY_SKILL: i32 = 3612;
        let mut h = Harness::new(
            vec![
                rule("cast", skill(DUTY_SKILL, VoiceEvent::Started), "cast", 0),
                rule("soon", skill(DUTY_SKILL, expiring(5)), "soon", 0),
                rule("ready", skill(DUTY_SKILL, VoiceEvent::Ended), "ready", 0),
            ],
            vec![],
        );
        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.enabled = true;
        config.skill.monitored_skill_ids = vec![SKILL];
        h.monitor
            .apply_config(&config, Arc::default(), &h.entities, MonoTimeMs(100));

        // Act: a cast from full at 200 ms leaves one charge; the other is
        // back at 80 200.
        h.step(
            2,
            vec![
                cast(LOCAL, DUTY_SKILL, SkillPhase::CastStarted),
                charged_cooldown(DUTY_SKILL, 80_000, 80_000),
            ],
        );
        let cast_cues = h.fired();
        h.drain(752);
        let ready_in_cues = h.fired();
        h.drain(802);
        let ready_cues = h.fired();

        // Assert
        assert_eq!(cast_cues, ["cast"]);
        assert_eq!(ready_in_cues, ["soon"]);
        assert_eq!(ready_cues, ["ready"]);
        assert!(h.scheduler.is_empty());
    }

    #[test]
    fn local_player_change_cancels_cooldown_timers() {
        let mut h = Harness::new(
            vec![
                rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0),
                rule("soon", skill(SKILL, expiring(3)), "soon", 0),
            ],
            vec![],
        );
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        // The lead cue and the refill wakeup.
        assert_eq!(h.voice.tracker.len(), 2);
        assert_eq!(h.scheduler.len(), 2);

        h.step(
            3,
            vec![ProtocolObservation::LocalPlayerChanged {
                uuid: Some(OTHER_PLAYER),
            }],
        );
        assert_eq!(h.voice.tracker.len(), 0);
        assert!(h.voice.skills.is_empty());
        assert!(h.scheduler.is_empty());
        h.drain(110);
        assert!(h.fired().is_empty());
    }

    #[test]
    fn removing_a_skill_rule_takes_its_timers_with_the_rule_set() {
        let ready = rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0);
        let soon = rule("soon", skill(SKILL, expiring(3)), "soon", 0);
        let mut h = Harness::new(vec![ready.clone(), soon], vec![]);
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        assert_eq!(h.scheduler.len(), 2);

        // The binding is gone (skill no longer monitored): the old epoch is
        // invalidated and only what the remaining rules need is re-armed.
        assert!(h.reconfigure(vec![ready], 3));
        assert_eq!(h.voice.tracker.len(), 1);
        assert_eq!(h.scheduler.len(), 1);
        h.drain(72);
        assert!(h.fired().is_empty());
        h.drain(102);
        assert_eq!(h.fired(), ["ready"]);

        assert!(h.reconfigure(vec![], 110));
        assert!(h.scheduler.is_empty());
    }

    // -- Entities ----------------------------------------------------------

    #[test]
    fn entity_appear_expire_and_disappear_fire_in_order() {
        let mut h = Harness::new(
            vec![
                rule(
                    "up",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, VoiceEvent::Started),
                    "up",
                    0,
                ),
                rule(
                    "soon",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, expiring(5)),
                    "soon",
                    0,
                ),
                rule(
                    "gone",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, VoiceEvent::Ended),
                    "gone",
                    0,
                ),
            ],
            vec![spec(Some(15_000), EntityOwnerScope::Any)],
        );
        let cart = EntityUuid(500);
        // Detected at 200 ms, lifetime 15 s -> "soon" at 10 200.
        h.step(2, summon(cart, LOCAL));
        assert_eq!(h.fired(), vec!["up".to_string()]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(10_200)));

        h.drain(102);
        let cues = h.voice.take_cues();
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].phrase_id, "soon");
        assert_eq!(cues[0].valid_for_ms, Some(5_000));

        h.step(
            150,
            vec![ProtocolObservation::EntityDisappeared { uuid: cart }],
        );
        assert_eq!(h.fired(), vec!["gone".to_string()]);
        assert!(h.scheduler.is_empty());
    }

    #[test]
    fn entity_destroyed_early_cancels_expiring_and_fires_gone_only() {
        let mut h = Harness::new(
            vec![
                rule(
                    "soon",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, expiring(5)),
                    "soon",
                    0,
                ),
                rule(
                    "gone",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, VoiceEvent::Ended),
                    "gone",
                    0,
                ),
            ],
            vec![spec(Some(15_000), EntityOwnerScope::Any)],
        );
        let cart = EntityUuid(500);
        h.step(2, summon(cart, LOCAL));
        assert_eq!(h.voice.tracker.len(), 1);

        h.step(
            30,
            vec![ProtocolObservation::EntityDisappeared { uuid: cart }],
        );
        assert_eq!(h.fired(), vec!["gone".to_string()]);
        assert!(h.scheduler.is_empty());
        h.drain(200);
        assert!(h.fired().is_empty());
    }

    #[test]
    fn concurrent_instances_aggregate_edges_but_keep_separate_expiries() {
        let mut h = Harness::new(
            vec![
                rule(
                    "up",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, VoiceEvent::Started),
                    "up",
                    0,
                ),
                rule(
                    "soon",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, expiring(0)),
                    "soon",
                    0,
                ),
                rule(
                    "gone",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, VoiceEvent::Ended),
                    "gone",
                    0,
                ),
            ],
            vec![spec(Some(10_000), EntityOwnerScope::Any)],
        );
        h.step(2, summon(EntityUuid(500), LOCAL));
        h.step(40, summon(EntityUuid(501), OTHER_PLAYER));
        // Second instance is not a new "appeared"; both timers are armed.
        assert_eq!(h.fired(), vec!["up".to_string()]);
        assert_eq!(h.voice.tracker.len(), 2);

        h.drain(102);
        assert_eq!(h.fired(), vec!["soon".to_string()]);
        h.drain(140);
        assert_eq!(h.fired(), vec!["soon".to_string()]);

        h.step(
            150,
            vec![ProtocolObservation::EntityDisappeared {
                uuid: EntityUuid(500),
            }],
        );
        assert!(h.fired().is_empty());
        h.step(
            151,
            vec![ProtocolObservation::EntityDisappeared {
                uuid: EntityUuid(501),
            }],
        );
        assert_eq!(h.fired(), vec!["gone".to_string()]);
    }

    #[test]
    fn self_scope_ignores_other_players_summons() {
        let mut h = Harness::new(
            vec![
                rule(
                    "mine",
                    entity(
                        SCYTHE_CART,
                        EntityOwnerScope::LocalPlayer,
                        VoiceEvent::Started,
                    ),
                    "mine",
                    0,
                ),
                rule(
                    "mine-soon",
                    entity(SCYTHE_CART, EntityOwnerScope::LocalPlayer, expiring(0)),
                    "mine-soon",
                    0,
                ),
            ],
            vec![
                spec(Some(10_000), EntityOwnerScope::LocalPlayer),
                spec(Some(30_000), EntityOwnerScope::Any),
            ],
        );
        h.step(2, summon(EntityUuid(501), OTHER_PLAYER));
        assert!(h.fired().is_empty());
        assert!(h.scheduler.is_empty());

        // Self-scope rule uses the self-scope entry's duration (10 s).
        h.step(3, summon(EntityUuid(500), LOCAL));
        assert_eq!(h.fired(), vec!["mine".to_string()]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(10_300)));
    }

    #[test]
    fn changing_duration_rearms_existing_entities_and_entities_present_at_config_are_not_announced()
    {
        let rules = vec![
            rule(
                "up",
                entity(SCYTHE_CART, EntityOwnerScope::Any, VoiceEvent::Started),
                "up",
                0,
            ),
            rule(
                "soon",
                entity(SCYTHE_CART, EntityOwnerScope::Any, expiring(0)),
                "soon",
                0,
            ),
        ];
        let mut h = Harness::new(
            rules.clone(),
            vec![spec(Some(10_000), EntityOwnerScope::Any)],
        );
        h.step(2, summon(EntityUuid(500), LOCAL));
        assert_eq!(h.fired(), vec!["up".to_string()]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(10_200)));

        // User edits the lifetime to 20 s: the live cart's cue moves.
        let mut config = MonitorRuntimeSnapshot::default();
        config.monster.enabled = true;
        config.monster.watched_entities = vec![spec(Some(20_000), EntityOwnerScope::Any)];
        h.monitor
            .apply_config(&config, Arc::default(), &h.entities, MonoTimeMs(500));
        h.flush(5);
        assert!(h.fired().is_empty());
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(20_200)));

        // Re-applying different voice rules while the cart is up must not
        // replay "appeared", but the expiry is re-armed under the new rule
        // set.
        let mut more = rules;
        more.push(rule("vote", alert(AlertKind::TeamVoteStarted), "vote", 0));
        assert!(h.reconfigure(more, 6));
        h.flush(7);
        assert!(h.fired().is_empty());
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(20_200)));
    }

    #[test]
    fn merged_near_simultaneous_instances_cue_expiring_once() {
        let mut h = Harness::new(
            vec![rule(
                "soon",
                entity(SCYTHE_CART, EntityOwnerScope::LocalPlayer, expiring(5)),
                "soon",
                0,
            )],
            vec![merged_spec(35_000, EntityOwnerScope::LocalPlayer)],
        );
        // Detected at 200 / 500 ms: the second cart takes over the row at
        // 35 200 with 0.3 s left, so only the first one can cue.
        h.step(2, summon(EntityUuid(500), LOCAL));
        h.step(5, summon(EntityUuid(501), LOCAL));
        assert_eq!(h.voice.tracker.len(), 1);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(30_200)));

        h.drain(302);
        assert_eq!(h.fired(), vec!["soon".to_string()]);
        h.drain(360);
        assert!(h.fired().is_empty());

        // The shown cart leaving after its cue must not re-cue the other.
        h.step(400, remove(500));
        assert!(h.fired().is_empty());
        assert!(h.scheduler.is_empty());
    }

    #[test]
    fn merged_later_instance_takes_over_with_its_own_cue() {
        let mut h = Harness::new(
            vec![rule(
                "soon",
                entity(SCYTHE_CART, EntityOwnerScope::LocalPlayer, expiring(2)),
                "soon",
                0,
            )],
            vec![merged_spec(10_000, EntityOwnerScope::LocalPlayer)],
        );
        // Expiries 10 200 and 16 000: the later cart takes over with 5.8 s
        // left, above the 2 s lead, so both cue.
        h.step(2, summon(EntityUuid(500), LOCAL));
        h.step(60, summon(EntityUuid(501), LOCAL));
        assert_eq!(h.voice.tracker.len(), 2);

        h.drain(82);
        assert_eq!(h.fired(), vec!["soon".to_string()]);
        h.drain(140);
        assert_eq!(h.fired(), vec!["soon".to_string()]);
    }

    #[test]
    fn merged_first_instance_gone_early_hands_cue_to_next() {
        let mut h = Harness::new(
            vec![rule(
                "soon",
                entity(SCYTHE_CART, EntityOwnerScope::LocalPlayer, expiring(5)),
                "soon",
                0,
            )],
            vec![merged_spec(35_000, EntityOwnerScope::LocalPlayer)],
        );
        h.step(2, summon(EntityUuid(500), LOCAL));
        h.step(5, summon(EntityUuid(501), LOCAL));
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(30_200)));

        h.step(100, remove(500));
        assert_eq!(h.voice.tracker.len(), 1);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(30_500)));
        h.drain(305);
        assert_eq!(h.fired(), vec!["soon".to_string()]);
    }

    #[test]
    fn merged_presence_edges_fire_once() {
        let mut h = Harness::new(
            vec![
                rule(
                    "up",
                    entity(
                        SCYTHE_CART,
                        EntityOwnerScope::LocalPlayer,
                        VoiceEvent::Started,
                    ),
                    "up",
                    0,
                ),
                rule(
                    "gone",
                    entity(
                        SCYTHE_CART,
                        EntityOwnerScope::LocalPlayer,
                        VoiceEvent::Ended,
                    ),
                    "gone",
                    0,
                ),
            ],
            vec![merged_spec(35_000, EntityOwnerScope::LocalPlayer)],
        );
        h.step(2, summon(EntityUuid(500), LOCAL));
        assert_eq!(h.fired(), vec!["up".to_string()]);
        h.step(5, summon(EntityUuid(501), LOCAL));
        assert!(h.fired().is_empty());

        h.step(10, remove(500));
        assert!(h.fired().is_empty());
        h.step(11, remove(501));
        assert_eq!(h.fired(), vec!["gone".to_string()]);
    }

    #[test]
    fn entity_voice_ignores_the_monster_monitor_toggle() {
        let mut h = Harness::with_monster_enabled(
            vec![
                rule(
                    "up",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, VoiceEvent::Started),
                    "up",
                    0,
                ),
                rule(
                    "soon",
                    entity(SCYTHE_CART, EntityOwnerScope::Any, expiring(5)),
                    "soon",
                    0,
                ),
            ],
            vec![spec(Some(15_000), EntityOwnerScope::Any)],
            false,
        );
        h.step(2, summon(EntityUuid(500), LOCAL));
        assert_eq!(h.fired(), ["up"]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(10_200)));
        // Only the HUD follows the toggle.
        assert!(
            h.monitor
                .snapshot(&h.entities)
                .entity_duration_tracks
                .is_empty()
        );
    }

    #[test]
    fn unrelated_monitor_changes_do_not_re_derive_entities() {
        let mut h = Harness::new(
            vec![rule(
                "soon",
                entity(SCYTHE_CART, EntityOwnerScope::Any, expiring(5)),
                "soon",
                0,
            )],
            vec![spec(Some(15_000), EntityOwnerScope::Any)],
        );
        h.step(2, summon(EntityUuid(500), LOCAL));
        let watched = h.monitor.revisions().watched_entities;
        // A stranger despawning and the local player's HP moving touch
        // neither the watch list nor its grouping.
        h.step(
            3,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(900),
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::EntityDisappeared {
                    uuid: EntityUuid(900),
                },
            ],
        );
        assert_eq!(h.monitor.revisions().watched_entities, watched);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(10_200)));
    }

    // -- Boss mechanics ----------------------------------------------------

    #[test]
    fn boss_lead_follows_the_monitor_and_refire_reaims_it() {
        let mut h = Harness::new(vec![rule("dbm", boss(expiring(5)), "soon", 0)], vec![]);
        let timer = VoiceTimer::Lead {
            rule: VoiceRuleHandle(0),
            subject: VoiceLeadSubject::BossDbm { base_skill_id: 9 },
        };
        // Due at 16 s, seen at 1 s: the "5 s left" cue is armed for 11 s.
        h.event(10, boss_mechanic(9, 16_000));
        assert_eq!(
            h.voice.tracker.armed_deadline(timer),
            Some(MonoTimeMs(11_000))
        );
        // Re-fired at 4 s, now due at 14 s.
        h.event(40, boss_mechanic(9, 14_000));
        assert_eq!(
            h.voice.tracker.armed_deadline(timer),
            Some(MonoTimeMs(9_000))
        );
        assert_eq!(h.voice.tracker.len(), 1);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(9_000)));
    }

    #[test]
    fn boss_refire_inside_lead_fires_expiring_immediately() {
        let mut h = Harness::new(vec![rule("dbm-soon", boss(expiring(5)), "soon", 0)], vec![]);
        // Due at 16 s: the "5 s left" cue is armed for 11 s.
        h.event(10, boss_mechanic(9, 16_000));
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(11_000)));

        // Re-fired at 2 s with 3 s to go: announced on the spot.
        h.event(20, boss_mechanic(9, 5_000));
        assert_eq!(h.fired(), ["soon"]);
        // Only the monitor's own expiry timer is left.
        assert_eq!(h.voice.tracker.len(), 0);
    }

    #[test]
    fn scene_change_cancels_only_boss_leads() {
        let mut h = Harness::new(
            vec![
                rule("dbm", boss(expiring(1)), "dbm", 0),
                rule("buff", trigger(local_buff(77), expiring(1)), "buff", 0),
            ],
            vec![],
        );
        h.event(10, boss_mechanic(9, 10_000));
        h.voice
            .buffs
            .set(VoiceBuffScope::LocalPlayer, 77, aggregate(Some(4_000)));
        h.voice.sync_buff_leads(
            VoiceSyncReason::Runtime,
            1_000,
            MonoTimeMs(1_000),
            &mut h.scheduler,
        );
        assert_eq!(h.voice.tracker.len(), 2);

        h.event(
            20,
            DomainEvent::SceneChanged {
                previous_scene_id: Some(1),
                scene_id: 2,
                difficulty: None,
            },
        );
        assert_eq!(h.voice.tracker.len(), 1);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(3_000)));
    }

    #[test]
    fn boss_leads_survive_a_voice_rule_change() {
        let lead = rule("dbm", boss(expiring(5)), "soon", 0);
        let mut h = Harness::new(vec![lead.clone()], vec![]);
        h.event(10, boss_mechanic(9, 16_000));
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(11_000)));

        // Another binding's phrase finishes generating mid-fight: the rule
        // set is rebuilt, and the running mechanic's cue is re-armed.
        assert!(h.reconfigure(
            vec![
                lead,
                rule("vote", alert(AlertKind::TeamVoteStarted), "vote", 0)
            ],
            20,
        ));
        assert_eq!(h.voice.tracker.len(), 1);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(11_000)));
        h.drain(110);
        assert_eq!(h.fired(), ["soon"]);
    }

    #[test]
    fn boss_started_and_expiring_rules_share_one_subject_lookup() {
        let mut h = Harness::new(
            vec![
                rule("dbm-start", boss(VoiceEvent::Started), "start", 0),
                rule("dbm-expiring", boss(expiring(2)), "soon", 0),
            ],
            vec![],
        );
        h.event(10, boss_mechanic(9, 10_000));
        assert_eq!(h.fired(), ["start"]);
        // The monitor's expiry timer (10 s) and the voice lead (8 s).
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(8_000)));
    }

    const MONSTER_SKILL: i32 = 101_403;

    fn monster_skill_rule() -> VoiceRule {
        rule(
            "monster-skill",
            trigger(
                VoiceSubject::MonsterSkill {
                    skill_id: MONSTER_SKILL,
                },
                VoiceEvent::Started,
            ),
            "cast",
            0,
        )
    }

    fn monster(uuid: EntityUuid, owner: Option<EntityUuid>) -> Vec<ProtocolObservation> {
        vec![
            ProtocolObservation::EntityAppeared {
                uuid,
                kind: EntityKind::Monster,
            },
            ProtocolObservation::IdentityUpdated {
                uuid,
                patch: EntityIdentityPatch {
                    owner_uuid: owner.map_or(FieldPatch::Unchanged, FieldPatch::Set),
                    ..Default::default()
                },
            },
        ]
    }

    #[test]
    fn monster_skill_cast_fires_once_per_batch() {
        let mut h = Harness::new(vec![monster_skill_rule()], vec![]);
        let boss = EntityUuid(30);
        let mut observations = monster(boss, None);
        observations.push(cast(boss, MONSTER_SKILL, SkillPhase::Observed));
        observations.push(cast(boss, MONSTER_SKILL, SkillPhase::Observed));

        h.step(10, observations);
        assert_eq!(h.fired(), ["cast"]);

        h.step(30, vec![cast(boss, MONSTER_SKILL, SkillPhase::Observed)]);
        assert_eq!(h.fired(), ["cast"]);
    }

    #[test]
    fn monster_skill_cast_by_character_or_player_summon_is_silent() {
        let mut h = Harness::new(vec![monster_skill_rule()], vec![]);
        let summon = EntityUuid(31);
        let player_owner = EntityUuid(crate::live::entity_id::canonical_player_uuid(5));
        let mut observations = monster(summon, Some(player_owner));
        observations.push(cast(summon, MONSTER_SKILL, SkillPhase::Observed));
        observations.push(cast(OTHER_PLAYER, MONSTER_SKILL, SkillPhase::Observed));

        h.step(10, observations);

        assert!(h.fired().is_empty());
    }

    #[test]
    fn deadline_delivery_fires_rule_once_and_rejects_superseded_schedule() {
        let mut h = Harness::new(
            vec![rule("dbm-expiring", boss(expiring(0)), "soon", 0)],
            vec![],
        );
        let timer = VoiceTimer::Lead {
            rule: VoiceRuleHandle(0),
            subject: VoiceLeadSubject::BossDbm { base_skill_id: 9 },
        };
        h.event(10, boss_mechanic(9, 5_000));
        h.event(10, boss_mechanic(9, 6_000));
        let key = TimerKey::VoiceExpiry {
            rule_set: h.voice.tracker.rule_set(),
            timer,
        };
        let delivery = |scheduled_for: u64| DomainEvent::DeadlineReached {
            key,
            scheduled_for: MonoTimeMs(scheduled_for),
            fired_at: MonoTimeMs(scheduled_for),
            kind: key.kind(),
            scope: TimerScope::Voice(1),
            generation: 0,
        };

        h.voice.apply(
            &domain_event(50, delivery(5_000)),
            &h.entities,
            &mut h.scheduler,
        );
        assert!(h.fired().is_empty());

        h.voice.apply(
            &domain_event(60, delivery(6_000)),
            &h.entities,
            &mut h.scheduler,
        );
        assert_eq!(h.fired(), ["soon"]);
        h.voice.apply(
            &domain_event(61, delivery(6_000)),
            &h.entities,
            &mut h.scheduler,
        );
        assert!(h.fired().is_empty());
    }

    #[test]
    fn playback_settings_preserve_boss_timer_cooldown_and_rule_generation() {
        let rules = vec![
            rule("boss", boss(expiring(0)), "soon", 0),
            rule(
                "alert",
                alert(AlertKind::MatchmakingPopped),
                "alert",
                10_000,
            ),
        ];
        let mut h = Harness::new(rules.clone(), vec![]);
        h.event(1, boss_mechanic(9, 5_000));
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(5_000)));
        h.event(1, DomainEvent::MatchmakingPopped);
        assert_eq!(h.fired(), ["alert"]);
        let generation = h.voice.tracker.rule_set();

        // Volume and queue policy are playback settings: the same rules.
        let mut config = snapshot_of(rules);
        config.volume = 0.25;
        config.queue_policy = crate::voice::models::VoiceQueuePolicy::InterruptForHigherPriority;
        assert!(!h.voice.apply_config(
            &config,
            &h.entities,
            200,
            MonoTimeMs(200),
            &mut h.scheduler
        ));
        assert_eq!(h.voice.tracker.rule_set(), generation);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(5_000)));
        h.event(2, DomainEvent::MatchmakingPopped);
        assert!(h.fired().is_empty());
        h.drain(50);
        assert_eq!(h.fired(), ["soon"]);

        // Voice switched off: normalization empties the rules.
        config.enabled = false;
        config.normalize();
        assert!(h.voice.apply_config(
            &config,
            &h.entities,
            6_000,
            MonoTimeMs(6_000),
            &mut h.scheduler
        ));
        assert!(h.voice.book.is_empty());
    }
}
