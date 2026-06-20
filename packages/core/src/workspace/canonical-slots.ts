/**
 * Canonical slot utilities re-exported from @pobd/schemas for backward
 * compatibility.  All alias logic lives in packages/schemas/src/canonical-slots.ts
 * so that frontend (browser) code can share the same map.
 */
export { toCanonicalSlot, toCanonicalSlotKey, isCanonicalSlotFamily } from '@pobd/schemas';
