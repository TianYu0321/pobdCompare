import { describe, it, expect, vi } from 'vitest';
import { VariantGenerator } from './variant-generator';
import type { VariantWorkerClient, VariantApplyResult } from './variant-generator';
import type { BaselineSnapshot, BuildMutation, VariantValidation, CalcValidation } from '@pobd/schemas';

const mockValidation: VariantValidation = {
  isValid: true,
  warnings: [],
  errors: [],
};

const mockCalcValidation: CalcValidation = {
  success: true,
  hasCalcsOutput: true,
  hasBreakdown: true,
  mainSkillStillValid: true,
  dpsIsValid: true,
};

const mockWorker: VariantWorkerClient = {
  applyMutation: vi.fn().mockResolvedValue({
    buildXml: '<VariantBuild/>',
    calcsOutput: { CombinedDPS: 1200 },
    rawBreakdown: {},
    preValidation: mockValidation,
    postValidation: mockValidation,
    calcValidation: mockCalcValidation,
  } as VariantApplyResult),
  saveBuildXml: vi.fn().mockResolvedValue('<SavedBuildXml/>'),
};

const mockBaseline: BaselineSnapshot = {
  id: 'baseline-1',
  baselineHash: 'baseline-hash-abc',
  source: 'build_xml',
  buildXml: '<BaselineBuild/>',
  buildXmlCanonicalHash: 'baseline-canonical-abc',
  pob2Version: '1.0.0',
  pob2DataVersion: '1.0.0',
  gameVersion: '0.1.0',
  character: {},
  mainSkillSelection: {
    selectedSkillNumber: 1,
    selectionMode: 'user_confirmed',
    selectedSkillName: 'TestSkill',
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
  passiveNodes: [],
  ascendNodes: [],
  jewels: [],
  createdAt: Date.now(),
};

const mockMutation: BuildMutation = {
  mutationId: 'mut-1',
  type: 'passive_add',
  baselineHash: 'baseline-hash-abc',
  payload: {
    targetNodeId: 42,
    requestedNodeIds: [42],
    checkConnectivity: true,
  },
  source: 'candidate_list',
};

describe('VariantGenerator', () => {
  it('generateVariant returns a complete variant with mutation', async () => {
    const generator = new VariantGenerator(mockWorker);
    const variant = await generator.generateVariant(mockBaseline, mockMutation);

    expect(variant.baselineHash).toBe('baseline-hash-abc');
    expect(variant.mutation.mutationId).toBe('mut-1');
    expect(variant.buildXml).toBe('<VariantBuild/>');
    expect(variant.calcsOutput).toEqual({ CombinedDPS: 1200 });
    expect(variant.preValidation.isValid).toBe(true);
    expect(variant.postValidation?.isValid).toBe(true);
    expect(variant.calcValidation?.success).toBe(true);
    expect(variant.calcDurationMs).toBeGreaterThanOrEqual(0);
    expect(variant.createdAt).toBeGreaterThan(0);
    expect(variant.variantHash).toHaveLength(64);

    expect(mockWorker.applyMutation).toHaveBeenCalledWith(
      '<BaselineBuild/>',
      mockMutation
    );
  });

  it('generateVariant throws on baselineHash mismatch', async () => {
    const generator = new VariantGenerator(mockWorker);
    const badMutation: BuildMutation = {
      ...mockMutation,
      baselineHash: 'wrong-hash',
    };

    await expect(generator.generateVariant(mockBaseline, badMutation)).rejects.toThrow(
      'Mutation baselineHash mismatch'
    );
  });

  it('generateVariantXml returns saved XML from worker', async () => {
    const generator = new VariantGenerator(mockWorker);
    const variant = await generator.generateVariant(mockBaseline, mockMutation);
    const xml = await generator.generateVariantXml(variant);
    expect(xml).toBe('<SavedBuildXml/>');
    expect(mockWorker.saveBuildXml).toHaveBeenCalledWith('<VariantBuild/>');
  });
});
