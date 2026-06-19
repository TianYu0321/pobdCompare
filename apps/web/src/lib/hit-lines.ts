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

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function minFinitePositive(values: (number | undefined)[]): number | undefined {
  const finite = values.filter((v): v is number => v !== undefined && v > 0);
  return finite.length > 0 ? Math.min(...finite) : undefined;
}

export function extractHitLines(result: ImportResult): HitLinesValues {
  const co = result.baseline?.calcsOutput ?? {};
  const physical = finiteNumber(co.PhysicalMaximumHitTaken);
  const fire = finiteNumber(co.FireMaximumHitTaken);
  const cold = finiteNumber(co.ColdMaximumHitTaken);
  const lightning = finiteNumber(co.LightningMaximumHitTaken);
  const chaos = finiteNumber(co.ChaosMaximumHitTaken);
  const life = finiteNumber(co.Life);

  const derived = finiteNumber(co.ElementalMaximumHitTaken);
  const elemental = derived !== undefined ? derived : minFinitePositive([fire, cold, lightning]);

  return { physical, fire, cold, lightning, chaos, elemental, life };
}

export function computeHitLinesDelta(a: ImportResult, b: ImportResult): HitLinesDelta {
  const av = extractHitLines(a);
  const bv = extractHitLines(b);

  const delta = (aVal: number | undefined, bVal: number | undefined): number | undefined => {
    if (aVal !== undefined && bVal !== undefined) return bVal - aVal;
    return undefined;
  };
  const deltaPercent = (aVal: number | undefined, deltaVal: number | undefined): number | undefined => {
    if (aVal !== undefined && aVal !== 0 && deltaVal !== undefined) return (deltaVal / aVal) * 100;
    return undefined;
  };

  const physicalDelta = delta(av.physical, bv.physical);
  const elementalDelta = delta(av.elemental, bv.elemental);
  const lifeDelta = delta(av.life, bv.life);

  return {
    physical: { a: av.physical, b: bv.physical, delta: physicalDelta, deltaPercent: deltaPercent(av.physical, physicalDelta) },
    elemental: { a: av.elemental, b: bv.elemental, delta: elementalDelta, deltaPercent: deltaPercent(av.elemental, elementalDelta) },
    fire: { a: av.fire, b: bv.fire },
    cold: { a: av.cold, b: bv.cold },
    lightning: { a: av.lightning, b: bv.lightning },
    chaos: { a: av.chaos, b: bv.chaos },
    life: { a: av.life, b: bv.life, delta: lifeDelta, deltaPercent: deltaPercent(av.life, lifeDelta) },
  };
}
