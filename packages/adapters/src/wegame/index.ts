export { WeGameAdapter } from "./wegame-adapter";
export * from './mapping-catalog';
export * from './wegame-converter';
export * from './catalog-provider';
export {
  createConversionReport,
  addUnknownMod,
  addUnmappedItem,
  addUnmappedNode,
  addUnmappedSkill,
  addUnmappedAscendancy,
  addWarning,
  incrementMapped,
  incrementTotal,
  finalizeReport,
} from "./conversion-report";
