import { describe, expect, it } from 'vitest';

import { VariantSessionManager } from './variant-session';

describe('VariantSessionManager', () => {
  it('appends revisions and supports undo, redo, and reset', () => {
    const manager = new VariantSessionManager('baseline-hash');
    manager.append({
      revisionId: 'rev-1',
      parentRevisionId: 'rev-0',
      variantHash: 'variant-1',
      createdAt: 2,
    });
    manager.append({
      revisionId: 'rev-2',
      parentRevisionId: 'rev-1',
      variantHash: 'variant-2',
      createdAt: 3,
    });

    expect(manager.current().variantHash).toBe('variant-2');
    expect(manager.undo().variantHash).toBe('variant-1');
    expect(manager.redo().variantHash).toBe('variant-2');
    expect(manager.reset().variantHash).toBe('baseline-hash');
  });

  it('rejects stale revision via CAS (parentRevisionId mismatch)', () => {
    const manager = new VariantSessionManager('base');
    manager.append({ revisionId: 'rev-1', parentRevisionId: 'rev-0', variantHash: 'v1', createdAt: 2 });
    const head = manager.current();
    expect(head.revisionId).toBe('rev-1');

    // Try to append with stale parent
    expect(() =>
      manager.append({ revisionId: 'rev-stale', parentRevisionId: 'rev-0', variantHash: 'v-stale', createdAt: 3 }),
    ).toThrow('stale_revision');

    // Current head unchanged
    expect(manager.current().revisionId).toBe('rev-1');

    // Appending with correct parent succeeds
    manager.append({ revisionId: 'rev-2', parentRevisionId: 'rev-1', variantHash: 'v2', createdAt: 4 });
    expect(manager.current().revisionId).toBe('rev-2');
  });

  it('drops redo history when appending after undo', () => {
    const manager = new VariantSessionManager('base');
    manager.append({ revisionId: 'one', variantHash: 'one', createdAt: 2 });
    manager.append({ revisionId: 'two', variantHash: 'two', createdAt: 3 });
    manager.undo();
    manager.append({ revisionId: 'three', variantHash: 'three', createdAt: 4 });

    expect(manager.snapshot().revisions.map((revision) => revision.revisionId)).toEqual([
      'rev-0',
      'one',
      'three',
    ]);
    expect(manager.redo().variantHash).toBe('three');
  });
});
