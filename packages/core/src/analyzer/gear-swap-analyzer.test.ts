import { describe, it, expect, vi } from 'vitest';
import { GearSwapAnalyzer } from './gear-swap-analyzer';
import { BaselineSnapshot, BuildVariant, BuildMutation, ItemInfo } from '@pobd/schemas';
import { ResultComparator } from '../comparator';

function createBaseline(items: ItemInfo[] = []): BaselineSnapshot {
  return {
    id: 'test',
    baselineHash: 'hash',
    source: 'build_xml',
    buildXml: '',
    buildXmlCanonicalHash: '',
    pob2Version: '1.0',
    pob2DataVersion: '1.0',
    gameVersion: '0.1',
    character: { name: 'Test', level: 90, className: 'Marauder', ascendancyName: 'Juggernaut' },
    mainSkillSelection: {
      selectedSkillNumber: 1,
      selectionMode: 'auto_single',
      selectedSkillName: 'Skill',
      candidates: [],
      warnings: [],
    },
    skillNumber: 1,
    weaponSet: 1,
    config: {},
    calcsOutput: { CombinedDPS: 1000 },
    rawBreakdown: {},
    skillDpsList: [],
    skillGroups: [],
    items,
    passiveNodes: [],
    ascendNodes: [],
    jewels: [],
    createdAt: Date.now(),
  };
}

function createVariant(
  baseline: BaselineSnapshot,
  mutation: BuildMutation,
  dps = 1000
): BuildVariant {
  return {
    variantId: 'v1',
    variantHash: 'vh',
    baselineHash: baseline.baselineHash,
    buildXml: '',
    buildXmlCanonicalHash: '',
    skillNumber: 1,
    weaponSet: 1,
    config: {},
    calcsOutput: { CombinedDPS: dps },
    preValidation: { isValid: true, warnings: [], errors: [] },
    createdAt: Date.now(),
    mutation,
  } as unknown as BuildVariant;
}

describe('GearSwapAnalyzer', () => {
  it('should analyze gear swaps with target items', async () => {
    const targetItems: ItemInfo[] = [
      {
        slotName: 'Weapon 1',
        itemId: 101,
        name: 'Better Sword',
        baseType: 'Sword',
        rawText: 'Better Sword\nQuality: 0',
      },
    ];

    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        return createVariant(baseline, mutation, 1200);
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new GearSwapAnalyzer(variantGenerator, resultComparator);

    const baseline = createBaseline([
      { slotName: 'Weapon 1', itemId: 100, name: 'Old Sword', baseType: 'Sword' },
    ]);

    const results = await analyzer.analyze(baseline, targetItems);

    expect(results.length).toBe(1);
    expect(results[0].mutationType).toBe('item_swap');
    expect(results[0].dpsDelta).toBe(200);
    expect(results[0].gearSwapMeta?.slotName).toBe('Weapon 1');
    expect(results[0].gearSwapMeta?.originalItemName).toBe('Old Sword');
    expect(results[0].gearSwapMeta?.candidateItemName).toBe('Better Sword');
  });

  it('should return empty results when no target items provided', async () => {
    const variantGenerator = {
      generate: vi.fn(async () => {
        throw new Error('Should not be called');
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new GearSwapAnalyzer(variantGenerator, resultComparator);

    const baseline = createBaseline();
    const results = await analyzer.analyze(baseline);

    expect(results.length).toBe(0);
  });

  it('should get top gains and losses', async () => {
    const targetItems: ItemInfo[] = [
      {
        slotName: 'Weapon 1',
        itemId: 101,
        name: 'Better Sword',
        baseType: 'Sword',
        rawText: 'Better Sword',
      },
    ];

    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        return createVariant(baseline, mutation, 1200);
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new GearSwapAnalyzer(variantGenerator, resultComparator);

    const baseline = createBaseline([
      { slotName: 'Weapon 1', itemId: 100, name: 'Old Sword', baseType: 'Sword' },
    ]);

    const results = await analyzer.analyze(baseline, targetItems);

    const topGains = analyzer.getTopGains(results);
    const topLosses = analyzer.getTopLosses(results);

    expect(topGains.length).toBe(1);
    expect(topGains[0].dpsDeltaPercent).toBe(20);
    expect(topLosses.length).toBe(0);
  });

  it('should handle multiple target items', async () => {
    const targetItems: ItemInfo[] = [
      {
        slotName: 'Weapon 1',
        itemId: 101,
        name: 'Better Sword',
        baseType: 'Sword',
        rawText: 'Better Sword',
      },
      {
        slotName: 'Body Armour',
        itemId: 102,
        name: 'Better Armour',
        baseType: 'Body Armour',
        rawText: 'Better Armour',
      },
    ];

    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        const dps = mutation.mutationId.includes('Body') ? 1100 : 1200;
        return createVariant(baseline, mutation, dps);
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new GearSwapAnalyzer(variantGenerator, resultComparator);

    const baseline = createBaseline([
      { slotName: 'Weapon 1', itemId: 100, name: 'Old Sword', baseType: 'Sword' },
      { slotName: 'Body Armour', itemId: 99, name: 'Old Armour', baseType: 'Body Armour' },
    ]);

    const results = await analyzer.analyze(baseline, targetItems);

    expect(results.length).toBe(2);
    expect(results[0].gearSwapMeta?.slotName).toBe('Weapon 1');
    expect(results[1].gearSwapMeta?.slotName).toBe('Body Armour');
  });

  it('should handle variant generation errors gracefully', async () => {
    const targetItems: ItemInfo[] = [
      {
        slotName: 'Weapon 1',
        itemId: 101,
        name: 'Better Sword',
        baseType: 'Sword',
        rawText: 'Better Sword',
      },
    ];

    const variantGenerator = {
      generate: vi.fn(async () => {
        throw new Error('Item creation failed');
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new GearSwapAnalyzer(variantGenerator, resultComparator);

    const baseline = createBaseline([
      { slotName: 'Weapon 1', itemId: 100, name: 'Old Sword', baseType: 'Sword' },
    ]);

    const results = await analyzer.analyze(baseline, targetItems);

    expect(results.length).toBe(1);
    expect(results[0].resultKind).toBe('calc_failed');
    expect(results[0].warnings.some((w) => w.includes('Item creation failed'))).toBe(true);
  });

  it('should include originalItemRaw in gearSwapMeta when available', async () => {
    const targetItems: ItemInfo[] = [
      {
        slotName: 'Weapon 1',
        itemId: 101,
        name: 'Better Sword',
        baseType: 'Sword',
        rawText: 'Better Sword\nQuality: 20',
      },
    ];

    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        return createVariant(baseline, mutation, 1200);
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new GearSwapAnalyzer(variantGenerator, resultComparator);

    const baseline = createBaseline([
      {
        slotName: 'Weapon 1',
        itemId: 100,
        name: 'Old Sword',
        baseType: 'Sword',
        rawText: 'Old Sword\nQuality: 0',
      },
    ]);

    const results = await analyzer.analyze(baseline, targetItems);

    expect(results[0].gearSwapMeta?.originalItemRaw).toBe('Old Sword\nQuality: 0');
    expect(results[0].gearSwapMeta?.candidateItemRaw).toBe('Better Sword\nQuality: 20');
  });
});
