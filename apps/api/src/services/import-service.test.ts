import { describe, expect, it } from 'vitest';

import type { BaselineSnapshot } from '@pobd/schemas';
import { MappingCatalog } from '@pobd/adapters';

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

  it('keeps a WeGame import normalized and exposes exact blockers', async () => {
    const service = new ImportService({
      computeBaseline: async () => baseline(),
      getWeGameCatalog: async () => new MappingCatalog({
        hash: 'catalog',
        baseNames: new Map(),
        uniqueNames: new Map(),
        assetNames: new Map(),
        skillAssets: new Map(),
        modTemplates: new Map(),
        passiveNodeIds: new Set(),
      }),
      convertWeGame: async () => {
        throw new Error('must not be called while mappings are blocked');
      },
    }, {
      wegameAdapter: fakeWeGameAdapter(),
    });

    const result = await service.importUrl('https://www.wegame.com.cn/share/test');

    expect(result.status).toBe('normalized');
    expect(result.conversionReport.status).toBe('blocked');
    expect(result.conversionReport.blockers[0]?.code).toBe('unknown_item');
  });

  it('marks WeGame calculable only after native PoB2 round-trip validation', async () => {
    const mappedCatalog = new MappingCatalog({
      hash: 'catalog',
      baseNames: new Map(),
      uniqueNames: new Map(),
      assetNames: new Map([['2DItems/Rings/Basetypes/AmethystRing', 'Amethyst Ring']]),
      skillAssets: new Map(),
      modTemplates: new Map(),
      passiveNodeIds: new Set([722]),
    });
    const convertedBaseline = { ...baseline(), source: 'wegame' as const };
    const service = new ImportService({
      computeBaseline: async () => convertedBaseline,
      getWeGameCatalog: async () => mappedCatalog,
      convertWeGame: async () => ({
        buildXml: '<PathOfBuilding2/>',
        baseline: convertedBaseline,
        validation: {
          roundTripValid: true,
          baselineValid: true,
          mainSkillValid: true,
        },
      }),
    }, {
      wegameAdapter: fakeWeGameAdapter({
        equipments: [{
          inventoryId: 'Ring',
          baseType: '紫晶戒指',
          typeLine: '紫晶戒指',
          icon: assetUrl('2DItems/Rings/Basetypes/AmethystRing'),
          properties: [],
          requirements: [],
        }],
      }),
    });

    const result = await service.importUrl('https://www.wegame.com.cn/share/test');

    expect(result.status).toBe('calculable');
    expect(result.conversionReport.pobValidation?.roundTripValid).toBe(true);
    expect(service.get(result.id)?.buildXml).toBe('<PathOfBuilding2/>');
  });

  it('returns catalog_refresh_failed instead of using a stale catalog', async () => {
    const service = new ImportService({
      computeBaseline: async () => baseline(),
      getWeGameCatalog: async () => {
        throw new Error('catalog_refresh_failed: trade snapshot unavailable');
      },
      convertWeGame: async () => {
        throw new Error('must not be called');
      },
    }, {
      wegameAdapter: fakeWeGameAdapter(),
    });

    const result = await service.importUrl('https://www.wegame.com.cn/share/test');

    expect(result.status).toBe('normalized');
    expect(result.conversionReport.blockers[0]).toMatchObject({
      code: 'catalog_refresh_failed',
      category: 'catalog',
    });
  });
});

function fakeWeGameAdapter(overrides: Record<string, unknown> = {}): any {
  return {
    isWeGameLink: (url: string) => url.includes('wegame.com.cn'),
    fetchWeGameBuild: async () => ({
      roleInfo: {
        name: 'Tester',
        level: 90,
        class_id: 0,
        class_name: 'Martial Artist',
        league_id: 'league',
      },
      equipments: [{ inventoryId: 'Ring', baseType: '未知戒指', typeLine: '未知戒指' }],
      skills: [],
      skillsDps: [],
      talentTree: { hashes: [722] },
      panel: {},
      jewels: [],
      roleKeyData: {},
      roleSummary: {},
      raw: {},
      ...overrides,
    }),
  };
}

function assetUrl(path: string): string {
  const encoded = Buffer.from(JSON.stringify([25, 14, { f: path }])).toString('base64url');
  return `https://poecdn.game.qq.com/gen/image/${encoded}/hash/icon.png`;
}
