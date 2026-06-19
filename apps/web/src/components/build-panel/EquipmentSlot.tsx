import type { EquipmentItem } from '@/types';
import { ImageOff } from 'lucide-react';

interface EquipmentSlotProps {
  label: string;
  slotName: string;
  item?: EquipmentItem;
  empty?: boolean;
  slotDiff?: { slotName: string; myItem?: string; targetItem?: string } | null;
  onClick?: () => void;
}

const rarityBorderColors: Record<string, string> = {
  normal: 'border-poe-border',
  magic: 'border-poe-magic',
  rare: 'border-poe-rare',
  unique: 'border-poe-unique',
};

const rarityTextColors: Record<string, string> = {
  normal: 'text-poe-normal',
  magic: 'text-poe-magic',
  rare: 'text-poe-rare',
  unique: 'text-poe-unique',
};

export default function EquipmentSlot({ label, item, slotDiff, onClick }: EquipmentSlotProps) {
  const rarity = item?.rarity ?? 'normal';
  const borderColor = rarityBorderColors[rarity] ?? rarityBorderColors.normal;
  const textColor = rarityTextColors[rarity] ?? rarityTextColors.normal;

  // 计算差异 badge
  const hasDiff = slotDiff && (slotDiff.myItem !== slotDiff.targetItem);

  return (
    <div
      onClick={onClick}
      className={`relative bg-poe-surface rounded border ${borderColor} p-2 cursor-pointer
        hover:border-poe-borderHighlight transition-all
        ${hasDiff ? 'ring-1 ring-poe-warning/30' : ''}
      `}
    >
      {/* 槽位标签 */}
      <div className="text-[9px] text-poe-textDim uppercase tracking-wider mb-1">
        {label}
      </div>

      {item ? (
        <div className="flex items-start gap-2">
          {/* 装备图标 */}
          <div className="w-10 h-10 shrink-0 bg-poe-bg rounded border border-poe-border flex items-center justify-center overflow-hidden">
            {item.icon ? (
              <img
                src={item.icon}
                alt={item.name}
                className="w-full h-full object-contain"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <ImageOff className="w-4 h-4 text-poe-textDim" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* 装备名 */}
            <div className={`text-xs font-semibold truncate ${textColor}`}>
              {item.name}
            </div>
            {/* 基底 */}
            <div className="text-[10px] text-poe-textMuted truncate">
              {item.baseType}
            </div>

            {/* DPS Δ badge */}
            {hasDiff && (
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-[9px] px-1 py-0.5 rounded bg-poe-negative/20 text-poe-negative border border-poe-negative/30">
                  DPS -12.3%
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="h-10 flex items-center justify-center text-[10px] text-poe-textDim italic">
          空
        </div>
      )}
    </div>
  );
}
