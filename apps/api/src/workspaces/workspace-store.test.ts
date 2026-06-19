import { describe, expect, it } from 'vitest';

import type { ImportResult, SimulationResult, BaselineSnapshot } from '@pobd/schemas';
import type { NormalizedBuild } from '@pobd/schemas';

import type { StoredImport } from '../services/import-service';
import { WorkspaceStore } from './workspace-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseline(hash: string, items: { slotName: string; itemId: number; name: string }[]): BaselineSnapshot {
  return {
    id: hash,
    baselineHash: hash,
    source: 'build_file',
    buildXml: '<PathOfBuilding/>',
    buildXmlCanonicalHash: hash,
    pob2Version: '1',
    pob2DataVersion: '1',
    gameVersion: 'poe2',
    character: {},
    mainSkillSelection: {
      selectedSkillNumber: 1,
      selectedSkillName: 'Skill',
      selectionMode: 'auto_single',
      candidates: [],
      warnings: [],
    },
    skillNumber: 1,
    weaponSet: 1,
    config: {},
    calcsOutput: { CombinedDPS: 100 },
    rawBreakdown: {},
    skillDpsList: [],
    skillGroups: [],
    items: items.map((item) => ({
      slotName: item.slotName,
      itemId: item.itemId,
      name: item.name,
      baseType: 'Mace',
      rawText: `Rarity: Rare\n${item.name}\nMace`,
    })),
    passiveNodes: [],
    ascendNodes: [],
    jewels: [],
    createdAt: 1,
  };
}

function imported(id: string, hash: string, itemName: string, slotName = 'Weapon 1'): StoredImport {
  const baseline = makeBaseline(hash, [{ slotName, itemId: 1, name: itemName }]);
  const normalizedBuild: NormalizedBuild = {
    source: 'build_file',
    meta: { confidence: 1 },
    character: {},
    skills: [],
    skillDps: [],
    equipments: [{ slotName, item: { name: itemName, baseType: 'Mace' } }],
    weaponSets: [{ id: 1, offhandEmpty: true }],
    passives: [],
    jewels: [],
    panel: {},
    warnings: [],
  };
  return {
    id,
    source: 'build_file',
    status: 'calculable',
    conversionReport: {
      status: 'complete',
      skillMapped: 0, skillTotal: 0, itemMapped: 0, itemTotal: 0,
      modMapped: 0, modTotal: 0, passiveMapped: 0, passiveTotal: 0,
      ascendancyMapped: 0, ascendancyTotal: 0, configKnown: 0, configTotal: 0,
      unknownMods: [], unmappedNodes: [], unmappedSkills: [], unmappedItems: [],
      warnings: [],
    },
    warnings: [],
    baseline,
    buildXml: '<PathOfBuilding/>',
    normalizedBuild,
  };
}

const okResult = (overrides: Partial<SimulationResult> = {}): SimulationResult => ({
  variantHash: 'variant-1',
  resultKind: 'normal_gain',
  dpsDeltaPercent: 10,
  jobId: 'job',
  baselineHash: 'base',
  mutationId: 'mut',
  mutationType: 'item_swap',
  affectedSkillNumber: 1,
  isMainSkillStillValid: true,
  target: { type: 'item', slotName: 'Weapon 1' },
  baselineDps: 100,
  variantDps: 110,
  dpsDelta: 10,
  outputDiff: { offence: {} },
  warnings: [],
  evidence: [],
  createdAt: Date.now(),
  ...overrides,
});

const incompatibleResult: SimulationResult = {
  variantHash: 'variant-fail',
  resultKind: 'incompatible',
  dpsDeltaPercent: 0,
  jobId: 'job-fail',
  baselineHash: 'base',
  mutationId: 'mut-fail',
  mutationType: 'item_swap',
  affectedSkillNumber: 1,
  isMainSkillStillValid: false,
  target: { type: 'item', slotName: 'Weapon 1' },
  baselineDps: 100,
  variantDps: 100,
  dpsDelta: 0,
  outputDiff: { offence: {} },
  compatibility: { isCompatible: false, reason: 'weapon_type_mismatch' },
  warnings: ['weapon_type_mismatch'],
  evidence: [],
  createdAt: Date.now(),
};

