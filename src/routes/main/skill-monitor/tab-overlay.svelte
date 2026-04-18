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
    toggleOverlaySectionVisibility: (
      key:
        | "showSkillCdGroup"
        | "showSkillDurationGroup"
        | "showResourceGroup"
        | "showPanelAttrGroup"
        | "showBuffUptimeGroup"
        | "showCustomPanelGroup",
    ) => void;
  }

  const t = uiT("skill-monitor/general", () => SETTINGS.live.general.state.language);

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
        {t("overlay.skillCd", "技能CD区")}：{showSkillCdGroup ? t("show", "显示") : t("hide", "隐藏")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showSkillDurationGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showSkillDurationGroup")}
      >
        {t("overlay.skillDuration", "技能持续区")}：{showSkillDurationGroup ? t("show", "显示") : t("hide", "隐藏")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showResourceGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showResourceGroup")}
      >
        {t("overlay.resource", "资源监控区")}：{showResourceGroup ? t("show", "显示") : t("hide", "隐藏")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showPanelAttrGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showPanelAttrGroup")}
      >
        {t("overlay.panelAttr", "角色属性区")}：{showPanelAttrGroup ? t("show", "显示") : t("hide", "隐藏")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showBuffUptimeGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showBuffUptimeGroup")}
      >
        {t("overlay.buffUptime", "Buff Uptime") }：{showBuffUptimeGroup ? t("show", "显示") : t("hide", "隐藏")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showCustomPanelGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showCustomPanelGroup")}
      >
        {t("overlay.customPanel", "自定义监控区")}：{showCustomPanelGroup ? t("show", "显示") : t("hide", "隐藏")}
      </button>
    </div>
    <p class="text-xs text-muted-foreground">{footer}</p>
  </div>
</div>
