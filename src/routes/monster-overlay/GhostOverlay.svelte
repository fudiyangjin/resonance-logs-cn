<script lang="ts">
  import { tl, tm } from "$lib/i18n/index.svelte";
  import { SETTINGS, type SkillMonitorProfile } from "$lib/settings-store";
  import { ensureCustomPanelGroups } from "../game-overlay/overlay-utils";
  import {
    DEFAULT_MONSTER_OVERLAY_POSITIONS,
    DEFAULT_MONSTER_OVERLAY_SIZES,
  } from "./monster-constants";
  import type { GhostArea } from "./monster-types";

  function getActiveSkillMonitorProfile(): SkillMonitorProfile | null {
    const profiles = SETTINGS.skillMonitor.state.profiles;
    if (profiles.length === 0) return null;
    const index = Math.min(
      Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
      profiles.length - 1,
    );
    return profiles[index] ?? null;
  }

  const ghostAreas = $derived.by(() => {
    const profile = getActiveSkillMonitorProfile();
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
    const monsterMonitor = SETTINGS.monsterMonitor.state;
    const monsterOverlayPositions = {
      ...DEFAULT_MONSTER_OVERLAY_POSITIONS,
      ...(monsterMonitor.overlayPositions ?? {}),
    };
    const monsterOverlaySizes = {
      ...DEFAULT_MONSTER_OVERLAY_SIZES,
      ...(monsterMonitor.overlaySizes ?? {}),
    };

    if (overlayVisibility.showSkillCdGroup) {
      pushArea("skillCdGroup", tl("Skill CD Area"), overlayPositions.skillCdGroup.x, overlayPositions.skillCdGroup.y, 280, 118, overlaySizes.skillCdGroupScale);
    }
    if (overlayVisibility.showResourceGroup) {
      pushArea("resourceGroup", tl("Resource Area"), overlayPositions.resourceGroup.x, overlayPositions.resourceGroup.y, 250, 90, overlaySizes.resourceGroupScale);
    }
    if (overlayVisibility.showPanelAttrGroup) {
      pushArea("panelAttrGroup", tl("Character Stats Area"), overlayPositions.panelAttrGroup.x, overlayPositions.panelAttrGroup.y, 220, 130, overlaySizes.panelAttrGroupScale);
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

    pushArea("textBuffPanel", tl("Text Buff Area"), overlayPositions.textBuffPanel.x, overlayPositions.textBuffPanel.y, 240, 130, overlaySizes.textBuffPanelScale);

    if (monsterMonitor.hateListEnabled) {
      pushArea(
        "monsterHatePanel",
        tl("Threat Area"),
        monsterOverlayPositions.hatePanel.x,
        monsterOverlayPositions.hatePanel.y,
        240,
        150,
        monsterOverlaySizes.hatePanelScale,
      );
    }

    if (profile.buffDisplayMode === "grouped") {
      for (const group of profile.buffGroups) {
        const width = Math.max(120, group.columns * (group.iconSize + group.gap));
        const height = Math.max(90, group.rows * (group.iconSize + group.gap) + 26);
        pushArea(`buffGroup:${group.id}`, `${group.name}${group.monitorAll ? tl(" (All)") : ""}`, group.position.x, group.position.y, width, height);
      }
    } else if (profile.individualMonitorAllGroup) {
      const group = profile.individualMonitorAllGroup;
      const width = Math.max(120, group.columns * (group.iconSize + group.gap));
      const height = Math.max(90, group.rows * (group.iconSize + group.gap) + 26);
      pushArea(`individualAllGroup:${group.id}`, `${group.name}${tl(" (All)")}`, group.position.x, group.position.y, width, height);
    }

    for (const [baseId, point] of Object.entries(overlayPositions.iconBuffPositions)) {
      const size = overlaySizes.iconBuffSizes[Number(baseId)] ?? 44;
      pushArea(`icon:${baseId}`, tm("Buff {{id}}", { id: baseId }), point.x, point.y, size, size);
    }

    for (const [categoryKey, point] of Object.entries(overlayPositions.categoryIconPositions ?? {})) {
      const size = overlaySizes.categoryIconSizes?.[categoryKey as keyof typeof overlaySizes.categoryIconSizes] ?? 44;
      pushArea(`category:${categoryKey}`, `${tl("Category ")}${categoryKey}`, point.x, point.y, size, size);
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
