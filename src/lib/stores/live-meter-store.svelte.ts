import type { DeathRecord, LiveDataPayload, TrainingDummyState } from "$lib/api";

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

export function setDeathRecords(records: DeathRecord[] | null | undefined) {
  deathRecords = records ?? [];
}

export function getDeathRecords() {
  return deathRecords;
}

export function clearLiveData() {
  liveData = null;
}

export function clearTrainingDummyState() {
  trainingDummyState = null;
}

export function clearDeathRecords() {
  deathRecords = [];
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
