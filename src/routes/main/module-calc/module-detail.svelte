<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { ModuleSolution } from "$lib/api";
  import AttrBadge, { sortAttrEntries } from "./attr-badge.svelte";
  import { resolveModuleCalcTranslation } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";

  let { open = $bindable(false), solution = $bindable<ModuleSolution | null>(null) } = $props();

  function closeDialog() {
    open = false;
  }

  function getQualityClass(quality: number) {
    if (quality >= 6) {
      return "border-amber-400/35 bg-amber-500/10 text-amber-300";
    }
    if (quality >= 5) {
      return "border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-300";
    }
    if (quality >= 4) {
      return "border-sky-400/35 bg-sky-500/10 text-sky-300";
    }
    if (quality >= 3) {
      return "border-emerald-400/35 bg-emerald-500/10 text-emerald-300";
    }
    return "border-border/60 bg-muted/40 text-muted-foreground";
  }

  function getTotalValue(parts: ModuleSolution["modules"][number]["parts"]) {
    return parts.reduce((sum, part) => sum + part.value, 0);
  }

  function moduleName(configId: number, fallback: string) {
    return resolveModuleCalcTranslation(
      `module.${configId}`,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }
</script>

{#if open && solution}
  <div
    class="fixed inset-0 z-50 bg-black/70 px-4 py-6 backdrop-blur-sm"
    role="presentation"
    onclick={closeDialog}
  >
    <div class="mx-auto flex h-full w-full max-w-5xl items-center justify-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={resolveModuleCalcTranslation(
          "detailDialogLabel",
          SETTINGS.live.general.state.language,
          "模组方案详情",
        )}
        tabindex="-1"
        class="flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl"
        onclick={(event) => event.stopPropagation()}
        onkeydown={(event) => event.stopPropagation()}
      >
        <div class="border-b border-border/50 bg-gradient-to-br from-primary/8 via-card to-card p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-3">
              <div class="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                {resolveModuleCalcTranslation(
                  "detailTitle",
                  SETTINGS.live.general.state.language,
                  "方案详情",
                )}
              </div>
              <div class="flex flex-wrap items-end gap-3">
                <div class="text-3xl font-semibold text-foreground">{solution.score}</div>
                <div class="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-sm text-muted-foreground">
                  {resolveModuleCalcTranslation(
                    "totalScore",
                    SETTINGS.live.general.state.language,
                    "总分",
                  )}
                </div>
                <div class="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-sm text-muted-foreground">
                  {solution.modules.length} {resolveModuleCalcTranslation(
                    "moduleCountSuffix",
                    SETTINGS.live.general.state.language,
                    "个模组",
                  )}
                </div>
              </div>
            </div>

            <Button size="sm" variant="ghost" onclick={closeDialog}>
              {resolveModuleCalcTranslation(
                "close",
                SETTINGS.live.general.state.language,
                "关闭",
              )}
            </Button>
          </div>

          <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {#each sortAttrEntries(Object.entries(solution.attr_breakdown)) as [name, value]}
              <AttrBadge {name} {value} />
            {/each}
          </div>
        </div>

        <div class="space-y-3 overflow-y-auto p-5">
          {#each solution.modules as mod, idx}
            {@const parts = mod.parts}
            {@const totalValue = getTotalValue(mod.parts)}
            <section class="rounded-xl border border-border/50 bg-muted/20 p-4 shadow-sm">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <div class="flex size-8 items-center justify-center rounded-xl bg-background text-sm font-semibold text-muted-foreground">
                      {idx + 1}
                    </div>
                    <h3 class="text-base font-semibold text-foreground">{moduleName(mod.config_id, mod.name)}</h3>
                    <div
                      class={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getQualityClass(mod.quality)}`}
                    >
                      {resolveModuleCalcTranslation(
                        "quality",
                        SETTINGS.live.general.state.language,
                        "品质",
                      )} {mod.quality}
                    </div>
                  </div>
                </div>

                <div class="rounded-xl border border-border/50 bg-background/70 px-3 py-2 lg:text-right">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {resolveModuleCalcTranslation(
                      "totalAttributesValue",
                      SETTINGS.live.general.state.language,
                      "属性总值",
                    )}
                  </div>
                  <div class="mt-1 text-lg font-semibold text-foreground">{totalValue}</div>
                </div>
              </div>

              <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {#each parts as part}
                  <AttrBadge name={part.name} value={part.value} compact />
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
