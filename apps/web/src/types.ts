import { z } from 'zod';

// ============================================
// NormalizedBuild — 统一构筑模型（前端复用 schemas）
// ============================================

export const SupportGemSchema = z.object({
  name: z.string(),
  nameEn: z.string().optional(),
  level: z.number().optional(),
  quality: z.number().optional(),
  tags: z.array(z.string()).optional(),
});
export type SupportGem = z.infer<typeof SupportGemSchema>;

export const SkillGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  nameEn: z.string().optional(),
  level: z.number().optional(),
  quality: z.number().optional(),
  slot: z.string().optional(),
  weaponSet: z.union([z.literal(1), z.literal(2), z.literal('both'), z.literal('unknown')]).optional(),
  supports: z.array(SupportGemSchema),
  tags: z.array(z.string()),
  icon: z.string().optional(),
  gemSkill: z.string().optional(),
});
export type SkillGroup = z.infer<typeof SkillGroupSchema>;

export const SkillDpsSchema = z.object({
  skillId: z.string().optional(),
  skillName: z.string(),
  dps: z.number().optional(),
  hitDamage: z.number().optional(),
  attackSpeed: z.number().optional(),
  critChance: z.number().optional(),
  critMultiplier: z.number().optional(),
  hitChance: z.number().optional(),
  source: z.enum(['wegame', 'pob', 'manual', 'unknown']),
});
export type SkillDps = z.infer<typeof SkillDpsSchema>;

export const EquipmentItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  baseType: z.string(),
  rarity: z.string().optional(),
  ilvl: z.number().optional(),
  icon: z.string().optional(),
  explicitMods: z.array(z.string()).optional(),
  implicitMods: z.array(z.string()).optional(),
  bondedMods: z.array(z.string()).optional(),
  properties: z.array(z.record(z.unknown())).optional(),
  requirements: z.array(z.record(z.unknown())).optional(),
  socketedItems: z.array(z.record(z.unknown())).optional(),
  inventoryId: z.string().optional(),
  rawText: z.string().optional(),
});
export type EquipmentItem = z.infer<typeof EquipmentItemSchema>;

export const EquipmentSlotSchema = z.object({
  slotName: z.string(),
  item: EquipmentItemSchema.optional(),
  empty: z.boolean().optional(),
});
export type EquipmentSlot = z.infer<typeof EquipmentSlotSchema>;

export const WeaponSetSchema = z.object({
  id: z.union([z.literal(1), z.literal(2)]),
  mainHand: EquipmentItemSchema.optional(),
  offHand: EquipmentItemSchema.optional(),
  offhandEmpty: z.boolean(),
});
export type WeaponSet = z.infer<typeof WeaponSetSchema>;

export const PassiveNodeSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type PassiveNode = z.infer<typeof PassiveNodeSchema>;

export const AtlasPassiveNodeSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  type: z.string().optional(),
});
export type AtlasPassiveNode = z.infer<typeof AtlasPassiveNodeSchema>;

export const JewelSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  slotName: z.string().optional(),
  passiveNodes: z.array(z.number()).optional(),
});
export type Jewel = z.infer<typeof JewelSchema>;

export const PanelAttributesSchema = z.object({
  life: z.number().optional(),
  mana: z.number().optional(),
  energyShield: z.number().optional(),
  armour: z.number().optional(),
  evasion: z.number().optional(),
  resistances: z.record(z.number()).optional(),
  blockChance: z.number().optional(),
  dodgeChance: z.number().optional(),
  movementSpeed: z.number().optional(),
  attackSpeed: z.number().optional(),
  castSpeed: z.number().optional(),
  critChance: z.number().optional(),
  critMultiplier: z.number().optional(),
  hitChance: z.number().optional(),
  totalGameDuration: z.string().optional(),
  seasonGameDuration: z.string().optional(),
  lastLoginTime: z.string().optional(),
  league: z.string().optional(),
});
export type PanelAttributes = z.infer<typeof PanelAttributesSchema>;

export const NormalizedBuildSchema = z.object({
  source: z.enum(['wegame', 'poe_ninja', 'build_file', 'pob_code']),
  meta: z.object({
    fetchedAt: z.string().optional(),
    gameVersion: z.string().optional(),
    sourceVersion: z.string().optional(),
    confidence: z.number(),
  }),
  character: z.object({
    name: z.string().optional(),
    level: z.number().optional(),
    className: z.string().optional(),
    ascendancy: z.string().optional(),
    roleId: z.string().optional(),
  }),
  skills: z.array(SkillGroupSchema),
  skillDps: z.array(SkillDpsSchema),
  equipments: z.array(EquipmentSlotSchema),
  weaponSets: z.array(WeaponSetSchema),
  passives: z.array(PassiveNodeSchema),
  atlasPassives: z.array(AtlasPassiveNodeSchema).optional(),
  jewels: z.array(JewelSchema),
  panel: PanelAttributesSchema,
  warnings: z.array(z.string()),
});
export type NormalizedBuild = z.infer<typeof NormalizedBuildSchema>;

// ============================================
// Diff 类型（前端复用 schemas）
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

// ============================================
// 模拟相关类型
// ============================================

export interface SimulationCandidate {
  id: string;
  type: 'gear_swap' | 'passive_add' | 'passive_remove';
  description: string;
  dpsDelta?: number;
  hitLineDelta?: number;
  compatibility: 'compatible' | 'incompatible' | 'warning';
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
}

export interface SimulationProgress {
  total: number;
  completed: number;
  failed: number;
  percent: number;
  currentJob?: string;
}

export type ViewMode = 'offense' | 'defense';
export type BuildTab = 'overview' | 'equipment' | 'skills' | 'passives' | 'calcs';
