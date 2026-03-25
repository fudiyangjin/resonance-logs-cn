<script lang="ts">
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import SettingsSelect from "./settings-select.svelte";
    import SettingsDropdown from "./settings-dropdown.svelte";
    import { SETTINGS } from "$lib/settings-store";
    import { tl } from "$lib/i18n/index.svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { onMount } from "svelte";
    import { untrack } from "svelte";

    type Device = {
        name: string;
        description: string | null;
    };

    let devices = $state<Device[]>([]);
    let npcapInstalled = $state(false);
    let loading = $state(false);
    let mounted = $state(false);
    // Track initial values to detect actual user changes
    let initialMethod = $state<string | null>(null);
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
            initialMethod = SETTINGS.packetCapture.state.method;
            initialDevice = SETTINGS.packetCapture.state.npcapDevice;
        });
        mounted = true;
        loadDevices();
    });

    $effect(() => {
        if (!mounted) return;
        const method = SETTINGS.packetCapture.state.method;
        const device = SETTINGS.packetCapture.state.npcapDevice;

        // Skip saving if values haven't changed from initial (prevents overwriting on mount)
        if (initialMethod !== null && method === initialMethod && device === initialDevice) {
            return;
        }

        // Update tracked values for future comparisons
        initialMethod = method;
        initialDevice = device;

        invoke("save_packet_capture_settings", {
            method,
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

<Tabs.Content value="network">
<div class="space-y-3">
    <div
        class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
        <div class="px-4 py-3">
            <h2 class="text-base font-semibold text-foreground mb-2">
                {tl("Packet Capture")}
            </h2>

            <SettingsSelect
                bind:selected={SETTINGS.packetCapture.state.method}
                label={tl("Capture Method")}
                description={tl("Choose the method used to capture network packets (requires app restart).")}
                values={["WinDivert", "Npcap"]}
            />

            {#if SETTINGS.packetCapture.state.method === "Npcap"}
                {#if !npcapInstalled}
                    <div
                        class="mt-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm"
                    >
                        {tl("Npcap was not detected. Please install it from ")}<a
                            href="https://npcap.com/"
                            target="_blank"
                            class="underline">npcap.com</a
                        >{tl(" to use this feature.")}
                    </div>
                {:else}
                    <SettingsDropdown
                        bind:selected={SETTINGS.packetCapture.state.npcapDevice}
                        label={tl("Network Device")}
                        description={tl("Choose the network interface used to capture traffic.")}
                        options={deviceOptions}
                        placeholder={loading
                            ? tl("Loading devices...")
                            : tl("Select Device")}
                    />
                {/if}
            {/if}
    </div>
</div>
</Tabs.Content>
