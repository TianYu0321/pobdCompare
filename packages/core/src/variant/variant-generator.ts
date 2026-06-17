import { createHash, randomUUID } from 'crypto';
import type {
  BaselineSnapshot,
  BuildVariant,
  BuildMutation,
  VariantValidation,
  CalcValidation,
} from '@pobd/schemas';

// ============================================
// Worker Client Interface for Variant Generation
// ============================================

export interface VariantApplyResult {
  buildXml: string;
  calcsOutput: Record<string, unknown>;
  mainOutput?: Record<string, unknown>;
  rawBreakdown: Record<string, unknown>;
  preValidation: VariantValidation;
  postValidation: VariantValidation;
  calcValidation: CalcValidation;
}

export interface VariantWorkerClient {
  applyMutation(buildXml: string, mutation: BuildMutation): Promise<VariantApplyResult>;
  saveBuildXml(buildXml: string): Promise<string>;
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

function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ============================================
// VariantGenerator
// ============================================

export class VariantGenerator {
  private worker: VariantWorkerClient;

  constructor(worker: VariantWorkerClient) {
    this.worker = worker;
  }

  /**
   * Generate a BuildVariant from a baseline and a mutation.
   */
  async generateVariant(
    baseline: BaselineSnapshot,
    mutation: BuildMutation
  ): Promise<BuildVariant & { mutation: BuildMutation }> {
    if (mutation.baselineHash !== baseline.baselineHash) {
      throw new Error(
        `Mutation baselineHash mismatch: expected ${baseline.baselineHash}, got ${mutation.baselineHash}`
      );
    }

    const startTime = Date.now();

    const applyResult = await this.worker.applyMutation(baseline.buildXml, mutation);

    const buildXmlCanonicalHash = hashString(applyResult.buildXml);
    const variantHash = hashString(baseline.baselineHash + stableStringify(mutation));

    const calcDurationMs = Date.now() - startTime;

    const variant: BuildVariant & { mutation: BuildMutation } = {
      variantId: randomUUID(),
      variantHash,
      baselineHash: baseline.baselineHash,
      mutation,
      buildXml: applyResult.buildXml,
      buildXmlCanonicalHash,
      skillNumber: baseline.skillNumber,
      skillPart: baseline.skillPart,
      weaponSet: baseline.weaponSet,
      config: baseline.config,
      calcsOutput: applyResult.calcsOutput,
      mainOutput: applyResult.mainOutput,
      rawBreakdown: applyResult.rawBreakdown,
      preValidation: applyResult.preValidation,
      postValidation: applyResult.postValidation,
      calcValidation: applyResult.calcValidation,
      calcDurationMs,
      createdAt: Date.now(),
    };

    return variant;
  }

  /**
   * Export the variant buildXml via SaveDB (via the worker).
   */
  async generateVariantXml(variant: BuildVariant): Promise<string> {
    return this.worker.saveBuildXml(variant.buildXml);
  }
}
