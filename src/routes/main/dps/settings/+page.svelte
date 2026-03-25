<script lang="ts">
  /**
   * @file Settings page for the DPS detection tool.
   * Contains Live settings, Network settings, Shortcuts, History, and Debug tabs.
   */
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { tl } from "$lib/i18n/index.svelte";
  import LiveSettings from "./live.svelte";
  import NetworkSettings from "./network.svelte";
  import ShortcutsSettings from "./shortcuts.svelte";
  import HistorySettings from "./history.svelte";
  import DebugSettings from "./debug.svelte";

  const settingsTabs = [
    { id: "live", label: "Live" },
    { id: "network", label: "Network" },
    { id: "shortcuts", label: "Shortcuts" },
    { id: "history", label: "History" },
    { id: "debug", label: "Debug" },
  ];

  let activeTab = $state("live");
</script>

<div class="space-y-4">
  <Tabs.Root bind:value={activeTab}>
    <Tabs.List>
      {#each settingsTabs as tab (tab.id)}
        <Tabs.Trigger value={tab.id}>{tl(tab.label)}</Tabs.Trigger>
      {/each}
    </Tabs.List>

    <LiveSettings />
    <NetworkSettings />
    <ShortcutsSettings />
    <HistorySettings />
    <DebugSettings />
  </Tabs.Root>
</div>
