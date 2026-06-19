import { describe, it, expect } from 'vitest';
import type { NormalizedBuild } from '@pobd/schemas';
import {
  computeBuildDiff,
  computeDpsDiff,
  computeSkillDiff,
  computeSupportGemDiff,
  computeEquipmentDiff,
  computeWeaponSetDiff,
  computePassiveDiff,
  computeAtlasPassiveDiff,
  computePanelDiff,
  runRules,
} from '../src/diff';

function makeBuild(partial: Partial<NormalizedBuild> = {}): NormalizedBuild {
  return {
    source: 'wegame',
    meta: { confidence: 1 },
    character: {},
    skills: [],
    skillDps: [],
    equipments: [],
    weaponSets: [],
    passives: [],
    atlasPassives: [],
    jewels: [],
    panel: {},
    warnings: [],
    ...partial,
  } as NormalizedBuild;
}

describe('computeDpsDiff', () => {
  it('returns empty when skill missing', () => {
    const a = makeBuild();
    const b = makeBuild();
    expect(computeDpsDiff(a, b, 'Lightning')).toEqual({});
  });

  it('computes diffPercent', () => {
    const a = makeBuild({ skillDps: [{ skillName: 'Lightning', dps: 100, source: 'wegame' }] });
    const b = makeBuild({ skillDps: [{ skillName: 'Lightning', dps: 80, source: 'wegame' }] });
    const d = computeDpsDiff(a, b, 'Lightning');
    expect(d.myDps).toBe(100);
    expect(d.targetDps).toBe(80);
    expect(d.diffPercent).toBeCloseTo(25);
  });

  it('matches by partial name', () => {
    const a = makeBuild({ skillDps: [{ skillName: 'Lightning Arrow', dps: 50, source: 'wegame' }] });
    const b = makeBuild({ skillDps: [{ skillName: 'Lightning Arrow', dps: 100, source: 'wegame' }] });
    const d = computeDpsDiff(a, b, 'Lightning');
    expect(d.myDps).toBe(50);
    expect(d.diffPercent).toBeCloseTo(-50);
  });

  it('fallback to single skill', () => {
    const a = makeBuild({ skillDps: [{ skillName: 'Other', dps: 200, source: 'wegame' }] });
    const b = makeBuild({ skillDps: [{ skillName: 'Other', dps: 100, source: 'wegame' }] });
    const d = computeDpsDiff(a, b, 'Lightning');
    expect(d.myDps).toBe(200);
  });
});

describe('computeSkillDiff', () => {
  it('finds missing and extra skills', () => {
    const a = makeBuild({ skills: [{ name: 'A', supports: [], tags: [] }, { name: 'B', supports: [], tags: [] }] });
    const b = makeBuild({ skills: [{ name: 'B', supports: [], tags: [] }, { name: 'C', supports: [], tags: [] }] });
    const d = computeSkillDiff(a, b);
    expect(d.missingSkills).toEqual(['C']);
    expect(d.extraSkills).toEqual(['A']);
    expect(d.commonSkills).toEqual(['B']);
  });
});

describe('computeSupportGemDiff', () => {
  it('finds missing support gems', () => {
    const a = makeBuild({
      skills: [{ name: 'S', supports: [{ name: 'Added Fire' }], tags: [] }],
    });
    const b = makeBuild({
      skills: [{ name: 'S', supports: [{ name: 'Added Fire' }, { name: 'Added Cold' }], tags: [] }],
    });
    const d = computeSupportGemDiff(a, b);
    expect(d.missingSupports).toEqual(['Added Cold']);
    expect(d.commonSupports).toEqual(['Added Fire']);
  });
});

describe('computeEquipmentDiff', () => {
  it('finds missing items and slot diffs', () => {
    const a = makeBuild({
      equipments: [
        { slotName: 'Helmet', item: { name: 'Helm A', baseType: 'Base' } },
        { slotName: 'Body', item: { name: 'Body A', baseType: 'Base' } },
      ],
    });
    const b = makeBuild({
      equipments: [
        { slotName: 'Helmet', item: { name: 'Helm B', baseType: 'Base' } },
        { slotName: 'Gloves', item: { name: 'Gloves B', baseType: 'Base' } },
      ],
    });
    const d = computeEquipmentDiff(a, b);
    expect(d.missingItems).toContain('Gloves B');
    expect(d.extraItems).toContain('Body A');
    expect(d.slotDiffs).toHaveLength(3);
    const helmet = d.slotDiffs.find((s) => s.slotName === 'Helmet');
    expect(helmet?.myItem).toBe('Helm A');
    expect(helmet?.targetItem).toBe('Helm B');
  });
});

describe('computeWeaponSetDiff', () => {
  it('detects weapon changes', () => {
    const a = makeBuild({
      weaponSets: [
        { id: 1, mainHand: { name: 'Bow A', baseType: 'Bow' }, offhandEmpty: true },
        { id: 2, mainHand: { name: 'Sword A', baseType: 'Sword' }, offhandEmpty: true },
      ],
    });
    const b = makeBuild({
      weaponSets: [
        { id: 1, mainHand: { name: 'Bow B', baseType: 'Bow' }, offhandEmpty: true },
        { id: 2, mainHand: { name: 'Sword A', baseType: 'Sword' }, offhandEmpty: true },
      ],
    });
    const d = computeWeaponSetDiff(a, b);
    expect(d.ws1Diff.mainHandChanged).toBe(true);
    expect(d.ws2Diff.mainHandChanged).toBe(false);
  });
});

