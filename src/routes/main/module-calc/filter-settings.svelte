<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Slider } from "$lib/components/ui/slider";
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveModuleCalcTranslation } from "$lib/i18n";

  function t(key: string, fallback: string): string {
    return resolveModuleCalcTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function formatLevelValue(value: number): string {
    return t("filterSettings.level", "{value}级").replace("{value}", String(value));
  }

  type AttrOption = { id: number; label: string };
  type MinReq = { attrId: number | null; value: number | null };

  let {
    attributeOptions = [],
    targetAttributes = $bindable<number[]>([]),
    excludeAttributes = $bindable<number[]>([]),
    minTotalValue = $bindable(12),
    minRequirements = $bindable<MinReq[]>([{ attrId: null, value: null }]),
  }: {
    attributeOptions: AttrOption[];
    targetAttributes: number[];
    excludeAttributes: number[];
    minTotalValue: number;
    minRequirements: MinReq[];
  } = $props();

  let isExpanded = $state(true);

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
  <button
    type="button"
    class="flex w-full items-center justify-between gap-3 text-left"
    onclick={() => (isExpanded = !isExpanded)}
    aria-expanded={isExpanded}
  >
    <div class="text-base font-semibold text-foreground">
      {t("filterSettings", "筛选设置")}
    </div>
    <ChevronDownIcon
      class="h-5 w-5 shrink-0 text-muted-foreground transition-transform {isExpanded ? 'rotate-180' : ''}"
    />
  </button>

  {#if isExpanded}
    <div class="space-y-2">
      <div class="text-sm text-foreground">
        {t("excludeLowTotalValue", "排除总值低于多少的模组:")}
      </div>
      <div class="flex items-center gap-4">
        <Slider
          type="single"
          bind:value={minTotalValue}
          min={0}
          max={30}
          step={1}
          class="max-w-[70%]"
        />
        <div class="min-w-12 text-sm text-foreground">
          {formatLevelValue(minTotalValue)}
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <div class="text-sm text-muted-foreground">
        {t("targetAttributesDescription", "目标属性, 选中后只会计算携带该属性的模组(模组数超过1000时可利用该设置先进行筛选)")}
      </div>
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
      <div class="text-sm text-muted-foreground">
        {t("excludeAttributes", "排除属性")}
      </div>
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
      <div class="text-sm text-muted-foreground">
        {t("minAttributeRequirements", "最小属性要求")}
      </div>
      <div class="space-y-2">
        {#each minRequirements as req, idx}
          <div class="flex items-center gap-2">
            <select
              class="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-ring"
              value={req.attrId ?? ""}
              onchange={(e) =>
                updateMin(idx, "attrId", parseNullableNumber((e.target as HTMLSelectElement).value))}
            >
              <option value="" class="bg-popover text-foreground">
                {t("selectAttribute", "选择属性")}
              </option>
              {#each attributeOptions as opt}
                <option value={opt.id} class="bg-popover text-foreground">{opt.label}</option>
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
            <Button size="sm" variant="ghost" onclick={() => removeMin(idx)}>
              {t("remove", "移除")}
            </Button>
          </div>
        {/each}
      </div>
      <Button size="sm" variant="outline" onclick={addMin}>
        {t("add", "+ 添加")}
      </Button>
    </div>
  {/if}
</div>
