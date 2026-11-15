<script lang="ts">
  /**
   * @file Picker of the voice some managed phrases are generated with:
   * the voice settings' source (`undefined`), a bundled preset voice or an
   * HTTP provider. A pinned provider that was removed stays listed, disabled.
   */
  import { t } from "$lib/i18n/index.svelte";
  import { APP_LOCALES, LOCALE_NATIVE_NAMES } from "$lib/i18n/locales";
  import type { VoiceBindingGenerationSource } from "$lib/settings-store";
  import { VOICE } from "$lib/stores/voice-store.svelte";
  import {
    decodeBindingSource,
    encodeBindingSource,
  } from "$lib/voice/generation-source";

  let {
    value,
    onchange,
  }: {
    value: VoiceBindingGenerationSource | undefined;
    onchange: (next: VoiceBindingGenerationSource | undefined) => void;
  } = $props();

  const httpProviders = $derived(VOICE.status?.catalog.httpProviders ?? []);
</script>

<label class="flex items-center gap-2 text-xs">
  {t("voice.binding.generationSource")}
  <select
    class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1 text-xs"
    value={encodeBindingSource(value)}
    onchange={(ev) => onchange(decodeBindingSource(ev.currentTarget.value))}
  >
    <option value="default">{t("voice.binding.generationDefault")}</option>
    <optgroup label={t("voice.phrases.generate.presetSource")}>
      {#each APP_LOCALES as locale (locale)}
        <option value={encodeBindingSource({ mode: "preset", locale })}
          >{LOCALE_NATIVE_NAMES[locale]}</option
        >
      {/each}
    </optgroup>
    <optgroup label={t("voice.http.title")}>
      {#if value?.mode === "http" && !httpProviders.some((provider) => provider.id === value.providerId)}
        <option value={encodeBindingSource(value)} disabled
          >{t("voice.binding.generationUnavailable")}</option
        >
      {/if}
      {#each httpProviders as provider (provider.id)}
        <option
          value={encodeBindingSource({
            mode: "http",
            providerId: provider.id,
          })}>{provider.name}</option
        >
      {/each}
    </optgroup>
  </select>
</label>
