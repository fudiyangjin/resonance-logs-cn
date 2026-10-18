<script lang="ts" module>
  import type { MessageKey } from "$lib/i18n/index.svelte";

  export type MonitorTab<T extends string> = {
    id: T;
    labelKey: MessageKey;
    /** Whether the tab's overlay area is shown; omit for tabs without one. */
    shown?: boolean;
  };

  export type MonitorTabGroup<T extends string> = {
    id: string;
    labelKey: MessageKey;
    tabs: MonitorTab<T>[];
  };
</script>

<script lang="ts" generics="T extends string">
  import { t } from "$lib/i18n/index.svelte";

  interface Props {
    groups: MonitorTabGroup<T>[];
    value: T;
  }

  let { groups, value = $bindable() }: Props = $props();
</script>

<!--
  Groups wrap as a whole: a group moves to the next line when it does not fit
  beside the previous one, and only wraps inside itself when it is wider than
  the bar on its own.
-->
<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
  {#each groups as group (group.id)}
    <div
      class="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={t(group.labelKey)}
    >
      <span class="text-muted-foreground px-1 text-xs font-medium">
        {t(group.labelKey)}
      </span>
      {#each group.tabs as tab (tab.id)}
        <button
          type="button"
          aria-pressed={value === tab.id}
          class="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors {value ===
          tab.id
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => {
            value = tab.id;
          }}
        >
          {t(tab.labelKey)}
          {#if tab.shown}
            <span
              class="size-1.5 shrink-0 rounded-full bg-emerald-500"
              title={t("components.monitorTabNav.panelShown")}
              aria-label={t("components.monitorTabNav.panelShown")}
              role="img"
            ></span>
          {/if}
        </button>
      {/each}
    </div>
  {/each}
</div>
