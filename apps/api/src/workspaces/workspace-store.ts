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
import type { PassiveAnalysisService, PassiveRankings } from '../services/passive-analysis.js';

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
  passives?: { a?: PassiveRankings; b?: PassiveRankings };
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
  snapshot: BaselineSnapshot;
}

export interface GearSwapExecutor {
  applyGearSwap(input: GearSwapExecutorInput): Promise<GearSwapExecutorOutput>;
}

const noTreeProvider = { getTree: async () => [] };

export class WorkspaceStore {
  private readonly workspaces = new Map<string, WorkspaceState>();
  private readonly mutationFactory = new MutationFactory(noTreeProvider);

  constructor(
    private readonly executor: GearSwapExecutor,
    private readonly passivesService?: PassiveAnalysisService,
  ) {}

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
    const currentBuildXml = this.requireRevisionValue(
      target.xmlByRevision,
      current.revisionId,
      'buildXml',
    );
    const mutation = this.mutationFactory.createGearSwapMutation(
      targetSlotName,
      candidate.rawText,
      baseline.baselineHash,
      candidate.itemId,
      candidate.slotName,
    );

    const applied = await this.executor.applyGearSwap({ baseline, currentBuildXml, mutation });

    // Incompatible / calc_failed / invalid_variant: do NOT append and do NOT rerun passives
    if (applied.result.resultKind === 'incompatible'
      || applied.result.resultKind === 'calc_failed'
      || applied.result.resultKind === 'invalid_variant') {
      return {
        applied: false,
        result: applied.result,
        workspace: this.view(workspace),
      };
    }

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
    target.snapshotByRevision.set(revision.revisionId, applied.snapshot);

    const sourceSide = this.requireSide(workspace, candidate.sourceSide);
    const parentDisplay = this.requireRevisionValue(
      target.displayBuildByRevision,
      current.revisionId,
      'displayBuild',
    );
    const swappedDisplay = this.cloneBuildAndReplaceSlot(
      parentDisplay,
      targetSlotName,
      candidate.slotName,
      sourceSide.imported.normalizedBuild!,
    );
    const displayBuild = this.syncDisplayBuildWithSnapshot(swappedDisplay, applied.snapshot);
    target.displayBuildByRevision.set(revision.revisionId, displayBuild);

    // Recompute passive rankings for the changed side's currentBaseline
    let passives: { a?: PassiveRankings; b?: PassiveRankings } | undefined;
    if (this.passivesService) {
      try {
        const sideKey = targetSide as 'a' | 'b';
        const sideSnapshot = this.requireRevisionValue(
          target.snapshotByRevision,
          revision.revisionId,
          'snapshot',
        );
        const rankings = await this.passivesService.analyze(sideSnapshot);
        passives = { [sideKey]: rankings };
      } catch {
        // Passive analysis failure must not corrupt the workspace revision
      }
    }

