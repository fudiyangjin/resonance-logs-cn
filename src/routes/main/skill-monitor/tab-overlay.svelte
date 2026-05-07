<script lang="ts">
  import { SETTINGS } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";
  interface Props {
    title?: string;
    subtitle?: string;
    footer?: string;
    showSkillCdGroup: boolean;
    showSkillDurationGroup: boolean;
    showResourceGroup: boolean;
    showPanelAttrGroup: boolean;
    showBuffUptimeGroup: boolean;
    showCustomPanelGroup: boolean;
    showShieldDetailGroup: boolean;
    toggleOverlaySectionVisibility: (
      key:
        | "showSkillCdGroup"
        | "showSkillDurationGroup"
        | "showResourceGroup"
        | "showPanelAttrGroup"
        | "showBuffUptimeGroup"
        | "showCustomPanelGroup"
        | "showShieldDetailGroup",
    ) => void;
  }

  const t = uiT("overlay/skill-monitor/general", () => SETTINGS.live.general.state.language);

  let {
    title = t("overlay.title", "Overlay Section Visibility"),
    subtitle = t("overlay.subtitle", "Control whether the skill, duration skill, and resource areas are shown (saved per profile)"),
    footer = t("overlay.footer", "Click the buttons to toggle visibility (saved per profile)"),
    showSkillCdGroup,
    showSkillDurationGroup,
    showResourceGroup,
    showPanelAttrGroup,
    showBuffUptimeGroup,
    showCustomPanelGroup,
    showShieldDetailGroup,
    toggleOverlaySectionVisibility,
  }: Props = $props();
</script>

<div class="space-y-3">
  <div>
    <h2 class="text-base font-semibold text-foreground">{title}</h2>
    <p class="text-xs text-muted-foreground">{subtitle}</p>
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
        {t("overlay.skillCd", "Skill CD Area")}: {showSkillCdGroup ? t("show", "Show") : t("hide", "Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showSkillDurationGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showSkillDurationGroup")}
      >
        {t("overlay.skillDuration", "Duration Skill Area")}: {showSkillDurationGroup ? t("show", "Show") : t("hide", "Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showResourceGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showResourceGroup")}
      >
        {t("overlay.resource", "Resource Area")}: {showResourceGroup ? t("show", "Show") : t("hide", "Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showPanelAttrGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showPanelAttrGroup")}
      >
        {t("overlay.panelAttr", "Character Panel Area")}: {showPanelAttrGroup ? t("show", "Show") : t("hide", "Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showBuffUptimeGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showBuffUptimeGroup")}
      >
        {t("overlay.buffUptime", "Buff Uptime")}: {showBuffUptimeGroup ? t("show", "Show") : t("hide", "Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showCustomPanelGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showCustomPanelGroup")}
      >
        {t("overlay.customPanel", "Custom Monitor Area")}: {showCustomPanelGroup ? t("show", "Show") : t("hide", "Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showShieldDetailGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showShieldDetailGroup")}
      >
        {t("overlay.shieldDetail", "Health and Shield Area")}: {showShieldDetailGroup ? t("show", "Show") : t("hide", "Hide")}
      </button>
    </div>
    <p class="text-xs text-muted-foreground">{footer}</p>
  </div>
</div>
