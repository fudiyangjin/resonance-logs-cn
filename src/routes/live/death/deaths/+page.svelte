<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { liveView } from "$lib/stores/live-view-source.svelte";
  import DeathList from "$lib/components/death-replay/death-list.svelte";

  const entityUuid = page.url.searchParams.get("entityUuid") ?? "";

  const liveData = $derived(liveView.combat);
  const deathRecords = $derived(liveView.deaths);

  const deaths = $derived(
    deathRecords.filter((r) => r.victimEntityUuid === entityUuid),
  );
  const entity = $derived(
    liveData?.entities.find((e) => e.entityUuid === entityUuid) ?? null,
  );

  function handleSelect(deathTimestampMs: number) {
    goto(
      `/live/death/replay?entityUuid=${entityUuid}&deathTs=${deathTimestampMs}`,
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
