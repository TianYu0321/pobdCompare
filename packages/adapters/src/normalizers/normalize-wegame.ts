import type {
  NormalizedBuild,
  SkillGroup,
  SkillDps,
  EquipmentSlot,
  EquipmentItem,
  WeaponSet,
  PassiveNode,
  Jewel,
  PanelAttributes,
  SupportGem,
} from "@pobd/schemas";

/**
 * Normalize WeGame API raw data into NormalizedBuild.
 */
export function normalizeWeGame(data: {
  roleInfo: {
    name: string;
    level: number;
    class_name: string;
    phrase: string;
    role_id: string;
    account_name: string;
    created_time: string;
    total_game_duration: string;
    season_game_duration: string;
    last_login_time: string;
    league_id: string;
  };
  equipments: unknown[];
  skills: unknown[];
  skillsDps: unknown[];
  talentTree: { hashes: number[] };
  panel: Record<string, unknown>;
  jewels: unknown;
  roleKeyData: Record<string, unknown>;
  roleSummary: Record<string, unknown>;
  raw: Record<string, unknown>;
}): NormalizedBuild {
  const warnings: string[] = [];

  const character = {
    name: data.roleInfo.name,
    level: data.roleInfo.level,
    className: data.roleInfo.class_name,
    ascendancy: undefined,
    roleId: data.roleInfo.role_id,
  };

  const equipments = normalizeEquipments(data.equipments, warnings);
  const weaponSets = extractWeaponSets(equipments, warnings);
  const skills = normalizeSkills(data.skills, warnings);
  const skillDps = normalizeSkillsDps(data.skillsDps, warnings);
  const passives = normalizePassives(data.talentTree.hashes, warnings);
  const jewels = normalizeJewels(data.jewels, warnings);
  const panel = normalizePanel(data.panel, data.roleInfo);

  return {
    source: "wegame",
    meta: {
      fetchedAt: new Date().toISOString(),
      gameVersion: undefined,
      sourceVersion: undefined,
      confidence: 0.8,
    },
    character,
    skills,
    skillDps,
    equipments,
    weaponSets,
    passives,
    jewels,
    panel,
    warnings,
  };
}

function normalizeEquipments(equipments: unknown[], warnings: string[]): EquipmentSlot[] {
  const slots: EquipmentSlot[] = [];
  for (const eq of equipments) {
    if (typeof eq !== "object" || eq === null) {
      warnings.push("Skipping non-object equipment entry");
      continue;
    }
    const e = eq as Record<string, unknown>;
    const inventoryId = typeof e.inventoryId === "string" ? e.inventoryId : "Unknown";
    const name = typeof e.name === "string" ? e.name : "";
    const baseType = typeof e.baseType === "string" ? e.baseType : "";
    const rarity = typeof e.rarity === "string" ? e.rarity : "";
    const ilvl = typeof e.ilvl === "number" ? e.ilvl : undefined;
    const icon = typeof e.icon === "string" ? e.icon : undefined;

    const item: EquipmentItem = {
      id: typeof e.id === "string" ? e.id : undefined,
      name,
      baseType,
      rarity,
      ilvl,
      icon,
      explicitMods: Array.isArray(e.explicitMods) ? e.explicitMods.map(String) : undefined,
      implicitMods: Array.isArray(e.implicitMods) ? e.implicitMods.map(String) : undefined,
      bondedMods: Array.isArray(e.bondedMods) ? e.bondedMods.map(String) : undefined,
      properties: Array.isArray(e.properties) ? e.properties : undefined,
      requirements: Array.isArray(e.requirements) ? e.requirements : undefined,
      socketedItems: Array.isArray(e.socketedItems) ? e.socketedItems : undefined,
      inventoryId,
    };

    slots.push({ slotName: inventoryId, item, empty: !name && !baseType });
  }
  return slots;
}

function extractWeaponSets(equipments: EquipmentSlot[], warnings: string[]): WeaponSet[] {
  const ws1: WeaponSet = { id: 1, offhandEmpty: true };
  const ws2: WeaponSet = { id: 2, offhandEmpty: true };
  for (const slot of equipments) {
    const item = slot.item;
    if (!item) continue;
    if (slot.slotName === "Weapon") ws1.mainHand = item;
    else if (slot.slotName === "Offhand" || slot.slotName === "Offhand1") {
      ws1.offHand = item;
      ws1.offhandEmpty = false;
    } else if (slot.slotName === "Weapon2") ws2.mainHand = item;
    else if (slot.slotName === "Offhand2") {
      ws2.offHand = item;
      ws2.offhandEmpty = false;
    }
  }
  return [ws1, ws2];
}

