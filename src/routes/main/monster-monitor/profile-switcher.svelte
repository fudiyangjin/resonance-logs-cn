<script lang="ts">
  /**
   * @file Picker for which monster-monitor sub-profile the *active loadout*
   * references. See `/main/loadouts` for managing loadouts and
   * duplicating/removing profiles shared across them.
   */
  import { SETTINGS } from "$lib/settings-store";
  import {
    activeLoadout,
    removeMonsterProfileEverywhere,
    setLoadoutMonsterProfile,
  } from "$lib/loadouts.svelte.js";
  import {
    createMonsterProfile,
    renameMonsterProfile,
  } from "$lib/monster-monitor-profile.svelte.js";
  import LoadoutProfileSwitcher from "$lib/components/LoadoutProfileSwitcher.svelte";

  const loadout = $derived(activeLoadout());
</script>

<LoadoutProfileSwitcher
  kind="monster"
  i18nPrefix="monsterMonitor.profile"
  profiles={SETTINGS.monsterMonitor.state.profiles}
  activeProfileId={loadout?.monsterProfileId ?? ""}
  onselect={(profileId) => {
    if (loadout) setLoadoutMonsterProfile(loadout.id, profileId);
  }}
  oncreate={() => createMonsterProfile("")}
  onrename={renameMonsterProfile}
  onremove={removeMonsterProfileEverywhere}
/>
