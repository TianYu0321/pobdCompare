"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pob2Bridge = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const path = __importStar(require("path"));
class Pob2Bridge extends events_1.EventEmitter {
    process = null;
    options;
    requestQueue = [];
    currentRequest = null;
    buffer = '';
    constructor(options) {
        super();
        this.options = options;
        this.spawn();
    }
    spawn() {
        console.log('Spawning Python:', this.options.pythonPath, this.options.driverPath);
        this.process = (0, child_process_1.spawn)(this.options.pythonPath, [this.options.driverPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.join(this.options.pobSrcDir, 'src'),
        });
        console.log('Spawned process, pid:', this.process.pid);
        this.process.stdout?.on('data', (data) => {
            this.buffer += data.toString('utf-8');
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                this.handleLine(line.trim());
            }
        });
        this.process.stderr?.on('data', (data) => {
            const err = data.toString('utf-8');
            console.error('Python stderr:', err);
            this.emit('stderr', err);
        });
        this.process.on('exit', (code, signal) => {
            console.log('Python exited:', code, signal);
            this.emit('exit', code, signal);
            if (this.currentRequest) {
                this.currentRequest.reject(new Error(`Python process exited (code=${code}, signal=${signal})`));
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
        this.process.on('error', (err) => {
            this.handleProcessFailure('Python process failed', err);
        });
        this.process.stdin?.on('error', (err) => {
            console.error('stdin error:', err);
            this.handleProcessFailure('Python stdin failed', err);
        });
    }
    handleProcessFailure(context, error) {
        const failure = new Error(`${context}: ${error.message}`);
        if (this.currentRequest) {
            clearTimeout(this.currentRequest.timer);
            this.currentRequest.reject(failure);
            this.currentRequest = null;
        }
        for (const queued of this.requestQueue) {
            clearTimeout(queued.timer);
            queued.reject(failure);
        }
        this.requestQueue = [];
        const process = this.process;
        this.process = null;
        if (process && process.exitCode === null) {
            process.kill('SIGTERM');
        }
        this.emit('bridgeError', failure);
    }
    handleLine(line) {
        if (!this.currentRequest)
            return;
        const req = this.currentRequest;
        try {
            const response = JSON.parse(line);
            clearTimeout(req.timer);
            req.resolve(response);
            this.currentRequest = null;
            this.processQueue();
        }
        catch (err) {
            // Ignore non-JSON lines (e.g., Lua print/ConPrintf output) and continue waiting for the actual JSON response
            const trimmed = line.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                // Likely a malformed JSON response, reject
                clearTimeout(req.timer);
                req.reject(new Error(`Failed to parse JSON response: ${err}`));
                this.currentRequest = null;
                this.processQueue();
            }
            // Otherwise, ignore the line (e.g., "missing node 62386") and keep waiting
        }
    }
    async execute(request) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.currentRequest) {
                    clearTimeout(this.currentRequest.timer);
                    this.currentRequest.reject(new Error(`Request timeout after ${this.options.requestTimeoutMs}ms`));
                    this.currentRequest = null;
                }
                this.kill();
            }, this.options.requestTimeoutMs);
            this.requestQueue.push({ request, resolve, reject, timer });
            this.processQueue();
        });
    }
    processQueue() {
        if (this.currentRequest ||
            this.requestQueue.length === 0 ||
            !this.process ||
            this.process.exitCode !== null) {
            return;
        }
        const next = this.requestQueue.shift();
        if (!next)
            return;
        this.currentRequest = {
            resolve: next.resolve,
            reject: next.reject,
            timer: next.timer,
        };
        try {
            const jsonLine = JSON.stringify(next.request) + '\n';
            this.process.stdin?.write(jsonLine);
        }
        catch (err) {
            clearTimeout(next.timer);
            this.currentRequest.reject(new Error(`Failed to write to Python stdin: ${err}`));
            this.currentRequest = null;
            this.processQueue();
        }
    }
    kill() {
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
    isAlive() {
        return this.process !== null && this.process.exitCode === null;
    }
    isBusy() {
        return this.currentRequest !== null;
    }
}
exports.Pob2Bridge = Pob2Bridge;
//# sourceMappingURL=bridge.js.map