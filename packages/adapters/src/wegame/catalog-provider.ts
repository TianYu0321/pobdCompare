import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  MappingCatalog,
  type MappingCatalogData,
  type AssetItemEntry,
  type JewelSocketEffect,
  type ModTemplateEntry,
  pairTradeCatalogs,
  type SkillCatalogEntry,
  type TradeCatalog,
} from './mapping-catalog';

interface TradeStatEntry {
  id: string;
  text: string;
  type: string;
}

interface TradeStatCatalog {
  result: Array<{
    id: string;
    label: string;
    entries: TradeStatEntry[];
  }>;
}

interface CatalogCache {
  version: 10;
  pobVersion: string;
  sourceHash: string;
  overrideIdentity: string;
  catalogHash: string;
  baseNames: Array<[string, string]>;
  uniqueNames: Array<[string, string]>;
  assetNames: Array<[string, string]>;
  assetItems: Array<[string, AssetItemEntry]>;
  skillAssets: Array<[string, SkillCatalogEntry]>;
  modTemplates: Array<[string, ModTemplateEntry]>;
  modOverrides: Array<[string, ModTemplateEntry]>;
  jewelBases: Array<[string, string]>;
  jewelMods: Array<[string, ModTemplateEntry]>;
  jewelSocketEffects: Array<[string, JewelSocketEffect]>;
  passiveNodeIds: number[];
}

export interface MappingCatalogProviderOptions {
  pobRoot: string;
  cacheDir: string;
  fetchJson?: (url: string) => Promise<unknown>;
}

const URLS = {
  englishItems: 'https://www.pathofexile.com/api/trade2/data/items',
  chineseItems: 'https://poe.game.qq.com/api/trade2/data/items',
  englishStats: 'https://www.pathofexile.com/api/trade2/data/stats',
  chineseStats: 'https://poe.game.qq.com/api/trade2/data/stats',
};

const CONVERTER_VERSION = 'wegame-native-v10';

const SUPPORT_ASSET_OVERRIDES: Record<string, string> = {
  '2DItems/Gems/New/NewSupport/CooldownReductionSupportGem': 'Cooldown Recovery II',
  '2DItems/Gems/New/NewSupport/MultipleChargesSupportGem#II': 'Charge Profusion II',
  '2DItems/Gems/New/NewSupport/Lineage/Monastic': "Ailith's Chimes",
  '2DItems/Gems/New/NewSupport/LivingLightningSupportGem#II': 'Living Lightning II',
  '2DItems/Gems/New/NewSupport/CulminationSupportGem#II': 'Culmination II',
  '2DItems/Gems/New/NewSupport/VitalitySupportGem#II': 'Vitality II',
  '2DItems/Gems/New/NewSupport/ClaritySupportGem#II': 'Clarity II',
  '2DItems/Gems/New/NewSupport/PrecisionSupportGem#II': 'Precision II',
  '2DItems/Gems/New/NewSupport/Lineage/MothersDeclaration': 'Her Declaration',
  '2DItems/Gems/New/NewSupport/Lineage/LineageUhtredStandard': "Uhtred's Omen",
  '2DItems/Gems/New/NewSupport/ColdMasterySupportGem': 'Cold Mastery',
  '2DItems/Gems/New/NewSupport/ThrilloftheKillSupportGem#II': 'Thrill of the Kill II',
  '2DItems/Gems/New/NewSupport/ExecuteSupportGem#II': 'Execute II',
  '2DItems/Gems/New/NewSupport/RageSupportGem#III': 'Rage III',
  '2DItems/Gems/New/NewSupport/Lineage/LineageEinhar': "Einhar's Beastrite",
  '2DItems/Gems/New/NewSupport/Lineage/Garukhan': "Garukhan's Resolve",
  '2DItems/Gems/New/NewSupport/AddedLightningDamageSupportGem': 'Lightning Attunement',
  '2DItems/Gems/New/NewSupport/AddedColdDamageSupportGem': 'Cold Attunement',
  '2DItems/Gems/New/NewSupport/ExpediteSupportGem#II': 'Short Fuse II',
  '2DItems/Gems/New/NewSupport/HexBloomSupportGem': 'Hex Bloom',
  '2DItems/Gems/New/NewSupport/IncreasedAreaOfEffectSupportGem#II': 'Magnified Area II',
  '2DItems/Gems/New/NewSupport/RitualisticCurseSupportGem': 'Ritualistic Curse',
  '2DItems/Gems/New/NewSupport/FasterAttackSupportGem#III': 'Rapid Attacks III',
  '2DItems/Gems/New/NewSupport/AdditionalAccuracySupportGem#II': 'Heightened Accuracy II',
  '2DItems/Gems/New/NewSupport/BlazingCritsSupportGem': 'Blazing Critical',
  '2DItems/Gems/New/NewSupport/Lineage/Rigwald': "Rigwald's Ferocity",
  '2DItems/Gems/New/NewSupport/CessationSupportGem': 'Deliberation',
  '2DItems/Gems/New/NewSupport/PotencySupportGem': 'Heightened Charges',
  '2DItems/Gems/New/NewSupport/WeaponElementalDamageSupportGem#II': 'Elemental Armament II',
  '2DItems/Gems/New/NewSupport/SalvoSupportGem': 'Salvo',
  '2DItems/Gems/New/NewSupport/MoreDurationSupportGem#II': 'Prolonged Duration II',
  '2DItems/Gems/New/NewSupport/Lineage/Rakiata': "Rakiata's Flow",
  '2DItems/Gems/New/NewSupport/Lineage/OlrothsConviction': "Olroth's Conviction",
  '2DItems/Gems/New/NewSupport/PerpetualChargeSupportGem': 'Perpetual Charge',
  '2DItems/Gems/New/NewSupport/SecondWindSupportGem#II': 'Second Wind II',
  '2DItems/Gems/New/NewSupport/InspirationSupportGem#II': 'Efficiency II',
};

