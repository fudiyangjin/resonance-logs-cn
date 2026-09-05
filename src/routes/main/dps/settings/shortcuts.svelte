<script lang="ts">
  import { onDestroy } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { unregister } from "@tauri-apps/plugin-global-shortcut";

  import AlertCircleIcon from "virtual:icons/lucide/alert-circle";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import { SETTINGS, type ShortcutSettingId } from "$lib/settings-store";
  import { registerShortcut } from "./shortcuts.js";

  type ShortcutInput = {
    id: ShortcutSettingId;
    labelKey: MessageKey;
  };

  let editingId: string | null = $state(null);

  // Track modifiers separately from the single main key
  const modifierOrder = ["ctrl", "shift", "alt", "meta"];
  const MODIFIERS = new SvelteSet(modifierOrder);
  const activeMods = new SvelteSet<string>();
  let mainKey: string | null = $state(null);

  /** Normalize modifier key names */
  const normalizeModifier = (key: string): string =>
    (
      ({
        control: "ctrl",
        meta: "meta",
        alt: "alt",
        shift: "shift",
      }) as Record<string, string>
    )[key.toLowerCase()] ?? key.toLowerCase();

  /** Get the proper key name, handling numpad keys via e.code */
  function getKeyName(e: KeyboardEvent): string {
    const code = e.code;

    // Handle numpad keys - use code directly as it matches the Tauri shortcut format
    // e.g., "Numpad0", "Numpad1", "NumpadAdd", "NumpadSubtract", etc.
    if (code.startsWith("Numpad")) {
      return code;
    }

    // For regular keys, use the key value (normalized to lowercase)
    return e.key.toLowerCase();
  }

  /** Build the display string of the in-progress shortcut */
  function currentShortcutString(): string {
    const mods = modifierOrder.filter((m) => activeMods.has(m));
    return mainKey ? [...mods, mainKey].join("+") : mods.join("+");
  }

  function startEdit(shortcut: ShortcutInput) {
    stopEdit();
    editingId = shortcut.id;
    activeMods.clear();
    mainKey = null;

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
  }

  function stopEdit() {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    activeMods.clear();
    mainKey = null;
    editingId = null;
  }

  function handleKeyDown(e: KeyboardEvent) {
    e.preventDefault();
    const modKey = normalizeModifier(e.key);

    if (MODIFIERS.has(modKey)) {
      activeMods.add(modKey);
      return;
    }

    // Non-modifier key: set/replace the main key (using code for numpad detection)
    mainKey = getKeyName(e);
  }

  async function handleKeyUp(e: KeyboardEvent) {
    e.preventDefault();
    const modKey = normalizeModifier(e.key);

    // If a modifier was released, just reflect that (remove it) but don't finalize yet
    if (MODIFIERS.has(modKey)) {
      activeMods.delete(modKey);
      stopEdit();
      return;
    }

    // Only finalize when the non-modifier (main) key is released
    if (mainKey) {
      const shortcutKey = currentShortcutString();

      // Ensure we actually have a main key (defensive)
      const hasMain = !!mainKey;
      if (!hasMain) return;

      const cmd = inputs.find((c) => c.id === editingId);
      if (cmd) {
        const previous = SETTINGS.shortcuts.state[cmd.id];
        if (previous) await unregister(previous);
        SETTINGS.shortcuts.state[cmd.id] = shortcutKey;
        registerShortcut(cmd.id, shortcutKey);
      }
      stopEdit();
    }
  }

  async function clearShortcut(shortcut: ShortcutInput, e: MouseEvent) {
    e.preventDefault();
    const existing = SETTINGS.shortcuts.state[shortcut.id];
    if (existing) {
      SETTINGS.shortcuts.state[shortcut.id] = "";
      await unregister(existing);
    }
  }

  onDestroy(stopEdit);

  const SETTINGS_CATEGORY = "shortcuts";

  let inputs = [
    {
      id: "showLiveMeter",
      labelKey: "settings.shortcuts.showLiveMeter",
    },
    {
      id: "hideLiveMeter",
      labelKey: "settings.shortcuts.hideLiveMeter",
    },
    {
      id: "toggleLiveMeter",
      labelKey: "settings.shortcuts.toggleLiveMeter",
    },
    {
      id: "enableClickthrough",
      labelKey: "settings.shortcuts.enableClickthrough",
    },
    {
      id: "disableClickthrough",
      labelKey: "settings.shortcuts.disableClickthrough",
    },
    {
      id: "toggleClickthrough",
      labelKey: "settings.shortcuts.toggleClickthrough",
    },
    {
      id: "resetEncounter",
      labelKey: "settings.shortcuts.resetEncounter",
    },
    {
      id: "togglePauseEncounter",
      labelKey: "settings.shortcuts.togglePauseEncounter",
    },
    {
      id: "toggleBossHp",
      labelKey: "settings.shortcuts.toggleBossHp",
    },
    {
      id: "toggleOverlayEdit",
      labelKey: "settings.shortcuts.toggleOverlayEdit",
    },
    {
      id: "toggleOverlayWindow",
      labelKey: "settings.shortcuts.toggleOverlayWindow",
    },
    {
      id: "toggleMinimizeAll",
      labelKey: "settings.shortcuts.toggleMinimizeAll",
    },
  ] satisfies ShortcutInput[];
</script>

<Tabs.Content value={SETTINGS_CATEGORY}>
  <div class="space-y-3">
    <Alert.Root class="shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <AlertCircleIcon />
      <Alert.Title>{t("settings.shortcuts.clearHint")}</Alert.Title>
    </Alert.Root>
    <div
      class="rounded-lg border bg-card/40 border-border/60 p-4 space-y-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      {#each inputs as input (input.id)}
        <Item.Root>
          <Item.Content>
            <Item.Title>{t(input.labelKey)}</Item.Title>
          </Item.Content>
          <Item.Actions>
            <Button
              variant="outline"
              class="uppercase"
              onclick={() => startEdit(input)}
              oncontextmenu={(e: MouseEvent) => clearShortcut(input, e)}
            >
              {#if editingId === input.id}
                {currentShortcutString() || t("settings.shortcuts.pressKey")}...
              {:else}
                {SETTINGS.shortcuts.state[input.id] ||
                  t("settings.shortcuts.unbound")}
              {/if}
            </Button>
          </Item.Actions>
        </Item.Root>
      {/each}
    </div>
  </div>
</Tabs.Content>
