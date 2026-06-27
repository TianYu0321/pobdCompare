import { createHash } from 'crypto';
import type {
  BaselineSnapshot,
  BuildMutation,
  ItemInfo,
  ItemSwapPayload,
  ItemComboPayload,
  ConfigChangePayload,
  PassiveAddPayload,
  PassiveRemovePayload,
} from '@pobd/schemas';

// ============================================
// Passive Tree Provider Interface
// ============================================

export interface PassiveTreeNode {
  id: number;
  name?: string;
  dn?: string;
  type?: string;
  isAscendancyStart?: boolean;
  isMultipleChoice?: boolean;
  linked: number[]; // IDs of linked nodes
}

export interface PassiveTreeProvider {
  getTree(baseline: BaselineSnapshot): Promise<PassiveTreeNode[]>;
}

// ============================================
// MutationFactory
// ============================================

export class MutationFactory {
  private treeProvider: PassiveTreeProvider;

  constructor(treeProvider: PassiveTreeProvider) {
    this.treeProvider = treeProvider;
  }

  // ============================================
  // Create specific mutation types
  // ============================================

  createPassiveAddMutation(targetNodeId: number, baselineHash: string): BuildMutation {
    const payload: PassiveAddPayload = {
      targetNodeId,
      requestedNodeIds: [targetNodeId],
      checkConnectivity: true,
    };

    return {
      mutationId: this.generateMutationId('passive_add', String(targetNodeId)),
      type: 'passive_add',
      baselineHash,
      payload,
      source: 'candidate_list',
      reason: `Marginal add candidate: node ${targetNodeId}`,
      priority: 0,
    };
  }

  createPassiveRemoveMutation(targetNodeId: number, baselineHash: string): BuildMutation {
    const payload: PassiveRemovePayload = {
      targetNodeId,
      requestedNodeIds: [targetNodeId],
      cascadeRemove: true,
    };

    return {
      mutationId: this.generateMutationId('passive_remove', String(targetNodeId)),
      type: 'passive_remove',
      baselineHash,
      payload,
      source: 'candidate_list',
      reason: `Marginal remove candidate: node ${targetNodeId}`,
      priority: 0,
    };
  }

  createGearSwapMutation(slotName: string, itemRaw: string, baselineHash: string, sourceSlotName?: string, baseType?: string): BuildMutation {
    const payload: ItemSwapPayload = {
      slotName,
      itemRaw,
      sourceSlotName,
      preserveLinks: true,
      baseType,
    };

    return {
      mutationId: this.generateMutationId('item_swap', slotName),
      type: 'item_swap',
      baselineHash,
      payload,
      source: 'target_bd_import',
      reason: `Gear swap: ${slotName}`,
      priority: 0,
    };
  }

  createGearComboMutation(swaps: ItemSwapPayload[], baselineHash: string): BuildMutation {
    const payload: ItemComboPayload = {
      swaps,
      comboDescription: `Combo: ${swaps.map((s) => s.slotName).join(', ')}`,
    };

    return {
      mutationId: this.generateMutationId('item_combo', String(swaps.length)),
      type: 'item_combo',
      baselineHash,
      payload,
      source: 'target_bd_import',
      reason: `Gear combo: ${swaps.map((s) => s.slotName).join(', ')}`,
      priority: 0,
    };
  }

  createConfigChangeMutation(changes: Record<string, unknown>, baselineHash: string): BuildMutation {
    const payload: ConfigChangePayload = {
      changes,
      reason: 'User configuration change',
    };

    return {
      mutationId: this.generateMutationId('config_change', String(Object.keys(changes).length)),
      type: 'config_change',
      baselineHash,
      payload,
      source: 'user_input',
      reason: 'Config change',
      priority: 0,
    };
  }

  // ============================================
  // Generate candidate mutations
  // ============================================

  /**
   * For each allocated node, find linked unallocated nodes (as in P1Runner.lua).
   */
  async generatePassiveAddCandidates(baseline: BaselineSnapshot): Promise<BuildMutation[]> {
    const tree = await this.treeProvider.getTree(baseline);
    const allocatedSet = new Set(baseline.passiveNodes);
    const mutations: BuildMutation[] = [];

    for (const allocNodeId of baseline.passiveNodes) {
      const treeNode = tree.find((n) => n.id === allocNodeId);
      if (!treeNode) continue;

      for (const linkedId of treeNode.linked) {
        if (allocatedSet.has(linkedId)) continue;

        const linkedNode = tree.find((n) => n.id === linkedId);
        if (linkedNode?.isAscendancyStart) continue;

        // Avoid duplicate mutations for the same target node
        const alreadyExists = mutations.some((m) => {
          const p = m.payload as PassiveAddPayload;
          return p.targetNodeId === linkedId;
        });
        if (alreadyExists) continue;

        mutations.push(this.createPassiveAddMutation(linkedId, baseline.baselineHash));
      }
    }

    return mutations;
  }

  /**
   * For each allocated node (excluding ClassStart, Keystone, AscendClassStart, isMultipleChoice),
   * create a passive_remove mutation.
   */
  async generatePassiveRemoveCandidates(baseline: BaselineSnapshot): Promise<BuildMutation[]> {
    const tree = await this.treeProvider.getTree(baseline);
    const mutations: BuildMutation[] = [];

    for (const allocNodeId of baseline.passiveNodes) {
      const treeNode = tree.find((n) => n.id === allocNodeId);
      if (!treeNode) continue;

      const skipTypes = ['ClassStart', 'Keystone', 'AscendClassStart'];
      if (skipTypes.includes(treeNode.type ?? '')) continue;
      if (treeNode.isMultipleChoice) continue;

      mutations.push(this.createPassiveRemoveMutation(allocNodeId, baseline.baselineHash));
    }

    return mutations;
  }

  /**
   * For each item slot in target build, create a gear_swap mutation.
   */
  generateGearSwapCandidates(targetBuildItems: ItemInfo[], baseline: BaselineSnapshot): BuildMutation[] {
    return targetBuildItems.map((item) =>
      this.createGearSwapMutation(item.slotName, item.rawText ?? '', baseline.baselineHash, item.slotName)
    );
  }

  // ============================================
  // Helpers
  // ============================================

  private generateMutationId(type: string, target: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const hash = createHash('sha256')
      .update(`${type}:${target}:${timestamp}:${random}`)
      .digest('hex')
      .slice(0, 16);
    return `mut-${type}-${target}-${hash}`;
  }
}
