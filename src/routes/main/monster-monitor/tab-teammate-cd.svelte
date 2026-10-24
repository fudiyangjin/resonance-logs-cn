<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import { updateMonsterMonitor } from "$lib/monster-monitor-profile.svelte.js";
  import {
    SETTINGS,
    TEAMMATE_CD_DISPLAY_MODES,
    TEAMMATE_CD_SLOT_KINDS,
    TEAMMATE_CD_SLOT_LIMITS,
    TEAMMATE_CD_SLOT_SIDES,
    ensureTeammateCdPanelStyle,
    isTeammateDeadRowPlacement,
    normalizeTeammateCdSkills,
    type TeammateCdFiveSlots,
    type TeammateCdPanelStyle,
    type TeammateCdSkillMap,
    type TeammateCdSlotLayout,
    type TeammateCdTwentySlots,
  } from "$lib/settings-store";
  import SkillIcon from "$lib/components/skill-icon.svelte";
  import {
    getClassConfigs,
    getSkillsByClass,
    skillBgColour,
  } from "$lib/skill-mappings";
  import OverlayTextStyleFields from "../skill-monitor/overlay-text-style-fields.svelte";

  const classConfigs = $derived(getClassConfigs());
  const selection = $derived(
    normalizeTeammateCdSkills(SETTINGS.monsterMonitor.state.teammateCdSkills),
  );
  const panelStyle = $derived(
    ensureTeammateCdPanelStyle(
      SETTINGS.monsterMonitor.state.teammateCdPanelStyle,
    ),
  );

  let selectedClassKey = $state("");
  const activeClassKey = $derived(
    selectedClassKey || classConfigs[0]?.classKey || "",
  );
  const classSkills = $derived(getSkillsByClass(activeClassKey));
  const selectedIds = $derived(selection[activeClassKey] ?? []);
  const skillById = $derived(
    new Map(classSkills.map((skill) => [skill.skillId, skill])),
  );

  function writeSelection(classKey: string, ids: number[]) {
    updateMonsterMonitor((state) => {
      const next: TeammateCdSkillMap = normalizeTeammateCdSkills(
        state.teammateCdSkills,
      );
      if (ids.length > 0) {
        next[classKey] = ids;
      } else {
        delete next[classKey];
      }
      return { teammateCdSkills: next };
    });
  }

  function toggleSkill(skillId: number) {
    const ids = selectedIds.includes(skillId)
      ? selectedIds.filter((id) => id !== skillId)
      : [...selectedIds, skillId];
    writeSelection(activeClassKey, ids);
  }

  function moveSkill(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selectedIds.length) return;
    const ids = [...selectedIds];
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    writeSelection(activeClassKey, ids);
  }

  function updateStyle<K extends keyof TeammateCdPanelStyle>(
    key: K,
    value: TeammateCdPanelStyle[K],
  ) {
    updateMonsterMonitor((state) => ({
      teammateCdPanelStyle: ensureTeammateCdPanelStyle({
        ...state.teammateCdPanelStyle,
        [key]: value,
      }),
    }));
  }

  function intValue(event: Event): number {
    return Number.parseInt((event.currentTarget as HTMLInputElement).value, 10);
  }

  const rangeFields = [
    { key: "iconSize", min: 20, max: 72 },
    { key: "iconGap", min: 0, max: 24 },
    { key: "rowGap", min: 0, max: 24 },
    { key: "nameColumnWidth", min: 0, max: 240 },
    { key: "fontSize", min: 10, max: 28 },
  ] as const;

  const slotLayout = $derived(panelStyle.slots);
  const slotIconFields = ["iconSize", "iconGap"] as const;
  const editKind = $derived(slotLayout.previewKind);

  function updateSlots(
    patch: (slots: TeammateCdSlotLayout) => TeammateCdSlotLayout,
  ) {
    updateMonsterMonitor((state) => {
      const style = ensureTeammateCdPanelStyle(state.teammateCdPanelStyle);
      return {
        teammateCdPanelStyle: ensureTeammateCdPanelStyle({
          ...style,
          slots: patch(style.slots),
        }),
      };
    });
  }

  // The two grids share field names; each lists only its own fields below.
  type GridFields = TeammateCdFiveSlots & TeammateCdTwentySlots;
  type GridNumberKey = "rowPitch" | "columnOffset" | "blockOffset";
  type GridSideKey = "side" | "leftSide" | "rightSide";

  const grid = $derived<Partial<GridFields>>(slotLayout[editKind]);

  function updateGrid<K extends GridNumberKey | GridSideKey>(
    key: K,
    value: GridFields[K],
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) return;
    updateSlots((slots) => ({
      ...slots,
      [editKind]: { ...slots[editKind], [key]: value },
    }));
  }

  // The grid's position is set by dragging it in the overlay's edit mode.
  const gridNumberFields = $derived<GridNumberKey[]>(
    editKind === "five"
      ? ["rowPitch"]
      : ["rowPitch", "columnOffset", "blockOffset"],
  );
  const gridSideFields = $derived<GridSideKey[]>(
    editKind === "five" ? ["side"] : ["leftSide", "rightSide"],
  );
