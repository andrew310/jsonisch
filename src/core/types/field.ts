/**
 * PLACEHOLDER store types — signatures only.
 *
 * The schema walk (`createFormStore` building this tree from a JSON-Schema)
 * is intentionally NOT implemented yet: field-kind naming is still being
 * decided in a parallel session. Everything in this file is provisional and
 * expected to be renamed/extended when that lands.
 */
import type { Signal } from "../signal";
import type { Path } from "./path";
import type { JsonSchema } from "./schema";

/**
 * The kind of a field store node.
 *
 * PROVISIONAL naming — `array | object | value` mirrors the reference
 * architecture (formisch) until the jsonisch vocabulary is settled.
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
   * The DOM elements bound to the field (react adapter only; empty on the
   * server).
   */
  elements: FieldElement[];
  /**
   * The errors of the field (validation + calc, one channel).
   */
  errors: Signal<FieldErrors>;
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
  // TODO(LOS-539): meta channel — companion state (mode manual|formula,
  // hybrid denominator, ledger config) dirty-tracked and serialized by core,
  // never rendered as a field. Shape not yet settled.
}

/**
 * Presence marker for container (array/object) inputs: `true` when the value
 * lives in the children, or the nullish value itself.
 *
 * PROVISIONAL — mirrors the reference architecture; may change with the
 * schema walk.
 */
export type ContainerInput = true | null | undefined;

/**
 * An array field store node.
 */
export interface InternalArrayStore extends InternalBaseStore {
  kind: "array";
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
  // TODO(LOS-539): stable item-id signals (initialItems/startItems/items)
  // for insert/move/remove/swap — decide with the schema walk.
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
}

/**
 * Any field store node.
 */
export type InternalFieldStore =
  | InternalArrayStore
  | InternalObjectStore
  | InternalValueStore;
