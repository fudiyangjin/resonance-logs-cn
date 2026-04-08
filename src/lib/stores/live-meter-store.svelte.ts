import type { LiveDataPayload, TrainingDummyState } from "$lib/api";

let liveData = $state<LiveDataPayload | null>(null);
let trainingDummyState = $state<TrainingDummyState | null>(null);

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

export function clearLiveData() {
  liveData = null;
}

export function clearTrainingDummyState() {
  trainingDummyState = null;
}

export function clearMeterData() {
  clearLiveData();
}

export function cleanupStores() {
  clearLiveData();
  clearTrainingDummyState();
}
