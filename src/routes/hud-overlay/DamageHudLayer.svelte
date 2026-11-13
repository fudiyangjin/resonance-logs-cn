<script lang="ts">
  import { flip } from "svelte/animate";
  import { fly } from "svelte/transition";
  import { t } from "$lib/i18n/index.svelte";
  import { lookupDamageIdName } from "$lib/config/recount-table";
  import SkillDamageRow from "$lib/components/SkillDamageRow.svelte";
  import { orderSkillDamageRows } from "$lib/skill-damage-display";
  import type { SkillDamageRow as DamageRow } from "$lib/skill-damage-groups";
  import { activeSkillDamageProfile } from "$lib/skill-damage-profile.svelte";
  import {
    ensureSkillDamageFonts,
    skillDamageFontFamily,
  } from "$lib/skill-damage-fonts.svelte";
  import type { SkillDamageGroup } from "$lib/skill-damage-settings";
  import DraggablePanel from "./DraggablePanel.svelte";
  import { visibleSkillDamageRows } from "../damage-overlay/damage-feed.svelte.js";

  let { editing }: { editing: boolean } = $props();

  const groups = $derived(
    (activeSkillDamageProfile()?.groups ?? []).filter((group) => group.enabled),
  );
  const rowsByGroup = $derived.by(() => {
    const byGroup = new Map<string, DamageRow[]>();
    for (const row of visibleSkillDamageRows()) {
      const rows = byGroup.get(row.groupId);
      if (rows) rows.push(row);
      else byGroup.set(row.groupId, [row]);
    }
    return byGroup;
  });

  // Loading fonts is a side effect on the document; the families it
  // resolves are reactive, so rows re-render once a font is ready.
  $effect(() => ensureSkillDamageFonts(groups));

  function groupName(group: SkillDamageGroup): string {
    return group.name || t("skillDamage.defaultGroup");
  }

  function rowLabel(group: SkillDamageGroup, row: DamageRow): string {
    if (row.merged) return groupName(group);
    return (
      group.entries
        .find((entry) => entry.skillId === row.skillId)
        ?.alias.trim() || lookupDamageIdName(row.skillId)
    );
  }
</script>

<div class="hud-layer">
  {#each groups as group (group.id)}
    {@const rows = orderSkillDamageRows(
      rowsByGroup.get(group.id) ?? [],
      group.scrollDirection,
    )}
    {@const fontFamily = skillDamageFontFamily(group)}
    {#if editing || rows.length > 0}
      <DraggablePanel
        rect={group.layout}
        {editing}
        title={groupName(group)}
        anchor={group.scrollDirection === "down" ? "top" : "bottom"}
        class="skill-damage-panel"
      >
        <div class="damage-rows">
          {#if editing}
            <SkillDamageRow
              {group}
              label={groupName(group)}
              amount="123456"
              animated={false}
              {fontFamily}
            />
          {:else}
            {#each rows as row (row.key)}
              <div
                animate:flip={{ duration: 160 }}
                in:fly={{
                  y: group.scrollDirection === "down" ? -14 : 14,
                  duration: 120,
                }}
              >
                {#key row.phase === "active" ? row.comboCount : row.key}
                  <SkillDamageRow
                    {group}
                    label={rowLabel(group, row)}
                    amount={row.amount}
                    hitCount={row.hitCount}
                    comboCount={row.comboCount}
                    running={row.phase === "active"}
                    animation={row.phase === "final"
                      ? group.continuousFinalAnimation
                      : row.phase === "active"
                        ? group.continuousAnimation
                        : group.animation}
                    animationDurationMs={row.phase === "active"
                      ? group.continuousWindowMode === "rolling"
                        ? group.continuousWindowMs
                        : group.continuousWindowMode === "cast"
                          ? group.durationMs
                          : group.continuousTimeoutMs
                      : group.durationMs}
                    {fontFamily}
                  />
                {/key}
              </div>
            {/each}
          {/if}
        </div>
      </DraggablePanel>
    {/if}
  {/each}
</div>

<style>
  .hud-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .damage-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  :global(.skill-damage-panel) {
    min-width: 220px;
    color: white;
    font-size: 24px;
    font-weight: 700;
    text-shadow:
      0 2px 3px #000,
      0 0 4px #000;
  }
</style>
