import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { detectPoB2Installation } from './environment';
import { Pob2WorkerPool } from './worker-pool';

const runIntegration = process.env.POB2_INTEGRATION === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('gear_swap rawText authority', () => {
  let pool: Pob2WorkerPool | undefined;

  afterAll(() => pool?.shutdown());

  it('swapped item in variant XML is the source rawText item, not a target same-ID item', async () => {
    const installation = await detectPoB2Installation();
    pool = new Pob2WorkerPool({
      pythonPath: process.env.PYTHON_PATH ?? 'python',
      driverPath: path.resolve('packages/pob2-worker/python/driver.py'),
      pobRoot: installation.root,
      maxWorkers: 1,
      requestTimeoutMs: 120_000,
      maxRetries: 0,
    });

    // Step 1: Use the proven WeGame import flow to create a build with a Ring 1 item.
    // This guarantees PoB2 loads the XML correctly (proven by the convert-wegame test).
    const convertResponse = await pool!.submit({
      operation: 'convert_wegame',
      catalogHash: 'integration-catalog',
      character: {
        name: 'GearSwap Test',
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
    expect(convertResponse.success).toBe(true);
    expect(convertResponse.variantXml).toBeDefined();
    const targetBuildXml = convertResponse.variantXml!;

    // Step 2: Run a baseline to get item info
    const baselineResponse = await pool!.submit({
      buildXml: targetBuildXml,
      skillNumber: 1,
      weaponSet: 1,
      config: {},
    });
    expect(baselineResponse.success).toBe(true);
    const originalRingSlot = baselineResponse.itemSlots?.find(
      (slot) => slot.slotName === 'Ring 1',
    );
    expect(originalRingSlot).toBeDefined();
    const targetRingItemId = originalRingSlot!.itemId;

    // Step 3: Submit a gear swap mutation replacing Ring 1 with a different item
    // via rawText only. The source raw text will create a fresh item in PoB2 memory
    // with a NEW itemId (different from targetRingItemId).
    const sourceRaw = `Rarity: Rare
Source Mana Ring
Amethyst Ring
Item Level: 99
Quality: 20
Sockets: 
Implicits: 0
{crafted}+30 to maximum Mana`;

    const swapResponse = await pool!.submit({
      buildXml: targetBuildXml,
      skillNumber: 1,
      weaponSet: 1,
      config: {},
      mutation: {
        mutationId: 'integration-swap-ring',
        type: 'item_swap',
        baselineHash: 'integration-baseline',
        payload: {
          slotName: 'Ring 1',
          itemRaw: sourceRaw,
        },
        source: 'target_bd_import',
      },
    });

    // Must succeed
    if (!swapResponse.success) {
      console.error('Gear swap failed, error:', swapResponse.error);
    }
    expect(swapResponse.success).toBe(true);
    expect(swapResponse.variantXml).toBeDefined();

    // Step 4: Verify the variant XML contains the source item, not the target one
    const variantXml = swapResponse.variantXml!;
    expect(variantXml).toContain('Source Mana Ring');

    // Step 5: Run a baseline on the variant XML to verify the active ItemSet's
    // Ring 1 slot selects the newly created Source Mana Ring item via the
    // authoritative PoB2 worker slot iteration.
    const variantBaseline = await pool!.submit({
      buildXml: variantXml,
      skillNumber: 1,
      weaponSet: 1,
      config: {},
    });
    expect(variantBaseline.success).toBe(true);

    const ringSlot = variantBaseline.itemSlots?.find(
      (slot) => slot.slotName === 'Ring 1',
    );
    expect(ringSlot).toBeDefined();
    expect(ringSlot!.name).toContain('Source Mana Ring');

    // The swapped item's itemId must NOT equal the original target ring's itemId
    // (it's a fresh item created from rawText)
    expect(ringSlot!.itemId).not.toBe(targetRingItemId);
  });
});


