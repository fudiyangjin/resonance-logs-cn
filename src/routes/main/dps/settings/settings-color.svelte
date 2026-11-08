<script lang="ts">
  import ColorField from "$lib/components/ColorField.svelte";

  let {
    label = "",
    description = "",
    value = $bindable("#ffffff"),
  }: {
    label: string;
    description?: string | undefined;
    value: string;
  } = $props();
</script>

<ColorField {label} {description} {value} onchange={(hex) => (value = hex)} />
