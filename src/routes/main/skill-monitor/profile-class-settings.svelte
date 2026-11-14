<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import { getClassConfigs } from "$lib/skill-mappings";
  import { SETTINGS, type Loadout, type SkillMonitorProfile } from "$lib/settings-store";
  import { editSkillProfileClass } from "$lib/skill-monitor-profile.svelte.js";
  import {
    matchesSkillProfileEdit,
    MONITOR_CLASS_SELECT_ID,
    skillProfileClassImpact,
    type SkillProfileEditContext,
  } from "$lib/skill-profile-class";

  let { profile, loadout, copyName }: {
    profile: SkillMonitorProfile;
    loadout: Loadout;
    copyName: string;
  } = $props();

  const classes = $derived(getClassConfigs());
  const impact = $derived(skillProfileClassImpact(profile, SETTINGS.loadouts.state.items));
  const shared = $derived(impact.consumers.length > 1);
  const consumerNames = $derived(new Intl.ListFormat(getLocale()).format(impact.consumers.map((item) => item.name)));
  let pending = $state<(SkillProfileEditContext & { target: string }) | null>(null);

  function className(key: string): string {
    return classes.find((item) => item.classKey === key)?.className ?? key;
  }

  // Only dismiss transient UI here; persisted settings change in event handlers.
  $effect(() => {
    if (pending && !matchesSkillProfileEdit(pending, loadout, profile)) pending = null;
  });

  function selectClass(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const target = select.value;
    // The browser already selected the option. Restore the committed value
    // until confirmation, including when the user cancels the dialog.
    select.value = profile.selectedClass;
    if (target === profile.selectedClass) return;
    const context = {
      loadoutId: loadout.id,
      profileId: profile.id,
      classKey: profile.selectedClass,
    };
    if (!shared && impact.skillCount === 0 && impact.voiceCount === 0) {
      editSkillProfileClass(context, target);
    } else {
      pending = { ...context, target };
    }
  }

  function confirm(copy: boolean) {
    if (!pending) return;
    editSkillProfileClass(pending, pending.target, copy ? copyName : undefined);
    pending = null;
  }
</script>

<div class="space-y-2 border-t border-border/40 pt-3">
  <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
    <label for={MONITOR_CLASS_SELECT_ID} class="text-sm font-medium text-foreground sm:w-24">
      {t("skillMonitor.profile.classLabel")}
    </label>
    <select
      id={MONITOR_CLASS_SELECT_ID}
      aria-describedby="monitor-class-help"
      class="w-full scroll-mt-4 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 sm:w-72"
      value={profile.selectedClass}
      onchange={selectClass}
    >
      {#each classes as config (config.classKey)}
        <option value={config.classKey}>{config.className}</option>
      {/each}
    </select>
  </div>
  <p id="monitor-class-help" class="text-xs text-muted-foreground">
    {t("skillMonitor.profile.classHelp")}
  </p>
  {#if shared}
    <p class="text-sm text-foreground">
      {t("skillMonitor.profile.shared", { names: consumerNames })}
    </p>
  {/if}
</div>

<Dialog.Root open={pending !== null} onOpenChange={(open) => { if (!open) pending = null; }}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{t("skillMonitor.profile.changeClass")}</Dialog.Title>
      <Dialog.Description>
        {t("skillMonitor.profile.classChangeImpact", {
          from: className(pending?.classKey ?? profile.selectedClass),
          to: className(pending?.target ?? profile.selectedClass),
          skills: impact.skillCount,
          voices: impact.voiceCount,
        })}
      </Dialog.Description>
    </Dialog.Header>
    {#if shared}
      <p class="text-sm">{t("skillMonitor.profile.shared", { names: consumerNames })}</p>
      <p class="text-sm text-muted-foreground">{t("skillMonitor.profile.privateCopyHelp")}</p>
    {/if}
    <Dialog.Footer class="flex-wrap gap-2">
      <Button variant="outline" onclick={() => (pending = null)}>{t("common.cancel")}</Button>
      {#if shared}
        <Button variant="outline" onclick={() => confirm(false)}>{t("skillMonitor.profile.changeShared")}</Button>
        <Button onclick={() => confirm(true)}>{t("skillMonitor.profile.copyForCurrent")}</Button>
      {:else}
        <Button variant="destructive" onclick={() => confirm(false)}>{t("skillMonitor.profile.confirmClassChange")}</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
