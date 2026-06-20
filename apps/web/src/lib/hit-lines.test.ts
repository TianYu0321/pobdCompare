import { describe, it, expect } from 'vitest';
import { extractHitLines, extractBaselineHitLines, computeBaselineDelta, computeHitLinesDelta, safePercentDelta } from './hit-lines';
import type { ImportResult } from '@/api';

function mockResult(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    id: 'test',
    source: 'build_file',
    status: 'calculable',
    warnings: [],
    conversionReport: { status: 'complete', blockers: [], pobValidation: { roundTripValid: true, baselineValid: true, mainSkillValid: true } },
    ...overrides,
  };
}

describe('extractHitLines', () => {
  it('should extract MaximumHitTaken keys from calcsOutput', () => {
    const result = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: {
          PhysicalMaximumHitTaken: 400,
          FireMaximumHitTaken: 300,
          ColdMaximumHitTaken: 250,
          LightningMaximumHitTaken: 200,
          ChaosMaximumHitTaken: 150,
          Life: 3000,
        },
        rawBreakdown: {},
      },
    });

    const h = extractHitLines(result);
    expect(h.physical).toBe(400);
    expect(h.fire).toBe(300);
    expect(h.cold).toBe(250);
    expect(h.lightning).toBe(200);
    expect(h.chaos).toBe(150);
    expect(h.life).toBe(3000);
  });

  it('should derive elemental as min of fire/cold/lightning when ElementalMaximumHitTaken absent', () => {
    const result = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: {
          PhysicalMaximumHitTaken: 400,
          FireMaximumHitTaken: 300,
          ColdMaximumHitTaken: 250,
          LightningMaximumHitTaken: 200,
          ChaosMaximumHitTaken: 150,
        },
        rawBreakdown: {},
      },
    });

    const h = extractHitLines(result);
    // min(300, 250, 200) = 200
    expect(h.elemental).toBe(200);
  });

  it('should prefer ElementalMaximumHitTaken when present', () => {
    const result = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: {
          PhysicalMaximumHitTaken: 400,
          FireMaximumHitTaken: 300,
          ColdMaximumHitTaken: 250,
          LightningMaximumHitTaken: 200,
          ChaosMaximumHitTaken: 150,
          ElementalMaximumHitTaken: 250,
        },
        rawBreakdown: {},
      },
    });

    const h = extractHitLines(result);
    expect(h.elemental).toBe(250);
  });

  it('should handle missing calcsOutput gracefully', () => {
    const result = mockResult();
    const h = extractHitLines(result);
    expect(h.physical).toBeUndefined();
    expect(h.elemental).toBeUndefined();
    expect(h.life).toBeUndefined();
  });

  it('should handle zero values without crashing', () => {
    const result = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: {
          PhysicalMaximumHitTaken: 0,
          FireMaximumHitTaken: 0,
          ColdMaximumHitTaken: 0,
          LightningMaximumHitTaken: 0,
          ChaosMaximumHitTaken: 0,
        },
        rawBreakdown: {},
      },
    });

    const h = extractHitLines(result);
    expect(h.physical).toBe(0);
    expect(h.elemental).toBeUndefined();
  });
});

describe('safePercentDelta', () => {
  it('should return undefined when A is zero', () => {
    expect(safePercentDelta(0, 5)).toBeUndefined();
  });
  it('should return undefined when A is undefined', () => {
    expect(safePercentDelta(undefined, 5)).toBeUndefined();
  });
  it('should return undefined when B is undefined', () => {
    expect(safePercentDelta(10, undefined)).toBeUndefined();
  });
  it('should compute positive percentage', () => {
    expect(safePercentDelta(100, 150)).toBe(50);
  });
  it('should compute negative percentage', () => {
    expect(safePercentDelta(100, 80)).toBe(-20);
  });
  it('should return undefined when both undefined', () => {
    expect(safePercentDelta(undefined, undefined)).toBeUndefined();
  });
});

describe('extractHitLines', () => {
  it('should fall back per-field to rawBreakdown numeric values when calcsOutput is missing', () => {
    const result = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: { PhysicalMaximumHitTaken: 400, Life: 3000 },
        rawBreakdown: { FireMaximumHitTaken: 300, ColdMaximumHitTaken: 250, LightningMaximumHitTaken: 200, ChaosMaximumHitTaken: 150 },
      },
    });
    const h = extractHitLines(result);
    expect(h.physical).toBe(400); // from calcsOutput
    expect(h.fire).toBe(300); // from rawBreakdown
    expect(h.cold).toBe(250);
    expect(h.lightning).toBe(200);
    expect(h.chaos).toBe(150);
    expect(h.elemental).toBe(200); // min(300,250,200) = 200
    expect(h.life).toBe(3000);
  });

  it('should ignore object-shaped rawBreakdown entries', () => {
    const result = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: {},
        rawBreakdown: {
          PhysicalMaximumHitTaken: { some: 'object' },
          FireMaximumHitTaken: { nested: true },
        },
      },
    });
    const h = extractHitLines(result);
    expect(h.physical).toBeUndefined();
    expect(h.fire).toBeUndefined();
  });

  it('should prefer calcsOutput over rawBreakdown per-field', () => {
    const result = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: { PhysicalMaximumHitTaken: 500 },
        rawBreakdown: { PhysicalMaximumHitTaken: 100 },
      },
    });
    const h = extractHitLines(result);
    expect(h.physical).toBe(500);
  });

  it('should derive elemental from per-field blended calcsOutput+breakdown values', () => {
    const result = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: { FireMaximumHitTaken: 100 },
        rawBreakdown: { ColdMaximumHitTaken: 200, LightningMaximumHitTaken: 300 },
      },
    });
    const h = extractHitLines(result);
    expect(h.fire).toBe(100);
    expect(h.cold).toBe(200);
    expect(h.lightning).toBe(300);
    expect(h.elemental).toBe(100); // min(100,200,300) = 100
  });
});

