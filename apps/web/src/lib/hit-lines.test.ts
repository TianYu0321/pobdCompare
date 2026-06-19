import { describe, it, expect } from 'vitest';
import { extractHitLines, computeHitLinesDelta } from './hit-lines';
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
