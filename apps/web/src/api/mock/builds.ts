import type { NormalizedBuild, BuildDiffResult } from '@/types';

export async function parseBuildFile(file: File): Promise<NormalizedBuild> {
  const text = await file.text();
  const data = JSON.parse(text);
  return data as NormalizedBuild;
}

export async function computeDiff(
  buildA: NormalizedBuild,
  buildB: NormalizedBuild,
  mainSkill: string
): Promise<BuildDiffResult> {
  // MVP: 前端直接计算（轻量 diff，不涉及 PoB2 重算）
  // 后续: 后端跑 computeBuildDiff
  const mySkills = buildA.skills.map((s) => s.name);
  const targetSkills = buildB.skills.map((s) => s.name);
  const missingSkills = targetSkills.filter((s) => !mySkills.includes(s));
  const extraSkills = mySkills.filter((s) => !targetSkills.includes(s));
  const commonSkills = mySkills.filter((s) => targetSkills.includes(s));

  const myDps = buildA.skillDps.find((d) => d.skillName === mainSkill)?.dps;
  const targetDps = buildB.skillDps.find((d) => d.skillName === mainSkill)?.dps;
  const diffPercent = myDps !== undefined && targetDps !== undefined && targetDps !== 0
    ? ((myDps - targetDps) / targetDps) * 100
    : undefined;

  const myItems = buildA.equipments.map((e) => e.item?.name).filter(Boolean) as string[];
  const targetItems = buildB.equipments.map((e) => e.item?.name).filter(Boolean) as string[];
  const missingItems = targetItems.filter((i) => !myItems.includes(i));
  const extraItems = myItems.filter((i) => !targetItems.includes(i));
  const commonItems = myItems.filter((i) => targetItems.includes(i));

  const allSlotNames = new Set([
    ...buildA.equipments.map((e) => e.slotName),
    ...buildB.equipments.map((e) => e.slotName),
  ]);
  const slotDiffs = Array.from(allSlotNames).map((slotName) => {
    const mySlot = buildA.equipments.find((e) => e.slotName === slotName);
    const targetSlot = buildB.equipments.find((e) => e.slotName === slotName);
    return { slotName, myItem: mySlot?.item?.name, targetItem: targetSlot?.item?.name };
  });

  const myNodes = buildA.passives.map((p) => p.id);
  const targetNodes = buildB.passives.map((p) => p.id);
  const missingNodes = targetNodes.filter((n) => !myNodes.includes(n));
  const extraNodes = myNodes.filter((n) => !targetNodes.includes(n));
  const commonNodes = myNodes.filter((n) => targetNodes.includes(n));

  const mySupports = new Set<string>();
  for (const skill of buildA.skills) {
    for (const support of skill.supports) mySupports.add(support.name);
  }
  const targetSupports = new Set<string>();
  for (const skill of buildB.skills) {
    for (const support of skill.supports) targetSupports.add(support.name);
  }
  const mySupportsArr = Array.from(mySupports);
  const targetSupportsArr = Array.from(targetSupports);
  const missingSupports = targetSupportsArr.filter((s) => !mySupportsArr.includes(s));
  const extraSupports = mySupportsArr.filter((s) => !targetSupportsArr.includes(s));
  const commonSupports = mySupportsArr.filter((s) => targetSupportsArr.includes(s));

  const myWs1 = buildA.weaponSets.find((w) => w.id === 1);
  const targetWs1 = buildB.weaponSets.find((w) => w.id === 1);
  const myWs2 = buildA.weaponSets.find((w) => w.id === 2);
  const targetWs2 = buildB.weaponSets.find((w) => w.id === 2);

  const panelDiff: BuildDiffResult['panelDiff'] = {};
  if (buildA.panel.life !== undefined && buildB.panel.life !== undefined) {
    panelDiff.lifeDiff = buildA.panel.life - buildB.panel.life;
  }
  if (buildA.panel.energyShield !== undefined && buildB.panel.energyShield !== undefined) {
    panelDiff.energyShieldDiff = buildA.panel.energyShield - buildB.panel.energyShield;
  }

  const ruleWarnings: BuildDiffResult['ruleWarnings'] = [];
  if (diffPercent !== undefined && diffPercent < -30) {
    ruleWarnings.push({
      ruleId: 'large_dps_gap',
      title: 'DPS 差距过大',
      impact: 'high',
      message: `当前 DPS 比目标低 ${Math.abs(diffPercent).toFixed(1)}%，建议优先检查装备和技能链。`,
      evidence: [`当前 DPS: ${myDps}`, `目标 DPS: ${targetDps}`],
    });
  }
  if (missingSupports.length > 0) {
    ruleWarnings.push({
      ruleId: 'missing_support_gems',
      title: '核心辅助缺失',
      impact: 'high',
      message: `当前构筑缺少 ${missingSupports.length} 个目标辅助宝石。`,
      evidence: missingSupports,
    });
  }

  const missingData: string[] = [];
  if (buildA.skillDps.length === 0) missingData.push('buildA.skillDps');
  if (buildB.skillDps.length === 0) missingData.push('buildB.skillDps');
  const confidence = missingData.length === 0 ? 'high' : missingData.length <= 2 ? 'medium' : 'low';

  return {
    mainSkill,
    dpsDiff: myDps !== undefined ? { myDps, targetDps, diffPercent } : {},
    skillDiff: { mySkills, targetSkills, missingSkills, extraSkills, commonSkills },
    supportGemDiff: { mySupports: mySupportsArr, targetSupports: targetSupportsArr, missingSupports, extraSupports, commonSupports },
    equipmentDiff: { myItems, targetItems, missingItems, extraItems, commonItems, slotDiffs },
    weaponSetDiff: {
      ws1Diff: {
        mainHandChanged: myWs1?.mainHand?.name !== targetWs1?.mainHand?.name,
        offHandChanged: myWs1?.offHand?.name !== targetWs1?.offHand?.name,
        myMainHand: myWs1?.mainHand?.name,
        targetMainHand: targetWs1?.mainHand?.name,
        myOffHand: myWs1?.offHand?.name,
        targetOffHand: targetWs1?.offHand?.name,
      },
      ws2Diff: {
        mainHandChanged: myWs2?.mainHand?.name !== targetWs2?.mainHand?.name,
        offHandChanged: myWs2?.offHand?.name !== targetWs2?.offHand?.name,
        myMainHand: myWs2?.mainHand?.name,
        targetMainHand: targetWs2?.mainHand?.name,
        myOffHand: myWs2?.offHand?.name,
        targetOffHand: targetWs2?.offHand?.name,
      },
    },
    passiveDiff: { myNodes, targetNodes, missingNodes, extraNodes, commonNodes },
    atlasPassiveDiff: undefined,
    panelDiff,
    ruleWarnings,
    missingData,
    confidence,
  };
}
