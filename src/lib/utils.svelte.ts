/**
 * @file This file contains utility functions and constants for the application.
 */
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css'; // optional for styling
import type { Attachment } from 'svelte/attachments';
// import html2canvas from "html2canvas-pro";
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
// import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
// import { image } from '@tauri-apps/api';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

import classSpecIconsData from '$parserData/generated/class-spec-icons.json';
import { resolveStaticIconUrl } from '$lib/config/static-icon-resolver';
import { SETTINGS, DEFAULT_CLASS_COLORS, DEFAULT_CLASS_SPEC_COLORS, CLASS_SPEC_MAP } from '$lib/settings-store';

export const CLASS_MAP: Record<number, string> = {
  1: 'Stormblade',
  2: 'Frost Mage',
  3: 'Flame Berserker',
  4: 'Wind Knight',
  5: 'Verdant Oracle',
  9: 'Heavy Guardian',
  11: 'Marksman',
  12: 'Shield Knight',
  13: 'Beat Performer'
};

export const CLASS_NAMES = Object.values(CLASS_MAP);

export function getClassColorRaw(className: string, classSpecName?: string): string {
  const useSpec = SETTINGS.accessibility.state.useClassSpecColors;
  if (useSpec && classSpecName && classSpecName in CLASS_SPEC_MAP) {
    const specColors = SETTINGS.accessibility.state.classSpecColors ?? DEFAULT_CLASS_SPEC_COLORS;
    return specColors[classSpecName] ?? DEFAULT_CLASS_SPEC_COLORS[classSpecName] ?? "#ffc9ed";
  }
  const classColors = SETTINGS.accessibility.state.classColors ?? DEFAULT_CLASS_COLORS;
  return classColors[className] ?? DEFAULT_CLASS_COLORS[className] ?? "#ffc9ed";
}

export function getClassColor(className: string, classSpecName?: string): string {
  return `rgb(from ${getClassColorRaw(className, classSpecName)} r g b / 0.6)`;
}

export function getClassIcon(class_name: string, class_spec_name = ""): string {
  return getClassOrSpecIcon(class_name, class_spec_name);
}

const SPEC_ICON_ROLE_COLORS = {
  dps: "#d99a97",
  support: "#9bc9a8",
  tank: "#7ea6c6",
} as const;

const SUPPORT_SPEC_ICONS = new Set(["Lifebind", "Recovery", "Concerto"]);
const TANK_SPEC_ICONS = new Set(["Block", "Shield"]);

export function getClassIconTintColor(class_name: string, class_spec_name = ""): string {
  if (!class_spec_name) return "";
  if (SUPPORT_SPEC_ICONS.has(class_spec_name)) return SPEC_ICON_ROLE_COLORS.support;
  if (TANK_SPEC_ICONS.has(class_spec_name)) return SPEC_ICON_ROLE_COLORS.tank;
  if (CLASS_SPEC_MAP[class_spec_name] || class_name) return SPEC_ICON_ROLE_COLORS.dps;
  return "";
}

type ClassIconEntry = {
  staticIconPath?: string;
  professionIconPath?: string;
};

type SpecIconEntry = {
  iconPath?: string;
  weaponStyleIconPath?: string;
};

type ClassSpecIconTable = {
  classes?: Record<string, ClassIconEntry>;
  specs?: Record<string, SpecIconEntry>;
};

const CLASS_SPEC_ICONS = classSpecIconsData as ClassSpecIconTable;

export function getClassOrSpecIcon(class_name: string, class_spec_name = ""): string {
  if (class_name === "" || class_name === "blank") {
    return "/images/classes/blank.png";
  }

  const specIcon = class_spec_name
    ? CLASS_SPEC_ICONS.specs?.[class_spec_name]
    : undefined;
  const classIcon = CLASS_SPEC_ICONS.classes?.[class_name];

  return (
    resolveStaticIconUrl(specIcon?.iconPath, specIcon?.weaponStyleIconPath)
    ?? resolveStaticIconUrl(classIcon?.professionIconPath, classIcon?.staticIconPath)
    ?? `/images/classes/${class_name}.png`
  );
}

// https://svelte.dev/docs/svelte/@attach#Attachment-factories
export function tooltip(getContent: () => string): Attachment {
  return (element: Element) => {
    const instance = tippy(element, {
      content: getContent(),
      theme: 'resonance',
      arrow: true,
      delay: [200, 80],
      duration: [120, 80],
      animation: 'fade',
      moveTransition: 'transform 120ms ease-out',
      placement: 'top',
    });

    // Keep content in sync with reactive source
    $effect(() => {
      instance.setContent(getContent());
    });

    return () => instance.destroy();
  };
}

export async function copyToClipboard(error: MouseEvent & { currentTarget: EventTarget & HTMLElement }, content: string) {
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

export async function setClickthrough(bool: boolean) {
  const liveWindow = await WebviewWindow.getByLabel("live");
  await liveWindow?.setIgnoreCursorEvents(bool);
  isClickthrough = bool;
}

export async function toggleClickthrough() {
  const liveWindow = await WebviewWindow.getByLabel("live");
  await liveWindow?.setIgnoreCursorEvents(!isClickthrough);
  isClickthrough = !isClickthrough;
}
