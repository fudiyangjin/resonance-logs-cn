<script lang="ts">
  import IdSearchResultGrid, {
    type IdSearchResultItem,
  } from "$lib/components/IdSearchResultGrid.svelte";
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import { SvelteSet } from "svelte/reactivity";
  import MonsterSkillSearchGrid from "$lib/components/MonsterSkillSearchGrid.svelte";
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import type { RecentRosterMonster } from "$lib/bindings";
  import { resolveMonsterName } from "$lib/config/game-names";
  import {
    lookupMonsterSkillDefaultName,
    searchMonsterSkills,
  } from "$lib/config/monster-skill-search";
  import {
    monsterSkillIdsOf,
    monsterSkillTiming,
  } from "$lib/config/monster-skill-timing";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import {
    MAX_ROSTER_SKILL_ENTRIES,
    type RosterSkillEntryPatch,
  } from "$lib/roster-skill-entries";
  import type { RosterSkillEntry } from "$lib/settings-store";
  import { blurOnEnter } from "$lib/utils.svelte";

  interface Props {
    entries: RosterSkillEntry[];
    recent: RecentRosterMonster[];
    /** Re-reads the recent monsters (shared with the block section). */
    onRefresh: () => void;
    onAdd: (skillId: number) => void;
    onUpdate: (skillId: number, patch: RosterSkillEntryPatch) => void;
    onMove: (skillId: number, direction: "up" | "down") => void;
    onRemove: (skillId: number) => void;
  }

  let { entries, recent, onRefresh, onAdd, onUpdate, onMove, onRemove }: Props =
    $props();

  let expandedMonsterId = $state<number | null>(null);
  let searchKeyword = $state("");
  /** Entries whose voice section is open. */
  const voiceExpandedIds = new SvelteSet<number>();

  function toggleVoice(skillId: number) {
    if (!voiceExpandedIds.delete(skillId)) voiceExpandedIds.add(skillId);
  }

  const watchedIds = $derived(new Set(entries.map((entry) => entry.skillId)));
  const full = $derived(entries.length >= MAX_ROSTER_SKILL_ENTRIES);

  function skillName(skillId: number): string {
    return lookupMonsterSkillDefaultName(skillId, getLocale()) ?? `#${skillId}`;
  }

  function timingSummary(skillId: number): string {
    const timing = monsterSkillTiming(skillId);
    const parts: string[] = [];
    if (timing.cooldownSeconds > 0) {
      parts.push(
        t("monsterMonitor.roster.skills.cooldown", {
          seconds: timing.cooldownSeconds,
        }),
      );
    }
    if (timing.battleStart === "never") {
      parts.push(t("monsterMonitor.roster.skills.battleStartNever"));
    } else if (timing.battleStart) {
      parts.push(
        t("monsterMonitor.roster.skills.battleStart", {
          from: timing.battleStart[0],
          to: timing.battleStart[1],
        }),
      );
    }
    if (timing.singSeconds > 0) {
      parts.push(
        t("monsterMonitor.roster.skills.sing", {
          seconds: timing.singSeconds,
        }),
      );
    }
    if (timing.danger) parts.push(t("monsterMonitor.roster.skills.danger"));
    return parts.length > 0
      ? parts.join(" · ")
      : t("monsterMonitor.roster.skills.noTiming");
  }

  const recentItems = $derived(
    recent.map(
      (monster): IdSearchResultItem => ({
        key: String(monster.monsterId),
        name: resolveMonsterName(monster.monsterId),
        detail: `#${monster.monsterId}`,
      }),
    ),
  );

  /** Table skills plus the ones seen cast this run (AI-scripted skills). */
  const expandedSkillIds = $derived.by(() => {
    if (expandedMonsterId === null) return [];
    const seen =
      recent.find((monster) => monster.monsterId === expandedMonsterId)
        ?.skillIds ?? [];
    return Array.from(
      new Set([...monsterSkillIdsOf(expandedMonsterId), ...seen]),
    ).sort((a, b) => a - b);
  });

  const searchResults = $derived(
    searchMonsterSkills(searchKeyword, {}, getLocale()),
  );

  function cooldownText(entry: RosterSkillEntry): string {
    return entry.cooldownSeconds === undefined
      ? ""
      : String(entry.cooldownSeconds);
  }

  function commitCooldown(entry: RosterSkillEntry, input: HTMLInputElement) {
    const text = input.value.trim();
    if (text === "") {
      onUpdate(entry.skillId, { cooldownSeconds: null });
    } else {
      const seconds = Number(text);
      if (Number.isFinite(seconds) && seconds > 0) {
        onUpdate(entry.skillId, { cooldownSeconds: seconds });
      }
    }
    // Show the stored (clamped) value, also after rejected input.
    input.value = cooldownText(entry);
  }

  const inputClass =
    "border-border bg-background focus:border-primary rounded-lg border px-3 py-2 text-sm outline-none";
