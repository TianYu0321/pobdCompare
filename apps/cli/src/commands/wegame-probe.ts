import * as path from 'node:path';

import { WeGameAdapter } from '@pobd/adapters';

import { logger } from '../utils/logger';
import { writeJson } from '../utils/file-utils';

export interface WeGameProbeOptions {
  output: string;
}

export async function wegameProbeCommand(
  shareUrl: string,
  options: WeGameProbeOptions,
): Promise<void> {
  logger.title('WeGame API 探针');
  logger.info(`测试 URL: ${shareUrl}`);

  const adapter = new WeGameAdapter();
  if (!adapter.isWeGameLink(shareUrl)) {
    logger.error('无效的 WeGame 分享链接');
    process.exit(1);
  }

  try {
    const data = await adapter.fetchWeGameBuild(shareUrl);
    const jewelCount = Array.isArray(data.jewels)
      ? data.jewels.length
      : typeof data.jewels === 'object' && data.jewels !== null
        ? String((data.jewels as Record<string, unknown>).jewel_data ?? '')
            .match(/"socket_id"/g)?.length ?? 0
        : 0;

    logger.divider();
    logger.result('角色名称', data.roleInfo.name);
    logger.result('等级', String(data.roleInfo.level));
    logger.result('职业', data.roleInfo.class_name);
    logger.result('区服', data.roleInfo.phrase);
    logger.result('账号', data.roleInfo.account_name);

    logger.divider();
    logger.result('装备数量', String(data.equipments.length));
    logger.result('技能数量', String(data.skills.length));
    logger.result('DPS 数据', String(data.skillsDps.length));
    logger.result('天赋节点', String(data.talentTree.hashes.length));
    logger.result('珠宝数量', String(jewelCount));

    const outputPath = path.isAbsolute(options.output)
      ? options.output
      : path.resolve(options.output);
    await writeJson(outputPath, data.raw);
    logger.success(`原始数据已保存：${outputPath}`);
    logger.success('WeGame API 探针完成');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`API 调用失败：${message}`);
    process.exit(1);
  }
}
