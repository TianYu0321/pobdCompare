import { z } from 'zod';

import { ConversionReportSchema } from './agent';
import { BaselineSnapshotSchema } from './baseline';
import { BuildMutationSchema } from './mutation';
import { NormalizedBuildSchema } from './normalized-build';
import { SimulationResultSchema } from './simulation';

export const AnalysisStageSchema = z.enum([
  'read_build_a',
  'read_build_b',
  'select_main_skill',
  'compute_baselines',
  'compute_static_diff',
  'simulate_gear',
  'simulate_passives',
  'extract_breakdown',
  'finalize',
]);
export type AnalysisStage = z.infer<typeof AnalysisStageSchema>;

export const ImportResultSchema = z.object({
  id: z.string(),
  source: z.enum(['build_file', 'wegame', 'poe_ninja']),
  status: z.enum(['fetched', 'normalized', 'calculable', 'failed']),
  normalizedBuild: NormalizedBuildSchema.optional(),
  baseline: BaselineSnapshotSchema.optional(),
  conversionReport: ConversionReportSchema,
  warnings: z.array(z.string()),
  error: z.string().optional(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

export const VariantRevisionSchema = z.object({
  revisionId: z.string(),
  parentRevisionId: z.string().optional(),
  variantHash: z.string(),
  mutation: BuildMutationSchema.optional(),
  result: SimulationResultSchema.optional(),
  createdAt: z.number(),
});
export type VariantRevision = z.infer<typeof VariantRevisionSchema>;

export const VariantSessionSchema = z.object({
  baselineHash: z.string(),
  revisions: z.array(VariantRevisionSchema).min(1),
  cursor: z.number().int().nonnegative(),
});
export type VariantSession = z.infer<typeof VariantSessionSchema>;

export const ModuleProgressSchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type ModuleProgress = z.infer<typeof ModuleProgressSchema>;

export const JobEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stage'),
    stage: AnalysisStageSchema,
    message: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('progress'),
    module: z.enum(['imports', 'gear', 'passives', 'breakdown']),
    progress: ModuleProgressSchema,
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('result'),
    module: z.enum(['import', 'diff', 'gear', 'passives', 'workspace']),
    data: z.unknown(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('complete'),
    timestamp: z.number(),
  }),
]);
export type JobEvent = z.infer<typeof JobEventSchema>;
