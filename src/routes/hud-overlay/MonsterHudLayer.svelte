<script lang="ts">
  import MonsterBossDbmPanel from "../monster-overlay/MonsterBossDbmPanel.svelte";
  import MonsterBuffPanel from "../monster-overlay/MonsterBuffPanel.svelte";
  import MonsterEntityDurationPanel from "../monster-overlay/MonsterEntityDurationPanel.svelte";
  import MonsterFantasyPanel from "../monster-overlay/MonsterFantasyPanel.svelte";
  import MonsterHatePanel from "../monster-overlay/MonsterHatePanel.svelte";
  import MonsterHpPanel from "../monster-overlay/MonsterHpPanel.svelte";
  import MonsterStunPanel from "../monster-overlay/MonsterStunPanel.svelte";
  import MonsterTeammateBuffPanel from "../monster-overlay/MonsterTeammateBuffPanel.svelte";
  import MonsterTeammateCdPanel from "../monster-overlay/MonsterTeammateCdPanel.svelte";
  import { getMonsterOverlayVisibility } from "../monster-overlay/monster-state.svelte.js";

  const visibility = $derived(getMonsterOverlayVisibility());
</script>

<div class="hud-layer">
  {#if visibility.showMonsterBuffPanel}
    <MonsterBuffPanel />
  {/if}
  {#if visibility.showTeammateBuffPanel}
    <MonsterTeammateBuffPanel />
  {/if}
  {#if visibility.showTeammateCdPanel}
    <MonsterTeammateCdPanel />
  {/if}
  {#if visibility.showHatePanel}
    <MonsterHatePanel />
  {/if}
  {#if visibility.showStunPanel}
    <MonsterStunPanel />
  {/if}
  {#if visibility.showHpPanel}
    <MonsterHpPanel />
  {/if}
  {#if visibility.showFantasyPanel}
    <MonsterFantasyPanel />
  {/if}
  {#if visibility.showBossDbmPanel}
    <MonsterBossDbmPanel />
  {/if}
  {#if visibility.showEntityDurationPanel}
    <MonsterEntityDurationPanel />
  {/if}
</div>

<style>
  .hud-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