</script>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <div class="space-y-1">
    <h2 class="text-foreground text-base font-semibold">
      {t("monsterMonitor.roster.skills.title")}
    </h2>
    <p class="text-muted-foreground text-sm">
      {t("monsterMonitor.roster.skills.description")}
    </p>
    <ul class="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs">
      <li>{t("monsterMonitor.roster.skills.caveatReady")}</li>
      <li>{t("monsterMonitor.roster.skills.caveatScripted")}</li>
      <li>{t("monsterMonitor.roster.skills.caveatInterrupt")}</li>
    </ul>
  </div>

  <div class="space-y-2">
    <h3 class="text-foreground text-sm font-semibold">
      {t("monsterMonitor.roster.skills.listTitle")}
    </h3>
    {#if entries.length === 0}
      <p class="text-muted-foreground text-sm">
        {t("monsterMonitor.roster.skills.empty")}
      </p>
    {:else}
      <div class="space-y-2">
        {#each entries as entry, index (entry.skillId)}
          <div class="skill-row">
            <div class="min-w-0 flex-1">
              <div class="text-foreground truncate text-sm">
                {skillName(entry.skillId)}
                <span class="text-muted-foreground text-xs"
                  >#{entry.skillId}</span
                >
              </div>
              <div class="text-muted-foreground truncate text-xs">
                {timingSummary(entry.skillId)}
              </div>
            </div>
            <input
              type="text"
              class="{inputClass} w-24"
              value={entry.label}
              placeholder={t("monsterMonitor.roster.skills.label")}
              {@attach blurOnEnter}
              onchange={(event) =>
                onUpdate(entry.skillId, { label: event.currentTarget.value })}
            />
            <label
              class="text-muted-foreground flex shrink-0 items-center gap-2 text-xs"
              title={t("monsterMonitor.roster.skills.cooldownHint")}
            >
              {t("monsterMonitor.roster.skills.customCooldown")}
              <input
                type="text"
                inputmode="decimal"
                class="{inputClass} w-20"
                value={cooldownText(entry)}
                placeholder={t("monsterMonitor.roster.skills.tableCooldown")}
                {@attach blurOnEnter}
                onchange={(event) => commitCooldown(entry, event.currentTarget)}
              />
            </label>
            <button
              type="button"
              class="order-button"
              disabled={index === 0}
              onclick={() => onMove(entry.skillId, "up")}
            >
              {t("monsterMonitor.priority.moveUp")}
            </button>
            <button
              type="button"
              class="order-button"
              disabled={index === entries.length - 1}
              onclick={() => onMove(entry.skillId, "down")}
            >
              {t("monsterMonitor.priority.moveDown")}
            </button>
            <button
              type="button"
              class="order-button danger"
              onclick={() => onRemove(entry.skillId)}
            >
              {t("monsterMonitor.priority.remove")}
            </button>
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground flex basis-full items-center justify-between gap-2 px-1 text-xs"
              onclick={() => toggleVoice(entry.skillId)}
            >
              <span>{t("monsterMonitor.roster.skills.voiceTitle")}</span>
              <ChevronDownIcon
                class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 {voiceExpandedIds.has(
                  entry.skillId,
                )
                  ? 'rotate-180'
                  : ''}"
              />
            </button>
            {#if voiceExpandedIds.has(entry.skillId)}
              <div class="basis-full space-y-1">
                <p class="text-muted-foreground px-1 text-xs">
                  {t("monsterMonitor.roster.skills.voiceHint")}
                </p>
                <VoiceBindingControl
                  subject={{ kind: "rosterSkill", skillId: entry.skillId }}
                />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-foreground text-sm font-semibold">
        {t("monsterMonitor.roster.skills.fromRecent")}
      </h3>
      <button type="button" class="order-button" onclick={onRefresh}>
        {t("monsterMonitor.roster.refresh")}
      </button>
    </div>
    <p class="text-muted-foreground text-xs">
      {t("monsterMonitor.roster.skills.fromRecentHint")}
    </p>
    <IdSearchResultGrid
      items={recentItems}
      onSelect={(key) => (expandedMonsterId = Number(key))}
      isAdded={(key) => Number(key) === expandedMonsterId}
      addedLabel={t("monsterMonitor.roster.skills.expanded")}
      emptyMessage={t("monsterMonitor.roster.recentEmpty")}
    />
    {#if expandedMonsterId !== null}
      <div class="expanded-skills">
        <div class="text-foreground text-sm font-semibold">
          {resolveMonsterName(expandedMonsterId)}
        </div>
        {#if expandedSkillIds.length === 0}
          <p class="text-muted-foreground text-sm">
            {t("monsterMonitor.roster.skills.monsterNoSkills")}
          </p>
        {:else}
          {#each expandedSkillIds as skillId (skillId)}
            <label class="expanded-skill">
              <input
                type="checkbox"
                checked={watchedIds.has(skillId)}
                disabled={!watchedIds.has(skillId) && full}
                onchange={(event) =>
                  event.currentTarget.checked
                    ? onAdd(skillId)
                    : onRemove(skillId)}
              />
              <span class="text-foreground min-w-0 truncate">
                {skillName(skillId)}
                <span class="text-muted-foreground text-xs">#{skillId}</span>
              </span>
              <span class="text-muted-foreground ml-auto shrink-0 text-xs">
                {timingSummary(skillId)}
              </span>
            </label>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="space-y-2">
    <h3 class="text-foreground text-sm font-semibold">
      {t("monsterMonitor.roster.skills.searchTitle")}
    </h3>
    <input
      type="text"
      bind:value={searchKeyword}
      placeholder={t("monsterMonitor.monsterSkill.searchPlaceholder")}
      class="{inputClass} w-full py-2.5"
    />
    {#if searchKeyword.trim().length > 0}
      <MonsterSkillSearchGrid
        items={searchResults}
        onSelect={onAdd}
        isAdded={(skillId) => watchedIds.has(skillId) || full}
        emptyMessage={t("monsterMonitor.monsterSkill.emptySearch")}
      />
    {/if}
  </div>
</section>

<style>
  .skill-row,
  .expanded-skill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.28);
  }

  .skill-row {
    flex-wrap: wrap;
  }

  .expanded-skills {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
  }

  .expanded-skill {
    padding: 6px 8px;
    font-size: 13px;
    cursor: pointer;
  }

  .order-button {
    flex: 0 0 auto;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 4px 8px;
    color: var(--foreground, #fff);
    font-size: 12px;
  }

  .order-button:hover:not(:disabled) {
    border-color: rgba(96, 165, 250, 0.65);
    background: rgba(30, 41, 59, 0.55);
  }

  .order-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .order-button.danger {
    color: var(--destructive, #f87171);
  }
</style>
