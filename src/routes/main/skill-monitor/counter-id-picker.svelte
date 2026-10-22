<script lang="ts">
  /**
   * @file Id field of the counter editor: the chosen ids as removable tags
   * plus an on-demand search panel. Buffs, damages and skills are searched
   * by name; any domain also takes a typed id (Enter), since the name tables
   * do not cover every id the game uses.
   */
  import PlusIcon from "virtual:icons/lucide/plus";
  import XIcon from "virtual:icons/lucide/x";
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import IdSearchResultGrid, {
    type IdSearchResultItem,
  } from "$lib/components/IdSearchResultGrid.svelte";
  import { searchBuffsByName } from "$lib/config/buff-name-table";
  import { searchDamageIds } from "$lib/config/damage-id-search";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import { getSkillBuffDisplayAliases } from "$lib/settings-store";
  import { getSkillsByClass, searchResonanceSkills } from "$lib/skill-mappings";
  import { isCounterId, type CounterIdDomain } from "$lib/user-counter-rules";
  import {
    classGaugeResources,
    counterIdName,
    getCounterEditorContext,
  } from "./counter-editor-context";

  interface Props {
    domain: CounterIdDomain | null;
    ids: number[];
    multiple: boolean;
    onchange: (ids: number[]) => void;
    invalid?: boolean;
    /** Validation path, for focusing the first invalid field. */
    path?: string | undefined;
  }

  let {
    domain,
    ids,
    multiple,
    onchange,
    invalid = false,
    path,
  }: Props = $props();

  const context = getCounterEditorContext();

  let open = $state(false);
  let search = $state("");

  const typedId = $derived.by(() => {
    const value = Number(search.trim().replace(/^#/, ""));
    return search.trim() && isCounterId(value, domain) ? value : null;
  });

  const buffResults = $derived(
    domain === "buff" && search.trim()
      ? searchBuffsByName(search, getSkillBuffDisplayAliases()).filter(
          // Composite buffs (negative ids) never reach the counter engine.
          (item) => item.baseId > 0,
        )
      : [],
  );
  const damageResults = $derived(
    domain === "damage" ? searchDamageIds(search, getLocale()) : [],
  );
  const resonanceResults = $derived(
    domain === "skill" ? searchResonanceSkills(search) : [],
  );
  const classSkills = $derived(
    domain === "skill" ? getSkillsByClass(context.classKey) : [],
  );
  const classResources = $derived(
    domain === "resource" ? classGaugeResources(context.classKey) : [],
  );

  const listItems = $derived.by<IdSearchResultItem[]>(() => {
    if (domain === "damage") {
      return damageResults.map((entry) => ({
        key: entry.key,
        name: entry.isGroup
          ? t("skillMonitor.customPanel.counterEditor.picker.groupName", {
              name: entry.name,
              count: entry.ids.length,
            })
          : entry.name,
        detail: entry.isGroup
          ? t("skillMonitor.customPanel.counterEditor.picker.group")
          : `#${entry.ids[0]}`,
      }));
    }
    if (domain === "skill") {
      const items = resonanceResults.map((skill) => ({
        key: String(skill.skillId),
        name: skill.name,
        detail: `#${skill.skillId}`,
      }));
      if (
        typedId !== null &&
        !items.some((item) => item.key === String(typedId))
      ) {
        items.unshift({
          key: String(typedId),
          name: counterIdName(context, domain, typedId) ?? `#${typedId}`,
          detail: `#${typedId}`,
        });
      }
      return items;
    }
    return [];
  });

  function idsForKey(key: string): number[] {
    if (domain === "damage") {
      return damageResults.find((entry) => entry.key === key)?.ids ?? [];
    }
    return [Number(key)];
  }

  function label(id: number): string {
    return counterIdName(context, domain, id) ?? `#${id}`;
  }

  function add(added: number[]) {
    if (added.length === 0) return;
    if (!multiple) {
      onchange([added[0] as number]);
      close();
      return;
    }
    onchange([...ids, ...added.filter((id) => !ids.includes(id))]);
  }

  function remove(id: number) {
    onchange(ids.filter((item) => item !== id));
  }

  function toggle(id: number) {
    if (ids.includes(id)) remove(id);
    else add([id]);
  }

  function close() {
    open = false;
    search = "";
  }

  function onSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.isComposing && typedId !== null) {
      event.preventDefault();
      add([typedId]);
      search = "";
    } else if (event.key === "Escape") {
      close();
    }
  }

  const placeholder = $derived(
    t(
      domain === "buff"
        ? "skillMonitor.customPanel.counterEditor.picker.searchBuff"
        : domain === "damage"
          ? "skillMonitor.customPanel.counterEditor.picker.searchDamage"
          : domain === "skill"
            ? "skillMonitor.customPanel.counterEditor.picker.searchSkill"
            : "skillMonitor.customPanel.counterEditor.picker.enterId",
    ),
  );
