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
  let isGeneratingBuffNameSearch = $state(false);
  let isGeneratingBuffNameTranslation = $state(false);
  let isGeneratingSceneNameTranslation = $state(false);
  let isGeneratingMonsterNameTranslation = $state(false);
  let isGeneratingSkillNameTranslation = $state(false);

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

  async function openTranslationDataDir() {
    try {
      await invoke("open_translation_data_dir");
    } catch (e) {
      console.error(e);
      toast.error("打开翻译数据目录失败：" + e);
    }
  }

  async function initializeTranslationRuntimeFiles() {
    try {
      const message = await invoke<string>("initialize_translation_runtime_files");
      toast.success(message);
    } catch (e) {
      console.error(e);
      toast.error("初始化翻译运行时文件失败：" + e);
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

  async function generateBuffNameSearchScaffold() {
    if (isGeneratingBuffNameSearch) {
      return;
    }

    isGeneratingBuffNameSearch = true;

    try {
      const message = await invoke<string>("generate_buff_name_search_scaffold");
      await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
    } catch (e) {
      console.error(e);
      toast.error("生成 BuffNameSearch 脚手架失败：" + e);
    } finally {
      isGeneratingBuffNameSearch = false;
    }
  }

  async function generateBuffNameTranslationScaffold() {
    if (isGeneratingBuffNameTranslation) {
      return;
    }

    isGeneratingBuffNameTranslation = true;

    try {
      const message = await invoke<string>("generate_buff_name_translation_scaffold");
      await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
    } catch (e) {
      console.error(e);
      toast.error("生成 BuffName 翻译脚手架失败：" + e);
    } finally {
      isGeneratingBuffNameTranslation = false;
    }
  }

  async function generateSceneNameTranslationScaffold() {
    if (isGeneratingSceneNameTranslation) {
      return;
    }

    isGeneratingSceneNameTranslation = true;

    try {
      const message = await invoke<string>("generate_scene_name_translation_scaffold");
      await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
    } catch (e) {
      console.error(e);
      toast.error("生成 SceneName 翻译脚手架失败：" + e);
    } finally {
      isGeneratingSceneNameTranslation = false;
    }
  }

  async function generateMonsterNameTranslationScaffold() {
    if (isGeneratingMonsterNameTranslation) {
      return;
    }

    isGeneratingMonsterNameTranslation = true;

    try {
      const message = await invoke<string>("generate_monster_name_translation_scaffold");
      await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
    } catch (e) {
      console.error(e);
      toast.error("生成 MonsterName 翻译脚手架失败：" + e);
    } finally {
      isGeneratingMonsterNameTranslation = false;
    }
  }

  async function generateSkillNameTranslationScaffold() {
    if (isGeneratingSkillNameTranslation) {
      return;
    }

    isGeneratingSkillNameTranslation = true;

    try {
      const message = await invoke<string>("generate_skill_name_translation_scaffold");
      await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
    } catch (e) {
      console.error(e);
      toast.error("生成技能翻译脚手架失败：" + e);
    } finally {
      isGeneratingSkillNameTranslation = false;
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
      <h2 class="text-base font-semibold text-foreground">
        {resolveNavigationTranslation(
          "debug.translationTools",
          SETTINGS.live.general.state.language,
          "翻译调试",
        )}
      </h2>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {resolveNavigationTranslation(
                "debug.translationInitTitle",
                SETTINGS.live.general.state.language,
                "初始化翻译文件",
              )}
            </div>
            {resolveNavigationTranslation(
              "debug.translationInitDescription",
              SETTINGS.live.general.state.language,
              "在应用数据目录中创建缺失的运行时翻译文件。",
            )}
          </div>
          <Button variant="outline" onclick={initializeTranslationRuntimeFiles}>
            {resolveNavigationTranslation(
              "debug.translationInitButton",
              SETTINGS.live.general.state.language,
              "初始化翻译文件",
            )}
          </Button>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {resolveNavigationTranslation(
                "debug.translationOpenTitle",
                SETTINGS.live.general.state.language,
                "打开翻译文件夹",
              )}
            </div>
            {resolveNavigationTranslation(
              "debug.translationOpenDescription",
              SETTINGS.live.general.state.language,
              "打开应用数据中的运行时翻译目录。",
            )}
          </div>
          <Button variant="outline" onclick={openTranslationDataDir}>
            {resolveNavigationTranslation(
              "debug.translationOpenButton",
              SETTINGS.live.general.state.language,
              "打开翻译文件夹",
            )}
          </Button>
        </div>

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

        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {resolveNavigationTranslation(
                "debug.generateBuffNameSearchTitle",
                SETTINGS.live.general.state.language,
                "生成 BuffNameSearch 脚手架",
              )}
            </div>
            {resolveNavigationTranslation(
              "debug.generateBuffNameSearchDescription",
              SETTINGS.live.general.state.language,
              "根据 bundled BuffName.json 非破坏性生成或更新运行时 BuffNameSearch.json。",
            )}
          </div>
          <Button
            variant="outline"
            disabled={isGeneratingBuffNameSearch}
            onclick={generateBuffNameSearchScaffold}
          >
            {resolveNavigationTranslation(
              "debug.generateBuffNameSearchButton",
              SETTINGS.live.general.state.language,
              "生成 BuffNameSearch",
            )}
          </Button>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {resolveNavigationTranslation(
                "debug.generateBuffNameTitle",
                SETTINGS.live.general.state.language,
                "生成 BuffName 翻译脚手架",
              )}
            </div>
            {resolveNavigationTranslation(
              "debug.generateBuffNameDescription",
              SETTINGS.live.general.state.language,
              "根据 bundled BuffName.json 和 BuffNameSearch.json 非破坏性生成或更新运行时 BuffName.json。",
            )}
          </div>
          <Button
            variant="outline"
            disabled={isGeneratingBuffNameTranslation}
            onclick={generateBuffNameTranslationScaffold}
          >
            {resolveNavigationTranslation(
              "debug.generateBuffNameButton",
              SETTINGS.live.general.state.language,
              "生成 BuffName",
            )}
          </Button>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {resolveNavigationTranslation(
                "debug.generateSceneNameTitle",
                SETTINGS.live.general.state.language,
                "生成 SceneName 翻译脚手架",
              )}
            </div>
            {resolveNavigationTranslation(
              "debug.generateSceneNameDescription",
              SETTINGS.live.general.state.language,
              "根据 src-tauri/meter-data/SceneName.json 非破坏性生成或更新运行时 SceneName.json。",
            )}
          </div>
          <Button
            variant="outline"
            disabled={isGeneratingSceneNameTranslation}
            onclick={generateSceneNameTranslationScaffold}
          >
            {resolveNavigationTranslation(
              "debug.generateSceneNameButton",
              SETTINGS.live.general.state.language,
              "生成 SceneName",
            )}
          </Button>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {resolveNavigationTranslation(
                "debug.generateMonsterNameTitle",
                SETTINGS.live.general.state.language,
                "生成 MonsterName 翻译脚手架",
              )}
            </div>
            {resolveNavigationTranslation(
              "debug.generateMonsterNameDescription",
              SETTINGS.live.general.state.language,
              "根据 src-tauri/meter-data/MonsterIdNameType.json 非破坏性生成或更新运行时 MonsterName.json。",
            )}
          </div>
          <Button
            variant="outline"
            disabled={isGeneratingMonsterNameTranslation}
            onclick={generateMonsterNameTranslationScaffold}
          >
            {resolveNavigationTranslation(
              "debug.generateMonsterNameButton",
              SETTINGS.live.general.state.language,
              "生成 MonsterName",
            )}
          </Button>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <div class="font-medium text-foreground">
              {resolveNavigationTranslation(
                "debug.generateSkillNamesTitle",
                SETTINGS.live.general.state.language,
                "生成技能翻译脚手架",
              )}
            </div>
            {resolveNavigationTranslation(
              "debug.generateSkillNamesDescription",
              SETTINGS.live.general.state.language,
              "根据 RecountTable.json、DamageAttrIdName.json、SkillEffectTable.json、SkillFightLevelTable.json 与 TempAttrTable.json 非破坏性生成或更新运行时 common/skillnames.json。",
            )}
          </div>
          <Button
            variant="outline"
            disabled={isGeneratingSkillNameTranslation}
            onclick={generateSkillNameTranslationScaffold}
          >
            {resolveNavigationTranslation(
              "debug.generateSkillNamesButton",
              SETTINGS.live.general.state.language,
              "生成技能翻译",
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
    </div>
  </div>
</div>
