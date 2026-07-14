const DEFAULT_MAX_TRACKED_INSTANCES = 200;

export class MinimapVoiceCueDeduper {
  private readonly seenOrder: string[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly maxTrackedInstances = DEFAULT_MAX_TRACKED_INSTANCES,
  ) {}

  reset(): void {
    this.seenOrder.length = 0;
    this.seen.clear();
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
