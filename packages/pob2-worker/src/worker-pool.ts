import { EventEmitter } from 'events';
import { Pob2Bridge } from './bridge.js';
import type {
  JobInfo,
  JobStatus,
  Pob2WorkerRequest,
  Pob2WorkerResponse,
  WorkerPoolConfig,
} from './protocol.js';

export interface Pob2WorkerPoolOptions {
  maxWorkers?: number;
  pythonPath: string;
  driverPath: string;
  pobRoot: string;
  requestTimeoutMs?: number;
  workerIdleTimeoutMs?: number;
  maxRetries?: number;
}

export class Pob2WorkerPool extends EventEmitter {
  private workers: Pob2Bridge[] = [];
  private jobs: Map<string, JobInfo> = new Map();
  private pendingQueue: string[] = [];
  private pendingPromises: Map<
    string,
    { resolve: (r: Pob2WorkerResponse) => void; reject: (e: Error) => void }
  > = new Map();
  private config: Required<WorkerPoolConfig>;
  private jobCounter = 0;
  private shutdownFlag = false;

  constructor(options: Pob2WorkerPoolOptions) {
    super();
    this.config = {
      maxWorkers: options.maxWorkers ?? 4,
      pythonPath: options.pythonPath,
      driverPath: options.driverPath,
      pobRoot: options.pobRoot,
      luaDllPath: '',
      requestTimeoutMs: options.requestTimeoutMs ?? 60000,
      workerIdleTimeoutMs: options.workerIdleTimeoutMs ?? 300000,
      maxRetries: options.maxRetries ?? 2,
    };
    this.initWorkers();
  }

  private initWorkers(): void {
    for (let i = 0; i < this.config.maxWorkers; i++) {
      this.addWorker();
    }
  }

  private addWorker(): Pob2Bridge {
    const worker = new Pob2Bridge({
      pythonPath: this.config.pythonPath,
      driverPath: this.config.driverPath,
      requestTimeoutMs: this.config.requestTimeoutMs,
      pobSrcDir: this.config.pobRoot,
    });

    worker.on('exit', () => {
      const index = this.workers.indexOf(worker);
      if (index >= 0) {
        this.workers.splice(index, 1);
        this.addWorker();
        this.processQueue();
      }
    });

    this.workers.push(worker);
    return worker;
  }

  async submit(request: Pob2WorkerRequest): Promise<Pob2WorkerResponse> {
    if (this.shutdownFlag) {
      throw new Error('Worker pool is shutting down');
    }
    const jobId = `job-${++this.jobCounter}-${Date.now()}`;
    const job: JobInfo = {
      jobId,
      status: 'pending',
      request,
      retryCount: 0,
    };
    this.jobs.set(jobId, job);
    this.pendingQueue.push(jobId);

    return new Promise((resolve, reject) => {
      this.pendingPromises.set(jobId, { resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.shutdownFlag) return;
    while (this.pendingQueue.length > 0) {
      const worker = this.workers.find((w) => w.isAlive() && !w.isBusy());
      if (!worker) break;

      const jobId = this.pendingQueue.shift()!;
      const job = this.jobs.get(jobId);
      if (!job) continue;

      job.status = 'running';
      job.startedAt = Date.now();

      worker
        .execute(job.request)
        .then((response) => {
          job.status = 'completed';
          job.response = response;
          job.completedAt = Date.now();
          job.durationMs = job.completedAt - (job.startedAt || job.completedAt);
          const promise = this.pendingPromises.get(jobId);
          if (promise) {
            promise.resolve(response);
            this.pendingPromises.delete(jobId);
          }
          this.processQueue();
        })
        .catch((err) => {
          job.retryCount++;
          if (job.retryCount <= this.config.maxRetries) {
            job.status = 'pending';
            this.pendingQueue.push(jobId);
            this.processQueue();
          } else {
            job.status = 'failed';
            job.error = err instanceof Error ? err.message : String(err);
            job.completedAt = Date.now();
            const promise = this.pendingPromises.get(jobId);
            if (promise) {
              promise.reject(new Error(job.error));
              this.pendingPromises.delete(jobId);
            }
          }
        });
    }
  }

  getJobStatus(jobId: string): JobInfo | undefined {
    return this.jobs.get(jobId);
  }

  getStats(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'pending') pending++;
      else if (job.status === 'running') running++;
      else if (job.status === 'completed') completed++;
      else if (job.status === 'failed') failed++;
    }
    return { pending, running, completed, failed };
  }

  shutdown(): void {
    this.shutdownFlag = true;
    for (const worker of this.workers) {
      worker.kill();
    }
    this.workers = [];
    for (const job of this.jobs.values()) {
      if (job.status === 'pending' || job.status === 'running') {
        job.status = 'failed';
        job.error = 'Pool shutdown';
        job.completedAt = Date.now();
        const promise = this.pendingPromises.get(job.jobId);
        if (promise) {
          promise.reject(new Error(job.error));
          this.pendingPromises.delete(job.jobId);
        }
      }
    }
  }
}
