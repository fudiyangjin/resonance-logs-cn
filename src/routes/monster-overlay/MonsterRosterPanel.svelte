<script lang="ts">
  import { barMotion } from "$lib/bar-motion.svelte.js";
  import { t } from "$lib/i18n/index.svelte";
  import {
    overlayPanelBackground,
    overlayTextShadow,
  } from "$lib/overlay-text-style";
  import {
    getRosterPanelPosition,
    getRosterPanelScale,
    isMonsterEditing,
    isMonsterLayoutScaffold,
    monsterRosterPanelData,
    rosterPanelStyle,
    startMonsterDrag,
    startMonsterResize,
  } from "./monster-state.svelte.js";
  import RosterSkillChip from "./RosterSkillChip.svelte";

  const LOOSE_COLOR = "#f87171";

  const editing = $derived(isMonsterEditing());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const roster = $derived(monsterRosterPanelData());
  const styleConfig = $derived(rosterPanelStyle());
  const panelPos = $derived(getRosterPanelPosition());
  const panelScale = $derived(getRosterPanelScale());
  const smallFontSize = $derived(Math.max(10, styleConfig.fontSize - 2));
  // The skill column exists only while some row has watched skills, so HP
  // bars keep their full width otherwise.
  const hasSkills = $derived(
    roster?.rows.some((row) => row.skills.length > 0) ?? false,
  );
</script>

