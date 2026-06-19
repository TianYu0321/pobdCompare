import { useUIStore } from '@/stores';
import type { NormalizedBuild, BuildDiffResult, BuildTab } from '@/types';
import EquipmentTab from './EquipmentTab';
import SkillsTab from './SkillsTab';
import PassivesTab from './PassivesTab';
import CalcsTab from './CalcsTab';
import OverviewTab from './OverviewTab';
import { Sword, Zap, GitBranch, Calculator, LayoutGrid } from 'lucide-react';

interface BuildPanelProps {
  build: NormalizedBuild;
  side: 'A' | 'B';
  diffResult: BuildDiffResult | null;
}

const tabs: { key: BuildTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '概览', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { key: 'equipment', label: '装备', icon: <Sword className="w-3.5 h-3.5" /> },
  { key: 'skills', label: '技能', icon: <Zap className="w-3.5 h-3.5" /> },
  { key: 'passives', label: '天赋', icon: <GitBranch className="w-3.5 h-3.5" /> },
  { key: 'calcs', label: '计算', icon: <Calculator className="w-3.5 h-3.5" /> },
];

export default function BuildPanel({ build, side, diffResult }: BuildPanelProps) {
  const { activeTabA, activeTabB, setActiveTabA, setActiveTabB } = useUIStore();
  const activeTab = side === 'A' ? activeTabA : activeTabB;
  const setActiveTab = side === 'A' ? setActiveTabA : setActiveTabB;

  const mainSkill = build.skills[0]?.name ?? 'Unknown';
  const mainDps = build.skillDps.find((d) => d.skillName === mainSkill)?.dps;

  return (
    <div className="flex flex-col h-full">
      {/* 角色摘要 */}
      <div className="mb-3 pb-3 border-b border-poe-border">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${side === 'A' ? 'bg-poe-highlight' : 'bg-poe-positive'}`} />
          <h2 className="font-bold text-base text-poe-text">
            {build.character.name ?? 'Unknown'}
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-poe-textMuted mb-2">
          <span>{build.character.className ?? '?'}</span>
          <span>·</span>
          <span>{build.character.ascendancy ?? '?'}</span>
          <span>·</span>
          <span>Lv.{build.character.level ?? '?'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-poe-surface rounded border border-poe-border p-2">
            <div className="text-[10px] text-poe-textMuted uppercase">主技能</div>
            <div className="text-sm font-semibold text-poe-text truncate">{mainSkill}</div>
          </div>
          <div className="bg-poe-surface rounded border border-poe-border p-2">
            <div className="text-[10px] text-poe-textMuted uppercase">DPS</div>
            <div className="text-sm font-mono font-semibold text-poe-highlight">
              {mainDps !== undefined ? mainDps.toLocaleString() : '待计算'}
            </div>
          </div>
          <div className="bg-poe-surface rounded border border-poe-border p-2">
            <div className="text-[10px] text-poe-textMuted uppercase">生命</div>
            <div className="text-sm font-mono font-semibold text-poe-text">
              {build.panel.life !== undefined ? build.panel.life.toLocaleString() : '待计算'}
            </div>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="flex border border-poe-border rounded overflow-hidden mb-3 bg-poe-bgLight">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium transition
              ${activeTab === tab.key
                ? 'bg-poe-surfaceHighlight text-poe-highlight border-b border-poe-highlight'
                : 'text-poe-textMuted hover:text-poe-text'
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'overview' && <OverviewTab build={build} />}
        {activeTab === 'equipment' && <EquipmentTab build={build} side={side} diffResult={diffResult} />}
        {activeTab === 'skills' && <SkillsTab build={build} side={side} />}
        {activeTab === 'passives' && <PassivesTab build={build} side={side} />}
        {activeTab === 'calcs' && <CalcsTab build={build} side={side} />}
      </div>
    </div>
  );
}
