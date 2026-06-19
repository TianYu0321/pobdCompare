import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { MappingCatalogProvider } from './catalog-provider';

describe('MappingCatalogProvider', () => {
  it('builds and reuses a PoB-versioned local cache', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pob-catalog-'));
    const cacheDir = path.join(root, 'cache');
    await mkdir(path.join(root, 'src', 'Data', 'Bases'), { recursive: true });
    await mkdir(path.join(root, 'src', 'Data', 'Skills'), { recursive: true });
    await mkdir(path.join(root, 'src', 'TreeData', '0_2'), { recursive: true });
    await writeFile(path.join(root, 'manifest.xml'), '<Version number="0.99.0"/>');
    await writeFile(
      path.join(root, 'src', 'Data', 'Gems.lua'),
      `return { ["Metadata/Gem"] = {
        name = "Spear Throw",
        gameId = "Metadata/Gem",
        variantId = "SpearThrow",
        grantedEffectId = "SpearThrowPlayer",
      },
      ["Metadata/RageThree"] = {
        name = "Rage III",
        gameId = "Metadata/RageThree",
        variantId = "RageSupportThree",
        grantedEffectId = "SupportRagePlayerThree",
      },
      ["Metadata/Deliberation"] = {
        name = "Deliberation",
        gameId = "Metadata/Deliberation",
        variantId = "DeliberationSupport",
        grantedEffectId = "SupportDeliberationPlayer",
      },
      ["Metadata/HeightenedCharges"] = {
        name = "Heightened Charges",
        gameId = "Metadata/HeightenedCharges",
        variantId = "HeightenedChargesSupport",
        grantedEffectId = "SupportHeightenedChargesPlayer",
      },
      ["Metadata/GarukhansResolve"] = {
        name = "Garukhan's Resolve",
        gameId = "Metadata/GarukhansResolve",
        variantId = "GarukhansResolveSupport",
        grantedEffectId = "SupportGarukhansResolvePlayer",
      } }`,
    );
    await writeFile(
      path.join(root, 'src', 'Data', 'Skills', 'other.lua'),
      `skills["SpearThrowPlayer"] = {
        name = "Spear Throw",
        icon = "Art/2DArt/SkillIcons/HuntressIceSpear.dds",
      }`,
    );
    await writeFile(
      path.join(root, 'src', 'Data', 'Bases', 'ring.lua'),
      `itemBases["Amethyst Ring"] = { type = "Ring" }`,
    );
    await writeFile(
      path.join(root, 'src', 'Data', 'ModJewel.lua'),
      `return {
        ["JewelAttackSpeed"] = {
          type = "Suffix",
          affix = "of Alacrity",
          "(2-4)% increased Attack Speed",
        },
      }`,
    );
    await writeFile(
      path.join(root, 'src', 'TreeData', '0_2', 'tree.json'),
      JSON.stringify({ nodes: { 722: { name: 'Dexterity' } } }),
    );

    const fetchJson = vi.fn(async (url: string) => {
      if (url.includes('/items')) {
        const cn = url.includes('qq.com');
        return {
          result: [{
            id: 'accessory',
            label: cn ? '配饰' : 'Accessories',
            entries: [{ type: cn ? '紫晶戒指' : 'Amethyst Ring' }],
          }],
        };
      }
      const cn = url.includes('qq.com');
      return {
        result: [{
          id: 'explicit',
          label: 'Explicit',
          entries: [{
            id: 'explicit.stat_2923486259',
            text: cn ? '混沌抗性 +#%' : '+#% to Chaos Resistance',
            type: 'explicit',
          }],
        }],
      };
    });

    const provider = new MappingCatalogProvider({ pobRoot: root, cacheDir, fetchJson });
    const first = await provider.getCatalog();
    expect(first.mapItem({ baseType: '紫晶戒指', name: '' })?.baseType)
      .toBe('Amethyst Ring');
    expect(first.mapSkill({
      typeLine: 'ignored',
      gemSkill: assetUrl('2DArt/SkillIcons/HuntressIceSpear'),
    })?.gameId).toBe('Metadata/Gem');
    expect(first.mapSkill({
      gemSkill: assetUrl('2DItems/Gems/New/NewSupport/RageSupportGem'),
      iconTierText: 'III',
    })?.gameId).toBe('Metadata/RageThree');
    expect(first.mapSkill({
      gemSkill: assetUrl('2DItems/Gems/New/NewSupport/CessationSupportGem'),
    })?.gameId).toBe('Metadata/Deliberation');
    expect(first.mapSkill({
      gemSkill: assetUrl('2DItems/Gems/New/NewSupport/PotencySupportGem'),
    })?.gameId).toBe('Metadata/HeightenedCharges');
    expect(first.mapSkill({
      icon: assetUrl('2DItems/Gems/New/NewSupport/Lineage/Garukhan'),
    })?.gameId).toBe('Metadata/GarukhansResolve');
    expect(first.mapMod('[Resistances|混沌抗性] +12%')?.line)
      .toBe('+12% to Chaos Resistance');
    expect((first as any).mapJewelMod('JewelAttackSpeed', [3])?.line)
      .toBe('3% increased Attack Speed');
    expect(first.mapPassive(722)).toBeDefined();
    expect(fetchJson).toHaveBeenCalledTimes(4);

    const secondProvider = new MappingCatalogProvider({
      pobRoot: root,
      cacheDir,
      fetchJson,
    });
    await secondProvider.getCatalog();
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });
});

function assetUrl(assetPath: string): string {
  const encoded = Buffer.from(JSON.stringify([21, 14, { k: assetPath }])).toString('base64url');
  return `https://poecdn.game.qq.com/gen/image/${encoded}/hash/icon.png`;
}