</script>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <div class="space-y-1">
    <h2 class="text-foreground text-base font-semibold">
      {t("monsterMonitor.teammateCd.title")}
    </h2>
    <p class="text-muted-foreground text-xs">
      {t("monsterMonitor.teammateCd.description")}
    </p>
  </div>

  <div class="flex flex-wrap gap-2">
    {#each classConfigs as config (config.classKey)}
      {@const count = selection[config.classKey]?.length ?? 0}
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeClassKey ===
        config.classKey
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (selectedClassKey = config.classKey)}
      >
        {config.className}{count > 0 ? ` (${count})` : ""}
      </button>
    {/each}
  </div>

  <div class="space-y-2">
    <div class="text-foreground text-sm font-medium">
      {t("monsterMonitor.teammateCd.pickSkills")}
    </div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
      {#each classSkills as skill (skill.skillId)}
        {@const selected = selectedIds.includes(skill.skillId)}
        <button
          type="button"
          class="flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] transition-colors {selected
            ? 'border-primary bg-primary/15 text-foreground'
            : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'}"
          title={skill.name}
          onclick={() => toggleSkill(skill.skillId)}
        >
          <div
            class="size-10 overflow-hidden rounded"
            class:opacity-50={!selected}
          >
            <SkillIcon
              imagePath={skill.imagePath}
              alt={skill.name}
              colour={skillBgColour(skill.skillId)}
            />
          </div>
          <span class="w-full truncate text-center">{skill.name}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="space-y-2">
    <div class="text-foreground text-sm font-medium">
      {t("monsterMonitor.teammateCd.selectedOrder", {
        count: selectedIds.length,
      })}
    </div>
    {#if selectedIds.length === 0}
      <p class="text-muted-foreground text-xs">
        {t("monsterMonitor.teammateCd.emptyClass")}
      </p>
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each selectedIds as skillId, index (skillId)}
          {@const skill = skillById.get(skillId)}
          <div
            class="border-border/60 bg-muted/20 flex items-center gap-1 rounded-lg border p-1"
          >
            {#if skill}
              <div class="size-8 overflow-hidden rounded">
                <SkillIcon
                  imagePath={skill.imagePath}
                  alt={skill.name}
                  colour={skillBgColour(skill.skillId)}
                />
              </div>
            {:else}
              <span class="text-muted-foreground px-1 text-xs">#{skillId}</span>
            {/if}
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground px-1 text-xs disabled:opacity-30"
              disabled={index === 0}
              title={t("monsterMonitor.teammateCd.moveUp")}
              onclick={() => moveSkill(index, -1)}>←</button
            >
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground px-1 text-xs disabled:opacity-30"
              disabled={index === selectedIds.length - 1}
              title={t("monsterMonitor.teammateCd.moveDown")}
              onclick={() => moveSkill(index, 1)}>→</button
            >
            <button
              type="button"
              class="text-muted-foreground hover:text-destructive px-1 text-xs"
              title={t("monsterMonitor.teammateCd.remove")}
              onclick={() => toggleSkill(skillId)}>×</button
            >
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<section class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5">
  <div class="space-y-1">
    <h2 class="text-foreground text-base font-semibold">
      {t("monsterMonitor.teammateCd.styleTitle")}
    </h2>
  </div>

  <div class="flex flex-wrap gap-2">
    {#each TEAMMATE_CD_DISPLAY_MODES as mode (mode)}
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {panelStyle.displayMode ===
        mode
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => updateStyle("displayMode", mode)}
      >
        {t(`monsterMonitor.teammateCd.mode.${mode}`)}
      </button>
    {/each}
  </div>
  <p class="text-muted-foreground text-xs">
    {t(`monsterMonitor.teammateCd.mode.${panelStyle.displayMode}.hint`)}
  </p>

  {#if panelStyle.displayMode === "slots"}
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-foreground text-sm font-medium">
        {t("monsterMonitor.teammateCd.slots.editKind")}
      </span>
      {#each TEAMMATE_CD_SLOT_KINDS as kind (kind)}
        <button
          type="button"
          class="rounded-lg border px-3 py-1.5 text-sm transition-colors {editKind ===
          kind
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() =>
            updateSlots((slots) => ({ ...slots, previewKind: kind }))}
        >
          {t(`monsterOverlay.teammateCd.slotKind.${kind}`)}
        </button>
      {/each}
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      {#each gridNumberFields as key (key)}
        {@const [min, max] = TEAMMATE_CD_SLOT_LIMITS[key]}
        <label class="style-field">
          <span>{t(`monsterMonitor.teammateCd.slots.${key}`)}</span>
          <input
            type="range"
            {min}
            {max}
            value={grid[key]}
            oninput={(event) => updateGrid(key, intValue(event))}
          />
          <input
            class="number-input"
            type="number"
            {min}
            {max}
            step="1"
            value={grid[key]}
            onchange={(event) => updateGrid(key, intValue(event))}
          />
        </label>
      {/each}

      {#each gridSideFields as key (key)}
        <label class="style-field">
          <span>{t(`monsterMonitor.teammateCd.slots.${key}`)}</span>
          <select
            class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-sm"
            value={grid[key]}
            onchange={(event) => {
              const side = (event.currentTarget as HTMLSelectElement).value;
              const match = TEAMMATE_CD_SLOT_SIDES.find(
                (value) => value === side,
              );
              if (match) updateGrid(key, match);
            }}
          >
            {#each TEAMMATE_CD_SLOT_SIDES as side (side)}
              <option value={side}>
                {t(`monsterMonitor.teammateCd.slots.side.${side}`)}
              </option>
            {/each}
          </select>
        </label>
      {/each}

      {#each slotIconFields as key (key)}
        {@const [min, max] = TEAMMATE_CD_SLOT_LIMITS[key]}
        <label class="style-field">
          <span>{t(`monsterMonitor.teammateCd.style.${key}`)}</span>
          <input
            type="range"
            {min}
            {max}
            value={slotLayout[key]}
            oninput={(event) => {
              const value = intValue(event);
              updateSlots((slots) => ({ ...slots, [key]: value }));
            }}
          />
          <strong>{slotLayout[key]}px</strong>
        </label>
      {/each}
    </div>
  {:else}
    <div class="grid gap-4 lg:grid-cols-3">
      {#each rangeFields as field (field.key)}
        <label class="style-field">
          <span>{t(`monsterMonitor.teammateCd.style.${field.key}`)}</span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            value={panelStyle[field.key]}
            oninput={(event) => updateStyle(field.key, intValue(event))}
          />
          <strong>{panelStyle[field.key]}px</strong>
        </label>
      {/each}

      <label class="style-field">
        <span>{t("monsterMonitor.style.deadRowPlacement")}</span>
        <select
          class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-sm"
          value={panelStyle.deadRowPlacement}
          onchange={(event) => {
            const placement = (event.currentTarget as HTMLSelectElement).value;
            if (isTeammateDeadRowPlacement(placement)) {
              updateStyle("deadRowPlacement", placement);
            }
          }}
        >
          <option value="last"
            >{t("monsterMonitor.style.deadRowPlacement.last")}</option
          >
          <option value="first"
            >{t("monsterMonitor.style.deadRowPlacement.first")}</option
          >
          <option value="keep"
            >{t("monsterMonitor.style.deadRowPlacement.keep")}</option
          >
        </select>
      </label>

      <label class="style-field">
        <span>{t("monsterMonitor.teammateCd.style.showClassIcon")}</span>
        <input
          type="checkbox"
          checked={panelStyle.showClassIcon}
          onchange={(event) =>
            updateStyle(
              "showClassIcon",
              (event.currentTarget as HTMLInputElement).checked,
            )}
        />
      </label>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <label class="color-field">
        <span>{t("monsterMonitor.style.nameColor")}</span>
        <input
          type="color"
          value={panelStyle.nameColor}
          oninput={(event) =>
            updateStyle(
              "nameColor",
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
      </label>
      <label class="color-field">
        <span>{t("monsterMonitor.style.deadNameColor")}</span>
        <input
          type="color"
          value={panelStyle.deadNameColor}
          oninput={(event) =>
            updateStyle(
              "deadNameColor",
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
      </label>
    </div>

    <OverlayTextStyleFields
      textShadowEnabled={panelStyle.textShadowEnabled}
      backgroundEnabled={panelStyle.backgroundEnabled}
      backgroundOpacity={panelStyle.backgroundOpacity}
      onTextShadowEnabled={(value) => updateStyle("textShadowEnabled", value)}
      onBackgroundEnabled={(value) => updateStyle("backgroundEnabled", value)}
      onBackgroundOpacity={(value) => updateStyle("backgroundOpacity", value)}
    />
  {/if}
</section>

<style>
  .style-field,
  .color-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.22);
    font-size: 13px;
    color: var(--foreground, #fff);
  }

  .style-field strong {
    font-size: 12px;
    color: var(--muted-foreground, rgba(255, 255, 255, 0.72));
  }

  .number-input {
    width: 96px;
    padding: 2px 6px;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.35);
    color: inherit;
    font-size: 12px;
  }

  .color-field input[type="color"] {
    width: 100%;
    height: 42px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }
</style>
