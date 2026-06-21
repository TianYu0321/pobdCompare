import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { MappingCatalogProvider } from './catalog-provider';

const EVASIVE_LEG_RAW = '[Evasion|闪避值]提高 20%';
const DEFLECTIVE_ARM_RAW = '[Deflect|偏转值]提高 10%';

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
      path.join(root, 'src', 'Data', 'Bases', 'incursionlimb.lua'),
      `itemBases["Evasive Leg"] = { type = "Leg" }
itemBases["Deflective Arm"] = { type = "Arm" }`,
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

    {
      // RED: Transcendent Limb bases exist in PoB2 but not in trade catalogs — override needed
      const evasiveLeg = first.mapItem({ baseType: '闪避之腿', name: '', frameType: 0 });
      const deflectiveArm = first.mapItem({ baseType: '偏转之臂', name: '', frameType: 0 });
      expect(evasiveLeg).toMatchObject({
        baseType: 'Evasive Leg',
        strategy: 'versioned_override',
      });
      expect(deflectiveArm).toMatchObject({
        baseType: 'Deflective Arm',
        strategy: 'versioned_override',
      });
    }

    // Provider production-override regression: MOD_TEMPLATE_OVERRIDES compile into catalog
    {
      const evasionResult = first.mapMod(EVASIVE_LEG_RAW, 'implicitMods');
      expect(evasionResult).toBeDefined();
      expect(evasionResult!.line).toBe('20% increased Evasion Rating');
      expect(evasionResult!.strategy).toBe('versioned_override');
      const deflectResult = first.mapMod(DEFLECTIVE_ARM_RAW, 'implicitMods');
      expect(deflectResult).toBeDefined();
      expect(deflectResult!.line).toBe('10% increased Deflection Rating');
      expect(deflectResult!.strategy).toBe('versioned_override');
    }

    const secondProvider = new MappingCatalogProvider({
      pobRoot: root,
      cacheDir,
      fetchJson,
    });
    await secondProvider.getCatalog();
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });

  it('rejects stale v9 cache forcing fresh catalog compile with modOverrides', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pob-catalog-stale-'));
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
      path.join(root, 'src', 'Data', 'Bases', 'incursionlimb.lua'),
      `itemBases["Evasive Leg"] = { type = "Leg" }
itemBases["Deflective Arm"] = { type = "Arm" }`,
    );
    await writeFile(
      path.join(root, 'src', 'Data', 'ModJewel.lua'),
      `return { ["JewelAttackSpeed"] = { type = "Suffix", affix = "of Alacrity", "(2-4)% increased Attack Speed" } }`,
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

    // 1. Write a valid v10 cache
    const firstProvider = new MappingCatalogProvider({ pobRoot: root, cacheDir, fetchJson });
    await firstProvider.getCatalog();
    expect(fetchJson).toHaveBeenCalledTimes(4);

    // 2. Mutate disk cache to version 9 (stale pre-override schema)
    const cacheFile = path.join(cacheDir, (await readdir(cacheDir))[0]);
    const cacheContent = JSON.parse(await readFile(cacheFile, 'utf8'));
    expect(cacheContent.version).toBe(10);
    const staleCache = { ...cacheContent, version: 9 };
    await writeFile(cacheFile, JSON.stringify(staleCache));

    // 3. Instantiate another provider — v9 cache must be rejected
    //    RED (old code): v9 was accepted, fetchJson stayed at 4, modOverrides absent
    //    GREEN (fix):    v9 rejected, fetchJson goes to 8, fresh compile includes overrides
    const secondProvider = new MappingCatalogProvider({ pobRoot: root, cacheDir, fetchJson });
    await secondProvider.getCatalog();
    // GREEN: v9 cache rejected, fresh fetch happened
    expect(fetchJson).toHaveBeenCalledTimes(8);

    // 4. Verify modOverrides present in freshly compiled catalog
    const freshCatalog = await secondProvider.getCatalog();
    const evasionResult = freshCatalog.mapMod(EVASIVE_LEG_RAW, 'implicitMods');
    expect(evasionResult).toBeDefined();
    expect(evasionResult!.line).toBe('20% increased Evasion Rating');
    expect(evasionResult!.strategy).toBe('versioned_override');
    const deflectResult = freshCatalog.mapMod(DEFLECTIVE_ARM_RAW, 'implicitMods');
    expect(deflectResult).toBeDefined();
    expect(deflectResult!.line).toBe('10% increased Deflection Rating');
    expect(deflectResult!.strategy).toBe('versioned_override');
  });

  it('rejects cache when override identity changes (stale overrides)', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pob-catalog-override-'));
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
      path.join(root, 'src', 'Data', 'Bases', 'incursionlimb.lua'),
      `itemBases["Evasive Leg"] = { type = "Leg" }
itemBases["Deflective Arm"] = { type = "Arm" }`,
    );
    await writeFile(
      path.join(root, 'src', 'Data', 'ModJewel.lua'),
      `return { ["JewelAttackSpeed"] = { type = "Suffix", affix = "of Alacrity", "(2-4)% increased Attack Speed" } }`,
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

    // 1. Build fresh cache
    const firstProvider = new MappingCatalogProvider({ pobRoot: root, cacheDir, fetchJson });
    await firstProvider.getCatalog();
    expect(fetchJson).toHaveBeenCalledTimes(4);

    // 2. Mutate disk cache: corrupt overrideIdentity
    const cacheFile = path.join(cacheDir, (await readdir(cacheDir))[0]);
    const cacheContent = JSON.parse(await readFile(cacheFile, 'utf8'));
    expect(cacheContent.overrideIdentity).toBeDefined();
    expect(typeof cacheContent.overrideIdentity).toBe('string');
    const mutatedCache = { ...cacheContent, overrideIdentity: 'stale-override-hash' };
    await writeFile(cacheFile, JSON.stringify(mutatedCache));

    // 3. New provider must reject stale-override cache and re-fetch
    const secondProvider = new MappingCatalogProvider({ pobRoot: root, cacheDir, fetchJson });
    await secondProvider.getCatalog();
    expect(fetchJson).toHaveBeenCalledTimes(8);

    // 4. modOverrides still present in freshly compiled catalog
    const freshCatalog = await secondProvider.getCatalog();
    const evasionResult = freshCatalog.mapMod(EVASIVE_LEG_RAW, 'implicitMods');
    expect(evasionResult).toBeDefined();
    expect(evasionResult!.strategy).toBe('versioned_override');
  });
});

function assetUrl(assetPath: string): string {
  const encoded = Buffer.from(JSON.stringify([21, 14, { k: assetPath }])).toString('base64url');
  return `https://poecdn.game.qq.com/gen/image/${encoded}/hash/icon.png`;
}
