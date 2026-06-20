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

describe('Lua JSON encoding', () => {
  it.each(scripts)('%s normalizes non-finite numbers to JSON null', async (script) => {
    const content = await readFile(
      path.resolve('packages/pob2-worker/python/scripts', script),
      'utf8',
    );

    expect(content).toContain(
      'if obj ~= obj or obj == math.huge or obj == -math.huge then return "null" end',
    );
  });
});
