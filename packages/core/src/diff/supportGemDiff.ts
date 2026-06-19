import type { NormalizedBuild, SupportGemDiff } from '@pobd/schemas';

export function computeSupportGemDiff(myBuild: NormalizedBuild, targetBuild: NormalizedBuild): SupportGemDiff {
  const mySupports = extractAllSupportNames(myBuild);
  const targetSupports = extractAllSupportNames(targetBuild);

  const missingSupports = targetSupports.filter((s) => !mySupports.includes(s));
  const extraSupports = mySupports.filter((s) => !targetSupports.includes(s));
  const commonSupports = mySupports.filter((s) => targetSupports.includes(s));

  return { mySupports, targetSupports, missingSupports, extraSupports, commonSupports };
}

function extractAllSupportNames(build: NormalizedBuild): string[] {
  const names = new Set<string>();
  for (const skill of build.skills) {
    for (const support of skill.supports) {
      names.add(support.name);
    }
  }
  return Array.from(names);
}
