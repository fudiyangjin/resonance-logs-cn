<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import SettingsSelect from "./settings-select.svelte";
  import { SETTINGS } from "$lib/settings-store";

  const SETTINGS_CATEGORY = "app";
</script>

<Tabs.Content value={SETTINGS_CATEGORY}>
  <div class="space-y-3">
    <div class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <div class="px-4 py-3 border-b border-border/40">
        <h2 class="text-base font-semibold text-foreground">Application</h2>
      </div>
      <div class="px-4 pb-3 pt-2 space-y-1">
        <SettingsSelect
          bind:selected={SETTINGS.app.state.language}
          values={[
            { label: "System", value: "system" },
            { label: "Simplified Chinese", value: "zh-CN" },
            { label: "English", value: "en" },
          ]}
          label="Language"
          description="Select the interface language. Changes are applied immediately."
        />
      </div>
    </div>
  </div>
</Tabs.Content>
