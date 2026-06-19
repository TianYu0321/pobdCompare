import { describe, it, expect, vi } from 'vitest';
import { MutationFactory } from './mutation-applier';
import type { PassiveTreeProvider, PassiveTreeNode } from './mutation-applier';
import type { BaselineSnapshot, ItemInfo, BuildMutation } from '@pobd/schemas';

const mockTreeProvider: PassiveTreeProvider = {
  getTree: vi.fn().mockResolvedValue([
    { id: 1, type: 'ClassStart', linked: [2, 3] },
    { id: 2, linked: [1, 4] },
    { id: 3, linked: [1] },
    { id: 4, linked: [2, 5] },
    { id: 5, linked: [4] },
  ] as PassiveTreeNode[]),
};

const mockBaseline: BaselineSnapshot = {
  id: 'baseline-1',
  baselineHash: 'hash-abc',
  source: 'build_xml',
  buildXml: '<Build/>',
  buildXmlCanonicalHash: 'can-abc',
  pob2Version: '1.0.0',
  pob2DataVersion: '1.0.0',
  gameVersion: '0.1.0',
  character: {},
  mainSkillSelection: {
    selectedSkillNumber: 1,
    selectionMode: 'user_confirmed',
    selectedSkillName: 'Test',
    candidates: [],
    warnings: [],
  },
  skillNumber: 1,
  weaponSet: 1,
  config: {},
  calcsOutput: {},
  rawBreakdown: {},
  skillDpsList: [],
  skillGroups: [],
  items: [],
  passiveNodes: [1, 2], // 1 and 2 are allocated
  ascendNodes: [],
  jewels: [],
  createdAt: Date.now(),
};

