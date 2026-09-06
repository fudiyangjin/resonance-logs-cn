<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";

  interface Props {
    showSkillCdGroup: boolean;
    showSkillDurationGroup: boolean;
    showResourceGroup: boolean;
    showPanelAttrGroup: boolean;
    showCustomPanelGroup: boolean;
    showShieldDetailGroup: boolean;
    showBuffCoverageGroup: boolean;
    resourceSections: { key: string; label: string; visible: boolean }[];
    toggleResourceSectionVisibility: (key: string) => void;
    toggleOverlaySectionVisibility: (
      key:
        | "showSkillCdGroup"
        | "showSkillDurationGroup"
        | "showResourceGroup"
        | "showPanelAttrGroup"
        | "showCustomPanelGroup"
        | "showShieldDetailGroup"
        | "showBuffCoverageGroup",
    ) => void;
  }

  let {
    showSkillCdGroup,
    showSkillDurationGroup,
    showResourceGroup,
    showPanelAttrGroup,
    showCustomPanelGroup,
    showShieldDetailGroup,
    showBuffCoverageGroup,
    resourceSections,
    toggleResourceSectionVisibility,
    toggleOverlaySectionVisibility,
  }: Props = $props();

  function visibilityState(value: boolean): string {
    return value ? t("skillMonitor.common.show") : t("skillMonitor.common.hide");
  }
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
  <div>
    <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.overlay.title")}</h2>
    <p class="text-xs text-muted-foreground">
      {t("skillMonitor.overlay.description")}
    </p>
  </div>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showSkillCdGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showSkillCdGroup")}
      >
        {t("skillMonitor.overlay.skillCd", { state: visibilityState(showSkillCdGroup) })}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showSkillDurationGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showSkillDurationGroup")}
      >
        {t("skillMonitor.overlay.skillDuration", { state: visibilityState(showSkillDurationGroup) })}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showResourceGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showResourceGroup")}
      >
        {t("skillMonitor.overlay.resource", { state: visibilityState(showResourceGroup) })}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showPanelAttrGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showPanelAttrGroup")}
      >
        {t("skillMonitor.overlay.panelAttr", { state: visibilityState(showPanelAttrGroup) })}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showCustomPanelGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showCustomPanelGroup")}
      >
        {t("skillMonitor.overlay.customPanel", { state: visibilityState(showCustomPanelGroup) })}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showShieldDetailGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showShieldDetailGroup")}
      >
        {t("skillMonitor.overlay.shieldDetail", { state: visibilityState(showShieldDetailGroup) })}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showBuffCoverageGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showBuffCoverageGroup")}
      >
        {t("skillMonitor.overlay.buffCoverage", { state: visibilityState(showBuffCoverageGroup) })}
      </button>
    </div>
    <p class="text-xs text-muted-foreground">
      {t("skillMonitor.overlay.help")}
    </p>
  </div>
  {#if showResourceGroup && resourceSections.length > 0}
    <div class="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <h3 class="text-sm font-medium text-foreground">
        {t("skillMonitor.overlay.resourceSections")}
      </h3>
      <div class="flex flex-wrap gap-2">
        {#each resourceSections as section (section.key)}
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors {section.visible
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
            onclick={() => toggleResourceSectionVisibility(section.key)}
          >
            {section.label}：{visibilityState(section.visible)}
          </button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.overlay.resourceSectionsHelp")}
      </p>
    </div>
  {/if}
</div>
