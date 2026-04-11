<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import CalculatorIcon from "virtual:icons/lucide/calculator";
  import RefreshCw from "virtual:icons/lucide/refresh-cw";
  import PlayIcon from "virtual:icons/lucide/play";
  import AlertTriangle from "virtual:icons/lucide/alert-triangle";
  import Loader2 from "virtual:icons/lucide/loader-2";

  import DataStatus from "./data-status.svelte";
  import FilterSettings from "./filter-settings.svelte";
  import CalcSettings from "./calc-settings.svelte";
  import ResultsTable from "./results-table.svelte";
  import ModuleDetail from "./module-detail.svelte";

  import {
    getLatestModules,
    optimizeLatestModules,
    type ModuleSolution,
  } from "$lib/api";
  import { invoke } from "@tauri-apps/api/core";

  import {
    MODULE_CALC,
    ensureModuleCalcProgressListener,
  } from "$lib/stores/module-calc-store.svelte";
  import { resolveModuleCalcTranslation } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";

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

  async function refreshModules() {
    if (MODULE_CALC.loading) return;
    MODULE_CALC.loading = true;
    MODULE_CALC.error = null;
    try {
      MODULE_CALC.modules = await getLatestModules();
      MODULE_CALC.moduleCount = MODULE_CALC.modules.length;
    } catch (e) {
      MODULE_CALC.error =
        (e as Error)?.message ??
        resolveModuleCalcTranslation(
          "fetchModulesFailed",
          SETTINGS.live.general.state.language,
          "拉取模组失败",
        );
    } finally {
      MODULE_CALC.loading = false;
    }
  }

  async function refreshGpuSupport() {
    try {
      MODULE_CALC.gpuSupport = await invoke("check_gpu_support");
    } catch (_) {
      MODULE_CALC.gpuSupport = null;
    }
  }

  async function runOptimize() {
    if (MODULE_CALC.loading) return;
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

      console.log("Calling optimize_latest_modules with:", payload);

      MODULE_CALC.solutions = await optimizeLatestModules(payload);
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
        MODULE_CALC.error = e;
      } else if (e instanceof Error) {
        MODULE_CALC.error = e.message;
      } else {
        MODULE_CALC.error =
          resolveModuleCalcTranslation(
            "calculationFailed",
            SETTINGS.live.general.state.language,
            "计算失败",
          ) + ": " + JSON.stringify(e);
      }
    } finally {
      MODULE_CALC.loading = false;
    }
  }

  function openDetail(sol: ModuleSolution) {
    MODULE_CALC.detailSolution = sol;
    MODULE_CALC.detailOpen = true;
  }

  onMount(async () => {
    refreshModules();
    refreshGpuSupport();
    await ensureModuleCalcProgressListener();
  });
</script>

<div class="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
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
        onclick={refreshModules}
        disabled={MODULE_CALC.loading}
      >
        {#if MODULE_CALC.loading}
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
        disabled={MODULE_CALC.loading || (MODULE_CALC.moduleCount || 0) < MODULE_CALC.combinationSize}
      >
        {#if MODULE_CALC.loading}
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

  <div class="grid gap-4 md:grid-cols-2">
    <DataStatus
      moduleCount={MODULE_CALC.moduleCount}
      modules={MODULE_CALC.modules}
      minTotalValue={MODULE_CALC.minTotalValue}
    />
    <CalcSettings
      bind:useGpu={MODULE_CALC.useGpu}
      bind:gpuSupport={MODULE_CALC.gpuSupport}
      bind:combinationSize={MODULE_CALC.combinationSize}
    />
  </div>

  <FilterSettings
    attributeOptions={ATTR_OPTIONS}
    bind:targetAttributes={MODULE_CALC.targetAttributes}
    bind:excludeAttributes={MODULE_CALC.excludeAttributes}
    bind:minTotalValue={MODULE_CALC.minTotalValue}
    bind:minRequirements={MODULE_CALC.minRequirements}
  />

  <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="text-base font-semibold text-foreground">
        {resolveModuleCalcTranslation(
          "resultsTop10",
          SETTINGS.live.general.state.language,
          "计算结果 (Top 10)",
        )}
      </div>
      {#if MODULE_CALC.loading}
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
    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <ResultsTable solutions={MODULE_CALC.solutions} onview={openDetail} />
    </div>
  </div>

  <ModuleDetail
    bind:open={MODULE_CALC.detailOpen}
    bind:solution={MODULE_CALC.detailSolution}
  />
</div>
