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
    projection.sync_boss_expiry(0, 9, MonoTimeMs(5_000), 0, MonoTimeMs(1_000), &mut scheduler);
    projection.sync_boss_expiry(0, 9, MonoTimeMs(6_000), 0, MonoTimeMs(1_000), &mut scheduler);

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
        rule("match", alert(AlertKind::MatchmakingPopped), "match-phrase", 0),
        rule("ready", alert(AlertKind::ReadyCheckStarted), "ready-phrase", 0),
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
        rule("local", trigger(local_buff(42), VoiceEvent::Started), "p1", 0),
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
        rule("gained", trigger(local_buff(42), VoiceEvent::Started), "on", 0),
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
        ],
    };
    snapshot.normalize();
    assert_eq!(snapshot.volume, 1.0);
    let ids: Vec<&str> = snapshot.rules.iter().map(|rule| rule.id.as_str()).collect();
    assert_eq!(ids, vec!["ok"]);
}
