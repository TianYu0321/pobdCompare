import type {
  ConversionReport,
  MappingBlocker,
  MappingEvidence,
} from '@pobd/schemas';

import { createConversionReport } from './conversion-report';
import type { FailureCorpus } from '../mod-verification-service';
import { MappingCatalog } from './mapping-catalog';

type AnyRecord = Record<string, unknown>;

export interface WeGameConversionInput {
  roleInfo: {
    name: string;
    level: number;
    class_id: number;
    class_name: string;
    league_id: string;
  };
  equipments: AnyRecord[];
  skills: AnyRecord[];
  talentTree: AnyRecord & { hashes: number[] };
  jewels: unknown;
  roleKeyData: AnyRecord;
}

export interface CanonicalWeGameCharacter {
  name: string;
  level: number;
  class: string;
  league: string;
  equipment: AnyRecord[];
  skills: AnyRecord[];
  jewels: AnyRecord[];
  passives: {
    hashes: number[];
    specialisations: Record<string, number[]>;
    skill_overrides: Record<string, AnyRecord>;
    jewel_data: Record<string, AnyRecord>;
    quest_stats: string[];
    alternate_ascendancy?: number;
  };
  mainSkillHint?: string;
}

export interface WeGameConversionResult {
  character: CanonicalWeGameCharacter;
  report: ConversionReport;
  pendingModVerifications?: Array<{
    modId: string;
    zhTemplate: string;
    enLine: string;
    itemBaseType: string;
    generationType: string;
  }>;
}

const CLASS_OVERRIDES: Record<number, string> = {
  0: 'Martial Artist',
};

const ASCENDANCY_OVERRIDES: Record<string, number> = {
  'Martial Artist': 1,
  Invoker: 2,
  'Acolyte of Chayula': 3,
};

