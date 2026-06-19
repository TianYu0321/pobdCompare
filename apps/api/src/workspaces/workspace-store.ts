import { randomUUID } from 'node:crypto';

import { MutationFactory, VariantSessionManager } from '@pobd/core';
import { toCanonicalSlot, isCanonicalSlotFamily } from '@pobd/core';
import { computeBuildDiff } from '@pobd/core';
import type {
  BaselineSnapshot,
  BuildMutation,
  ItemInfo,
  NormalizedBuild,
  SimulationResult,
  VariantRevision,
  VariantSession,
  BuildDiffResult,
} from '@pobd/schemas';

import type { StoredImport } from '../services/import-service.js';

export type WorkspaceSide = 'a' | 'b';

export interface GearCandidate {
  id: string;
  sourceSide: WorkspaceSide;
  slotName: string;
  itemId: number;
  name: string;
  baseType: string;
  rawText?: string;
  applicable: boolean;
}

export interface WorkspaceView {
  id: string;
  importA: StoredImport;
  importB?: StoredImport;
  a: {
    session: VariantSession;
    currentBuildXml: string;
    currentBaseline: BaselineSnapshot;
    currentRevision: VariantRevision;
    currentNormalizedBuild: NormalizedBuild;
  };
  b?: {
    session: VariantSession;
    currentBuildXml: string;
    currentBaseline: BaselineSnapshot;
    currentRevision: VariantRevision;
    currentNormalizedBuild: NormalizedBuild;
  };
  diff?: BuildDiffResult;
}

export interface ApplyGearSwapOutcome {
  applied: boolean;
  result?: SimulationResult;
  revision?: VariantRevision;
  workspace: WorkspaceView;
}

interface SideState {
  imported: StoredImport;
  session: VariantSessionManager;
  xmlByRevision: Map<string, string>;
  snapshotByRevision: Map<string, BaselineSnapshot>;
  displayBuildByRevision: Map<string, NormalizedBuild>;
}

interface WorkspaceState {
  id: string;
  a: SideState;
  b?: SideState;
}

export interface GearSwapExecutorInput {
  baseline: BaselineSnapshot;
  currentBuildXml: string;
  mutation: BuildMutation;
}

export interface GearSwapExecutorOutput {
  buildXml: string;
  result: SimulationResult;
  snapshot?: BaselineSnapshot;
}

export interface GearSwapExecutor {
  applyGearSwap(input: GearSwapExecutorInput): Promise<GearSwapExecutorOutput>;
}

const noTreeProvider = { getTree: async () => [] };

export class WorkspaceStore {
  private readonly workspaces = new Map<string, WorkspaceState>();
  private readonly mutationFactory = new MutationFactory(noTreeProvider);

  constructor(private readonly executor: GearSwapExecutor) {}

  create(importA: StoredImport, importB?: StoredImport): WorkspaceView {
    if (!importA.baseline) throw new Error('Build A 不可计算，不能创建工作区');
    if (importB && !importB.baseline) throw new Error('Build B 不可计算，不能创建双 BD 工作区');
    const id = randomUUID();
    const state: WorkspaceState = {
      id,
      a: this.sideState(importA),
      b: importB ? this.sideState(importB) : undefined,
    };
    this.workspaces.set(id, state);
    return this.view(state);
  }

  get(id: string): WorkspaceView | undefined {
    const workspace = this.workspaces.get(id);
    return workspace ? this.view(workspace) : undefined;
  }

  gearCandidates(id: string, targetSide: WorkspaceSide): GearCandidate[] {
    const workspace = this.requireWorkspace(id);
    const sources = [workspace.a, workspace.b].filter((side): side is SideState => Boolean(side));
    return sources.flatMap((source) =>
      source.imported.baseline!.items.map((item: ItemInfo) => ({
        id: `${source === workspace.a ? 'a' : 'b'}:${item.slotName}:${item.itemId}`,
        sourceSide: source === workspace.a ? 'a' : 'b',
        slotName: item.slotName,
        itemId: item.itemId,
        name: item.name,
        baseType: item.baseType,
        rawText: item.rawText,
        applicable: Boolean(item.rawText) && source !== workspace[targetSide],
      })),
    );
  }