function normalizeSkills(skills: unknown[], warnings: string[]): SkillGroup[] {
  const groups: SkillGroup[] = [];
  for (const sk of skills) {
    if (typeof sk !== "object" || sk === null) {
      warnings.push("Skipping non-object skill entry");
      continue;
    }
    const s = sk as Record<string, unknown>;
    const skillName = typeof s.typeLine === "string" ? s.typeLine : "Unknown Skill";
    const inventoryId = typeof s.inventoryId === "string" ? s.inventoryId : undefined;
    const icon = typeof s.icon === "string" ? s.icon : undefined;
    const gemSkill = typeof s.gemSkill === "string" ? s.gemSkill : undefined;

    const supports: SupportGem[] = [];
    if (Array.isArray(s.socketedItems)) {
      for (const si of s.socketedItems) {
        if (typeof si === "object" && si !== null) {
          const socketed = si as Record<string, unknown>;
          const supportName = typeof socketed.typeLine === "string" ? socketed.typeLine : "";
          if (supportName && socketed.support === true) {
            supports.push({ name: supportName, tags: [] });
          }
        }
      }
    }

    groups.push({
      id: typeof s.id === "string" ? s.id : undefined,
      name: skillName,
      slot: inventoryId,
      weaponSet: "unknown",
      supports,
      tags: [],
      icon,
      gemSkill,
    });
  }
  return groups;
}

function normalizeSkillsDps(skillsDps: unknown[], warnings: string[]): SkillDps[] {
  const dpsList: SkillDps[] = [];
  for (const dps of skillsDps) {
    if (typeof dps !== "object" || dps === null) {
      warnings.push("Skipping non-object DPS entry");
      continue;
    }
    const d = dps as Record<string, unknown>;
    const skillId = typeof d.id === "string" ? d.id : undefined;
    const dpsValue = typeof d.dps === "string" ? parseFloat(d.dps) : typeof d.dps === "number" ? d.dps : undefined;
    dpsList.push({ skillId, skillName: skillId ?? "Unknown", dps: dpsValue, source: "wegame" });
  }
  return dpsList;
}

function normalizePassives(hashes: number[], warnings: string[]): PassiveNode[] {
  return hashes.map((id) => ({ id }));
}

function normalizeJewels(jewels: unknown, warnings: string[]): Jewel[] {
  let entries: unknown[] = [];
  if (Array.isArray(jewels)) {
    entries = jewels;
  } else if (typeof jewels === "object" && jewels !== null) {
    const jewelData = (jewels as Record<string, unknown>).jewel_data;
    if (typeof jewelData === "string") {
      try {
        const parsed = JSON.parse(jewelData);
        entries = Array.isArray(parsed) ? parsed : [];
      } catch {
        warnings.push("Unable to parse WeGame jewel_data");
      }
    }
  }

  const result: Jewel[] = [];
  for (const j of entries) {
    if (typeof j !== "object" || j === null) {
      warnings.push("Skipping non-object jewel entry");
      continue;
    }
    const jewel = j as Record<string, unknown>;
    const nested =
      typeof jewel.jewel === "object" && jewel.jewel !== null
        ? (jewel.jewel as Record<string, unknown>)
        : jewel;
    result.push({
      id: typeof nested.id === "string" ? nested.id : undefined,
      name:
        typeof nested.display_name === "string"
          ? nested.display_name
          : typeof nested.name === "string"
            ? nested.name
            : undefined,
      slotName:
        typeof jewel.socket_id === "string"
          ? jewel.socket_id
          : typeof jewel.inventoryId === "string"
            ? jewel.inventoryId
            : undefined,
      passiveNodes: Array.isArray(jewel.passiveNodes) ? jewel.passiveNodes.map(Number) : undefined,
    });
  }
  return result;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizePanel(
  panel: Record<string, unknown>,
  roleInfo: { total_game_duration: string; season_game_duration: string; last_login_time: string; league_id: string },
): PanelAttributes {
  return {
    life: optionalNumber(panel.life),
    mana: optionalNumber(panel.mana),
    energyShield: optionalNumber(panel.energy_shield),
    armour: optionalNumber(panel.armour),
    evasion: optionalNumber(panel.evasion_rating),
    blockChance: optionalNumber(panel.block_chance),
    movementSpeed: optionalNumber(panel.movement_velocity),
    resistances: {
      fire: optionalNumber(panel.fire_resistance) ?? 0,
      cold: optionalNumber(panel.cold_resistance) ?? 0,
      lightning: optionalNumber(panel.lightning_resistance) ?? 0,
      chaos: optionalNumber(panel.chaos_resistance) ?? 0,
    },
    totalGameDuration: roleInfo.total_game_duration,
    seasonGameDuration: roleInfo.season_game_duration,
    lastLoginTime: roleInfo.last_login_time,
    league: roleInfo.league_id,
  };
}
