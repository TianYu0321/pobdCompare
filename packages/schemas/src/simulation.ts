import { z } from 'zod';

// ============================================
// SimulationResult
// ============================================

export const SimulationResultKindSchema = z.enum([
  'normal_gain',
  'normal_loss',
  'neutral',
  'incompatible',
  'invalid_variant',
  'calc_failed',
]);
export type SimulationResultKind = z.infer<typeof SimulationResultKindSchema>;

export const PassiveAddMetaSchema = z.object({
  targetNodeId: z.number(),
  actuallyAddedNodeIds: z.array(z.number()),
  pathAutoFilled: z.boolean(),
  actualPointCost: z.number(),
  gainPerPoint: z.number(),
});
export type PassiveAddMeta = z.infer<typeof PassiveAddMetaSchema>;

export const PassiveRemoveMetaSchema = z.object({
  targetNodeId: z.number(),
  actuallyRemovedNodeIds: z.array(z.number()),
  cascadeRemoved: z.boolean(),
  cascadeNodeCount: z.number(),
});
export type PassiveRemoveMeta = z.infer<typeof PassiveRemoveMetaSchema>;

export const GearSwapMetaSchema = z.object({
  slotName: z.string(),
  originalItemName: z.string().optional(),
  candidateItemName: z.string().optional(),
  originalItemRaw: z.string().optional(),
  candidateItemRaw: z.string().optional(),
});
export type GearSwapMeta = z.infer<typeof GearSwapMetaSchema>;

export const NumericDeltaSchema = z.object({
  baseline: z.number(),
  variant: z.number(),
  delta: z.number(),
  deltaPercent: z.number().optional(),
});
export type NumericDelta = z.infer<typeof NumericDeltaSchema>;

export const OutputDiffSchema = z.object({
  offence: z.object({
    combinedDps: NumericDeltaSchema.optional(),
    averageHit: NumericDeltaSchema.optional(),
    hitDamage: NumericDeltaSchema.optional(),
    attackSpeed: NumericDeltaSchema.optional(),
    castSpeed: NumericDeltaSchema.optional(),
    critChance: NumericDeltaSchema.optional(),
    critMultiplier: NumericDeltaSchema.optional(),
    hitChance: NumericDeltaSchema.optional(),
    accuracy: NumericDeltaSchema.optional(),
  }),
  defence: z.object({
    life: NumericDeltaSchema.optional(),
    energyShield: NumericDeltaSchema.optional(),
    armour: NumericDeltaSchema.optional(),
    evasion: NumericDeltaSchema.optional(),
    resistances: z.record(NumericDeltaSchema).optional(),
    blockChance: NumericDeltaSchema.optional(),
  }).optional(),
  damageTypes: z.record(NumericDeltaSchema).optional(),
});
export type OutputDiff = z.infer<typeof OutputDiffSchema>;

export const HitLineDeltaSchema = z.object({
  totalPoolDelta: NumericDeltaSchema.optional(),
  physicalHitLineDelta: NumericDeltaSchema.optional(),
  elementalHitLineDelta: NumericDeltaSchema.optional(),
  fireHitLineDelta: NumericDeltaSchema.optional(),
  coldHitLineDelta: NumericDeltaSchema.optional(),
  lightningHitLineDelta: NumericDeltaSchema.optional(),
  chaosHitLineDelta: NumericDeltaSchema.optional(),
  source: z.enum(['pob2_output', 'normalized_breakdown', 'panel_fallback']),
  warnings: z.array(z.string()),
});
export type HitLineDelta = z.infer<typeof HitLineDeltaSchema>;

export const EvidenceRefSchema = z.object({
  type: z.enum([
    'baseline',
    'variant',
    'mutation',
    'calcs_output',
    'raw_breakdown',
    'normalized_breakdown',
    'conversion_report',
  ]),
  baselineHash: z.string().optional(),
  variantHash: z.string().optional(),
  mutationId: z.string().optional(),
  path: z.string().optional(),
  label: z.string().optional(),
  value: z.unknown().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const SimulationResultSchema = z.object({
  jobId: z.string(),
  batchId: z.string().optional(),
  baselineHash: z.string(),
  variantHash: z.string(),
  mutationId: z.string(),
  mutationType: z.string(), // MutationTypeSchema
  resultKind: SimulationResultKindSchema,
  affectedSkillNumber: z.number(),
  isMainSkillStillValid: z.boolean(),
  target: z.object({
    type: z.enum(['passive', 'item', 'combo', 'config']),
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    slotName: z.string().optional(),
  }),
  baselineDps: z.number(),
  variantDps: z.number(),
  dpsDelta: z.number(),
  dpsDeltaPercent: z.number(),
  pointCost: z.number().optional(),
  gainPerPoint: z.number().optional(),
  passiveAddMeta: PassiveAddMetaSchema.optional(),
  passiveRemoveMeta: PassiveRemoveMetaSchema.optional(),
  gearSwapMeta: GearSwapMetaSchema.optional(),
  outputDiff: OutputDiffSchema,
  hitLineDelta: HitLineDeltaSchema.optional(),
  rawBreakdownDiff: z.record(z.unknown()).optional(),
  // normalizedBreakdownDiff: z.array(BreakdownDiffGroupSchema).optional(), // forward ref
  compatibility: z.record(z.unknown()).optional(), // CompatibilityResultSchema
  warnings: z.array(z.string()),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  retryHint: z.string().optional(),
  evidence: z.array(EvidenceRefSchema),
  createdAt: z.number(),
  calcDurationMs: z.number().optional(),
});
export type SimulationResult = z.infer<typeof SimulationResultSchema>;
