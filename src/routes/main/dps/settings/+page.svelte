<script lang="ts">
  /**
   * @file Settings page for the DPS detection tool. Holds only the
   * loadout-scoped display settings (live / history). Application-level
   * settings (network / shortcuts / diagnostics / language) live under
   * /main/app-settings.
   */
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import LiveSettings from "./live.svelte";
  import HistorySettings from "./history.svelte";

  const settingsTabs = [
    { id: "live", labelKey: "settings.tabs.live" },
    { id: "history", labelKey: "settings.tabs.history" },
  ] satisfies Array<{ id: string; labelKey: MessageKey }>;

  let activeTab = $state("live");
</script>

<div class="space-y-4">
  <Tabs.Root bind:value={activeTab}>
    <Tabs.List>
      {#each settingsTabs as tab (tab.id)}
        <Tabs.Trigger value={tab.id}>{t(tab.labelKey)}</Tabs.Trigger>
      {/each}
    </Tabs.List>

    <p class="text-muted-foreground text-xs">
      {activeTab === "live"
        ? t("settings.scope.live")
        : t("settings.scope.history")}
    </p>

    <LiveSettings />
    <HistorySettings />
  </Tabs.Root>
</div>
