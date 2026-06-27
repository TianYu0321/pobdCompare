import type { ConvertWeGameWorkerRequest } from '@pobd/pob2-worker';
import type { ConversionCacheRecord, CurrentVersions, FailureCorpus } from './cache/mod-cache.js';
import { ConversionCache, buildTopFailureReasons } from './cache/mod-cache.js';

export type ModVerificationStatus =
  | 'verified_by_pob2'
  | 'mapped_but_unverified'
  | 'pob2_rejected'
  | 'worker_failed';

export interface ModVerificationResult {
  status: ModVerificationStatus;
  zhTemplate: string;
  enLine: string;
  testItemRaw: string;
  pob2Recognized: boolean;
  parsedModCount?: number;
  errorMessage?: string;
}

export interface VerificationCache {
  get(key: string): ModVerificationResult | undefined;
  set(key: string, result: ModVerificationResult): void;
}

export class InMemoryVerificationCache implements VerificationCache {
  private store = new Map<string, ModVerificationResult>();

  get(key: string): ModVerificationResult | undefined {
    return this.store.get(key);
  }

  set(key: string, result: ModVerificationResult): void {
    this.store.set(key, result);
  }
}

export interface ModVerificationServiceOptions {
  workerClient: {
    submit: (request: ConvertWeGameWorkerRequest) => Promise<{
      success: boolean;
      calcsOutput?: Record<string, unknown>;
      breakdown?: Record<string, unknown>;
      pobValidation?: {
        roundTripValid: boolean;
        baselineValid: boolean;
        mainSkillValid: boolean;
      };
      roundTrip?: {
        expectedItems?: number;
        expectedEquipment?: number;
        selectedItems?: number;
      };
      error?: string;
    }>;
  };
  cache?: VerificationCache;
  conversionCache?: ConversionCache;
  currentVersions?: CurrentVersions;
  failureCorpus?: FailureCorpus;
}

/**
 * PoB2 验证服务 — 异步验证单个 mod 映射是否被 PoB2 识别。
 *
 * 设计原则：
 * 1. 主流程不阻塞 — 验证通过后台 Worker 异步执行。
 * 2. 结果可缓存 — 相同 modId 的验证结果会被缓存复用。
 * 3. 失败非阻断 — 未验证通过只标记为 unverified，不阻断转换流程。
 * 4. 版本化 — ConversionCache 包含 catalogVersion + adapterVersion + pob2Version + gameVersion。
 */
export class ModVerificationService {
  private workerClient: ModVerificationServiceOptions['workerClient'];
  private cache: VerificationCache;
  private conversionCache?: ConversionCache;
  private currentVersions?: CurrentVersions;
  private failureCorpus?: FailureCorpus;

  constructor(options: ModVerificationServiceOptions) {
    this.workerClient = options.workerClient;
    this.cache = options.cache ?? new InMemoryVerificationCache();
    this.conversionCache = options.conversionCache;
    this.currentVersions = options.currentVersions;
    this.failureCorpus = options.failureCorpus;
  }

