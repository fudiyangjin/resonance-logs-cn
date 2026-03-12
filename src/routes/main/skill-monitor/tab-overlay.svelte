<script lang="ts">
  interface Props {
    showSkillCdGroup: boolean;
    showResourceGroup: boolean;
    showPanelAttrGroup: boolean;
    showCustomPanelGroup: boolean;
    toggleOverlaySectionVisibility: (
      key: "showSkillCdGroup" | "showResourceGroup" | "showPanelAttrGroup" | "showCustomPanelGroup",
    ) => void;
  }

  let {
    showSkillCdGroup,
    showResourceGroup,
    showPanelAttrGroup,
    showCustomPanelGroup,
    toggleOverlaySectionVisibility,
  }: Props = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
  <div>
    <h2 class="text-base font-semibold text-foreground">Overlay Section Visibility</h2>
    <p class="text-xs text-muted-foreground">
      Control whether the skill and resource sections are shown (saved per profile)
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
        Skill CD: {showSkillCdGroup ? "Visible" : "Hidden"}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showResourceGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showResourceGroup")}
      >
        Resource Monitor: {showResourceGroup ? "Visible" : "Hidden"}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showPanelAttrGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showPanelAttrGroup")}
      >
        Character Attributes: {showPanelAttrGroup ? "Visible" : "Hidden"}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showCustomPanelGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showCustomPanelGroup")}
      >
        Custom Panel: {showCustomPanelGroup ? "Visible" : "Hidden"}
      </button>
    </div>
    <p class="text-xs text-muted-foreground">
      Click a button to toggle visibility (saved per profile)
    </p>
  </div>
</div>
