<script lang="ts">
  /**
   * @file Meter settings page for the DPS tool.
   * Contains the meter-specific Live and History tabs.
   */
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import HistorySettings from "./history.svelte";
  import LiveSettings from "./live.svelte";

  const t = uiT("dps/general", () => SETTINGS.live.general.state.language);

  const settingsTabs = [
    { id: "live", key: "settings.live", label: "Live" },
    { id: "history", key: "settings.history", label: "History" },
  ];

  let activeTab = $state("live");
</script>

<div class="space-y-4">
  <Tabs.Root bind:value={activeTab}>
    <Tabs.List>
      {#each settingsTabs as tab (tab.id)}
        <Tabs.Trigger value={tab.id}>{t(tab.key, tab.label)}</Tabs.Trigger>
      {/each}
    </Tabs.List>

    <LiveSettings />

    <Tabs.Content value="history">
      <HistorySettings />
    </Tabs.Content>
  </Tabs.Root>
</div>
