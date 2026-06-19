import { describe, expect, it } from 'vitest';

import {
  AnalysisStageSchema,
  ImportResultSchema,
  VariantSessionSchema,
} from './workspace';

describe('workspace schemas', () => {
  it('accepts the fixed analysis stages', () => {
    expect(AnalysisStageSchema.parse('simulate_gear')).toBe('simulate_gear');
    expect(() => AnalysisStageSchema.parse('fake_timer')).toThrow();
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
