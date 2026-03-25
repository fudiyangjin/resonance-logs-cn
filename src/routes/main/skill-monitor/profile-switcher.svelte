<script lang="ts">
  import {
    SETTINGS,
    createDefaultSkillMonitorProfile,
  } from "$lib/settings-store";
  import { tl, tm } from "$lib/i18n/index.svelte";

  const profiles = $derived(SETTINGS.skillMonitor.state.profiles);
  const activeProfileIndex = $derived(
    Math.min(
      Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
      Math.max(0, profiles.length - 1),
    ),
  );
  const activeProfile = $derived(
    profiles[activeProfileIndex] ?? createDefaultSkillMonitorProfile(),
  );

  function setActiveProfileIndex(index: number) {
    const maxIndex = Math.max(0, SETTINGS.skillMonitor.state.profiles.length - 1);
    SETTINGS.skillMonitor.state.activeProfileIndex = Math.min(
      Math.max(index, 0),
      maxIndex,
    );
  }

  function updateActiveProfileName(name: string) {
    const state = SETTINGS.skillMonitor.state;
    const index = Math.min(
      Math.max(state.activeProfileIndex, 0),
      Math.max(0, state.profiles.length - 1),
    );
    state.profiles = state.profiles.map((profile, i) =>
      i === index ? { ...profile, name } : profile,
    );
  }

  function addProfile() {
    const nextIndex = SETTINGS.skillMonitor.state.profiles.length + 1;
    const nextProfile = createDefaultSkillMonitorProfile(
      tm("Profile {{index}}", { index: nextIndex }),
    );
    SETTINGS.skillMonitor.state.profiles = [
      ...SETTINGS.skillMonitor.state.profiles,
      nextProfile,
    ];
    SETTINGS.skillMonitor.state.activeProfileIndex =
      SETTINGS.skillMonitor.state.profiles.length - 1;
  }

  function renameActiveProfile() {
    const nextName = window.prompt(tl("Enter a new profile name"), activeProfile.name);
    if (!nextName) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    updateActiveProfileName(trimmedName);
  }

  function removeActiveProfile() {
    const state = SETTINGS.skillMonitor.state;
    if (state.profiles.length <= 1) return;
    const index = Math.min(
      Math.max(state.activeProfileIndex, 0),
      state.profiles.length - 1,
    );
    state.profiles = state.profiles.filter((_, i) => i !== index);
    state.activeProfileIndex = Math.min(index, state.profiles.length - 1);
  }
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
  <div>
    <h2 class="text-base font-semibold text-foreground">{tl("Profile Settings")}</h2>
    <p class="text-xs text-muted-foreground">{tl("Create multiple monitoring profiles and switch between them quickly")}</p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <select
      class="w-full sm:w-72 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      value={activeProfileIndex}
      onchange={(event) =>
        setActiveProfileIndex(Number((event.currentTarget as HTMLSelectElement).value))}
    >
      {#each profiles as profile, idx (idx)}
        <option value={idx}>{profile.name}</option>
      {/each}
    </select>
    <button
      type="button"
      class="text-xs px-3 py-2 rounded border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
      onclick={addProfile}
    >
      {tl("New Profile")}
    </button>
    <button
      type="button"
      class="text-xs px-3 py-2 rounded border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
      onclick={renameActiveProfile}
    >
      {tl("Rename")}
    </button>
    <button
      type="button"
      class="text-xs px-3 py-2 rounded border border-border/60 text-destructive hover:bg-destructive/10 transition-colors disabled:text-muted-foreground disabled:hover:bg-transparent"
      onclick={removeActiveProfile}
      disabled={profiles.length <= 1}
    >
      {tl("Delete Profile")}
    </button>
  </div>
</div>
