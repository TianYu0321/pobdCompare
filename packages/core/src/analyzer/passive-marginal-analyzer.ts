import {
  BaselineSnapshot,
  BuildMutation,
  SimulationResult,
  MutationType,
  BuildVariant,
} from '@pobd/schemas';
import { ResultComparator } from '../comparator';

/**
 * Minimal node metadata needed by the PassiveMarginalAnalyzer.
 * The full node graph is provided by the caller (typically loaded
 * from PoB2 tree data or the baseline XML parser).
 */
export interface PassiveNodeInfo {
  id: number;
  name?: string;
  type?: string;
  isMultipleChoice?: boolean;
  isAscendancyStart?: boolean;
  linked?: number[];
}

/**
 * Abstraction over the passive skill tree node graph.
 */
export interface PassiveNodeGraph {
  getNode(id: number): PassiveNodeInfo | undefined;
}

/**
 * Interface expected from the VariantGenerator worker.
 * (Implemented by the variant module – owned by another worker.)
 */
export interface VariantGenerator {
  generate(baseline: BaselineSnapshot, mutation: BuildMutation): Promise<BuildVariant>;
}

/**
 * Analyzes the marginal value of every allocated passive node
 * (remove) and every reachable unallocated node (add).
 *
 * Algorithm (mirrors P1Runner.lua):
 *  1. For each allocated node (excluding ClassStart / Keystone /
 *     AscendClassStart / isMultipleChoice) → passive_remove mutation
 *  2. For each linked unallocated node of each allocated node
 *     (excluding isAscendancyStart) → passive_add mutation
 *  3. Generate variant, compare, collect results
 *  4. Record pathAutoFilled / cascadeRemoved meta
 */
export class PassiveMarginalAnalyzer {
  constructor(
    private variantGenerator: VariantGenerator,
    private resultComparator: ResultComparator,
    private nodeGraph: PassiveNodeGraph
  ) {}

  /**
   * Run passive marginal analysis against the given baseline.
   */
  async analyze(baseline: BaselineSnapshot): Promise<SimulationResult[]> {
    const results: SimulationResult[] = [];
    const allocatedNodes = baseline.passiveNodes;

    // --------------------------------------------------------------
    // Passive Remove Analysis
    // --------------------------------------------------------------
    for (const nodeId of allocatedNodes) {
      const node = this.nodeGraph.getNode(nodeId);
      if (!node) continue;

      // Skip protected nodes (same guard as P1Runner.lua)
      if (
        node.type === 'ClassStart' ||
        node.type === 'Keystone' ||
        node.type === 'AscendClassStart' ||
        node.isMultipleChoice
      ) {
        continue;
      }

      const mutation: BuildMutation = {
        mutationId: `passive_remove_${nodeId}`,
        type: 'passive_remove',
        baselineHash: baseline.baselineHash,
        payload: {
          targetNodeId: nodeId,
          requestedNodeIds: [nodeId],
          cascadeRemove: true,
        },
        source: 'passive_marginal',
      };

      try {
        const variant = await this.variantGenerator.generate(baseline, mutation);
        const baseResult = this.resultComparator.compare(baseline, variant);

        const actuallyRemoved =
          (variant as { actuallyRemovedNodeIds?: number[] }).actuallyRemovedNodeIds ?? [nodeId];

        const result: SimulationResult = {
          ...baseResult,
          passiveRemoveMeta: {
            targetNodeId: nodeId,
            actuallyRemovedNodeIds: actuallyRemoved,
            cascadeRemoved: actuallyRemoved.length > 1,
            cascadeNodeCount: Math.max(0, actuallyRemoved.length - 1),
          },
        };

        results.push(result);
      } catch (error) {
        results.push(this.createFailedResult(baseline, mutation, error, nodeId));
      }
    }

    // --------------------------------------------------------------
    // Passive Add Analysis
    // --------------------------------------------------------------
    for (const nodeId of allocatedNodes) {
      const node = this.nodeGraph.getNode(nodeId);
      if (!node || !node.linked) continue;

      for (const linkedId of node.linked) {
        if (allocatedNodes.includes(linkedId)) continue;

        const linkedNode = this.nodeGraph.getNode(linkedId);
        if (linkedNode?.isAscendancyStart) continue;

        const mutation: BuildMutation = {
          mutationId: `passive_add_${linkedId}_from_${nodeId}`,
          type: 'passive_add',
          baselineHash: baseline.baselineHash,
          payload: {
            targetNodeId: linkedId,
            requestedNodeIds: [linkedId],
            checkConnectivity: true,
          },
          source: 'passive_marginal',
        };

        try {
          const variant = await this.variantGenerator.generate(baseline, mutation);
          const baseResult = this.resultComparator.compare(baseline, variant);

          const actuallyAdded =
            (variant as { actuallyAddedNodeIds?: number[] }).actuallyAddedNodeIds ?? [linkedId];
          const pointCost = actuallyAdded.length;

          const result: SimulationResult = {
            ...baseResult,
            pointCost,
            gainPerPoint: pointCost > 0 ? baseResult.dpsDelta / pointCost : 0,
            passiveAddMeta: {
              targetNodeId: linkedId,
              actuallyAddedNodeIds: actuallyAdded,
              pathAutoFilled: pointCost > 1,
              actualPointCost: pointCost,
              gainPerPoint: pointCost > 0 ? baseResult.dpsDelta / pointCost : 0,
            },
          };

          results.push(result);
        } catch (error) {
          results.push(this.createFailedResult(baseline, mutation, error, linkedId));
        }
      }
    }

    return results;
  }

