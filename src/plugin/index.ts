/**
 * `jsonisch/plugin` — machinery for plugin authors and host adapters:
 * the signal primitives, the plugin system, first-party plugin keys (slot
 * access), and internal-tree reads. Apps rendering forms import from the
 * package root instead; nothing here is needed to use a form.
 *
 * The surface is pinned by `src/__tests__/public-surface.tripwire.test.ts`
 * — add exports there first.
 */

// Signal primitives — plugins compute over these; `batch`/`untrack` are
// the writes-without-notifying tools a plugin's hooks legitimately need.
export {
  batch,
  computed,
  createSignal,
  createTracker,
  getListener,
  untrack,
  withListener,
} from "../core/signal";
export type { Listener, ReadonlySignal, Signal, Tracker } from "../core/signal";

// The plugin system.
export { FieldSlotKey, PluginKey } from "../core/plugin/key";
export type {
  JsonischPlugin,
  PluginCtx,
  WireContract,
  WireEnvelope,
} from "../core/plugin/types";
export {
  encodeFieldValue,
  fieldPluginDirty,
  hasPluginDirtyField,
  pluginsDirty,
  unwrapLeafInput,
} from "../core/plugin/driver";
export type { PluginDriver } from "../core/plugin/driver";
export { internalOf } from "../methods/form-ref";

// The internal store tree, for hooks and adapters that walk it.
export type {
  ContainerInput,
  FieldElement,
  InternalArrayStore,
  InternalBaseStore,
  InternalFieldStore,
  InternalObjectStore,
  InternalValueStore,
} from "../core/types/field";
export type { InternalFormStore } from "../core/types/form";
export { focusFieldElement } from "../core/field/focus-field-element";
export { getFieldBool } from "../core/field/get-field-bool";
export { getFieldInput } from "../core/field/get-field-input";
export { getFieldStore } from "../core/field/get-field-store";
export { walkFieldStore } from "../core/field/walk-field-store";
export {
  encodeScopeValues,
  getDirtyFieldInput,
} from "../core/field/get-dirty-field-input";

// First-party plugin keys and their slot/state types.
export { envelopesKey } from "../plugins/envelopes/key";
export type {
  EnvelopeSlot,
  HybridSlot,
  SourceSlot,
} from "../plugins/envelopes/types";
export type { EnvelopeState } from "../plugins/envelopes/plugin";
export { derivationKey } from "../plugins/derivation/key";
export type { DerivationSlot } from "../plugins/derivation/key";
export type { DerivationState } from "../plugins/derivation/plugin";
export { visibilityKey } from "../plugins/visibility/plugin";
export { baggerKey } from "../plugins/bagger/plugin";
export type { BaggerState } from "../plugins/bagger/plugin";
export { checksKey } from "../plugins/checks/plugin";
export type { ChecksState } from "../plugins/checks/plugin";

// Row-scope resolution internals (the derivation/visibility shared path).
export {
  canonicalRowOf,
  findRowStore,
  resolveRowFallback,
  resolveRowScopeValue,
} from "../plugins/derivation/row-scope";

// Validation plumbing (`validate` at the root wraps this).
export { validateFormInput } from "../core/form/validate-form-input";
