import { randomUUID } from 'node:crypto';

import {
  BuildXmlAdapter,
  MappingCatalog,
  PoeNinjaAdapter,
  WeGameAdapter,
  convertWeGameToCanonical,
  type CanonicalWeGameCharacter,
  createConversionReport,
  normalizeWeGame,
} from '@pobd/adapters';
import type {
  BaselineSnapshot,
  ConversionReport,
  ImportResult,
  NormalizedBuild,
  EquipmentSlot,
  AnalysisStage,
} from '@pobd/schemas';

export interface BaselineComputer {
  computeBaseline(input: {
    buildXml: string;
    source: BaselineSnapshot['source'];
    character?: BaselineSnapshot['character'];
    league?: string;
  }): Promise<BaselineSnapshot>;
  getWeGameCatalog?(): Promise<MappingCatalog>;
  convertWeGame?(input: {
    character: CanonicalWeGameCharacter;
    catalogHash: string;
  }): Promise<{
    buildXml: string;
    baseline: BaselineSnapshot;
    validation: {
      roundTripValid: boolean;
      baselineValid: boolean;
      mainSkillValid: boolean;
    };
  }>;
}

export interface StoredImport extends ImportResult {
  buildXml?: string;
}

export type ImportProgress = (stage: AnalysisStage, message: string) => void;

/** Authoritative slot mapping from PoB2 ImportTab.lua:1149 */
const WEGAME_TO_POB2_SLOT: Record<string, string> = {
  Weapon: 'Weapon 1',
  Offhand: 'Weapon 2',
  Weapon2: 'Weapon 1 Swap',
  Offhand2: 'Weapon 2 Swap',
  Helm: 'Helmet',
  BodyArmour: 'Body Armour',
  Gloves: 'Gloves',
  Boots: 'Boots',
  Amulet: 'Amulet',
  Ring: 'Ring 1',
  Ring2: 'Ring 2',
  Ring3: 'Ring 3',
  Belt: 'Belt',
};

/** Reverse: PoB2 slot name → WeGame inventoryId, built from the authoritative map */
const POB2_TO_WEGAME_SLOT: Record<string, string> = {};
for (const [wegame, pob2] of Object.entries(WEGAME_TO_POB2_SLOT)) {
  POB2_TO_WEGAME_SLOT[pob2] ??= wegame;
}

export class ImportService {
  private readonly imports = new Map<string, StoredImport>();
  private readonly buildAdapter = new BuildXmlAdapter();
  private readonly wegameAdapter: WeGameAdapter;
  private readonly poeNinjaAdapter: PoeNinjaAdapter;

  constructor(
    private readonly baselineComputer: BaselineComputer,
    options?: { wegameAdapter?: WeGameAdapter; poeNinjaAdapter?: PoeNinjaAdapter },
  ) {
    this.wegameAdapter = options?.wegameAdapter ?? new WeGameAdapter();
    this.poeNinjaAdapter = options?.poeNinjaAdapter ?? new PoeNinjaAdapter();
  }

  get(id: string): StoredImport | undefined {
    return this.imports.get(id);
  }

  async importBuildXml(buildXml: string): Promise<ImportResult> {
    const id = randomUUID();
    const parsed = await this.buildAdapter.parseBuildXml(buildXml);
    const baseline = await this.baselineComputer.computeBaseline({
      buildXml,
      source: 'build_file',
      character: parsed.character,
    });
    this.mergeParsedItems(baseline, parsed.items ?? []);
    if (baseline.skillGroups.length === 0 && parsed.skillGroups) {
      baseline.skillGroups = parsed.skillGroups;
    }
    const normalizedBuild = this.normalizedFromBaseline(baseline, 'build_file');
    const result: StoredImport = {
      id,
      source: 'build_file',
      status: 'calculable',
      normalizedBuild,
      baseline,
      buildXml,
      conversionReport: this.completeReport(),
      warnings: [],
    };
    this.imports.set(id, result);
    return this.publicResult(result);
  }

