import type { MappingEvidence, MappingStrategy, MappingCatalogMeta } from '@pobd/schemas';

export interface TradeCatalogEntry {
  type: string;
  text?: string;
  name?: string;
  disc?: string;
  flags?: { unique?: boolean };
}

export interface TradeCatalogGroup {
  id: string;
  label: string;
  entries: TradeCatalogEntry[];
}

export interface TradeCatalog {
  result: TradeCatalogGroup[];
}

export interface SkillCatalogEntry {
  name: string;
  gameId: string;
  variantId?: string;
  grantedEffectId?: string;
}

export interface ModTemplateEntry {
  id: string;
  englishTemplate: string;
  chineseTemplate: string;
}

export interface AssetItemEntry {
  baseType: string;
  name?: string;
}

export interface JewelSocketEffect {
  radiusLabel: string;
  modLines: string[];
}

export interface MappingCatalogData {
  hash: string;
  meta?: MappingCatalogMeta;
  baseNames: Map<string, string>;
  uniqueNames: Map<string, string>;
  assetNames: Map<string, string>;
  assetItems?: Map<string, AssetItemEntry>;
  skillAssets: Map<string, SkillCatalogEntry>;
  modTemplates: Map<string, ModTemplateEntry>;
  modOverrides?: Map<string, ModTemplateEntry>;
  jewelBases?: Map<string, string>;
  jewelMods?: Map<string, ModTemplateEntry>;
  jewelSocketEffects?: Map<string, JewelSocketEffect>;
  passiveNodeIds: Set<number>;
}

export interface RawItemIdentity {
  baseType?: string;
  typeLine?: string;
  name?: string;
  icon?: string;
  frameType?: number;
}

export interface RawSkillIdentity {
  typeLine?: string;
  baseType?: string;
  gemSkill?: string;
  icon?: string;
  iconTierText?: string;
}

export interface ExactMapping<T> {
  value: T;
  source: string;
  target: string;
  strategy: MappingStrategy;
}

export class MappingCatalog {
  readonly hash: string;
  readonly meta?: MappingCatalogMeta;

  constructor(private readonly data: MappingCatalogData) {
    this.hash = data.hash;
    this.meta = data.meta;
  }

  mapItem(item: RawItemIdentity):
    | { baseType: string; name?: string; strategy: MappingStrategy }
    | undefined {
    const asset = extractAssetPath(item.icon);
    const exactAssetItem = asset && this.data.assetItems?.get(asset);
    if (exactAssetItem) {
      return {
        ...exactAssetItem,
        name: exactAssetItem.name ?? (item.name || undefined),
        strategy: 'exact_asset',
      };
    }
    const assetName = asset && this.data.assetNames.get(asset);
    const rawBase = item.baseType ?? item.typeLine ?? '';
    const rawName = item.name ?? '';

    if (assetName) {
      const uniqueName = rawName && item.frameType === 3
        ? this.data.uniqueNames.get(rawName) ?? inferAssetDisplayName(asset, rawName)
        : undefined;
      const baseType = this.data.baseNames.get(rawBase)
        ?? (uniqueName ? this.data.baseNames.get(rawBase) : assetName);
      return {
        baseType: baseType ?? assetName,
        name: uniqueName ?? (rawName || undefined),
        strategy: 'exact_asset',
      };
    }

    const baseType = this.data.baseNames.get(rawBase);
    if (!baseType) return undefined;
    const name = item.frameType === 3 && rawName
      ? this.data.uniqueNames.get(rawName)
      : rawName || undefined;
    if (item.frameType === 3 && rawName && !name) return undefined;
    return { baseType, name, strategy: 'versioned_override' };
  }

  mapSkill(skill: RawSkillIdentity):
    | (SkillCatalogEntry & { strategy: MappingStrategy })
    | undefined {
    const asset = extractAssetPath(skill.gemSkill ?? skill.icon);
    if (!asset) return undefined;
    const tier = skill.iconTierText?.trim();
    const entry = (tier && this.data.skillAssets.get(`${asset}#${tier}`))
      ?? this.data.skillAssets.get(asset);
    return entry ? { ...entry, strategy: 'exact_asset' } : undefined;
  }

  mapPassive(nodeId: number): MappingEvidence | undefined {
    if (!this.data.passiveNodeIds.has(nodeId)) return undefined;
    return {
      category: 'passive',
      source: String(nodeId),
      target: String(nodeId),
      strategy: 'exact_id',
      sourceId: String(nodeId),
    };
  }

  getModTemplate(id: string): ModTemplateEntry | undefined {
    return this.data.modTemplates.get(id);
  }

  mapJewelBase(metadataId: string):
    | { baseType: string; strategy: 'versioned_override' }
    | undefined {
    const baseType = this.data.jewelBases?.get(metadataId);
    return baseType ? { baseType, strategy: 'versioned_override' } : undefined;
  }

  mapJewelSocketEffect(value: Record<string, unknown>):
    | (JewelSocketEffect & { strategy: 'versioned_override' })
    | undefined {
    const type = typeof value.type === 'string' ? value.type : '';
    const radiusMin = typeof value.radiusMin === 'number' ? value.radiusMin : 0;
    const radius = typeof value.radius === 'number' ? value.radius : 0;
    const effect = this.data.jewelSocketEffects?.get(`${type}:${radiusMin}:${radius}`);
    return effect ? { ...effect, strategy: 'versioned_override' } : undefined;
  }