export function convertWeGameToCanonical(
  input: WeGameConversionInput,
  catalog: MappingCatalog,
  failureCorpus?: FailureCorpus,
): WeGameConversionResult {
  const report = createConversionReport();
  report.catalogHash = catalog.hash;
  const equipment: AnyRecord[] = [];
  const skills: AnyRecord[] = [];
  const pendingModVerifications: Array<{
    modId: string;
    zhTemplate: string;
    enLine: string;
    itemBaseType: string;
    generationType: string;
  }> = [];

  for (const raw of input.equipments) {
    if (stringValue(raw.inventoryId) === 'Chakra') continue;
    const mapped = catalog.mapItem({
      baseType: stringValue(raw.baseType),
      typeLine: stringValue(raw.typeLine),
      name: stringValue(raw.name),
      icon: stringValue(raw.icon),
      frameType: numberValue(raw.frameType),
    });
    report.itemTotal += 1;
    if (!mapped) {
      addBlocker(report, {
        code: 'unknown_item',
        category: 'item',
        source: stringValue(raw.baseType) ?? stringValue(raw.typeLine) ?? 'unknown',
        reason: 'No exact item base/unique mapping',
        sourceId: stringValue(raw.id),
      });
      continue;
    }
    const converted = convertItem(raw, mapped.baseType, mapped.name, catalog, report, failureCorpus, pendingModVerifications);
    if (!converted) continue;
    equipment.push(converted);
    report.itemMapped += 1;
    addEvidence(report, {
      category: 'item',
      source: stringValue(raw.baseType) ?? mapped.baseType,
      target: mapped.name ? `${mapped.name}, ${mapped.baseType}` : mapped.baseType,
      strategy: mapped.strategy,
      sourceId: stringValue(raw.id),
    });
  }

  for (const raw of input.skills) {
    const mapped = catalog.mapSkill({
      typeLine: stringValue(raw.typeLine),
      baseType: stringValue(raw.baseType),
      gemSkill: stringValue(raw.gemSkill),
      icon: stringValue(raw.icon),
      iconTierText: stringValue(raw.iconTierText),
    });
    report.skillTotal += 1;
    if (!mapped) {
      addBlocker(report, {
        code: 'unknown_skill',
        category: 'skill',
        source: stringValue(raw.typeLine) ?? stringValue(raw.baseType) ?? 'unknown',
        reason: 'No exact skill asset mapping',
        sourceId: stringValue(raw.id),
      });
      continue;
    }
    const supports: AnyRecord[] = [];
    for (const support of arrayValue(raw.socketedItems)) {
      if (!isRecord(support)) continue;
      const supportMapped = catalog.mapSkill({
        typeLine: stringValue(support.typeLine),
        baseType: stringValue(support.baseType),
        gemSkill: stringValue(support.gemSkill),
        icon: stringValue(support.icon),
        iconTierText: stringValue(support.iconTierText),
      });
      report.skillTotal += 1;
      if (!supportMapped) {
        addBlocker(report, {
          code: 'unknown_skill',
          category: 'skill',
          source: stringValue(support.typeLine) ?? 'unknown support',
          reason: 'No exact support asset/tier mapping',
          sourceId: stringValue(support.id),
        });
        continue;
      }
      supports.push(convertSkill(support, supportMapped.name, supportMapped.gameId, true));
      report.skillMapped += 1;
      addEvidence(report, {
        category: 'skill',
        source: stringValue(support.typeLine) ?? supportMapped.name,
        target: supportMapped.name,
        strategy: supportMapped.strategy,
        sourceId: stringValue(support.id),
      });
    }
    skills.push({
      ...convertSkill(raw, mapped.name, mapped.gameId, false),
      socketedItems: supports,
    });
    report.skillMapped += 1;
    addEvidence(report, {
      category: 'skill',
      source: stringValue(raw.typeLine) ?? mapped.name,
      target: mapped.name,
      strategy: mapped.strategy,
      sourceId: stringValue(raw.id),
    });
  }

  const passiveHashes: number[] = [];
  for (const nodeId of input.talentTree.hashes ?? []) {
    report.passiveTotal += 1;
    const evidence = catalog.mapPassive(nodeId);
    if (!evidence) {
      addBlocker(report, {
        code: 'unknown_passive',
        category: 'passive',
        source: String(nodeId),
        reason: 'Node is absent from current PoB2 TreeData',
        sourceId: String(nodeId),
      });
      continue;
    }
    passiveHashes.push(nodeId);
    report.passiveMapped += 1;
    addEvidence(report, evidence);
  }

  const className = CLASS_OVERRIDES[input.roleInfo.class_id];
  if (!className) {
    addBlocker(report, {
      code: 'unknown_character_class',
      category: 'character',
      source: `${input.roleInfo.class_id}:${input.roleInfo.class_name}`,
      reason: 'No versioned WeGame class mapping',
    });
  }

  const character: CanonicalWeGameCharacter = {
    name: input.roleInfo.name,
    level: input.roleInfo.level,
    class: className ?? input.roleInfo.class_name,
    league: input.roleInfo.league_id,
    equipment,
    skills,
    jewels: convertJewels(
      input.jewels,
      recordValue(input.talentTree.jewel_data),
      catalog,
      report,
      failureCorpus,
    ),
    passives: {
      hashes: passiveHashes,
      specialisations: numberArrayRecord(input.talentTree.specialisations),
      skill_overrides: normalizeAttributeOverrides(input.talentTree.skill_overrides),
      jewel_data: recordValue(input.talentTree.jewel_data),
      quest_stats: stringArray(input.talentTree.quest_stats),
      alternate_ascendancy: ASCENDANCY_OVERRIDES[input.roleInfo.class_name] ?? 0,
    },
    mainSkillHint: extractMainSkillHint(input.roleKeyData),
  };
  report.status = report.blockers.length > 0 ? 'blocked' : 'complete';
  return { character, report, pendingModVerifications };
}