    return {
      applied: true,
      result: applied.result,
      revision,
      workspace: this.view(workspace),
      passives,
    };
  }

  undo(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.undo();
  }

  async undoWithPayload(id: string, side: WorkspaceSide): Promise<ApplyGearSwapOutcome> {
    this.undo(id, side);
    return this.withPassives(id, side);
  }

  redo(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.redo();
  }

  async redoWithPayload(id: string, side: WorkspaceSide): Promise<ApplyGearSwapOutcome> {
    this.redo(id, side);
    return this.withPassives(id, side);
  }

  reset(id: string, side: WorkspaceSide): VariantRevision {
    return this.requireSide(this.requireWorkspace(id), side).session.reset();
  }

  async resetWithPayload(id: string, side: WorkspaceSide): Promise<ApplyGearSwapOutcome> {
    this.reset(id, side);
    return this.withPassives(id, side);
  }

  private async withPassives(id: string, side: WorkspaceSide): Promise<ApplyGearSwapOutcome> {
    const workspace = this.view(this.requireWorkspace(id));
    let passives: { a?: PassiveRankings; b?: PassiveRankings } | undefined;
    if (this.passivesService) {
      try {
        const sideView = side === 'a' ? workspace.a : workspace.b;
        if (sideView) {
          const rankings = this.passivesService.getCached(sideView.currentBaseline.baselineHash)
            ?? await this.passivesService.analyze(sideView.currentBaseline as Parameters<PassiveAnalysisService['analyze']>[0]);
          passives = { [side]: rankings };
        }
      } catch {
        // passive analysis failure does not corrupt revision
      }
    }
    return { applied: true, workspace, passives };
  }

  private sideState(imported: StoredImport): SideState {
    const baseline = imported.baseline!;
    return {
      imported,
      session: new VariantSessionManager(baseline.baselineHash),
      xmlByRevision: new Map([['rev-0', baseline.buildXml]]),
      snapshotByRevision: new Map([['rev-0', baseline]]),
      displayBuildByRevision: new Map([
        ['rev-0', this.syncDisplayBuildWithSnapshot(imported.normalizedBuild!, baseline)],
      ]),
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

  private requireRevisionValue<T>(map: Map<string, T>, revisionId: string, label: string): T {
    const value = map.get(revisionId);
    if (value === undefined) {
      throw new Error(`WorkspaceStore invariant: ${label} for revision ${revisionId} not found`);
    }
    return value;
  }

  private view(workspace: WorkspaceState): WorkspaceView {
    const sideView = (side: SideState) => {
      const current = side.session.current();
      const buildXml = this.requireRevisionValue(side.xmlByRevision, current.revisionId, 'buildXml');
      const baseline = this.requireRevisionValue(side.snapshotByRevision, current.revisionId, 'snapshot');
      const display = this.requireRevisionValue(side.displayBuildByRevision, current.revisionId, 'displayBuild');
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
        viewA.currentBaseline.mainSkillSelection?.selectedSkillName
        ?? viewA.currentNormalizedBuild.skillDps[0]?.skillName
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

    const canonicalSourceName = toCanonicalSlot(sourceSlotName);
    let replaced = false;
    const newEquipments = parent.equipments.map((slot) => {
      if (toCanonicalSlot(slot.slotName) === canonicalTarget) {
        replaced = true;
        return { ...sourceSlot, slotName: slot.slotName };
      }
      return slot;
    });

    // If the parent didn't have this slot, append it
    if (!replaced) {
      newEquipments.push({ ...sourceSlot, slotName: canonicalSourceName });
    }

    return { ...parent, equipments: newEquipments };
  }

  private syncDisplayBuildWithSnapshot(
    display: NormalizedBuild,
    snapshot: BaselineSnapshot,
  ): NormalizedBuild {
    const output = (key: string): number | undefined => {
      const calcs = snapshot.calcsOutput[key];
      if (typeof calcs === 'number' && Number.isFinite(calcs)) return calcs;
      const main = snapshot.mainOutput?.[key];
      return typeof main === 'number' && Number.isFinite(main) ? main : undefined;
    };
    const selectedSkill = snapshot.mainSkillSelection.selectedSkillName;
    const dps = output('CombinedDPS');
    const hitDamage = output('AverageDamage') ?? output('MainHand_AverageHit');
    const attackSpeed = output('Speed') ?? output('AttackSpeed');
    const critChance = output('CritChance');

    const nextSkill = {
      skillName: selectedSkill,
      dps,
      hitDamage,
      attackSpeed,
      critChance,
      source: 'pob' as const,
    };
    const selectedIndex = display.skillDps.findIndex(
      (skill) => skill.skillName === selectedSkill,
    );
    const skillDps =
      selectedIndex >= 0
        ? display.skillDps.map((skill, index) =>
            index === selectedIndex ? { ...skill, ...nextSkill } : skill,
          )
        : [...display.skillDps, nextSkill];

    return {
      ...display,
      skillDps,
      panel: {
        ...display.panel,
        life: output('Life') ?? display.panel.life,
        energyShield: output('EnergyShield') ?? display.panel.energyShield,
        armour: output('Armour') ?? display.panel.armour,
        evasion: output('Evasion') ?? display.panel.evasion,
        blockChance: output('BlockChance') ?? display.panel.blockChance,
        attackSpeed: attackSpeed ?? display.panel.attackSpeed,
        critChance: critChance ?? display.panel.critChance,
      },
    };
  }
}
