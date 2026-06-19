import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { detectPoB2Installation } from './environment';

describe('detectPoB2Installation', () => {
  it('selects the first valid installation and reads its manifest version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pobd-pob2-'));
    const invalid = join(root, 'invalid');
    const valid = join(root, 'valid');
    await mkdir(invalid, { recursive: true });
    await mkdir(join(valid, 'runtime'), { recursive: true });
    await writeFile(join(valid, 'runtime', 'lua51.dll'), '');
    await writeFile(
      join(valid, 'manifest.xml'),
      '<PoBVersion><Version number="0.21.0" /></PoBVersion>',
    );

    const result = await detectPoB2Installation([invalid, valid]);

    expect(result).toEqual({
      root: valid,
      version: '0.21.0',
      luaDllPath: join(valid, 'runtime', 'lua51.dll'),
    });
  });

  it('throws a useful error when no candidate is usable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pobd-pob2-missing-'));

    await expect(detectPoB2Installation([root])).rejects.toThrow(
      'No usable Path of Building Community (PoE2) installation found',
    );
  });
});
