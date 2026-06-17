import {
  SimulationBatch,
  SimulationJob,
  SimulationResult,
  FailedJobReport,
} from '@pobd/schemas';

export interface JobQueueConfig {
  maxWorkers: number;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export const DEFAULT_JOB_QUEUE_CONFIG: JobQueueConfig = {
  maxWorkers: 4,
  timeoutMs: 30000,
  maxRetries: 1,
  retryDelayMs: 1000,
};

/**
 * Minimal interface that a worker pool must satisfy to be used by JobQueue.
 */
export interface WorkerPoolInterface {
  execute(job: SimulationJob): Promise<SimulationResult>;
  shutdown(): Promise<void>;
}

/**
 * Simple semaphore for limiting concurrent workers.
 */
class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.permits++;
    if (this.queue.length > 0) {
      const resolve = this.queue.shift()!;
      this.permits--;
      resolve();
    }
  }
}

/**
 * JobQueue orchestrates the execution of SimulationJobs via a WorkerPool.
 *
 * Features:
 *   – Parallel execution up to maxWorkers
 *   – Per-job timeout with retry logic
 *   – Failed jobs are recorded in the batch but do NOT fail the whole batch
 *   – Batches are updated with progress, top gains/losses, and failed reports
 */
export class JobQueue {
  private batches: Map<string, SimulationBatch> = new Map();
  private jobs: Map<string, SimulationJob> = new Map();
  private config: JobQueueConfig;

  constructor(
    private workerPool: WorkerPoolInterface,
    config: Partial<JobQueueConfig> = {}
  ) {
    this.config = { ...DEFAULT_JOB_QUEUE_CONFIG, ...config };
  }

  /**
   * Register a single job before enqueueing its batch.
   */
  addJob(job: SimulationJob): void {
    this.jobs.set(job.jobId, job);
  }

  /**
   * Add a batch for tracking.  Jobs referenced by batch.jobIds must
   * have been pre-registered via addJob().
   */
  enqueue(batch: SimulationBatch): void {
    this.batches.set(batch.batchId, batch);
  }

  /**
   * Start processing all pending jobs across all enqueued batches.
   *
   * Returns the first enqueued batch (for API compatibility); every
   * batch is updated in-place with progress and results.
   */
  async start(): Promise<SimulationBatch> {
    const pendingJobs = this.getPendingJobs();
    if (pendingJobs.length === 0) {
      const firstBatch = this.batches.values().next().value as SimulationBatch | undefined;
      if (!firstBatch) {
        throw new Error('No batch enqueued');
      }
      return firstBatch;
    }

    // Mark running batches
    for (const batch of this.batches.values()) {
      if (batch.status === 'pending') {
        batch.status = 'running';
      }
    }

    const semaphore = new Semaphore(this.config.maxWorkers);

    const promises = pendingJobs.map(async (job) => {
      await semaphore.acquire();
      try {
        await this.processJob(job);
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);

    // Finalize all batches
    for (const batch of this.batches.values()) {
      this.updateBatch(batch);
    }

    const firstBatch = this.batches.values().next().value as SimulationBatch | undefined;
    if (!firstBatch) {
      throw new Error('No batch enqueued');
    }
    return firstBatch;
  }

  /**
   * Gracefully shut down the underlying worker pool.
   */
  async shutdown(): Promise<void> {
    await this.workerPool.shutdown();
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private getPendingJobs(): SimulationJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.status === 'pending' || j.status === 'queued'
    );
  }

  private async processJob(job: SimulationJob): Promise<void> {
    job.status = 'running';
    job.startedAt = Date.now();

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= this.config.maxRetries) {
      try {
        const result = await this.executeWithTimeout(job);
        job.result = result;
        job.status = 'completed';
        job.completedAt = Date.now();
        job.durationMs = (job.completedAt || 0) - (job.startedAt || 0);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;
        job.retryCount = attempt - 1; // initial attempt is not a retry

        if (attempt <= this.config.maxRetries) {
          job.status = 'queued';
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    // All retries exhausted
    job.status = 'failed';
    job.errorCode = this.errorToCode(lastError);
    job.errorMessage = lastError?.message || 'Unknown error';
    job.completedAt = Date.now();
    job.durationMs = (job.completedAt || 0) - (job.startedAt || 0);
  }

  private async executeWithTimeout(job: SimulationJob): Promise<SimulationResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Job timeout'));
      }, this.config.timeoutMs);

      this.workerPool
        .execute(job)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private errorToCode(error: Error | undefined): string {
    if (!error) return 'unknown';
    if (error.message.includes('timeout')) return 'calc_timeout';
    if (error.message.includes('xml')) return 'xml_parse_failed';
    if (error.message.includes('lua')) return 'lua_error';
    return 'unknown';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private updateBatch(batch: SimulationBatch): void {
    const batchJobs = batch.jobIds
      .map((id) => this.jobs.get(id))
      .filter((j): j is SimulationJob => j !== undefined);

    batch.totalJobs = batchJobs.length;
    batch.completedJobs = batchJobs.filter((j) => j.status === 'completed').length;
    batch.failedJobs = batchJobs.filter(
      (j) => j.status === 'failed' || j.status === 'timeout'
    ).length;

    batch.progress = batch.totalJobs > 0 ? batch.completedJobs / batch.totalJobs : 0;

    batch.allResults = batchJobs
      .filter((j) => j.result && j.status === 'completed')
      .map((j) => j.result!);

    batch.topGains = [...batch.allResults]
      .filter((r) => r.resultKind === 'normal_gain')
      .sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent)
      .slice(0, 10);

    batch.topLosses = [...batch.allResults]
      .filter((r) => r.resultKind === 'normal_loss')
      .sort((a, b) => a.dpsDeltaPercent - b.dpsDeltaPercent)
      .slice(0, 10);

    batch.incompatibleResults = batch.allResults.filter(
      (r) => r.resultKind === 'incompatible'
    );

    batch.failedJobsReport = batchJobs
      .filter((j) => j.status === 'failed' || j.status === 'timeout')
      .map((j) => this.toFailedJobReport(j));

    if (batch.failedJobs === batch.totalJobs && batch.totalJobs > 0) {
      batch.status = 'failed';
    } else if (batch.failedJobs > 0) {
      batch.status = 'partial';
    } else if (batch.completedJobs === batch.totalJobs) {
      batch.status = 'completed';
    } else {
      batch.status = 'running';
    }

    batch.completedAt = Date.now();
  }

  private toFailedJobReport(job: SimulationJob): FailedJobReport {
    return {
      jobId: job.jobId,
      mutationType: job.type,
      target: job.errorMessage,
      errorCode: job.errorCode || 'unknown',
      errorMessage: job.errorMessage || 'Unknown error',
      retryCount: job.retryCount,
    };
  }
}
