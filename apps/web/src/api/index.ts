import type { BuildDiffResult, NormalizedBuild } from '@/types';
import type { SimulationResult } from '@pobd/schemas';

const API_BASE = 'http://127.0.0.1:8787/api';

export interface BaselineSummary {
  baselineHash: string;
  mainSkillSelection: {
    selectedSkillName: string;
    selectedSkillNumber: number;
    candidates: Array<{ name: string; skillNumber: number; dps: number }>;
  };
  calcsOutput: Record<string, unknown>;
  rawBreakdown: Record<string, unknown>;
  mainOutput?: Record<string, unknown>;
}

export interface ImportResult {
  id: string;
  source: 'build_file' | 'wegame' | 'poe_ninja';
  status: 'fetched' | 'normalized' | 'calculable' | 'failed';
  normalizedBuild?: NormalizedBuild;
  baseline?: BaselineSummary;
  warnings: string[];
  conversionReport: {
    status: 'complete' | 'blocked' | 'validation_failed' | 'partial' | 'degraded' | 'failed';
    catalogHash?: string;
    mappingCatalogMeta?: {
      catalogVersion: string;
      gameVersion: string;
      league?: string;
      source: 'trade_api' | 'local_cache' | 'manual';
      generatedAt: string;
      expiresAt?: string;
    };
    stale?: boolean;
    blockers: Array<{
      code: string;
      category: string;
      source: string;
      reason: string;
    }>;
    pobValidation?: {
      roundTripValid: boolean;
      baselineValid: boolean;
      mainSkillValid: boolean;
    };
  };
  error?: string;
}

export interface ApiJob<T = unknown> {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: T;
  error?: string;
  stage?: string;
  message?: string;
}

export interface GearCandidate {
  id: string;
  sourceSide: 'a' | 'b';
  slotName: string;
  itemId: number;
  name: string;
  baseType: string;
  rawText?: string;
  applicable: boolean;
  itemSwapAvailability?: {
    applicable: boolean;
    reason?: 'missing_raw_text' | 'unmapped_item' | 'unsupported_mods' | 'slot_empty' | 'compatible';
    rawTextSource?: 'original' | 'generated' | 'pob2_template';
  };
}

export interface WorkspaceResult {
  workspace: WorkspaceView;
  diff?: BuildDiffResult;
  passives?: {
    a?: PassiveRankings;
    b?: PassiveRankings;
  };
  passiveWarnings?: {
    a?: string;
    b?: string;
  };
}

export interface PassiveResult {
  target: { id?: string | number; name?: string };
  resultKind: string;
  dpsDeltaPercent: number;
  gainPerPoint?: number;
  pointCost?: number;
  passiveAddMeta?: {
    pathAutoFilled: boolean;
    actualPointCost: number;
    gainPerPoint?: number;
  };
  passiveRemoveMeta?: {
    cascadeRemoved: boolean;
    cascadeNodeCount: number;
    actuallyRemovedNodeIds?: number[];
  };
  hitLineDelta?: {
    physicalHitLineDelta?: { deltaPercent?: number };
    elementalHitLineDelta?: { deltaPercent?: number };
  };
  errorMessage?: string;
  warnings?: string[];
}

export interface PassiveRankings {
  nextPoint: PassiveResult[];
  pathPackage: PassiveResult[];
  removeLoss: PassiveResult[];
  failures: PassiveResult[];
}

// ============================================
// WorkspaceView / Mutation types (frontend mirror)
// ============================================

export interface WorkspaceSideView {
  session: {
    baselineHash: string;
    revisions: Array<{
      revisionId: string;
      parentRevisionId?: string;
      variantHash: string;
      result?: SimulationResult;
      createdAt: number;
    }>;
    cursor: number;
  };
  currentBuildXml: string;
  currentBaseline: {
    baselineHash: string;
    id: string;
    calcsOutput: Record<string, unknown>;
    rawBreakdown: Record<string, unknown>;
    mainOutput?: Record<string, unknown>;
    mainSkillSelection?: {
      selectedSkillName: string;
    };
  };
  currentRevision: {
    revisionId: string;
    variantHash: string;
    result?: SimulationResult;
  };
  currentNormalizedBuild: NormalizedBuild;
}

