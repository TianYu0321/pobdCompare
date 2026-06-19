import type { BuildDiffResult, NormalizedBuild } from '@/types';

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
}

export interface ImportResult {
  id: string;
  source: 'build_file' | 'wegame' | 'poe_ninja';
  status: 'fetched' | 'normalized' | 'calculable' | 'failed';
  normalizedBuild?: NormalizedBuild;
  baseline?: BaselineSummary;
  warnings: string[];
  error?: string;
}

export interface ApiJob<T = unknown> {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: T;
  error?: string;
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
}

export interface WorkspaceResult {
  workspace: { id: string };
  diff?: BuildDiffResult;
  passives?: {
    a?: PassiveRankings;
    b?: PassiveRankings;
  };
}

export interface PassiveResult {
  target: { id?: string | number; name?: string };
  dpsDeltaPercent: number;
  gainPerPoint?: number;
  pointCost?: number;
  passiveAddMeta?: {
    pathAutoFilled: boolean;
    actualPointCost: number;
  };
  passiveRemoveMeta?: {
    cascadeRemoved: boolean;
    cascadeNodeCount: number;
  };
  hitLineDelta?: {
    physicalHitLineDelta?: { deltaPercent?: number };
    elementalHitLineDelta?: { deltaPercent?: number };
  };
}

export interface PassiveRankings {
  nextPoint: PassiveResult[];
  pathPackage: PassiveResult[];
  removeLoss: PassiveResult[];
  failures: PassiveResult[];
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

export async function waitForJob<T>(
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
): Promise<string> {
  const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/gear-swaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, candidateId }),
  });
  return (await json<{ jobId: string }>(response)).jobId;
}

export async function revisionAction(
  workspaceId: string,
  side: 'a' | 'b',
  action: 'undo' | 'redo' | 'reset',
): Promise<unknown> {
  return json(
    await fetch(`${API_BASE}/workspaces/${workspaceId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side }),
    }),
  );
}
