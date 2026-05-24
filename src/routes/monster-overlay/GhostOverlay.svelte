<script lang="ts">
  import {
    getBuffCategoryLabel,
    getBuffIdsByCategory,
    lookupBuffMeta,
    normalizeBuffCategoryKeys,
  } from "$lib/config/buff-name-table";
  import { ensureCustomPanelGroups } from "$lib/custom-panel-utils";
  import { t } from "$lib/i18n/index.svelte";
  import { findAnySkillByBaseId } from "$lib/skill-mappings";
  import { activeProfile } from "$lib/skill-monitor-profile.svelte";
  import { DEFAULT_OVERLAY_POSITIONS } from "../game-overlay/overlay-constants";
  import {
    ensureBuffGroups,
    ensureIndividualMonitorAllGroup,
    ensureOverlayPositions,
    ensureOverlaySizes,
    ensureOverlayVisibility,
  } from "../game-overlay/overlay-utils";

  type GhostArea = {
    kind: "area";
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
  };

  type GhostIcon = {
    kind: "icon";
    id: string;
    label: string;
    x: number;
    y: number;
    size: number;
    imageSrc: string | null;
    fallbackText: string;
    scale: number;
  };

  type GhostItem = GhostArea | GhostIcon;

  const ICON_FALLBACK_COLUMNS = 8;
  const ICON_FALLBACK_COLUMN_GAP = 58;
  const ICON_FALLBACK_ROW_GAP = 64;
  const SKILL_DURATION_FALLBACK_COLUMNS = 6;
  const SKILL_DURATION_FALLBACK_COLUMN_GAP = 60;
  const SKILL_DURATION_FALLBACK_ROW_GAP = 72;

  function pushArea(
    items: GhostItem[],
    id: string,
    label: string,
    position: { x: number; y: number },
    width: number,
    height: number,
    scale = 1,
  ) {
    items.push({
      kind: "area",
      id,
      label,
      x: position.x,
      y: position.y,
      width,
      height,
      scale,
    });
  }

  function pushIcon(
    items: GhostItem[],
    id: string,
    label: string,
    position: { x: number; y: number },
    size: number,
    imageSrc: string | null,
    fallbackText: string,
  ) {
    items.push({
      kind: "icon",
      id,
      label,
      x: position.x,
      y: position.y,
      size,
      imageSrc,
      fallbackText,
      scale: 1,
    });
  }

  function fallbackIconPosition(index: number) {
    return {
      x: 40 + (index % ICON_FALLBACK_COLUMNS) * ICON_FALLBACK_COLUMN_GAP,
      y:
        310 + Math.floor(index / ICON_FALLBACK_COLUMNS) * ICON_FALLBACK_ROW_GAP,
    };
  }

  function fallbackSkillDurationPosition(index: number) {
    return {
      x:
        DEFAULT_OVERLAY_POSITIONS.specialBuffGroup.x +
        (index % SKILL_DURATION_FALLBACK_COLUMNS) *
          SKILL_DURATION_FALLBACK_COLUMN_GAP,
      y:
        DEFAULT_OVERLAY_POSITIONS.specialBuffGroup.y +
        Math.floor(index / SKILL_DURATION_FALLBACK_COLUMNS) *
          SKILL_DURATION_FALLBACK_ROW_GAP,
    };
  }

  function buffImageSrc(baseId: number): string | null {
    const spriteFile = lookupBuffMeta(baseId)?.spriteFile;
    return spriteFile ? `/images/buff/${spriteFile}` : null;
  }

  function iconCellHeight(
    iconSize: number,
    showName: boolean,
    showTime: boolean,
  ) {
    const nameHeight = showName ? 12 : 0;
    const timeHeight = showTime ? Math.max(10, Math.round(iconSize * 0.26)) : 0;
    return iconSize + nameHeight + timeHeight + 8;
  }

  function buffGroupDimensions(group: {
    columns: number;
    rows: number;
    iconSize: number;
    gap: number;
    showName: boolean;
    showTime: boolean;
  }) {
    const columns = Math.max(1, group.columns);
    const rows = Math.max(1, group.rows);
    const gap = Math.max(0, group.gap);
    return {
      width: columns * (group.iconSize + 8) + (columns - 1) * gap,
      height:
        rows * iconCellHeight(group.iconSize, group.showName, group.showTime) +
        (rows - 1) * gap,
    };
  }

  function customPanelHeight(
    entryCount: number,
    style: { fontSize: number; gap: number },
  ) {
    const rowHeight = Math.max(22, style.fontSize + 8);
    return Math.max(
      80,
      entryCount * rowHeight + Math.max(0, entryCount - 1) * style.gap,
    );
  }

  function buffGroupLabel(
    group: { name: string; monitorAll: boolean },
    index: number,
  ) {
    const defaultName = group.monitorAll
      ? t("skillMonitor.defaults.allBuffGroupName")
      : t("skillMonitor.defaults.buffGroupName", { index: index + 1 });
    const suffix = group.monitorAll ? t("monsterOverlay.ghost.allSuffix") : "";
    return `${group.name.trim() || defaultName}${suffix}`;
  }

  function customPanelLabel(group: { name: string }, index: number) {
    return (
      group.name.trim() ||
      t("skillMonitor.defaults.customPanelGroupName", { index: index + 1 })
    );
  }

  const ghostItems = $derived.by(() => {
    const profile = activeProfile();
    if (!profile) return [] as GhostItem[];

    const positions = ensureOverlayPositions(profile);
    const sizes = ensureOverlaySizes(profile);
    const visibility = ensureOverlayVisibility(profile);
    const items: GhostItem[] = [];

    if (visibility.showSkillCdGroup) {
      pushArea(
        items,
        "live-skill-cd",
        t("monsterOverlay.ghost.skillCd"),
        positions.skillCdGroup,
        284,
        110,
        sizes.skillCdGroupScale,
      );
    }

    if (visibility.showResourceGroup) {
      pushArea(
        items,
        "live-resource",
        t("monsterOverlay.ghost.resource"),
        positions.resourceGroup,
        220,
        76,
        sizes.resourceGroupScale,
      );
    }

    pushArea(
      items,
      "live-text-buff",
      t("monsterOverlay.ghost.textBuff"),
      positions.textBuffPanel,
      260,
      120,
      sizes.textBuffPanelScale,
    );

    if (visibility.showPanelAttrGroup) {
      pushArea(
        items,
        "live-panel-attr",
        t("monsterOverlay.ghost.panelAttr"),
        positions.panelAttrGroup,
        180,
        140,
        sizes.panelAttrGroupScale,
      );
    }

    if (visibility.showCustomPanelGroup) {
      for (const [index, group] of ensureCustomPanelGroups(profile).entries()) {
        pushArea(
          items,
          `live-custom-panel-${group.id}`,
          customPanelLabel(group, index),
          group.position,
          240,
          customPanelHeight(
            group.kind === "seasonCultivateFactor" ? 2 : group.entries.length,
            group.style,
          ),
          group.scale,
        );
      }
    }

    if (visibility.showShieldDetailGroup) {
      pushArea(
        items,
        "live-shield-detail",
        t("monsterOverlay.ghost.shieldDetail"),
        positions.shieldDetailGroup,
        300,
        110,
        sizes.shieldDetailGroupScale,
      );
    }

    if (profile.buffDisplayMode === "grouped") {
      for (const [index, group] of ensureBuffGroups(profile).entries()) {
        const dimensions = buffGroupDimensions(group);
        pushArea(
          items,
          `live-buff-group-${group.id}`,
          buffGroupLabel(group, index),
          group.position,
          dimensions.width,
          dimensions.height,
        );
      }
    } else {
      const monitoredBuffIds = profile.monitoredBuffIds ?? [];
      monitoredBuffIds.forEach((baseId, index) => {
        const position =
          positions.iconBuffPositions[baseId] ?? fallbackIconPosition(index);
        pushIcon(
          items,
          `live-buff-icon-${baseId}`,
          t("monsterOverlay.ghost.buff", { id: baseId }),
          position,
          sizes.iconBuffSizes[baseId] ?? 44,
          buffImageSrc(baseId),
          `#${baseId}`,
        );
      });

      const categories = normalizeBuffCategoryKeys(
        profile.monitoredBuffCategories,
      );
      categories.forEach((categoryKey, categoryIndex) => {
        const representativeId = getBuffIdsByCategory(categoryKey)[0];
        const fallbackIndex = monitoredBuffIds.length + categoryIndex;
        const position =
          positions.categoryIconPositions?.[categoryKey] ??
          fallbackIconPosition(fallbackIndex);
        pushIcon(
          items,
          `live-category-icon-${categoryKey}`,
          getBuffCategoryLabel(categoryKey),
          position,
          sizes.categoryIconSizes?.[categoryKey] ?? 44,
          representativeId === undefined
            ? null
            : buffImageSrc(representativeId),
          t("monsterOverlay.ghost.category", { key: categoryKey }),
        );
      });

      const allGroup = ensureIndividualMonitorAllGroup(profile);
      if (allGroup) {
        const dimensions = buffGroupDimensions(allGroup);
        pushArea(
          items,
          `live-individual-all-${allGroup.id}`,
          buffGroupLabel(allGroup, 0),
          allGroup.position,
          dimensions.width,
          dimensions.height,
        );
      }
    }

    if (visibility.showSkillDurationGroup) {
      const classKey = profile.selectedClass ?? "wind_knight";
      const skillDurationIds = profile.monitoredSkillDurationIds ?? [];
      skillDurationIds.forEach((skillId, index) => {
        const position =
          positions.skillDurationPositions[skillId] ??
          fallbackSkillDurationPosition(index);
        const skill = findAnySkillByBaseId(classKey, skillId);
        pushIcon(
          items,
          `live-skill-duration-${skillId}`,
          skill?.name ?? `#${skillId}`,
          position,
          sizes.skillDurationSizes[skillId] ?? 44,
          skill?.imagePath ?? null,
          `#${skillId}`,
        );
      });
    }

    return items;
  });
