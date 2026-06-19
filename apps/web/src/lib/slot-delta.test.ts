import { describe, expect, it } from 'vitest';

import { changedSlotName, slotDeltaText } from './slot-delta';
import type { RevisionResult } from '@/api';

const gainResult: RevisionResult = {
  resultKind: 'normal_gain',
  dpsDeltaPercent: 10,
  dpsDelta: 5000,
  variantHash: 'v1',
  target: { type: 'item', slotName: 'Weapon 1' },
  outputDiff: { offence: {} },
  hitLineDelta: {
    physicalHitLineDelta: { baseline: 10000, variant: 10500, delta: 500, deltaPercent: 5 },
    elementalHitLineDelta: { baseline: 8000, variant: 7600, delta: -400, deltaPercent: -5 },
  },
};

const incompatibleResult: RevisionResult = {
  resultKind: 'incompatible',
  dpsDeltaPercent: 0,
  dpsDelta: 0,
  variantHash: 'v2',
  target: { type: 'item', slotName: 'Boots' },
  outputDiff: { offence: {} },
};

const calcFailedResult: RevisionResult = {
  resultKind: 'calc_failed',
  dpsDeltaPercent: 0,
  dpsDelta: 0,
  variantHash: 'v3',
  target: { type: 'item', slotName: 'Helm' },
  outputDiff: { offence: {} },
};

const noHitLines: RevisionResult = {
  resultKind: 'normal_gain',
  dpsDeltaPercent: 5,
  dpsDelta: 100,
  variantHash: 'v4',
  target: { type: 'item', slotName: 'Ring 1' },
  outputDiff: { offence: {} },
};

const noTargetResult: RevisionResult = {
  resultKind: 'normal_gain',
  dpsDeltaPercent: 3,
  dpsDelta: 50,
  variantHash: 'v5',
  outputDiff: { offence: {} },
};

describe('changedSlotName', () => {
  it('returns normalised slot name from result.target.slotName', () => {
    expect(changedSlotName(gainResult)).toBe('weapon1');
  });

  it('returns undefined when target has no slotName', () => {
    expect(changedSlotName(noTargetResult)).toBeUndefined();
  });

  it('returns undefined when result is undefined', () => {
    expect(changedSlotName(undefined)).toBeUndefined();
  });
});

describe('slotDeltaText', () => {
  it('shows DPS + hit-line deltas for the changed slot', () => {
    const rev = { result: gainResult };
    const text = slotDeltaText(rev, 'Weapon 1');
    expect(text).toContain('DPS +10.0%');
    expect(text).toContain('物 +5.0%');
    expect(text).toContain('元 -5.0%');
  });

  it('shows only DPS when no hit-line deltas present', () => {
    const rev = { result: noHitLines };
    const text = slotDeltaText(rev, 'Ring 1');
    expect(text).toBe('DPS +5.0%');
  });

  it('returns waiting text for non-changed slot', () => {
    const rev = { result: gainResult };
    expect(slotDeltaText(rev, 'Boots')).toBe('DPS Δ 待模拟');
    expect(slotDeltaText(rev, 'Helm')).toBe('DPS Δ 待模拟');
  });

  it('returns waiting text when no revision result', () => {
    expect(slotDeltaText(undefined, 'Weapon 1')).toBe('DPS Δ 待模拟');
    expect(slotDeltaText({}, 'Weapon 1')).toBe('DPS Δ 待模拟');
  });

  it('returns waiting text for incompatible result', () => {
    expect(slotDeltaText({ result: incompatibleResult }, 'Boots')).toBe('DPS Δ 待模拟');
  });

  it('returns waiting text for calc_failed result', () => {
    expect(slotDeltaText({ result: calcFailedResult }, 'Helm')).toBe('DPS Δ 待模拟');
  });

  it('returns waiting text when result has no target slotName', () => {
    expect(slotDeltaText({ result: noTargetResult }, 'Weapon 1')).toBe('DPS Δ 待模拟');
  });

  it('canonical normalisation: Main Hand matches Weapon 1', () => {
    const rev = { result: { ...gainResult, target: { type: 'item', slotName: 'Main Hand' } } };
    expect(slotDeltaText(rev, 'Weapon 1')).toContain('DPS +10.0%');
  });

  it('canonical normalisation: Helmet matches Helm', () => {
    const rev = { result: { ...gainResult, target: { type: 'item', slotName: 'Helmet' } } };
    expect(slotDeltaText(rev, 'Helm')).toContain('DPS +10.0%');
  });

  it('canonical normalisation: Ring Right matches Ring 2', () => {
    const rev = { result: { ...gainResult, target: { type: 'item', slotName: 'Ring 2' } } };
    expect(slotDeltaText(rev, 'Ring Right')).toContain('DPS +10.0%');
  });
});
