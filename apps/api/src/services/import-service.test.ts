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

  it('uses the selected PoB2 skill name and CombinedDPS when group labels and list DPS are empty', async () => {
    const computed = baseline();
    computed.calcsOutput.CombinedDPS = 38.4;
    computed.skillDpsList = [
      { skillNumber: 1, name: 'Hollow Focus', dps: 0, enabled: true },
    ];
    computed.skillGroups = [
      { groupId: 1, label: '', skills: ['HollowFocusPlayer', 'SupportMaimPlayer'] },
    ];
    computed.mainSkillSelection = {
      selectedSkillNumber: 1,
      selectedSkillName: 'Hollow Focus',
      selectionMode: 'auto_highest_dps',
      candidates: [],
      warnings: [],
    };
    const service = new ImportService({
      computeBaseline: async () => computed,
    });

    const result = await service.importBuildXml(
      '<PathOfBuilding><Build characterName="Tester"/></PathOfBuilding>',
    );

    expect(result.normalizedBuild?.skills[0]?.name).toBe('Hollow Focus');
    expect(result.normalizedBuild?.skillDps[0]).toMatchObject({
      skillName: 'Hollow Focus',
      dps: 38.4,
    });
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

  it('backfills rawText for WeGame baseline items from PoB2 SaveDB XML', async () => {
    const catalog = new MappingCatalog({
      hash: 'catalog',
      baseNames: new Map([['紫晶戒指', 'Amethyst Ring']]),
      uniqueNames: new Map(),
      assetNames: new Map([['2DItems/Rings/Basetypes/AmethystRing', 'Amethyst Ring']]),
      skillAssets: new Map(),
      modTemplates: new Map(),
      passiveNodeIds: new Set([722]),
    });
    const beforeBaseline = baseline();
    beforeBaseline.source = 'wegame';
    beforeBaseline.items = [
      { slotName: 'Ring 1', itemId: 5, name: 'Amethyst Ring', baseType: 'Amethyst Ring' },
      { slotName: 'Weapon 1', itemId: 1, name: 'Maul', baseType: 'Two Hand Mace' },
    ];
    const saveDbXml = `<PathOfBuilding>
      <Items>
        <Item id="5">
Rarity: Rare
Amethyst Ring
Ring
ImplicitMods</Item>
        <Item id="1">
Rarity: Rare
Maul
Two Hand Mace</Item>
        <ItemSet id="1">
          <Slot name="Ring 1" itemId="5"/>
          <Slot name="Weapon 1" itemId="1"/>
        </ItemSet>
      </Items>
    </PathOfBuilding>`;

    const service = new ImportService({
      computeBaseline: async () => beforeBaseline,
      getWeGameCatalog: async () => catalog,
      convertWeGame: async () => ({
        buildXml: saveDbXml,
        baseline: beforeBaseline,
        validation: { roundTripValid: true, baselineValid: true, mainSkillValid: true },
      }),
    }, {
      wegameAdapter: fakeWeGameAdapter({
        equipments: [{
          inventoryId: 'Ring',
          baseType: '紫晶戒指',
          typeLine: '紫晶戒指',
          icon: assetUrl('2DItems/Rings/Basetypes/AmethystRing'),
        }],
      }),
    });

    const result = await service.importUrl('https://www.wegame.com.cn/share/test');
    expect(result.status).toBe('calculable');
    expect(result.baseline?.items).toBeDefined();
    const ringItem = result.baseline!.items.find((item) => item.slotName === 'Ring 1');
    expect(ringItem).toBeDefined();
    expect(ringItem!.rawText).toContain('Amethyst Ring');
    expect(ringItem!.rawText).toContain('ImplicitMods');
    expect(ringItem!.itemId).toBe(5);
    const weaponItem = result.baseline!.items.find((item) => item.slotName === 'Weapon 1');
    expect(weaponItem).toBeDefined();
    expect(weaponItem!.rawText).toContain('Maul');
  });

  it('marks WeGame calculable only after native PoB2 round-trip validation', async () => {
    const skillAsset = '2DItems/SkillIcons/SpearThrow';
    const mappedCatalog = new MappingCatalog({
      hash: 'catalog',
      baseNames: new Map(),
      uniqueNames: new Map(),
      assetNames: new Map([['2DItems/Rings/Basetypes/AmethystRing', 'Amethyst Ring']]),
      skillAssets: new Map([[
        skillAsset,
        {
          name: 'Spear Throw',
          gameId: 'player_ranged_spear',
          grantedEffectId: 'SpearThrowPlayer',
        },
      ]]),
      modTemplates: new Map(),
      passiveNodeIds: new Set([722]),
    });
    const convertedBaseline = {
      ...baseline(),
      source: 'wegame' as const,
      mainSkillSelection: {
        selectedSkillNumber: 1,
        selectedSkillName: 'Spear Throw',
        selectionMode: 'auto_single' as const,
        candidates: [],
        warnings: [],
      },
      skillDpsList: [{
        skillNumber: 1,
        name: 'Spear Throw',
        dps: 7,
        enabled: true,
      }],
      skillGroups: [],
    };
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
        skills: [{
          id: 'player_ranged_spear',
          inventoryId: 'Skill 1',
          typeLine: '投矛',
          gemSkill: assetUrl(skillAsset),
          socketedItems: [],
        }],
      }),
    });

    const result = await service.importUrl('https://www.wegame.com.cn/share/test');

    expect(result.status).toBe('calculable');
    expect(result.conversionReport.pobValidation?.roundTripValid).toBe(true);
    expect(result.normalizedBuild?.skills).toEqual([
      expect.objectContaining({
        id: '1',
        name: 'Spear Throw',
      }),
    ]);
    expect(result.normalizedBuild?.skillDps).toEqual([
      expect.objectContaining({
        skillId: '1',
        skillName: 'Spear Throw',
        dps: 1234,
        source: 'pob',
      }),
    ]);
    expect(service.get(result.id)?.buildXml).toBe('<PathOfBuilding2/>');
  });

  it('preserves WeGame localized display metadata over PoB2 round-trip names', async () => {
    const catalog = new MappingCatalog({
      hash: 'catalog',
      baseNames: new Map([
        ['剑', 'Sword'],
        ['盾', 'Shield'],
        ['锤', 'Mace'],
        ['斧', 'Axe'],
        ['紫晶戒指', 'Amethyst Ring'],
        ['重革腰带', 'Heavy Belt'],
      ]),
      uniqueNames: new Map(),
      assetNames: new Map(),
      skillAssets: new Map(),
      modTemplates: new Map([
        ['implicit.1', { id: 'implicit.1', englishTemplate: '+#% to Cold Resistance', chineseTemplate: '+#% 冰冷抗性' }],
        ['explicit.1', { id: 'explicit.1', englishTemplate: '+# to maximum Life', chineseTemplate: '+# 最大生命' }],
        ['explicit.2', { id: 'explicit.2', englishTemplate: '+#% to Fire Resistance', chineseTemplate: '+#% 火焰抗性' }],
      ]),
      passiveNodeIds: new Set([722]),
    });

    const beforeBaseline: BaselineSnapshot = {
      ...baseline(),
      source: 'wegame',
      items: [
        { slotName: 'Weapon 1', itemId: 1, name: 'Sword', baseType: 'Sword' },
        { slotName: 'Weapon 2', itemId: 2, name: 'Shield', baseType: 'Shield' },
        { slotName: 'Weapon 1 Swap', itemId: 3, name: 'Mace', baseType: 'Mace' },
        { slotName: 'Weapon 2 Swap', itemId: 4, name: 'Axe', baseType: 'Axe' },
        { slotName: 'Ring 1', itemId: 10, name: 'Amethyst Ring', baseType: 'Amethyst Ring' },
        { slotName: 'Belt', itemId: 20, name: 'Heavy Belt', baseType: 'Heavy Belt' },
        { slotName: 'Amulet', itemId: 30, name: 'Amber Amulet', baseType: 'Amber Amulet' },
      ],
    };

    const service = new ImportService({
      computeBaseline: async () => beforeBaseline,
      getWeGameCatalog: async () => catalog,
      convertWeGame: async () => ({
        buildXml: '<PathOfBuilding2/>',
        baseline: beforeBaseline,
        validation: { roundTripValid: true, baselineValid: true, mainSkillValid: true },
      }),
    }, {
      wegameAdapter: fakeWeGameAdapter({
        equipments: [
          { inventoryId: 'Weapon', name: '剑', baseType: '剑', typeLine: '剑' },
          { inventoryId: 'Offhand', name: '盾', baseType: '盾', typeLine: '盾' },
          { inventoryId: 'Weapon2', name: '锤', baseType: '锤', typeLine: '锤' },
          { inventoryId: 'Offhand2', name: '斧', baseType: '斧', typeLine: '斧' },
          {
            inventoryId: 'Ring', name: '紫晶戒指', baseType: '紫晶戒指', typeLine: '紫晶戒指',
            icon: assetUrl('2DItems/Rings/Basetypes/AmethystRing'),
            rarity: '稀有', ilvl: 86,
            explicitMods: ['+30 最大生命', '+25% 火焰抗性'],
            implicitMods: ['+20% 冰冷抗性'],
            properties: [{ name: 'Energy Shield', values: [['30', 0]] }],
            requirements: [{ name: 'Level', values: [['80', 0]] }],
            socketedItems: [{ typeLine: 'Added Lightning Damage', support: true }],
          },
          { inventoryId: 'Belt', name: '   ', baseType: '重革腰带', typeLine: '   ' },
        ],
      }),
    });

    const result = await service.importUrl('https://www.wegame.com.cn/share/test');
    const equip = (slotName: string) =>
      result.normalizedBuild!.equipments.find(e => e.slotName === slotName)!;

    // 1. Exact weapon mapping (authoritative PoB2 ImportTab.lua:1149)
    expect(equip('Weapon 1').item!.name).toBe('剑');
    expect(equip('Weapon 2').item!.name).toBe('盾');
    expect(equip('Weapon 1 Swap').item!.name).toBe('锤');
    expect(equip('Weapon 2 Swap').item!.name).toBe('斧');

    // 2. Full display metadata (Chinese) survives with mods/props/sockets/ilvl
    const ring = equip('Ring 1').item!;
    expect(ring.name).toBe('紫晶戒指');
    expect(ring.baseType).toBe('紫晶戒指');
    expect(ring.icon).toBe(assetUrl('2DItems/Rings/Basetypes/AmethystRing'));
    expect(ring.rarity).toBe('稀有');
    expect(ring.ilvl).toBe(86);
    expect(ring.explicitMods).toEqual(['+30 最大生命', '+25% 火焰抗性']);
    expect(ring.implicitMods).toEqual(['+20% 冰冷抗性']);
    expect(ring.properties).toEqual([{ name: 'Energy Shield', values: [['30', 0]] }]);
    expect(ring.requirements).toEqual([{ name: 'Level', values: [['80', 0]] }]);
    expect(ring.socketedItems).toEqual([{ typeLine: 'Added Lightning Damage', support: true }]);
    expect(ring.inventoryId).toBe('Ring');
    expect(ring.id).toBe('10');

    // 3. Empty/whitespace WeGame name falls back to PoB2
    expect(equip('Belt').item!.name).toBe('Heavy Belt');

    // 4. No matching display slot → PoB2 unchanged
    expect(equip('Amulet').item!.name).toBe('Amber Amulet');
    expect(equip('Amulet').item!.baseType).toBe('Amber Amulet');

    // 5. Native baseline object unchanged
    expect(result.baseline).toBe(beforeBaseline);
  });

  it('maps Transcendent Limb display names into Arm 1/Leg 1 slots from IncursionArmRight/IncursionLegRight', async () => {
    const catalog = new MappingCatalog({
      hash: 'catalog',
      baseNames: new Map([
        ['闪避之腿', 'Evasive Leg'],
        ['偏转之臂', 'Deflective Arm'],
      ]),
      uniqueNames: new Map(),
      assetNames: new Map(),
      skillAssets: new Map(),
      modTemplates: new Map(),
      passiveNodeIds: new Set([722]),
    });

    const beforeBaseline: BaselineSnapshot = {
      ...baseline(),
      source: 'wegame',
      items: [
        { slotName: 'Arm 1', itemId: 1, name: 'Deflective Arm', baseType: 'Deflective Arm' },
        { slotName: 'Leg 1', itemId: 2, name: 'Evasive Leg', baseType: 'Evasive Leg' },
      ],
    };

    const service = new ImportService({
      computeBaseline: async () => beforeBaseline,
      getWeGameCatalog: async () => catalog,
      convertWeGame: async () => ({
        buildXml: '<PathOfBuilding2/>',
        baseline: beforeBaseline,
        validation: { roundTripValid: true, baselineValid: true, mainSkillValid: true },
      }),
    }, {
      wegameAdapter: fakeWeGameAdapter({
        equipments: [
          {
            inventoryId: 'IncursionArmRight',
            name: '偏转之臂',
            baseType: '偏转之臂',
            typeLine: '偏转之臂',
            rarity: '传奇',
            ilvl: 86,
          },
          {
            inventoryId: 'IncursionLegRight',
            name: '闪避之腿',
            baseType: '闪避之腿',
            typeLine: '闪避之腿',
            rarity: '传奇',
            ilvl: 86,
          },
        ],
      }),
    });

    const result = await service.importUrl('https://www.wegame.com.cn/share/test');

    const arm = result.normalizedBuild!.equipments.find(e => e.slotName === 'Arm 1')!;
    expect(arm.item!.name).toBe('偏转之臂');
    expect(arm.item!.baseType).toBe('偏转之臂');

    const leg = result.normalizedBuild!.equipments.find(e => e.slotName === 'Leg 1')!;
    expect(leg.item!.name).toBe('闪避之腿');
    expect(leg.item!.baseType).toBe('闪避之腿');
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
