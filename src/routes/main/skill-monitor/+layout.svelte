<script lang="ts">
  import { commands } from "$lib/bindings";
  import SwordsIcon from "virtual:icons/lucide/swords";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PlayIcon from "virtual:icons/lucide/play";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import ProfileSwitcher from "./profile-switcher.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";

  let { children } = $props();
  const t = uiT("skill-monitor/general", () => SETTINGS.live.general.state.language);


  async function toggleOverlayWindow() {
    try {
      await commands.toggleGameOverlayWindow();
    } catch (err) {
      console.error("Failed to toggle overlay window:", err);
    }
  }

  async function toggleOverlayEditMode() {
    try {
      await commands.toggleGameOverlayEditMode();
    } catch (error) {
      console.error("Failed to toggle overlay edit mode", error);
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
        <SwordsIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{t("title", "实时监控")}</h1>
        <p class="text-sm text-muted-foreground">{t("subtitle", "自定义监控技能CD, 战斗资源等")}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
        onclick={toggleOverlayWindow}
      >
        <PlayIcon class="w-4 h-4" />
        <span>{t("toggleOverlayWindow", "切换遮罩窗口")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/60 bg-muted/30 text-foreground font-medium text-sm hover:bg-muted/50 transition-colors shadow-sm"
        onclick={toggleOverlayEditMode}
      >
        <PenSquareIcon class="w-4 h-4" />
        <span>{t("editOverlayLayout", "编辑遮罩布局")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>
    </div>
  </div>

  <ProfileSwitcher />

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
