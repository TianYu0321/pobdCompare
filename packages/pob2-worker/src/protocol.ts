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

export interface CanonicalWeGameCharacter {
  name: string;
  level: number;
  class: string;
  league: string;
  equipment: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  jewels: Record<string, unknown>[];
  passives: {
    hashes: number[];
    specialisations: Record<string, number[]>;
    skill_overrides: Record<string, Record<string, unknown>>;
    jewel_data: Record<string, Record<string, unknown>>;
    quest_stats: string[];
    alternate_ascendancy?: number;
  };
  mainSkillHint?: string;
}

export interface BaselineWorkerRequest {
  operation?: 'baseline' | 'mutation';
  buildXml: string;
  skillNumber: number;
  weaponSet: number;
  config: Record<string, unknown>;
  mutation?: BuildMutation;
}

export interface ConvertWeGameWorkerRequest {
  operation: 'convert_wegame';
  character: CanonicalWeGameCharacter;
  catalogHash: string;
}

export type Pob2WorkerRequest = BaselineWorkerRequest | ConvertWeGameWorkerRequest;

export interface Pob2WorkerResponse {
  success: boolean;
  calcsOutput?: Record<string, unknown>;
  breakdown?: Record<string, unknown>;
  skillDpsList?: SkillDpsInfo[];
  itemSlots?: ItemSlotInfo[];
  passiveNodes?: number[];
  selectedSkillNumber?: number;
  selectedSkillName?: string;
  actuallyAddedNodeIds?: number[];
  actuallyRemovedNodeIds?: number[];
  pointCost?: number;
  pathAutoFilled?: boolean;
  cascadeRemoved?: boolean;
  catalogHash?: string;
  pobValidation?: {
    roundTripValid: boolean;
    baselineValid: boolean;
    mainSkillValid: boolean;
  };
  roundTrip?: {
    expectedItems: number;
    expectedEquipment?: number;
    expectedJewels?: number;
    importedItems: number;
    selectedItems?: number;
    expectedSkills: number;
    importedSkills: number;
    expectedPassives: number;
    importedPassives: number;
    missingPassiveIds?: number[];
  };
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
