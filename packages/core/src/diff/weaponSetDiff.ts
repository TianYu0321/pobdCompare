import type { NormalizedBuild, WeaponSetDiff } from '@pobd/schemas';

export function computeWeaponSetDiff(myBuild: NormalizedBuild, targetBuild: NormalizedBuild): WeaponSetDiff {
  return {
    ws1Diff: diffWeaponSet(myBuild, targetBuild, 1),
    ws2Diff: diffWeaponSet(myBuild, targetBuild, 2),
  };
}

function diffWeaponSet(myBuild: NormalizedBuild, targetBuild: NormalizedBuild, wsId: 1 | 2): WeaponSetDiff['ws1Diff'] {
  const myWs = myBuild.weaponSets.find((w) => w.id === wsId);
  const targetWs = targetBuild.weaponSets.find((w) => w.id === wsId);

  const myMainHand = myWs?.mainHand?.name;
  const targetMainHand = targetWs?.mainHand?.name;
  const myOffHand = myWs?.offHand?.name;
  const targetOffHand = targetWs?.offHand?.name;

  return {
    mainHandChanged: myMainHand !== targetMainHand,
    offHandChanged: myOffHand !== targetOffHand,
    myMainHand,
    targetMainHand,
    myOffHand,
    targetOffHand,
  };
}
