import { Command } from 'commander';
import * as path from 'node:path';

import { WeGameAdapter, normalizeWeGame } from '@pobd/adapters';

import { logger } from '../utils/logger';
import { writeJson } from '../utils/file-utils';

export interface WeGameNormalizeOptions {
  output: string;
}

export async function wegameNormalizeCommand(shareUrl: string, options: WeGameNormalizeOptions): Promise<void> {
  logger.title('WeGame NormalizedBuild 生成');
  logger.info(`测试 URL: ${shareUrl}`);

  const adapter = new WeGameAdapter();

  if (!adapter.isWeGameLink(shareUrl)) {
    logger.error('无效的 WeGame 分享链接');
    process.exit(1);
  }

  try {
    // Step 1: Fetch raw data
    const rawData = await adapter.fetchWeGameBuild(shareUrl);
    logger.success('WeGame API 数据获取成功');

    // Step 2: Normalize to NormalizedBuild
    const normalizedBuild = normalizeWeGame(rawData);
    logger.success('NormalizedBuild 生成成功');

    // Step 3: Output summary
    logger.divider();
    logger.result('角色', `${normalizedBuild.character.name} (Lv.${normalizedBuild.character.level})`);
    logger.result('职业', normalizedBuild.character.className ?? 'Unknown');
    logger.result('装备槽', String(normalizedBuild.equipments.length));
    logger.result('技能组', String(normalizedBuild.skills.length));
    logger.result('DPS 数据', String(normalizedBuild.skillDps.length));
    logger.result('天赋节点', String(normalizedBuild.passives.length));
    logger.result('珠宝', String(normalizedBuild.jewels.length));
    logger.result('Warnings', String(normalizedBuild.warnings.length));

    if (normalizedBuild.warnings.length > 0) {
      logger.divider();
      for (const w of normalizedBuild.warnings.slice(0, 5)) {
        logger.warn(w);
      }
    }

    // Step 4: Save
    const outputPath = path.isAbsolute(options.output) ? options.output : path.resolve(options.output);
    await writeJson(outputPath, normalizedBuild);
    logger.success(`NormalizedBuild 已保存: ${outputPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`处理失败: ${msg}`);
    process.exit(1);
  }
}
