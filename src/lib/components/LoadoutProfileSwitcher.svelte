<script lang="ts">
  /**
   * @file Picker for which sub-profile of one kind the *active loadout*
   * references, with create / rename / delete. Profiles are shared resources
   * (several loadouts may point at one); see `/main/loadouts` for managing
   * loadouts themselves.
   */
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    profileDisplayName,
    type MonitorProfileKind,
  } from "$lib/profile-switcher-utils";
  import NameInputDialog from "$lib/components/NameInputDialog.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";

  type Props = {
    kind: MonitorProfileKind;
    /** i18n namespace holding title/pickerDescription/new/rename/renamePrompt/delete/deleteConfirm. */
    i18nPrefix: "monsterMonitor.profile" | "live.profile" | "skillDamage.profile";
    profiles: readonly { id: string; name?: string }[];
    activeProfileId: string;
    onselect: (profileId: string) => void;
    /** Creates a profile and returns its id. */
    oncreate: () => string;
    onrename: (profileId: string, name: string) => void;
    onremove: (profileId: string) => void;
  };

  let {
    kind,
    i18nPrefix,
    profiles,
    activeProfileId,
    onselect,
    oncreate,
    onrename,
    onremove,
  }: Props = $props();

  const label = (key: string) => t(`${i18nPrefix}.${key}` as MessageKey);
  const activeProfile = $derived(
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0],
  );

  let renameOpen = $state(false);
  let renameDefault = $state("");
  let renameTargetId = $state<string | null>(null);
  let deleteOpen = $state(false);
  let deleteTargetId = $state<string | null>(null);

  function renameActiveProfile() {
    if (!activeProfile) return;
    renameTargetId = activeProfile.id;
    renameDefault = activeProfile.name ?? "";
    renameOpen = true;
  }

  function handleRenameConfirm(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !renameTargetId) return;
    onrename(renameTargetId, trimmed);
    renameTargetId = null;
  }

  function removeActiveProfile() {
    if (!activeProfile || profiles.length <= 1) return;
    deleteTargetId = activeProfile.id;
    deleteOpen = true;
  }

  function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    onremove(deleteTargetId);
    deleteTargetId = null;
  }
</script>

<div
  class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
>
  <div>
    <h2 class="text-foreground text-base font-semibold">
      {label("title")}
    </h2>
    <p class="text-muted-foreground text-xs">
      {label("pickerDescription")}
    </p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <select
      class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
      value={activeProfile?.id ?? ""}
      onchange={(event) =>
        onselect((event.currentTarget as HTMLSelectElement).value)}
    >
      {#each profiles as profile, idx (profile.id)}
        <option value={profile.id}
          >{profileDisplayName(kind, profile.name, idx)}</option
        >
      {/each}
    </select>
    <button
      type="button"
      class="border-border/60 text-foreground hover:bg-muted/40 rounded border px-3 py-2 text-xs transition-colors"
      onclick={() => onselect(oncreate())}
    >
      {label("new")}
    </button>
    <button
      type="button"
      class="border-border/60 text-foreground hover:bg-muted/40 rounded border px-3 py-2 text-xs transition-colors"
      onclick={renameActiveProfile}
    >
      {label("rename")}
    </button>
    <button
      type="button"
      class="border-border/60 text-destructive hover:bg-destructive/10 disabled:text-muted-foreground rounded border px-3 py-2 text-xs transition-colors disabled:hover:bg-transparent"
      onclick={removeActiveProfile}
      disabled={profiles.length <= 1}
    >
      {label("delete")}
    </button>
  </div>
</div>

<NameInputDialog
  bind:open={renameOpen}
  title={label("rename")}
  defaultValue={renameDefault}
  placeholder={label("renamePrompt")}
  onconfirm={handleRenameConfirm}
/>

<ConfirmDialog
  bind:open={deleteOpen}
  title={label("delete")}
  description={label("deleteConfirm")}
  confirmText={t("common.delete")}
  cancelText={t("common.cancel")}
  onconfirm={handleDeleteConfirm}
  variant="destructive"
/>
