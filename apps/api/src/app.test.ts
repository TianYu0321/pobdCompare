import { describe, expect, it } from 'vitest';

import type { BaselineSnapshot, NormalizedBuild, SimulationResult } from '@pobd/schemas';

import { createApp } from './app';
import { ImportService } from './services/import-service';
import { JobRegistry } from './jobs/job-registry';
import { WorkspaceStore } from './workspaces/workspace-store';
import { PassiveAnalysisService } from './services/passive-analysis';

function stubImport(id: string, hash: string, itemSlot: string, itemName: string) {
  return {
    id,
    source: 'build_file' as const,
    status: 'calculable' as const,
    conversionReport: {
      status: 'complete' as const,
      skillMapped: 0, skillTotal: 0, itemMapped: 0, itemTotal: 0,
      modMapped: 0, modTotal: 0, passiveMapped: 0, passiveTotal: 0,
      ascendancyMapped: 0, ascendancyTotal: 0, configKnown: 0, configTotal: 0,
      unknownMods: [], unmappedNodes: [], unmappedSkills: [], unmappedItems: [],
      warnings: [],
    },
    warnings: [],
    baseline: {
      id: hash,
      baselineHash: hash,
      source: 'build_file' as const,
      buildXml: '<PathOfBuilding/>',
      buildXmlCanonicalHash: hash,
      pob2Version: '1', pob2DataVersion: '1', gameVersion: 'poe2',
      character: { name: 'Tester' },
      mainSkillSelection: {
        selectedSkillNumber: 1, selectedSkillName: 'Skill', selectionMode: 'auto_single' as const,
        candidates: [], warnings: [],
      },
      skillNumber: 1, weaponSet: 1, config: {},
      calcsOutput: { CombinedDPS: 100 },
      rawBreakdown: {},
      skillDpsList: [{ skillNumber: 1, name: itemName, dps: 100, enabled: true }],
      skillGroups: [],
      items: [{ slotName: itemSlot, itemId: 1, name: itemName, baseType: 'Mace', rawText: `Rare\n${itemName}\nMace` }],
      passiveNodes: [], ascendNodes: [], jewels: [],
      createdAt: 1,
    },
    buildXml: '<PathOfBuilding/>',
    normalizedBuild: {
      source: 'build_file' as const,
      meta: { confidence: 1 },
      character: {},
      skills: [], skillDps: [],
      equipments: [{ slotName: itemSlot, item: { name: itemName, baseType: 'Mace' } }],
      weaponSets: [{ id: 1, offhandEmpty: true }],
      passives: [], jewels: [], panel: {}, warnings: [],
    },
  };
}

function makeSnap(id: string): BaselineSnapshot {
  return {
    id, baselineHash: id,
    source: 'build_file', buildXml: '<PathOfBuilding/>', buildXmlCanonicalHash: id,
    pob2Version: '1', pob2DataVersion: '1', gameVersion: 'poe2',
    character: {},
    mainSkillSelection: {
      selectedSkillNumber: 1, selectedSkillName: 'Skill', selectionMode: 'auto_single',
      candidates: [], warnings: [],
    },
    skillNumber: 1, weaponSet: 1, config: {},
    calcsOutput: { CombinedDPS: 100 }, rawBreakdown: {},
    skillDpsList: [], skillGroups: [], items: [],
    passiveNodes: [], ascendNodes: [], jewels: [],
    createdAt: 1,
  };
}

const okSimResult: SimulationResult = {
  jobId: 'job-1',
  baselineHash: 'hash',
  variantHash: 'v-1',
  mutationId: 'mut-1',
  mutationType: 'item_swap',
  resultKind: 'normal_gain',
  affectedSkillNumber: 1,
  isMainSkillStillValid: true,
  target: { type: 'item', slotName: 'Weapon 1' },
  baselineDps: 100,
  variantDps: 110,
  dpsDelta: 10,
  dpsDeltaPercent: 10,
  outputDiff: { offence: {} },
  warnings: [],
  evidence: [],
  createdAt: Date.now(),
};

