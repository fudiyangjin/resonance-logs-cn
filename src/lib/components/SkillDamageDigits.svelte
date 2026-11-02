<script lang="ts">
  import type {
    SkillDamageNumberStyle,
    SkillDamagePaint,
  } from "$lib/settings-store";
  let { text, style }: { text: string; style: SkillDamageNumberStyle } =
    $props();
  const uid = $props.id();
  let width = $state(1);
  let height = $state(1);
  const effectPadding = $derived(
    Math.max(4, style.outerGlowSize * 3, style.shadowSize * 3),
  );
  const paints = $derived([
    style.fill,
    style.innerGlowColor,
    style.outlineColor,
    style.outerGlowColor,
    style.shadowColor,
  ]);
  function paint(color: SkillDamagePaint, index: number) {
    return color.mode === "gradient"
      ? `url(#${uid}-paint-${index})`
      : color.color;
  }
</script>

<span class="digits" style:font-style={style.italic ? "italic" : "normal"}>
  <span
    class="measure"
    aria-hidden="true"
    bind:clientWidth={width}
    bind:clientHeight={height}>{text}</span
  >
  <svg
    class="art"
    width={Math.max(1, width)}
    height={Math.max(1, height)}
    viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
    role="img"
    aria-label={text}
  >
    <defs>
      {#each paints as color, index}
        <linearGradient
          id={`${uid}-paint-${index}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
          gradientTransform={`rotate(${color.angle} .5 .5)`}
        >
          <stop offset="0%" stop-color={color.color} /><stop
            offset="100%"
            stop-color={color.endColor}
          />
        </linearGradient>
      {/each}
      <filter
        id={`${uid}-outer`}
        filterUnits="userSpaceOnUse"
        x={-effectPadding}
        y={-effectPadding}
        width={width + effectPadding * 2}
        height={height + effectPadding * 2}
        ><feGaussianBlur stdDeviation={style.outerGlowSize / 2} /></filter
      >
      <filter
        id={`${uid}-shadow`}
        filterUnits="userSpaceOnUse"
        x={-effectPadding}
        y={-effectPadding}
        width={width + effectPadding * 2}
        height={height + effectPadding * 2}
        ><feGaussianBlur stdDeviation={style.shadowSize / 3} /></filter
      >
      <filter id={`${uid}-inner`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur
          in="SourceAlpha"
          stdDeviation={style.innerGlowSize / 2}
          result="blur"
        />
        <feComposite
          in="SourceAlpha"
          in2="blur"
          operator="arithmetic"
          k2="1"
          k3="-1"
          result="edge"
        />
        <feComposite in="SourceGraphic" in2="edge" operator="in" />
      </filter>
    </defs>
    {#snippet glyph(
      fill: string,
      stroke: string = "none",
      strokeWidth: number = 0,
      filter: string = "",
      offset: number = 0,
    )}
      <text
        x={offset}
        y={height * 0.8 + offset}
        {fill}
        {stroke}
        stroke-width={strokeWidth}
        stroke-linejoin="round"
        paint-order="stroke fill"
        textLength={Math.max(1, width)}
        lengthAdjust="spacingAndGlyphs"
        filter={filter || undefined}>{text}</text
      >
    {/snippet}
    {#if style.shadow}{@render glyph(
        paint(style.shadowColor, 4),
        "none",
        0,
        `url(#${uid}-shadow)`,
        style.shadowSize / 3,
      )}{/if}
    {#if style.outerGlow}{@render glyph(
        paint(style.outerGlowColor, 3),
        "none",
        0,
        `url(#${uid}-outer)`,
      )}{/if}
    {@render glyph(
      paint(style.fill, 0),
      style.outline ? paint(style.outlineColor, 2) : "none",
      style.outline ? style.outlineWidth * 2 : 0,
    )}
    {#if style.innerGlow}{@render glyph(
        paint(style.innerGlowColor, 1),
        "none",
        0,
        `url(#${uid}-inner)`,
      )}{/if}
  </svg>
</span>

<style>
  .digits {
    position: relative;
    display: inline-block;
    text-shadow: none;
  }
  .measure {
    visibility: hidden;
    display: inline-block;
    white-space: pre;
  }
  .art {
    position: absolute;
    left: 0;
    top: 0;
    overflow: visible;
    font: inherit;
  }
  text {
    font: inherit;
  }
</style>
