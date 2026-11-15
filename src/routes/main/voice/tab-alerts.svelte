<script lang="ts">
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import VoiceCountdownControl from "$lib/components/voice-countdown-control.svelte";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import { SETTINGS, type GameAlertKind } from "$lib/settings-store";

  const ALERTS = [
    {
      kind: "matchReady",
      titleKey: "voice.alerts.matchReady.title",
      descriptionKey: "voice.alerts.matchReady.description",
    },
    {
      kind: "readyCheck",
      titleKey: "voice.alerts.readyCheck.title",
      descriptionKey: "voice.alerts.readyCheck.description",
    },
    {
      kind: "teamVote",
      titleKey: "voice.alerts.teamVote.title",
      descriptionKey: "voice.alerts.teamVote.description",
    },
  ] satisfies Array<{
    kind: GameAlertKind;
    titleKey: MessageKey;
    descriptionKey: MessageKey;
  }>;
</script>

<div class="space-y-4">
  <section class="border-border/60 bg-card/60 space-y-2 rounded-xl border p-5">
    <h2 class="text-base font-semibold">{t("voice.alerts.title")}</h2>
    <p class="text-muted-foreground text-sm">
      {t("voice.alerts.description")}
    </p>
    {#if !SETTINGS.voice.state.enabled}
      <p class="text-amber-600 dark:text-amber-400 text-sm">
        {t("voice.alerts.voiceDisabled")}
      </p>
    {/if}
    <p class="text-muted-foreground text-xs">
      {t("voice.alerts.generationHint")}
    </p>
  </section>

  {#each ALERTS as alert (alert.kind)}
    <section
      class="border-border/60 bg-card/60 space-y-3 rounded-xl border p-5"
    >
      <div>
        <h3 class="text-sm font-semibold">{t(alert.titleKey)}</h3>
        <p class="text-muted-foreground mt-1 text-xs">
          {t(alert.descriptionKey)}
        </p>
      </div>
      <VoiceBindingControl
        subject={{ kind: "gameAlert", alertKind: alert.kind }}
      />
    </section>
  {/each}

  <section class="border-border/60 bg-card/60 space-y-3 rounded-xl border p-5">
    <div>
      <h3 class="text-sm font-semibold">{t("voice.countdown.title")}</h3>
      <p class="text-muted-foreground mt-1 text-xs">
        {t("voice.countdown.description")}
      </p>
    </div>
    <VoiceCountdownControl />
  </section>
</div>