function convertItem(
  raw: AnyRecord,
  baseType: string,
  mappedName: string | undefined,
  catalog: MappingCatalog,
  report: ConversionReport,
  failureCorpus?: FailureCorpus,
  pendingModVerifications?: Array<{
    modId: string;
    zhTemplate: string;
    enLine: string;
    itemBaseType: string;
    generationType: string;
  }>,
): AnyRecord | undefined {
  const converted: AnyRecord = {
    ...raw,
    name: mappedName ?? stringValue(raw.name) ?? '',
    typeLine: baseType,
    baseType,
    properties: translateProperties(arrayValue(raw.properties)),
    requirements: translateRequirements(arrayValue(raw.requirements)),
  };
  for (const key of [
    'enchantMods',
    'runeMods',
    'implicitMods',
    'explicitMods',
    'fracturedMods',
    'desecratedMods',
    'mutatedMods',
    'craftedMods',
  ]) {
    const lines = stringArray(raw[key]);
    const mappedLines: string[] = [];
    for (const line of lines) {
      report.modTotal += 1;
      report.modStats.total += 1;
      const mapped = catalog.mapMod(line, key);
      if (!mapped) {
        report.modStats.unknown += 1;
        failureCorpus?.record('No unique exact trade template hash', line);
        addBlocker(report, {
          code: 'unknown_mod',
          category: 'mod',
          source: line,
          reason: 'No unique exact trade template hash',
          sourceId: stringValue(raw.id),
        });
        continue;
      }
      mappedLines.push(mapped.line);
      report.modMapped += 1;
      report.modStats.mapped += 1;
      if (mapped.status === 'verified_by_pob2') {
        report.modStats.verified += 1;
      } else {
        report.modStats.unverified += 1;
        pendingModVerifications?.push({
          modId: mapped.id,
          zhTemplate: line,
          enLine: mapped.line,
          itemBaseType: baseType,
          generationType: key,
        });
      }
      addEvidence(report, {
        category: 'mod',
        source: line,
        target: mapped.line,
        strategy: mapped.strategy,
        sourceId: mapped.id,
      });
    }
    if (lines.length > 0) converted[key] = mappedLines;
  }
  return converted;
}

function convertSkill(raw: AnyRecord, name: string, gameId: string, support: boolean): AnyRecord {
  return {
    ...raw,
    name: '',
    baseType: name,
    typeLine: name,
    gameId,
    support,
    properties: translateProperties(arrayValue(raw.properties)),
    requirements: translateRequirements(arrayValue(raw.requirements)),
  };
}

function translateProperties(values: unknown[]): AnyRecord[] {
  return values.filter(isRecord).map((property) => ({
    ...property,
    name: propertyName(property),
  }));
}

function translateRequirements(values: unknown[]): AnyRecord[] {
  return values.filter(isRecord).map((requirement) => ({
    ...requirement,
    name: numberValue(requirement.type) === 62 ? 'Level' : propertyName(requirement),
  }));
}

function propertyName(property: AnyRecord): string {
  const type = numberValue(property.type);
  if (type === 5) return 'Level';
  if (type === 6) return 'Quality';
  const raw = stringValue(property.name) ?? '';
  const tag = raw.match(/^\[([^|\]]+)\|/i)?.[1];
  const known: Record<string, string> = {
    Armour: 'Armour',
    Evasion: 'Evasion Rating',
    EnergyShield: 'Energy Shield',
    Ward: 'Ward',
    Radius: 'Radius',
  };
  return tag ? known[tag] ?? tag : raw;
}

function normalizeAttributeOverrides(value: unknown): Record<string, AnyRecord> {
  const result: Record<string, AnyRecord> = {};
  for (const [id, raw] of Object.entries(recordValue(value))) {
    if (!isRecord(raw)) continue;
    let name = stringValue(raw.name) ?? '';
    if (numberValue(raw.grantedStrength)) name = 'Strength';
    else if (numberValue(raw.grantedDexterity)) name = 'Dexterity';
    else if (numberValue(raw.grantedIntelligence)) name = 'Intelligence';
    result[id] = { ...raw, name };
  }
  return result;
}

