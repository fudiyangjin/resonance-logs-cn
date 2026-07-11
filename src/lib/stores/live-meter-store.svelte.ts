import type { DeathRecord, LiveDataPayload, TrainingDummyState } from "$lib/api";
import { normalizeDeathRecords } from "$lib/death-replay-compat";

let liveData = $state<LiveDataPayload | null>(null);
let trainingDummyState = $state<TrainingDummyState | null>(null);
let deathRecords = $state<DeathRecord[]>([]);

export function setLiveData(data: LiveDataPayload) {
  liveData = data;
}

export function getLiveData() {
  return liveData;
}

export function setTrainingDummyState(data: TrainingDummyState) {
  trainingDummyState = data;
}

export function getTrainingDummyState() {
  return trainingDummyState;
}

/**
 * Replace the full death-replay snapshot for the current encounter.
 * The backend publishes an absolute snapshot each time a new death edge is detected,
 * so the store always mirrors the latest authoritative state from Rust.
 */
export function setDeathRecords(records: DeathRecord[]) {
  deathRecords = normalizeDeathRecords(records);
}

export function getDeathRecords() {
  return deathRecords;
}

export function clearDeathRecords() {
  deathRecords = [];
}

export function clearLiveData() {
  liveData = null;
}

export function clearTrainingDummyState() {
  trainingDummyState = null;
}

export function clearMeterData() {
  clearLiveData();
  clearDeathRecords();
}

export function cleanupStores() {
  clearLiveData();
  clearTrainingDummyState();
  clearDeathRecords();
}
