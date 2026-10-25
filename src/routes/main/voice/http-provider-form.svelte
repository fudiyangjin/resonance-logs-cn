<script lang="ts">
  /**
   * @file Editor for one HTTP TTS provider. Works on a local draft; the
   * backend validates and persists it on save, and "test" synthesizes a line
   * with the unsaved draft so a template can be tried before saving.
   */
  import EyeIcon from "virtual:icons/lucide/eye";
  import EyeOffIcon from "virtual:icons/lucide/eye-off";
  import PlayIcon from "virtual:icons/lucide/play";
  import PlusIcon from "virtual:icons/lucide/plus";
  import Trash2Icon from "virtual:icons/lucide/trash-2";
  import {
    commands,
    type HttpBodyEncoding,
    type HttpLanguageParams,
    type HttpMethod,
    type HttpProviderInput,
    type HttpProviderMeta,
    type VoiceLanguage,
  } from "$lib/bindings";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    runVoiceOperation,
    VOICE,
    voiceErrorMessage,
  } from "$lib/stores/voice-store.svelte";

  interface Props {
    /** `id: null` creates a provider. Mount a new editor per provider. */
    initial: HttpProviderInput;
    onsaved: (provider: HttpProviderMeta) => void;
    oncancel: () => void;
  }

  let { initial, onsaved, oncancel }: Props = $props();

  function initialDraft(): HttpProviderInput {
    return $state.snapshot(initial);
  }

  let draft = $state(initialDraft());
  let showSecret = $state(false);
  let saving = $state(false);
  let testing = $state(false);
  let testLanguage = $state<VoiceLanguage>("zhCn");
  let testText = $state(t("voice.http.form.testTextDefault"));
  let message = $state<{ ok: boolean; text: string } | null>(null);

  const operationActive = $derived(VOICE.operation.kind !== "idle");

  const LANGUAGES: {
    value: VoiceLanguage;
    key: keyof HttpLanguageParams;
    labelKey: MessageKey;
  }[] = [
    { value: "zhCn", key: "zhCn", labelKey: "voice.language.zhCN" },
    { value: "enUs", key: "enUs", labelKey: "voice.language.enUS" },
    { value: "jaJp", key: "jaJp", labelKey: "voice.language.jaJP" },
  ];

  const ENCODINGS: { value: HttpBodyEncoding; labelKey: MessageKey }[] = [
    { value: "json", labelKey: "voice.http.form.encoding.json" },
    { value: "form", labelKey: "voice.http.form.encoding.form" },
    { value: "xml", labelKey: "voice.http.form.encoding.xml" },
    { value: "text", labelKey: "voice.http.form.encoding.text" },
  ];

  const inputClass =
    "border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

  function setMethod(method: HttpMethod) {
    draft.request.method = method;
    // The backend rejects a GET with a body; a POST starts from an empty JSON one.
    if (method === "get") draft.request.body = null;
    else draft.request.body ??= { encoding: "json", template: "" };
  }

  /** The draft as sent to the backend; an emptied number field means 1. */
  function payload(): HttpProviderInput {
    const snapshot = $state.snapshot(draft);
    return {
      ...snapshot,
      maxConcurrency: Math.round(Number(snapshot.maxConcurrency) || 1),
    };
  }

  function setResponseKind(kind: string) {
    draft.request.response =
      kind === "jsonBase64"
        ? { kind: "jsonBase64", pointer: "/audioContent" }
        : { kind: "audioBytes" };
  }

  async function test() {
    if (testing || !testText.trim()) return;
    testing = true;
    message = null;
    try {
      const res = await commands.voiceTestHttpProvider(
        payload(),
        testText.trim(),
        testLanguage,
      );
      message =
        res.status === "ok"
          ? {
              ok: true,
              text: t("voice.http.form.testOk", {
                seconds: res.data.durationSec.toFixed(1),
              }),
            }
          : { ok: false, text: voiceErrorMessage(res.error) };
    } catch (error) {
      message = { ok: false, text: voiceErrorMessage(error) };
    } finally {
      testing = false;
    }
  }

  async function save() {
    if (saving) return;
    saving = true;
    message = null;
    try {
      const res = await runVoiceOperation({ kind: "updatingCatalog" }, () =>
        commands.voiceSaveHttpProvider(payload()),
      );
      if (res.status === "ok") onsaved(res.data);
      else message = { ok: false, text: voiceErrorMessage(res.error) };
    } finally {
      saving = false;
    }
  }
