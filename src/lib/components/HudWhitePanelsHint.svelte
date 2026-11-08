<script lang="ts">
  /**
   * Nudges users whose panels are still on the all-white built-in colors
   * toward a color scheme. Never changes a color by itself; once dismissed
   * it stays hidden on every page of this machine.
   */
  import PaletteIcon from "virtual:icons/lucide/palette";
  import XIcon from "virtual:icons/lucide/x";
  import { t } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { listWhitePanels } from "$lib/hud-color-schemes";
  import {
    monsterSchemeStyles,
    skillSchemeStyles,
  } from "$lib/hud-color-scheme-actions";
  import { activeProfile } from "$lib/skill-monitor-profile.svelte";

  interface Props {
    scope: "skill" | "monster";
    onopen: () => void;
  }

  let { scope, onopen }: Props = $props();

  const STORAGE_KEY = "hud-scheme-hint.dismissed";

  function readDismissed(): boolean {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  let dismissed = $state(readDismissed());

  const whiteCount = $derived.by(() => {
    if (dismissed) return 0;
    if (scope === "skill") {
      const profile = activeProfile();
      return profile
        ? listWhitePanels(skillSchemeStyles(profile), null).length
        : 0;
    }
    return listWhitePanels(
      null,
      monsterSchemeStyles(SETTINGS.monsterMonitor.state),
    ).length;
  });

  function dismiss() {
    dismissed = true;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, "1");
    } catch {
      // Hidden for this session only.
    }
  }
</script>

{#if whiteCount > 0}
  <div
    class="border-primary/30 bg-primary/5 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-sm"
  >
    <PaletteIcon class="text-primary h-4 w-4 shrink-0" />
    <span class="text-foreground min-w-0 flex-1">
      {t("hudScheme.hint.text", { count: whiteCount })}
    </span>
    <button
      type="button"
      class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-xs font-medium"
      onclick={onopen}
    >
      {t("hudScheme.hint.apply")}
    </button>
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
      onclick={dismiss}
    >
      <XIcon class="h-3.5 w-3.5" />
      {t("hudScheme.hint.dismiss")}
    </button>
  </div>
{/if}
