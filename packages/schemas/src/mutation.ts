import { z } from 'zod';

// ============================================
// Mutation Types & Payloads
// ============================================

export const MutationTypeSchema = z.enum([
  'passive_add',
  'passive_remove',
  'passive_path',
  'item_swap',
  'item_combo',
  'config_change',
]);
export type MutationType = z.infer<typeof MutationTypeSchema>;

export const PassiveAddPayloadSchema = z.object({
  targetNodeId: z.number(),
  requestedNodeIds: z.array(z.number()),
  checkConnectivity: z.boolean(),
  useAltPath: z.boolean().optional(),
});
export type PassiveAddPayload = z.infer<typeof PassiveAddPayloadSchema>;

export const PassiveRemovePayloadSchema = z.object({
  targetNodeId: z.number(),
  requestedNodeIds: z.array(z.number()),
  cascadeRemove: z.boolean(),
});
export type PassiveRemovePayload = z.infer<typeof PassiveRemovePayloadSchema>;

export const PassivePathPayloadSchema = z.object({
  targetNodeId: z.number(),
  pathNodeIds: z.array(z.number()),
  pathDescription: z.string().optional(),
  expectedPointCost: z.number(),
});
export type PassivePathPayload = z.infer<typeof PassivePathPayloadSchema>;

export const ItemSwapPayloadSchema = z.object({
  slotName: z.string(),
  itemRaw: z.string().optional(),
  itemId: z.number().optional(),
  sourceBuildHash: z.string().optional(),
  sourceSlotName: z.string().optional(),
  preserveLinks: z.boolean().optional(),
});
export type ItemSwapPayload = z.infer<typeof ItemSwapPayloadSchema>;

export const ItemComboPayloadSchema = z.object({
  swaps: z.array(ItemSwapPayloadSchema),
  comboDescription: z.string().optional(),
});
export type ItemComboPayload = z.infer<typeof ItemComboPayloadSchema>;

export const ConfigChangePayloadSchema = z.object({
  changes: z.record(z.unknown()),
  reason: z.string().optional(),
});
export type ConfigChangePayload = z.infer<typeof ConfigChangePayloadSchema>;

export const MutationSourceSchema = z.enum([
  'passive_marginal',
  'target_bd_import',
  'user_input',
  'candidate_list',
  'system_generated',
]);
export type MutationSource = z.infer<typeof MutationSourceSchema>;

export const BuildMutationSchema = z.object({
  mutationId: z.string(),
  type: MutationTypeSchema,
  baselineHash: z.string(),
  payload: z.union([
    PassiveAddPayloadSchema,
    PassiveRemovePayloadSchema,
    PassivePathPayloadSchema,
    ItemSwapPayloadSchema,
    ItemComboPayloadSchema,
    ConfigChangePayloadSchema,
  ]),
  source: MutationSourceSchema,
  reason: z.string().optional(),
  priority: z.number().optional(),
});
export type BuildMutation = z.infer<typeof BuildMutationSchema>;
