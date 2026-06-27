import { EventEmitter } from 'events';
import type { Pob2WorkerRequest, Pob2WorkerResponse } from './protocol.js';
export interface Pob2BridgeOptions {
    pythonPath: string;
    driverPath: string;
    requestTimeoutMs: number;
    pobSrcDir: string;
}
export declare class Pob2Bridge extends EventEmitter {
    private process;
    private readonly options;
    private requestQueue;
    private currentRequest;
    private buffer;
    constructor(options: Pob2BridgeOptions);
    private spawn;
    private handleProcessFailure;
    private handleLine;
    execute(request: Pob2WorkerRequest): Promise<Pob2WorkerResponse>;
    private processQueue;
    kill(): void;
    isAlive(): boolean;
    isBusy(): boolean;
}
//# sourceMappingURL=bridge.d.ts.map