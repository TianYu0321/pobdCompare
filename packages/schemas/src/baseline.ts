import { z } from 'zod';

// ============================================
// MainSkillSelection
// ============================================

export const SkillCandidateSchema = z.object({
  skillNumber: z.number(),
  name: z.string(),
  skillId: z.string().optional(),
  skillPart: z.string().optional(),
  dps: z.number(),
  enabled: z.boolean(),
  sourceSkillGroup: z.number().optional(),
  reason: z.array(z.string()),
});
export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;

export const MainSkillSelectionSchema = z.object({
  selectedSkillNumber: z.number(),
  selectionMode: z.enum(['user_confirmed', 'auto_single', 'auto_highest_dps']),
  selectedSkillName: z.string(),
  selectedSkillId: z.string().optional(),
  selectedSkillPart: z.string().optional(),
  candidates: z.array(SkillCandidateSchema),
  warnings: z.array(z.string()),
});
export type MainSkillSelection = z.infer<typeof MainSkillSelectionSchema>;

// ============================================
// BaselineSnapshot
// ============================================

export const SkillDpsInfoSchema = z.object({
  skillNumber: z.number(),
  name: z.string(),
  dps: z.number(),
  enabled: z.boolean(),
});
export type SkillDpsInfo = z.infer<typeof SkillDpsInfoSchema>;

export const SkillGroupInfoSchema = z.object({
  groupId: z.number().optional(),
  label: z.string().optional(),
  skills: z.array(z.string()).optional(),
});
export type SkillGroupInfo = z.infer<typeof SkillGroupInfoSchema>;

export const ItemInfoSchema = z.object({
  slotName: z.string(),
  itemId: z.number(),
  name: z.string(),
  baseType: z.string(),
  rawText: z.string().optional(),
});
export type ItemInfo = z.infer<typeof ItemInfoSchema>;

export const JewelInfoSchema = z.object({
  slotName: z.string().optional(),
  itemId: z.number().optional(),
  passiveNodes: z.array(z.number()).optional(),
});
export type JewelInfo = z.infer<typeof JewelInfoSchema>;

export const BaselineSnapshotSchema = z.object({
  id: z.string(),
  baselineHash: z.string(),
  source: z.enum(['build_xml', 'build_file', 'wegame', 'poe_ninja', 'manual']),
  buildXml: z.string(),
  buildXmlCanonicalHash: z.string(),
  pob2Version: z.string(),
  pob2DataVersion: z.string(),
  gameVersion: z.string(),
  league: z.string().optional(),
  character: z.object({
    name: z.string().optional(),
    level: z.number().optional(),
    className: z.string().optional(),
    ascendancyName: z.string().optional(),
  }),
  mainSkillSelection: MainSkillSelectionSchema,
  skillNumber: z.number(),
  skillPart: z.string().optional(),
  weaponSet: z.number(),
  config: z.record(z.unknown()),
  customMods: z.string().optional(),
  calcsOutput: z.record(z.unknown()),
  mainOutput: z.record(z.unknown()).optional(),
  rawBreakdown: z.record(z.unknown()),
  // normalizedBreakdown: NormalizedBreakdownSchema, // forward ref, handled in breakdown.ts
  skillDpsList: z.array(SkillDpsInfoSchema),
  skillGroups: z.array(SkillGroupInfoSchema),
  items: z.array(ItemInfoSchema),
  passiveNodes: z.array(z.number()),
  ascendNodes: z.array(z.number()),
  jewels: z.array(JewelInfoSchema),
  // conversionReport: ConversionReportSchema, // forward ref
  createdAt: z.number(),
});
export type BaselineSnapshot = z.infer<typeof BaselineSnapshotSchema>;

// ============================================
// BaselineHashPayload
// ============================================

export const BaselineHashPayloadSchema = z.object({
  buildXmlCanonicalHash: z.string(),
  skillNumber: z.number(),
  skillPart: z.string().optional(),
  weaponSet: z.number(),
  configHash: z.string(),
  customModsHash: z.string().optional(),
  pob2Version: z.string(),
  pob2DataVersion: z.string(),
  gameVersion: z.string(),
  league: z.string().optional(),
  normalizerVersion: z.string(),
  adapterVersion: z.string().optional(),
});
export type BaselineHashPayload = z.infer<typeof BaselineHashPayloadSchema>;
