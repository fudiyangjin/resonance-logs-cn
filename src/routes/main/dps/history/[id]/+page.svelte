<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { commands } from "$lib/bindings";
  import type {
    ActorEncounterStatDto,
    EncounterSummaryDto,
    SkillsWindow,
  } from "$lib/bindings";
  import { getClassIcon, tooltip, CLASS_MAP } from "$lib/utils.svelte";
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

  // Get encounter ID from URL params
  let encounterId = $derived(
    $page.params.id ? parseInt($page.params.id) : null,
  );
  let charId = $derived($page.url.searchParams.get("charId"));
  let skillType = $derived($page.url.searchParams.get("skillType") ?? "dps");

  // Class mapping functions
  function getClassName(classId: number | null): string {
    if (!classId) return "";
    return CLASS_MAP[classId] ?? "";
  }

  let encounter = $state<EncounterSummaryDto | null>(null);
  let actors = $state<ActorEncounterStatDto[]>([]);
  let players = $state<any[]>([]);
  let error = $state<string | null>(null);
  let isDeleting = $state(false);
  let showDeleteModal = $state(false);

  // (SkillsWindow.currPlayer[0].classSpecName) only when the user has enabled Name - Spec display.
  let isSpecLoading = $state(false);
  let specsLoadedForEncounterId = $state<number | null>(null);
  let needsSpecNames = $derived.by(() => {
    const your = settings.state.history.general.showYourName;
    const others = settings.state.history.general.showOthersName;
    return String(your).includes("Spec") || String(others).includes("Spec");
  });

  // Tab state for encounter view
  let activeTab = $state<"damage" | "tanked" | "healing">("damage");

  const tabs: {
    key: "damage" | "tanked" | "healing";
    label: string;
  }[] = [
    { key: "damage", label: "伤害" },
    { key: "tanked", label: "承伤" },
    { key: "healing", label: "治疗" },
  ];

  let encounterDurationMinutes = $derived.by(() => {
    if (!encounter) return 0;
    const durationSeconds = Math.max(
      1,
      ((encounter.endedAtMs ?? Date.now()) - encounter.startedAtMs) / 1000,
    );
    return Math.floor(durationSeconds / 60);
  });

  // Skills view state
  let skillsWindow = $state<SkillsWindow | null>(null);
  let selectedPlayer = $state<any | null>(null);

  // Filtered and sorted players based on active tab
  let displayedPlayers = $derived.by(() => {
    if (activeTab === "damage") {
      return [...players].sort((a, b) => b.totalDmg - a.totalDmg);
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

  // Calculate max values for relative to top settings
  let maxDpsPlayer = $derived.by(() => {
    return displayedPlayers.reduce(
      (max, p) => Math.max(max, p.totalDmg || 0),
      0,
    );
  });

  let maxHealPlayer = $derived.by(() => {
    return displayedPlayers.reduce(
      (max, p) => Math.max(max, p.healDealt || 0),
      0,
    );
  });

  let maxDpsSkill = $derived.by(() => {
    if (!skillsWindow) return 0;
    return skillsWindow.skillRows.reduce(
      (max, s) => Math.max(max, s.totalDmg || 0),
      0,
    );
  });

  let maxHealSkill = $derived.by(() => {
    if (!skillsWindow) return 0;
    return skillsWindow.skillRows.reduce(
      (max, s) => Math.max(max, s.totalDmg || 0),
      0,
    );
  });

  // Get visible columns based on settings and active tab
  let visiblePlayerColumns = $derived.by(() => {
    if (activeTab === "healing") {
      return historyHealPlayerColumns.filter(
        (col) => settings.state.history.heal.players[col.key] ?? true,
      );
    } else if (activeTab === "tanked") {
      return historyTankedPlayerColumns.filter(
        (col) => settings.state.history.tanked.players[col.key] ?? true,
      );
    }
    return historyDpsPlayerColumns.filter(
      (col) => {
        const defaultValue =
          DEFAULT_HISTORY_STATS[col.key as keyof typeof DEFAULT_HISTORY_STATS] ??
          true;
        const setting =
          settings.state.history.dps.players[
            col.key as keyof typeof settings.state.history.dps.players
          ];
        return setting ?? defaultValue;
      },
    );
  });

  let visibleSkillColumns = $derived.by(() => {
    if (skillType === "heal") {
      return historyHealSkillColumns.filter(
        (col) => settings.state.history.heal.skillBreakdown[col.key],
      );
    } else if (skillType === "tanked") {
      return historyTankedSkillColumns.filter(
        (col) => settings.state.history.tanked.skillBreakdown[col.key],
      );
    }
    return historyDpsSkillColumns.filter(
      (col) => settings.state.history.dps.skillBreakdown[col.key],
    );
  });

  let maxTankedPlayer = $derived.by(() => {
    return displayedPlayers.reduce(
      (max, p) => Math.max(max, p.damageTaken || 0),
      0,
    );
  });
  let maxTankedSkill = $derived.by(() => {
    if (!skillsWindow) return 0;
    return skillsWindow.skillRows.reduce(
      (max, s) => Math.max(max, s.totalDmg || 0),
      0,
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

  async function loadEncounter() {
    if (!encounterId) return;

    // Reset spec cache for this encounter load.
    specsLoadedForEncounterId = null;

    // Load encounter details
    const encounterRes = await commands.getEncounterById(encounterId);
    console.log("encounter res", encounterRes);
    if (encounterRes.status === "ok") {
      encounter = encounterRes.data;
      actors = encounterRes.data.actors ?? [];
    } else {
      error = String(encounterRes.error);
      return;
    }

    const displayActors = actors;

    const totalDmg = displayActors.reduce(
      (sum, a) => sum + (a.damageDealt ?? 0),
      0,
    );
    const totalBossDmg = displayActors.reduce(
      (sum, a) => sum + (a.bossDamageDealt ?? 0),
      0,
    );
    const totalDamageTaken = displayActors.reduce(
      (sum, a) => sum + (a.damageTaken ?? 0),
      0,
    );
    const totalHealing = displayActors.reduce(
      (sum, a) => sum + (a.healDealt ?? 0),
      0,
    );

    // Calculate duration for overall encounter
    const durationSecs = Math.max(
      1,
      ((encounter.endedAtMs ?? Date.now()) - encounter.startedAtMs) / 1000,
    );

    players = displayActors.map((a) => {
      const hits = a.hitsDealt || 0;
      const hitsTaken = a.hitsTaken || 0;
      const hitsHeal = a.hitsHeal || 0;
      const className = getClassName(a.classId);
      const dmgValue = a.damageDealt || 0;
      const bossDmgValue = a.bossDamageDealt || 0;
      const critTotal = a.critHitsDealt ? a.critTotalDealt || 0 : 0;
      const luckyTotal = a.luckyHitsDealt ? a.luckyTotalDealt || 0 : 0;
      const activeTimeMs = a.activeDmgTimeMs || 0;
      const tdpsValue =
        a.tdps ??
        (activeTimeMs > 0
          ? dmgValue / Math.max(activeTimeMs / 1000, 0.001)
          : dmgValue / durationSecs);

      return {
        uid: a.actorId,
        name: a.name ?? String(a.actorId),
        isLocalPlayer: a.isLocalPlayer ?? false,
        className,
        classSpecName: "",
        classDisplay: className || "未知职业",
        abilityScore: a.abilityScore || 0,
        totalDmg: dmgValue,
        dps: dmgValue / durationSecs,
        tdps: tdpsValue,
        activeTimeMs,
        dmgPct: totalDmg > 0 ? (dmgValue * 100) / totalDmg : 0,
        bossDmg: bossDmgValue,
        bossDps: bossDmgValue / durationSecs,
        bossDmgPct: totalBossDmg > 0 ? (bossDmgValue * 100) / totalBossDmg : 0,
        critRate: hits > 0 ? (a.critHitsDealt || 0) / hits : 0,
        critDmgRate: dmgValue > 0 ? critTotal / dmgValue : 0,
        luckyRate: hits > 0 ? (a.luckyHitsDealt || 0) / hits : 0,
        luckyDmgRate: dmgValue > 0 ? luckyTotal / dmgValue : 0,
        hits: hits,
        hitsPerMinute: hits / (durationSecs / 60.0),
        // Tanked stats
        damageTaken: a.damageTaken || 0,
        tankedPS: (a.damageTaken || 0) / durationSecs,
        tankedPct:
          totalDamageTaken > 0
            ? ((a.damageTaken || 0) * 100) / totalDamageTaken
            : 0,
        critTakenRate: hitsTaken > 0 ? (a.critHitsTaken || 0) / hitsTaken : 0,
        hitsTaken: hitsTaken,
        // Healing stats
        healDealt: a.healDealt || 0,
        hps: (a.healDealt || 0) / durationSecs,
        healPct:
          totalHealing > 0 ? ((a.healDealt || 0) * 100) / totalHealing : 0,
        critHealRate: hitsHeal > 0 ? (a.critHitsHeal || 0) / hitsHeal : 0,
        hitsHeal: hitsHeal,
      };
    });
  }

  function preferredSkillTypeForSpec(p: any): "dps" | "heal" | "tanked" {
    const heal = Number(p.healDealt ?? 0);
    const dmg = Number(p.totalDmg ?? 0);
    const tanked = Number(p.damageTaken ?? 0);
    if (heal > 0) return "heal";
    if (dmg <= 0 && tanked > 0) return "tanked";
    return "dps";
  }

  async function fetchSpecName(
    encId: number,
    uid: number,
    preferred: "dps" | "heal" | "tanked",
  ): Promise<string> {
    const attempts: ("dps" | "heal" | "tanked")[] = Array.from(
      new Set([preferred, "dps", "heal", "tanked"]),
    );

    for (const t of attempts) {
      const res = await commands.getEncounterPlayerSkills(encId, uid, t);
      if (res.status !== "ok") continue;
      const spec = res.data.currPlayer?.[0]?.classSpecName ?? "";
      if (spec) return spec;
    }
    return "";
  }

  async function populatePlayerSpecsIfNeeded() {
    if (!encounterId || !encounter) return;
    if (!needsSpecNames) return;
    if (isSpecLoading) return;
    if (specsLoadedForEncounterId === encounterId) return;
    if (!players || players.length === 0) return;

    isSpecLoading = true;
    try {
      const updates = await Promise.all(
        players.map(async (p) => {
          if (p.classSpecName) return [p.uid, p.classSpecName] as const;
          const preferred = preferredSkillTypeForSpec(p);
          const spec = await fetchSpecName(encounterId, p.uid, preferred);
          return [p.uid, spec] as const;
        }),
      );

      const specByUid = new Map<number, string>(updates);
      players = players.map((p) => ({
        ...p,
        classSpecName: specByUid.get(p.uid) ?? p.classSpecName ?? "",
      }));
      specsLoadedForEncounterId = encounterId;
    } catch (e) {
      console.error("Failed to populate class spec names for history view:", e);
      // Leave specsLoadedForEncounterId unset so we can retry.
    } finally {
      isSpecLoading = false;
    }
  }

  async function loadPlayerSkills() {
    if (!encounterId || !charId) {
      skillsWindow = null;
      selectedPlayer = null;
      return;
    }

    const playerUid = parseInt(charId);
    const res = await commands.getEncounterPlayerSkills(
      encounterId,
      playerUid,
      skillType,
    );
    if (res.status === "ok") {
      console.log("skills", res);
      skillsWindow = res.data;
      const found = players.find((p) => p.uid === playerUid);
      const specFromCurr = res.data.currPlayer?.[0]?.classSpecName ?? "";
      if (found && specFromCurr) {
        selectedPlayer = { ...found, classSpecName: specFromCurr };
        players = players.map((p) =>
          p.uid === playerUid ? { ...p, classSpecName: specFromCurr } : p,
        );
      } else {
        selectedPlayer = found;
      }
    } else {
      error = String(res.error);
    }
  }

  function viewPlayerSkills(playerUid: number, type = "dps") {

    const sp = new URLSearchParams($page.url.searchParams);
    sp.set("charId", String(playerUid));
    sp.set("skillType", type);
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToEncounter() {

    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("charId");
    sp.delete("skillType");
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

  // If Name - Spec is enabled in Past Encounters settings, load missing spec names.
  $effect(() => {
    // reactive deps:
    encounterId;
    encounter;
    charId;
    needsSpecNames;
    players.length;
    if (!charId) {
      populatePlayerSpecsIfNeeded();
    }
  });

  $effect(() => {
    // Re-run when charId changes
    charId;
    if (charId) {
      loadPlayerSkills();
    } else {
      skillsWindow = null;
      selectedPlayer = null;
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
                class="relative border-t border-border/40 hover:bg-muted/60 transition-colors {activeTab ===
                'tanked'
                  ? 'cursor-default'
                  : 'cursor-pointer'}"
                onclick={() =>
                  activeTab !== "tanked" &&
                  viewPlayerSkills(
                    p.uid,
                    activeTab === "healing" ? "heal" : "dps",
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
                      {#if p.abilityScore > 0}
                        {#if SETTINGS.history.general.state.shortenAbilityScore}
                          <span class="text-muted-foreground"
                            ><AbbreviatedNumber num={p.abilityScore} /></span
                          >
                        {:else}
                          <span class="text-muted-foreground"
                            >{p.abilityScore}</span
                          >
                        {/if}
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
  {:else if charId && skillsWindow && selectedPlayer}
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
          {#each skillsWindow.skillRows as s (s.skillId)}
            <tr
              class="relative border-t border-border/40 hover:bg-muted/60 transition-colors"
            >
              <td class="px-3 py-3 text-sm text-muted-foreground relative z-10"
                >{s.name}</td
              >
              {#each visibleSkillColumns as col (col.key)}
                <td
                  class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10"
                >
                  {#if (col.key === "totalDmg" || col.key === "dps") && (skillType === "tanked" ? SETTINGS.history.general.state.shortenTps : SETTINGS.history.general.state.shortenDps)}
                    <AbbreviatedNumber num={s[col.key] ?? 0} />
                  {:else}
                    {col.format(s[col.key] ?? 0)}
                  {/if}
                </td>
              {/each}
              <TableRowGlow
                className={selectedPlayer.className}
                percentage={skillType === "heal"
                  ? SETTINGS.history.general.state.relativeToTopHealSkill &&
                    maxHealSkill > 0
                    ? (s.totalDmg / maxHealSkill) * 100
                    : s.dmgPct
                  : skillType === "tanked"
                    ? SETTINGS.history.general.state.relativeToTopTankedSkill &&
                      maxTankedSkill > 0
                      ? (s.totalDmg / maxTankedSkill) * 100
                      : s.dmgPct
                    : SETTINGS.history.general.state.relativeToTopDPSSkill &&
                        maxDpsSkill > 0
                      ? (s.totalDmg / maxDpsSkill) * 100
                      : s.dmgPct}
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
