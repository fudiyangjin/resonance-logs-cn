<script lang="ts">
  import {
    getFightResTemplate,
    resolveResourceBar,
    shooterForm,
  } from "$lib/resource-bar";
  import { getResourceBarLayout } from "$lib/resource-bar-layouts";
  import FlowerRotationCell from "./FlowerRotationCell.svelte";
  import ProfessionCountCell from "./ProfessionCountCell.svelte";
  import ResourceBarPart from "./ResourceBarPart.svelte";
  import ResourceDotsPart from "./ResourceDotsPart.svelte";
  import ResourceSectionFrame from "./ResourceSectionFrame.svelte";
  import ResourceSiderLine from "./ResourceSiderLine.svelte";
  import {
    buffMap,
    fightResMap,
    resourceSections,
    resourceTextStyle,
    selectedClassKey,
  } from "./overlay-state.svelte.js";

  const sections = $derived(resourceSections());
  const classKey = $derived(selectedClassKey());
  const layout = $derived(getResourceBarLayout(classKey));
  const template = $derived(getFightResTemplate(classKey));
  const bar = $derived(
    template ? resolveResourceBar(template, fightResMap(), buffMap()) : null,
  );
  const form = $derived(shooterForm(buffMap()));
  const textStyle = $derived(resourceTextStyle());
</script>

<!-- Text size and colour for every resource number; `display: contents`
     keeps the sections positioned against the HUD layer. -->
<div
  class="resource-text-scope"
  style:--resource-font-size={`${textStyle.fontSize}px`}
  style:--resource-text-color={textStyle.color}
>
  {#each sections as section (section.key)}
    {@const content = section.content}
    {#if section.layout.visible}
      <ResourceSectionFrame
        sectionKey={section.key}
        label={section.label}
        layout={section.layout}
      >
        {#if content.type === "flowerRotation"}
          <FlowerRotationCell resource={content.definition} />
        {:else if content.type === "professionCount"}
          <ProfessionCountCell />
        {:else if layout && bar}
          {#if content.type === "bar"}
            <ResourceBarPart {layout} {bar} {form} />
          {:else if content.type === "dots"}
            <ResourceDotsPart layout={layout.dots} {bar} />
          {:else if content.type === "siderLine" && layout.siderLine}
            <ResourceSiderLine layout={layout.siderLine} {bar} />
          {/if}
        {/if}
      </ResourceSectionFrame>
    {/if}
  {/each}
</div>

<style>
  .resource-text-scope {
    display: contents;
  }
</style>
