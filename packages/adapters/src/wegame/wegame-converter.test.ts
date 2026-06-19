import { describe, expect, it } from 'vitest';

import { MappingCatalog } from './mapping-catalog';
import { convertWeGameToCanonical } from './wegame-converter';

function catalog(): MappingCatalog {
  return new MappingCatalog({
    hash: 'catalog-hash',
    baseNames: new Map([['紫晶戒指', 'Amethyst Ring']]),
    uniqueNames: new Map(),
    assetNames: new Map([
      ['2DItems/Rings/Basetypes/AmethystRing', 'Amethyst Ring'],
    ]),
    skillAssets: new Map([
      ['2DArt/SkillIcons/HuntressIceSpear', {
        name: 'Spear Throw',
        gameId: 'Metadata/Items/Gem/SkillGemPlayerDefaultSpearThrow',
      }],
    ]),
    modTemplates: new Map([
      ['implicit.stat_2923486259', {
        id: 'implicit.stat_2923486259',
        englishTemplate: '+#% to Chaos Resistance',
        chineseTemplate: '混沌抗性 +#%',
      }],
    ]),
    jewelBases: new Map([
      ['Metadata/Items/Jewels/JewelDex', 'Emerald'],
    ]),
    jewelMods: new Map([
      ['JewelAttackSpeed', {
        id: 'JewelAttackSpeed',
        englishTemplate: '(2-4)% increased Attack Speed',
        chineseTemplate: '',
      }],
    ]),
    jewelSocketEffects: new Map([
      ['JewelDiamond:1500:1860', {
        radiusLabel: 'Variable',
        modLines: [
          'Only affects Passives in Medium-Large Ring',
          'Passives in Radius can be Allocated without being connected to your tree',
        ],
      }],
    ]),
    passiveNodeIds: new Set([722]),
  } as any);
}

describe('convertWeGameToCanonical', () => {
  it('creates PoB account-import shaped data only from exact mappings', () => {
    const result = convertWeGameToCanonical({
      roleInfo: {
        name: 'Tester',
        level: 90,
        class_id: 0,
        class_name: 'Martial Artist',
        league_id: 'league',
      },
      equipments: [{
        id: 'item-1',
        inventoryId: 'Ring',
        frameType: 2,
        name: '',
        baseType: '紫晶戒指',
        typeLine: '紫晶戒指',
        icon: assetUrl('2DItems/Rings/Basetypes/AmethystRing'),
        ilvl: 80,
        properties: [],
        requirements: [{ type: 62, name: '等级', values: [['56', 0]] }],
        implicitMods: ['[Resistances|混沌抗性] +12%'],
        explicitMods: [],
      }],
      skills: [{
        id: 'skill-1',
        typeLine: '战矛飞掷',
        gemSkill: assetUrl('2DArt/SkillIcons/HuntressIceSpear'),
        properties: [{ type: 5, name: '等级', values: [['20', 0]] }],
        socketedItems: [],
      }],
      talentTree: {
        hashes: [722],
        specialisations: { set1: [] },
        skill_overrides: {},
        jewel_data: {},
        quest_stats: [],
      },
      jewels: [],
      roleKeyData: { skills: [{ name: 'player_ranged_spear', total_dps: '99999' }] },
    }, catalog());

    expect(result.report.status).toBe('complete');
    expect(result.character.equipment[0]).toMatchObject({
      typeLine: 'Amethyst Ring',
      implicitMods: ['+12% to Chaos Resistance'],
      inventoryId: 'Ring',
    });
    expect(result.character.skills[0]).toMatchObject({
      typeLine: 'Spear Throw',
    });
    expect(result.character.passives.hashes).toEqual([722]);
    expect(result.character.class).toBe('Martial Artist');
    expect(result.character.mainSkillHint).toBe('Spear Throw');
    expect(result.character).not.toHaveProperty('dps');
  });

  it('blocks conversion when any calculation-relevant field is unknown', () => {
    const result = convertWeGameToCanonical({
      roleInfo: {
        name: 'Tester',
        level: 90,
        class_id: 0,
        class_name: 'Martial Artist',
        league_id: 'league',
      },
      equipments: [{
        id: 'item-1',
        inventoryId: 'Ring',
        frameType: 2,
        name: '',
        baseType: '未知戒指',
        typeLine: '未知戒指',
        explicitMods: ['未知词条 +10%'],
      }],
      skills: [],
      talentTree: { hashes: [999] },
      jewels: [],
      roleKeyData: {},
    }, catalog());

    expect(result.report.status).toBe('blocked');
    expect(result.report.blockers.map((blocker) => blocker.code)).toEqual([
      'unknown_item',
      'unknown_passive',
    ]);
    expect(result.character.equipment).toEqual([]);
  });
  it('does not treat unequipped Chakra runes as equipped items', () => {
    const result = convertWeGameToCanonical({
      roleInfo: {
        name: 'Tester',
        level: 90,
        class_id: 0,
        class_name: 'Martial Artist',
        league_id: 'league',
      },
      equipments: [{
        id: 'rune-1',
        inventoryId: 'Chakra',
        frameType: 0,
        baseType: '未映射符文',
        typeLine: '未映射符文',
      }],
      skills: [],
      talentTree: { hashes: [722] },
      jewels: [],
      roleKeyData: {},
    }, catalog());

    expect(result.report.status).toBe('complete');
    expect(result.report.itemTotal).toBe(0);
    expect(result.character.equipment).toEqual([]);
  });

  it('converts WeGame jewel wrappers into PoB2 PassiveJewels items', () => {
    const result = convertWeGameToCanonical({
      roleInfo: {
        name: 'Tester',
        level: 90,
        class_id: 0,
        class_name: 'Martial Artist',
        league_id: 'league',
      },
      equipments: [],
      skills: [],
      talentTree: {
        hashes: [722],
        jewel_data: {
          4: { type: 'JewelDiamond', radiusMin: 1500, radius: 1860 },
        },
      },
      jewels: {
        jewel_data: JSON.stringify([{
          socket_id: 'jewel_slot1960',
          jewel: {
            id: 'Metadata/Items/Jewels/JewelDex',
            display_name: 'Rare Emerald',
            name: '翡翠',
            rarity: 2,
            mod_values: [{ type: 1, id: 'JewelAttackSpeed', values: [3] }],
          },
        }]),
      },
      roleKeyData: {},
    }, catalog());

    expect(result.report.status).toBe('complete');
    expect(result.character.jewels).toEqual([{
      id: 'jewel_slot1960',
      inventoryId: 'PassiveJewels',
      x: 4,
      frameType: 2,
      name: 'Rare Emerald',
      typeLine: 'Emerald',
      baseType: 'Emerald',
      ilvl: 1,
      properties: [{ name: 'Radius', values: [['Variable', 0]] }],
      explicitMods: [
        '3% increased Attack Speed',
        'Only affects Passives in Medium-Large Ring',
        'Passives in Radius can be Allocated without being connected to your tree',
      ],
    }]);
  });
});

function assetUrl(path: string): string {
  const encoded = Buffer.from(JSON.stringify([25, 14, { f: path }])).toString('base64url');
  return `https://poecdn.game.qq.com/gen/image/${encoded}/hash/icon.png`;
}