const MOD_TEMPLATE_OVERRIDES: Record<string, string> = {
  'explicit:可被元素地面效果加持的风系技能视作 被点燃地面，感电地面和冰缓地面加持':
    'Wind Skills which can be boosted by Elemental Ground Surfaces count as being boosted by Ignited, Shocked, and Chilled Ground',
  'implicit:闪避值提高 #%': '#% increased Evasion Rating',
  'implicit:偏转值提高 #%': '#% increased Deflection Rating',
  'implicit:每有一级玩家等级，# 闪避值': 'Has # to Evasion Rating per player level',
  'implicit:每有一级玩家等级，# 能量护盾上限': 'Has # to maximum Energy Shield per player level',
  'implicit:每有一级玩家等级，# 符文结界上限': 'Has # to maximum Runic Ward per player level',
  'explicit:每有一级玩家等级，# 闪避值': 'Has # to Evasion Rating per player level',
  'explicit:每有一级玩家等级，# 能量护盾上限': 'Has # to maximum Energy Shield per player level',
  'explicit:全局闪避值与能量护盾总增 #%': '#% more Global Evasion Rating and Energy Shield',
  'explicit:击中有 #% 的几率获得 # 秒猛攻': '#% chance to gain Onslaught for # seconds on Hit',
  'explicit:持续时间提高 #%': '#% increased Duration',
  'implicit:具有 # 个咒符位': 'Has # Charm Slots',
  'explicit:药剂生命回复速度降低 #%': '#% reduced Flask Life Recovery rate',
  'explicit:回复量降低 #%': '#% reduced Amount Recovered',
  'rune:由奥杜尔之忿怒铸造': "Forged by Ogham's Wrath",
  'explicit:每次使用消耗的充能次数降低 #%': '#% reduced Charges per use',
};

const ASSET_NAME_OVERRIDES: Record<string, string> = {
  '2DItems/Armours/Gloves/Basetypes/GlovesDex05': 'Runeforged Fists of Stone',
  '2DItems/Armours/Helmets/Basetypes/HelmetInt05': 'Kamasan Tiara',
  '2DItems/Armours/BodyArmours/Basetypes/BodyDex06': 'Slipstrike Vest',
  '2DItems/Armours/Boots/Basetypes/BootsStrDex02': 'Noble Sabatons',
  '2DItems/Weapons/OneHandWeapons/OneHandSpears/1HSpear04': 'Soaring Spear',
  '2DItems/Weapons/OneHandWeapons/OneHandSpears/1HSpear10': 'Akoyan Spear',
  '2DItems/Rings/Uniques/TheTaming': 'The Taming',
  '2DItems/Belts/Uniques/ShavronnesSatchel': "Shavronne's Satchel",
  '2DItems/Weapons/OneHandWeapons/Scepters/Uniques/SacredFlame': 'Sacred Flame',
  '2DItems/Flasks/Uniques/LaviangasSpirit': "Lavianga's Spirit",
  '2DItems/Rings/Basetypes/AmethystRing': 'Amethyst Ring',
  '2DItems/Amulets/Basetypes/JadeAmulet': 'Jade Amulet',
  '2DItems/Charms/Basetypes/ThawingCharm': 'Thawing Charm',
  '2DItems/Charms/Basetypes/SilverCharm': 'Silver Charm',
  '2DItems/Charms/Basetypes/GoldenCharm': 'Golden Charm',
  '2DItems/Flasks/Basetypes/FlaskLife09': 'Ultimate Life Flask',
};

