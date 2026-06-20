import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { detectPoB2Installation } from '@pobd/pob2-worker';
import { buildCandidatePools } from '@pobd/core';
import type {
  BaselineSnapshot,
  BuildMutation,
  SimulationResult,
} from '@pobd/schemas';

export interface PassiveCandidate {
  id: number;
  name: string;
}

export interface PassiveCandidatePools {
  next: PassiveCandidate[];
  path: PassiveCandidate[];
  remove: PassiveCandidate[];
}

export interface PassiveSimulator {
  simulatePassive(input: {
    baseline: BaselineSnapshot;
    mutation: BuildMutation;
  }): Promise<SimulationResult>;
}

export interface PassiveRankings {
  nextPoint: SimulationResult[];
  pathPackage: SimulationResult[];
  removeLoss: SimulationResult[];
  failures: SimulationResult[];
}

export class PassiveAnalysisService {
  private readonly rankingsCache = new Map<string, PassiveRankings>();

  constructor(
    private readonly simulator: PassiveSimulator,
    private readonly candidateProvider: (baseline: BaselineSnapshot) => Promise<PassiveCandidatePools> =
      defaultCandidates,
    private readonly limitPerType = 6,
  ) {}

  getCached(baselineHash: string): PassiveRankings | undefined {
    return this.rankingsCache.get(baselineHash);
  }

  async analyze(baseline: BaselineSnapshot): Promise<PassiveRankings> {
    const cached = this.rankingsCache.get(baseline.baselineHash);
    if (cached) return cached;

    const pools = await this.candidateProvider(baseline);
    const nextMutations = pools.next.slice(0, this.limitPerType).map((node) =>
      this.mutation('passive_add', baseline.baselineHash, node),
    );
    const pathMutations = pools.path.slice(0, this.limitPerType).map((node) =>
      this.mutation('passive_add', baseline.baselineHash, node),
    );
    const removeMutations = pools.remove.slice(0, this.limitPerType).map((node) =>
      this.mutation('passive_remove', baseline.baselineHash, node),
    );
    const allCandidates = new Map(
      [...pools.next, ...pools.path, ...pools.remove].map((node) => [node.id, node]),
    );
    const results = await Promise.all(
      [...nextMutations, ...pathMutations, ...removeMutations].map(async (mutation) => {
        try {
          const result = await this.simulator.simulatePassive({ baseline, mutation });
          const id = 'targetNodeId' in mutation.payload ? mutation.payload.targetNodeId : 0;
          result.target = {
            ...(result.target ?? { type: 'passive' }),
            name: allCandidates.get(id)?.name,
          };
          return result;
        } catch (error) {
          return this.failed(baseline, mutation, error);
        }
      }),
    );

    // FINAL classification uses PoB2's returned metadata, not intent
    const failures = results.filter(
      (r) => r.resultKind === 'calc_failed' || r.resultKind === 'incompatible' || r.resultKind === 'invalid_variant',
    );
    const successful = results.filter(
      (r) => r.resultKind === 'normal_gain' || r.resultKind === 'normal_loss' || r.resultKind === 'neutral',
    );

    const rankings: PassiveRankings = {
      nextPoint: successful
        .filter((r) =>
          r.mutationType === 'passive_add'
          && r.passiveAddMeta
          && !r.passiveAddMeta.pathAutoFilled
          && r.passiveAddMeta.actualPointCost === 1,
        )
        .sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent),
      pathPackage: successful
        .filter((r) =>
          r.mutationType === 'passive_add'
          && r.passiveAddMeta
          && r.passiveAddMeta.pathAutoFilled
          && r.passiveAddMeta.actualPointCost > 1,
        )
        .sort((a, b) => (b.gainPerPoint ?? 0) - (a.gainPerPoint ?? 0)),
      removeLoss: successful
        .filter((r) => r.mutationType === 'passive_remove')
        .sort((a, b) => a.dpsDeltaPercent - b.dpsDeltaPercent),
      failures,
    };

