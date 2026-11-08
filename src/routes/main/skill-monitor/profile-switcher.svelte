<script lang="ts">
  /**
   * @file Picker for which skill-monitor sub-profile the *active loadout*
   * references. Skill profiles themselves are a shared resource (multiple
   * loadouts can point at the same one); see `/main/loadouts` for managing
   * loadouts and duplicating/removing profiles.
   */
  import {
    SETTINGS,
    createReferenceSkillMonitorProfile,
  } from "$lib/settings-store";
  import {
    activeLoadout,
    removeSkillProfileEverywhere,
    setLoadoutSkillProfile,
  } from "$lib/loadouts.svelte.js";
  import { t } from "$lib/i18n/index.svelte";
  import { profileDisplayName } from "$lib/profile-switcher-utils";
  import NameInputDialog from "$lib/components/NameInputDialog.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";

  const profiles = $derived(SETTINGS.skillMonitor.state.profiles);
  const loadout = $derived(activeLoadout());
  const activeProfileId = $derived(loadout?.skillProfileId ?? "");
  const activeProfile = $derived(
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0],
  );

  let renameOpen = $state(false);
  let renameDefault = $state("");
  let renameTargetId = $state<string | null>(null);

  let deleteOpen = $state(false);
  let deleteTargetId = $state<string | null>(null);

  function selectProfile(profileId: string) {
    if (!loadout) return;
    setLoadoutSkillProfile(loadout.id, profileId);
  }

  function renameActiveProfile() {
    if (!activeProfile) return;
    renameTargetId = activeProfile.id;
    renameDefault = activeProfile.name ?? "";
    renameOpen = true;
  }

  function handleRenameConfirm(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !renameTargetId) return;
    SETTINGS.skillMonitor.state.profiles = profiles.map((profile) =>
      profile.id === renameTargetId ? { ...profile, name: trimmed } : profile,
    );
    renameTargetId = null;
  }

  function addProfile() {
    const nextProfile = createReferenceSkillMonitorProfile("");
    SETTINGS.skillMonitor.state.profiles = [...profiles, nextProfile];
    selectProfile(nextProfile.id);
  }

  function removeActiveProfile() {
    if (!activeProfile || profiles.length <= 1) return;
    deleteTargetId = activeProfile.id;
    deleteOpen = true;
  }

  function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    removeSkillProfileEverywhere(deleteTargetId);
    deleteTargetId = null;
  }
</script>

<div
  class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
>
  <div>
    <h2 class="text-foreground text-base font-semibold">
      {t("skillMonitor.profile.title")}
    </h2>
    <p class="text-muted-foreground text-xs">
      {t("skillMonitor.profile.pickerDescription")}
    </p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <select
      class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
      value={activeProfileId}
      onchange={(event) =>
        selectProfile((event.currentTarget as HTMLSelectElement).value)}
    >
      {#each profiles as profile, idx (profile.id)}
        <option value={profile.id}
          >{profileDisplayName("skill", profile.name, idx)}</option
        >
      {/each}
    </select>
    <button
      type="button"
      class="border-border/60 text-foreground hover:bg-muted/40 rounded border px-3 py-2 text-xs transition-colors"
      onclick={addProfile}
    >
      {t("skillMonitor.profile.new")}
    </button>
    <button
      type="button"
      class="border-border/60 text-foreground hover:bg-muted/40 rounded border px-3 py-2 text-xs transition-colors"
      onclick={renameActiveProfile}
    >
      {t("skillMonitor.profile.rename")}
    </button>
    <button
      type="button"
      class="border-border/60 text-destructive hover:bg-destructive/10 disabled:text-muted-foreground rounded border px-3 py-2 text-xs transition-colors disabled:hover:bg-transparent"
      onclick={removeActiveProfile}
      disabled={profiles.length <= 1}
    >
      {t("skillMonitor.profile.delete")}
    </button>
  </div>
</div>

<NameInputDialog
  bind:open={renameOpen}
  title={t("skillMonitor.profile.rename")}
  defaultValue={renameDefault}
  placeholder={t("skillMonitor.profile.renamePrompt")}
  onconfirm={handleRenameConfirm}
/>

<ConfirmDialog
  bind:open={deleteOpen}
  title={t("skillMonitor.profile.delete")}
  description={t("skillMonitor.profile.deleteConfirm")}
  confirmText={t("common.delete")}
  cancelText={t("common.cancel")}
  onconfirm={handleDeleteConfirm}
  variant="destructive"
/>
