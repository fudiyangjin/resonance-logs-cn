<script lang="ts">
  import { SETTINGS, defaultSkillDamageDisplay } from "$lib/settings-store";
  import { createSkillDamageGroup } from "$lib/skill-damage-groups";
  import { t } from "$lib/i18n/index.svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import SkillDamageGroupEditor from "./skill-damage-group-editor.svelte";
  SETTINGS.monsterMonitor.state.skillDamageDisplay ??=
    defaultSkillDamageDisplay();
  const config = $derived(SETTINGS.monsterMonitor.state.skillDamageDisplay!);
  $effect(() => {
    if (!config.groups)
      config.groups = [
        createSkillDamageGroup(t("skillDamage.defaultGroup"), config),
      ];
  });
  let selectedId = $state("");
  const groups = $derived(config.groups ?? []);
  const selected = $derived(
    groups.find((group) => group.id === selectedId) ?? groups[0],
  );
  function addGroup() {
    const group = createSkillDamageGroup(
      `${t("skillDamage.group")} ${groups.length + 1}`,
    );
    config.groups = [...groups, group];
    selectedId = group.id;
  }
</script>

<section class="space-y-4 rounded-lg border p-4">
  <h2 class="text-lg font-semibold">{t("monsterMonitor.tabs.skillDamage")}</h2>
  <SettingsSwitch
    bind:checked={config.enabled}
    label={t("skillDamage.enabled")}
  />
  <SettingsSwitch
    checked={SETTINGS.monsterMonitor.state.overlayVisibility
      ?.showSkillDamagePanel ?? true}
    onCheckedChange={(checked) =>
      (SETTINGS.monsterMonitor.state.overlayVisibility.showSkillDamagePanel =
        checked)}
    label={t("skillDamage.showRegion")}
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
            >{group.name}</option
          >{/each}
      </select>
    </label>
    <button class="rounded border px-3 py-2 text-sm" onclick={addGroup}
      >{t("skillDamage.addGroup")}</button
    >
    {#if selected}
      <button
        class="rounded border px-3 py-2 text-sm"
        onclick={() => {
          config.groups = groups.filter((group) => group.id !== selected.id);
          selectedId = config.groups[0]?.id ?? "";
        }}>{t("skillDamage.deleteGroup")}</button
      >
    {/if}
  </div>
  {#if selected}<label class="flex items-center gap-2 text-sm"
      >{t("skillDamage.groupName")}<input
        class="bg-background flex-1 rounded border p-2"
        bind:value={selected.name}
      /></label
    >{/if}
</section>
{#if selected}{#key selected.id}<SkillDamageGroupEditor
      config={selected}
    />{/key}{/if}
