import type { EquipmentItem } from '@/types';
import { ImageOff } from 'lucide-react';

interface ItemCardProps {
  slotName: string;
  item?: EquipmentItem;
  empty?: boolean;
}

const rarityColors: Record<string, string> = {
  normal: 'text-poe-normal',
  magic: 'text-poe-magic',
  rare: 'text-poe-rare',
  unique: 'text-poe-unique',
};

export default function ItemCard({ slotName, item, empty }: ItemCardProps) {
  const rarity = item?.rarity ?? 'normal';
  const colorClass = rarityColors[rarity] ?? rarityColors.normal;

  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        {/* 装备图标 */}
        <div className="w-12 h-12 shrink-0 bg-poe-bg rounded border border-poe-border flex items-center justify-center overflow-hidden">
          {item?.icon ? (
            <img
              src={item.icon}
              alt={item.name}
              className="w-full h-full object-contain"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) parent.innerHTML = '<div class="text-poe-textDim text-xs">无图</div>';
              }}
            />
          ) : (
            <ImageOff className="w-5 h-5 text-poe-textDim" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-poe-textMuted uppercase tracking-wider">{slotName}</span>
            {empty && <span className="text-xs text-poe-textDim">空</span>}
          </div>
          {item ? (
            <div>
              <div className={`font-semibold text-sm ${colorClass}`}>
                {item.name}
              </div>
              <div className="text-xs text-poe-textMuted mt-0.5">
                {item.baseType}
              </div>
              {item.implicitMods && item.implicitMods.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {item.implicitMods.map((mod, i) => (
                    <div key={i} className="text-xs text-poe-textDim">
                      {mod}
                    </div>
                  ))}
                </div>
              )}
              {item.explicitMods && item.explicitMods.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {item.explicitMods.slice(0, 3).map((mod, i) => (
                    <div key={i} className="text-xs text-poe-text">
                      {mod}
                    </div>
                  ))}
                  {item.explicitMods.length > 3 && (
                    <div className="text-xs text-poe-textDim">
                      +{item.explicitMods.length - 3} 更多...
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-poe-textDim italic">无装备</div>
          )}
        </div>
      </div>
    </div>
  );
}