  async applyGearSwap(
    id: string,
    targetSide: WorkspaceSide,
    candidateId: string,
    targetSlotName: string,
  ): Promise<ApplyGearSwapOutcome> {
    const workspace = this.requireWorkspace(id);
    const target = this.requireSide(workspace, targetSide);

    if (!targetSlotName) {
      throw new Error('targetSlotName 是必填参数');
    }

    const candidate = this.gearCandidates(id, targetSide).find((item) => item.id === candidateId);
    if (!candidate) throw new Error('装备候选不存在');
    if (!candidate.applicable || !candidate.rawText) {
      throw new Error('该装备缺少 PoB2 原始数据或来自当前侧，不能应用');
    }
    if (!isCanonicalSlotFamily(candidate.slotName, targetSlotName)) {
      throw new Error(`装备槽位不匹配：候选 ${candidate.slotName} → 目标 ${targetSlotName}`);
    }

    const baseline = target.imported.baseline!;
    const current = target.session.current();
    const currentBuildXml = target.xmlByRevision.get(current.revisionId) ?? baseline.buildXml;
    const mutation = this.mutationFactory.createGearSwapMutation(
      targetSlotName,
      candidate.rawText,
      baseline.baselineHash,
      candidate.itemId,
    );
    (mutation.payload as Record<string, unknown>).sourceSlotName = candidate.slotName;

    const applied = await this.executor.applyGearSwap({ baseline, currentBuildXml, mutation });

    // Incompatible / calc_failed / invalid_variant: do NOT append
    if (applied.result.resultKind === 'incompatible'
      || applied.result.resultKind === 'calc_failed'
      || applied.result.resultKind === 'invalid_variant') {
      return {
        applied: false,
        result: applied.result,
        workspace: this.view(workspace),
      };
    }

    const snapshot = applied.snapshot ?? baseline;
    const revision: VariantRevision = {
      revisionId: `rev-${randomUUID()}`,
      parentRevisionId: current.revisionId,
      variantHash: applied.result.variantHash,
      mutation,
      result: applied.result,
      createdAt: Date.now(),
    };
    target.session.append(revision);
    target.xmlByRevision.set(revision.revisionId, applied.buildXml);
    target.snapshotByRevision.set(revision.revisionId, snapshot);

    const parentDisplay = target.displayBuildByRevision.get(current.revisionId) ?? target.imported.normalizedBuild!;
    const displayBuild: NormalizedBuild = this.cloneBuildAndReplaceSlot(
      parentDisplay,
      targetSlotName,
      candidate.slotName,
      target.imported.normalizedBuild!,
    );
    target.displayBuildByRevision.set(revision.revisionId, displayBuild);

    return {
      applied: true,
      result: applied.result,
      revision,
      workspace: this.view(workspace),
    };
  }

  undo(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.undo();
  }

  undoWithPayload(id: string, side: WorkspaceSide): ApplyGearSwapOutcome {
    this.undo(id, side);
    return { applied: true, workspace: this.get(id)! };
  }

  redo(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.redo();
  }

  redoWithPayload(id: string, side: WorkspaceSide): ApplyGearSwapOutcome {
    this.redo(id, side);
    return { applied: true, workspace: this.get(id)! };
  }

  reset(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.reset();
  }

  resetWithPayload(id: string, side: WorkspaceSide): ApplyGearSwapOutcome {
    this.reset(id, side);
    return { applied: true, workspace: this.get(id)! };
  }

  private sideState(imported: StoredImport): SideState {
    const baseline = imported.baseline!;
    return {
      imported,
      session: new VariantSessionManager(baseline.baselineHash),
      xmlByRevision: new Map([['rev-0', baseline.buildXml]]),
      snapshotByRevision: new Map([['rev-0', baseline]]),
      displayBuildByRevision: new Map([['rev-0', imported.normalizedBuild!]]),
    };
  }

  private requireWorkspace(id: string): WorkspaceState {
    const workspace = this.workspaces.get(id);
    if (!workspace) throw new Error('工作区不存在');
    return workspace;
  }

  private requireSide(workspace: WorkspaceState, side: WorkspaceSide): SideState {
    const state = workspace[side];
    if (!state) throw new Error(`Build ${side.toUpperCase()} 不存在`);
    return state;
  }

  private view(workspace: WorkspaceState): WorkspaceView {
    const sideView = (side: SideState) => {
      const current = side.session.current();
      const buildXml = side.xmlByRevision.get(current.revisionId) ?? side.imported.baseline!.buildXml;
      const baseline = side.snapshotByRevision.get(current.revisionId) ?? side.imported.baseline!;
      const display = side.displayBuildByRevision.get(current.revisionId) ?? side.imported.normalizedBuild!;
      return {
        session: side.session.snapshot(),
        currentBuildXml: buildXml,
        currentBaseline: baseline,
        currentRevision: current,
        currentNormalizedBuild: display,
      };
    };
    const viewA = sideView(workspace.a);
    const viewB = workspace.b ? sideView(workspace.b) : undefined;

    let diff: BuildDiffResult | undefined;
    if (viewB && workspace.a.imported.normalizedBuild && workspace.b!.imported.normalizedBuild) {
      const skill =
        workspace.a.imported.baseline?.mainSkillSelection.selectedSkillName
        ?? workspace.a.imported.normalizedBuild!.skillDps[0]?.skillName
        ?? '待选择';
      diff = computeBuildDiff(viewA.currentNormalizedBuild, viewB.currentNormalizedBuild, skill);
    }

    return {
      id: workspace.id,
      importA: workspace.a.imported,
      importB: workspace.b?.imported,
      a: viewA,
      b: viewB,
      diff,
    };
  }

  private cloneBuildAndReplaceSlot(
    parent: NormalizedBuild,
    targetSlotName: string,
    sourceSlotName: string,
    sourceBuild: NormalizedBuild,
  ): NormalizedBuild {
    const canonicalTarget = toCanonicalSlot(targetSlotName);
    const sourceSlot = sourceBuild.equipments.find(
      (slot) => toCanonicalSlot(slot.slotName) === canonicalTarget,
    );
    if (!sourceSlot) return { ...parent, equipments: [...parent.equipments] };

    const newEquipments = parent.equipments.map((slot) => {
      if (toCanonicalSlot(slot.slotName) === canonicalTarget) {
        return {
          ...sourceSlot,
          slotName: slot.slotName,
        };
      }
      return slot;
    });

    return { ...parent, equipments: newEquipments };
  }
}
