<script lang="ts">
  /**
   * @file Picker for which live-meter sub-profile the *active loadout*
   * references. Live profiles are a shared resource (multiple loadouts can
   * point at the same one); see `/main/loadouts` for managing loadouts and
   * duplicating/removing profiles shared across them.
   */
  import { SETTINGS } from "$lib/settings-store";
  import {
    activeLoadout,
    removeLiveProfileEverywhere,
    setLoadoutLiveProfile,
  } from "$lib/loadouts.svelte.js";
  import {
    createLiveProfile,
    renameLiveProfile,
  } from "$lib/live-meter-profile.svelte.js";
  import LoadoutProfileSwitcher from "$lib/components/LoadoutProfileSwitcher.svelte";

  const loadout = $derived(activeLoadout());
</script>

<LoadoutProfileSwitcher
  kind="live"
  i18nPrefix="live.profile"
  profiles={SETTINGS.monitoring.state.liveMeter.profiles}
  activeProfileId={loadout?.liveProfileId ?? ""}
  onselect={(profileId) => {
    if (loadout) setLoadoutLiveProfile(loadout.id, profileId);
  }}
  oncreate={() => createLiveProfile("")}
  onrename={renameLiveProfile}
  onremove={removeLiveProfileEverywhere}
/>
