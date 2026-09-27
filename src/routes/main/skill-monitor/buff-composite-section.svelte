<script lang="ts">
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import {
    allocateBuffCompositeId,
    collectProfileBuffIds,
    ensureBuffComposites,
    isBuffCompositeId,
    MAX_BUFF_COMPOSITE_MEMBERS,
    MAX_BUFF_COMPOSITES,
    pruneUnknownCompositeRefs,
    type BuffComposite,
  } from "$lib/buff-composites";
  import {
    searchBuffsByName,
    type BuffDefinition,
  } from "$lib/config/buff-name-table";
  import { t } from "$lib/i18n/index.svelte";
  import { getSkillBuffDisplayAliases, SETTINGS } from "$lib/settings-store";

  interface Props {
    availableBuffMap: Map<number, BuffDefinition>;
    getBuffDisplayName: (buffId: number) => string;
    getBuffIconPreviewSrc: (buffId: number) => string | null;
  }

  let { availableBuffMap, getBuffDisplayName, getBuffIconPreviewSrc }: Props =
    $props();

  type Draft = {
    /** `null` while creating. */
    id: number | null;
    name: string;
    memberIds: number[];
    /** Below the member count; `undefined` requires every member. */
    minActive: number | undefined;
    iconBuffId: number | undefined;
  };

  let expanded = $state(false);
  let draft = $state<Draft | null>(null);
  let memberSearch = $state("");
  let pendingDelete = $state<BuffComposite | null>(null);
  let confirmOpen = $state(false);

  const composites = $derived(
    ensureBuffComposites(SETTINGS.skillMonitor.state.buffComposites),
  );
  const memberSearchResults = $derived(
    searchBuffsByName(memberSearch, getSkillBuffDisplayAliases()),
  );
  /** The composite ids each profile references. */
  const profileCompositeRefs = $derived(
    SETTINGS.skillMonitor.state.profiles.map((profile) =>
      [...collectProfileBuffIds(profile)].filter(isBuffCompositeId),
    ),
  );
  const canSave = $derived(
    draft !== null &&
      draft.name.trim().length > 0 &&
      draft.memberIds.length >= 2,
  );
  /** Members with a game sprite the composite can show as its icon. */
  const iconCandidateIds = $derived(
    draft?.memberIds.filter((memberId) => availableBuffMap.has(memberId)) ?? [],
  );

  /** Thresholds below "every member" the draft can pick. */
  const thresholdOptions = $derived(
    Array.from(
      { length: Math.max(0, (draft?.memberIds.length ?? 0) - 1) },
      (_, index) => index + 1,
    ),
  );

  function conditionLabel(memberCount: number, minActive?: number): string {
    return minActive === undefined || minActive >= memberCount
      ? t("skillMonitor.buff.composite.conditionAll", { count: memberCount })
      : t("skillMonitor.buff.composite.conditionAtLeast", {
          count: minActive,
          total: memberCount,
        });
  }

  function referenceCount(compositeId: number): number {
    return profileCompositeRefs.filter((ids) => ids.includes(compositeId))
      .length;
  }

  function startCreate() {
    draft = {
      id: null,
      name: "",
      memberIds: [],
      minActive: undefined,
      iconBuffId: undefined,
    };
    memberSearch = "";
  }

  function startEdit(composite: BuffComposite) {
    draft = {
      id: composite.id,
      name: composite.name,
      memberIds: [...composite.memberIds],
      minActive: composite.minActive,
      iconBuffId: composite.iconBuffId,
    };
    memberSearch = "";
  }

  function closeDraft() {
    draft = null;
    memberSearch = "";
  }

  function toggleMember(buffId: number) {
    if (!draft) return;
    if (draft.memberIds.includes(buffId)) {
      draft.memberIds = draft.memberIds.filter((id) => id !== buffId);
      if (draft.iconBuffId === buffId) draft.iconBuffId = undefined;
      if (
        draft.minActive !== undefined &&
        draft.minActive >= draft.memberIds.length
      ) {
        draft.minActive = undefined;
      }
      return;
    }
    if (draft.memberIds.length >= MAX_BUFF_COMPOSITE_MEMBERS) return;
    draft.memberIds = [...draft.memberIds, buffId];
  }

  function saveDraft() {
    if (!draft || !canSave) return;
    const editingId = draft.id;
    const saved: BuffComposite = {
      id: editingId ?? allocateBuffCompositeId(composites),
      name: draft.name.trim(),
      memberIds: [...draft.memberIds],
      ...(draft.minActive !== undefined &&
      draft.minActive < draft.memberIds.length
        ? { minActive: draft.minActive }
        : {}),
      ...(draft.iconBuffId !== undefined
        ? { iconBuffId: draft.iconBuffId }
        : {}),
    };
    SETTINGS.skillMonitor.state.buffComposites =
      editingId === null
        ? [...composites, saved]
        : composites.map((composite) =>
            composite.id === editingId ? saved : composite,
          );
    closeDraft();
  }

  function requestDelete(composite: BuffComposite) {
    pendingDelete = composite;
    confirmOpen = true;
  }

  /** Removes the composite and every profile reference to it. */
  function confirmDelete() {
    // Kept until the next request so the closing dialog keeps its text.
    const target = pendingDelete;
    if (!target) return;
    const remaining = composites.filter(
      (composite) => composite.id !== target.id,
    );
    const remainingIds = new Set(remaining.map((composite) => composite.id));
    SETTINGS.skillMonitor.state.buffComposites = remaining;
    SETTINGS.skillMonitor.state.profiles =
      SETTINGS.skillMonitor.state.profiles.map((profile) =>
        pruneUnknownCompositeRefs(profile, remainingIds),
      );
    if (draft?.id === target.id) closeDraft();
  }
