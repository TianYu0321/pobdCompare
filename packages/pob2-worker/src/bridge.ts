import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import type { Pob2WorkerRequest, Pob2WorkerResponse } from './protocol.js';

export interface Pob2BridgeOptions {
  pythonPath: string;
  driverPath: string;
  requestTimeoutMs: number;
  pobSrcDir: string;
}

export class Pob2Bridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private readonly options: Pob2BridgeOptions;
  private requestQueue: Array<{
    request: Pob2WorkerRequest;
    resolve: (value: Pob2WorkerResponse) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private currentRequest: {
    resolve: (value: Pob2WorkerResponse) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
  } | null = null;
  private buffer = '';

  constructor(options: Pob2BridgeOptions) {
    super();
    this.options = options;
    this.spawn();
  }

  private spawn(): void {
    console.log('Spawning Python:', this.options.pythonPath, this.options.driverPath);
    this.process = spawn(this.options.pythonPath, [this.options.driverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(this.options.pobSrcDir, 'src'),
    });
    console.log('Spawned process, pid:', this.process.pid);

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf-8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleLine(line.trim());
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const err = data.toString('utf-8');
      console.error('Python stderr:', err);
      this.emit('stderr', err);
    });

    this.process.on('exit', (code, signal) => {
      console.log('Python exited:', code, signal);
      this.emit('exit', code, signal);
      if (this.currentRequest) {
        this.currentRequest.reject(
          new Error(`Python process exited (code=${code}, signal=${signal})`),
        );
        this.currentRequest = null;
      }
      // Reject queued requests
      for (const queued of this.requestQueue) {
        clearTimeout(queued.timer);
        queued.reject(new Error(`Python process exited (code=${code}, signal=${signal})`));
      }
      this.requestQueue = [];
      this.process = null;
    });
    
    this.process.stdin?.on('error', (err) => {
      console.error('stdin error:', err);
      this.emit('error', err);
    });
  }

  private handleLine(line: string): void {
    if (!this.currentRequest) return;
    const req = this.currentRequest;
    try {
      const response = JSON.parse(line) as Pob2WorkerResponse;
      clearTimeout(req.timer);
      req.resolve(response);
      this.currentRequest = null;
      this.processQueue();
    } catch (err) {
      // Ignore non-JSON lines (e.g., Lua print/ConPrintf output) and continue waiting for the actual JSON response
      const trimmed = line.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        // Likely a malformed JSON response, reject
        clearTimeout(req.timer);
        req.reject(
          new Error(`Failed to parse JSON response: ${err}`),
        );
        this.currentRequest = null;
        this.processQueue();
      }
      // Otherwise, ignore the line (e.g., "missing node 62386") and keep waiting
    }
  }

  async execute(request: Pob2WorkerRequest): Promise<Pob2WorkerResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.currentRequest) {
          clearTimeout(this.currentRequest.timer);
          this.currentRequest.reject(
            new Error(`Request timeout after ${this.options.requestTimeoutMs}ms`),
          );
          this.currentRequest = null;
        }
        this.kill();
      }, this.options.requestTimeoutMs);

      this.requestQueue.push({ request, resolve, reject, timer });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (
      this.currentRequest ||
      this.requestQueue.length === 0 ||
      !this.process ||
      this.process.exitCode !== null
    ) {
      return;
    }
    const next = this.requestQueue.shift();
    if (!next) return;
    this.currentRequest = {
      resolve: next.resolve,
      reject: next.reject,
      timer: next.timer,
    };
    try {
      const jsonLine = JSON.stringify(next.request) + '\n';
      this.process.stdin?.write(jsonLine);
    } catch (err) {
      clearTimeout(next.timer);
      this.currentRequest.reject(
        new Error(`Failed to write to Python stdin: ${err}`),
      );
      this.currentRequest = null;
      this.processQueue();
    }
  }

  kill(): void {
    if (this.process && this.process.exitCode === null) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && this.process.exitCode === null) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
    this.process = null;
    if (this.currentRequest) {
      clearTimeout(this.currentRequest.timer);
      this.currentRequest.reject(new Error('Bridge killed'));
      this.currentRequest = null;
    }
  }

  isAlive(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  isBusy(): boolean {
    return this.currentRequest !== null;
  }
}
