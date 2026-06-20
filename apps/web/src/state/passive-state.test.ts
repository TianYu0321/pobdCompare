import { describe, expect, it } from 'vitest';

import type { PassiveRankings } from '../api';
import { replaceSidePassives } from './passive-state';

const rankings: PassiveRankings = {
  nextPoint: [],
  pathPackage: [],
  removeLoss: [],
  failures: [],
};

describe('replaceSidePassives', () => {
  it('replaces only the changed side when fresh rankings are available', () => {
    const previous = { a: rankings, b: rankings };
    const next = replaceSidePassives(previous, 'a', { a: rankings });

    expect(next.a).toBe(rankings);
    expect(next.b).toBe(rankings);
  });

  it('clears the changed side when the new revision has no rankings', () => {
    const previous = { a: rankings, b: rankings };
    const next = replaceSidePassives(previous, 'a');

    expect(next.a).toBeUndefined();
    expect(next.b).toBe(rankings);
  });
});
