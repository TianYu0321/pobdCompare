import { afterEach, describe, expect, it, vi } from 'vitest';

import { WeGameAdapter } from './wegame-adapter';
import {
  addUnknownMod,
  addUnmappedItem,
  addUnmappedSkill,
  addWarning,
  createConversionReport,
  finalizeReport,
  incrementMapped,
  incrementTotal,
} from './conversion-report';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WeGameAdapter live response normalization', () => {
  it('preserves top-level talent, jewel and role-key payloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const operation = url.split('/').at(-1);
      const payloads: Record<string, Record<string, unknown>> = {
        GetRoleInfo: {
          role: {
            openid: 'open',
            role_id: 'role',
            name: 'Tester',
            level: 90,
            class_id: 0,
            class_name: 'Martial Artist',
            league_id: 'league',
          },
          share_code: 'resolved',
        },
        GetEquipments: { equipments: [] },
        GetSkills: { skills: [] },
        GetSkillsDps: { skills_dps: [] },
        GetTalentTree: {
          hashes: [722],
          specialisations: { set1: [1] },
          quest_stats: ['reward'],
        },
        GetPanelAttr: { life: 100 },
        GetJewels: { jewel_data: '[{"id":"jewel"}]' },
        GetRoleKeyData: { data: { skills: [{ name: 'main_skill' }] } },
        GetRoleSummary: { summary: { name: 'Tester' } },
      };
      return {
        ok: true,
        json: async () => ({
          result: { error_code: 0, error_message: 'success' },
          ...payloads[operation ?? ''],
        }),
      } as Response;
    }));

    const result = await new WeGameAdapter().fetchWeGameBuild(
      'https://www.wegame.com.cn/share/test',
    );

    expect(result.talentTree).toMatchObject({
      hashes: [722],
      specialisations: { set1: [1] },
      quest_stats: ['reward'],
    });
    expect(result.jewels).toMatchObject({ jewel_data: expect.any(String) });
    expect(result.roleKeyData).toMatchObject({ skills: [{ name: 'main_skill' }] });
  });
});

const adapter = new WeGameAdapter();

describe('WeGameAdapter', () => {
  describe('isWeGameLink', () => {
    it('returns true for WeGame domains', () => {
      expect(adapter.isWeGameLink('https://wegame.com.cn/share?id=abc123')).toBe(true);
      expect(adapter.isWeGameLink('https://www.wegame.com.cn/share/abc123')).toBe(true);
      expect(adapter.isWeGameLink('https://m.wegame.com.cn/share?id=xyz')).toBe(true);
    });

    it('returns false for non-WeGame domains', () => {
      expect(adapter.isWeGameLink('https://example.com/share?id=abc123')).toBe(false);
      expect(adapter.isWeGameLink('https://poe.ninja/build')).toBe(false);
      expect(adapter.isWeGameLink('not-a-url')).toBe(false);
    });
  });

  describe('parseWeGameShareLink', () => {
    it('extracts shareId from query param', async () => {
      const result = await adapter.parseWeGameShareLink(
        'https://wegame.com.cn/share?id=abc123',
      );
      expect(result.shareId).toBe('abc123');
      expect(result.rawData).toContain('abc123');
    });

    it('extracts shareId from path', async () => {
      const result = await adapter.parseWeGameShareLink(
        'https://www.wegame.com.cn/share/abc123',
      );
      expect(result.shareId).toBe('abc123');
    });

    it('throws for non-WeGame links', async () => {
      await expect(adapter.parseWeGameShareLink('https://example.com'))
        .rejects.toThrow('Not a valid WeGame link');
    });
  });

  describe('convertToBuildXml', () => {
    it('converts placeholder JSON and returns partial report', async () => {
      const { rawData } = await adapter.parseWeGameShareLink(
        'https://wegame.com.cn/share?id=test',
      );
      const { buildXml, conversionReport } = await adapter.convertToBuildXml(rawData);

      expect(buildXml).toContain('<?xml version');
      expect(buildXml).toContain('PathOfBuilding');
      expect(conversionReport.status).toBe('partial');
      expect(conversionReport.warnings).toContain(
        'WeGame data is a placeholder; real format not yet available.',
      );
    });

    it('converts a real-looking JSON payload', async () => {
      const payload = JSON.stringify({
        name: 'MyCharacter',
        level: 90,
        class: 'Witch',
        ascendancy: 'Elementalist',
        skills: ['Fireball', 'Arcane Surge'],
        items: [
          {
            slot: 'Weapon',
            name: 'Storm Staff',
            baseType: 'Ezomyte Staff',
            mods: ['+1 to Level of all Spell Skill Gems'],
          },
          { slot: 'Body', name: 'Tabula Rasa', baseType: 'Simple Robe' },
        ],
        passiveNodes: [1, 2, 3, 4, 5],
        ascendancyNodes: [10, 11],
        config: { enemyIsBoss: true, enemyLevel: 85 },
      });

      const { buildXml, conversionReport } = await adapter.convertToBuildXml(payload);

      expect(buildXml).toContain('MyCharacter');
      expect(buildXml).toContain('Witch');
      expect(buildXml).toContain('Elementalist');
      expect(buildXml).toContain('Fireball');
      expect(buildXml).toContain('Storm Staff');
      expect(conversionReport.skillMapped).toBe(2);
      expect(conversionReport.skillTotal).toBe(2);
      expect(conversionReport.itemMapped).toBe(2);
      expect(conversionReport.itemTotal).toBe(2);
      expect(conversionReport.passiveMapped).toBe(5);
      expect(conversionReport.passiveTotal).toBe(5);
      expect(conversionReport.ascendancyMapped).toBe(2);
      expect(conversionReport.ascendancyTotal).toBe(2);
      expect(conversionReport.configKnown).toBe(2);
      expect(conversionReport.configTotal).toBe(2);
      expect(conversionReport.status).toBe('complete');
    });

    it('handles key-value format', async () => {
      const raw = 'name=MyChar\nlevel=85\nclass=Shadow\nskills=Fireball,Arcane Surge\n';
      const { buildXml, conversionReport } = await adapter.convertToBuildXml(raw);
      expect(buildXml).toContain('MyChar');
      expect(buildXml).toContain('Shadow');
      expect(conversionReport.warnings).toContain(
        'No skill array found in WeGame payload.',
      );
    });

    it('handles completely unparseable data', async () => {
      const { buildXml, conversionReport } = await adapter.convertToBuildXml('!!!garbage!!!');
      expect(buildXml).toContain('PathOfBuilding');
      expect(conversionReport.status).toBe('failed');
      expect(conversionReport.warnings).toContain(
        'Unable to parse WeGame data as JSON or key-value format.',
      );
      expect(conversionReport.warnings).toContain(
        'Raw data could not be parsed — conversion aborted.',
      );
    });
  });
});

