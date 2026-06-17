import { z } from 'zod';

// ============================================
// Re-export all base schemas
// ============================================

export * from './baseline';
export * from './mutation';
export * from './variant';
export * from './simulation';
export * from './comparator';
export * from './breakdown';
export * from './agent';
export * from './cache';

// ============================================
// Composed schemas with forward references
// ============================================

import { BaselineSnapshotSchema } from './baseline';
import { NormalizedBreakdownSchema } from './breakdown';
import { ConversionReportSchema } from './agent';
import { BuildMutationSchema } from './mutation';
import { SimulationResultSchema } from './simulation';
import { BreakdownDiffGroupSchema } from './breakdown';
import { CompatibilityResultSchema } from './variant';
import { EvidenceRefSchema } from './simulation';

// BaselineSnapshot with normalizedBreakdown and conversionReport
export const FullBaselineSnapshotSchema = BaselineSnapshotSchema.extend({
  normalizedBreakdown: NormalizedBreakdownSchema.optional(),
  conversionReport: ConversionReportSchema.optional(),
});
export type FullBaselineSnapshot = z.infer<typeof FullBaselineSnapshotSchema>;

// BuildVariant with mutation
export const FullBuildVariantSchema = z.lazy(() =>
  z.object({
    variantId: z.string(),
    variantHash: z.string(),
    baselineHash: z.string(),
    mutation: BuildMutationSchema,
    buildXml: z.string(),
    buildXmlCanonicalHash: z.string(),
    skillNumber: z.number(),
    skillPart: z.string().optional(),
    weaponSet: z.number(),
    config: z.record(z.unknown()),
    calcsOutput: z.record(z.unknown()).optional(),
    mainOutput: z.record(z.unknown()).optional(),
    rawBreakdown: z.record(z.unknown()).optional(),
    normalizedBreakdown: NormalizedBreakdownSchema.optional(),
    preValidation: z.record(z.unknown()),
    postValidation: z.record(z.unknown()).optional(),
    calcValidation: z.record(z.unknown()).optional(),
    compatibility: CompatibilityResultSchema.optional(),
    calcDurationMs: z.number().optional(),
    createdAt: z.number(),
  })
);
export type FullBuildVariant = z.infer<typeof FullBuildVariantSchema>;

// SimulationResult with normalizedBreakdownDiff and compatibility
export const FullSimulationResultSchema = z.lazy(() =>
  SimulationResultSchema.extend({
    normalizedBreakdownDiff: z.array(BreakdownDiffGroupSchema).optional(),
    compatibility: CompatibilityResultSchema.optional(),
  })
);
export type FullSimulationResult = z.infer<typeof FullSimulationResultSchema>;

// SimulationJob with mutation
export const FullSimulationJobSchema = z.lazy(() =>
  z.object({
    jobId: z.string(),
    batchId: z.string().optional(),
    type: z.enum([
      'passive_remove',
      'passive_add',
      'passive_path',
      'gear_swap',
      'gear_combo',
      'config_change',
    ]),
    priority: z.number(),
    baselineHash: z.string(),
    mutation: BuildMutationSchema,
    status: z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'timeout', 'cancelled']),
    allowCache: z.boolean(),
    maxRetries: z.number(),
    retryCount: z.number(),
    timeoutMs: z.number(),
    workerId: z.string().optional(),
    result: FullSimulationResultSchema.optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    createdAt: z.number(),
    startedAt: z.number().optional(),
    completedAt: z.number().optional(),
    durationMs: z.number().optional(),
  })
);
export type FullSimulationJob = z.infer<typeof FullSimulationJobSchema>;

// SimulationBatch with full jobs
export const FullSimulationBatchSchema = z.lazy(() =>
  z.object({
    batchId: z.string(),
    type: z.enum(['p1_5_real_build', 'passive_marginal_all', 'gear_swap_all_slots', 'custom']),
    baselineHash: z.string(),
    jobIds: z.array(z.string()),
    totalJobs: z.number(),
    completedJobs: z.number(),
    failedJobs: z.number(),
    status: z.enum(['pending', 'running', 'completed', 'partial', 'failed']),
    progress: z.number(),
    allResults: z.array(FullSimulationResultSchema),
    topGains: z.array(FullSimulationResultSchema),
    topLosses: z.array(FullSimulationResultSchema),
    incompatibleResults: z.array(FullSimulationResultSchema).optional(),
    failedJobsReport: z.array(z.record(z.unknown())).optional(),
    createdAt: z.number(),
    completedAt: z.number().optional(),
  })
);
export type FullSimulationBatch = z.infer<typeof FullSimulationBatchSchema>;

// AgentReportInput
export const AgentReportInputSchema = z.lazy(() =>
  z.object({
    mode: z.enum(['single_build', 'build_diff', 'simulation']),
    baselineA: FullBaselineSnapshotSchema,
    baselineB: FullBaselineSnapshotSchema.optional(),
    mainSkillSelection: z.record(z.unknown()),
    buildDiff: z.record(z.unknown()).optional(),
    simulationBatch: FullSimulationBatchSchema.optional(),
    conversionReports: z.array(ConversionReportSchema),
    warnings: z.array(z.string()),
  })
);
export type AgentReportInput = z.infer<typeof AgentReportInputSchema>;
