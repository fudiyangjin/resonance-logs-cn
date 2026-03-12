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

  const ATTR_OPTIONS = [
    { id: 1110, label: "STR Boost" },
    { id: 1111, label: "AGI Boost" },
    { id: 1112, label: "INT Boost" },
    { id: 1113, label: "Special ATK DMG" },
    { id: 1114, label: "Elite Strike" },
    { id: 1205, label: "Special ATK Heal Boost" },
    { id: 1206, label: "Mastery Heal Boost" },
    { id: 1407, label: "Cast Focus" },
    { id: 1408, label: "ATK Speed Focus" },
    { id: 1409, label: "Crit Focus" },
    { id: 1410, label: "Luck Focus" },
    { id: 1307, label: "Magic Resist" },
    { id: 1308, label: "Physical Resist" },
    { id: 2104, label: "EX – DMG Stack" },
    { id: 2105, label: "EX – Agile Body" },
    { id: 2204, label: "EX – HP Condensation" },
    { id: 2205, label: "EX – First Aid" },
    { id: 2404, label: "EX – HP Wave" },
    { id: 2405, label: "EX – Life Drain" },
    { id: 2406, label: "EX – Team Luck/Crit" },
    { id: 2304, label: "EX – Last Stand" },
  ];

  async function refreshModules() {
    if (MODULE_CALC.loading) return;
    MODULE_CALC.loading = true;
    MODULE_CALC.error = null;
    try {
      MODULE_CALC.modules = await getLatestModules();
      MODULE_CALC.moduleCount = MODULE_CALC.modules.length;
    } catch (e) {
      MODULE_CALC.error = (e as Error)?.message ?? "Failed to fetch modules";
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

      const payload = {
        targetAttributes: [...MODULE_CALC.targetAttributes],
        excludeAttributes: [...MODULE_CALC.excludeAttributes],
        minAttrRequirements: minMap,
        useGpu: MODULE_CALC.useGpu,
      };

      console.log("Calling optimize_latest_modules with:", payload);

      MODULE_CALC.solutions = await optimizeLatestModules(payload);
      if (MODULE_CALC.solutions.length === 0) {
        MODULE_CALC.error = "No solutions found. Please adjust your filter settings.";
      }
    } catch (e) {
      console.error("Optimize error:", e);
      if (typeof e === "string") {
        MODULE_CALC.error = e;
      } else if (e instanceof Error) {
        MODULE_CALC.error = e.message;
      } else {
        MODULE_CALC.error = "Calculation failed: " + JSON.stringify(e);
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
        <h1 class="text-xl font-bold text-foreground">Module Calculator</h1>
        <p class="text-sm text-muted-foreground">Calculate and optimize module configurations</p>
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
        Refresh Data
      </Button>
      <Button
        onclick={runOptimize}
        disabled={MODULE_CALC.loading || (MODULE_CALC.moduleCount || 0) < 4}
      >
        {#if MODULE_CALC.loading}
          <Loader2 class="w-4 h-4 mr-2 animate-spin" />
        {:else}
          <PlayIcon class="w-4 h-4 mr-2" />
        {/if}
        Run Optimizer
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
    <DataStatus moduleCount={MODULE_CALC.moduleCount} />
    <CalcSettings
      bind:useGpu={MODULE_CALC.useGpu}
      bind:gpuSupport={MODULE_CALC.gpuSupport}
    />
  </div>

  <FilterSettings
    attributeOptions={ATTR_OPTIONS}
    bind:targetAttributes={MODULE_CALC.targetAttributes}
    bind:excludeAttributes={MODULE_CALC.excludeAttributes}
    bind:minRequirements={MODULE_CALC.minRequirements}
  />

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="text-base font-semibold text-foreground">
        Results (Top 10)
      </div>
      {#if MODULE_CALC.loading}
        <div class="flex flex-col gap-1 w-64">
          <div
            class="flex items-center justify-end text-xs text-muted-foreground"
          >
            <Loader2 class="w-3 h-3 mr-1 animate-spin" />
            <span>
              Calculating... {MODULE_CALC.progress.max > 0
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
