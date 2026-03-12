<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { Button } from "$lib/components/ui/button";
    import { save } from "@tauri-apps/plugin-dialog";
    import { toast } from "svelte-sonner";

    async function openLogDir() {
        try {
            await invoke("open_log_dir");
        } catch (e) {
            console.error(e);
            toast.error("Failed to open log directory: " + e);
        }
    }

    async function createDiagnosticsBundle() {
        try {
            const ts = new Date();
            const pad = (n: number) => n.toString().padStart(2, "0");
            const defaultName = `debug_${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}.zip`;

            const destinationPath = await save({
                title: "Save Debug Bundle",
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
                toast.success("Debug bundle created (path copied): " + path);
            } catch {
                toast.success("Debug bundle created: " + path);
            }
        } catch (e) {
            console.error(e);
            toast.error("Failed to create debug bundle: " + e);
        }
    }
</script>

<div class="space-y-3">
    <div
        class="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
        <div class="px-4 py-3">
            <h2 class="mb-4 text-base font-semibold text-foreground">
                Debug
            </h2>

            <div class="flex items-center justify-between">
                <div class="text-sm text-muted-foreground">
                    <div class="font-medium text-foreground">Log Files</div>
                    Open the folder containing application logs
                </div>
                <Button variant="outline" onclick={openLogDir}>
                    Open Logs
                </Button>
            </div>

            <div class="mt-4 flex items-center justify-between">
                <div class="text-sm text-muted-foreground">
                    <div class="font-medium text-foreground">Debug Bundle</div>
                    Generate a ZIP of recent logs for support and troubleshooting
                </div>
                <Button variant="outline" onclick={createDiagnosticsBundle}>
                    Create Debug Bundle
                </Button>
            </div>
        </div>
    </div>
</div>
