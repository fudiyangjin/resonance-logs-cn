<script lang="ts">
  /**
   * @file Application-level settings (network / shortcuts / diagnostics /
   * language). These are global — they don't travel with a loadout and
   * aren't exported. DPS-specific display settings (live / history) live
   * under the DPS tool's own settings tab.
   */
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import NetworkSettings from "../dps/settings/network.svelte";
  import ShortcutsSettings from "../dps/settings/shortcuts.svelte";
  import DebugSettings from "../dps/settings/debug.svelte";
  import LanguageSettings from "./language.svelte";
  import BehaviorSettings from "./behavior.svelte";
  import AppearanceSettings from "./appearance.svelte";
  import HistoryRetentionSettings from "./history-retention.svelte";
  import TeamShareSettings from "./team-share.svelte";
  import HpReportSettings from "./hp-report.svelte";
  import CogIcon from "virtual:icons/lucide/cog";

  const settingsTabs = [
    { id: "general", labelKey: "appSettings.tabs.general" },
    { id: "appearance", labelKey: "appSettings.tabs.appearance" },
    { id: "network", labelKey: "appSettings.tabs.network" },
    { id: "shortcuts", labelKey: "appSettings.tabs.shortcuts" },
    { id: "diagnostics", labelKey: "appSettings.tabs.diagnostics" },
  ] satisfies Array<{ id: string; labelKey: MessageKey }>;

  let activeTab = $state("general");
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div
      class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg"
    >
      <CogIcon class="h-5 w-5" />
    </div>
    <div>
      <h1 class="text-foreground text-xl font-bold">
        {t("appSettings.title")}
      </h1>
      <p class="text-muted-foreground text-sm">
        {t("appSettings.description")}
      </p>
    </div>
  </div>

  <Tabs.Root bind:value={activeTab}>
    <Tabs.List>
      {#each settingsTabs as tab (tab.id)}
        <Tabs.Trigger value={tab.id}>{t(tab.labelKey)}</Tabs.Trigger>
      {/each}
    </Tabs.List>

    <Tabs.Content value="general">
      <div class="space-y-3">
        <LanguageSettings />
        <BehaviorSettings />
        <TeamShareSettings />
        <HpReportSettings />
        <HistoryRetentionSettings />
      </div>
    </Tabs.Content>

    <Tabs.Content value="appearance">
      <AppearanceSettings />
    </Tabs.Content>

    <Tabs.Content value="network">
      <NetworkSettings />
    </Tabs.Content>

    <ShortcutsSettings />

    <Tabs.Content value="diagnostics">
      <DebugSettings />
    </Tabs.Content>
  </Tabs.Root>
</div>
