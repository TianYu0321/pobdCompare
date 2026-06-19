import { z } from 'zod';

// ============================================
// Diff Engine Types
// ============================================

export const SkillDiffSchema = z.object({
  mySkills: z.array(z.string()),
  targetSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  extraSkills: z.array(z.string()),
  commonSkills: z.array(z.string()),
});
export type SkillDiff = z.infer<typeof SkillDiffSchema>;

export const SupportGemDiffSchema = z.object({
  mySupports: z.array(z.string()),
  targetSupports: z.array(z.string()),
  missingSupports: z.array(z.string()),
  extraSupports: z.array(z.string()),
  commonSupports: z.array(z.string()),
});
export type SupportGemDiff = z.infer<typeof SupportGemDiffSchema>;

export const EquipmentDiffSchema = z.object({
  myItems: z.array(z.string()),
  targetItems: z.array(z.string()),
  missingItems: z.array(z.string()),
  extraItems: z.array(z.string()),
  commonItems: z.array(z.string()),
  slotDiffs: z.array(z.object({
    slotName: z.string(),
    myItem: z.string().optional(),
    targetItem: z.string().optional(),
  })),
});
export type EquipmentDiff = z.infer<typeof EquipmentDiffSchema>;

export const WeaponSetDiffSchema = z.object({
  ws1Diff: z.object({
    mainHandChanged: z.boolean(),
    offHandChanged: z.boolean(),
    myMainHand: z.string().optional(),
    targetMainHand: z.string().optional(),
    myOffHand: z.string().optional(),
    targetOffHand: z.string().optional(),
  }),
  ws2Diff: z.object({
    mainHandChanged: z.boolean(),
    offHandChanged: z.boolean(),
    myMainHand: z.string().optional(),
    targetMainHand: z.string().optional(),
    myOffHand: z.string().optional(),
    targetOffHand: z.string().optional(),
  }),
});
export type WeaponSetDiff = z.infer<typeof WeaponSetDiffSchema>;

export const PassiveDiffSchema = z.object({
  myNodes: z.array(z.number()),
  targetNodes: z.array(z.number()),
  missingNodes: z.array(z.number()),
  extraNodes: z.array(z.number()),
  commonNodes: z.array(z.number()),
});
export type PassiveDiff = z.infer<typeof PassiveDiffSchema>;

export const AtlasPassiveDiffSchema = z.object({
  myNodes: z.array(z.number()),
  targetNodes: z.array(z.number()),
  missingNodes: z.array(z.number()),
  extraNodes: z.array(z.number()),
  commonNodes: z.array(z.number()),
});
export type AtlasPassiveDiff = z.infer<typeof AtlasPassiveDiffSchema>;

export const PanelDiffSchema = z.object({
  lifeDiff: z.number().optional(),
  manaDiff: z.number().optional(),
  energyShieldDiff: z.number().optional(),
  armourDiff: z.number().optional(),
  evasionDiff: z.number().optional(),
  resistanceDiffs: z.record(z.number()).optional(),
});
export type PanelDiff = z.infer<typeof PanelDiffSchema>;

export const DpsDiffSchema = z.object({
  myDps: z.number().optional(),
  targetDps: z.number().optional(),
  diffPercent: z.number().optional(),
});
export type DpsDiff = z.infer<typeof DpsDiffSchema>;

export const RuleWarningSchema = z.object({
  ruleId: z.string(),
  title: z.string(),
  impact: z.enum(['high', 'medium', 'low']),
  message: z.string(),
  evidence: z.array(z.string()),
});
export type RuleWarning = z.infer<typeof RuleWarningSchema>;

export const BuildDiffResultSchema = z.object({
  mainSkill: z.string(),
  dpsDiff: DpsDiffSchema.optional(),
  skillDiff: SkillDiffSchema,
  supportGemDiff: SupportGemDiffSchema,
  equipmentDiff: EquipmentDiffSchema,
  weaponSetDiff: WeaponSetDiffSchema,
  passiveDiff: PassiveDiffSchema,
  atlasPassiveDiff: AtlasPassiveDiffSchema.optional(),
  panelDiff: PanelDiffSchema,
  ruleWarnings: z.array(RuleWarningSchema),
  missingData: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type BuildDiffResult = z.infer<typeof BuildDiffResultSchema>;
