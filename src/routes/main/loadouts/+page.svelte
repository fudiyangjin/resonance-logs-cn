<script lang="ts">
  /**
   * @file Loadout management page: create/rename/duplicate/delete top-level
   * loadouts, reassign which skill/monster sub-profile each one references,
   * apply built-in class presets, and import/export loadouts as JSON.
   */
  import LayersIcon from "virtual:icons/lucide/layers";
  import PlusIcon from "virtual:icons/lucide/plus";
  import CopyIcon from "virtual:icons/lucide/copy";
  import Trash2Icon from "virtual:icons/lucide/trash-2";
  import DownloadIcon from "virtual:icons/lucide/download";
  import UploadIcon from "virtual:icons/lucide/upload";
  import CheckIcon from "virtual:icons/lucide/check";
  import { t, getLocale } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { commands } from "$lib/bindings";
  import { save } from "@tauri-apps/plugin-dialog";
  import {
    activeLoadout,
    createLoadout,
    createLoadoutFromPreset,
    duplicateLoadout,
    exportLoadout,
    importLoadout,
    listLoadouts,
    removeLoadout,
    renameLoadout,
    setLoadoutLiveProfile,
    setLoadoutMonsterProfile,
    setLoadoutSkillProfile,
    switchLoadout,
  } from "$lib/loadouts.svelte.js";
  import { parseLoadoutExport } from "$lib/loadout-import";
  import { buildLoadoutPresets } from "$lib/config/loadout-presets";
  import { toast } from "svelte-sonner";
  import NameInputDialog from "$lib/components/NameInputDialog.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";

  const loadouts = $derived(listLoadouts());
  const active = $derived(activeLoadout());
  const skillProfiles = $derived(SETTINGS.skillMonitor.state.profiles);
  const monsterProfiles = $derived(SETTINGS.monsterMonitor.state.profiles);
  const liveProfiles = $derived(SETTINGS.monitoring.state.liveMeter.profiles);
  const presets = $derived(buildLoadoutPresets(getLocale()));

  // Dialog states
  let nameDialogOpen = $state(false);
  let nameDialogTitle = $state("");
  let nameDialogDefaultValue = $state("");
  let nameDialogCallback = $state<(name: string) => void>(() => {});

  let confirmDialogOpen = $state(false);
  let confirmDialogTitle = $state("");
  let confirmDialogDescription = $state("");
  let confirmDialogCallback = $state<() => void>(() => {});
  let deleteTargetId = $state<string | null>(null);

  function skillProfileName(id: string, index: number): string {
    const profile = skillProfiles.find((p) => p.id === id);
    const trimmed = profile?.name?.trim();
    if (trimmed) return trimmed;
    return index === 0
      ? t("skillMonitor.defaults.defaultProfileName")
      : t("skillMonitor.defaults.profileName", { index: index + 1 });
  }

  function monsterProfileName(id: string, index: number): string {
    const profile = monsterProfiles.find((p) => p.id === id);
    const trimmed = profile?.name?.trim();
    if (trimmed) return trimmed;
    return index === 0
      ? t("monsterMonitor.defaults.defaultProfileName")
      : t("monsterMonitor.defaults.profileName", { index: index + 1 });
  }

  function liveProfileName(id: string, index: number): string {
    const profile = liveProfiles.find((p) => p.id === id);
    const trimmed = profile?.name?.trim();
    if (trimmed) return trimmed;
    return index === 0
      ? t("live.defaults.defaultProfileName")
      : t("live.defaults.profileName", { index: index + 1 });
  }

  function handleNewLoadout() {
    nameDialogTitle = t("loadout.page.new");
    nameDialogDefaultValue = "";
    nameDialogCallback = (name) => createLoadout({ name });
    nameDialogOpen = true;
  }

  function handleRename(id: string, currentName: string) {
    nameDialogTitle = t("loadout.page.rename");
    nameDialogDefaultValue = currentName;
    nameDialogCallback = (name) => renameLoadout(id, name);
    nameDialogOpen = true;
  }

  function handleDuplicate(id: string) {
    duplicateLoadout(id);
  }

  function handleDelete(id: string) {
    if (loadouts.length <= 1) return;
    deleteTargetId = id;
    confirmDialogTitle = t("loadout.page.delete");
    confirmDialogDescription = t("loadout.page.deleteConfirm");
    confirmDialogCallback = () => {
      if (deleteTargetId) removeLoadout(deleteTargetId);
      deleteTargetId = null;
    };
    confirmDialogOpen = true;
  }

  function handleApplyPreset(preset: (typeof presets)[number]) {
    createLoadoutFromPreset(preset);
    toast.success(t("loadout.page.presetApplied", { name: preset.className }));
  }

  async function handleExport(id: string) {
    const data = exportLoadout(id);
    if (!data) {
      toast.error(t("loadout.page.exportError"));
      return;
    }

    // Blob + anchor downloads don't work inside the Tauri webview, so the
    // user picks a destination with the native save dialog and the file is
    // written by a backend command.
    try {
      const destinationPath = await save({
        title: t("loadout.page.exportButton"),
        defaultPath: `${data.name || "loadout"}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!destinationPath) return; // User cancelled the picker.

      const result = await commands.exportLoadout(
        destinationPath,
        JSON.stringify(data, null, 2),
      );
      if (result.status === "error") throw new Error(result.error);
      toast.success(t("loadout.page.exportSuccess"));
    } catch (error) {
      console.error("Failed to export loadout", error);
      toast.error(t("loadout.page.exportError"));
    }
  }

  let importInput: HTMLInputElement | undefined = $state();

  function triggerImport() {
    importInput?.click();
  }

  async function handleImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseLoadoutExport(JSON.parse(text));
      if (!parsed.success) {
        console.error("Invalid loadout import", parsed.issues);
        toast.error(t("loadout.page.importError"));
        return;
      }
      importLoadout(parsed.output);
      toast.success(t("loadout.page.importSuccess"));
    } catch (error) {
      console.error("Failed to import loadout", error);
      toast.error(t("loadout.page.importError"));
    }
  }
</script>

<NameInputDialog
  bind:open={nameDialogOpen}
  title={nameDialogTitle}
  defaultValue={nameDialogDefaultValue}
  placeholder={t("loadout.page.namePrompt")}
  onconfirm={nameDialogCallback}
/>

<ConfirmDialog
  bind:open={confirmDialogOpen}
  title={confirmDialogTitle}
  description={confirmDialogDescription}
  confirmText={t("common.delete")}
  cancelText={t("common.cancel")}
  onconfirm={confirmDialogCallback}
  variant="destructive"
/>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div
        class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg"
      >
        <LayersIcon class="h-5 w-5" />
      </div>
      <div>
        <h1 class="text-foreground text-xl font-bold">
          {t("loadout.page.title")}
        </h1>
        <p class="text-muted-foreground text-sm">
          {t("loadout.page.description")}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <input
        bind:this={importInput}
        type="file"
        accept="application/json"
        class="hidden"
        onchange={handleImportFile}
      />
      <button
        type="button"
        class="border-border/60 text-foreground hover:bg-muted/40 flex items-center gap-1.5 rounded border px-3 py-2 text-sm transition-colors"
        onclick={triggerImport}
      >
        <UploadIcon class="h-4 w-4" />
        {t("loadout.page.importButton")}
      </button>
      <button
        type="button"
        class="bg-primary text-primary-foreground flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        onclick={handleNewLoadout}
      >
        <PlusIcon class="h-4 w-4" />
        {t("loadout.page.new")}
      </button>
    </div>
  </div>

  <div
    class="border-border/60 bg-card/40 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="px-4 pt-4">
      <h2 class="text-foreground text-base font-semibold">
        {t("loadout.page.loadoutsTitle")}
      </h2>
    </div>
    <div class="space-y-3 p-4">
      {#each loadouts as loadout (loadout.id)}
        {@const isActive = loadout.id === active?.id}
        <div
          class="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-3.5"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2.5">
              {#if isActive}
                <span
                  class="text-primary inline-flex shrink-0 items-center gap-1 text-xs font-medium"
                >
                  <CheckIcon class="h-3.5 w-3.5" />
                  {t("loadout.page.active")}
                </span>
              {/if}
              <span class="text-foreground truncate font-medium"
                >{loadout.name}</span
              >
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              {#if !isActive}
                <button
                  type="button"
                  class="border-border/60 text-foreground hover:bg-muted/40 rounded border px-2.5 py-1.5 text-xs transition-colors"
                  onclick={() => switchLoadout(loadout.id)}
                >
                  {t("loadout.page.activate")}
                </button>
              {/if}
              <button
                type="button"
                class="border-border/60 text-foreground hover:bg-muted/40 rounded border px-2.5 py-1.5 text-xs transition-colors"
                onclick={() => handleRename(loadout.id, loadout.name)}
              >
                {t("loadout.page.rename")}
              </button>
              <button
                type="button"
                title={t("loadout.page.duplicate")}
                class="border-border/60 text-foreground hover:bg-muted/40 flex h-7 w-7 items-center justify-center rounded border transition-colors"
                onclick={() => handleDuplicate(loadout.id)}
              >
                <CopyIcon class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={t("loadout.page.exportButton")}
                class="border-border/60 text-foreground hover:bg-muted/40 flex h-7 w-7 items-center justify-center rounded border transition-colors"
                onclick={() => handleExport(loadout.id)}
              >
                <DownloadIcon class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={t("loadout.page.delete")}
                class="border-border/60 text-destructive hover:bg-destructive/10 disabled:text-muted-foreground flex h-7 w-7 items-center justify-center rounded border transition-colors disabled:hover:bg-transparent"
                onclick={() => handleDelete(loadout.id)}
                disabled={loadouts.length <= 1}
              >
                <Trash2Icon class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label class="text-muted-foreground flex flex-col gap-1 text-xs">
              {t("loadout.page.skillProfileLabel")}
              <select
                class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
                value={loadout.skillProfileId}
                onchange={(event) =>
                  setLoadoutSkillProfile(
                    loadout.id,
                    (event.currentTarget as HTMLSelectElement).value,
                  )}
              >
                {#each skillProfiles as profile, idx (profile.id)}
                  <option value={profile.id}
                    >{skillProfileName(profile.id, idx)}</option
                  >
                {/each}
              </select>
            </label>
            <label class="text-muted-foreground flex flex-col gap-1 text-xs">
              {t("loadout.page.monsterProfileLabel")}
              <select
                class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
                value={loadout.monsterProfileId}
                onchange={(event) =>
                  setLoadoutMonsterProfile(
                    loadout.id,
                    (event.currentTarget as HTMLSelectElement).value,
                  )}
              >
                {#each monsterProfiles as profile, idx (profile.id)}
                  <option value={profile.id}
                    >{monsterProfileName(profile.id, idx)}</option
                  >
                {/each}
              </select>
            </label>
            <label class="text-muted-foreground flex flex-col gap-1 text-xs">
              {t("loadout.page.liveProfileLabel")}
              <select
                class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
                value={loadout.liveProfileId}
                onchange={(event) =>
                  setLoadoutLiveProfile(
                    loadout.id,
                    (event.currentTarget as HTMLSelectElement).value,
                  )}
              >
                {#each liveProfiles as profile, idx (profile.id)}
                  <option value={profile.id}
                    >{liveProfileName(profile.id, idx)}</option
                  >
                {/each}
              </select>
            </label>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div
    class="border-border/60 bg-card/40 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="px-4 pt-4">
      <h2 class="text-foreground text-base font-semibold">
        {t("loadout.page.presetsTitle")}
      </h2>
      <p class="text-muted-foreground mt-0.5 text-xs">
        {t("loadout.page.presetsDescription")}
      </p>
    </div>
    <div class="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {#each presets as preset (preset.classKey)}
        <button
          type="button"
          class="border-border/60 bg-muted/20 text-foreground hover:border-primary/60 hover:bg-primary/10 flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3.5 text-sm font-medium transition-colors"
          onclick={() => handleApplyPreset(preset)}
        >
          {preset.className}
        </button>
      {/each}
    </div>
  </div>
</div>
