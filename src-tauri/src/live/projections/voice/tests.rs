use std::sync::Arc;

use super::*;
use crate::live::runtime::events::{
    BatchId, EntityIdentityPatch, EntityKind, EntityRef, EntityUuid, EventMeta, FieldPatch,
    ObservedBuff, ObservedBuffChange, ProtocolBatch, ProtocolObservation,
};

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

#[test]
fn multiple_instances_emit_only_first_gained_and_last_lost() {
    let mut projection = VoiceProjection::default();
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
    let gained = projection.replace_buff_aggregates(collect_buff_aggregates(&entities), true);
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
        projection
            .replace_buff_aggregates(collect_buff_aggregates(&entities), true)
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
        projection
            .replace_buff_aggregates(collect_buff_aggregates(&entities), true)
            .is_empty()
    );

    entities.apply_batch(batch(
        5,
        vec![ProtocolObservation::BuffChanged {
            target_uuid: EntityUuid(1),
            change: ObservedBuffChange::Remove { instance_id: 11 },
        }],
    ));
    let lost = projection.replace_buff_aggregates(collect_buff_aggregates(&entities), true);
    assert_eq!(lost.len(), 1);
    assert!(!lost[0].gained);
}

#[test]
fn entity_disappearance_emits_one_lost_edge_for_each_aggregate() {
    let mut projection = VoiceProjection::default();
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
    projection.replace_buff_aggregates(collect_buff_aggregates(&entities), false);

    entities.apply_batch(batch(
        3,
        vec![ProtocolObservation::EntityDisappeared {
            uuid: EntityUuid(1),
        }],
    ));
    let lost = projection.replace_buff_aggregates(collect_buff_aggregates(&entities), true);

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
    let aggregates = collect_buff_aggregates(&entities);
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
    let aggregates = collect_buff_aggregates(&entities);
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

#[test]
fn permanent_aggregate_cancels_existing_expiry_timer() {
    let mut projection = VoiceProjection {
        rule_set: 1,
        rules: vec![VoiceRule {
            id: "buff-expiry".to_string(),
            enabled: true,
            trigger: trigger(local_buff(77), expiring(1)),
            phrase_id: "buff-expiry".to_string(),
            priority: 1,
            cooldown_ms: 0,
            phrase_id_by_tier: None,
        }],
        buff_aggregates: HashMap::from([(
            VoiceBuffScope::LocalPlayer,
            HashMap::from([(
                77,
                BuffAggregate {
                    expires_mono_ms: Some(MonoTimeMs(5_000)),
                    fantasy_tier: None,
                },
            )]),
        )]),
        ..Default::default()
    };
    projection.rebuild_rule_indexes();
    let mut scheduler = DeadlineScheduler::new();
    projection.sync_buff_expiries(MonoTimeMs(1_000), &mut scheduler);
    assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(4_000)));

    projection.buff_aggregates.insert(
        VoiceBuffScope::LocalPlayer,
        HashMap::from([(
            77,
            BuffAggregate {
                expires_mono_ms: None,
                fantasy_tier: None,
            },
        )]),
    );
    projection.sync_buff_expiries(MonoTimeMs(2_000), &mut scheduler);
    assert!(scheduler.is_empty());
}

#[test]
fn expired_lead_time_is_not_scheduled() {
    let mut projection = VoiceProjection {
        rule_set: 1,
        ..Default::default()
    };
    let mut scheduler = DeadlineScheduler::new();
    projection.deadlines.sync(
        buff_voice_key(1, 0, VoiceBuffScope::LocalPlayer, 77),
        TimerScope::RuleSet(1),
        Some(MonoTimeMs(2_000)),
        1,
        MonoTimeMs(1_001),
        &mut scheduler,
    );
    assert!(scheduler.is_empty());
}

