import type {
  NormalizedBuild, BuildDiffResult, DpsDiff, SkillDiff, SupportGemDiff,
  EquipmentDiff, WeaponSetDiff, PassiveDiff, PanelDiff, AtlasPassiveDiff, RuleWarning,
} from '@pobd/schemas';

import { computeDpsDiff } from './dpsDiff';
import { computeSkillDiff } from './skillDiff';
import { computeSupportGemDiff } from './supportGemDiff';
import { computeEquipmentDiff } from './equipmentDiff';
import { computeWeaponSetDiff } from './weaponSetDiff';
import { computePassiveDiff } from './passiveDiff';
import { computeAtlasPassiveDiff } from './atlasPassiveDiff';
import { computePanelDiff } from './panelDiff';
import { runRules } from './ruleEngine';

interface DiffContext {
  dpsDiff: DpsDiff;
  skillDiff: SkillDiff;
  supportGemDiff: SupportGemDiff;
  equipmentDiff: EquipmentDiff;
  weaponSetDiff: WeaponSetDiff;
  passiveDiff: PassiveDiff;
  panelDiff: PanelDiff;
}

export function computeBuildDiff(
  myBuild: NormalizedBuild,
  targetBuild: NormalizedBuild,
  mainSkill: string
): BuildDiffResult {
  const dpsDiff = computeDpsDiff(myBuild, targetBuild, mainSkill);
  const skillDiff = computeSkillDiff(myBuild, targetBuild);
  const supportGemDiff = computeSupportGemDiff(myBuild, targetBuild);
  const equipmentDiff = computeEquipmentDiff(myBuild, targetBuild);
  const weaponSetDiff = computeWeaponSetDiff(myBuild, targetBuild);
  const passiveDiff = computePassiveDiff(myBuild, targetBuild);
  const atlasPassiveDiff = computeAtlasPassiveDiff(myBuild, targetBuild);
  const panelDiff = computePanelDiff(myBuild, targetBuild);

  const diffCtx: DiffContext = { dpsDiff, skillDiff, supportGemDiff, equipmentDiff, weaponSetDiff, passiveDiff, panelDiff };
  const ruleWarnings = runRules(myBuild, targetBuild, mainSkill, diffCtx);

  const missingData: string[] = [];
  if (myBuild.skillDps.length === 0) missingData.push('myBuild.skillDps');
  if (targetBuild.skillDps.length === 0) missingData.push('targetBuild.skillDps');
  if (myBuild.panel.life === undefined) missingData.push('myBuild.panel.life');

  const confidence = missingData.length === 0 ? 'high' : missingData.length <= 2 ? 'medium' : 'low';

  return {
    mainSkill, dpsDiff, skillDiff, supportGemDiff, equipmentDiff, weaponSetDiff, passiveDiff, atlasPassiveDiff, panelDiff, ruleWarnings, missingData, confidence,
  };
}
