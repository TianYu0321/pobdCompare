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

describe('skillDpsList protocol contract (regression)', () => {
  // These are static source-level assertions. They ensure the Lua scripts
  // emit dps=CombinedDPS for the selected/main socket group rather than
  // unconditionally hardcoding dps=0. Without this the Runtime classifies
  // positive-DPS builds as having no valid skill because every skill entry
  // appears to have zero DPS.
  //
  // Limits: these tests do NOT run the Lua interpreter so they cannot
  // verify the actual runtime values. Full round-trip coverage requires
  // POB2_INTEGRATION=1 integration tests.

  it('baseline.lua: selectedGroupNumber source order, conditional, CombinedDPS, dps=groupDps', async () => {
    const content = await readFile(
      path.resolve('packages/pob2-worker/python/scripts', 'baseline.lua'),
      'utf8',
    );
    // 1. Selection-source priority: _skill_number is authoritative
    expect(content).toMatch(/_skill_number\s+or\s+build\.mainSocketGroup\s+or\s+1/);
    // 2. Selected-group conditional
    expect(content).toContain('if i == selectedGroupNumber then');
    // 3. CombinedDPS used as authoritative group DPS
    expect(content).toContain('result.calcsOutput.CombinedDPS');
    // 4. dps field is the conditional variable, not literal 0
    expect(content).toContain('dps = groupDps,');
    // 5. Old unconditional form absent in skillDpsList context
    expect(content).not.toMatch(/dps\s*=\s*0,/);
  });

  it('convert_wegame.lua: selectedSkillNumber conditional, CombinedDPS, dps=groupDps', async () => {
    const content = await readFile(
      path.resolve('packages/pob2-worker/python/scripts', 'convert_wegame.lua'),
      'utf8',
    );
    // 1. Selected-group conditional uses selectedSkillNumber
    expect(content).toContain('if i == selectedSkillNumber then');
    // 2. CombinedDPS used as authoritative group DPS
    expect(content).toContain('co.CombinedDPS');
    // 3. dps field is the conditional variable, not literal 0
    expect(content).toContain('dps = groupDps,');
    // 4. Old unconditional form absent in skillDpsList context
    expect(content).not.toMatch(/dps\s*=\s*0,/);
  });

  it('mutation_gear_swap.lua: selectedGroupNumber source order, socketGroupList, conditional, CombinedDPS, dps=groupDps', async () => {
    const content = await readFile(
      path.resolve('packages/pob2-worker/python/scripts', 'mutation_gear_swap.lua'),
      'utf8',
    );
    // 1. Selection-source priority: _skill_number is authoritative
    expect(content).toMatch(/_skill_number\s+or\s+build\.mainSocketGroup\s+or\s+1/);
    // 2. Populated from socketGroupList (was empty {} before fix)
    expect(content).toContain('socketGroupList');
    // 3. Selected-group conditional
    expect(content).toContain('if i == selectedGroupNumber then');
    // 4. CombinedDPS used as authoritative group DPS
    expect(content).toContain('result.calcsOutput.CombinedDPS');
    // 5. dps field is the conditional variable, not literal 0
    expect(content).toContain('dps = groupDps,');
  });
});
