import { describe, it, expect, vi } from 'vitest';
import { JobQueue, JobQueueConfig } from './job-queue';
import { MockWorkerPool } from './worker-pool';
import { SimulationBatch, SimulationJob, SimulationResult } from '@pobd/schemas';

function createJob(id: string, type: SimulationJob['type'] = 'passive_remove'): SimulationJob {
  return {
    jobId: id,
    type,
    priority: 0,
    baselineHash: 'hash',
    status: 'pending',
    allowCache: true,
    maxRetries: 1,
    retryCount: 0,
    timeoutMs: 1000,
    createdAt: Date.now(),
  };
}

function createResult(dpsDelta = 100): SimulationResult {
  return {
    jobId: 'job-1',
    baselineHash: 'hash',
    variantHash: 'vh',
    mutationId: 'm1',
    mutationType: 'passive_remove',
    resultKind: 'normal_gain',
    affectedSkillNumber: 1,
    isMainSkillStillValid: true,
    target: { type: 'passive' },
    baselineDps: 1000,
    variantDps: 1100,
    dpsDelta,
    dpsDeltaPercent: 10,
    outputDiff: { offence: {} },
    warnings: [],
    evidence: [],
    createdAt: Date.now(),
  };
}

function createBatch(id: string, jobIds: string[]): SimulationBatch {
  return {
    batchId: id,
    type: 'custom',
    baselineHash: 'hash',
    jobIds,
    totalJobs: jobIds.length,
    completedJobs: 0,
    failedJobs: 0,
    status: 'pending',
    progress: 0,
    allResults: [],
    topGains: [],
    topLosses: [],
    createdAt: Date.now(),
  };
}

