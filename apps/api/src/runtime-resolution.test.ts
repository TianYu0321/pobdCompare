import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('API development runtime resolution', () => {
  it('loads workspace package named exports through the dev tsconfig', async () => {
    const apiRoot = path.resolve('apps/api');
    const tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
    const { stdout } = await execFileAsync(
      process.execPath,
      [tsx, '--tsconfig', 'tsconfig.dev.json', 'test-fixtures/runtime-resolution.ts'],
      { cwd: apiRoot, timeout: 15_000 },
    );

    expect(stdout.trim()).toBe('runtime-exports-ok');
  });
});
