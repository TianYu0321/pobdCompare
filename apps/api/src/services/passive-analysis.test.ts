import { describe, expect, it } from 'vitest';

import type { BaselineSnapshot, SimulationResult } from '@pobd/schemas';

import { PassiveAnalysisService } from './passive-analysis';

function mockResult(overrides: Partial<SimulationResult> & { mutationId: string }): SimulationResult {
  return {
    jobId: '',
    baselineHash: 'hash',
    variantHash: 'v',
    mutationId: overrides.mutationId,
    mutationType: 'passive_add',
    resultKind: 'normal_gain',
    affectedSkillNumber: 1,
    isMainSkillStillValid: true,
    target: { type: 'passive' },
    baselineDps: 100,
    variantDps: 100,
    dpsDelta: 0,
    dpsDeltaPercent: 0,
    outputDiff: { offence: {} },
    warnings: [],
    evidence: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('PassiveAnalysisService', () => {
  it('classifies passive_add with pathAutoFilled=false, actualPointCost=1 as nextPoint', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async () =>
          mockResult({
            mutationId: 'passive_add_1',
            mutationType: 'passive_add',
            resultKind: 'normal_gain',
            dpsDeltaPercent: 5,
            passiveAddMeta: {
              targetNodeId: 1,
              actuallyAddedNodeIds: [1],
              pathAutoFilled: false,
              actualPointCost: 1,
              gainPerPoint: 5,
            },
          }),
      },
      async () => ({
        next: [{ id: 1, name: 'Single Node' }],
        path: [],
        remove: [],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(result.nextPoint).toHaveLength(1);
    expect(result.nextPoint[0]?.passiveAddMeta?.pathAutoFilled).toBe(false);
    expect(result.pathPackage).toHaveLength(0);
    expect(result.removeLoss).toHaveLength(0);
  });

  it('classifies passive_add with pathAutoFilled=true, actualPointCost>1 as pathPackage', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async () =>
          mockResult({
            mutationId: 'passive_add_2',
            mutationType: 'passive_add',
            resultKind: 'normal_gain',
            dpsDeltaPercent: 8,
            gainPerPoint: 4,
            passiveAddMeta: {
              targetNodeId: 2,
              actuallyAddedNodeIds: [2, 3],
              pathAutoFilled: true,
              actualPointCost: 2,
              gainPerPoint: 4,
            },
          }),
      },
      async () => ({
        next: [],
        path: [{ id: 2, name: 'Path Target' }],
        remove: [],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(result.pathPackage).toHaveLength(1);
    expect(result.pathPackage[0]?.passiveAddMeta?.pathAutoFilled).toBe(true);
    expect(result.pathPackage[0]?.passiveAddMeta?.actualPointCost).toBe(2);
    expect(result.nextPoint).toHaveLength(0);
  });

  it('classifies a path-add that PoB2 returned as a single point (pathAutoFilled=false, pointCost=1) as nextPoint', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async () =>
          mockResult({
            mutationId: 'passive_add_3',
            mutationType: 'passive_add',
            resultKind: 'normal_gain',
            dpsDeltaPercent: 3,
            passiveAddMeta: {
              targetNodeId: 3,
              actuallyAddedNodeIds: [3],
              pathAutoFilled: false,
              actualPointCost: 1,
              gainPerPoint: 3,
            },
          }),
      },
      async () => ({
        next: [],
        path: [{ id: 3, name: 'Intended Path' }],
        remove: [],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    // Even though it came from path pool, PoB2 returned single-point semantics
    expect(result.nextPoint).toHaveLength(1);
    expect(result.pathPackage).toHaveLength(0);
  });

  it('sorts pathPackage by gainPerPoint descending', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async ({ mutation }) => {
          const id = Number(mutation.mutationId.split('_')[2]);
          return mockResult({
            mutationId: mutation.mutationId,
            mutationType: 'passive_add',
            resultKind: 'normal_gain',
            dpsDeltaPercent: id === 10 ? 10 : 5,
            gainPerPoint: id === 10 ? 5 : 2.5,
            passiveAddMeta: {
              targetNodeId: id,
              actuallyAddedNodeIds: id === 10 ? [10, 11] : [12, 13],
              pathAutoFilled: true,
              actualPointCost: 2,
              gainPerPoint: id === 10 ? 5 : 2.5,
            },
          });
        },
      },
      async () => ({
        next: [],
        path: [{ id: 10, name: 'High' }, { id: 12, name: 'Low' }],
        remove: [],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(result.pathPackage).toHaveLength(2);
    expect(result.pathPackage[0]?.gainPerPoint).toBe(5);
    expect(result.pathPackage[1]?.gainPerPoint).toBe(2.5);
  });

  it('sorts removeLoss by dpsDeltaPercent ascending (most negative first)', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async ({ mutation }) => {
          const id = Number(mutation.mutationId.split('_')[2]);
          return mockResult({
            mutationId: mutation.mutationId,
            mutationType: 'passive_remove',
            resultKind: 'normal_loss',
            dpsDeltaPercent: id === 20 ? -10 : -5,
            passiveRemoveMeta: {
              targetNodeId: id,
              actuallyRemovedNodeIds: id === 20 ? [20, 21] : [22],
              cascadeRemoved: id === 20,
              cascadeNodeCount: id === 20 ? 1 : 0,
            },
          });
        },
      },
      async () => ({
        next: [],
        path: [],
        remove: [{ id: 20, name: 'Big Loss' }, { id: 22, name: 'Small Loss' }],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(result.removeLoss).toHaveLength(2);
    expect(result.removeLoss[0]?.dpsDeltaPercent).toBe(-10);
    expect(result.removeLoss[1]?.dpsDeltaPercent).toBe(-5);
  });

  it('separates calc_failed/incompatible/invalid_variant into failures', async () => {
    let callCount = 0;
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async () => {
          callCount++;
          if (callCount === 1) {
            return mockResult({
              mutationId: 'passive_add_30',
              mutationType: 'passive_add',
              resultKind: 'calc_failed',
            });
          }
          return mockResult({
            mutationId: 'passive_add_31',
            mutationType: 'passive_add',
            resultKind: 'normal_gain',
            dpsDeltaPercent: 2,
            passiveAddMeta: {
              targetNodeId: 31,
              actuallyAddedNodeIds: [31],
              pathAutoFilled: false,
              actualPointCost: 1,
              gainPerPoint: 2,
            },
          });
        },
      },
      async () => ({
        next: [{ id: 30, name: 'Fail' }, { id: 31, name: 'OK' }],
        path: [],
        remove: [],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(result.failures).toHaveLength(1);
    expect(result.nextPoint).toHaveLength(1);
  });

  it('attaches node names from candidates to results', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async () =>
          mockResult({
            mutationId: 'passive_add_40',
            mutationType: 'passive_add',
            resultKind: 'normal_gain',
            dpsDeltaPercent: 1,
            passiveAddMeta: {
              targetNodeId: 40,
              actuallyAddedNodeIds: [40],
              pathAutoFilled: false,
              actualPointCost: 1,
              gainPerPoint: 1,
            },
          }),
      },
      async () => ({
        next: [{ id: 40, name: '测试节点' }],
        path: [],
        remove: [],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(result.nextPoint[0]?.target?.name).toBe('测试节点');
  });

  it('preserves hitLineDelta and gainPerPoint from PoB2 result', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async () =>
          mockResult({
            mutationId: 'passive_add_50',
            mutationType: 'passive_add',
            resultKind: 'normal_gain',
            dpsDeltaPercent: 5,
            gainPerPoint: 5,
            pointCost: 1,
            hitLineDelta: {
              totalPoolDelta: { baseline: 1000, variant: 1050, delta: 50, deltaPercent: 5 },
              physicalHitLineDelta: { baseline: 500, variant: 525, delta: 25, deltaPercent: 5 },
              elementalHitLineDelta: { baseline: 300, variant: 315, delta: 15, deltaPercent: 5 },
              source: 'pob2_output',
              warnings: [],
            },
            passiveAddMeta: {
              targetNodeId: 50,
              actuallyAddedNodeIds: [50],
              pathAutoFilled: false,
              actualPointCost: 1,
              gainPerPoint: 5,
            },
          }),
      },
      async () => ({
        next: [{ id: 50, name: 'Hit Test' }],
        path: [],
        remove: [],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(result.nextPoint[0]?.hitLineDelta?.physicalHitLineDelta?.deltaPercent).toBe(5);
    expect(result.nextPoint[0]?.hitLineDelta?.elementalHitLineDelta?.deltaPercent).toBe(5);
    expect(result.nextPoint[0]?.gainPerPoint).toBe(5);
  });

  it('caches and retrieves rankings by baselineHash', async () => {
    let simulateCount = 0;
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async () => {
          simulateCount++;
          return mockResult({
            mutationId: `passive_add_${simulateCount}`,
            mutationType: 'passive_add',
            resultKind: 'normal_gain',
            dpsDeltaPercent: 1,
            passiveAddMeta: {
              targetNodeId: simulateCount,
              actuallyAddedNodeIds: [simulateCount],
              pathAutoFilled: false,
              actualPointCost: 1,
              gainPerPoint: 1,
            },
          });
        },
      },
      async () => ({
        next: [{ id: 1, name: 'Cached' }],
        path: [],
        remove: [],
      }),
    );

    const first = await service.analyze({ baselineHash: 'cache-test', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(simulateCount).toBe(1);

    const cached = service.getCached('cache-test');
    expect(cached).toBeDefined();
    expect(cached!.nextPoint).toHaveLength(1);

    const second = await service.analyze({ baselineHash: 'cache-test', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(simulateCount).toBe(1); // should not re-simulate
    expect(second.nextPoint).toHaveLength(1);

    service.invalidateCache('cache-test');
    const third = await service.analyze({ baselineHash: 'cache-test', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(simulateCount).toBe(2); // re-simulated
  });

  it('removeLoss preserves cascade metadata', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async () =>
          mockResult({
            mutationId: 'passive_remove_60',
            mutationType: 'passive_remove',
            resultKind: 'normal_loss',
            dpsDeltaPercent: -8,
            passiveRemoveMeta: {
              targetNodeId: 60,
              actuallyRemovedNodeIds: [60, 61, 62],
              cascadeRemoved: true,
              cascadeNodeCount: 2,
            },
          }),
      },
      async () => ({
        next: [],
        path: [],
        remove: [{ id: 60, name: 'Cascade' }],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash', passiveNodes: [] } as unknown as BaselineSnapshot);
    expect(result.removeLoss[0]?.passiveRemoveMeta?.cascadeRemoved).toBe(true);
    expect(result.removeLoss[0]?.passiveRemoveMeta?.actuallyRemovedNodeIds).toEqual([60, 61, 62]);
    expect(result.removeLoss[0]?.passiveRemoveMeta?.cascadeNodeCount).toBe(2);
  });
});
