<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import CalculatorIcon from "virtual:icons/lucide/calculator";
  import RefreshCw from "virtual:icons/lucide/refresh-cw";
  import PlayIcon from "virtual:icons/lucide/play";
  import AlertTriangle from "virtual:icons/lucide/alert-triangle";
  import Loader2 from "virtual:icons/lucide/loader-2";

  import DataStatus from "./data-status.svelte";
  import FilterSettings from "./filter-settings.svelte";
  import CalcSettings from "./calc-settings.svelte";
  import GpuSettings from "./gpu-settings.svelte";
  import ResultsTable from "./results-table.svelte";
  import ModuleDetail from "./module-detail.svelte";

  import {
    getLatestModuleStatus,
    optimizeLatestModules,
    type ModuleSolution,
  } from "$lib/api";
  import { invoke } from "@tauri-apps/api/core";

  import {
    MODULE_CALC,
    ensureModuleCalcProgressListener,
  } from "$lib/stores/module-calc-store.svelte";
  import { resolveModuleCalcTranslation } from "$lib/i18n";
  import {
    SETTINGS,
    normalizeModuleCalcProfileSettings,
    type ModuleCalcProfileSettings,
  } from "$lib/settings-store";
  import { clampedProfileIndex } from "$lib/skill-monitor-profile.svelte";

  const ATTR_OPTIONS_BASE = [
    { id: 1110, label: "力量加持" },
    { id: 1111, label: "敏捷加持" },
    { id: 1112, label: "智力加持" },
    { id: 1113, label: "特攻伤害" },
    { id: 1114, label: "精英打击" },
    { id: 1205, label: "特攻治疗加持" },
    { id: 1206, label: "专精治疗加持" },
    { id: 1407, label: "施法专注" },
    { id: 1408, label: "攻速专注" },
    { id: 1409, label: "暴击专注" },
    { id: 1410, label: "幸运专注" },
    { id: 1307, label: "抵御魔法" },
    { id: 1308, label: "抵御物理" },
    { id: 2104, label: "极-伤害叠加" },
    { id: 2105, label: "极-灵活身法" },
    { id: 2204, label: "极-生命凝聚" },
    { id: 2205, label: "极-急救措施" },
    { id: 2404, label: "极-生命波动" },
    { id: 2405, label: "极-生命汲取" },
    { id: 2406, label: "极-全队幸暴" },
    { id: 2304, label: "极-绝境守护" },
  ];

  const ATTR_OPTIONS = $derived.by(() =>
    ATTR_OPTIONS_BASE.map((option) => ({
      ...option,
      label: resolveModuleCalcTranslation(
        `attr.${option.id}`,
        SETTINGS.live.general.state.language,
        option.label,
      ),
    })),
  );

  let appliedProfileIndex = $state<number | null>(null);
  let applyingProfileSettings = $state(false);
  let savedModuleCalcProfileSignature: string | null = null;
  let refreshRequestId = 0;
  let gpuRequestId = 0;
  let refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let profileSaveTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const MODULE_REFRESH_TIMEOUT_MS = 8_000;
  const GPU_REFRESH_TIMEOUT_MS = 5_000;
  const CALCULATION_TIMEOUT_MS = 120_000;
  const MODULE_CALC_PROFILE_MEMORY_ENABLED = true;

  function cloneMinRequirements(
    rows: ModuleCalcProfileSettings["minRequirements"],
  ): ModuleCalcProfileSettings["minRequirements"] {
    return rows.map((row) => ({
      attrId: row.attrId ?? null,
      value: row.value ?? null,
    }));
  }

  function moduleCalcProfileSignature(
    settings: ModuleCalcProfileSettings,
  ): string {
    return JSON.stringify(settings);
  }

  function moduleCalcProfileMemoryKey(profileIndex: number): string {
    return String(profileIndex);
  }

  function loadModuleCalcProfileSettings(
    profileIndex: number,
  ): ModuleCalcProfileSettings {
    const profileSettings = SETTINGS.moduleCalc.state.profileSettings ?? {};
    return normalizeModuleCalcProfileSettings(
      profileSettings[moduleCalcProfileMemoryKey(profileIndex)],
    );
  }

  function applyModuleCalcProfileSettings(settings: ModuleCalcProfileSettings) {
    const normalized = normalizeModuleCalcProfileSettings(settings);
    savedModuleCalcProfileSignature = moduleCalcProfileSignature(normalized);
    MODULE_CALC.useGpu = normalized.useGpu;
    MODULE_CALC.combinationSize = normalized.combinationSize;
    MODULE_CALC.targetAttributes = [...normalized.targetAttributes];
    MODULE_CALC.excludeAttributes = [...normalized.excludeAttributes];
    MODULE_CALC.minTotalValue = normalized.minTotalValue;
    MODULE_CALC.filteredModuleCount = null;
    MODULE_CALC.filteredModuleCountMinTotalValue = null;
    MODULE_CALC.minRequirements = cloneMinRequirements(normalized.minRequirements);
    MODULE_CALC.solutions = [];
    MODULE_CALC.error = null;
    MODULE_CALC.refreshStatusMessage = null;
    MODULE_CALC.detailOpen = false;
    MODULE_CALC.detailSolution = null;
    MODULE_CALC.progress = { value: 0, max: 0 };
  }

  function snapshotModuleCalcProfileSettings(): ModuleCalcProfileSettings {
    return normalizeModuleCalcProfileSettings({
      useGpu: MODULE_CALC.useGpu,
      combinationSize: MODULE_CALC.combinationSize,
      targetAttributes: [...MODULE_CALC.targetAttributes],
      excludeAttributes: [...MODULE_CALC.excludeAttributes],
      minTotalValue: MODULE_CALC.minTotalValue,
      minRequirements: cloneMinRequirements(MODULE_CALC.minRequirements),
    });
  }

  function t(key: string, fallback: string): string {
    return resolveModuleCalcTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function moduleDataUnavailableMessage(): string {
    return t(
      "moduleDataUnavailable",
      "Module data is not synced yet. Open the game on a character with modules, then refresh data.",
    );
  }

  function normalizeErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === "string") return error;
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  }

  type ModuleStatusResponseShape = {
    moduleCount?: unknown;
    module_count?: unknown;
    filteredTotalValueCount?: unknown;
    filtered_total_value_count?: unknown;
  };

  function stringifyStatusPayload(payload: unknown): string {
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  function unwrapModuleStatusPayload(payload: unknown): unknown {
    if (!payload || typeof payload !== "object") return payload;
    const maybeResult = payload as { status?: unknown; data?: unknown };
    if (maybeResult.status === "ok" && "data" in maybeResult) {
      return maybeResult.data;
    }
    return payload;
  }

  function readModuleStatusNumber(
    payload: ModuleStatusResponseShape,
    camelKey: "moduleCount" | "filteredTotalValueCount",
    snakeKey: "module_count" | "filtered_total_value_count",
  ): number | null {
    const value = payload[camelKey] ?? payload[snakeKey];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function normalizeModuleStatusResponse(payload: unknown): {
    moduleCount: number;
    filteredTotalValueCount: number;
  } {
    const unwrapped = unwrapModuleStatusPayload(payload);
    if (!unwrapped || typeof unwrapped !== "object") {
      throw new Error(
        `Unexpected module status response: ${stringifyStatusPayload(payload)}`,
      );
    }

    const status = unwrapped as ModuleStatusResponseShape;
    const moduleCount = readModuleStatusNumber(
      status,
      "moduleCount",
      "module_count",
    );
    const filteredTotalValueCount = readModuleStatusNumber(
      status,
      "filteredTotalValueCount",
      "filtered_total_value_count",
    );

    if (moduleCount === null || filteredTotalValueCount === null) {
      throw new Error(
        `Unexpected module status response: ${stringifyStatusPayload(payload)}`,
      );
    }

    return { moduleCount, filteredTotalValueCount };
  }

  async function withTimeout<T>(
    start: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([start(), timeout]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  function clearModuleRefreshTimeout() {
    if (!refreshTimeoutId) return;
    clearTimeout(refreshTimeoutId);
    refreshTimeoutId = null;
  }

  function clearModuleCalcProfileSaveTimeout() {
    if (!profileSaveTimeoutId) return;
    clearTimeout(profileSaveTimeoutId);
    profileSaveTimeoutId = null;
  }

  function persistModuleCalcProfileSettings() {
    if (!MODULE_CALC_PROFILE_MEMORY_ENABLED) return;
    if (applyingProfileSettings || appliedProfileIndex === null) return;

    const snapshot = snapshotModuleCalcProfileSettings();
    const signature = moduleCalcProfileSignature(snapshot);
    if (signature === savedModuleCalcProfileSignature) return;

    savedModuleCalcProfileSignature = signature;
    const profileIndex = appliedProfileIndex ?? clampedProfileIndex();
    const key = moduleCalcProfileMemoryKey(profileIndex);
    const profileSettings = SETTINGS.moduleCalc.state.profileSettings ?? {};
    SETTINGS.moduleCalc.state.profileSettings = {
      ...profileSettings,
      [key]: snapshot,
    };
  }

  function scheduleModuleCalcProfileSave() {
    if (!MODULE_CALC_PROFILE_MEMORY_ENABLED) return;
    clearModuleCalcProfileSaveTimeout();
    profileSaveTimeoutId = setTimeout(() => {
      profileSaveTimeoutId = null;
      persistModuleCalcProfileSettings();
    }, 100);
  }

  function resetTransientRequestState() {
    ++refreshRequestId;
    ++gpuRequestId;
    clearModuleRefreshTimeout();
    MODULE_CALC.refreshing = false;
    MODULE_CALC.loading = false;
    MODULE_CALC.calculating = false;
    MODULE_CALC.gpuChecking = false;
    MODULE_CALC.refreshStatusMessage = null;
  }

  function armModuleRefreshTimeout(requestId: number) {
    clearModuleRefreshTimeout();
    refreshTimeoutId = setTimeout(() => {
      if (requestId !== refreshRequestId) return;
      MODULE_CALC.modules = [];
      MODULE_CALC.moduleCount = null;
      MODULE_CALC.filteredModuleCount = null;
      MODULE_CALC.filteredModuleCountMinTotalValue = null;
      MODULE_CALC.error = moduleDataUnavailableMessage();
      MODULE_CALC.refreshStatusMessage = t(
        "moduleRefreshTimedOut",
        "Module refresh timed out.",
      );
      MODULE_CALC.refreshing = false;
      MODULE_CALC.loading = false;
      MODULE_CALC.gpuChecking = false;
      refreshTimeoutId = null;
    }, MODULE_REFRESH_TIMEOUT_MS);
  }

  async function refreshModules(): Promise<boolean | undefined> {
    if (MODULE_CALC.refreshing) {
      return (MODULE_CALC.moduleCount ?? 0) > 0;
    }
    const requestId = ++refreshRequestId;
    MODULE_CALC.refreshing = true;
    MODULE_CALC.loading = true;
    MODULE_CALC.calculating = false;
    MODULE_CALC.error = null;
    MODULE_CALC.refreshStatusMessage = t(
      "checkingModuleData",
      "Checking module data...",
    );
    armModuleRefreshTimeout(requestId);
    try {
      const minTotalValue = MODULE_CALC.minTotalValue;
      MODULE_CALC.refreshStatusMessage = t(
        "requestingModuleStatus",
        "Requesting module status...",
      );
      const rawStatus = await withTimeout(
        () => getLatestModuleStatus(minTotalValue),
        MODULE_REFRESH_TIMEOUT_MS,
        moduleDataUnavailableMessage(),
      );
      const status = normalizeModuleStatusResponse(rawStatus);
      if (requestId !== refreshRequestId) return;
      clearModuleRefreshTimeout();
      MODULE_CALC.modules = [];
      MODULE_CALC.moduleCount = status.moduleCount;
      MODULE_CALC.filteredModuleCount = status.filteredTotalValueCount;
      MODULE_CALC.filteredModuleCountMinTotalValue = minTotalValue;
      MODULE_CALC.refreshStatusMessage = t(
        "moduleDataSyncedWithCounts",
        "Module data synced: {count} modules ({filtered} after filter).",
      )
        .replace("{count}", String(status.moduleCount))
        .replace("{filtered}", String(status.filteredTotalValueCount));
      if (status.moduleCount === 0) {
        MODULE_CALC.error = moduleDataUnavailableMessage();
      }
      return status.moduleCount > 0;
    } catch (e) {
      if (requestId !== refreshRequestId) return false;
      clearModuleRefreshTimeout();
      MODULE_CALC.modules = [];
      MODULE_CALC.moduleCount = null;
      MODULE_CALC.filteredModuleCount = null;
      MODULE_CALC.filteredModuleCountMinTotalValue = null;
      MODULE_CALC.error = normalizeErrorMessage(
        e,
        t("fetchModulesFailed", "Failed to fetch modules"),
      );
      MODULE_CALC.refreshStatusMessage = MODULE_CALC.error;
      MODULE_CALC.error =
        MODULE_CALC.error ??
        resolveModuleCalcTranslation(
          "fetchModulesFailed",
          SETTINGS.live.general.state.language,
          "拉取模组失败",
        );
    } finally {
      if (requestId === refreshRequestId) {
        clearModuleRefreshTimeout();
        MODULE_CALC.refreshing = false;
        MODULE_CALC.loading = false;
      }
    }
    return false;
  }

  async function refreshGpuSupport(force = false) {
    if (MODULE_CALC.gpuChecking || (MODULE_CALC.gpuSupport && !force)) return;
    const requestId = ++gpuRequestId;
    MODULE_CALC.gpuChecking = true;
    if (force) {
      MODULE_CALC.gpuSupport = null;
    }
    MODULE_CALC.gpuError = null;
    try {
      const gpuSupport = await withTimeout(
        () => invoke<{ cuda_available: boolean; opencl_available: boolean }>("check_gpu_support"),
        GPU_REFRESH_TIMEOUT_MS,
        t("gpuCheckUnavailable", "GPU availability check timed out."),
      );
      if (requestId !== gpuRequestId) return;
      MODULE_CALC.gpuSupport = gpuSupport;
      if (!gpuSupport.cuda_available && !gpuSupport.opencl_available) {
        MODULE_CALC.useGpu = false;
      }
    } catch (error) {
      if (requestId !== gpuRequestId) return;
      MODULE_CALC.gpuSupport = { cuda_available: false, opencl_available: false };
      MODULE_CALC.useGpu = false;
      MODULE_CALC.gpuError = normalizeErrorMessage(
        error,
        t("gpuCheckUnavailable", "GPU availability check failed."),
      );
    } finally {
      if (requestId === gpuRequestId) {
        MODULE_CALC.gpuChecking = false;
      }
    }
  }

  async function refreshModulesFromButton() {
    MODULE_CALC.refreshStatusMessage = t(
      "refreshButtonClicked",
      "Refresh Data clicked.",
    );
    await refreshModules();
    MODULE_CALC.gpuChecking = false;
  }

  function normalizeOptimizeErrorMessage(message: string): string {
    const requiresModulesMatch = message.match(/^需要至少\s*(\d+)\s*个模组$/);
    if (requiresModulesMatch) {
      const count = requiresModulesMatch[1] ?? "";
      return resolveModuleCalcTranslation(
        "requiresAtLeastModules",
        SETTINGS.live.general.state.language,
        "Requires at least {count} modules",
      ).replace("{count}", count);
    }

    return message;
  }

  async function runOptimize() {
    if (MODULE_CALC.refreshing || MODULE_CALC.calculating) return;
    if ((MODULE_CALC.moduleCount ?? 0) < MODULE_CALC.combinationSize) {
      MODULE_CALC.error = MODULE_CALC.moduleCount === null
        ? moduleDataUnavailableMessage()
        : t("requiresAtLeastModules", "Requires at least {count} modules")
            .replace("{count}", String(MODULE_CALC.combinationSize));
      return;
    }
    MODULE_CALC.calculating = true;
    MODULE_CALC.loading = true;
    MODULE_CALC.error = null;
    MODULE_CALC.progress = { value: 0, max: 0 };
    try {
      const minMap = Object.fromEntries(
        MODULE_CALC.minRequirements
          .filter((m) => m.attrId && m.value !== null)
          .map((m) => [m.attrId as number, m.value as number]),
      );

      const payload = {
        targetAttributes: [...MODULE_CALC.targetAttributes],
        excludeAttributes: [...MODULE_CALC.excludeAttributes],
        minTotalValue: MODULE_CALC.minTotalValue,
        minAttrRequirements: minMap,
        useGpu: MODULE_CALC.useGpu,
        combinationSize: MODULE_CALC.combinationSize,
      };

      MODULE_CALC.solutions = await withTimeout(
        () => optimizeLatestModules(payload),
        CALCULATION_TIMEOUT_MS,
        t("calculationTimedOut", "Calculation timed out. Try fewer filters or CPU mode, then start again."),
      );
      if (MODULE_CALC.solutions.length === 0) {
        MODULE_CALC.error = resolveModuleCalcTranslation(
          "noSolutions",
          SETTINGS.live.general.state.language,
          "无可用方案，请调整筛选条件",
        );
      }
    } catch (e) {
      console.error("Optimize error:", e);
      if (typeof e === "string") {
        MODULE_CALC.error = normalizeOptimizeErrorMessage(e);
      } else if (e instanceof Error) {
        MODULE_CALC.error = normalizeOptimizeErrorMessage(e.message);
      } else {
        MODULE_CALC.error =
          resolveModuleCalcTranslation(
            "calculationFailed",
            SETTINGS.live.general.state.language,
            "计算失败",
          ) + ": " + JSON.stringify(e);
      }
    } finally {
      MODULE_CALC.calculating = false;
      MODULE_CALC.loading = false;
    }
  }

  function openDetail(sol: ModuleSolution) {
    MODULE_CALC.detailSolution = sol;
    MODULE_CALC.detailOpen = true;
  }

  $effect(() => {
    if (!MODULE_CALC_PROFILE_MEMORY_ENABLED) return;

    const profileIndex = clampedProfileIndex();
    if (appliedProfileIndex === profileIndex) return;

    applyingProfileSettings = true;
    applyModuleCalcProfileSettings(loadModuleCalcProfileSettings(profileIndex));
    appliedProfileIndex = profileIndex;
    queueMicrotask(() => {
      applyingProfileSettings = false;
    });
  });

  onMount(async () => {
    resetTransientRequestState();
    await ensureModuleCalcProgressListener();
  });

  onDestroy(() => {
    clearModuleCalcProfileSaveTimeout();
    persistModuleCalcProfileSettings();
    resetTransientRequestState();
  });
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div
        class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary"
      >
        <CalculatorIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">
          {resolveModuleCalcTranslation(
            "title",
            SETTINGS.live.general.state.language,
            "模组计算",
          )}
        </h1>
        <p class="text-sm text-muted-foreground">
          {resolveModuleCalcTranslation(
            "subtitle",
            SETTINGS.live.general.state.language,
            "计算和优化模组配置",
          )}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        onclick={() => {
          void refreshModulesFromButton();
        }}
        disabled={MODULE_CALC.refreshing}
      >
        {#if MODULE_CALC.refreshing}
          <Loader2 class="w-4 h-4 mr-2 animate-spin" />
        {:else}
          <RefreshCw class="w-4 h-4 mr-2" />
        {/if}
        {resolveModuleCalcTranslation(
          "refreshData",
          SETTINGS.live.general.state.language,
          "刷新数据",
        )}
      </Button>
      <Button
        onclick={runOptimize}
        disabled={MODULE_CALC.refreshing || MODULE_CALC.calculating || (MODULE_CALC.moduleCount || 0) < MODULE_CALC.combinationSize}
      >
        {#if MODULE_CALC.calculating}
          <Loader2 class="w-4 h-4 mr-2 animate-spin" />
        {:else}
          <PlayIcon class="w-4 h-4 mr-2" />
        {/if}
        {resolveModuleCalcTranslation(
          "startCalculation",
          SETTINGS.live.general.state.language,
          "开始计算",
        )}
      </Button>
    </div>
  </div>

  {#if MODULE_CALC.error}
    <div
      class="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive"
    >
      <AlertTriangle class="w-4 h-4" />
      <span class="text-sm">{MODULE_CALC.error}</span>
    </div>
  {/if}

  <div class="grid gap-4 md:grid-cols-3">
    <DataStatus
      moduleCount={MODULE_CALC.moduleCount}
      filteredModuleCount={MODULE_CALC.filteredModuleCount}
      filteredModuleCountMinTotalValue={MODULE_CALC.filteredModuleCountMinTotalValue}
      modules={MODULE_CALC.modules}
      minTotalValue={MODULE_CALC.minTotalValue}
      loading={MODULE_CALC.refreshing}
      refreshStatusMessage={MODULE_CALC.refreshStatusMessage}
      statusMessage={MODULE_CALC.moduleCount === null && !MODULE_CALC.refreshing
        ? moduleDataUnavailableMessage()
        : null}
    />
    <CalcSettings
      bind:combinationSize={MODULE_CALC.combinationSize}
      onsettingschange={scheduleModuleCalcProfileSave}
    />
    <GpuSettings
      bind:useGpu={MODULE_CALC.useGpu}
      bind:gpuSupport={MODULE_CALC.gpuSupport}
      gpuChecking={MODULE_CALC.gpuChecking}
      gpuError={MODULE_CALC.gpuError}
      gpuCheckDeferred={!MODULE_CALC.gpuSupport}
      recheckDisabled={MODULE_CALC.calculating}
      onsettingschange={scheduleModuleCalcProfileSave}
      onrecheck={() => {
        if (!MODULE_CALC.calculating) {
          refreshGpuSupport(true);
        }
      }}
    />
  </div>

  <FilterSettings
    attributeOptions={ATTR_OPTIONS}
    bind:targetAttributes={MODULE_CALC.targetAttributes}
    bind:excludeAttributes={MODULE_CALC.excludeAttributes}
    bind:minTotalValue={MODULE_CALC.minTotalValue}
    bind:minRequirements={MODULE_CALC.minRequirements}
    onsettingschange={scheduleModuleCalcProfileSave}
  />

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="text-base font-semibold text-foreground">
        {resolveModuleCalcTranslation(
          "resultsTop10",
          SETTINGS.live.general.state.language,
          "计算结果 (Top 10)",
        )}
      </div>
      {#if MODULE_CALC.calculating}
        <div class="flex flex-col gap-1 w-64">
          <div
            class="flex items-center justify-end text-xs text-muted-foreground"
          >
            <Loader2 class="w-3 h-3 mr-1 animate-spin" />
            <span>
              {MODULE_CALC.combinationSize === 5
                ? resolveModuleCalcTranslation(
                    "loadingMultiStrategy",
                    SETTINGS.live.general.state.language,
                    "多策略计算中...",
                  )
                : resolveModuleCalcTranslation(
                    "loadingCalculating",
                    SETTINGS.live.general.state.language,
                    "计算中...",
                  )}
              {MODULE_CALC.progress.max > 0
                ? ` ${Math.round((MODULE_CALC.progress.value / MODULE_CALC.progress.max) * 100)}%`
                : ""}
            </span>
          </div>
          {#if MODULE_CALC.progress.max > 0}
            <div
              class="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            >
              <div
                class="h-full bg-primary transition-all duration-300"
                style="width: {(MODULE_CALC.progress.value /
                  MODULE_CALC.progress.max) *
                  100}%"
              ></div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <ResultsTable solutions={MODULE_CALC.solutions} onview={openDetail} />
  </div>

  <ModuleDetail
    bind:open={MODULE_CALC.detailOpen}
    bind:solution={MODULE_CALC.detailSolution}
  />
</div>
