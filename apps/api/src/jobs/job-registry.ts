import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import type { JobEvent } from '@pobd/schemas';

export type ApiJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ApiJob {
  id: string;
  kind: 'import' | 'comparison' | 'mutation';
  status: ApiJobStatus;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export class JobRegistry {
  private readonly jobs = new Map<string, ApiJob>();
  private readonly eventHistory = new Map<string, JobEvent[]>();
  private readonly emitter = new EventEmitter();

  create(kind: ApiJob['kind']): ApiJob {
    const now = Date.now();
    const job: ApiJob = {
      id: randomUUID(),
      kind,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    this.eventHistory.set(job.id, []);
    return job;
  }

  get(id: string): ApiJob | undefined {
    return this.jobs.get(id);
  }

  events(id: string): JobEvent[] {
    return [...(this.eventHistory.get(id) ?? [])];
  }

  emit(id: string, event: JobEvent): void {
    const history = this.eventHistory.get(id);
    if (!history) throw new Error(`Unknown job: ${id}`);
    history.push(event);
    this.emitter.emit(id, event);
    const job = this.jobs.get(id);
    if (job) job.updatedAt = event.timestamp;
  }

  subscribe(id: string, listener: (event: JobEvent) => void): () => void {
    this.emitter.on(id, listener);
    return () => this.emitter.off(id, listener);
  }

  complete(id: string, result: unknown): void {
    const job = this.requireJob(id);
    job.status = 'completed';
    job.result = result;
    job.updatedAt = Date.now();
    this.emit(id, {
      type: 'result',
      module: job.kind === 'import' ? 'import' : 'workspace',
      data: result,
      timestamp: job.updatedAt,
    });
    this.emit(id, { type: 'complete', timestamp: Date.now() });
  }

  fail(id: string, error: Error): void {
    const job = this.requireJob(id);
    job.status = 'failed';
    job.error = error.message;
    job.updatedAt = Date.now();
    this.emit(id, {
      type: 'error',
      message: error.message,
      timestamp: job.updatedAt,
    });
  }

  private requireJob(id: string): ApiJob {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Unknown job: ${id}`);
    return job;
  }
}
