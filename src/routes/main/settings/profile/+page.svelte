<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import { setEventLoggerAlwaysOnTop, showEventLoggerWindow } from "$lib/event-logger-window";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import ProfileSwitcher from "../../skill-monitor/profile-switcher.svelte";

  type EventLoggerSessionDirectoryPayload = {
    configuredDirectory: string | null;
    resolvedDirectory: string;
    usingDefault: boolean;
  };

  const tShell = uiT("shell", () => SETTINGS.live.general.state.language);
  const tCustom = uiT("custom-triggers/general", () => SETTINGS.live.general.state.language);

  let loadingLoggerSessionDir = $state(false);
  let loggerSessionDirectory = $state<EventLoggerSessionDirectoryPayload | null>(null);

  onMount(() => {
    void refreshEventLoggerSessionDirectory();
  });

  async function refreshEventLoggerSessionDirectory() {
    loadingLoggerSessionDir = true;
    try {
      loggerSessionDirectory = await invoke<EventLoggerSessionDirectoryPayload>("get_event_logger_session_directory");
    } catch (error) {
      console.error("Failed to load event logger session directory", error);
      toast.error(`Failed to load logger session folder: ${error}`);
    } finally {
      loadingLoggerSessionDir = false;
    }
  }

  async function chooseEventLoggerSessionDirectory() {
    try {
      const defaultPath =
        loggerSessionDirectory?.configuredDirectory ?? loggerSessionDirectory?.resolvedDirectory;
      const selected = await open({
        directory: true,
        multiple: false,
        ...(defaultPath ? { defaultPath } : {}),
        title: tCustom("sessionLogs.chooseFolder", "Choose session log folder"),
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      loggerSessionDirectory = await invoke<EventLoggerSessionDirectoryPayload>(
        "set_event_logger_save_directory",
        { directory: selected },
      );
      toast.success(tCustom("sessionLogs.folderUpdated", "Logger session folder updated."));
    } catch (error) {
      console.error("Failed to choose event logger session directory", error);
      toast.error(`Failed to update logger session folder: ${error}`);
    }
  }

  async function resetEventLoggerSessionDirectory() {
    try {
      loggerSessionDirectory = await invoke<EventLoggerSessionDirectoryPayload>(
        "set_event_logger_save_directory",
        { directory: null },
      );
      toast.success(tCustom("sessionLogs.folderReset", "Logger session folder reset to default."));
    } catch (error) {
      console.error("Failed to reset event logger session directory", error);
      toast.error(`Failed to reset logger session folder: ${error}`);
    }
  }

  async function openEventLoggerSessionDirectory() {
    try {
      await invoke("open_event_logger_session_dir");
    } catch (error) {
      console.error("Failed to open event logger session directory", error);
      toast.error(`Failed to open logger session folder: ${error}`);
    }
  }
</script>

<div class="space-y-4">
  <div class="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="space-y-4 px-4 py-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{tShell("settings.profile", "Profile")}</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {tShell(
            "settings.profile.subtitle",
            "Create and manage skill monitor profiles, and configure event logger behavior and session log storage.",
          )}
        </p>
      </div>

      <ProfileSwitcher />
    </div>
  </div>

  <div class="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="space-y-4 px-4 py-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-foreground">{tCustom("loggerSettings", "Logger Settings")}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {tCustom(
              "openLoggerHint",
              "The logger stays closed by default and only captures lightweight event batches while it is visible.",
            )}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onclick={() => void refreshEventLoggerSessionDirectory()}>
            {loadingLoggerSessionDir ? tCustom("sessionLogs.loading", "Loading…") : tCustom("reload", "Reload")}
          </Button>
          <Button size="sm" onclick={() => void showEventLoggerWindow()}>
            {tCustom("openLogger", "Open Event Logger")}
          </Button>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            bind:checked={SETTINGS.customTriggers.state.loggerAlwaysOnTop}
            onchange={(event) =>
              void setEventLoggerAlwaysOnTop((event.currentTarget as HTMLInputElement).checked)}
          />
          {tCustom("alwaysOnTop", "Always on top")}
        </label>

        <label class="space-y-1 text-sm">
          <span>{tCustom("bufferSize", "Buffer size")}</span>
          <input
            type="number"
            min="100"
            max="5000"
            class="w-full rounded-md border border-border bg-background px-3 py-2"
            bind:value={SETTINGS.customTriggers.state.loggerBufferSize}
          />
        </label>

        <div class="space-y-1 text-sm">
          <span>{tCustom("displayMode", "Display mode")}</span>
          <div class="flex flex-wrap gap-2">
            <Button
              variant={SETTINGS.customTriggers.state.loggerDisplayMode === "name" ? "default" : "outline"}
              size="sm"
              onclick={() => (SETTINGS.customTriggers.state.loggerDisplayMode = "name")}
            >
              {tCustom("displayMode.name", "Name")}
            </Button>
            <Button
              variant={SETTINGS.customTriggers.state.loggerDisplayMode === "name_uid" ? "default" : "outline"}
              size="sm"
              onclick={() => (SETTINGS.customTriggers.state.loggerDisplayMode = "name_uid")}
            >
              {tCustom("displayMode.nameUid", "Name + UID")}
            </Button>
            <Button
              variant={SETTINGS.customTriggers.state.loggerDisplayMode === "uid" ? "default" : "outline"}
              size="sm"
              onclick={() => (SETTINGS.customTriggers.state.loggerDisplayMode = "uid")}
            >
              {tCustom("displayMode.uid", "UID")}
            </Button>
          </div>
        </div>
      </div>

      <div class="space-y-3 rounded-lg border border-border/60 bg-background/40 p-4 text-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="font-medium">{tCustom("sessionLogs.title", "Session log folder")}</div>
            <p class="text-xs text-muted-foreground">
              {tCustom(
                "sessionLogs.description",
                "Each reset or scene/session rollover saves the current logger session as a separate JSON file so one giant log file never builds up.",
              )}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onclick={() => void chooseEventLoggerSessionDirectory()}>
              {tCustom("sessionLogs.chooseFolder", "Choose Folder")}
            </Button>
            <Button size="sm" variant="outline" onclick={() => void openEventLoggerSessionDirectory()}>
              {tCustom("sessionLogs.openFolder", "Open Folder")}
            </Button>
            <Button size="sm" variant="ghost" onclick={() => void resetEventLoggerSessionDirectory()}>
              {tCustom("sessionLogs.useDefault", "Use Default")}
            </Button>
          </div>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <div class="space-y-1">
            <div class="text-xs uppercase tracking-wide text-muted-foreground">
              {tCustom("sessionLogs.currentFolder", "Current folder")}
            </div>
            <div class="break-all rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs">
              {#if loggerSessionDirectory}
                {loggerSessionDirectory.resolvedDirectory}
              {:else if loadingLoggerSessionDir}
                {tCustom("sessionLogs.loading", "Loading…")}
              {:else}
                {tCustom("sessionLogs.unavailable", "Unavailable")}
              {/if}
            </div>
          </div>

          <div class="space-y-1">
            <div class="text-xs uppercase tracking-wide text-muted-foreground">
              {tCustom("sessionLogs.filePattern", "File pattern")}
            </div>
            <div class="rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs">
              &lt;characterName&gt;.&lt;characterUid&gt;.&lt;sceneName&gt;.&lt;DDMMYYYY-HHMMSS&gt;.json
            </div>
          </div>
        </div>

        <p class="text-xs text-muted-foreground">
          {#if loggerSessionDirectory?.usingDefault}
            {tCustom("sessionLogs.defaultNotice", "Using the default app log folder for event logger sessions.")}
          {:else}
            {tCustom("sessionLogs.customNotice", "Using your custom folder for event logger sessions.")}
          {/if}
        </p>
      </div>
    </div>
  </div>
</div>
