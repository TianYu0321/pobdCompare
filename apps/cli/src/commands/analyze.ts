import { Command } from 'commander';
import * as path from 'node:path';

import { BuildXmlAdapter, WeGameAdapter } from '@pobd/adapters';
import {
  BaselineManager,
  MutationFactory,
  VariantGenerator,
  ResultComparator,
  Pob2WorkerClient,
  BaselineComputeResult,
  VariantWorkerClient,
  VariantApplyResult,
  PassiveTreeProvider,
  PassiveTreeNode,
} from '@pobd/core';
import { Pob2WorkerPool } from '@pobd/pob2-worker';
import { SimulationBatch, SimulationResult, VariantValidation, CalcValidation } from '@pobd/schemas';

import { logger } from '../utils/logger';
import { writeJson, fileExists } from '../utils/file-utils';

// ── 常量 ──
const POB_ROOT = 'D:\\PathOfBuilding-PoE2-dev\\PathOfBuilding-PoE2-dev';
const DRIVER_PATH = path.resolve(__dirname, '../../../packages/pob2-worker/python/driver.py');

// ── 适配器：Pob2WorkerPool → Pob2WorkerClient ──
class Pob2PoolBaselineAdapter implements Pob2WorkerClient {
  constructor(private pool: Pob2WorkerPool) {}

  async computeBaseline(
    buildXml: string,
    options: { skillNumber: number; skillPart?: string; weaponSet: number; config: Record<string, unknown>; customMods?: string }
  ): Promise<BaselineComputeResult> {
    const response = await this.pool.submit({
      buildXml,
      skillNumber: options.skillNumber,
      weaponSet: options.weaponSet,
      config: options.config,
    });

    if (!response.success) {
      throw new Error(`Baseline compute failed: ${response.error}`);
    }

    return {
      calcsOutput: response.calcsOutput ?? {},
      mainOutput: undefined,
      rawBreakdown: response.breakdown ?? {},
      skillDpsList: response.skillDpsList ?? [],
      skillGroups: [],
      items: response.itemSlots ?? [],
      passiveNodes: response.passiveNodes ?? [],
      ascendNodes: [],
      jewels: [],
    };
  }
}

// ── 适配器：Pob2WorkerPool → VariantWorkerClient ──
class Pob2PoolVariantAdapter implements VariantWorkerClient {
  constructor(private pool: Pob2WorkerPool) {}

  async applyMutation(buildXml: string, mutation: any): Promise<VariantApplyResult> {
    const response = await this.pool.submit({
      buildXml,
      skillNumber: 1,
      weaponSet: 1,
      config: {},
      mutation,
    });

    if (!response.success) {
      throw new Error(`Variant apply failed: ${response.error}`);
    }

    const preValidation: VariantValidation = { isValid: true, warnings: [], errors: [] };
    const postValidation: VariantValidation = { isValid: true, warnings: [], errors: [] };
    const calcValidation: CalcValidation = {
      success: true,
      hasCalcsOutput: !!response.calcsOutput,
      hasBreakdown: !!response.breakdown,
      mainSkillStillValid: true,
      dpsIsValid: true,
    };

    return {
      buildXml: response.variantXml ?? buildXml,
      calcsOutput: response.calcsOutput ?? {},
      mainOutput: undefined,
      rawBreakdown: response.breakdown ?? {},
      preValidation,
      postValidation,
      calcValidation,
    };
  }

  async saveBuildXml(buildXml: string): Promise<string> {
    return buildXml;
  }
}

// ── 简化的 PassiveTreeProvider（从 baseline 推断） ──
class SimplePassiveTreeProvider implements PassiveTreeProvider {
  async getTree(baseline: any): Promise<PassiveTreeNode[]> {
    return baseline.passiveNodes.map((id: number) => ({
      id,
      linked: [],
      isAscendancyStart: false,
      isMultipleChoice: false,
    }));
  }
}

export interface AnalyzeOptions {
  skillNumber: string;
  weaponSet: string;
  output: string;
  targetBuild?: string;
  maxWorkers: string;
  timeout: string;
  verbose?: boolean;
}

