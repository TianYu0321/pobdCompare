import { toCanonicalSlotKey } from '@pobd/schemas';

/** Client-side revision result shape (loose type, mirrors SimulationResult). */
interface RevisionResult {
  resultKind: string;
  dpsDeltaPercent: number;
  dpsDelta: number;
  target?: { type: string; slotName?: string };
  outputDiff: unknown;
  hitLineDelta?: {
    source?: string;
    warnings?: string[];
    physicalHitLineDelta?: { baseline: number; variant: number; delta: number; deltaPercent?: number };
    elementalHitLineDelta?: { baseline: number; variant: number; delta: number; deltaPercent?: number };
  };
}

/**
 * Returns the slot name that a revision result mutated, or undefined if none.
 */
export function changedSlotName(result?: RevisionResult): string | undefined {
  if (!result) return undefined;
  if (result.target?.slotName) return toCanonicalSlotKey(result.target.slotName);
  return undefined;
}

/**
 * Build a delta display string for the given gear slot.
 *
 * - If the revision has no result, returns "DPS Δ 待模拟".
 * - If the revision result is incompatible/calc_failed/invalid_variant,
 *   returns "DPS Δ 待模拟".
 * - If the given slot is NOT the changed slot, returns "DPS Δ 待模拟".
 * - Otherwise returns a string like "DPS +10.0% · 物 +5.0% · 元 -2.0%"
 *   with only the deltas that are present.
 */
export function slotDeltaText(
  currentRevision?: { result?: RevisionResult },
  slotName?: string,
): string {
  const r = currentRevision?.result;
  if (!r) return 'DPS Δ 待模拟';
  if (r.resultKind === 'incompatible' || r.resultKind === 'calc_failed' || r.resultKind === 'invalid_variant') {
    return 'DPS Δ 待模拟';
  }

  const changed = changedSlotName(r);
  if (!changed || !slotName || toCanonicalSlotKey(slotName) !== changed) {
    return 'DPS Δ 待模拟';
  }

  const parts: string[] = [`DPS ${formatDelta(r.dpsDeltaPercent)}`];
  if (r.hitLineDelta?.physicalHitLineDelta?.deltaPercent !== undefined) {
    parts.push(`物 ${formatDelta(r.hitLineDelta.physicalHitLineDelta.deltaPercent)}`);
  }
  if (r.hitLineDelta?.elementalHitLineDelta?.deltaPercent !== undefined) {
    parts.push(`元 ${formatDelta(r.hitLineDelta.elementalHitLineDelta.deltaPercent)}`);
  }
  return parts.join(' · ');
}

function formatDelta(value?: number): string {
  return value === undefined ? '待计算' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
