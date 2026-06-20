/**
 * Map of alias → canonical slot name used by PoB2.
 * Covers Helm/Helmet, Body/BodyArmour, Weapon1/Weapon/MainHand,
 * Weapon2/Offhand, Gloves, Belt, Boots, Ring1/Ring/left, Ring2/right,
 * Amulet, Charm1-3.
 */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  helm: 'Helm',
  helmet: 'Helm',
  bodyarmour: 'Body Armour',
  body: 'Body Armour',
  weapon1: 'Weapon 1',
  weapon: 'Weapon 1',
  mainhand: 'Weapon 1',
  'main hand': 'Weapon 1',
  weapon2: 'Weapon 2',
  offhand: 'Weapon 2',
  'off hand': 'Weapon 2',
  gloves: 'Gloves',
  belt: 'Belt',
  boots: 'Boots',
  ring1: 'Ring 1',
  ring: 'Ring 1',
  ringleft: 'Ring 1',
  'ring left': 'Ring 1',
  'leftring': 'Ring 1',
  ring2: 'Ring 2',
  ringright: 'Ring 2',
  'ring right': 'Ring 2',
  'rightring': 'Ring 2',
  amulet: 'Amulet',
  charm1: 'Charm 1',
  charm: 'Charm 1',
  charm2: 'Charm 2',
  charm3: 'Charm 3',
};

function normalizeKey(input: string): string {
  return input.toLowerCase().replace(/[\s_-]/g, '');
}

/** Canonical slot name for the frontend (lowercase key, e.g. "helm", "weapon1"). */
const ALIAS_TO_KEY: Record<string, string> = {
  helm: 'helm',
  helmet: 'helm',
  bodyarmour: 'bodyarmour',
  body: 'bodyarmour',
  weapon1: 'weapon1',
  weapon: 'weapon1',
  mainhand: 'weapon1',
  'main hand': 'weapon1',
  weapon2: 'weapon2',
  offhand: 'weapon2',
  'off hand': 'weapon2',
  gloves: 'gloves',
  belt: 'belt',
  boots: 'boots',
  ring1: 'ring1',
  ring: 'ring1',
  ringleft: 'ring1',
  'ring left': 'ring1',
  'leftring': 'ring1',
  ring2: 'ring2',
  ringright: 'ring2',
  'ring right': 'ring2',
  'rightring': 'ring2',
  amulet: 'amulet',
  charm1: 'charm1',
  charm: 'charm1',
  charm2: 'charm2',
  charm3: 'charm3',
};

/**
 * Resolves any common PoE2 equipment slot alias to its canonical name.
 * Unknown inputs are returned as-is (trimmed).
 */
export function toCanonicalSlot(input: string): string {
  const key = normalizeKey(input);
  return ALIAS_TO_CANONICAL[key] ?? input.trim();
}

/**
 * Resolves to a lowercase canonical key for frontend slot matching.
 * e.g. "Helmet" → "helm", "Main Hand" → "weapon1".
 */
export function toCanonicalSlotKey(input: string): string {
  const key = normalizeKey(input);
  return ALIAS_TO_KEY[key] ?? key;
}

/**
 * Returns true when both slot names map to the same canonical slot family.
 */
export function isCanonicalSlotFamily(a: string, b: string): boolean {
  return toCanonicalSlot(a) === toCanonicalSlot(b);
}
