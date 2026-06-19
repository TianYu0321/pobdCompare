import { describe, expect, it } from 'vitest';

import type { BaselineSnapshot, NormalizedBuild, SimulationResult } from '@pobd/schemas';

import { createApp } from './app';
import { ImportService } from './services/import-service';
import { JobRegistry } from './jobs/job-registry';
import { WorkspaceStore } from './workspaces/workspace-store';

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
      payload: { side: 'a', candidateId: 'b:Weapon 1:2', targetSlotName: 'Weapon 1' },
    });
    expect(swapResp.statusCode).toBe(202);
    const { jobId } = swapResp.json<{ jobId: string }>();

    // Poll until done
    for (let i = 0; i < 20; i++) {
      const jobResp = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
      const job = jobResp.json<{ status: string; result?: unknown }>();
      if (job.status === 'completed') {
        const outcome = job.result as Record<string, unknown>;
        expect(outcome.applied).toBe(true);
        expect(outcome.workspace).toBeDefined();
        const wsResult = outcome.workspace as Record<string, unknown>;
        expect(wsResult.diff).toBeDefined();
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    await app.close();
  });
});
