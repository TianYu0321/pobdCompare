import type { NormalizedBuild } from '@/types';
import { Zap, Crosshair, Gauge, Target, Heart, Shield, ShieldCheck, Wind, Flame, Snowflake, CloudLightning, Skull } from 'lucide-react';

interface CalcsTabProps {
  build: NormalizedBuild;
  side: 'A' | 'B';
}

export default function CalcsTab({ build }: CalcsTabProps) {
  const mainSkill = build.skills[0]?.name ?? 'Unknown';
  const dpsInfo = build.skillDps.find((d) => d.skillName === mainSkill);

  return (
    <div className="space-y-3">
      <div className="card">
        <h3 className="text-sm font-semibold text-poe-textMuted mb-2 flex items-center gap-1.5">
          <Zap className="w-4 h-4" />
          主技能: {mainSkill}
        </h3>
        {dpsInfo ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-poe-textDim" />
              DPS: <span className="font-mono text-poe-unique">{dpsInfo.dps?.toLocaleString() ?? '?'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-poe-textDim" />
              Hit: <span className="font-mono">{dpsInfo.hitDamage?.toLocaleString() ?? '?'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-poe-textDim" />
              Speed: <span className="font-mono">{dpsInfo.attackSpeed?.toFixed(2) ?? '?'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-poe-textDim" />
              Crit: <span className="font-mono">{(dpsInfo.critChance ? dpsInfo.critChance * 100 : 0).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-poe-textDim" />
              Multi: <span className="font-mono">{dpsInfo.critMultiplier?.toFixed(2) ?? '?'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-poe-textDim" />
              Hit%: <span className="font-mono">{(dpsInfo.hitChance ? dpsInfo.hitChance * 100 : 0).toFixed(1)}%</span>
            </div>
          </div>
        ) : (
          <div className="text-poe-textDim text-sm">无 DPS 数据</div>
        )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-poe-textMuted mb-2 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" />
          防御面板
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-red-400" />
            生命: <span className="font-mono">{build.panel.life ?? '?'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            护盾: <span className="font-mono">{build.panel.energyShield ?? '?'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
            护甲: <span className="font-mono">{build.panel.armour ?? '?'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5 text-green-400" />
            闪避: <span className="font-mono">{build.panel.evasion ?? '?'}</span>
          </div>
        </div>
      </div>

      {build.panel.resistances && Object.keys(build.panel.resistances).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-poe-textMuted mb-2 flex items-center gap-1.5">
            <Shield className="w-4 h-4" />
            抗性
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(build.panel.resistances).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5">
                {key === 'fire' && <Flame className="w-3.5 h-3.5 text-red-400" />}
                {key === 'cold' && <Snowflake className="w-3.5 h-3.5 text-blue-400" />}
                {key === 'lightning' && <CloudLightning className="w-3.5 h-3.5 text-yellow-400" />}
                {key === 'chaos' && <Skull className="w-3.5 h-3.5 text-purple-400" />}
                {key}: <span className="font-mono">{val}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
