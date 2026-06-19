import { describe, expect, it } from 'vitest';

import type { ImportResult, SimulationResult } from '@pobd/schemas';

import type { StoredImport } from '../services/import-service';
import { WorkspaceStore } from './workspace-store';

function imported(id: string, hash: string, itemName: string): StoredImport {
  const result: ImportResult = {
    id,
    source: 'build_file',
    status: 'calculable',
    conversionReport: {
      status: 'complete',
      skillMapped: 0,
      skillTotal: 0,
      itemMapped: 0,
      itemTotal: 0,
      modMapped: 0,
      modTotal: 0,
      passiveMapped: 0,
      passiveTotal: 0,
      ascendancyMapped: 0,
      ascendancyTotal: 0,
      configKnown: 0,
      configTotal: 0,
      unknownMods: [],
      unmappedNodes: [],
      unmappedSkills: [],
      unmappedItems: [],
      warnings: [],
    },
    warnings: [],
    baseline: {
      id,
      baselineHash: hash,
      source: 'build_file',
      buildXml: '<PathOfBuilding/>',
      buildXmlCanonicalHash: hash,
      pob2Version: '1',
      pob2DataVersion: '1',
      gameVersion: 'poe2',
      character: {},
      mainSkillSelection: {
        selectedSkillNumber: 1,
        selectedSkillName: 'Skill',
        selectionMode: 'auto_single',
        candidates: [],
        warnings: [],
      },
      skillNumber: 1,
      weaponSet: 1,
      config: {},
      calcsOutput: { CombinedDPS: 100 },
      rawBreakdown: {},
      skillDpsList: [],
      skillGroups: [],
      items: [
        {
          slotName: 'Weapon 1',
          itemId: 1,
          name: itemName,
          baseType: 'Mace',
          rawText: `Rarity: Rare\n${itemName}\nMace`,
        },
      ],
      passiveNodes: [],
      ascendNodes: [],
      jewels: [],
      createdAt: 1,
    },
  };
  return { ...result, buildXml: '<PathOfBuilding/>' };
}

describe('WorkspaceStore', () => {
  it('creates revisions and supports undo, redo and reset', async () => {
    const fakeResult = {
      variantHash: 'variant-1',
      resultKind: 'normal_gain',
      dpsDeltaPercent: 10,
    } as SimulationResult;
    const store = new WorkspaceStore({
      applyGearSwap: async () => ({
        buildXml: '<PathOfBuilding variant="1"/>',
        result: fakeResult,
      }),
    });
    const workspace = store.create(imported('a', 'hash-a', 'Axe'), imported('b', 'hash-b', 'Maul'));
    const candidate = store
      .gearCandidates(workspace.id, 'a')
      .find((item) => item.sourceSide === 'b')!;

    await store.applyGearSwap(workspace.id, 'a', candidate.id);
    expect(store.get(workspace.id)?.a.session.cursor).toBe(1);
    expect(store.undo(workspace.id, 'a').revisionId).toBe('rev-0');
    expect(store.redo(workspace.id, 'a').variantHash).toBe('variant-1');
    expect(store.reset(workspace.id, 'a').revisionId).toBe('rev-0');
  });
});
