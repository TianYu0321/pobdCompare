import { describe, expect, it } from 'vitest';

import type { BaselineSnapshot } from '@pobd/schemas';

import { createApp } from './app';
import { ImportService } from './services/import-service';
import { WorkspaceStore } from './workspaces/workspace-store';

const baseline: BaselineSnapshot = {
  id: 'baseline',
  baselineHash: 'hash',
  source: 'build_file',
  buildXml: '<PathOfBuilding/>',
  buildXmlCanonicalHash: 'xml',
  pob2Version: '1',
  pob2DataVersion: '1',
  gameVersion: 'poe2',
  character: { name: 'Tester' },
  mainSkillSelection: {
    selectedSkillNumber: 1,
    selectedSkillName: 'Skill',
    selectionMode: 'auto_single',
    candidates: [],
    warnings: [],
  },
  skillNumber: 1,
  weaponSet: 1,
  config: {},
  calcsOutput: { CombinedDPS: 100 },
  rawBreakdown: {},
  skillDpsList: [{ skillNumber: 1, name: 'Skill', dps: 100, enabled: true }],
  skillGroups: [],
  items: [],
  passiveNodes: [],
  ascendNodes: [],
  jewels: [],
  createdAt: 1,
};

describe('local API', () => {
  it('imports XML asynchronously and exposes the completed job', async () => {
    const imports = new ImportService({
      computeBaseline: async () => baseline,
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
});
