<script lang="ts">
  import SettingsSwitch from "../../dps/settings/settings-switch.svelte";
  import { resolveMonsterMonitorTranslation, uiT } from "$lib/i18n";
  import { activeProfileOrDefault, updateActiveProfile } from "$lib/skill-monitor-profile.svelte";
  import { SETTINGS } from "$lib/settings-store";

  const tShell = uiT("shell", () => SETTINGS.live.general.state.language);
  const tSkill = uiT("overlay/skill-monitor/general", () => SETTINGS.live.general.state.language);

  function tMonster(key: string, fallback: string): string {
    return resolveMonsterMonitorTranslation(key, SETTINGS.live.general.state.language, fallback);
  }


  type OverlayVisibilityKey =
    | "showSkillCdGroup"
    | "showSkillDurationGroup"
    | "showResourceGroup"
    | "showPanelAttrGroup"
    | "showBuffUptimeGroup"
    | "showCustomPanelGroup"
    | "showShieldDetailGroup";

  const activeProfile = $derived.by(() => activeProfileOrDefault());
  const showSkillCdGroup = $derived(activeProfile.overlayVisibility?.showSkillCdGroup ?? true);
  const showSkillDurationGroup = $derived(
    activeProfile.overlayVisibility?.showSkillDurationGroup ?? true,
  );
  const showResourceGroup = $derived(activeProfile.overlayVisibility?.showResourceGroup ?? true);
  const showPanelAttrGroup = $derived(activeProfile.overlayVisibility?.showPanelAttrGroup ?? true);
  const showBuffUptimeGroup = $derived(
    activeProfile.overlayVisibility?.showBuffUptimeGroup ?? true,
  );
  const showCustomPanelGroup = $derived(
    activeProfile.overlayVisibility?.showCustomPanelGroup ?? true,
  );
  const showShieldDetailGroup = $derived(
    activeProfile.overlayVisibility?.showShieldDetailGroup ?? false,
  );

  function setOverlaySectionVisibility(key: OverlayVisibilityKey, checked: boolean) {
    updateActiveProfile(
      (profile) => ({
        ...profile,
        overlayVisibility: {
          showSkillCdGroup: profile.overlayVisibility?.showSkillCdGroup ?? true,
          showSkillDurationGroup: profile.overlayVisibility?.showSkillDurationGroup ?? true,
          showResourceGroup: profile.overlayVisibility?.showResourceGroup ?? true,
          showPanelAttrGroup: profile.overlayVisibility?.showPanelAttrGroup ?? true,
          showBuffUptimeGroup: profile.overlayVisibility?.showBuffUptimeGroup ?? true,
          showCustomPanelGroup: profile.overlayVisibility?.showCustomPanelGroup ?? true,
          showShieldDetailGroup: profile.overlayVisibility?.showShieldDetailGroup ?? false,
          [key]: checked,
        },
      }),
      { createDefaultIfEmpty: true },
    );
  }

  function toggleOverlaySectionVisibility(key: OverlayVisibilityKey) {
    const current = key === "showSkillCdGroup"
      ? showSkillCdGroup
      : key === "showSkillDurationGroup"
      ? showSkillDurationGroup
      : key === "showResourceGroup"
      ? showResourceGroup
      : key === "showPanelAttrGroup"
      ? showPanelAttrGroup
      : key === "showBuffUptimeGroup"
      ? showBuffUptimeGroup
      : key === "showCustomPanelGroup"
      ? showCustomPanelGroup
      : showShieldDetailGroup;
    setOverlaySectionVisibility(key, !current);
  }

</script>

