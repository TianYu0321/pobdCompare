import type { SkillGroup } from '@/types';
import { Zap } from 'lucide-react';

interface SkillCardProps {
  skill: SkillGroup;
}

export default function SkillCard({ skill }: SkillCardProps) {
  const isMain = skill.tags.includes('main');
  const iconUrl = skill.gemSkill || skill.icon;

  return (
    <div className={`bg-poe-surface rounded border p-2.5 ${isMain ? 'border-l-2 border-l-poe-highlight border-poe-border' : 'border-poe-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={skill.name}
            className="w-8 h-8 rounded border border-poe-border object-contain"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Zap className={`w-8 h-8 ${isMain ? 'text-poe-highlight' : 'text-poe-textDim'}`} />
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold truncate ${isMain ? 'text-poe-highlight' : 'text-poe-text'}`}>
            {skill.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {skill.level !== undefined && (
              <span className="text-[10px] text-poe-textDim">Lv.{skill.level}</span>
            )}
            {skill.weaponSet && skill.weaponSet !== 'unknown' && (
              <span className="text-[10px] text-poe-textDim">WS{skill.weaponSet}</span>
            )}
          </div>
        </div>
      </div>

      {skill.supports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skill.supports.map((support, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 rounded bg-poe-bgLight border border-poe-border text-poe-textMuted"
            >
              {support.name}
              {support.level !== undefined && ` Lv.${support.level}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
