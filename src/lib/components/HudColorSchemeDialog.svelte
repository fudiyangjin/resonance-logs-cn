<script lang="ts">
  /**
   * One-click HUD colors: pick a scheme, choose the skill and/or monster
   * monitor panels, confirm (listing loadouts that share those profiles),
   * and every selected panel's colors change in a single write.
   */
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { t } from "$lib/i18n/index.svelte";
  import {
    DEFAULT_HUD_COLOR_SCHEME_ID,
    HUD_COLOR_SCHEMES,
    getHudColorScheme,
    schemePatch,
    type HudColorSchemeId,
  } from "$lib/hud-color-schemes";
  import {
    applyHudSchemeToActive,
    loadoutsSharingActiveHudProfiles,
  } from "$lib/hud-color-scheme-actions";
  import SchemePreviewRow from "./SchemePreviewRow.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let selectedId = $state<HudColorSchemeId>(DEFAULT_HUD_COLOR_SCHEME_ID);
  let applySkill = $state(true);
  let applyMonster = $state(true);
  let confirming = $state(false);

  const targets = $derived({ skill: applySkill, monster: applyMonster });
  const selectedName = $derived(t(getHudColorScheme(selectedId).nameKey));
  const sharedNames = $derived(
    confirming ? loadoutsSharingActiveHudProfiles(targets) : [],
  );
  const confirmText = $derived.by(() => {
    const lines = [t("hudScheme.confirmDescription")];
    if (sharedNames.length > 1) {
      lines.push(t("hudScheme.shared", { names: sharedNames.join(" / ") }));
    }
    return lines.join("\n");
  });

  function onOpenChange(isOpen: boolean) {
    open = isOpen;
    if (!isOpen) confirming = false;
  }

  function apply() {
    applyHudSchemeToActive(selectedId, targets);
    confirming = false;
    open = false;
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>
        {confirming
          ? t("hudScheme.confirmTitle", { name: selectedName })
          : t("hudScheme.dialogTitle")}
      </Dialog.Title>
      <Dialog.Description class="whitespace-pre-line">
        {confirming ? confirmText : t("hudScheme.dialogDescription")}
      </Dialog.Description>
    </Dialog.Header>

    {#if !confirming}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {#each HUD_COLOR_SCHEMES as scheme (scheme.id)}
          <button
            type="button"
            class="flex flex-col gap-2 rounded-lg border p-2.5 text-left transition-colors {selectedId ===
            scheme.id
              ? 'border-primary bg-primary/10'
              : 'border-border/60 hover:border-border hover:bg-muted/30'}"
            aria-pressed={selectedId === scheme.id}
            onclick={() => (selectedId = scheme.id)}
          >
            <div class="space-y-1 rounded-md bg-[#0b0f17] p-1.5">
              <SchemePreviewRow
                colors={schemePatch(scheme, "textBuff")}
                name={t("hudScheme.panel.textBuff")}
                value="12.3"
              />
              <SchemePreviewRow
                colors={schemePatch(scheme, "monsterBuff")}
                name={t("hudScheme.panel.monsterBuff")}
                value="8.0"
                fill={0.4}
              />
              <SchemePreviewRow
                colors={schemePatch(scheme, "hp")}
                name={t("hudScheme.panel.hp")}
                value="76%"
                fill={0.76}
              />
            </div>
            <div class="px-0.5">
              <div class="text-foreground text-sm font-medium">
                {t(scheme.nameKey)}
              </div>
              <div class="text-muted-foreground text-xs">
                {t(scheme.descriptionKey)}
              </div>
            </div>
          </button>
        {/each}
      </div>
      <p class="text-muted-foreground text-xs">{t("hudScheme.semanticNote")}</p>
      <div class="flex flex-wrap gap-4 text-sm">
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={applySkill} />
          {t("hudScheme.targets.skill")}
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={applyMonster} />
          {t("hudScheme.targets.monster")}
        </label>
      </div>
    {/if}

    <Dialog.Footer>
      {#if confirming}
        <Button variant="outline" onclick={() => (confirming = false)}>
          {t("common.cancel")}
        </Button>
        <Button onclick={apply}>{t("common.confirm")}</Button>
      {:else}
        <Button variant="outline" onclick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!applySkill && !applyMonster}
          onclick={() => (confirming = true)}
        >
          {t("hudScheme.apply")}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
