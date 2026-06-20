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
    skillPart: undefined,
    weaponSet: 1,
    config: {},
    customMods: undefined,
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

function makeImported(
  id: string,
  hash: string,
  itemName: string,
  slotName = 'Weapon 1',
  extraItems?: { slotName: string; itemId: number; name: string }[],
): StoredImport {
  const items = extraItems ?? [{ slotName, itemId: 1, name: itemName }];
  const baseline = makeBaseline(hash, items);
  const normalizedBuild: NormalizedBuild = {
    source: 'build_file',
    meta: { confidence: 1 },
    character: {},
    skills: [],
    skillDps: [],
    equipments: items.map((item) => ({
      slotName: item.slotName,
      item: { name: item.name, baseType: 'Mace' },
    })),
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

const alwaysSnapshot = () => makeBaseline('snap-fresh', []);

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
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
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
      makeImported('a', 'hash-a', 'Axe', 'Weapon 1'),
      makeImported('b', 'hash-b', 'HelmetItem', 'Helm'),
    );
    const helmCandidate = store
      .gearCandidates(workspace.id, 'a')
      .find((item) => item.sourceSide === 'b' && item.slotName === 'Helm')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', helmCandidate.id, 'Helm');
    expect(outcome.applied).toBe(true);
  });

  it('uses candidate raw text instead of a source-build-local itemId', async () => {
    const importA = makeImported('a', 'hash-a', 'Target Axe');
    const importB = makeImported('b', 'hash-b', 'Source Maul');
    expect(importA.baseline!.items[0]?.itemId).toBe(1);
    expect(importB.baseline!.items[0]?.itemId).toBe(1);

    const store = new WorkspaceStore({
      applyGearSwap: async ({ mutation }) => {
        expect(mutation.payload).toMatchObject({
          slotName: 'Weapon 1',
          itemRaw: 'Rarity: Rare\nSource Maul\nMace',
        });
        expect('itemId' in mutation.payload ? mutation.payload.itemId : undefined).toBeUndefined();
        return {
          buildXml: '<PathOfBuilding variant="source-maul"/>',
          result: okResult(),
          snapshot: makeBaseline('snap-source-maul', [
            { slotName: 'Weapon 1', itemId: 2, name: 'Source Maul' },
          ]),
        };
      },
    });
    const workspace = store.create(importA, importB);
    const candidate = store.gearCandidates(workspace.id, 'a')
      .find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(
      workspace.id,
      'a',
      candidate.id,
      'Weapon 1',
    );

    expect(outcome.applied).toBe(true);
    expect(outcome.workspace.a.currentBaseline.items[0]?.name).toBe('Source Maul');
  });

  it('validates candidate is from opposite side and has rawText', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: okResult(),
        snapshot: alwaysSnapshot(),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'));

    await expect(
      store.applyGearSwap(workspace.id, 'a', 'b:Weapon 1:999', 'Weapon 1'),
    ).rejects.toThrow('装备候选不存在');
  });

  it('validates targetSlotName is mandatory', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: okResult(),
        snapshot: alwaysSnapshot(),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));

    await expect(
      store.applyGearSwap(workspace.id, 'a', 'b:Weapon 1:1', ''),
    ).rejects.toThrow('targetSlotName');
  });

  it('validates canonical slot family match', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: okResult(),
        snapshot: alwaysSnapshot(),
      }),
    });
    const workspace = store.create(
      makeImported('a', 'hash-a', 'Axe', 'Weapon 1'),
      makeImported('b', 'hash-b', 'BootsItem', 'Boots'),
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
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
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
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
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
        snapshot: alwaysSnapshot(),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
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
        snapshot: alwaysSnapshot(),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(false);
    expect(store.get(workspace.id)?.a.session.cursor).toBe(0);
  });

  it('rejects concurrent mutation with stale parentRevisionId (CAS)', async () => {
    // Two mutations start concurrently, second completes first, first is stale
    let resolveGo: (() => void) | undefined;
    const go = new Promise<void>((resolve) => { resolveGo = resolve; });
    let swapsStarted = 0;
    const store = new WorkspaceStore({
      applyGearSwap: async () => {
        swapsStarted++;
        if (swapsStarted === 1) {
          // First mutation blocks until released
          await go;
          return {
            buildXml: '<PathOfBuilding variant="late"/>',
            result: okResult({ variantHash: 'variant-late' }),
            snapshot: makeBaseline('snap-late', []),
          };
        }
        // Second mutation completes immediately
        return {
          buildXml: '<PathOfBuilding variant="fast"/>',
          result: okResult({ variantHash: 'variant-fast' }),
          snapshot: makeBaseline('snap-fast', []),
        };
      },
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    // Start both concurrently
    const o1Promise = store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    const o2Promise = store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    // Both started
    expect(swapsStarted).toBe(2);
    // Second completes first (fast)
    const o2 = await o2Promise;
    expect(o2.applied).toBe(true);
    expect(o2.revision?.variantHash).toBe('variant-fast');

    // Now release the first (late) mutation
    resolveGo!();
    const o1 = await o1Promise;

    // First mutation must be rejected as stale
    expect(o1.applied).toBe(false);
    expect(o1.result?.resultKind).toBe('calc_failed');
    expect(o1.result?.errorCode).toBe('stale_revision');

    // Cursor must still be at rev-1 (the fast mutation)
    expect(store.get(workspace.id)?.a.session.cursor).toBe(1);
    expect(store.get(workspace.id)?.a.currentBaseline?.id).toBe('snap-fast');
  });

  it('snapshot is mandatory: executor must return snapshot on success', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult(),
        snapshot: makeBaseline('snap-mandatory', []),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;
    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(true);
    const savedSnapshot = store.get(workspace.id)?.a.currentBaseline;
    expect(savedSnapshot?.id).toBe('snap-mandatory');
  });

  it('snapshot recomputation failure returns calc_failed outcome, does not append', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding baseline/>',
        result: {
          ...calcFailedResult,
          errorMessage: 'snapshot failed',
        },
        snapshot: makeBaseline('snap-stale', []),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(false);
    expect(outcome.result?.resultKind).toBe('calc_failed');
    expect(outcome.result?.errorMessage).toBe('snapshot failed');
    // Cursor must NOT advance
    expect(store.get(workspace.id)?.a.session.cursor).toBe(0);
    // XML must remain baseline
    expect(store.get(workspace.id)?.a.currentBuildXml).toBe('<PathOfBuilding/>');
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
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const o1 = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(o1.applied).toBe(true);
    expect(o1.revision!.parentRevisionId).toBe('rev-0');
    expect(callCount).toBe(1);

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
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    store.undo(workspace.id, 'a');
    const viewAfterUndo = store.get(workspace.id)!;
    expect(viewAfterUndo.a.currentBuildXml).toBe('<PathOfBuilding/>');
    expect(viewAfterUndo.a.currentBaseline).toBeDefined();

    store.redo(workspace.id, 'a');
    const viewAfterRedo = store.get(workspace.id)!;
    expect(viewAfterRedo.a.currentBuildXml).toBe('<PathOfBuilding variant="1"/>');
    expect(viewAfterRedo.a.currentBaseline!.id).toBe('snap-1');

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
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    const undoPayload = await store.undoWithPayload(workspace.id, 'a');
    expect(undoPayload.workspace.a.currentBaseline).toBeDefined();
    expect(undoPayload.workspace.a.session.cursor).toBe(0);

    const redoPayload = await store.redoWithPayload(workspace.id, 'a');
    expect(redoPayload.workspace.a.session.cursor).toBe(1);

    const resetPayload = await store.resetWithPayload(workspace.id, 'a');
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
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    let view = store.get(workspace.id)!;
    expect(view.a.currentBaseline.baselineHash).toBe('hash-a');
    expect(view.a.currentRevision.revisionId).toBe('rev-0');

    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;
    await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    view = store.get(workspace.id)!;
    expect(view.a.currentRevision.revisionId).not.toBe('rev-0');
    expect(view.a.currentBaseline.id).toBe('snap-1');
  });

  it('display build uses candidate sourceSide normalized build', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult(),
        snapshot: makeBaseline('snap-display', []),
      }),
    });
    const importA = makeImported('a', 'hash-a', 'Axe', 'Weapon 1');
    const importB = makeImported(
      'b',
      'hash-b',
      'RichBoots',
      'Boots',
      [{ slotName: 'Boots', itemId: 99, name: 'RichBoots' }],
    );
    importB.normalizedBuild!.equipments = [
      {
        slotName: 'Boots',
        item: { name: 'RichBoots', baseType: 'Leather Boots', icon: 'https://icon.url/boots.png', rarity: 'rare' },
      },
    ];
    const workspace = store.create(importA, importB);
    const bootsCandidate = store
      .gearCandidates(workspace.id, 'a')
      .find((item) => item.sourceSide === 'b' && item.slotName === 'Boots')!;

    await store.applyGearSwap(workspace.id, 'a', bootsCandidate.id, 'Boots');
    const display = store.get(workspace.id)!.a.currentNormalizedBuild;
    const slot = display.equipments.find((s) => s.slotName === 'Boots');
    expect(slot?.item?.name).toBe('RichBoots');
    expect(slot?.item?.icon).toBe('https://icon.url/boots.png');
  });

  it('gearSwaps outcome returns workspace and current diff', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult(),
        snapshot: makeBaseline('snap-1', []),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.workspace.a.currentNormalizedBuild).toBeDefined();
    expect(outcome.workspace.diff).toBeDefined();
  });

  it('diff mainSkill comes from current baseline after swap', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okResult(),
        snapshot: makeBaseline('snap-1', [{ slotName: 'Weapon 1', itemId: 1, name: 'Weapon' }]),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    // Overwrite rev-0 snapshot to set custom skill name
    const a = (store as unknown as { workspaces: Map<string, { a: { snapshotByRevision: Map<string, BaselineSnapshot> } }> }).workspaces.get(workspace.id)!;
    a.a.snapshotByRevision.set('rev-0', makeBaseline('snap-0', []));

    // Apply swap — diff skill should come from current snapshot (rev-0 baseline has skill name 'Skill')
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;
    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.workspace.diff?.mainSkill).toBe('Skill');
  });

  it('continuous swap keeps immutable imported baseline for comparison, second buildXml is revision 1', async () => {
    const baselinesPassed: string[] = [];
    const buildXmlsPassed: string[] = [];
    const store = new WorkspaceStore({
      applyGearSwap: async ({ baseline, currentBuildXml }) => {
        baselinesPassed.push(baseline.baselineHash);
        buildXmlsPassed.push(currentBuildXml);
        return {
          buildXml: `<PathOfBuilding variant="${buildXmlsPassed.length}"/>`,
          result: okResult({ variantHash: `variant-${buildXmlsPassed.length}` }),
          snapshot: makeBaseline(`snap-${buildXmlsPassed.length}`, []),
        };
      },
    });
    const impA = makeImported('a', 'hash-immutable', 'Axe');
    const impB = makeImported('b', 'hash-b', 'Maul');
    const workspace = store.create(impA, impB);
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    // First swap
    await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    // Second swap
    await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    // Both swaps must use the immutable imported baseline hash
    expect(baselinesPassed).toEqual(['hash-immutable', 'hash-immutable']);
    // First currentBuildXml is initial; second is revision 1 variant
    expect(buildXmlsPassed[0]).toBe('<PathOfBuilding/>');
    expect(buildXmlsPassed[1]).toBe('<PathOfBuilding variant="1"/>');
  });

  it('syncs PoB2 snapshot DPS into the current display build and diff', async () => {
    const snapshot = makeBaseline('snap-dps', []);
    snapshot.calcsOutput = {
      CombinedDPS: 250,
      AverageDamage: 80,
      CritChance: 12,
      Life: 4500,
    };
    snapshot.mainSkillSelection.selectedSkillName = 'Skill';

    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="dps"/>',
        result: okResult({ variantDps: 250, dpsDelta: 150, dpsDeltaPercent: 150 }),
        snapshot,
      }),
    });
    const impA = makeImported('a', 'hash-a', 'Axe');
    const impB = makeImported('b', 'hash-b', 'Maul');
    const workspace = store.create(impA, impB);
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);

    expect(outcome.workspace.a.currentNormalizedBuild.skillDps).toContainEqual(
      expect.objectContaining({
        skillName: 'Skill',
        dps: 250,
        hitDamage: 80,
        critChance: 12,
        source: 'pob',
      }),
    );
    expect(outcome.workspace.a.currentNormalizedBuild.panel.life).toBe(4500);
    expect(outcome.workspace.diff?.dpsDiff?.myDps).toBe(250);
    expect(outcome.workspace.diff?.dpsDiff?.targetDps).toBe(100);
  });

  it('calc_failed executor makes completed job with applied:false, workspace unchanged', async () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding baseline/>',
        result: {
          ...calcFailedResult,
          errorMessage: 'snapshot failed',
        },
        snapshot: makeBaseline('snap-stale', []),
      }),
    });
    const workspace = store.create(makeImported('a', 'hash-a', 'Axe'), makeImported('b', 'hash-b', 'Maul'));
    const candidate = store.gearCandidates(workspace.id, 'a').find((item) => item.sourceSide === 'b')!;

    const outcome = await store.applyGearSwap(workspace.id, 'a', candidate.id, candidate.slotName);
    expect(outcome.applied).toBe(false);
    expect(outcome.result?.resultKind).toBe('calc_failed');
    // Workspace cursor, XML, snapshot, display all unchanged
    expect(store.get(workspace.id)?.a.session.cursor).toBe(0);
    expect(store.get(workspace.id)?.a.currentBuildXml).toBe('<PathOfBuilding/>');
  });

  it('view throws invariant error when revision map entry is missing', () => {
    const store = new WorkspaceStore({
      applyGearSwap: async () => { throw new Error('unused'); },
    });
    // Directly test the requireRevisionValue invariant method
    const map = new Map<string, string>();
    map.set('rev-0', 'exists');
    expect(() => {
      const method = (store as unknown as { requireRevisionValue: <T>(map: Map<string, T>, revisionId: string, label: string) => T }).requireRevisionValue;
      method(map, 'rev-999', 'testLabel');
    }).toThrow('testLabel');
  });
});
