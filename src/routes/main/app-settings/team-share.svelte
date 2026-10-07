<script lang="ts">
  import { onMount } from "svelte";
  import { commands, type TeamShareStatus } from "$lib/bindings";
  import { t } from "$lib/i18n/index.svelte";
  import { teamShareStatus } from "$lib/stores/team-share-status.svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";

  let enabled = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    let release: (() => void) | undefined;
    let disposed = false;
    void commands
      .getTeamShareSettings()
      .then((settings) => (enabled = settings.enabled))
      .catch(() => {});
    void teamShareStatus.subscribe().then((unsubscribe) => {
      if (disposed) unsubscribe();
      else release = unsubscribe;
    });
    return () => {
      disposed = true;
      release?.();
    };
  });

  async function setEnabled(next: boolean) {
    error = null;
    const result = await commands.setTeamShareEnabled(next);
    if (result.status === "error") {
      error = t("appSettings.teamShare.saveFailed", {
        error: String(result.error),
      });
    }
  }

  function describe(status: TeamShareStatus): string {
    switch (status.state) {
      case "disabled":
        return t("appSettings.teamShare.status.disabled");
      case "idle":
        return t("appSettings.teamShare.status.idle");
      case "connecting":
        return t("appSettings.teamShare.status.connecting");
      case "connected":
        return t("appSettings.teamShare.status.connected", {
          count: status.teammates,
        });
      case "retrying":
        return t("appSettings.teamShare.status.retrying", {
          seconds: Math.ceil(status.retryMs / 1000),
          error: status.error,
        });
    }
  }

  const status = $derived(teamShareStatus.status);
</script>

<div
  class="border-border/60 bg-card/40 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
>
  <div class="px-4 py-3">
    <h2 class="text-foreground mb-1 text-base font-semibold">
      {t("appSettings.teamShare.title")}
    </h2>
    <SettingsSwitch
      label={t("appSettings.teamShare.enable")}
      description={t("appSettings.teamShare.enableDescription")}
      bind:checked={enabled}
      onCheckedChange={(next) => void setEnabled(next)}
    />
    <p
      class="mt-1 px-3 text-xs"
      class:text-muted-foreground={status.state !== "retrying"}
      class:text-destructive={status.state === "retrying"}
    >
      {describe(status)}
    </p>
    {#if error}
      <p class="text-destructive mt-1 px-3 text-xs">{error}</p>
    {/if}
  </div>
</div>
