// First-party jsonisch plugins: the standard trio a stage form registers
// (`plugins: [envelopes(), engine && derivation(engine), visibility()]`).
export { envelopes } from "./envelopes/plugin";
export type { EnvelopeState } from "./envelopes/plugin";
export { envelopesKey } from "./envelopes/key";
export {
  envelopesWire,
  isEnvelope,
  wrapEstimate,
  wrapHybrid,
} from "./envelopes/wire";
export type { EnvelopeKind } from "./envelopes/wire";
export type {
  Envelope,
  EnvelopeSlot,
  EntryMeta,
  EntryMode,
  EstimateEnvelope,
  HybridEnvelope,
  HybridSlot,
  SourceMeta,
  SourceSlot,
} from "./envelopes/types";
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