const ASSET_ITEM_OVERRIDES: Record<string, AssetItemEntry> = {
  '2DItems/Armours/Gloves/Basetypes/GlovesDex05': {
    baseType: 'Runeforged Fists of Stone',
  },
  '2DItems/Armours/Helmets/Basetypes/HelmetInt05': { baseType: 'Kamasan Tiara' },
  '2DItems/Armours/BodyArmours/Basetypes/BodyDex06': { baseType: 'Slipstrike Vest' },
  '2DItems/Armours/Boots/Basetypes/BootsStrDex02': { baseType: 'Noble Sabatons' },
  '2DItems/Weapons/OneHandWeapons/OneHandSpears/1HSpear04': { baseType: 'Soaring Spear' },
  '2DItems/Weapons/OneHandWeapons/OneHandSpears/1HSpear10': { baseType: 'Akoyan Spear' },
  '2DItems/Rings/Uniques/TheTaming': {
    baseType: 'Prismatic Ring',
    name: 'The Taming',
  },
  '2DItems/Belts/Uniques/ShavronnesSatchel': {
    baseType: 'Fine Belt',
    name: "Shavronne's Satchel",
  },
  '2DItems/Weapons/OneHandWeapons/Scepters/Uniques/SacredFlame': {
    baseType: 'Shrine Sceptre',
    name: 'Sacred Flame',
  },
  '2DItems/Flasks/Uniques/LaviangasSpirit': {
    baseType: 'Gargantuan Mana Flask',
    name: "Lavianga's Spirits",
  },
  '2DItems/Rings/Basetypes/AmethystRing': { baseType: 'Amethyst Ring' },
  '2DItems/Amulets/Basetypes/JadeAmulet': { baseType: 'Jade Amulet' },
  '2DItems/Charms/Basetypes/ThawingCharm': { baseType: 'Thawing Charm' },
  '2DItems/Charms/Basetypes/SilverCharm': { baseType: 'Silver Charm' },
  '2DItems/Charms/Basetypes/GoldenCharm': { baseType: 'Golden Charm' },
  '2DItems/Flasks/Basetypes/FlaskLife09': { baseType: 'Ultimate Life Flask' },
};

const JEWEL_BASE_OVERRIDES: Record<string, string> = {
  'Metadata/Items/Jewels/JewelDex': 'Emerald',
  'Metadata/Items/Jewels/JewelInt': 'Sapphire',
  'Metadata/Items/Jewels/JewelStr': 'Ruby',
  'Metadata/Items/Jewels/JewelDiamond': 'Diamond',
};

const JEWEL_SOCKET_EFFECT_OVERRIDES: Record<string, JewelSocketEffect> = {
  'JewelDiamond:1500:1860': {
    radiusLabel: 'Variable',
    modLines: [
      'Only affects Passives in Medium-Large Ring',
      'Passives in Radius can be Allocated without being connected to your tree',
    ],
  },
};

export class MappingCatalogProvider {
  private catalog?: MappingCatalog;
  private readonly fetchJson: (url: string) => Promise<unknown>;

  constructor(private readonly options: MappingCatalogProviderOptions) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  async getCatalog(): Promise<MappingCatalog> {
    if (this.catalog) return this.catalog;
    const sources = await readPoBSources(this.options.pobRoot);
    const overrideIdentity = computeOverrideIdentity();
    const cachePath = path.join(
      this.options.cacheDir,
      `wegame-mapping-${safeFileName(sources.pobVersion)}.json`,
    );
    const cached = await readCache(cachePath);
    if (cached?.sourceHash === sources.sourceHash && cached?.overrideIdentity === overrideIdentity) {
      this.catalog = new MappingCatalog(deserializeCache(cached));
      return this.catalog;
    }

    let payloads: [TradeCatalog, TradeCatalog, TradeStatCatalog, TradeStatCatalog];
    try {
      payloads = await Promise.all([
        this.fetchJson(URLS.englishItems),
        this.fetchJson(URLS.chineseItems),
        this.fetchJson(URLS.englishStats),
        this.fetchJson(URLS.chineseStats),
      ]) as typeof payloads;
    } catch (error) {
      throw new Error(`catalog_refresh_failed: ${error instanceof Error ? error.message : error}`);
    }

    const data = compileCatalog(sources, ...payloads);
    await mkdir(this.options.cacheDir, { recursive: true });
    await writeFile(
      cachePath,
      JSON.stringify(serializeCache(sources.pobVersion, sources.sourceHash, overrideIdentity, data)),
      'utf8',
    );
    this.catalog = new MappingCatalog(data);
    return this.catalog;
  }
}

