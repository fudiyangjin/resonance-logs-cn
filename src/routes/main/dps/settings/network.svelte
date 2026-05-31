<script lang="ts">
  import SettingsDropdown from "./settings-dropdown.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { untrack } from "svelte";
  import { t } from "$lib/i18n/index.svelte";

  type Device = {
    name: string;
    description: string | null;
  };

  let devices = $state<Device[]>([]);
  let npcapInstalled = $state(false);
  let loading = $state(false);
  let mounted = $state(false);
  // Track initial values to detect actual user changes
  let initialDevice = $state<string | null>(null);

  async function loadDevices() {
    loading = true;
    try {
      npcapInstalled = await invoke("check_npcap_status");
      if (npcapInstalled) {
        devices = await invoke("get_network_devices");
      }
    } catch (e) {
      console.error("Failed to load network info", e);
    }
    loading = false;
  }

  onMount(() => {
    // Capture initial values before marking as mounted
    // Use untrack to avoid reactive dependencies
    untrack(() => {
      initialDevice = SETTINGS.packetCapture.state.npcapDevice;
    });
    mounted = true;
    loadDevices();
  });

  $effect(() => {
    if (!mounted) return;
    const device = SETTINGS.packetCapture.state.npcapDevice;

    // Skip saving if values haven't changed from initial (prevents overwriting on mount)
    if (initialDevice !== null && device === initialDevice) {
      return;
    }

    // Update tracked values for future comparisons
    initialDevice = device;

    invoke("save_packet_capture_settings", {
      npcapDevice: device,
    }).catch((e) => console.error("Failed to save packet capture settings", e));
  });

  let deviceOptions = $derived(
    devices.map((d) => ({
      value: d.name,
      label: d.description || d.name,
    })),
  );
</script>

<div class="space-y-3">
  <div
    class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="px-4 py-3">
      <h2 class="text-base font-semibold text-foreground mb-2">
        {t("settings.network.packetCapture")}
      </h2>

      {#if !npcapInstalled}
        <div class="mt-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          {t("settings.network.npcapMissing.prefix")}<a
            href="https://npcap.com/"
            target="_blank"
            class="underline">npcap.com</a
          >{t("settings.network.npcapMissing.suffix")}
        </div>
      {:else}
        <SettingsDropdown
          bind:selected={SETTINGS.packetCapture.state.npcapDevice}
          label={t("settings.network.device")}
          description={t("settings.network.deviceDescription")}
          options={deviceOptions}
          placeholder={loading
            ? t("settings.network.deviceLoading")
            : t("settings.network.devicePlaceholder")}
        />
        <p class="mt-3 text-xs text-muted-foreground leading-relaxed">
          {t("settings.network.restartHint")}
        </p>
      {/if}
    </div>
  </div>
</div>
