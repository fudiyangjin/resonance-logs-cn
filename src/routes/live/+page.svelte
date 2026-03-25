<script lang="ts">
  /**
   * @file This page redirects to the DPS tab by default.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { tl } from "$lib/i18n/index.svelte";

  onMount(() => {
    // Default going to dps tab TODO: make it remember which tab it was in last? not sure if this is a good idea
    goto(resolve("/live/dps/"));
  });
</script>

<p>{tl("Redirecting to DPS...")}</p>
