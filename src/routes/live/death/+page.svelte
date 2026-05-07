<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    getDeathRecords,
    getLiveData,
  } from "$lib/stores/live-meter-store.svelte";
  import DeathPlayerList, {
    type DeathPlayerEntry,
  } from "$lib/components/death-replay/death-player-list.svelte";

  let liveData = $derived(getLiveData());
  let deathRecords = $derived(getDeathRecords());

  let entries = $derived.by<DeathPlayerEntry[]>(() => {
    const grouped = new Map<number, DeathPlayerEntry>();
    for (const record of deathRecords) {
      const uid = Number(record.victimUid);
      let entry = grouped.get(uid);
      if (!entry) {
        const liveEntity = liveData?.entities.find((e) => e.uid === uid);
        entry = {
          uid,
          name: liveEntity?.name ?? `#${uid}`,
          className: liveEntity?.className ?? "",
          classSpecName: liveEntity?.classSpecName ?? "",
          deaths: [],
        };
        grouped.set(uid, entry);
      }
      entry.deaths.push(record);
    }
    return Array.from(grouped.values());
  });

  function handleSelect(uid: number) {
    goto(`/live/death/deaths?playerUid=${uid}`);
  }
</script>

<DeathPlayerList
  {entries}
  localPlayerUid={liveData?.localPlayerUid ?? null}
  onSelect={handleSelect}
/>
