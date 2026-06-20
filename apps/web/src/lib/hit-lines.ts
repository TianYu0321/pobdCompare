import type { ImportResult } from '@/api';

export interface HitLinesValues {
  physical: number | undefined;
  fire: number | undefined;
  cold: number | undefined;
  lightning: number | undefined;
  chaos: number | undefined;
  elemental: number | undefined;
  life: number | undefined;
}

export interface HitLinesDelta {
  physical: { a: number | undefined; b: number | undefined; delta: number | undefined; deltaPercent: number | undefined };
  elemental: { a: number | undefined; b: number | undefined; delta: number | undefined; deltaPercent: number | undefined };
  fire: { a: number | undefined; b: number | undefined };
  cold: { a: number | undefined; b: number | undefined };
  lightning: { a: number | undefined; b: number | undefined };
  chaos: { a: number | undefined; b: number | undefined };
  life: { a: number | undefined; b: number | undefined; delta: number | undefined; deltaPercent: number | undefined };
}

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function minFinitePositive(values: (number | undefined)[]): number | undefined {
  const finite = values.filter((v): v is number => v !== undefined && v > 0);
  return finite.length > 0 ? Math.min(...finite) : undefined;
}

export function safePercentDelta(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined || b === undefined || a === 0) return undefined;
  return ((b - a) / a) * 100;
}

/** Legacy — extract hit lines from ImportResult. Delegates to canonical. */
export function extractHitLines(result: ImportResult): HitLinesValues {
  return extractBaselineHitLines(result.baseline ?? {});
}

export interface BaselineLike {
  calcsOutput?: Record<string, unknown>;
  rawBreakdown?: Record<string, unknown>;
  mainOutput?: Record<string, unknown>;
}

/**
 * Extract hit lines from a baseline-like object (workspace.currentBaseline shape).
 * This is the canonical extraction — extractHitLines delegates to it.
 */
export function extractBaselineHitLines(baseline: BaselineLike): HitLinesValues {
  const co = baseline.calcsOutput ?? {};
  const br = baseline.rawBreakdown ?? {};
  const mo = baseline.mainOutput ?? {};

  const lookup = (key: string): number | undefined => {
    const fromCo = finiteNumber(co[key]);
    if (fromCo !== undefined) return fromCo;
    const fromBr = br[key];
    const fromBr2 =
      fromBr !== undefined && typeof fromBr === 'object' && fromBr !== null
        ? undefined
        : finiteNumber(fromBr);
    if (fromBr2 !== undefined) return fromBr2;
    return finiteNumber(mo[key]);
  };

  const physical = lookup('PhysicalMaximumHitTaken');
  const fire = lookup('FireMaximumHitTaken');
  const cold = lookup('ColdMaximumHitTaken');
  const lightning = lookup('LightningMaximumHitTaken');
  const chaos = lookup('ChaosMaximumHitTaken');
  const life = lookup('Life');

  const derived = lookup('ElementalMaximumHitTaken');
  const elemental = derived !== undefined ? derived : minFinitePositive([fire, cold, lightning]);

  return { physical, fire, cold, lightning, chaos, elemental, life };
}

/** Compute HitLinesDelta from two baseline-like objects (current baselines). */
export function computeBaselineDelta(a: BaselineLike, b: BaselineLike): HitLinesDelta {
  const av = extractBaselineHitLines(a);
  const bv = extractBaselineHitLines(b);

  const delta = (aVal: number | undefined, bVal: number | undefined): number | undefined => {
    if (aVal !== undefined && bVal !== undefined) return bVal - aVal;
    return undefined;
  };

  const physicalDelta = delta(av.physical, bv.physical);
  const elementalDelta = delta(av.elemental, bv.elemental);
  const lifeDelta = delta(av.life, bv.life);

  return {
    physical: { a: av.physical, b: bv.physical, delta: physicalDelta, deltaPercent: safePercentDelta(av.physical, bv.physical) },
    elemental: { a: av.elemental, b: bv.elemental, delta: elementalDelta, deltaPercent: safePercentDelta(av.elemental, bv.elemental) },
    fire: { a: av.fire, b: bv.fire },
    cold: { a: av.cold, b: bv.cold },
    lightning: { a: av.lightning, b: bv.lightning },
    chaos: { a: av.chaos, b: bv.chaos },
    life: { a: av.life, b: bv.life, delta: lifeDelta, deltaPercent: safePercentDelta(av.life, bv.life) },
  };
}

export function computeHitLinesDelta(a: ImportResult, b: ImportResult): HitLinesDelta {
  return computeBaselineDelta(a.baseline ?? {}, b.baseline ?? {});
}
