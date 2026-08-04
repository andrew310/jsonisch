import type { ReadonlySignal, Signal } from "../signal";
import type { ControlKind } from "../control";
import type { DerivationMode, DerivedState } from "./derivation";
import type { InternalMetaStore } from "./meta";
import type { Path } from "./path";
import type { JsonSchema } from "./schema";

/**
 * The structural kind of a field store node, mirroring the JSON-Schema
 * shape: `properties` → object, single-schema `items` → array, everything
 * else (including `items`-less array-typed nodes, whose whole array is the
 * value) → value. Orthogonal to `ControlKind`, the widget vocabulary.
 */
export type FieldKind = "array" | "object" | "value";

/**
 * A DOM element a value field can be bound to.
 *
 * Type-only reference: core never touches the DOM at runtime and stays
 * isomorphic; the react adapter populates these.
 */
export type FieldElement =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

/**
 * The errors of a field: at least one message, or `null` when valid.
 * Validation issues (AJV) and calc errors land in the same channel.
 */
export type FieldErrors = [string, ...string[]] | null;

/**
 * State shared by every field store node.
 */
export interface InternalBaseStore {
  /**
   * The kind of field store.
   */
  kind: FieldKind;
  /**
   * The property name of the field (last path segment as a string).
   */
  name: string;
  /**
   * The path from the form root to the field.
   */
  path: Path;
  /**
   * The JSON-Schema node this field was derived from.
   */
  schema: JsonSchema;
  /**
   * The widget kind this field renders as, resolved once at walk time via
   * `inferControl` (settled vocabulary; legacy `x-field-type` values
   * translated at read time).
   */
  control: ControlKind;
  /**
   * Whether the field accepts a nullish value: its `type` includes `"null"`
   * or its key is not in the parent's `required` list. Nullish fields keep
   * `undefined`/`null` instead of defaulting to their empty input.
   */
  isNullish: boolean;
  /**
   * The DOM elements bound to the field (react adapter only; empty on the
   * server).
   */
  elements: FieldElement[];
  /**
   * The elements the field registered itself (its reset baseline). Array
   * methods move `elements` between field stores during reorders; `reset`
   * restores each field's original elements via `elements = initialElements`.
   * Starts as the SAME array reference as `elements` so registrations made
   * before any reorder land in both.
   */
  initialElements: FieldElement[];
  /**
   * The errors of the field — the ONE read channel (validation + calc).
   * For most fields this is the same object as `validationErrors`; a
   * formula field swaps in a computed composing `validationErrors` with
   * its derived signal's calc error, so validation passes can never
   * clobber a calc error (and vice versa).
   */
  errors: ReadonlySignal<FieldErrors>;
  /**
   * The validation-sourced errors of the field. The ONLY writable error
   * store — every writer (validate routing, `setErrors`, reset, item-state
   * transfer) goes through this; calc errors are derived, never written.
   */
  validationErrors: Signal<FieldErrors>;
  /**
   * Whether the field has been focused.
   */
  isTouched: Signal<boolean>;
  /**
   * Whether the field's value has ever been changed. Unlike `isDirty` it
   * stays `true` when the value is changed back; only a reset clears it.
   */
  isEdited: Signal<boolean>;
  /**
   * Whether the field's value differs from its start input (semantic,
   * empty-aware compare: `null` ≡ `undefined` ≡ `""`).
   */
  isDirty: Signal<boolean>;
}

/**
 * Presence marker for container (array/object) inputs: `true` when the value
 * lives in the children, or the nullish value itself.
 */
export type ContainerInput = true | null | undefined;

/**
 * An array field store node.
 */
