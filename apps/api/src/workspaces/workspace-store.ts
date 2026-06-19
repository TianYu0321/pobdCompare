import { randomUUID } from 'node:crypto';

import { MutationFactory, VariantSessionManager } from '@pobd/core';
import type {
  BaselineSnapshot,
  BuildMutation,
  SimulationResult,
  VariantRevision,
  VariantSession,
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
  a: { session: VariantSession; currentBuildXml: string };
  b?: { session: VariantSession; currentBuildXml: string };
}

interface SideState {
  imported: StoredImport;
  session: VariantSessionManager;
  xmlByRevision: Map<string, string>;
}

interface WorkspaceState {
  id: string;
  a: SideState;
  b?: SideState;
}

export interface GearSwapExecutor {
  applyGearSwap(input: {
    baseline: BaselineSnapshot;
    currentBuildXml: string;
    mutation: BuildMutation;
  }): Promise<{ buildXml: string; result: SimulationResult }>;
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
      source.imported.baseline!.items.map((item) => ({
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
  ): Promise<VariantRevision> {
    const workspace = this.requireWorkspace(id);
    const target = this.requireSide(workspace, targetSide);
    const candidate = this.gearCandidates(id, targetSide).find((item) => item.id === candidateId);
    if (!candidate) throw new Error('装备候选不存在');
    if (!candidate.applicable || !candidate.rawText) {
      throw new Error('该装备缺少 PoB2 原始数据或来自当前侧，不能应用');
    }
    const baseline = target.imported.baseline!;
    const current = target.session.current();
    const currentBuildXml = target.xmlByRevision.get(current.revisionId) ?? baseline.buildXml;
    const mutation = this.mutationFactory.createGearSwapMutation(
      candidate.slotName,
      candidate.rawText,
      baseline.baselineHash,
      candidate.itemId,
    );
    const applied = await this.executor.applyGearSwap({ baseline, currentBuildXml, mutation });
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
    return revision;
  }

  undo(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.undo();
  }

  redo(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.redo();
  }

  reset(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.reset();
  }

  private sideState(imported: StoredImport): SideState {
    const baseline = imported.baseline!;
    return {
      imported,
      session: new VariantSessionManager(baseline.baselineHash),
      xmlByRevision: new Map([['rev-0', baseline.buildXml]]),
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
      return {
        session: side.session.snapshot(),
        currentBuildXml:
          side.xmlByRevision.get(current.revisionId) ?? side.imported.baseline!.buildXml,
      };
    };
    return {
      id: workspace.id,
      importA: workspace.a.imported,
      importB: workspace.b?.imported,
      a: sideView(workspace.a),
      b: workspace.b ? sideView(workspace.b) : undefined,
    };
  }
}