interface PoBSources {
  pobVersion: string;
  sourceHash: string;
  gems: string;
  skillFiles: string[];
  baseFiles: string[];
  modFiles: string[];
  treeJson: string;
}

async function readPoBSources(pobRoot: string): Promise<PoBSources> {
  const src = path.join(pobRoot, 'src');
  const manifest = await readFile(path.join(pobRoot, 'manifest.xml'), 'utf8');
  const pobVersion = manifest.match(/<Version\s+number=["']([^"']+)["']/i)?.[1];
  if (!pobVersion) throw new Error('catalog_refresh_failed: PoB2 manifest has no version');
  const gems = await readFile(path.join(src, 'Data', 'Gems.lua'), 'utf8');
  const skillFiles = await readTextFiles(path.join(src, 'Data', 'Skills'), '.lua');
  const baseFiles = await readTextFiles(path.join(src, 'Data', 'Bases'), '.lua');
  const modFiles = (await readTextFiles(path.join(src, 'Data'), '.lua', 'Mod'));
  const treeRoot = path.join(src, 'TreeData');
  const treeVersions = (await readdir(treeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersions);
  const validTreeVersions: string[] = [];
  for (const version of treeVersions) {
    try {
      await readFile(path.join(treeRoot, version, 'tree.json'), 'utf8');
      validTreeVersions.push(version);
    } catch {
      // Non-version TreeData directories (for example timeless data) have no tree.json.
    }
  }
  const treeJson = await readFile(
    path.join(treeRoot, validTreeVersions.at(-1) ?? '0_2', 'tree.json'),
    'utf8',
  );
  const sourceHash = createHash('sha256')
    .update(manifest)
    .update(gems)
    .update(skillFiles.join('\n'))
    .update(baseFiles.join('\n'))
    .update(modFiles.join('\n'))
    .update(treeJson)
    .digest('hex');
  return { pobVersion, sourceHash, gems, skillFiles, baseFiles, modFiles, treeJson };
}

const BASE_NAME_OVERRIDES: Record<string, string> = {
  '闪避之腿': 'Evasive Leg',
  '偏转之臂': 'Deflective Arm',
};

let _overrideIdentityCache: string | undefined;

function computeOverrideIdentity(): string {
  if (_overrideIdentityCache) return _overrideIdentityCache;
  const payload = JSON.stringify({
    converterVersion: CONVERTER_VERSION,
    baseNameOverrides: sortEntries(BASE_NAME_OVERRIDES),
    modTemplateOverrides: sortEntries(MOD_TEMPLATE_OVERRIDES),
    jewelBaseOverrides: sortEntries(JEWEL_BASE_OVERRIDES),
    assetNameOverrides: sortEntries(ASSET_NAME_OVERRIDES),
    assetItemOverrides: sortEntries(ASSET_ITEM_OVERRIDES),
    supportAssetOverrides: sortEntries(SUPPORT_ASSET_OVERRIDES),
    jewelSocketEffectOverrides: sortEntries(JEWEL_SOCKET_EFFECT_OVERRIDES),
  });
  _overrideIdentityCache = createHash('sha256').update(payload).digest('hex');
  return _overrideIdentityCache;
}

function sortEntries(record: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}

function compileCatalog(
  sources: PoBSources,
  englishItems: TradeCatalog,
  chineseItems: TradeCatalog,
  englishStats: TradeStatCatalog,
  chineseStats: TradeStatCatalog,
): MappingCatalogData {
  const names = pairTradeCatalogs(englishItems, chineseItems);
  const knownBases = parseBaseNames(sources.baseFiles);
  for (const [cn, en] of [...names.baseNames]) {
    if (!knownBases.has(en) && !isSpecialItem(en)) names.baseNames.delete(cn);
  }
  for (const [cn, en] of Object.entries(BASE_NAME_OVERRIDES)) {
    if (knownBases.has(en)) names.baseNames.set(cn, en);
  }

  const gems = parseGems(sources.gems);
  const skillAssets = parseSkillAssets(sources.skillFiles, gems);
  const gemsByName = new Map([...gems.values()].map((gem) => [gem.name, gem]));
  for (const [asset, gemName] of Object.entries(SUPPORT_ASSET_OVERRIDES)) {
    const gem = gemsByName.get(gemName);
    if (gem) skillAssets.set(asset, gem);
  }
  const assetNames = new Map(Object.entries(ASSET_NAME_OVERRIDES));
  const assetItems = new Map(Object.entries(ASSET_ITEM_OVERRIDES));
  for (const name of [...knownBases, ...names.uniqueNames.values()]) {
    const compact = name.replace(/[^a-z0-9]/gi, '');
    if (compact) assetNames.set(`__name__/${compact.toLowerCase()}`, name);
  }
  const modTemplates = pairStatCatalogs(englishStats, chineseStats);
  const jewelBases = new Map(Object.entries(JEWEL_BASE_OVERRIDES));
  const jewelMods = parseJewelMods(sources.modFiles);
  const jewelSocketEffects = new Map(Object.entries(JEWEL_SOCKET_EFFECT_OVERRIDES));
  const modOverrides = new Map(Object.entries(MOD_TEMPLATE_OVERRIDES).map(
    ([source, englishTemplate]) => [source, {
      id: `override.${createHash('sha256').update(source).digest('hex').slice(0, 16)}`,
      englishTemplate,
      chineseTemplate: source,
    }],
  ));
  const tree = JSON.parse(sources.treeJson) as { nodes?: Record<string, unknown> };
  const passiveNodeIds = new Set(Object.keys(tree.nodes ?? {}).map(Number).filter(Number.isFinite));
  const catalogHash = createHash('sha256')
    .update(sources.sourceHash)
    .update(JSON.stringify([...names.baseNames]))
    .update(JSON.stringify([...names.uniqueNames]))
    .update(JSON.stringify([...skillAssets]))
    .update(JSON.stringify([...modTemplates]))
    .update(JSON.stringify([...modOverrides]))
    .update(JSON.stringify([...jewelBases]))
    .update(JSON.stringify([...jewelMods]))
    .update(JSON.stringify([...jewelSocketEffects]))
    .update(JSON.stringify([...assetItems]))
    .update(CONVERTER_VERSION)
    .digest('hex');
  return {
    hash: catalogHash,
    baseNames: names.baseNames,
    uniqueNames: names.uniqueNames,
    assetNames,
    assetItems,
    skillAssets,
    modTemplates,
    modOverrides,
    jewelBases,
    jewelMods,
    jewelSocketEffects,
    passiveNodeIds,
  };
}

function parseJewelMods(files: string[]): Map<string, ModTemplateEntry> {
  const result = new Map<string, ModTemplateEntry>();
  const blockPattern = /\["([^"]+)"\]\s*=\s*\{([\s\S]*?)(?=\n\s*\["|$)/g;
  for (const content of files) {
    for (const match of content.matchAll(blockPattern)) {
      const line = match[2].match(/affix\s*=\s*"[^"]*"\s*,\s*"((?:[^"\\]|\\.)*)"/)?.[1];
      if (!line) continue;
      result.set(match[1], {
        id: match[1],
        englishTemplate: line.replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
        chineseTemplate: '',
      });
    }
  }
  return result;
}

function parseBaseNames(files: string[]): Set<string> {
  const result = new Set<string>();
  for (const content of files) {
    for (const match of content.matchAll(/itemBases\["([^"]+)"\]\s*=/g)) result.add(match[1]);
  }
  return result;
}

function parseGems(content: string): Map<string, SkillCatalogEntry> {
  const result = new Map<string, SkillCatalogEntry>();
  const blockPattern = /\["([^"]+)"\]\s*=\s*\{([\s\S]*?)(?=\n\s*\["|$)/g;
  for (const match of content.matchAll(blockPattern)) {
    const body = match[2];
    const name = field(body, 'name');
    const gameId = field(body, 'gameId') ?? match[1];
    const grantedEffectId = field(body, 'grantedEffectId');
    if (!name || !grantedEffectId) continue;
    result.set(grantedEffectId, {
      name,
      gameId,
      variantId: field(body, 'variantId'),
      grantedEffectId,
    });
  }
  return result;
}

