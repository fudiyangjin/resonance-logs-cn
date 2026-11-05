<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import {
    activeSkillDamageProfile,
    pruneUnusedSkillDamageFonts,
  } from "$lib/skill-damage-profile.svelte";
  import { createSkillDamageGroup } from "$lib/skill-damage-settings";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import SkillDamageGroupEditor from "./skill-damage-group-editor.svelte";

  const profile = $derived(activeSkillDamageProfile());
  const groups = $derived(profile?.groups ?? []);
  let selectedId = $state("");
  const selected = $derived(
    groups.find((group) => group.id === selectedId) ?? groups[0],
  );

  function addGroup() {
    if (!profile) return;
    const group = createSkillDamageGroup(
      `${t("skillDamage.group")} ${groups.length + 1}`,
      groups.length,
    );
    profile.groups = [...groups, group];
    selectedId = group.id;
  }

  function deleteSelectedGroup() {
    if (!profile || !selected) return;
    profile.groups = groups.filter((group) => group.id !== selected.id);
    selectedId = profile.groups[0]?.id ?? "";
    pruneUnusedSkillDamageFonts();
  }
</script>

{#if profile}
  <section class="space-y-4 rounded-lg border p-4">
    <SettingsSwitch
      bind:checked={profile.enabled}
      label={t("skillDamage.enabled")}
    />
    <SettingsSwitch
      bind:checked={profile.autoHideInDailyScenes}
      label={t("skillDamage.autoHideInDailyScenes.label")}
      description={t("skillDamage.autoHideInDailyScenes.description")}
    />
    <div class="flex flex-wrap items-center gap-2">
      <label class="text-sm"
        >{t("skillDamage.group")}
        <select
          class="bg-background rounded border p-2"
          value={selected?.id ?? ""}
          onchange={(event) => (selectedId = event.currentTarget.value)}
        >
          {#each groups as group (group.id)}<option value={group.id}
              >{group.name || t("skillDamage.defaultGroup")}</option
            >{/each}
        </select>
      </label>
      <button class="rounded border px-3 py-2 text-sm" onclick={addGroup}
        >{t("skillDamage.addGroup")}</button
      >
      {#if selected}
        <button
          class="rounded border px-3 py-2 text-sm"
          onclick={deleteSelectedGroup}>{t("skillDamage.deleteGroup")}</button
        >
      {/if}
    </div>
    {#if selected}<label class="flex items-center gap-2 text-sm"
        >{t("skillDamage.groupName")}<input
          class="bg-background flex-1 rounded border p-2"
          placeholder={t("skillDamage.defaultGroup")}
          bind:value={selected.name}
        /></label
      >{/if}
  </section>
  {#if selected}
    <!-- Copied profiles share group ids, so the key includes the profile. -->
    {#key `${profile.id}:${selected.id}`}<SkillDamageGroupEditor
        group={selected}
      />{/key}
  {/if}
{/if}