</script>

<ConfirmDialog
  bind:open={confirmOpen}
  title={t("skillMonitor.buff.composite.deleteTitle", {
    name: pendingDelete?.name ?? "",
  })}
  description={t("skillMonitor.buff.composite.deleteDescription", {
    count: pendingDelete ? referenceCount(pendingDelete.id) : 0,
  })}
  confirmText={t("common.delete")}
  cancelText={t("common.cancel")}
  onconfirm={confirmDelete}
  oncancel={() => (pendingDelete = null)}
  variant="destructive"
/>

<div
  class="border-border/60 bg-card/40 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
>
  <button
    type="button"
    class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
    onclick={() => (expanded = !expanded)}
  >
    <div class="text-left">
      <h2 class="text-foreground text-base font-semibold">
        {t("skillMonitor.buff.composite.title")}
      </h2>
      <p class="text-muted-foreground mt-1 text-xs">
        {t("skillMonitor.buff.composite.description")}
      </p>
    </div>
    <ChevronDown
      class="text-muted-foreground h-5 w-5 shrink-0 transition-transform duration-200 {expanded
        ? 'rotate-180'
        : ''}"
    />
  </button>

  {#if expanded}
    <div class="space-y-3 px-4 pb-4">
      {#if composites.length === 0 && !draft}
        <div
          class="border-border/60 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm"
        >
          {t("skillMonitor.buff.composite.empty")}
        </div>
      {/if}

      {#each composites as composite (composite.id)}
        <div
          class="border-border/60 bg-muted/20 flex items-start justify-between gap-3 rounded-lg border p-3"
        >
          <div class="min-w-0 space-y-1">
            <div class="text-foreground text-sm font-medium break-words">
              {composite.name}
            </div>
            <div class="text-muted-foreground text-xs break-words">
              {composite.memberIds.map(getBuffDisplayName).join(" + ")}
            </div>
            <div class="text-muted-foreground text-xs">
              {conditionLabel(composite.memberIds.length, composite.minActive)}
            </div>
            <div class="text-muted-foreground text-xs">
              {t("skillMonitor.buff.composite.references", {
                count: referenceCount(composite.id),
              })}
            </div>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 min-h-9 rounded border px-3 py-1 text-xs transition-colors"
              onclick={() => startEdit(composite)}
            >
              {t("skillMonitor.buff.composite.edit")}
            </button>
            <button
              type="button"
              class="border-border/60 text-destructive hover:bg-destructive/10 min-h-9 rounded border px-3 py-1 text-xs transition-colors"
              onclick={() => requestDelete(composite)}
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
      {/each}

      {#if draft}
        <div
          class="border-primary/40 bg-primary/5 space-y-3 rounded-lg border p-3"
        >
          <input
            class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-80"
            placeholder={t("skillMonitor.buff.composite.namePlaceholder")}
            value={draft.name}
            oninput={(event) => {
              if (draft) {
                draft.name = (event.currentTarget as HTMLInputElement).value;
              }
            }}
          />

          <div class="space-y-2">
            <div class="text-muted-foreground text-xs">
              {t("skillMonitor.buff.composite.members", {
                count: draft.memberIds.length,
                max: MAX_BUFF_COMPOSITE_MEMBERS,
              })}
            </div>
            {#if draft.memberIds.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each draft.memberIds as memberId (memberId)}
                  <button
                    type="button"
                    class="border-primary/40 bg-primary/10 text-foreground hover:bg-destructive/10 rounded border px-2 py-1 text-xs transition-colors"
                    title={t("skillMonitor.buff.composite.removeMember")}
                    onclick={() => toggleMember(memberId)}
                  >
                    {getBuffDisplayName(memberId)} ×
                  </button>
                {/each}
              </div>
            {/if}
            <input
              class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-80"
              placeholder={t("skillMonitor.buff.composite.memberPlaceholder")}
              value={memberSearch}
              oninput={(event) =>
                (memberSearch = (event.currentTarget as HTMLInputElement)
                  .value)}
            />
            {#if memberSearch.trim().length > 0}
              <BuffSearchResultGrid
                items={memberSearchResults}
                {availableBuffMap}
                onSelect={toggleMember}
                isSelected={(buffId) =>
                  draft?.memberIds.includes(buffId) ?? false}
                getIconSrc={getBuffIconPreviewSrc}
              />
            {/if}
          </div>

          {#if draft.memberIds.length >= 2}
            <label
              class="text-muted-foreground flex items-center gap-2 text-xs"
            >
              <span>{t("skillMonitor.buff.composite.condition")}</span>
              <select
                class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-xs"
                value={draft.minActive === undefined
                  ? ""
                  : String(draft.minActive)}
                onchange={(event) => {
                  if (!draft) return;
                  const value = (event.currentTarget as HTMLSelectElement)
                    .value;
                  draft.minActive = value ? Number(value) : undefined;
                }}
              >
                <option value="">
                  {conditionLabel(draft.memberIds.length)}
                </option>
                {#each thresholdOptions as minActive (minActive)}
                  <option value={String(minActive)}>
                    {conditionLabel(draft.memberIds.length, minActive)}
                  </option>
                {/each}
              </select>
            </label>
          {/if}

          <label class="text-muted-foreground flex items-center gap-2 text-xs">
            <span>{t("skillMonitor.buff.composite.icon")}</span>
            <select
              class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-xs"
              value={draft.iconBuffId === undefined
                ? ""
                : String(draft.iconBuffId)}
              onchange={(event) => {
                if (!draft) return;
                const value = (event.currentTarget as HTMLSelectElement).value;
                draft.iconBuffId = value ? Number(value) : undefined;
              }}
            >
              <option value=""
                >{t("skillMonitor.buff.composite.iconNone")}</option
              >
              {#each iconCandidateIds as memberId (memberId)}
                <option value={String(memberId)}>
                  {getBuffDisplayName(memberId)}
                </option>
              {/each}
            </select>
          </label>

          <p class="text-muted-foreground text-xs">
            {t("skillMonitor.buff.composite.hint")}
          </p>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 min-h-9 rounded border px-3 py-1 text-xs transition-colors"
              onclick={closeDraft}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              class="border-primary bg-primary text-primary-foreground min-h-9 rounded border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSave}
              onclick={saveDraft}
            >
              {t("skillMonitor.buff.composite.save")}
            </button>
          </div>
        </div>
      {:else if composites.length < MAX_BUFF_COMPOSITES}
        <button
          type="button"
          class="border-border/60 hover:bg-muted/40 min-h-9 rounded border px-3 py-1.5 text-sm transition-colors"
          onclick={startCreate}
        >
          {t("skillMonitor.buff.composite.new")}
        </button>
      {/if}
    </div>
  {/if}
</div>
