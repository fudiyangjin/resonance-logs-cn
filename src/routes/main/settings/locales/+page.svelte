<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "svelte-sonner";
  import { onDestroy, onMount } from "svelte";
  import SettingsSelect from "../../dps/settings/settings-select.svelte";
  import SettingsSwitch from "../../dps/settings/settings-switch.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import {
    TRANSLATION_SOURCE_MODE,
    getCurrentTranslationSourceMode,
    uiT,
    setTranslationSourceMode,
    LOCALE_OPTIONS,
    type TranslationSourceMode,
  } from "$lib/i18n";

  type TranslationRuntimeStatus = {
    runtimeDir: string;
    runtimeExists: boolean;
    runtimeManifestExists: boolean;
    sourceDir: string | null;
    sourceExists: boolean;
    sourceManifestExists: boolean;
    sourceCandidates: string[];
    sourceError: string | null;
  };

  let translationSourceMode = $state(getCurrentTranslationSourceMode() as TranslationSourceMode);
  let isSwitchingTranslationSource = $state(false);

  let isLoadingTranslationRuntimeStatus = $state(false);
  let translationRuntimeStatus = $state<TranslationRuntimeStatus | null>(null);
  let isRepairingRuntimeLocaleFolder = $state(false);
  let isOpeningTranslationDir = $state(false);
  let isGeneratingAllUiTranslations = $state(false);

  const tDebug = uiT("dps/settings-debug", () => SETTINGS.live.general.state.language);
  const tLoc = uiT("localization-tool", () => SETTINGS.live.general.state.language);
  const tShell = uiT("shell", () => SETTINGS.live.general.state.language);

  const unsubscribeTranslationSourceMode = TRANSLATION_SOURCE_MODE.subscribe((value) => {
    translationSourceMode = value;
    isSwitchingTranslationSource = false;
  });

  onDestroy(() => {
    unsubscribeTranslationSourceMode();
  });

  onMount(async () => {
    await loadTranslationRuntimeStatus();
  });

  async function refreshTranslationRuntimeData() {
    try {
      const message = await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
      await loadTranslationRuntimeStatus();
    } catch (e) {
      console.error(e);
      toast.error(`${tLoc("settings.refreshRuntimeDataError", "Failed to refresh translation runtime data:")} ${String(e)}`);
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
          ? tLoc("settings.translationSourceRuntime", "Translation source switched to runtime files.")
          : tLoc("settings.translationSourceBundled", "Translation source switched to bundled source files."),
      );
      await loadTranslationRuntimeStatus();
    } catch (e) {
      console.error(e);
      translationSourceMode = previousMode;
      toast.error(`${tLoc("settings.translationSourceSwitchError", "Failed to switch translation source:")} ${String(e)}`);
    } finally {
      isSwitchingTranslationSource = false;
    }
  }

  async function loadTranslationRuntimeStatus() {
    if (isLoadingTranslationRuntimeStatus) return;
    isLoadingTranslationRuntimeStatus = true;

    try {
      translationRuntimeStatus = await invoke<TranslationRuntimeStatus>("get_translation_runtime_status");
    } catch (error) {
      console.error(error);
      toast.error(`${tLoc("settings.translationStatusError", "Failed to read the translation runtime status.")} ${String(error)}`);
    } finally {
      isLoadingTranslationRuntimeStatus = false;
    }
  }

  async function repairRuntimeLocaleFolder() {
    if (isRepairingRuntimeLocaleFolder) return;
    isRepairingRuntimeLocaleFolder = true;

    try {
      const message = await invoke<string>("repair_runtime_locale_folder");
      toast.success(message);
    } catch (error) {
      console.error(error);
      toast.error(`${tLoc("settings.repairRuntimeLocaleError", "Failed to repair the runtime locale folder.")} ${String(error)}`);
    } finally {
      isRepairingRuntimeLocaleFolder = false;
      await loadTranslationRuntimeStatus();
    }
  }

  async function openTranslationDataDir() {
    if (isOpeningTranslationDir) return;
    isOpeningTranslationDir = true;

    try {
      await invoke("open_translation_data_dir");
    } catch (error) {
      console.error(error);
      toast.error(`${tLoc("settings.openDirError", "Failed to open the translation folder.")} ${String(error)}`);
    } finally {
      isOpeningTranslationDir = false;
      await loadTranslationRuntimeStatus();
    }
  }

  async function runGenerator(
    command: string,
    start: () => void,
    end: () => void,
    failureFallback: string,
  ) {
    start();
    try {
      const message = await invoke<string>(command);
      await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
      await loadTranslationRuntimeStatus();
    } catch (error) {
      console.error(error);
      toast.error(`${failureFallback} ${String(error)}`);
    } finally {
      end();
    }
  }

  async function generateAllUiTranslationScaffolds() {
    if (isGeneratingAllUiTranslations) return;
    await runGenerator(
      "generate_all_ui_translation_scaffolds",
      () => (isGeneratingAllUiTranslations = true),
      () => (isGeneratingAllUiTranslations = false),
      tLoc("settings.generateAllUiError", "Failed to generate all UI translation scaffolds."),
    );
  }