async function waitForCompletedJob(app: Awaited<ReturnType<typeof createApp>>, jobId: string) {
  for (let i = 0; i < 20; i++) {
    const response = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    const job = response.json<{
      status: string;
      result?: Record<string, unknown>;
      error?: string;
    }>();
    if (job.status === 'completed' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`job ${jobId} did not finish`);
}

function passiveService(analyzedHashes: string[], shouldThrow = false) {
  return new PassiveAnalysisService(
    {
      simulatePassive: async ({ baseline, mutation }) => ({
        ...okSimResult,
        baselineHash: baseline.baselineHash,
        mutationId: mutation.mutationId,
        mutationType: 'passive_add',
        target: { type: 'passive', id: 10 },
        passiveAddMeta: {
          targetNodeId: 10,
          actuallyAddedNodeIds: [10],
          pathAutoFilled: false,
          actualPointCost: 1,
          gainPerPoint: 10,
        },
      }),
    },
    async (baseline) => {
      analyzedHashes.push(baseline.baselineHash);
      if (shouldThrow) throw new Error('tree catalog unavailable');
      return {
        next: [{ id: 10, name: '测试节点' }],
        path: [],
        remove: [],
      };
    },
  );
}

describe('local API', () => {
  it('imports XML asynchronously and exposes the completed job', async () => {
    const snap = makeSnap('base');
    const imports = new ImportService({
      computeBaseline: async () => snap,
    });
    const app = await createApp({
      imports,
      workspaces: new WorkspaceStore({
        applyGearSwap: async () => {
          throw new Error('not used');
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/imports',
      payload: { buildXml: '<PathOfBuilding><Build/></PathOfBuilding>' },
    });
    expect(response.statusCode).toBe(202);
    const { jobId } = response.json<{ jobId: string }>();

    await new Promise((resolve) => setTimeout(resolve, 0));
    const jobResponse = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    expect(jobResponse.statusCode).toBe(200);
    expect(jobResponse.json().status).toBe('completed');
    expect(jobResponse.json().result.status).toBe('calculable');

    await app.close();
  });

  it('POST gear-swaps with missing targetSlotName returns 400', async () => {
    const snap = makeSnap('base');
    const imports = new ImportService({
      computeBaseline: async () => snap,
    });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '',
        result: okSimResult,
        snapshot: makeSnap('base'),
      }),
    });
    const app = await createApp({ imports, workspaces });

    const ws = workspaces.create(
      stubImport('imp-a', 'hash-a', 'Weapon 1', 'Axe'),
      stubImport('imp-b', 'hash-b', 'Weapon 1', 'Maul'),
    );

    const resp1 = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${ws.id}/gear-swaps`,
      payload: { side: 'a', candidateId: 'b:Weapon 1:1' },
    });
    expect(resp1.statusCode).toBe(400);
    expect(resp1.json().error).toContain('targetSlotName');

    const resp2 = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${ws.id}/gear-swaps`,
      payload: { side: 'a', candidateId: 'b:Weapon 1:1', targetSlotName: '' },
    });
    expect(resp2.statusCode).toBe(400);
    expect(resp2.json().error).toContain('targetSlotName');

    await app.close();
  });

  it('POST gear-swaps success: completed job payload contains applied, result, workspace, diff', async () => {
    const jobs = new JobRegistry();
    const snap = makeSnap('base');
    const imports = new ImportService({
      computeBaseline: async () => snap,
    });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okSimResult,
        snapshot: makeSnap('snap-v1'),
      }),
    });
    const app = await createApp({ imports, workspaces, jobs });

    const ws = workspaces.create(
      stubImport('imp-a2', 'hash-a2', 'Weapon 1', 'Axe'),
      stubImport('imp-b2', 'hash-b2', 'Weapon 1', 'Maul'),
    );

    // Submit gear swap
    const swapResp = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${ws.id}/gear-swaps`,
      payload: { side: 'a', candidateId: 'b:Weapon 1:1', targetSlotName: 'Weapon 1' },
    });
    expect(swapResp.statusCode).toBe(202);
    const { jobId } = swapResp.json<{ jobId: string }>();

    const job = await waitForCompletedJob(app, jobId);
    expect(job.status).toBe('completed');
    const outcome = job.result as Record<string, unknown>;
    expect(outcome.applied).toBe(true);
    expect(outcome.workspace).toBeDefined();
    const wsResult = outcome.workspace as Record<string, unknown>;
    expect(wsResult.diff).toBeDefined();

    await app.close();
  });

  it('POST gear-swaps with calc_failed executor completes job with applied:false, workspace unchanged', async () => {
    const jobs = new JobRegistry();
    const snap = makeSnap('base');
    const imports = new ImportService({
      computeBaseline: async () => snap,
    });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding baseline/>',
        result: { ...okSimResult, resultKind: 'calc_failed', errorMessage: 'snapshot failed', dpsDelta: 0, dpsDeltaPercent: 0 },
        snapshot: makeSnap('base'),
      }),
    });
    const app = await createApp({ imports, workspaces, jobs });

    const ws = workspaces.create(
      stubImport('imp-a3', 'hash-a3', 'Weapon 1', 'Axe'),
      stubImport('imp-b3', 'hash-b3', 'Weapon 1', 'Maul'),
    );

    const swapResp = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${ws.id}/gear-swaps`,
      payload: { side: 'a', candidateId: 'b:Weapon 1:1', targetSlotName: 'Weapon 1' },
    });
    expect(swapResp.statusCode).toBe(202);
    const { jobId } = swapResp.json<{ jobId: string }>();

    const job = await waitForCompletedJob(app, jobId);
    expect(job.status).toBe('completed');
    expect(job.result!.applied).toBe(false);
    expect((job.result!.result as Record<string, string>)?.resultKind).toBe('calc_failed');

    await app.close();
  });

  it('successful gear swap analyzes passives for the fresh revision and emits simulate_passives', async () => {
    const jobs = new JobRegistry();
    const analyzedHashes: string[] = [];
    const imports = new ImportService({ computeBaseline: async () => makeSnap('base') });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okSimResult,
        snapshot: makeSnap('snap-v1'),
      }),
    });
    const app = await createApp({
      imports,
      workspaces,
      jobs,
      passives: passiveService(analyzedHashes),
    });
    const workspace = workspaces.create(
      stubImport('imp-a4', 'hash-a4', 'Weapon 1', 'Axe'),
      stubImport('imp-b4', 'hash-b4', 'Weapon 1', 'Maul'),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspace.id}/gear-swaps`,
      payload: { side: 'a', candidateId: 'b:Weapon 1:1', targetSlotName: 'Weapon 1' },
    });
    const { jobId } = response.json<{ jobId: string }>();
    const job = await waitForCompletedJob(app, jobId);

    expect(job.status).toBe('completed');
    expect(analyzedHashes).toEqual(['snap-v1']);
    expect((job.result?.passives as { a?: { nextPoint: unknown[] } }).a?.nextPoint).toHaveLength(1);
    expect(jobs.events(jobId).filter((event) => event.type === 'stage').map((event) => event.stage))
      .toEqual(['simulate_gear', 'simulate_passives']);
    await app.close();
  });

  it('does not analyze passives when a gear swap is incompatible', async () => {
    const analyzedHashes: string[] = [];
    const imports = new ImportService({ computeBaseline: async () => makeSnap('base') });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding/>',
        result: { ...okSimResult, resultKind: 'incompatible' },
        snapshot: makeSnap('unchanged'),
      }),
    });
    const app = await createApp({
      imports,
      workspaces,
      passives: passiveService(analyzedHashes),
    });
    const workspace = workspaces.create(
      stubImport('imp-a5', 'hash-a5', 'Weapon 1', 'Axe'),
      stubImport('imp-b5', 'hash-b5', 'Weapon 1', 'Maul'),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspace.id}/gear-swaps`,
      payload: { side: 'a', candidateId: 'b:Weapon 1:1', targetSlotName: 'Weapon 1' },
    });
    const job = await waitForCompletedJob(app, response.json<{ jobId: string }>().jobId);

    expect(job.status).toBe('completed');
    expect(job.result?.applied).toBe(false);
    expect(analyzedHashes).toEqual([]);
    await app.close();
  });

  it('reuses revision rankings after undo and redo', async () => {
    const analyzedHashes: string[] = [];
    const imports = new ImportService({ computeBaseline: async () => makeSnap('base') });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okSimResult,
        snapshot: makeSnap('snap-v1'),
      }),
    });
    const app = await createApp({
      imports,
      workspaces,
      passives: passiveService(analyzedHashes),
    });
    const workspace = workspaces.create(
      stubImport('imp-a6', 'hash-a6', 'Weapon 1', 'Axe'),
      stubImport('imp-b6', 'hash-b6', 'Weapon 1', 'Maul'),
    );

    const swap = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspace.id}/gear-swaps`,
      payload: { side: 'a', candidateId: 'b:Weapon 1:1', targetSlotName: 'Weapon 1' },
    });
    await waitForCompletedJob(app, swap.json<{ jobId: string }>().jobId);
    const undo = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspace.id}/undo`,
      payload: { side: 'a' },
    });
    const redo = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspace.id}/redo`,
      payload: { side: 'a' },
    });

    expect(undo.json().passives.a.nextPoint).toHaveLength(1);
    expect(redo.json().passives.a.nextPoint).toHaveLength(1);
    expect(analyzedHashes).toEqual(['snap-v1', 'hash-a6']);
    await app.close();
  });

  it('keeps a successful gear revision when passive candidate generation fails', async () => {
    const analyzedHashes: string[] = [];
    const imports = new ImportService({ computeBaseline: async () => makeSnap('base') });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: okSimResult,
        snapshot: makeSnap('snap-v1'),
      }),
    });
    const app = await createApp({
      imports,
      workspaces,
      passives: passiveService(analyzedHashes, true),
    });
    const workspace = workspaces.create(
      stubImport('imp-a7', 'hash-a7', 'Weapon 1', 'Axe'),
      stubImport('imp-b7', 'hash-b7', 'Weapon 1', 'Maul'),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspace.id}/gear-swaps`,
      payload: { side: 'a', candidateId: 'b:Weapon 1:1', targetSlotName: 'Weapon 1' },
    });
    const job = await waitForCompletedJob(app, response.json<{ jobId: string }>().jobId);

    expect(job.status).toBe('completed');
    expect(job.result?.applied).toBe(true);
    expect(job.result?.passives).toBeUndefined();
    expect((job.result?.passiveWarnings as { a?: string }).a).toContain('tree catalog unavailable');
    expect((job.result?.workspace as { a: { session: { cursor: number } } }).a.session.cursor).toBe(1);
    await app.close();
  });

  it('deduplicates concurrent passive analysis for identical A and B baselines', async () => {
    const analyzedHashes: string[] = [];
    const imports = new ImportService({ computeBaseline: async () => makeSnap('same-hash') });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => {
        throw new Error('unused');
      },
    });
    const app = await createApp({
      imports,
      workspaces,
      passives: passiveService(analyzedHashes),
    });
    const imported = await imports.importBuildXml('<PathOfBuilding><Build/></PathOfBuilding>');

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: { importAId: imported.id, importBId: imported.id },
    });
    const job = await waitForCompletedJob(app, response.json<{ jobId: string }>().jobId);

    expect(job.status).toBe('completed');
    expect(analyzedHashes).toEqual(['same-hash']);
    await app.close();
  });

  it('completes a comparison with a side-specific warning when passive analysis fails', async () => {
    const analyzedHashes: string[] = [];
    const imports = new ImportService({ computeBaseline: async () => makeSnap('comparison-hash') });
    const workspaces = new WorkspaceStore({
      applyGearSwap: async () => {
        throw new Error('unused');
      },
    });
    const app = await createApp({
      imports,
      workspaces,
      passives: passiveService(analyzedHashes, true),
    });
    const imported = await imports.importBuildXml('<PathOfBuilding><Build/></PathOfBuilding>');

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: { importAId: imported.id },
    });
    const job = await waitForCompletedJob(app, response.json<{ jobId: string }>().jobId);

    expect(job.status).toBe('completed');
    expect((job.result?.passiveWarnings as { a?: string }).a).toContain('tree catalog unavailable');
    expect(job.result?.workspace).toBeDefined();
    await app.close();
  });
});
