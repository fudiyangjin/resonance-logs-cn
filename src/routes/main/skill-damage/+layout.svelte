<script lang="ts">
  import FlameIcon from "virtual:icons/lucide/flame";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import PlayIcon from "virtual:icons/lucide/play";
  import PauseIcon from "virtual:icons/lucide/pause";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import { t } from "$lib/i18n/index.svelte";
  import { isHudDomainEnabled } from "$lib/hud-domain-rules.svelte";
  import {
    toggleHudDomainWithRestore,
    toggleHudEditing,
  } from "$lib/overlay-window-visibility.svelte";
  import {
    activeLoadout,
    removeDamageProfileEverywhere,
    setLoadoutDamageProfile,
  } from "$lib/loadouts.svelte.js";
  import {
    createSkillDamageProfileSlot,
    renameSkillDamageProfile,
  } from "$lib/skill-damage-profile.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import LoadoutProfileSwitcher from "$lib/components/LoadoutProfileSwitcher.svelte";

  let { children } = $props();

  // Tracks the persisted intent, not the physical window: an auto-hidden
  // scene must not make the button read as "off" while the HUD is on.
  const overlayEnabled = $derived(isHudDomainEnabled("damage"));
  const loadout = $derived(activeLoadout());

  async function run(action: () => Promise<void>, failure: string) {
    try {
      await action();
    } catch (error) {
      console.error(failure, error);
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div
        class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg"
      >
        <FlameIcon class="h-5 w-5" />
      </div>
      <div>
        <h1 class="text-foreground text-xl font-bold">
          {t("routes.tools.skillDamage")}
        </h1>
        <p class="text-muted-foreground text-sm">
          {t("skillDamage.pageDescription")}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={overlayEnabled}
        class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-colors {overlayEnabled
          ? 'border-border/60 bg-muted/30 text-foreground hover:bg-muted/50 border'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
        onclick={() =>
          run(
            () => toggleHudDomainWithRestore("damage"),
            "Failed to toggle skill damage overlay",
          )}
      >
        {#if overlayEnabled}<PauseIcon class="h-4 w-4" />{:else}<PlayIcon
            class="h-4 w-4"
          />{/if}
        <span>{t("skillDamage.actions.toggleOverlay")}</span>
        <ExternalLinkIcon class="h-3.5 w-3.5 opacity-70" />
      </button>
      <button
        type="button"
        class="border-border/60 bg-muted/30 hover:bg-muted/50 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium"
        onclick={() =>
          run(toggleHudEditing, "Failed to edit skill damage layout")}
      >
        <PenSquareIcon class="h-4 w-4" />
        {t("skillDamage.actions.editLayout")}
        <ExternalLinkIcon class="h-3.5 w-3.5 opacity-70" />
      </button>
    </div>
  </div>

  <LoadoutProfileSwitcher
    kind="damage"
    i18nPrefix="skillDamage.profile"
    profiles={SETTINGS.monitoring.state.skillDamage.profiles}
    activeProfileId={loadout?.damageProfileId ?? ""}
    onselect={(profileId) => {
      if (loadout) setLoadoutDamageProfile(loadout.id, profileId);
    }}
    oncreate={() => createSkillDamageProfileSlot("")}
    onrename={renameSkillDamageProfile}
    onremove={removeDamageProfileEverywhere}
  />

  {@render children()}
</div>
