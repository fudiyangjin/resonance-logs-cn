<script lang="ts">
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import { invoke } from "@tauri-apps/api/core";
    import { Button } from "$lib/components/ui/button";
    import { save } from "@tauri-apps/plugin-dialog";
    import { tl } from "$lib/i18n/index.svelte";
    import { toast } from "svelte-sonner";

    async function openLogDir() {
        try {
            await invoke("open_log_dir");
        } catch (e) {
            console.error(e);
            toast.error(tl("Failed to open log directory: ") + e);
        }
    }

    async function createDiagnosticsBundle() {
        try {
            const ts = new Date();
            const pad = (n: number) => n.toString().padStart(2, "0");
            const defaultName = `debug_${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}.zip`;

            const destinationPath = await save({
                title: tl("Create Debug Archive"),
                defaultPath: defaultName,
                filters: [{ name: "Zip", extensions: ["zip"] }],
            });

            if (!destinationPath) {
                return;
            }

            const path = await invoke<string>("create_diagnostics_bundle", {
                destination_path: destinationPath,
            });
            try {
                await navigator.clipboard.writeText(path);
                toast.success(tl("Created debug archive (path copied): ") + path);
            } catch {
                toast.success(tl("Created debug archive: ") + path);
            }
        } catch (e) {
            console.error(e);
            toast.error(tl("Failed to create debug archive: ") + e);
        }
    }
</script>

<Tabs.Content value="debug">
<div class="space-y-3">
    <div
        class="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
        <div class="px-4 py-3">
            <h2 class="mb-4 text-base font-semibold text-foreground">
                {tl("Debug")}
            </h2>

            <div class="flex items-center justify-between">
                <div class="text-sm text-muted-foreground">
                    <div class="font-medium text-foreground">{tl("Log Files")}</div>
                    {tl("Open the application log folder")}
                </div>
                <Button variant="outline" onclick={openLogDir}>
                    {tl("Open Logs")}
                </Button>
            </div>

            <div class="mt-4 flex items-center justify-between">
                <div class="text-sm text-muted-foreground">
                    <div class="font-medium text-foreground">{tl("Debug Archive")}</div>
                    {tl("Create a ZIP with recent logs for support and troubleshooting")}
                </div>
                <Button variant="outline" onclick={createDiagnosticsBundle}>
                    {tl("Create Debug Archive")}
                </Button>
            </div>
        </div>
    </div>
</div>
</Tabs.Content>