function convertJewels(
  value: unknown,
  jewelData: Record<string, AnyRecord>,
  catalog: MappingCatalog,
  report: ConversionReport,
  failureCorpus?: FailureCorpus,
): AnyRecord[] {
  const wrappers = parseJewelWrappers(value);
  const socketIndexes = Object.keys(jewelData)
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (wrappers.length !== socketIndexes.length) {
    addBlocker(report, {
      code: 'unknown_item',
      category: 'jewel',
      source: `${wrappers.length}:${socketIndexes.length}`,
      reason: 'WeGame jewel items do not match passive jewel socket metadata',
    });
    return [];
  }

  const converted: AnyRecord[] = [];
  wrappers.forEach((wrapper, index) => {
    const raw = isRecord(wrapper.jewel) ? wrapper.jewel : {};
    const metadataId = stringValue(raw.id);
    const base = metadataId && catalog.mapJewelBase(metadataId);
    if (!metadataId || !base) {
      addBlocker(report, {
        code: 'unknown_item',
        category: 'jewel',
        source: metadataId ?? stringValue(raw.name) ?? 'unknown jewel',
        reason: 'No exact PoB2 jewel base mapping',
      });
      return;
    }

    const explicitMods: string[] = [];
    let blocked = false;
    for (const mod of arrayValue(raw.mod_values).filter(isRecord)) {
      const modId = stringValue(mod.id);
      const values = arrayValue(mod.values)
        .map(Number)
        .filter(Number.isFinite);
      const mapped = modId && catalog.mapJewelMod(modId, values);
      if (!modId || !mapped) {
        blocked = true;
        failureCorpus?.record('No exact ModJewel ID/value mapping', modId ?? 'unknown jewel mod');
        addBlocker(report, {
          code: 'unknown_mod',
          category: 'jewel',
          source: modId ?? 'unknown jewel mod',
          reason: 'No exact ModJewel ID/value mapping',
          sourceId: metadataId,
        });
        continue;
      }
      explicitMods.push(mapped.line);
      addEvidence(report, {
        category: 'jewel',
        source: modId,
        target: mapped.line,
        strategy: mapped.strategy,
        sourceId: metadataId,
      });
    }
    if (blocked) return;
    const socketMetadata = jewelData[String(socketIndexes[index])] ?? {};
    const socketEffect = catalog.mapJewelSocketEffect(socketMetadata);
    if (numberValue(socketMetadata.radiusMin) !== undefined && !socketEffect) {
      addBlocker(report, {
        code: 'unknown_mod',
        category: 'jewel',
        source: JSON.stringify(socketMetadata),
        reason: 'No exact PoB2 jewel radius effect mapping',
        sourceId: metadataId,
      });
      return;
    }
    if (socketEffect) {
      explicitMods.push(...socketEffect.modLines);
      addEvidence(report, {
        category: 'jewel',
        source: JSON.stringify(socketMetadata),
        target: socketEffect.modLines.join('; '),
        strategy: socketEffect.strategy,
        sourceId: metadataId,
      });
    }

    converted.push({
      id: stringValue(wrapper.socket_id) ?? metadataId,
      inventoryId: 'PassiveJewels',
      x: socketIndexes[index],
      frameType: numberValue(raw.rarity) ?? 0,
      name: stringValue(raw.display_name) ?? '',
      typeLine: base.baseType,
      baseType: base.baseType,
      ilvl: 1,
      properties: socketEffect
        ? [{ name: 'Radius', values: [[socketEffect.radiusLabel, 0]] }]
        : [],
      explicitMods,
    });
    addEvidence(report, {
      category: 'jewel',
      source: metadataId,
      target: base.baseType,
      strategy: base.strategy,
      sourceId: stringValue(wrapper.socket_id),
    });
  });
  return converted;
}

function parseJewelWrappers(value: unknown): AnyRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  const raw = value.jewel_data;
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function extractMainSkillHint(value: AnyRecord): string | undefined {
  const skills = arrayValue(value.skills).filter(isRecord);
  const source = stringValue(skills[0]?.name);
  const exactNames: Record<string, string> = {
    player_ranged_spear: 'Spear Throw',
    player_melee_spear_no_offhand: 'Spear Stab',
  };
  return source ? exactNames[source] ?? source : undefined;
}

function addEvidence(report: ConversionReport, evidence: MappingEvidence): void {
  report.mapped.push(evidence);
}

function addBlocker(report: ConversionReport, blocker: MappingBlocker): void {
  report.blockers.push(blocker);
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, AnyRecord> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, AnyRecord] =>
    isRecord(entry[1])));
}

function numberArrayRecord(value: unknown): Record<string, number[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, raw]) => [
    key,
    Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [],
  ]));
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return arrayValue(value).filter((entry): entry is string => typeof entry === 'string');
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
