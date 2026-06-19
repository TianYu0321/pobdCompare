import { describe, expect, it } from 'vitest';

import { normalizeWeGame } from './normalize-wegame';

const baseData = {
  roleInfo: {
    name: 'Test Huntress',
    level: 90,
    class_name: 'Huntress',
    phrase: 'T16',
    role_id: 'role-1',
    account_name: 'account',
    created_time: '0',
    total_game_duration: '100',
    season_game_duration: '50',
    last_login_time: '10',
    league_id: 'league-1',
  },
  equipments: [],
  skills: [],
  skillsDps: [],
  talentTree: { hashes: [1, 2] },
  roleKeyData: {},
  roleSummary: {},
  raw: {},
};

describe('normalizeWeGame', () => {
  it('maps real top-level panel fields without exposing WeGame scores', () => {
    const build = normalizeWeGame({
      ...baseData,
      panel: {
        life: '1520',
        mana: '698',
        energy_shield: '3805',
        armour: '335',
        evasion_rating: '24519',
        block_chance: '12',
        movement_velocity: 110,
        fire_resistance: '75',
        cold_resistance: '74',
        lightning_resistance: '73',
        chaos_resistance: '17',
      },
      jewels: [],
    });

    expect(build.panel).toMatchObject({
      life: 1520,
      mana: 698,
      energyShield: 3805,
      armour: 335,
      evasion: 24519,
      blockChance: 12,
      movementSpeed: 110,
      resistances: { fire: 75, cold: 74, lightning: 73, chaos: 17 },
    });
    expect(build.panel).not.toHaveProperty('score');
  });

  it('parses GetJewels jewel_data JSON strings', () => {
    const build = normalizeWeGame({
      ...baseData,
      panel: {},
      jewels: {
        jewel_data: JSON.stringify([
          {
            socket_id: 'jewel_slot1960',
            socket_name: 'Jewel Socket',
            jewel: { id: 'Metadata/Items/Jewels/JewelDex', display_name: 'Storm Eye' },
          },
        ]),
      },
    });

    expect(build.jewels).toEqual([
      {
        id: 'Metadata/Items/Jewels/JewelDex',
        name: 'Storm Eye',
        slotName: 'jewel_slot1960',
      },
    ]);
  });
});
