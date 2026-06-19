import { useState } from 'react';
import { Swords, Shield, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { NormalizedBuild, BuildDiffResult } from '@/types';

interface DiffRailProps {
  buildA: NormalizedBuild | null;
  buildB: NormalizedBuild | null;
  diffResult: BuildDiffResult | null;
  isLoading: boolean;
  analysisSteps: string[];
  currentStep: number;
}

export default function DiffRail({
  buildA,
  buildB,
  diffResult,
  isLoading,
  analysisSteps,
  currentStep,
}: DiffRailProps) {
  const [viewMode, setViewMode] = useState<'offense' | 'defense'>('offense');
  const [selectedSkill, setSelectedSkill] = useState<string>(
    diffResult?.mainSkill ?? buildA?.skills[0]?.name ?? ''
  );

  const dps = diffResult?.dpsDiff;

  // ========== 分析中状态 ==========
  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="text-sm font-semibold text-poe-text mb-3">分析中</div>
        <div className="space-y-1.5">
          {analysisSteps.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                i === currentStep - 1
                  ? 'bg-poe-highlight/20 text-poe-highlight'
                  : 'text-poe-textMuted'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${
                i === currentStep - 1 ? 'bg-poe-highlight animate-pulse' : 'bg-poe-textDim'
              }`} />
              {step}
            </div>
          ))}
          {/* 未完成的步骤 */}
          {['读取 Build A', '读取 Build B', '识别主技能', '计算 baseline', '执行装备替换模拟', '执行天赋收益模拟', '提取 breakdown', '生成对比结果']
            .slice(currentStep)
            .map((step, i) => (
              <div key={`pending-${i}`} className="flex items-center gap-2 text-xs px-2 py-1 text-poe-textDim">
                <div className="w-1.5 h-1.5 rounded-full bg-poe-border" />
                {step}
              </div>
            ))}
        </div>
      </div>
    );
  }

  // ========== 分析前状态 ==========
  if (!diffResult) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <div className="w-12 h-12 rounded-full bg-poe-surface border border-poe-border flex items-center justify-center mb-3">
          <Swords className="w-5 h-5 text-poe-textDim" />
        </div>
        <div className="text-sm text-poe-text mb-1">等待对比</div>
        <div className="text-xs text-poe-textDim">
          {buildA && buildB
            ? '点击上方"开始对比"按钮'
            : buildA
              ? '输入 Build B 后开始对比'
              : buildB
                ? '输入 Build A 后开始对比'
                : '输入两侧 Build 后开始对比'}
        </div>
      </div>
    );
  }

  // ========== 分析后状态 ==========
  return (
    <div className="h-full flex flex-col">
      {/* 主技能选择 */}
      <div className="mb-3">
        <div className="text-[10px] text-poe-textMuted uppercase mb-1">对比技能</div>
        <select
          value={selectedSkill}
          onChange={(e) => setSelectedSkill(e.target.value)}
          className="w-full bg-poe-surface border border-poe-border rounded px-2 py-1 text-xs text-poe-text"
        >
          {buildA?.skills.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* 攻击/防御切换 */}
      <div className="flex border border-poe-border rounded overflow-hidden mb-3">
        <button
          onClick={() => setViewMode('offense')}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium transition
            ${viewMode === 'offense' ? 'bg-poe-highlight text-poe-bg' : 'text-poe-textMuted hover:text-poe-text'}`}
        >
          <Swords className="w-3.5 h-3.5" />
          攻击端
        </button>
        <button
          onClick={() => setViewMode('defense')}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium transition
            ${viewMode === 'defense' ? 'bg-poe-highlight text-poe-bg' : 'text-poe-textMuted hover:text-poe-text'}`}
        >
          <Shield className="w-3.5 h-3.5" />
          防御端
        </button>
      </div>

      {/* DPS 对比 */}
      {dps?.myDps !== undefined && dps?.targetDps !== undefined ? (
        <div className="bg-poe-surface rounded border border-poe-border p-2.5 mb-3">
          <div className="text-[10px] text-poe-textMuted uppercase mb-1.5">DPS</div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-poe-textMuted">A</span>
            <span className="text-sm font-mono font-semibold">{dps.myDps.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-poe-textMuted">B</span>
            <span className="text-sm font-mono font-semibold">{dps.targetDps.toLocaleString()}</span>
          </div>
          <div className="border-t border-poe-border pt-1 mt-1">
            <div className="flex items-center gap-1">
              {dps.diffPercent !== undefined && (
                <>
                  {dps.diffPercent > 0 ? (
                    <TrendingUp className="w-3.5 h-3.5 text-poe-positive" />
                  ) : dps.diffPercent < 0 ? (
                    <TrendingDown className="w-3.5 h-3.5 text-poe-negative" />
                  ) : (
                    <Minus className="w-3.5 h-3.5 text-poe-textDim" />
                  )}
                  <span className={`text-sm font-semibold font-mono ${
                    dps.diffPercent > 0 ? 'text-poe-positive' : dps.diffPercent < 0 ? 'text-poe-negative' : 'text-poe-textDim'
                  }`}>
                    {dps.diffPercent >= 0 ? '+' : ''}{dps.diffPercent.toFixed(1)}%
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-poe-surface rounded border border-poe-border p-2.5 mb-3">
          <div className="flex items-center gap-2 text-poe-textDim">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs">无 DPS 数据</span>
          </div>
        </div>
      )}

      {/* 视图内容 */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {viewMode === 'offense' ? (
          <OffenseView diffResult={diffResult} />
        ) : (
          <DefenseView diffResult={diffResult} />
        )}
      </div>

      {/* 规则警告 */}
      {diffResult.ruleWarnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {diffResult.ruleWarnings.map((w) => (
            <div
              key={w.ruleId}
              className={`text-[10px] px-1.5 py-1 rounded border ${
                w.impact === 'high'
                  ? 'bg-red-900/20 border-red-800/30 text-red-400'
                  : w.impact === 'medium'
                    ? 'bg-yellow-900/20 border-yellow-800/30 text-yellow-400'
                    : 'bg-green-900/20 border-green-800/30 text-green-400'
              }`}
            >
              {w.title}
            </div>
          ))}
        </div>
      )}

      {/* 置信度 */}
      <div className="mt-2 text-[10px] text-poe-textDim">
        置信度: <span className={diffResult.confidence === 'high' ? 'text-poe-positive' : diffResult.confidence === 'medium' ? 'text-poe-warning' : 'text-poe-negative'}>{diffResult.confidence}</span>
      </div>
    </div>
  );
}

function OffenseView({ diffResult }: { diffResult: BuildDiffResult }) {
  return (
    <div className="space-y-2">
      {/* 关键差异 Top 3 */}
      <div className="text-[10px] text-poe-textMuted uppercase tracking-wider">关键差异</div>
      
      {diffResult.skillDiff.missingSkills.length > 0 && (
        <div className="bg-poe-surface rounded border border-poe-border p-2">
          <div className="text-[10px] text-poe-textMuted mb-1">缺少技能</div>
          <div className="text-xs text-poe-negative">{diffResult.skillDiff.missingSkills.join(', ')}</div>
        </div>
      )}
      
      {diffResult.supportGemDiff.missingSupports.length > 0 && (
        <div className="bg-poe-surface rounded border border-poe-border p-2">
          <div className="text-[10px] text-poe-textMuted mb-1">缺少辅助</div>
          <div className="text-xs text-poe-negative">{diffResult.supportGemDiff.missingSupports.join(', ')}</div>
        </div>
      )}
      
      {diffResult.equipmentDiff.missingItems.length > 0 && (
        <div className="bg-poe-surface rounded border border-poe-border p-2">
          <div className="text-[10px] text-poe-textMuted mb-1">装备差异</div>
          <div className="text-xs text-poe-negative">{diffResult.equipmentDiff.missingItems.length} 件</div>
        </div>
      )}

      {diffResult.skillDiff.missingSkills.length === 0 && 
       diffResult.supportGemDiff.missingSupports.length === 0 && 
       diffResult.equipmentDiff.missingItems.length === 0 && (
        <div className="text-center py-4 text-xs text-poe-textDim">
          攻击端无显著差异
        </div>
      )}
    </div>
  );
}

function DefenseView({ diffResult }: { diffResult: BuildDiffResult }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-poe-textMuted uppercase tracking-wider">防御面板</div>
      
      {diffResult.panelDiff.lifeDiff !== undefined && (
        <div className="bg-poe-surface rounded border border-poe-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-poe-textMuted">生命</span>
            <span className={`text-xs font-mono font-semibold ${diffResult.panelDiff.lifeDiff >= 0 ? 'text-poe-positive' : 'text-poe-negative'}`}>
              {diffResult.panelDiff.lifeDiff >= 0 ? '+' : ''}{diffResult.panelDiff.lifeDiff}
            </span>
          </div>
        </div>
      )}
      
      {diffResult.panelDiff.energyShieldDiff !== undefined && (
        <div className="bg-poe-surface rounded border border-poe-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-poe-textMuted">护盾</span>
            <span className={`text-xs font-mono font-semibold ${diffResult.panelDiff.energyShieldDiff >= 0 ? 'text-poe-positive' : 'text-poe-negative'}`}>
              {diffResult.panelDiff.energyShieldDiff >= 0 ? '+' : ''}{diffResult.panelDiff.energyShieldDiff}
            </span>
          </div>
        </div>
      )}

      {diffResult.panelDiff.resistanceDiffs && Object.entries(diffResult.panelDiff.resistanceDiffs).map(([key, val]) => (
        <div key={key} className="bg-poe-surface rounded border border-poe-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-poe-textMuted">{key} 抗性</span>
            <span className={`text-xs font-mono font-semibold ${val >= 0 ? 'text-poe-positive' : 'text-poe-negative'}`}>
              {val >= 0 ? '+' : ''}{val}%
            </span>
          </div>
        </div>
      ))}

      {diffResult.passiveDiff.missingNodes.length > 0 && (
        <div className="bg-poe-surface rounded border border-poe-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-poe-textMuted">天赋差异</span>
            <span className="text-xs text-poe-negative">{diffResult.passiveDiff.missingNodes.length} 节点</span>
          </div>
        </div>
      )}
    </div>
  );
}