#[test]
fn boss_expiry_refreshes_by_rule_and_base_skill() {
    let mut projection = VoiceProjection {
        rule_set: 1,
        ..Default::default()
    };
    let mut scheduler = DeadlineScheduler::new();
    let key = boss_voice_key(1, 2, 77);

    projection.sync_boss_expiry(
        2,
        77,
        MonoTimeMs(16_000),
        5,
        MonoTimeMs(1_000),
        &mut scheduler,
    );
    assert_eq!(
        projection.deadlines.armed_deadline(key),
        Some(MonoTimeMs(11_000))
    );
    assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(11_000)));

    projection.sync_boss_expiry(
        2,
        77,
        MonoTimeMs(14_000),
        5,
        MonoTimeMs(4_000),
        &mut scheduler,
    );

    assert_eq!(
        projection.deadlines.armed_deadline(key),
        Some(MonoTimeMs(9_000))
    );
    assert_eq!(projection.deadlines.len(), 1);
    assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(9_000)));
}

#[test]
fn scene_change_cancels_only_boss_expiries() {
    let mut projection = VoiceProjection {
        rule_set: 1,
        ..Default::default()
    };
    let mut scheduler = DeadlineScheduler::new();
    projection.sync_boss_expiry(
        2,
        77,
        MonoTimeMs(10_000),
        1,
        MonoTimeMs(1_000),
        &mut scheduler,
    );
    let buff_key = buff_voice_key(1, 3, VoiceBuffScope::LocalPlayer, 88);
    projection.deadlines.sync(
        buff_key,
        TimerScope::RuleSet(1),
        Some(MonoTimeMs(4_000)),
        0,
        MonoTimeMs(1_000),
        &mut scheduler,
    );

    projection.cancel_boss_expiries(&mut scheduler);

    assert_eq!(projection.deadlines.len(), 1);
    assert_eq!(
        projection.deadlines.armed_deadline(buff_key),
        Some(MonoTimeMs(4_000))
    );
    assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(4_000)));
}

#[test]
fn deadline_delivery_fires_rule_once_and_rejects_superseded_schedule() {
    let mut projection = projection_with(vec![rule(
        "dbm-expiring",
        trigger(VoiceSubject::BossDbm { base_skill_id: 9 }, expiring(0)),
        "soon",
        0,
    )]);
    let entities = EntityContext::new();
    let mut scheduler = DeadlineScheduler::new();
    let key = boss_voice_key(1, 0, 9);
    projection.sync_boss_expiry(
        0,
        9,
        MonoTimeMs(5_000),
        0,
        MonoTimeMs(1_000),
        &mut scheduler,
    );
    projection.sync_boss_expiry(
        0,
        9,
        MonoTimeMs(6_000),
        0,
        MonoTimeMs(1_000),
        &mut scheduler,
    );

    let stale = DomainEvent::DeadlineReached {
        key,
        scheduled_for: MonoTimeMs(5_000),
        fired_at: MonoTimeMs(5_000),
        kind: key.kind(),
        scope: TimerScope::RuleSet(1),
        generation: 0,
    };
    projection.apply(&domain_event(5, stale), &entities, &mut scheduler);
    assert!(projection.take_cues().is_empty());

    let live = DomainEvent::DeadlineReached {
        key,
        scheduled_for: MonoTimeMs(6_000),
        fired_at: MonoTimeMs(6_000),
        kind: key.kind(),
        scope: TimerScope::RuleSet(1),
        generation: 0,
    };
    projection.apply(&domain_event(6, live.clone()), &entities, &mut scheduler);
    assert_eq!(fired_phrases(&mut projection), vec!["soon".to_string()]);
    projection.apply(&domain_event(7, live), &entities, &mut scheduler);
    assert!(projection.take_cues().is_empty());
}

// The cases below were migrated from the retired `voice::rules`
// tracker. They now assert on `pending_cues` instead of returned intents.

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

