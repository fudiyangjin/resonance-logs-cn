<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { findAnySkillByBaseId, getClassConfigs } from "$lib/skill-mappings";
  import { liveMonsterStore, liveTeamStore } from "$lib/stores/live-topics.svelte";
  import { CLASS_MAP, getClassIcon } from "$lib/utils.svelte";
  import {
    overlayPanelBackground,
    overlayTextShadow,
  } from "$lib/overlay-text-style";
  import { overlayNow } from "../game-overlay/overlay-clock.svelte.js";
  import { computeDisplay } from "../game-overlay/overlay-utils";
  import SkillCdCell from "../game-overlay/SkillCdCell.svelte";
  import {
    getTeammateCdPanelPosition,
    getTeammateCdPanelScale,
    isMonsterEditing,
    isMonsterLayoutScaffold,
    startMonsterDrag,
    startMonsterResize,
    teammateCdPanelStyle,
  } from "./monster-state.svelte.js";
  import { buildTeammateCdRows } from "./monster-teammate-cd";

  const PLACEHOLDER_SLOTS = Array.from({ length: 4 }, (_, index) => index);

  const editing = $derived(isMonsterEditing());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const styleConfig = $derived(teammateCdPanelStyle());
  const panelPos = $derived(getTeammateCdPanelPosition());
  const panelScale = $derived(getTeammateCdPanelScale());
  const classKeyById = $derived(
    new Map(getClassConfigs().map((config) => [config.classId, config.classKey])),
  );
  const dead = $derived(new Set(liveMonsterStore.data?.deadTeammates ?? []));
  const team = $derived(liveTeamStore.data);

  const rows = $derived.by(() =>
    buildTeammateCdRows({
      teammates: team?.teammates ?? [],
      linkOnline: team?.linkOnline ?? false,
      layout: team?.layout ?? null,
      selection: SETTINGS.monsterMonitor.state.teammateCdSkills ?? {},
      classKeyOf: (classId) => classKeyById.get(classId),
      skillInfo: (classKey, skillId) =>
        findAnySkillByBaseId(classKey, skillId),
      classIconOf: (classId) => getClassIcon(CLASS_MAP[classId] ?? ""),
      dead,
      placement: styleConfig.deadRowPlacement,
      now: overlayNow(),
      display: computeDisplay,
    }),
  );
</script>

{#if rows.length > 0 || scaffold}
  <div
    class="overlay-group teammate-cd-panel"
    class:editable={editing}
    class:has-background={styleConfig.backgroundEnabled}
    style:left={`${panelPos.x}px`}
    style:top={`${panelPos.y}px`}
    style:transform={`scale(${panelScale})`}
    style:transform-origin="top left"
    style:--overlay-text-shadow={overlayTextShadow(styleConfig.textShadowEnabled)}
    style:background={overlayPanelBackground(
      styleConfig.backgroundEnabled,
      styleConfig.backgroundOpacity,
    )}
    style:--font-size={`${styleConfig.fontSize}px`}
    style:--name-column-width={`${styleConfig.nameColumnWidth}px`}
    style:--icon-size={`${styleConfig.iconSize}px`}
    style:--icon-gap={`${styleConfig.iconGap}px`}
    style:--row-gap={`${styleConfig.rowGap}px`}
    style:--name-color={styleConfig.nameColor}
    style:--dead-name-color={styleConfig.deadNameColor}
    onpointerdown={(event) =>
      startMonsterDrag(event, { kind: "teammateCdPanel" }, panelPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("monsterOverlay.teammateCdGroupTag")}</div>
    {/if}

    <div class="rows">
      {#each rows as row (row.teammateEntityUuid)}
        <div class="teammate-row" class:stale={row.isStale}>
          {#if styleConfig.nameColumnWidth > 0}
            <div class="teammate-label" class:dead={row.isDead}>
              {#if styleConfig.showClassIcon && row.classIconPath}
                <img class="class-icon" src={row.classIconPath} alt="" />
              {/if}
              <span class="teammate-name" title={row.teammateName}>
                {row.teammateName}
              </span>
            </div>
          {/if}
          <div class="cells">
            {#each row.cells as cell (cell.skillId)}
              <SkillCdCell
                skillId={cell.skillId}
                name={cell.name}
                imagePath={cell.imagePath}
                display={cell.display}
                size={styleConfig.iconSize}
              />
            {/each}
          </div>
        </div>
      {:else}
        <div class="teammate-row placeholder">
          {#if styleConfig.nameColumnWidth > 0}
            <div class="teammate-label">
              <span class="teammate-name">
                {t("monsterOverlay.teammateCd.placeholderName")}
              </span>
            </div>
          {/if}
          <div class="cells">
            {#each PLACEHOLDER_SLOTS as slot (slot)}
              <SkillCdCell size={styleConfig.iconSize} />
            {/each}
          </div>
        </div>
      {/each}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(event) =>
          startMonsterResize(event, { kind: "teammateCdPanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .teammate-cd-panel.has-background {
    padding: 6px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  .teammate-cd-panel.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--row-gap);
  }

  .teammate-row {
    display: flex;
    align-items: center;
    gap: var(--icon-gap);
  }

  .teammate-row.stale,
  .teammate-row.placeholder {
    opacity: 0.55;
  }

  .teammate-label {
    display: flex;
    align-items: center;
    gap: 4px;
    width: var(--name-column-width);
    min-width: 0;
    flex: none;
    color: var(--name-color);
    font-size: var(--font-size);
    font-weight: 700;
    line-height: 1.2;
    text-shadow: var(
      --overlay-text-shadow,
      0 0 3px rgba(0, 0, 0, 1),
      0 1px 2px rgba(0, 0, 0, 0.9)
    );
  }

  .teammate-label.dead {
    color: var(--dead-name-color);
  }

  .class-icon {
    width: calc(var(--font-size) + 4px);
    height: calc(var(--font-size) + 4px);
    flex: none;
    object-fit: contain;
  }

  .teammate-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cells {
    display: flex;
    gap: var(--icon-gap);
  }
</style>