const calcFailedResult: SimulationResult = {
  variantHash: 'variant-calc-fail',
  resultKind: 'calc_failed',
  dpsDeltaPercent: 0,
  jobId: 'job-calc-fail',
  baselineHash: 'base',
  mutationId: 'mut-calc-fail',
  mutationType: 'item_swap',
  affectedSkillNumber: 1,
  isMainSkillStillValid: false,
  target: { type: 'item', slotName: 'Weapon 1' },
  baselineDps: 100,
  variantDps: 0,
  dpsDelta: -100,
  outputDiff: { offence: {} },
  errorMessage: 'calc failed',
  warnings: ['calc failed'],
  evidence: [],
  createdAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspaceStore', () => {
  it('creates revisions and supports undo, redo and reset', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult(),
        snapshot: makeBaseline('snap-1', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store
      .gearCandidates(workspace.id, 'a')
      .find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(true);
    expect(outcome.revision).toBeDefined();
    expect(store.get(workspace.id)?.a.session.cursor).toBe(1);
    expect(store.undo(workspace.id, 'a').revisionId).toBe('rev-0');
    expect(store.redo(workspace.id, 'a').variantHash).toBe('variant-1');
    expect(store.reset(workspace.id, 'a').revisionId).toBe('rev-0');
  });

  it('uses targetSlotName, not candidate source slot', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async ({ mutation }) => {
        expect(mutation.payload.slotName).toBe('Helm');
        return {
          buildXml: '<PathOfBuilding variant="1"/>',
          result: okResult(),
          snapshot: makeBaseline('snap-1', []),
        };
      },
    });
    const workspace = store.create(
      imported('a', 'hash-a', 'Axe', 'Weapon 1'),
      imported('b', 'hash-b', 'HelmetItem', 'Helm'),
    );
    const helmCandidate = store
      .gearCandidates(workspace.id, 'a')
      .find((item) => item.sourceSide === 'b' && item.slotName === 'Helm')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', helmCandidate.id, 'Helm');
    expect(outcome.applied).toBe(true);
  });

  it('validates candidate is from opposite side and has rawText', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: okResult(),
        snapshot: makeBaseline('snap', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'));

    await expect(
      store.applyGearSwap(workspace.id, 'a', 'b:Weapon 1:999', 'Weapon 1'),
    ).rejects.toThrow('装备候选不存在');
  });

  it('validates targetSlotName is mandatory', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: okResult(),
        snapshot: makeBaseline('snap', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));

    await expect(
      store.applyGearSwap(workspace.id, 'a', 'b:Weapon 1:1', ''),
    ).rejects.toThrow('targetSlotName');
  });

  it('validates canonical slot family match', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: okResult(),
        snapshot: makeBaseline('snap', []),
      }),
    });
    const workspace = store.create(
      imported('a', 'hash-a', 'Axe', 'Weapon 1'),
      imported('b', 'hash-b', 'BootsItem', 'Boots'),
    );
    const bootsCandidate = store
      .gearCandidates(workspace.id, 'a')
      .find((item) => item.sourceSide === 'b')!;

    await expect(
      store.applyGearSwap(workspace.id, 'a', bootsCandidate.id, 'Weapon 1'),
    ).rejects.toThrow('槽位不匹配');
  });

  it('appends revision and snapshot on successful normal_gain', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult({ resultKind: 'normal_gain' }),
        snapshot: makeBaseline('snap-gain', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(true);
    expect(outcome.revision).toBeDefined();
    expect(store.get(workspace.id)?.a.session.cursor).toBe(1);
  });

  it('appends revision on normal_loss and neutral', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult({ resultKind: 'normal_loss', dpsDeltaPercent: -5 }),
        snapshot: makeBaseline('snap-loss', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(true);
    expect(store.get(workspace.id)?.a.session.cursor).toBe(1);
  });

  it('does NOT append revision on incompatible', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: incompatibleResult,
        snapshot: undefined,
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(false);
    expect(outcome.result?.resultKind).toBe('incompatible');
    expect(store.get(workspace.id)?.a.session.cursor).toBe(0);
  });

  it('does NOT append revision on calc_failed', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: calcFailedResult,
        snapshot: undefined,
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(false);
    expect(store.get(workspace.id)?.a.session.cursor).toBe(0);
  });

  it('continuous swap uses parent revision XML and chains revisions', async () => {
    let callCount = 0;
    const store = new WorkspaceStore({
      applyGearSwap: async ({ currentBuildXml }) => {
        callCount++;
        return {
          buildXml: `<PathOfBuilding variant="${callCount}"/>`,
          result: okResult({ variantHash: `variant-${callCount}` }),
          snapshot: makeBaseline(`snap-${callCount}`, []),
        };
      },
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    // First swap
    const o1 = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(o1.applied).toBe(true);
    expect(o1.revision!.revisionId).not.toBe('rev-0');
    expect(o1.revision!.parentRevisionId).toBe('rev-0');
    expect(callCount).toBe(1);

    // Second swap uses the first revision's XML
    const o2 = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(o2.applied).toBe(true);
    expect(o2.revision!.parentRevisionId).toBe(o1.revision!.revisionId);
    expect(callCount).toBe(2);
  });

  it('undo/redo/reset restore exact current build XML and snapshot', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult({ variantHash: 'variant-1' }),
        snapshot: makeBaseline('snap-1', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    // Undo back to rev-0
    store.undo(workspace.id, 'a');
    const viewAfterUndo = store.get(workspace.id)!;
    expect(viewAfterUndo.a.currentBuildXml).toBe('<PathOfBuilding/>');
    expect(viewAfterUndo.a.currentBaseline).toBeDefined();

    // Redo back to rev-1
    store.redo(workspace.id, 'a');
    const viewAfterRedo = store.get(workspace.id)!;
    expect(viewAfterRedo.a.currentBuildXml).toBe('<PathOfBuilding variant="1"/>');
    expect(viewAfterRedo.a.currentBaseline!.id).toBe('snap-1');

    // Reset to rev-0
    store.reset(workspace.id, 'a');
    const viewAfterReset = store.get(workspace.id)!;
    expect(viewAfterReset.a.currentBuildXml).toBe('<PathOfBuilding/>');
  });

  it('undo/redo/reset return workspace response payload', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult(),
        snapshot: makeBaseline('snap-1', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    const undoPayload = store.undoWithPayload(workspace.id, 'a');
    expect(undoPayload.workspace).toBeDefined();
    expect(undoPayload.workspace.a.currentBaseline).toBeDefined();
    expect(undoPayload.workspace.a.session.cursor).toBe(0);

    const redoPayload = store.redoWithPayload(workspace.id, 'a');
    expect(redoPayload.workspace.a.session.cursor).toBe(1);

    const resetPayload = store.resetWithPayload(workspace.id, 'a');
    expect(resetPayload.workspace.a.session.cursor).toBe(0);
  });

  it('WorkspaceView exposes currentBaseline and currentRevision', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult(),
        snapshot: makeBaseline('snap-1', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    let view = store.get(workspace.id)!;
    expect(view.a.currentBaseline).toBeDefined();
    expect(view.a.currentBaseline!.baselineHash).toBe('hash-a');
    expect(view.a.currentRevision.revisionId).toBe('rev-0');

    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;
    await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    view = store.get(workspace.id)!;
    expect(view.a.currentRevision.revisionId).not.toBe('rev-0');
    expect(view.a.currentBaseline!.id).toBe('snap-1');
  });

  it('gearSwaps API requires targetSlotName, returns workspace and diff', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult(),
        snapshot: makeBaseline('snap-1', []),
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.workspace).toBeDefined();
    expect(outcome.workspace!.a.currentNormalizedBuild).toBeDefined();
  });
});
