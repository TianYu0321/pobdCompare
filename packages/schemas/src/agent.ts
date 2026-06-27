import { z } from 'zod';

// ============================================
// ConversionReport
// ============================================

export const UnknownModSchema = z.object({
  sourceItemSlot: z.string().optional(),
  sourceItemName: z.string().optional(),
  rawText: z.string(),
  tags: z.array(z.string()).optional(),
});
export type UnknownMod = z.infer<typeof UnknownModSchema>;

export const UnmappedNodeSchema = z.object({
  sourceNodeId: z.union([z.string(), z.number()]).optional(),
  nodeName: z.string().optional(),
  reason: z.string(),
});
export type UnmappedNode = z.infer<typeof UnmappedNodeSchema>;

export const UnmappedSkillSchema = z.object({
  rawName: z.string(),
  rawId: z.string().optional(),
  reason: z.string(),
});
export type UnmappedSkill = z.infer<typeof UnmappedSkillSchema>;

export const UnmappedItemSchema = z.object({
  slotName: z.string(),
  name: z.string(),
  baseType: z.string().optional(),
  reason: z.string(),
});
export type UnmappedItem = z.infer<typeof UnmappedItemSchema>;

export const MappingStrategySchema = z.enum([
  'exact_id',
  'exact_asset',
  'exact_template_hash',
  'versioned_override',
]);
export type MappingStrategy = z.infer<typeof MappingStrategySchema>;

export const MappingEvidenceSchema = z.object({
  category: z.enum([
    'character',
    'item',
    'skill',
    'mod',
    'passive',
    'jewel',
    'config',
    'catalog',
    'validation',
  ]),
  source: z.string(),
  target: z.string(),
  strategy: MappingStrategySchema,
  sourceId: z.string().optional(),
});
export type MappingEvidence = z.infer<typeof MappingEvidenceSchema>;

export const MappingBlockerSchema = z.object({
  code: z.enum([
    'catalog_refresh_failed',
    'catalog_version_mismatch',
    'unknown_character_class',
    'unknown_item',
    'unknown_skill',
    'unknown_mod',
    'unknown_passive',
    'ambiguous_mapping',
    'pob_import_failed',
    'round_trip_mismatch',
    'baseline_failed',
    'main_skill_invalid',
  ]),
  category: z.enum([
    'character',
    'item',
    'skill',
    'mod',
    'passive',
    'jewel',
    'config',
    'catalog',
    'validation',
  ]),
  source: z.string(),
  reason: z.string(),
  sourceId: z.string().optional(),
});
export type MappingBlocker = z.infer<typeof MappingBlockerSchema>;

export const MappingCatalogMetaSchema = z.object({
  catalogVersion: z.string(),
  gameVersion: z.string(),
  league: z.string().optional(),
  source: z.enum(['trade_api', 'local_cache', 'manual']),
  generatedAt: z.string(),
  expiresAt: z.string().optional(),
});
export type MappingCatalogMeta = z.infer<typeof MappingCatalogMetaSchema>;

export const ModStatsSchema = z.object({
  total: z.number(),
  mapped: z.number(),
  verified: z.number(),
  unverified: z.number(),
  unknown: z.number(),
  unsupported: z.number(),
  topFailureReasons: z.array(z.object({
    reason: z.string(),
    count: z.number(),
    examples: z.array(z.string()),
  })).default([]),
});
export type ModStats = z.infer<typeof ModStatsSchema>;

export const ConversionReportSchema = z.object({
  status: z.enum([
    'complete',
    'blocked',
    'validation_failed',
    'partial',
    'degraded',
    'failed',
  ]),
  catalogHash: z.string().optional(),
  mappingCatalogMeta: MappingCatalogMetaSchema.optional(),
  stale: z.boolean().optional(),
  mapped: z.array(MappingEvidenceSchema).default([]),
  blockers: z.array(MappingBlockerSchema).default([]),
  pobValidation: z.object({
    roundTripValid: z.boolean(),
    baselineValid: z.boolean(),
    mainSkillValid: z.boolean(),
  }).optional(),
  skillMapped: z.number(),
  skillTotal: z.number(),
  itemMapped: z.number(),
  itemTotal: z.number(),
  modMapped: z.number(),
  modTotal: z.number(),
  passiveMapped: z.number(),
  passiveTotal: z.number(),
  ascendancyMapped: z.number(),
  ascendancyTotal: z.number(),
  configKnown: z.number(),
  configTotal: z.number(),
  modStats: ModStatsSchema.default({
    total: 0, mapped: 0, verified: 0, unverified: 0, unknown: 0, unsupported: 0, topFailureReasons: [],
  }),
  unknownMods: z.array(UnknownModSchema),
  unmappedNodes: z.array(UnmappedNodeSchema),
  unmappedSkills: z.array(UnmappedSkillSchema),
  unmappedItems: z.array(UnmappedItemSchema),
  warnings: z.array(z.string()),
});
export type ConversionReport = z.infer<typeof ConversionReportSchema>;
