<script lang="ts">
  type BackgroundImageMode = "cover" | "contain" | "fit-width";

  let {
    enabled = false,
    image = "",
    mode = "cover",
    containColor = "rgba(0, 0, 0, 0)",
    opacity = 100,
  }: {
    enabled?: boolean;
    image?: string;
    mode?: BackgroundImageMode;
    containColor?: string;
    opacity?: number;
  } = $props();

  const visible = $derived(enabled && image.length > 0);
  const normalizedOpacity = $derived(Math.max(0, Math.min(100, opacity)) / 100);
  const layerStyle = $derived.by(() => {
    if (!visible) return "";
    const size = mode === "fit-width" ? "100% auto" : mode;
    const position = mode === "fit-width" ? "top center" : "center";

    return [
      `opacity: ${normalizedOpacity}`,
      `background-image: url("${image}")`,
      `background-size: ${size}`,
      `background-position: ${position}`,
      "background-repeat: no-repeat",
      `background-color: ${mode === "cover" ? "transparent" : containColor}`,
    ].join("; ");
  });
</script>

{#if visible}
  <div
    class="pointer-events-none absolute inset-0 z-0"
    style={layerStyle}
  ></div>
{/if}