describe('conversion-report helpers', () => {
  it('creates a default report', () => {
    const report = createConversionReport();
    expect(report.status).toBe('complete');
    expect(report.skillMapped).toBe(0);
    expect(report.skillTotal).toBe(0);
    expect(report.warnings).toEqual([]);
  });

  it('adds warnings', () => {
    const report = createConversionReport();
    addWarning(report, 'warn1');
    addWarning(report, 'warn2');
    expect(report.warnings).toEqual(['warn1', 'warn2']);
  });

  it('adds unmapped items and increments totals', () => {
    const report = createConversionReport();
    addUnmappedItem(report, {
      slotName: 'Weapon',
      name: 'Mystery Item',
      reason: 'Unknown base type',
    });
    expect(report.itemTotal).toBe(1);
    expect(report.unmappedItems).toHaveLength(1);
  });

  it('adds unmapped skills', () => {
    const report = createConversionReport();
    addUnmappedSkill(report, { rawName: '???', reason: 'No ID' });
    expect(report.skillTotal).toBe(1);
    expect(report.unmappedSkills).toHaveLength(1);
  });

  it('adds unknown mods', () => {
    const report = createConversionReport();
    addUnknownMod(report, {
      sourceItemSlot: 'Weapon',
      sourceItemName: 'Staff',
      rawText: '+99 Life',
      tags: ['life'],
    });
    expect(report.modTotal).toBe(1);
    expect(report.unknownMods).toHaveLength(1);
  });

  it('increments mapped and total counts', () => {
    const report = createConversionReport();
    incrementTotal(report, 'skill', 5);
    incrementMapped(report, 'skill');
    incrementMapped(report, 'skill');
    expect(report.skillTotal).toBe(5);
    expect(report.skillMapped).toBe(2);
  });

  it('finalizes report to complete when all mapped', () => {
    const report = createConversionReport();
    incrementTotal(report, 'skill', 2);
    incrementMapped(report, 'skill');
    incrementMapped(report, 'skill');
    finalizeReport(report);
    expect(report.status).toBe('complete');
  });

  it('finalizes report to partial when some unmapped', () => {
    const report = createConversionReport();
    incrementTotal(report, 'skill', 2);
    incrementMapped(report, 'skill');
    addUnmappedSkill(report, { rawName: 'Missing', reason: 'No ID' });
    finalizeReport(report);
    expect(report.status).toBe('partial');
  });

  it('finalizes report to failed when totals are present but none mapped', () => {
    const report = createConversionReport();
    incrementTotal(report, 'skill', 2);
    finalizeReport(report);
    expect(report.status).toBe('failed');
  });

  it('finalizes an empty report to partial', () => {
    const report = createConversionReport();
    finalizeReport(report);
    expect(report.status).toBe('partial');
  });
});
