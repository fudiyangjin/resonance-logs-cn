<script lang="ts">
  let { moduleCount = null }: { moduleCount: number | null } = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-1">
  <div class="text-base font-semibold text-foreground">Data Status</div>
  <div class="text-sm text-muted-foreground">
    Module count: {moduleCount ?? "Not synced"}
  </div>
</div>