describe('computeHitLinesDelta', () => {
  it('should compute A/B deltas from two import results', () => {
    const buildA = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: {
          PhysicalMaximumHitTaken: 400,
          FireMaximumHitTaken: 300,
          ColdMaximumHitTaken: 250,
          LightningMaximumHitTaken: 200,
          ChaosMaximumHitTaken: 150,
          Life: 3000,
        },
        rawBreakdown: {},
      },
    });
    const buildB = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: {
          PhysicalMaximumHitTaken: 500,
          FireMaximumHitTaken: 400,
          ColdMaximumHitTaken: 350,
          LightningMaximumHitTaken: 300,
          ChaosMaximumHitTaken: 250,
          Life: 3500,
        },
        rawBreakdown: {},
      },
    });

    const d = computeHitLinesDelta(buildA, buildB);
    expect(d.physical.delta).toBe(100);
    expect(d.physical.deltaPercent).toBeCloseTo(25, 1);
    expect(d.elemental.delta).toBe(100); // min(300,250,200)=200 -> min(400,350,300)=300
    expect(d.elemental.deltaPercent).toBeCloseTo(50, 1);
    expect(d.life.delta).toBe(500);
  });

  it('should handle missing baseline gracefully', () => {
    const buildA = mockResult();
    const buildB = mockResult();
    const d = computeHitLinesDelta(buildA, buildB);
    expect(d.physical.delta).toBeUndefined();
    expect(d.elemental.delta).toBeUndefined();
    expect(d.life.delta).toBeUndefined();
  });

  it('should handle zero baseline safely for deltaPercent', () => {
    const buildA = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: { PhysicalMaximumHitTaken: 0, Life: 0 },
        rawBreakdown: {},
      },
    });
    const buildB = mockResult({
      baseline: {
        baselineHash: 'h',
        mainSkillSelection: { selectedSkillName: 's', selectedSkillNumber: 1, candidates: [] },
        calcsOutput: { PhysicalMaximumHitTaken: 100, Life: 100 },
        rawBreakdown: {},
      },
    });
    const d = computeHitLinesDelta(buildA, buildB);
    expect(d.physical.delta).toBe(100);
    expect(d.physical.deltaPercent).toBeUndefined();
  });
});

describe('extractBaselineHitLines', () => {
  it('extracts hit lines from a bare baseline-like object (calcsOutput only)', () => {
    const h = extractBaselineHitLines({
      calcsOutput: {
        PhysicalMaximumHitTaken: 5000,
        FireMaximumHitTaken: 3000,
        ColdMaximumHitTaken: 2500,
        LightningMaximumHitTaken: 2000,
        ElementalMaximumHitTaken: 2500,
        Life: 4500,
      },
    });
    expect(h.physical).toBe(5000);
    expect(h.elemental).toBe(2500);
    expect(h.life).toBe(4500);
  });

  it('derives elemental from per-element min when direct key absent', () => {
    const h = extractBaselineHitLines({
      calcsOutput: {
        PhysicalMaximumHitTaken: 4000,
        FireMaximumHitTaken: 3500,
        ColdMaximumHitTaken: 3000,
        LightningMaximumHitTaken: 2800,
        Life: 5000,
      },
    });
    expect(h.elemental).toBe(2800);
  });

  it('returns undefined for missing values', () => {
    const h = extractBaselineHitLines({ calcsOutput: {} });
    expect(h.physical).toBeUndefined();
    expect(h.elemental).toBeUndefined();
    expect(h.life).toBeUndefined();
  });
});

describe('computeBaselineDelta', () => {
  it('computes physical/elemental/life delta and deltaPercent between two baseline objects', () => {
    const d = computeBaselineDelta(
      { calcsOutput: { PhysicalMaximumHitTaken: 10000, ElementalMaximumHitTaken: 8000, Life: 5000 } },
      { calcsOutput: { PhysicalMaximumHitTaken: 10500, ElementalMaximumHitTaken: 7600, Life: 5100 } },
    );
    expect(d.physical.delta).toBe(500);
    expect(d.physical.deltaPercent).toBe(5);
    expect(d.elemental.delta).toBe(-400);
    expect(d.elemental.deltaPercent).toBe(-5);
    expect(d.life.delta).toBe(100);
    expect(d.life.deltaPercent).toBe(2);
  });

  it('returns undefined deltaPercent when baseline is 0', () => {
    const d = computeBaselineDelta(
      { calcsOutput: { PhysicalMaximumHitTaken: 0, ElementalMaximumHitTaken: 0, Life: 5000 } },
      { calcsOutput: { PhysicalMaximumHitTaken: 100, ElementalMaximumHitTaken: 100, Life: 5100 } },
    );
    expect(d.physical.deltaPercent).toBeUndefined();
    expect(d.elemental.deltaPercent).toBeUndefined();
    expect(d.life.deltaPercent).toBe(2);
  });
});
