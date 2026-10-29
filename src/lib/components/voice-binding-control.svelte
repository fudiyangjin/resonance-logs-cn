<script lang="ts">
  /**
   * @file Inline voice-binding control: one collapsible block per subject
   * (a monitored buff / counter slot / boss DBM mechanic), each with
   * a row per configurable event (enabled toggle, phrase source picker,
   * optional "seconds before" for expiring events, and a preview button).
   *
   * Self-contained: reads and writes settings directly via
   * `voice-binding-subject.svelte.ts` based on `subject`, so parent pages
   * only need to pass which subject this instance represents.
   *
   * Typed fields commit on `change` (blur / Enter), never per keystroke:
   * managed phrases are named by their text, so every intermediate text
   * would otherwise land in the phrase library as a phrase of its own.
   */
  import PlayIcon from "virtual:icons/lucide/play";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    SETTINGS,
    resolveVoicePriority,
    VOICE_PRIORITY_TIERS,
    type VoicePhraseBinding,
  } from "$lib/settings-store";
  import {
    runVoiceGeneration,
    savedGenerationSource,
    voiceOperationActive,
    VOICE,
  } from "$lib/stores/voice-store.svelte";
  import { blurOnEnter } from "$lib/utils.svelte";
  import { bindingPhrases } from "$lib/voice/phrase-key";
  import {
    materializeBindingPhraseIds,
    previewPhraseBinding,
  } from "$lib/voice/preview.svelte";
  import {
    subjectEvents,
    updateSubjectEvent,
    type VoiceBindingEventDef,
    type VoiceBindingEventKind,
    type VoiceBindingSubject,
  } from "$lib/voice-binding-subject.svelte.js";

  let { subject }: { subject: VoiceBindingSubject } = $props();

  const events = $derived(subjectEvents(subject));
  const phrases = $derived(VOICE.status?.catalog.phrases ?? []);

  let previewingKey = $state<string | null>(null);

  const PRIORITY_LABEL_KEYS = {
    default: "voice.binding.priority.default",
    low: "voice.binding.priority.low",
    medium: "voice.binding.priority.medium",
    high: "voice.binding.priority.high",
    urgent: "voice.binding.priority.urgent",
  } satisfies Record<(typeof VOICE_PRIORITY_TIERS)[number]["id"], MessageKey>;

  async function tryPlay(
    event: VoiceBindingEventDef,
    binding: VoicePhraseBinding,
    autoText: string,
  ) {
    previewingKey = event.key;
    try {
      await previewPhraseBinding({
        ruleKey: event.key,
        phrase: binding,
        autoText,
        language: event.language ?? "zhCn",
        supportsTier: event.supportsTierPlaceholder,
        fixedName: event.fixedPhraseName,
      });
    } finally {
      previewingKey = null;
    }
  }

  async function generate(
    event: VoiceBindingEventDef,
    binding: VoicePhraseBinding,
    autoText: string,
  ) {
    const source =
      binding.source === "custom" && binding.generationSource
        ? binding.generationSource
        : savedGenerationSource();
    if (!source || voiceOperationActive()) return;
    previewingKey = event.key;
    try {
      const phraseIds = await materializeBindingPhraseIds(
        binding,
        bindingPhrases({
          ruleKey: event.key,
          phrase: binding,
          autoText,
          language: event.language ?? "zhCn",
          supportsTier: event.supportsTierPlaceholder,
          fixedName: event.fixedPhraseName,
        }),
      );
      if (phraseIds.length)
        await runVoiceGeneration({
          source,
          phraseIds,
          backendPreference: SETTINGS.voice.state.generationBackend,
        });
    } finally {
      previewingKey = null;
    }
  }

  function setSource(
    eventKind: VoiceBindingEventKind,
    source: VoicePhraseBinding["source"],
  ) {
    const phrase: VoicePhraseBinding =
      source === "custom"
        ? { source: "custom", text: "" }
        : source === "phrase"
          ? { source: "phrase", phraseId: phrases[0]?.id ?? "" }
          : { source: "auto" };
    updateSubjectEvent(subject, eventKind, { phrase });
  }
</script>

