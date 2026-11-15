<script lang="ts">
  /**
   * @file One challenge group of the active loadout: its name, its forbidden
   * damages (name + id, so same-named ids stay distinguishable), the search
   * panel adding more, and saving it into the user's preset library.
   * Edits go back through `onchange` with a new group object.
   */
  import PlusIcon from "virtual:icons/lucide/plus";
  import Trash2 from "virtual:icons/lucide/trash-2";
  import X from "virtual:icons/lucide/x";
  import {
    addGroupDamageIds,
    removeGroupDamageIds,
    type ChallengeGroup,
    type ChallengeUserPreset,
  } from "$lib/challenge-watch";
  import {
    challengeDamageLabel,
    challengeGroupName,
  } from "$lib/challenge-watch-display";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import { blurOnEnter } from "$lib/utils.svelte";
  import ChallengeDamagePicker from "./challenge-damage-picker.svelte";

  interface Props {
    group: ChallengeGroup;
    /** The user preset this group is linked to, when it still exists. */
    linkedPreset: ChallengeUserPreset | undefined;
    onchange: (next: ChallengeGroup) => void;
    onremove: () => void;
    onsave: () => void;
  }

  let { group, linkedPreset, onchange, onremove, onsave }: Props = $props();

  let pickerOpen = $state(false);

  const displayName = $derived(challengeGroupName(group));
  // What the group is called with no name of its own (preset label/untitled).
  const fallbackName = $derived(challengeGroupName({ ...group, name: "" }));
  const damages = $derived(
    group.damageIds.map((id) => ({
      id,
      label: challengeDamageLabel(id, getLocale()),
    })),
  );
  const presetInSync = $derived(
    !!linkedPreset &&
      linkedPreset.name === displayName &&
      linkedPreset.damageIds.length === group.damageIds.length &&
      linkedPreset.damageIds.every((id, i) => id === group.damageIds[i]),
  );

  // Committed on change (blur / Enter), not per keystroke: every write
  // persists the whole settings file.
  function rename(input: HTMLInputElement) {
    const name = input.value.trim();
    input.value = name;
    if (name !== group.name) onchange({ ...group, name });
  }
</script>

<div
  class="border-border/60 bg-background/30 space-y-2.5 rounded-lg border p-3"
>
  <div class="flex flex-wrap items-center gap-2">
    <input
      type="text"
      class="border-border/60 bg-background/60 text-foreground placeholder:text-muted-foreground/70 focus:ring-ring/40 h-8 min-w-0 flex-1 rounded-md border px-2.5 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
      aria-label={t("challengeWatch.group.nameLabel")}
      placeholder={fallbackName}
      value={group.name}
      onchange={(event) => rename(event.currentTarget)}
      {@attach blurOnEnter}
    />
    <button
      type="button"
      class="border-border/60 hover:bg-muted/40 h-8 cursor-pointer rounded-md border px-2.5 text-xs transition-colors disabled:cursor-default disabled:opacity-60"
      disabled={presetInSync || group.damageIds.length === 0}
      onclick={onsave}
    >
      {presetInSync
        ? t("challengeWatch.group.presetSaved")
        : linkedPreset
          ? t("challengeWatch.group.updatePreset")
          : t("challengeWatch.group.saveAsPreset")}
    </button>
    <button
      type="button"
      class="text-muted-foreground inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-red-500/10 hover:text-red-500"
      aria-label={t("challengeWatch.group.remove")}
      title={t("challengeWatch.group.remove")}
      onclick={onremove}
    >
      <Trash2 class="h-4 w-4" />
    </button>
  </div>

  {#if damages.length === 0}
    <div class="text-muted-foreground/70 py-0.5 text-xs italic">
      {t("challengeWatch.group.noDamage")}
    </div>
  {:else}
    <div class="flex flex-wrap gap-1.5">
      {#each damages as damage (damage.id)}
        <span
          class="bg-muted/40 border-border/60 text-foreground inline-flex h-7 items-center gap-1.5 rounded-full border pr-1.5 pl-2.5 text-xs"
        >
          <span class="max-w-[20rem] truncate" title={damage.label}>
            {damage.label}
          </span>
          <button
            type="button"
            onclick={() => onchange(removeGroupDamageIds(group, [damage.id]))}
            aria-label={t("challengeWatch.remove")}
            class="text-muted-foreground inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  {#if pickerOpen}
    <ChallengeDamagePicker
      ids={group.damageIds}
      onadd={(ids) => onchange(addGroupDamageIds(group, ids))}
      onclose={() => (pickerOpen = false)}
    />
  {:else}
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors"
      aria-expanded={pickerOpen}
      onclick={() => (pickerOpen = true)}
    >
      <PlusIcon class="h-3 w-3" />
      {t("challengeWatch.group.addDamage")}
    </button>
  {/if}
</div>
