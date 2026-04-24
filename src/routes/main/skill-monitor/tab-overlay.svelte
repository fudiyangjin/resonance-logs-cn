<script lang="ts">
  interface Props {
    showSkillCdGroup: boolean;
    showSkillDurationGroup: boolean;
    showResourceGroup: boolean;
    showPanelAttrGroup: boolean;
    showCustomPanelGroup: boolean;
    showShieldDetailGroup: boolean;
    toggleOverlaySectionVisibility: (
      key:
        | "showSkillCdGroup"
        | "showSkillDurationGroup"
        | "showResourceGroup"
        | "showPanelAttrGroup"
        | "showCustomPanelGroup"
        | "showShieldDetailGroup",
    ) => void;
  }

  let {
    showSkillCdGroup,
    showSkillDurationGroup,
    showResourceGroup,
    showPanelAttrGroup,
    showCustomPanelGroup,
    showShieldDetailGroup,
    toggleOverlaySectionVisibility,
  }: Props = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
  <div>
    <h2 class="text-base font-semibold text-foreground">Overlay 区域显示</h2>
    <p class="text-xs text-muted-foreground">
      可分别控制技能区、持续时间技能区和资源区是否显示（按方案保存）
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
        技能CD区：{showSkillCdGroup ? "显示" : "隐藏"}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showSkillDurationGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showSkillDurationGroup")}
      >
        技能持续区：{showSkillDurationGroup ? "显示" : "隐藏"}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showResourceGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showResourceGroup")}
      >
        资源监控区：{showResourceGroup ? "显示" : "隐藏"}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showPanelAttrGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showPanelAttrGroup")}
      >
        角色属性区：{showPanelAttrGroup ? "显示" : "隐藏"}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showCustomPanelGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showCustomPanelGroup")}
      >
        自定义监控区：{showCustomPanelGroup ? "显示" : "隐藏"}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showShieldDetailGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showShieldDetailGroup")}
      >
        血量护盾区：{showShieldDetailGroup ? "显示" : "隐藏"}
      </button>
    </div>
    <p class="text-xs text-muted-foreground">
      点击按钮切换显示状态（按方案保存）
    </p>
  </div>
</div>
