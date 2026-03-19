import {
  type ModuleInfo,
  type ModuleSolution,
  onModuleCalcProgress,
} from "$lib/api";

export type MinReq = { attrId: number | null; value: number | null };
export type GpuSupport = { cuda_available: boolean; opencl_available: boolean };

export interface ModuleCalcState {
  moduleCount: number | null;
  modules: ModuleInfo[];
  solutions: ModuleSolution[];

  useGpu: boolean;
  gpuSupport: GpuSupport | null;
  combinationSize: 4 | 5;

  targetAttributes: number[];
  excludeAttributes: number[];
  minRequirements: MinReq[];

  loading: boolean;
  error: string | null;

  detailOpen: boolean;
  detailSolution: ModuleSolution | null;

  progress: { value: number; max: number };
}

export const MODULE_CALC = $state<ModuleCalcState>({
  moduleCount: null,
  modules: [],
  solutions: [],

  useGpu: true,
  gpuSupport: null,
  combinationSize: 4,

  targetAttributes: [],
  excludeAttributes: [],
  minRequirements: [{ attrId: null, value: null }],

  loading: false,
  error: null,

  detailOpen: false,
  detailSolution: null,

  progress: { value: 0, max: 0 },
});

let progressUnlisten: (() => void) | null = null;

export async function ensureModuleCalcProgressListener() {
  if (progressUnlisten) return;

  progressUnlisten = await onModuleCalcProgress((e) => {
    // payload is [current, total]
    MODULE_CALC.progress = { value: e.payload[0], max: e.payload[1] };
  });
}

