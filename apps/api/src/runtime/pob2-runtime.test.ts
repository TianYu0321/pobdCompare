import { describe, expect, it, vi } from 'vitest';

import type { BaselineSnapshot, BuildMutation } from '@pobd/schemas';

import { Pob2Runtime } from './pob2-runtime';
import { BaselineManager } from '@pobd/core';

function baseline(): BaselineSnapshot {
  return {
    id: 'base',
    baselineHash: 'base-hash',
    source: 'build_file',
    buildXml: '<PathOfBuilding/>',
    buildXmlCanonicalHash: 'xml-hash',
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
    items: [],
    passiveNodes: [],
    ascendNodes: [],
    jewels: [],
    createdAt: 1,
  };
}

const mutation: BuildMutation = {
  mutationId: 'swap-1',
  type: 'item_swap',
  baselineHash: 'base-hash',
  payload: {
    slotName: 'Weapon 1',
    itemRaw: 'Rarity: Rare\nTest Weapon\nMace',
  },
  source: 'candidate_list',
};

describe('Pob2Runtime.applyGearSwap', () => {
  it('returns invalid_variant when PoB2 succeeds without variant XML', async () => {
    const runtime = new Pob2Runtime();
    const internals = runtime as unknown as {
      manager: object;
      pool: {
        submit: () => Promise<{
          success: true;
          calcsOutput: Record<string, unknown>;
          breakdown: Record<string, unknown>;
        }>;
      };
    };
    internals.manager = {};
    internals.pool = {
      submit: async () => ({
        success: true,
        calcsOutput: { CombinedDPS: 150 },
        breakdown: {},
      }),
    };

    const result = await runtime.applyGearSwap({
      baseline: baseline(),
      currentBuildXml: '<PathOfBuilding current="1"/>',
      mutation,
    });

    expect(result.buildXml).toBe('<PathOfBuilding current="1"/>');
    expect(result.snapshot.baselineHash).toBe('base-hash');
    expect(result.result.resultKind).toBe('invalid_variant');
    expect(result.result.errorCode).toBe('variant_xml_missing');
  });

  it('marks mainSkillStillValid=false when skill has 0 DPS after swap', async () => {
    const runtime = new Pob2Runtime();
    const internals = runtime as unknown as {
      manager: { computeBaseline: () => Promise<BaselineSnapshot> };
      pool: {
        submit: () => Promise<{
          success: true;
          variantXml: string;
          calcsOutput: Record<string, unknown>;
          breakdown: Record<string, unknown>;
          skillDpsList: Array<{ skillNumber: number; name: string; dps: number; enabled: boolean }>;
        }>;
      };
      computeBaseline: () => Promise<BaselineSnapshot>;
    };
    const base = baseline();
    base.mainSkillSelection = {
      selectedSkillNumber: 1,
      selectedSkillName: 'Broken Skill',
      selectionMode: 'auto_single',
      candidates: [],
      warnings: [],
    };
    base.skillDpsList = [{ skillNumber: 1, name: 'Broken Skill', dps: 100, enabled: true }];

    internals.manager = { computeBaseline: async () => base };
    internals.computeBaseline = async () => base;
    internals.pool = {
      submit: async () => ({
        success: true,
        variantXml: '<PathOfBuilding variant="swap"/>',
        calcsOutput: { CombinedDPS: 0, Life: 2000 },
        breakdown: {},
        skillDpsList: [{ skillNumber: 1, name: 'Broken Skill', dps: 0, enabled: true }],
      }),
    };

    const result = await runtime.applyGearSwap({
      baseline: base,
      currentBuildXml: '<PathOfBuilding/>',
      mutation,
    });

    expect(result.result.isMainSkillStillValid).toBe(false);
  });

  it('marks mainSkillStillValid=true when skill has valid DPS after swap', async () => {
    const runtime = new Pob2Runtime();
    const internals = runtime as unknown as {
      manager: { computeBaseline: () => Promise<BaselineSnapshot> };
      pool: {
        submit: () => Promise<{
          success: true;
          variantXml: string;
          calcsOutput: Record<string, unknown>;
          breakdown: Record<string, unknown>;
          skillDpsList: Array<{ skillNumber: number; name: string; dps: number; enabled: boolean }>;
        }>;
      };
      computeBaseline: () => Promise<BaselineSnapshot>;
    };
    const base = baseline();
    base.mainSkillSelection = {
      selectedSkillNumber: 1,
      selectedSkillName: 'Working Skill',
      selectionMode: 'auto_single',
      candidates: [],
      warnings: [],
    };
    base.skillDpsList = [{ skillNumber: 1, name: 'Working Skill', dps: 100, enabled: true }];

    internals.manager = { computeBaseline: async () => base };
    internals.computeBaseline = async () => base;
    internals.pool = {
      submit: async () => ({
        success: true,
        variantXml: '<PathOfBuilding variant="swap"/>',
        calcsOutput: { CombinedDPS: 150, Life: 2000 },
        breakdown: {},
        skillDpsList: [{ skillNumber: 1, name: 'Working Skill', dps: 150, enabled: true }],
      }),
    };

    const result = await runtime.applyGearSwap({
      baseline: base,
      currentBuildXml: '<PathOfBuilding/>',
      mutation,
    });

    expect(result.result.isMainSkillStillValid).toBe(true);
  });

  it.each([
    ['missing itemRaw', 'Missing itemRaw in gear swap payload', 'missing_item_raw'],
    ['unparseable item', 'PoB2 could not parse candidate item raw text', 'unparseable_item_raw'],
    ['item creation failed', 'Failed to create target-build item: attempt to index a nil value', 'item_creation_failed'],
    ['slot not found', 'Slot not found: Weapon 99', 'slot_not_found'],
    ['missing slotName', 'Missing slotName in mutation payload', 'invalid_payload'],
  ])('worker error "%s" maps to invalid_variant/%s', async (_label, errorText, expectedCode) => {
    const runtime = new Pob2Runtime();
    const internals = runtime as unknown as {
      manager: object;
      pool: { submit: () => Promise<{ success: false; error: string }> };
    };
    internals.manager = {};
    internals.pool = {
      submit: async () => ({ success: false, error: errorText }),
    };

    const result = await runtime.applyGearSwap({
      baseline: baseline(),
      currentBuildXml: '<PathOfBuilding/>',
      mutation,
    });

    expect(result.result.resultKind).toBe('invalid_variant');
    expect(result.result.errorCode).toBe(expectedCode);
    expect(result.buildXml).toBe('<PathOfBuilding/>');
    expect(result.snapshot.baselineHash).toBe('base-hash');
  });

  it('handles skillDpsList: {} from worker (empty Lua table shape) without crashing', async () => {
    const runtime = new Pob2Runtime();
    const internals = runtime as unknown as {
      manager: { computeBaseline: () => Promise<BaselineSnapshot> };
      pool: {
        submit: () => Promise<{
          success: true;
          variantXml: string;
          calcsOutput: Record<string, unknown>;
          breakdown: Record<string, unknown>;
          skillDpsList: Record<string, never>;
        }>;
      };
      computeBaseline: () => Promise<BaselineSnapshot>;
    };
    const base = baseline();
    base.mainSkillSelection = {
      selectedSkillNumber: 1,
      selectedSkillName: 'Any Skill',
      selectionMode: 'auto_single',
      candidates: [],
      warnings: [],
    };
    base.skillDpsList = [{ skillNumber: 1, name: 'Any Skill', dps: 100, enabled: true }];

    internals.manager = { computeBaseline: async () => base };
    internals.computeBaseline = async () => base;
    // Worker returns skillDpsList as {} (empty Lua table → empty JS object)
    internals.pool = {
      submit: async () => ({
        success: true,
        variantXml: '<PathOfBuilding variant="swap"/>',
        calcsOutput: { CombinedDPS: 50, Life: 2000 },
        breakdown: {},
        skillDpsList: Object.create(null) as Record<string, never>,
      }),
    };

    const result = await runtime.applyGearSwap({
      baseline: base,
      currentBuildXml: '<PathOfBuilding/>',
      mutation,
    });

    // Must not throw. mainSkillStillValid=false because skillDpsList had no entries.
    expect(result.result.isMainSkillStillValid).toBe(false);
    expect(result.result.resultKind).toBe('incompatible');
  });

  it('invalid preferred skill (0 DPS) falls back to highest valid PoB2 DPS and never returns user_confirmed', async () => {
    const provisional = baseline();
    provisional.skillDpsList = [
      { skillNumber: 1, name: 'Broken Skill', dps: 0, enabled: true },
      { skillNumber: 2, name: 'Valid Skill', dps: 100, enabled: true },
    ];
    const runtime = new Pob2Runtime();
    // Track calls to manager.createBaseline
    const createBaselineCalls: Array<{ skillNumber?: number; mainSkillSelection?: { selectedSkillNumber?: number } }> = [];
    const internals = runtime as unknown as {
      ensureStarted: () => Promise<void>;
      manager: { createBaseline: (xml: string, opts: Record<string, unknown>) => Promise<BaselineSnapshot> };
    };
    internals.ensureStarted = async () => {};
    internals.manager = {
      createBaseline: async (_xml: string, opts: Record<string, unknown>) => {
        const skillNumber = opts.skillNumber as number;
        const selection = opts.mainSkillSelection as { selectedSkillNumber?: number; selectedSkillName?: string; selectionMode?: string; candidates?: unknown[]; warnings?: string[] } | undefined;
        createBaselineCalls.push({ skillNumber, mainSkillSelection: selection ? { selectedSkillNumber: selection.selectedSkillNumber } : undefined });
        // Return a baseline that reflects the requested selection
        const result = { ...provisional };
        if (selection) {
          result.mainSkillSelection = {
            ...provisional.mainSkillSelection,
            selectedSkillNumber: selection.selectedSkillNumber ?? skillNumber,
            selectedSkillName: selection.selectedSkillName ?? `Skill ${skillNumber}`,
            selectionMode: (selection.selectionMode ?? 'auto_single') as 'auto_single' | 'auto_highest_dps' | 'user_confirmed',
            candidates: selection.candidates ?? [],
            warnings: selection.warnings ?? [],
          };
        } else {
          result.mainSkillSelection = {
            ...provisional.mainSkillSelection,
            selectedSkillNumber: skillNumber,
            selectedSkillName: `Skill ${skillNumber}`,
          };
        }
        return result;
      },
    };

    const result = await runtime.computeBaseline({
      buildXml: '<PathOfBuilding/>',
      source: 'build_file',
      preferredSkillNumber: 1,
      preferredSkillName: 'Broken Skill',
    });

    // Must NOT be user_confirmed
    expect(result.mainSkillSelection.selectionMode).not.toBe('user_confirmed');
    // Must select the valid skill (2), not the broken one (1)
    expect(result.mainSkillSelection.selectedSkillNumber).toBe(2);
    expect(result.mainSkillSelection.selectedSkillName).toBe('Valid Skill');
    // Warning must mention the fallback
    expect(result.mainSkillSelection.warnings[0]).toContain('0 DPS');
    // Second call to createBaseline used skillNumber=2
    expect(createBaselineCalls[1]?.skillNumber).toBe(2);
  });
});
