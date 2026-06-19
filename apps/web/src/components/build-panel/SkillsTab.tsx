import type { NormalizedBuild } from '@/types';
import SkillCard from '@/components/shared/SkillCard';

interface SkillsTabProps {
  build: NormalizedBuild;
  side: 'A' | 'B';
}

export default function SkillsTab({ build }: SkillsTabProps) {
  return (
    <div className="space-y-2">
      {build.skills.map((skill, i) => (
        <SkillCard key={i} skill={skill} />
      ))}
    </div>
  );
}
