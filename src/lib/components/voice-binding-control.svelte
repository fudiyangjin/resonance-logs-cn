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
   */
  import PlayIcon from "virtual:icons/lucide/play";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    resolveVoicePriority,
    VOICE_PRIORITY_TIERS,
    type VoicePhraseBinding,
  } from "$lib/settings-store";
  import { VOICE } from "$lib/stores/voice-store.svelte";
  import { previewPhraseBinding } from "$lib/voice-binding-compile.svelte.js";
  import {
    subjectEvents,
    updateSubjectEvent,
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
    key: string,
    binding: VoicePhraseBinding,
    autoText: string,
  ) {
    previewingKey = key;
    try {
      await previewPhraseBinding(key, binding, autoText);
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
            <option value="auto">{t("voice.binding.source.auto")}</option>
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
              oninput={(ev) =>
                updateSubjectEvent(subject, event.eventKind, {
                  secondsBefore: Math.max(
                    1,
                    Number((ev.currentTarget as HTMLInputElement).value) || 1,
                  ),
                })}
            />
          {/if}

          <button
            type="button"
            class="border-border/60 hover:bg-muted/40 ml-auto flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
            disabled={previewingKey === event.key}
            onclick={() => tryPlay(event.key, binding, autoText)}
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
            oninput={(ev) =>
              updateSubjectEvent(subject, event.eventKind, {
                phrase: {
                  source: "custom",
                  text: (ev.currentTarget as HTMLInputElement).value,
                },
              })}
          />
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
