<script lang="ts">
  import AlertTriangle from "virtual:icons/lucide/alert-triangle";
  import { tooltip } from "$lib/utils.svelte";
  import { t, getLocale } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import type { ForbiddenHit } from "$lib/challenge-watch";
  import {
    describeForbiddenHits,
    formatForbiddenHitsTooltip,
  } from "$lib/challenge-watch-display";

  interface Props {
    hits?: ForbiddenHit[];
  }

  let { hits = [] }: Props = $props();

  // Each hit damage by its own name and id under the group that forbids it,
  // with how many times it landed — never collapsed into a preset label.
  const tooltipText = $derived(
    formatForbiddenHitsTooltip(
      describeForbiddenHits(
        hits,
        SETTINGS.challengeWatch.state.groups,
        getLocale(),
      ),
    ),
  );
</script>

<span
  class="inline-flex shrink-0 items-center text-red-500"
  role="img"
  aria-label={t("challengeWatch.warningAria")}
  {@attach tooltip(() => tooltipText, { multiline: true })}
>
  <AlertTriangle class="h-[1em] w-[1em]" />
</span>
