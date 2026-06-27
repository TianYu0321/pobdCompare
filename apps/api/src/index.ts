import { createApp } from './app.js';
import { Pob2Runtime } from './runtime/pob2-runtime.js';
import { ImportService } from './services/import-service.js';
import { PassiveAnalysisService } from './services/passive-analysis.js';
import { WorkspaceStore } from './workspaces/workspace-store.js';

const runtime = new Pob2Runtime();
const { service: modVerificationService } = await runtime.createModVerificationService();
const app = await createApp({
  imports: new ImportService(runtime, modVerificationService),
  workspaces: new WorkspaceStore(runtime),
  passives: new PassiveAnalysisService(runtime),
});

const port = Number(process.env.PORT ?? 8787);
await app.listen({ host: '127.0.0.1', port });

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, flushing caches...`);
  await runtime.shutdown();
  await app.close();
  if (signal !== 'beforeExit') {
    process.exit(0);
  }
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('beforeExit', () => void gracefulShutdown('beforeExit'));