{#if roster || scaffold}
  <div
    class="overlay-group monster-roster-panel"
    class:editable={editing}
    class:has-background={styleConfig.backgroundEnabled === true}
    style:left={`${panelPos.x}px`}
    style:top={`${panelPos.y}px`}
    style:transform={`scale(${panelScale})`}
    style:transform-origin="top left"
    style:--overlay-text-shadow={overlayTextShadow(
      styleConfig.textShadowEnabled,
    )}
    style:background={overlayPanelBackground(
      styleConfig.backgroundEnabled,
      styleConfig.backgroundOpacity,
    )}
    onpointerdown={(event) =>
      startMonsterDrag(event, { kind: "rosterPanel" }, panelPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("monsterOverlay.rosterGroupTag")}</div>
    {/if}

    {#if roster}
      <div class="roster" class:placeholder={roster.isPlaceholder}>
        <div class="roster-header" style:font-size={`${smallFontSize}px`}>
          <span
            >{t("monsterOverlay.roster.count", { count: roster.count })}</span
          >
          {#if roster.tankMode}
            <span class:loose={roster.looseCount > 0}>
              · {t("monsterOverlay.roster.looseCount", {
                count: roster.looseCount,
              })}{#if roster.looseSummary}{t(
                  "monsterOverlay.roster.looseDetail",
                  {
                    summary: roster.looseSummary,
                  },
                )}{/if}
            </span>
          {/if}
        </div>

        <div
          class="roster-rows"
          class:with-skills={hasSkills}
          style:row-gap={`${styleConfig.gap}px`}
        >
          {#each roster.rows as row (row.uuid)}
            <div
              class="roster-row"
              class:target={row.isTarget}
              class:skill-only={row.skillOnly}
            >
              {#if !row.skillOnly}
                <div class="roster-track">
                  <div
                    class="roster-fill"
                    {@attach barMotion(() => ({
                      kind: "static",
                      scale: row.ratio,
                    }))}
                    style:background={styleConfig.progressColor}
                    style:opacity={styleConfig.progressOpacity}
                  ></div>
                </div>
              {/if}
              <div
                class="roster-main"
                style:gap={`${styleConfig.columnGap}px`}
                style:font-size={`${styleConfig.fontSize}px`}
              >
                <span class="roster-name" style:color={styleConfig.nameColor}>
                  {#if row.isTarget}<span class="target-mark">★</span>{/if}
                  {row.name}
                  {#if row.kind !== "normal"}
                    <span
                      class="kind-tag kind-{row.kind}"
                      style:font-size={`${smallFontSize}px`}
                    >
                      {t(`monsterOverlay.roster.kind.${row.kind}`)}
                    </span>
                  {/if}
                </span>
                {#if !row.skillOnly}
                  <span
                    class="roster-right"
                    style:color={styleConfig.valueColor}
                  >
                    {#if row.distanceText}
                      <span
                        class="roster-meta"
                        style:font-size={`${smallFontSize}px`}
                      >
                        {row.distanceText}
                      </span>
                    {/if}
                    {#if row.hpText}
                      <span
                        class="roster-meta"
                        style:font-size={`${smallFontSize}px`}
                      >
                        {row.hpText}
                      </span>
                    {/if}
                    <span class="roster-percent">{row.percentText}</span>
                    {#if row.looseTargetName}
                      <span class="roster-loose" style:color={LOOSE_COLOR}>
                        → {row.looseTargetName}
                      </span>
                    {/if}
                  </span>
                {/if}
              </div>
            </div>
            {#if hasSkills}
              <div class="roster-skills">
                {#each row.skills as chip (chip.skillId)}
                  <RosterSkillChip {chip} fontSize={smallFontSize} />
                {/each}
              </div>
            {/if}
          {/each}
        </div>

        {#if roster.strip.length > 0}
          <div
            class="roster-strip"
            style:font-size={`${smallFontSize}px`}
            style:color={styleConfig.valueColor}
          >
            <span class="strip-label">
              {t("monsterOverlay.roster.more", { count: roster.strip.length })}
            </span>
            <span class="strip-bars">
              {#each roster.strip as bar (bar.uuid)}
                <span class="strip-bar">
                  <span
                    class="strip-bar-fill"
                    style:background={styleConfig.progressColor}
                    style:transform={`scaleY(${bar.ratio})`}
                  ></span>
                </span>
              {/each}
            </span>
            {#if roster.strip.length === 1}
              <span class="strip-range">{roster.stripLowestText}</span>
            {:else if roster.stripHighestText && roster.stripLowestText}
              <span class="strip-range">
                {t("monsterOverlay.roster.stripRange", {
                  highest: roster.stripHighestText,
                  lowest: roster.stripLowestText,
                })}
              </span>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(event) =>
          startMonsterResize(event, { kind: "rosterPanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  /* No max width: the skill column grows with the watched skills of the
     monsters shown, the HP column is capped per row. */
  .monster-roster-panel {
    min-width: 240px;
  }

  .monster-roster-panel.has-background {
    padding: 6px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  .monster-roster-panel.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
    min-height: 40px;
  }

  .roster {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 240px;
  }

  .roster.placeholder {
    opacity: 0.7;
  }

  .roster-header {
    font-weight: 700;
    color: rgba(255, 255, 255, 0.92);
    text-shadow: var(--overlay-text-shadow, 0 0 4px rgba(0, 0, 0, 0.9));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .roster-header .loose {
    color: #f87171;
  }

  /* One grid for all rows, so every HP bar and skill column lines up. */
  .roster-rows {
    display: grid;
    grid-template-columns: minmax(240px, max-content);
    column-gap: 6px;
  }

  .roster-rows.with-skills {
    grid-template-columns: minmax(240px, max-content) max-content;
  }

  .roster-skills {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .roster-row.skill-only {
    opacity: 0.85;
  }

  .roster-row {
    position: relative;
    max-width: 340px;
    min-height: 20px;
    border-radius: 6px;
    overflow: hidden;
  }

  .roster-row.target {
    box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.7);
  }

  .roster-track {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.16);
    overflow: hidden;
  }

  .roster-fill {
    width: 100%;
    height: 100%;
    transform-origin: left center;
    will-change: transform;
  }

  .roster-main {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 2px 6px;
    text-shadow: var(
      --overlay-text-shadow,
      0 0 3px rgba(0, 0, 0, 1),
      0 0 6px rgba(0, 0, 0, 0.7),
      0 1px 2px rgba(0, 0, 0, 0.9)
    );
  }

  .roster-name {
    min-width: 0;
    flex: 1 1 auto;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .target-mark {
    color: #facc15;
    margin-right: 2px;
  }

  .kind-tag {
    margin-left: 4px;
    font-weight: 700;
  }

  .kind-boss {
    color: #f59e0b;
  }

  .kind-elite {
    color: #a78bfa;
  }

  .roster-right {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .roster-percent,
  .roster-loose {
    font-weight: 600;
  }

  .roster-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    text-shadow: var(--overlay-text-shadow, 0 0 3px rgba(0, 0, 0, 1));
    white-space: nowrap;
  }

  .strip-bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
    height: 16px;
  }

  .strip-bar {
    position: relative;
    flex: 0 1 6px;
    min-width: 2px;
    height: 100%;
    background: rgba(255, 255, 255, 0.16);
    border-radius: 1px;
    overflow: hidden;
  }

  .strip-bar-fill {
    position: absolute;
    inset: 0;
    transform-origin: bottom center;
  }

  .strip-range {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
</style>
