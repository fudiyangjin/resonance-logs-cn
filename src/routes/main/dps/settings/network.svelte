<script lang="ts">
    import SettingsSelect from "./settings-select.svelte";
    import SettingsDropdown from "./settings-dropdown.svelte";
    import { SETTINGS } from "$lib/settings-store";
    import { invoke } from "@tauri-apps/api/core";
    import { onMount } from "svelte";
    import { untrack } from "svelte";
    import { uiT } from "$lib/i18n";

    type Device = {
        name: string;
        description: string | null;
    };

    let devices = $state<Device[]>([]);
    let npcapInstalled = $state(false);
    let loading = $state(false);
    let mounted = $state(false);
    let initialMethod = $state<string | null>(null);
    let initialDevice = $state<string | null>(null);

    const t = uiT("dps/settings-network", () => SETTINGS.live.general.state.language);

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

        if (initialMethod !== null && method === initialMethod && device === initialDevice) {
            return;
        }

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

<div class="space-y-3">
    <div
        class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
        <div class="px-4 py-3">
            <h2 class="text-base font-semibold text-foreground mb-2">
                {t("title", "抓包")}
            </h2>

            <SettingsSelect
                bind:selected={SETTINGS.packetCapture.state.method}
                label={t("captureMethod", "捕获方式")}
                description={t("captureMethodDescription", "选择用于捕获网络数据包的方法（需要重启应用）。")}
                values={["WinDivert", "Npcap"]}
            />

            {#if SETTINGS.packetCapture.state.method === "Npcap"}
                {#if !npcapInstalled}
                    <div
                        class="mt-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm"
                    >
                        {t("npcapMissing", "未检测到 Npcap。请从")}
                        <a
                            href="https://npcap.com/"
                            target="_blank"
                            class="underline"
                        >
                            npcap.com
                        </a>
                        {" "}
                        {t("npcapMissingSuffix", "安装 Npcap 以使用该功能。")}
                    </div>
                {:else}
                    <SettingsDropdown
                        bind:selected={SETTINGS.packetCapture.state.npcapDevice}
                        label={t("networkDevice", "网络设备")}
                        description={t("networkDeviceDescription", "选择用于捕获流量的网卡。")}
                        options={deviceOptions}
                        placeholder={loading
                            ? t("loadingDevices", "正在加载设备...")
                            : t("selectDevice", "选择设备")}
                    />
                {/if}
            {/if}
        </div>
    </div>
</div>
