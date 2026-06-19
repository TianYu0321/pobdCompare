import type { NormalizedBuild } from '@/types';
import { Sword, Shield, Zap, TrendingUp } from 'lucide-react';

interface OverviewTabProps {
  build: NormalizedBuild;
}

export default function OverviewTab({ build }: OverviewTabProps) {
  const mainSkill = build.skills[0]?.name ?? 'Unknown';
  const mainDps = build.skillDps.find((d) => d.skillName === mainSkill)?.dps;

  return (
    <div className="space-y-3">
      {/* 攻击概览 */}
      <div className="bg-poe-surface rounded border border-poe-border p-3">
        <div className="flex items-center gap-1.5 text-[10px] text-poe-textMuted uppercase tracking-wider mb-2">
          <Sword className="w-3.5 h-3.5" />
          攻击
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] text-poe-textDim">DPS</div>
            <div className="text-sm font-mono font-semibold text-poe-highlight">
              {mainDps !== undefined ? mainDps.toLocaleString() : '待计算'}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-poe-textDim">主技能</div>
            <div className="text-sm font-semibold text-poe-text truncate">{mainSkill}</div>
          </div>
          <div>
            <div className="text-[9px] text-poe-textDim">物理一击线</div>
            <div className="text-sm font-mono text-poe-text">待计算</div>
          </div>
          <div>
            <div className="text-[9px] text-poe-textDim">元素一击线</div>
            <div className="text-sm font-mono text-poe-text">待计算</div>
          </div>
        </div>
      </div>

      {/* 防御概览 */}
      <div className="bg-poe-surface rounded border border-poe-border p-3">
        <div className="flex items-center gap-1.5 text-[10px] text-poe-textMuted uppercase tracking-wider mb-2">
          <Shield className="w-3.5 h-3.5" />
          防御
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] text-poe-textDim">生命</div>
            <div className="text-sm font-mono text-poe-text">
              {build.panel.life !== undefined ? build.panel.life.toLocaleString() : '待计算'}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-poe-textDim">护盾</div>
            <div className="text-sm font-mono text-poe-text">
              {build.panel.energyShield !== undefined ? build.panel.energyShield.toLocaleString() : '待计算'}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-poe-textDim">护甲</div>
            <div className="text-sm font-mono text-poe-text">
              {build.panel.armour !== undefined ? build.panel.armour.toLocaleString() : '待计算'}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-poe-textDim">闪避</div>
            <div className="text-sm font-mono text-poe-text">
              {build.panel.evasion !== undefined ? build.panel.evasion.toLocaleString() : '待计算'}
            </div>
          </div>
        </div>
      </div>

      {/* 装备概览 */}
      <div className="bg-poe-surface rounded border border-poe-border p-3">
        <div className="flex items-center gap-1.5 text-[10px] text-poe-textMuted uppercase tracking-wider mb-2">
          <Zap className="w-3.5 h-3.5" />
          装备
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="text-lg font-mono font-semibold text-poe-text">{build.equipments.length}</div>
            <div className="text-[9px] text-poe-textDim">已装备</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono font-semibold text-poe-unique">
              {build.equipments.filter((e) => e.item?.rarity === 'unique').length}
            </div>
            <div className="text-[9px] text-poe-textDim">Unique</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono font-semibold text-poe-rare">
              {build.equipments.filter((e) => e.item?.rarity === 'rare').length}
            </div>
            <div className="text-[9px] text-poe-textDim">Rare</div>
          </div>
        </div>
      </div>

      {/* 天赋概览 */}
      <div className="bg-poe-surface rounded border border-poe-border p-3">
        <div className="flex items-center gap-1.5 text-[10px] text-poe-textMuted uppercase tracking-wider mb-2">
          <TrendingUp className="w-3.5 h-3.5" />
          天赋
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="text-lg font-mono font-semibold text-poe-text">{build.passives.length}</div>
            <div className="text-[9px] text-poe-textDim">已点</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono font-semibold text-poe-unique">
              {build.passives.filter((p) => p.type === 'keystone').length}
            </div>
            <div className="text-[9px] text-poe-textDim">Keystone</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono font-semibold text-poe-rare">
              {build.passives.filter((p) => p.type === 'notable').length}
            </div>
            <div className="text-[9px] text-poe-textDim">Notable</div>
          </div>
        </div>
      </div>
    </div>
  );
}
