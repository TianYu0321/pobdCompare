import { z } from 'zod';
import { SimulationResultSchema } from './simulation';

// ============================================
// JobQueue Types
// ============================================

export const SimulationJobSchema = z.object({
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
  // mutation: BuildMutationSchema, // imported in index
  status: z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'timeout', 'cancelled']),
  allowCache: z.boolean(),
  maxRetries: z.number(),
  retryCount: z.number(),
  timeoutMs: z.number(),
  workerId: z.string().optional(),
  result: SimulationResultSchema.optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  durationMs: z.number().optional(),
});
export type SimulationJob = z.infer<typeof SimulationJobSchema>;

export const FailedJobReportSchema = z.object({
  jobId: z.string(),
  mutationType: z.string(),
  target: z.string().optional(),
  errorCode: z.string(),
  errorMessage: z.string(),
  retryCount: z.number(),
});
export type FailedJobReport = z.infer<typeof FailedJobReportSchema>;

export const SimulationBatchSchema = z.object({
  batchId: z.string(),
  type: z.enum(['p1_5_real_build', 'passive_marginal_all', 'gear_swap_all_slots', 'custom']),
  baselineHash: z.string(),
  jobIds: z.array(z.string()),
  totalJobs: z.number(),
  completedJobs: z.number(),
  failedJobs: z.number(),
  status: z.enum(['pending', 'running', 'completed', 'partial', 'failed']),
  progress: z.number(),
  allResults: z.array(SimulationResultSchema),
  topGains: z.array(SimulationResultSchema),
  topLosses: z.array(SimulationResultSchema),
  incompatibleResults: z.array(SimulationResultSchema).optional(),
  failedJobsReport: z.array(FailedJobReportSchema).optional(),
  createdAt: z.number(),
  completedAt: z.number().optional(),
});
export type SimulationBatch = z.infer<typeof SimulationBatchSchema>;

// ============================================
// Cache Types
// ============================================

export const CacheEntrySchema = z.object({
  key: z.string(),
  data: z.unknown(),
  createdAt: z.number(),
  expiresAt: z.number().optional(),
  tags: z.array(z.string()).optional(),
});
export type CacheEntry = z.infer<typeof CacheEntrySchema>;
