<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import { getClassConfigs } from "$lib/skill-mappings";
  import { MONITOR_CLASS_SELECT_ID } from "$lib/skill-profile-class";

  let { classKey, resource = false }: { classKey: string; resource?: boolean } = $props();
  const className = $derived(
    getClassConfigs().find((config) => config.classKey === classKey)?.className ?? classKey,
  );

  function focusSelector(event: MouseEvent) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const select = document.getElementById(MONITOR_CLASS_SELECT_ID);
    if (!select) return;
    event.preventDefault();
    select.scrollIntoView({ block: "center" });
    select.focus({ preventScroll: true });
  }
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
  <span class="text-sm font-medium text-foreground">
    {resource
      ? t("skillMonitor.profile.resourceClass", { name: className })
      : t("skillMonitor.profile.currentClass", { name: className })}
  </span>
  <a
    href={`#${MONITOR_CLASS_SELECT_ID}`}
    onclick={focusSelector}
    class="rounded text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
  >{t("skillMonitor.profile.changeClass")}</a>
</div>
