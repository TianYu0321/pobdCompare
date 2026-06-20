import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  MappingCatalogProvider,
  type CanonicalWeGameCharacter,
  type MappingCatalog,
} from '@pobd/adapters';
import {
  BaselineManager,
  ResultComparator,
  type BaselineComputeResult,
  type Pob2WorkerClient,
} from '@pobd/core';
import { detectPoB2Installation, Pob2WorkerPool } from '@pobd/pob2-worker';
import type {
  BaselineSnapshot,
  BuildMutation,
  BuildVariant,
  MainSkillSelection,
  SimulationResult,
} from '@pobd/schemas';

class PoolBaselineClient implements Pob2WorkerClient {
  constructor(private readonly pool: Pob2WorkerPool) {}

  async computeBaseline(
    buildXml: string,
    options: {
      skillNumber: number;
      skillPart?: string;
      weaponSet: number;
      config: Record<string, unknown>;
      customMods?: string;
    },
  ): Promise<BaselineComputeResult> {
    const response = await this.pool.submit({
      buildXml,
      skillNumber: options.skillNumber,
      weaponSet: options.weaponSet,
      config: options.config,
    });
    if (!response.success) {
      throw new Error(response.error ?? 'PoB2 baseline calculation failed');
    }
    return {
      calcsOutput: response.calcsOutput ?? {},
      rawBreakdown: response.breakdown ?? {},
      skillDpsList: response.skillDpsList ?? [],
      skillGroups: [],
      items: response.itemSlots ?? [],
      passiveNodes: response.passiveNodes ?? [],
      ascendNodes: [],
      jewels: [],
    };
  }
}

export interface BaselineInput {
  buildXml: string;
  source: BaselineSnapshot['source'];
  character?: BaselineSnapshot['character'];
  league?: string;
  preferredSkillNumber?: number;
  preferredSkillName?: string;
  /** Optional context to forward from the source baseline */
  skillPart?: string;
  weaponSet?: number;
  config?: Record<string, unknown>;
}

export interface ApplyGearSwapOutput {
  buildXml: string;
  result: SimulationResult;
  snapshot: BaselineSnapshot;
}

export class Pob2Runtime {
  private pool?: Pob2WorkerPool;
  private manager?: BaselineManager;
  private version = 'unknown';
  private catalogProvider?: MappingCatalogProvider;

  async getWeGameCatalog(): Promise<MappingCatalog> {
    await this.ensureStarted();
    return this.catalogProvider!.getCatalog();
  }

  async convertWeGame(input: {
    character: CanonicalWeGameCharacter;
    catalogHash: string;
  }): Promise<{
    buildXml: string;
    baseline: BaselineSnapshot;
    validation: {
      roundTripValid: boolean;
      baselineValid: boolean;
      mainSkillValid: boolean;
    };
  }> {
    await this.ensureStarted();
    const response = await this.pool!.submit({
      operation: 'convert_wegame',
      character: input.character,
      catalogHash: input.catalogHash,
    });
    if (!response.success) {
      if (response.pobValidation && !response.pobValidation.roundTripValid) {
        const missing = response.roundTrip?.missingPassiveIds ?? [];
        throw new Error(
          `round_trip_mismatch: items ${response.roundTrip?.importedItems ?? 0}/`
          + `${response.roundTrip?.expectedItems ?? 0}, skills `
          + `${response.roundTrip?.importedSkills ?? 0}/`
          + `${response.roundTrip?.expectedSkills ?? 0}, missing passives `
          + `${missing.join(',') || 'none'}`,
        );
      }
      throw new Error(response.error ?? 'PoB2 native WeGame import failed');
    }
    if (response.catalogHash !== input.catalogHash) {
      throw new Error('catalog_version_mismatch: PoB2 worker returned a different catalog hash');
    }
    const buildXml = response.variantXml;
    if (!buildXml) throw new Error('pob_import_failed: PoB2 did not return Build XML');
    const validation = response.pobValidation;
    if (!validation) throw new Error('round_trip_mismatch: PoB2 returned no validation snapshot');
    const baseline = await this.computeBaseline({
      buildXml,
      source: 'wegame',
      league: input.character.league,
      preferredSkillNumber: response.selectedSkillNumber,
      preferredSkillName: response.selectedSkillName ?? input.character.mainSkillHint,
      character: {
        name: input.character.name,
        level: input.character.level,
        className: input.character.class,
      },
    });
    return { buildXml, baseline, validation };
  }

