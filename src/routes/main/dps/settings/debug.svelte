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
    resolveNavigationTranslation,
    setTranslationSourceMode,
    type TranslationSourceMode,
  } from "$lib/i18n";

  let translationSourceMode = $state(getCurrentTranslationSourceMode() as TranslationSourceMode);
  let isSwitchingTranslationSource = $state(false);
  let isTranslationDebugCollapsed = $state(false);

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
        {resolveNavigationTranslation(
          "debug.title",
          SETTINGS.live.general.state.language,
          "调试",
        )}
      </h2>

      <div class="flex items-center justify-between">
        <div class="text-sm text-muted-foreground">
          <div class="font-medium text-foreground">
            {resolveNavigationTranslation(
              "debug.logFiles",
              SETTINGS.live.general.state.language,
              "日志文件",
            )}
          </div>
          {resolveNavigationTranslation(
            "debug.openLogDir",
            SETTINGS.live.general.state.language,
            "打开应用日志所在文件夹",
          )}
        </div>
        <Button variant="outline" onclick={openLogDir}>
          {resolveNavigationTranslation(
            "debug.openLogsButton",
            SETTINGS.live.general.state.language,
            "打开日志",
          )}
        </Button>
      </div>

      <div class="mt-4 flex items-center justify-between">
        <div class="text-sm text-muted-foreground">
          <div class="font-medium text-foreground">
            {resolveNavigationTranslation(
              "debug.bundleTitle",
              SETTINGS.live.general.state.language,
              "调试压缩包",
            )}
          </div>
          {resolveNavigationTranslation(
            "debug.bundleDescription",
            SETTINGS.live.general.state.language,
            "生成包含最近日志的 ZIP，便于支持与排查",
          )}
        </div>
        <Button variant="outline" onclick={createDiagnosticsBundle}>
          {resolveNavigationTranslation(
            "debug.bundleButton",
            SETTINGS.live.general.state.language,
            "创建调试压缩包",
          )}
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
          {resolveNavigationTranslation(
            "debug.translationTools",
            SETTINGS.live.general.state.language,
            "翻译调试",
          )}
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
                {resolveNavigationTranslation(
                  "debug.translationRefreshTitle",
                  SETTINGS.live.general.state.language,
                  "刷新翻译数据",
                )}
              </div>
              {resolveNavigationTranslation(
                "debug.translationRefreshDescription",
                SETTINGS.live.general.state.language,
                "重新加载运行时翻译数据并通知前端。",
              )}
            </div>
            <Button variant="outline" onclick={refreshTranslationRuntimeData}>
              {resolveNavigationTranslation(
                "debug.translationRefreshButton",
                SETTINGS.live.general.state.language,
                "刷新翻译数据",
              )}
            </Button>
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {resolveNavigationTranslation(
                "debug.translationSourceMode",
                SETTINGS.live.general.state.language,
                "Translation Source",
              )}
            </div>
            {resolveNavigationTranslation(
              "debug.translationSourceModeDescription",
              SETTINGS.live.general.state.language,
              "Switch between bundled source translations and runtime app-data translations.",
            )}
          </div>

          <div class="text-xs text-muted-foreground">
            {resolveNavigationTranslation(
              "debug.translationSourceModeCurrent",
              SETTINGS.live.general.state.language,
              "Current source:",
            )}
            <span class="ml-1 font-medium text-foreground">
              {translationSourceMode === "bundled"
                ? resolveNavigationTranslation(
                    "debug.translationSourceMode.bundled",
                    SETTINGS.live.general.state.language,
                    "Bundled Source",
                  )
                : resolveNavigationTranslation(
                    "debug.translationSourceMode.runtime",
                    SETTINGS.live.general.state.language,
                    "Runtime Files",
                  )}
            </span>
          </div>

          <div class="flex gap-2">
            <Button
              variant={translationSourceMode === "bundled" ? "default" : "outline"}
              disabled={isSwitchingTranslationSource}
              onclick={() => changeTranslationSourceMode("bundled")}
            >
              {resolveNavigationTranslation(
                "debug.translationSourceMode.bundled",
                SETTINGS.live.general.state.language,
                "Bundled Source",
              )}
            </Button>

            <Button
              variant={translationSourceMode === "runtime" ? "default" : "outline"}
              disabled={isSwitchingTranslationSource}
              onclick={() => changeTranslationSourceMode("runtime")}
            >
              {resolveNavigationTranslation(
                "debug.translationSourceMode.runtime",
                SETTINGS.live.general.state.language,
                "Runtime Files",
              )}
            </Button>
          </div>
        </div>

        <SettingsSelect
          bind:selected={SETTINGS.live.general.state.language}
          label={resolveNavigationTranslation(
            "debug.language",
            SETTINGS.live.general.state.language,
            "语言",
          )}
          description={resolveNavigationTranslation(
            "debug.languageDescription",
            SETTINGS.live.general.state.language,
            "选择翻译语言。缺失时回退到 zh-CN。",
          )}
          values={[
            { label: "zh-CN", value: "zh-CN" },
            { label: "EN", value: "en" },
            { label: "JP", value: "ja" },
          ]}
        />

        <SettingsSelect
          bind:selected={SETTINGS.live.general.state.skillIdDisplayMode}
          label={resolveNavigationTranslation(
            "debug.skillIdDisplay",
            SETTINGS.live.general.state.language,
            "技能 ID 显示",
          )}
          description={resolveNavigationTranslation(
            "debug.skillIdDisplayDescription",
            SETTINGS.live.general.state.language,
            "控制技能表中的 ID 显示方式。",
          )}
          values={[
            {
              label: resolveNavigationTranslation(
                "debug.skillIdDisplay.off",
                SETTINGS.live.general.state.language,
                "仅名称",
              ),
              value: "off",
            },
            {
              label: resolveNavigationTranslation(
                "debug.skillIdDisplay.hover",
                SETTINGS.live.general.state.language,
                "悬停显示 ID",
              ),
              value: "hover",
            },
            {
              label: resolveNavigationTranslation(
                "debug.skillIdDisplay.column",
                SETTINGS.live.general.state.language,
                "始终显示 ID 列",
              ),
              value: "column",
            },
          ]}
        />
      {/if}
    </div>
  </div>
</div>