export interface WorkspaceView {
  id: string;
  a: WorkspaceSideView;
  b?: WorkspaceSideView;
  diff?: BuildDiffResult;
}

export interface GearSwapOutcome {
  applied: boolean;
  result?: SimulationResult;
  revision?: {
    revisionId: string;
    parentRevisionId: string;
    variantHash: string;
  };
  workspace: WorkspaceView;
  passives?: {
    a?: PassiveRankings;
    b?: PassiveRankings;
  };
  passiveWarnings?: {
    a?: string;
    b?: string;
  };
}

async function json<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? `请求失败：${response.status}`);
  }
  return data as T;
}

export async function importFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE}/imports`, { method: 'POST', body: form });
  return (await json<{ jobId: string }>(response)).jobId;
}

export async function importUrl(url: string): Promise<string> {
  const response = await fetch(`${API_BASE}/imports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return (await json<{ jobId: string }>(response)).jobId;
}

export async function createComparison(importAId: string, importBId?: string): Promise<string> {
  const response = await fetch(`${API_BASE}/comparisons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ importAId, importBId }),
  });
  return (await json<{ jobId: string }>(response)).jobId;
}

export async function getImport(id: string): Promise<ImportResult> {
  return json<ImportResult>(await fetch(`${API_BASE}/imports/${encodeURIComponent(id)}`));
}

export async function getJob<T>(jobId: string): Promise<ApiJob<T>> {
  return json<T extends never ? never : ApiJob<T>>(
    await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`),
  );
}

async function waitForJobPolling<T>(
  jobId: string,
  onUpdate?: (job: ApiJob<T>) => void,
): Promise<T> {
  for (;;) {
    const job = await getJob<T>(jobId);
    onUpdate?.(job);
    if (job.status === 'completed') return job.result as T;
    if (job.status === 'failed') throw new Error(job.error ?? '作业失败');
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
}

export async function waitForJob<T>(
  jobId: string,
  onUpdate?: (job: ApiJob<T>) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const events = new EventSource(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/events`);
    let result: T | undefined;
    events.onmessage = (message) => {
      const event = JSON.parse(message.data) as {
        type: string;
        stage?: string;
        message?: string;
        data?: T;
      };
      if (event.type === 'stage') {
        onUpdate?.({
          id: jobId,
          status: 'running',
          stage: event.stage,
          message: event.message,
        });
      } else if (event.type === 'result' && event.data !== undefined) {
        result = event.data;
      } else if (event.type === 'complete') {
        events.close();
        if (result === undefined) reject(new Error('作业完成但没有返回结果'));
        else resolve(result);
      } else if (event.type === 'error') {
        events.close();
        reject(new Error(event.message ?? '作业失败'));
      }
    };
    events.onerror = () => {
      events.close();
      void waitForJobPolling(jobId, onUpdate).then(resolve, reject);
    };
  });
}

export async function getGearCandidates(
  workspaceId: string,
  side: 'a' | 'b',
): Promise<GearCandidate[]> {
  return json<GearCandidate[]>(
    await fetch(`${API_BASE}/workspaces/${workspaceId}/gear-candidates?side=${side}`),
  );
}

export async function applyGearCandidate(
  workspaceId: string,
  side: 'a' | 'b',
  candidateId: string,
  targetSlotName: string,
): Promise<string> {
  const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/gear-swaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, candidateId, targetSlotName }),
  });
  return (await json<{ jobId: string }>(response)).jobId;
}

export async function revisionAction(
  workspaceId: string,
  side: 'a' | 'b',
  action: 'undo' | 'redo' | 'reset',
): Promise<GearSwapOutcome> {
  const result = await json<GearSwapOutcome>(
    await fetch(`${API_BASE}/workspaces/${workspaceId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side }),
    }),
  );
  return result;
}