  mapJewelMod(id: string, values: number[]):
    | { id: string; line: string; strategy: 'exact_id' }
    | undefined {
    const entry = this.data.jewelMods?.get(id);
    if (!entry) return undefined;
    const line = renderJewelTemplate(entry.englishTemplate, values);
    return line ? { id, line, strategy: 'exact_id' } : undefined;
  }

  mapMod(rawLine: string, section?: string):
    | { id: string; line: string; strategy: 'exact_template_hash' | 'versioned_override'; status: 'mapped_unverified' | 'verified_by_pob2' | 'pob2_rejected'; source: string }
    | undefined {
    const source = normalizeLocalizedText(rawLine);
    const prefix = section && MOD_SECTION_PREFIXES[section];
    const sourceTemplate = toNumericTemplate(source);
    const override = prefix && this.data.modOverrides?.get(`${prefix}:${sourceTemplate.template}`);
    if (override) {
      return {
        id: override.id,
        line: renderTemplate(override.englishTemplate, sourceTemplate.values),
        strategy: 'versioned_override',
        status: 'mapped_unverified',
        source: 'manual_override',
      };
    }
    const matches: Array<{ id: string; line: string }> = [];
    for (const template of this.data.modTemplates.values()) {
      if (prefix && !template.id.startsWith(`${prefix}.`)) continue;
      const values = matchTemplate(source, normalizeLocalizedText(template.chineseTemplate));
      if (!values) continue;
      matches.push({
        id: template.id,
        line: renderTemplate(template.englishTemplate, values),
      });
    }
    if (matches.length !== 1) return undefined;
    return { ...matches[0], strategy: 'exact_template_hash', status: 'mapped_unverified', source: 'poe2db_exact' };
  }
}

function toNumericTemplate(value: string): { template: string; values: string[] } {
  const values: string[] = [];
  const template = value.replace(/[-+]?\d+(?:\.\d+)?/g, (number) => {
    values.push(number);
    return '#';
  });
  return { template, values };
}

const MOD_SECTION_PREFIXES: Record<string, string> = {
  enchantMods: 'enchant',
  runeMods: 'rune',
  implicitMods: 'implicit',
  explicitMods: 'explicit',
  fracturedMods: 'fractured',
  desecratedMods: 'desecrated',
  mutatedMods: 'mutated',
  craftedMods: 'crafted',
};

export function extractAssetPath(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/gen\/image\/([^/]+)\//);
  if (!match) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) as unknown[];
    const descriptor = decoded[2] as { f?: string; k?: string } | undefined;
    return descriptor?.f ?? descriptor?.k;
  } catch {
    return undefined;
  }
}

export function pairTradeCatalogs(
  english: TradeCatalog,
  chinese: TradeCatalog,
): { baseNames: Map<string, string>; uniqueNames: Map<string, string> } {
  const baseNames = new Map<string, string>();
  const uniqueNames = new Map<string, string>();
  const cnGroups = new Map(chinese.result.map((group) => [group.id, group]));

  for (const enGroup of english.result) {
    const cnGroup = cnGroups.get(enGroup.id);
    if (!cnGroup) continue;
    pairPartition(
      enGroup.entries.filter((entry) => !entry.flags?.unique),
      cnGroup.entries.filter((entry) => !entry.flags?.unique),
      (en, cn) => baseNames.set(cn.type, en.type),
    );
    pairPartition(
      enGroup.entries.filter((entry) => entry.flags?.unique),
      cnGroup.entries.filter((entry) => entry.flags?.unique),
      (en, cn) => {
        if (en.name && cn.name) uniqueNames.set(cn.name, en.name);
        baseNames.set(cn.type, en.type);
      },
    );
  }
  return { baseNames, uniqueNames };
}

function pairPartition(
  english: TradeCatalogEntry[],
  chinese: TradeCatalogEntry[],
  add: (english: TradeCatalogEntry, chinese: TradeCatalogEntry) => void,
): void {
  const count = Math.min(english.length, chinese.length);
  for (let index = 0; index < count; index += 1) {
    const en = english[index];
    const cn = chinese[index];
    if (en.disc !== cn.disc) continue;
    add(en, cn);
  }
}

function inferAssetDisplayName(asset: string, fallback: string): string {
  const leaf = asset.split('/').pop();
  if (!leaf || /^\d|^(?:Helmet|Gloves|Boots|Body|1H|2H)/i.test(leaf)) return fallback;
  return leaf.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function normalizeLocalizedText(value: string): string {
  return value
    .replace(/\[([^|\]]+)\|([^\]]+)\]/g, '$2')
    .replace(/\r?\n/g, ' ')
    .replace(/[：]/g, ':')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchTemplate(source: string, template: string): string[] | undefined {
  const parts = template.split('#');
  const pattern = parts
    .map((part) => escapeRegExp(part))
    .join('([-+]?\\d+(?:\\.\\d+)?)');
  const match = source.match(new RegExp(`^${pattern}$`, 'i'));
  return match?.slice(1);
}

function renderTemplate(template: string, values: string[]): string {
  let index = 0;
  return template.replace(/([+-]?)#/g, (_match, sign: string) => {
    const value = values[index++] ?? '#';
    return sign && value.startsWith(sign) ? value : `${sign}${value}`;
  });
}

function renderJewelTemplate(template: string, values: number[]): string | undefined {
  let index = 0;
  const ranged = template.replace(
    /\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g,
    () => String(values[index++] ?? Number.NaN),
  );
  const rendered = ranged.replace(/#/g, () => String(values[index++] ?? Number.NaN));
  if (index !== values.length || rendered.includes('NaN')) return undefined;
  return rendered;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
