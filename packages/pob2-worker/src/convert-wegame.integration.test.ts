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

    // Assert real MaximumHitTaken keys are present in calcsOutput
    expect(response.calcsOutput).toBeDefined();
    const co = response.calcsOutput!;
    expect(co.PhysicalMaximumHitTaken).toBeDefined();
    expect(typeof co.PhysicalMaximumHitTaken).toBe('number');
    expect(Number.isFinite(co.PhysicalMaximumHitTaken)).toBe(true);

    expect(co.FireMaximumHitTaken).toBeDefined();
    expect(typeof co.FireMaximumHitTaken).toBe('number');
    expect(Number.isFinite(co.FireMaximumHitTaken)).toBe(true);

    expect(co.ColdMaximumHitTaken).toBeDefined();
    expect(typeof co.ColdMaximumHitTaken).toBe('number');
    expect(Number.isFinite(co.ColdMaximumHitTaken)).toBe(true);

    expect(co.LightningMaximumHitTaken).toBeDefined();
    expect(typeof co.LightningMaximumHitTaken).toBe('number');
    expect(Number.isFinite(co.LightningMaximumHitTaken)).toBe(true);

    expect(co.ChaosMaximumHitTaken).toBeDefined();
    expect(typeof co.ChaosMaximumHitTaken).toBe('number');
    expect(Number.isFinite(co.ChaosMaximumHitTaken)).toBe(true);

    // Validate derived ElementalMaximumHitTaken as min of finite positive fire/cold/lightning
    const elements = [co.FireMaximumHitTaken, co.ColdMaximumHitTaken, co.LightningMaximumHitTaken]
      .filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    const coElemental = co.ElementalMaximumHitTaken;
    if (elements.length === 3) {
      const expectedElemental = Math.min(...elements);
      if (coElemental !== undefined) {
        expect(coElemental).toBe(expectedElemental);
      }
    }

    // Verify defence keys are present
    const defenceKeys = ['EnergyShield', 'Evasion', 'BlockChance', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist', 'TotalEHP'];
    for (const key of defenceKeys) {
      expect(co[key]).toBeDefined();
      expect(typeof co[key]).toBe('number');
    }
  });
});
