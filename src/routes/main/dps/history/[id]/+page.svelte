<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { commands } from "$lib/bindings";
  import type { EncounterSummaryDto, HistoryEntityData } from "$lib/bindings";
  import type { RawCombatStats, RawSkillStats } from "$lib/api";
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import {
    historyDpsPlayerColumns,
    historyDpsSkillColumns,
    historyHealPlayerColumns,
    historyHealSkillColumns,
    historyTankedPlayerColumns,
    historyTankedSkillColumns,
  } from "$lib/column-data";
  import {
    settings,
    SETTINGS,
    DEFAULT_HISTORY_STATS,
    DEFAULT_HISTORY_TANKED_STATS,
    DEFAULT_HISTORY_TANKED_SKILL_STATS,
  } from "$lib/settings-store";
  import getDisplayName from "$lib/name-display";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { computePlayerRowsFromEntities } from "$lib/live-derived";
  import {
    groupSkillsByRecount,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import { resolveMonsterName, resolveSceneName } from "$lib/config/game-names";
  import {
    buildSourceEntities,
    findSourceByKey,
  } from "$lib/tanked-source-derived";
  import { formatClassSpecLabel } from "$lib/class-labels";
  import {
    formatDateTime,
    formatNumber,
    t,
    type MessageKey,
  } from "$lib/i18n/index.svelte";
  import DeathPlayerList, {
    type DeathPlayerEntry,
  } from "$lib/components/death-replay/death-player-list.svelte";
  import DeathList from "$lib/components/death-replay/death-list.svelte";
  import DeathReplayDetail from "$lib/components/death-replay/death-replay-detail.svelte";
  import { normalizeHistoryEntities } from "$lib/death-replay-compat";

  type HistorySkillType = "dps" | "heal" | "tanked" | "death";

  type HistoryPlayerRow = {
    entityUuid: string;
    displayUid: number;
    name: string;
    isLocalPlayer: boolean;
    className: string;
    classSpecName: string;
    classDisplay: string;
    abilityScore: number;
    seasonStrength: number;
    totalDmg: number;
    dps: number;
    tdps: number;
    activeTimeMs: number;
    dmgPct: number;
    bossDmg: number;
    bossDps: number;
    bossDmgPct: number;
    critRate: number;
    critDmgRate: number;
    luckyRate: number;
    luckyDmgRate: number;
    blockRate: number;
    luckyBlockRate: number;
    hits: number;
    hitsPerMinute: number;
    damageTaken: number;
    tankedPS: number;
    tankedPct: number;
    critTakenRate: number;
    hitsTaken: number;
    healDealt: number;
    hps: number;
    effectiveHeal: number;
    ehps: number;
    healPct: number;
    critHealRate: number;
    hitsHeal: number;
  };

  type FlatSkillRow =
    | { kind: "group"; key: string; depth: 0; row: RecountGroup }
    | { kind: "skill"; key: string; depth: 0 | 1; row: SkillDisplayRow };

  type PerTargetStats = {
    targetEntityUuid: string;
    targetDisplayUid: number;
    targetMonsterId: number | null;
    totalValue: number;
    damage: RawCombatStats;
    skills: Partial<Record<number, RawSkillStats>>;
  };

  type EntityPerTargetData = {
    entityUuid: string;
    dmgTargets: PerTargetStats[];
    healTargets: PerTargetStats[];
  };

  type OverviewTargetOption = {
    targetEntityUuid: string;
    targetDisplayUid: number;
    targetMonsterId: number | null;
    targetName: string;
    totalValue: number;
  };

  type DisplayPerTargetStats = PerTargetStats & {
    targetName: string;
  };

  // Get encounter ID from URL params
  let encounterId = $derived(
    $page.params.id ? parseInt($page.params.id) : null,
  );
  let entityUuid = $derived($page.url.searchParams.get("entityUuid"));
  let skillType = $derived(
    ($page.url.searchParams.get("skillType") ?? "dps") as HistorySkillType,
  );

  let encounter = $state<EncounterSummaryDto | null>(null);
  let localPlayerUuid = $state<string | null>(null);
  let rawEntities = $state<HistoryEntityData[]>([]);
  let players = $state<HistoryPlayerRow[]>([]);
  let error = $state<string | null>(null);
  let isDeleting = $state(false);
  let showDeleteModal = $state(false);
  let expandedGroups = $state<Set<number>>(new Set<number>());
  let overviewTargetUuid = $state<string | null>(null);

  // Tab state for encounter view
  type HistoryTab = "damage" | "tanked" | "healing" | "death";
  let activeTab = $state<HistoryTab>("damage");
  const tabs: { key: HistoryTab; labelKey: MessageKey }[] = [
    { key: "damage", labelKey: "history.detail.tabs.damage" },
    { key: "tanked", labelKey: "history.detail.tabs.tanked" },
    { key: "healing", labelKey: "history.detail.tabs.healing" },
    { key: "death", labelKey: "history.detail.tabs.death" },
  ];

  let encounterDurationSeconds = $derived.by(() => {
    if (!encounter) return 1;
    if (encounter.duration > 0) return Math.max(1, encounter.duration);
    return Math.max(
      1,
      ((encounter.endedAtMs ?? Date.now()) - encounter.startedAtMs) / 1000,
    );
  });

  function formatEncounterDuration(durationSeconds: number) {
    const secs = Math.max(0, Math.round(durationSeconds));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function buildHistoryPlayers(
    entities: HistoryEntityData[],
    durationSeconds: number,
    activeCombatDurationSeconds: number | null | undefined,
    localUuid: string | null,
  ): HistoryPlayerRow[] {
    const elapsedMs = Math.max(1, Math.floor(durationSeconds * 1000));
    const activeCombatMs = Math.max(
      1,
      Math.floor((activeCombatDurationSeconds ?? durationSeconds) * 1000),
    );
    const source = {
      entities,
      elapsedMs,
      activeCombatTimeMs: activeCombatMs,
      totalDmg: entities.reduce(
        (sum, entity) => sum + (entity.damage?.total ?? 0),
        0,
      ),
      totalHeal: entities.reduce(
        (sum, entity) => sum + (entity.healing?.total ?? 0),
        0,
      ),
      totalDmgBossOnly: entities.reduce(
        (sum, entity) => sum + (entity.damageBossOnly?.total ?? 0),
        0,
      ),
    };

    const dpsRows = computePlayerRowsFromEntities(source, "dps");
    const healRows = computePlayerRowsFromEntities(source, "heal");
    const tankRows = computePlayerRowsFromEntities(source, "tanked");
    const dpsByUid = new Map(dpsRows.map((row) => [row.entityUuid, row]));
    const healByUid = new Map(healRows.map((row) => [row.entityUuid, row]));
    const tankByUid = new Map(tankRows.map((row) => [row.entityUuid, row]));

    return entities
      .map((entity) => {
        const dps = dpsByUid.get(entity.entityUuid);
        const heal = healByUid.get(entity.entityUuid);
        const tank = tankByUid.get(entity.entityUuid);
        const className = entity.className || "";
        const classSpecName = entity.classSpecName || "";
        return {
          entityUuid: entity.entityUuid,
          displayUid: entity.displayUid,
          name: entity.name || `#${entity.displayUid}`,
          isLocalPlayer: localUuid !== null && entity.entityUuid === localUuid,
          className,
          classSpecName,
          classDisplay:
            formatClassSpecLabel(className, classSpecName) ||
            t("history.detail.player.unknownClass"),
          abilityScore: entity.abilityScore || 0,
          seasonStrength: entity.seasonStrength || 0,
          totalDmg: dps?.totalDmg ?? 0,
          dps: dps?.dps ?? 0,
          tdps: dps?.tdps ?? 0,
          activeTimeMs: dps?.activeTimeMs ?? 0,
          dmgPct: dps?.dmgPct ?? 0,
          bossDmg: dps?.bossDmg ?? 0,
          bossDps: dps?.bossDps ?? 0,
          bossDmgPct: dps?.bossDmgPct ?? 0,
          critRate: dps?.critRate ?? 0,
          critDmgRate: dps?.critDmgRate ?? 0,
          luckyRate: dps?.luckyRate ?? 0,
          luckyDmgRate: dps?.luckyDmgRate ?? 0,
          hits: dps?.hits ?? 0,
          hitsPerMinute: dps?.hitsPerMinute ?? 0,
          damageTaken: tank?.totalDmg ?? 0,
          tankedPS: tank?.dps ?? 0,
          tankedPct: tank?.dmgPct ?? 0,
          critTakenRate: tank?.critRate ?? 0,
          blockRate: tank?.blockRate ?? 0,
          luckyBlockRate: tank?.luckyBlockRate ?? 0,
          hitsTaken: tank?.hits ?? 0,
          healDealt: heal?.totalDmg ?? 0,
          hps: heal?.dps ?? 0,
          effectiveHeal: heal?.effectiveTotal ?? 0,
          ehps: heal?.effectiveDps ?? 0,
          healPct: heal?.dmgPct ?? 0,
          critHealRate: heal?.critRate ?? 0,
          hitsHeal: heal?.hits ?? 0,
        };
      })
      .filter(
        (row) => row.totalDmg > 0 || row.healDealt > 0 || row.damageTaken > 0,
      );
  }

  // Filtered and sorted players based on active tab
  function zeroCombatStats(): RawCombatStats {
    return {
      total: 0,
      effectiveTotal: 0,
      hits: 0,
      critHits: 0,
      critTotal: 0,
      luckyHits: 0,
      luckyTotal: 0,
      triggerHits: 0,
      blockHits: 0,
      luckyBlockHits: 0,
    };
  }

  let perTargetByEntityUuid = $derived.by(
    () =>
      new Map(
        rawEntities.map((row) => [
          row.entityUuid,
          {
            entityUuid: row.entityUuid,
            dmgTargets: row.dmgPerTarget ?? [],
            healTargets: row.healPerTarget ?? [],
          } satisfies EntityPerTargetData,
        ]),
      ),
  );

  let entityNameByUuid = $derived.by(() => {
    const mapping = new Map<string, string>();
    for (const entity of rawEntities) {
      if (entity.name && entity.name.trim().length > 0) {
        mapping.set(entity.entityUuid, entity.name);
      }
    }
    return mapping;
  });

  function resolveTargetDisplayName(target: PerTargetStats): string {
    const entityName = entityNameByUuid.get(target.targetEntityUuid);
    if (entityName) return entityName;

    if (target.targetMonsterId !== null) {
      return resolveMonsterName(target.targetMonsterId);
    }

    return `#${target.targetDisplayUid}`;
  }

  let pushedUuidSet = $derived.by(
    () => new Set(rawEntities.map((row) => row.entityUuid)),
  );

  function isNumericLikeName(name: string): boolean {
    return /^#?\d+$/.test(name.trim());
  }

  let overviewTargets = $derived.by(() => {
    const merged = new Map<string, OverviewTargetOption>();
    for (const row of rawEntities) {
      for (const target of row.dmgPerTarget ?? []) {
        const targetName = resolveTargetDisplayName(target);
        const existing = merged.get(target.targetEntityUuid);
        if (existing) {
          existing.totalValue += target.totalValue;
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
            totalValue: target.totalValue,
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
      .sort((a, b) => b.totalValue - a.totalValue);
  });

  let displayedPlayers = $derived.by(() => {
    if (activeTab === "damage") {
      if (overviewTargetUuid === null) {
        return [...players].sort((a, b) => b.totalDmg - a.totalDmg);
      }

      const targetEntities = rawEntities.map((entity) => {
        const perTarget = perTargetByEntityUuid
          .get(entity.entityUuid)
          ?.dmgTargets.find(
            (target) => target.targetEntityUuid === overviewTargetUuid,
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
      return buildHistoryPlayers(
        targetEntities,
        encounterDurationSeconds,
        encounter?.activeCombatDuration ?? null,
        localPlayerUuid,
      ).sort((a, b) => b.totalDmg - a.totalDmg);
    } else if (activeTab === "tanked") {
      return [...players]
        .filter((p) => p.damageTaken > 0)
        .sort((a, b) => b.damageTaken - a.damageTaken);
    } else if (activeTab === "healing") {
      return [...players]
        .filter((p) => p.healDealt > 0)
        .sort((a, b) => b.healDealt - a.healDealt);
    }
    return players;
  });

  let selectedPlayer = $derived.by(() => {
    if (!entityUuid) return null;
    return players.find((p) => p.entityUuid === entityUuid) ?? null;
  });

  let selectedEntity = $derived.by(() => {
    if (!entityUuid) return null;
    return (
      rawEntities.find((entity) => entity.entityUuid === entityUuid) ?? null
    );
  });

  let selectedSkillTargetUuid = $derived.by(() => {
    const raw = $page.url.searchParams.get("targetEntityUuid");
    return raw || null;
  });

  // Tanked drill-down: null => show the monster-aggregation middle layer;
  // "total" => combined skills; otherwise a specific monster source key.
  let selectedTakenMonsterId = $derived.by(() => {
    const raw = $page.url.searchParams.get("takenMonsterId");
    return raw || null;
  });

  // One row per attacking monster template for the selected (tanked) player,
  // reusing the tanked overview metric + columns via synthetic entities.
  let takenSourceRows = $derived.by(() => {
    if (!selectedEntity || skillType !== "tanked") return [];
    const entities = buildSourceEntities(
      selectedEntity,
      selectedEntity.takenPerSource,
    );
    return buildHistoryPlayers(
      entities,
      Math.max(1, encounterDurationSeconds),
      encounter?.activeCombatDuration ?? null,
      localPlayerUuid,
    ).sort((a, b) => b.damageTaken - a.damageTaken);
  });

  // Columns for the tanked monster-aggregation table, reusing the tanked player
  // overview's column settings (independent of the current overview tab).
  let takenSourceColumns = $derived(
    historyTankedPlayerColumns.filter((col) => {
      const defaultValue =
        DEFAULT_HISTORY_TANKED_STATS[
          col.key as keyof typeof DEFAULT_HISTORY_TANKED_STATS
        ] ?? false;
      return settings.state.history.tanked.players[col.key] ?? defaultValue;
    }),
  );

  let selectedDeathTs = $derived.by(() => {
    const raw = $page.url.searchParams.get("deathTs");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  });

  let deathEntries = $derived.by<DeathPlayerEntry[]>(() =>
    rawEntities
      .filter((entity) => (entity.deaths?.length ?? 0) > 0)
      .map((entity) => ({
        entityUuid: entity.entityUuid,
        displayUid: entity.displayUid,
        name: entity.name || `#${entity.displayUid}`,
        className: entity.className || "",
        classSpecName: entity.classSpecName || "",
        deaths: entity.deaths ?? [],
      })),
  );

  let selectedDeathRecord = $derived.by(() => {
    if (!selectedEntity || selectedDeathTs == null) return null;
    return (
      selectedEntity.deaths?.find(
        (record) => Number(record.deathTimestampMs) === selectedDeathTs,
      ) ?? null
    );
  });

  function flattenGrouping(grouping: {
    groups: RecountGroup[];
    ungrouped: SkillDisplayRow[];
  }): FlatSkillRow[] {
    const rows: FlatSkillRow[] = [];
    const topLevel = [
      ...grouping.groups.map((group): { kind: "group"; row: RecountGroup } => ({
        kind: "group",
        row: group,
      })),
      ...grouping.ungrouped.map(
        (skill): { kind: "skill"; row: SkillDisplayRow } => ({
          kind: "skill",
          row: skill,
        }),
      ),
    ].sort((a, b) => b.row.totalDmg - a.row.totalDmg);

    for (const item of topLevel) {
      if (item.kind === "skill") {
        rows.push({
          kind: "skill",
          key: `u-${item.row.skillId}`,
          depth: 0,
          row: item.row,
        });
        continue;
      }

      const group = item.row;
      rows.push({
        kind: "group",
        key: `g-${group.recountId}`,
        depth: 0,
        row: group,
      });
      if (!expandedGroups.has(group.recountId)) continue;
      for (const skill of group.skills) {
        rows.push({
          kind: "skill",
          key: `gs-${group.recountId}-${skill.skillId}`,
          depth: 1,
          row: skill,
        });
      }
    }
    return rows;
  }

  let skillGrouping = $derived.by(() => {
    if (!selectedEntity) return { groups: [], ungrouped: [] };
    const durationSecs = Math.max(1, encounterDurationSeconds);
    if (
      skillType === "dps" &&
      selectedSkillTargetUuid !== null &&
      selectedPlayer
    ) {
      const targetStats = perTargetByEntityUuid
        .get(selectedPlayer.entityUuid)
        ?.dmgTargets.find(
          (target) => target.targetEntityUuid === selectedSkillTargetUuid,
        );
      if (!targetStats) return { groups: [], ungrouped: [] };
      return groupSkillsByRecount(
        targetStats.skills,
        durationSecs,
        targetStats.totalValue,
      );
    }
    if (
      skillType === "tanked" &&
      selectedTakenMonsterId !== null &&
      selectedTakenMonsterId !== "total"
    ) {
      const source = findSourceByKey(
        selectedEntity.takenPerSource,
        selectedTakenMonsterId,
      );
      if (source) {
        return groupSkillsByRecount(
          source.skills,
          durationSecs,
          source.taken.total,
        );
      }
    }
    const skills =
      skillType === "heal"
        ? selectedEntity.healSkills
        : skillType === "tanked"
          ? selectedEntity.takenSkills
          : selectedEntity.dmgSkills;
    const parentTotal =
      skillType === "heal"
        ? selectedEntity.healing.total
        : skillType === "tanked"
          ? selectedEntity.taken.total
          : selectedEntity.damage.total;
    return groupSkillsByRecount(skills, durationSecs, parentTotal);
  });

  let flatSkillRows = $derived.by(() => flattenGrouping(skillGrouping));

  let healTargetSummary = $derived.by(() => {
    if (!selectedPlayer || skillType !== "heal")
      return [] as DisplayPerTargetStats[];
    return [
      ...(perTargetByEntityUuid.get(selectedPlayer.entityUuid)?.healTargets ??
        []),
    ]
      .map((target) => ({
        ...target,
        targetName: resolveTargetDisplayName(target),
      }))
      .filter(
        (target) =>
          target.totalValue > 0 &&
          (!isNumericLikeName(target.targetName) ||
            pushedUuidSet.has(target.targetEntityUuid)),
      )
      .sort((a, b) => b.totalValue - a.totalValue);
  });

  let healTargetTotal = $derived.by(() => {
    return healTargetSummary.reduce(
      (sum, target) => sum + target.totalValue,
      0,
    );
  });

  function rowTotalDmg(row: FlatSkillRow): number {
    return row.row.totalDmg ?? 0;
  }

  function rowDmgPct(row: FlatSkillRow): number {
    return row.row.dmgPct ?? 0;
  }

  function skillCellValue(row: FlatSkillRow, key: string): number {
    const value = (row.row as Record<string, unknown>)[key];
    return typeof value === "number" ? value : 0;
  }

  let maxDpsPlayer = $derived.by(() =>
    displayedPlayers.reduce((max, p) => Math.max(max, p.totalDmg || 0), 0),
  );
  let maxHealPlayer = $derived.by(() =>
    displayedPlayers.reduce((max, p) => Math.max(max, p.healDealt || 0), 0),
  );
  let maxTankedPlayer = $derived.by(() =>
    displayedPlayers.reduce((max, p) => Math.max(max, p.damageTaken || 0), 0),
  );
  let maxSkillTotal = $derived.by(() =>
    flatSkillRows.reduce((max, row) => Math.max(max, rowTotalDmg(row)), 0),
  );

  // Get visible columns based on settings and active tab
  let visiblePlayerColumns = $derived.by(() => {
    if (activeTab === "healing") {
      return historyHealPlayerColumns.filter(
        (col) => settings.state.history.heal.players[col.key] ?? true,
      );
    } else if (activeTab === "tanked") {
      return historyTankedPlayerColumns.filter((col) => {
        const defaultValue =
          DEFAULT_HISTORY_TANKED_STATS[
            col.key as keyof typeof DEFAULT_HISTORY_TANKED_STATS
          ] ?? false;
        return settings.state.history.tanked.players[col.key] ?? defaultValue;
      });
    }
    return historyDpsPlayerColumns.filter((col) => {
      const defaultValue =
        DEFAULT_HISTORY_STATS[col.key as keyof typeof DEFAULT_HISTORY_STATS] ??
        true;
      const setting =
        settings.state.history.dps.players[
          col.key as keyof typeof settings.state.history.dps.players
        ];
      return setting ?? defaultValue;
    });
  });

  let visibleSkillColumns = $derived.by(() => {
    if (skillType === "heal") {
      return historyHealSkillColumns.filter(
        (col) => settings.state.history.heal.skillBreakdown[col.key],
      );
    } else if (skillType === "tanked") {
      return historyTankedSkillColumns.filter((col) => {
        const defaultValue =
          DEFAULT_HISTORY_TANKED_SKILL_STATS[
            col.key as keyof typeof DEFAULT_HISTORY_TANKED_SKILL_STATS
          ] ?? false;
        return (
          settings.state.history.tanked.skillBreakdown[col.key] ?? defaultValue
        );
      });
    }
    return historyDpsSkillColumns.filter(
      (col) => settings.state.history.dps.skillBreakdown[col.key],
    );
  });

  const websiteBaseUrl = $derived.by(() => {
    const apiBase = (SETTINGS.moduleSync.state.baseUrl || "").trim() || null;
    if (!apiBase) {
      return "https://bpsr.app";
    }

    try {
      const url = new URL(apiBase);
      if (url.hostname.startsWith("api.")) {
        url.hostname = url.hostname.replace(/^api\./, "");
      }
      url.pathname = "";
      return url.toString().replace(/\/$/, "");
    } catch (err) {
      console.error("Failed to parse website URL from API base:", apiBase, err);
      return "https://bpsr.app";
    }
  });
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.history.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  let abbreviationStyle = $derived(
    SETTINGS.history.general.state.abbreviationStyle,
  );

  function toggleGroup(id: number) {
    const next = new Set(expandedGroups);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedGroups = next;
  }

  async function loadEncounter() {
    if (!encounterId) return;
    error = null;
    expandedGroups = new Set<number>();
    try {
      const [encounterRes, entitiesRes] = await Promise.all([
        commands.getEncounterById(encounterId),
        commands.getEncounterEntitiesRaw(encounterId),
      ]);

      if (encounterRes.status !== "ok") {
        error = String(encounterRes.error);
        return;
      }
      if (entitiesRes.status !== "ok") {
        error = String(entitiesRes.error);
        return;
      }
      encounter = encounterRes.data;
      localPlayerUuid = String(
        (encounterRes.data as { localPlayerId?: number | null })
          .localPlayerId ?? "",
      );
      rawEntities = normalizeHistoryEntities(entitiesRes.data);
      const durationSeconds =
        encounterRes.data.duration > 0
          ? Math.max(1, encounterRes.data.duration)
          : Math.max(
              1,
              ((encounterRes.data.endedAtMs ?? Date.now()) -
                encounterRes.data.startedAtMs) /
                1000,
            );
      players = buildHistoryPlayers(
        rawEntities,
        durationSeconds,
        encounterRes.data.activeCombatDuration ?? null,
        localPlayerUuid,
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function viewPlayerSkills(
    entityUuid: string,
    type = "dps",
    targetEntityUuid?: string | null,
  ) {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.set("entityUuid", String(entityUuid));
    sp.set("skillType", type);
    if (type === "dps" && targetEntityUuid != null) {
      sp.set("targetEntityUuid", String(targetEntityUuid));
    } else {
      sp.delete("targetEntityUuid");
    }
    // Always drop any previous deathTs/takenMonsterId when navigating to a new player/type.
    sp.delete("deathTs");
    sp.delete("takenMonsterId");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function viewTakenMonster(monsterKey: string) {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.set("skillType", "tanked");
    sp.set("takenMonsterId", monsterKey);
    sp.delete("targetEntityUuid");
    sp.delete("deathTs");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToTakenMonsters() {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("takenMonsterId");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function viewDeathReplay(entityUuid: string, deathTs: number) {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.set("entityUuid", String(entityUuid));
    sp.set("skillType", "death");
    sp.set("deathTs", String(deathTs));
    sp.delete("targetEntityUuid");
    sp.delete("takenMonsterId");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToDeathPlayerList() {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("entityUuid");
    sp.delete("deathTs");
    sp.delete("targetEntityUuid");
    sp.delete("takenMonsterId");
    sp.set("skillType", "death");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToDeathList() {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("deathTs");
    sp.delete("targetEntityUuid");
    sp.delete("takenMonsterId");
    sp.set("skillType", "death");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToEncounter() {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("entityUuid");
    sp.delete("skillType");
    sp.delete("targetEntityUuid");
    sp.delete("deathTs");
    sp.delete("takenMonsterId");
    const qs = sp.toString();
    goto(`/main/dps/history/${encounterId}${qs ? `?${qs}` : ""}`);
  }

  function backToHistory() {
    // Return to the history list while preserving list state.
    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("entityUuid");
    sp.delete("skillType");
    sp.delete("targetEntityUuid");
    sp.delete("deathTs");
    sp.delete("takenMonsterId");
    const qs = sp.toString();
    goto(`/main/dps/history${qs ? `?${qs}` : ""}`);
  }

  async function handleToggleFavorite() {
    if (!encounter) return;
    try {
      const newStatus = !encounter.isFavorite;
      // Optimistic update
      encounter.isFavorite = newStatus;
      await commands.toggleFavoriteEncounter(encounter.id, newStatus);
    } catch (e) {
      console.error("Failed to toggle favorite", e);
      // Revert on error
      if (encounter) encounter.isFavorite = !encounter.isFavorite;
    }
  }

  function openDeleteModal() {
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    showDeleteModal = false;
  }

  async function confirmDeleteEncounter() {
    if (!encounter) return;
    isDeleting = true;
    try {
      await commands.deleteEncounter(encounter.id);
      // Navigate back to history after deletion
      backToHistory();
    } catch (e) {
      console.error("Failed to delete encounter", e);
      alert(
        t("history.detail.error.deleteFailed", {
          error: String(e),
        }),
      );
      isDeleting = false;
      showDeleteModal = false;
    }
  }

  async function openEncounterOnWebsite() {
    if (!encounter || !encounter.remoteEncounterId) return;

    const url = `${websiteBaseUrl}/encounter/${encounter.remoteEncounterId}`;
    try {
      await openUrl(url);
    } catch (err) {
      console.error("Failed to open URL:", url, err);
    }
  }

  $effect(() => {
    loadEncounter();
  });

  $effect(() => {
    entityUuid;
    expandedGroups = new Set<number>();
  });

  $effect(() => {
    activeTab;
    if (activeTab !== "damage") {
      overviewTargetUuid = null;
    }
  });

  // When the URL indicates the user drilled into a death-replay view, keep the top-level
  // tab pointer in sync so the "姝讳骸鍥炴斁" tab appears active if/when they return to overview.
  $effect(() => {
    if (skillType === "death") {
      activeTab = "death";
    }
  });
</script>

<div class="">
  {#if error}
    <div class="mb-3 text-red-400">{error}</div>
  {/if}

  {#if !entityUuid && encounter}
    <!-- Encounter Overview -->
    <div class="mb-4">
      <div
        class="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-4"
      >
        <div class="flex flex-wrap items-stretch justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-start gap-3">
            <div class="h-full min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-1">
                <button
                  onclick={backToHistory}
                  class="text-muted-foreground/70 hover:text-foreground shrink-0 rounded p-0.5 transition-colors"
                  title={t("history.detail.actions.backToHistory")}
                  aria-label={t("history.detail.actions.backToHistory")}
                >
                  <svg
                    class="h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <h2 class="text-foreground text-lg leading-tight font-semibold">
                  {encounter.sceneId !== null
                    ? resolveSceneName(
                        encounter.sceneId,
                        encounter.dungeonDifficulty,
                      )
                    : t("history.detail.encounter.unknownScene")}
                </h2>
              </div>
              {#if encounter.bosses.length > 0}
                <div class="mt-1 w-full">
                  <div
                    class="text-muted-foreground flex flex-wrap items-center gap-1 text-xs"
                  >
                    {#each encounter.bosses as b, i}
                      <span
                        class={b.isDefeated
                          ? "text-destructive line-through"
                          : "text-primary"}
                        >{resolveMonsterName(b.monsterId)}{i <
                        encounter.bosses.length - 1
                          ? ","
                          : ""}</span
                      >
                    {/each}
                  </div>
                </div>
              {/if}
              <div
                class="text-muted-foreground flex flex-wrap items-center gap-1 text-xs"
              >
                <span>{formatDateTime(encounter.startedAtMs)}</span>
                <span class="text-muted-foreground">-</span>
                <span>
                  {t("history.detail.encounter.duration", {
                    duration: formatEncounterDuration(encounterDurationSeconds),
                  })}
                </span>
                <span class="text-muted-foreground">-</span>
                <span class="text-muted-foreground text-[11px]"
                  >#{encounter.id}</span
                >
              </div>
            </div>
          </div>

          <div
            class="flex h-full shrink-0 flex-col items-end justify-between gap-2 self-stretch"
          >
            <div class="flex items-center gap-1.5">
              {#if encounter.remoteEncounterId}
                <button
                  onclick={openEncounterOnWebsite}
                  class="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center justify-center rounded p-2 transition-colors"
                  title={t("history.detail.actions.openWebsiteTitle")}
                  aria-label={t("history.detail.actions.openWebsiteAria")}
                >
                  <svg
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </button>
              {/if}

              <button
                onclick={handleToggleFavorite}
                class="inline-flex items-center justify-center rounded p-2 transition-colors {encounter.isFavorite
                  ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
                title={encounter.isFavorite
                  ? t("history.detail.actions.removeFavorite")
                  : t("history.detail.actions.addFavorite")}
                aria-label={encounter.isFavorite
                  ? t("history.detail.actions.removeFavorite")
                  : t("history.detail.actions.addFavorite")}
              >
                <svg
                  class="h-4 w-4"
                  fill={encounter.isFavorite ? "currentColor" : "none"}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
              </button>

              <button
                onclick={openDeleteModal}
                class="bg-destructive/10 text-destructive hover:bg-destructive/20 inline-flex items-center justify-center rounded p-2 transition-colors"
                title={t("history.detail.actions.deleteTitle")}
                aria-label={t("history.detail.actions.deleteAria")}
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>

            <div class="border-border bg-popover flex rounded border">
              {#each tabs as tab}
                <button
                  onclick={() => (activeTab = tab.key)}
                  class="rounded px-3 py-1 text-xs transition-colors {activeTab ===
                  tab.key
                    ? 'bg-muted/40 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'}"
                >
                  {t(tab.labelKey)}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>

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
            title={t("history.detail.target.title", {
              uid: target.targetDisplayUid,
            })}
          >
            {target.targetName}
          </button>
        {/each}
      </div>
    {/if}

    {#if activeTab === "death"}
      <DeathPlayerList
        entries={deathEntries}
        {localPlayerUuid}
        onSelect={(selectedEntityUuid) =>
          viewPlayerSkills(selectedEntityUuid, "death")}
        emptyMessage={t("history.detail.death.empty")}
        variant="history"
      />
    {:else}
      <div class="border-border/60 bg-card/30 overflow-x-auto rounded border">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-popover/60">
              <th
                class="text-muted-foreground px-3 py-3 text-left text-xs font-medium tracking-wider uppercase"
                >{t("history.detail.table.player")}</th
              >
              {#each visiblePlayerColumns as col (col.key)}
                <th
                  class="text-muted-foreground px-3 py-3 text-right text-xs font-medium tracking-wider uppercase"
                  >{col.header}</th
                >
              {/each}
            </tr>
          </thead>
          <tbody class="bg-background/40">
            {#each displayedPlayers as p (p.entityUuid)}
              <tr
                class="border-border/40 hover:bg-muted/60 relative cursor-pointer border-t transition-colors"
                onclick={() =>
                  viewPlayerSkills(
                    p.entityUuid,
                    activeTab === "healing"
                      ? "heal"
                      : activeTab === "tanked"
                        ? "tanked"
                        : "dps",
                    activeTab === "damage" ? overviewTargetUuid : null,
                  )}
              >
                <td
                  class="text-muted-foreground relative z-10 px-3 py-3 text-sm"
                >
                  <div class="flex h-full items-center gap-2">
                    <img
                      class="size-5 object-contain"
                      src={getClassIcon(p.className)}
                      alt={t("history.detail.table.classIconAlt")}
                      {@attach tooltip(
                        () =>
                          p.classDisplay ||
                          t("history.detail.player.unknownClass"),
                      )}
                    />
                    <span
                      class="truncate"
                      {@attach tooltip(() =>
                        t("common.uidTooltip", { uid: p.displayUid }),
                      )}
                    >
                      {#if (p.abilityScore > 0 && (p.isLocalPlayer ? SETTINGS.history.general.state.showYourAbilityScore : SETTINGS.history.general.state.showOthersAbilityScore)) || (p.seasonStrength > 0 && (p.isLocalPlayer ? SETTINGS.history.general.state.showYourSeasonStrength : SETTINGS.history.general.state.showOthersSeasonStrength))}
                        <span
                          class="text-muted-foreground inline-flex items-center gap-0 tabular-nums"
                        >
                          {#if p.abilityScore > 0 && (p.isLocalPlayer ? SETTINGS.history.general.state.showYourAbilityScore : SETTINGS.history.general.state.showOthersAbilityScore)}
                            {#if SETTINGS.history.general.state.shortenAbilityScore}
                              <AbbreviatedNumber num={p.abilityScore} />
                            {:else}
                              <span>{p.abilityScore}</span>
                            {/if}
                          {/if}
                          {#if p.seasonStrength > 0 && (p.isLocalPlayer ? SETTINGS.history.general.state.showYourSeasonStrength : SETTINGS.history.general.state.showOthersSeasonStrength)}
                            <span>({p.seasonStrength})</span>
                          {/if}
                        </span>
                      {/if}
                      {getDisplayName({
                        player: {
                          entityUuid: p.entityUuid,
                          displayUid: p.displayUid,
                          name: p.name,
                          className: p.className,
                          classSpecName: p.classSpecName,
                        },
                        showYourNameSetting:
                          settings.state.history.general.showYourName,
                        showOthersNameSetting:
                          settings.state.history.general.showOthersName,
                        isLocalPlayer: p.isLocalPlayer,
                      })}
                      {#if p.isLocalPlayer}
                        <span class="ml-1 text-[oklch(0.65_0.1_250)]"
                          >{t("history.detail.player.you")}</span
                        >
                      {/if}
                    </span>
                  </div>
                </td>
                {#each visiblePlayerColumns as col (col.key)}
                  <td
                    class="text-muted-foreground relative z-10 px-3 py-3 text-right text-sm"
                  >
                    {#if (activeTab === "damage" && (col.key === "totalDmg" || col.key === "bossDmg" || col.key === "bossDps" || col.key === "dps" || col.key === "tdps") && SETTINGS.history.general.state.shortenDps) || (activeTab === "healing" && (col.key === "healDealt" || col.key === "hps" || col.key === "effectiveHeal" || col.key === "ehps") && SETTINGS.history.general.state.shortenDps) || (activeTab === "tanked" && (col.key === "damageTaken" || col.key === "tankedPS") && SETTINGS.history.general.state.shortenTps)}
                      {#if activeTab === "tanked" ? SETTINGS.history.general.state.shortenTps : SETTINGS.history.general.state.shortenDps}
                        <AbbreviatedNumber
                          num={p[col.key] ?? 0}
                          decimalPlaces={abbreviatedDecimalPlaces}
                          {abbreviationStyle}
                        />
                      {:else}
                        {col.format(p[col.key] ?? 0)}
                      {/if}
                    {:else}
                      {col.format(p[col.key] ?? 0)}
                    {/if}
                  </td>
                {/each}
                <TableRowGlow
                  className={p.className}
                  percentage={activeTab === "healing"
                    ? SETTINGS.history.general.state.relativeToTopHealPlayer &&
                      maxHealPlayer > 0
                      ? (p.healDealt / maxHealPlayer) * 100
                      : p.healPct
                    : activeTab === "tanked"
                      ? SETTINGS.history.general.state
                          .relativeToTopTankedPlayer && maxTankedPlayer > 0
                        ? (p.damageTaken / maxTankedPlayer) * 100
                        : p.tankedPct
                      : SETTINGS.history.general.state.relativeToTopDPSPlayer &&
                          maxDpsPlayer > 0
                        ? (p.totalDmg / maxDpsPlayer) * 100
                        : p.dmgPct}
                />
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else if entityUuid && selectedPlayer && selectedEntity && skillType === "death"}
    <!-- Death Replay: list or detail -->
    <div class="mb-4">
      {#if selectedDeathTs == null}
        <DeathList
          playerName={getDisplayName({
            player: {
              entityUuid: selectedPlayer.entityUuid,
              displayUid: selectedPlayer.displayUid,
              name: selectedPlayer.name,
              className: selectedPlayer.className,
              classSpecName: selectedPlayer.classSpecName,
            },
            showYourNameSetting: settings.state.history.general.showYourName,
            showOthersNameSetting:
              settings.state.history.general.showOthersName,
            isLocalPlayer: selectedPlayer.isLocalPlayer,
          })}
          className={selectedPlayer.className}
          classSpecName={selectedPlayer.classSpecName}
          deaths={selectedEntity.deaths ?? []}
          fightStartTimestampMs={encounter?.startedAtMs ?? null}
          onSelect={(ts) => viewDeathReplay(selectedPlayer.entityUuid, ts)}
          onBack={backToDeathPlayerList}
          variant="history"
        />
      {:else if selectedDeathRecord}
        <DeathReplayDetail
          playerName={getDisplayName({
            player: {
              entityUuid: selectedPlayer.entityUuid,
              displayUid: selectedPlayer.displayUid,
              name: selectedPlayer.name,
              className: selectedPlayer.className,
              classSpecName: selectedPlayer.classSpecName,
            },
            showYourNameSetting: settings.state.history.general.showYourName,
            showOthersNameSetting:
              settings.state.history.general.showOthersName,
            isLocalPlayer: selectedPlayer.isLocalPlayer,
          })}
          className={selectedPlayer.className}
          classSpecName={selectedPlayer.classSpecName}
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
          <svg
            class="h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div>
          <h2 class="text-foreground text-xl font-semibold">
            {t("live.tanked.monsters.title")}
          </h2>
          <div class="text-sm text-neutral-400">
            {t("history.detail.player.label")}
            {getDisplayName({
              player: {
                entityUuid: selectedPlayer.entityUuid,
                displayUid: selectedPlayer.displayUid,
                name: selectedPlayer.name,
                className: selectedPlayer.className,
                classSpecName: selectedPlayer.classSpecName,
              },
              showYourNameSetting: settings.state.history.general.showYourName,
              showOthersNameSetting:
                settings.state.history.general.showOthersName,
              isLocalPlayer: selectedPlayer.isLocalPlayer,
            })}
            <span class="text-neutral-500">#{selectedPlayer.displayUid}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="border-border/60 bg-card/30 overflow-x-auto rounded border">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-popover/60">
            <th
              class="text-muted-foreground px-3 py-3 text-left text-xs font-medium tracking-wider uppercase"
              >{t("live.tanked.monsters.title")}</th
            >
            {#each takenSourceColumns as col (col.key)}
              <th
                class="text-muted-foreground px-3 py-3 text-right text-xs font-medium tracking-wider uppercase"
                >{col.header}</th
              >
            {/each}
          </tr>
        </thead>
        <tbody class="bg-background/40">
          <tr
            class="border-border/40 hover:bg-muted/60 relative cursor-pointer border-t transition-colors"
            onclick={() => viewTakenMonster("total")}
          >
            <td class="text-muted-foreground relative z-10 px-3 py-3 text-sm">
              {t("history.detail.target.total")}
            </td>
            {#each takenSourceColumns as col (col.key)}
              <td
                class="text-muted-foreground relative z-10 px-3 py-3 text-right text-sm"
              >
                {#if (col.key === "damageTaken" || col.key === "tankedPS") && SETTINGS.history.general.state.shortenTps}
                  <AbbreviatedNumber
                    num={selectedPlayer[col.key] ?? 0}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    {abbreviationStyle}
                  />
                {:else}
                  {col.format(selectedPlayer[col.key] ?? 0)}
                {/if}
              </td>
            {/each}
            <TableRowGlow
              className={selectedPlayer.className}
              percentage={100}
            />
          </tr>
          {#each takenSourceRows as row (row.entityUuid)}
            <tr
              class="border-border/40 hover:bg-muted/60 relative cursor-pointer border-t transition-colors"
              onclick={() => viewTakenMonster(row.entityUuid)}
            >
              <td class="text-muted-foreground relative z-10 px-3 py-3 text-sm">
                <span class="truncate">{row.name}</span>
              </td>
              {#each takenSourceColumns as col (col.key)}
                <td
                  class="text-muted-foreground relative z-10 px-3 py-3 text-right text-sm"
                >
                  {#if (col.key === "damageTaken" || col.key === "tankedPS") && SETTINGS.history.general.state.shortenTps}
                    <AbbreviatedNumber
                      num={row[col.key] ?? 0}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                    />
                  {:else}
                    {col.format(row[col.key] ?? 0)}
                  {/if}
                </td>
              {/each}
              <TableRowGlow
                className={selectedPlayer.className}
                percentage={SETTINGS.history.general.state
                  .relativeToTopTankedPlayer
                  ? (row.damageTaken / (takenSourceRows[0]?.damageTaken || 1)) *
                    100
                  : row.tankedPct}
              />
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if entityUuid && selectedPlayer && selectedEntity}
    <!-- Player Skills View -->
    <div class="mb-4">
      <div class="mb-2 flex items-center gap-3">
        <button
          onclick={skillType === "tanked"
            ? backToTakenMonsters
            : backToEncounter}
          class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          aria-label={t("history.detail.actions.backToOverview")}
        >
          <svg
            class="h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div>
          <h2 class="text-foreground text-xl font-semibold">
            {t("history.detail.skills.title")}
          </h2>
          <div class="text-sm text-neutral-400">
            {t("history.detail.player.label")}
            {getDisplayName({
              player: {
                entityUuid: selectedPlayer.entityUuid,
                displayUid: selectedPlayer.displayUid,
                name: selectedPlayer.name,
                className: selectedPlayer.className,
                classSpecName: selectedPlayer.classSpecName,
              },
              showYourNameSetting: settings.state.history.general.showYourName,
              showOthersNameSetting:
                settings.state.history.general.showOthersName,
              isLocalPlayer: selectedPlayer.isLocalPlayer,
            })}
            <span class="text-neutral-500">#{selectedPlayer.displayUid}</span>
          </div>
        </div>
      </div>
    </div>

    {#if skillType === "heal"}
      <div class="border-border/60 bg-card/30 mb-3 rounded border p-3">
        <div
          class="text-muted-foreground mb-2 text-xs tracking-wider uppercase"
        >
          {t("history.detail.healTargets.title")}
        </div>
        {#if healTargetSummary.length === 0}
          <div class="text-muted-foreground text-sm">
            {t("history.detail.healTargets.empty")}
          </div>
        {:else}
          <div class="space-y-1.5">
            {#each healTargetSummary as target (target.targetEntityUuid)}
              {@const pct =
                healTargetTotal > 0
                  ? (target.totalValue / healTargetTotal) * 100
                  : 0}
              <div class="text-sm">
                <div
                  class="text-muted-foreground flex items-center justify-between gap-2"
                >
                  <span class="truncate">{target.targetName}</span>
                  <span class="shrink-0">
                    {formatNumber(target.totalValue)} ({formatNumber(pct, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}%)
                  </span>
                </div>
                <div class="bg-muted/40 mt-1 h-1.5 overflow-hidden rounded">
                  <div
                    class="bg-primary/70 h-full"
                    style="width: {pct}%;"
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="border-border/60 bg-card/30 overflow-x-auto rounded border">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-popover/60">
            <th
              class="text-muted-foreground px-3 py-3 text-left text-xs font-medium tracking-wider uppercase"
              >{t("history.detail.table.skill")}</th
            >
            {#each visibleSkillColumns as col (col.key)}
              <th
                class="text-muted-foreground px-3 py-3 text-right text-xs font-medium tracking-wider uppercase"
                >{col.header}</th
              >
            {/each}
          </tr>
        </thead>
        <tbody class="bg-background/40">
          {#each flatSkillRows as item (item.key)}
            <tr
              class="border-border/40 hover:bg-muted/60 relative border-t transition-colors"
            >
              <td class="text-muted-foreground relative z-10 px-3 py-3 text-sm">
                {#if item.kind === "group"}
                  <button
                    class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                    onclick={() => toggleGroup(item.row.recountId)}
                  >
                    <svg
                      class="text-muted-foreground/70 size-3 shrink-0 transition-transform duration-150 {expandedGroups.has(
                        item.row.recountId,
                      )
                        ? 'rotate-90'
                        : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span>{item.row.recountName}</span>
                  </button>
                {:else}
                  <div
                    class="inline-flex items-center gap-1.5"
                    style="padding-left: {item.depth * 16}px;"
                  >
                    {#if item.depth > 0}
                      <span class="flex w-3 shrink-0 justify-center">
                        <span class="bg-muted-foreground/35 size-1 rounded-full"
                        ></span>
                      </span>
                    {:else}
                      <span class="w-3 shrink-0"></span>
                    {/if}
                    <span class="truncate">{item.row.name}</span>
                    {#if item.row.showSkillId}
                      <span
                        class="text-muted-foreground/50 shrink-0 text-[10px]"
                      >
                        #{item.row.skillId}
                      </span>
                    {/if}
                  </div>
                {/if}
              </td>
              {#each visibleSkillColumns as col (col.key)}
                <td
                  class="text-muted-foreground relative z-10 px-3 py-3 text-right text-sm"
                >
                  {#if (col.key === "totalDmg" || col.key === "dps" || col.key === "effectiveTotal" || col.key === "effectiveDps") && (skillType === "tanked" ? SETTINGS.history.general.state.shortenTps : SETTINGS.history.general.state.shortenDps)}
                    <AbbreviatedNumber
                      num={skillCellValue(item, col.key)}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                    />
                  {:else if col.key === "property" || col.key === "damageMode"}
                    {#if item.kind === "group"}
                      <span class="text-muted-foreground/50">-</span>
                    {:else}
                      {col.format(
                        (item.row as SkillDisplayRow)[col.key] as number,
                      )}
                    {/if}
                  {:else}
                    {col.format(skillCellValue(item, col.key))}
                  {/if}
                </td>
              {/each}
              <TableRowGlow
                className={selectedPlayer.className}
                percentage={skillType === "heal"
                  ? SETTINGS.history.general.state.relativeToTopHealSkill &&
                    maxSkillTotal > 0
                    ? (rowTotalDmg(item) / maxSkillTotal) * 100
                    : rowDmgPct(item)
                  : skillType === "tanked"
                    ? SETTINGS.history.general.state.relativeToTopTankedSkill &&
                      maxSkillTotal > 0
                      ? (rowTotalDmg(item) / maxSkillTotal) * 100
                      : rowDmgPct(item)
                    : SETTINGS.history.general.state.relativeToTopDPSSkill &&
                        maxSkillTotal > 0
                      ? (rowTotalDmg(item) / maxSkillTotal) * 100
                      : rowDmgPct(item)}
              />
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="text-neutral-400">{t("history.detail.loading")}</div>
  {/if}
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-modal-title"
  >
    <!-- Backdrop -->
    <button
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={closeDeleteModal}
      aria-label={t("history.detail.deleteDialog.closeAria")}
    ></button>

    <!-- Modal Content -->
    <div
      class="bg-card border-border relative mx-4 w-full max-w-md rounded-lg border p-6 shadow-xl"
    >
      <div class="flex items-start gap-4">
        <!-- Warning Icon -->
        <div
          class="bg-destructive/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        >
          <svg
            class="text-destructive h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <div class="flex-1">
          <h3
            id="delete-modal-title"
            class="text-foreground text-lg font-semibold"
          >
            {t("history.detail.deleteDialog.title")}
          </h3>
          <p class="text-muted-foreground mt-2 text-sm">
            {t("history.detail.deleteDialog.message")}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 flex justify-end gap-3">
        <button
          onclick={closeDeleteModal}
          disabled={isDeleting}
          class="border-border bg-popover text-foreground hover:bg-muted/40 rounded-md border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("history.detail.deleteDialog.cancel")}
        </button>
        <button
          onclick={confirmDeleteEncounter}
          disabled={isDeleting}
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if isDeleting}
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {t("history.detail.deleteDialog.deleting")}
          {:else}
            {t("history.detail.deleteDialog.confirm")}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
