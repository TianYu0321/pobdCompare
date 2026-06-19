import type { NormalizedBuild, PanelDiff } from '@pobd/schemas';

export function computePanelDiff(myBuild: NormalizedBuild, targetBuild: NormalizedBuild): PanelDiff {
  const myPanel = myBuild.panel;
  const targetPanel = targetBuild.panel;
  const diff: PanelDiff = {};

  if (myPanel.life !== undefined && targetPanel.life !== undefined) diff.lifeDiff = myPanel.life - targetPanel.life;
  if (myPanel.mana !== undefined && targetPanel.mana !== undefined) diff.manaDiff = myPanel.mana - targetPanel.mana;
  if (myPanel.energyShield !== undefined && targetPanel.energyShield !== undefined) diff.energyShieldDiff = myPanel.energyShield - targetPanel.energyShield;
  if (myPanel.armour !== undefined && targetPanel.armour !== undefined) diff.armourDiff = myPanel.armour - targetPanel.armour;
  if (myPanel.evasion !== undefined && targetPanel.evasion !== undefined) diff.evasionDiff = myPanel.evasion - targetPanel.evasion;

  const myResistances = myPanel.resistances ?? {};
  const targetResistances = targetPanel.resistances ?? {};
  const allResistances = new Set<string>([...Object.keys(myResistances), ...Object.keys(targetResistances)]);
  const resistanceDiffs: Record<string, number> = {};
  for (const key of allResistances) {
    const myVal = myResistances[key];
    const targetVal = targetResistances[key];
    if (myVal !== undefined && targetVal !== undefined) resistanceDiffs[key] = myVal - targetVal;
  }
  if (Object.keys(resistanceDiffs).length > 0) diff.resistanceDiffs = resistanceDiffs;

  return diff;
}
