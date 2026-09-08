import type { ReadonlySignal, Signal } from "../signal";
import type { ControlKind } from "../control";
import type { Path } from "./path";
import type { JsonSchema } from "./schema";
import type { VisibleWhen } from "./visibility";

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
   * `inferControl`.
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
  /**
   * The conditional-visibility rule of the field, resolved once at store
   * init from the root schema's `allOf` `if/then/else` blocks. Root-level
   * fields only (derivation reaches into rows, visibility does not yet);
   * absent on ungated fields.
   */
  visibleWhen?: VisibleWhen | undefined;
  /**
   * Whether the field currently renders: a computed over the watched
   * field's resolved value (form wins, `offFormValues` fills). Present
   * only alongside `visibleWhen` — absent means always visible. Gates
   * RENDERING only; a hidden field keeps its state, dirtiness, and place
   * in the payload.
   */
  visible?: ReadonlySignal<boolean> | undefined;
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
 *
 * Feature state (derivation channels, envelope meta, visibility beyond
 * the base rule) lives in plugin slots keyed by this store's identity
 * (`FieldSlotKey`), never here — core's field shape has no compile-time
 * dependency on any feature.
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
}

/**
 * Any field store node.
 */
export type InternalFieldStore =
  | InternalArrayStore
  | InternalObjectStore
  | InternalValueStore;
