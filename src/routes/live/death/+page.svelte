<script lang="ts">
  import { goto } from "$app/navigation";
  import { liveView } from "$lib/stores/live-view-source.svelte";
  import DeathPlayerList, {
    type DeathPlayerEntry,
  } from "$lib/components/death-replay/death-player-list.svelte";

  let liveData = $derived(liveView.combat);
  let deathRecords = $derived(liveView.deaths);

  let entries = $derived.by<DeathPlayerEntry[]>(() => {
    const grouped = new Map<string, DeathPlayerEntry>();
    for (const record of deathRecords) {
      const entityUuid = record.victimEntityUuid;
      let entry = grouped.get(entityUuid);
      if (!entry) {
        const liveEntity = liveData?.entities.find((e) => e.entityUuid === entityUuid);
        entry = {
          entityUuid,
          displayUid: liveEntity?.displayUid ?? 0,
          name: liveEntity?.name ?? `#${liveEntity?.displayUid ?? entityUuid}`,
          className: liveEntity?.className ?? "",
          classSpecName: liveEntity?.classSpecName ?? "",
          deaths: [],
        };
        grouped.set(entityUuid, entry);
      }
      entry.deaths.push(record);
    }
    return Array.from(grouped.values());
  });

  function handleSelect(entityUuid: string) {
    goto(`/live/death/deaths?entityUuid=${entityUuid}`);
  }
</script>

<DeathPlayerList
  {entries}
  localPlayerUuid={liveData?.localPlayerUuid ?? null}
  onSelect={handleSelect}
/>
