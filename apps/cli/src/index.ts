import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze';
import { p15aTestCommand } from './commands/p1-5a-test';
import { wegameProbeCommand } from './commands/wegame-probe';
import { wegameNormalizeCommand } from './commands/wegame-normalize';
import { buildDiffCommand } from './commands/build-diff';

const program = new Command();

program
  .name('pobd-compare')
  .description('PoE2 BD 差异比较与收益模拟工具 — 基于 PoB2 反事实重算')
  .version('0.1.0');

program
  .command('build-diff <my-build> <target-build> <main-skill>')
  .description('比较两个 NormalizedBuild 的差异')
  .option('-o, --output <path>', 'Diff 结果输出路径')
  .action(async (myBuild, targetBuild, mainSkill, options) => {
    try {
      await buildDiffCommand(myBuild, targetBuild, mainSkill, options);
    } catch (err) {
      console.error('Diff 失败:', err);
      process.exit(1);
    }
  });

program
  .command('analyze <build-file>')
  .description('分析单个 Build 的 BD 收益')
  .option('--skill-number <number>', '主技能编号', '1')
  .option('--weapon-set <number>', '武器组', '1')
  .option('-o, --output <path>', '结果输出路径', 'simulation_results.json')
  .option('--target-build <path>', '目标 Build 文件路径（用于 Gear Swap 对比）')
  .option('--max-workers <number>', '并行 Worker 数量', '4')
  .option('--timeout <ms>', '单个 job 超时毫秒', '30000')
  .option('--verbose', '输出详细日志')
  .action(async (buildFile, options) => {
    try {
      await analyzeCommand(buildFile, options);
    } catch (err) {
      console.error('分析失败:', err);
      process.exit(1);
    }
  });

program
  .command('p1-5a-test <build-dir>')
  .description('P1.5a 真实 Build 回归测试（批量验证）')
  .option('-o, --output <path>', '结果输出路径', 'p1_5_real_build_result.json')
  .option('--max-workers <number>', '并行 Worker 数量', '4')
  .option('--timeout <ms>', '单个 job 超时毫秒', '30000')
  .option('--verbose', '输出详细日志')
  .action(async (buildDir, options) => {
    try {
      await p15aTestCommand(buildDir, options);
    } catch (err) {
      console.error('测试失败:', err);
      process.exit(1);
    }
  });

program
  .command('wegame-probe <share-url>')
  .description('WeGame API 探针：获取角色数据并保存原始 JSON')
  .option('-o, --output <path>', '原始数据输出路径', 'wegame_probe.json')
  .action(async (shareUrl, options) => {
    try {
      await wegameProbeCommand(shareUrl, options);
    } catch (err) {
      console.error('探针失败:', err);
      process.exit(1);
    }
  });

program
  .command('wegame-normalize <share-url>')
  .description('WeGame NormalizedBuild 生成：将 API 数据转为统一模型')
  .option('-o, --output <path>', 'NormalizedBuild 输出路径', 'normalized_build.json')
  .action(async (shareUrl, options) => {
    try {
      await wegameNormalizeCommand(shareUrl, options);
    } catch (err) {
      console.error('NormalizedBuild 生成失败:', err);
      process.exit(1);
    }
  });

program.parse();
