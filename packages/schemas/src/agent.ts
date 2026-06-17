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

export const ConversionReportSchema = z.object({
  status: z.enum(['complete', 'partial', 'degraded', 'failed']),
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
  unknownMods: z.array(UnknownModSchema),
  unmappedNodes: z.array(UnmappedNodeSchema),
  unmappedSkills: z.array(UnmappedSkillSchema),
  unmappedItems: z.array(UnmappedItemSchema),
  warnings: z.array(z.string()),
});
export type ConversionReport = z.infer<typeof ConversionReportSchema>;
