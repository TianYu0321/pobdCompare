import { z } from 'zod';
import { SimulationResultSchema } from './simulation';

// ============================================
// GearSwapResult
// ============================================

export const GearSwapResultSchema = z.object({
  simulationResult: SimulationResultSchema,
  slotName: z.string(),
  originalItemName: z.string().optional(),
  candidateItemName: z.string().optional(),
  dpsDelta: z.number(),
  dpsDeltaPercent: z.number(),
  hitLineDelta: z.record(z.unknown()).optional(),
  compatibility: z.record(z.unknown()),
  warnings: z.array(z.string()),
});
export type GearSwapResult = z.infer<typeof GearSwapResultSchema>;

// ============================================
// Comparator Output
// ============================================

export const ComparatorOutputSchema = z.object({
  allResults: z.array(SimulationResultSchema),
  topGains: z.array(SimulationResultSchema),
  topLosses: z.array(SimulationResultSchema),
  incompatibleResults: z.array(SimulationResultSchema).optional(),
});
export type ComparatorOutput = z.infer<typeof ComparatorOutputSchema>;
