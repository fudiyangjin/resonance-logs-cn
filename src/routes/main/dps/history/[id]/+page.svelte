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
  import { settings, SETTINGS, DEFAULT_HISTORY_STATS } from "$lib/settings-store";
  import getDisplayName from "$lib/name-display";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { computePlayerRowsFromEntities } from "$lib/live-derived";
  import {
    groupSkillsByRecount,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import { formatClassSpecLabel } from "$lib/class-labels";

  type HistorySkillType = "dps" | "heal" | "tanked";

  type HistoryPlayerRow = {
    uid: number;
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
    hits: number;
    hitsPerMinute: number;
    damageTaken: number;
    tankedPS: number;
    tankedPct: number;
    critTakenRate: number;
    hitsTaken: number;
    healDealt: number;
    hps: number;
    healPct: number;
    critHealRate: number;
    hitsHeal: number;
  };

  type FlatSkillRow =
    | { kind: "group"; key: string; depth: 0; row: RecountGroup }
    | { kind: "skill"; key: string; depth: 0 | 1; row: SkillDisplayRow };

  type PerTargetStats = {
    targetUid: number;
    targetName: string;
    totalValue: number;
    damage: RawCombatStats;
    skills: Partial<Record<number, RawSkillStats>>;
  };

  type EntityPerTargetData = {
    uid: number;
    dmgTargets: PerTargetStats[];
    healTargets: PerTargetStats[];
  };

  type OverviewTargetOption = {
    targetUid: number;
    targetName: string;
    totalValue: number;
  };

  // Get encounter ID from URL params
  let encounterId = $derived($page.params.id ? parseInt($page.params.id) : null);
  let charId = $derived($page.url.searchParams.get("charId"));
  let skillType = $derived(($page.url.searchParams.get("skillType") ?? "dps") as HistorySkillType);

  let encounter = $state<EncounterSummaryDto | null>(null);
  let localPlayerUid = $state<number | null>(null);
  let rawEntities = $state<HistoryEntityData[]>([]);
  let players = $state<HistoryPlayerRow[]>([]);
  let error = $state<string | null>(null);
  let isDeleting = $state(false);
  let showDeleteModal = $state(false);
  let expandedGroups = $state<Set<number>>(new Set<number>());
  let overviewTargetUid = $state<number | null>(null);

  // Tab state for encounter view
  let activeTab = $state<"damage" | "tanked" | "healing">("damage");
  const tabs: { key: "damage" | "tanked" | "healing"; label: string }[] = [
    { key: "damage", label: "伤害" },
    { key: "tanked", label: "承伤" },
    { key: "healing", label: "治疗" },
  ];

  let encounterDurationSeconds = $derived.by(() => {
    if (!encounter) return 1;
    if (encounter.duration > 0) return Math.max(1, encounter.duration);
    return Math.max(
      1,
      ((encounter.endedAtMs ?? Date.now()) - encounter.startedAtMs) / 1000,
    );
  });

  let encounterDurationMinutes = $derived.by(() => Math.floor(encounterDurationSeconds / 60));

  function buildHistoryPlayers(
    entities: HistoryEntityData[],
    durationSeconds: number,
    localUid: number | null,
  ): HistoryPlayerRow[] {
    const elapsedMs = Math.max(1, Math.floor(durationSeconds * 1000));
    const source = {
      entities,
      elapsedMs,
      totalDmg: entities.reduce((sum, entity) => sum + (entity.damage?.total ?? 0), 0),
      totalHeal: entities.reduce((sum, entity) => sum + (entity.healing?.total ?? 0), 0),
      totalDmgBossOnly: entities.reduce((sum, entity) => sum + (entity.damageBossOnly?.total ?? 0), 0),
    };

    const dpsRows = computePlayerRowsFromEntities(source, "dps");
    const healRows = computePlayerRowsFromEntities(source, "heal");
    const tankRows = computePlayerRowsFromEntities(source, "tanked");
    const dpsByUid = new Map(dpsRows.map((row) => [row.uid, row]));
    const healByUid = new Map(healRows.map((row) => [row.uid, row]));
    const tankByUid = new Map(tankRows.map((row) => [row.uid, row]));

    return entities
      .map((entity) => {
        const dps = dpsByUid.get(entity.uid);
        const heal = healByUid.get(entity.uid);
        const tank = tankByUid.get(entity.uid);
        const className = entity.className || "";
        const classSpecName = entity.classSpecName || "";
        return {
          uid: entity.uid,
          name: entity.name || `#${entity.uid}`,
          isLocalPlayer: localUid !== null && entity.uid === localUid,
          className,
          classSpecName,
          classDisplay: formatClassSpecLabel(className, classSpecName) || "未知职业",
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
          hitsTaken: tank?.hits ?? 0,
          healDealt: heal?.totalDmg ?? 0,
          hps: heal?.dps ?? 0,
          healPct: heal?.dmgPct ?? 0,
          critHealRate: heal?.critRate ?? 0,
          hitsHeal: heal?.hits ?? 0,
        };
      })
      .filter((row) => row.totalDmg > 0 || row.healDealt > 0 || row.damageTaken > 0);
  }

  // Filtered and sorted players based on active tab
  function zeroCombatStats(): RawCombatStats {
    return {
      total: 0,
      hits: 0,
      critHits: 0,
      critTotal: 0,
      luckyHits: 0,
      luckyTotal: 0,
    };
  }

  let perTargetByUid = $derived.by(() =>
    new Map(
      rawEntities.map((row) => [
        row.uid,
        {
          uid: row.uid,
          dmgTargets: row.dmgPerTarget ?? [],
          healTargets: row.healPerTarget ?? [],
        } satisfies EntityPerTargetData,
      ]),
    ),
  );

  let entityNameByUid = $derived.by(() => {
    const mapping = new Map<number, string>();
    for (const entity of rawEntities) {
      if (entity.name && entity.name.trim().length > 0) {
        mapping.set(entity.uid, entity.name);
      }
    }
    return mapping;
  });

  let pushedUidSet = $derived.by(() => new Set(rawEntities.map((row) => row.uid)));

  function isNumericLikeName(name: string): boolean {
    return /^#?\d+$/.test(name.trim());
  }

  let overviewTargets = $derived.by(() => {
    const merged = new Map<number, OverviewTargetOption>();
    for (const row of rawEntities) {
      for (const target of row.dmgPerTarget ?? []) {
        const existing = merged.get(target.targetUid);
        if (existing) {
          existing.totalValue += target.totalValue;
          if (existing.targetName.startsWith("#") && target.targetName) {
            existing.targetName = target.targetName;
          }
        } else {
          merged.set(target.targetUid, {
            targetUid: target.targetUid,
            targetName: target.targetName,
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
      if (overviewTargetUid === null) {
        return [...players].sort((a, b) => b.totalDmg - a.totalDmg);
      }

      const targetEntities = rawEntities.map((entity) => {
        const perTarget = perTargetByUid
          .get(entity.uid)
          ?.dmgTargets.find((target) => target.targetUid === overviewTargetUid);
        const damage = perTarget?.damage ?? zeroCombatStats();
        return {
          ...entity,
          damage,
          damageBossOnly: damage,
          healing: zeroCombatStats(),
          taken: zeroCombatStats(),
        };
      });
      return buildHistoryPlayers(targetEntities, encounterDurationSeconds, localPlayerUid)
        .sort((a, b) => b.totalDmg - a.totalDmg);
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
    if (!charId) return null;
    const playerUid = Number(charId);
    if (!Number.isFinite(playerUid)) return null;
    return players.find((p) => p.uid === playerUid) ?? null;
  });

  let selectedEntity = $derived.by(() => {
    if (!charId) return null;
    const playerUid = Number(charId);
    if (!Number.isFinite(playerUid)) return null;
    return rawEntities.find((entity) => entity.uid === playerUid) ?? null;
  });

  let selectedSkillTargetUid = $derived.by(() => {
    const raw = $page.url.searchParams.get("targetUid");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  });

  function flattenGrouping(grouping: {
    groups: RecountGroup[];
    ungrouped: SkillDisplayRow[];
  }): FlatSkillRow[] {
    const rows: FlatSkillRow[] = [];
    for (const group of grouping.groups) {
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
    for (const skill of grouping.ungrouped) {
      rows.push({
        kind: "skill",
        key: `u-${skill.skillId}`,
        depth: 0,
        row: skill,
      });
    }
    return rows;
  }

  let skillGrouping = $derived.by(() => {
    if (!selectedEntity) return { groups: [], ungrouped: [] };
    const durationSecs = Math.max(1, encounterDurationSeconds);
    if (skillType === "dps" && selectedSkillTargetUid !== null && selectedPlayer) {
      const targetStats = perTargetByUid
        .get(selectedPlayer.uid)
        ?.dmgTargets.find((target) => target.targetUid === selectedSkillTargetUid);
      if (!targetStats) return { groups: [], ungrouped: [] };
      return groupSkillsByRecount(
        targetStats.skills,
        durationSecs,
        targetStats.totalValue,
      );
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
    if (!selectedPlayer || skillType !== "heal") return [] as PerTargetStats[];
    return [...(perTargetByUid.get(selectedPlayer.uid)?.healTargets ?? [])]
      .map((target) => {
        const resolvedName = entityNameByUid.get(target.targetUid);
        return resolvedName
          ? { ...target, targetName: resolvedName }
          : target;
      })
      .filter(
        (target) =>
          target.totalValue > 0 &&
          (!isNumericLikeName(target.targetName) || pushedUidSet.has(target.targetUid)),
      )
      .sort((a, b) => b.totalValue - a.totalValue);
  });

  let healTargetTotal = $derived.by(() => {
    return healTargetSummary.reduce((sum, target) => sum + target.totalValue, 0);
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

  let maxDpsPlayer = $derived.by(() => displayedPlayers.reduce((max, p) => Math.max(max, p.totalDmg || 0), 0));
  let maxHealPlayer = $derived.by(() => displayedPlayers.reduce((max, p) => Math.max(max, p.healDealt || 0), 0));
  let maxTankedPlayer = $derived.by(() => displayedPlayers.reduce((max, p) => Math.max(max, p.damageTaken || 0), 0));
  let maxSkillTotal = $derived.by(() => flatSkillRows.reduce((max, row) => Math.max(max, rowTotalDmg(row)), 0));

  // Get visible columns based on settings and active tab
  let visiblePlayerColumns = $derived.by(() => {
    if (activeTab === "healing") {
      return historyHealPlayerColumns.filter((col) => settings.state.history.heal.players[col.key] ?? true);
    } else if (activeTab === "tanked") {
      return historyTankedPlayerColumns.filter((col) => settings.state.history.tanked.players[col.key] ?? true);
    }
    return historyDpsPlayerColumns.filter((col) => {
      const defaultValue = DEFAULT_HISTORY_STATS[col.key as keyof typeof DEFAULT_HISTORY_STATS] ?? true;
      const setting = settings.state.history.dps.players[col.key as keyof typeof settings.state.history.dps.players];
      return setting ?? defaultValue;
    });
  });

  let visibleSkillColumns = $derived.by(() => {
    if (skillType === "heal") {
      return historyHealSkillColumns.filter((col) => settings.state.history.heal.skillBreakdown[col.key]);
    } else if (skillType === "tanked") {
      return historyTankedSkillColumns.filter((col) => settings.state.history.tanked.skillBreakdown[col.key]);
    }
    return historyDpsSkillColumns.filter((col) => settings.state.history.dps.skillBreakdown[col.key]);
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
      localPlayerUid =
        (encounterRes.data as { localPlayerId?: number | null }).localPlayerId ??
        null;
      rawEntities = entitiesRes.data;
      const durationSeconds =
        encounterRes.data.duration > 0
          ? Math.max(1, encounterRes.data.duration)
          : Math.max(
              1,
              ((encounterRes.data.endedAtMs ?? Date.now()) -
                encounterRes.data.startedAtMs) /
                1000,
            );
      players = buildHistoryPlayers(rawEntities, durationSeconds, localPlayerUid);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function viewPlayerSkills(playerUid: number, type = "dps", targetUid?: number | null) {

    const sp = new URLSearchParams($page.url.searchParams);
    sp.set("charId", String(playerUid));
    sp.set("skillType", type);
    if (type === "dps" && targetUid != null) {
      sp.set("targetUid", String(targetUid));
    } else {
      sp.delete("targetUid");
    }
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToEncounter() {

    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("charId");
    sp.delete("skillType");
    sp.delete("targetUid");
    const qs = sp.toString();
    goto(`/main/dps/history/${encounterId}${qs ? `?${qs}` : ""}`);
  }

  function backToHistory() {

    // Return to the history list while preserving pagination state.
    const sp = new URLSearchParams();
    const listPage = $page.url.searchParams.get("page");
    const listPageSize = $page.url.searchParams.get("pageSize");
    if (listPage !== null) sp.set("page", listPage);
    if (listPageSize !== null) sp.set("pageSize", listPageSize);
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
      alert("删除战斗记录失败：" + e);
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
    charId;
    expandedGroups = new Set<number>();
  });

  $effect(() => {
    activeTab;
    if (activeTab !== "damage") {
      overviewTargetUid = null;
    }
  });

</script>

<div class="">
  {#if error}
    <div class="text-red-400 mb-3">{error}</div>
  {/if}

  {#if !charId && encounter}
    <!-- Encounter Overview -->
    <div class="mb-4">
      <div class="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-4">
        <div class="flex flex-wrap items-stretch justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <div class="space-y-1 min-w-0 flex-1 h-full">
              <div class="flex flex-wrap items-center gap-1">
                <button
                  onclick={backToHistory}
                  class="p-0.5 text-muted-foreground/70 hover:text-foreground transition-colors rounded shrink-0"
                  title="返回历史"
                  aria-label="返回历史"
                >
                  <svg
                    class="w-4 h-4"
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
                <h2 class="text-lg font-semibold text-foreground leading-tight">
                  {encounter.sceneName ?? "未知场景"}
                </h2>
              </div>
              {#if encounter.bosses.length > 0}
                <div class="w-full mt-1">
                  <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {#each encounter.bosses as b, i}
                      <span
                        class={b.isDefeated
                          ? "text-destructive line-through"
                          : "text-primary"}
                        >{b.monsterName}{i < encounter.bosses.length - 1 ? "," : ""}</span
                      >
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <span>{new Date(encounter.startedAtMs).toLocaleString()}</span>
                <span class="text-muted-foreground">•</span>
                <span>时长：{encounterDurationMinutes} 分钟</span>
                <span class="text-muted-foreground">•</span>
                <span class="text-[11px] text-muted-foreground">#{encounter.id}</span>
              </div>
            </div>
          </div>

          <div class="flex flex-col items-end gap-2 shrink-0 self-stretch justify-between h-full">
            <div class="flex items-center gap-1.5">
              {#if encounter.remoteEncounterId}
                <button
                  onclick={openEncounterOnWebsite}
                  class="inline-flex items-center justify-center rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors p-2"
                  title="在 resonance-logs.com 打开该战斗记录"
                  aria-label="在网站打开"
                >
                  <svg
                    class="w-4 h-4"
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
                class="inline-flex items-center justify-center rounded transition-colors p-2 {encounter.isFavorite
                  ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
                title={encounter.isFavorite
                  ? "取消收藏"
                  : "加入收藏"}
                aria-label={encounter.isFavorite
                  ? "取消收藏"
                  : "加入收藏"}
              >
                <svg
                  class="w-4 h-4"
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
                class="inline-flex items-center justify-center rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors p-2"
                title="删除该战斗记录"
                aria-label="删除战斗记录"
              >
                <svg
                  class="w-4 h-4"
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

            <div class="flex rounded border border-border bg-popover">
              {#each tabs as tab}
                <button
                  onclick={() => (activeTab = tab.key)}
                  class="px-3 py-1 text-xs rounded transition-colors {activeTab === tab.key
                    ? 'bg-muted/40 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'}"
                >
                  {tab.label}
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
          class="px-3 py-1 text-xs rounded border border-border transition-colors {overviewTargetUid === null
            ? 'bg-muted/40 text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
          onclick={() => (overviewTargetUid = null)}
        >
          总计
        </button>
        {#each overviewTargets as target (target.targetUid)}
          <button
            class="px-3 py-1 text-xs rounded border border-border transition-colors {overviewTargetUid === target.targetUid
              ? 'bg-muted/40 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
            onclick={() => (overviewTargetUid = target.targetUid)}
            title={`目标 #${target.targetUid}`}
          >
            {target.targetName}
          </button>
        {/each}
      </div>
    {/if}

    <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-popover/60">
              <th
                class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >玩家</th
              >
              {#each visiblePlayerColumns as col (col.key)}
                <th
                  class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >{col.header}</th
                >
              {/each}
            </tr>
          </thead>
          <tbody class="bg-background/40">
            {#each displayedPlayers as p (p.uid)}
              <tr
                class="relative border-t border-border/40 hover:bg-muted/60 transition-colors cursor-pointer"
                onclick={() =>
                  viewPlayerSkills(
                    p.uid,
                    activeTab === "healing"
                      ? "heal"
                      : activeTab === "tanked"
                        ? "tanked"
                        : "dps",
                    activeTab === "damage" ? overviewTargetUid : null,
                  )}
              >
                <td
                  class="px-3 py-3 text-sm text-muted-foreground relative z-10"
                >
                  <div class="flex items-center gap-2 h-full">
                    <img
                      class="size-5 object-contain"
                      src={getClassIcon(p.className)}
                      alt="职业图标"
                      {@attach tooltip(() => p.classDisplay || "未知职业")}
                    />
                    <span
                      class="truncate"
                      {@attach tooltip(() => `UID: #${p.uid}`)}
                    >
                      {#if (p.abilityScore > 0 && (p.isLocalPlayer
                        ? SETTINGS.history.general.state.showYourAbilityScore
                        : SETTINGS.history.general.state.showOthersAbilityScore)) || (p.seasonStrength > 0 && (p.isLocalPlayer
                        ? SETTINGS.history.general.state.showYourSeasonStrength
                        : SETTINGS.history.general.state.showOthersSeasonStrength))}
                        <span class="inline-flex items-center gap-0 text-muted-foreground tabular-nums">
                          {#if p.abilityScore > 0 && (p.isLocalPlayer
                            ? SETTINGS.history.general.state.showYourAbilityScore
                            : SETTINGS.history.general.state.showOthersAbilityScore)}
                            {#if SETTINGS.history.general.state.shortenAbilityScore}
                              <AbbreviatedNumber num={p.abilityScore} />
                            {:else}
                              <span>{p.abilityScore}</span>
                            {/if}
                          {/if}
                          {#if p.seasonStrength > 0 && (p.isLocalPlayer
                            ? SETTINGS.history.general.state.showYourSeasonStrength
                            : SETTINGS.history.general.state.showOthersSeasonStrength)}
                            <span>({p.seasonStrength})</span>
                          {/if}
                        </span>
                      {/if}
                      {getDisplayName({
                        player: {
                          uid: p.uid,
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
                          >（你）</span
                        >
                      {/if}
                    </span>
                  </div>
                </td>
                {#each visiblePlayerColumns as col (col.key)}
                  <td
                    class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10"
                  >
                    {#if (activeTab === "damage" && (col.key === "totalDmg" || col.key === "bossDmg" || col.key === "bossDps" || col.key === "dps" || col.key === "tdps") && SETTINGS.history.general.state.shortenDps) || (activeTab === "healing" && (col.key === "healDealt" || col.key === "hps") && SETTINGS.history.general.state.shortenDps) || (activeTab === "tanked" && (col.key === "damageTaken" || col.key === "tankedPS") && SETTINGS.history.general.state.shortenTps)}
                      {#if activeTab === "tanked" ? SETTINGS.history.general.state.shortenTps : SETTINGS.history.general.state.shortenDps}
                        <AbbreviatedNumber num={p[col.key] ?? 0} />
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
  {:else if charId && selectedPlayer && selectedEntity}
    <!-- Player Skills View -->
    <div class="mb-4">
      <div class="flex items-center gap-3 mb-2">
        <button
          onclick={backToEncounter}
          class="p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors rounded hover:bg-neutral-800"
          aria-label="返回战斗概览"
        >
          <svg
            class="w-5 h-5"
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
          <h2 class="text-xl font-semibold text-foreground">技能明细</h2>
          <div class="text-sm text-neutral-400">
            Player: {getDisplayName({
              player: {
                uid: selectedPlayer.uid,
                name: selectedPlayer.name,
                className: selectedPlayer.className,
                classSpecName: selectedPlayer.classSpecName,
              },
              showYourNameSetting: settings.state.history.general.showYourName,
              showOthersNameSetting:
                settings.state.history.general.showOthersName,
              isLocalPlayer: selectedPlayer.isLocalPlayer,
            })} <span class="text-neutral-500">#{selectedPlayer.uid}</span>
          </div>
        </div>
      </div>
    </div>

    {#if skillType === "heal"}
      <div class="mb-3 rounded border border-border/60 bg-card/30 p-3">
        <div class="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          治疗目标分布
        </div>
        {#if healTargetSummary.length === 0}
          <div class="text-sm text-muted-foreground">暂无目标治疗数据</div>
        {:else}
          <div class="space-y-1.5">
            {#each healTargetSummary as target (target.targetUid)}
              {@const pct = healTargetTotal > 0 ? (target.totalValue / healTargetTotal) * 100 : 0}
              <div class="text-sm">
                <div class="flex items-center justify-between gap-2 text-muted-foreground">
                  <span class="truncate">{target.targetName}</span>
                  <span class="shrink-0">
                    {target.totalValue.toLocaleString()} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div class="mt-1 h-1.5 rounded bg-muted/40 overflow-hidden">
                  <div class="h-full bg-primary/70" style="width: {pct}%;"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-popover/60">
            <th
              class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >技能</th
            >
            {#each visibleSkillColumns as col (col.key)}
              <th
                class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >{col.header}</th
              >
            {/each}
          </tr>
        </thead>
        <tbody class="bg-background/40">
          {#each flatSkillRows as item (item.key)}
            <tr
              class="relative border-t border-border/40 hover:bg-muted/60 transition-colors"
            >
              <td class="px-3 py-3 text-sm text-muted-foreground relative z-10"
              >
                {#if item.kind === "group"}
                  <button
                    class="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    onclick={() => toggleGroup(item.row.recountId)}
                  >
                    <svg
                      class="size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 {expandedGroups.has(
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
                      <span class="w-3 shrink-0 flex justify-center">
                        <span class="size-1 rounded-full bg-muted-foreground/35"></span>
                      </span>
                    {:else}
                      <span class="w-3 shrink-0"></span>
                    {/if}
                    <span class="truncate">{item.row.name}</span>
                    {#if item.row.showSkillId}
                      <span class="text-[10px] text-muted-foreground/50 shrink-0">
                        #{item.row.skillId}
                      </span>
                    {/if}
                  </div>
                {/if}
              </td
              >
              {#each visibleSkillColumns as col (col.key)}
                <td
                  class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10"
                >
                  {#if (col.key === "totalDmg" || col.key === "dps") && (skillType === "tanked" ? SETTINGS.history.general.state.shortenTps : SETTINGS.history.general.state.shortenDps)}
                    <AbbreviatedNumber num={skillCellValue(item, col.key)} />
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
    <div class="text-neutral-400">加载中...</div>
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
      aria-label="关闭弹窗"
    ></button>

    <!-- Modal Content -->
    <div
      class="relative bg-card border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
    >
      <div class="flex items-start gap-4">
        <!-- Warning Icon -->
        <div
          class="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center"
        >
          <svg
            class="w-5 h-5 text-destructive"
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
            class="text-lg font-semibold text-foreground"
          >
            Delete Encounter
          </h3>
          <p class="mt-2 text-sm text-muted-foreground">
            Are you sure you want to delete this encounter? This action cannot
            be undone and all associated data will be permanently removed.
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 flex justify-end gap-3">
        <button
          onclick={closeDeleteModal}
          disabled={isDeleting}
          class="px-4 py-2 text-sm rounded-md border border-border bg-popover text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onclick={confirmDeleteEncounter}
          disabled={isDeleting}
          class="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {#if isDeleting}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
            Deleting...
          {:else}
            Delete
          {/if}
        </button>
      </div>
  </div>
</div>
{/if}