</script>

<div class="border-primary/40 bg-primary/5 space-y-4 rounded-lg border p-4">
  <div class="grid gap-3 md:grid-cols-[1fr_8rem]">
    <label class="block space-y-1">
      <span class="text-muted-foreground text-xs"
        >{t("voice.http.form.name")}</span
      >
      <input class={inputClass} bind:value={draft.name} />
    </label>
    <label class="block space-y-1">
      <span class="text-muted-foreground text-xs">
        {t("voice.http.form.concurrency")}
      </span>
      <input
        type="number"
        min="1"
        max="8"
        class={inputClass}
        bind:value={draft.maxConcurrency}
      />
    </label>
  </div>

  <div class="grid gap-3 md:grid-cols-[7rem_1fr]">
    <label class="block space-y-1">
      <span class="text-muted-foreground text-xs"
        >{t("voice.http.form.method")}</span
      >
      <select
        class={inputClass}
        value={draft.request.method}
        onchange={(event) =>
          setMethod(
            (event.currentTarget as HTMLSelectElement).value as HttpMethod,
          )}
      >
        <option value="post">POST</option>
        <option value="get">GET</option>
      </select>
    </label>
    <label class="block space-y-1">
      <span class="text-muted-foreground text-xs"
        >{t("voice.http.form.url")}</span
      >
      <input
        class="{inputClass} font-mono"
        spellcheck="false"
        bind:value={draft.request.url}
      />
    </label>
  </div>
  <p class="text-muted-foreground text-xs">
    {t("voice.http.form.placeholders")}
  </p>

  <label class="block space-y-1">
    <span class="text-muted-foreground text-xs"
      >{t("voice.http.form.secret")}</span
    >
    <div class="flex gap-2">
      <input
        type={showSecret ? "text" : "password"}
        class="{inputClass} font-mono"
        autocomplete="off"
        spellcheck="false"
        bind:value={draft.secret}
      />
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 shrink-0 rounded border px-2"
        title={t("voice.http.form.toggleSecret")}
        onclick={() => (showSecret = !showSecret)}
      >
        {#if showSecret}
          <EyeOffIcon class="h-4 w-4" />
        {:else}
          <EyeIcon class="h-4 w-4" />
        {/if}
      </button>
    </div>
    <span class="text-muted-foreground text-xs"
      >{t("voice.http.form.secretHint")}</span
    >
  </label>

  <section class="space-y-2">
    <div class="flex items-center justify-between gap-3">
      <span class="text-foreground text-sm font-medium">
        {t("voice.http.form.headers")}
      </span>
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 flex items-center gap-1 rounded border px-2 py-1 text-xs"
        onclick={() => draft.request.headers.push({ name: "", value: "" })}
      >
        <PlusIcon class="h-3.5 w-3.5" />
        {t("voice.http.form.addHeader")}
      </button>
    </div>
    {#each draft.request.headers as header, index (index)}
      <div class="flex gap-2">
        <input
          class="{inputClass} font-mono md:w-56 md:flex-none"
          placeholder={t("voice.http.form.headerName")}
          spellcheck="false"
          bind:value={header.name}
        />
        <input
          class="{inputClass} font-mono"
          placeholder={t("voice.http.form.headerValue")}
          spellcheck="false"
          bind:value={header.value}
        />
        <button
          type="button"
          class="border-border/60 text-destructive hover:bg-destructive/10 shrink-0 rounded border px-2"
          onclick={() => draft.request.headers.splice(index, 1)}
        >
          <Trash2Icon class="h-3.5 w-3.5" />
        </button>
      </div>
    {/each}
  </section>

  {#if draft.request.body}
    <section class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <span class="text-foreground text-sm font-medium">
          {t("voice.http.form.body")}
        </span>
        <select
          class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-xs"
          bind:value={draft.request.body.encoding}
        >
          {#each ENCODINGS as encoding (encoding.value)}
            <option value={encoding.value}>{t(encoding.labelKey)}</option>
          {/each}
        </select>
      </div>
      <textarea
        class="{inputClass} min-h-32 font-mono text-xs"
        spellcheck="false"
        bind:value={draft.request.body.template}
      ></textarea>
    </section>
  {/if}

  <div class="grid gap-3 md:grid-cols-[14rem_1fr]">
    <label class="block space-y-1">
      <span class="text-muted-foreground text-xs"
        >{t("voice.http.form.response")}</span
      >
      <select
        class={inputClass}
        value={draft.request.response.kind}
        onchange={(event) =>
          setResponseKind((event.currentTarget as HTMLSelectElement).value)}
      >
        <option value="audioBytes"
          >{t("voice.http.form.response.audioBytes")}</option
        >
        <option value="jsonBase64"
          >{t("voice.http.form.response.jsonBase64")}</option
        >
      </select>
    </label>
    {#if draft.request.response.kind === "jsonBase64"}
      <label class="block space-y-1">
        <span class="text-muted-foreground text-xs">
          {t("voice.http.form.response.pointer")}
        </span>
        <input
          class="{inputClass} font-mono"
          spellcheck="false"
          bind:value={draft.request.response.pointer}
        />
      </label>
    {/if}
  </div>
  <p class="text-muted-foreground text-xs">{t("voice.http.form.formats")}</p>

  <section class="space-y-2">
    <span class="text-foreground text-sm font-medium">
      {t("voice.http.form.languages")}
    </span>
    {#each LANGUAGES as language (language.value)}
      <div class="grid grid-cols-[4rem_1fr_1fr] items-center gap-2">
        <span class="text-muted-foreground text-xs">{t(language.labelKey)}</span
        >
        <input
          class="{inputClass} font-mono"
          placeholder={"{lang}"}
          spellcheck="false"
          bind:value={draft.request.languages[language.key].lang}
        />
        <input
          class="{inputClass} font-mono"
          placeholder={"{voice}"}
          spellcheck="false"
          bind:value={draft.request.languages[language.key].voice}
        />
      </div>
    {/each}
  </section>

  <section class="border-border/60 space-y-2 border-t pt-3">
    <span class="text-foreground text-sm font-medium"
      >{t("voice.http.form.test")}</span
    >
    <div class="flex flex-wrap gap-2">
      <select
        class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-2 text-sm"
        bind:value={testLanguage}
      >
        {#each LANGUAGES as language (language.value)}
          <option value={language.value}>{t(language.labelKey)}</option>
        {/each}
      </select>
      <input class="{inputClass} min-w-48 flex-1" bind:value={testText} />
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 flex items-center gap-1 rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={testing || !testText.trim()}
        onclick={test}
      >
        <PlayIcon class="h-4 w-4 {testing ? 'animate-pulse' : ''}" />
        {testing
          ? t("voice.http.form.testing")
          : t("voice.http.form.testButton")}
      </button>
    </div>
  </section>

  {#if message}
    <p
      class="text-xs break-all {message.ok
        ? 'text-emerald-500'
        : 'text-destructive'}"
      role="status"
    >
      {message.text}
    </p>
  {/if}

  <div class="flex justify-end gap-2">
    <button
      type="button"
      class="border-border/60 hover:bg-muted/40 rounded border px-4 py-2 text-sm"
      onclick={oncancel}
    >
      {t("common.cancel")}
    </button>
    <button
      type="button"
      class="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
      disabled={saving || operationActive || !draft.name.trim()}
      onclick={save}
    >
      {t("voice.http.form.save")}
    </button>
  </div>
</div>
