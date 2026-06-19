import type { NormalizedBuild, SkillDiff } from '@pobd/schemas';

export function computeSkillDiff(myBuild: NormalizedBuild, targetBuild: NormalizedBuild): SkillDiff {
  const mySkills = myBuild.skills.map((s) => s.name);
  const targetSkills = targetBuild.skills.map((s) => s.name);

  const missingSkills = targetSkills.filter((s) => !mySkills.includes(s));
  const extraSkills = mySkills.filter((s) => !targetSkills.includes(s));
  const commonSkills = mySkills.filter((s) => targetSkills.includes(s));

  return { mySkills, targetSkills, missingSkills, extraSkills, commonSkills };
}
