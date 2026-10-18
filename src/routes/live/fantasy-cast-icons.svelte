<script lang="ts">
  /**
   * @file Live-window wrapper: reads the current fight's teammate fantasies
   * (or the viewed history encounter's recorded casts) and renders the
   * shared icon row for one player.
   */
  import FantasyCastIcons from "$lib/components/fantasy-cast-icons.svelte";
  import {
    resolveFantasyDisplayName,
    resolveFantasyIcon,
    type FantasyCastDisplay,
  } from "$lib/fantasy-icons";
  import type { TeammateFantasyState } from "$lib/api";
  import { SETTINGS } from "$lib/settings-store";
  import { liveFantasyStore } from "$lib/stores/live-topics.svelte";
  import { liveView } from "$lib/stores/live-view-source.svelte";

  let { entityUuid, size = 16 }: { entityUuid: string; size?: number } =
    $props();

  const showFantasyCastIcons = $derived(
    SETTINGS.live.general.state.showFantasyCastIcons === true,
  );
  const casts = $derived.by((): FantasyCastDisplay[] => {
    if (!showFantasyCastIcons) return [];

    const history = liveView.history;
    if (history) return history.fantasyCasts.get(entityUuid) ?? [];

    const latestByType = new Map<string, TeammateFantasyState>();
    for (const entry of liveFantasyStore.data?.teammateFantasies ?? []) {
      if (entry.summonerUuid !== entityUuid) continue;
      const key = String(entry.resonanceSkillId ?? `monster:${entry.monsterId}`);
      const current = latestByType.get(key);
      if (!current || entry.detectedAtMs > current.detectedAtMs) {
        latestByType.set(key, entry);
      }
    }

    return [...latestByType.entries()]
      .sort(([, left], [, right]) => right.detectedAtMs - left.detectedAtMs)
      .flatMap(([key, entry]) => {
        const icon = resolveFantasyIcon(entry.resonanceSkillId);
        return icon.isPlaceholder
          ? []
          : [
              {
                id: key,
                name: resolveFantasyDisplayName(
                  entry.resonanceSkillId,
                  entry.monsterId,
                ),
                iconPath: icon.iconPath,
                remodelLevel: entry.remodelLevel,
              },
            ];
      })
      .slice(0, 2);
  });
</script>

<FantasyCastIcons {casts} {size} />
