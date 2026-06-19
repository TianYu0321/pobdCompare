import { describe, expect, it } from 'vitest';

import { toCanonicalSlot, toCanonicalSlotKey, isCanonicalSlotFamily } from './canonical-slots';

describe('toCanonicalSlot', () => {
  it.each([
    ['Helm', 'Helm'],
    ['Helmet', 'Helm'],
    ['helm', 'Helm'],
    ['HELMET', 'Helm'],
    ['Body Armour', 'Body Armour'],
    ['Body', 'Body Armour'],
    ['body', 'Body Armour'],
    ['BodyArmour', 'Body Armour'],
    ['Weapon 1', 'Weapon 1'],
    ['Main Hand', 'Weapon 1'],
    ['Weapon', 'Weapon 1'],
    ['mainhand', 'Weapon 1'],
    ['Weapon 2', 'Weapon 2'],
    ['Offhand', 'Weapon 2'],
    ['offhand', 'Weapon 2'],
    ['OffHand', 'Weapon 2'],
    ['Gloves', 'Gloves'],
    ['gloves', 'Gloves'],
    ['Belt', 'Belt'],
    ['belt', 'Belt'],
    ['Boots', 'Boots'],
    ['boots', 'Boots'],
    ['Ring 1', 'Ring 1'],
    ['Ring', 'Ring 1'],
    ['left ring', 'Ring 1'],
    ['ringleft', 'Ring 1'],
    ['Ring 2', 'Ring 2'],
    ['right ring', 'Ring 2'],
    ['ringright', 'Ring 2'],
    ['Ring Right', 'Ring 2'],
    ['Amulet', 'Amulet'],
    ['amulet', 'Amulet'],
    ['Charm 1', 'Charm 1'],
    ['Charm1', 'Charm 1'],
    ['Charm 2', 'Charm 2'],
    ['Charm2', 'Charm 2'],
    ['Charm 3', 'Charm 3'],
    ['Charm3', 'Charm 3'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(toCanonicalSlot(input)).toBe(expected);
  });

  it('returns unknown input as-is trimmed', () => {
    expect(toCanonicalSlot('UnknownSlot')).toBe('UnknownSlot');
    expect(toCanonicalSlot('')).toBe('');
  });
});

describe('toCanonicalSlotKey', () => {
  it.each([
    ['Helm', 'helm'],
    ['Helmet', 'helm'],
    ['Body Armour', 'bodyarmour'],
    ['Body', 'bodyarmour'],
    ['Weapon 1', 'weapon1'],
    ['Main Hand', 'weapon1'],
    ['Offhand', 'weapon2'],
    ['Gloves', 'gloves'],
    ['Belt', 'belt'],
    ['Boots', 'boots'],
    ['Ring 1', 'ring1'],
    ['Ring Left', 'ring1'],
    ['Ring 2', 'ring2'],
    ['Ring Right', 'ring2'],
    ['Amulet', 'amulet'],
    ['Charm 1', 'charm1'],
    ['Charm2', 'charm2'],
    ['Charm3', 'charm3'],
  ])('resolves %s to key %s', (input, expected) => {
    expect(toCanonicalSlotKey(input)).toBe(expected);
  });

  it('unknown slot key matches normalized key', () => {
    expect(toCanonicalSlotKey('SomeUnknown')).toBe('someunknown');
  });
});

describe('isCanonicalSlotFamily', () => {
  it('returns true when canonical names match', () => {
    expect(isCanonicalSlotFamily('Helm', 'Helmet')).toBe(true);
    expect(isCanonicalSlotFamily('Body Armour', 'Body')).toBe(true);
    expect(isCanonicalSlotFamily('Weapon 1', 'Main Hand')).toBe(true);
    expect(isCanonicalSlotFamily('Ring 1', 'Ring Left')).toBe(true);
  });

  it('returns false when canonical names differ', () => {
    expect(isCanonicalSlotFamily('Helm', 'Boots')).toBe(false);
    expect(isCanonicalSlotFamily('Weapon 1', 'Weapon 2')).toBe(false);
    expect(isCanonicalSlotFamily('Ring 1', 'Ring 2')).toBe(false);
  });
});
