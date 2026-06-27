import { EventEmitter } from 'events';
import type { JobInfo, Pob2WorkerRequest, Pob2WorkerResponse } from './protocol.js';
export interface Pob2WorkerPoolOptions {
    maxWorkers?: number;
    pythonPath: string;
    driverPath: string;
    pobRoot: string;
    requestTimeoutMs?: number;
    workerIdleTimeoutMs?: number;
    maxRetries?: number;
}
export declare class Pob2WorkerPool extends EventEmitter {
    private workers;
    private jobs;
    private pendingQueue;
    private pendingPromises;
    private config;
    private jobCounter;
    private shutdownFlag;
    constructor(options: Pob2WorkerPoolOptions);
    private initWorkers;
    private addWorker;
    submit(request: Pob2WorkerRequest): Promise<Pob2WorkerResponse>;
    private processQueue;
    getJobStatus(jobId: string): JobInfo | undefined;
    getStats(): {
        pending: number;
        running: number;
        completed: number;
        failed: number;
    };
    shutdown(): void;
}
//# sourceMappingURL=worker-pool.d.ts.map