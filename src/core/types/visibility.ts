/**
 * The comparison operator of a `VisibleWhen` condition. `equals`/`contains`
 * come from a schema `then` branch; the `else` branch flips them to the
 * `not-` variants.
 */
export type VisibleWhenOp =
  | "equals"
  | "not-equals"
  | "contains"
  | "not-contains";

/**
 * A resolved conditional-visibility rule: the field renders only while the
 * watched field's value satisfies the condition. Resolved once at store
 * init from the root schema's `allOf` `if/then/else` blocks; hidden values
 * are RETAINED (visibility gates rendering, never state or payload).
 */
export interface VisibleWhen {
  /**
   * The watched field reference: a root-level field key, or the
   * record-handle bracket form `loan[key]` reading `key` off the object
   * stored under `loan` in the eval scope (the parent-record handle the
   * host layers into `offFormValues` — LOS-463/LOS-471).
   */
  readonly field: string;
  /**
   * The comparison operator.
   */
  readonly op: VisibleWhenOp;
  /**
   * The value the watched field is compared against.
   */
  readonly value: unknown;
}
