import type { NormalizedBuild, EquipmentDiff } from '@pobd/schemas';

export function computeEquipmentDiff(myBuild: NormalizedBuild, targetBuild: NormalizedBuild): EquipmentDiff {
  const myItems = myBuild.equipments.map((e) => e.item?.name ?? 'empty').filter((n) => n !== 'empty');
  const targetItems = targetBuild.equipments.map((e) => e.item?.name ?? 'empty').filter((n) => n !== 'empty');

  const missingItems = targetItems.filter((i) => !myItems.includes(i));
  const extraItems = myItems.filter((i) => !targetItems.includes(i));
  const commonItems = myItems.filter((i) => targetItems.includes(i));

  const allSlotNames = new Set<string>([
    ...myBuild.equipments.map((e) => e.slotName),
    ...targetBuild.equipments.map((e) => e.slotName),
  ]);

  const slotDiffs = Array.from(allSlotNames).map((slotName) => {
    const mySlot = myBuild.equipments.find((e) => e.slotName === slotName);
    const targetSlot = targetBuild.equipments.find((e) => e.slotName === slotName);
    return {
      slotName,
      myItem: mySlot?.item?.name,
      targetItem: targetSlot?.item?.name,
    };
  });

  return { myItems, targetItems, missingItems, extraItems, commonItems, slotDiffs };
}
