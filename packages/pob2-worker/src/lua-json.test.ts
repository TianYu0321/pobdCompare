import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scripts = [
  'baseline.lua',
  'convert_wegame.lua',
  'mutation_gear_swap.lua',
  'mutation_passive_add.lua',
  'mutation_passive_remove.lua',
];

describe('Lua static script validation', () => {
  // This checks source text only, not runtime Lua behavior. Runtime coverage
  // of these scripts is provided by the bridge/integration tests.
  it.each(scripts)('%s contains the toJSON non-finite-number guard', async (script) => {
    const content = await readFile(
      path.resolve('packages/pob2-worker/python/scripts', script),
      'utf8',
    );

    expect(content).toContain(
      'if obj ~= obj or obj == math.huge or obj == -math.huge then return "null" end',
    );
  });
});
