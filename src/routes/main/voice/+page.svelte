<script lang="ts">
  import { onMount } from "svelte";
  import LayersIcon from "virtual:icons/lucide/layers";
  import ListMusicIcon from "virtual:icons/lucide/list-music";
  import SlidersHorizontalIcon from "virtual:icons/lucide/sliders-horizontal";
  import ZapIcon from "virtual:icons/lucide/zap";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    ensureVoiceListeners,
    refreshVoiceStatus,
  } from "$lib/stores/voice-store.svelte";
  import TabBindings from "./tab-bindings.svelte";
  import TabModel from "./tab-model.svelte";
  import TabOverview from "./tab-overview.svelte";
  import TabPhrases from "./tab-phrases.svelte";

  type VoiceTab = "overview" | "model" | "phrases" | "bindings";

  const TABS: { id: VoiceTab; labelKey: MessageKey; icon: typeof ZapIcon }[] = [
    {
      id: "overview",
      labelKey: "voice.tabs.overview",
      icon: SlidersHorizontalIcon,
    },
    { id: "model", labelKey: "voice.tabs.model", icon: LayersIcon },
    { id: "phrases", labelKey: "voice.tabs.phrases", icon: ListMusicIcon },
    { id: "bindings", labelKey: "voice.tabs.bindings", icon: ZapIcon },
  ];

  let activeTab = $state<VoiceTab>("overview");

  onMount(async () => {
    await ensureVoiceListeners();
    await refreshVoiceStatus();
  });
</script>

<div class="space-y-5">
  <section class="border-border/60 bg-card/60 rounded-xl border p-2">
    <div class="flex flex-wrap gap-2">
      {#each TABS as tab (tab.id)}
        <button
          type="button"
          class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
          tab.id
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => {
            activeTab = tab.id;
          }}
        >
          <tab.icon class="h-4 w-4" />
          {t(tab.labelKey)}
        </button>
      {/each}
    </div>
  </section>

  {#if activeTab === "overview"}
    <TabOverview />
  {:else if activeTab === "model"}
    <TabModel />
  {:else if activeTab === "phrases"}
    <TabPhrases />
  {:else if activeTab === "bindings"}
    <TabBindings />
  {/if}
</div>