export async function analyzeCommand(inputPath: string, options: AnalyzeOptions): Promise<void> {
  const startTime = Date.now();
  logger.title('PoB2 BD 差异分析');

  // ── 1. 输入解析 ──
  let buildXml: string;
  let source: string;
  const wegameAdapter = new WeGameAdapter();
  const buildXmlAdapter = new BuildXmlAdapter();

  if (wegameAdapter.isWeGameLink(inputPath)) {
    logger.info('检测到 WeGame 分享链接，尝试解析...');
    const { rawData } = await wegameAdapter.parseWeGameShareLink(inputPath);
    const { buildXml: xml, conversionReport } = await wegameAdapter.convertToBuildXml(rawData);
    buildXml = xml;
    source = 'wegame';
    if (conversionReport.warnings.length > 0) {
      conversionReport.warnings.forEach((w) => logger.warn(w));
    }
  } else if (buildXmlAdapter.isBuildFile(inputPath)) {
    if (!fileExists(inputPath)) {
      logger.error(`Build 文件不存在: ${inputPath}`);
      process.exit(1);
    }
    logger.info(`读取 Build 文件: ${inputPath}`);
    const result = await buildXmlAdapter.readBuildFile(inputPath);
    buildXml = result.buildXml;
    source = result.source;
  } else {
    logger.error(`不支持的输入格式: ${inputPath} (需要 .build/.xml 文件或 WeGame 链接)`);
    process.exit(1);
  }

  // ── 2. 创建 Worker Pool ──
  const skillNumber = parseInt(options.skillNumber, 10);
  const weaponSet = parseInt(options.weaponSet, 10);
  const maxWorkers = parseInt(options.maxWorkers, 10);
  const timeout = parseInt(options.timeout, 10);

  const pool = new Pob2WorkerPool({
    pythonPath: 'python',
    driverPath: DRIVER_PATH,
    pobRoot: POB_ROOT,
    maxWorkers,
    requestTimeoutMs: timeout,
  });

  const baselineClient = new Pob2PoolBaselineAdapter(pool);
  const variantClient = new Pob2PoolVariantAdapter(pool);
  const baselineManager = new BaselineManager(baselineClient, { enableFileCache: false });
  const variantGenerator = new VariantGenerator(variantClient);
  const comparator = new ResultComparator();
  const treeProvider = new SimplePassiveTreeProvider();
  const mutationFactory = new MutationFactory(treeProvider);

  // ── 3. 创建 Baseline ──
  logger.info(`创建 Baseline (skillNumber=${skillNumber}, weaponSet=${weaponSet})...`);
  const baseline = await baselineManager.createBaseline(buildXml, {
    source: source as any,
    skillNumber,
    weaponSet,
    pob2Version: '0.1.0',
    pob2DataVersion: '0.1.0',
    gameVersion: '0.1.0',
    mainSkillSelection: {
      selectedSkillNumber: skillNumber,
      selectionMode: 'auto_single',
      selectedSkillName: 'Main Skill',
      candidates: [],
      warnings: [],
    },
    normalizerVersion: '0.1.0',
  });
  logger.success(`Baseline 创建完成: ${baseline.baselineHash.slice(0, 16)}`);
  logger.result(
    '当前 DPS',
    baseline.skillDpsList.find((s) => s.skillNumber === skillNumber)?.dps.toFixed(2) ?? 'N/A'
  );
  logger.result('技能', baseline.mainSkillSelection.selectedSkillName);
  logger.result('职业', baseline.character.className ?? 'N/A');

  // ── 4. 生成候选 ──
  logger.info('生成 Passive 候选...');
  const passiveAddMuts = await mutationFactory.generatePassiveAddCandidates(baseline);
  const passiveRemoveMuts = await mutationFactory.generatePassiveRemoveCandidates(baseline);
  logger.result('Passive Add 候选', `${passiveAddMuts.length} 个`);
  logger.result('Passive Remove 候选', `${passiveRemoveMuts.length} 个`);

  let gearSwapMuts: any[] = [];
  if (options.targetBuild && fileExists(options.targetBuild)) {
    logger.info('检测到目标 Build，生成 Gear Swap 候选...');
    const targetResult = await buildXmlAdapter.readBuildFile(options.targetBuild);
    const targetPartial = await buildXmlAdapter.parseBuildXml(targetResult.buildXml);
    gearSwapMuts = mutationFactory.generateGearSwapCandidates(targetPartial.items ?? [], baseline);
    logger.result('Gear Swap 候选', `${gearSwapMuts.length} 个`);
  } else {
    logger.info('无目标 Build，跳过 Gear Swap 分析');
  }

  // ── 5. 并行处理 ──
  const allMutations = [...passiveAddMuts, ...passiveRemoveMuts, ...gearSwapMuts];
  logger.info(`开始批量模拟 (${allMutations.length} 个 job, ${maxWorkers} workers)...`);
  logger.divider();

  const results: SimulationResult[] = await Promise.all(
    allMutations.map(async (mutation) => {
      try {
        const variant = await variantGenerator.generateVariant(baseline, mutation);
        return comparator.compare(baseline, variant);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          jobId: `${baseline.baselineHash}_${mutation.mutationId}`,
          baselineHash: baseline.baselineHash,
          variantHash: 'failed',
          mutationId: mutation.mutationId,
          mutationType: mutation.type,
          resultKind: 'calc_failed',
          affectedSkillNumber: baseline.skillNumber,
          isMainSkillStillValid: false,
          target: { type: 'passive' as const, id: (mutation.payload as any)?.targetNodeId ?? (mutation.payload as any)?.slotName ?? 0 },
          baselineDps: 0,
          variantDps: 0,
          dpsDelta: 0,
          dpsDeltaPercent: 0,
          outputDiff: { offence: {} },
          warnings: [`Failed: ${msg}`],
          errorCode: 'unknown',
          errorMessage: msg,
          evidence: [],
          createdAt: Date.now(),
        } as SimulationResult;
      }
    })
  );

  // ── 6. 排序和输出 ──
  const topGains = [...results]
    .filter((r) => r.resultKind === 'normal_gain')
    .sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent)
    .slice(0, 10);
  const topLosses = [...results]
    .filter((r) => r.resultKind === 'normal_loss')
    .sort((a, b) => a.dpsDeltaPercent - b.dpsDeltaPercent)
    .slice(0, 10);
  const incompatibleResults = results.filter((r) => r.resultKind === 'incompatible');
  const failedResults = results.filter((r) => r.resultKind === 'calc_failed');

  logger.divider();
  logger.title('分析结果');
  logger.result('总 job 数', String(allMutations.length));
  logger.result('成功', String(results.length - failedResults.length));
  logger.result('失败', String(failedResults.length));
  logger.result(
    '成功率',
    `${(((results.length - failedResults.length) / results.length) * 100).toFixed(1)}%`
  );

  if (topGains.length > 0) {
    logger.title('Top 3 增益');
    topGains.slice(0, 3).forEach((r, i) => {
      const name = r.target.name ?? r.target.id ?? r.mutationId;
      console.log(`  ${i + 1}. ${name}: +${r.dpsDeltaPercent.toFixed(2)}% DPS`);
    });
  }

  if (topLosses.length > 0) {
    logger.title('Top 3 损失');
    topLosses.slice(0, 3).forEach((r, i) => {
      const name = r.target.name ?? r.target.id ?? r.mutationId;
      console.log(`  ${i + 1}. ${name}: ${r.dpsDeltaPercent.toFixed(2)}% DPS`);
    });
  }

  if (incompatibleResults.length > 0) {
    logger.warn(`存在 ${incompatibleResults.length} 个不兼容结果`);
  }

  if (failedResults.length > 0) {
    logger.warn(`存在 ${failedResults.length} 个失败 job`);
  }

  const batch: SimulationBatch = {
    batchId: `batch-${Date.now()}`,
    type: 'custom',
    baselineHash: baseline.baselineHash,
    jobIds: allMutations.map((m) => m.mutationId),
    totalJobs: allMutations.length,
    completedJobs: results.length - failedResults.length,
    failedJobs: failedResults.length,
    status: failedResults.length === 0 ? 'completed' : failedResults.length === allMutations.length ? 'failed' : 'partial',
    progress: 1,
    allResults: results,
    topGains,
    topLosses,
    incompatibleResults,
    failedJobsReport: failedResults.map((r) => ({
      jobId: r.jobId,
      mutationType: r.mutationType,
      target: r.target.name ?? String(r.target.id ?? ''),
      errorCode: r.errorCode ?? 'unknown',
      errorMessage: r.errorMessage ?? 'Unknown',
      retryCount: 0,
    })),
    createdAt: startTime,
    completedAt: Date.now(),
  };

  const outputPath = path.isAbsolute(options.output) ? options.output : path.resolve(options.output);
  await writeJson(outputPath, batch);
  logger.success(`结果已保存: ${outputPath}`);

  const baselinePath = outputPath.replace(/\.json$/, '.baseline.json');
  await writeJson(baselinePath, baseline);
  logger.success(`Baseline 已保存: ${baselinePath}`);

  pool.shutdown();
  const duration = Date.now() - startTime;
  logger.result('耗时', `${(duration / 1000).toFixed(1)}s`);
  logger.success('分析完成');
}
