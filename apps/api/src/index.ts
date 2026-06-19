import { createApp } from './app.js';
import { Pob2Runtime } from './runtime/pob2-runtime.js';
import { ImportService } from './services/import-service.js';
import { PassiveAnalysisService } from './services/passive-analysis.js';
import { WorkspaceStore } from './workspaces/workspace-store.js';

const runtime = new Pob2Runtime();
const app = await createApp({
  imports: new ImportService(runtime),
  workspaces: new WorkspaceStore(runtime),
  passives: new PassiveAnalysisService(runtime),
});

const port = Number(process.env.PORT ?? 8787);
await app.listen({ host: '127.0.0.1', port });

const shutdown = async () => {
  runtime.shutdown();
  await app.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