  async computeBaseline(input: BaselineInput): Promise<BaselineSnapshot> {
    await this.ensureStarted();
    const manager = this.manager!;

    const baseOptions = {
      source: input.source,
      pob2Version: this.version,
      pob2DataVersion: this.version,
      gameVersion: 'poe2',
      league: input.league,
      character: input.character ?? {},
      skillPart: input.skillPart,
      weaponSet: input.weaponSet ?? 1,
      config: input.config ?? {},
      mainSkillSelection: {
        selectedSkillNumber: input.preferredSkillNumber ?? 1,
        selectedSkillName: '待识别',
        selectionMode: input.preferredSkillNumber ? 'user_confirmed' : 'auto_single',
        candidates: [],
        warnings: [],
      } as MainSkillSelection,
      normalizerVersion: 'p3-mvp-1',
    };

    const provisional = await manager.createBaseline(input.buildXml, {
      ...baseOptions,
      skillNumber: input.preferredSkillNumber ?? 1,
    });

    const enabled = provisional.skillDpsList.filter((skill) => skill.enabled);
    const candidates = (enabled.length > 0 ? enabled : provisional.skillDpsList)
      .map((skill) => ({
        ...skill,
        reason: ['PoB2 skill list'],
      }))
      .sort((a, b) => b.dps - a.dps);
    const selected = candidates[0];
    if (input.preferredSkillNumber) {
      const preferred = candidates.find(
        (candidate) => candidate.skillNumber === input.preferredSkillNumber,
      );
      provisional.mainSkillSelection = {
        selectedSkillNumber: input.preferredSkillNumber,
        selectedSkillName:
          input.preferredSkillName
          ?? preferred?.name
          ?? `Skill ${input.preferredSkillNumber}`,
        selectionMode: 'user_confirmed',
        candidates,
        warnings: preferred ? [] : ['PoB2 did not return the validated main skill in its skill list.'],
      };
      return provisional;
    }
    if (!selected || selected.skillNumber === 1) {
      provisional.mainSkillSelection = {
        selectedSkillNumber: selected?.skillNumber ?? 1,
        selectedSkillName: selected?.name ?? '待选择',
        selectionMode: candidates.length <= 1 ? 'auto_single' : 'auto_highest_dps',
        candidates,
        warnings: selected ? [] : ['PoB2 未返回可用技能，请手动选择主技能。'],
      };
      return provisional;
    }

    return manager.createBaseline(input.buildXml, {
      ...baseOptions,
      skillNumber: selected.skillNumber,
      mainSkillSelection: {
        selectedSkillNumber: selected.skillNumber,
        selectedSkillName: selected.name,
        selectionMode: 'auto_highest_dps',
        candidates,
        warnings: [],
      },
    });
  }

  async applyGearSwap(input: {
    baseline: BaselineSnapshot;
    currentBuildXml: string;
    mutation: BuildMutation;
  }): Promise<ApplyGearSwapOutput> {
    await this.ensureStarted();
    const startedAt = Date.now();
    const response = await this.pool!.submit({
      buildXml: input.currentBuildXml,
      skillNumber: input.baseline.skillNumber,
      weaponSet: input.baseline.weaponSet,
      config: input.baseline.config,
      mutation: input.mutation,
    });
    if (!response.success) {
      const reason = this.compatibilityReason(response.error);
      if (reason) {
        return {
          buildXml: input.currentBuildXml,
          result: this.incompatibleResult(input.baseline, input.mutation, reason, response.error),
          snapshot: input.baseline,
        };
      }
      throw new Error(response.error ?? 'PoB2 mutation calculation failed');
    }

    if (!response.variantXml) {
      return {
        buildXml: input.currentBuildXml,
        result: this.invalidVariantResult(
          input.baseline,
          input.mutation,
          'variant_xml_missing',
          'PoB2 mutation succeeded but did not return variant XML',
        ),
        snapshot: input.baseline,
      };
    }
    const buildXml = response.variantXml;
    const variant: BuildVariant & { mutation: BuildMutation } = {
      variantId: randomUUID(),
      variantHash: createHash('sha256')
        .update(`${input.baseline.baselineHash}:${input.mutation.mutationId}:${buildXml}`)
        .digest('hex'),
      baselineHash: input.baseline.baselineHash,
      mutation: input.mutation,
      buildXml,
      buildXmlCanonicalHash: createHash('sha256').update(buildXml).digest('hex'),
      skillNumber: input.baseline.skillNumber,
      skillPart: input.baseline.skillPart,
      weaponSet: input.baseline.weaponSet,
      config: input.baseline.config,
      calcsOutput: response.calcsOutput ?? {},
      rawBreakdown: response.breakdown ?? {},
      preValidation: { isValid: true, warnings: [], errors: [] },
      postValidation: { isValid: true, warnings: [], errors: [] },
      calcValidation: {
        success: true,
        hasCalcsOutput: Boolean(response.calcsOutput),
        hasBreakdown: Boolean(response.breakdown),
        mainSkillStillValid: true,
        dpsIsValid: true,
      },
      calcDurationMs: Date.now() - startedAt,
      createdAt: Date.now(),
    };

    const result = new ResultComparator().compare(input.baseline, variant);

    // Compute a fresh authoritative snapshot from the variant XML
    let snapshot: BaselineSnapshot;
    try {
      snapshot = await this.computeBaseline({
        buildXml,
        source: input.baseline.source,
        character: input.baseline.character,
        league: input.baseline.league,
        preferredSkillNumber: input.baseline.skillNumber,
        preferredSkillName: input.baseline.mainSkillSelection.selectedSkillName,
        skillPart: input.baseline.skillPart,
        weaponSet: input.baseline.weaponSet,
        config: input.baseline.config,
      });
    } catch (snapshotError) {
      // Snapshot recomputation failed – return a calc_failed outcome.
      // buildXml stays at input.currentBuildXml (non-applied state).
      return {
        buildXml: input.currentBuildXml,
        result: this.calcFailedResult(input.baseline, input.mutation, snapshotError instanceof Error ? snapshotError.message : String(snapshotError)),
        snapshot: input.baseline,
      };
    }

    return {
      buildXml,
      result,
      snapshot,
    };
  }

