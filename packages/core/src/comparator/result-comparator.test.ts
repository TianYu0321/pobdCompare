import { describe, it, expect } from 'vitest';
import { ResultComparator } from './result-comparator';
import { BaselineSnapshot, BuildVariant, SimulationResult } from '@pobd/schemas';

function createBaseline(dps = 1000): BaselineSnapshot {
  return {
    id: 'test-baseline',
    baselineHash: 'baseline-hash',
    source: 'build_xml',
    buildXml: '<build/>',
    buildXmlCanonicalHash: 'canonical-hash',
    pob2Version: '1.0.0',
    pob2DataVersion: '1.0.0',
    gameVersion: '0.1.0',
    character: { name: 'Test', level: 90, className: 'Marauder', ascendancyName: 'Juggernaut' },
    mainSkillSelection: {
      selectedSkillNumber: 1,
      selectionMode: 'auto_single',
      selectedSkillName: 'Test Skill',
      candidates: [],
      warnings: [],
    },
    skillNumber: 1,
    weaponSet: 1,
    config: {},
    calcsOutput: { CombinedDPS: dps },
    rawBreakdown: {},
    skillDpsList: [],
    skillGroups: [],
    items: [],
    passiveNodes: [],
    ascendNodes: [],
    jewels: [],
    createdAt: Date.now(),
  };
}

function createVariant(
  baseline: BaselineSnapshot,
  dps: number,
  overrides?: Partial<BuildVariant>
): BuildVariant {
  return {
    variantId: 'variant-1',
    variantHash: 'variant-hash',
    baselineHash: baseline.baselineHash,
    buildXml: '<build/>',
    buildXmlCanonicalHash: 'canonical-hash',
    skillNumber: 1,
    weaponSet: 1,
    config: {},
    calcsOutput: { CombinedDPS: dps },
    rawBreakdown: {},
    preValidation: { isValid: true, warnings: [], errors: [] },
    createdAt: Date.now(),
    ...overrides,
  } as BuildVariant;
}

