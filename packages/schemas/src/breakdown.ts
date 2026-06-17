import { z } from 'zod';

// ============================================
// Breakdown Types
// ============================================

export const WeaponBreakdownSchema = z.object({
  averageHit: z.number().optional(),
  minHit: z.number().optional(),
  maxHit: z.number().optional(),
  attackSpeed: z.number().optional(),
  critChance: z.number().optional(),
  critMultiplier: z.number().optional(),
  weaponDps: z.number().optional(),
  physicalDps: z.number().optional(),
  elementalDps: z.number().optional(),
});
export type WeaponBreakdown = z.infer<typeof WeaponBreakdownSchema>;

export const OffenceBreakdownSchema = z.object({
  combinedDps: z.number().optional(),
  averageDamage: z.number().optional(),
  hitDamage: z.number().optional(),
  attackSpeed: z.number().optional(),
  castSpeed: z.number().optional(),
  critChance: z.number().optional(),
  critMultiplier: z.number().optional(),
  hitChance: z.number().optional(),
  accuracy: z.number().optional(),
  damageTypeRatio: z.record(z.number()).optional(),
  mainHand: WeaponBreakdownSchema.optional(),
  offHand: WeaponBreakdownSchema.optional(),
  totalDot: z.number().optional(),
});
export type OffenceBreakdown = z.infer<typeof OffenceBreakdownSchema>;

export const DefenceBreakdownSchema = z.object({
  life: z.number().optional(),
  energyShield: z.number().optional(),
  armour: z.number().optional(),
  evasion: z.number().optional(),
  resistances: z.record(z.number()).optional(),
  blockChance: z.number().optional(),
});
export type DefenceBreakdown = z.infer<typeof DefenceBreakdownSchema>;

export const SkillBreakdownSchema = z.object({
  skillName: z.string().optional(),
  skillId: z.string().optional(),
  partName: z.string().optional(),
});
export type SkillBreakdown = z.infer<typeof SkillBreakdownSchema>;

export const ModContributionSchema = z.object({
  modText: z.string(),
  modValue: z.number().optional(),
});
export type ModContribution = z.infer<typeof ModContributionSchema>;

export const SourceContributionSummarySchema = z.object({
  source: z.string(),
  sourceType: z.enum(['passive', 'item', 'gem', 'config', 'base', 'unknown']),
  mods: z.array(ModContributionSchema),
  affectsMetrics: z.array(z.string()),
  // evidence: z.array(EvidenceRefSchema), // forward ref
});
export type SourceContributionSummary = z.infer<typeof SourceContributionSummarySchema>;

export const FormulaRoleSchema = z.enum([
  'base',
  'added',
  'increased',
  'more',
  'crit',
  'nonCrit',
  'speed',
  'hitChance',
  'resistance',
  'penetration',
  'enemyTaken',
  'final',
  'unknown',
]);
export type FormulaRole = z.infer<typeof FormulaRoleSchema>;

export const BreakdownChainDiffSchema = z.object({
  chainLabel: z.string().optional(),
  steps: z.array(z.record(z.unknown())).optional(),
});
export type BreakdownChainDiff = z.infer<typeof BreakdownChainDiffSchema>;

export const BreakdownDiffGroupSchema = z.object({
  metric: z.string(),
  displayName: z.string(),
  category: z.enum(['offence', 'defence', 'speed', 'crit', 'hit', 'resist', 'life', 'es', 'other']),
  formulaRole: FormulaRoleSchema.optional(),
  baselineValue: z.number().optional(),
  variantValue: z.number().optional(),
  delta: z.number().optional(),
  deltaPercent: z.number().optional(),
  direction: z.enum(['increase', 'decrease', 'unchanged']),
  baselineBreakdown: z.array(z.string()).optional(),
  variantBreakdown: z.array(z.string()).optional(),
  chainDiff: BreakdownChainDiffSchema.optional(),
  sourceContributions: z.array(SourceContributionSummarySchema),
  // evidence: z.array(EvidenceRefSchema), // forward ref
  warnings: z.array(z.string()),
});
export type BreakdownDiffGroup = z.infer<typeof BreakdownDiffGroupSchema>;

export const NormalizedBreakdownSchema = z.object({
  offence: OffenceBreakdownSchema,
  defence: DefenceBreakdownSchema.optional(),
  skillInfo: SkillBreakdownSchema,
  sourceContributions: z.array(SourceContributionSummarySchema),
  globalState: z.record(z.unknown()).optional(),
  warnings: z.array(z.string()),
});
export type NormalizedBreakdown = z.infer<typeof NormalizedBreakdownSchema>;
