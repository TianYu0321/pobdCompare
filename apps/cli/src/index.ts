// @pobd/cli — CLI 入口

import { Command } from 'commander';

const program = new Command();

program
  .name('pobd-compare')
  .description('PoE2 BD 差异比较与收益模拟工具')
  .version('0.1.0');

program
  .command('analyze')
  .description('分析 BD 收益')
  .option('--build-xml <path>', 'Build XML 文件路径')
  .option('--skill-number <number>', '主技能编号', '1')
  .option('--weapon-set <number>', '武器组', '1')
  .option('--output <path>', '输出文件路径', 'simulation_results.json')
  .action(async (options) => {
    console.log('analyze command:', options);
  });

program.parse();
