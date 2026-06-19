import {
  BaselineSnapshot,
  BuildVariant,
  SimulationResult,
  SimulationResultKind,
  OutputDiff,
  NumericDelta,
  HitLineDelta,
  EvidenceRef,
  MutationType,
  PassiveAddMeta,
  PassiveRemoveMeta,
  GearSwapMeta,
  CompatibilityResult,
  CalcValidation,
} from '@pobd/schemas';

/**
 * Extended variant type that may carry mutation metadata from the
 * VariantGenerator / Pob2Worker pipeline.  These fields are not
 * part of the base BuildVariant schema but are produced at runtime.
 */
type VariantWithPassiveMeta = BuildVariant & {
  actuallyRemovedNodeIds?: number[];
  actuallyAddedNodeIds?: number[];
  pointCost?: number;
  pathAutoFilled?: boolean;
  cascadeRemoved?: boolean;
  cascadeNodeCount?: number;
  mutation?: { mutationId: string; type: MutationType; payload?: Record<string, unknown> };
};

/**
 * Compares a baseline snapshot against a build variant and produces
 * a fully populated SimulationResult.
 *
 * Responsibilities:
 *  – Extract baseline / variant DPS
 *  – Compute delta and deltaPercent
 *  – Build OutputDiff from calcsOutput
 *  – Build HitLineDelta (PoB2 output → breakdown → panel fallback)
 *  – Determine resultKind (incompatible → calc_failed → gain/loss/neutral)
 *  – Populate passive / gear meta fields when present
 *  – Build evidence array
 */
export class ResultComparator {
  /**
   * Compare baseline against a single variant.
   */
  compare(baselineSnapshot: BaselineSnapshot, variantSnapshot: BuildVariant): SimulationResult {
    const variant = variantSnapshot as VariantWithPassiveMeta;

    const baselineDps = this.extractDps(baselineSnapshot);
    const variantDps = this.extractDps(variantSnapshot);
    const dpsDelta = variantDps - baselineDps;
    const dpsDeltaPercent = baselineDps !== 0 ? (dpsDelta / baselineDps) * 100 : 0;

    const outputDiff = this.buildOutputDiff(baselineSnapshot, variantSnapshot);
    const hitLineDelta = this.buildHitLineDelta(baselineSnapshot, variantSnapshot);

    const resultKind = this.determineResultKind(
      dpsDelta,
      variantSnapshot.compatibility,
      variantSnapshot.calcValidation
    );

    const isMainSkillStillValid = variantSnapshot.calcValidation?.mainSkillStillValid ?? true;
    const affectedSkillNumber = variantSnapshot.skillNumber ?? baselineSnapshot.skillNumber;

    const evidence = this.buildEvidence(baselineSnapshot, variantSnapshot);

    const mutationId = variant.mutation?.mutationId ?? 'unknown';
    const mutationType = variant.mutation?.type ?? 'config_change';

    const target = this.buildTarget(variant.mutation);

    const result: SimulationResult = {
      jobId: `${baselineSnapshot.baselineHash}_${mutationId}`,
      batchId: undefined,
      baselineHash: baselineSnapshot.baselineHash,
      variantHash: variantSnapshot.variantHash,
      mutationId,
      mutationType: mutationType as string,
      resultKind,
      affectedSkillNumber,
      isMainSkillStillValid,
      target,
      baselineDps,
      variantDps,
      dpsDelta,
      dpsDeltaPercent,
      pointCost: variant.pointCost,
      outputDiff,
      hitLineDelta,
      warnings: this.collectWarnings(baselineSnapshot, variantSnapshot, hitLineDelta),
      errorCode: variantSnapshot.calcValidation?.errorCode,
      errorMessage: variantSnapshot.calcValidation?.errorMessage,
      evidence,
      createdAt: Date.now(),
      calcDurationMs: variantSnapshot.calcDurationMs,
    };

    // Enrich with passive/gear meta when applicable
    if (mutationType === 'passive_add' && variant.mutation?.payload) {
      const payload = variant.mutation.payload as { targetNodeId?: number };
      const actuallyAdded = variant.actuallyAddedNodeIds ?? [payload.targetNodeId ?? 0];
      const pointCost = variant.pointCost ?? actuallyAdded.length;
      result.pointCost = pointCost;
      result.gainPerPoint = pointCost > 0 ? dpsDelta / pointCost : 0;
      result.passiveAddMeta = {
        targetNodeId: payload.targetNodeId ?? 0,
        actuallyAddedNodeIds: actuallyAdded,
        pathAutoFilled: variant.pathAutoFilled ?? pointCost > 1,
        actualPointCost: pointCost,
        gainPerPoint: pointCost > 0 ? dpsDelta / pointCost : 0,
      };
    } else if (mutationType === 'passive_remove' && variant.mutation?.payload) {
      const payload = variant.mutation.payload as { targetNodeId?: number };
      const actuallyRemoved = variant.actuallyRemovedNodeIds ?? [payload.targetNodeId ?? 0];
      result.passiveRemoveMeta = {
        targetNodeId: payload.targetNodeId ?? 0,
        actuallyRemovedNodeIds: actuallyRemoved,
        cascadeRemoved: variant.cascadeRemoved ?? actuallyRemoved.length > 1,
        cascadeNodeCount: variant.cascadeNodeCount ?? Math.max(0, actuallyRemoved.length - 1),
      };
    } else if (
      (mutationType === 'item_swap' || mutationType === 'item_combo') &&
      variant.mutation?.payload
    ) {
      const payload = variant.mutation.payload as { slotName?: string };
      result.gearSwapMeta = {
        slotName: payload.slotName ?? 'unknown',
      };
    }

    return result;
  }

