import type { NormalizedBuild, AtlasPassiveDiff } from '@pobd/schemas';

export function computeAtlasPassiveDiff(myBuild: NormalizedBuild, targetBuild: NormalizedBuild): AtlasPassiveDiff | undefined {
  const myNodes = myBuild.atlasPassives?.map((p) => p.id) ?? [];
  const targetNodes = targetBuild.atlasPassives?.map((p) => p.id) ?? [];

  if (myNodes.length === 0 && targetNodes.length === 0) return undefined;

  const missingNodes = targetNodes.filter((n) => !myNodes.includes(n));
  const extraNodes = myNodes.filter((n) => !targetNodes.includes(n));
  const commonNodes = myNodes.filter((n) => targetNodes.includes(n));

  return { myNodes, targetNodes, missingNodes, extraNodes, commonNodes };
}