export interface InternalArrayStore extends InternalBaseStore {
  kind: "array";
  /**
   * The single item schema, validated non-tuple at walk time (so growth
   * paths never re-trust `schema.items`).
   */
  itemSchema: JsonSchema;
  /**
   * The child stores, one per array item.
   */
  children: InternalFieldStore[];
  /**
   * The initial input presence (reset target; does not move with items).
   */
  initialInput: Signal<ContainerInput>;
  /**
   * The start input presence (dirty baseline; moves with items).
   */
  startInput: Signal<ContainerInput>;
  /**
   * The current input presence.
   */
  input: Signal<ContainerInput>;
  /**
   * The initial item IDs (reset target; does not move with items).
   */
  initialItems: Signal<string[]>;
  /**
   * The start item IDs (dirty baseline for length changes).
   */
  startItems: Signal<string[]>;
  /**
   * The current item IDs, one stable ID per array item. The item count is
   * the authoritative array length (`children` may hold stale stores past
   * the end after a shrink, kept for baseline reuse on regrow).
   */
  items: Signal<string[]>;
}

/**
 * An object field store node.
 */
export interface InternalObjectStore extends InternalBaseStore {
  kind: "object";
  /**
   * The child stores, keyed by property name.
   */
  children: Record<string, InternalFieldStore>;
  /**
   * The initial input presence (reset target).
   */
  initialInput: Signal<ContainerInput>;
  /**
   * The start input presence (dirty baseline).
   */
  startInput: Signal<ContainerInput>;
  /**
   * The current input presence.
   */
  input: Signal<ContainerInput>;
}

/**
 * A leaf value field store node.
 *
 * Inputs are `unknown` — our schemas are runtime DB data, so there is no
 * compile-time value inference.
 */
export interface InternalValueStore extends InternalBaseStore {
  kind: "value";
  /**
   * The initial input (reset target).
   */
  initialInput: Signal<unknown>;
  /**
   * The start input (dirty baseline; `applyBaseline` may update it).
   */
  startInput: Signal<unknown>;
  /**
   * The current input.
   */
  input: Signal<unknown>;
  /**
   * The derived output of a formula field: a computed signal over the
   * deps' input signals + `offFormValues`, resolved through the single
   * scope path — mode-aware: an estimate pin holds the field's own input.
   * This is what dependents chain through and what the field displays.
   * Present only on root-level fields with a parseable derivation setup
   * (`x-formula` + injected calc engine). NEVER written back into `input`
   * — derived values are outputs, excluded from dirty and payload by
   * construction.
   */
  derived?: ReadonlySignal<DerivedState> | undefined;
  /**
   * The always-computed formula result, IGNORING the estimate pin — the
   * candidate value the estimate wrapper's nudge compares against
   * ("Calculated value available — replace estimate?") and the seed for a
   * formula→estimate flip. Same signal object as `derived` on a plain
   * formula field.
   */
  formulaValue?: ReadonlySignal<DerivedState> | undefined;
  /**
   * The estimate/formula mode of an estimate-control field. `estimate`
   * holds the manual value in `input`; `formula` computes. Decoded from
   * the `<key>Source` companion at store init (`manual` → `estimate`,
   * `calculated` → `formula`); with no companion the value-presence
   * heuristic decides — matching the server recompute's own defaulting.
   * Write via `setMode` (the flip API), not directly: a raw write skips
   * value seeding and the flip timestamp.
   */
  mode?: Signal<DerivationMode> | undefined;
  /**
   * The companion meta state of the field (`<key>Source` mode state on
   * estimate fields, `<key>Hybrid` entry state on amount-or-percent
   * fields): dirty-tracked and serialized by core, never rendered as a
   * field. Root-level fields only (the same boundary as derivation).
   */
  meta?: InternalMetaStore | undefined;
  /**
   * Whether the formula references a collection (`SUM(assets[…])`) —
   * classified statically from the expression at store init. Marks the
   * stricter-persistence set; carries no behavior in this slice.
   */
  isRollup?: boolean | undefined;
}

/**
 * Any field store node.
 */
export type InternalFieldStore =
  | InternalArrayStore
  | InternalObjectStore
  | InternalValueStore;
