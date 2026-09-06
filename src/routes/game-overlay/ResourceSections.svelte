<script lang="ts">
  import FlowerRotationCell from "./FlowerRotationCell.svelte";
  import ResourceBar from "./ResourceBar.svelte";
  import ResourceCharges from "./ResourceCharges.svelte";
  import ResourceSectionFrame from "./ResourceSectionFrame.svelte";
  import { resourceSections } from "./overlay-state.svelte.js";

  const sections = $derived(resourceSections());
</script>

{#each sections as section (section.key)}
  {@const definition = section.definition}
  {#if section.layout.visible}
    <ResourceSectionFrame
      sectionKey={section.key}
      label={definition.label}
      layout={section.layout}
    >
      {#if definition.type === "flowerRotation"}
        <FlowerRotationCell resource={definition} />
      {:else if definition.type === "bar"}
        <ResourceBar resource={definition} />
      {:else}
        <ResourceCharges resource={definition} />
      {/if}
    </ResourceSectionFrame>
  {/if}
{/each}
