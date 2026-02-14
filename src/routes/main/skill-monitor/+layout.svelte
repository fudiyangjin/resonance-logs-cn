<script lang="ts">
  /**
   * @file Layout for the skill monitor tool.
   * Contains the launch button for the skill CD window.
   */
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import SwordsIcon from "virtual:icons/lucide/swords";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PlayIcon from "virtual:icons/lucide/play";
  import LayersIcon from "virtual:icons/lucide/layers";
  import { invoke } from "@tauri-apps/api/core";

  let { children } = $props();

  async function toggleSkillCdWindow() {
    try {
      const skillWindow = await WebviewWindow.getByLabel("skill-cd");
      if (skillWindow !== null) {
        const isVisible = await skillWindow.isVisible();

        if (isVisible) {
          await skillWindow.hide();
        } else {
          await skillWindow.show();
          await skillWindow.unminimize();
          await skillWindow.setFocus();
        }
      } else {
        console.warn("Skill CD window not found");
      }
    } catch (err) {
      console.error("Failed to toggle skill CD window:", err);
    }
  }

  async function toggleBuffMonitorWindow() {
    try {
      const buffWindow = await WebviewWindow.getByLabel("buff-monitor");
      if (buffWindow !== null) {
        const isVisible = await buffWindow.isVisible();

        if (isVisible) {
          await buffWindow.hide();
        } else {
          await buffWindow.show();
          await buffWindow.unminimize();
          await buffWindow.setFocus();
        }
      } else {
        console.warn("Buff monitor window not found");
      }
    } catch (err) {
      console.error("Failed to toggle buff monitor window:", err);
    }
  }
let shadowEnabled = $state(false);
 async function toggleBuffShadow() {
    shadowEnabled = !shadowEnabled;
    await invoke("toggle_buff_monitor_shadow", {
      label: "buff-monitor",
      enabled: shadowEnabled
    });
  }

</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
        <SwordsIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">技能监控</h1>
        <p class="text-sm text-muted-foreground">自定义监控技能CD与战斗资源</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
        onclick={toggleSkillCdWindow}
      >
        <PlayIcon class="w-4 h-4" />
        <span>切换技能窗口</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/60 bg-muted/30 text-foreground font-medium text-sm hover:bg-muted/50 transition-colors shadow-sm"
        onclick={toggleBuffMonitorWindow}
      >
        <LayersIcon class="w-4 h-4" />
        <span>切换 Buff 窗口</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>
    </div>
  </div>

 <button
  type="button"
  class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/60 bg-muted/30 text-foreground font-medium text-sm hover:bg-muted/50 transition-colors shadow-sm"
  onclick={toggleBuffShadow}
>
  <LayersIcon class="w-4 h-4" />
  <span>Buff 阴影: {shadowEnabled ? "ON" : "OFF"}</span>
</button>

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
