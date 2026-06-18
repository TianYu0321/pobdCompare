import { Command } from 'commander';
import * as path from 'node:path';

import { BuildXmlAdapter } from '@pobd/adapters';
import {
  BaselineManager,
  MutationFactory,
  VariantGenerator,
  ResultComparator,
  PassiveTreeProvider,
  PassiveTreeNode,
  Pob2WorkerClient,
  BaselineComputeResult,
  VariantWorkerClient,
  VariantApplyResult,
} from '@pobd/core';
import { Pob2WorkerPool } from '@pobd/pob2-worker';
import { SimulationBatch, SimulationResult, FailedJobReport, VariantValidation, CalcValidation } from '@pobd/schemas';

import { logger } from '../utils/logger';
import { writeJson, listFiles } from '../utils/file-utils';

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

// ── 简化的 PassiveTreeProvider ──
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

export interface P15aTestOptions {
  output: string;
  maxWorkers: string;
  timeout: string;
  verbose?: boolean;
}

export async function p15aTestCommand(buildDir: string, options: P15aTestOptions): Promise<void> {
  const startTime = Date.now();
  logger.title('P1.5a 真实 Build 回归测试');

  const buildFiles = listFiles(buildDir, '.build');
  if (buildFiles.length === 0) {
    logger.error(`目录 ${buildDir} 下未找到 .build 文件`);
    logger.info('请将 .build 文件放入该目录，或运行 analyze 命令分析单个 build');
    process.exit(1);
  }

  logger.info(`找到 ${buildFiles.length} 个 build 文件`);

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
  const buildXmlAdapter = new BuildXmlAdapter();

  const perBuildResults: any[] = [];
  let totalJobs = 0;
  let totalCompleted = 0;
  let totalFailed = 0;
  const allFailedReports: FailedJobReport[] = [];

  for (const buildFile of buildFiles) {
    logger.divider();
    logger.info(`处理: ${path.basename(buildFile)}`);

    const { buildXml } = await buildXmlAdapter.readBuildFile(buildFile);
    const baseline = await baselineManager.createBaseline(buildXml, {
      source: 'build_file',
      skillNumber: 1,
      weaponSet: 1,
      pob2Version: '0.1.0',
      pob2DataVersion: '0.1.0',
      gameVersion: '0.1.0',
      mainSkillSelection: {
        selectedSkillNumber: 1,
        selectionMode: 'auto_single',
        selectedSkillName: 'Main Skill',
        candidates: [],
        warnings: [],
      },
      normalizerVersion: '0.1.0',
    });

    const passiveAddMuts = await mutationFactory.generatePassiveAddCandidates(baseline);
    const passiveRemoveMuts = await mutationFactory.generatePassiveRemoveCandidates(baseline);
    const gearSwapMuts = mutationFactory.generateGearSwapCandidates([], baseline);

    logger.result('Passive Add', `${passiveAddMuts.length} 个`);
    logger.result('Passive Remove', `${passiveRemoveMuts.length} 个`);
    logger.result('Gear Swap', `${gearSwapMuts.length} 个`);

    const allMutations = [...passiveAddMuts, ...passiveRemoveMuts, ...gearSwapMuts];
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

    const completedCount = results.filter((r) => r.resultKind !== 'calc_failed').length;
    const failedCount = results.filter((r) => r.resultKind === 'calc_failed').length;
    const successRate = results.length > 0 ? (completedCount / results.length) * 100 : 0;

    const passed =
      successRate >= 90 &&
      passiveRemoveMuts.length >= 50 &&
      passiveAddMuts.length >= 30 &&
      gearSwapMuts.length >= 8;

    logger.result('成功率', `${successRate.toFixed(1)}%`);
    logger.result('通过', passed ? '✅' : '❌');

    const topGains = [...results]
      .filter((r) => r.resultKind === 'normal_gain')
      .sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent)
      .slice(0, 5);
    const topLosses = [...results]
      .filter((r) => r.resultKind === 'normal_loss')
      .sort((a, b) => a.dpsDeltaPercent - b.dpsDeltaPercent)
      .slice(0, 5);

    perBuildResults.push({
      buildFile: path.basename(buildFile),
      baselineHash: baseline.baselineHash,
      skillName: baseline.mainSkillSelection.selectedSkillName,
      passiveRemoveCount: passiveRemoveMuts.length,
      passiveAddCount: passiveAddMuts.length,
      gearSwapCount: gearSwapMuts.length,
      totalJobs: results.length,
      completedJobs: completedCount,
      failedJobs: failedCount,
      successRate,
      passed,
      topGains,
      topLosses,
      failedJobsReport: results
        .filter((r) => r.resultKind === 'calc_failed')
        .map((r) => ({
          jobId: r.jobId,
          mutationType: r.mutationType,
          target: r.target.name ?? String(r.target.id ?? ''),
          errorCode: r.errorCode ?? 'unknown',
          errorMessage: r.errorMessage ?? 'Unknown',
          retryCount: 0,
        })),
    });

    totalJobs += results.length;
    totalCompleted += completedCount;
    totalFailed += failedCount;
    allFailedReports.push(
      ...results
        .filter((r) => r.resultKind === 'calc_failed')
        .map((r) => ({
          jobId: r.jobId,
          mutationType: r.mutationType,
          target: r.target.name ?? String(r.target.id ?? ''),
          errorCode: r.errorCode ?? 'unknown',
          errorMessage: r.errorMessage ?? 'Unknown',
          retryCount: 0,
        }))
    );
  }

  const overallSuccessRate = totalJobs > 0 ? (totalCompleted / totalJobs) * 100 : 0;

  logger.divider();
  logger.title('汇总结果');
  logger.result('Build 总数', String(buildFiles.length));
  logger.result('总 Job 数', String(totalJobs));
  logger.result('成功', String(totalCompleted));
  logger.result('失败', String(totalFailed));
  logger.result('整体成功率', `${overallSuccessRate.toFixed(1)}%`);

  const finalOutput = {
    totalBuilds: buildFiles.length,
    totalJobs,
    successRate: overallSuccessRate,
    passedBuilds: perBuildResults.filter((r) => r.passed).length,
    failedBuilds: perBuildResults.filter((r) => !r.passed).length,
    perBuildResults,
    failedJobsReport: allFailedReports,
    generatedAt: Date.now(),
    durationMs: Date.now() - startTime,
  };

  const outputPath = path.isAbsolute(options.output) ? options.output : path.resolve(options.output);
  await writeJson(outputPath, finalOutput);
  logger.success(`结果已保存: ${outputPath}`);

  pool.shutdown();
  const duration = Date.now() - startTime;
  logger.result('耗时', `${(duration / 1000).toFixed(1)}s`);

  if (overallSuccessRate >= 90) {
    logger.success('P1.5a 回归测试通过 ✅');
  } else {
    logger.error('P1.5a 回归测试未通过 ❌（成功率 < 90%）');
    process.exit(1);
  }
}
