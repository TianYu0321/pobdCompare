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

  it('should build hitLineDelta from real MaximumHitTaken keys in calcsOutput', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 400;
    (baseline.calcsOutput as Record<string, unknown>).FireMaximumHitTaken = 300;
    (baseline.calcsOutput as Record<string, unknown>).ColdMaximumHitTaken = 250;
    (baseline.calcsOutput as Record<string, unknown>).LightningMaximumHitTaken = 200;
    (baseline.calcsOutput as Record<string, unknown>).ChaosMaximumHitTaken = 150;

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 500;
    (variant.calcsOutput as Record<string, unknown>).FireMaximumHitTaken = 400;
    (variant.calcsOutput as Record<string, unknown>).ColdMaximumHitTaken = 350;
    (variant.calcsOutput as Record<string, unknown>).LightningMaximumHitTaken = 300;
    (variant.calcsOutput as Record<string, unknown>).ChaosMaximumHitTaken = 250;

    const result = comparator.compare(baseline, variant);

    expect(result.hitLineDelta?.source).toBe('pob2_output');
    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
    // derived elemental = min(300,250,200)=200 -> min(400,350,300)=300, delta=100
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.fireHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.coldHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.lightningHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.chaosHitLineDelta?.delta).toBe(100);
  });

  it('should prefer direct ElementalMaximumHitTaken over derivation from fire/cold/lightning', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 400;
    (baseline.calcsOutput as Record<string, unknown>).FireMaximumHitTaken = 300;
    (baseline.calcsOutput as Record<string, unknown>).ColdMaximumHitTaken = 250;
    (baseline.calcsOutput as Record<string, unknown>).LightningMaximumHitTaken = 200;
    (baseline.calcsOutput as Record<string, unknown>).ElementalMaximumHitTaken = 250;

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 500;
    (variant.calcsOutput as Record<string, unknown>).FireMaximumHitTaken = 400;
    (variant.calcsOutput as Record<string, unknown>).ColdMaximumHitTaken = 350;
    (variant.calcsOutput as Record<string, unknown>).LightningMaximumHitTaken = 300;
    (variant.calcsOutput as Record<string, unknown>).ElementalMaximumHitTaken = 350;

    const result = comparator.compare(baseline, variant);

    // ElementalMaximumHitTaken is present directly (250->350), so it must be used, not the min of fire/cold/lightning
    expect(result.hitLineDelta?.elementalHitLineDelta?.baseline).toBe(250);
    expect(result.hitLineDelta?.elementalHitLineDelta?.variant).toBe(350);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(100);
  });

  it('should derive elementalHitLineDelta as min of fire/cold/lightning when direct ElementalMaximumHitTaken is absent', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 400;
    (baseline.calcsOutput as Record<string, unknown>).FireMaximumHitTaken = 300;
    (baseline.calcsOutput as Record<string, unknown>).ColdMaximumHitTaken = 250;
    (baseline.calcsOutput as Record<string, unknown>).LightningMaximumHitTaken = 200;
    (baseline.calcsOutput as Record<string, unknown>).ChaosMaximumHitTaken = 150;

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 500;
    (variant.calcsOutput as Record<string, unknown>).FireMaximumHitTaken = 350;
    (variant.calcsOutput as Record<string, unknown>).ColdMaximumHitTaken = 300;
    (variant.calcsOutput as Record<string, unknown>).LightningMaximumHitTaken = 250;
    (variant.calcsOutput as Record<string, unknown>).ChaosMaximumHitTaken = 200;

    const result = comparator.compare(baseline, variant);

    // direct ElementalMaximumHitTaken absent -> derived as min(350,300,250)=250
    expect(result.hitLineDelta?.elementalHitLineDelta?.baseline).toBe(200);
    expect(result.hitLineDelta?.elementalHitLineDelta?.variant).toBe(250);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
  });

  it('should fallback to old PhysicalHitDamage/ElementalHitDamage keys when MaximumHitTaken keys are absent', () => {
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

  it('should fallback to rawBreakdown when calcsOutput missing all hit line keys', () => {
    const baseline = createBaseline(1000);
    baseline.rawBreakdown = { PhysicalMaximumHitTaken: 400, FireMaximumHitTaken: 300, ColdMaximumHitTaken: 250, LightningMaximumHitTaken: 200, ChaosMaximumHitTaken: 150 };

    const variant = createVariant(baseline, 1200);
    variant.rawBreakdown = { PhysicalMaximumHitTaken: 500, FireMaximumHitTaken: 400, ColdMaximumHitTaken: 350, LightningMaximumHitTaken: 300, ChaosMaximumHitTaken: 250 };

    const result = comparator.compare(baseline, variant);

    expect(result.hitLineDelta?.source).toBe('normalized_breakdown');
    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(100);
  });

  it('should omit elementalHitLineDelta when neither direct key nor three elemental direct keys are present', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 400;
    (baseline.calcsOutput as Record<string, unknown>).FireMaximumHitTaken = 0;
    (baseline.calcsOutput as Record<string, unknown>).ColdMaximumHitTaken = 0;
    (baseline.calcsOutput as Record<string, unknown>).LightningMaximumHitTaken = 0;

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 500;
    (variant.calcsOutput as Record<string, unknown>).FireMaximumHitTaken = 0;
    (variant.calcsOutput as Record<string, unknown>).ColdMaximumHitTaken = 0;
    (variant.calcsOutput as Record<string, unknown>).LightningMaximumHitTaken = 0;

    const result = comparator.compare(baseline, variant);

    // zero is not > 0, so derivation yields nil; no ElementalMaximumHitTaken key was set
    expect(result.hitLineDelta?.elementalHitLineDelta).toBeUndefined();
    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
  });

  it('should keep new PhysicalMaximumHitTaken and fill missing elemental from legacy ElementalHitDamage in calcsOutput', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 400;
    (baseline.calcsOutput as Record<string, unknown>).ElementalHitDamage = 200;

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 500;
    (variant.calcsOutput as Record<string, unknown>).ElementalHitDamage = 250;

    const result = comparator.compare(baseline, variant);

    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
    expect(result.hitLineDelta?.source).toBe('pob2_output');
  });

  it('should keep new physical from calcsOutput and fill missing elemental from legacy in rawBreakdown', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 400;
    (baseline.calcsOutput as Record<string, unknown>).ChaosMaximumHitTaken = 150;
    baseline.rawBreakdown = { ElementalHitDamage: 200 };

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 500;
    (variant.calcsOutput as Record<string, unknown>).ChaosMaximumHitTaken = 250;
    variant.rawBreakdown = { ElementalHitDamage: 250 };

    const result = comparator.compare(baseline, variant);

    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
    expect(result.hitLineDelta?.source).toBe('normalized_breakdown');
  });

  it('should keep new PhysicalMaximumHitTaken from calcsOutput and fill missing elemental from legacy in mainOutput when earlier sources lack it', () => {
    // Neither calcsOutput nor rawBreakdown have elemental hits, only mainOutput
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 400;
    baseline.mainOutput = { ElementalHitDamage: 200 };

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 500;
    variant.mainOutput = { ElementalHitDamage: 250 };

    const result = comparator.compare(baseline, variant);

    // Physical fills from calcsOutput; elemental fills from legacy in mainOutput
    // since neither calcsOutput nor rawBreakdown have it
    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
    expect(result.hitLineDelta?.source).toBe('panel_fallback');
  });

  it('should fall through to mainOutput when neither calcsOutput nor rawBreakdown have any new or legacy hit line keys', () => {
    const baseline = createBaseline(1000);
    baseline.mainOutput = { PhysicalMaximumHitTaken: 400, FireMaximumHitTaken: 300, ColdMaximumHitTaken: 250 };

    const variant = createVariant(baseline, 1200);
    variant.mainOutput = { PhysicalMaximumHitTaken: 500, FireMaximumHitTaken: 400, ColdMaximumHitTaken: 350 };

    const result = comparator.compare(baseline, variant);

    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(100);
    expect(result.hitLineDelta?.source).toBe('panel_fallback');
  });

  it('should preserve calcsOutput physical when rawBreakdown has conflicting physical but supplies missing elemental', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 777;
    baseline.rawBreakdown = { PhysicalMaximumHitTaken: 111, ElementalHitDamage: 200 };

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 888;
    variant.rawBreakdown = { PhysicalMaximumHitTaken: 222, ElementalHitDamage: 250 };

    const result = comparator.compare(baseline, variant);

    // Physical must come from calcsOutput (777-888), not rawBreakdown (111-222)
    expect(result.hitLineDelta?.physicalHitLineDelta?.baseline).toBe(777);
    expect(result.hitLineDelta?.physicalHitLineDelta?.variant).toBe(888);
    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(111);
    // Elemental filled from rawBreakdown legacy
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
    expect(result.hitLineDelta?.source).toBe('normalized_breakdown');
  });

  it('should preserve calcsOutput values when mainOutput has conflicting values but supplies a missing field', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 777;
    baseline.mainOutput = { PhysicalMaximumHitTaken: 111, ElementalHitDamage: 200 };

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 888;
    variant.mainOutput = { PhysicalMaximumHitTaken: 222, ElementalHitDamage: 250 };

    const result = comparator.compare(baseline, variant);

    // Physical must come from calcsOutput (777-888), not mainOutput (111-222)
    expect(result.hitLineDelta?.physicalHitLineDelta?.baseline).toBe(777);
    expect(result.hitLineDelta?.physicalHitLineDelta?.variant).toBe(888);
    expect(result.hitLineDelta?.physicalHitLineDelta?.delta).toBe(111);
    // Elemental filled from mainOutput legacy since calcsOutput and breakdown lack it
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
    expect(result.hitLineDelta?.source).toBe('panel_fallback');
  });

  it('should preserve calcsOutput physical and rawBreakdown per-element values when mainOutput has conflicting values but derives from elemental parts', () => {
    const baseline = createBaseline(1000);
    (baseline.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 777;
    baseline.rawBreakdown = { FireMaximumHitTaken: 300, ColdMaximumHitTaken: 250 };
    baseline.mainOutput = { PhysicalMaximumHitTaken: 111, FireMaximumHitTaken: 1, ColdMaximumHitTaken: 1, ElementalHitDamage: 200 };

    const variant = createVariant(baseline, 1200);
    (variant.calcsOutput as Record<string, unknown>).PhysicalMaximumHitTaken = 888;
    variant.rawBreakdown = { FireMaximumHitTaken: 350, ColdMaximumHitTaken: 300 };
    variant.mainOutput = { PhysicalMaximumHitTaken: 222, FireMaximumHitTaken: 2, ColdMaximumHitTaken: 2, ElementalHitDamage: 250 };

    const result = comparator.compare(baseline, variant);

    // Physical from calcsOutput (777-888), not rawBreakdown/mainOutput
    expect(result.hitLineDelta?.physicalHitLineDelta?.baseline).toBe(777);
    expect(result.hitLineDelta?.physicalHitLineDelta?.variant).toBe(888);
    // Fire from rawBreakdown (300-350), cold from rawBreakdown (250-300), not mainOutput
    expect(result.hitLineDelta?.fireHitLineDelta?.baseline).toBe(300);
    expect(result.hitLineDelta?.coldHitLineDelta?.baseline).toBe(250);
    // Elemental derived from rawBreakdown fire+cold (no lightning): min(300,250)=250 -> min(350,300)=300
    expect(result.hitLineDelta?.elementalHitLineDelta?.baseline).toBe(250);
    expect(result.hitLineDelta?.elementalHitLineDelta?.variant).toBe(300);
    expect(result.hitLineDelta?.elementalHitLineDelta?.delta).toBe(50);
    // Source reflects lowest source that contributed any new value (rawBreakdown)
    expect(result.hitLineDelta?.source).toBe('normalized_breakdown');
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