  async importUrl(url: string, onProgress?: ImportProgress): Promise<ImportResult> {
    if (this.wegameAdapter.isWeGameLink(url)) {
      return this.importWeGame(url, onProgress);
    }
    if (this.poeNinjaAdapter.isPoeNinjaLink(url)) {
      return this.importPoeNinja(url);
    }
    throw new Error('仅支持 WeGame 或 poe.ninja 的角色链接');
  }

  private async importPoeNinja(url: string): Promise<ImportResult> {
    const id = randomUUID();
    const fetched = await this.poeNinjaAdapter.fetchBuild(url);
    const characterData = fetched.character.character as Record<string, unknown> | undefined;
    const ref = this.poeNinjaAdapter.parseCharacterUrl(url);
    const baseline = await this.baselineComputer.computeBaseline({
      buildXml: fetched.buildXml,
      source: 'poe_ninja',
      league: ref.league,
      character: {
        name: ref.name,
        level: this.numberValue(characterData?.level),
        className: this.stringValue(characterData?.class),
        ascendancyName: this.stringValue(characterData?.ascendancy),
      },
    });
    const parsed = await this.buildAdapter.parseBuildXml(fetched.buildXml);
    this.mergeParsedItems(baseline, parsed.items ?? []);
    const result: StoredImport = {
      id,
      source: 'poe_ninja',
      status: 'calculable',
      baseline,
      buildXml: fetched.buildXml,
      normalizedBuild: this.normalizedFromBaseline(baseline, 'poe_ninja'),
      conversionReport: this.completeReport(),
      warnings: [],
    };
    this.imports.set(id, result);
    return this.publicResult(result);
  }

