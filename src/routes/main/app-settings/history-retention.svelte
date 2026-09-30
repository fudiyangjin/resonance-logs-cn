<script lang="ts">
  import { commands } from "$lib/bindings";
  import {
    DEFAULT_HISTORY_RETENTION_LIMIT,
    MAX_HISTORY_RETENTION_LIMIT,
    MIN_HISTORY_RETENTION_LIMIT,
    normalizeHistoryRetentionLimit,
  } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import { onMount } from "svelte";

  let draft = $state(String(DEFAULT_HISTORY_RETENTION_LIMIT));
  let dirty = $state(false);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let saved = $state(false);

  onMount(() => {
    void commands
      .getHistoryRetentionLimit()
      .then((limit) => {
        if (!dirty) {
          draft = String(normalizeHistoryRetentionLimit(limit));
        }
      })
      .catch(() => {
        // Leave the default in the field when the saved file cannot be read.
      });
  });

  function validateDraft(): number | null {
    const value = Number.parseInt(draft, 10);
    if (!/^\d+$/.test(draft) || !Number.isSafeInteger(value)) {
      error = t("appSettings.historyRetention.invalid");
      return null;
    }
    if (
      value < MIN_HISTORY_RETENTION_LIMIT ||
      value > MAX_HISTORY_RETENTION_LIMIT
    ) {
      error = t("appSettings.historyRetention.range", {
        min: MIN_HISTORY_RETENTION_LIMIT,
        max: MAX_HISTORY_RETENTION_LIMIT,
      });
      return null;
    }
    error = null;
    return value;
  }

  async function save() {
    const value = validateDraft();
    if (value === null || saving) return;

    saving = true;
    saved = false;
    try {
      const result = await commands.saveHistoryRetentionLimit(value);
      if (result.status === "error") {
        error = t("appSettings.historyRetention.saveFailed", {
          error: String(result.error),
        });
        return;
      }
      dirty = false;
      saved = true;
    } catch (saveError) {
      error = t("appSettings.historyRetention.saveFailed", {
        error: String(saveError),
      });
    } finally {
      saving = false;
    }
  }
</script>

<div
  class="border-border/60 bg-card/40 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
>
  <div class="px-4 py-3">
    <h2 class="text-foreground mb-1 text-base font-semibold">
      {t("appSettings.historyRetention.title")}
    </h2>
    <p class="text-muted-foreground mb-3 text-xs">
      {t("appSettings.historyRetention.description")}
    </p>

    <div class="flex flex-wrap items-end gap-2">
      <label class="text-foreground flex flex-col gap-1 text-sm">
        <span>{t("appSettings.historyRetention.limit")}</span>
        <input
          type="number"
          inputmode="numeric"
          min={MIN_HISTORY_RETENTION_LIMIT}
          max={MAX_HISTORY_RETENTION_LIMIT}
          step="1"
          value={draft}
          oninput={(event) => {
            draft = (event.currentTarget as HTMLInputElement).value;
            dirty = true;
            saved = false;
            error = null;
          }}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
          class="bg-popover border-border text-foreground focus:ring-primary w-24 rounded border px-2 py-1.5 focus:ring-2 focus:outline-none"
          aria-describedby="history-retention-help history-retention-error"
        />
      </label>
      <button
        type="button"
        class="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        disabled={saving || !dirty}
        onclick={() => void save()}
      >
        {saving
          ? t("appSettings.historyRetention.saving")
          : t("appSettings.historyRetention.save")}
      </button>
    </div>

    <p id="history-retention-help" class="text-muted-foreground mt-2 text-xs">
      {t("appSettings.historyRetention.help", {
        max: MAX_HISTORY_RETENTION_LIMIT,
      })}
    </p>
    {#if error}
      <p id="history-retention-error" class="text-destructive mt-1 text-xs">
        {error}
      </p>
    {:else if saved}
      <p class="text-muted-foreground mt-1 text-xs">
        {t("appSettings.historyRetention.saved")}
      </p>
    {/if}
  </div>
</div>
