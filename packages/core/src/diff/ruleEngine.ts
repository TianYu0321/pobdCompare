import type {
  NormalizedBuild, RuleWarning, DpsDiff, SkillDiff, SupportGemDiff,
  EquipmentDiff, WeaponSetDiff, PassiveDiff, PanelDiff,
} from '@pobd/schemas';

interface DiffContext {
  dpsDiff: DpsDiff;
  skillDiff: SkillDiff;
  supportGemDiff: SupportGemDiff;
  equipmentDiff: EquipmentDiff;
  weaponSetDiff: WeaponSetDiff;
  passiveDiff: PassiveDiff;
  panelDiff: PanelDiff;
}

export function runRules(
  myBuild: NormalizedBuild, targetBuild: NormalizedBuild, mainSkill: string, diff: DiffContext
): RuleWarning[] {
  const warnings: RuleWarning[] = [];

  const myHasMainSkill = myBuild.skills.some((s) => s.name === mainSkill);
  const targetHasMainSkill = targetBuild.skills.some((s) => s.name === mainSkill);

  if (!myHasMainSkill) {
    warnings.push({
      ruleId: 'missing_main_skill', title: '主技能缺失', impact: 'high',
      message: `当前构筑没有主技能 "${mainSkill}"，无法同口径比较。`,
      evidence: [`当前技能: ${myBuild.skills.map((s) => s.name).join(', ')}`],
    });
  }

  if (!targetHasMainSkill) {
    warnings.push({
      ruleId: 'target_missing_main_skill', title: '目标主技能缺失', impact: 'medium',
      message: `目标构筑没有主技能 "${mainSkill}"，面板差距可信度降低。`,
      evidence: [`目标技能: ${targetBuild.skills.map((s) => s.name).join(', ')}`],
    });
  }

  if (diff.dpsDiff.diffPercent !== undefined && diff.dpsDiff.diffPercent < -30) {
    warnings.push({
      ruleId: 'large_dps_gap', title: 'DPS 差距过大', impact: 'high',
      message: `当前 DPS 比目标低 ${Math.abs(diff.dpsDiff.diffPercent).toFixed(1)}%，建议优先检查装备和技能链。`,
      evidence: [`当前 DPS: ${diff.dpsDiff.myDps}`, `目标 DPS: ${diff.dpsDiff.targetDps}`],
    });
  }

  if (diff.supportGemDiff.missingSupports.length > 0) {
    warnings.push({
      ruleId: 'missing_support_gems', title: '核心辅助缺失', impact: 'high',
      message: `当前构筑缺少 ${diff.supportGemDiff.missingSupports.length} 个目标辅助宝石。`,
      evidence: diff.supportGemDiff.missingSupports,
    });
  }

  const myHasDance = myBuild.skills.some((s) => s.supports.some((sup) => sup.name.includes('死亡之舞')));
  const targetHasDance = targetBuild.skills.some((s) => s.supports.some((sup) => sup.name.includes('死亡之舞')));
  if (myHasDance !== targetHasDance) {
    warnings.push({
      ruleId: 'dance_with_death', title: 'Dance with Death 机制差异', impact: 'medium',
      message: myHasDance
        ? '当前构筑有 Dance with Death，但目标没有，注意武器组绑定风险。'
        : '目标有 Dance with Death，但当前没有，可能影响武器组选择。',
      evidence: [],
    });
  }

  if (myBuild.skillDps.length === 0) {
    warnings.push({
      ruleId: 'missing_dps_data', title: 'DPS 数据缺失', impact: 'high',
      message: '当前构筑没有 DPS 数据，无法计算伤害差异。', evidence: [],
    });
  }

  return warnings;
}