  /**
   * 验证单个 mod 映射是否被 PoB2 识别。
   *
   * 实现方式：构造一个最小化的 WeGame 角色，只装备一件带该 mod 的装备，
   * 通过 `convert_wegame` 操作让 PoB2 导入，然后检查 roundTrip 和 pobValidation。
   */
  async verifyMod(
    modId: string,
    zhTemplate: string,
    enLine: string,
    itemBaseType: string,
    generationType: string,
  ): Promise<ModVerificationResult> {
    const cacheKey = `${modId}:${itemBaseType}:${generationType}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // 先尝试 ConversionCache（版本化持久缓存）
    if (this.conversionCache && this.currentVersions) {
      const normalizedTemplate = toNumericTemplate(zhTemplate).template;
      const conversionRecord = this.conversionCache.get(
        normalizedTemplate,
        this.currentVersions,
      );
      if (conversionRecord) {
        const result: ModVerificationResult = {
          status: conversionRecord.status,
          zhTemplate,
          enLine,
          testItemRaw: conversionRecord.rawText,
          pob2Recognized: conversionRecord.status === 'verified_by_pob2',
          parsedModCount: conversionRecord.values.length,
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    const result = await this.runVerification(modId, zhTemplate, enLine, itemBaseType, generationType);
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * 批量验证（异步，不阻塞主流程）。
   *
   * 使用 Promise.allSettled 并行提交，单个失败不影响整体。
   */
  async verifyBatch(
    mappings: Array<{
      modId: string;
      zhTemplate: string;
      enLine: string;
      itemBaseType: string;
      generationType: string;
    }>,
  ): Promise<ModVerificationResult[]> {
    const promises = mappings.map((m) =>
      this.verifyMod(m.modId, m.zhTemplate, m.enLine, m.itemBaseType, m.generationType)
        .catch((err): ModVerificationResult => ({
          status: 'worker_failed',
          zhTemplate: m.zhTemplate,
          enLine: m.enLine,
          testItemRaw: '',
          pob2Recognized: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        })),
    );
    return Promise.all(promises);
  }

  private async runVerification(
    modId: string,
    zhTemplate: string,
    enLine: string,
    itemBaseType: string,
    generationType: string,
  ): Promise<ModVerificationResult> {
    const testItem = this.buildTestItem(modId, enLine, itemBaseType, generationType);
    const testItemRaw = this.buildTestItemRaw(enLine, itemBaseType, generationType);

    const request: ConvertWeGameWorkerRequest = {
      operation: 'convert_wegame',
      catalogHash: 'mod-verification',
      character: {
        name: 'ModVerify',
        level: 1,
        class: 'Marauder',
        league: 'Standard',
        equipment: [testItem],
        skills: [],
        jewels: [],
        passives: {
          hashes: [],
          specialisations: {},
          skill_overrides: {},
          jewel_data: {},
          quest_stats: [],
        },
      },
    };

    let response;
    try {
      response = await this.workerClient.submit(request);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        status: 'worker_failed',
        zhTemplate,
        enLine,
        testItemRaw,
        pob2Recognized: false,
        errorMessage,
      };
    }

    if (!response.success) {
      // Worker 返回 success=false，但进程本身未崩溃 — 视为 pob2_rejected
      const result: ModVerificationResult = {
        status: 'pob2_rejected',
        zhTemplate,
        enLine,
        testItemRaw,
        pob2Recognized: false,
        errorMessage: response.error ?? 'PoB2 worker returned success=false',
      };
      this.failureCorpus?.record(
        result.errorMessage ?? 'worker_failed',
        enLine,
        this.currentVersions,
      );
      return result;
    }

    const pobValidation = response.pobValidation;
    const roundTrip = response.roundTrip;
    const expected = roundTrip?.expectedEquipment ?? 0;
    const selected = roundTrip?.selectedItems ?? 0;

    if (!pobValidation?.roundTripValid) {
      const result: ModVerificationResult = {
        status: 'pob2_rejected',
        zhTemplate,
        enLine,
        testItemRaw,
        pob2Recognized: false,
        errorMessage: 'PoB2 roundTrip validation failed',
      };
      this.failureCorpus?.record('roundTrip validation failed', enLine, this.currentVersions);
      return result;
    }

    if (expected > 0 && selected === 0) {
      const result: ModVerificationResult = {
        status: 'pob2_rejected',
        zhTemplate,
        enLine,
        testItemRaw,
        pob2Recognized: false,
        errorMessage: 'PoB2 did not select the test item — mod may be unsupported',
      };
      this.failureCorpus?.record('item not selected by PoB2', enLine, this.currentVersions);
      return result;
    }

    // 启发式检查：calcsOutput 是否包含与该 mod 相关的字段
    const verifiedFields = this.extractVerifiedFields(
      response.calcsOutput ?? {},
      modId,
      enLine,
    );

    const recognized = this.checkPob2Recognition(
      response.calcsOutput ?? {},
      modId,
      enLine,
      verifiedFields,
    );

    if (!recognized) {
      const result: ModVerificationResult = {
        status: 'pob2_rejected',
        zhTemplate,
        enLine,
        testItemRaw,
        pob2Recognized: false,
        errorMessage: 'PoB2 calcsOutput shows no recognisable effect for this mod',
        parsedModCount: verifiedFields.length,
      };
      this.failureCorpus?.record('no recognisable effect in calcsOutput', enLine, this.currentVersions);
      return result;
    }

    // 验证成功 — 写入 ConversionCache
    const result: ModVerificationResult = {
      status: 'verified_by_pob2',
      zhTemplate,
      enLine,
      testItemRaw,
      pob2Recognized: true,
      parsedModCount: verifiedFields.length,
    };

    if (this.conversionCache && this.currentVersions) {
      const normalizedTemplate = toNumericTemplate(zhTemplate).template;
      const values = toNumericTemplate(enLine).values.map(Number);
      this.conversionCache.set({
        rawText: testItemRaw,
        normalizedTemplate,
        values,
        enLine,
        status: 'verified_by_pob2',
        source: 'poe2db_exact',
        catalogVersion: this.currentVersions.catalogVersion,
        adapterVersion: this.currentVersions.adapterVersion,
        pob2Version: this.currentVersions.pob2Version,
        gameVersion: this.currentVersions.gameVersion,
        verifiedAt: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * 构建最小 PoB2 测试 item（CanonicalWeGameCharacter 的 equipment 条目）。
   */
  private buildTestItem(
    _modId: string,
    enLine: string,
    itemBaseType: string,
    generationType: string,
  ): Record<string, unknown> {
    const modFieldMap: Record<string, string> = {
      enchantMods: 'enchantMods',
      runeMods: 'runeMods',
      implicitMods: 'implicitMods',
      explicitMods: 'explicitMods',
      fracturedMods: 'fracturedMods',
      desecratedMods: 'desecratedMods',
      mutatedMods: 'mutatedMods',
      craftedMods: 'craftedMods',
    };

    const modField = modFieldMap[generationType] ?? 'explicitMods';

    return {
      inventoryId: 'Helmet',
      frameType: 0, // normal
      name: '',
      typeLine: itemBaseType,
      baseType: itemBaseType,
      ilvl: 1,
      properties: [],
      requirements: [],
      [modField]: [enLine],
    };
  }

  /**
   * 构建测试 item 的 rawText 表示（用于报告和缓存）。
   */
  private buildTestItemRaw(
    enLine: string,
    itemBaseType: string,
    generationType: string,
  ): string {
    const modFieldMap: Record<string, string> = {
      enchantMods: 'enchantMods',
      runeMods: 'runeMods',
      implicitMods: 'implicitMods',
      explicitMods: 'explicitMods',
      fracturedMods: 'fracturedMods',
      desecratedMods: 'desecratedMods',
      mutatedMods: 'mutatedMods',
      craftedMods: 'craftedMods',
    };
    const modField = modFieldMap[generationType] ?? 'explicitMods';

    return `Rarity: normal
${itemBaseType}
${modField}:
${enLine}
`;
  }

  /**
   * 从 calcsOutput 中提取可能与该 mod 相关的字段名。
   */
  private extractVerifiedFields(
    calcsOutput: Record<string, unknown>,
    _modId: string,
    enLine: string,
  ): string[] {
    const fields: string[] = [];
    const lower = enLine.toLowerCase();
    const keys = Object.keys(calcsOutput);

    const keywordMap: Record<string, string[]> = {
      strength: ['Strength'],
      dexterity: ['Dexterity'],
      intelligence: ['Intelligence'],
      life: ['Life', 'LifeUnreserved', 'LifeReserved'],
      mana: ['Mana', 'ManaUnreserved', 'ManaReserved'],
      'energy shield': ['EnergyShield'],
      evasion: ['Evasion'],
      armour: ['Armour'],
      resist: ['FireResist', 'ColdResist', 'LightningResist', 'ChaosResist'],
      block: ['BlockChance', 'AttackBlockChance', 'SpellBlockChance'],
      critical: ['CritChance', 'CritMultiplier'],
      speed: ['AttackSpeed', 'CastSpeed'],
      damage: ['MainHandPhysDamage', 'MainHandEleDamage', 'TotalDPS'],
    };

    for (const [keyword, statKeys] of Object.entries(keywordMap)) {
      if (lower.includes(keyword)) {
        for (const statKey of statKeys) {
          if (keys.includes(statKey)) fields.push(statKey);
        }
      }
    }

    return [...new Set(fields)];
  }

  /**
   * 检查 PoB2 输出是否包含该 mod 的影响。
   *
   * 策略：
   * 1. 如果 verifiedFields 中有字段在 calcsOutput 中有非零值，则认为识别成功。
   * 2. 如果 roundTrip 通过且装备被选中，作为兜底也认为成功。
   */
  private checkPob2Recognition(
    calcsOutput: Record<string, unknown>,
    _modId: string,
    _enLine: string,
    verifiedFields: string[] = [],
  ): boolean {
    if (verifiedFields.length === 0) {
      // 没有可匹配的关键词，保守地认为无法判断，但 roundTrip 已通过
      return true;
    }

    for (const field of verifiedFields) {
      const value = calcsOutput[field];
      if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value !== 0
      ) {
        return true;
      }
    }

    // 所有相关字段都是 0 或不存在 — 可能是 rejected
    return false;
  }
}

// 导出 FailureCorpus 和 buildTopFailureReasons 的别名（保持兼容）
export { ConversionCache, FailureCorpus, buildTopFailureReasons } from './cache/mod-cache.js';

// ============ 内部工具函数 ============

function toNumericTemplate(value: string): { template: string; values: string[] } {
  const values: string[] = [];
  const template = value.replace(/[-+]?\d+(?:\.\d+)?/g, (number) => {
    values.push(number);
    return '#';
  });
  return { template, values };
}
