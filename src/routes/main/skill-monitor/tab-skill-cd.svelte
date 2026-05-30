<script lang="ts">
  import { onMount, tick } from "svelte";

  import { findAnySkillByBaseId, type ClassSkillConfig, type ResonanceSkillDefinition, type SkillDefinition } from "$lib/skill-mappings";
  import { SETTINGS } from "$lib/settings-store";
  import {
    TRANSLATION_RUNTIME_REVISION,
    initializeSkillNameTranslationData,
    uiT,
    resolveSkillNote,
    resolveSkillMonitorClassName,
    resolveSkillMonitorClassSkillName,
  } from "$lib/i18n";

  interface Props {
    classConfigs: ClassSkillConfig[];
    selectedClassKey: string;
    classSkills: SkillDefinition[];
    durationSkills: SkillDefinition[];
    monitoredSkillIds: number[];
    monitoredSkillDurationIds: number[];
    resonanceSearch: string;
    filteredResonanceSkills: ResonanceSkillDefinition[];
    selectedResonanceSkills: ResonanceSkillDefinition[];
    skillCdShowSlotOutline: boolean;
    setSelectedClass: (classKey: string) => void;
    toggleSkill: (skillId: number) => void;
    isSelected: (skillId: number) => boolean;
    toggleSkillDuration: (skillId: number) => void;
    isDurationSelected: (skillId: number) => boolean;
    clearSkills: () => void;
    clearSkillDurations: () => void;
    setResonanceSearch: (value: string) => void;
    setSkillCdShowSlotOutline: (value: boolean) => void;
  }

  const t = uiT("overlay/skill-monitor/skill-cd", () => SETTINGS.live.general.state.language);
  type SkillTooltipPlacement = "top" | "bottom";
  type SkillTooltipAnchor = {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  type ActiveSkillTooltip = {
    key: string;
    placement: SkillTooltipPlacement;
    anchor: SkillTooltipAnchor;
    left: number;
    top: number;
    width: number;
  };

  let skillTranslationRevision = $state(0);
  let activeSkillTooltip = $state<ActiveSkillTooltip | null>(null);
  let tooltipElement = $state<HTMLDivElement | undefined>(undefined);

  const SKILL_TOOLTIP_MARGIN = 12;
  const SKILL_TOOLTIP_GAP = 6;
  const SKILL_TOOLTIP_WIDTH = 480;
  const SKILL_NOTE_SOURCE_FALLBACKS = new Map<number, number>([
    [1609, 1608],
    [1610, 1608],
    [1611, 1608],
  ]);
  const SKILL_NOTE_TEXT_FALLBACKS: Record<number, string> = {
    2224:
      "No standalone localized description was found in the extracted game data. This row is the enhanced Lethal Shot skill entry used by Marksman.",
  };

  let {
    classConfigs,
    selectedClassKey,
    classSkills,
    durationSkills,
    monitoredSkillIds,
    monitoredSkillDurationIds,
    resonanceSearch,
    filteredResonanceSkills,
    selectedResonanceSkills,
    skillCdShowSlotOutline,
    setSelectedClass,
    toggleSkill,
    isSelected,
    toggleSkillDuration,
    isDurationSelected,
    clearSkills,
    clearSkillDurations,
    setResonanceSearch,
    setSkillCdShowSlotOutline,
  }: Props = $props();

  onMount(() => {
    const unsubscribe = TRANSLATION_RUNTIME_REVISION.subscribe((value) => {
      skillTranslationRevision = value;
    });
    const handleResize = () => {
      void positionActiveSkillTooltip();
    };
    window.addEventListener("resize", handleResize);
    void initializeSkillNameTranslationData();
    return () => {
      unsubscribe();
      window.removeEventListener("resize", handleResize);
    };
  });

  function anchorFromElement(element: HTMLElement): SkillTooltipAnchor {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  }

  async function positionActiveSkillTooltip(): Promise<void> {
    await tick();
    if (!activeSkillTooltip || !tooltipElement) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const width = Math.min(SKILL_TOOLTIP_WIDTH, Math.max(220, viewportWidth - SKILL_TOOLTIP_MARGIN * 2));
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const tooltipHeight = tooltipRect.height;
    const anchor = activeSkillTooltip.anchor;

    let left = Math.min(
      Math.max(anchor.left, SKILL_TOOLTIP_MARGIN),
      Math.max(SKILL_TOOLTIP_MARGIN, viewportWidth - width - SKILL_TOOLTIP_MARGIN),
    );

    const below = anchor.bottom + SKILL_TOOLTIP_GAP;
    const above = anchor.top - tooltipHeight - SKILL_TOOLTIP_GAP;
    const preferTop = activeSkillTooltip.placement === "top";
    let top = preferTop ? above : below;

    if (!preferTop && top + tooltipHeight + SKILL_TOOLTIP_MARGIN > viewportHeight && above >= SKILL_TOOLTIP_MARGIN) {
      top = above;
    } else if (preferTop && top < SKILL_TOOLTIP_MARGIN && below + tooltipHeight + SKILL_TOOLTIP_MARGIN <= viewportHeight) {
      top = below;
    }

    top = Math.min(
      Math.max(top, SKILL_TOOLTIP_MARGIN),
      Math.max(SKILL_TOOLTIP_MARGIN, viewportHeight - tooltipHeight - SKILL_TOOLTIP_MARGIN),
    );

    activeSkillTooltip = {
      ...activeSkillTooltip,
      left,
      top,
      width,
    };
  }

  function skillTooltipStyle(): string {
    if (!activeSkillTooltip) return "";
    return [
      `left: ${activeSkillTooltip.left}px`,
      `top: ${activeSkillTooltip.top}px`,
      `width: ${activeSkillTooltip.width}px`,
      `max-height: calc(100vh - ${SKILL_TOOLTIP_MARGIN * 2}px)`,
    ].join("; ");
  }

  function showSkillTooltip(
    key: string,
    placement: SkillTooltipPlacement = "bottom",
    anchor?: HTMLElement,
  ): void {
    if (!anchor) return;
    activeSkillTooltip = {
      key,
      placement,
      anchor: anchorFromElement(anchor),
      left: SKILL_TOOLTIP_MARGIN,
      top: SKILL_TOOLTIP_MARGIN,
      width: SKILL_TOOLTIP_WIDTH,
    };
    void positionActiveSkillTooltip();
  }

  function hideSkillTooltip(key: string): void {
    if (activeSkillTooltip?.key === key) {
      activeSkillTooltip = null;
    }
  }

  function displayClassName(config: ClassSkillConfig): string {
    return resolveSkillMonitorClassName(
      config.classKey,
      SETTINGS.live.general.state.language,
      String(config.className ?? config.classKey ?? ""),
    );
  }

  function displaySkillName(skill: SkillDefinition): string {
    return resolveSkillMonitorClassSkillName(
      selectedClassKey,
      skill.skillId,
      SETTINGS.live.general.state.language,
      skill.name || `#${skill.skillId}`,
    );
  }

  function formatSkillHoverNote(note: string): string {
    const actionLead =
      "(?:A key|A|An|The|When|For|Grants|Unleashes|Deals|Increases|Decreases|Consumes|Starts|Allows|Restores|After|Each|Every|If|Perform|Performs|Launches|Creates|Casts|Converts|Reduces|Boosts|Gain|Gains|Trigger|Triggers)";
    const sectionLabels = [
      "Basic Attack",
      "Normal Attack",
      "Special Attack",
      "Expertise Skill",
      "Active",
      "Passive",
      "Class-Exclusive",
      "General ATK",
      "General DEF",
    ];
    const escapedLabels = sectionLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

    let text = note.trim().replace(/\s+/g, " ");
    text = text.replace(/\s+(?:Tips?|Dicas?|攻略|戰略|战略|戦略|팁|Strategi)[:：].*$/iu, "");
    text = text.replace(
      new RegExp(`\\s+(?=(?:${escapedLabels})[:：])`, "g"),
      "\n",
    );
    text = text.replace(
      new RegExp(`^([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*){0,4})\\s+(${actionLead}\\b)`),
      "$1. $2",
    );
    text = text.replace(
      new RegExp(`(^|\\n)((?:${escapedLabels})[:：]\\s*.+?)\\s+(${actionLead}\\b)`, "g"),
      "$1$2. $3",
    );
    return text.trim();
  }

  function resolveSkillHoverNote(skillId: number): string {
    const locale = SETTINGS.live.general.state.language;
    const directNote = resolveSkillNote(skillId, locale).trim();
    if (directNote) return directNote;

    const sourceSkillId = SKILL_NOTE_SOURCE_FALLBACKS.get(skillId);
    if (sourceSkillId !== undefined) {
      const sourceNote = resolveSkillNote(sourceSkillId, locale).trim();
      if (sourceNote) return sourceNote;
    }

    return SKILL_NOTE_TEXT_FALLBACKS[skillId] ?? "";
  }


  function formatEffectDuration(durationMs: number | undefined): string {
    if (!durationMs || durationMs <= 0) return "--";
    return `${durationMs % 1000 === 0 ? durationMs / 1000 : (durationMs / 1000).toFixed(1)}s`;
  }

  function skillHoverTitle(skill: SkillDefinition, extra = ""): string {
    void skillTranslationRevision;
    const note = SETTINGS.live.general.state.showHoverDescriptions !== false
      ? formatSkillHoverNote(resolveSkillHoverNote(skill.skillId))
      : "";
    return [
      displaySkillName(skill),
      `ID: #${skill.skillId}`,
      extra,
      note ? `Description:\n${note}` : "",
    ].filter(Boolean).join("\n");
  }

  function resonanceSkillHoverTitle(skill: ResonanceSkillDefinition): string {
    const imagineName = skill.imagineName?.trim();
    return skillHoverTitle(
      skill,
      imagineName && imagineName !== displaySkillName(skill) ? `Imagine: ${imagineName}` : "",
    );
  }
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("overlayDisplay", "Overlay Display")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("overlayDisplayDescription", "Adjust how selected skill slots appear in the game overlay")}
        </p>
      </div>
      <label class="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={skillCdShowSlotOutline}
          onchange={(event) =>
            setSkillCdShowSlotOutline((event.currentTarget as HTMLInputElement).checked)}
        />
        {t("showSlotOutline", "Show skill slot outline")}
      </label>
    </div>
    <p class="text-xs text-muted-foreground">
      {t("showSlotOutlineDescription", "Adds the border and active-skill glow around tracked skill icons in the overlay.")}
    </p>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("classSelection", "职业选择")}</h2>
      <p class="text-xs text-muted-foreground">
        {t("classSelectionDescription", "支持当前已配置的职业技能方案")}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each classConfigs as config (config.classKey)}
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {selectedClassKey === config.classKey
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => setSelectedClass(config.classKey)}
        >
          {displayClassName(config)}
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("skillSelection", "技能选择")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("skillSelectionDescription", "最多监控 10 个技能（2行 x 5列）")}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          {t("selectedCount", "已选")} {monitoredSkillIds.length}/10
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearSkills}
        >
          {t("clear", "清空")}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
      {#each classSkills as skill (skill.skillId)}
        {@const tooltipKey = `skill-${selectedClassKey}-${skill.skillId}`}
        {@const tooltipTitle = skillHoverTitle(skill)}
        <div class="relative">
          <button
            type="button"
            class="relative min-h-[78px] w-full cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isSelected(skill.skillId)
              ? 'border-primary ring-1 ring-primary'
              : 'border-border/60 hover:border-border'}"
            aria-label={displaySkillName(skill)}
            onmouseenter={(event) => showSkillTooltip(tooltipKey, "bottom", event.currentTarget as HTMLElement)}
            onmouseleave={() => hideSkillTooltip(tooltipKey)}
            onfocus={(event) => showSkillTooltip(tooltipKey, "bottom", event.currentTarget as HTMLElement)}
            onblur={() => hideSkillTooltip(tooltipKey)}
            onclick={() => toggleSkill(skill.skillId)}
          >
            {#if skill.imagePath}
              <img
                src={skill.imagePath}
                alt={displaySkillName(skill)}
                class="w-full h-full object-cover aspect-square"
              />
            {:else}
              <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                {t("notConfigured", "未配置")}
              </div>
            {/if}
            <div
              class="absolute inset-0 bg-black/42 px-2 py-1.5 text-center text-[9px] leading-tight font-bold text-white flex items-center justify-center"
            >
              <span
                class="whitespace-normal break-words"
                style="display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;text-shadow:-1px -1px 0 rgba(0,0,0,0.95), 1px -1px 0 rgba(0,0,0,0.95), -1px 1px 0 rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85);"
              >
                {displaySkillName(skill)}
              </span>
            </div>
          </button>
          {#if activeSkillTooltip?.key === tooltipKey}
            <div
              bind:this={tooltipElement}
              class="pointer-events-none fixed z-[1000] overflow-y-auto whitespace-pre-line rounded-sm border border-white/80 bg-[#222] px-2 py-1.5 text-left text-xs leading-snug text-white shadow-2xl"
              style={skillTooltipStyle()}
            >
              {tooltipTitle}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("durationSkills", "持续时间技能")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("durationSkillsDescription", "选中的技能会在 overlay 中按单独图标显示，并在技能触发后开始前端倒计时")}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          {t("selectedCount", "已选")} {monitoredSkillDurationIds.length}
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearSkillDurations}
        >
          {t("clear", "清空")}
        </button>
      </div>
    </div>

    {#if durationSkills.length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
        {#each durationSkills as skill (skill.skillId)}
          {@const tooltipKey = `duration-${selectedClassKey}-${skill.skillId}`}
          {@const tooltipTitle = skillHoverTitle(skill, formatEffectDuration(skill.effectDurationMs))}
          <div class="relative">
            <button
              type="button"
              class="relative min-h-[78px] w-full cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isDurationSelected(skill.skillId)
                ? 'border-primary ring-1 ring-primary'
                : 'border-border/60 hover:border-border'}"
              aria-label={displaySkillName(skill)}
              onmouseenter={(event) => showSkillTooltip(tooltipKey, "bottom", event.currentTarget as HTMLElement)}
              onmouseleave={() => hideSkillTooltip(tooltipKey)}
              onfocus={(event) => showSkillTooltip(tooltipKey, "bottom", event.currentTarget as HTMLElement)}
              onblur={() => hideSkillTooltip(tooltipKey)}
              onclick={() => toggleSkillDuration(skill.skillId)}
            >
              {#if skill.imagePath}
                <img
                  src={skill.imagePath}
                  alt={displaySkillName(skill)}
                  class="w-full h-full object-cover aspect-square"
                />
              {:else}
                <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                  {t("notConfigured", "未配置")}
                </div>
              {/if}

              <div class="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {formatEffectDuration(skill.effectDurationMs)}
              </div>
              <div
                class="absolute inset-x-0 bottom-0 bg-black/55 text-[10px] leading-tight text-white/90 px-1 py-0.5 text-center whitespace-nowrap overflow-hidden text-ellipsis"
              >
                {displaySkillName(skill)}
              </div>
            </button>
            {#if activeSkillTooltip?.key === tooltipKey}
              <div
                bind:this={tooltipElement}
                class="pointer-events-none fixed z-[1000] overflow-y-auto whitespace-pre-line rounded-sm border border-white/80 bg-[#222] px-2 py-1.5 text-left text-xs leading-snug text-white shadow-2xl"
                style={skillTooltipStyle()}
              >
                {tooltipTitle}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
        {t("noDurationSkillsConfigured", "当前职业还没有配置持续时间技能")}
      </div>
    {/if}
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("resonanceSkills", "共鸣技能")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("resonanceSkillsDescription", "通过搜索选择共鸣技能，与普通技能共享 10 个监控格")}
        </p>
      </div>
      <div class="text-xs text-muted-foreground">
        {t("selectedCount", "已选")} {selectedResonanceSkills.length}
      </div>
    </div>

    <input
      class="w-full sm:w-64 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder={t("searchResonanceSkills", "搜索共鸣技能名称")}
      value={resonanceSearch}
      oninput={(event) => setResonanceSearch((event.currentTarget as HTMLInputElement).value)}
    />

    {#if resonanceSearch.trim().length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
        {#each filteredResonanceSkills as skill (skill.skillId)}
          {@const tooltipKey = `resonance-search-${skill.skillId}`}
          {@const tooltipTitle = resonanceSkillHoverTitle(skill)}
          <div class="relative">
            <button
              type="button"
              class="relative min-h-[78px] w-full cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isSelected(skill.skillId)
                ? 'border-primary ring-1 ring-primary'
                : 'border-border/60 hover:border-border'}"
              aria-label={displaySkillName(skill)}
              onmouseenter={(event) => showSkillTooltip(tooltipKey, "bottom", event.currentTarget as HTMLElement)}
              onmouseleave={() => hideSkillTooltip(tooltipKey)}
              onfocus={(event) => showSkillTooltip(tooltipKey, "bottom", event.currentTarget as HTMLElement)}
              onblur={() => hideSkillTooltip(tooltipKey)}
              onclick={() => toggleSkill(skill.skillId)}
            >
              <img
                src={skill.imagePath}
                alt={displaySkillName(skill)}
                class="w-full h-full object-contain aspect-square bg-muted/20"
              />
              <div
                class="absolute inset-x-0 bottom-0 bg-black/60 text-[10px] leading-tight text-white px-1 py-1 text-center whitespace-normal break-words min-h-[2.45rem] flex items-end justify-center"
                style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;"
              >
                {skill.name}
              </div>
            </button>
            {#if activeSkillTooltip?.key === tooltipKey}
              <div
                bind:this={tooltipElement}
                class="pointer-events-none fixed z-[1000] overflow-y-auto whitespace-pre-line rounded-sm border border-white/80 bg-[#222] px-2 py-1.5 text-left text-xs leading-snug text-white shadow-2xl"
                style={skillTooltipStyle()}
              >
                {tooltipTitle}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="text-xs text-muted-foreground">{t("searchResonancePrompt", "请输入关键词搜索共鸣技能")}</div>
    {/if}

    <div class="space-y-2">
      <div class="text-xs text-muted-foreground">{t("selectedResonanceSkills", "已选共鸣技能")}</div>
      <div class="flex flex-wrap gap-2">
        {#each selectedResonanceSkills as skill (skill.skillId)}
          {@const tooltipKey = `resonance-selected-${skill.skillId}`}
          {@const tooltipTitle = resonanceSkillHoverTitle(skill)}
          <div class="relative h-[78px] w-[72px]">
            <button
              type="button"
              class="relative h-full w-full cursor-pointer rounded-md border border-border/60 overflow-hidden bg-muted/20 hover:border-border hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={displaySkillName(skill)}
              onmouseenter={(event) => showSkillTooltip(tooltipKey, "bottom", event.currentTarget as HTMLElement)}
              onmouseleave={() => hideSkillTooltip(tooltipKey)}
              onfocus={(event) => showSkillTooltip(tooltipKey, "bottom", event.currentTarget as HTMLElement)}
              onblur={() => hideSkillTooltip(tooltipKey)}
              onclick={() => toggleSkill(skill.skillId)}
            >
              <img
                src={skill.imagePath}
                alt={displaySkillName(skill)}
                class="w-full h-full object-contain"
              />
              <div
                class="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] leading-tight text-white px-1 py-1 text-center whitespace-normal break-words min-h-[2.35rem] flex items-end justify-center"
                style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;"
              >
                {skill.name}
              </div>
            </button>
            {#if activeSkillTooltip?.key === tooltipKey}
              <div
                bind:this={tooltipElement}
                class="pointer-events-none fixed z-[1000] overflow-y-auto whitespace-pre-line rounded-sm border border-white/80 bg-[#222] px-2 py-1.5 text-left text-xs leading-snug text-white shadow-2xl"
                style={skillTooltipStyle()}
              >
                {tooltipTitle}
              </div>
            {/if}
          </div>
        {/each}
        {#if selectedResonanceSkills.length === 0}
          <div class="text-xs text-muted-foreground">{t("noResonanceSkillsSelected", "未选择共鸣技能")}</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("monitorPreview", "监控预览")}</h2>
      <p class="text-xs text-muted-foreground">{t("monitorPreviewDescription", "按选择顺序排列")}</p>
    </div>
    <div class="grid grid-cols-5 gap-2">
      {#each Array(10) as _, idx (idx)}
        {@const skillId = monitoredSkillIds[idx]}
        {@const skill = skillId ? findAnySkillByBaseId(selectedClassKey, skillId) : undefined}
        <button
          type="button"
          class="relative rounded-md border border-border/60 overflow-hidden bg-muted/20 aspect-square text-left {skillId
            ? 'hover:border-border hover:bg-muted/30'
            : ''}"
          onclick={() => {
            if (skillId) toggleSkill(skillId);
          }}
        >
          {#if skill?.imagePath}
            <img
              src={skill.imagePath}
              alt={displaySkillName(skill)}
              class="w-full h-full object-cover"
            />
          {:else if skillId}
            <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
              #{skillId}
            </div>
          {:else}
            <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
              {t("empty", "空")}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>
