<script lang="ts">
  import { flip } from "svelte/animate";
  import { fly } from "svelte/transition";
  import { orderSkillDamageRows } from "$lib/skill-damage-display";
  import { onMount, untrack } from "svelte";
  import { SETTINGS, defaultSkillDamageDisplay } from "$lib/settings-store";
  import type { SkillDamageHitState } from "$lib/bindings";
  import { liveMonsterStore } from "$lib/stores/live-topics.svelte";
  import { lookupDamageIdName } from "$lib/config/recount-table";
  import { skillDamageDurationMs } from "$lib/skill-damage-display";
  import {
    skillDamageGroups,
    groupSkillDamageRows,
  } from "$lib/skill-damage-groups";
  import { t } from "$lib/i18n/index.svelte";
  import SkillDamageRow from "$lib/components/SkillDamageRow.svelte";
  import {
    isMonsterEditing,
    isMonsterLayoutScaffold,
    getMonsterOverlayVisibility,
    getSkillDamagePanelPosition,
    getSkillDamagePanelScale,
    startMonsterDrag,
    startMonsterResize,
  } from "./monster-state.svelte";

  const fallback = defaultSkillDamageDisplay();
  const config = $derived(
    SETTINGS.monsterMonitor.state.skillDamageDisplay ?? fallback,
  );
  const editing = $derived(isMonsterEditing());
  let now = $state(Date.now());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const visible = $derived(getMonsterOverlayVisibility().showSkillDamagePanel);
  const groups = $derived(skillDamageGroups(config));
  const durationMs = $derived(
    Math.max(
      100,
      ...groups
        .filter((group) => group.enabled)
        .map((group) => skillDamageDurationMs(group.durationMs)),
    ),
  );
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 50);
    return () => clearInterval(timer);
  });
  let retainedHits = $state.raw<SkillDamageHitState[]>([]);
  $effect(() => {
    const timestamp = now;
    const incoming = liveMonsterStore.data?.skillDamageHits ?? [];
    const watched = new Set(
      groups
        .filter((group) => group.enabled)
        .flatMap((group) => group.entries.map((entry) => entry.skillId)),
    );
    const active = config.enabled;
    const lifetime = durationMs;
    const hits = new Map<string, SkillDamageHitState>();
    for (const hit of [...untrack(() => retainedHits), ...incoming]) {
      if (
        active &&
        watched.has(hit.skillId) &&
        timestamp - hit.occurredAtMs < lifetime &&
        timestamp >= hit.occurredAtMs
      )
        hits.set(hit.id, hit);
    }
    retainedHits = [...hits.values()];
  });
  const rows = $derived(groupSkillDamageRows(retainedHits, config, now));
</script>

{#if config.enabled && visible}
  {#each groups.filter((group) => group.enabled) as group (group.id)}
    {@const groupRows = orderSkillDamageRows(
      rows.filter((row) => row.group.id === group.id),
      group.scrollDirection,
    )}
    {@const panelPos = getSkillDamagePanelPosition(group.id)}
    {@const panelScale = getSkillDamagePanelScale(group.id)}
    {#if scaffold || groupRows.length}
      <div
        class="overlay-group skill-damage-panel"
        class:editable={editing}
        style:left={`${panelPos.x}px`}
        style:top={`${panelPos.y}px`}
        style:transform={`scale(${panelScale}) translateY(${group.scrollDirection === "down" ? "0" : "-100%"})`}
        style:transform-origin="top left"
        onpointerdown={(event) =>
          startMonsterDrag(
            event,
            { kind: "skillDamagePanel", groupId: group.id },
            panelPos,
          )}
      >
        {#if scaffold}
          <div class="group-tag">
            {group.name || t("skillDamage.defaultGroup")}
          </div>
          <SkillDamageRow
            config={group}
            label={group.name || t("skillDamage.defaultGroup")}
            amount="123456"
            animated={false}
          />
        {:else}
          {#each groupRows as hit (hit.key)}
            <div
              animate:flip={{ duration: 160 }}
              in:fly={{
                y: group.scrollDirection === "down" ? -14 : 14,
                duration: 120,
              }}
            >
              <SkillDamageRow
                config={group}
                label={hit.merged
                  ? group.name || t("skillDamage.defaultGroup")
                  : group.entries
                      .find((entry) => entry.skillId === hit.skillId)
                      ?.alias.trim() || lookupDamageIdName(hit.skillId)}
                amount={hit.amount}
                hitCount={hit.hitCount}
              />
            </div>
          {/each}
        {/if}
        {#if editing}
          <div
            class="resize-handle"
            onpointerdown={(event) =>
              startMonsterResize(
                event,
                { kind: "skillDamagePanel", groupId: group.id },
                panelScale,
              )}
          ></div>
        {/if}
      </div>
    {/if}
  {/each}
{/if}

<style>
  .skill-damage-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 220px;
    color: white;
    font-size: 24px;
    font-weight: 700;
    text-shadow:
      0 2px 3px #000,
      0 0 4px #000;
    pointer-events: none;
  }
  .skill-damage-panel.editable {
    cursor: move;
    pointer-events: auto;
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
    touch-action: none;
  }
  .group-tag {
    text-shadow: none;
  }
</style>
