<script lang="ts">
  /**
   * @file A skill icon on the dark plate of the in-game skill button, tinted
   * by the skill's element colour (`SkillTable.PCBgColour`). Most class and
   * duty icons are white glyphs on transparency, unreadable over a bright
   * scene without it. Fills its container; size it from outside.
   */
  import { SKILL_BG_COLOURS } from "$lib/skill-mappings";

  interface Props {
    imagePath?: string | undefined;
    alt?: string | undefined;
    /** `PCBgColour` index; 0 draws the plate without a tint. */
    colour?: number;
    /** Unusable skill: the whole button greys out, like in game. */
    dimmed?: boolean;
    /** Off while another frame (e.g. a derivation glow) owns the edge. */
    stroke?: boolean;
  }

  let {
    imagePath,
    alt = "",
    colour = 0,
    dimmed = false,
    stroke = true,
  }: Props = $props();

  const tint = $derived(SKILL_BG_COLOURS[colour] ?? "");
</script>

<div
  class="skill-icon"
  class:tinted={tint !== ""}
  class:stroke={tint !== "" && stroke}
  class:dimmed
  style:--skill-tint={tint || undefined}
>
  {#if imagePath}
    <img src={imagePath} {alt} draggable="false" />
  {/if}
</div>

<style>
  .skill-icon {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    overflow: hidden;
    /* Keep the layers below inside, under the caller's CD overlay. */
    isolation: isolate;
    background: radial-gradient(
      circle at 50% 38%,
      rgba(48, 54, 64, 0.9),
      rgba(14, 16, 20, 0.9) 72%
    );
  }

  .skill-icon.tinted::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to top,
      color-mix(in srgb, var(--skill-tint) 70%, transparent),
      transparent 62%
    );
    pointer-events: none;
  }

  .skill-icon.stroke::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: inherit;
    box-shadow: inset 0 0 0 max(1px, calc(1.5px * var(--skill-cell-scale, 1)))
      color-mix(in srgb, var(--skill-tint) 85%, transparent);
    pointer-events: none;
  }

  .skill-icon.dimmed {
    filter: grayscale(80%) brightness(0.5);
  }

  img {
    position: relative;
    z-index: 1;
    display: block;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    /* Contain, not cover: several class icons are not square. */
    padding: 7%;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
  }
</style>
