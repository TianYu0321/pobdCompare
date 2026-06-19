import type { NormalizedBuild, DpsDiff } from '@pobd/schemas';

export function computeDpsDiff(myBuild: NormalizedBuild, targetBuild: NormalizedBuild, mainSkill: string): DpsDiff {
  const myDps = findDpsBySkillName(myBuild, mainSkill);
  const targetDps = findDpsBySkillName(targetBuild, mainSkill);

  if (myDps === undefined || targetDps === undefined) {
    return {};
  }

  const diffPercent = targetDps !== 0 ? ((myDps - targetDps) / targetDps) * 100 : 0;

  return { myDps, targetDps, diffPercent };
}

function findDpsBySkillName(build: NormalizedBuild, skillName: string): number | undefined {
  const exact = build.skillDps.find((s) => s.skillName === skillName);
  if (exact?.dps !== undefined) return exact.dps;

  const partial = build.skillDps.find((s) => s.skillName?.includes(skillName));
  if (partial?.dps !== undefined) return partial.dps;

  if (build.skillDps.length === 1) return build.skillDps[0].dps;

  return undefined;
}
