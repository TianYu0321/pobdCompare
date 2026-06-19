import type { EquipmentItem } from '@/types';
import { X } from 'lucide-react';

interface EquipmentDetailDrawerProps {
  slotName: string;
  item?: EquipmentItem;
  onClose: () => void;
}

export default function EquipmentDetailDrawer({ slotName, item, onClose }: EquipmentDetailDrawerProps) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-poe-surface border border-poe-border rounded-lg w-[400px] max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-3 border-b border-poe-border">
          <div>
            <div className="text-[10px] text-poe-textMuted uppercase">{slotName}</div>
            <div className="text-sm font-semibold text-poe-text">{item.name}</div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-poe-surfaceHighlight text-poe-textMuted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 装备信息 */}
        <div className="p-3 space-y-3">
          {/* 图标和基底 */}
          <div className="flex items-start gap-3">
            {item.icon && (
              <div className="w-16 h-16 bg-poe-bg rounded border border-poe-border flex items-center justify-center">
                <img src={item.icon} alt={item.name} className="w-full h-full object-contain" />
              </div>
            )}
            <div>
              <div className="text-xs text-poe-textMuted">{item.baseType}</div>
              <div className="text-xs text-poe-textMuted">iLv {item.ilvl ?? '?'}</div>
              <div className="text-xs text-poe-textMuted">{item.rarity ?? 'normal'}</div>
            </div>
          </div>

          {/* 词条 */}
          {item.implicitMods && item.implicitMods.length > 0 && (
            <div>
              <div className="text-[10px] text-poe-textDim uppercase mb-1">固有属性</div>
              <div className="space-y-0.5">
                {item.implicitMods.map((mod, i) => (
                  <div key={i} className="text-xs text-poe-textDim">{mod}</div>
                ))}
              </div>
            </div>
          )}

          {item.explicitMods && item.explicitMods.length > 0 && (
            <div>
              <div className="text-[10px] text-poe-textDim uppercase mb-1">附加属性</div>
              <div className="space-y-0.5">
                {item.explicitMods.map((mod, i) => (
                  <div key={i} className="text-xs text-poe-text">{mod}</div>
                ))}
              </div>
            </div>
          )}

          {/* 替换收益（mock） */}
          <div className="border-t border-poe-border pt-3">
            <div className="text-[10px] text-poe-highlight uppercase mb-2">替换收益</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-poe-textMuted">DPS 变化</span>
                <span className="text-poe-positive font-mono">+42.8%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-poe-textMuted">Average Hit</span>
                <span className="text-poe-positive font-mono">+31.2%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-poe-textMuted">Attack Speed</span>
                <span className="text-poe-negative font-mono">-5.1%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-poe-textMuted">Crit Chance</span>
                <span className="text-poe-positive font-mono">+3.4%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
