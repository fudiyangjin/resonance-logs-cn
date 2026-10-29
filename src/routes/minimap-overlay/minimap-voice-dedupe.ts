import type { MinimapVoiceCueFire } from "./scene-types";

const DEFAULT_MAX_TRACKED_INSTANCES = 200;

export class MinimapVoiceCueDeduper {
  private readonly seenOrder: string[] = [];
  private readonly seen = new Set<string>();
  private activeCues = new Set<string>();

  constructor(
    private readonly maxTrackedInstances = DEFAULT_MAX_TRACKED_INSTANCES,
  ) {}

  reset(): void {
    this.seenOrder.length = 0;
    this.seen.clear();
    this.activeCues.clear();
  }

  filterFrame(fires: MinimapVoiceCueFire[]): MinimapVoiceCueFire[] {
    const active = new Set<string>();
    const result: MinimapVoiceCueFire[] = [];
    for (const fire of fires) {
      if (fire.onceWhileActive) {
        if (!this.activeCues.has(fire.cueId) && !active.has(fire.cueId)) {
          result.push(fire);
        }
        active.add(fire.cueId);
      } else if (this.shouldFire(fire.cueId, fire.instanceKey)) {
        result.push(fire);
      }
    }
    this.activeCues = active;
    return result;
  }

  shouldFire(cueId: string, instanceKey: string): boolean {
    const dedupeKey = `${cueId}:${instanceKey}`;
    if (this.seen.has(dedupeKey)) return false;
    this.seen.add(dedupeKey);
    this.seenOrder.push(dedupeKey);
    if (this.seenOrder.length > this.maxTrackedInstances) {
      const evicted = this.seenOrder.shift();
      if (evicted !== undefined) this.seen.delete(evicted);
    }
    return true;
  }
}
