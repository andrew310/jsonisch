import { FieldSlotKey } from "../../core/plugin/key";
import type { ReadonlySignal } from "../../core/signal";
import type { DerivedState } from "../../core/types";

/**
 * The derivation slot of a formula/estimate value store.
 */
export interface DerivationSlot {
  /**
   * The derived output dependents chain through and the field displays: a
   * computed over the deps' input signals + `offFormValues`, resolved
   * through the single scope path — mode-aware: an estimate pin holds the
   * field's own input. NEVER written back into `input` — derived values
   * are outputs, excluded from dirty and payload by construction.
   */
  readonly derived: ReadonlySignal<DerivedState>;
  /**
   * The always-computed formula result, IGNORING the estimate pin — the
   * candidate value the estimate wrapper's nudge compares against and the
   * seed for a formula→estimate flip. The same signal object as `derived`
   * on a plain formula field.
   */
  readonly formulaValue: ReadonlySignal<DerivedState>;
  /**
   * Whether the formula references a collection (`SUM(assets[…])`) —
   * classified statically at wire time. Marks the stricter-persistence
   * set; carries no behavior in this slice.
   */
  readonly isRollup: boolean;
}

/**
 * The derivation plugin's slot key. The scope resolvers and the react
 * surface read derived state through this identity.
 */
export const derivationKey = new FieldSlotKey<DerivationSlot>("derivation");
