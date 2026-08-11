// First-party jsonisch plugins: the standard trio a stage form registers
// (`plugins: [companions(), engine && derivation(engine), visibility()]`).
export { companions } from "./companions/plugin";
export type { CompanionState } from "./companions/plugin";
export { companionsKey } from "./companions/key";
export {
  companionsWire,
  ENTRY_ENVELOPE_KEY,
  isEnvelope,
  SOURCE_ENVELOPE_KEY,
  wrapEntry,
  wrapSource,
} from "./companions/wire";
export type {
  CompanionSlot,
  EntryMeta,
  EntryMode,
  HybridSlot,
  SourceMeta,
  SourceSlot,
} from "./companions/types";
export { derivation } from "./derivation/plugin";
export type { DerivationState } from "./derivation/plugin";
export { derivationKey } from "./derivation/key";
export type { DerivationSlot } from "./derivation/key";
export { derivationWire } from "./derivation/wire";
export {
  resolveScopeValue,
  resolveScopeValueAt,
} from "./derivation/resolve-scope-value";
export {
  canonicalRowOf,
  findRowStore,
  resolveRowFallback,
  resolveRowScopeValue,
} from "./derivation/row-scope";
export { visibility, visibilityKey } from "./visibility/plugin";
