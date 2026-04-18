<script lang="ts">
  import { unregister } from "@tauri-apps/plugin-global-shortcut";
  import { onDestroy, onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { Button } from "$lib/components/ui/button/index.js";
  import BugIcon from "virtual:icons/lucide/bug";
  import Settings2Icon from "virtual:icons/lucide/settings-2";
  import SparklesIcon from "virtual:icons/lucide/sparkles";
  import GroupEditorCard from "./GroupEditorCard.svelte";
  import {
    customDefinitions,
    deleteCustomDefinition,
    ensureCustomDefinitionsSyncListener,
    loadCustomDefinitions,
    type CustomDefinitionEntry,
  } from "$lib/custom-definitions-store";
  import { listAudioOutputDevices, type AudioOutputDevice } from "$lib/custom-trigger-audio";
  import {
    clearCustomTriggerRecording,
    getCustomTriggerReplaySession,
    importCustomTriggerReplaySession,
    replayCustomTriggerSession,
    resetAllCustomTriggerRuntimeState,
    startCustomTriggerRecording,
    stopCustomTriggerRecording,
    stopCustomTriggerReplay,
    triggerReplayState,
  } from "$lib/custom-trigger-runtime.svelte";
  import {
    addTriggerFromTemplate,
    addTriggerGroup,
    customTriggersFile,
    ensureCustomTriggerSyncListener,
    loadCustomTriggers,
    updateCustomTriggerAudio,
    writeCustomTriggers,
  } from "$lib/custom-triggers-store";
  import type { TriggerTemplateKind } from "$lib/custom-trigger-types";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import {
    clearRegisteredShortcut,
    CUSTOM_TRIGGER_SHORTCUTS,
    findShortcutConflict,
    registerShortcut,
    type ShortcutOwner,
  } from "../dps/settings/shortcuts.js";

  const t = uiT("custom-triggers/general", () => SETTINGS.live.general.state.language);
  const globalHotkeyT = uiT("dps/settings-hotkeys", () => SETTINGS.live.general.state.language);

  const CUSTOM_TRIGGER_TABS = [
    { id: "triggers", labelKey: "tabs.customTriggers", fallback: "Custom Triggers", icon: SparklesIcon },
    { id: "settings", labelKey: "tabs.triggerSettings", fallback: "Trigger Settings", icon: Settings2Icon },
    { id: "debug", labelKey: "tabs.triggerDebug", fallback: "Trigger Debug", icon: BugIcon },
  ] as const;

  let activeTab = $state<(typeof CUSTOM_TRIGGER_TABS)[number]["id"]>("triggers");
  let audioOutputs = $state<AudioOutputDevice[]>([]);
  let editingHotkeyId: string | null = $state(null);
  let editingHotkeyConflict = $state<ShortcutOwner | null>(null);

  const hotkeyModifierOrder = ["ctrl", "shift", "alt", "meta"];
  const HOTKEY_MODIFIERS = new SvelteSet(hotkeyModifierOrder);
  const activeHotkeyMods = new SvelteSet<string>();
  let activeHotkeyMain: string | null = $state(null);
  let loadingDevices = $state(false);
  let importInput: HTMLInputElement | null = null;
  let replayImportInput: HTMLInputElement | null = null;

  onMount(() => {
    ensureCustomTriggerHotkeyState();
    void loadCustomDefinitions();
    void ensureCustomDefinitionsSyncListener();
    void loadCustomTriggers();
    void ensureCustomTriggerSyncListener();
    void refreshAudioDevices();
  });

  onDestroy(stopHotkeyEdit);





  function ensureCustomTriggerHotkeyState() {
    SETTINGS.customTriggers.state.hotkeys ??= {
      fireSelectedTrigger: "",
      stopSelectedTrigger: "",
      resetSelectedTrigger: "",
      clearSelectedGroup: "",
      resetAllRuntimeState: "",
    };
    SETTINGS.customTriggers.state.selectedHotkeyTriggerId ??= "";
    SETTINGS.customTriggers.state.selectedHotkeyGroupId ??= "";
  }

  const normalizeModifier = (key: string): string =>
    (
      ({
        control: "ctrl",
        meta: "meta",
        alt: "alt",
        shift: "shift",
      }) as Record<string, string>
    )[key.toLowerCase()] ?? key.toLowerCase();

  function getKeyName(event: KeyboardEvent): string {
    if (event.code.startsWith("Numpad")) {
      return event.code;
    }
    return event.key.toLowerCase();
  }

  function currentHotkeyString(): string {
    const mods = hotkeyModifierOrder.filter((mod) => activeHotkeyMods.has(mod));
    return activeHotkeyMain ? [...mods, activeHotkeyMain].join("+") : mods.join("+");
  }

  function startHotkeyEdit(id: string) {
    stopHotkeyEdit();
    editingHotkeyId = id;
    activeHotkeyMods.clear();
    activeHotkeyMain = null;
    window.addEventListener("keydown", handleHotkeyDown);
    window.addEventListener("keyup", handleHotkeyUp);
  }

  function stopHotkeyEdit() {
    window.removeEventListener("keydown", handleHotkeyDown);
    window.removeEventListener("keyup", handleHotkeyUp);
    activeHotkeyMods.clear();
    activeHotkeyMain = null;
    editingHotkeyConflict = null;
    editingHotkeyId = null;
  }

  function handleHotkeyDown(event: KeyboardEvent) {
    event.preventDefault();
    const modifier = normalizeModifier(event.key);
    if (HOTKEY_MODIFIERS.has(modifier)) {
      activeHotkeyMods.add(modifier);
      return;
    }
    activeHotkeyMain = getKeyName(event);
  }

  async function handleHotkeyUp(event: KeyboardEvent) {
    event.preventDefault();
    const modifier = normalizeModifier(event.key);
    if (HOTKEY_MODIFIERS.has(modifier)) {
      activeHotkeyMods.delete(modifier);
      stopHotkeyEdit();
      return;
    }

    if (!activeHotkeyMain || !editingHotkeyId) return;
    const shortcut = currentHotkeyString();
    const conflict = findShortcutConflict(shortcut, { section: "customTriggers", id: editingHotkeyId });
    if (conflict) {
      editingHotkeyConflict = conflict;
      return;
    }

    editingHotkeyConflict = null;
    ensureCustomTriggerHotkeyState();
    const current = SETTINGS.customTriggers.state.hotkeys?.[editingHotkeyId as keyof typeof SETTINGS.customTriggers.state.hotkeys];
    if (current) {
      await unregister(current);
    }
    if (SETTINGS.customTriggers.state.hotkeys) {
      SETTINGS.customTriggers.state.hotkeys[editingHotkeyId as keyof typeof SETTINGS.customTriggers.state.hotkeys] = shortcut;
    }
    await registerShortcut("customTriggers", editingHotkeyId, shortcut);
    stopHotkeyEdit();
  }

  async function clearCustomHotkey(id: string, event: MouseEvent) {
    event.preventDefault();
    await clearRegisteredShortcut("customTriggers", id);
  }

  function conflictLabel(owner: ShortcutOwner): string {
    return owner.section === "customTriggers"
      ? t(owner.labelKey, owner.fallbackLabel)
      : globalHotkeyT(owner.labelKey, owner.fallbackLabel);
  }

  function currentCustomHotkey(id: string): string {
    ensureCustomTriggerHotkeyState();
    return SETTINGS.customTriggers.state.hotkeys?.[id as keyof typeof SETTINGS.customTriggers.state.hotkeys] ?? "";
  }

  async function refreshAudioDevices() {
    loadingDevices = true;
    audioOutputs = await listAudioOutputDevices();
    loadingDevices = false;
  }


  async function removeDefinition(entry: CustomDefinitionEntry) {
    await deleteCustomDefinition(entry.uid, entry.type);
  }

  async function exportTriggers() {
    const json = JSON.stringify($customTriggersFile, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "custom-triggers.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function onImportSelected(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await writeCustomTriggers(JSON.parse(text));
      await loadCustomTriggers(true);
    } catch (error) {
      console.error("[custom-triggers] failed to import trigger file", error);
    } finally {
      target.value = "";
    }
  }


async function exportReplaySession() {
  const json = JSON.stringify(getCustomTriggerReplaySession(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "custom-trigger-replay.json";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function onImportReplaySelected(event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    importCustomTriggerReplaySession(JSON.parse(text));
  } catch (error) {
    console.error("[custom-triggers] failed to import replay file", error);
  } finally {
    target.value = "";
  }
}


  async function addTemplate(kind: TriggerTemplateKind) {
    await addTriggerFromTemplate(kind);
  }
</script>

<input class="hidden" bind:this={importInput} type="file" accept="application/json" onchange={onImportSelected} />
<input class="hidden" bind:this={replayImportInput} type="file" accept="application/json" onchange={onImportReplaySelected} />

<div class="space-y-5 p-6 text-foreground">
  <div class="flex justify-end -mt-3 pb-1">
  </div>

  <div class="border-b border-border/60">
    <nav class="flex gap-1 -mb-px">
      {#each CUSTOM_TRIGGER_TABS as tab (tab.id)}
        <button
          type="button"
          class={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
          onclick={() => {
            activeTab = tab.id;
          }}
        >
          <tab.icon class="w-4 h-4" />
          <span>{t(tab.labelKey, tab.fallback)}</span>
        </button>
      {/each}
    </nav>
  </div>

  {#if activeTab === "settings"}
    <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{t("tabs.triggerSettings", "Trigger Settings")}</h2>
          <p class="text-sm text-muted-foreground">
            {t("panel.triggerSettings.description", "Manage trigger data and import/export files.")}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button onclick={() => void loadCustomDefinitions(true)} variant="outline">{t("reloadDefinitions", "Reload Definitions")}</Button>
          <Button onclick={() => void loadCustomTriggers(true)} variant="outline">{t("reloadTriggers", "Reload Triggers")}</Button>
          <Button onclick={() => void exportTriggers()} variant="outline">{t("exportTriggers", "Export JSON")}</Button>
          <Button onclick={() => importInput?.click()} variant="outline">{t("importTriggers", "Import JSON")}</Button>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{t("audio.title", "Audio Output Routing")}</h2>
          <p class="text-sm text-muted-foreground">{t("audio.description", "Choose a global primary and optional secondary output for trigger sound actions.")}</p>
        </div>
        <Button variant="outline" onclick={() => void refreshAudioDevices()}>{loadingDevices ? t("audio.refreshing", "Refreshing…") : t("audio.refresh", "Refresh Devices")}</Button>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2 text-sm">
          <span class="font-medium">{t("audio.primary", "Global Primary Output")}</span>
          <select class="w-full rounded-md border border-border bg-background px-3 py-2" value={$customTriggersFile.audio.primaryOutputDeviceId ?? ""} onchange={(event) => void updateCustomTriggerAudio({ primaryOutputDeviceId: (event.currentTarget as HTMLSelectElement).value || null })}>
            <option value="">{t("audio.systemDefault", "System Default")}</option>
            {#each audioOutputs as device (device.deviceId)}
              <option value={device.deviceId}>{device.label}</option>
            {/each}
          </select>
        </label>

        <label class="space-y-2 text-sm">
          <span class="font-medium">{t("audio.secondary", "Global Secondary Output")}</span>
          <select class="w-full rounded-md border border-border bg-background px-3 py-2" value={$customTriggersFile.audio.secondaryOutputDeviceId ?? ""} onchange={(event) => void updateCustomTriggerAudio({ secondaryOutputDeviceId: (event.currentTarget as HTMLSelectElement).value || null })}>
            <option value="">{t("audio.disabled", "Disabled")}</option>
            {#each audioOutputs as device (device.deviceId)}
              <option value={device.deviceId}>{device.label}</option>
            {/each}
          </select>
        </label>
      </div>

      <p class="text-xs text-muted-foreground">{t("audio.virtualDeviceHint", "For mic-style routing, select a virtual cable or other output device that another app can read as input.")}</p>
    </section>
  {/if}

  {#if activeTab === "debug"}
    <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{t("replay.title", "Replay / Testing")}</h2>
          <p class="text-sm text-muted-foreground">{t("replay.description", "Record short live event sessions, import/export them, and replay them into the trigger engine for testing.")}</p>
        </div>
        <div class="text-xs text-muted-foreground">
          {t("replay.frameCount", "Frames")}: {$triggerReplayState.recordedFrames} · {t("replay.eventCount", "Events")}: {$triggerReplayState.recordedEvents}
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        {#if !$triggerReplayState.isRecording}
          <Button variant="outline" onclick={() => startCustomTriggerRecording()}>{t("replay.startRecording", "Start Recording")}</Button>
        {:else}
          <Button variant="outline" onclick={() => stopCustomTriggerRecording()}>{t("replay.stopRecording", "Stop Recording")}</Button>
        {/if}
        <Button variant="outline" onclick={() => clearCustomTriggerRecording()}>{t("replay.clearRecording", "Clear Recording")}</Button>
        <Button variant="outline" disabled={$triggerReplayState.recordedFrames === 0 || $triggerReplayState.isReplaying} onclick={() => replayCustomTriggerSession(1)}>{t("replay.replayNormal", "Replay x1")}</Button>
        <Button variant="outline" disabled={$triggerReplayState.recordedFrames === 0 || $triggerReplayState.isReplaying} onclick={() => replayCustomTriggerSession(2)}>{t("replay.replayFast", "Replay x2")}</Button>
        <Button variant="outline" disabled={!$triggerReplayState.isReplaying} onclick={() => stopCustomTriggerReplay()}>{t("replay.stopReplay", "Stop Replay")}</Button>
        <Button variant="outline" disabled={$triggerReplayState.recordedFrames === 0} onclick={() => void exportReplaySession()}>{t("replay.exportSession", "Export Session")}</Button>
        <Button variant="outline" onclick={() => replayImportInput?.click()}>{t("replay.importSession", "Import Session")}</Button>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <div class="rounded-lg border border-border/60 bg-background/40 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("replay.status", "Status")}</div>
          <div class="mt-1 text-sm font-medium">
            {#if $triggerReplayState.isReplaying}
              {t("replay.status.replaying", "Replaying")}
            {:else if $triggerReplayState.isRecording}
              {t("replay.status.recording", "Recording")}
            {:else}
              {t("replay.status.idle", "Idle")}
            {/if}
          </div>
        </div>
        <div class="rounded-lg border border-border/60 bg-background/40 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("replay.frameCount", "Frames")}</div>
          <div class="mt-1 text-sm font-medium">{$triggerReplayState.recordedFrames}</div>
        </div>
        <div class="rounded-lg border border-border/60 bg-background/40 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("replay.eventCount", "Events")}</div>
          <div class="mt-1 text-sm font-medium">{$triggerReplayState.recordedEvents}</div>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{t("hotkeys.title", "Manual Test Hotkeys")}</h2>
          <p class="text-sm text-muted-foreground">{t("hotkeys.description", "Keep Custom Triggers hotkeys separate from the general hotkeys menu. These shortcuts act on the selected trigger and selected group below.")}</p>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <label class="space-y-1 text-sm">
          <span>{t("hotkeys.selectedTrigger", "Selected Trigger")}</span>
          <select class="w-full rounded-md border border-border bg-background px-3 py-2" bind:value={SETTINGS.customTriggers.state.selectedHotkeyTriggerId}>
            <option value="">{t("hotkeys.selectTrigger", "Select trigger")}</option>
            {#each $customTriggersFile.triggers as trigger (trigger.id)}
              <option value={trigger.id}>{trigger.name}</option>
            {/each}
          </select>
        </label>
        <label class="space-y-1 text-sm">
          <span>{t("hotkeys.selectedGroup", "Selected Group")}</span>
          <select class="w-full rounded-md border border-border bg-background px-3 py-2" bind:value={SETTINGS.customTriggers.state.selectedHotkeyGroupId}>
            <option value="">{t("hotkeys.selectGroup", "Select group")}</option>
            {#each $customTriggersFile.groups as group (group.id)}
              <option value={group.id}>{group.name}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-xs text-muted-foreground">
        {t("hotkeys.scopeHint", "Fire, Stop, and Reset use the selected trigger. Clear Group uses the selected group. Right-click a hotkey button to clear it.")}
      </div>

      {#if editingHotkeyConflict}
        <div class="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t("hotkeys.conflictAssigned", "That hotkey is already assigned to")}: {conflictLabel(editingHotkeyConflict)}
        </div>
      {/if}

      <div class="space-y-2 rounded-lg border border-border/60 bg-background/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
        {#each CUSTOM_TRIGGER_SHORTCUTS as shortcut (shortcut.id)}
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2">
            <div>
              <div class="text-sm font-medium">{t(shortcut.labelKey, shortcut.fallbackLabel)}</div>
            </div>
            <Button variant="outline" class="uppercase" onclick={() => startHotkeyEdit(shortcut.id)} oncontextmenu={(event: MouseEvent) => clearCustomHotkey(shortcut.id, event)}>
              {#if editingHotkeyId === shortcut.id}
                {currentHotkeyString() || t("hotkeys.pressKey", "Press key")}...
              {:else}
                {currentCustomHotkey(shortcut.id) || t("hotkeys.unbound", "Unbound")}
              {/if}
            </Button>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if activeTab === "triggers"}
    <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{t("templates.title", "Templates")}</h2>
          <p class="text-sm text-muted-foreground">{t("templates.description", "Quick-start common proc patterns before fine-tuning the trigger details.")}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" onclick={() => void addTemplate("proc_icd")}>{t("templates.procIcd", "Proc ICD")}</Button>
          <Button variant="outline" onclick={() => void addTemplate("active_window")}>{t("templates.activeWindow", "Active Window")}</Button>
          <Button variant="outline" onclick={() => void addTemplate("proc_counter")}>{t("templates.procCounter", "Proc Counter")}</Button>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{t("groups.title", "Trigger Groups")}</h2>
          <p class="text-sm text-muted-foreground">{t("groups.description", "Groups control overlay layout, position, sorting, and grouped notifications.")}</p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" onclick={() => void resetAllCustomTriggerRuntimeState()}>{t("manual.resetAll", "Reset All Runtime State")}</Button>
          <Button onclick={() => void addTriggerGroup()}>{t("groups.add", "Add Group")}</Button>
        </div>
      </div>

      <div class="space-y-4">
        {#each $customTriggersFile.groups as group (group.id)}
          <GroupEditorCard {group} audioOutputs={audioOutputs} />
        {/each}
      </div>
    </section>

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{t("manageDefinitions", "Custom Definitions")}</h2>
          <p class="text-sm text-muted-foreground">{t("definitions", "Definitions")}</p>
        </div>
        <div class="text-xs text-muted-foreground">{$customDefinitions.definitions.length}</div>
      </div>
      {#if $customDefinitions.definitions.length === 0}
        <div class="rounded-lg border border-dashed border-border/60 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">{t("definitionsEmpty", "No custom definitions saved yet. Save unknown IDs from the logger to avoid editing locale files.")}</div>
      {:else}
        <div class="overflow-hidden rounded-lg border border-border/60">
          <table class="w-full border-collapse text-sm">
            <thead class="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th class="px-3 py-2">{t("uid", "UID")}</th><th class="px-3 py-2">{t("type", "Type")}</th><th class="px-3 py-2">{t("name", "Name")}</th><th class="px-3 py-2">{t("notes", "Notes")}</th><th class="px-3 py-2 text-right">{t("delete", "Delete")}</th></tr>
            </thead>
            <tbody>
              {#each $customDefinitions.definitions as entry (`${entry.type}-${entry.uid}`)}
                <tr class="border-t border-border/50 align-top"><td class="px-3 py-2 font-mono text-xs">{entry.uid}</td><td class="px-3 py-2 text-xs uppercase text-muted-foreground">{entry.type}</td><td class="px-3 py-2 font-medium">{entry.name}</td><td class="px-3 py-2 text-sm text-muted-foreground">{entry.notes || "—"}</td><td class="px-3 py-2 text-right"><Button variant="outline" size="sm" onclick={() => void removeDefinition(entry)}>{t("delete", "Delete")}</Button></td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</div>
