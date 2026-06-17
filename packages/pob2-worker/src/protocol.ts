import type { BuildMutation } from '@pobd/schemas';

export interface SkillDpsInfo {
  skillNumber: number;
  name: string;
  dps: number;
  enabled: boolean;
}

export interface ItemSlotInfo {
  slotName: string;
  itemId: number;
  name: string;
  baseType: string;
}

export interface Pob2WorkerRequest {
  buildXml: string;
  skillNumber: number;
  weaponSet: number;
  config: Record<string, unknown>;
  mutation?: BuildMutation;
}

export interface Pob2WorkerResponse {
  success: boolean;
  calcsOutput?: Record<string, unknown>;
  breakdown?: Record<string, unknown>;
  skillDpsList?: SkillDpsInfo[];
  itemSlots?: ItemSlotInfo[];
  passiveNodes?: number[];
  error?: string;
  variantXml?: string;
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  pythonPath: string;
  driverPath: string;
  pobRoot: string;
  luaDllPath: string;
  requestTimeoutMs: number;
  workerIdleTimeoutMs: number;
  maxRetries: number;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface JobInfo {
  jobId: string;
  status: JobStatus;
  request: Pob2WorkerRequest;
  response?: Pob2WorkerResponse;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  retryCount: number;
}
