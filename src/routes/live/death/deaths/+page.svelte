<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    getDeathRecords,
    getLiveData,
  } from "$lib/stores/live-meter-store.svelte";
  import DeathList from "$lib/components/death-replay/death-list.svelte";

  const playerUid = $derived(Number(page.url.searchParams.get("playerUid") ?? "-1"));

  const liveData = $derived(getLiveData());
  const deathRecords = $derived(getDeathRecords());

  const deaths = $derived(
    deathRecords.filter((r) => Number(r.victimUid) === playerUid),
  );
  const entity = $derived(
    liveData?.entities.find((e) => e.uid === playerUid) ?? null,
  );

  function handleSelect(deathTimestampMs: number) {
    goto(
      `/live/death/replay?playerUid=${playerUid}&deathTs=${deathTimestampMs}`,
    );
  }
</script>

<svelte:window oncontextmenu={() => window.history.back()} />

<DeathList
  playerName=""
  className={entity?.className ?? ""}
  classSpecName={entity?.classSpecName ?? ""}
  {deaths}
  fightStartTimestampMs={Number(liveData?.fightStartTimestampMs ?? 0) || null}
  onSelect={handleSelect}
/>