describe('computePassiveDiff', () => {
  it('finds missing and extra passives', () => {
    const a = makeBuild({ passives: [{ id: 1 }, { id: 2 }] });
    const b = makeBuild({ passives: [{ id: 2 }, { id: 3 }] });
    const d = computePassiveDiff(a, b);
    expect(d.missingNodes).toEqual([3]);
    expect(d.extraNodes).toEqual([1]);
    expect(d.commonNodes).toEqual([2]);
  });
});

describe('computeAtlasPassiveDiff', () => {
  it('returns undefined when both empty', () => {
    const a = makeBuild();
    const b = makeBuild();
    expect(computeAtlasPassiveDiff(a, b)).toBeUndefined();
  });

  it('finds atlas passive differences', () => {
    const a = makeBuild({ atlasPassives: [{ id: 10 }] });
    const b = makeBuild({ atlasPassives: [{ id: 10 }, { id: 20 }] });
    const d = computeAtlasPassiveDiff(a, b);
    expect(d?.missingNodes).toEqual([20]);
  });
});

describe('computePanelDiff', () => {
  it('computes numeric diffs', () => {
    const a = makeBuild({ panel: { life: 1000, mana: 500, energyShield: 200 } });
    const b = makeBuild({ panel: { life: 900, mana: 500, energyShield: 250 } });
    const d = computePanelDiff(a, b);
    expect(d.lifeDiff).toBe(100);
    expect(d.manaDiff).toBe(0);
    expect(d.energyShieldDiff).toBe(-50);
  });

  it('handles resistances', () => {
    const a = makeBuild({ panel: { resistances: { fire: 75, cold: 60 } } });
    const b = makeBuild({ panel: { resistances: { fire: 70, cold: 60, lightning: 50 } } });
    const d = computePanelDiff(a, b);
    expect(d.resistanceDiffs).toEqual({ fire: 5, cold: 0 });
  });
});

describe('runRules', () => {
  it('warns missing main skill', () => {
    const a = makeBuild({ skills: [{ name: 'Other', supports: [], tags: [] }] });
    const b = makeBuild({ skills: [{ name: 'Main', supports: [], tags: [] }] });
    const diff = computeBuildDiff(a, b, 'Main');
    const missing = diff.ruleWarnings.find((w) => w.ruleId === 'missing_main_skill');
    expect(missing).toBeDefined();
    expect(missing?.impact).toBe('high');
  });

  it('warns large dps gap', () => {
    const a = makeBuild({ skillDps: [{ skillName: 'Main', dps: 50, source: 'wegame' }] });
    const b = makeBuild({ skillDps: [{ skillName: 'Main', dps: 100, source: 'wegame' }] });
    const diff = computeBuildDiff(a, b, 'Main');
    const gap = diff.ruleWarnings.find((w) => w.ruleId === 'large_dps_gap');
    expect(gap).toBeDefined();
    expect(gap?.impact).toBe('high');
  });

  it('warns missing support gems', () => {
    const a = makeBuild({ skills: [{ name: 'Main', supports: [{ name: 'A' }], tags: [] }] });
    const b = makeBuild({ skills: [{ name: 'Main', supports: [{ name: 'A' }, { name: 'B' }], tags: [] }] });
    const diff = computeBuildDiff(a, b, 'Main');
    const missing = diff.ruleWarnings.find((w) => w.ruleId === 'missing_support_gems');
    expect(missing).toBeDefined();
    expect(missing?.evidence).toContain('B');
  });

  it('warns Dance with Death mismatch', () => {
    const a = makeBuild({ skills: [{ name: 'S', supports: [{ name: '死亡之舞' }], tags: [] }] });
    const b = makeBuild({ skills: [{ name: 'S', supports: [], tags: [] }] });
    const diff = computeBuildDiff(a, b, 'S');
    const dance = diff.ruleWarnings.find((w) => w.ruleId === 'dance_with_death');
    expect(dance).toBeDefined();
  });

  it('warns missing DPS data', () => {
    const a = makeBuild();
    const b = makeBuild();
    const diff = computeBuildDiff(a, b, 'Main');
    const missing = diff.ruleWarnings.find((w) => w.ruleId === 'missing_dps_data');
    expect(missing).toBeDefined();
    expect(missing?.impact).toBe('high');
  });
});

describe('computeBuildDiff', () => {
  it('returns full diff with high confidence when data complete', () => {
    const a = makeBuild({
      skills: [{ name: 'Lightning', supports: [{ name: 'Added Fire' }], tags: [] }],
      skillDps: [{ skillName: 'Lightning', dps: 100, source: 'wegame' }],
      panel: { life: 1000, mana: 500 },
    });
    const b = makeBuild({
      skills: [{ name: 'Lightning', supports: [{ name: 'Added Fire' }, { name: 'Added Cold' }], tags: [] }],
      skillDps: [{ skillName: 'Lightning', dps: 80, source: 'wegame' }],
      panel: { life: 900, mana: 500 },
    });
    const diff = computeBuildDiff(a, b, 'Lightning');
    expect(diff.mainSkill).toBe('Lightning');
    expect(diff.confidence).toBe('high');
    expect(diff.missingData).toHaveLength(0);
    expect(diff.dpsDiff?.diffPercent).toBeCloseTo(25);
    expect(diff.panelDiff.lifeDiff).toBe(100);
  });

  it('returns medium confidence with some missing data', () => {
    const a = makeBuild();
    const b = makeBuild({ skillDps: [{ skillName: 'Lightning', dps: 80, source: 'wegame' }] });
    const diff = computeBuildDiff(a, b, 'Lightning');
    expect(diff.confidence).toBe('medium');
    expect(diff.missingData).toContain('myBuild.skillDps');
  });
});
