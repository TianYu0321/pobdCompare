import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ModCacheStatus = 'verified_by_pob2' | 'mapped_but_unverified' | 'pob2_rejected';
export type ModCacheSource = 'manual_override' | 'poe2db_exact' | 'context_match' | 'fuzzy_match';

export interface ConversionCacheRecord {
  rawText: string;
  normalizedTemplate: string;
  values: number[];
  enLine: string;
  status: ModCacheStatus;
  source: ModCacheSource;
  catalogVersion: string;
  adapterVersion: string;
  pob2Version?: string;
  gameVersion?: string;
  verifiedAt?: string;
}

interface CacheFileSchema {
  version: 1;
  entries: Array<[string, ConversionCacheRecord]>;
}

export interface CurrentVersions {
  catalogVersion: string;
  adapterVersion: string;
  pob2Version?: string;
  gameVersion?: string;
}

export interface ConversionCacheOptions {
  cachePath: string;
  adapterVersion?: string;
  catalogVersion?: string;
  pob2Version?: string;
  gameVersion?: string;
  flushIntervalMs?: number;
  flushThreshold?: number;
}

export function cacheKey(
  adapterVersion: string,
  catalogVersion: string,
  pob2Version: string | undefined,
  gameVersion: string | undefined,
  normalizedTemplate: string,
  itemClass?: string,
  tags?: string[],
): string {
  return createHash('sha256')
    .update(
      [
        adapterVersion,
        catalogVersion,
        pob2Version ?? '',
        gameVersion ?? '',
        normalizedTemplate,
        itemClass ?? '',
        ...(tags ?? []),
      ].join(':'),
    )
    .digest('hex');
}

export class ConversionCache {
  private entries: Map<string, ConversionCacheRecord> = new Map();
  private loaded = false;
  private dirty = false;
  private flushTimer?: NodeJS.Timeout;
  private pendingCount = 0;
  private flushing = false;
  private flushIntervalMs: number;
  private flushThreshold: number;
  private readonly cachePath: string;

  constructor(options: ConversionCacheOptions | string) {
    if (typeof options === 'string') {
      this.cachePath = options;
      this.flushIntervalMs = 30000;
      this.flushThreshold = 10;
    } else {
      this.cachePath = options.cachePath;
      this.flushIntervalMs = options.flushIntervalMs ?? 30000;
      this.flushThreshold = options.flushThreshold ?? 10;
    }
    this.startFlushTimer();
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, 'utf8');
      const parsed = JSON.parse(raw) as CacheFileSchema;
      if (parsed.version !== 1) {
        this.entries = new Map();
        this.loaded = true;
        this.dirty = false;
        return;
      }
      this.entries = new Map(parsed.entries);
      this.loaded = true;
      this.dirty = false;
    } catch {
      // File not found or malformed — start with empty cache
      this.entries = new Map();
      this.loaded = true;
      this.dirty = false;
    }
  }

  async save(): Promise<void> {
    const payload: CacheFileSchema = {
      version: 1,
      entries: [...this.entries.entries()],
    };
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, JSON.stringify(payload, null, 2), 'utf8');
    this.dirty = false;
  }

  set(record: ConversionCacheRecord): void {
    const key = cacheKey(
      record.adapterVersion,
      record.catalogVersion,
      record.pob2Version,
      record.gameVersion,
      record.normalizedTemplate,
    );
    this.entries.set(key, record);
    this.dirty = true;
    this.pendingCount++;
    if (this.pendingCount >= this.flushThreshold) {
      void this.flush();
    }
  }

  get(
    normalizedTemplate: string,
    versions: CurrentVersions,
    itemClass?: string,
    tags?: string[],
  ): ConversionCacheRecord | undefined {
    const key = cacheKey(
      versions.adapterVersion,
      versions.catalogVersion,
      versions.pob2Version,
      versions.gameVersion,
      normalizedTemplate,
      itemClass,
      tags,
    );
    const record = this.entries.get(key);
    if (!record) return undefined;
    if (this.isStale(record, versions)) return undefined;
    return record;
  }

  isStale(record: ConversionCacheRecord, currentVersions: CurrentVersions): boolean {
    return (
      record.catalogVersion !== currentVersions.catalogVersion ||
      record.adapterVersion !== currentVersions.adapterVersion ||
      record.pob2Version !== currentVersions.pob2Version ||
      record.gameVersion !== currentVersions.gameVersion
    );
  }

  size(): number {
    return this.entries.size;
  }

  /** 返回所有缓存记录（用于迁移或统计） */
  allEntries(): ConversionCacheRecord[] {
    return [...this.entries.values()];
  }

  /** 清除所有版本过期的记录 */
  prune(currentVersions: CurrentVersions): number {
    let removed = 0;
    for (const [key, record] of this.entries) {
      if (this.isStale(record, currentVersions)) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.dirty) {
        void this.flush();
      }
    }, this.flushIntervalMs);
  }

  async flush(): Promise<void> {
    if (!this.dirty || this.flushing) return;
    this.flushing = true;
    try {
      await this.save();
      this.pendingCount = 0;
    } finally {
      this.flushing = false;
    }
  }

  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
  }
}

export class FailureCorpus {
  private entries: Array<{ reason: string; example: string; catalogVersion?: string; adapterVersion?: string }> = [];

  record(
    reason: string,
    example: string,
    versions?: { catalogVersion?: string; adapterVersion?: string },
  ): void {
    this.entries.push({ reason, example, catalogVersion: versions?.catalogVersion, adapterVersion: versions?.adapterVersion });
  }

  getFailures(): Array<{ reason: string; example: string; catalogVersion?: string; adapterVersion?: string }> {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  size(): number {
    return this.entries.length;
  }
}

export function buildTopFailureReasons(
  failures: Array<{ reason: string; example: string }>,
  topN = 5,
): Array<{ reason: string; count: number; examples: string[] }> {
  const groups = new Map<string, { count: number; examples: string[] }>();

  for (const { reason, example } of failures) {
    const existing = groups.get(reason);
    if (existing) {
      existing.count += 1;
      if (existing.examples.length < 3) existing.examples.push(example);
    } else {
      groups.set(reason, { count: 1, examples: [example] });
    }
  }

  return Array.from(groups.entries())
    .map(([reason, { count, examples }]) => ({ reason, count, examples }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}
