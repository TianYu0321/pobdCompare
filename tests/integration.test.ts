import { describe, it, expect } from 'vitest';
import {
  BuildMutationSchema,
  BaselineSnapshotSchema,
  SimulationResultSchema,
  SimulationBatchSchema,
} from '@pobd/schemas';
import { BaselineManager, MutationFactory, VariantGenerator, ResultComparator, JobQueue } from '@pobd/core';
import { Pob2Bridge, Pob2WorkerPool } from '@pobd/pob2-worker';
import { BuildXmlAdapter, WeGameAdapter } from '@pobd/adapters';

describe('Integration: module imports and instantiation', () => {
  it('schemas package exports are valid', () => {
    const mutation = BuildMutationSchema.safeParse({
      mutationId: 'mut-test-1',
      type: 'passive_add',
      baselineHash: 'abc123',
      payload: { targetNodeId: 1, requestedNodeIds: [1], checkConnectivity: true },
      source: 'candidate_list',
    });
    expect(mutation.success).toBe(true);
  });

  it('core classes can be instantiated with mock dependencies', () => {
    const mockWorker = {
      computeBaseline: async () => ({
        calcsOutput: {}, rawBreakdown: {}, skillDpsList: [], skillGroups: [], items: [], passiveNodes: [], ascendNodes: [], jewels: [],
      }),
    };
    const baselineManager = new BaselineManager(mockWorker as any);
    expect(baselineManager).toBeDefined();

    const mockTreeProvider = { getTree: async () => [] };
    const mutationFactory = new MutationFactory(mockTreeProvider as any);
    expect(mutationFactory).toBeDefined();

    const mockVariantWorker = {
      applyMutation: async () => ({
        buildXml: '<xml/>', calcsOutput: {}, rawBreakdown: {}, preValidation: { isValid: true, warnings: [], errors: [] }, postValidation: { isValid: true, warnings: [], errors: [] }, calcValidation: { success: true, hasCalcsOutput: true, hasBreakdown: true, mainSkillStillValid: true, dpsIsValid: true },
      }),
      saveBuildXml: async (xml: string) => xml,
    };
    const variantGenerator = new VariantGenerator(mockVariantWorker as any);
    expect(variantGenerator).toBeDefined();

    const comparator = new ResultComparator();
    expect(comparator).toBeDefined();
  });

  it('pob2-worker classes are defined and can be imported', () => {
    expect(Pob2Bridge).toBeDefined();
    expect(Pob2WorkerPool).toBeDefined();
  });

  it('adapters classes can be instantiated', () => {
    const buildXmlAdapter = new BuildXmlAdapter();
    expect(buildXmlAdapter).toBeDefined();

    const wegameAdapter = new WeGameAdapter();
    expect(wegameAdapter).toBeDefined();
  });
});
