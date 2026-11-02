/**
 * @file Route upkeep for the live window's display-source switches.
 */
import { goto } from "$app/navigation";
import { page } from "$app/state";
import {
  isLiveCoveragePath,
  isLiveDrillDown,
  isLiveHistoryPath,
} from "$lib/live-history-query";
import { liveView } from "$lib/stores/live-view-source.svelte";

/**
 * Drill-down pages address entities of the source they were opened from, and
 * the picker has done its job once a source is chosen: both go back to the
 * remembered page. The coverage page follows the shown encounter, so it only
 * leaves once live data is shown (it has no live counterpart).
 */
export async function settleLiveRoute(): Promise<void> {
  const pathname = page.url.pathname;
  if (
    isLiveDrillDown(pathname) ||
    isLiveHistoryPath(pathname) ||
    (isLiveCoveragePath(pathname) && !liveView.isHistory)
  ) {
    await goto(liveView.returnPath);
  }
}
