import { useState } from 'react';
import type { NormalizedBuild } from '@/types';
import { TrendingUp, TrendingDown, GitBranch, AlertTriangle } from 'lucide-react';

interface PassiveCandidate {
  id: number;
  name: string;
  type: 'add' | 'remove' | 'path';
  dpsDelta: number;
  pointsSpent: number;
  dpsPerPoint: number;
  pathAutoFilled: boolean;
  cascadeRemoved: boolean;
  hitLineDelta: number;
}

interface PassivesTabProps {
  build: NormalizedBuild;
  side: 'A' | 'B';
}

// Mock 收益数据（后续从后端获取）
function generateMockCandidates(): PassiveCandidate[] {
  return [
    { id: 1, name: '增加 12% 物理伤害', type: 'add', dpsDelta: 2840, pointsSpent: 1, dpsPerPoint: 2840, pathAutoFilled: false, cascadeRemoved: false, hitLineDelta: 120 },
    { id: 2, name: '增加 8% 攻击速度', type: 'add', dpsDelta: 1920, pointsSpent: 1, dpsPerPoint: 1920, pathAutoFilled: false, cascadeRemoved: false, hitLineDelta: 85 },
    { id: 3, name: '暴击伤害倍增', type: 'add', dpsDelta: 4560, pointsSpent: 3, dpsPerPoint: 1520, pathAutoFilled: true, cascadeRemoved: false, hitLineDelta: 210 },
    { id: 4, name: '生命值大点', type: 'add', dpsDelta: -180, pointsSpent: 1, dpsPerPoint: -180, pathAutoFilled: false, cascadeRemoved: false, hitLineDelta: 0 },
    { id: 5, name: '抗性小点', type: 'remove', dpsDelta: -320, pointsSpent: 1, dpsPerPoint: -320, pathAutoFilled: false, cascadeRemoved: true, hitLineDelta: -45 },
  ];
}

export default function PassivesTab({}: PassivesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'next' | 'path' | 'remove'>('next');
  const candidates = generateMockCandidates();

  const filtered = candidates.filter((c) => {
    if (activeSubTab === 'next') return c.type === 'add' && !c.pathAutoFilled;
    if (activeSubTab === 'path') return c.type === 'add' && c.pathAutoFilled;
    if (activeSubTab === 'remove') return c.type === 'remove';
    return true;
  });

  const subTabs = [
    { key: 'next' as const, label: '下一点收益', desc: '单点最优' },
    { key: 'path' as const, label: '路径包', desc: '含路径填充' },
    { key: 'remove' as const, label: '移除损失', desc: '级联删除' },
  ];

  return (
    <div className="space-y-3">
      {/* 子 Tab */}
      <div className="flex border border-poe-border rounded overflow-hidden">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex-1 py-1.5 text-xs font-medium transition
              ${activeSubTab === tab.key
                ? 'bg-poe-surfaceHighlight text-poe-highlight'
                : 'text-poe-textMuted hover:text-poe-text'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 说明 */}
      <div className="text-[10px] text-poe-textDim">
        {activeSubTab === 'next' && '单点最优收益（不包含路径填充点）'}
        {activeSubTab === 'path' && '路径包总收益（包含自动填充的路径点）'}
        {activeSubTab === 'remove' && '级联删除总损失（不是单点独立贡献）'}
      </div>

      {/* 收益列表 */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-xs text-poe-textDim">
            暂无数据
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className={`bg-poe-surface rounded border p-2.5 ${
                c.pathAutoFilled ? 'border-poe-warning/30' : c.cascadeRemoved ? 'border-poe-negative/30' : 'border-poe-border'
              }`}
            >
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-3 h-3 text-poe-textDim" />
                  <span className="text-xs font-medium text-poe-text">{c.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {c.pathAutoFilled && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-poe-warning/20 text-poe-warning border border-poe-warning/30">
                      路径填充
                    </span>
                  )}
                  {c.cascadeRemoved && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-poe-negative/20 text-poe-negative border border-poe-negative/30">
                      级联删除
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[9px] text-poe-textDim">DPS 变化</div>
                  <div className={`text-xs font-mono font-semibold flex items-center gap-0.5 ${
                    c.dpsDelta > 0 ? 'text-poe-positive' : c.dpsDelta < 0 ? 'text-poe-negative' : 'text-poe-textDim'
                  }`}>
                    {c.dpsDelta > 0 ? <TrendingUp className="w-3 h-3" /> : c.dpsDelta < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                    {c.dpsDelta > 0 ? '+' : ''}{c.dpsDelta.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-poe-textDim">消耗点数</div>
                  <div className="text-xs font-mono text-poe-text">{c.pointsSpent}</div>
                </div>
                <div>
                  <div className="text-[9px] text-poe-textDim">每点收益</div>
                  <div className={`text-xs font-mono font-semibold ${
                    c.dpsPerPoint > 0 ? 'text-poe-positive' : c.dpsPerPoint < 0 ? 'text-poe-negative' : 'text-poe-textDim'
                  }`}>
                    {c.dpsPerPoint > 0 ? '+' : ''}{c.dpsPerPoint.toLocaleString()}
                  </div>
                </div>
              </div>

              {c.hitLineDelta !== 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-poe-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-poe-textDim">一击线变化</span>
                    <span className={`text-xs font-mono ${c.hitLineDelta > 0 ? 'text-poe-positive' : 'text-poe-negative'}`}>
                      {c.hitLineDelta > 0 ? '+' : ''}{c.hitLineDelta}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 提示 */}
      <div className="flex items-start gap-1.5 text-[10px] text-poe-textDim">
        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
        <span>
          {activeSubTab === 'path' && '路径包收益包含自动填充的路径点，不是单点独立收益。'}
          {activeSubTab === 'remove' && '级联删除显示的是移除该节点后所有依赖节点被级联删除的总损失。'}
        </span>
      </div>
    </div>
  );
}
