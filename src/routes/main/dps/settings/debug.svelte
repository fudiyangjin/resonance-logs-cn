<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { Button } from "$lib/components/ui/button";
  import { save } from "@tauri-apps/plugin-dialog";
  import { toast } from "svelte-sonner";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";

  const t = uiT("dps/settings-debug", () => SETTINGS.live.general.state.language);

  async function openLogDir() {
    try {
      await invoke("open_log_dir");
    } catch (e) {
      console.error(e);
      toast.error(`${t("openLogDirFailed", "Failed to open log folder:")} ${String(e)}`);
    }
  }

  async function createDiagnosticsBundle() {
    try {
      const ts = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const defaultName = `debug_${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}.zip`;

      const destinationPath = await save({
        title: t("bundleSaveTitle", "Save Diagnostics Bundle"),
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
        toast.success(`${t("bundleCreatedCopied", "Diagnostics bundle created and path copied:")} ${path}`);
      } catch {
        toast.success(`${t("bundleCreated", "Diagnostics bundle created:")} ${path}`);
      }
    } catch (e) {
      console.error(e);
      toast.error(`${t("bundleFailed", "Failed to create diagnostics bundle:")} ${String(e)}`);
    }
  }
</script>

<div class="space-y-3">
  <div
    class="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="px-4 py-3">
      <h2 class="mb-4 text-base font-semibold text-foreground">
        {t("title", "调试")}
      </h2>

      <div class="flex items-center justify-between gap-3">
        <div class="text-sm text-muted-foreground">
          <div class="font-medium text-foreground">
            {t("logFiles", "日志文件")}
          </div>
          {t("openLogDir", "打开应用日志所在文件夹")}
        </div>
        <Button variant="outline" onclick={openLogDir}>
          {t("openLogsButton", "打开日志")}
        </Button>
      </div>

      <div class="mt-4 flex items-center justify-between gap-3">
        <div class="text-sm text-muted-foreground">
          <div class="font-medium text-foreground">
            {t("bundleTitle", "调试压缩包")}
          </div>
          {t("bundleDescription", "生成包含最近日志的 ZIP，便于支持与排查")}
        </div>
        <Button variant="outline" onclick={createDiagnosticsBundle}>
          {t("bundleButton", "创建调试压缩包")}
        </Button>
      </div>
    </div>
  </div>
</div>
