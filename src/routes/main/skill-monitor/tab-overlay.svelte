<script lang="ts">
  import { tl } from "$lib/i18n/index.svelte";
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
    <h2 class="text-base font-semibold text-foreground">{tl("Overlay Area Visibility")}</h2>
    <p class="text-xs text-muted-foreground">
      {tl("Control whether the skill, duration skill, and resource areas are shown independently. Saved per profile.")}
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
        {tl("Skill CD Area: ")}{showSkillCdGroup ? tl("Show") : tl("Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showSkillDurationGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showSkillDurationGroup")}
      >
        {tl("Skill Duration Area: ")}{showSkillDurationGroup ? tl("Show") : tl("Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showResourceGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showResourceGroup")}
      >
        {tl("Resource Area: ")}{showResourceGroup ? tl("Show") : tl("Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showPanelAttrGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showPanelAttrGroup")}
      >
        {tl("Character Stats Area: ")}{showPanelAttrGroup ? tl("Show") : tl("Hide")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showCustomPanelGroup
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => toggleOverlaySectionVisibility("showCustomPanelGroup")}
      >
        {tl("Custom Monitor Area: ")}{showCustomPanelGroup ? tl("Show") : tl("Hide")}
      </button>
    </div>
    <p class="text-xs text-muted-foreground">
      {tl("Click the buttons to toggle visibility. Saved per profile.")}
    </p>
  </div>
</div>
