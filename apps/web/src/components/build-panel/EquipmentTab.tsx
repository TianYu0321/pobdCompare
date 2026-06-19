import { useState } from 'react';
import type { NormalizedBuild, BuildDiffResult } from '@/types';
import EquipmentSlot from './EquipmentSlot';
import EquipmentDetailDrawer from './EquipmentDetailDrawer';

interface EquipmentTabProps {
  build: NormalizedBuild;
  side: 'A' | 'B';
  diffResult: BuildDiffResult | null;
}

// 标准 PoE2 装备栏网格布局
// 3列 × 5行 + 第二武器组 + Charm
const SLOT_LAYOUT = [
  // 第1行：头盔（居中）
  { slotName: 'Helm', label: 'HELM', col: 'col-start-2' },
  // 第2行：武器1 - 胸甲 - 副手
  { slotName: 'Weapon', label: 'WEAPON 1', col: 'col-start-1' },
  { slotName: 'BodyArmour', label: 'BODY ARMOUR', col: 'col-start-2' },
  { slotName: 'Offhand', label: 'OFFHAND', col: 'col-start-3' },
  // 第3行：手套 - 腰带 - 鞋子
  { slotName: 'Gloves', label: 'GLOVES', col: 'col-start-1' },
  { slotName: 'Belt', label: 'BELT', col: 'col-start-2' },
  { slotName: 'Boots', label: 'BOOTS', col: 'col-start-3' },
  // 第4行：戒指1 - 项链 - 戒指2
  { slotName: 'Ring', label: 'RING 1', col: 'col-start-1' },
  { slotName: 'Amulet', label: 'AMULET', col: 'col-start-2' },
  { slotName: 'Ring2', label: 'RING 2', col: 'col-start-3' },
  // 第5行：Charm
  { slotName: 'Charm1', label: 'CHARM 1', col: 'col-start-1' },
  { slotName: 'Charm2', label: 'CHARM 2', col: 'col-start-2' },
  { slotName: 'Charm3', label: 'CHARM 3', col: 'col-start-3' },
];

export default function EquipmentTab({ build, diffResult }: EquipmentTabProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // 按槽位查找装备
  const slotMap = new Map<string, typeof build.equipments[0]>();
  for (const slot of build.equipments) {
    slotMap.set(slot.slotName, slot);
  }

  // 计算差异数据
  const getSlotDiff = (slotName: string) => {
    if (!diffResult) return null;
    return diffResult.equipmentDiff.slotDiffs.find((s) => s.slotName === slotName) ?? null;
  };

  const selectedSlotData = selectedSlot ? slotMap.get(selectedSlot) : null;

  return (
    <div className="relative">
      {/* 装备网格 */}
      <div className="grid grid-cols-3 gap-2">
        {SLOT_LAYOUT.map((layout) => {
          const slot = slotMap.get(layout.slotName);
          const slotDiff = getSlotDiff(layout.slotName);
          return (
            <div key={layout.slotName} className={layout.col}>
              <EquipmentSlot
                label={layout.label}
                slotName={layout.slotName}
                item={slot?.item}
                empty={slot?.empty ?? !slot?.item}
                slotDiff={slotDiff}
                onClick={() => setSelectedSlot(layout.slotName)}
              />
            </div>
          );
        })}
      </div>

      {/* 第二武器组 */}
      {(slotMap.get('Weapon2')?.item || slotMap.get('Offhand2')?.item) && (
        <div className="mt-3">
          <div className="text-[10px] text-poe-textMuted uppercase tracking-wider mb-1">
            武器组 2
          </div>
          <div className="grid grid-cols-3 gap-2">
            <EquipmentSlot
              label="WEAPON 2"
              slotName="Weapon2"
              item={slotMap.get('Weapon2')?.item}
              empty={!slotMap.get('Weapon2')?.item}
              slotDiff={getSlotDiff('Weapon2')}
              onClick={() => setSelectedSlot('Weapon2')}
            />
            <div />
            <EquipmentSlot
              label="OFFHAND 2"
              slotName="Offhand2"
              item={slotMap.get('Offhand2')?.item}
              empty={!slotMap.get('Offhand2')?.item}
              slotDiff={getSlotDiff('Offhand2')}
              onClick={() => setSelectedSlot('Offhand2')}
            />
          </div>
        </div>
      )}

      {/* 详情抽屉 */}
      {selectedSlot && selectedSlotData && (
        <EquipmentDetailDrawer
          slotName={selectedSlot}
          item={selectedSlotData.item}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
}