fn projection_with(rules: Vec<VoiceRule>) -> VoiceProjection {
    let mut projection = VoiceProjection {
        rule_set: 1,
        rules,
        ..Default::default()
    };
    projection.rebuild_rule_indexes();
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
    projection.refresh_buff_aggregates(&entities, false, 100, MonoTimeMs(100), &mut scheduler);
    assert!(projection.take_cues().is_empty());
    assert!(projection.buff_aggregates[&VoiceBuffScope::LocalPlayer].contains_key(&77));
}

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
    projection.apply_counters(
        &CounterEngine::new(),
        1_000,
        MonoTimeMs(1_000),
        &mut scheduler,
    );

    assert!(projection.take_cues().is_empty());
    assert_eq!(projection.counter_crossed.get(&(7, 1)), Some(&false));
}

#[test]
fn boss_started_and_expiring_rules_share_one_subject_lookup() {
    let mut projection = projection_with(vec![
        rule(
            "dbm-start",
            trigger(
                VoiceSubject::BossDbm { base_skill_id: 9 },
                VoiceEvent::Started,
            ),
            "start",
            0,
        ),
        rule(
            "dbm-expiring",
            trigger(VoiceSubject::BossDbm { base_skill_id: 9 }, expiring(2)),
            "soon",
            0,
        ),
    ]);
    let entities = EntityContext::new();
    let mut scheduler = DeadlineScheduler::new();

    projection.apply(
        &domain_event(
            1,
            DomainEvent::BossMechanicStarted(
                crate::live::runtime::events::BossMechanicObservation {
                    base_skill_id: 9,
                    skill_effect_id: 0,
                    insertion: 0,
                    server_timestamp_ms: None,
                    duration_ms: 9_000,
                    expires_mono_ms: MonoTimeMs(10_000),
                },
            ),
        ),
        &entities,
        &mut scheduler,
    );

    assert_eq!(fired_phrases(&mut projection), vec!["start".to_string()]);
    assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(8_000)));
}