</script>

<div class="space-y-2">
  <div
    class="flex min-h-9 flex-wrap items-center gap-1.5 rounded border px-1.5 py-1 {invalid
      ? 'border-destructive/70'
      : 'border-border/60'}"
    data-path={path}
  >
    {#each ids as id, index (`${index}:${id}`)}
      <span
        class="border-primary/40 bg-primary/10 text-foreground inline-flex max-w-56 items-center gap-1 rounded border py-0.5 pr-0.5 pl-2 text-xs"
        title={`#${id}`}
      >
        <span class="truncate">{label(id)}</span>
        <button
          type="button"
          class="text-muted-foreground hover:text-destructive rounded p-0.5"
          aria-label={t("skillMonitor.customPanel.counterEditor.picker.remove")}
          onclick={() => remove(id)}
        >
          <XIcon class="h-3 w-3" />
        </button>
      </span>
    {/each}
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors"
      aria-expanded={open}
      onclick={() => (open ? close() : (open = true))}
    >
      {#if multiple || ids.length === 0}
        <PlusIcon class="h-3 w-3" />
        {t("skillMonitor.customPanel.counterEditor.picker.add")}
      {:else}
        {t("skillMonitor.customPanel.counterEditor.picker.replace")}
      {/if}
    </button>
  </div>

  {#if open}
    <div class="border-border/60 bg-muted/10 space-y-3 rounded-lg border p-3">
      <input
        class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none sm:w-80"
        {placeholder}
        value={search}
        oninput={(event) =>
          (search = (event.currentTarget as HTMLInputElement).value)}
        onkeydown={onSearchKeydown}
      />

      {#if classSkills.length > 0}
        <div class="space-y-1.5">
          <div class="text-muted-foreground text-xs">
            {t("skillMonitor.customPanel.counterEditor.picker.classSkills")}
          </div>
          <div
            class="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2"
          >
            {#each classSkills as skill (skill.skillId)}
              {@const selected = ids.includes(skill.skillId)}
              <button
                type="button"
                class="relative overflow-hidden rounded-lg border transition-colors {selected
                  ? 'border-primary ring-primary ring-1'
                  : 'border-border/60 hover:border-border'}"
                title={`${skill.name} #${skill.skillId}`}
                aria-pressed={selected}
                onclick={() => toggle(skill.skillId)}
              >
                {#if skill.imagePath}
                  <img
                    src={skill.imagePath}
                    alt={skill.name}
                    class="aspect-square h-full w-full object-cover"
                  />
                {:else}
                  <div
                    class="bg-muted/30 text-muted-foreground flex aspect-square items-center justify-center text-[10px]"
                  >
                    #{skill.skillId}
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if classResources.length > 0}
        <div class="flex flex-wrap gap-2">
          {#each classResources as resource (resource.currentId)}
            {@const selected = ids.includes(resource.currentId)}
            <button
              type="button"
              class="rounded border px-2.5 py-1 text-xs transition-colors {selected
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground'}"
              onclick={() => toggle(resource.currentId)}
            >
              {resource.label} #{resource.currentId}
            </button>
          {/each}
        </div>
      {/if}

      {#if search.trim()}
        {#if domain === "buff"}
          <BuffSearchResultGrid
            items={buffResults}
            availableBuffMap={context.availableBuffMap}
            onSelect={(buffId) => add([buffId])}
            isSelected={(buffId) => ids.includes(buffId)}
            getIconSrc={context.getBuffIconPreviewSrc}
            emptyMessage={t(
              "skillMonitor.customPanel.counterEditor.picker.noMatch",
            )}
          />
        {:else if domain === "damage" || domain === "skill"}
          <IdSearchResultGrid
            items={listItems}
            onSelect={(key) => add(idsForKey(key))}
            isAdded={(key) => idsForKey(key).every((id) => ids.includes(id))}
            addedLabel={t("monsterMonitor.monsterSkill.added")}
            emptyMessage={t(
              "skillMonitor.customPanel.counterEditor.picker.noMatch",
            )}
          />
        {:else if typedId !== null}
          <p class="text-muted-foreground text-xs">
            {t("skillMonitor.customPanel.counterEditor.picker.pressEnter", {
              name: label(typedId),
            })}
          </p>
        {/if}
      {/if}

      <div class="flex justify-end">
        <button
          type="button"
          class="border-border/60 hover:bg-muted/40 min-h-8 rounded border px-3 py-1 text-xs transition-colors"
          onclick={close}
        >
          {t("skillMonitor.customPanel.counterEditor.picker.done")}
        </button>
      </div>
    </div>
  {/if}
</div>
