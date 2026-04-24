<script lang="ts">
  import { activeProfile } from "$lib/skill-monitor-profile.svelte.js";
  import { ensureCustomPanelGroups } from "../game-overlay/overlay-utils";
  import type { GhostArea } from "./monster-types";

  const ghostAreas = $derived.by(() => {
    const profile = activeProfile();
    if (!profile) return [] as GhostArea[];

    const next: GhostArea[] = [];
    const pushArea = (
      id: string,
      label: string,
      x: number,
      y: number,
      width: number,
      height: number,
      scale = 1,
    ) => {
      next.push({ id, label, x, y, width, height, scale });
    };

    const { overlayPositions, overlaySizes, overlayVisibility } = profile;

    if (overlayVisibility.showSkillCdGroup) {
      pushArea("skillCdGroup", "技能CD区", overlayPositions.skillCdGroup.x, overlayPositions.skillCdGroup.y, 280, 118, overlaySizes.skillCdGroupScale);
    }
    if (overlayVisibility.showResourceGroup) {
      pushArea("resourceGroup", "资源区", overlayPositions.resourceGroup.x, overlayPositions.resourceGroup.y, 250, 90, overlaySizes.resourceGroupScale);
    }
    if (overlayVisibility.showPanelAttrGroup) {
      pushArea("panelAttrGroup", "角色属性区", overlayPositions.panelAttrGroup.x, overlayPositions.panelAttrGroup.y, 220, 130, overlaySizes.panelAttrGroupScale);
    }
    if (overlayVisibility.showCustomPanelGroup) {
      for (const group of ensureCustomPanelGroups(profile)) {
        const height = Math.max(120, group.entries.length * 34 + 24);
        pushArea(
          `customPanelGroup:${group.id}`,
          group.name,
          group.position.x,
          group.position.y,
          220,
          height,
          group.scale,
        );
      }
    }

    if (overlayVisibility?.showShieldDetailGroup !== false) {
      const pos = overlayPositions?.shieldDetailGroup ?? { x: 40, y: 550 };
      const scale = overlaySizes?.shieldDetailGroupScale ?? 1;
      pushArea("shieldDetailGroup", "血量护盾区", pos.x, pos.y, 240, 120, scale);
    }

    pushArea("textBuffPanel", "无图标Buff区", overlayPositions.textBuffPanel.x, overlayPositions.textBuffPanel.y, 240, 130, overlaySizes.textBuffPanelScale);

    if (profile.buffDisplayMode === "grouped") {
      for (const group of profile.buffGroups) {
        const width = Math.max(120, group.columns * (group.iconSize + group.gap));
        const height = Math.max(90, group.rows * (group.iconSize + group.gap) + 26);
        pushArea(`buffGroup:${group.id}`, `${group.name}${group.monitorAll ? "（全部）" : ""}`, group.position.x, group.position.y, width, height);
      }
    } else if (profile.individualMonitorAllGroup) {
      const group = profile.individualMonitorAllGroup;
      const width = Math.max(120, group.columns * (group.iconSize + group.gap));
      const height = Math.max(90, group.rows * (group.iconSize + group.gap) + 26);
      pushArea(`individualAllGroup:${group.id}`, `${group.name}（全部）`, group.position.x, group.position.y, width, height);
    }

    for (const [baseId, point] of Object.entries(overlayPositions.iconBuffPositions)) {
      const size = overlaySizes.iconBuffSizes[Number(baseId)] ?? 44;
      pushArea(`icon:${baseId}`, `Buff ${baseId}`, point.x, point.y, size, size);
    }

    for (const [categoryKey, point] of Object.entries(overlayPositions.categoryIconPositions ?? {})) {
      const size = overlaySizes.categoryIconSizes?.[categoryKey as keyof typeof overlaySizes.categoryIconSizes] ?? 44;
      pushArea(`category:${categoryKey}`, `分类 ${categoryKey}`, point.x, point.y, size, size);
    }

    return next;
  });
</script>

<div class="ghost-reference" style:pointer-events="none">
  {#each ghostAreas as area (area.id)}
    <div
      class="ghost-area"
      style:left={`${area.x}px`}
      style:top={`${area.y}px`}
      style:width={`${area.width}px`}
      style:height={`${area.height}px`}
      style:transform={`scale(${area.scale})`}
      style:transform-origin="top left"
    >
      <span class="ghost-label">{area.label}</span>
    </div>
  {/each}
</div>

<style>
  .ghost-reference {
    position: absolute;
    inset: 0;
    z-index: 10;
  }

  .ghost-area {
    position: absolute;
    border: 2px dashed rgba(148, 163, 184, 0.75);
    border-radius: 10px;
    background: rgba(148, 163, 184, 0.14);
    box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.15);
  }

  .ghost-label {
    position: absolute;
    top: -20px;
    left: 0;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(51, 65, 85, 0.8);
    color: rgba(241, 245, 249, 0.95);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
</style>