describe('ResultComparator', () => {
  const comparator = new ResultComparator();

  it('should compute dpsDelta and dpsDeltaPercent correctly', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 1200);
    const result = comparator.compare(baseline, variant);

    expect(result.baselineDps).toBe(1000);
    expect(result.variantDps).toBe(1200);
    expect(result.dpsDelta).toBe(200);
    expect(result.dpsDeltaPercent).toBe(20);
    expect(result.resultKind).toBe('normal_gain');
  });

  it('should classify normal_loss when dps decreases', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 800);
    const result = comparator.compare(baseline, variant);

    expect(result.dpsDelta).toBe(-200);
    expect(result.dpsDeltaPercent).toBe(-20);
    expect(result.resultKind).toBe('normal_loss');
  });

  it('should classify neutral when dps is unchanged', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 1000);
    const result = comparator.compare(baseline, variant);

    expect(result.dpsDelta).toBe(0);
    expect(result.resultKind).toBe('neutral');
  });

  it('should classify incompatible when compatibility fails', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 1000, {
      compatibility: {
        isCompatible: false,
        reason: 'weapon_type_mismatch',
        details: ['Weapon type mismatch'],
      },
    });
    const result = comparator.compare(baseline, variant);

    expect(result.resultKind).toBe('incompatible');
  });

  it('should classify calc_failed when calc validation fails', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 1000, {
      calcValidation: {
        success: false,
        hasCalcsOutput: true,
        hasBreakdown: true,
        mainSkillStillValid: true,
        dpsIsValid: true,
        errorCode: 'lua_error',
        errorMessage: 'Lua error',
      },
    });
    const result = comparator.compare(baseline, variant);

    expect(result.resultKind).toBe('calc_failed');
    expect(result.errorCode).toBe('lua_error');
  });

  it('should sort results by dpsDeltaPercent', () => {
    const results: SimulationResult[] = [
      { dpsDeltaPercent: 10 } as SimulationResult,
      { dpsDeltaPercent: 30 } as SimulationResult,
      { dpsDeltaPercent: 20 } as SimulationResult,
    ];

    const sorted = comparator.sortResults(results, 'dpsDeltaPercent');
    expect(sorted.map((r) => r.dpsDeltaPercent)).toEqual([30, 20, 10]);
  });

  it('should sort results by gainPerPoint', () => {
    const results: SimulationResult[] = [
      { dpsDeltaPercent: 10, gainPerPoint: 5 } as SimulationResult,
      { dpsDeltaPercent: 20, gainPerPoint: 15 } as SimulationResult,
      { dpsDeltaPercent: 30, gainPerPoint: 10 } as SimulationResult,
    ];

    const sorted = comparator.sortResults(results, 'gainPerPoint');
    expect(sorted.map((r) => r.gainPerPoint)).toEqual([15, 10, 5]);
  });

  it('should sort results by physicalHitLineDelta', () => {
    const results: SimulationResult[] = [
      {
        hitLineDelta: { physicalHitLineDelta: { delta: 50 }, source: 'pob2_output', warnings: [] },
      } as unknown as SimulationResult,
      {
        hitLineDelta: { physicalHitLineDelta: { delta: 150 }, source: 'pob2_output', warnings: [] },
      } as unknown as SimulationResult,
      {
        hitLineDelta: { physicalHitLineDelta: { delta: 100 }, source: 'pob2_output', warnings: [] },
      } as unknown as SimulationResult,
    ];

    const sorted = comparator.sortResults(results, 'physicalHitLineDelta');
    expect(sorted.map((r) => r.hitLineDelta?.physicalHitLineDelta?.delta)).toEqual([150, 100, 50]);
  });

  it('should build outputDiff with offence data', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).AverageHit = 500;
    (baseline.calcsOutput as Record<string, unknown>).CritChance = 20;

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).AverageHit = 600;
    (variant.calcsOutput as Record<string, unknown>).CritChance = 25;

    const result = comparator.compare(baseline, variant);

    expect(result.outputDiff.offence.combinedDps).toEqual({
      baseline: 1000,
      variant: 1200,
      delta: 200,
      deltaPercent: 20,
    });
    expect(result.outputDiff.offence.averageHit).toEqual({
      baseline: 500,
      variant: 600,
      delta: 100,
      deltaPercent: 20,
    });
    expect(result.outputDiff.offence.critChance).toEqual({
      baseline: 20,
      variant: 25,
      delta: 5,
      deltaPercent: 25,
    });
  });

  it('should include defence data when available', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).Life = 3000;
    (baseline.calcsOutput as Record<string, unknown>).Armour = 5000;

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).Life = 3500;
    (variant.calcsOutput as Record<string, unknown>).Armour = 4500;

    const result = comparator.compare(baseline, variant);

    expect(result.outputDiff.defence?.life).toEqual({
      baseline: 3000,
      variant: 3500,
      delta: 500,
      deltaPercent: expect.closeTo(16.6667, 2),
    });
    expect(result.outputDiff.defence?.armour).toEqual({
      baseline: 5000,
      variant: 4500,
      delta: -500,
      deltaPercent: -10,
    });
  });

  it('should build hitLineDelta from calcsOutput when available', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalHitDamage = 400;
    (baseline.calcsOutput as Record<string, unknown>).ElementalHitDamage = 200;

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalHitDamage = 500;
    (variant.calcsOutput as Record<string, unknown>).ElementalHitDamage = 250;

    const result = comparator.compare(baseline, variant);

    expect(result.hitLineDelta?.source).toBe('pob2_output');
    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
  });

  it('should fallback to rawBreakdown when calcsOutput missing hit lines', () => {
    const baseline = createBaseline(1000);
    baseline.rawBreakdown = { PhysicalHitDamage: 400, ElementalHitDamage: 200 };

    const variant = createVariant(baseline, 1200);
    variant.rawBreakdown = { PhysicalHitDamage: 500, ElementalHitDamage: 250 };

    const result = comparator.compare(baseline, variant);

    expect(result.hitLineDelta?.source).toBe('normalized_breakdown');
    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
  });

  it('should include warnings when calc output is missing', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 1200, {
      calcValidation: {
        success: true,
        hasCalcsOutput: false,
        hasBreakdown: false,
        mainSkillStillValid: true,
        dpsIsValid: true,
      },
    });

    const result = comparator.compare(baseline, variant);

    expect(result.warnings).toContain('Variant missing calculation output');
    expect(result.warnings).toContain('Variant missing breakdown data');
  });

  it('should build evidence array with baseline and variant refs', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 1200);

    const result = comparator.compare(baseline, variant);

    expect(result.evidence).toHaveLength(4);
    expect(result.evidence[0].type).toBe('baseline');
    expect(result.evidence[1].type).toBe('variant');
    expect(result.evidence[2].type).toBe('calcs_output');
    expect(result.evidence[3].type).toBe('raw_breakdown');
  });

  it('should populate passiveAddMeta when mutation type is passive_add', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 1200) as BuildVariant & {
      mutation: { mutationId: string; type: 'passive_add'; payload: { targetNodeId: number } };
      actuallyAddedNodeIds: number[];
    };
    variant.mutation = {
      mutationId: 'passive_add_42',
      type: 'passive_add',
      payload: { targetNodeId: 42 },
    };
    variant.actuallyAddedNodeIds = [42, 43, 44];

    const result = comparator.compare(baseline, variant);

    expect(result.passiveAddMeta).toBeDefined();
    expect(result.passiveAddMeta?.targetNodeId).toBe(42);
    expect(result.passiveAddMeta?.actuallyAddedNodeIds).toEqual([42, 43, 44]);
    expect(result.passiveAddMeta?.pathAutoFilled).toBe(true);
    expect(result.pointCost).toBe(3);
    expect(result.gainPerPoint).toBeCloseTo(66.6667, 2);
  });

  it('should populate passiveRemoveMeta when mutation type is passive_remove', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 900) as BuildVariant & {
      mutation: { mutationId: string; type: 'passive_remove'; payload: { targetNodeId: 7 } };
      actuallyRemovedNodeIds: number[];
    };
    variant.mutation = {
      mutationId: 'passive_remove_7',
      type: 'passive_remove',
      payload: { targetNodeId: 7 },
    };
    variant.actuallyRemovedNodeIds = [7, 8];

    const result = comparator.compare(baseline, variant);

    expect(result.passiveRemoveMeta).toBeDefined();
    expect(result.passiveRemoveMeta?.targetNodeId).toBe(7);
    expect(result.passiveRemoveMeta?.actuallyRemovedNodeIds).toEqual([7, 8]);
    expect(result.passiveRemoveMeta?.cascadeRemoved).toBe(true);
    expect(result.passiveRemoveMeta?.cascadeNodeCount).toBe(1);
  });

  it('should populate gearSwapMeta when mutation type is item_swap', () => {
    const baseline = createBaseline(1000);
    const variant = createVariant(baseline, 1200) as BuildVariant & {
      mutation: { mutationId: string; type: 'item_swap'; payload: { slotName: string } };
    };
    variant.mutation = {
      mutationId: 'gear_swap_Weapon1',
      type: 'item_swap',
      payload: { slotName: 'Weapon 1' },
    };

    const result = comparator.compare(baseline, variant);

    expect(result.gearSwapMeta).toBeDefined();
    expect(result.gearSwapMeta?.slotName).toBe('Weapon 1');
  });
});
