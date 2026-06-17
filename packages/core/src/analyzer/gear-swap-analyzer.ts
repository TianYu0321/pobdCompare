import {
  BaselineSnapshot,
  BuildMutation,
  SimulationResult,
  ItemInfo,
  BuildVariant,
} from '@pobd/schemas';
import { ResultComparator } from '../comparator';

/**
 * Interface expected from the VariantGenerator worker.
 */
export interface VariantGenerator {
  generate(baseline: BaselineSnapshot, mutation: BuildMutation): Promise<BuildVariant>;
}

/**
 * Analyzes the impact of swapping gear items.
 *
 * When targetBuildItems is provided, each item is treated as a candidate
 * to be swapped into the corresponding slot of the baseline build.
 *
 * Compatibility flags (weapon_type_mismatch, skill_requirement_not_met, …)
 * are carried through the variant's compatibility field and surfaced by
 * ResultComparator.
 */
export class GearSwapAnalyzer {
  constructor(
    private variantGenerator: VariantGenerator,
    private resultComparator: ResultComparator
  ) {}

  /**
   * Run gear-swap analysis.
   *
   * @param baseline           The baseline build snapshot.
   * @param targetBuildItems   Optional list of candidate items. If omitted
   *                           the analyzer returns an empty array (no
   *                           candidates to test against).
   */
  async analyze(
    baseline: BaselineSnapshot,
    targetBuildItems?: ItemInfo[]
  ): Promise<SimulationResult[]> {
    const results: SimulationResult[] = [];

    const slots = targetBuildItems && targetBuildItems.length > 0 ? targetBuildItems : baseline.items;

    if (!targetBuildItems || targetBuildItems.length === 0) {
      // No explicit target build provided.  We do not generate
      // self-swaps because they would yield zero delta.  Return empty.
      return results;
    }

    for (const item of slots) {
      const mutation: BuildMutation = {
        mutationId: `gear_swap_${item.slotName}`,
        type: 'item_swap',
        baselineHash: baseline.baselineHash,
        payload: {
          slotName: item.slotName,
          itemRaw: item.rawText,
          itemId: item.itemId,
          sourceBuildHash: baseline.baselineHash,
          sourceSlotName: item.slotName,
        },
        source: 'candidate_list',
      };

      try {
        const variant = await this.variantGenerator.generate(baseline, mutation);
        const baseResult = this.resultComparator.compare(baseline, variant);

        const originalItem = baseline.items.find((i) => i.slotName === item.slotName);

        const result: SimulationResult = {
          ...baseResult,
          gearSwapMeta: {
            slotName: item.slotName,
            originalItemName: originalItem?.name,
            candidateItemName: item.name,
            originalItemRaw: originalItem?.rawText,
            candidateItemRaw: item.rawText,
          },
        };

        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          jobId: `${baseline.baselineHash}_${mutation.mutationId}`,
          baselineHash: baseline.baselineHash,
          variantHash: 'failed',
          mutationId: mutation.mutationId,
          mutationType: 'item_swap',
          resultKind: 'calc_failed',
          affectedSkillNumber: baseline.skillNumber,
          isMainSkillStillValid: false,
          target: {
            type: 'item',
            id: item.itemId,
            name: item.name,
            slotName: item.slotName,
          },
          baselineDps: this.extractDps(baseline),
          variantDps: 0,
          dpsDelta: 0,
          dpsDeltaPercent: 0,
          outputDiff: { offence: {} },
          warnings: [`Gear swap failed: ${errorMessage}`],
          errorCode: 'unknown',
          errorMessage,
          evidence: [
            { type: 'baseline', baselineHash: baseline.baselineHash, label: 'Baseline snapshot' },
            { type: 'mutation', mutationId: mutation.mutationId, label: 'Failed gear swap' },
          ],
          createdAt: Date.now(),
        });
      }
    }

    return results;
  }

  /**
   * Return the top N gear-swap gains.
   */
  getTopGains(results: SimulationResult[], limit = 10): SimulationResult[] {
    return [...results]
      .filter((r) => r.resultKind === 'normal_gain')
      .sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent)
      .slice(0, limit);
  }

  /**
   * Return the top N gear-swap losses.
   */
  getTopLosses(results: SimulationResult[], limit = 10): SimulationResult[] {
    return [...results]
      .filter((r) => r.resultKind === 'normal_loss')
      .sort((a, b) => a.dpsDeltaPercent - b.dpsDeltaPercent)
      .slice(0, limit);
  }

  private extractDps(snapshot: BaselineSnapshot): number {
    const co = snapshot.calcsOutput as Record<string, unknown> | undefined;
    if (co?.CombinedDPS !== undefined) return Number(co.CombinedDPS);
    const mo = snapshot.mainOutput as Record<string, unknown> | undefined;
    if (mo?.CombinedDPS !== undefined) return Number(mo.CombinedDPS);
    return 0;
  }
}
