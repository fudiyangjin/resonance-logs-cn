<script lang="ts">
  /**
   * @file This component displays the health of the current boss(es).
   */
  import { onMount } from "svelte";
  import { onEncounterUpdate, onResetEncounter, type HeaderInfo } from "$lib/api";
  import { tooltip } from "$lib/utils.svelte";

  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveMonsterName } from "$lib/config/game-names";

  let headerInfo: HeaderInfo = $state({
    totalDps: 0,
    totalDmg: 0,
    elapsedMs: 0,
    activeCombatTimeMs: 0,
    fightStartTimestampMs: 0,
    bosses: [],
    sceneId: null,
    dungeonDifficulty: null,
    trainingDummy: {
      phase: "idle",
    },
  });
  let abbreviationStyle = $derived(SETTINGS.live.general.state.abbreviationStyle);
  const displayBosses = $derived(
    headerInfo.bosses.map((boss) => ({
      ...boss,
      displayName: resolveMonsterName(boss.monsterId),
    })),
  );



  onMount(() => {
    let encounterUnlisten: (() => void) | null = null;
    let resetUnlisten: (() => void) | null = null;

    onEncounterUpdate((event) => {
      headerInfo = event.payload.headerInfo;
    }).then((fn) => {
      encounterUnlisten = fn;
    });

    onResetEncounter(() => {
      headerInfo.bosses = [];
    }).then((fn) => {
      resetUnlisten = fn;
    });

    return () => {
      if (encounterUnlisten) encounterUnlisten();
      if (resetUnlisten) resetUnlisten();
    };
  });
</script>

{#if displayBosses.length > 0}
  <div class="flex flex-col gap-1">
    {#each displayBosses as boss (boss.uid)}
      {@const hpPercent = boss.maxHp && boss.currentHp !== null ? Math.min(100, Math.max(0, (boss.currentHp / boss.maxHp) * 100)) : 0}
      <div class="flex items-center gap-1 whitespace-nowrap">
        <span class="text-base truncate text-neutral-100 font-semibold tracking-tight" {@attach tooltip(() => boss.displayName)}>{boss.displayName + " -"}</span>
        <span class="text-base tabular-nums font-semibold text-neutral-100">
          <AbbreviatedNumber
            num={boss.currentHp !== null ? boss.currentHp : 0}
            {abbreviationStyle}
          />
          {#if boss.maxHp}
            <span
              > / <AbbreviatedNumber num={boss.maxHp} {abbreviationStyle} /></span
            >
            <span class="text-rose-400 ml-1">({hpPercent.toFixed(1)}%)</span>
          {/if}
        </span>
      </div>
    {/each}
  </div>
{:else}
  <span class="text-base text-neutral-500 font-medium italic">No Boss</span>
{/if}
