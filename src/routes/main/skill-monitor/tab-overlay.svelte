<script lang="ts">
  import { SETTINGS } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";
  interface Props {
    showSkillCdGroup: boolean;
    showSkillDurationGroup: boolean;
    showResourceGroup: boolean;
    showPanelAttrGroup: boolean;
    showCustomPanelGroup: boolean;
    toggleOverlaySectionVisibility: (
      key:
        | "showSkillCdGroup"
        | "showSkillDurationGroup"
        | "showResourceGroup"
        | "showPanelAttrGroup"
        | "showCustomPanelGroup",
    ) => void;
  }

  const t = uiT("skill-monitor/general", () => SETTINGS.live.general.state.language);

  let {
    showSkillCdGroup,
    showSkillDurationGroup,
    showResourceGroup,
    showPanelAttrGroup,
    showCustomPanelGroup,
    toggleOverlaySectionVisibility,
  }: Props = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
  <div>
    <h2 class="text-base font-semibold text-foreground">{t("overlay.title", "Overlay 区域显示")}</h2>
    <p class="text-xs text-muted-foreground">
      {t("overlay.subtitle", "可分别控制技能区、持续时间技能区和资源区是否显示（按方案保存）")}
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
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showCustomPanelGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showCustomPanelGroup")}
      >
        {t("overlay.customPanel", "自定义监控区")}：{showCustomPanelGroup ? t("show", "显示") : t("hide", "隐藏")}
      </button>
    </div>
    <p class="text-xs text-muted-foreground">
      {t("overlay.footer", "点击按钮切换显示状态（按方案保存）")}
    </p>
  </div>
</div>