</script>

<div class="space-y-4">
  <div class="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="px-4 py-3 space-y-4">
      <div>
        <h2 class="text-base font-semibold text-foreground">{tShell("settings.locales", "Locale Settings")}</h2>
        <p class="text-sm text-muted-foreground mt-1">
          {tShell("settings.locales.subtitle", "Control translation sources, language display, and runtime locale maintenance tools.")}
        </p>
      </div>

      <div class="flex items-center justify-between gap-3">
        <div class="text-sm text-muted-foreground">
          <div class="font-medium text-foreground">{tDebug("translationRefreshTitle", "Refresh Translation Data")}</div>
          {tDebug("translationRefreshDescription", "Reload runtime translation data and notify the frontend.")}
        </div>
        <Button variant="outline" onclick={refreshTranslationRuntimeData}>
          {tDebug("translationRefreshButton", "Refresh Translation Data")}
        </Button>
      </div>

      <div class="space-y-3 rounded-lg border border-border/60 bg-background/30 p-3">
        <div class="text-sm text-muted-foreground">
          <div class="font-medium text-foreground">{tDebug("translationSourceMode", "Translation Source")}</div>
          {tDebug("translationSourceModeDescription", "Switch between the app's built-in translations and the editable translation files stored in AppData.")}
        </div>

        <div class="text-xs text-muted-foreground">
          {tDebug("translationSourceModeCurrent", "Current source:")}
          <span class="ml-1 font-medium text-foreground">
            {translationSourceMode === "bundled"
              ? tDebug("translationSourceMode.bundled", "Built-in Translations")
              : tDebug("translationSourceMode.runtime", "AppData Translation Files")}
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button
            variant={translationSourceMode === "bundled" ? "default" : "outline"}
            disabled={isSwitchingTranslationSource}
            onclick={() => changeTranslationSourceMode("bundled")}
          >
            {tDebug("translationSourceMode.bundled", "Built-in Translations")}
          </Button>

          <Button
            variant={translationSourceMode === "runtime" ? "default" : "outline"}
            disabled={isSwitchingTranslationSource}
            onclick={() => changeTranslationSourceMode("runtime")}
          >
            {tDebug("translationSourceMode.runtime", "AppData Translation Files")}
          </Button>
        </div>
      </div>

      <SettingsSelect
        bind:selected={SETTINGS.live.general.state.language}
        label={tDebug("language", "Language")}
        description={tDebug("languageDescription", "Choose the translation language. Missing entries fall back to EN, then zh-CN, then the key or ID.")}
        values={LOCALE_OPTIONS}
      />

      <SettingsSelect
        bind:selected={SETTINGS.live.general.state.skillIdDisplayMode}
        label={tDebug("skillIdDisplay", "Skill ID Display")}
        description={tDebug("skillIdDisplayDescription", "Control how IDs are shown in skill tables.")}
        values={[
          {
            label: tDebug("skillIdDisplay.off", "Name Only"),
            value: "off",
          },
          {
            label: tDebug("skillIdDisplay.hover", "Show ID on Hover"),
            value: "hover",
          },
          {
            label: tDebug("skillIdDisplay.column", "Always Show ID"),
            value: "column",
          },
        ]}
      />

      <SettingsSwitch
        bind:checked={SETTINGS.live.general.state.showHoverDescriptions}
        label={tDebug("showHoverDescriptions", "Show Hover Descriptions")}
        description={tDebug("showHoverDescriptionsDescription", "Show generated descriptions in hover text for skills, buffs, modifiers, modules, and other UID-backed rows when available.")}
      />
    </div>
  </div>

  <div class="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="px-4 py-3 space-y-4">
      <div>
        <h2 class="text-base font-semibold text-foreground">{tLoc("settings.translationDebug.title", "Translation Debug Settings")}</h2>
        <p class="text-sm text-muted-foreground mt-1">
          {tLoc("debug.runtimePathsDescription", "Shows how the app data runtime locale folder and the bundled source locale folder were resolved, so packaged-build translation folder issues are easier to debug.")}
        </p>
      </div>

      <div class="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/30 p-3">
        <div class="min-w-0 flex-1">
          <div class="font-medium text-foreground mb-1">{tLoc("debug.runtimePathsTitle", "Runtime Locale Path Status")}</div>
          {#if translationRuntimeStatus}
            <div class="mt-3 grid gap-2 text-sm text-muted-foreground">
              <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                <span class="font-medium text-foreground/90">{tLoc("debug.runtimeLocalePathLabel", "Runtime Locale Path")}</span>
                <code class="rounded bg-muted/60 px-2 py-1 break-all text-foreground">{translationRuntimeStatus.runtimeDir}</code>
              </div>
              <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                <span class="font-medium text-foreground/90">{tLoc("debug.runtimeLocaleExistsLabel", "Runtime Directory Exists")}</span>
                <span>{translationRuntimeStatus.runtimeExists ? tLoc("debug.statusYes", "Yes") : tLoc("debug.statusNo", "No")}</span>
              </div>
              <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                <span class="font-medium text-foreground/90">{tLoc("debug.runtimeManifestExistsLabel", "Runtime Manifest Exists")}</span>
                <span>{translationRuntimeStatus.runtimeManifestExists ? tLoc("debug.statusYes", "Yes") : tLoc("debug.statusNo", "No")}</span>
              </div>
              <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                <span class="font-medium text-foreground/90">{tLoc("debug.sourceLocalePathLabel", "Source Locale Path")}</span>
                <code class="rounded bg-muted/60 px-2 py-1 break-all text-foreground">{translationRuntimeStatus.sourceDir ?? tLoc("debug.pathMissing", "Not Found")}</code>
              </div>
              <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                <span class="font-medium text-foreground/90">{tLoc("debug.sourceLocaleExistsLabel", "Source Directory Exists")}</span>
                <span>{translationRuntimeStatus.sourceExists ? tLoc("debug.statusYes", "Yes") : tLoc("debug.statusNo", "No")}</span>
              </div>
              <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                <span class="font-medium text-foreground/90">{tLoc("debug.sourceManifestExistsLabel", "Source Manifest Exists")}</span>
                <span>{translationRuntimeStatus.sourceManifestExists ? tLoc("debug.statusYes", "Yes") : tLoc("debug.statusNo", "No")}</span>
              </div>
              {#if translationRuntimeStatus.sourceError}
                <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] text-red-300">
                  <span class="font-medium">{tLoc("debug.sourceResolutionErrorLabel", "Source Resolution Error")}</span>
                  <span>{translationRuntimeStatus.sourceError}</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <Button variant="outline" onclick={loadTranslationRuntimeStatus} disabled={isLoadingTranslationRuntimeStatus}>
          {isLoadingTranslationRuntimeStatus
            ? tLoc("actions.processing", "Processing…")
            : tLoc("debug.refreshStatusButton", "Refresh Path Status")}
        </Button>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <div class="rounded-lg border border-border/60 bg-background/30 p-3 flex items-start justify-between gap-3">
          <div>
            <div class="font-medium text-foreground">{tLoc("debug.repairRuntimeLocaleTitle", "Repair Runtime Locale Folder")}</div>
            <div class="text-sm text-muted-foreground mt-1">{tLoc("debug.repairRuntimeLocaleDescription", "Check and repair the runtime locale folder in app data, restore missing manifest entries, folders, and files, and only backfill missing items without overwriting existing translations.")}</div>
          </div>
          <Button variant="outline" onclick={repairRuntimeLocaleFolder} disabled={isRepairingRuntimeLocaleFolder}>
            {isRepairingRuntimeLocaleFolder ? tLoc("actions.processing", "Processing…") : tLoc("debug.repairRuntimeLocaleButton", "Repair Runtime Locale Folder")}
          </Button>
        </div>

        <div class="rounded-lg border border-border/60 bg-background/30 p-3 flex items-start justify-between gap-3">
          <div>
            <div class="font-medium text-foreground">{tLoc("debug.translationOpenTitle", "Open Translation Folder")}</div>
            <div class="text-sm text-muted-foreground mt-1">{tLoc("debug.translationOpenDescription", "Open the runtime translation directory in app data.")}</div>
          </div>
          <Button variant="outline" onclick={openTranslationDataDir} disabled={isOpeningTranslationDir}>
            {isOpeningTranslationDir ? tLoc("actions.processing", "Processing…") : tLoc("debug.translationOpenButton", "Open Translation Folder")}
          </Button>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <div class="rounded-lg border border-border/60 bg-background/30 p-3 flex items-start justify-between gap-3">
          <div>
            <div class="font-medium text-foreground">{tLoc("debug.generateAllUiTitle", "Generate All UI Runtime Files")}</div>
            <div class="text-sm text-muted-foreground mt-1">{tLoc("debug.generateAllUiDescription", "Generate or patch all runtime UI files from the source UI tool/feature files while preserving existing translations in other locales.")}</div>
          </div>
          <Button variant="outline" onclick={generateAllUiTranslationScaffolds} disabled={isGeneratingAllUiTranslations}>
            {isGeneratingAllUiTranslations ? tLoc("actions.processing", "Processing…") : tLoc("debug.generateAllUiButton", "Generate All UI Files")}
          </Button>
        </div>
      </div>
    </div>
  </div>
</div>
