<script lang="ts">
  /**
   * @file The digits every countdown speaks: the recordings bundled with the
   * app, or the same ten digits generated with the user's own voice. Like an
   * alert's line, the bundled set is always one click away; unlike a
   * binding, the set is shared by every countdown, so it is chosen here and
   * not on the events that count down.
   */
  import PlayIcon from "virtual:icons/lucide/play";
  import { commands } from "$lib/bindings";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import { SETTINGS, type CountdownVoiceSetting } from "$lib/settings-store";
  import {
    bindingGenerationSource,
    lastGenerationError,
    runVoiceGeneration,
    voiceOperationActive,
  } from "$lib/stores/voice-store.svelte";
  import {
    countdownDigitBinding,
    countdownPhrases,
  } from "$lib/voice/countdown";
  import { voiceLanguageForLocale } from "$lib/voice/phrase-key";
  import { materializeBindingPhraseIds } from "$lib/voice/preview.svelte";
  import {
    currentPhraseIndex,
    upsertManagedPhrase,
  } from "$lib/voice/sync.svelte";
  import VoiceSourceSelect from "./voice-source-select.svelte";

  /** Digits the preview counts, one per second like a real countdown. */
  const PREVIEW_DIGITS = [3, 2, 1];

  const voice = $derived<CountdownVoiceSetting>(
    SETTINGS.voice.state.countdownVoice ?? { source: "auto" },
  );
  const language = $derived(voiceLanguageForLocale(getLocale()));
  const bundledPhrases = $derived(countdownPhrases(undefined, language));
  const ownPhrases = $derived(
    voice.source === "custom" ? countdownPhrases(voice, language) : [],
  );
  const ownReadyCount = $derived(
    ownPhrases.filter((phrase) => currentPhraseIndex()[phrase.name]?.hasAudio)
      .length,
  );

  let busy = $state(false);
  let feedback = $state<string | null>(null);

  function setVoice(next: CountdownVoiceSetting) {
    feedback = null;
    SETTINGS.voice.state.countdownVoice = next;
  }

  async function generate() {
    const binding = countdownDigitBinding(voice);
    const source = bindingGenerationSource(binding);
    if (!source || voiceOperationActive()) return;
    busy = true;
    feedback = null;
    try {
      const phraseIds = await materializeBindingPhraseIds(binding, ownPhrases);
      if (!phraseIds.length) return;
      const summary = await runVoiceGeneration({
        source,
        phraseIds,
        backendPreference: SETTINGS.voice.state.generationBackend,
      });
      if (summary && summary.failed === 0) return;
      feedback =
        lastGenerationError() ??
        (summary
          ? t("voice.phrases.generate.summary", {
              completed: summary.completed,
              failed: summary.failed,
            })
          : null);
    } finally {
      busy = false;
    }
  }

  /** Counts "3, 2, 1" with what a countdown would play right now: the
   * user's digit when it has audio, else the bundled one. */
  async function tryPlay() {
    busy = true;
    try {
      for (const [position, digit] of PREVIEW_DIGITS.entries()) {
        const own = ownPhrases[digit - 1];
        const target =
          own && currentPhraseIndex()[own.name]?.hasAudio
            ? own
            : bundledPhrases[digit - 1];
        if (!target) continue;
        const phraseId = await upsertManagedPhrase(
          target.name,
          target.text,
          target.language,
        );
        if (phraseId) await commands.voiceTestTrigger(phraseId);
        if (position < PREVIEW_DIGITS.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="border-border/50 bg-muted/10 space-y-2 rounded border p-2.5">
  <div class="flex flex-wrap items-center gap-2">
    <label class="flex items-center gap-2 text-xs font-medium">
      {t("voice.countdown.source")}
      <select
        class="border-border/60 bg-muted/30 text-foreground rounded border px-1.5 py-1 text-xs"
        value={voice.source}
        onchange={(ev) =>
          setVoice(
            ev.currentTarget.value === "custom"
              ? { source: "custom" }
              : { source: "auto" },
          )}
      >
        <option value="auto">{t("voice.binding.source.preset")}</option>
        <option value="custom">{t("voice.countdown.source.custom")}</option>
      </select>
    </label>

    <button
      type="button"
      class="border-border/60 hover:bg-muted/40 ml-auto flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
      disabled={busy}
      onclick={tryPlay}
    >
      <PlayIcon class="h-3 w-3" />
      {t("voice.binding.tryPlay")}
    </button>
  </div>

  {#if voice.source === "custom"}
    <div class="flex flex-wrap items-center gap-2">
      <VoiceSourceSelect
        value={voice.generationSource}
        onchange={(generationSource) =>
          setVoice({ source: "custom", generationSource })}
      />
      <button
        type="button"
        class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs disabled:opacity-50"
        disabled={voiceOperationActive() ||
          busy ||
          !bindingGenerationSource(countdownDigitBinding(voice))}
        onclick={generate}>{t("voice.binding.generate")}</button
      >
      <span class="text-muted-foreground text-xs">
        {t("voice.countdown.generated", {
          count: ownReadyCount,
          total: ownPhrases.length,
        })}
      </span>
    </div>
    {#if feedback}
      <p class="text-destructive text-xs break-all">{feedback}</p>
    {/if}
    <p class="text-muted-foreground text-[11px]">
      {t("voice.countdown.customHint")}
    </p>
  {:else}
    <p class="text-muted-foreground text-[11px]">
      {t("voice.countdown.presetHint")}
    </p>
  {/if}
</div>
