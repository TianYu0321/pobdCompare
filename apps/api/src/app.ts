import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';

import { computeBuildDiff } from '@pobd/core';

import { JobRegistry } from './jobs/job-registry.js';
import { ImportService } from './services/import-service.js';
import { PassiveAnalysisService, type PassiveRankings } from './services/passive-analysis.js';
import { WorkspaceStore, type WorkspaceSide } from './workspaces/workspace-store.js';

export interface AppDependencies {
  imports: ImportService;
  workspaces: WorkspaceStore;
  jobs?: JobRegistry;
  passives?: PassiveAnalysisService;
}

export async function createApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const jobs = dependencies.jobs ?? new JobRegistry();
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024 } });

  app.get('/api/health', async () => ({ ok: true }));

  app.post('/api/imports', async (request, reply) => {
    const job = jobs.create('import');
    void (async () => {
      try {
        jobs.emit(job.id, {
          type: 'stage',
          stage: 'read_build_a',
          message: '读取构筑数据',
          timestamp: Date.now(),
        });
        let result;
        if (request.isMultipart()) {
          const file = await request.file();
          if (!file) throw new Error('没有收到 .build/.xml 文件');
          result = await dependencies.imports.importBuildXml((await file.toBuffer()).toString('utf8'));
        } else {
          const body = request.body as { url?: string; buildXml?: string };
          if (body?.url) {
            result = await dependencies.imports.importUrl(body.url, (stage, message) => {
              jobs.emit(job.id, {
                type: 'stage',
                stage,
                message,
                timestamp: Date.now(),
              });
            });
          }
          else if (body?.buildXml) result = await dependencies.imports.importBuildXml(body.buildXml);
          else throw new Error('需要 url 或 buildXml');
        }
        jobs.emit(job.id, {
          type: 'stage',
          stage: 'compute_baselines',
          message: result.status === 'calculable' ? 'PoB2 baseline 已验证' : '构筑已规范化',
          timestamp: Date.now(),
        });
        jobs.complete(job.id, result);
      } catch (error) {
        jobs.fail(job.id, error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return reply.code(202).send({ jobId: job.id });
  });

  app.post('/api/comparisons', async (request, reply) => {
    const body = request.body as { importAId?: string; importBId?: string; mainSkill?: string };
    const importA = body.importAId ? dependencies.imports.get(body.importAId) : undefined;
    const importB = body.importBId ? dependencies.imports.get(body.importBId) : undefined;
    if (!importA) return reply.code(400).send({ error: 'Build A 尚未导入' });
    const job = jobs.create('comparison');
    void (async () => {
      try {
        jobs.emit(job.id, {
          type: 'stage',
          stage: 'select_main_skill',
          message: '识别并对齐主技能',
          timestamp: Date.now(),
        });
        const workspace = dependencies.workspaces.create(importA, importB);
        let diff;
        if (importB?.normalizedBuild && importA.normalizedBuild) {
          jobs.emit(job.id, {
            type: 'stage',
            stage: 'compute_static_diff',
            message: '计算静态差异',
            timestamp: Date.now(),
          });
          const skill =
            body.mainSkill ??
            importA.baseline?.mainSkillSelection.selectedSkillName ??
            importA.normalizedBuild.skillDps[0]?.skillName ??
            '待选择';
          diff = computeBuildDiff(importA.normalizedBuild, importB.normalizedBuild, skill);
          jobs.emit(job.id, {
            type: 'result',
            module: 'diff',
            data: diff,
            timestamp: Date.now(),
          });
        }
        let passives: { a?: PassiveRankings; b?: PassiveRankings } | undefined;
        if (dependencies.passives) {
          jobs.emit(job.id, {
            type: 'stage',
            stage: 'simulate_passives',
            message: 'PoB2 正在生成天赋收益榜',
            timestamp: Date.now(),
          });
          const [a, b] = await Promise.all([
            dependencies.passives.analyze(importA.baseline!),
            importB?.baseline ? dependencies.passives.analyze(importB.baseline) : undefined,
          ]);
          passives = { a, b };
          jobs.emit(job.id, {
            type: 'result',
            module: 'passives',
            data: passives,
            timestamp: Date.now(),
          });
        }
        jobs.emit(job.id, {
          type: 'stage',
          stage: 'finalize',
          message: '工作区已就绪',
          timestamp: Date.now(),
        });
        jobs.complete(job.id, { workspace, diff, passives });
      } catch (error) {
        jobs.fail(job.id, error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return reply.code(202).send({ jobId: job.id });
  });

  app.get('/api/imports/:id', async (request, reply) => {
    const imported = dependencies.imports.get((request.params as { id: string }).id);
    if (!imported) return reply.code(404).send({ error: '导入记录不存在' });
    const { buildXml: _buildXml, ...result } = imported;
    return result;
  });

  app.get('/api/jobs/:id', async (request, reply) => {
    const job = jobs.get((request.params as { id: string }).id);
    return job ? job : reply.code(404).send({ error: '作业不存在' });
  });

  app.get('/api/jobs/:id/events', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!jobs.get(id)) return reply.code(404).send({ error: '作业不存在' });
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    const write = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    jobs.events(id).forEach(write);
    const unsubscribe = jobs.subscribe(id, (event) => {
      write(event);
      if (event.type === 'complete' || event.type === 'error') {
        unsubscribe();
        reply.raw.end();
      }
    });
    request.raw.on('close', unsubscribe);
  });

  app.get('/api/workspaces/:id', async (request, reply) => {
    const workspace = dependencies.workspaces.get((request.params as { id: string }).id);
    return workspace ?? reply.code(404).send({ error: '工作区不存在' });
  });

  app.get('/api/workspaces/:id/gear-candidates', async (request) => {
    const { id } = request.params as { id: string };
    const side = sideFrom((request.query as { side?: string }).side);
    return dependencies.workspaces.gearCandidates(id, side);
  });

  app.post('/api/workspaces/:id/gear-swaps', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { side?: string; candidateId?: string; targetSlotName?: string };
    if (!body.candidateId) return reply.code(400).send({ error: '缺少 candidateId' });
    if (!body.targetSlotName) return reply.code(400).send({ error: '缺少 targetSlotName' });
    const job = jobs.create('mutation');
    void (async () => {
      try {
        jobs.emit(job.id, {
          type: 'stage',
          stage: 'simulate_gear',
          message: 'PoB2 正在验证装备替换',
          timestamp: Date.now(),
        });
        const outcome = await dependencies.workspaces.applyGearSwap(
          id,
          sideFrom(body.side),
          body.candidateId!,
          body.targetSlotName!,
        );
        if (outcome.passives) {
          jobs.emit(job.id, {
            type: 'result',
            module: 'passives',
            data: outcome.passives,
            timestamp: Date.now(),
          });
        }
        jobs.complete(job.id, outcome);
      } catch (error) {
        jobs.fail(job.id, error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return reply.code(202).send({ jobId: job.id });
  });

  for (const action of ['undo', 'redo', 'reset'] as const) {
    const withPayload = `${action}WithPayload` as 'undoWithPayload' | 'redoWithPayload' | 'resetWithPayload';
    app.post(`/api/workspaces/:id/${action}`, async (request) => {
      const { id } = request.params as { id: string };
      const side = sideFrom((request.body as { side?: string })?.side);
      const result = await (dependencies.workspaces[withPayload] as (id: string, side: WorkspaceSide) => Promise<unknown>)(id, side);
      return result;
    });
  }

  return app;
}

function sideFrom(value?: string): WorkspaceSide {
  return value?.toLowerCase() === 'b' ? 'b' : 'a';
}