<div class="space-y-4">
  <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-foreground">{tShell("settings.overlay", "Overlay")}</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {tShell("settings.overlay.subtitle", "Control which monitor systems actively publish data to the shared overlay.")}
      </p>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="rounded-lg border border-border/60 bg-background/30 p-3">
        <SettingsSwitch
          bind:checked={SETTINGS.skillMonitor.state.enabled}
          label={tSkill("enableMonitoring", "Enable Skill Monitor")}
          description={tSkill("enableMonitoringDescription", "Push monitoring data to the overlay window in real time when enabled")}
        />
      </div>

      <div class="rounded-lg border border-border/60 bg-background/30 p-3">
        <SettingsSwitch
          bind:checked={SETTINGS.monsterMonitor.state.enabled}
          label={tMonster("enable", "Enable Monster Monitor")}
          description={tMonster("enableDescription", "Show tracked boss monitor data on the shared overlay when enabled")}
        />
      </div>

      <div class="rounded-lg border border-border/60 bg-background/30 p-3 md:col-span-2">
        <SettingsSwitch
          bind:checked={SETTINGS.skillMonitor.state.overlayStartWithApp}
          label={tShell("settings.overlay.startWithApp", "Start with App")}
          description={tShell("settings.overlay.startWithAppDescription", "Open the shared overlay automatically when the app starts and overlay publishing is enabled.")}
        />
      </div>
    </div>
  </section>

  <section class="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm space-y-4">
    <div>
      <h3 class="text-lg font-semibold text-foreground">{tShell("settings.overlay.sectionVisibilities", "Section Visibilities")}</h3>
      <p class="mt-1 text-sm text-muted-foreground">
        {tShell("settings.overlay.sectionVisibilities.subtitle", "Control which parts of the shared overlay are shown for the active profile.")}
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showSkillCdGroup
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/30 text-foreground border-border/60 hover:bg-muted/50"}`}
        onclick={() => toggleOverlaySectionVisibility("showSkillCdGroup")}
      >
        {tSkill("overlay.skillCd", "Skill CD Area")} : {showSkillCdGroup ? tSkill("show", "Show") : tSkill("hide", "Hide")}
      </button>

      <button
        type="button"
        class={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showSkillDurationGroup
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/30 text-foreground border-border/60 hover:bg-muted/50"}`}
        onclick={() => toggleOverlaySectionVisibility("showSkillDurationGroup")}
      >
        {tSkill("overlay.skillDuration", "Duration Skill Area")} : {showSkillDurationGroup ? tSkill("show", "Show") : tSkill("hide", "Hide")}
      </button>

      <button
        type="button"
        class={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showResourceGroup
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/30 text-foreground border-border/60 hover:bg-muted/50"}`}
        onclick={() => toggleOverlaySectionVisibility("showResourceGroup")}
      >
        {tSkill("overlay.resource", "Resource Area")} : {showResourceGroup ? tSkill("show", "Show") : tSkill("hide", "Hide")}
      </button>

      <button
        type="button"
        class={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showPanelAttrGroup
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/30 text-foreground border-border/60 hover:bg-muted/50"}`}
        onclick={() => toggleOverlaySectionVisibility("showPanelAttrGroup")}
      >
        {tSkill("overlay.panelAttr", "Character Panel Area")} : {showPanelAttrGroup ? tSkill("show", "Show") : tSkill("hide", "Hide")}
      </button>

      <button
        type="button"
        class={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showBuffUptimeGroup
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/30 text-foreground border-border/60 hover:bg-muted/50"}`}
        onclick={() => toggleOverlaySectionVisibility("showBuffUptimeGroup")}
      >
        {tSkill("overlay.buffUptime", "Buff Uptime")} : {showBuffUptimeGroup ? tSkill("show", "Show") : tSkill("hide", "Hide")}
      </button>

      <button
        type="button"
        class={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showCustomPanelGroup
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/30 text-foreground border-border/60 hover:bg-muted/50"}`}
        onclick={() => toggleOverlaySectionVisibility("showCustomPanelGroup")}
      >
        {tSkill("overlay.customPanel", "Custom Monitor Area")} : {showCustomPanelGroup ? tSkill("show", "Show") : tSkill("hide", "Hide")}
      </button>

      <button
        type="button"
        class={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showShieldDetailGroup
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/30 text-foreground border-border/60 hover:bg-muted/50"}`}
        onclick={() => toggleOverlaySectionVisibility("showShieldDetailGroup")}
      >
        {tSkill("overlay.shieldDetail", "Health and Shield Area")} : {showShieldDetailGroup ? tSkill("show", "Show") : tSkill("hide", "Hide")}
      </button>
    </div>

    <p class="text-xs text-muted-foreground">
      {tShell("settings.overlay.sectionVisibilities.footer", "Click a button to toggle visibility. Changes are saved per profile.")}
    </p>
  </section>
</div>