describe('JobQueue', () => {
  it('should process all jobs and return completed batch', async () => {
    const handler = vi.fn(async (_job: SimulationJob) => {
      return createResult(100);
    });

    const workerPool = new MockWorkerPool(handler);
    const queue = new JobQueue(workerPool, {
      maxWorkers: 2,
      timeoutMs: 5000,
      maxRetries: 0,
      retryDelayMs: 0,
    });

    const jobs = [createJob('job-1'), createJob('job-2')];
    const batch = createBatch('batch-1', ['job-1', 'job-2']);

    jobs.forEach((j) => queue.addJob(j));
    queue.enqueue(batch);

    const result = await queue.start();

    expect(result.status).toBe('completed');
    expect(result.completedJobs).toBe(2);
    expect(result.allResults.length).toBe(2);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should retry on timeout and then mark as failed', async () => {
    const handler = vi.fn(async () => {
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 100)
      );
      return createResult();
    });

    const workerPool = new MockWorkerPool(handler);
    const queue = new JobQueue(workerPool, {
      maxWorkers: 1,
      timeoutMs: 50,
      maxRetries: 1,
      retryDelayMs: 10,
    });

    const job = createJob('job-1');
    const batch = createBatch('batch-1', ['job-1']);

    queue.addJob(job);
    queue.enqueue(batch);

    const result = await queue.start();

    expect(result.status).toBe('failed');
    expect(result.failedJobs).toBe(1);
    expect(result.failedJobsReport?.length).toBe(1);
    expect(result.failedJobsReport?.[0].retryCount).toBe(1);
  });

  it('should record failed jobs but not fail the batch if partial success', async () => {
    let callCount = 0;
    const handler = vi.fn(async (_job: SimulationJob) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated failure');
      }
      return createResult(100);
    });

    const workerPool = new MockWorkerPool(handler);
    const queue = new JobQueue(workerPool, {
      maxWorkers: 1,
      timeoutMs: 5000,
      maxRetries: 0,
      retryDelayMs: 0,
    });

    const jobs = [createJob('job-1'), createJob('job-2')];
    const batch = createBatch('batch-1', ['job-1', 'job-2']);

    jobs.forEach((j) => queue.addJob(j));
    queue.enqueue(batch);

    const result = await queue.start();

    expect(result.status).toBe('partial');
    expect(result.completedJobs).toBe(1);
    expect(result.failedJobs).toBe(1);
    expect(result.allResults.length).toBe(1);
    expect(result.failedJobsReport?.length).toBe(1);
  });

  it('should sort topGains by dpsDeltaPercent descending', async () => {
    const handler = vi.fn(async (job: SimulationJob): Promise<SimulationResult> => {
      const id = parseInt(job.jobId.split('-')[1]);
      return {
        ...createResult(),
        jobId: job.jobId,
        dpsDeltaPercent: id * 10,
        resultKind: 'normal_gain',
      };
    });

    const workerPool = new MockWorkerPool(handler);
    const queue = new JobQueue(workerPool, {
      maxWorkers: 2,
      timeoutMs: 5000,
      maxRetries: 0,
      retryDelayMs: 0,
    });

    const jobs = [createJob('job-1'), createJob('job-2'), createJob('job-3')];
    const batch = createBatch('batch-1', jobs.map((j) => j.jobId));

    jobs.forEach((j) => queue.addJob(j));
    queue.enqueue(batch);

    const result = await queue.start();

    expect(result.topGains.length).toBe(3);
    expect(result.topGains[0].dpsDeltaPercent).toBe(30);
    expect(result.topGains[1].dpsDeltaPercent).toBe(20);
    expect(result.topGains[2].dpsDeltaPercent).toBe(10);
  });

  it('should sort topLosses by dpsDeltaPercent ascending', async () => {
    const handler = vi.fn(async (job: SimulationJob): Promise<SimulationResult> => {
      const id = parseInt(job.jobId.split('-')[1]);
      return {
        ...createResult(),
        jobId: job.jobId,
        dpsDeltaPercent: -id * 10,
        resultKind: 'normal_loss',
      };
    });

    const workerPool = new MockWorkerPool(handler);
    const queue = new JobQueue(workerPool, {
      maxWorkers: 2,
      timeoutMs: 5000,
      maxRetries: 0,
      retryDelayMs: 0,
    });

    const jobs = [createJob('job-1'), createJob('job-2'), createJob('job-3')];
    const batch = createBatch('batch-1', jobs.map((j) => j.jobId));

    jobs.forEach((j) => queue.addJob(j));
    queue.enqueue(batch);

    const result = await queue.start();

    expect(result.topLosses.length).toBe(3);
    expect(result.topLosses[0].dpsDeltaPercent).toBe(-30);
    expect(result.topLosses[1].dpsDeltaPercent).toBe(-20);
    expect(result.topLosses[2].dpsDeltaPercent).toBe(-10);
  });

  it('should collect incompatible results separately', async () => {
    const handler = vi.fn(async (job: SimulationJob): Promise<SimulationResult> => {
      return {
        ...createResult(),
        jobId: job.jobId,
        resultKind: job.jobId === 'job-1' ? 'incompatible' : 'normal_gain',
        dpsDeltaPercent: 10,
      };
    });

    const workerPool = new MockWorkerPool(handler);
    const queue = new JobQueue(workerPool, {
      maxWorkers: 2,
      timeoutMs: 5000,
      maxRetries: 0,
      retryDelayMs: 0,
    });

    const jobs = [createJob('job-1'), createJob('job-2')];
    const batch = createBatch('batch-1', jobs.map((j) => j.jobId));

    jobs.forEach((j) => queue.addJob(j));
    queue.enqueue(batch);

    const result = await queue.start();

    expect(result.incompatibleResults?.length).toBe(1);
    expect(result.incompatibleResults?.[0].jobId).toBe('job-1');
  });

  it('should update job status and duration', async () => {
    const handler = vi.fn(async (_job: SimulationJob) => {
      await new Promise((r) => setTimeout(r, 10));
      return createResult();
    });

    const workerPool = new MockWorkerPool(handler);
    const queue = new JobQueue(workerPool, {
      maxWorkers: 1,
      timeoutMs: 5000,
      maxRetries: 0,
      retryDelayMs: 0,
    });

    const job = createJob('job-1');
    const batch = createBatch('batch-1', ['job-1']);

    queue.addJob(job);
    queue.enqueue(batch);

    await queue.start();

    expect(job.status).toBe('completed');
    expect(job.completedAt).toBeDefined();
    expect(job.durationMs).toBeDefined();
    expect((job.durationMs || 0) >= 0).toBe(true);
  });

  it('should throw when no batch is enqueued', async () => {
    const workerPool = new MockWorkerPool(async () => createResult());
    const queue = new JobQueue(workerPool);

    await expect(queue.start()).rejects.toThrow('No batch enqueued');
  });

  it('should return the enqueued batch immediately when no pending jobs', async () => {
    const workerPool = new MockWorkerPool(async () => createResult());
    const queue = new JobQueue(workerPool);

    const batch = createBatch('batch-1', []);
    queue.enqueue(batch);

    const result = await queue.start();
    expect(result.batchId).toBe('batch-1');
  });

  it('should respect maxWorkers concurrency limit', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const handler = vi.fn(async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 50));
      currentConcurrent--;
      return createResult();
    });

    const workerPool = new MockWorkerPool(handler);
    const queue = new JobQueue(workerPool, {
      maxWorkers: 2,
      timeoutMs: 5000,
      maxRetries: 0,
      retryDelayMs: 0,
    });

    const jobs = [createJob('job-1'), createJob('job-2'), createJob('job-3')];
    const batch = createBatch('batch-1', jobs.map((j) => j.jobId));

    jobs.forEach((j) => queue.addJob(j));
    queue.enqueue(batch);

    await queue.start();

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should shut down worker pool', async () => {
    const shutdown = vi.fn(async () => {});
    const workerPool = {
      execute: async () => createResult(),
      shutdown: shutdown,
    };

    const queue = new JobQueue(workerPool);
    await queue.shutdown();

    expect(shutdown).toHaveBeenCalled();
  });
});
