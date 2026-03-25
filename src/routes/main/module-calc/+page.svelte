<script lang="ts">
  import { onMount } from "svelte";
  import { tl } from "$lib/i18n/index.svelte";
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

  const ATTR_OPTIONS = [
    { id: 1110, labelKey: "Strength Blessing" },
    { id: 1111, labelKey: "Agility Blessing" },
    { id: 1112, labelKey: "Intelligence Blessing" },
    { id: 1113, labelKey: "Special Attack Damage" },
    { id: 1114, labelKey: "Elite Strike" },
    { id: 1205, labelKey: "Special Attack Healing Blessing" },
    { id: 1206, labelKey: "Specialization Healing Blessing" },
    { id: 1407, labelKey: "Casting Focus" },
    { id: 1408, labelKey: "Attack Speed Focus" },
    { id: 1409, labelKey: "Crit Focus" },
    { id: 1410, labelKey: "Luck Focus" },
    { id: 1307, labelKey: "Magic Resistance" },
    { id: 1308, labelKey: "Physical Resistance" },
    { id: 2104, labelKey: "Ultimate - Damage Stacking" },
    { id: 2105, labelKey: "Ultimate - Agile Footwork" },
    { id: 2204, labelKey: "Ultimate - Life Condensation" },
    { id: 2205, labelKey: "Ultimate - Emergency Measures" },
    { id: 2404, labelKey: "Ultimate - Life Fluctuation" },
    { id: 2405, labelKey: "Ultimate - Life Drain" },
    { id: 2406, labelKey: "Ultimate - Team Lucky Crit" },
    { id: 2304, labelKey: "Ultimate - Last Stand Guard" },
  ];

  async function refreshModules() {
    if (MODULE_CALC.loading) return;
    MODULE_CALC.loading = true;
    MODULE_CALC.error = null;
    try {
      MODULE_CALC.modules = await getLatestModules();
      MODULE_CALC.moduleCount = MODULE_CALC.modules.length;
    } catch (e) {
      MODULE_CALC.error = (e as Error)?.message ?? tl("Failed to load modules");
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
          .map((m) => [m.attrId as number, m.value as number])
      );

      // Deep clone/snapshot to ensure no Proxy issues passed to invoke
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
        MODULE_CALC.error = tl("No valid solutions were found. Adjust the filters and try again.");
      }
    } catch (e) {
      console.error("Optimize error:", e);
      if (typeof e === "string") {
        MODULE_CALC.error = e;
      } else if (e instanceof Error) {
        MODULE_CALC.error = e.message;
      } else {
        MODULE_CALC.error = `${tl("Calculation failed: ")}${JSON.stringify(e)}`;
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

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div
        class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary"
      >
        <CalculatorIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{tl("Module Calculator")}</h1>
        <p class="text-sm text-muted-foreground">{tl("Calculate and optimize module setups")}</p>
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
        {tl("Refresh Data")}
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
        {tl("Start Calculation")}
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

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="text-base font-semibold text-foreground">
        {tl("Results (Top 10)")}
      </div>
      {#if MODULE_CALC.loading}
        <div class="flex flex-col gap-1 w-64">
          <div
            class="flex items-center justify-end text-xs text-muted-foreground"
          >
            <Loader2 class="w-3 h-3 mr-1 animate-spin" />
            <span>
              {MODULE_CALC.combinationSize === 5
                ? tl("Running multi-strategy calculation...")
                : tl("Calculating...")} {MODULE_CALC.progress.max > 0
                ? `${Math.round((MODULE_CALC.progress.value / MODULE_CALC.progress.max) * 100)}%`
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
    <ResultsTable
      solutions={MODULE_CALC.solutions}
      onview={openDetail}
    />
  </div>

  <ModuleDetail
    bind:open={MODULE_CALC.detailOpen}
    bind:solution={MODULE_CALC.detailSolution}
  />
</div>