  async simulatePassive(input: {
    baseline: BaselineSnapshot;
    mutation: BuildMutation;
  }): Promise<SimulationResult> {
    await this.ensureStarted();
    const startedAt = Date.now();
    const response = await this.pool!.submit({
      buildXml: input.baseline.buildXml,
      skillNumber: input.baseline.skillNumber,
      weaponSet: input.baseline.weaponSet,
      config: input.baseline.config,
      mutation: input.mutation,
    });
    if (!response.success) {
      throw new Error(response.error ?? 'PoB2 passive mutation failed');
    }
    const buildXml = response.variantXml ?? input.baseline.buildXml;
    const variant: BuildVariant & {
      mutation: BuildMutation;
      actuallyAddedNodeIds?: number[];
      actuallyRemovedNodeIds?: number[];
      pointCost?: number;
      pathAutoFilled?: boolean;
      cascadeRemoved?: boolean;
      cascadeNodeCount?: number;
    } = {
      variantId: randomUUID(),
      variantHash: createHash('sha256')
        .update(`${input.baseline.baselineHash}:${input.mutation.mutationId}:${buildXml}`)
        .digest('hex'),
      baselineHash: input.baseline.baselineHash,
      mutation: input.mutation,
      buildXml,
      buildXmlCanonicalHash: createHash('sha256').update(buildXml).digest('hex'),
      skillNumber: input.baseline.skillNumber,
      skillPart: input.baseline.skillPart,
      weaponSet: input.baseline.weaponSet,
      config: input.baseline.config,
      calcsOutput: response.calcsOutput ?? {},
      rawBreakdown: response.breakdown ?? {},
      preValidation: { isValid: true, warnings: [], errors: [] },
      postValidation: { isValid: true, warnings: [], errors: [] },
      calcValidation: {
        success: true,
        hasCalcsOutput: Boolean(response.calcsOutput),
        hasBreakdown: Boolean(response.breakdown),
        mainSkillStillValid: true,
        dpsIsValid: true,
      },
      actuallyAddedNodeIds: response.actuallyAddedNodeIds,
      actuallyRemovedNodeIds: response.actuallyRemovedNodeIds,
      pointCost: response.pointCost,
      pathAutoFilled: response.pathAutoFilled,
      cascadeRemoved: response.cascadeRemoved,
      cascadeNodeCount: response.actuallyRemovedNodeIds
        ? Math.max(0, response.actuallyRemovedNodeIds.length - 1)
        : undefined,
      calcDurationMs: Date.now() - startedAt,
      createdAt: Date.now(),
    };
    return new ResultComparator().compare(input.baseline, variant);
  }

  shutdown(): void {
    this.pool?.shutdown();
    this.pool = undefined;
    this.manager = undefined;
    this.catalogProvider = undefined;
  }

  private async ensureStarted(): Promise<void> {
    if (this.manager) return;
    const installation = await detectPoB2Installation();
    this.version = installation.version;
    this.pool = new Pob2WorkerPool({
      pythonPath: process.env.PYTHON_PATH ?? 'python',
      driverPath: path.resolve(process.cwd(), 'packages/pob2-worker/python/driver.py'),
      pobRoot: installation.root,
      maxWorkers: Number(process.env.POB2_WORKERS ?? 2),
      requestTimeoutMs: Number(process.env.POB2_TIMEOUT_MS ?? 60_000),
    });
    this.catalogProvider = new MappingCatalogProvider({
      pobRoot: installation.root,
      cacheDir: path.resolve(process.cwd(), '.cache', 'wegame-mapping'),
    });
    this.manager = new BaselineManager(new PoolBaselineClient(this.pool), {
      enableFileCache: true,
    });
  }

