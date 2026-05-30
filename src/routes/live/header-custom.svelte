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
  import { resolveUiTranslation, type LocaleCode } from "$lib/i18n";
  import {
    clearMeterData,
    getLiveData,
    getTrainingDummyState,
  } from "$lib/stores/live-meter-store.svelte";
  import { localizeRawSceneName } from "$lib/scene-mappings";
  import { localizeRawMonsterName } from "$lib/monster-mappings";

  // Get header settings
  const h = $derived(SETTINGS.live.headerCustomization.state);
  const trainingDummySettings = $derived(SETTINGS.trainingDummy.state);

  const liveData = $derived(getLiveData());
  const runtimeTrainingDummyState = $derived(getTrainingDummyState());

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
    sceneName: null,
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
        data.elapsedMs > 0 ? Number(data.totalDmg) / (Number(data.elapsedMs) / 1000) : 0,
      totalDmg: Number(data.totalDmg),
      elapsedMs: Number(data.elapsedMs),
      activeCombatTimeMs: Number(data.activeCombatTimeMs),
      fightStartTimestampMs: Number(data.fightStartTimestampMs),
      bosses: data.bosses,
      sceneId: data.sceneId,
      sceneName: data.sceneName,
      trainingDummy: trainingDummyState,
    };
  });

  $effect(() => {
    const nextFightStartTimestampMs = headerInfo.fightStartTimestampMs;
    clientElapsedMs = nextFightStartTimestampMs > 0
      ? Date.now() - nextFightStartTimestampMs
      : 0;
  });

  const displayHeaderInfo = $derived(headerInfo);
  const displayElapsedMs = $derived(clientElapsedMs);
  const displaySceneName = $derived(localizeRawSceneName(headerInfo.sceneName, headerInfo.sceneName));
  const displayBosses = $derived(headerInfo.bosses);
  const isTrainingDummyActive = $derived(trainingDummyState.phase !== "idle");

  let appWindow = $state<ReturnType<typeof getCurrentWebviewWindow> | null>(null);

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
    clearMeterData();
    void resetEncounter();
  }

  function t(key: string, fallback: string): string {
    return resolveUiTranslation(
      key,
      SETTINGS.live.general.state.language as LocaleCode,
      fallback,
    );
  }

  function formatTrainingDummyLabel(state: TrainingDummyState) {
    switch (state.phase) {
      case "armed":
        return t("header.training.ready", "Training Dummy Ready");
      case "running":
        return t("header.training.active", "Training Dummy Active");
      case "pendingRollover":
        return t("header.training.waitSegment", "Awaiting Split");
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
        await startTrainingDummy(trainingDummySettings.defaultMonsterId);
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
    trainingDummySettings.showHeaderControl ||
    h.showResetButton ||
      h.showPauseButton ||
      h.showSettingsButton ||
      h.showMinimizeButton,
  );

  // Check if we have any row 2 left content
  const hasRow2Left = $derived(h.showTotalDamage || h.showTotalDps);

  // Check if we have any row 2 content at all
  const hasRow2 = $derived(hasRow2Left || h.showNavigationTabs);
  const hasBossRow = $derived(h.showBossHealth);

  // Check if we have any row 1 content at all
  const hasRow1 = $derived(hasRow1Left || hasRow1Right);
  const isCustomLayout = $derived(h.headerLayoutMode === "custom");
  const normalizedHeaderLayout = $derived(normalizeHeaderLayout(h.headerCustomLayout));
  const hasCustomHeader = $derived(
    normalizedHeaderLayout.rows.some((row) =>
      row.zones.start.length > 0 || row.zones.end.length > 0,
    ),
  );
</script>

{#snippet timerItem()}
  {#if h.showTimer}
    <div class="flex items-center gap-2 shrink-0">
      {#if h.timerLabelFontSize > 0}
        <span
          class="font-medium text-muted-foreground uppercase tracking-wider leading-none"
          style="font-size: {h.timerLabelFontSize}px">{t("header.timer", "Timer")}</span
        >
      {/if}
      <span
        class="font-bold text-foreground tabular-nums tracking-tight leading-none"
        style="font-size: {h.timerFontSize}px"
        {@attach tooltip(() => t("header.timeElapsed", "Time Elapsed"))}
        >{formatElapsed(displayElapsedMs)}</span
      >
      {#if h.showActiveTimer}
        <span
          class="font-bold text-foreground tabular-nums tracking-tight leading-none"
          style="font-size: {h.activeTimerFontSize}px"
          {@attach tooltip(() => t("header.activeCombatTime", "Active Combat Time"))}
        >
          / {formatElapsed(displayHeaderInfo.activeCombatTimeMs)}
        </span>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet sceneNameItem()}
  {#if h.showSceneName && displaySceneName}
    <span
      class="text-muted-foreground font-medium shrink-0 leading-none"
      style="font-size: {h.sceneNameFontSize}px"
      {@attach tooltip(() => displaySceneName || "")}
      >{displaySceneName}</span
    >
  {/if}
{/snippet}

{#snippet trainingDummyStatusItem()}
  {#if isTrainingDummyActive}
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
  {/if}
{/snippet}

{#snippet totalDamageItem()}
  {#if h.showTotalDamage}
    <div class="flex items-center gap-2 shrink-0">
      <span
        class="font-bold text-muted-foreground uppercase tracking-wider"
        style="font-size: {h.totalDamageLabelFontSize}px"
        {@attach tooltip(() => t("header.totalDamage", "Total Damage Dealt"))}>T.DMG</span
      >
      <span
        class="font-bold text-foreground"
        style="font-size: {h.totalDamageValueFontSize}px"
        {@attach tooltip(() => displayHeaderInfo.totalDmg.toLocaleString())}
        ><AbbreviatedNumber num={Number(displayHeaderInfo.totalDmg)} /></span
      >
    </div>
  {/if}
{/snippet}

{#snippet totalDpsItem()}
  {#if h.showTotalDps}
    <div class="flex items-center gap-2 shrink-0">
      <span
        class="font-bold text-muted-foreground uppercase tracking-wider"
        style="font-size: {h.totalDpsLabelFontSize}px"
        {@attach tooltip(() => t("header.totalDps", "Total Damage per Second"))}>T.DPS</span
      >
      <span
        class="font-bold text-foreground"
        style="font-size: {h.totalDpsValueFontSize}px"
        {@attach tooltip(() => displayHeaderInfo.totalDps.toLocaleString())}
        ><AbbreviatedNumber num={displayHeaderInfo.totalDps} /></span
      >
    </div>
  {/if}
{/snippet}

{#snippet bossHealthItem()}
  {#if h.showBossHealth}
    <div class="flex min-w-0 items-start gap-2">
      <span
        class="shrink-0 font-bold text-muted-foreground uppercase tracking-wider"
        style="font-size: {h.bossHealthLabelFontSize}px"
        {@attach tooltip(() => t("header.bossHealth", "Boss Health"))}>BOSS</span
      >
      {#if displayBosses.length > 0}
        <div
          class="flex min-w-0 max-w-full gap-x-4 gap-y-1 overflow-hidden"
          class:flex-col={h.bossHealthLayout !== "horizontal"}
          class:flex-row={h.bossHealthLayout === "horizontal"}
          class:flex-wrap={h.bossHealthLayout === "horizontal"}
        >
          {#each displayBosses as boss (boss.uid)}
            {@const hpPercent =
              boss.maxHp && boss.currentHp !== null
                ? Math.min(100, Math.max(0, (boss.currentHp / boss.maxHp) * 100))
                : 0}
            {@const localizedBossName = localizeRawMonsterName(boss.name, boss.name)}
            <div class="flex min-w-0 items-center gap-1 whitespace-nowrap">
              <span
                class="min-w-0 truncate text-foreground font-semibold tracking-tight"
                style="font-size: {h.bossHealthNameFontSize}px"
                {@attach tooltip(() => localizedBossName)}>{localizedBossName} -</span
              >
              <span
                class="tabular-nums font-semibold text-foreground"
                style="font-size: {h.bossHealthValueFontSize}px"
              >
                <AbbreviatedNumber num={boss.currentHp !== null ? boss.currentHp : 0} />
                {#if boss.maxHp}
                  <span> / <AbbreviatedNumber num={boss.maxHp} /></span>
                  <span
                    class="text-destructive ml-1"
                    style="font-size: {h.bossHealthPercentFontSize}px"
                    >({hpPercent.toFixed(1)}%)</span
                  >
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <span
          class="text-neutral-500 font-medium italic"
          style="font-size: {h.bossHealthNameFontSize}px">{t("header.noBoss", "No Boss")}</span
        >
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet navigationTabsItem()}
  {#if h.showNavigationTabs}
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
        onclick={() => goto(resolve("/live/dps"))}>DPS</button
      >
      <button
        class="transition-all duration-200 font-bold tracking-wider uppercase border-r border-border whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
          'heal',
        )
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
        style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
        aria-current={$page.url.pathname.includes("heal") ? "page" : undefined}
        onclick={() => goto(resolve("/live/heal"))}>HEAL</button
      >
      <button
        class="transition-all duration-200 font-bold tracking-wider uppercase {h.showDeathTab
          ? 'border-r border-border'
          : ''} whitespace-nowrap h-full flex items-center {$page.url.pathname.includes(
          'tanked',
        )
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
        style="font-size: {h.navTabFontSize}px; padding: {h.navTabPaddingY}px {h.navTabPaddingX}px"
        aria-current={$page.url.pathname.includes("tanked") ? "page" : undefined}
        onclick={() => goto(resolve("/live/tanked"))}>TANKED</button
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
          onclick={() => goto(resolve("/live/death"))}>DEATH</button
        >
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet controlButtonsItem()}
  {#if hasRow1Right}
    <div class="flex items-center justify-end gap-2 shrink-0">
      {#if trainingDummySettings.showHeaderControl}
        <button
          class="{isTrainingDummyActive
            ? 'bg-muted text-foreground border-border shadow-sm'
            : 'text-muted-foreground border-transparent'} hover:text-foreground hover:bg-popover/60 rounded-lg border transition-all duration-200 disabled:opacity-60"
          style="padding: {h.pauseButtonPadding}px"
          aria-pressed={isTrainingDummyActive}
          aria-label={isTrainingDummyActive
            ? t("header.training.disableMode", "Disable Training Dummy Mode")
            : t("header.training.enableMode", "Enable Training Dummy Mode")}
          disabled={trainingDummyBusy}
          onclick={toggleTrainingDummyMode}
          {@attach tooltip(() =>
            isTrainingDummyActive
              ? t("header.training.disableMode", "Disable Training Dummy Mode")
              : t("header.training.enableMode", "Enable Training Dummy Mode"))}
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
          {@attach tooltip(() => t("header.resetEncounter", "Reset Encounter"))}
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
              {@attach tooltip(() => t("header.resumeEncounter", "Resume Encounter"))}
              style="width: {h.pauseButtonSize}px; height: {h.pauseButtonSize}px"
            />
          {:else}
            <PauseIcon
              {@attach tooltip(() => t("header.pauseEncounter", "Pause Encounter"))}
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
          {@attach tooltip(() => t("header.settings", "Settings"))}
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
          {@attach tooltip(() => t("header.minimize", "Minimize"))}
        >
          <MinusIcon
            style="width: {h.minimizeButtonSize}px; height: {h.minimizeButtonSize}px"
          />
        </button>
      {/if}
    </div>
  {/if}
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
{:else if hasRow1 || hasRow2 || hasBossRow}
  <header
    data-tauri-drag-region
    class="grid w-full grid-cols-[1fr_auto] gap-y-2 text-sm"
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
                style="font-size: {h.timerLabelFontSize}px">{t("header.timer", "Timer")}</span
              >
            {/if}
            <span
              class="font-bold text-foreground tabular-nums tracking-tight leading-none"
              style="font-size: {h.timerFontSize}px"
              {@attach tooltip(() => t("header.timeElapsed", "Time Elapsed"))}
              >{formatElapsed(displayElapsedMs)}</span
            >
            {#if h.showActiveTimer}
              <span
                class="font-bold text-foreground tabular-nums tracking-tight leading-none"
                style="font-size: {h.activeTimerFontSize}px"
                {@attach tooltip(() => t("header.activeCombatTime", "Active Combat Time"))}
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
        {/if}

      </div>
    {/if}

    <!-- Row 1, Col 2: Control Buttons -->
    {#if hasRow1Right}
      <div
        class="col-start-2 row-start-1 flex items-center justify-self-end gap-2 shrink-0"
      >
        {#if trainingDummySettings.showHeaderControl}
          <button
            class="{isTrainingDummyActive
              ? 'bg-muted text-foreground border-border shadow-sm'
              : 'text-muted-foreground border-transparent'} hover:text-foreground hover:bg-popover/60 rounded-lg border transition-all duration-200 disabled:opacity-60"
            style="padding: {h.pauseButtonPadding}px"
            aria-pressed={isTrainingDummyActive}
            aria-label={isTrainingDummyActive
              ? t("header.training.disableMode", "Disable Training Dummy Mode")
              : t("header.training.enableMode", "Enable Training Dummy Mode")}
            disabled={trainingDummyBusy}
            onclick={toggleTrainingDummyMode}
            {@attach tooltip(() =>
              isTrainingDummyActive
                ? t("header.training.disableMode", "Disable Training Dummy Mode")
                : t("header.training.enableMode", "Enable Training Dummy Mode"))}
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
            {@attach tooltip(() => t("header.resetEncounter", "Reset Encounter"))}
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
                {@attach tooltip(() => t("header.resumeEncounter", "Resume Encounter"))}
                style="width: {h.pauseButtonSize}px; height: {h.pauseButtonSize}px"
              />
            {:else}
              <PauseIcon
                {@attach tooltip(() => t("header.pauseEncounter", "Pause Encounter"))}
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
            {@attach tooltip(() => t("header.settings", "Settings"))}
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
            {@attach tooltip(() => t("header.minimize", "Minimize"))}
          >
            <MinusIcon
              style="width: {h.minimizeButtonSize}px; height: {h.minimizeButtonSize}px"
            />
          </button>
        {/if}
      </div>
    {/if}

    <!-- Row 2, Col 1: Stats summary -->
    {#if hasRow2Left}
      <div
        class="col-start-1 row-start-2 flex min-w-0 items-center overflow-hidden"
      >
        <div class="flex items-center gap-8 overflow-hidden">
          {#if h.showTotalDamage}
            <div class="flex items-center gap-2 shrink-0">
              <span
                class="font-bold text-muted-foreground uppercase tracking-wider"
                style="font-size: {h.totalDamageLabelFontSize}px"
                {@attach tooltip(() => t("header.totalDamage", "Total Damage Dealt"))}>T.DMG</span
              >
              <span
                class="font-bold text-foreground"
                style="font-size: {h.totalDamageValueFontSize}px"
                {@attach tooltip(() =>
                  displayHeaderInfo.totalDmg.toLocaleString(),
                )}
                ><AbbreviatedNumber
                  num={Number(displayHeaderInfo.totalDmg)}
                /></span
              >
            </div>
          {/if}

          {#if h.showTotalDps}
            <div class="flex items-center gap-2 shrink-0">
              <span
                class="font-bold text-muted-foreground uppercase tracking-wider"
                style="font-size: {h.totalDpsLabelFontSize}px"
                {@attach tooltip(() => t("header.totalDps", "Total Damage per Second"))}>T.DPS</span
              >
              <span
                class="font-bold text-foreground"
                style="font-size: {h.totalDpsValueFontSize}px"
                {@attach tooltip(() =>
                  displayHeaderInfo.totalDps.toLocaleString(),
                )}><AbbreviatedNumber num={displayHeaderInfo.totalDps} /></span
              >
            </div>
          {/if}
        </div>
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
          onclick={() => goto(resolve("/live/dps"))}>DPS</button
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
          onclick={() => goto(resolve("/live/heal"))}>HEAL</button
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
          onclick={() => goto(resolve("/live/tanked"))}>TANKED</button
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
            onclick={() => goto(resolve("/live/death"))}>DEATH</button
          >
        {/if}
      </div>
    {/if}

    {#if hasBossRow}
      <div class="col-span-2 row-start-3 min-w-0 overflow-hidden" data-tauri-drag-region>
        {@render bossHealthItem()}
      </div>
    {/if}
  </header>
{/if}
