import { describe, expect, it } from 'vitest';

import type { BaselineSnapshot, SimulationResult } from '@pobd/schemas';

import { PassiveAnalysisService } from './passive-analysis';

describe('PassiveAnalysisService', () => {
  it('separates next points, path packages and cascade losses', async () => {
    const service = new PassiveAnalysisService(
      {
        simulatePassive: async ({ mutation }) =>
          ({
            resultKind: mutation.type === 'passive_remove' ? 'normal_loss' : 'normal_gain',
            mutationType: mutation.type,
            dpsDeltaPercent: mutation.type === 'passive_remove' ? -4 : 5,
            passiveAddMeta:
              mutation.type === 'passive_add'
                ? {
                    targetNodeId: 3,
                    actuallyAddedNodeIds: mutation.mutationId.includes('path') ? [2, 3] : [3],
                    pathAutoFilled: mutation.mutationId.includes('path'),
                    actualPointCost: mutation.mutationId.includes('path') ? 2 : 1,
                    gainPerPoint: 2.5,
                  }
                : undefined,
            passiveRemoveMeta:
              mutation.type === 'passive_remove'
                ? {
                    targetNodeId: 1,
                    actuallyRemovedNodeIds: [1, 2],
                    cascadeRemoved: true,
                    cascadeNodeCount: 1,
                  }
                : undefined,
          }) as SimulationResult,
      },
      async () => ({
        add: [
          { id: 3, name: 'Next', linked: [] },
          { id: 4, name: 'Path', linked: [] },
        ],
        remove: [{ id: 1, name: 'Loss', linked: [] }],
      }),
    );

    const result = await service.analyze({ baselineHash: 'hash' } as BaselineSnapshot);
    expect(result.nextPoint).toHaveLength(1);
    expect(result.pathPackage).toHaveLength(1);
    expect(result.removeLoss[0]?.passiveRemoveMeta?.cascadeRemoved).toBe(true);
  });
});
