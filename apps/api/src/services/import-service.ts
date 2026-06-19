import { randomUUID } from 'node:crypto';

import {
  BuildXmlAdapter,
  PoeNinjaAdapter,
  WeGameAdapter,
  createConversionReport,
  normalizeWeGame,
} from '@pobd/adapters';
import type {
  BaselineSnapshot,
  ConversionReport,
  ImportResult,
  NormalizedBuild,
} from '@pobd/schemas';

export interface BaselineComputer {
  computeBaseline(input: {
    buildXml: string;
    source: BaselineSnapshot['source'];
    character?: BaselineSnapshot['character'];
    league?: string;
  }): Promise<BaselineSnapshot>;
}

export interface StoredImport extends ImportResult {
  buildXml?: string;
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

  async importUrl(url: string): Promise<ImportResult> {
    if (this.wegameAdapter.isWeGameLink(url)) {
      return this.importWeGame(url);
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

  private async importWeGame(url: string): Promise<ImportResult> {
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

  private normalizedFromBaseline(
    baseline: BaselineSnapshot,
    source: NormalizedBuild['source'],
  ): NormalizedBuild {
    const dpsByNumber = new Map(baseline.skillDpsList.map((skill) => [skill.skillNumber, skill]));
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
      skills: baseline.skillGroups.map((group, index) => ({
        id: String(group.groupId ?? index + 1),
        name: group.label ?? group.skills?.[0] ?? `技能组 ${index + 1}`,
        supports: (group.skills ?? []).slice(1).map((name) => ({ name })),
        tags: [],
      })),
      skillDps: baseline.skillDpsList.map((skill) => ({
        skillId: String(skill.skillNumber),
        skillName: skill.name,
        dps: skill.dps,
        source: 'pob',
      })),
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
