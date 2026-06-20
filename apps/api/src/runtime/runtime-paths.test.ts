import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveRepoPath } from './runtime-paths';

describe('resolveRepoPath', () => {
  it('resolves worker assets from the repository root instead of process.cwd()', () => {
    expect(resolveRepoPath('packages/pob2-worker/python/driver.py')).toBe(
      path.resolve('packages/pob2-worker/python/driver.py'),
    );
  });
});
