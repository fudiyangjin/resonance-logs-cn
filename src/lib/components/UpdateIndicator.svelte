<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "$lib/i18n/index.svelte";
  import {
    UPDATE,
    connectUpdates,
    reportUpdateConnectionError,
    requestUpdate,
  } from "$lib/stores/update-store.svelte";
  import Download from "virtual:icons/lucide/download";
  import LoaderCircle from "virtual:icons/lucide/loader-circle";
  import RefreshCw from "virtual:icons/lucide/refresh-cw";

  let disconnect: (() => void) | undefined;
  let connecting = false;
  let disposed = false;

  async function connect() {
    if (connecting || disconnect) return;
    connecting = true;
    try {
      const stop = await connectUpdates();
      if (disposed) stop();
      else disconnect = stop;
    } catch (error) {
      if (!disposed) reportUpdateConnectionError(error);
    } finally {
      connecting = false;
    }
  }

  onMount(() => {
    void connect();
    return () => {
      disposed = true;
      disconnect?.();
    };
  });

  const status = $derived(UPDATE.status);
  const failed = $derived(
    status?.phase === "failed" || !!UPDATE.connectionError,
  );
  const actionable = $derived(failed || status?.phase === "available");
  const visible = $derived(
    actionable ||
      ["downloading", "verifying", "installing"].includes(status?.phase ?? ""),
  );
  const progress = $derived(
    status?.totalBytes
      ? `${Math.min(100, Math.floor((status.downloadedBytes / status.totalBytes) * 100))}%`
      : `${((status?.downloadedBytes ?? 0) / 1024 / 1024).toFixed(1)} MB`,
  );
  const label = $derived(
    failed
      ? t("updater.retry")
      : status?.phase === "downloading"
        ? t("updater.downloading", { progress })
        : status?.phase === "verifying"
          ? t("updater.verifying")
          : status?.phase === "installing"
            ? t("updater.installing")
            : t("updater.available"),
  );
  const title = $derived(
    failed
      ? UPDATE.connectionError || status?.error || t("updater.retry")
      : t("updater.hint", { version: status?.version ?? "" }),
  );

  async function activate() {
    await connect();
    if (disconnect) await requestUpdate();
  }
</script>

{#if visible}
  <button
    type="button"
    class="inline-flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight text-primary transition-colors enabled:cursor-pointer enabled:hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
    class:text-destructive={failed}
    disabled={!actionable || UPDATE.requestPending}
    onclick={activate}
    {title}
    aria-label={`${label}. ${title}`}
    aria-busy={!actionable}
  >
    {#if failed}
      <RefreshCw class="h-3 w-3 shrink-0" />
    {:else if actionable}
      <Download class="h-3 w-3 shrink-0" />
    {:else}
      <LoaderCircle
        class="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none"
      />
    {/if}
    <span>{label}</span>
  </button>
{/if}
