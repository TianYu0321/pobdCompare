import type { ConversionReport, UnknownMod, UnmappedItem, UnmappedNode, UnmappedSkill } from "@pobd/schemas";

export function createConversionReport(): ConversionReport {
  return {
    status: "complete",
    skillMapped: 0,
    skillTotal: 0,
    itemMapped: 0,
    itemTotal: 0,
    modMapped: 0,
    modTotal: 0,
    passiveMapped: 0,
    passiveTotal: 0,
    ascendancyMapped: 0,
    ascendancyTotal: 0,
    configKnown: 0,
    configTotal: 0,
    unknownMods: [],
    unmappedNodes: [],
    unmappedSkills: [],
    unmappedItems: [],
    warnings: [],
  };
}

export function addUnknownMod(
  report: ConversionReport,
  mod: Omit<UnknownMod, "rawText"> & { rawText: string }
): ConversionReport {
  report.unknownMods.push(mod);
  report.modTotal += 1;
  return report;
}

export function addUnmappedItem(
  report: ConversionReport,
  item: UnmappedItem
): ConversionReport {
  report.unmappedItems.push(item);
  report.itemTotal += 1;
  return report;
}

export function addUnmappedNode(
  report: ConversionReport,
  node: UnmappedNode
): ConversionReport {
  report.unmappedNodes.push(node);
  report.passiveTotal += 1;
  return report;
}

export function addUnmappedSkill(
  report: ConversionReport,
  skill: UnmappedSkill
): ConversionReport {
  report.unmappedSkills.push(skill);
  report.skillTotal += 1;
  return report;
}

export function addUnmappedAscendancy(
  report: ConversionReport,
  node: UnmappedNode
): ConversionReport {
  report.unmappedNodes.push(node);
  report.ascendancyTotal += 1;
  return report;
}

export function addWarning(report: ConversionReport, warning: string): ConversionReport {
  report.warnings.push(warning);
  return report;
}

export function incrementMapped(
  report: ConversionReport,
  category: "skill" | "item" | "mod" | "passive" | "ascendancy" | "config"
): ConversionReport {
  switch (category) {
    case "skill":
      report.skillMapped += 1;
      break;
    case "item":
      report.itemMapped += 1;
      break;
    case "mod":
      report.modMapped += 1;
      break;
    case "passive":
      report.passiveMapped += 1;
      break;
    case "ascendancy":
      report.ascendancyMapped += 1;
      break;
    case "config":
      report.configKnown += 1;
      break;
  }
  return report;
}

export function incrementTotal(
  report: ConversionReport,
  category: "skill" | "item" | "mod" | "passive" | "ascendancy" | "config",
  count = 1
): ConversionReport {
  switch (category) {
    case "skill":
      report.skillTotal += count;
      break;
    case "item":
      report.itemTotal += count;
      break;
    case "mod":
      report.modTotal += count;
      break;
    case "passive":
      report.passiveTotal += count;
      break;
    case "ascendancy":
      report.ascendancyTotal += count;
      break;
    case "config":
      report.configTotal += count;
      break;
  }
  return report;
}

export function finalizeReport(report: ConversionReport): ConversionReport {
  // If the caller already set an explicit non-complete status, honor it
  if (report.status !== "complete") {
    return report;
  }

  const categories: Array<{
    mapped: number;
    total: number;
    name: string;
  }> = [
    { mapped: report.skillMapped, total: report.skillTotal, name: "skill" },
    { mapped: report.itemMapped, total: report.itemTotal, name: "item" },
    { mapped: report.modMapped, total: report.modTotal, name: "mod" },
    { mapped: report.passiveMapped, total: report.passiveTotal, name: "passive" },
    { mapped: report.ascendancyMapped, total: report.ascendancyTotal, name: "ascendancy" },
    { mapped: report.configKnown, total: report.configTotal, name: "config" },
  ];

  const anyTotals = categories.some((c) => c.total > 0);
  if (!anyTotals) {
    report.status = report.warnings.length > 0 ? "partial" : "partial";
    return report;
  }

  const allComplete = categories.every((c) => c.total === 0 || c.mapped === c.total);
  const anyFailed = categories.some((c) => c.total > 0 && c.mapped === 0);
  const hasWarnings = report.warnings.length > 0;
  const hasUnmapped =
    report.unmappedItems.length > 0 ||
    report.unmappedNodes.length > 0 ||
    report.unmappedSkills.length > 0 ||
    report.unknownMods.length > 0;

  if (allComplete && !hasWarnings) {
    report.status = "complete";
  } else if (anyFailed) {
    report.status = "failed";
  } else if (hasUnmapped || hasWarnings) {
    report.status = "partial";
  } else {
    report.status = "degraded";
  }

  return report;
}