function parseSkillAssets(
  files: string[],
  gemsByEffect: Map<string, SkillCatalogEntry>,
): Map<string, SkillCatalogEntry> {
  const result = new Map<string, SkillCatalogEntry>();
  for (const content of files) {
    const pattern = /skills\["([^"]+)"\]\s*=\s*\{([\s\S]*?)(?=\nskills\[|\nreturn skills|$)/g;
    for (const match of content.matchAll(pattern)) {
      const effectId = match[1];
      const icon = field(match[2], 'icon');
      const gem = gemsByEffect.get(effectId);
      if (!icon || !gem) continue;
      result.set(normalizeAssetPath(icon), gem);
    }
  }
  return result;
}

function pairStatCatalogs(
  english: TradeStatCatalog,
  chinese: TradeStatCatalog,
): Map<string, ModTemplateEntry> {
  const englishById = new Map<string, string>();
  for (const group of english.result) {
    for (const entry of group.entries) {
      if (!englishById.has(entry.id)) englishById.set(entry.id, entry.text);
    }
  }
  const result = new Map<string, ModTemplateEntry>();
  for (const group of chinese.result) {
    for (const entry of group.entries) {
      const englishTemplate = englishById.get(entry.id);
      if (!englishTemplate || result.has(entry.id)) continue;
      result.set(entry.id, {
        id: entry.id,
        englishTemplate,
        chineseTemplate: entry.text,
      });
    }
  }
  return result;
}

