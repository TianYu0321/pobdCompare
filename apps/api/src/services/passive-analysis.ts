import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { detectPoB2Installation } from '@pobd/pob2-worker';
import type {
  BaselineSnapshot,
  BuildMutation,
  SimulationResult,
} from '@pobd/schemas';

interface TreeCandidate {
  id: number;
  name: string;
  linked: number[];
  type?: string;
  protected?: boolean;
}

interface PassiveCandidates {
  add: TreeCandidate[];
  remove: TreeCandidate[];
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
  constructor(
    private readonly simulator: PassiveSimulator,
    private readonly candidateProvider: (baseline: BaselineSnapshot) => Promise<PassiveCandidates> =
      defaultCandidates,
    private readonly limitPerType = 6,
  ) {}

  async analyze(baseline: BaselineSnapshot): Promise<PassiveRankings> {
    const candidates = await this.candidateProvider(baseline);
    const addMutations = candidates.add.slice(0, this.limitPerType).map((node, index) =>
      this.mutation('passive_add', baseline.baselineHash, node, index === 1 ? 'path' : 'next'),
    );
    const removeMutations = candidates.remove.slice(0, this.limitPerType).map((node) =>
      this.mutation('passive_remove', baseline.baselineHash, node, 'remove'),
    );
    const candidateById = new Map(
      [...candidates.add, ...candidates.remove].map((node) => [node.id, node]),
    );
    const results = await Promise.all(
      [...addMutations, ...removeMutations].map(async (mutation) => {
        try {
          const result = await this.simulator.simulatePassive({ baseline, mutation });
          const id = 'targetNodeId' in mutation.payload ? mutation.payload.targetNodeId : 0;
          result.target = {
            ...(result.target ?? { type: 'passive' }),
            name: candidateById.get(id)?.name,
          };
          return result;
        } catch (error) {
          return this.failed(baseline, mutation, error);
        }
      }),
    );

    const successful = results.filter((result) => result.resultKind !== 'calc_failed');
    return {
      nextPoint: successful
        .filter((result) => result.mutationType === 'passive_add' && !result.passiveAddMeta?.pathAutoFilled)
        .sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent),
      pathPackage: successful
        .filter((result) => result.mutationType === 'passive_add' && result.passiveAddMeta?.pathAutoFilled)
        .sort((a, b) => (b.gainPerPoint ?? 0) - (a.gainPerPoint ?? 0)),
      removeLoss: successful
        .filter((result) => result.mutationType === 'passive_remove')
        .sort((a, b) => a.dpsDeltaPercent - b.dpsDeltaPercent),
      failures: results.filter((result) => result.resultKind === 'calc_failed'),
    };
  }

  private mutation(
    type: 'passive_add' | 'passive_remove',
    baselineHash: string,
    node: TreeCandidate,
    suffix: string,
  ): BuildMutation {
    return {
      mutationId: `${type}_${node.id}_${suffix}`,
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

async function defaultCandidates(baseline: BaselineSnapshot): Promise<PassiveCandidates> {
  const installation = await detectPoB2Installation();
  const treeRoot = path.join(installation.root, 'src', 'TreeData');
  const versions = (await readdir(treeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^0_\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(b.split('_')[1]) - Number(a.split('_')[1]));
  const version = baseline.treeVersion && versions.includes(baseline.treeVersion)
    ? baseline.treeVersion
    : versions[0];
  if (!version) return { add: [], remove: [] };
  const tree = JSON.parse(await readFile(path.join(treeRoot, version, 'tree.json'), 'utf8')) as {
    nodes?: Record<string, Record<string, unknown>>;
  };
  const nodes = tree.nodes ?? {};
  const allocated = new Set(baseline.passiveNodes);
  const add = new Map<number, TreeCandidate>();
  const remove: TreeCandidate[] = [];

  for (const id of baseline.passiveNodes) {
    const raw = nodes[String(id)];
    if (!raw) continue;
    const node = toCandidate(id, raw);
    const protectedNode =
      Boolean(raw.isKeystone) ||
      Boolean(raw.isMastery) ||
      Boolean(raw.isAscendancyStart) ||
      Boolean(raw.isMultipleChoice);
    if (!protectedNode) remove.push(node);
    for (const linked of node.linked) {
      if (!allocated.has(linked) && nodes[String(linked)]) {
        const linkedNode = nodes[String(linked)];
        if (!linkedNode.isAscendancyStart) add.set(linked, toCandidate(linked, linkedNode));
      }
    }
  }
  return { add: [...add.values()], remove };
}

function toCandidate(id: number, raw: Record<string, unknown>): TreeCandidate {
  const connections = Array.isArray(raw.connections) ? raw.connections : [];
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : `节点 ${id}`,
    linked: connections
      .map((connection) =>
        typeof connection === 'object' && connection !== null
          ? Number((connection as Record<string, unknown>).id)
          : NaN,
      )
      .filter(Number.isFinite),
  };
}
