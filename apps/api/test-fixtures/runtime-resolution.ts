import { computeBuildDiff } from '@pobd/core';
import { MappingCatalog } from '@pobd/adapters';
import { detectPoB2Installation } from '@pobd/pob2-worker';

if (
  typeof computeBuildDiff !== 'function'
  || typeof MappingCatalog !== 'function'
  || typeof detectPoB2Installation !== 'function'
) {
  throw new Error('workspace runtime exports did not resolve');
}

console.log('runtime-exports-ok');
