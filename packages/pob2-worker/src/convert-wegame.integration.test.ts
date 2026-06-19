import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { detectPoB2Installation } from './environment';
import { Pob2WorkerPool } from './worker-pool';

const runIntegration = process.env.POB2_INTEGRATION === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('convert_wegame native bridge', () => {
  let pool: Pob2WorkerPool | undefined;

  afterAll(() => pool?.shutdown());

  it('imports canonical account data, saves XML and reloads it', async () => {
    const installation = await detectPoB2Installation();
    pool = new Pob2WorkerPool({
      pythonPath: process.env.PYTHON_PATH ?? 'python',
      driverPath: path.resolve('packages/pob2-worker/python/driver.py'),
      pobRoot: installation.root,
      maxWorkers: 1,
      requestTimeoutMs: 60_000,
      maxRetries: 0,
    });

    const response = await pool.submit({
      operation: 'convert_wegame',
      catalogHash: 'integration-catalog',
      character: {
        name: 'WeGame Integration',
        level: 10,
        class: 'Huntress',
        league: 'Standard',
        equipment: [],
        skills: [],
        jewels: [],
        passives: {
          hashes: [],
          specialisations: {},
          skill_overrides: {},
          jewel_data: {},
          quest_stats: [],
        },
      },
    });

    expect(response.success).toBe(true);
    expect(response.variantXml).toContain('<PathOfBuilding');
    expect(response.pobValidation).toMatchObject({
      roundTripValid: true,
      baselineValid: true,
    });
  });
});
