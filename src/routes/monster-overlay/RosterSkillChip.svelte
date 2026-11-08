<script lang="ts">
  import { barMotion, type BarMotion } from "$lib/bar-motion.svelte.js";
  import { overlayNow } from "$lib/hud-temporal.svelte.js";
  import { t } from "$lib/i18n/index.svelte";
  import { formatSkillSeconds, rosterSkillPhase } from "./monster-roster";
  import type { MonsterRosterSkillChip } from "./monster-types";

  interface Props {
    chip: MonsterRosterSkillChip;
    fontSize: number;
  }

  let { chip, fontSize }: Props = $props();

  // The only subscriber to the overlay clock in a roster row: the row
  // itself is rebuilt by payloads, never by ticks.
  const nowMs = $derived(overlayNow());
  const phase = $derived(
    rosterSkillPhase({
      timing: chip.timing,
      customCooldownSeconds: chip.customCooldownSeconds ?? undefined,
      joinedAtMs: chip.joinedAtMs,
      lastCastAtMs: chip.lastCastAtMs,
      currentCastAtMs: chip.currentCastAtMs,
      nowMs,
    }),
  );
  const stateText = $derived.by(() => {
    switch (phase.kind) {
      case "casting":
        return formatSkillSeconds(phase.endsAtMs - nowMs);
      case "cast":
        return "⚡";
      case "cooling":
        return formatSkillSeconds(phase.readyAtMs - nowMs);
      case "ready":
        return t("monsterOverlay.roster.skillReady");
      case "unknown":
        return "—";
    }
  });
  // Described once per cast; the bar then fills on the compositor.
  const castMotion = $derived<BarMotion | null>(
    phase.kind === "casting"
      ? {
          kind: "countdown",
          deadlineMs: phase.endsAtMs,
          spanMs: phase.endsAtMs - phase.startedAtMs,
          fill: true,
        }
      : null,
  );
</script>

<span
  class="skill-chip phase-{phase.kind}"
  class:danger={phase.kind === "casting" && phase.danger}
  style:font-size={`${fontSize}px`}
  title={chip.label}
>
  {#if castMotion}
    <span class="skill-cast-track">
      <span
        class="skill-cast-fill"
        {@attach barMotion(() => castMotion ?? { kind: "static", scale: 0 })}
      ></span>
    </span>
  {/if}
  <span class="skill-label">{chip.label}</span>
  <span class="skill-state">{stateText}</span>
</span>

<style>
  /* Sized by its label, so short names are never cut; the state part keeps
     a minimum width so a countdown does not make the cell jitter. */
  .skill-chip {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    padding: 1px 5px;
    border-radius: 5px;
    overflow: hidden;
    line-height: 1.25;
    white-space: nowrap;
    text-shadow: var(--overlay-text-shadow, 0 0 3px rgba(0, 0, 0, 1));
    background: rgba(15, 23, 42, 0.45);
    color: rgba(226, 232, 240, 0.62);
  }

  .skill-label {
    position: relative;
    z-index: 1;
    flex: 0 0 auto;
    max-width: 8em;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .skill-state {
    position: relative;
    z-index: 1;
    flex: 0 0 auto;
    min-width: 2.2em;
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .phase-ready {
    color: #fde68a;
    background: rgba(180, 83, 9, 0.38);
    box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.55);
  }

  .phase-casting,
  .phase-cast {
    color: #fee2e2;
    background: rgba(127, 29, 29, 0.55);
    box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.75);
  }

  .phase-cast {
    animation: skill-cast-pop 300ms ease-out 1;
  }

  /* Only while a dangerous sing bar runs; stops with the phase. */
  .danger {
    animation: skill-danger-flash 500ms ease-in-out infinite alternate;
  }

  .skill-cast-track {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .skill-cast-fill {
    display: block;
    width: 100%;
    height: 100%;
    background: rgba(239, 68, 68, 0.55);
    transform-origin: left center;
    will-change: transform;
  }

  @keyframes skill-cast-pop {
    from {
      filter: brightness(1.8);
    }
    to {
      filter: brightness(1);
    }
  }

  @keyframes skill-danger-flash {
    from {
      box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.75);
    }
    to {
      box-shadow: inset 0 0 0 2px rgba(254, 202, 202, 1);
    }
  }
</style>
