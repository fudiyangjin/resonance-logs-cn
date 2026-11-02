/**
 * @file Attachments shared by the live window's one-line chip strips
 * (history damage targets, coverage players).
 */
import type { Attachment } from "svelte/attachments";

/** The strip is one line: let the vertical wheel scroll it sideways. */
export const wheelScrollsSideways: Attachment<HTMLElement> = (node) => {
  const onWheel = (event: WheelEvent) => {
    if (node.scrollWidth <= node.clientWidth) return;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    node.scrollLeft += event.deltaY;
    event.preventDefault();
  };
  node.addEventListener("wheel", onWheel, { passive: false });
  return () => node.removeEventListener("wheel", onWheel);
};

/** Keep the active chip in view when the strip overflows. */
export const revealWhenActive: Attachment<HTMLElement> = (node) => {
  node.scrollIntoView({ block: "nearest", inline: "nearest" });
};
