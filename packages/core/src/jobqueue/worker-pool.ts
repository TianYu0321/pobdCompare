import {
  SimulationJob,
  SimulationResult,
} from '@pobd/schemas';
import { WorkerPoolInterface } from './job-queue';

/**
 * Wrapper that delegates to the real Pob2WorkerPool when available.
 *
 * Since @pobd/pob2-worker is currently a placeholder, this wrapper
 * allows the JobQueue to be wired up later without editing the
 * pob2-worker package.
 */
export class Pob2WorkerPoolWrapper implements WorkerPoolInterface {
  private delegate?: WorkerPoolInterface;

  setDelegate(delegate: WorkerPoolInterface): void {
    this.delegate = delegate;
  }

  async execute(job: SimulationJob): Promise<SimulationResult> {
    if (this.delegate) {
      return this.delegate.execute(job);
    }
    throw new Error(
      'Pob2WorkerPoolWrapper: no delegate set. ' +
        'The real Pob2WorkerPool from @pobd/pob2-worker is not yet available.'
    );
  }

  async shutdown(): Promise<void> {
    if (this.delegate) {
      return this.delegate.shutdown();
    }
    // No-op if no delegate
  }
}

/**
 * In-memory mock worker pool for unit testing.
 */
export class MockWorkerPool implements WorkerPoolInterface {
  constructor(private handler: (job: SimulationJob) => Promise<SimulationResult>) {}

  async execute(job: SimulationJob): Promise<SimulationResult> {
    return this.handler(job);
  }

  async shutdown(): Promise<void> {
    // No-op
  }
}
