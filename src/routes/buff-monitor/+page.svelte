<script lang="ts">
  import { onMount } from "svelte";
  import { onBuffUpdate, type BuffUpdateState } from "$lib/api";
  import { commands, type BuffDefinition } from "$lib/bindings";
  import { SETTINGS } from "$lib/settings-store";
  import { findSpecialBuffDisplays } from "$lib/skill-mappings";
  import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
  type BuffDisplay = {
    baseId: number;
    name: string;
    spriteFile: string;
    talentSpriteFile: string | null;
    text: string;
    layer: number;
  };

  type SpecialBuffActive = {
    buffBaseId: number;
    images: string[];
  };

  let buffMap = $state(new Map<number, BuffUpdateState>());
  let buffDefinitions = $state(new Map<number, BuffDefinition>());
  let displayBuffs = $state<BuffDisplay[]>([]);
  let activeSpecialBuffs = $state<SpecialBuffActive[]>([]);
  let rafId: number | null = null;
  const activeProfile = $derived.by(() => {
    const profiles = SETTINGS.skillMonitor.state.profiles;
    if (profiles.length === 0) return null;
    const index = Math.min(
      Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
      profiles.length - 1,
    );
    return profiles[index];
  });
  const selectedClassKey = $derived(activeProfile?.selectedClass ?? "wind_knight");
  const specialBuffConfigs = $derived(findSpecialBuffDisplays(selectedClassKey));

  function updateDisplay() {
    const now = Date.now();
    const next: BuffDisplay[] = [];

    for (const [baseId, buff] of buffMap) {
      const def = buffDefinitions.get(baseId);
      if (!def?.spriteFile) continue;

      const end = buff.createTimeMs + buff.durationMs;
      const remaining = Math.max(0, end - now);
      if (remaining <= 0) continue;

      next.push({
        baseId,
        name: def.name,
        spriteFile: def.spriteFile,
        talentSpriteFile: def.talentSpriteFile,
        text: (remaining / 1000).toFixed(1),
        layer: buff.layer,
      });
    }

    next.sort((a, b) => a.baseId - b.baseId);
    displayBuffs = next;

    const nextSpecialBuffs: SpecialBuffActive[] = [];
    for (const config of specialBuffConfigs) {
      const buff = buffMap.get(config.buffBaseId);
      if (!buff || buff.durationMs <= 0) continue;

      const end = buff.createTimeMs + buff.durationMs;
      if (end <= now) continue;

      const layer = Math.max(1, buff.layer);
      const layerIdx = Math.min(config.layerImages.length - 1, layer - 1);
      const images = config.layerImages[layerIdx] ?? [];
      if (images.length === 0) continue;

      nextSpecialBuffs.push({
        buffBaseId: config.buffBaseId,
        images,
      });
    }
    activeSpecialBuffs = nextSpecialBuffs;
    rafId = requestAnimationFrame(updateDisplay);
  }

  onMount(() => {
    // Force transparent background for overlay window.
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "background",
        "transparent",
        "important",
      );
      document.body.style.setProperty(
        "background",
        "transparent",
        "important",
      );
    }

    void (async () => {
      try {
        const win = getCurrentWindow();
        const size = await win.innerSize();
        await win.setSize(new PhysicalSize(size.width + 1, size.height + 1));
        await win.setSize(new PhysicalSize(size.width, size.height));
      } catch (error) {
        console.warn("[buff-monitor] resize hack failed", error);
      }
    })();

    void (async () => {
      const res = await commands.getAvailableBuffs();
      if (res.status === "ok") {
        const next = new Map<number, BuffDefinition>();
        for (const buff of res.data) {
          next.set(buff.baseId, buff);
        }
        buffDefinitions = next;
      }
    })();

    const unlistenBuff = onBuffUpdate((event) => {
      const next = new Map<number, BuffUpdateState>();
      for (const buff of event.payload.buffs) {
        const existing = next.get(buff.baseId);
        if (!existing || buff.createTimeMs >= existing.createTimeMs) {
          next.set(buff.baseId, buff);
        }
      }
      buffMap = next;
    });

    rafId = requestAnimationFrame(updateDisplay);

    return () => {
      unlistenBuff.then((fn) => fn());
      if (rafId) cancelAnimationFrame(rafId);
    };
  });


  const win = getCurrentWindow();

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;

    const el = e.target as HTMLElement | null;
    if (el?.closest("button,a,input,textarea,select,[data-no-drag]")) return;

    e.preventDefault();
    void win.startDragging();
  }

</script>

<div
  class="buff-monitor-root"
  class:has-special={activeSpecialBuffs.length > 0}
  on:pointerdown={onPointerDown}
>
  <div class="buff-main-section">
    {#if displayBuffs.length > 0}
      <div class="buff-row">
        {#each displayBuffs as buff (buff.baseId)}
          <div class="buff-cell">
            <div class="buff-name-label">{buff.name.slice(0, 4)}</div>
            <div class="buff-icon-wrap">
              <img
                src={buff.talentSpriteFile
                  ? `/images/talent/${buff.talentSpriteFile}`
                  : `/images/buff/${buff.spriteFile}`}
                alt={buff.name}
                class="buff-icon"
              />
              {#if buff.layer > 1}
                <div class="layer-badge">{buff.layer}</div>
              {/if}
            </div>
            <div class="buff-time">{buff.text}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if activeSpecialBuffs.length > 0}
    <div class="special-buff-section">
      <div class="special-buff-row">
        {#each activeSpecialBuffs as special (special.buffBaseId)}
          <div class="special-buff-stack">
            {#each special.images as imgSrc (imgSrc)}
              <img src={imgSrc} alt="special buff" class="special-buff-icon" />
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .buff-monitor-root {
    display: grid;
    grid-template-rows: 1fr;
    align-items: stretch;
    justify-items: center;
    width: 100vw;
    height: 100vh;
    box-sizing: border-box;
    padding: 6px;
    border-radius: 8px;
    background: transparent;
    user-select: none;
    gap: 8px;
  }

  .buff-monitor-root.has-special {
    grid-template-rows: 1fr 78px;
  }

  .buff-main-section {
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: hidden;
  }

  .buff-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
    justify-content: center;
    max-width: calc(5 * 52px + 4 * 8px);
    max-height: 100%;
    overflow: hidden;
  }

  .special-buff-section {
    width: 100%;
    height: 78px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .special-buff-row {
    display: flex;
    justify-content: center;
    gap: 12px;
  }

  .special-buff-stack {
    position: relative;
    width: 80px;
    height: 80px;
  }

  .special-buff-icon {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.9));
  }

  .buff-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 52px;
  }

  .buff-name-label {
    font-size: 10px;
    color: #ffffff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
    line-height: 1;
    pointer-events: none;
    max-width: 52px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .buff-icon-wrap {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
  }

  .buff-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .buff-time {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
    line-height: 1;
    pointer-events: none;
  }

  .layer-badge {
    position: absolute;
    right: 2px;
    top: 2px;
    padding: 1px 4px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.6);
    color: #ffffff;
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
    pointer-events: none;
  }
  

  :global(html),
  :global(body) {
    background: transparent !important;
    width: 100%;
    height: 100%;
    margin: 0;
  }

  :global(body) {
    overflow: hidden;
  }
</style>
