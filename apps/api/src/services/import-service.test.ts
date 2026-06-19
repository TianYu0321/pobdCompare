import { describe, expect, it } from 'vitest';

import type { BaselineSnapshot } from '@pobd/schemas';

import { ImportService } from './import-service';

function baseline(): BaselineSnapshot {
  return {
    id: 'baseline-1',
    baselineHash: 'hash-1',
    source: 'build_file',
    buildXml: '<PathOfBuilding/>',
    buildXmlCanonicalHash: 'xml-hash',
    pob2Version: '0.21.0',
    pob2DataVersion: '0.21.0',
    gameVersion: 'poe2',
    character: { name: 'Tester', level: 80, className: 'Warrior' },
    mainSkillSelection: {
      selectedSkillNumber: 1,
      selectedSkillName: 'Hammer',
      selectionMode: 'auto_single',
      candidates: [],
      warnings: [],
    },
    skillNumber: 1,
    weaponSet: 1,
    config: {},
    calcsOutput: { CombinedDPS: 1234, Life: 2000 },
    rawBreakdown: {},
    skillDpsList: [{ skillNumber: 1, name: 'Hammer', dps: 1234, enabled: true }],
    skillGroups: [{ groupId: 1, label: 'Hammer', skills: ['Hammer', 'Brutality'] }],
    items: [{ slotName: 'Weapon 1', itemId: 1, name: 'Maul', baseType: 'Two Hand Mace' }],
    passiveNodes: [1, 2],
    ascendNodes: [],
    jewels: [],
    createdAt: 1,
  };
}

describe('ImportService', () => {
  it('only marks a build file calculable after baseline computation', async () => {
    const service = new ImportService({
      computeBaseline: async () => baseline(),
    });

    const result = await service.importBuildXml(
      '<PathOfBuilding><Build characterName="Tester"/></PathOfBuilding>',
    );

    expect(result.status).toBe('calculable');
    expect(result.baseline?.baselineHash).toBe('hash-1');
    expect(result.normalizedBuild?.skillDps[0]?.dps).toBe(1234);
    expect(service.get(result.id)?.buildXml).toContain('PathOfBuilding');
  });
});
