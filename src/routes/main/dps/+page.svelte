<script lang="ts">
  /**
   * @file Default page for DPS tool - redirects to history tab.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  onMount(() => {
    goto("/main/dps/history");
  });
</script>

<p class="text-muted-foreground">Redirecting...</p>
