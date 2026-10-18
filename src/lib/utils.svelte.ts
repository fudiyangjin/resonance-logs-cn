/**
 * @file This file contains utility functions and constants for the application.
 */
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css"; // optional for styling
import type { Attachment } from "svelte/attachments";
// import html2canvas from "html2canvas-pro";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
// import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
// import { image } from '@tauri-apps/api';
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import {
  SETTINGS,
  DEFAULT_CLASS_COLORS,
  DEFAULT_CLASS_SPEC_COLORS,
  CLASS_SPEC_MAP,
} from "$lib/settings-store";

export const CLASS_MAP: Record<number, string> = {
  1: "Stormblade",
  2: "Frost Mage",
  3: "Flame Berserker",
  4: "Wind Knight",
  5: "Verdant Oracle",
  9: "Heavy Guardian",
  11: "Marksman",
  12: "Shield Knight",
  13: "Beat Performer",
};

export const CLASS_NAMES = Object.values(CLASS_MAP);

export function getClassColorRaw(
  className: string,
  classSpecName?: string,
): string {
  // Class/spec colors travel with the active loadout's live profile (see
  // `SETTINGS.live.appearance`), so both the main window's history views and
  // the live overlay follow whichever loadout is currently active.
  const appearance = SETTINGS.live.appearance.state;
  const useSpec = appearance.useClassSpecColors;
  if (useSpec && classSpecName && classSpecName in CLASS_SPEC_MAP) {
    const specColors = appearance.classSpecColors ?? DEFAULT_CLASS_SPEC_COLORS;
    return (
      specColors[classSpecName] ??
      DEFAULT_CLASS_SPEC_COLORS[classSpecName] ??
      "#ffc9ed"
    );
  }
  const classColors = appearance.classColors ?? DEFAULT_CLASS_COLORS;
  return classColors[className] ?? DEFAULT_CLASS_COLORS[className] ?? "#ffc9ed";
}

export function getClassColor(
  className: string,
  classSpecName?: string,
): string {
  return `rgb(from ${getClassColorRaw(className, classSpecName)} r g b / 0.6)`;
}

export function getClassIcon(class_name: string): string {
  if (class_name === "") {
    return "/images/classes/blank.png";
  }
  return "/images/classes/" + class_name + ".png";
}

// https://svelte.dev/docs/svelte/@attach#Attachment-factories
export function tooltip(getContent: () => string): Attachment {
  return (element: Element) => {
    const instance = tippy(element, {
      content: getContent(),
      theme: "resonance",
      arrow: true,
      delay: [200, 80],
      duration: [120, 80],
      animation: "fade",
      moveTransition: "transform 120ms ease-out",
      placement: "top",
    });

    // Keep content in sync with reactive source
    $effect(() => {
      instance.setContent(getContent());
    });

    return () => instance.destroy();
  };
}

/**
 * Enter commits a typed field: blurring fires its `change`. The Enter that
 * confirms an IME composition is left alone.
 */
export const blurOnEnter: Attachment<HTMLInputElement> = (input) => {
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.isComposing) input.blur();
  };
  input.addEventListener("keydown", onKeydown);
  return () => input.removeEventListener("keydown", onKeydown);
};

export async function copyToClipboard(
  error: MouseEvent & { currentTarget: EventTarget & HTMLElement },
  content: string,
) {
  // TODO: add a way to simulate a "click" animation
  error.stopPropagation();
  await writeText(content);
}

// export async function takeScreenshot(target?: HTMLElement): Promise<void> {
//   if (!target) return;
//   // Give the browser a paint frame (helps if caller just changed DOM)
//   await new Promise(requestAnimationFrame);

//   const canvas = await html2canvas(target, { backgroundColor: "#27272A" });

//   const blob: Blob | null = await new Promise((resolve) =>
//     canvas.toBlob(resolve)
//   );
//   if (!blob) return;

//   try {
//     await writeImage(await image.Image.fromBytes(await blob.arrayBuffer()));
//   } catch (error) {
//     console.error("Failed to take a screenshot", error);
//   }
// }

let isClickthrough = false;

export function getClickthroughState(): boolean {
  return isClickthrough;
}

export async function applyLiveClickthrough(enabled: boolean) {
  const liveWindow = await WebviewWindow.getByLabel("live");
  await liveWindow?.setIgnoreCursorEvents(enabled);
  isClickthrough = enabled;
}

export function setClickthroughPreference(enabled: boolean) {
  SETTINGS.accessibility.state.clickthrough = enabled;
}

export function toggleClickthroughPreference() {
  setClickthroughPreference(!SETTINGS.accessibility.state.clickthrough);
}
