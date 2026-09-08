/**
 * `jsonisch` — the app-facing form API: create a store from a schema, the
 * verb methods, the codec, widget-facing reads, and the first-party plugin
 * factories. Plugin-author machinery lives in `jsonisch/plugin`; the react
 * adapter in `jsonisch/react`.
 *
 * The surface is pinned by `src/__tests__/public-surface.tripwire.test.ts`
 * — add exports there first.
 */

// The store.
export {
  createFormStore,
  DEFAULT_EMPTY_INPUT,
  DEFAULT_ROOT_RECORD_ALIAS,
} from "./core/form/create-form-store";

// Core types.
export type {
  CalcEngine,
  CalcParseResult,
  DerivationMode,
  DerivedState,
  FormConfig,
  FormValidator,
  JsonSchema,
  Path,
  PathSegment,
  ValidationIssue,
  ValidationMode,
  VisibleWhen,
  VisibleWhenOp,
} from "./core/types";
export type { FieldErrors, FieldKind } from "./core/types/field";
export type { PluginsInput } from "./core/plugin/types";

// Methods — the verb API over a form ref.
export { applyBaseline } from "./methods/apply-baseline";
export type { ApplyBaselineConfig } from "./methods/apply-baseline";
export { insert, move, remove, swap } from "./methods/array-ops";
export type { InsertConfig } from "./methods/array-ops";
export {
  getDeepErrorEntries,
  getDeepErrors,
  getErrors,
  setErrors,
} from "./methods/errors";
export type { DeepErrorEntry } from "./methods/errors";
export { focus } from "./methods/focus";
export type { FormRef } from "./methods/form-ref";
export { getDirtyInput } from "./methods/get-dirty-input";
export { getDirtyPaths } from "./methods/get-dirty-paths";
export { getInput } from "./methods/get-input";
export { handleSubmit } from "./methods/handle-submit";
export type { SubmitHandler } from "./methods/handle-submit";
export { pickDirty } from "./methods/pick-dirty";
export { reset } from "./methods/reset";
export type { ResetConfig } from "./methods/reset";
export { setEntryMode, setPercentBasis } from "./methods/set-entry";
export { setInput } from "./methods/set-input";
export { setMode } from "./methods/set-mode";
export type { SetModeOptions } from "./methods/set-mode";
export { setOffFormValues } from "./methods/set-off-form-values";
export { validate } from "./methods/validate";
export type {
  ValidateFormInputConfig,
  ValidationResult,
} from "./core/form/validate-form-input";

// Codec — the save/load path.
export { decodeRecord } from "./core/codec/decode-record";
export type { DecodeRecordOptions } from "./core/codec/decode-record";
export { encodeDirty, envelopeContracts } from "./core/codec/encode-dirty";
export type { EncodedDirty, EncodeDirtyOptions } from "./core/codec/encode-dirty";
export { mergeCollectionRows } from "./core/derivation/merge-collection-rows";

// Control classification + relation config (widget-facing reads).
export { inferControl } from "./core/control";
export type { ControlKind } from "./core/control";
export {
  readRelationConfig,
  relationParentFieldName,
  relationRowIdentityProps,
  targetToKind,
  withRelationRowIdentity,
} from "./core/relation/relation-config";
export type { RelationConfig } from "./core/relation/relation-config";

// Semantic-dirty predicates.
export { isEmptyish, isPresenceEqual, isSemanticEqual } from "./core/dirty";

// Scope reads for widgets — the same precedence derivation evaluates in.
export {
  resolveScopeValue,
  resolveScopeValueAt,
} from "./plugins/derivation/resolve-scope-value";

// First-party plugins: the standard trio a form registers
// (`plugins: [envelopes(), engine && derivation(engine), visibility()]`),
// plus bagger and checks.
export { envelopes } from "./plugins/envelopes/plugin";
export {
  envelopesWire,
  isEnvelope,
  wrapEstimate,
  wrapAmountOrPercent,
} from "./plugins/envelopes/wire";
export type { EnvelopeKind } from "./plugins/envelopes/wire";
export type {
  EntryMeta,
  EntryMode,
  Envelope,
  EstimateEnvelope,
  AmountOrPercentEnvelope,
  EstimateMeta,
} from "./plugins/envelopes/types";
export { derivation } from "./plugins/derivation/plugin";
export { derivationWire } from "./plugins/derivation/wire";
export { visibility } from "./plugins/visibility/plugin";
export { bagger } from "./plugins/bagger/plugin";
export {
  collectionKeys,
  computeBag,
  flattenSourceRow,
} from "./plugins/bagger/compute-scope";
export type {
  BaggerOptions,
  ComputeBagOptions,
} from "./plugins/bagger/compute-scope";
export {
  checks,
  formulaCheck,
  replaceCheckInstances,
  UNEVALUABLE_MESSAGE_ID,
} from "./plugins/checks/plugin";
export type {
  CheckContext,
  CheckDefinition,
  CheckInstanceConfig,
  CheckScope,
  ChecksConfig,
  Finding,
  FormulaOptions,
  Severity,
  SeverityConfig,
} from "./plugins/checks/plugin";