  /**
   * Return the top N gains sorted by dpsDeltaPercent descending.
   */
  getTopGains(results: SimulationResult[], limit = 10): SimulationResult[] {
    return [...results]
      .filter((r) => r.resultKind === 'normal_gain')
      .sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent)
      .slice(0, limit);
  }

  /**
   * Return the top N losses sorted by dpsDeltaPercent ascending.
   */
  getTopLosses(results: SimulationResult[], limit = 10): SimulationResult[] {
    return [...results]
      .filter((r) => r.resultKind === 'normal_loss')
      .sort((a, b) => a.dpsDeltaPercent - b.dpsDeltaPercent)
      .slice(0, limit);
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private createFailedResult(
    baseline: BaselineSnapshot,
    mutation: BuildMutation,
    error: unknown,
    nodeId: number
  ): SimulationResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      jobId: `${baseline.baselineHash}_${mutation.mutationId}`,
      baselineHash: baseline.baselineHash,
      variantHash: 'failed',
      mutationId: mutation.mutationId,
      mutationType: mutation.type,
      resultKind: 'calc_failed',
      affectedSkillNumber: baseline.skillNumber,
      isMainSkillStillValid: false,
      target: {
        type: 'passive',
        id: nodeId,
      },
      baselineDps: this.extractDps(baseline),
      variantDps: 0,
      dpsDelta: 0,
      dpsDeltaPercent: 0,
      outputDiff: { offence: {} },
      warnings: [`Failed to generate variant: ${errorMessage}`],
      errorCode: 'unknown',
      errorMessage,
      evidence: [
        { type: 'baseline', baselineHash: baseline.baselineHash, label: 'Baseline snapshot' },
        { type: 'mutation', mutationId: mutation.mutationId, label: 'Failed mutation' },
      ],
      createdAt: Date.now(),
    };
  }

  private extractDps(snapshot: BaselineSnapshot): number {
    const co = snapshot.calcsOutput as Record<string, unknown> | undefined;
    if (co?.CombinedDPS !== undefined) return Number(co.CombinedDPS);
    const mo = snapshot.mainOutput as Record<string, unknown> | undefined;
    if (mo?.CombinedDPS !== undefined) return Number(mo.CombinedDPS);
    return 0;
  }
}
