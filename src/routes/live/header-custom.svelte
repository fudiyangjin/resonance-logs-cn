<script lang="ts">
  /**
   * @file Fully customizable header component for the live meter.
   * Renders header elements based on user settings.
   */
  import {
    getCurrentWebviewWindow,
    WebviewWindow,
  } from "@tauri-apps/api/webviewWindow";

  import PauseIcon from "virtual:icons/lucide/pause";
  import PlayIcon from "virtual:icons/lucide/play";
  import MinusIcon from "virtual:icons/lucide/minus";
  import SettingsIcon from "virtual:icons/lucide/settings";
  import RefreshCwIcon from "virtual:icons/lucide/refresh-cw";
  import CrosshairIcon from "virtual:icons/lucide/crosshair";

  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    resetEncounter,
    startTrainingDummy,
    stopTrainingDummy,
    togglePauseEncounter,
    type HeaderInfo,
    type TrainingDummyState,
  } from "$lib/api";
  import { tooltip } from "$lib/utils.svelte";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import { emitTo } from "@tauri-apps/api/event";
  import { SETTINGS } from "$lib/settings-store";
  import {
    normalizeHeaderLayout,
    type HeaderLayoutComponentId,
  } from "$lib/live-header-layout";
  import {
    getLiveData,
    getTrainingDummyState as getRuntimeTrainingDummyState,
  } from "$lib/stores/live-meter-store.svelte";
  import {
    resolveMonsterName,
    resolveSceneName,
  } from "$lib/config/game-names";
  import { formatNumber, t } from "$lib/i18n/index.svelte";

  // Get header settings
  const h = $derived(SETTINGS.live.headerCustomization.state);
  const abbreviationStyle = $derived(
    SETTINGS.live.general.state.abbreviationStyle,
  );

  const liveData = $derived(getLiveData());
  const runtimeTrainingDummyState = $derived(getRuntimeTrainingDummyState());

  const emptyTrainingDummy: TrainingDummyState = {
    phase: "idle",
  };

  let clientElapsedMs = $state(0);
  let animationFrameId: number | null = null;
  let trainingDummyBusy = $state(false);

  // Client-side timer loop for smooth local elapsed display.
  function updateClientTimer() {
    if (headerInfo.fightStartTimestampMs > 0 && !isEncounterPaused) {
      clientElapsedMs = Date.now() - headerInfo.fightStartTimestampMs;
    }
    animationFrameId = requestAnimationFrame(updateClientTimer);
  }

  function resetTimer() {
    clientElapsedMs = 0;
  }

  onMount(() => {
    try {
      appWindow = getCurrentWebviewWindow();
    } catch (error) {
      console.error("Failed to get current live webview window", error);
    }

    animationFrameId = requestAnimationFrame(updateClientTimer);
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  });

  function formatElapsed(msElapsed: number) {
    const totalSeconds = Math.floor(Number(msElapsed) / 1000);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  const emptyHeaderInfo: HeaderInfo = {
    totalDps: 0,
    totalDmg: 0,
    elapsedMs: 0,
    activeCombatTimeMs: 0,
    fightStartTimestampMs: 0,
    bosses: [],
    sceneId: null,
    dungeonDifficulty: null,
    trainingDummy: emptyTrainingDummy,
  };
  const trainingDummyState = $derived.by(
    () => runtimeTrainingDummyState ?? emptyTrainingDummy,
  );
  const isEncounterPaused = $derived(!!liveData?.isPaused);
  const headerInfo = $derived.by((): HeaderInfo => {
    const data = liveData;
    if (!data || data.fightStartTimestampMs <= 0) {
      return {
        ...emptyHeaderInfo,
        trainingDummy: trainingDummyState,
      };
    }

    return {
      totalDps:
        data.elapsedMs > 0
          ? Number(data.totalDmg) / (Number(data.elapsedMs) / 1000)
          : 0,
      totalDmg: Number(data.totalDmg),
      elapsedMs: Number(data.elapsedMs),
      activeCombatTimeMs: Number(data.activeCombatTimeMs),
      fightStartTimestampMs: Number(data.fightStartTimestampMs),
      bosses: data.bosses,
      sceneId: data.sceneId,
      dungeonDifficulty: data.dungeonDifficulty,
      trainingDummy: trainingDummyState,
    };
  });

  $effect(() => {
    const nextFightStartTimestampMs = headerInfo.fightStartTimestampMs;
    clientElapsedMs =
      nextFightStartTimestampMs > 0
        ? Date.now() - nextFightStartTimestampMs
        : 0;
  });

  const displayHeaderInfo = $derived(headerInfo);
  const displayElapsedMs = $derived(clientElapsedMs);
  const displaySceneName = $derived(
    resolveSceneName(headerInfo.sceneId, headerInfo.dungeonDifficulty),
  );
  const displayBosses = $derived(
    headerInfo.bosses.map((boss) => ({
      ...boss,
      displayName: resolveMonsterName(boss.monsterId),
    })),
  );
  const isTrainingDummyActive = $derived(trainingDummyState.phase !== "idle");

  let appWindow = $state<ReturnType<typeof getCurrentWebviewWindow> | null>(
    null,
  );

  async function openSettings() {
    const mainWindow = await WebviewWindow.getByLabel("main");
    if (mainWindow !== null) {
      await mainWindow?.unminimize();
      await mainWindow?.show();
      await mainWindow?.setFocus();
      await emitTo("main", "navigate", "/main/dps/settings");
    }
  }

  function handleResetEncounter() {
    resetTimer();
    void resetEncounter();
  }

  function formatTrainingDummyLabel(state: TrainingDummyState) {
    switch (state.phase) {
      case "armed":
        return t("live.header.trainingDummy.armed");
      case "running":
        return t("live.header.trainingDummy.running");
      case "finished":
        return t("live.header.trainingDummy.finished");
      default:
        return "";
    }
  }

  async function toggleTrainingDummyMode() {
    if (trainingDummyBusy) return;
    trainingDummyBusy = true;
    try {
      if (isTrainingDummyActive) {
        await stopTrainingDummy();
      } else {
        await startTrainingDummy();
      }
    } finally {
      trainingDummyBusy = false;
    }
  }

  // Check if we have any row 1 left content
  const hasRow1Left = $derived(
    h.showTimer || h.showSceneName || isTrainingDummyActive,
  );

  // Check if we have any row 1 right content (buttons)
  const hasRow1Right = $derived(
    h.showHeaderControl ||
      h.showResetButton ||
      h.showPauseButton ||
      h.showSettingsButton ||
      h.showMinimizeButton,
  );

  // Check if we have any row 2 left content
  const hasRow2Left = $derived(
    h.showTotalDamage || h.showTotalDps || h.showBossHealth,
  );

  // Check if we have any row 2 content at all
  const hasRow2 = $derived(hasRow2Left || h.showNavigationTabs);

  // Check if we have any row 1 content at all
  const hasRow1 = $derived(hasRow1Left || hasRow1Right);

  const visibleLayoutComponents = $derived.by((): HeaderLayoutComponentId[] => {
    const components: HeaderLayoutComponentId[] = [];

    if (h.showTimer) components.push("timer");
    if (h.showSceneName && displaySceneName) components.push("sceneName");
    if (isTrainingDummyActive) components.push("trainingDummyStatus");
    if (h.showTotalDamage) components.push("totalDamage");
    if (h.showTotalDps) components.push("totalDps");
    if (h.showBossHealth) components.push("bossHealth");
    if (h.showNavigationTabs) components.push("navigationTabs");
    if (hasRow1Right) components.push("controlButtons");

    return components;
  });

  const normalizedHeaderLayout = $derived.by(() =>
    normalizeHeaderLayout(h.headerCustomLayout, visibleLayoutComponents),
  );
  const isCustomLayout = $derived(h.headerLayoutMode === "custom");
  const hasCustomHeader = $derived(normalizedHeaderLayout.rows.length > 0);
</script>

{#snippet timerItem()}
  <div class="flex items-center gap-2 shrink-0">
    {#if h.timerLabelFontSize > 0}
      <span
        class="font-medium text-muted-foreground uppercase tracking-wider leading-none"
        style="font-size: {h.timerLabelFontSize}px"
        >{t("live.header.timer")}</span
      >
    {/if}
    <span
      class="font-bold text-foreground tabular-nums tracking-tight leading-none"
      style="font-size: {h.timerFontSize}px"
      {@attach tooltip(() => t("live.header.tooltip.timeElapsed"))}
      >{formatElapsed(displayElapsedMs)}</span
    >
    {#if h.showActiveTimer}
      <span
        class="font-bold text-foreground tabular-nums tracking-tight leading-none"
        style="font-size: {h.activeTimerFontSize}px"
        {@attach tooltip(() => t("live.header.tooltip.activeCombatTime"))}
      >
        / {formatElapsed(displayHeaderInfo.activeCombatTimeMs)}
      </span>
    {/if}
  </div>
{/snippet}

{#snippet sceneNameItem()}
  <span
    class="text-muted-foreground font-medium shrink-0 leading-none"
    style="font-size: {h.sceneNameFontSize}px"
    {@attach tooltip(() => displaySceneName || "")}>{displaySceneName}</span
  >
{/snippet}

{#snippet trainingDummyStatusItem()}
  <div
    class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-foreground shrink-0"
    {@attach tooltip(() => formatTrainingDummyLabel(trainingDummyState))}
  >
    <CrosshairIcon
      class="text-muted-foreground shrink-0"
      style="width: {h.sceneNameFontSize}px; height: {h.sceneNameFontSize}px"
    />
    <span
      class="font-medium leading-none"
      style="font-size: {h.sceneNameFontSize}px"
    >
      {formatTrainingDummyLabel(trainingDummyState)}
    </span>
  </div>
{/snippet}

{#snippet totalDamageItem()}
  <div class="flex items-center gap-2 shrink-0">
    <span
      class="font-bold text-muted-foreground uppercase tracking-wider"
      style="font-size: {h.totalDamageLabelFontSize}px"
      {@attach tooltip(() => t("live.header.tooltip.totalDamage"))}
      >{t("live.header.totalDamage")}</span
    >
    <span
      class="font-bold text-foreground"
      style="font-size: {h.totalDamageValueFontSize}px"
      {@attach tooltip(() => formatNumber(displayHeaderInfo.totalDmg))}
      ><AbbreviatedNumber
        num={Number(displayHeaderInfo.totalDmg)}
        {abbreviationStyle}
      /></span
    >
  </div>
{/snippet}

{#snippet totalDpsItem()}
  <div class="flex items-center gap-2 shrink-0">
    <span
      class="font-bold text-muted-foreground uppercase tracking-wider"
      style="font-size: {h.totalDpsLabelFontSize}px"
      {@attach tooltip(() => t("live.header.tooltip.totalDps"))}
      >{t("live.header.totalDps")}</span
    >
    <span
      class="font-bold text-foreground"
      style="font-size: {h.totalDpsValueFontSize}px"
      {@attach tooltip(() => formatNumber(displayHeaderInfo.totalDps))}
      ><AbbreviatedNumber
        num={displayHeaderInfo.totalDps}
        {abbreviationStyle}
      /></span
    >
  </div>
{/snippet}

{#snippet bossHealthItem()}
  <div class="flex items-center gap-2 shrink-0">
    <span
      class="font-bold text-muted-foreground uppercase tracking-wider"
      style="font-size: {h.bossHealthLabelFontSize}px"
      {@attach tooltip(() => t("live.header.tooltip.bossHealth"))}
      >{t("live.header.boss")}</span
    >
    {#if displayBosses.length > 0}
      <div
        class="flex gap-1 overflow-hidden"
        class:flex-col={h.bossHealthLayout !== "horizontal"}
        class:flex-row={h.bossHealthLayout === "horizontal"}
        class:flex-nowrap={h.bossHealthLayout === "horizontal"}
      >
        {#each displayBosses as boss (boss.entityUuid)}
          {@const hpPercent =
            boss.maxHp && boss.currentHp !== null
              ? Math.min(100, Math.max(0, (boss.currentHp / boss.maxHp) * 100))
              : 0}
          <div class="flex items-center gap-1 whitespace-nowrap">
            <span
              class="truncate text-foreground font-semibold tracking-tight"
              style="font-size: {h.bossHealthNameFontSize}px"
              {@attach tooltip(() => boss.displayName)}>{boss.displayName} -</span
            >
            <span
              class="tabular-nums font-semibold text-foreground"
              style="font-size: {h.bossHealthValueFontSize}px"
            >
              <AbbreviatedNumber
                num={boss.currentHp !== null ? boss.currentHp : 0}
                {abbreviationStyle}
              />
              {#if boss.maxHp}
                <span>
                  / <AbbreviatedNumber num={boss.maxHp} {abbreviationStyle} />
                </span>
                <span
                  class="text-destructive ml-1"
                  style="font-size: {h.bossHealthPercentFontSize}px"
                  >({formatNumber(hpPercent, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}%)</span
                >
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <span
        class="text-neutral-500 font-medium italic"
        style="font-size: {h.bossHealthNameFontSize}px"
        >{t("live.empty.noBoss")}</span
      >
    {/if}
  </div>
{/snippet}

{#snippet controlButtonsItem()}
  <div class="flex items-center gap-2 shrink-0">
    {#if h.showHeaderControl}
      <button
        class="{isTrainingDummyActive
          ? 'bg-muted text-foreground border-border shadow-sm'
          : 'text-muted-foreground border-transparent'} hover:text-foreground hover:bg-popover/60 rounded-lg border transition-all duration-200 disabled:opacity-60"
        style="padding: {h.pauseButtonPadding}px"
        aria-pressed={isTrainingDummyActive}
        aria-label={isTrainingDummyActive
          ? t("live.header.trainingDummy.disable")
          : t("live.header.trainingDummy.enable")}
        disabled={trainingDummyBusy}
        onclick={toggleTrainingDummyMode}
        {@attach tooltip(() =>
          isTrainingDummyActive
            ? t("live.header.trainingDummy.disable")
            : t("live.header.trainingDummy.enable"),
        )}
      >
        <CrosshairIcon
          style="width: {h.pauseButtonSize}px; height: {h.pauseButtonSize}px"
        />
      </button>
    {/if}

    {#if h.showResetButton}
      <button
        class="text-muted-foreground hover:text-foreground hover:bg-popover/60 rounded-lg transition-all duration-200"
        style="padding: {h.resetButtonPadding}px"
        onclick={handleResetEncounter}
        {@attach tooltip(() => t("live.header.tooltip.resetEncounter"))}
      >
        <RefreshCwIcon
          style="width: {h.resetButtonSize}px; height: {h.resetButtonSize}px"
        />
      </button>
    {/if}

    {#if h.showPauseButton}
      <button
        class="{isEncounterPaused
          ? 'text-[oklch(0.65_0.1_145)] bg-[oklch(0.9_0.02_145)]/30'
          : 'text-muted-foreground'} hover:text-foreground hover:bg-popover/60 rounded-lg transition-all duration-200"
        style="padding: {h.pauseButtonPadding}px"
        onclick={() => void togglePauseEncounter()}
      >
        {#if isEncounterPaused}
          <PlayIcon
            {@attach tooltip(() => t("live.header.tooltip.resumeEncounter"))}
            style="width: {h.pauseButtonSize}px; height: {h.pauseButtonSize}px"
          />
        {:else}
          <PauseIcon
            {@attach tooltip(() => t("live.header.tooltip.pauseEncounter"))}
            style="width: {h.pauseButtonSize}px; height: {h.pauseButtonSize}px"
          />
        {/if}
      </button>
    {/if}

    {#if h.showSettingsButton}
      <button
        class="text-muted-foreground hover:text-foreground hover:bg-popover/60 rounded-lg transition-all duration-200"
        style="padding: {h.settingsButtonPadding}px"
        onclick={() => openSettings()}
        {@attach tooltip(() => t("live.header.tooltip.settings"))}
      >
        <SettingsIcon
          style="width: {h.settingsButtonSize}px; height: {h.settingsButtonSize}px"
        />
      </button>
    {/if}

    {#if h.showMinimizeButton}
      <button
        class="text-muted-foreground hover:text-foreground hover:bg-popover/60 rounded-lg transition-all duration-200"
        style="padding: {h.minimizeButtonPadding}px"
        onclick={() => appWindow?.hide()}
        {@attach tooltip(() => t("live.header.tooltip.minimize"))}
      >
        <MinusIcon
          style="width: {h.minimizeButtonSize}px; height: {h.minimizeButtonSize}px"
        />
      </button>
    {/if}
  </div>
{/snippet}

{#snippet navigationTabsItem()}
  <div
    class="flex items-stretch border border-border rounded-lg overflow-hidden bg-popover/30 shrink-0"
  >
    <button
      class="transition-all duration-200 font-bold tracking-wider uppercase border-r border-border whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
        'dps',
      )
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
      style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
      aria-current={$page.url.pathname.includes("dps") ? "page" : undefined}
      onclick={() => goto(resolve("/live/dps"))}>{t("live.tabs.dps")}</button
    >
    <button
      class="transition-all duration-200 font-bold tracking-wider uppercase border-r border-border whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
        'heal',
      )
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
      style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
      aria-current={$page.url.pathname.includes("heal") ? "page" : undefined}
      onclick={() => goto(resolve("/live/heal"))}>{t("live.tabs.heal")}</button
    >
    <button
      class="transition-all duration-200 font-bold tracking-wider uppercase border-r border-border whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
        'tanked',
      )
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
      style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
      aria-current={$page.url.pathname.includes("tanked") ? "page" : undefined}
      onclick={() => goto(resolve("/live/tanked"))}>{t("live.tabs.tanked")}</button
    >
    {#if h.showDeathTab}
      <button
        class="transition-all duration-200 font-bold tracking-wider uppercase whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
          'death',
        )
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
        style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
        aria-current={$page.url.pathname.includes("death") ? "page" : undefined}
        onclick={() => goto(resolve("/live/death"))}>{t("live.tabs.death")}</button
      >
    {/if}
  </div>
{/snippet}

{#snippet headerLayoutComponent(componentId: HeaderLayoutComponentId)}
  {#if componentId === "timer"}
    {@render timerItem()}
  {:else if componentId === "sceneName"}
    {@render sceneNameItem()}
  {:else if componentId === "trainingDummyStatus"}
    {@render trainingDummyStatusItem()}
  {:else if componentId === "totalDamage"}
    {@render totalDamageItem()}
  {:else if componentId === "totalDps"}
    {@render totalDpsItem()}
  {:else if componentId === "bossHealth"}
    {@render bossHealthItem()}
  {:else if componentId === "navigationTabs"}
    {@render navigationTabsItem()}
  {:else if componentId === "controlButtons"}
    {@render controlButtonsItem()}
  {/if}
{/snippet}

{#if isCustomLayout && hasCustomHeader}
  <header
    data-tauri-drag-region
    class="flex w-full flex-col text-sm"
    style="padding: {h.headerPadding}px; padding-bottom: {h.headerPadding +
      4}px; row-gap: {normalizedHeaderLayout.rowGap}px"
  >
    {#each normalizedHeaderLayout.rows as row (row.id + row.zones.start.join("|") + row.zones.end.join("|"))}
      <div
        data-tauri-drag-region
        class="grid w-full min-w-0 grid-cols-[1fr_auto] items-center overflow-hidden"
        style="column-gap: {normalizedHeaderLayout.itemGap}px"
      >
        <div
          class="flex min-w-0 flex-wrap items-center justify-start overflow-hidden"
          style="gap: {normalizedHeaderLayout.itemGap}px"
        >
          {#each row.zones.start as componentId (componentId)}
            {@render headerLayoutComponent(componentId)}
          {/each}
        </div>
        <div
          class="flex min-w-0 flex-wrap items-center justify-end overflow-hidden"
          style="gap: {normalizedHeaderLayout.itemGap}px"
        >
          {#each row.zones.end as componentId (componentId)}
            {@render headerLayoutComponent(componentId)}
          {/each}
        </div>
      </div>
    {/each}
  </header>
{:else if hasRow1 || hasRow2}
  <header
    data-tauri-drag-region
    class="grid w-full grid-cols-[1fr_auto] text-sm"
    class:grid-rows-1={!hasRow2}
    class:grid-rows-2={hasRow2}
    style="padding: {h.headerPadding}px; padding-bottom: {h.headerPadding +
      4}px"
  >
    <!-- Row 1, Col 1: Timer + Scene + Segment -->
    {#if hasRow1Left}
      <div
        class="col-start-1 row-start-1 flex items-center overflow-hidden gap-4 min-w-0"
        data-tauri-drag-region
      >
        {#if h.showTimer}
          <div class="flex items-center gap-2 shrink-0">
            {#if h.timerLabelFontSize > 0}
              <span
                class="font-medium text-muted-foreground uppercase tracking-wider leading-none"
                style="font-size: {h.timerLabelFontSize}px"
                >{t("live.header.timer")}</span
              >
            {/if}
            <span
              class="font-bold text-foreground tabular-nums tracking-tight leading-none"
              style="font-size: {h.timerFontSize}px"
              {@attach tooltip(() => t("live.header.tooltip.timeElapsed"))}
              >{formatElapsed(displayElapsedMs)}</span
            >
            {#if h.showActiveTimer}
              <span
                class="font-bold text-foreground tabular-nums tracking-tight leading-none"
                style="font-size: {h.activeTimerFontSize}px"
                {@attach tooltip(() => t("live.header.tooltip.activeCombatTime"))}
              >
                / {formatElapsed(displayHeaderInfo.activeCombatTimeMs)}
              </span>
            {/if}
          </div>
        {/if}

        {#if h.showSceneName && displaySceneName}
          <span
            class="text-muted-foreground font-medium shrink-0 leading-none"
            style="font-size: {h.sceneNameFontSize}px"
            {@attach tooltip(() => displaySceneName || "")}
            >{displaySceneName}</span
          >
        {/if}

        {#if isTrainingDummyActive}
          <div
            class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-foreground shrink-0"
            {@attach tooltip(() =>
              formatTrainingDummyLabel(trainingDummyState),
            )}
          >
            <CrosshairIcon
              class="text-muted-foreground shrink-0"
              style="width: {h.sceneNameFontSize}px; height: {h.sceneNameFontSize}px"
            />
            <span
              class="font-medium leading-none"
              style="font-size: {h.sceneNameFontSize}px"
            >
              {formatTrainingDummyLabel(trainingDummyState)}
            </span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Row 1, Col 2: Control Buttons -->
    {#if hasRow1Right}
      <div
        class="col-start-2 row-start-1 flex items-center justify-self-end gap-2 shrink-0"
      >
        {#if h.showHeaderControl}
          <button
            class="{isTrainingDummyActive
              ? 'bg-muted text-foreground border-border shadow-sm'
              : 'text-muted-foreground border-transparent'} hover:text-foreground hover:bg-popover/60 rounded-lg border transition-all duration-200 disabled:opacity-60"
            style="padding: {h.pauseButtonPadding}px"
            aria-pressed={isTrainingDummyActive}
            aria-label={isTrainingDummyActive
              ? t("live.header.trainingDummy.disable")
              : t("live.header.trainingDummy.enable")}
            disabled={trainingDummyBusy}
            onclick={toggleTrainingDummyMode}
            {@attach tooltip(() =>
              isTrainingDummyActive
                ? t("live.header.trainingDummy.disable")
                : t("live.header.trainingDummy.enable"),
            )}
          >
            <CrosshairIcon
              style="width: {h.pauseButtonSize}px; height: {h.pauseButtonSize}px"
            />
          </button>
        {/if}

        {#if h.showResetButton}
          <button
            class="text-muted-foreground hover:text-foreground hover:bg-popover/60 rounded-lg transition-all duration-200"
            style="padding: {h.resetButtonPadding}px"
            onclick={handleResetEncounter}
            {@attach tooltip(() => t("live.header.tooltip.resetEncounter"))}
          >
            <RefreshCwIcon
              style="width: {h.resetButtonSize}px; height: {h.resetButtonSize}px"
            />
          </button>
        {/if}

        {#if h.showPauseButton}
          <button
            class="{isEncounterPaused
              ? 'text-[oklch(0.65_0.1_145)] bg-[oklch(0.9_0.02_145)]/30'
              : 'text-muted-foreground'} hover:text-foreground hover:bg-popover/60 rounded-lg transition-all duration-200"
            style="padding: {h.pauseButtonPadding}px"
            onclick={() => void togglePauseEncounter()}
          >
            {#if isEncounterPaused}
              <PlayIcon
                {@attach tooltip(() => t("live.header.tooltip.resumeEncounter"))}
                style="width: {h.pauseButtonSize}px; height: {h.pauseButtonSize}px"
              />
            {:else}
              <PauseIcon
                {@attach tooltip(() => t("live.header.tooltip.pauseEncounter"))}
                style="width: {h.pauseButtonSize}px; height: {h.pauseButtonSize}px"
              />
            {/if}
          </button>
        {/if}

        {#if h.showSettingsButton}
          <button
            class="text-muted-foreground hover:text-foreground hover:bg-popover/60 rounded-lg transition-all duration-200"
            style="padding: {h.settingsButtonPadding}px"
            onclick={() => openSettings()}
            {@attach tooltip(() => t("live.header.tooltip.settings"))}
          >
            <SettingsIcon
              style="width: {h.settingsButtonSize}px; height: {h.settingsButtonSize}px"
            />
          </button>
        {/if}

        {#if h.showMinimizeButton}
          <button
            class="text-muted-foreground hover:text-foreground hover:bg-popover/60 rounded-lg transition-all duration-200"
            style="padding: {h.minimizeButtonPadding}px"
            onclick={() => appWindow?.hide()}
            {@attach tooltip(() => t("live.header.tooltip.minimize"))}
          >
            <MinusIcon
              style="width: {h.minimizeButtonSize}px; height: {h.minimizeButtonSize}px"
            />
          </button>
        {/if}
      </div>
    {/if}

    <!-- Row 2, Col 1: Stats summary + Boss Health -->
    {#if hasRow2Left}
      <div
        class="col-start-1 row-start-2 flex overflow-hidden items-center gap-5 min-w-0"
      >
        <div class="flex overflow-hidden items-center gap-5">
          {#if h.showTotalDamage}
            <div class="flex items-center gap-2 shrink-0">
              <span
                class="font-bold text-muted-foreground uppercase tracking-wider"
                style="font-size: {h.totalDamageLabelFontSize}px"
                {@attach tooltip(() => t("live.header.tooltip.totalDamage"))}
                >{t("live.header.totalDamage")}</span
              >
              <span
                class="font-bold text-foreground"
                style="font-size: {h.totalDamageValueFontSize}px"
                {@attach tooltip(() =>
                  formatNumber(displayHeaderInfo.totalDmg),
                )}
                ><AbbreviatedNumber
                  num={Number(displayHeaderInfo.totalDmg)}
                  {abbreviationStyle}
                /></span
              >
            </div>
          {/if}

          {#if h.showTotalDps}
            <div class="flex items-center gap-2 shrink-0">
              <span
                class="font-bold text-muted-foreground uppercase tracking-wider"
                style="font-size: {h.totalDpsLabelFontSize}px"
                {@attach tooltip(() => t("live.header.tooltip.totalDps"))}
                >{t("live.header.totalDps")}</span
              >
              <span
                class="font-bold text-foreground"
                style="font-size: {h.totalDpsValueFontSize}px"
                {@attach tooltip(() =>
                  formatNumber(displayHeaderInfo.totalDps),
                )}
                ><AbbreviatedNumber
                  num={displayHeaderInfo.totalDps}
                  {abbreviationStyle}
                /></span
              >
            </div>
          {/if}
        </div>

        {#if h.showBossHealth}
          <div class="flex items-center gap-2 shrink-0">
            <span
              class="font-bold text-muted-foreground uppercase tracking-wider"
              style="font-size: {h.bossHealthLabelFontSize}px"
              {@attach tooltip(() => t("live.header.tooltip.bossHealth"))}
              >{t("live.header.boss")}</span
            >
            <!-- Inline Boss Health Display -->
            {#if displayBosses.length > 0}
              <div
                class="flex gap-1 overflow-hidden"
                class:flex-col={h.bossHealthLayout !== "horizontal"}
                class:flex-row={h.bossHealthLayout === "horizontal"}
                class:flex-nowrap={h.bossHealthLayout === "horizontal"}
              >
                {#each displayBosses as boss (boss.entityUuid)}
                  {@const hpPercent =
                    boss.maxHp && boss.currentHp !== null
                      ? Math.min(
                          100,
                          Math.max(0, (boss.currentHp / boss.maxHp) * 100),
                        )
                      : 0}
                  <div class="flex items-center gap-1 whitespace-nowrap">
                    <span
                      class="truncate text-foreground font-semibold tracking-tight"
                      style="font-size: {h.bossHealthNameFontSize}px"
                      {@attach tooltip(() => boss.displayName)}
                      >{boss.displayName} -</span
                    >
                    <span
                      class="tabular-nums font-semibold text-foreground"
                      style="font-size: {h.bossHealthValueFontSize}px"
                    >
                      <AbbreviatedNumber
                        num={boss.currentHp !== null ? boss.currentHp : 0}
                        {abbreviationStyle}
                      />
                      {#if boss.maxHp}
                        <span>
                          / <AbbreviatedNumber
                            num={boss.maxHp}
                            {abbreviationStyle}
                          /></span
                        >
                        <span
                          class="text-destructive ml-1"
                          style="font-size: {h.bossHealthPercentFontSize}px"
                          >({formatNumber(hpPercent, {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}%)</span
                        >
                      {/if}
                    </span>
                  </div>
                {/each}
              </div>
            {:else}
              <span
                class="text-neutral-500 font-medium italic"
                style="font-size: {h.bossHealthNameFontSize}px"
                >{t("live.empty.noBoss")}</span
              >
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Row 2, Col 2: DPS/HEAL/TANKED Tabs -->
    {#if h.showNavigationTabs}
      <div
        class="col-start-2 row-start-2 justify-self-end flex items-stretch border border-border rounded-lg overflow-hidden bg-popover/30 shrink-0"
      >
        <button
          class="transition-all duration-200 font-bold tracking-wider uppercase border-r border-border whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
            'dps',
          )
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
          style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
          aria-current={$page.url.pathname.includes("dps") ? "page" : undefined}
          onclick={() => goto(resolve("/live/dps"))}>{t("live.tabs.dps")}</button
        >
        <button
          class="transition-all duration-200 font-bold tracking-wider uppercase border-r border-border whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
            'heal',
          )
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
          style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
          aria-current={$page.url.pathname.includes("heal")
            ? "page"
            : undefined}
          onclick={() => goto(resolve("/live/heal"))}>{t("live.tabs.heal")}</button
        >
        <button
          class="transition-all duration-200 font-bold tracking-wider uppercase border-r border-border whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
            'tanked',
          )
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
          style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
          aria-current={$page.url.pathname.includes("tanked")
            ? "page"
            : undefined}
          onclick={() => goto(resolve("/live/tanked"))}>{t("live.tabs.tanked")}</button
        >
        {#if h.showDeathTab}
          <button
            class="transition-all duration-200 font-bold tracking-wider uppercase whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
              'death',
            )
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
            style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
            aria-current={$page.url.pathname.includes("death")
              ? "page"
              : undefined}
            onclick={() => goto(resolve("/live/death"))}>{t("live.tabs.death")}</button
          >
        {/if}
      </div>
    {/if}
  </header>
{/if}