  private async importWeGame(url: string, onProgress?: ImportProgress): Promise<ImportResult> {
    const id = randomUUID();
    const fetched = await this.wegameAdapter.fetchWeGameBuild(url);
    const displayBuild = normalizeWeGame(fetched);
    const displayEquipments = displayBuild.equipments;
    if (!this.baselineComputer.getWeGameCatalog || !this.baselineComputer.convertWeGame) {
      const report = createConversionReport();
      report.status = 'blocked';
      report.blockers.push({
        code: 'catalog_refresh_failed',
        category: 'catalog',
        source: 'local-runtime',
        reason: 'WeGame → PoB2 native bridge is unavailable',
      });
      return this.storeWeGameResult({
        id,
        status: 'normalized',
        normalizedBuild: displayBuild,
        conversionReport: report,
        warnings: displayBuild.warnings,
      });
    }

    onProgress?.('refresh_mapping_catalog', '刷新并校验 PoB2 映射目录');
    let catalog: MappingCatalog;
    try {
      catalog = await this.baselineComputer.getWeGameCatalog();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const report = createConversionReport();
      report.status = 'blocked';
      report.blockers.push({
        code: 'catalog_refresh_failed',
        category: 'catalog',
        source: 'mapping-catalog',
        reason,
      });
      return this.storeWeGameResult({
        id,
        status: 'normalized',
        normalizedBuild: displayBuild,
        conversionReport: report,
        warnings: [...displayBuild.warnings, reason],
      });
    }
    onProgress?.('map_wegame_metadata', '精确映射 WeGame 装备、技能、词条与天赋');
    const conversion = convertWeGameToCanonical({
      roleInfo: fetched.roleInfo,
      equipments: fetched.equipments as Record<string, unknown>[],
      skills: fetched.skills as Record<string, unknown>[],
      talentTree: fetched.talentTree as Record<string, unknown> & { hashes: number[] },
      jewels: fetched.jewels,
      roleKeyData: fetched.roleKeyData,
    }, catalog);
    if (conversion.report.status !== 'complete') {
      return this.storeWeGameResult({
        id,
        status: 'normalized',
        normalizedBuild: displayBuild,
        conversionReport: conversion.report,
        warnings: [
          ...displayBuild.warnings,
          ...conversion.report.blockers.map((blocker) => blocker.reason),
        ],
      });
    }

    try {
      onProgress?.('validate_pob2_import', '通过 PoB2 原生导入并执行 SaveDB/reload 校验');
      const native = await this.baselineComputer.convertWeGame({
        character: conversion.character,
        catalogHash: catalog.hash,
      });
      conversion.report.pobValidation = native.validation;
      onProgress?.('compute_baselines', '读取 PoB2 重算 baseline');
      conversion.report.status = Object.values(native.validation).every(Boolean)
        ? 'complete'
        : 'validation_failed';
      if (conversion.report.status !== 'complete') {
        conversion.report.blockers.push({
          code: 'round_trip_mismatch',
          category: 'validation',
          source: conversion.character.name,
          reason: 'PoB2 SaveDB/reload validation failed',
        });
      }
      const normalizedBuild = this.normalizedFromBaseline(native.baseline, 'wegame');
      this.mergeDisplayEquipments(normalizedBuild, displayEquipments);
      return this.storeWeGameResult({
        id,
        status: conversion.report.status === 'complete' ? 'calculable' : 'normalized',
        normalizedBuild,
        baseline: conversion.report.status === 'complete' ? native.baseline : undefined,
        buildXml: native.buildXml,
        conversionReport: conversion.report,
        warnings: normalizedBuild.warnings,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      conversion.report.status = 'validation_failed';
      conversion.report.blockers.push({
        code: reason.startsWith('round_trip_mismatch')
          ? 'round_trip_mismatch'
          : 'pob_import_failed',
        category: 'validation',
        source: conversion.character.name,
        reason,
      });
      return this.storeWeGameResult({
        id,
        status: 'normalized',
        normalizedBuild: displayBuild,
        conversionReport: conversion.report,
        warnings: [...displayBuild.warnings, reason],
      });
    }
  }

  private async importWeGameLegacy(url: string): Promise<ImportResult> {
    const id = randomUUID();
    const fetched = await this.wegameAdapter.fetchWeGameBuild(url);
    const normalizedBuild = normalizeWeGame(fetched);
    const warning =
      'WeGame 数据已接入展示，但当前本地 metadata 映射不足以生成可由 PoB2 验证的 Build；模拟功能已禁用。';
    const report = createConversionReport();
    report.status = 'partial';
    report.warnings.push(warning);
    const result: StoredImport = {
      id,
      source: 'wegame',
      status: 'normalized',
      normalizedBuild,
      conversionReport: report,
      warnings: [...normalizedBuild.warnings, warning],
    };
    this.imports.set(id, result);
    return this.publicResult(result);
  }

  private storeWeGameResult(
    result: Omit<StoredImport, 'source'> & { source?: 'wegame' },
  ): ImportResult {
    const stored: StoredImport = { ...result, source: 'wegame' };
    this.imports.set(stored.id, stored);
    return this.publicResult(stored);
  }

  private normalizedFromBaseline(
    baseline: BaselineSnapshot,
    source: NormalizedBuild['source'],
  ): NormalizedBuild {
    const dpsByNumber = new Map(baseline.skillDpsList.map((skill) => [skill.skillNumber, skill]));
    const selectedSkillNumber = baseline.mainSkillSelection.selectedSkillNumber;
    const selectedSkillName = baseline.mainSkillSelection.selectedSkillName;
    const combinedDps = baseline.calcsOutput.CombinedDPS;
    const selectedDps =
      typeof combinedDps === 'number' && Number.isFinite(combinedDps)
        ? combinedDps
        : undefined;
    return {
      source,
      meta: {
        fetchedAt: new Date().toISOString(),
        gameVersion: baseline.gameVersion,
        sourceVersion: baseline.pob2Version,
        confidence: 1,
      },
      character: {
        name: baseline.character.name,
        level: baseline.character.level,
        className: baseline.character.className,
        ascendancy: baseline.character.ascendancyName,
      },
      skills: baseline.skillGroups.map((group, index) => {
        const groupNumber = group.groupId ?? index + 1;
        const listedName = dpsByNumber.get(groupNumber)?.name;
        const name =
          ImportService.nonEmpty(group.label)
            ? group.label
            : groupNumber === selectedSkillNumber
              ? selectedSkillName
              : ImportService.nonEmpty(listedName)
                ? listedName
                : group.skills?.[0] ?? `技能组 ${index + 1}`;
        return {
          id: String(groupNumber),
          name,
          supports: (group.skills ?? []).slice(1).map((supportName) => ({ name: supportName })),
          tags: [],
        };
      }),
      skillDps: baseline.skillDpsList.map((skill) => {
        const selected = skill.skillNumber === selectedSkillNumber;
        return {
          skillId: String(skill.skillNumber),
          skillName: selected ? selectedSkillName : skill.name,
          dps: selected ? selectedDps ?? skill.dps : skill.dps,
          source: 'pob',
        };
      }),
      equipments: baseline.items.map((item) => ({
        slotName: item.slotName,
        item: {
          id: String(item.itemId),
          name: item.name,
          baseType: item.baseType,
          rawText: item.rawText,
        },
      })),
      weaponSets: [
        { id: 1, offhandEmpty: !baseline.items.some((item) => /offhand/i.test(item.slotName)) },
        { id: 2, offhandEmpty: true },
      ],
      passives: baseline.passiveNodes.map((id) => ({ id })),
      jewels: baseline.jewels.map((jewel) => ({
        id: jewel.itemId === undefined ? undefined : String(jewel.itemId),
        slotName: jewel.slotName,
        passiveNodes: jewel.passiveNodes,
      })),
      panel: this.panelFromCalcs(baseline.calcsOutput),
      warnings: dpsByNumber.size === 0 ? ['PoB2 未返回技能 DPS。'] : [],
    };
  }

  private static nonEmpty(value: string | undefined | null): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private mergeDisplayEquipments(
    build: NormalizedBuild,
    displayEquipments: EquipmentSlot[],
  ): void {
    const displayBySlot = new Map<string, EquipmentSlot>();
    for (const slot of displayEquipments) {
      if (!displayBySlot.has(slot.slotName) && slot.item) {
        displayBySlot.set(slot.slotName, slot);
      }
    }

    for (const equipment of build.equipments) {
      let display = displayBySlot.get(equipment.slotName);

      if (!display) {
        const wegameId = POB2_TO_WEGAME_SLOT[equipment.slotName];
        if (wegameId) {
          display = displayBySlot.get(wegameId) ?? undefined;
        }
      }

      if (!display?.item) continue;

      const di = display.item;
      const existing = equipment.item ?? { name: '', baseType: '' };

      equipment.item = {
        ...existing,
        ...di,
        id: existing.id ?? di.id,
        rawText: existing.rawText ?? di.rawText,
        name: ImportService.nonEmpty(di.name) ? di.name : (existing.name ?? ''),
        baseType: ImportService.nonEmpty(di.baseType) ? di.baseType : (existing.baseType ?? ''),
      };
    }
  }

  private panelFromCalcs(calcs: Record<string, unknown>): NormalizedBuild['panel'] {
    const number = (key: string): number | undefined =>
      typeof calcs[key] === 'number' ? (calcs[key] as number) : undefined;
    return {
      life: number('Life'),
      energyShield: number('EnergyShield'),
      armour: number('Armour'),
      evasion: number('Evasion'),
      blockChance: number('BlockChance'),
      resistances: {
        fire: number('FireResist') ?? 0,
        cold: number('ColdResist') ?? 0,
        lightning: number('LightningResist') ?? 0,
        chaos: number('ChaosResist') ?? 0,
      },
    };
  }

  private completeReport(): ConversionReport {
    return createConversionReport();
  }

  private publicResult(result: StoredImport): ImportResult {
    const { buildXml: _buildXml, ...publicResult } = result;
    return publicResult;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private mergeParsedItems(
    baseline: BaselineSnapshot,
    parsedItems: NonNullable<Awaited<ReturnType<BuildXmlAdapter['parseBuildXml']>>['items']>,
  ): void {
    if (parsedItems.length === 0) return;
    baseline.items = parsedItems.map((parsed) => {
      const computed = baseline.items.find((item) => item.slotName === parsed.slotName);
      return {
        ...computed,
        ...parsed,
      };
    });
  }
}