function serializeCache(
  pobVersion: string,
  sourceHash: string,
  overrideIdentity: string,
  data: MappingCatalogData,
): CatalogCache {
  return {
    version: 10,
    pobVersion,
    sourceHash,
    overrideIdentity,
    catalogHash: data.hash,
    baseNames: [...data.baseNames],
    uniqueNames: [...data.uniqueNames],
    assetNames: [...data.assetNames],
    assetItems: [...(data.assetItems ?? [])],
    skillAssets: [...data.skillAssets],
    modTemplates: [...data.modTemplates],
    modOverrides: [...(data.modOverrides ?? [])],
    jewelBases: [...(data.jewelBases ?? [])],
    jewelMods: [...(data.jewelMods ?? [])],
    jewelSocketEffects: [...(data.jewelSocketEffects ?? [])],
    passiveNodeIds: [...data.passiveNodeIds],
  };
}

function deserializeCache(cache: CatalogCache): MappingCatalogData {
  return {
    hash: cache.catalogHash,
    baseNames: new Map(cache.baseNames),
    uniqueNames: new Map(cache.uniqueNames),
    assetNames: new Map(cache.assetNames),
    assetItems: new Map(cache.assetItems),
    skillAssets: new Map(cache.skillAssets),
    modTemplates: new Map(cache.modTemplates),
    modOverrides: new Map(cache.modOverrides),
    jewelBases: new Map(cache.jewelBases),
    jewelMods: new Map(cache.jewelMods),
    jewelSocketEffects: new Map(cache.jewelSocketEffects),
    passiveNodeIds: new Set(cache.passiveNodeIds),
  };
}

async function readCache(cachePath: string): Promise<CatalogCache | undefined> {
  try {
    const parsed = JSON.parse(await readFile(cachePath, 'utf8')) as CatalogCache;
    return parsed.version === 10 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function readTextFiles(
  root: string,
  extension: string,
  namePrefix?: string,
): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths = entries
    .filter((entry) =>
      entry.isFile()
      && entry.name.endsWith(extension)
      && (!namePrefix || entry.name.startsWith(namePrefix)))
    .map((entry) => path.join(root, entry.name))
    .sort();
  return Promise.all(paths.map((file) => readFile(file, 'utf8')));
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 PoE2-BD-Workbench/0.1',
      Referer: url.includes('qq.com')
        ? 'https://poe.game.qq.com/trade2'
        : 'https://www.pathofexile.com/trade2',
    },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function field(body: string, name: string): string | undefined {
  return body.match(new RegExp(`\\n\\s*${name}\\s*=\\s*"([^"]+)"`))?.[1];
}

function normalizeAssetPath(asset: string): string {
  return asset.replace(/^Art\//, '').replace(/\.dds$/i, '');
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]/gi, '_');
}

function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

function isSpecialItem(name: string): boolean {
  return /Flask|Charm|Rune|Soul Core|Talisman|Jewel/i.test(name);
}
