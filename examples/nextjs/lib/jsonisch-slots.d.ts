import type { DerivedState } from "jsonisch";

// jsonisch 0.1.1 friction: the derivation plugin augments `FieldStoreSlots`
// via `declare module "../../react/types"`, a source-relative path that no
// longer resolves from the bundled dist — so the plugin-contributed members
// (`field.derived`, `field.mode`, …) don't reach consumers. Until the
// augmentation targets the public entry, declare the one member this demo
// reads. Delete this file when the package fixes it.
declare module "jsonisch/react" {
  interface FieldStoreSlots {
    /**
     * The derivation plugin's output for a formula field: `{ value, error }`.
     */
    readonly derived: DerivedState | undefined;
  }
}
