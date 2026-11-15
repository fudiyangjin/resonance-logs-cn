<script lang="ts">
  /**
   * @file Challenge-watch (forbidden-damage) settings — its own top-level DPS
   * tab (peer to 历史/主题/设置). The active loadout holds named groups of
   * forbidden damage ids; presets (built-in and the user's own library,
   * shared by every loadout) are templates copied into a new group.
   */
  import Check from "virtual:icons/lucide/check";
  import Plus from "virtual:icons/lucide/plus";
  import X from "virtual:icons/lucide/x";
  import { SETTINGS } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import { CHALLENGE_PRESETS } from "$lib/challenge-presets";
  import {
    createChallengeGroup,
    hasPresetGroup,
    normalizeChallengePresetLibrary,
    saveGroupAsUserPreset,
    type ChallengeGroup,
    type ChallengeUserPreset,
  } from "$lib/challenge-watch";
  import { challengeGroupName } from "$lib/challenge-watch-display";
  import ChallengeGroupCard from "./challenge-group-card.svelte";

  const groups = $derived(SETTINGS.challengeWatch.state.groups);
  // Its own persisted file: sanitize on read like the other global stores.
  const userPresets = $derived(
    normalizeChallengePresetLibrary(SETTINGS.challengePresets.state).presets,
  );
  const userPresetById = $derived(
    new Map(userPresets.map((preset) => [preset.id, preset])),
  );

  // Reassign whole arrays so the RuneStore proxies persist the change.
  function setGroups(next: ChallengeGroup[]) {
    SETTINGS.challengeWatch.state.groups = next;
  }

  function setUserPresets(next: ChallengeUserPreset[]) {
    SETTINGS.challengePresets.state.presets = next;
  }

  function addPresetGroup(preset: {
    id: string;
    name?: string;
    damageIds: number[];
  }) {
    if (hasPresetGroup(groups, preset.id)) return;
    setGroups([
      ...groups,
      createChallengeGroup({
        name: preset.name ?? "",
        presetId: preset.id,
        damageIds: preset.damageIds,
      }),
    ]);
  }

  function updateGroup(next: ChallengeGroup) {
    setGroups(groups.map((group) => (group.id === next.id ? next : group)));
  }

  function removeGroup(id: string) {
    setGroups(groups.filter((group) => group.id !== id));
  }

  function saveAsPreset(group: ChallengeGroup) {
    const saved = saveGroupAsUserPreset(
      userPresets,
      group,
      challengeGroupName(group),
    );
    setUserPresets(saved.presets);
    if (saved.group !== group) updateGroup(saved.group);
  }

  function removeUserPreset(id: string) {
    setUserPresets(userPresets.filter((preset) => preset.id !== id));
  }
</script>

{#snippet presetButton(label: string, added: boolean, onadd: () => void)}
  <button
    type="button"
    onclick={onadd}
    disabled={added}
    class="border-border/60 bg-muted/30 hover:bg-muted/60 text-foreground inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-60"
  >
    {#if added}
      <Check class="h-3 w-3" />
    {:else}
      <Plus class="h-3 w-3" />
    {/if}
    <span class="max-w-[16rem] truncate">{label}</span>
    {#if added}
      <span class="text-muted-foreground font-normal">
        {t("challengeWatch.presets.added")}
      </span>
    {/if}
  </button>
{/snippet}

<div class="space-y-3">
  <p class="text-muted-foreground text-xs">
    {t("settings.scope.live")}
  </p>

  <div
    class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="px-4 py-3">
      <h2 class="text-foreground text-base font-semibold">
        {t("challengeWatch.title")}
      </h2>
    </div>
    <div class="space-y-4 px-4 pt-1 pb-4">
      <p class="text-muted-foreground text-xs">
        {t("challengeWatch.description")}
      </p>

      <!-- Presets: built-in + the user's own library (one-click copies) -->
      <div class="space-y-1.5">
        <div class="text-muted-foreground text-xs font-medium">
          {t("challengeWatch.presets.title")}
        </div>
        <div class="flex flex-wrap gap-2">
          {#each CHALLENGE_PRESETS as preset (preset.id)}
            {@render presetButton(
              t(preset.labelKey),
              hasPresetGroup(groups, preset.id),
              () => addPresetGroup(preset),
            )}
          {/each}
        </div>
        <div class="text-muted-foreground pt-1 text-xs font-medium">
          {t("challengeWatch.presets.mine")}
        </div>
        {#if userPresets.length === 0}
          <div class="text-muted-foreground/70 text-xs italic">
            {t("challengeWatch.presets.mineEmpty")}
          </div>
        {:else}
          <div class="flex flex-wrap gap-2">
            {#each userPresets as preset (preset.id)}
              <span class="inline-flex items-center gap-0.5">
                {@render presetButton(
                  preset.name || t("challengeWatch.group.untitled"),
                  hasPresetGroup(groups, preset.id),
                  () => addPresetGroup(preset),
                )}
                <button
                  type="button"
                  onclick={() => removeUserPreset(preset.id)}
                  aria-label={t("challengeWatch.presets.delete")}
                  title={t("challengeWatch.presets.delete")}
                  class="text-muted-foreground inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <X class="h-3 w-3" />
                </button>
              </span>
            {/each}
          </div>
        {/if}
      </div>

      <!-- The active loadout's forbidden-damage groups -->
      <div class="space-y-2">
        <div class="text-muted-foreground text-xs font-medium">
          {t("challengeWatch.configuredTitle")}
        </div>
        {#if groups.length === 0}
          <div class="text-muted-foreground/70 py-1 text-xs italic">
            {t("challengeWatch.empty")}
          </div>
        {/if}
        {#each groups as group (group.id)}
          <ChallengeGroupCard
            {group}
            linkedPreset={group.presetId === null
              ? undefined
              : userPresetById.get(group.presetId)}
            onchange={updateGroup}
            onremove={() => removeGroup(group.id)}
            onsave={() => saveAsPreset(group)}
          />
        {/each}
        <button
          type="button"
          onclick={() => setGroups([...groups, createChallengeGroup()])}
          class="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs transition-colors"
        >
          <Plus class="h-3 w-3" />
          {t("challengeWatch.group.new")}
        </button>
      </div>
    </div>
  </div>
</div>
