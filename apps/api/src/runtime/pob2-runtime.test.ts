import { describe, expect, it } from 'vitest';

import type { BaselineSnapshot, BuildMutation } from '@pobd/schemas';

import { Pob2Runtime } from './pob2-runtime';

function baseline(): BaselineSnapshot {
  return {
    id: 'base',
    baselineHash: 'base-hash',
    source: 'build_file',
    buildXml: '<PathOfBuilding/>',
    buildXmlCanonicalHash: 'xml-hash',
    pob2Version: '1',
    pob2DataVersion: '1',
    gameVersion: 'poe2',
    character: {},
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
    skillDpsList: [],
    skillGroups: [],
    items: [],
    passiveNodes: [],
    ascendNodes: [],
    jewels: [],
    createdAt: 1,
  };
}

const mutation: BuildMutation = {
  mutationId: 'swap-1',
  type: 'item_swap',
  baselineHash: 'base-hash',
  payload: {
    slotName: 'Weapon 1',
    itemRaw: 'Rarity: Rare\nTest Weapon\nMace',
  },
  source: 'candidate_list',
};

describe('Pob2Runtime.applyGearSwap', () => {
  it('returns invalid_variant when PoB2 succeeds without variant XML', async () => {
    const runtime = new Pob2Runtime();
    const internals = runtime as unknown as {
      manager: object;
      pool: {
        submit: () => Promise<{
          success: true;
          calcsOutput: Record<string, unknown>;
          breakdown: Record<string, unknown>;
        }>;
      };
    };
    internals.manager = {};
    internals.pool = {
      submit: async () => ({
        success: true,
        calcsOutput: { CombinedDPS: 150 },
        breakdown: {},
      }),
    };

    const result = await runtime.applyGearSwap({
      baseline: baseline(),
      currentBuildXml: '<PathOfBuilding current="1"/>',
      mutation,
    });

    expect(result.buildXml).toBe('<PathOfBuilding current="1"/>');
    expect(result.snapshot.baselineHash).toBe('base-hash');
    expect(result.result.resultKind).toBe('invalid_variant');
    expect(result.result.errorCode).toBe('variant_xml_missing');
  });
});
