import { z } from 'zod';

// ============================================
// Variant Validation
// ============================================

export const VariantValidationSchema = z.object({
  isValid: z.boolean(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});
export type VariantValidation = z.infer<typeof VariantValidationSchema>;

export const SimulationErrorCodeSchema = z.enum([
  'lua_error',
  'pob2_crash',
  'xml_parse_failed',
  'invalid_mutation',
  'calc_timeout',
  'breakdown_missing',
  'main_skill_invalid',
  'unknown',
]);
export type SimulationErrorCode = z.infer<typeof SimulationErrorCodeSchema>;

export const CalcValidationSchema = z.object({
  success: z.boolean(),
  hasCalcsOutput: z.boolean(),
  hasBreakdown: z.boolean(),
  mainSkillStillValid: z.boolean(),
  dpsIsValid: z.boolean(),
  errorCode: SimulationErrorCodeSchema.optional(),
  errorMessage: z.string().optional(),
});
export type CalcValidation = z.infer<typeof CalcValidationSchema>;

export const CompatibilityResultSchema = z.object({
  isCompatible: z.boolean(),
  reason: z.enum([
    'weapon_type_mismatch',
    'skill_requirement_not_met',
    'attribute_requirement_not_met',
    'main_skill_invalid',
    'gem_disabled',
  ]).optional(),
  details: z.array(z.string()).optional(),
});
export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

// ============================================
// BuildVariant
// ============================================

export const BuildVariantSchema = z.object({
  variantId: z.string(),
  variantHash: z.string(),
  baselineHash: z.string(),
  // mutation: BuildMutationSchema, // imported in index
  buildXml: z.string(),
  buildXmlCanonicalHash: z.string(),
  skillNumber: z.number(),
  skillPart: z.string().optional(),
  weaponSet: z.number(),
  config: z.record(z.unknown()),
  calcsOutput: z.record(z.unknown()).optional(),
  mainOutput: z.record(z.unknown()).optional(),
  rawBreakdown: z.record(z.unknown()).optional(),
  // normalizedBreakdown: NormalizedBreakdownSchema.optional(), // forward ref
  preValidation: VariantValidationSchema,
  postValidation: VariantValidationSchema.optional(),
  calcValidation: CalcValidationSchema.optional(),
  compatibility: CompatibilityResultSchema.optional(),
  calcDurationMs: z.number().optional(),
  createdAt: z.number(),
});
export type BuildVariant = z.infer<typeof BuildVariantSchema>;
