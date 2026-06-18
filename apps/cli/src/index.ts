import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze';
import { p15aTestCommand } from './commands/p1-5a-test';

const program = new Command();

program
  .name('pobd-compare')
  .description('PoE2 BD 差异比较与收益模拟工具 — 基于 PoB2 反事实重算')
  .version('0.1.0');

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

program.parse();
