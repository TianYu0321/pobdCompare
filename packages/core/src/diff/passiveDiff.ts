import type { NormalizedBuild, PassiveDiff } from '@pobd/schemas';

export function computePassiveDiff(myBuild: NormalizedBuild, targetBuild: NormalizedBuild): PassiveDiff {
  const myNodes = myBuild.passives.map((p) => p.id);
  const targetNodes = targetBuild.passives.map((p) => p.id);

  const missingNodes = targetNodes.filter((n) => !myNodes.includes(n));
  const extraNodes = myNodes.filter((n) => !targetNodes.includes(n));
  const commonNodes = myNodes.filter((n) => targetNodes.includes(n));

  return { myNodes, targetNodes, missingNodes, extraNodes, commonNodes };
}