describe('MutationFactory', () => {
  it('createPassiveAddMutation returns correct mutation', () => {
    const factory = new MutationFactory(mockTreeProvider);
    const mut = factory.createPassiveAddMutation(42, 'hash-abc');

    expect(mut.type).toBe('passive_add');
    expect(mut.baselineHash).toBe('hash-abc');
    expect(mut.payload).toMatchObject({
      targetNodeId: 42,
      requestedNodeIds: [42],
      checkConnectivity: true,
    });
    expect(mut.source).toBe('candidate_list');
    expect(mut.mutationId).toContain('passive_add');
  });

  it('createPassiveRemoveMutation returns correct mutation', () => {
    const factory = new MutationFactory(mockTreeProvider);
    const mut = factory.createPassiveRemoveMutation(42, 'hash-abc');

    expect(mut.type).toBe('passive_remove');
    expect(mut.payload).toMatchObject({
      targetNodeId: 42,
      requestedNodeIds: [42],
      cascadeRemove: true,
    });
    expect(mut.source).toBe('candidate_list');
  });

  it('createGearSwapMutation returns correct mutation', () => {
    const factory = new MutationFactory(mockTreeProvider);
    const mut = factory.createGearSwapMutation('Weapon 1', 'Some Item\nBase', 'hash-abc');

    expect(mut.type).toBe('item_swap');
    expect(mut.payload).toMatchObject({
      slotName: 'Weapon 1',
      itemRaw: 'Some Item\nBase',
      preserveLinks: true,
    });
    expect(mut.source).toBe('target_bd_import');
  });

  it('createGearSwapMutation accepts and stores sourceSlotName', () => {
    const factory = new MutationFactory(mockTreeProvider);
    const mut = factory.createGearSwapMutation('Helm', 'Item\nBase', 'hash', 42, 'Helmet');

    expect(mut.type).toBe('item_swap');
    expect((mut.payload as Record<string, unknown>).slotName).toBe('Helm');
    expect((mut.payload as Record<string, unknown>).sourceSlotName).toBe('Helmet');
    expect((mut.payload as Record<string, unknown>).itemId).toBe(42);
  });

  it('createGearComboMutation returns correct mutation', () => {
    const factory = new MutationFactory(mockTreeProvider);
    const swaps = [
      { slotName: 'Weapon 1', itemRaw: 'Item A' },
      { slotName: 'Body Armour', itemRaw: 'Item B' },
    ];
    const mut = factory.createGearComboMutation(swaps, 'hash-abc');

    expect(mut.type).toBe('item_combo');
    expect((mut.payload as Record<string, unknown>).swaps).toHaveLength(2);
    expect((mut.payload as Record<string, unknown>).comboDescription).toContain('Weapon 1');
  });

  it('createConfigChangeMutation returns correct mutation', () => {
    const factory = new MutationFactory(mockTreeProvider);
    const mut = factory.createConfigChangeMutation({ boss: true }, 'hash-abc');

    expect(mut.type).toBe('config_change');
    expect((mut.payload as Record<string, unknown>).changes).toEqual({ boss: true });
    expect(mut.source).toBe('user_input');
  });

  it('generatePassiveAddCandidates finds linked unallocated nodes', async () => {
    const factory = new MutationFactory(mockTreeProvider);
    const candidates = await factory.generatePassiveAddCandidates(mockBaseline);

    // Allocated: 1, 2
    // From 1: linked [2, 3] -> 2 is allocated, 3 is unallocated => candidate 3
    // From 2: linked [1, 4] -> 1 is allocated, 4 is unallocated => candidate 4
    // 5 is not linked to any allocated node, so not a candidate
    expect(candidates.length).toBe(2);
    const targets = candidates.map((c) => (c.payload as Record<string, unknown>).targetNodeId as number);
    expect(targets).toContain(3);
    expect(targets).toContain(4);
  });

  it('generatePassiveAddCandidates deduplicates same target node', async () => {
    // If multiple allocated nodes link to the same unallocated node, it should only appear once
    const dedupProvider: PassiveTreeProvider = {
      getTree: vi.fn().mockResolvedValue([
        { id: 1, linked: [3] },
        { id: 2, linked: [3] },
        { id: 3, linked: [1, 2] },
      ] as PassiveTreeNode[]),
    };
    const factory = new MutationFactory(dedupProvider);
    const baseline = { ...mockBaseline, passiveNodes: [1, 2] };
    const candidates = await factory.generatePassiveAddCandidates(baseline);

    const targets = candidates.map((c) => (c.payload as Record<string, unknown>).targetNodeId as number);
    expect(targets.filter((t) => t === 3).length).toBe(1);
  });

  it('generatePassiveAddCandidates skips ascendancy start nodes', async () => {
    const ascendProvider: PassiveTreeProvider = {
      getTree: vi.fn().mockResolvedValue([
        { id: 1, linked: [2] },
        { id: 2, isAscendancyStart: true, linked: [1] },
      ] as PassiveTreeNode[]),
    };
    const factory = new MutationFactory(ascendProvider);
    const baseline = { ...mockBaseline, passiveNodes: [1] };
    const candidates = await factory.generatePassiveAddCandidates(baseline);

    expect(candidates.length).toBe(0);
  });

  it('generatePassiveRemoveCandidates skips protected node types', async () => {
    const removeProvider: PassiveTreeProvider = {
      getTree: vi.fn().mockResolvedValue([
        { id: 1, type: 'ClassStart', linked: [2] },
        { id: 2, type: 'Normal', linked: [1, 3] },
        { id: 3, type: 'Keystone', linked: [2] },
        { id: 4, type: 'AscendClassStart', linked: [] },
        { id: 5, type: 'Normal', isMultipleChoice: true, linked: [] },
        { id: 6, type: 'Normal', linked: [] },
      ] as PassiveTreeNode[]),
    };
    const factory = new MutationFactory(removeProvider);
    const baseline = { ...mockBaseline, passiveNodes: [1, 2, 3, 4, 5, 6] };
    const candidates = await factory.generatePassiveRemoveCandidates(baseline);

    const targets = candidates.map((c) => (c.payload as Record<string, unknown>).targetNodeId as number);
    expect(targets).toContain(2);
    expect(targets).toContain(6);
    expect(targets).not.toContain(1); // ClassStart
    expect(targets).not.toContain(3); // Keystone
    expect(targets).not.toContain(4); // AscendClassStart
    expect(targets).not.toContain(5); // isMultipleChoice
    expect(candidates.length).toBe(2);
  });

  it('generateGearSwapCandidates creates one mutation per item', () => {
    const factory = new MutationFactory(mockTreeProvider);
    const items: ItemInfo[] = [
      { slotName: 'Weapon 1', itemId: 1, name: 'Sword', baseType: 'Sword', rawText: 'Sword\nBase' },
      { slotName: 'Body Armour', itemId: 2, name: 'Armour', baseType: 'Armour', rawText: 'Armour\nBase' },
    ];
    const candidates = factory.generateGearSwapCandidates(items, mockBaseline);

    expect(candidates.length).toBe(2);
    expect(candidates[0].type).toBe('item_swap');
    expect((candidates[0].payload as Record<string, unknown>).slotName).toBe('Weapon 1');
    expect(candidates[1].type).toBe('item_swap');
    expect((candidates[1].payload as Record<string, unknown>).slotName).toBe('Body Armour');
  });
});
