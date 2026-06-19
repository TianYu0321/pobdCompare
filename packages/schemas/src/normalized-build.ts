import { z } from 'zod';

// ============================================
// NormalizedBuild — 统一构筑模型
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
  // WeGame-specific
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