  /**
   * Sort results by the requested criterion.
   *
   * Supported sort keys:
   *   – dpsDeltaPercent (default)
   *   – gainPerPoint
   *   – physicalHitLineDelta
   *   – elementalHitLineDelta
   */
  sortResults(results: SimulationResult[], sortBy: string): SimulationResult[] {
    const sorted = [...results];
    switch (sortBy) {
      case 'dpsDeltaPercent':
        sorted.sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent);
        break;
      case 'gainPerPoint':
        sorted.sort((a, b) => (b.gainPerPoint ?? 0) - (a.gainPerPoint ?? 0));
        break;
      case 'physicalHitLineDelta':
        sorted.sort((a, b) => {
          const aDelta = a.hitLineDelta?.physicalHitLineDelta?.delta ?? 0;
          const bDelta = b.hitLineDelta?.physicalHitLineDelta?.delta ?? 0;
          return bDelta - aDelta;
        });
        break;
      case 'elementalHitLineDelta':
        sorted.sort((a, b) => {
          const aDelta = a.hitLineDelta?.elementalHitLineDelta?.delta ?? 0;
          const bDelta = b.hitLineDelta?.elementalHitLineDelta?.delta ?? 0;
          return bDelta - aDelta;
        });
        break;
      default:
        sorted.sort((a, b) => b.dpsDeltaPercent - a.dpsDeltaPercent);
    }
    return sorted;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private extractDps(snapshot: BaselineSnapshot | BuildVariant): number {
    const co = snapshot.calcsOutput as Record<string, unknown> | undefined;
    if (co && typeof co === 'object') {
      const dps = co.CombinedDPS;
      if (typeof dps === 'number') return dps;
    }
    const mo = (snapshot as BaselineSnapshot).mainOutput as Record<string, unknown> | undefined;
    if (mo && typeof mo === 'object') {
      const dps = mo.CombinedDPS;
      if (typeof dps === 'number') return dps;
    }
    return 0;
  }

  private buildOutputDiff(baseline: BaselineSnapshot, variant: BuildVariant): OutputDiff {
    const bCo = (baseline.calcsOutput as Record<string, unknown>) || {};
    const vCo = (variant.calcsOutput as Record<string, unknown>) || {};

    const offence: OutputDiff['offence'] = {};

    const addOffence = (key: string, mapKey: string) => {
      const delta = this.buildNumericDelta(bCo, vCo, mapKey);
      if (delta) {
        (offence as Record<string, NumericDelta>)[key] = delta;
      }
    };

    addOffence('combinedDps', 'CombinedDPS');
    addOffence('averageHit', 'AverageHit');
    addOffence('hitDamage', 'HitDamage');
    addOffence('attackSpeed', 'Speed');
    addOffence('castSpeed', 'CastSpeed');
    addOffence('critChance', 'CritChance');
    addOffence('critMultiplier', 'CritMultiplier');
    addOffence('hitChance', 'HitChance');
    addOffence('accuracy', 'Accuracy');

    const diff: OutputDiff = { offence };

    // Defence
    const defence: NonNullable<OutputDiff['defence']> = {};
    const addDefence = (key: string, mapKey: string) => {
      const delta = this.buildNumericDelta(bCo, vCo, mapKey);
      if (delta) {
        (defence as Record<string, NumericDelta>)[key] = delta;
      }
    };

    addDefence('life', 'Life');
    addDefence('energyShield', 'EnergyShield');
    addDefence('armour', 'Armour');
    addDefence('evasion', 'Evasion');
    addDefence('blockChance', 'BlockChance');

    const resistances: Record<string, NumericDelta> = {};
    const resistanceKeys = ['FireResist', 'ColdResist', 'LightningResist', 'ChaosResist'];
    for (const key of resistanceKeys) {
      const delta = this.buildNumericDelta(bCo, vCo, key);
      if (delta) {
        resistances[key] = delta;
      }
    }
    if (Object.keys(resistances).length > 0) {
      defence.resistances = resistances;
    }

    if (Object.keys(defence).length > 0) {
      diff.defence = defence;
    }

    // Damage types
    const damageTypes: Record<string, NumericDelta> = {};
    const damageTypeKeys = ['PhysicalDamage', 'FireDamage', 'ColdDamage', 'LightningDamage', 'ChaosDamage'];
    for (const key of damageTypeKeys) {
      const delta = this.buildNumericDelta(bCo, vCo, key);
      if (delta) {
        damageTypes[key] = delta;
      }
    }
    if (Object.keys(damageTypes).length > 0) {
      diff.damageTypes = damageTypes;
    }

    return diff;
  }

