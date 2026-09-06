<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "$lib/i18n/index.svelte";
  import type { ResourceSectionLayout } from "$lib/settings-store";
  import {
    isEditing,
    selectedClassKey,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";

  interface Props {
    sectionKey: string;
    label: string;
    layout: ResourceSectionLayout;
    children: Snippet;
  }

  let { sectionKey, label, layout, children }: Props = $props();

  const editing = $derived(isEditing());
  const classKey = $derived(selectedClassKey());
</script>

<div
  class="overlay-group resource-section"
  class:editable={editing}
  style:left={`${layout.position.x}px`}
  style:top={`${layout.position.y}px`}
  style:transform={`scale(${layout.scale})`}
  style:transform-origin="top left"
  onpointerdown={(e) =>
    startDrag(e, { kind: "resourceSection", key: sectionKey }, layout.position)}
>
  {#if editing}
    <div class="group-tag">
      {t("gameOverlay.group.resource")} · {label}
    </div>
  {/if}

  <div class="resource-section-body" data-class={classKey}>
    {@render children()}
  </div>

  {#if editing}
    <div
      class="resize-handle"
      onpointerdown={(e) =>
        startResize(
          e,
          { kind: "resourceSection", key: sectionKey },
          layout.scale,
        )}
    ></div>
  {/if}
</div>

<style>
  .resource-section.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .resource-section-body {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .resource-section-body[data-class="frost_mage"] {
    transform: scale(1.5);
    transform-origin: top left;
  }
</style>