</script>

<div class="ghost-reference" style:pointer-events="none">
  {#each ghostItems as item (item.id)}
    {#if item.kind === "area"}
      <div
        class="ghost-area"
        style:left={`${item.x}px`}
        style:top={`${item.y}px`}
        style:width={`${item.width}px`}
        style:height={`${item.height}px`}
        style:transform={`scale(${item.scale})`}
        style:transform-origin="top left"
      >
        <span class="ghost-label">{item.label}</span>
      </div>
    {:else}
      <div
        class="ghost-icon"
        style:left={`${item.x}px`}
        style:top={`${item.y}px`}
        style:width={`${item.size + 8}px`}
        title={item.label}
      >
        <div
          class="ghost-icon-wrap"
          style:width={`${item.size}px`}
          style:height={`${item.size}px`}
        >
          {#if item.imageSrc}
            <img src={item.imageSrc} alt={item.label} />
          {:else}
            <span>{item.fallbackText}</span>
          {/if}
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .ghost-reference {
    position: absolute;
    inset: 0;
    z-index: 4;
  }

  .ghost-area {
    position: absolute;
    border: 2px dashed rgba(125, 211, 252, 0.92);
    border-radius: 8px;
    background: rgba(14, 165, 233, 0.13);
    box-shadow:
      inset 0 0 0 1px rgba(224, 242, 254, 0.2),
      0 0 14px rgba(56, 189, 248, 0.2);
  }

  .ghost-label {
    position: absolute;
    top: -20px;
    left: 0;
    display: inline-block;
    max-width: 180px;
    overflow: hidden;
    padding: 2px 6px;
    border: 1px solid rgba(186, 230, 253, 0.56);
    border-radius: 6px;
    background: rgba(8, 47, 73, 0.78);
    color: rgba(240, 249, 255, 0.96);
    font-size: 11px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ghost-icon {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 2px;
    border: 2px dashed rgba(125, 211, 252, 0.82);
    border-radius: 8px;
    background: rgba(14, 165, 233, 0.14);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.18);
    opacity: 0.78;
  }

  .ghost-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid rgba(224, 242, 254, 0.42);
    border-radius: 6px;
    background: rgba(15, 23, 42, 0.32);
  }

  .ghost-icon-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: saturate(0.9) brightness(1.08);
  }

  .ghost-icon-wrap span {
    color: rgba(241, 245, 249, 0.82);
    font-size: 10px;
    font-weight: 700;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }
</style>