<div class="space-y-2">
  {#each events as event (event.key)}
    {@const config = event.config}
    {@const enabled = config?.enabled ?? false}
    {@const binding = config?.phrase ?? { source: "auto" }}
    {@const priority = config?.priority}
    {@const hasKnownPriority = VOICE_PRIORITY_TIERS.some(
      (tier) => tier.value === priority,
    )}
    {@const seconds =
      event.expiring && config && "secondsBefore" in config
        ? config.secondsBefore
        : 5}
    {@const autoText = event.autoText(seconds)}
    {@const autoSourceLabelKey =
      event.autoSourceLabelKey ?? "voice.binding.source.auto"}
    <div class="border-border/50 bg-muted/10 space-y-2 rounded border p-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1.5 text-xs font-medium">
          <input
            type="checkbox"
            checked={enabled}
            onchange={(ev) =>
              updateSubjectEvent(subject, event.eventKind, {
                enabled: (ev.currentTarget as HTMLInputElement).checked,
                phrase: binding,
              })}
          />
          {t(event.labelKey)}
        </label>

        {#if enabled}
          <select
            class="border-border/60 bg-muted/30 text-foreground rounded border px-1.5 py-1 text-xs"
            value={binding.source}
            onchange={(ev) =>
              setSource(
                event.eventKind,
                (ev.currentTarget as HTMLSelectElement)
                  .value as VoicePhraseBinding["source"],
              )}
          >
            <option value="auto">{t(autoSourceLabelKey)}</option>
            <option value="custom">{t("voice.binding.source.custom")}</option>
            <option value="phrase">{t("voice.binding.source.phrase")}</option>
          </select>

          <label class="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{t("voice.binding.priority")}</span>
            <select
              class="border-border/60 bg-muted/30 text-foreground rounded border px-1.5 py-1 text-xs"
              value={priority ?? ""}
              onchange={(ev) => {
                const value = (ev.currentTarget as HTMLSelectElement).value;
                updateSubjectEvent(subject, event.eventKind, {
                  priority:
                    value === ""
                      ? undefined
                      : resolveVoicePriority(Number(value)),
                });
              }}
            >
              {#if priority !== undefined && !hasKnownPriority}
                <option value={priority}>{priority}</option>
              {/if}
              {#each VOICE_PRIORITY_TIERS as tier (tier.id)}
                <option value={tier.value ?? ""}>
                  {t(PRIORITY_LABEL_KEYS[tier.id])}
                </option>
              {/each}
            </select>
          </label>

          {#if event.expiring}
            <input
              type="number"
              min="1"
              max="120"
              class="border-border/60 bg-muted/30 text-foreground w-16 rounded border px-1.5 py-1 text-xs"
              value={seconds}
              title={t("voice.binding.secondsBefore", { seconds })}
              {@attach blurOnEnter}
              onchange={(ev) => {
                const input = ev.currentTarget as HTMLInputElement;
                const next = Math.max(1, Number(input.value) || 1);
                // A one-way `value` won't repaint a clamp onto the current value.
                input.value = String(next);
                if (next !== seconds) {
                  updateSubjectEvent(subject, event.eventKind, {
                    secondsBefore: next,
                  });
                }
              }}
            />
          {/if}

          <button
            type="button"
            class="border-border/60 hover:bg-muted/40 ml-auto flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
            disabled={previewingKey === event.key}
            onclick={() => tryPlay(event, binding, autoText)}
          >
            <PlayIcon class="h-3 w-3" />
            {t("voice.binding.tryPlay")}
          </button>
        {/if}
      </div>

      {#if enabled}
        {#if binding.source === "auto"}
          <div class="text-muted-foreground text-xs">
            {t("voice.binding.autoPreview", { text: autoText })}
          </div>
        {:else if binding.source === "custom"}
          <input
            class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground w-full rounded border px-2 py-1 text-xs"
            placeholder={t("voice.binding.customPlaceholder")}
            value={binding.text}
            {@attach blurOnEnter}
            onchange={(ev) =>
              updateSubjectEvent(subject, event.eventKind, {
                phrase: {
                  ...binding,
                  source: "custom",
                  text: (ev.currentTarget as HTMLInputElement).value,
                },
              })}
          />
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 text-xs">
              {t("voice.binding.generationSource")}
              <select
                class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-xs"
                value={binding.generationSource
                  ? binding.generationSource.mode === "http"
                    ? `http:${binding.generationSource.providerId}`
                    : `preset:${binding.generationSource.locale}`
                  : "default"}
                onchange={(ev) => {
                  const value = ev.currentTarget.value;
                  const generationSource = value.startsWith("http:")
                    ? { mode: "http" as const, providerId: value.slice(5) }
                    : value.startsWith("preset:")
                      ? {
                          mode: "preset" as const,
                          locale: value.slice(7) as "zh-CN" | "en-US" | "ja-JP",
                        }
                      : undefined;
                  updateSubjectEvent(subject, event.eventKind, {
                    phrase: { ...binding, generationSource },
                  });
                }}
              >
                <option value="default"
                  >{t("voice.binding.generationDefault")}</option
                >
                <optgroup label={t("voice.phrases.generate.presetSource")}>
                  <option value="preset:zh-CN">中文</option>
                  <option value="preset:en-US">English</option>
                  <option value="preset:ja-JP">日本語</option>
                </optgroup>
                <optgroup label={t("voice.http.title")}>
                  {#if binding.generationSource?.mode === "http" && !VOICE.status?.catalog.httpProviders.some((p) => p.id === (binding.generationSource as { providerId: string }).providerId)}
                    <option
                      value={`http:${binding.generationSource.providerId}`}
                      disabled
                      >{t("voice.binding.generationUnavailable")}</option
                    >
                  {/if}
                  {#each VOICE.status?.catalog.httpProviders ?? [] as provider (provider.id)}
                    <option value={`http:${provider.id}`}
                      >{provider.name}</option
                    >
                  {/each}
                </optgroup>
              </select>
            </label>
            {#if binding.generationSource?.mode === "http"}
              <label class="flex items-center gap-2 text-xs">
                {t("voice.binding.generationLanguage")}
                <select
                  class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-xs"
                  value={binding.httpLanguage ?? event.language ?? "zhCn"}
                  onchange={(ev) =>
                    updateSubjectEvent(subject, event.eventKind, {
                      phrase: {
                        ...binding,
                        httpLanguage: ev.currentTarget.value as
                          | "zhCn"
                          | "enUs"
                          | "jaJp",
                      },
                    })}
                >
                  <option value="zhCn">{t("voice.language.zhCN")}</option>
                  <option value="enUs">{t("voice.language.enUS")}</option>
                  <option value="jaJp">{t("voice.language.jaJP")}</option>
                </select>
              </label>
            {/if}
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs disabled:opacity-50"
              disabled={voiceOperationActive() ||
                previewingKey !== null ||
                !binding.text.trim() ||
                (binding.generationSource?.mode === "preset" &&
                  VOICE.status?.model.kind !== "ready") ||
                (binding.generationSource?.mode === "http" &&
                  !VOICE.status?.catalog.httpProviders.some(
                    (p) =>
                      p.id ===
                      (binding.generationSource as { providerId: string })
                        .providerId,
                  )) ||
                (!binding.generationSource && !savedGenerationSource())}
              onclick={() => generate(event, binding, autoText)}
              >{t("voice.binding.generate")}</button
            >
          </div>
          {#if VOICE.generationError}
            <p class="text-destructive text-xs">{VOICE.generationError}</p>
          {/if}
          {#if event.supportsTierPlaceholder}
            <p class="text-muted-foreground text-[11px]">
              {t("voice.binding.tierPlaceholderHint")}
            </p>
          {/if}
        {:else}
          <select
            class="border-border/60 bg-muted/30 text-foreground w-full rounded border px-2 py-1 text-xs"
            value={binding.phraseId}
            onchange={(ev) =>
              updateSubjectEvent(subject, event.eventKind, {
                phrase: {
                  source: "phrase",
                  phraseId: (ev.currentTarget as HTMLSelectElement).value,
                },
              })}
          >
            <option value="">{t("voice.binding.pickPhrase")}</option>
            {#each phrases as phrase (phrase.id)}
              <option value={phrase.id}>{phrase.name}</option>
            {/each}
          </select>
        {/if}
      {/if}
    </div>
  {/each}
</div>
