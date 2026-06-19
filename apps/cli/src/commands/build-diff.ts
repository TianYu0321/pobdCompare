import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { computeBuildDiff } from '@pobd/core';
import type { NormalizedBuild } from '@pobd/schemas';

import { logger } from '../utils/logger';
import { writeJson } from '../utils/file-utils';

export interface BuildDiffOptions {
  output?: string;
}

export async function buildDiffCommand(
  myBuildPath: string,
  targetBuildPath: string,
  mainSkill: string,
  options: BuildDiffOptions
): Promise<void> {
  logger.title('Build Diff Engine');
  logger.info(`当前 Build: ${myBuildPath}`);
  logger.info(`目标 Build: ${targetBuildPath}`);
  logger.info(`主技能: ${mainSkill}`);

  let myBuild: NormalizedBuild;
  let targetBuild: NormalizedBuild;

  try {
    const myRaw = await fs.readFile(path.resolve(myBuildPath), 'utf-8');
    myBuild = JSON.parse(myRaw) as NormalizedBuild;
  } catch (err) {
    logger.error(`读取当前 Build 失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  try {
    const targetRaw = await fs.readFile(path.resolve(targetBuildPath), 'utf-8');
    targetBuild = JSON.parse(targetRaw) as NormalizedBuild;
  } catch (err) {
    logger.error(`读取目标 Build 失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const diff = computeBuildDiff(myBuild, targetBuild, mainSkill);

  logger.divider();
  logger.result('主技能', diff.mainSkill);
  logger.result('置信度', diff.confidence);

  if (diff.dpsDiff?.myDps !== undefined && diff.dpsDiff?.targetDps !== undefined) {
    const sign = diff.dpsDiff.diffPercent! >= 0 ? '+' : '';
    logger.result('DPS 差异', `${diff.dpsDiff.myDps} vs ${diff.dpsDiff.targetDps} (${sign}${diff.dpsDiff.diffPercent!.toFixed(1)}%)`);
  } else {
    logger.warn('DPS 数据不完整，无法比较');
  }

  if (diff.skillDiff.missingSkills.length > 0 || diff.skillDiff.extraSkills.length > 0) {
    logger.divider();
    logger.info('技能差异');
    if (diff.skillDiff.missingSkills.length > 0) {
      logger.warn(`缺少技能: ${diff.skillDiff.missingSkills.join(', ')}`);
    }
    if (diff.skillDiff.extraSkills.length > 0) {
      logger.info(`额外技能: ${diff.skillDiff.extraSkills.join(', ')}`);
    }
    logger.result('共有技能', String(diff.skillDiff.commonSkills.length));
  }

  if (diff.supportGemDiff.missingSupports.length > 0 || diff.supportGemDiff.extraSupports.length > 0) {
    logger.divider();
    logger.info('辅助宝石差异');
    if (diff.supportGemDiff.missingSupports.length > 0) {
      logger.warn(`缺少辅助: ${diff.supportGemDiff.missingSupports.join(', ')}`);
    }
    if (diff.supportGemDiff.extraSupports.length > 0) {
      logger.info(`额外辅助: ${diff.supportGemDiff.extraSupports.join(', ')}`);
    }
  }

  logger.divider();
  logger.info('装备差异');
  if (diff.equipmentDiff.missingItems.length > 0) {
    logger.warn(`缺少装备: ${diff.equipmentDiff.missingItems.join(', ')}`);
  }
  if (diff.equipmentDiff.extraItems.length > 0) {
    logger.info(`额外装备: ${diff.equipmentDiff.extraItems.join(', ')}`);
  }
  const changedSlots = diff.equipmentDiff.slotDiffs.filter((s) => s.myItem !== s.targetItem);
  logger.result('变化槽位', String(changedSlots.length));
  for (const slot of changedSlots.slice(0, 10)) {
    logger.info(`  ${slot.slotName}: ${slot.myItem ?? '空'} → ${slot.targetItem ?? '空'}`);
  }

  logger.divider();
  logger.info('武器组差异');
  if (diff.weaponSetDiff.ws1Diff.mainHandChanged || diff.weaponSetDiff.ws1Diff.offHandChanged) {
    logger.warn(`WS1 变化: ${diff.weaponSetDiff.ws1Diff.myMainHand ?? '空'} → ${diff.weaponSetDiff.ws1Diff.targetMainHand ?? '空'}`);
  } else {
    logger.info('WS1 无变化');
  }
  if (diff.weaponSetDiff.ws2Diff.mainHandChanged || diff.weaponSetDiff.ws2Diff.offHandChanged) {
    logger.warn(`WS2 变化: ${diff.weaponSetDiff.ws2Diff.myMainHand ?? '空'} → ${diff.weaponSetDiff.ws2Diff.targetMainHand ?? '空'}`);
  } else {
    logger.info('WS2 无变化');
  }

  if (diff.passiveDiff.missingNodes.length > 0 || diff.passiveDiff.extraNodes.length > 0) {
    logger.divider();
    logger.info('天赋差异');
    if (diff.passiveDiff.missingNodes.length > 0) {
      logger.warn(`缺少天赋节点: ${diff.passiveDiff.missingNodes.length} 个`);
    }
    if (diff.passiveDiff.extraNodes.length > 0) {
      logger.info(`额外天赋节点: ${diff.passiveDiff.extraNodes.length} 个`);
    }
    logger.result('共有天赋节点', String(diff.passiveDiff.commonNodes.length));
  }

  if (diff.atlasPassiveDiff) {
    logger.divider();
    logger.info('异界天赋差异');
    if (diff.atlasPassiveDiff.missingNodes.length > 0) {
      logger.warn(`缺少异界天赋: ${diff.atlasPassiveDiff.missingNodes.length} 个`);
    }
    if (diff.atlasPassiveDiff.extraNodes.length > 0) {
      logger.info(`额外异界天赋: ${diff.atlasPassiveDiff.extraNodes.length} 个`);
    }
  }

  logger.divider();
  logger.info('面板差异');
  if (diff.panelDiff.lifeDiff !== undefined) {
    const sign = diff.panelDiff.lifeDiff >= 0 ? '+' : '';
    logger.result('生命', `${sign}${diff.panelDiff.lifeDiff}`);
  }
  if (diff.panelDiff.energyShieldDiff !== undefined) {
    const sign = diff.panelDiff.energyShieldDiff >= 0 ? '+' : '';
    logger.result('能量护盾', `${sign}${diff.panelDiff.energyShieldDiff}`);
  }
  if (diff.panelDiff.resistanceDiffs) {
    for (const [key, val] of Object.entries(diff.panelDiff.resistanceDiffs)) {
      const sign = val >= 0 ? '+' : '';
      logger.result(`抗性 ${key}`, `${sign}${val}`);
    }
  }

  if (diff.ruleWarnings.length > 0) {
    logger.divider();
    logger.info('规则警告');
    for (const w of diff.ruleWarnings) {
      const icon = w.impact === 'high' ? '🔴' : w.impact === 'medium' ? '🟡' : '🟢';
      logger.warn(`${icon} [${w.ruleId}] ${w.title}: ${w.message}`);
      if (w.evidence.length > 0) {
        logger.info(`  证据: ${w.evidence.join(', ')}`);
      }
    }
  }

  if (diff.missingData.length > 0) {
    logger.divider();
    logger.info('缺失数据');
    for (const m of diff.missingData) {
      logger.warn(m);
    }
  }

  if (options.output) {
    const outputPath = path.isAbsolute(options.output) ? options.output : path.resolve(options.output);
    await writeJson(outputPath, diff);
    logger.success(`Diff 结果已保存: ${outputPath}`);
  }
}