// ---------------------------------------------------------------------------
// Phase 3: skill cast / cooldown-ready / entity-duration subjects, driven
// through the entity monitor exactly as `ProjectionSet` does at batch end.
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
        voice: VoiceProjection,
        scheduler: DeadlineScheduler,
    }

    impl Harness {
        /// Local player (uuid 1) is present; `rules` are already active.
        fn new(rules: Vec<VoiceRule>, specs: Vec<WatchedEntitySpec>) -> Self {
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
            config.monster.enabled = true;
            config.monster.watched_entities = specs;
            monitor.apply_config(&config, &entities, MonoTimeMs(100));
            let mut voice = projection_with(rules);
            voice.apply_entity_monitor(&monitor, &entities, 100, MonoTimeMs(100), &mut scheduler);
            Self {
                entities,
                monitor,
                voice,
                scheduler,
            }
        }

        /// Mirrors `ProjectionSet::apply` + `end_batch` for one batch at
        /// `sequence` (mono = wall = sequence * 100 ms).
        fn step(&mut self, sequence: u64, observations: Vec<ProtocolObservation>) {
            let events = self.entities.apply_batch(batch(sequence, observations));
            let mut dirty = false;
            for event in &events {
                dirty |= !self
                    .monitor
                    .apply(event, &self.entities, &mut self.scheduler)
                    .is_empty();
                self.voice.apply(event, &self.entities, &mut self.scheduler);
            }
            if dirty {
                self.flush(sequence);
            }
        }

        fn flush(&mut self, sequence: u64) {
            self.voice.apply_entity_monitor(
                &self.monitor,
                &self.entities,
                sequence as i64 * 100,
                MonoTimeMs(sequence * 100),
                &mut self.scheduler,
            );
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
                self.voice.apply(
                    &domain_event(sequence, event),
                    &self.entities,
                    &mut self.scheduler,
                );
            }
            self.flush(sequence);
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
        }
    }

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
    fn repeated_cooldown_packet_is_idempotent_and_reduction_reschedules() {
        let mut h = Harness::new(
            vec![rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0)],
            vec![],
        );
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        let key = skill_voice_key(1, 0, SKILL);
        assert_eq!(
            h.voice.deadlines.armed_deadline(key),
            Some(MonoTimeMs(10_200))
        );

        // Same packet again (server echo) keeps the same deadline.
        h.step(3, vec![cooldown(SKILL, 10_000, 100)]);
        assert_eq!(
            h.voice.deadlines.armed_deadline(key),
            Some(MonoTimeMs(10_200))
        );
        assert_eq!(h.voice.deadlines.len(), 1);

        // Server reports most of the cooldown already elapsed: pull in.
        h.step(4, vec![cooldown(SKILL, 10_000, 8_000)]);
        assert_eq!(
            h.voice.deadlines.armed_deadline(key),
            Some(MonoTimeMs(2_400))
        );
        h.drain(24);
        assert_eq!(h.fired(), vec!["ready".to_string()]);
    }

    #[test]
    fn packet_that_is_already_ready_fires_edge_and_cancels_timer() {
        let mut h = Harness::new(
            vec![rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0)],
            vec![],
        );
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        assert_eq!(h.voice.deadlines.len(), 1);

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
    fn multi_charge_announces_first_charge_only() {
        // SkillChargeTable: 1420 has maxCharges 2.
        let mut h = Harness::new(
            vec![rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0)],
            vec![],
        );
        // Both charges spent at t = 200 ms; one charge back at 6 200.
        h.step(2, vec![charged_cooldown(SKILL, 6_000, 0)]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(6_200)));
        h.drain(62);
        assert_eq!(h.fired(), vec!["ready".to_string()]);

        // 1 -> 2 has no timer and a "one charge left" packet is no edge.
        assert!(h.scheduler.is_empty());
        h.drain(122);
        h.step(123, vec![charged_cooldown(SKILL, 6_000, 6_500)]);
        assert!(h.fired().is_empty());
        assert!(h.scheduler.is_empty());

        // Spend both again: a fresh 0 -> 1 deadline.
        h.step(130, vec![charged_cooldown(SKILL, 6_000, 0)]);
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(19_000)));
    }

    #[test]
    fn local_player_change_cancels_cooldown_timers() {
        let mut h = Harness::new(
            vec![rule("ready", skill(SKILL, VoiceEvent::Ended), "ready", 0)],
            vec![],
        );
        h.step(2, vec![cooldown(SKILL, 10_000, 0)]);
        assert_eq!(h.voice.deadlines.len(), 1);

        h.step(
            3,
            vec![ProtocolObservation::LocalPlayerChanged {
                uuid: Some(OTHER_PLAYER),
            }],
        );
        assert!(h.voice.deadlines.len() == 0);
        assert!(h.scheduler.is_empty());
        h.drain(110);
        assert!(h.fired().is_empty());
    }

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
        assert_eq!(h.fired(), vec!["soon".to_string()]);

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
        assert_eq!(h.voice.deadlines.len(), 1);

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
        assert_eq!(h.voice.deadlines.len(), 2);

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
            ],
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
            .apply_config(&config, &h.entities, MonoTimeMs(500));
        h.flush(5);
        assert!(h.fired().is_empty());
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(20_200)));

        // Re-applying the voice rules while the cart is up must not replay
        // "appeared", but the expiry is re-armed under the new rule set.
        let snapshot = VoiceRuntimeSnapshot {
            enabled: true,
            volume: 1.0,
            queue_policy: Default::default(),
            rules: h.voice.rules.clone(),
        };
        h.voice
            .apply_config(&snapshot, &h.entities, MonoTimeMs(600), &mut h.scheduler);
        h.flush(6);
        assert!(h.fired().is_empty());
        assert_eq!(h.scheduler.next_deadline(), Some(MonoTimeMs(20_200)));
    }
}

#[test]
fn normalize_drops_unsupported_subject_event_pairs() {
    use crate::voice::models::VoiceRuntimeSnapshot;
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
