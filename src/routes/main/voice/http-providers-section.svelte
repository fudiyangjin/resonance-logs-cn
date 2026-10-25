<script lang="ts">
  /**
   * @file "HTTP voice services" section of the model tab: lists the
   * configured HTTP TTS providers and opens the editor to add one from a
   * preset or edit an existing one. Picking a provider for generation
   * happens in the phrase library.
   */
  import PencilIcon from "virtual:icons/lucide/pencil";
  import PlusIcon from "virtual:icons/lucide/plus";
  import Trash2Icon from "virtual:icons/lucide/trash-2";
  import {
    commands,
    type HttpProviderInput,
    type HttpProviderMeta,
  } from "$lib/bindings";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import {
    runVoiceOperation,
    VOICE,
    voiceErrorMessage,
  } from "$lib/stores/voice-store.svelte";
  import {
    createHttpProviderPreset,
    HTTP_PROVIDER_PRESET_IDS,
    type HttpProviderPresetId,
  } from "$lib/voice/http-provider-presets";
  import HttpProviderForm from "./http-provider-form.svelte";

  const PRESET_LABELS: Record<HttpProviderPresetId, MessageKey> = {
    openaiCompatible: "voice.http.preset.openaiCompatible",
    googleCloud: "voice.http.preset.googleCloud",
    customGet: "voice.http.preset.customGet",
  };

  const providers = $derived(VOICE.status?.catalog.httpProviders ?? []);
  const operationActive = $derived(VOICE.operation.kind !== "idle");

  /** The provider in the editor (`id: null` = new); `null` hides it. */
  let editing = $state<HttpProviderInput | null>(null);
  let presetId = $state<HttpProviderPresetId>("openaiCompatible");
  let pendingDelete = $state<HttpProviderMeta | null>(null);
  let confirmOpen = $state(false);
  let localError = $state<string | null>(null);

  function endpointLabel(provider: HttpProviderMeta): string {
    try {
      return new URL(provider.request.url).host;
    } catch {
      return provider.request.url;
    }
  }

  function startCreate() {
    editing = createHttpProviderPreset(presetId, t(PRESET_LABELS[presetId]));
  }

  function startEdit(provider: HttpProviderMeta) {
    editing = {
      id: provider.id,
      name: provider.name,
      request: provider.request,
      secret: provider.secret,
      maxConcurrency: provider.maxConcurrency,
    };
  }

  function handleSaved(provider: HttpProviderMeta) {
    editing = null;
    // The first provider becomes the HTTP generation source right away.
    if (!SETTINGS.voice.state.selectedHttpProviderId) {
      SETTINGS.voice.state.selectedHttpProviderId = provider.id;
    }
  }

  function askDelete(provider: HttpProviderMeta) {
    pendingDelete = provider;
    confirmOpen = true;
  }

  // `pendingDelete` stays set so the closing dialog keeps its text.
  async function confirmDelete() {
    const provider = pendingDelete;
    if (!provider) return;
    localError = null;
    const res = await runVoiceOperation({ kind: "updatingCatalog" }, () =>
      commands.voiceDeleteHttpProvider(provider.id),
    );
    if (res.status === "error") localError = voiceErrorMessage(res.error);
    else if (editing?.id === provider.id) editing = null;
  }
</script>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <div class="space-y-1">
    <h2 class="text-foreground text-base font-semibold">
      {t("voice.http.title")}
    </h2>
    <p class="text-muted-foreground text-xs">{t("voice.http.description")}</p>
  </div>

  {#if providers.length > 0}
    <div class="space-y-2">
      {#each providers as provider (provider.id)}
        <div
          class="border-border/60 bg-background/50 flex items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div class="min-w-0">
            <div class="text-foreground truncate text-sm font-medium">
              {provider.name}
            </div>
            <div class="text-muted-foreground truncate font-mono text-xs">
              {provider.request.method.toUpperCase()}
              {endpointLabel(provider)}
            </div>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs disabled:opacity-50"
              title={t("voice.http.edit")}
              disabled={operationActive}
              onclick={() => startEdit(provider)}
            >
              <PencilIcon class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="border-border/60 text-destructive hover:bg-destructive/10 rounded border px-2 py-1 text-xs disabled:opacity-50"
              title={t("voice.http.delete")}
              disabled={operationActive}
              onclick={() => askDelete(provider)}
            >
              <Trash2Icon class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {:else if !editing}
    <div class="text-muted-foreground text-sm">{t("voice.http.empty")}</div>
  {/if}

  {#if editing}
    {#key editing}
      <HttpProviderForm
        initial={editing}
        onsaved={handleSaved}
        oncancel={() => (editing = null)}
      />
    {/key}
  {:else}
    <div class="flex flex-wrap items-center gap-2">
      <select
        class="border-border/60 bg-muted/30 text-foreground rounded border px-3 py-2 text-sm"
        bind:value={presetId}
      >
        {#each HTTP_PROVIDER_PRESET_IDS as id (id)}
          <option value={id}>{t(PRESET_LABELS[id])}</option>
        {/each}
      </select>
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 flex items-center gap-1 rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={operationActive}
        onclick={startCreate}
      >
        <PlusIcon class="h-4 w-4" />
        {t("voice.http.add")}
      </button>
    </div>
  {/if}

  {#if localError}
    <p class="text-destructive text-xs">{localError}</p>
  {/if}
</section>

<ConfirmDialog
  bind:open={confirmOpen}
  title={t("voice.http.deleteConfirm.title")}
  description={t("voice.http.deleteConfirm.description", {
    name: pendingDelete?.name ?? "",
  })}
  confirmText={t("common.confirm")}
  cancelText={t("common.cancel")}
  variant="destructive"
  onconfirm={confirmDelete}
/>