  private compatibilityReason(error?: string):
    | 'weapon_type_mismatch'
    | 'skill_requirement_not_met'
    | 'attribute_requirement_not_met'
    | 'main_skill_invalid'
    | 'gem_disabled'
    | undefined {
    const normalized = error?.toLowerCase() ?? '';
    if (normalized.includes('weapon') || normalized.includes('main skill')) {
      return normalized.includes('weapon') ? 'weapon_type_mismatch' : 'main_skill_invalid';
    }
    return undefined;
  }

  private calcFailedResult(
    baseline: BaselineSnapshot,
    mutation: BuildMutation,
    errorMessage: string,
  ): SimulationResult {
    const baselineDps =
      typeof baseline.calcsOutput.CombinedDPS === 'number'
        ? baseline.calcsOutput.CombinedDPS
        : 0;
    return {
      jobId: `${baseline.baselineHash}_${mutation.mutationId}`,
      baselineHash: baseline.baselineHash,
      variantHash: createHash('sha256').update(`${mutation.mutationId}:calc_failed`).digest('hex'),
      mutationId: mutation.mutationId,
      mutationType: mutation.type,
      resultKind: 'calc_failed',
      affectedSkillNumber: baseline.skillNumber,
      isMainSkillStillValid: false,
      target: {
        type: 'item',
        slotName: 'slotName' in mutation.payload ? mutation.payload.slotName : undefined,
      },
      baselineDps,
      variantDps: baselineDps,
      dpsDelta: 0,
      dpsDeltaPercent: 0,
      outputDiff: { offence: {} },
      errorCode: 'snapshot_failed',
      errorMessage,
      warnings: [errorMessage],
      evidence: [
        { type: 'baseline', baselineHash: baseline.baselineHash },
        { type: 'mutation', mutationId: mutation.mutationId },
      ],
      createdAt: Date.now(),
    };
  }

  private invalidVariantResult(
    baseline: BaselineSnapshot,
    mutation: BuildMutation,
    errorCode: string,
    errorMessage: string,
  ): SimulationResult {
    const baselineDps =
      typeof baseline.calcsOutput.CombinedDPS === 'number'
        ? baseline.calcsOutput.CombinedDPS
        : 0;
    return {
      jobId: `${baseline.baselineHash}_${mutation.mutationId}`,
      baselineHash: baseline.baselineHash,
      variantHash: createHash('sha256')
        .update(`${mutation.mutationId}:invalid_variant`)
        .digest('hex'),
      mutationId: mutation.mutationId,
      mutationType: mutation.type,
      resultKind: 'invalid_variant',
      affectedSkillNumber: baseline.skillNumber,
      isMainSkillStillValid: false,
      target: {
        type: 'item',
        slotName: 'slotName' in mutation.payload ? mutation.payload.slotName : undefined,
      },
      baselineDps,
      variantDps: baselineDps,
      dpsDelta: 0,
      dpsDeltaPercent: 0,
      outputDiff: { offence: {} },
      errorCode,
      errorMessage,
      warnings: [errorMessage],
      evidence: [
        { type: 'baseline', baselineHash: baseline.baselineHash },
        { type: 'mutation', mutationId: mutation.mutationId },
      ],
      createdAt: Date.now(),
    };
  }

  private incompatibleResult(
    baseline: BaselineSnapshot,
    mutation: BuildMutation,
    reason:
      | 'weapon_type_mismatch'
      | 'skill_requirement_not_met'
      | 'attribute_requirement_not_met'
      | 'main_skill_invalid'
      | 'gem_disabled',
    error?: string,
  ): SimulationResult {
    const baselineDps =
      typeof baseline.calcsOutput.CombinedDPS === 'number'
        ? baseline.calcsOutput.CombinedDPS
        : 0;
    return {
      jobId: `${baseline.baselineHash}_${mutation.mutationId}`,
      baselineHash: baseline.baselineHash,
      variantHash: createHash('sha256').update(`${mutation.mutationId}:incompatible`).digest('hex'),
      mutationId: mutation.mutationId,
      mutationType: mutation.type,
      resultKind: 'incompatible',
      affectedSkillNumber: baseline.skillNumber,
      isMainSkillStillValid: false,
      target: {
        type: 'item',
        slotName: 'slotName' in mutation.payload ? mutation.payload.slotName : undefined,
      },
      baselineDps,
      variantDps: baselineDps,
      dpsDelta: 0,
      dpsDeltaPercent: 0,
      outputDiff: { offence: {} },
      compatibility: { isCompatible: false, reason },
      warnings: [error ?? reason],
      errorMessage: error,
      evidence: [
        { type: 'baseline', baselineHash: baseline.baselineHash },
        { type: 'mutation', mutationId: mutation.mutationId },
      ],
      createdAt: Date.now(),
    };
  }
}
