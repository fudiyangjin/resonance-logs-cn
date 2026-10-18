<script lang="ts">
  /**
   * @file One-line damage target filter for the DPS pages while a saved
   * encounter is displayed. Live data has no per-target breakdown, so the
   * strip renders nothing outside history mode.
   */
  import type { Attachment } from "svelte/attachments";
  import { formatNumber, t } from "$lib/i18n/index.svelte";
  import { ipcRatio } from "$lib/ipc-decimal";
  import { liveView } from "$lib/stores/live-view-source.svelte";
  import { tooltip } from "$lib/utils.svelte";

  const targets = $derived(liveView.targets);
  const totalDamage = $derived(
    targets.reduce((sum, target) => sum + target.totalValue, 0n),
  );

  // The strip is one line: let the vertical wheel scroll it sideways.
  const wheelScrollsSideways: Attachment<HTMLElement> = (node) => {
    const onWheel = (event: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      node.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  };

  const revealWhenActive: Attachment<HTMLElement> = (node) => {
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
</script>

{#snippet chip(
  targetUuid: string | null,
  label: string,
  share: string | null,
  hint: string,
)}
  {@const active = liveView.targetUuid === targetUuid}
  <button
    type="button"
    aria-pressed={active}
    class="inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] leading-none whitespace-nowrap transition-colors {active
      ? 'border-primary/50 bg-primary/15 text-foreground'
      : 'border-border/60 text-muted-foreground hover:bg-popover/60 hover:text-foreground'}"
    onclick={() => liveView.setTarget(targetUuid)}
    {@attach tooltip(() => hint)}
    {@attach active && revealWhenActive}
  >
    <span class="truncate">{label}</span>
    {#if share}
      <span class="shrink-0 tabular-nums opacity-70">{share}</span>
    {/if}
  </button>
{/snippet}

{#if targets.length > 0}
  <div
    class="mb-1 flex items-center gap-1 overflow-x-auto"
    role="toolbar"
    aria-label={t("live.history.target.label")}
    {@attach wheelScrollsSideways}
  >
    <span
      class="text-muted-foreground shrink-0 pr-0.5 text-[10px] font-semibold tracking-wider"
      >{t("live.history.target.label")}</span
    >
    {@render chip(
      null,
      t("history.detail.target.total"),
      null,
      t("history.detail.target.total"),
    )}
    {#each targets as target (target.targetEntityUuid)}
      {@render chip(
        target.targetEntityUuid,
        target.targetName,
        `${formatNumber(ipcRatio(target.totalValue, totalDamage, 100), {
          maximumFractionDigits: 0,
        })}%`,
        `${target.targetName} · ${formatNumber(Number(target.totalValue))}`,
      )}
    {/each}
  </div>
{/if}
