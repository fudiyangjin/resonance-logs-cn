import { convertFileSrc } from "@tauri-apps/api/core";
import type { PlaySoundAction, TriggerSoundRouting } from "$lib/custom-trigger-types";
import { customTriggersFile } from "$lib/custom-triggers-store";
import { get } from "svelte/store";

export type AudioOutputDevice = {
  deviceId: string;
  label: string;
};

export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "audiooutput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Audio Output ${index + 1}`,
      }));
  } catch (error) {
    console.error("[custom-triggers] failed to enumerate audio output devices", error);
    return [];
  }
}

async function playAudioOnDevice(
  source: string,
  volume: number,
  deviceId: string | null | undefined,
): Promise<void> {
  if (!source || typeof Audio === "undefined") return;

  const resolvedSource = /^https?:|^asset:|^data:|^blob:|^tauri:|^capacitor:|^file:/i.test(source)
    ? source
    : convertFileSrc(source);
  const audio = new Audio(resolvedSource);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.preload = "auto";

  const target = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
  if (deviceId && typeof target.setSinkId === "function") {
    try {
      await target.setSinkId(deviceId);
    } catch (error) {
      console.warn("[custom-triggers] failed to switch sink id", deviceId, error);
    }
  }

  try {
    await audio.play();
  } catch (error) {
    console.error("[custom-triggers] failed to play audio", error);
  }
}

export async function playTriggerSound(action: PlaySoundAction): Promise<void> {
  const config = get(customTriggersFile);
  const routing = action.routing as TriggerSoundRouting;
  const primaryDeviceId =
    routing === "override"
      ? action.overridePrimaryDeviceId
      : config.audio.primaryOutputDeviceId;
  const secondaryDeviceId =
    routing === "override"
      ? action.overrideSecondaryDeviceId
      : config.audio.secondaryOutputDeviceId;

  if (routing === "global_secondary") {
    if (!secondaryDeviceId) return;
    await playAudioOnDevice(action.soundPath, action.volume, secondaryDeviceId);
    return;
  }

  if (routing === "global_both") {
    const tasks = [];
    tasks.push(playAudioOnDevice(action.soundPath, action.volume, primaryDeviceId));
    if (secondaryDeviceId) {
      tasks.push(playAudioOnDevice(action.soundPath, action.volume, secondaryDeviceId));
    }
    await Promise.all(tasks);
    return;
  }

  if (routing === "override") {
    const tasks = [];
    if (action.overridePrimaryDeviceId) {
      tasks.push(playAudioOnDevice(action.soundPath, action.volume, action.overridePrimaryDeviceId));
    }
    if (action.overrideSecondaryDeviceId) {
      tasks.push(playAudioOnDevice(action.soundPath, action.volume, action.overrideSecondaryDeviceId));
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
      return;
    }
  }

  await playAudioOnDevice(action.soundPath, action.volume, primaryDeviceId);
}
