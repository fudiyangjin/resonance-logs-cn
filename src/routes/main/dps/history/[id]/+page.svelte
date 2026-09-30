<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import type { EncounterDetailData, EncounterRangeData } from "$lib/bindings";
  import { commands } from "$lib/bindings";
  import DeathList from "$lib/components/death-replay/death-list.svelte";
  import DeathPlayerList from "$lib/components/death-replay/death-player-list.svelte";
  import DeathReplayDetail from "$lib/components/death-replay/death-replay-detail.svelte";
  import EncounterTimelineChart, {
    type TimelineEventDisplay,
  } from "$lib/components/encounter-timeline/encounter-timeline-chart.svelte";
  import type {
    EncounterChart,
    EncounterTimelineEvent,
  } from "$lib/components/encounter-timeline/timeline-data";
  import HistoryPlayerTable from "$lib/components/history/history-player-table.svelte";
  import HistorySkillView from "$lib/components/history/history-skill-view.svelte";
  import {
    resolveMonsterName,
    resolveMonsterSkillName,
    resolveSceneName,
  } from "$lib/config/game-names";
  import BuffCoverageTable from "$lib/components/history/buff-coverage-table.svelte";
  import type { TimelineBuffLane } from "$lib/components/encounter-timeline/timeline-types";
  import { resolveBuffDisplayName } from "$lib/config/buff-name-table";
  import { getGlobalBuffAliases } from "$lib/settings-store";
  import {
    buildHistoryPlayerRows,
    historyBuffCoverageByKey,
    historyBuffTimeline,
    historyBuffTimelineRange,
    historyDamageHits,
    historyDeathEntries,
    historyEntityToRaw,
    type HistoryEntity,
    type HistoryPlayerRow,
  } from "$lib/history-derived";
  import { formatDateTime, t, type MessageKey } from "$lib/i18n/index.svelte";
  import { ipcBigInt, ipcCompare, ipcNumber } from "$lib/ipc-decimal";
  import getDisplayName from "$lib/name-display";
  import { SETTINGS, settings } from "$lib/settings-store";
  import {
    recentFantasyCastsByEntity,
    resolveFantasyDisplayName,
    resolveFantasyIcon,
    type FantasyCastDisplay,
  } from "$lib/fantasy-icons";
  import { findKeySkillMarker } from "$lib/skill-mappings";
  import { buildSourceEntities } from "$lib/tanked-source-derived";
  import { CLASS_MAP } from "$lib/utils.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import CheckIcon from "@lucide/svelte/icons/check";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import StarIcon from "@lucide/svelte/icons/star";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import XIcon from "@lucide/svelte/icons/x";
  import { SvelteMap, SvelteURLSearchParams } from "svelte/reactivity";
  import { toast } from "svelte-sonner";

  type HistoryTab = "damage" | "tanked" | "healing" | "death";
  type HistorySkillType = "dps" | "heal" | "tanked" | "death";
  type DetailState =
    | { kind: "loading" }
    | { kind: "ready"; data: EncounterDetailData }
    | { kind: "error"; message: string };
  type RangeState =
    | { kind: "idle" }
    | { kind: "loading"; startMs: number; endMs: number }
    | { kind: "ready"; data: EncounterRangeData }
    | { kind: "error"; message: string };

  type OverviewTargetOption = {
    targetEntityUuid: string;
    targetDisplayUid: number;
    targetMonsterId: number | null;
    targetName: string;
    totalValue: bigint;
  };

  const tabs: { key: HistoryTab; labelKey: MessageKey }[] = [
    { key: "damage", labelKey: "history.detail.tabs.damage" },
    { key: "tanked", labelKey: "history.detail.tabs.tanked" },
    { key: "healing", labelKey: "history.detail.tabs.healing" },
    { key: "death", labelKey: "history.detail.tabs.death" },
  ];

  const encounterId = $derived.by(() => {
    const parsed = Number.parseInt($page.params.id ?? "", 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  });

  // ---- URL-driven drill-down state (refresh / back-forward safe) ----------
  const entityUuid = $derived($page.url.searchParams.get("entityUuid"));
  const skillType = $derived(
    ($page.url.searchParams.get("skillType") ?? "dps") as HistorySkillType,
  );
  const selectedSkillTargetUuid = $derived(
    $page.url.searchParams.get("targetEntityUuid"),
  );
  const selectedTakenMonsterId = $derived(
    $page.url.searchParams.get("takenMonsterId"),
  );
  // The death branch is handled separately; this narrows the skill view type.
  const skillViewType = $derived(
    skillType === "death" ? ("dps" as const) : skillType,
  );
  const selectedDeathTs = $derived.by(() => {
    const raw = $page.url.searchParams.get("deathTs");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  });

  let detailState = $state.raw<DetailState>({ kind: "loading" });
  let rangeState = $state.raw<RangeState>({ kind: "idle" });
  let selectedRange = $state<[number, number] | null>(null);
  let activeTab = $state<HistoryTab>("damage");
  let overviewTargetUuid = $state<string | null>(null);
  let showDeleteModal = $state(false);
  let isDeleting = $state(false);
  let editingNote = $state(false);
  let noteDraft = $state("");
  let noteError = $state<string | null>(null);
  let isSavingNote = $state(false);
  let detailRequestGeneration = 0;
  let rangeRequestGeneration = 0;

  const detail = $derived(
    detailState.kind === "ready" ? detailState.data : null,
  );
  const encounter = $derived(detail?.summary ?? null);
  const activeRange = $derived.by(() => {
    if (!selectedRange || rangeState.kind !== "ready") return null;
    return rangeState.data.startMs === selectedRange[0] &&
      rangeState.data.endMsExclusive === selectedRange[1]
      ? rangeState.data
      : null;
  });
  const activeData = $derived(activeRange ?? detail);
  const rangePending = $derived(
    selectedRange !== null &&
      activeRange === null &&
      rangeState.kind === "loading",
  );
  const activeDurationMs = $derived(
    activeRange
      ? Math.max(1, activeRange.endMsExclusive - activeRange.startMs)
      : detail
        ? Math.max(1, Math.ceil(detail.summary.duration * 1_000))
        : 1,
  );
  // Ranges have no separate active-combat window; TDPS falls back to elapsed.
  const activeCombatMs = $derived(
    activeRange
      ? null
      : detail?.summary.activeCombatDuration != null
        ? Math.max(1, Math.ceil(detail.summary.activeCombatDuration * 1_000))
        : null,
  );
  const localEntityId = $derived(
    encounter?.localPlayerId == null ? null : String(encounter.localPlayerId),
  );

  // ---- Adapted entities / merged player rows ------------------------------
  const rawEntities = $derived.by(() =>
    (activeData?.entities ?? [])
      .filter((entity) => entity.monsterId === null)
      .map(historyEntityToRaw),
  );
  const entityNames = $derived.by(() => {
    const mapping = new SvelteMap<string, string>();
    for (const entity of activeData?.entities ?? []) {
      const name = entity.name?.trim();
      if (name) mapping.set(entity.entityId, name);
    }
    return mapping;
  });
  const playerUuids = $derived(
    new Set(rawEntities.map((entity) => entity.entityUuid)),
  );

  const players = $derived(
    buildHistoryPlayerRows(
      rawEntities,
      activeDurationMs,
      activeCombatMs,
      localEntityId,
    ),
  );

  function isNumericLikeName(name: string): boolean {
    return /^#?\d+$/.test(name.trim());
  }

  function resolveTargetDisplayName(target: {
    targetEntityUuid: string;
    targetDisplayUid: number;
    targetMonsterId: number | null;
    targetName: string | null;
  }): string {
    const entityName = entityNames.get(target.targetEntityUuid);
    if (entityName) return entityName;
    const recorded = target.targetName?.trim();
    if (recorded) return recorded;
    if (target.targetMonsterId !== null) {
      return resolveMonsterName(target.targetMonsterId);
    }
    return `#${target.targetDisplayUid}`;
  }

  const overviewTargets = $derived.by(() => {
    const merged = new SvelteMap<string, OverviewTargetOption>();
    for (const entity of rawEntities) {
      for (const target of entity.dmgPerTarget) {
        const targetName = resolveTargetDisplayName(target);
        const totalValue = ipcBigInt(target.totalValue);
        const existing = merged.get(target.targetEntityUuid);
        if (existing) {
          existing.totalValue += totalValue;
          if (existing.targetName.startsWith("#") && targetName) {
            existing.targetName = targetName;
          }
          if (
            existing.targetMonsterId === null &&
            target.targetMonsterId !== null
          ) {
            existing.targetMonsterId = target.targetMonsterId;
          }
        } else {
          merged.set(target.targetEntityUuid, {
            targetEntityUuid: target.targetEntityUuid,
            targetDisplayUid: target.targetDisplayUid,
            targetMonsterId: target.targetMonsterId,
            targetName,
            totalValue,
          });
        }
      }
    }
    return [...merged.values()]
      .filter(
        (target) =>
          target.targetName.trim().length > 0 &&
          !isNumericLikeName(target.targetName),
      )
      .toSorted((a, b) => ipcCompare(b.totalValue, a.totalValue));
  });

  const displayedPlayers = $derived.by(() => {
    if (activeTab === "damage") {
      if (overviewTargetUuid === null) {
        return [...players].toSorted((a, b) => b.totalDmg - a.totalDmg);
      }
      const targetUuid = overviewTargetUuid;
      const targetEntities = rawEntities.map((entity) => {
        const perTarget = entity.dmgPerTarget.find(
          (target) => target.targetEntityUuid === targetUuid,
        );
        const damage = perTarget?.damage ?? zeroCombatStats();
        return {
          ...entity,
          damage,
          damageBossOnly: damage,
          healing: zeroCombatStats(),
          taken: zeroCombatStats(),
        };
      });
      return buildHistoryPlayerRows(
        targetEntities,
        activeDurationMs,
        activeCombatMs,
        localEntityId,
      ).toSorted((a, b) => b.totalDmg - a.totalDmg);
    }
    if (activeTab === "tanked") {
      return players
        .filter((p) => p.damageTaken > 0)
        .toSorted((a, b) => b.damageTaken - a.damageTaken);
    }
    if (activeTab === "healing") {
      return players
        .filter((p) => p.healDealt > 0)
        .toSorted((a, b) => b.healDealt - a.healDealt);
    }
    return players;
  });

  function zeroCombatStats() {
    return {
      total: "0",
      effectiveTotal: "0",
      hits: "0",
      critHits: "0",
      critTotal: "0",
      luckyHits: "0",
      luckyTotal: "0",
      triggerHits: "0",
      blockHits: "0",
      luckyBlockHits: "0",
    };
  }

  // ---- Drill-down selections ----------------------------------------------
  const selectedPlayer = $derived.by(() => {
    if (!entityUuid) return null;
    return players.find((p) => p.entityUuid === entityUuid) ?? null;
  });

  const selectedEntity = $derived.by(() => {
    if (!entityUuid) return null;
    return (
      rawEntities.find((entity) => entity.entityUuid === entityUuid) ?? null
    );
  });

  // Tanked middle layer: one synthetic row per attacking monster template.
  const takenSourceRows = $derived.by(() => {
    if (!selectedEntity || skillType !== "tanked") return [];
    const entities = buildSourceEntities(
      selectedEntity,
      selectedEntity.takenPerSource,
    );
    return buildHistoryPlayerRows(
      entities,
      activeDurationMs,
      activeCombatMs,
      localEntityId,
    ).toSorted((a, b) => b.damageTaken - a.damageTaken);
  });

  const takenTotalRow = $derived.by<HistoryPlayerRow | null>(() => {
    if (!selectedPlayer) return null;
    return {
      ...selectedPlayer,
      name: t("history.detail.target.total"),
      abilityScore: 0,
      seasonStrength: 0,
    };
  });

  const deathEntries = $derived(
    historyDeathEntries(activeData?.entities ?? []),
  );

  const selectedDeathEntry = $derived.by(() => {
    if (!entityUuid) return null;
    return (
      deathEntries.find((entry) => entry.entityUuid === entityUuid) ?? null
    );
  });

  const selectedDeathRecord = $derived.by(() => {
    if (!selectedDeathEntry || selectedDeathTs == null) return null;
    return (
      selectedDeathEntry.deaths.find(
        (record) => Number(record.deathTimestampMs) === selectedDeathTs,
      ) ?? null
    );
  });

  // ---- Timeline chart ------------------------------------------------------
  const chart = $derived.by<EncounterChart | null>(() => {
    if (!detail?.detailAvailable) return null;
    const damageHits = historyDamageHits(detail.damageHits);
    if (damageHits.length === 0) return null;
    return {
      durationMs: Math.max(1, detail.endMsExclusive - detail.startMs),
      damageHits,
    };
  });

  const timelineEvents = $derived.by<EncounterTimelineEvent[]>(() =>
    (detail?.markers ?? []).map((marker) => ({
      sequence: marker.sequence,
      tsOffsetMs: marker.offsetMs - (detail?.startMs ?? 0),
      casterUuid: marker.casterEntityId,
      skillId: ipcNumber(marker.skillId),
      kind: marker.kind,
      remodelLevel: marker.remodelLevel ?? null,
    })),
  );

  const fantasyCastsByEntity = $derived.by(() => {
    if (SETTINGS.history.general.state.showFantasyCastIcons !== true) {
      return new Map<string, FantasyCastDisplay[]>();
    }
    return recentFantasyCastsByEntity(timelineEvents);
  });

  const timelinePlayers = $derived.by(() =>
    (detail?.entities ?? [])
      .filter((entity) => entity.monsterId === null)
      .map((entity) => {
        const className = CLASS_MAP[entity.classId ?? 0] ?? "";
        return {
          entityUuid: entity.entityId,
          name: displayEntityName(entity),
          className,
          classSpecName: entity.classSpecName ?? "",
          isLocalPlayer: entity.entityId === localEntityId,
        };
      }),
  );

  /** Boss casters seen as damage targets, keyed by their entity id. Marker
   * casterEntityId shares this id space, so lanes can be labelled per boss. */
  const timelineBosses = $derived.by(() => {
    const seen = new SvelteMap<string, string>();
    for (const entity of detail?.entities ?? []) {
      for (const target of entity.damageTargets) {
        if (!target.isBoss || seen.has(target.targetEntityId)) continue;
        seen.set(
          target.targetEntityId,
          resolveMonsterName(target.targetMonsterId) ||
            (target.targetName ?? ""),
        );
      }
    }
    return [...seen].map(([entityUuid, name]) => ({ entityUuid, name }));
  });

  // ---- Buff coverage timeline ----------------------------------------------
  const buffAliases = $derived(getGlobalBuffAliases());

  function coverageBuffName(baseId: number): string {
    return resolveBuffDisplayName(baseId, buffAliases);
  }

  /** Full-fight view; null = recorded before buff persistence existed. */
  const buffTimelineView = $derived(historyBuffTimeline(detail?.buffTimeline));

  /** Range view clipped from the encounter-global active windows. */
  const rangeBuffTimelineView = $derived(
    selectedRange
      ? historyBuffTimelineRange(
          buffTimelineView,
          selectedRange[0],
          selectedRange[1],
        )
      : null,
  );

  const buffRangeCoverage = $derived.by(() => {
    if (!selectedRange) return null;
    return (
      historyBuffCoverageByKey(rangeBuffTimelineView) ??
      new Map<string, number>()
    );
  });

  const buffLanes = $derived.by<TimelineBuffLane[] | null>(() => {
    if (!buffTimelineView) return null;
    return buffTimelineView.lanes.map((lane) => ({
      key: lane.key,
      entityUuid: lane.entityUuid,
      baseId: lane.baseId,
      buffName: coverageBuffName(lane.baseId),
      coveragePct: lane.coveragePct,
      triggerCount: lane.triggerCount,
      spans: lane.spans,
    }));
  });

  // ---- Data loading --------------------------------------------------------
  $effect(() => {
    const requestedId = encounterId;
    const generation = ++detailRequestGeneration;
    selectedRange = null;
    rangeRequestGeneration += 1;
    rangeState = { kind: "idle" };
    overviewTargetUuid = null;
    if (requestedId === null) {
      detailState = { kind: "error", message: "Invalid encounter id" };
      return;
    }
    detailState = { kind: "loading" };
    void commands
      .getEncounterDetail(requestedId)
      .then((result) => {
        if (generation !== detailRequestGeneration) return;
        if (result.status === "ok") {
          detailState = { kind: "ready", data: result.data };
          noteDraft = result.data.summary.note ?? "";
          editingNote = false;
          noteError = null;
        } else {
          detailState = { kind: "error", message: String(result.error) };
        }
      })
      .catch((error: unknown) => {
        if (generation !== detailRequestGeneration) return;
        detailState = { kind: "error", message: errorMessage(error) };
      });
  });

  $effect(() => {
    const requestedId = encounterId;
    const range = selectedRange
      ? ([...selectedRange] as [number, number])
      : null;
    const generation = ++rangeRequestGeneration;
    if (requestedId === null || range === null || !detail?.detailAvailable) {
      rangeState = { kind: "idle" };
      return;
    }
    rangeState = { kind: "loading", startMs: range[0], endMs: range[1] };
    void commands
      .getEncounterRange(requestedId, range[0], range[1])
      .then((result) => {
        if (
          generation !== rangeRequestGeneration ||
          selectedRange?.[0] !== range[0] ||
          selectedRange?.[1] !== range[1]
        ) {
          return;
        }
        rangeState =
          result.status === "ok"
            ? { kind: "ready", data: result.data }
            : { kind: "error", message: String(result.error) };
      })
      .catch((error: unknown) => {
        if (generation !== rangeRequestGeneration) return;
        rangeState = { kind: "error", message: errorMessage(error) };
      });
  });

  $effect(() => {
    if (activeTab !== "damage") {
      overviewTargetUuid = null;
    }
  });

  // Keep the overview tab pointer in sync when the URL indicates a death
  // drill-down, so "死亡回放" appears active on return to the overview.
  $effect(() => {
    if (skillType === "death") {
      activeTab = "death";
    }
  });

  // ---- Helpers --------------------------------------------------------------
  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function formatDuration(durationMs: number): string {
    const seconds = Math.max(0, Math.round(durationMs / 1_000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function displayEntityName(entity: {
    entityId: string;
    displayUid: number;
    name: string | null;
    classId: number | null;
    classSpecName?: string | null;
  }): string {
    const className = CLASS_MAP[entity.classId ?? 0] ?? "";
    return getDisplayName({
      player: {
        entityUuid: entity.entityId,
        displayUid: entity.displayUid,
        name: entity.name ?? `#${entity.displayUid}`,
        className,
        classSpecName: entity.classSpecName ?? "",
      },
      showYourNameSetting: settings.state.history.general.showYourName,
      showOthersNameSetting: settings.state.history.general.showOthersName,
      isLocalPlayer: entity.entityId === localEntityId,
    });
  }

  function displayRawEntityName(entity: HistoryEntity): string {
    return getDisplayName({
      player: {
        entityUuid: entity.entityUuid,
        displayUid: entity.displayUid,
        name: entity.name || `#${entity.displayUid}`,
        className: entity.className,
        classSpecName: entity.classSpecName,
      },
      showYourNameSetting: settings.state.history.general.showYourName,
      showOthersNameSetting: settings.state.history.general.showOthersName,
      isLocalPlayer: entity.entityUuid === localEntityId,
    });
  }

  function resolveTimelineEvent(
    event: EncounterTimelineEvent,
  ): TimelineEventDisplay {
    const casterName =
      timelinePlayers.find((player) => player.entityUuid === event.casterUuid)
        ?.name ?? "";
    switch (event.kind) {
      case "boss_skill":
        return {
          name: resolveMonsterSkillName(event.skillId),
          iconPath: null,
          casterName,
        };
      case "fantasy":
        return {
          name: resolveFantasyDisplayName(event.skillId, event.skillId),
          iconPath: resolveFantasyIcon(event.skillId).iconPath,
          casterName,
        };
      case "key_skill": {
        const marker = findKeySkillMarker(event.skillId);
        return {
          name: marker?.name ?? `#${event.skillId}`,
          iconPath: marker?.imagePath ?? null,
          casterName,
        };
      }
    }
  }

  // ---- Navigation (URL query driven) ----------------------------------------
  function navigateWith(mutate: (sp: SvelteURLSearchParams) => void) {
    const sp = new SvelteURLSearchParams($page.url.searchParams);
    mutate(sp);
    const qs = sp.toString();
    goto(`/main/dps/history/${encounterId}${qs ? `?${qs}` : ""}`);
  }

  function viewPlayerSkills(
    uuid: string,
    type: HistorySkillType = "dps",
    targetEntityUuid?: string | null,
  ) {
    navigateWith((sp) => {
      sp.set("entityUuid", uuid);
      sp.set("skillType", type);
      if (type === "dps" && targetEntityUuid != null) {
        sp.set("targetEntityUuid", targetEntityUuid);
      } else {
        sp.delete("targetEntityUuid");
      }
      sp.delete("deathTs");
      sp.delete("takenMonsterId");
    });
  }

  function viewTakenMonster(monsterKey: string) {
    navigateWith((sp) => {
      sp.set("skillType", "tanked");
      sp.set("takenMonsterId", monsterKey);
      sp.delete("targetEntityUuid");
      sp.delete("deathTs");
    });
  }

  function backToTakenMonsters() {
    navigateWith((sp) => {
      sp.delete("takenMonsterId");
    });
  }

  function viewDeathReplay(uuid: string, deathTs: number) {
    navigateWith((sp) => {
      sp.set("entityUuid", uuid);
      sp.set("skillType", "death");
      sp.set("deathTs", String(deathTs));
      sp.delete("targetEntityUuid");
      sp.delete("takenMonsterId");
    });
  }

  function backToDeathPlayerList() {
    navigateWith((sp) => {
      sp.delete("entityUuid");
      sp.delete("deathTs");
      sp.delete("targetEntityUuid");
      sp.delete("takenMonsterId");
      sp.set("skillType", "death");
    });
  }

  function backToDeathList() {
    navigateWith((sp) => {
      sp.delete("deathTs");
      sp.delete("targetEntityUuid");
      sp.delete("takenMonsterId");
      sp.set("skillType", "death");
    });
  }

  function backToEncounter() {
    navigateWith((sp) => {
      sp.delete("entityUuid");
      sp.delete("skillType");
      sp.delete("targetEntityUuid");
      sp.delete("deathTs");
      sp.delete("takenMonsterId");
    });
  }

  function backToHistory() {
    // Return to the history list while preserving list state.
    const sp = new SvelteURLSearchParams($page.url.searchParams);
    sp.delete("entityUuid");
    sp.delete("skillType");
    sp.delete("targetEntityUuid");
    sp.delete("deathTs");
    sp.delete("takenMonsterId");
    const qs = sp.toString();
    goto(`/main/dps/history${qs ? `?${qs}` : ""}`);
  }

  // ---- Header actions ---------------------------------------------------------
  async function toggleFavorite() {
    if (!encounter || detailState.kind !== "ready") return;
    const nextFavorite = !encounter.isFavorite;
    const previous = detailState.data;
    detailState = {
      kind: "ready",
      data: {
        ...previous,
        summary: { ...previous.summary, isFavorite: nextFavorite },
      },
    };
    const result = await commands.toggleFavoriteEncounter(
      encounter.id,
      nextFavorite,
    );
    if (result.status === "error" && detailState.kind === "ready") {
      detailState = { kind: "ready", data: previous };
    }
  }

  function beginNoteEdit() {
    if (!encounter) return;
    noteDraft = encounter.note ?? "";
    noteError = null;
    editingNote = true;
  }

  function cancelNoteEdit() {
    noteDraft = encounter?.note ?? "";
    noteError = null;
    editingNote = false;
  }

  async function saveNote() {
    if (!encounter || detailState.kind !== "ready" || isSavingNote) return;
    const normalized = noteDraft.trim();
    // Keep in sync with MAX_ENCOUNTER_NOTE_CHARS in src-tauri/src/database/commands.rs.
    if (Array.from(normalized).length > 200) {
      noteError = t("history.detail.note.tooLong");
      return;
    }

    isSavingNote = true;
    noteError = null;
    const previous = detailState.data;
    try {
      const result = await commands.updateEncounterNote(
        encounter.id,
        normalized,
      );
      if (result.status === "error") {
        noteError = t("history.detail.note.saveFailed", {
          error: String(result.error),
        });
        return;
      }
      detailState = {
        kind: "ready",
        data: {
          ...previous,
          summary: { ...previous.summary, note: normalized || null },
        },
      };
      noteDraft = normalized;
      editingNote = false;
    } catch (error) {
      noteError = t("history.detail.note.saveFailed", {
        error: errorMessage(error),
      });
    } finally {
      isSavingNote = false;
    }
  }

  async function confirmDelete() {
    if (!encounter || isDeleting) return;
    isDeleting = true;
    try {
      const result = await commands.deleteEncounter(encounter.id);
      if (result.status === "error") throw new Error(String(result.error));
      backToHistory();
    } catch (error) {
      toast.error(
        t("history.detail.error.deleteFailed", { error: errorMessage(error) }),
      );
      isDeleting = false;
    }
  }

  async function openRemoteEncounter() {
    if (!encounter?.remoteEncounterId) return;
    await openUrl(`https://bpsr.app/encounter/${encounter.remoteEncounterId}`);
  }
</script>

<svelte:head>
  <title>{t("history.detail.skills.title")}</title>
</svelte:head>

<main class="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6">
  {#if detailState.kind === "loading"}
    <div
      class="text-muted-foreground flex min-h-64 items-center justify-center gap-2 text-sm"
    >
      <LoaderCircleIcon class="size-4 animate-spin" />
      {t("history.detail.loading")}
    </div>
  {:else if detailState.kind === "error"}
    <div
      class="border-destructive/40 bg-destructive/10 text-destructive rounded border p-4 text-sm"
    >
      {detailState.message}
    </div>
  {:else}
    {@const currentDetail = detailState.data}
    {@const currentEncounter = currentDetail.summary}
    <header
      class="border-border/60 mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4"
    >
      <div class="flex min-w-0 items-center gap-3">
        <button
          class="hover:bg-muted inline-flex size-9 shrink-0 items-center justify-center rounded transition-colors"
          onclick={backToHistory}
          aria-label={t("history.detail.actions.backToHistory")}
        >
          <ArrowLeftIcon class="size-5" />
        </button>
        <div class="min-w-0">
          <h1 class="text-foreground truncate text-lg font-semibold">
            {currentEncounter.sceneId == null
              ? t("history.detail.encounter.unknownScene")
              : resolveSceneName(
                  currentEncounter.sceneId,
                  currentEncounter.dungeonDifficulty,
                )}
          </h1>
          {#if currentEncounter.bosses.length > 0}
            <div class="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
              {#each currentEncounter.bosses as boss, i (boss.monsterId)}
                <span
                  class={boss.isDefeated
                    ? "text-destructive line-through"
                    : "text-primary"}
                  >{resolveMonsterName(boss.monsterId)}{i <
                  currentEncounter.bosses.length - 1
                    ? ","
                    : ""}</span
                >
              {/each}
            </div>
          {/if}
          <div
            class="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs"
          >
            <span>{formatDateTime(currentEncounter.startedAtMs)}</span>
            <span
              >{t("history.detail.encounter.duration", {
                duration: formatDuration(currentEncounter.duration * 1_000),
              })}</span
            >
            <span>#{currentEncounter.displayIndex}</span>
          </div>
          {#if editingNote}
            <div class="mt-2 flex max-w-xl flex-wrap items-center gap-1.5">
              <input
                class="bg-popover border-border text-foreground min-w-56 flex-1 rounded border px-2 py-1 text-xs"
                type="text"
                value={noteDraft}
                placeholder={t("history.detail.note.placeholder")}
                aria-label={t("history.detail.note.edit")}
                oninput={(event) => {
                  noteDraft = (event.currentTarget as HTMLInputElement).value;
                  noteError = null;
                }}
                onkeydown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveNote();
                  } else if (event.key === "Escape") {
                    cancelNoteEdit();
                  }
                }}
              />
              <button
                class="hover:bg-muted inline-flex size-7 items-center justify-center rounded"
                disabled={isSavingNote}
                onclick={() => void saveNote()}
                aria-label={t("history.detail.note.save")}
              >
                <CheckIcon class="size-4" />
              </button>
              <button
                class="hover:bg-muted inline-flex size-7 items-center justify-center rounded"
                disabled={isSavingNote}
                onclick={cancelNoteEdit}
                aria-label={t("history.detail.note.cancel")}
              >
                <XIcon class="size-4" />
              </button>
              {#if noteError}
                <span class="text-destructive basis-full text-xs"
                  >{noteError}</span
                >
              {/if}
            </div>
          {:else}
            <div
              class="text-muted-foreground mt-2 flex items-center gap-1 text-xs"
            >
              {#if currentEncounter.note}
                <span class="max-w-xl truncate" title={currentEncounter.note}
                  >{currentEncounter.note}</span
                >
              {:else}
                <span class="opacity-60"
                  >{t("history.detail.note.placeholder")}</span
                >
              {/if}
              <button
                class="hover:bg-muted inline-flex size-6 items-center justify-center rounded"
                onclick={beginNoteEdit}
                aria-label={t("history.detail.note.edit")}
              >
                <PencilIcon class="size-3.5" />
              </button>
            </div>
          {/if}
        </div>
      </div>
      <div class="flex items-center gap-1">
        {#if currentEncounter.remoteEncounterId}
          <button
            class="hover:bg-muted inline-flex size-9 items-center justify-center rounded transition-colors"
            onclick={openRemoteEncounter}
            aria-label={t("history.detail.actions.openWebsiteAria")}
          >
            <ExternalLinkIcon class="size-4" />
          </button>
        {/if}
        <button
          class="hover:bg-muted inline-flex size-9 items-center justify-center rounded transition-colors"
          class:text-amber-400={currentEncounter.isFavorite}
          onclick={toggleFavorite}
          aria-label={currentEncounter.isFavorite
            ? t("history.detail.actions.removeFavorite")
            : t("history.detail.actions.addFavorite")}
        >
          <StarIcon
            class="size-4"
            fill={currentEncounter.isFavorite ? "currentColor" : "none"}
          />
        </button>
        <button
          class="text-destructive hover:bg-destructive/10 inline-flex size-9 items-center justify-center rounded transition-colors"
          onclick={() => (showDeleteModal = true)}
          aria-label={t("history.detail.actions.deleteAria")}
        >
          <Trash2Icon class="size-4" />
        </button>
      </div>
    </header>

    {#if !currentDetail.detailAvailable}
      <section class="border-border/60 bg-muted/20 rounded border p-5 text-sm">
        <div class="text-foreground font-medium">
          {t("history.timeline.incomplete")}
        </div>
        <div class="text-muted-foreground mt-1">
          This encounter keeps its summary, but it has no event detail.
        </div>
      </section>
    {:else}
      {#if chart}
        <section class="mb-5">
          <EncounterTimelineChart
            {chart}
            events={timelineEvents}
            players={timelinePlayers}
            bosses={timelineBosses}
            selectionEnabled={true}
            selectionPending={rangePending}
            bind:selectedRange
            resolveEvent={resolveTimelineEvent}
            {buffLanes}
            {buffRangeCoverage}
          />
        </section>
      {/if}

      {#if !entityUuid && encounter}
        <!-- Encounter overview -->
        <nav
          class="border-border/60 mb-3 flex gap-1 border-b"
          aria-label="History metrics"
        >
          {#each tabs as tab (tab.key)}
            <button
              class="border-primary px-3 py-2 text-sm transition-colors {activeTab ===
              tab.key
                ? 'text-foreground border-b-2'
                : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'}"
              onclick={() => (activeTab = tab.key)}
            >
              {t(tab.labelKey)}
            </button>
          {/each}
        </nav>

        {#if activeTab === "damage" && overviewTargets.length > 0}
          <div class="mb-3 flex flex-wrap gap-1.5">
            <button
              class="border-border rounded border px-3 py-1 text-xs transition-colors {overviewTargetUuid ===
              null
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
              onclick={() => (overviewTargetUuid = null)}
            >
              {t("history.detail.target.total")}
            </button>
            {#each overviewTargets as target (target.targetEntityUuid)}
              <button
                class="border-border rounded border px-3 py-1 text-xs transition-colors {overviewTargetUuid ===
                target.targetEntityUuid
                  ? 'bg-muted/40 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
                onclick={() => (overviewTargetUuid = target.targetEntityUuid)}
              >
                {target.targetName}
              </button>
            {/each}
          </div>
        {/if}

        {#if activeTab === "death"}
          <DeathPlayerList
            entries={deathEntries}
            localPlayerUuid={localEntityId}
            onSelect={(uuid) => viewPlayerSkills(uuid, "death")}
            emptyMessage={t("history.detail.death.empty")}
            variant="history"
          />
        {:else}
          <HistoryPlayerTable
            rows={displayedPlayers}
            {fantasyCastsByEntity}
            metric={activeTab === "healing"
              ? "heal"
              : activeTab === "tanked"
                ? "tanked"
                : "dps"}
            onSelect={(row) =>
              viewPlayerSkills(
                row.entityUuid,
                activeTab === "healing"
                  ? "heal"
                  : activeTab === "tanked"
                    ? "tanked"
                    : "dps",
                activeTab === "damage" ? overviewTargetUuid : null,
              )}
          />
        {/if}

        {#if buffTimelineView && buffTimelineView.lanes.length > 0}
          <section class="mt-5">
            <BuffCoverageTable
              view={buffTimelineView}
              rangeView={rangeBuffTimelineView}
              players={timelinePlayers}
              resolveBuffName={coverageBuffName}
            />
          </section>
        {:else if chart && !buffTimelineView}
          <p class="text-muted-foreground mt-5 text-[11px]">
            {t("history.buffCoverage.unavailable")}
          </p>
        {/if}
      {:else if entityUuid && selectedPlayer && selectedEntity && skillType === "death"}
        <!-- Death replay: per-player list or detail -->
        <div class="mb-4">
          {#if selectedDeathTs == null}
            <DeathList
              playerName={displayRawEntityName(selectedEntity)}
              className={selectedEntity.className}
              classSpecName={selectedEntity.classSpecName}
              deaths={selectedDeathEntry?.deaths ?? []}
              fightStartTimestampMs={encounter?.startedAtMs ?? null}
              onSelect={(ts) => viewDeathReplay(selectedEntity.entityUuid, ts)}
              onBack={backToDeathPlayerList}
              variant="history"
            />
          {:else if selectedDeathRecord}
            <DeathReplayDetail
              playerName={displayRawEntityName(selectedEntity)}
              className={selectedEntity.className}
              classSpecName={selectedEntity.classSpecName}
              record={selectedDeathRecord}
              onBack={backToDeathList}
              variant="history"
            />
          {:else}
            <div
              class="border-border/60 text-muted-foreground flex h-40 items-center justify-center rounded-lg border border-dashed text-xs"
            >
              {t("history.detail.death.notFound")}
              <button class="ml-2 underline" onclick={backToDeathList}>
                {t("history.detail.death.backToList")}
              </button>
            </div>
          {/if}
        </div>
      {:else if entityUuid && selectedPlayer && selectedEntity && skillType === "tanked" && selectedTakenMonsterId === null}
        <!-- Tanked: per-monster aggregation (middle layer) -->
        <div class="mb-4">
          <div class="mb-2 flex items-center gap-3">
            <button
              onclick={backToEncounter}
              class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              aria-label={t("history.detail.actions.backToOverview")}
            >
              <ArrowLeftIcon class="size-5" />
            </button>
            <div>
              <h2 class="text-foreground text-xl font-semibold">
                {t("live.tanked.monsters.title")}
              </h2>
              <div class="text-sm text-neutral-400">
                {t("history.detail.player.label")}
                {displayRawEntityName(selectedEntity)}
                <span class="text-neutral-500"
                  >#{selectedEntity.displayUid}</span
                >
              </div>
            </div>
          </div>
        </div>

        <HistoryPlayerTable
          rows={takenSourceRows}
          metric="tanked"
          nameHeader={t("live.tanked.monsters.title")}
          totalRow={takenTotalRow}
          onSelect={(row) => viewTakenMonster(row.entityUuid)}
        />
      {:else if entityUuid && selectedPlayer && selectedEntity}
        <!-- Player skills view -->
        <HistorySkillView
          entity={selectedEntity}
          playerName={displayRawEntityName(selectedEntity)}
          skillType={skillViewType}
          elapsedSecs={activeDurationMs / 1_000}
          targetEntityUuid={selectedSkillTargetUuid}
          takenMonsterKey={selectedTakenMonsterId}
          {entityNames}
          {playerUuids}
          onBack={skillType === "tanked"
            ? backToTakenMonsters
            : backToEncounter}
        />
      {:else}
        <div class="text-muted-foreground py-12 text-center text-sm">
          {t("history.detail.loading")}
        </div>
      {/if}
    {/if}
  {/if}
</main>

{#if showDeleteModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-title"
  >
    <button
      class="absolute inset-0 bg-black/60"
      onclick={() => (showDeleteModal = false)}
      aria-label={t("history.detail.deleteDialog.closeAria")}
    ></button>
    <div
      class="bg-card border-border relative mx-4 w-full max-w-md rounded-lg border p-5 shadow-xl"
    >
      <h2 id="delete-title" class="text-foreground text-base font-semibold">
        {t("history.detail.deleteDialog.title")}
      </h2>
      <p class="text-muted-foreground mt-2 text-sm">
        {t("history.detail.deleteDialog.message")}
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          class="border-border hover:bg-muted rounded border px-3 py-2 text-sm"
          disabled={isDeleting}
          onclick={() => (showDeleteModal = false)}
        >
          {t("history.detail.deleteDialog.cancel")}
        </button>
        <button
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-60"
          disabled={isDeleting}
          onclick={confirmDelete}
        >
          {#if isDeleting}<LoaderCircleIcon class="size-4 animate-spin" />{/if}
          {isDeleting
            ? t("history.detail.deleteDialog.deleting")
            : t("history.detail.deleteDialog.confirm")}
        </button>
      </div>
    </div>
  </div>
{/if}
