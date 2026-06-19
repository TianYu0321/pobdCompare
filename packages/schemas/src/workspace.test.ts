import { describe, expect, it } from 'vitest';

import {
  AnalysisStageSchema,
  ImportResultSchema,
  VariantSessionSchema,
} from './workspace';
import { ConversionReportSchema } from './agent';

describe('workspace schemas', () => {
  it('accepts the fixed analysis stages', () => {
    expect(AnalysisStageSchema.parse('simulate_gear')).toBe('simulate_gear');
    expect(AnalysisStageSchema.parse('refresh_mapping_catalog')).toBe('refresh_mapping_catalog');
    expect(AnalysisStageSchema.parse('map_wegame_metadata')).toBe('map_wegame_metadata');
    expect(AnalysisStageSchema.parse('validate_pob2_import')).toBe('validate_pob2_import');
    expect(() => AnalysisStageSchema.parse('fake_timer')).toThrow();
  });

  it('represents strict WeGame mapping evidence and blockers', () => {
    const report = ConversionReportSchema.parse({
      status: 'blocked',
      catalogHash: 'catalog-v1',
      mapped: [
        {
          category: 'item',
          source: '紫晶戒指',
          target: 'Amethyst Ring',
          strategy: 'exact_asset',
        },
      ],
      blockers: [
        {
          code: 'unknown_mod',
          category: 'mod',
          source: '未知词条',
          reason: 'No exact template hash',
        },
      ],
      pobValidation: {
        roundTripValid: false,
        baselineValid: false,
        mainSkillValid: false,
      },
      skillMapped: 0,
      skillTotal: 0,
      itemMapped: 1,
      itemTotal: 1,
      modMapped: 0,
      modTotal: 1,
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
    });
    expect(report.status).toBe('blocked');
    expect(report.blockers[0]?.code).toBe('unknown_mod');
  });

  it('represents normalized imports that are not yet calculable', () => {
    const result = ImportResultSchema.parse({
      id: 'import-1',
      source: 'wegame',
      status: 'normalized',
      conversionReport: {
        status: 'partial',
        skillMapped: 0,
        skillTotal: 1,
        itemMapped: 0,
        itemTotal: 1,
        modMapped: 0,
        modTotal: 0,
        passiveMapped: 1,
        passiveTotal: 1,
        ascendancyMapped: 0,
        ascendancyTotal: 0,
        configKnown: 0,
        configTotal: 0,
        unknownMods: [],
        unmappedNodes: [],
        unmappedSkills: [],
        unmappedItems: [],
        warnings: ['PoB2 conversion incomplete'],
      },
      warnings: ['PoB2 conversion incomplete'],
    });
    expect(result.status).toBe('normalized');
  });

  it('stores immutable revision history with a current cursor', () => {
    const session = VariantSessionSchema.parse({
      baselineHash: 'base',
      revisions: [
        {
          revisionId: 'rev-0',
          variantHash: 'base',
          createdAt: 1,
        },
      ],
      cursor: 0,
    });
    expect(session.cursor).toBe(0);
  });
});
