import { describe, it, expect, vi } from 'vitest';
import { PassiveMarginalAnalyzer, PassiveNodeGraph } from './passive-marginal-analyzer';
import { BaselineSnapshot, BuildVariant, BuildMutation } from '@pobd/schemas';
import { ResultComparator } from '../comparator';

function createBaseline(): BaselineSnapshot {
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
    items: [],
    passiveNodes: [1, 2, 3],
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

const mockNodeGraph: PassiveNodeGraph = {
  getNode(id: number) {
    const nodes: Record<number, ReturnType<PassiveNodeGraph['getNode']>> = {
      1: { id: 1, type: 'ClassStart', linked: [2] },
      2: { id: 2, type: 'Normal', linked: [1, 3, 4] },
      3: { id: 3, type: 'Normal', linked: [2] },
      4: { id: 4, type: 'Normal', linked: [2], isAscendancyStart: false },
    };
    return nodes[id];
  },
};

describe('PassiveMarginalAnalyzer', () => {
  it('should generate passive_remove and passive_add results', async () => {
    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        return createVariant(
          baseline,
          mutation,
          mutation.type === 'passive_remove' ? 900 : 1100
        );
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      mockNodeGraph
    );

    const baseline = createBaseline();
    const results = await analyzer.analyze(baseline);

    // passiveNodes = [1, 2, 3]
    // Node 1 is ClassStart -> skipped for remove
    // Node 2 is Normal -> remove candidate
    // Node 3 is Normal -> remove candidate
    // Node 2 linked: [1, 3, 4]; 1 allocated, 3 allocated, 4 unallocated -> add candidate for 4
    // Node 3 linked: [2]; 2 allocated -> no add candidate
    // Expected: 2 removes + 1 add = 3 results

    const removeResults = results.filter((r) => r.mutationType === 'passive_remove');
    const addResults = results.filter((r) => r.mutationType === 'passive_add');

    expect(removeResults.length).toBe(2);
    expect(addResults.length).toBe(1);

    // Remove results should have negative dps
    expect(removeResults.every((r) => r.dpsDelta < 0)).toBe(true);
    // Add results should have positive dps
    expect(addResults.every((r) => r.dpsDelta > 0)).toBe(true);
  });

  it('should record cascadeRemoved for passive_remove', async () => {
    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        const variant = createVariant(baseline, mutation, 900) as BuildVariant & {
          actuallyRemovedNodeIds: number[];
        };
        variant.actuallyRemovedNodeIds = [2, 3, 4];
        return variant;
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      mockNodeGraph
    );

    const baseline = createBaseline();
    const results = await analyzer.analyze(baseline);
    const removeResults = results.filter((r) => r.mutationType === 'passive_remove');

    expect(removeResults.length).toBeGreaterThan(0);
    const firstRemove = removeResults[0];
    expect(firstRemove.passiveRemoveMeta?.cascadeRemoved).toBe(true);
    expect(firstRemove.passiveRemoveMeta?.cascadeNodeCount).toBe(2);
    expect(firstRemove.passiveRemoveMeta?.actuallyRemovedNodeIds).toEqual([2, 3, 4]);
  });

  it('should record pathAutoFilled for passive_add', async () => {
    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        const variant = createVariant(baseline, mutation, 1100) as BuildVariant & {
          actuallyAddedNodeIds: number[];
        };
        variant.actuallyAddedNodeIds = [4, 5, 6];
        return variant;
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      mockNodeGraph
    );

    const baseline = createBaseline();
    const results = await analyzer.analyze(baseline);
    const addResults = results.filter((r) => r.mutationType === 'passive_add');

    expect(addResults.length).toBeGreaterThan(0);
    const firstAdd = addResults[0];
    expect(firstAdd.passiveAddMeta?.pathAutoFilled).toBe(true);
    expect(firstAdd.passiveAddMeta?.actualPointCost).toBe(3);
    expect(firstAdd.pointCost).toBe(3);
  });

  it('should get top gains and losses', async () => {
    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        const dps = mutation.type === 'passive_remove' ? 900 : 1100;
        return createVariant(baseline, mutation, dps);
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      mockNodeGraph
    );

    const baseline = createBaseline();
    const results = await analyzer.analyze(baseline);

    const topGains = analyzer.getTopGains(results);
    const topLosses = analyzer.getTopLosses(results);

    expect(topGains.length).toBeGreaterThan(0);
    expect(topLosses.length).toBeGreaterThan(0);
    expect(topGains[0].dpsDeltaPercent).toBeGreaterThan(0);
    expect(topLosses[0].dpsDeltaPercent).toBeLessThan(0);
  });

  it('should limit top gains and losses', async () => {
    const variantGenerator = {
      generate: vi.fn(async (baseline: BaselineSnapshot, mutation: BuildMutation) => {
        const dps = mutation.type === 'passive_remove' ? 900 : 1100;
        return createVariant(baseline, mutation, dps);
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      mockNodeGraph
    );

    const baseline = createBaseline();
    const results = await analyzer.analyze(baseline);

    const topGains = analyzer.getTopGains(results, 1);
    const topLosses = analyzer.getTopLosses(results, 1);

    expect(topGains.length).toBeLessThanOrEqual(1);
    expect(topLosses.length).toBeLessThanOrEqual(1);
  });

  it('should skip Keystone nodes for removal', async () => {
    const keystoneGraph: PassiveNodeGraph = {
      getNode(id: number) {
        const nodes: Record<number, ReturnType<PassiveNodeGraph['getNode']>> = {
          1: { id: 1, type: 'Keystone', linked: [] },
        };
        return nodes[id];
      },
    };

    const variantGenerator = {
      generate: vi.fn(async () => {
        throw new Error('Should not be called');
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      keystoneGraph
    );

    const baseline: BaselineSnapshot = { ...createBaseline(), passiveNodes: [1] };
    const results = await analyzer.analyze(baseline);

    expect(results.length).toBe(0);
  });

  it('should skip AscendClassStart nodes for removal', async () => {
    const ascendGraph: PassiveNodeGraph = {
      getNode(id: number) {
        const nodes: Record<number, ReturnType<PassiveNodeGraph['getNode']>> = {
          1: { id: 1, type: 'AscendClassStart', linked: [] },
        };
        return nodes[id];
      },
    };

    const variantGenerator = {
      generate: vi.fn(async () => {
        throw new Error('Should not be called');
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      ascendGraph
    );

    const baseline: BaselineSnapshot = { ...createBaseline(), passiveNodes: [1] };
    const results = await analyzer.analyze(baseline);

    expect(results.length).toBe(0);
  });

  it('should skip isMultipleChoice nodes for removal', async () => {
    const choiceGraph: PassiveNodeGraph = {
      getNode(id: number) {
        const nodes: Record<number, ReturnType<PassiveNodeGraph['getNode']>> = {
          1: { id: 1, type: 'Normal', isMultipleChoice: true, linked: [] },
        };
        return nodes[id];
      },
    };

    const variantGenerator = {
      generate: vi.fn(async () => {
        throw new Error('Should not be called');
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      choiceGraph
    );

    const baseline: BaselineSnapshot = { ...createBaseline(), passiveNodes: [1] };
    const results = await analyzer.analyze(baseline);

    expect(results.length).toBe(0);
  });

  it('should skip isAscendancyStart linked nodes for add', async () => {
    const ascendStartGraph: PassiveNodeGraph = {
      getNode(id: number) {
        const nodes: Record<number, ReturnType<PassiveNodeGraph['getNode']>> = {
          1: { id: 1, type: 'Normal', linked: [2] },
          2: { id: 2, type: 'AscendClassStart', isAscendancyStart: true, linked: [1] },
        };
        return nodes[id];
      },
    };

    const variantGenerator = {
      generate: vi.fn(async () => {
        throw new Error('Should not be called');
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      ascendStartGraph
    );

    const baseline: BaselineSnapshot = { ...createBaseline(), passiveNodes: [1] };
    const results = await analyzer.analyze(baseline);

    expect(results.length).toBe(1); // Only the remove result for node 1
    expect(results.filter((r) => r.mutationType === 'passive_add').length).toBe(0);
  });

  it('should handle variant generation errors gracefully', async () => {
    const variantGenerator = {
      generate: vi.fn(async () => {
        throw new Error('Lua crash');
      }),
    };

    const resultComparator = new ResultComparator();
    const analyzer = new PassiveMarginalAnalyzer(
      variantGenerator,
      resultComparator,
      mockNodeGraph
    );

    const baseline = createBaseline();
    const results = await analyzer.analyze(baseline);

    // All results should be calc_failed because every variant generation fails
    expect(results.every((r) => r.resultKind === 'calc_failed')).toBe(true);
    expect(results.every((r) => r.warnings.some((w) => w.includes('Lua crash')))).toBe(true);
  });
});
