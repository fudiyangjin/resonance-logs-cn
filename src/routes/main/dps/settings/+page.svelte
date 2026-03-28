<script lang="ts">
  /**
   * @file Settings page for the DPS detection tool.
   * Contains Live settings, Network settings, Shortcuts, History, and Debug tabs.
   */
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import LiveSettings from "./live.svelte";
  import NetworkSettings from "./network.svelte";
  import ShortcutsSettings from "./shortcuts.svelte";
  import HistorySettings from "./history.svelte";
  import DebugSettings from "./debug.svelte";
  import { resolveNavigationTranslation } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";

  const settingsTabs = [
    { id: "live", key: "dps.settings.live", label: "实时" },
    { id: "network", key: "dps.settings.network", label: "网络" },
    { id: "shortcuts", key: "dps.settings.shortcuts", label: "快捷键" },
    { id: "history", key: "dps.settings.history", label: "历史" },
    { id: "debug", key: "dps.settings.debug", label: "调试" },
  ];

  let activeTab = $state("live");
</script>

<div class="space-y-4">
  <Tabs.Root bind:value={activeTab}>
    <Tabs.List>
      {#each settingsTabs as tab (tab.id)}
        <Tabs.Trigger value={tab.id}>{resolveNavigationTranslation(
          tab.key,
          SETTINGS.live.general.state.language,
          tab.label,
          )}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>

    <LiveSettings />

    <Tabs.Content value="network">
      <NetworkSettings />
    </Tabs.Content>

    <Tabs.Content value="shortcuts">
      <ShortcutsSettings />
    </Tabs.Content>

    <Tabs.Content value="history">
      <HistorySettings />
    </Tabs.Content>

    <Tabs.Content value="debug">
      <DebugSettings />
    </Tabs.Content>
  </Tabs.Root>
</div>
