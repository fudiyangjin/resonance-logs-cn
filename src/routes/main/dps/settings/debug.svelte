<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { Button } from "$lib/components/ui/button";
  import { save } from "@tauri-apps/plugin-dialog";
  import { toast } from "svelte-sonner";
  import { onDestroy } from "svelte";
  import SettingsSelect from "./settings-select.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import {
    TRANSLATION_SOURCE_MODE,
    getCurrentTranslationSourceMode,
    uiT,
    setTranslationSourceMode,
    type TranslationSourceMode,
  } from "$lib/i18n";

  let translationSourceMode = $state(getCurrentTranslationSourceMode() as TranslationSourceMode);
  let isSwitchingTranslationSource = $state(false);
  let isTranslationDebugCollapsed = $state(false);

  const t = uiT("dps/settings-debug", () => SETTINGS.live.general.state.language);

  const unsubscribeTranslationSourceMode = TRANSLATION_SOURCE_MODE.subscribe((value) => {
    translationSourceMode = value;
    isSwitchingTranslationSource = false;
  });

  onDestroy(() => {
    unsubscribeTranslationSourceMode();
  });

  async function openLogDir() {
    try {
      await invoke("open_log_dir");
    } catch (e) {
      console.error(e);
      toast.error("打开日志目录失败：" + e);
    }
  }

  async function createDiagnosticsBundle() {
    try {
      const ts = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const defaultName = `debug_${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}.zip`;

      const destinationPath = await save({
        title: "保存调试压缩包",
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
        toast.success("已创建调试压缩包（路径已复制）：" + path);
      } catch {
        toast.success("已创建调试压缩包：" + path);
      }
    } catch (e) {
      console.error(e);
      toast.error("创建调试压缩包失败：" + e);
    }
  }

  async function refreshTranslationRuntimeData() {
    try {
      const message = await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
    } catch (e) {
      console.error(e);
      toast.error("刷新翻译运行时数据失败：" + e);
    }
  }

  async function changeTranslationSourceMode(mode: TranslationSourceMode) {
    if (isSwitchingTranslationSource || translationSourceMode === mode) {
      return;
    }

    const previousMode = translationSourceMode;
    isSwitchingTranslationSource = true;
    translationSourceMode = mode;

    try {
      await setTranslationSourceMode(mode);
      toast.success(
        mode === "runtime"
          ? "Translation source switched to runtime files."
          : "Translation source switched to bundled source files.",
      );
    } catch (e) {
      console.error(e);
      translationSourceMode = previousMode;
      toast.error("切换翻译数据源失败：" + e);
    } finally {
      isSwitchingTranslationSource = false;
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

      <div class="flex items-center justify-between">
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

      <div class="mt-4 flex items-center justify-between">
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

  <div
    class="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="px-4 py-3 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold text-foreground">
          {t("translationTools", "翻译调试")}
        </h2>

        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          onclick={() => (isTranslationDebugCollapsed = !isTranslationDebugCollapsed)}
          aria-label={isTranslationDebugCollapsed ? "Expand" : "Collapse"}
          title={isTranslationDebugCollapsed ? "Expand" : "Collapse"}
        >
          <svg
            class={`h-4 w-4 transition-transform ${isTranslationDebugCollapsed ? "" : "rotate-180"}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 15l-7-7-7 7" />
          </svg>
        </button>
      </div>

      {#if !isTranslationDebugCollapsed}
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-sm text-muted-foreground">
              <div class="font-medium text-foreground">
                {t("translationRefreshTitle", "刷新翻译数据")}
              </div>
              {t("translationRefreshDescription", "重新加载运行时翻译数据并通知前端。")}
            </div>
            <Button variant="outline" onclick={refreshTranslationRuntimeData}>
              {t("translationRefreshButton", "刷新翻译数据")}
            </Button>
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {t("translationSourceMode", "Translation Source")}
            </div>
            {t("translationSourceModeDescription", "Switch between bundled source translations and runtime app-data translations.")}
          </div>

          <div class="text-xs text-muted-foreground">
            {t("translationSourceModeCurrent", "Current source:")}
            <span class="ml-1 font-medium text-foreground">
              {translationSourceMode === "bundled"
                ? t("translationSourceMode.bundled", "Bundled Source")
                : t("translationSourceMode.runtime", "Runtime Files")}
            </span>
          </div>

          <div class="flex gap-2">
            <Button
              variant={translationSourceMode === "bundled" ? "default" : "outline"}
              disabled={isSwitchingTranslationSource}
              onclick={() => changeTranslationSourceMode("bundled")}
            >
              {t("translationSourceMode.bundled", "Bundled Source")}
            </Button>

            <Button
              variant={translationSourceMode === "runtime" ? "default" : "outline"}
              disabled={isSwitchingTranslationSource}
              onclick={() => changeTranslationSourceMode("runtime")}
            >
              {t("translationSourceMode.runtime", "Runtime Files")}
            </Button>
          </div>
        </div>

        <SettingsSelect
          bind:selected={SETTINGS.live.general.state.language}
          label={t("language", "语言")}
          description={t("languageDescription", "选择翻译语言。缺失时依次回退到 EN、zh-CN，然后显示键名/ID。")}
          values={[
            { label: "CN", value: "zh-CN" },
            { label: "EN", value: "en" },
            { label: "JP", value: "ja" },
            { label: "DE", value: "de" },
            { label: "ES", value: "es" },
            { label: "FR", value: "fr" },
            { label: "PT-BR", value: "pt-BR" },
            { label: "KR", value: "ko-KR" },
          ]}
        />

        <SettingsSelect
          bind:selected={SETTINGS.live.general.state.skillIdDisplayMode}
          label={t("skillIdDisplay", "技能 ID 显示")}
          description={t("skillIdDisplayDescription", "控制技能表中的 ID 显示方式。")}
          values={[
            {
              label: t("skillIdDisplay.off", "仅名称"),
              value: "off",
            },
            {
              label: t("skillIdDisplay.hover", "悬停显示 ID"),
              value: "hover",
            },
            {
              label: t("skillIdDisplay.column", "始终显示 ID 列"),
              value: "column",
            },
          ]}
        />
      {/if}
    </div>
  </div>
</div>
