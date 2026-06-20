import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BaselineManager } from './baseline-manager';
import type { BaselineComputeResult, BaselineOptions, Pob2WorkerClient } from './baseline-manager';
import type { MainSkillSelection, SkillDpsInfo } from '@pobd/schemas';

const mockWorker: Pob2WorkerClient = {
  computeBaseline: vi.fn().mockResolvedValue({
    calcsOutput: { CombinedDPS: 1000 },
    rawBreakdown: {},
    skillDpsList: [{ skillNumber: 1, name: 'TestSkill', dps: 1000, enabled: true } as SkillDpsInfo],
    skillGroups: [],
    items: [],
    passiveNodes: [1, 2, 3],
    ascendNodes: [],
    jewels: [],
  } as BaselineComputeResult),
};

const mockMainSkillSelection: MainSkillSelection = {
  selectedSkillNumber: 1,
  selectionMode: 'user_confirmed',
  selectedSkillName: 'TestSkill',
  candidates: [],
  warnings: [],
};

const baseOptions: BaselineOptions = {
  source: 'build_xml',
  pob2Version: '1.0.0',
  pob2DataVersion: '1.0.0',
  gameVersion: '0.1.0',
  mainSkillSelection: mockMainSkillSelection,
  skillNumber: 1,
  weaponSet: 1,
  normalizerVersion: '1.0.0',
};

describe('BaselineManager', () => {
  it('createBaseline returns a complete snapshot', async () => {
    const manager = new BaselineManager(mockWorker);
    const snapshot = await manager.createBaseline('<Build><Test/></Build>', baseOptions);

    expect(snapshot.baselineHash).toBeDefined();
    expect(snapshot.baselineHash).toHaveLength(64); // SHA-256 hex
    expect(snapshot.buildXml).toBe('<Build><Test/></Build>');
    expect(snapshot.source).toBe('build_xml');
    expect(snapshot.skillNumber).toBe(1);
    expect(snapshot.weaponSet).toBe(1);
    expect(snapshot.pob2Version).toBe('1.0.0');
    expect(snapshot.createdAt).toBeGreaterThan(0);
    expect(snapshot.calcsOutput).toEqual({ CombinedDPS: 1000 });
    expect(snapshot.passiveNodes).toEqual([1, 2, 3]);

    expect(mockWorker.computeBaseline).toHaveBeenCalledWith(
      '<Build><Test/></Build>',
      {
        skillNumber: 1,
        weaponSet: 1,
        config: {},
        customMods: undefined,
      }
    );
  });

  it('hashBaseline is deterministic for identical payloads', () => {
    const manager = new BaselineManager(mockWorker);
    const payload = {
      buildXmlCanonicalHash: 'abc123',
      skillNumber: 1,
      weaponSet: 1,
      configHash: 'cfg456',
      pob2Version: '1.0.0',
      pob2DataVersion: '1.0.0',
      gameVersion: '0.1.0',
      normalizerVersion: '1.0.0',
    };
    const hash1 = manager.hashBaseline(payload);
    const hash2 = manager.hashBaseline(payload);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('hashBaseline differs when payload differs', () => {
    const manager = new BaselineManager(mockWorker);
    const hash1 = manager.hashBaseline({
      buildXmlCanonicalHash: 'abc',
      skillNumber: 1,
      weaponSet: 1,
      configHash: 'cfg',
      pob2Version: '1.0.0',
      pob2DataVersion: '1.0.0',
      gameVersion: '0.1.0',
      normalizerVersion: '1.0.0',
    });
    const hash2 = manager.hashBaseline({
      buildXmlCanonicalHash: 'def',
      skillNumber: 1,
      weaponSet: 1,
      configHash: 'cfg',
      pob2Version: '1.0.0',
      pob2DataVersion: '1.0.0',
      gameVersion: '0.1.0',
      normalizerVersion: '1.0.0',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('saveBaseline and loadBaseline round-trip', async () => {
    const cacheDir = await fs.mkdtemp(path.join(process.cwd(), '.pobd-test-baselines-'));
    const manager = new BaselineManager(mockWorker, { enableFileCache: true, cacheDir });
    try {
      const snapshot = await manager.createBaseline('<Build/>', baseOptions);

      await manager.saveBaseline(snapshot);
      const loaded = await manager.loadBaseline(snapshot.baselineHash);

      expect(loaded).not.toBeNull();
      expect(loaded!.baselineHash).toBe(snapshot.baselineHash);
      expect(loaded!.buildXml).toBe(snapshot.buildXml);
      expect(loaded!.id).toBe(snapshot.id);
    } finally {
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('loadBaseline returns null for unknown hash', async () => {
    const manager = new BaselineManager(mockWorker);
    const loaded = await manager.loadBaseline('nonexistent');
    expect(loaded).toBeNull();
  });

  it('customModsHash is included in baselineHash when customMods is provided', async () => {
    const manager = new BaselineManager(mockWorker);
    const optsWithMods: BaselineOptions = { ...baseOptions, customMods: 'TestMod' };
    const snapshot = await manager.createBaseline('<Build/>', optsWithMods);
    expect(snapshot.baselineHash).toBeDefined();
  });
});