    this.rankingsCache.set(baseline.baselineHash, rankings);
    return rankings;
  }

  invalidateCache(baselineHash: string): void {
    this.rankingsCache.delete(baselineHash);
  }

  private mutation(
    type: 'passive_add' | 'passive_remove',
    baselineHash: string,
    node: PassiveCandidate,
  ): BuildMutation {
    return {
      mutationId: `${type}_${node.id}`,
      type,
      baselineHash,
      payload:
        type === 'passive_add'
          ? { targetNodeId: node.id, requestedNodeIds: [node.id], checkConnectivity: true }
          : { targetNodeId: node.id, requestedNodeIds: [node.id], cascadeRemove: true },
      source: 'passive_marginal',
      reason: node.name,
    };
  }

  private failed(
    baseline: BaselineSnapshot,
    mutation: BuildMutation,
    error: unknown,
  ): SimulationResult {
    const message = error instanceof Error ? error.message : String(error);
    const targetId = 'targetNodeId' in mutation.payload ? mutation.payload.targetNodeId : 0;
    return {
      jobId: `${baseline.baselineHash}_${mutation.mutationId}`,
      baselineHash: baseline.baselineHash,
      variantHash: 'failed',
      mutationId: mutation.mutationId,
      mutationType: mutation.type,
      resultKind: 'calc_failed',
      affectedSkillNumber: baseline.skillNumber,
      isMainSkillStillValid: false,
      target: { type: 'passive', id: targetId },
      baselineDps: Number(baseline.calcsOutput?.CombinedDPS ?? 0),
      variantDps: 0,
      dpsDelta: 0,
      dpsDeltaPercent: 0,
      outputDiff: { offence: {} },
      warnings: [message],
      errorCode: 'unknown',
      errorMessage: message,
      evidence: [{ type: 'mutation', mutationId: mutation.mutationId }],
      createdAt: Date.now(),
    };
  }
}

async function defaultCandidates(baseline: BaselineSnapshot): Promise<PassiveCandidatePools> {
  const installation = await detectPoB2Installation();
  const treeRoot = path.join(installation.root, 'src', 'TreeData');
  const versions = (await readdir(treeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^0_\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(b.split('_')[1]) - Number(a.split('_')[1]));
  const version = baseline.treeVersion && versions.includes(baseline.treeVersion)
    ? baseline.treeVersion
    : versions[0];
  if (!version) return { next: [], path: [], remove: [] };
  const tree = JSON.parse(await readFile(path.join(treeRoot, version, 'tree.json'), 'utf8')) as {
    nodes?: Record<string, Record<string, unknown>>;
  };
  const rawNodes = tree.nodes ?? {};

  const allNodes = Object.entries(rawNodes).map(([idStr, raw]) => {
    const id = Number(idStr);
    const connections = Array.isArray(raw.connections) ? raw.connections : [];
    return {
      id,
      name: typeof raw.name === 'string' ? raw.name : `节点 ${id}`,
      connections: connections
        .map((connection: unknown) =>
          typeof connection === 'object' && connection !== null
            ? Number((connection as Record<string, unknown>).id)
            : NaN,
        )
        .filter(Number.isFinite),
      isKeystone: Boolean(raw.isKeystone),
      isMastery: Boolean(raw.isMastery),
      isAscendancyStart: Boolean(raw.isAscendancyStart),
      isMultipleChoice: Boolean(raw.isMultipleChoice),
      isJewelSocket: Boolean(raw.isJewelSocket),
      isNotable: Boolean(raw.isNotable),
      type: typeof raw.type === 'string' ? raw.type : undefined,
      classStartIndex: typeof raw.classStartIndex === 'number' ? raw.classStartIndex : undefined,
    };
  });

  return buildCandidatePools(baseline.passiveNodes, allNodes);
}
