import { describe, expect, it } from 'vitest';

import {
  MappingCatalog,
  extractAssetPath,
  pairTradeCatalogs,
  type TradeCatalog,
} from './mapping-catalog';

const english: TradeCatalog = {
  result: [
    {
      id: 'accessory',
      label: 'Accessories',
      entries: [
        { type: 'Amethyst Ring' },
        { type: 'Prismatic Ring' },
        { type: 'Prismatic Ring', name: 'The Taming', flags: { unique: true } },
      ],
    },
  ],
};

const chinese: TradeCatalog = {
  result: [
    {
      id: 'accessory',
      label: '配饰',
      entries: [
        { type: '紫晶戒指' },
        { type: '三相戒指' },
        { type: '三相戒指', name: '元素之章', flags: { unique: true } },
      ],
    },
  ],
};

const EVASIVE_LEG_RAW = '[Evasion|闪避值]提高 20%';
const DEFLECTIVE_ARM_RAW = '[Deflect|偏转值]提高 10%';

describe('MappingCatalog', () => {
  it('extracts stable PoE asset paths from CDN image URLs', () => {
    const encoded = Buffer.from(
      JSON.stringify([25, 14, { f: '2DItems/Rings/Basetypes/AmethystRing' }]),
    )
      .toString('base64url');
    expect(extractAssetPath(`https://poecdn.game.qq.com/gen/image/${encoded}/hash/a.png`))
      .toBe('2DItems/Rings/Basetypes/AmethystRing');
  });

  it('pairs localized base and unique names by versioned catalog order', () => {
    const pairs = pairTradeCatalogs(english, chinese);
    expect(pairs.baseNames.get('紫晶戒指')).toBe('Amethyst Ring');
    expect(pairs.uniqueNames.get('元素之章')).toBe('The Taming');
  });

  it('maps exact assets before localized names and never fuzzy matches', () => {
    const catalog = new MappingCatalog({
      hash: 'hash',
      baseNames: new Map([['紫晶戒指', 'Amethyst Ring']]),
      uniqueNames: new Map([['元素之章', 'The Taming']]),
      assetNames: new Map([
        ['2DItems/Rings/Basetypes/AmethystRing', 'Amethyst Ring'],
        ['2DItems/Rings/Uniques/TheTaming', 'The Taming'],
      ]),
      assetItems: new Map([
        ['2DItems/Rings/Uniques/TheTaming', {
          baseType: 'Prismatic Ring',
          name: 'The Taming',
        }],
      ]),
      skillAssets: new Map([
        ['2DArt/SkillIcons/HuntressIceSpear', {
          name: 'Spear Throw',
          gameId: 'Metadata/Items/Gem/SkillGemPlayerDefaultSpearThrow',
        }],
      ]),
      modTemplates: new Map([
        ['explicit.stat_2901986750', {
          id: 'explicit.stat_2901986750',
          englishTemplate: '+#% to all Elemental Resistances',
          chineseTemplate: '所有元素抗性 +#%',
        }],
      ]),
      passiveNodeIds: new Set([722]),
    });

    expect(catalog.mapItem({
      baseType: '紫晶戒指',
      name: '',
      icon: assetUrl('2DItems/Rings/Basetypes/AmethystRing'),
    })).toMatchObject({
      baseType: 'Amethyst Ring',
      strategy: 'exact_asset',
    });
    expect(catalog.mapItem({
      baseType: '涓夌浉鎴掓寚',
      name: '鍏冪礌涔嬬珷',
      frameType: 3,
      icon: assetUrl('2DItems/Rings/Uniques/TheTaming'),
    })).toMatchObject({
      baseType: 'Prismatic Ring',
      name: 'The Taming',
      strategy: 'exact_asset',
    });
    expect(catalog.mapSkill({
      typeLine: '战矛飞掷',
      gemSkill: assetUrl('2DArt/SkillIcons/HuntressIceSpear'),
    })).toMatchObject({
      name: 'Spear Throw',
      strategy: 'exact_asset',
    });
    expect(catalog.mapPassive(722)?.target).toBe('722');
    expect(catalog.mapPassive(999)).toBeUndefined();
    expect(catalog.mapItem({ baseType: '紫晶戒', name: '' })).toBeUndefined();
    expect(catalog.mapMod('所有[ElementalDamage|元素][Resistances|抗性] +14%'))
      .toMatchObject({
        id: 'explicit.stat_2901986750',
        line: '+14% to all Elemental Resistances',
        strategy: 'exact_template_hash',
      });
    expect(catalog.mapMod('所有元素抗 +14%')).toBeUndefined();
  });
  it('uses the exact icon tier when one support asset has multiple tiers', () => {
    const catalog = new MappingCatalog({
      hash: 'hash',
      baseNames: new Map(),
      uniqueNames: new Map(),
      assetNames: new Map(),
      skillAssets: new Map([
        ['2DItems/Gems/New/NewSupport/RageSupportGem#III', {
          name: 'Rage III',
          gameId: 'Metadata/Items/Gems/SkillGemRageSupportThree',
        }],
      ]),
      modTemplates: new Map(),
      passiveNodeIds: new Set(),
    });

    expect(catalog.mapSkill({
      gemSkill: assetUrl('2DItems/Gems/New/NewSupport/RageSupportGem'),
      iconTierText: 'III',
    })?.name).toBe('Rage III');
    expect(catalog.mapSkill({
      gemSkill: assetUrl('2DItems/Gems/New/NewSupport/RageSupportGem'),
      iconTierText: 'II',
    })).toBeUndefined();
  });

  it('uses the item mod section to disambiguate identical trade templates', () => {
    const catalog = new MappingCatalog({
      hash: 'hash',
      baseNames: new Map(),
      uniqueNames: new Map(),
      assetNames: new Map(),
      skillAssets: new Map(),
      modTemplates: new Map([
        ['explicit.stat_2923486259', {
          id: 'explicit.stat_2923486259',
          englishTemplate: '+#% to Chaos Resistance',
          chineseTemplate: '混沌抗性 #%',
        }],
        ['implicit.stat_2923486259', {
          id: 'implicit.stat_2923486259',
          englishTemplate: '+#% to Chaos Resistance',
          chineseTemplate: '混沌抗性 #%',
        }],
      ]),
      passiveNodeIds: new Set(),
    });

    expect(catalog.mapMod('[Resistances|混沌抗性] +12%', 'implicitMods'))
      .toMatchObject({
        id: 'implicit.stat_2923486259',
        line: '+12% to Chaos Resistance',
      });
  });

  it('maps Transcendent Limb implicit mods via exact numeric templates', () => {
    // RED: without production overrides, both fail closed
    const emptyCatalog = new MappingCatalog({
      hash: 'hash',
      baseNames: new Map(),
      uniqueNames: new Map(),
      assetNames: new Map(),
      skillAssets: new Map(),
      modTemplates: new Map(),
      modOverrides: new Map(),
      passiveNodeIds: new Set(),
    });

    expect(emptyCatalog.mapMod(EVASIVE_LEG_RAW, 'implicitMods')).toBeUndefined();
    expect(emptyCatalog.mapMod(DEFLECTIVE_ARM_RAW, 'implicitMods')).toBeUndefined();

    // GREEN: with production overrides, both map correctly
    const fullCatalog = new MappingCatalog({
      hash: 'hash',
      baseNames: new Map(),
      uniqueNames: new Map(),
      assetNames: new Map(),
      skillAssets: new Map(),
      modTemplates: new Map(),
      modOverrides: new Map([
        ['implicit:闪避值提高 #%', {
          id: 'override.evasive_leg',
          englishTemplate: '#% increased Evasion Rating',
          chineseTemplate: '闪避值提高 #%',
        }],
        ['implicit:偏转值提高 #%', {
          id: 'override.deflective_arm',
          englishTemplate: '#% increased Deflection Rating',
          chineseTemplate: '偏转值提高 #%',
        }],
      ]),
      passiveNodeIds: new Set(),
    });

    expect(fullCatalog.mapMod(EVASIVE_LEG_RAW, 'implicitMods'))
      .toEqual({
        id: 'override.evasive_leg',
        line: '20% increased Evasion Rating',
        strategy: 'versioned_override',
        verified: false,
      });
    expect(fullCatalog.mapMod(DEFLECTIVE_ARM_RAW, 'implicitMods'))
      .toEqual({
        id: 'override.deflective_arm',
        line: '10% increased Deflection Rating',
        strategy: 'versioned_override',
        verified: false,
      });
  });

  it('applies only an exact, versioned localized template override', () => {
    const catalog = new MappingCatalog({
      hash: 'hash',
      baseNames: new Map(),
      uniqueNames: new Map(),
      assetNames: new Map(),
      skillAssets: new Map(),
      modTemplates: new Map(),
      modOverrides: new Map([
        ['implicit:每有一级玩家等级，# 闪避值', {
          id: 'override.evasion_per_level',
          englishTemplate: 'Has # to Evasion Rating per player level',
          chineseTemplate: '每有一级玩家等级，# 闪避值',
        }],
      ]),
      passiveNodeIds: new Set(),
    });

    expect(catalog.mapMod('每有一级玩家等级，+2 [Evasion|闪避]值', 'implicitMods'))
      .toEqual({
        id: 'override.evasion_per_level',
        line: 'Has +2 to Evasion Rating per player level',
        strategy: 'versioned_override',
        verified: false,
      });
    expect(catalog.mapMod('每两级玩家等级，+2 [Evasion|闪避]值', 'implicitMods'))
      .toBeUndefined();
  });

  it('does not match implicit limb overrides when the raw mod section is explicit', () => {
    // Near-miss regression: an explicit evasion/deflection mod with
    // identical Chinese template text must NOT match the implicit limb
    // override, because the override is keyed by section prefix.
    const catalog = new MappingCatalog({
      hash: 'hash',
      baseNames: new Map(),
      uniqueNames: new Map(),
      assetNames: new Map(),
      skillAssets: new Map(),
      modTemplates: new Map(),
      modOverrides: new Map([
        ['implicit:闪避值提高 #%', {
          id: 'override.evasive_leg',
          englishTemplate: '#% increased Evasion Rating',
          chineseTemplate: '闪避值提高 #%',
        }],
        ['implicit:偏转值提高 #%', {
          id: 'override.deflective_arm',
          englishTemplate: '#% increased Deflection Rating',
          chineseTemplate: '偏转值提高 #%',
        }],
      ]),
      passiveNodeIds: new Set(),
    });

    // Explicit evasion — must NOT match the implicit override
    expect(catalog.mapMod('[Evasion|闪避值]提高 15%', 'explicitMods')).toBeUndefined();
    // Explicit deflection — must NOT match the implicit override
    expect(catalog.mapMod('[Deflect|偏转值]提高 8%', 'explicitMods')).toBeUndefined();
    // Implicit forms still match
    expect(catalog.mapMod('[Evasion|闪避值]提高 15%', 'implicitMods'))
      .toMatchObject({ id: 'override.evasive_leg', strategy: 'versioned_override' });
    expect(catalog.mapMod('[Deflect|偏转值]提高 8%', 'implicitMods'))
      .toMatchObject({ id: 'override.deflective_arm', strategy: 'versioned_override' });
  });
});

function assetUrl(path: string): string {
  const encoded = Buffer.from(JSON.stringify([25, 14, { f: path }])).toString('base64url');
  return `https://poecdn.game.qq.com/gen/image/${encoded}/hash/icon.png`;
}
