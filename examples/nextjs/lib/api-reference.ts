// The documented public surface of the installed jsonisch package —
// generated from the library's entry files (src/index.ts, src/plugin/index.ts,
// src/react/index.ts), then hand-trimmed. Grouped by the categories those
// entry files declare as section comments, in their order.
//
// Anti-drift: scripts/api-surface-tripwire.mjs imports the three entry
// points at runtime and diffs Object.keys against the non-type entries
// here — a jsonisch upgrade that adds or removes an export fails the
// build until this file catches up.

export type ApiEntryPoint = "jsonisch" | "jsonisch/plugin" | "jsonisch/react";
export type ApiExportKind = "function" | "const" | "class" | "type";

export interface ApiExport {
  readonly entry: ApiEntryPoint;
  readonly category: string;
  readonly name: string;
  readonly kind: ApiExportKind;
  readonly signature: string;
  readonly description: string;
}

export const apiReference: readonly ApiExport[] = [
  {
    "entry": "jsonisch",
    "category": "The store",
    "name": "createFormStore",
    "kind": "function",
    "signature": "createFormStore(config: FormConfig): InternalFormStore",
    "description": "Creates a new internal form store from the provided configuration: walks the JSON-Schema once and builds the field-store tree (`kind: array|object|value`), with the schema as the allow-list — `initialInput` keys not declared in the schema never enter form state."
  },
  {
    "entry": "jsonisch",
    "category": "The store",
    "name": "DEFAULT_EMPTY_INPUT",
    "kind": "const",
    "signature": "const DEFAULT_EMPTY_INPUT: Record<string, unknown>",
    "description": "The default empty input of a form."
  },
  {
    "entry": "jsonisch",
    "category": "The store",
    "name": "DEFAULT_ROOT_RECORD_ALIAS",
    "kind": "const",
    "signature": "const DEFAULT_ROOT_RECORD_ALIAS: \"record\"",
    "description": "The default root-record alias (`FormConfig.rootRecordAlias`)."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "CalcEngine",
    "kind": "type",
    "signature": "interface CalcEngine",
    "description": "The injected calc engine, supplied by the host."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "CalcParseResult",
    "kind": "type",
    "signature": "type CalcParseResult",
    "description": "The result of parsing a formula expression: the engine's opaque AST node, or a parse error."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "DerivationMode",
    "kind": "type",
    "signature": "type DerivationMode",
    "description": "The mode of a formula field that accepts an estimate: `estimate` holds the provisional manually-entered value (the field's own input signal); `formula` computes."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "DerivedState",
    "kind": "type",
    "signature": "interface DerivedState",
    "description": "The output of a formula field's derived signal."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "FormConfig",
    "kind": "type",
    "signature": "interface FormConfig",
    "description": "Configuration for creating a form store."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "FormValidator",
    "kind": "type",
    "signature": "type FormValidator",
    "description": "The injected validator: compiled ONCE per schema by the caller, returns the issues for an input (`null`/`undefined`/empty for a valid input)."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "JsonSchema",
    "kind": "type",
    "signature": "interface JsonSchema",
    "description": "A JSON-Schema node as stored in the database."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "Path",
    "kind": "type",
    "signature": "type Path",
    "description": "A path from the form root to a field."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "PathSegment",
    "kind": "type",
    "signature": "type PathSegment",
    "description": "One step of a path: an object property key or an array index."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "ValidationIssue",
    "kind": "type",
    "signature": "interface ValidationIssue",
    "description": "One validation issue in the injected validator's output."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "ValidationMode",
    "kind": "type",
    "signature": "type ValidationMode",
    "description": "When validation runs."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "VisibleWhen",
    "kind": "type",
    "signature": "interface VisibleWhen",
    "description": "A resolved conditional-visibility rule: the field renders only while the watched field's value satisfies the condition."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "VisibleWhenOp",
    "kind": "type",
    "signature": "type VisibleWhenOp",
    "description": "The comparison operator of a `VisibleWhen` condition."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "FieldErrors",
    "kind": "type",
    "signature": "type FieldErrors",
    "description": "The errors of a field: at least one message, or `null` when valid."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "FieldKind",
    "kind": "type",
    "signature": "type FieldKind",
    "description": "The structural kind of a field store node, mirroring the JSON-Schema shape: `properties` → object, single-schema `items` → array, everything else (including `items`-less array-typed nodes, whose whole array is the value) → value."
  },
  {
    "entry": "jsonisch",
    "category": "Core types",
    "name": "PluginsInput",
    "kind": "type",
    "signature": "type PluginsInput",
    "description": "The `plugins` config entry: factories may be composed conditionally — falsy entries and nested arrays are accepted and flattened (`plugins: [envelopes(), engine && derivation(engine)]`)."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "applyBaseline",
    "kind": "function",
    "signature": "applyBaseline(form: FormRef, record: Record<string, unknown> | null | undefined, config?: ApplyBaselineConfig): void",
    "description": "Rebases a live form on a fresh server-loaded record — after a save or a revalidate, the store adopts the record as its new baseline instead of being torn down and rebuilt."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "ApplyBaselineConfig",
    "kind": "type",
    "signature": "interface ApplyBaselineConfig",
    "description": "Configuration for `applyBaseline`."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "insert",
    "kind": "function",
    "signature": "insert(form: FormRef, path: Path, config?: InsertConfig): void",
    "description": "Inserts a new item into the array field at the given path."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "move",
    "kind": "function",
    "signature": "move(form: FormRef, path: Path, from: number, to: number): void",
    "description": "Moves the item at one index to another within the array field at the given path."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "remove",
    "kind": "function",
    "signature": "remove(form: FormRef, path: Path, at: number): void",
    "description": "Removes the item at the given index from the array field at the given path."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "swap",
    "kind": "function",
    "signature": "swap(form: FormRef, path: Path, at: number, and: number): void",
    "description": "Swaps two items in the array field at the given path by exchanging their positions and their full state."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "InsertConfig",
    "kind": "type",
    "signature": "interface InsertConfig",
    "description": "Configuration for inserting an array item."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "getDeepErrorEntries",
    "kind": "function",
    "signature": "getDeepErrorEntries(form: FormRef, path?: Path): DeepErrorEntry[]",
    "description": "Retrieves every erroring field of the subtree at the given path (the entire form when no path is given) as `{ path, errors }` entries in depth-first order."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "getDeepErrors",
    "kind": "function",
    "signature": "getDeepErrors(form: FormRef, path?: Path): FieldErrors",
    "description": "Retrieves every error message of the field at the given path and all its descendants (the entire form when no path is given), in depth-first order."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "getErrors",
    "kind": "function",
    "signature": "getErrors(form: FormRef, path?: Path): FieldErrors",
    "description": "Retrieves the error messages of the field at the given path, or the form-level (root) errors when no path is given."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "setErrors",
    "kind": "function",
    "signature": "setErrors(form: FormRef, errors: FieldErrors, path?: Path): void",
    "description": "Sets or clears the error messages of the field at the given path, or the form-level (root) errors when no path is given."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "DeepErrorEntry",
    "kind": "type",
    "signature": "interface DeepErrorEntry",
    "description": "One deep-error entry: the erroring field's path and its messages."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "focus",
    "kind": "function",
    "signature": "focus(form: FormRef, path: Path): void",
    "description": "Focuses the first focusable element of the field at the given path."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "FormRef",
    "kind": "type",
    "signature": "type FormRef",
    "description": "What every method accepts as its form argument: the internal form store itself, or any wrapper exposing it as `internal` (the react adapter's public `FormStore`)."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "getDirtyInput",
    "kind": "function",
    "signature": "getDirtyInput(form: FormRef, path?: Path): unknown",
    "description": "Retrieves only the dirty input values of the field at the given path, or the entire form when no path is given."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "getDirtyPaths",
    "kind": "function",
    "signature": "getDirtyPaths(form: FormRef, path?: Path): Path[]",
    "description": "Returns the paths to the dirty fields of the form (or of the subtree at the given path)."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "getInput",
    "kind": "function",
    "signature": "getInput(form: FormRef, path?: Path): unknown",
    "description": "Retrieves the current input value of the field at the given path, or the entire form when no path is given."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "handleSubmit",
    "kind": "function",
    "signature": "handleSubmit(form: FormRef, handler: SubmitHandler): (event?: SubmitLikeEvent) => Promise<void>",
    "description": "Creates a submit event handler for the form: prevents default browser submission, marks every field touched (errors must be visible everywhere after a submit attempt), validates the form input, and calls the provided handler with the validated output if validation succeeds — an invalid form blocks the handler and focuses the first erroring field."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "SubmitHandler",
    "kind": "type",
    "signature": "type SubmitHandler",
    "description": "The submit handler called with the validated form output when validation succeeds."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "pickDirty",
    "kind": "function",
    "signature": "pickDirty(form: FormRef, from: Record<string, unknown>): Record<string, unknown> | undefined",
    "description": "Picks only the dirty parts of the given value, using the form's dirty fields as a structural mask while reading from the supplied value (a validated output, say), not the form's own input."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "reset",
    "kind": "function",
    "signature": "reset(form: FormRef, config?: ResetConfig): void",
    "description": "Resets a specific field or the entire form to its initial state, with fine-grained control over which state to preserve via the `keep*` flags."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "ResetConfig",
    "kind": "type",
    "signature": "interface ResetConfig",
    "description": "Configuration for resetting a form or field."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "setEntryMode",
    "kind": "function",
    "signature": "setEntryMode(form: FormRef, path: Path, mode: EntryMode): void",
    "description": "Sets the entry mode of an amount-or-percent field (enter a dollar amount, or a percent of the percent basis)."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "setPercentBasis",
    "kind": "function",
    "signature": "setPercentBasis(form: FormRef, path: Path, percentBasis: string): void",
    "description": "Sets the percent basis of an amount-or-percent field (the root-level field key the percent is taken of)."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "setInput",
    "kind": "function",
    "signature": "setInput(form: FormRef, path: Path, input: unknown): void",
    "description": "Sets the input value of the field at the given path (or the entire form for an empty path), updating touched, edited and dirty state, and triggers validation when the form's validation mode requires it."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "setMode",
    "kind": "function",
    "signature": "setMode(form: FormRef, path: Path, mode: DerivationMode, options?: SetModeOptions): void",
    "description": "Flips an estimate field between its two modes — the only supported mode writer; a raw mode-signal write skips value seeding and the flip timestamp."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "SetModeOptions",
    "kind": "type",
    "signature": "interface SetModeOptions",
    "description": "Options for `setMode`."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "setOffFormValues",
    "kind": "function",
    "signature": "setOffFormValues(form: FormRef, values: Record<string, unknown>): void",
    "description": "Replaces the form's off-form values (the read-only eval scope formula resolution falls back to)."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "validate",
    "kind": "function",
    "signature": "validate(form: FormRef, config?: ValidateFormInputConfig): ValidationResult",
    "description": "Validates the entire form input with the injected validator, routing each issue to its field's `errors` signal."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "ValidateFormInputConfig",
    "kind": "type",
    "signature": "interface ValidateFormInputConfig",
    "description": "Configuration for validating the form input."
  },
  {
    "entry": "jsonisch",
    "category": "Methods",
    "name": "ValidationResult",
    "kind": "type",
    "signature": "interface ValidationResult",
    "description": "The result of validating the form input."
  },
  {
    "entry": "jsonisch",
    "category": "Codec",
    "name": "decodeRecord",
    "kind": "function",
    "signature": "decodeRecord(schema: JsonSchema, record: Record<string, unknown> | null | undefined, options?: DecodeRecordOptions): Record<string, unknown> | undefined",
    "description": "Decodes a nested server record into the form's `initialInput` shape, routing each declared root property by its `x-column` geometry: `x-column: true` fields read from a real record column (a top-level record key), everything else reads from the record's `data` JSONB bag."
  },
  {
    "entry": "jsonisch",
    "category": "Codec",
    "name": "DecodeRecordOptions",
    "kind": "type",
    "signature": "interface DecodeRecordOptions",
    "description": "Options for `decodeRecord`."
  },
  {
    "entry": "jsonisch",
    "category": "Codec",
    "name": "encodeDirty",
    "kind": "function",
    "signature": "encodeDirty(schema: JsonSchema, dirty: Record<string, unknown> | null | undefined, options?: EncodeDirtyOptions): EncodedDirty | undefined",
    "description": "Encodes a dirty-values object (the `pickDirty`/`getDirtyInput` result) into the save payload, partitioning each root key by its `x-column` geometry: `x-column: true` fields become column updates, everything else lands in the `data` bag."
  },
  {
    "entry": "jsonisch",
    "category": "Codec",
    "name": "envelopeContracts",
    "kind": "function",
    "signature": "envelopeContracts(wire: readonly WireContract[] | undefined): ReadonlyMap<string, WireContract>",
    "description": "Builds the envelope-control lookup from a wire list."
  },
  {
    "entry": "jsonisch",
    "category": "Codec",
    "name": "EncodedDirty",
    "kind": "type",
    "signature": "interface EncodedDirty",
    "description": "The save payload partitioned by record geometry: real table columns and `data` JSONB bag entries."
  },
  {
    "entry": "jsonisch",
    "category": "Codec",
    "name": "EncodeDirtyOptions",
    "kind": "type",
    "signature": "interface EncodeDirtyOptions",
    "description": "Options for `encodeDirty`."
  },
  {
    "entry": "jsonisch",
    "category": "Codec",
    "name": "mergeCollectionRows",
    "kind": "function",
    "signature": "mergeCollectionRows(canonicalRows: ReadonlyArray<Record<string, unknown>>, liveRows: unknown): Array<Record<string, unknown>>",
    "description": "Merge a collection's canonical rows (the read model — full server rows with calc fields pre-evaluated, delivered via `offFormValues`) with the live form rows (the write model the user edits) for formula evaluation."
  },
  {
    "entry": "jsonisch",
    "category": "Control + relation",
    "name": "inferControl",
    "kind": "function",
    "signature": "inferControl(schema: JsonSchema): ControlKind",
    "description": "Decides which UI widget kind a JSON-Schema node renders as."
  },
  {
    "entry": "jsonisch",
    "category": "Control + relation",
    "name": "ControlKind",
    "kind": "type",
    "signature": "type ControlKind",
    "description": "The closed set of widget kinds `inferControl` can classify a schema node as."
  },
  {
    "entry": "jsonisch",
    "category": "Control + relation",
    "name": "readRelationConfig",
    "kind": "function",
    "signature": "readRelationConfig(schema: JsonSchema): RelationConfig | undefined",
    "description": "Reads a node's relation config, or `undefined` for a plain enum select/multiselect."
  },
  {
    "entry": "jsonisch",
    "category": "Control + relation",
    "name": "relationParentFieldName",
    "kind": "function",
    "signature": "relationParentFieldName(schema: JsonSchema, path: readonly (string | number)[], relation: RelationConfig): string | undefined",
    "description": "The sibling field a contact picker is scoped to (`memberOfEntityId`)."
  },
  {
    "entry": "jsonisch",
    "category": "Control + relation",
    "name": "relationRowIdentityProps",
    "kind": "function",
    "signature": "relationRowIdentityProps(target: string): Record<string, JsonSchema>",
    "description": "The row-identity contract for a relation target."
  },
  {
    "entry": "jsonisch",
    "category": "Control + relation",
    "name": "targetToKind",
    "kind": "function",
    "signature": "targetToKind(target: string): \"entity\" | \"contact\" | undefined",
    "description": "Maps a relation target to the party autocomplete's kind hint."
  },
  {
    "entry": "jsonisch",
    "category": "Control + relation",
    "name": "withRelationRowIdentity",
    "kind": "function",
    "signature": "withRelationRowIdentity(schema: JsonSchema): JsonSchema",
    "description": "Returns a schema whose multi-row relation item schemas additionally declare the row-identity keys (stage-configured keys win on collision)."
  },
  {
    "entry": "jsonisch",
    "category": "Control + relation",
    "name": "RelationConfig",
    "kind": "type",
    "signature": "interface RelationConfig",
    "description": "The relation config a select/multiselect control may carry."
  },
  {
    "entry": "jsonisch",
    "category": "Dirty predicates",
    "name": "isEmptyish",
    "kind": "function",
    "signature": "isEmptyish(value: unknown): boolean",
    "description": "Returns whether a value is semantically empty: `undefined`, `null`, the empty string, or `NaN` (what a cleared number input parses to)."
  },
  {
    "entry": "jsonisch",
    "category": "Dirty predicates",
    "name": "isPresenceEqual",
    "kind": "function",
    "signature": "isPresenceEqual(a: ContainerInput, b: ContainerInput): boolean",
    "description": "Semantic equality between two container presence sentinels: `true` only equals `true`; `null` and `undefined` (absent container) are equivalent."
  },
  {
    "entry": "jsonisch",
    "category": "Dirty predicates",
    "name": "isSemanticEqual",
    "kind": "function",
    "signature": "isSemanticEqual(a: unknown, b: unknown): boolean",
    "description": "Semantic, empty-aware equality between two leaf inputs: equal when both are semantically empty (`null` ≡ `undefined` ≡ `\"\"` ≡ `NaN`) or deeply structurally equal."
  },
  {
    "entry": "jsonisch",
    "category": "Scope reads",
    "name": "resolveScopeValue",
    "kind": "function",
    "signature": "resolveScopeValue(internalFormStore: InternalFormStore, key: string): unknown",
    "description": "Resolves a single scalar key through the canonical scope precedence — the same order the derivation plugin evaluates formula dependencies in: the form value wins, and `offFormValues` fills what the form does not hold."
  },
  {
    "entry": "jsonisch",
    "category": "Scope reads",
    "name": "resolveScopeValueAt",
    "kind": "function",
    "signature": "resolveScopeValueAt(internalFormStore: InternalFormStore, path: Path, key: string): unknown",
    "description": "Resolves a single scalar key in the scope of the field at `path` — the path-aware sibling of `resolveScopeValue`, and the read a widget owned by a field should use."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "envelopes",
    "kind": "function",
    "signature": "envelopes(): JsonischPlugin<EnvelopeState>",
    "description": "The envelopes plugin: owns the meta half of estimate and amount-or-percent fields — mode/entry state decoded from the kind envelope, dirty-tracked, and serialized by wrapping the field's own payload entry."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "envelopesWire",
    "kind": "const",
    "signature": "const envelopesWire: WireContract",
    "description": "The envelopes plugin's static wire contract — isomorphic by construction: the server imports this same object for save routing (`encodeDirty`), the recompute pass, and engine-less readers, with no form store anywhere."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "isEnvelope",
    "kind": "function",
    "signature": "isEnvelope(raw: unknown): raw is Record<string, unknown>",
    "description": "Returns whether a raw persisted entry is an envelope: an object whose `kind` is `estimate` or `amount-or-percent`."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "wrapEstimate",
    "kind": "function",
    "signature": "wrapEstimate(value: unknown, meta: EstimateMeta): unknown",
    "description": "Wraps an estimate field's halves into its envelope."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "wrapAmountOrPercent",
    "kind": "function",
    "signature": "wrapAmountOrPercent(value: unknown, meta: EntryMeta): unknown",
    "description": "Wraps an amount-or-percent field's halves into its envelope."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "EnvelopeKind",
    "kind": "type",
    "signature": "type EnvelopeKind",
    "description": "Discriminator of a persisted estimate / amount-or-percent envelope."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "EntryMeta",
    "kind": "type",
    "signature": "interface EntryMeta",
    "description": "The persisted meta half of an amount-or-percent field."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "EntryMode",
    "kind": "type",
    "signature": "type EntryMode",
    "description": "The entry mode of an amount-or-percent field: enter a dollar `amount`, or a `percent` of the percent basis."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "Envelope",
    "kind": "type",
    "signature": "type Envelope",
    "description": "A persisted envelope: `EstimateEnvelope | AmountOrPercentEnvelope`."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "EstimateEnvelope",
    "kind": "type",
    "signature": "interface EstimateEnvelope",
    "description": "In-memory estimate envelope: the value half plus estimate meta under one `kind` discriminator."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "AmountOrPercentEnvelope",
    "kind": "type",
    "signature": "interface AmountOrPercentEnvelope",
    "description": "In-memory amount-or-percent envelope."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "EstimateMeta",
    "kind": "type",
    "signature": "interface EstimateMeta",
    "description": "The persisted meta half of an estimate field."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "derivation",
    "kind": "function",
    "signature": "derivation(engine: CalcEngine): JsonischPlugin<DerivationState>",
    "description": "The derivation plugin: parses every `x-formula` once per scope (the document root and each array row), breaks dependency cycles deterministically, and gives each formula field its `formulaValue`/`derived` slot plus the composed `errors` channel."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "derivationWire",
    "kind": "const",
    "signature": "const derivationWire: WireContract",
    "description": "The derivation plugin's STATIC wire contract: a `formula` value is ALWAYS server-recomputed — a client payload only carries a stale echo of the last-rendered result, so `encodeDirty` drops it."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "visibility",
    "kind": "function",
    "signature": "visibility(): JsonischPlugin<null>",
    "description": "The visibility plugin: every field gated by an `allOf` `if/then/else` block on its OWN scope's schema gets a `visible` computed signal over the watched field's resolved value."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "bagger",
    "kind": "function",
    "signature": "bagger(record: Record<string, unknown>, opts?: BaggerOptions): JsonischPlugin<BaggerState>",
    "description": "The bagger plugin: computes the off-form shelf once (`computeBag`) and owns `offFormValues`, then seeds every relation row's declared keys from its canonical row as an unedited baseline."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "collectionKeys",
    "kind": "function",
    "signature": "collectionKeys(schema: JsonSchema, collectionsSchema?: JsonSchema): Set<string>",
    "description": "The record keys that hold relation ROWS, from both classification sources."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "computeBag",
    "kind": "function",
    "signature": "computeBag(schema: JsonSchema, record: Record<string, unknown>, opts?: ComputeBagOptions): Record<string, unknown>",
    "description": "Computes the off-form value bag for a canonical record: every declared scalar and relation collection, bag-merged and envelope-unwrapped, plus an alias entry holding the whole computed scope (so a formula or widget can address `record.termMonths` as readily as bare `termMonths`)."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "flattenSourceRow",
    "kind": "function",
    "signature": "flattenSourceRow(row: Record<string, unknown>, bag: string): Record<string, unknown>",
    "description": "Merges a source row's `x-column` fields with its bag column — bag wins, per the `x-column` save-routing authority."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "BaggerOptions",
    "kind": "type",
    "signature": "interface BaggerOptions",
    "description": "Options of the `bagger` plugin: the bag column name and a second collections schema for classifying which record keys hold rows."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "ComputeBagOptions",
    "kind": "type",
    "signature": "interface ComputeBagOptions",
    "description": "`computeBag` is store-less, so the alias key arrives as an option here; the plugin threads `form.rootRecordAlias` through (the one home — the plugin deliberately has NO alias option of its own, so the alias writer and the row-scope reader can never disagree)."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "checks",
    "kind": "function",
    "signature": "checks(config: ChecksConfig): JsonischPlugin<ChecksState>",
    "description": "The checks plugin: eslint's contract on a form store — named check definitions, configured instances, and reactive findings."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "formulaCheck",
    "kind": "function",
    "signature": "formulaCheck(engine: CalcEngine): CheckDefinition<FormulaOptions>",
    "description": "The one built-in check definition: a configured check row is an instance of this, not a definition of its own."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "replaceCheckInstances",
    "kind": "function",
    "signature": "replaceCheckInstances(form: FormRef, config: ChecksConfig): void",
    "description": "Re-registers check instances on a live form store (admin edits, late prop arrival) without remounting."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "UNEVALUABLE_MESSAGE_ID",
    "kind": "const",
    "signature": "const UNEVALUABLE_MESSAGE_ID: \"unevaluable\"",
    "description": "Shared messageId for parse/eval failures (plugin catch + host mapping)."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "CheckContext",
    "kind": "type",
    "signature": "interface CheckContext<Options = unknown>",
    "description": "The context a check definition's `create` receives: instance id, options, the evaluation scope, and `report`."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "CheckDefinition",
    "kind": "type",
    "signature": "interface CheckDefinition<Options = unknown>",
    "description": "A check definition: meta (name, messages, options schema) plus `create`, which returns the instance's evaluate handler."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "CheckInstanceConfig",
    "kind": "type",
    "signature": "interface CheckInstanceConfig<Options = unknown>",
    "description": "One configured check instance: its id, the definition it instantiates, a severity, and options."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "CheckScope",
    "kind": "type",
    "signature": "interface CheckScope",
    "description": "The read surface a check evaluates over: scalar `get`, collection `rows`, and the whole `values` bag."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "ChecksConfig",
    "kind": "type",
    "signature": "interface ChecksConfig",
    "description": "The checks plugin's configuration: check definitions, configured instances, and optional canonical collection rows for the check scope."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "Finding",
    "kind": "type",
    "signature": "interface Finding",
    "description": "One reported check finding: instance id, interpolated message, severity, and the field path it attaches to."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "FormulaOptions",
    "kind": "type",
    "signature": "interface FormulaOptions",
    "description": "Options of the built-in formula check: the formula expression plus optional message, display name, and target field keys."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "Severity",
    "kind": "type",
    "signature": "type Severity",
    "description": "A finding's severity: `info`, `warning`, or `error`."
  },
  {
    "entry": "jsonisch",
    "category": "First-party plugins",
    "name": "SeverityConfig",
    "kind": "type",
    "signature": "type SeverityConfig",
    "description": "A check instance's configured severity, or `off` to disable the instance."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "batch",
    "kind": "function",
    "signature": "batch<T>(fn: () => T): T",
    "description": "Batches signal writes: plain listener notifications are collected, de-duplicated, and delivered once when the outermost batch ends."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "computed",
    "kind": "function",
    "signature": "computed<T>(compute: () => T): ReadonlySignal<T>",
    "description": "Creates a lazy, cached, read-only signal derived from other signals."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "createSignal",
    "kind": "function",
    "signature": "createSignal<T>(): Signal<T | undefined>",
    "description": "Creates a writable reactive signal without an initial value."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "createTracker",
    "kind": "function",
    "signature": "createTracker(onInvalidate: () => void): Tracker",
    "description": "Creates a tracker: the non-React primitive the react adapter's snapshot store is built on."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "getListener",
    "kind": "function",
    "signature": "getListener(): Listener | undefined",
    "description": "Returns the currently active listener, if any."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "untrack",
    "kind": "function",
    "signature": "untrack<T>(fn: () => T): T",
    "description": "Executes a function without tracking signal reads as subscriptions."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "withListener",
    "kind": "function",
    "signature": "withListener<T>(listener: Listener | undefined, fn: () => T): T",
    "description": "Runs a function with the given listener active, restoring the previous listener afterwards (throw included)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "Listener",
    "kind": "type",
    "signature": "interface Listener",
    "description": "A subscription target."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "ReadonlySignal",
    "kind": "type",
    "signature": "interface ReadonlySignal<T>",
    "description": "A read-only reactive signal (the shape returned by `computed`)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "Signal",
    "kind": "type",
    "signature": "interface Signal<T>",
    "description": "A writable reactive signal."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Signal primitives",
    "name": "Tracker",
    "kind": "type",
    "signature": "interface Tracker",
    "description": "A retained tracked-read handle: `read` subscribes its owner to every signal the function touches, `dispose` drops all current subscriptions."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "FieldSlotKey",
    "kind": "class",
    "signature": "class FieldSlotKey<TSlot>",
    "description": "A plugin key whose state is a per-field map keyed by field-store IDENTITY."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "PluginKey",
    "kind": "class",
    "signature": "class PluginKey<TState>",
    "description": "The identity a plugin's state is stored under in the form store's `pluginState` map (the ProseMirror pattern, minus its string-name registry)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "JsonischPlugin",
    "kind": "type",
    "signature": "interface JsonischPlugin<TState = unknown>",
    "description": "A jsonisch plugin: a plain object from a factory."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "PluginCtx",
    "kind": "type",
    "signature": "interface PluginCtx<TState>",
    "description": "The context every per-form plugin hook receives: the form store and the plugin's own state (created by its `build`)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "WireContract",
    "kind": "type",
    "signature": "interface WireContract",
    "description": "A plugin's static wire behavior — a plain descriptor exported next to the plugin factory, never runtime state, because the codec is isomorphic: the server imports the same descriptor for save routing with no form store anywhere."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "WireEnvelope",
    "kind": "type",
    "signature": "interface WireEnvelope",
    "description": "A persisted wire entry split into its halves: the field's own value and the plugin-owned meta channel nested next to it."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "encodeFieldValue",
    "kind": "function",
    "signature": "encodeFieldValue(form: InternalFormStore, store: InternalValueStore, valueOut: unknown): unknown",
    "description": "Encodes one dirty value leaf's payload entry: asks the `encodeValue` implementers to wrap it in their envelope."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "fieldPluginDirty",
    "kind": "function",
    "signature": "fieldPluginDirty(form: InternalFormStore, store: InternalValueStore): boolean",
    "description": "Whether THIS value leaf's plugin state is dirty (must serialize)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "hasPluginDirtyField",
    "kind": "function",
    "signature": "hasPluginDirtyField(form: InternalFormStore, store: InternalFieldStore): boolean",
    "description": "Whether any value leaf in the subtree has dirty plugin state — the plugin half of the dirty walks that decide payload emission (a mode flip with an unchanged value must still produce a payload)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "pluginsDirty",
    "kind": "function",
    "signature": "pluginsDirty(form: InternalFormStore): boolean",
    "description": "Whether any plugin's form-level state is dirty."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "unwrapLeafInput",
    "kind": "function",
    "signature": "unwrapLeafInput(form: InternalFormStore, control: string, raw: unknown): unknown",
    "description": "Unwraps a raw persisted leaf entry through the form's envelope wire contracts: an envelope-control leaf resolves its value half, everything else passes through."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "PluginDriver",
    "kind": "type",
    "signature": "interface PluginDriver",
    "description": "The resolved plugin runtime on a form store: the flat plugin list, per-hook implementer lists, and the envelope wire contracts keyed by control kind — all precomputed once at `createFormStore`."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin system",
    "name": "internalOf",
    "kind": "function",
    "signature": "internalOf(form: FormRef): InternalFormStore",
    "description": "Unwraps a `FormRef` to the internal form store."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "ContainerInput",
    "kind": "type",
    "signature": "type ContainerInput",
    "description": "Presence marker for container (array/object) inputs: `true` when the value lives in the children, or the nullish value itself."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "FieldElement",
    "kind": "type",
    "signature": "type FieldElement",
    "description": "A DOM element a value field can be bound to."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "InternalArrayStore",
    "kind": "type",
    "signature": "interface InternalArrayStore",
    "description": "An array field store node."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "InternalBaseStore",
    "kind": "type",
    "signature": "interface InternalBaseStore",
    "description": "State shared by every field store node."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "InternalFieldStore",
    "kind": "type",
    "signature": "type InternalFieldStore",
    "description": "Any field store node."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "InternalObjectStore",
    "kind": "type",
    "signature": "interface InternalObjectStore",
    "description": "An object field store node."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "InternalValueStore",
    "kind": "type",
    "signature": "interface InternalValueStore",
    "description": "A leaf value field store node."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "InternalFormStore",
    "kind": "type",
    "signature": "interface InternalFormStore",
    "description": "The internal form store: the root object node plus form-level state."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "focusFieldElement",
    "kind": "function",
    "signature": "focusFieldElement(internalFieldStore: InternalFieldStore): boolean",
    "description": "Focuses the first focusable element of a field store."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "getFieldBool",
    "kind": "function",
    "signature": "getFieldBool(internalFieldStore: InternalFieldStore, type: \"errors\" | \"validationErrors\" | \"isTouched\" | \"isEdited\" | \"isDirty\"): boolean",
    "description": "Returns whether the specified boolean property is true for the field store or any of its nested children."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "getFieldInput",
    "kind": "function",
    "signature": "getFieldInput(internalFieldStore: InternalFieldStore): unknown",
    "description": "Returns the current input of the field store."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "getFieldStore",
    "kind": "function",
    "signature": "getFieldStore(internalFormStore: InternalFormStore, path: Path): InternalFieldStore",
    "description": "Returns the field store at the specified path."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "walkFieldStore",
    "kind": "function",
    "signature": "walkFieldStore(internalFieldStore: InternalFieldStore, callback: (internalFieldStore: InternalFieldStore) => boolean | void): boolean",
    "description": "Walks through the field store and all nested children, calling the callback for each field store in depth-first order."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "encodeScopeValues",
    "kind": "function",
    "signature": "encodeScopeValues(internalFormStore: InternalFormStore, internalFieldStore: InternalFieldStore | undefined, value: unknown): unknown",
    "description": "Wraps the envelope leaves of an emitted subtree value: rows and nested objects keep their shape, but every value leaf claimed by a plugin's `encodeValue` (estimate/amount-or-percent) is replaced with its COMPLETE envelope — the whole-array emission convention."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Internal store tree",
    "name": "getDirtyFieldInput",
    "kind": "function",
    "signature": "getDirtyFieldInput(internalFormStore: InternalFormStore, internalFieldStore: InternalFieldStore): unknown",
    "description": "Returns only the dirty input of the field store."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "envelopesKey",
    "kind": "const",
    "signature": "const envelopesKey: FieldSlotKey<EnvelopeSlot>",
    "description": "The envelopes plugin's slot key."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "EnvelopeSlot",
    "kind": "type",
    "signature": "type EnvelopeSlot",
    "description": "The envelope slot a value field may carry: meta state that is dirty-tracked and serialized by the envelopes plugin, never rendered as a field."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "AmountOrPercentSlot",
    "kind": "type",
    "signature": "interface AmountOrPercentSlot",
    "description": "The envelope slot of an amount-or-percent field (the `amount-or-percent` family)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "EstimateSlot",
    "kind": "type",
    "signature": "interface EstimateSlot",
    "description": "The envelope slot of an estimate field (the `estimate` family)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "EnvelopeState",
    "kind": "type",
    "signature": "type EnvelopeState",
    "description": "The envelopes plugin's state: one slot per estimate/amount-or-percent value store, keyed by store identity."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "derivationKey",
    "kind": "const",
    "signature": "const derivationKey: FieldSlotKey<DerivationSlot>",
    "description": "The derivation plugin's slot key."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "DerivationSlot",
    "kind": "type",
    "signature": "interface DerivationSlot",
    "description": "The derivation slot of a formula/estimate value store."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "DerivationState",
    "kind": "type",
    "signature": "type DerivationState",
    "description": "The derivation plugin's state: one slot per formula/estimate value store, keyed by store identity."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "visibilityKey",
    "kind": "const",
    "signature": "const visibilityKey: PluginKey<null>",
    "description": "The visibility plugin's key."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "baggerKey",
    "kind": "const",
    "signature": "const baggerKey: PluginKey<BaggerState>",
    "description": "The bagger plugin's key."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "BaggerState",
    "kind": "type",
    "signature": "interface BaggerState",
    "description": "The bagger plugin's state: the computed shelf plus an id-keyed row index per many:true relation field, used to seed a row's declared keys with their canonical baseline."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "checksKey",
    "kind": "const",
    "signature": "const checksKey: PluginKey<ChecksState>",
    "description": "The checks plugin's key."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Plugin keys + slots",
    "name": "ChecksState",
    "kind": "type",
    "signature": "interface ChecksState",
    "description": "The checks plugin's state: reactive findings, the blocking-finding flag, and the live instance and collection signals."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Row-scope resolution",
    "name": "canonicalRowOf",
    "kind": "function",
    "signature": "canonicalRowOf(internalFormStore: InternalFormStore, rowStore: InternalObjectStore): Record<string, unknown> | undefined",
    "description": "Resolves a row's CANONICAL record: the server row from `offFormValues` that carries the full column set (core columns the write model never holds, plus the server's pre-evaluated derived values)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Row-scope resolution",
    "name": "findRowStore",
    "kind": "function",
    "signature": "findRowStore(internalFormStore: InternalFormStore, path: Path): InternalObjectStore | undefined",
    "description": "Returns the INNERMOST array-item object store containing the field at the given path, or `undefined` when the path is not inside an array row (a root-level field, or a field under a plain nested object)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Row-scope resolution",
    "name": "resolveRowFallback",
    "kind": "function",
    "signature": "resolveRowFallback(internalFormStore: InternalFormStore, rowStore: InternalObjectStore, key: string, formValue: unknown): unknown",
    "description": "Resolves a row-scope dependency once the live row value is already in hand — the fallback precedence a per-row formula evaluates in."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Row-scope resolution",
    "name": "resolveRowScopeValue",
    "kind": "function",
    "signature": "resolveRowScopeValue(internalFormStore: InternalFormStore, rowStore: InternalObjectStore, key: string): unknown",
    "description": "Resolves a single identifier in the scope of a row: the same precedence `buildDerivation` evaluates a row formula's dependencies in, with the live sibling read derived-aware (a sibling formula resolves through its own derived signal, so the read is always fresh; an erroring sibling resolves `undefined`, never a stale number)."
  },
  {
    "entry": "jsonisch/plugin",
    "category": "Validation plumbing",
    "name": "validateFormInput",
    "kind": "function",
    "signature": "validateFormInput(internalFormStore: InternalFormStore, config?: ValidateFormInputConfig): ValidationResult",
    "description": "Validates the form input using the injected validator."
  },
  {
    "entry": "jsonisch/react",
    "category": "Components",
    "name": "Field",
    "kind": "function",
    "signature": "Field(props: FieldProps): ReactNode",
    "description": "Headless field component — the escape hatch for custom layouts: takes a form store and a path, and calls the render function with the reactive field store."
  },
  {
    "entry": "jsonisch/react",
    "category": "Components",
    "name": "FieldArray",
    "kind": "function",
    "signature": "FieldArray(props: FieldArrayProps): ReactNode",
    "description": "Headless field array component: calls the render function with the reactive field array store (stable item IDs for React keys)."
  },
  {
    "entry": "jsonisch/react",
    "category": "Components",
    "name": "Form",
    "kind": "function",
    "signature": "Form(props: FormProps): ReactElement",
    "description": "Headless form component: a native `<form noValidate>` wired to `handleSubmit` — an invalid submit blocks the handler and focuses the first erroring field."
  },
  {
    "entry": "jsonisch/react",
    "category": "Components",
    "name": "FieldArrayProps",
    "kind": "type",
    "signature": "interface FieldArrayProps",
    "description": "Props of the headless `FieldArray` component."
  },
  {
    "entry": "jsonisch/react",
    "category": "Components",
    "name": "FieldProps",
    "kind": "type",
    "signature": "interface FieldProps",
    "description": "Props of the headless `Field` component."
  },
  {
    "entry": "jsonisch/react",
    "category": "Components",
    "name": "FormProps",
    "kind": "type",
    "signature": "interface FormProps",
    "description": "Props of the headless `Form` component."
  },
  {
    "entry": "jsonisch/react",
    "category": "Hooks",
    "name": "createFormHook",
    "kind": "function",
    "signature": "createFormHook(config: FormHookConfig): FormHook",
    "description": "Creates the app's form API around a widget registry (the TanStack `createFormHook` borrow): widgets are registered ONCE at module level, and every form derives its fields from the schema through them."
  },
  {
    "entry": "jsonisch/react",
    "category": "Hooks",
    "name": "AppFieldProps",
    "kind": "type",
    "signature": "interface AppFieldProps",
    "description": "Props of the registry-aware `Field` component returned by `createFormHook`."
  },
  {
    "entry": "jsonisch/react",
    "category": "Hooks",
    "name": "FormHook",
    "kind": "type",
    "signature": "interface FormHook",
    "description": "The bound form API returned by `createFormHook`."
  },
  {
    "entry": "jsonisch/react",
    "category": "Hooks",
    "name": "useField",
    "kind": "function",
    "signature": "useField(form: FormStore, path: Path): FieldStore",
    "description": "Creates a reactive field store for the field at the given path."
  },
  {
    "entry": "jsonisch/react",
    "category": "Hooks",
    "name": "useFieldArray",
    "kind": "function",
    "signature": "useFieldArray(form: FormStore, path: Path): FieldArrayStore",
    "description": "Creates a reactive field array store for the array field at the given path."
  },
  {
    "entry": "jsonisch/react",
    "category": "Hooks",
    "name": "useForm",
    "kind": "function",
    "signature": "useForm(config: FormConfig): FormStore",
    "description": "Creates a reactive form store from a form configuration."
  },
  {
    "entry": "jsonisch/react",
    "category": "Hooks",
    "name": "snapshotEqual",
    "kind": "function",
    "signature": "snapshotEqual(a: unknown, b: unknown): boolean",
    "description": "Value-level equality for snapshot objects: top-level keys compared with `Object.is`, with ONE extra level for plain arrays and plain objects — computed results (a `DerivedState`, an errors array) are rebuilt with a fresh identity on every recompute, and without the value compare every notification would produce a render even when nothing visible changed."
  },
  {
    "entry": "jsonisch/react",
    "category": "Hooks",
    "name": "useSignalSnapshot",
    "kind": "function",
    "signature": "useSignalSnapshot<T>(compute: () => T, deps: readonly unknown[], isEqual?: (a: T, b: T) => boolean): T",
    "description": "Subscribes the component to exactly the signals `compute` reads and returns the computed snapshot."
  },
  {
    "entry": "jsonisch/react",
    "category": "Store + widget types",
    "name": "FieldArrayStore",
    "kind": "type",
    "signature": "interface FieldArrayStore",
    "description": "The public field array store returned by `useFieldArray`."
  },
  {
    "entry": "jsonisch/react",
    "category": "Store + widget types",
    "name": "FieldElementProps",
    "kind": "type",
    "signature": "interface FieldElementProps",
    "description": "The props a field store provides for binding a DOM element."
  },
  {
    "entry": "jsonisch/react",
    "category": "Store + widget types",
    "name": "FieldStore",
    "kind": "type",
    "signature": "interface FieldStore",
    "description": "The public field store returned by `useField`: an immutable snapshot — a new object identity whenever any observed value changes, stable otherwise."
  },
  {
    "entry": "jsonisch/react",
    "category": "Store + widget types",
    "name": "FieldStoreSlots",
    "kind": "type",
    "signature": "interface FieldStoreSlots",
    "description": "The plugin-contributed members of `FieldStore` — an empty marker each plugin merges its `fieldSnapshot` keys into via `declare module` augmentation IN ITS OWN FILE (fastify's decorate pattern), so widgets type-check flat members (`field.mode`, `field.setEntryMode(...)`) with no generics anywhere and ownership stays greppable."
  },
  {
    "entry": "jsonisch/react",
    "category": "Store + widget types",
    "name": "FormHookConfig",
    "kind": "type",
    "signature": "interface FormHookConfig",
    "description": "The configuration of `createFormHook`: the registry mapping widget kinds to components, plus the injected validator compiler."
  },
  {
    "entry": "jsonisch/react",
    "category": "Store + widget types",
    "name": "FormStore",
    "kind": "type",
    "signature": "interface FormStore",
    "description": "The public form store returned by `useForm`/`useAppForm`: an immutable snapshot whose identity changes when any observed form-level value changes — reactivity rides on the object, not on property reads, so it composes with React Compiler memoization."
  },
  {
    "entry": "jsonisch/react",
    "category": "Store + widget types",
    "name": "UseAppFormConfig",
    "kind": "type",
    "signature": "type UseAppFormConfig",
    "description": "The configuration of `useAppForm`: the store config minus the validator, which the hook compiles itself via the registry's `validate`."
  },
  {
    "entry": "jsonisch/react",
    "category": "Store + widget types",
    "name": "WidgetProps",
    "kind": "type",
    "signature": "interface WidgetProps",
    "description": "The props every registry widget receives."
  }
];
