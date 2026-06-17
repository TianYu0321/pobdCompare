import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  BaselineSnapshot,
  BaselineHashPayload,
  MainSkillSelection,
  SkillDpsInfo,
  SkillGroupInfo,
  ItemInfo,
  JewelInfo,
} from '@pobd/schemas';

// ============================================
// Worker Client Interface (to be provided by @pobd/pob2-worker)
// ============================================

export interface BaselineComputeResult {
  calcsOutput: Record<string, unknown>;
  mainOutput?: Record<string, unknown>;
  rawBreakdown: Record<string, unknown>;
  skillDpsList: SkillDpsInfo[];
  skillGroups: SkillGroupInfo[];
  items: ItemInfo[];
  passiveNodes: number[];
  ascendNodes: number[];
  jewels: JewelInfo[];
}

export interface Pob2WorkerClient {
  computeBaseline(
    buildXml: string,
    options: {
      skillNumber: number;
      skillPart?: string;
      weaponSet: number;
      config: Record<string, unknown>;
      customMods?: string;
    }
  ): Promise<BaselineComputeResult>;
}

// ============================================
// BaselineOptions
// ============================================

export interface BaselineOptions {
  source: BaselineSnapshot['source'];
  pob2Version: string;
  pob2DataVersion: string;
  gameVersion: string;
  league?: string;
  character?: BaselineSnapshot['character'];
  mainSkillSelection: MainSkillSelection;
  skillNumber: number;
  skillPart?: string;
  weaponSet: number;
  config?: Record<string, unknown>;
  customMods?: string;
  normalizerVersion: string;
  adapterVersion?: string;
  enableFileCache?: boolean;
  cacheDir?: string;
}

// ============================================
// Stable JSON stringification for hashing
// ============================================

function stableStringify(obj: unknown): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`);
    return '{' + pairs.join(',') + '}';
  }
  return String(obj);
}

// ============================================
// BaselineManager
// ============================================

export class BaselineManager {
  private cache = new Map<string, BaselineSnapshot>();
  private worker: Pob2WorkerClient;
  private enableFileCache: boolean;
  private cacheDir: string;

  constructor(worker: Pob2WorkerClient, options?: { enableFileCache?: boolean; cacheDir?: string }) {
    this.worker = worker;
    this.enableFileCache = options?.enableFileCache ?? false;
    this.cacheDir = options?.cacheDir ?? path.join(process.cwd(), '.pobd-cache', 'baselines');
  }

  /**
   * Create a BaselineSnapshot from a build XML string.
   */
  async createBaseline(buildXml: string, options: BaselineOptions): Promise<BaselineSnapshot> {
    const buildXmlCanonicalHash = this.hashString(buildXml);
    const config = options.config ?? {};
    const customMods = options.customMods;

    const configHash = this.hashString(stableStringify(config));
    const customModsHash = customMods ? this.hashString(customMods) : undefined;

    const hashPayload: BaselineHashPayload = {
      buildXmlCanonicalHash,
      skillNumber: options.skillNumber,
      skillPart: options.skillPart,
      weaponSet: options.weaponSet,
      configHash,
      customModsHash,
      pob2Version: options.pob2Version,
      pob2DataVersion: options.pob2DataVersion,
      gameVersion: options.gameVersion,
      league: options.league,
      normalizerVersion: options.normalizerVersion,
      adapterVersion: options.adapterVersion,
    };

    const baselineHash = this.hashBaseline(hashPayload);

    // Call PoB2 Worker to compute baseline
    const computeResult = await this.worker.computeBaseline(buildXml, {
      skillNumber: options.skillNumber,
      skillPart: options.skillPart,
      weaponSet: options.weaponSet,
      config,
      customMods,
    });

    const snapshot: BaselineSnapshot = {
      id: randomUUID(),
      baselineHash,
      source: options.source,
      buildXml,
      buildXmlCanonicalHash,
      pob2Version: options.pob2Version,
      pob2DataVersion: options.pob2DataVersion,
      gameVersion: options.gameVersion,
      league: options.league,
      character: options.character ?? {},
      mainSkillSelection: options.mainSkillSelection,
      skillNumber: options.skillNumber,
      skillPart: options.skillPart,
      weaponSet: options.weaponSet,
      config,
      customMods,
      calcsOutput: computeResult.calcsOutput,
      mainOutput: computeResult.mainOutput,
      rawBreakdown: computeResult.rawBreakdown,
      skillDpsList: computeResult.skillDpsList,
      skillGroups: computeResult.skillGroups,
      items: computeResult.items,
      passiveNodes: computeResult.passiveNodes,
      ascendNodes: computeResult.ascendNodes,
      jewels: computeResult.jewels,
      createdAt: Date.now(),
    };

    return snapshot;
  }

  /**
   * Save a baseline snapshot to in-memory cache and optionally to file.
   */
  async saveBaseline(snapshot: BaselineSnapshot): Promise<void> {
    this.cache.set(snapshot.baselineHash, snapshot);

    if (this.enableFileCache) {
      await this.ensureCacheDir();
      const filePath = path.join(this.cacheDir, `${snapshot.baselineHash}.json`);
      await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    }
  }

  /**
   * Load a baseline snapshot by hash. Checks in-memory cache first, then file.
   */
  async loadBaseline(hash: string): Promise<BaselineSnapshot | null> {
    const fromMemory = this.cache.get(hash);
    if (fromMemory) return fromMemory;

    if (this.enableFileCache) {
      try {
        const filePath = path.join(this.cacheDir, `${hash}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content) as BaselineSnapshot;
        this.cache.set(hash, parsed);
        return parsed;
      } catch {
        // File not found or invalid — return null
        return null;
      }
    }

    return null;
  }

  /**
   * Compute a stable SHA256 hash from a BaselineHashPayload.
   */
  hashBaseline(payload: BaselineHashPayload): string {
    return this.hashString(stableStringify(payload));
  }

  /**
   * Simple SHA256 hash of a string.
   */
  hashString(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch {
      // Ignore
    }
  }
}
