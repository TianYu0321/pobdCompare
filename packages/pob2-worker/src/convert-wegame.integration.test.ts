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
        equipment: [{
          inventoryId: 'Ring',
          frameType: 0,
          name: '',
          typeLine: 'Amethyst Ring',
          baseType: 'Amethyst Ring',
          ilvl: 1,
          properties: [],
          requirements: [],
          implicitMods: [],
          explicitMods: [],
        }],
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
    expect(response.roundTrip).toMatchObject({
      expectedEquipment: 1,
      selectedItems: 1,
    });

    // Assert real MaximumHitTaken keys are present in calcsOutput
    expect(response.calcsOutput).toBeDefined();
    const co = response.calcsOutput!;
    const mhtKeys = ['PhysicalMaximumHitTaken', 'FireMaximumHitTaken', 'ColdMaximumHitTaken', 'LightningMaximumHitTaken', 'ChaosMaximumHitTaken'] as const;
    for (const key of mhtKeys) {
      expect(co[key]).toBeDefined();
      expect(typeof co[key]).toBe('number');
      expect(Number.isFinite(co[key])).toBe(true);
      // PoB2 should supply positive values even for an empty level-10 character
      expect(co[key]).toBeGreaterThan(0);
    }

    // ElementalMaximumHitTaken must equal min(FireMaximumHitTaken, ColdMaximumHitTaken, LightningMaximumHitTaken)
    expect(co.ElementalMaximumHitTaken).toBeDefined();
    expect(typeof co.ElementalMaximumHitTaken).toBe('number');
    expect(Number.isFinite(co.ElementalMaximumHitTaken)).toBe(true);
    expect(co.ElementalMaximumHitTaken).toBeGreaterThan(0);
    const fire = co.FireMaximumHitTaken;
    const cold = co.ColdMaximumHitTaken;
    const lightning = co.LightningMaximumHitTaken;
    expect(typeof fire).toBe('number');
    expect(typeof cold).toBe('number');
    expect(typeof lightning).toBe('number');
    const expectedElemental = Math.min(fire as number, cold as number, lightning as number);
    expect(co.ElementalMaximumHitTaken).toBe(expectedElemental);

    // Verify defence keys are present and finite
    const defenceKeys = ['EnergyShield', 'Evasion', 'BlockChance', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist', 'TotalEHP'] as const;
    for (const key of defenceKeys) {
      expect(co[key]).toBeDefined();
      expect(typeof co[key]).toBe('number');
      expect(Number.isFinite(co[key])).toBe(true);
    }

    const baselineResponse = await pool.submit({
      buildXml: response.variantXml!,
      skillNumber: response.selectedSkillNumber ?? 1,
      weaponSet: 1,
      config: {},
    });
    expect(baselineResponse.success).toBe(true);
    expect(baselineResponse.itemSlots).toEqual([
      expect.objectContaining({
        slotName: 'Ring 1',
        itemId: expect.any(Number),
      }),
    ]);
    expect(baselineResponse.itemSlots?.every((item) => item.itemId > 0)).toBe(true);
  });
});