  private buildNumericDelta(
    baseline: Record<string, unknown>,
    variant: Record<string, unknown>,
    key: string,
    variantKey?: string
  ): NumericDelta | undefined {
    const b = baseline[key];
    const v = variant[variantKey ?? key];
    if (typeof b === 'number' && typeof v === 'number') {
      return {
        baseline: b,
        variant: v,
        delta: v - b,
        deltaPercent: b !== 0 ? ((v - b) / b) * 100 : 0,
      };
    }
    return undefined;
  }

  private buildHitLineDelta(baseline: BaselineSnapshot, variant: BuildVariant): HitLineDelta | undefined {
    const bCo = (baseline.calcsOutput as Record<string, unknown>) || {};
    const vCo = (variant.calcsOutput as Record<string, unknown>) || {};
    const bBr = (baseline.rawBreakdown as Record<string, unknown>) || {};
    const vBr = (variant.rawBreakdown as Record<string, unknown>) || {};

    const warnings: string[] = [];
    let source: HitLineDelta['source'] = 'pob2_output';

    const readNumeric = (
      sourceMap: Record<string, unknown>,
      targetMap: Record<string, unknown>
    ): {
      physical: NumericDelta | undefined;
      elemental: NumericDelta | undefined;
      fire: NumericDelta | undefined;
      cold: NumericDelta | undefined;
      lightning: NumericDelta | undefined;
      chaos: NumericDelta | undefined;
    } => ({
      physical: this.buildNumericDelta(sourceMap, targetMap, 'PhysicalMaximumHitTaken'),
      elemental: this.buildNumericDelta(sourceMap, targetMap, 'ElementalMaximumHitTaken'),
      fire: this.buildNumericDelta(sourceMap, targetMap, 'FireMaximumHitTaken'),
      cold: this.buildNumericDelta(sourceMap, targetMap, 'ColdMaximumHitTaken'),
      lightning: this.buildNumericDelta(sourceMap, targetMap, 'LightningMaximumHitTaken'),
      chaos: this.buildNumericDelta(sourceMap, targetMap, 'ChaosMaximumHitTaken'),
    });

    const deriveElemental = (
      fire: NumericDelta | undefined,
      cold: NumericDelta | undefined,
      lightning: NumericDelta | undefined
    ): NumericDelta | undefined => {
      const b = [fire?.baseline, cold?.baseline, lightning?.baseline].filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
      );
      const v = [fire?.variant, cold?.variant, lightning?.variant].filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
      );
      if (b.length === 0 || v.length === 0) return undefined;
      const baselineMin = Math.min(...b);
      const variantMin = Math.min(...v);
      const delta = variantMin - baselineMin;
      return {
        baseline: baselineMin,
        variant: variantMin,
        delta,
        deltaPercent: baselineMin !== 0 ? (delta / baselineMin) * 100 : 0,
      };
    };

    const hasAnyDelta = (d: NumericDelta | undefined): boolean => d !== undefined;

    const fillLegacy = (
      target: Record<string, NumericDelta | undefined>,
      sourceMap: Record<string, unknown>,
      targetMap: Record<string, unknown>
    ) => {
      const map: [string, string][] = [
        ['physical', 'PhysicalHitDamage'],
        ['elemental', 'ElementalHitDamage'],
        ['fire', 'FireHitDamage'],
        ['cold', 'ColdHitDamage'],
        ['lightning', 'LightningHitDamage'],
        ['chaos', 'ChaosHitDamage'],
      ];
      for (const [field, legacyKey] of map) {
        if (!target[field]) {
          target[field] = this.buildNumericDelta(sourceMap, targetMap, legacyKey);
        }
      }
    };

    let {
      physical: physicalHitLineDelta,
      elemental: elementalHitLineDelta,
      fire: fireHitLineDelta,
      cold: coldHitLineDelta,
      lightning: lightningHitLineDelta,
      chaos: chaosHitLineDelta,
    } = readNumeric(bCo, vCo);

    // Prefer direct ElementalMaximumHitTaken from calcsOutput; derive only if absent
    if (!elementalHitLineDelta) {
      elementalHitLineDelta = deriveElemental(fireHitLineDelta, coldHitLineDelta, lightningHitLineDelta);
    }

    const coFields: Record<string, NumericDelta | undefined> = {
      physical: physicalHitLineDelta,
      elemental: elementalHitLineDelta,
      fire: fireHitLineDelta,
      cold: coldHitLineDelta,
      lightning: lightningHitLineDelta,
      chaos: chaosHitLineDelta,
    };

    // Per-field legacy fallback for calcsOutput
    fillLegacy(coFields, bCo, vCo);

    physicalHitLineDelta = coFields.physical;
    elementalHitLineDelta = coFields.elemental;
    fireHitLineDelta = coFields.fire;
    coldHitLineDelta = coFields.cold;
    lightningHitLineDelta = coFields.lightning;
    chaosHitLineDelta = coFields.chaos;

    let totalPoolDelta = this.buildNumericDelta(bCo, vCo, 'TotalPool');

    // Fallback 1: rawBreakdown — lower priority than calcsOutput, only fills missing fields
    const fromBr = readNumeric(bBr, vBr);
    const brFields: Record<string, NumericDelta | undefined> = {
      physical: physicalHitLineDelta ?? fromBr.physical,
      elemental: elementalHitLineDelta ?? fromBr.elemental,
      fire: fireHitLineDelta ?? fromBr.fire,
      cold: coldHitLineDelta ?? fromBr.cold,
      lightning: lightningHitLineDelta ?? fromBr.lightning,
      chaos: chaosHitLineDelta ?? fromBr.chaos,
    };
    // Derive elemental from per-element breakdown values (preferring higher-priority existing)
    if (!brFields.elemental) {
      const derived = deriveElemental(fireHitLineDelta ?? fromBr.fire, coldHitLineDelta ?? fromBr.cold, lightningHitLineDelta ?? fromBr.lightning);
      if (derived) brFields.elemental = derived;
    }
    // Per-field legacy fallback for rawBreakdown
    fillLegacy(brFields, bBr, vBr);

    const hasBr = brFields.physical !== physicalHitLineDelta || brFields.elemental !== elementalHitLineDelta ||
      brFields.fire !== fireHitLineDelta || brFields.cold !== coldHitLineDelta ||
      brFields.lightning !== lightningHitLineDelta || brFields.chaos !== chaosHitLineDelta;
    if (hasBr) {
      physicalHitLineDelta = brFields.physical;
      elementalHitLineDelta = brFields.elemental;
      fireHitLineDelta = brFields.fire;
      coldHitLineDelta = brFields.cold;
      lightningHitLineDelta = brFields.lightning;
      chaosHitLineDelta = brFields.chaos;
      totalPoolDelta = this.buildNumericDelta(bBr, vBr, 'TotalPool');
      source = 'normalized_breakdown';
    }

    // Fallback 2: panel (mainOutput) — per-field fill for any missing fields
    {
      const hasMissing = !physicalHitLineDelta || !elementalHitLineDelta ||
        !fireHitLineDelta || !coldHitLineDelta || !lightningHitLineDelta || !chaosHitLineDelta;
      if (hasMissing) {
        const bMo = (baseline.mainOutput as Record<string, unknown>) || {};
        const vMo = (variant.mainOutput as Record<string, unknown>) || {};
        const fromMo = readNumeric(bMo, vMo);
        const moFields: Record<string, NumericDelta | undefined> = {
          physical: physicalHitLineDelta ?? fromMo.physical,
          elemental: elementalHitLineDelta ?? fromMo.elemental,
          fire: fireHitLineDelta ?? fromMo.fire,
          cold: coldHitLineDelta ?? fromMo.cold,
          lightning: lightningHitLineDelta ?? fromMo.lightning,
          chaos: chaosHitLineDelta ?? fromMo.chaos,
        };
        if (!moFields.elemental) {
          const derived = deriveElemental(fireHitLineDelta ?? fromMo.fire, coldHitLineDelta ?? fromMo.cold, lightningHitLineDelta ?? fromMo.lightning);
          if (derived) moFields.elemental = derived;
        }
        fillLegacy(moFields, bMo, vMo);
        const hasMo = moFields.physical !== physicalHitLineDelta ||
          moFields.elemental !== elementalHitLineDelta ||
          moFields.fire !== fireHitLineDelta ||
          moFields.cold !== coldHitLineDelta ||
          moFields.lightning !== lightningHitLineDelta ||
          moFields.chaos !== chaosHitLineDelta;
        if (hasMo) {
          if (moFields.physical !== physicalHitLineDelta) warnings.push('Hit line delta not available in calcsOutput or breakdown; falling back to panel data');
          physicalHitLineDelta = moFields.physical;
          elementalHitLineDelta = moFields.elemental;
          fireHitLineDelta = moFields.fire;
          coldHitLineDelta = moFields.cold;
          lightningHitLineDelta = moFields.lightning;
          chaosHitLineDelta = moFields.chaos;
          source = 'panel_fallback';
        }
      }
    }

    if (!physicalHitLineDelta && !elementalHitLineDelta) {
      warnings.push('Unable to compute hit line delta from any source');
    }

    return {
      totalPoolDelta,
      physicalHitLineDelta,
      elementalHitLineDelta,
      fireHitLineDelta,
      coldHitLineDelta,
      lightningHitLineDelta,
      chaosHitLineDelta,
      source,
      warnings,
    };
  }

  private determineResultKind(
    dpsDelta: number,
    compatibility?: CompatibilityResult,
    calcValidation?: CalcValidation
  ): SimulationResultKind {
    if (compatibility && !compatibility.isCompatible) {
      return 'incompatible';
    }
    if (calcValidation && calcValidation.success === false) {
      return 'calc_failed';
    }
    if (dpsDelta > 0) return 'normal_gain';
    if (dpsDelta < 0) return 'normal_loss';
    return 'neutral';
  }

  private buildEvidence(baseline: BaselineSnapshot, variant: BuildVariant): EvidenceRef[] {
    const evidence: EvidenceRef[] = [
      { type: 'baseline', baselineHash: baseline.baselineHash, label: 'Baseline snapshot' },
      { type: 'variant', variantHash: variant.variantHash, label: 'Variant snapshot' },
      { type: 'calcs_output', path: 'calcsOutput', label: 'Calculation output' },
    ];

    if (baseline.rawBreakdown) {
      evidence.push({ type: 'raw_breakdown', path: 'rawBreakdown', label: 'Raw breakdown data' });
    }

    if (variant.compatibility) {
      evidence.push({
        type: 'conversion_report',
        path: 'compatibility',
        label: 'Compatibility check',
        value: variant.compatibility,
      });
    }

    return evidence;
  }

  private buildTarget(
    mutation?: { type: MutationType; payload?: Record<string, unknown> }
  ): SimulationResult['target'] {
    if (!mutation) {
      return { type: 'config' };
    }

    const payload = mutation.payload || {};
    switch (mutation.type) {
      case 'passive_add':
      case 'passive_remove':
      case 'passive_path':
        return {
          type: 'passive',
          id: payload.targetNodeId as number,
          name: payload.targetNodeName as string,
        };
      case 'item_swap':
        return {
          type: 'item',
          id: payload.itemId as number,
          name: payload.candidateItemName as string,
          slotName: payload.slotName as string,
        };
      case 'item_combo':
        return {
          type: 'combo',
          name: payload.comboDescription as string,
        };
      case 'config_change':
        return {
          type: 'config',
          name: payload.reason as string,
        };
      default:
        return { type: 'config' };
    }
  }

  private collectWarnings(
    baseline: BaselineSnapshot,
    variant: BuildVariant,
    hitLineDelta?: HitLineDelta
  ): string[] {
    const warnings: string[] = [];

    if (hitLineDelta?.warnings) {
      warnings.push(...hitLineDelta.warnings);
    }

    if (variant.preValidation?.warnings) {
      warnings.push(...variant.preValidation.warnings);
    }

    if (variant.postValidation?.warnings) {
      warnings.push(...variant.postValidation.warnings);
    }

    if (!variant.calcValidation?.hasCalcsOutput) {
      warnings.push('Variant missing calculation output');
    }

    if (!variant.calcValidation?.hasBreakdown) {
      warnings.push('Variant missing breakdown data');
    }

    return warnings;
  }
}
