<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";

  type AttrOption = { id: number; label: string };
  type MinReq = { attrId: number | null; value: number | null };

  let {
    attributeOptions = [],
    targetAttributes = $bindable<number[]>([]),
    excludeAttributes = $bindable<number[]>([]),
    minRequirements = $bindable<MinReq[]>([{ attrId: null, value: null }]),
  }: {
    attributeOptions: AttrOption[];
    targetAttributes: number[];
    excludeAttributes: number[];
    minRequirements: MinReq[];
  } = $props();

  function toggle(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function updateMin(idx: number, field: "attrId" | "value", val: number | null) {
    const next = [...minRequirements];
    const current = next[idx] ?? { attrId: null, value: null };
    if (field === "attrId") {
      next[idx] = { attrId: val, value: current.value };
    } else {
      next[idx] = { attrId: current.attrId, value: val };
    }
    minRequirements = next;
  }

  function parseNullableNumber(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function addMin() {
    minRequirements = [...minRequirements, { attrId: null, value: null }];
  }

  function removeMin(idx: number) {
    minRequirements = minRequirements.filter((_, i) => i !== idx);
  }
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
  <div class="text-base font-semibold text-foreground">Filter Settings</div>

  <div class="space-y-2">
    <div class="text-sm text-muted-foreground">Target attributes — when selected, only modules carrying these attributes are included (useful to pre-filter when module count exceeds 1000)</div>
    <div class="flex flex-wrap gap-2">
      {#each attributeOptions as opt}
        <Button
          size="sm"
          variant={targetAttributes.includes(opt.id) ? "default" : "outline"}
          onclick={() => (targetAttributes = toggle(targetAttributes, opt.id))}
        >
          {opt.label}
        </Button>
      {/each}
    </div>
  </div>

  <div class="space-y-2">
    <div class="text-sm text-muted-foreground">Exclude Attributes</div>
    <div class="flex flex-wrap gap-2">
      {#each attributeOptions as opt}
        <Button
          size="sm"
          variant={excludeAttributes.includes(opt.id) ? "default" : "outline"}
          onclick={() => (excludeAttributes = toggle(excludeAttributes, opt.id))}
        >
          {opt.label}
        </Button>
      {/each}
    </div>
  </div>

  <div class="space-y-3">
    <div class="text-sm text-muted-foreground">Minimum Attribute Requirements</div>
    <div class="space-y-2">
      {#each minRequirements as req, idx}
        <div class="flex items-center gap-2">
          <select
            class="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={req.attrId ?? ""}
            onchange={(e) =>
              updateMin(idx, "attrId", parseNullableNumber((e.target as HTMLSelectElement).value))}
          >
            <option value="">Select attribute</option>
            {#each attributeOptions as opt}
              <option value={opt.id}>{opt.label}</option>
            {/each}
          </select>
          <Input
            type="number"
            min="0"
            class="w-24"
            value={req.value ?? ""}
            onchange={(e) =>
              updateMin(idx, "value", parseNullableNumber((e.target as HTMLInputElement).value))}
          />
          <Button size="sm" variant="ghost" onclick={() => removeMin(idx)}>Remove</Button>
        </div>
      {/each}
    </div>
    <Button size="sm" variant="outline" onclick={addMin}>+ Add</Button>
  </div>
</div>
