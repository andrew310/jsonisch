import type { InternalFormStore } from "../core/types";

/**
 * What every method accepts as its form argument: the internal form store
 * itself, or any wrapper exposing it as `internal` (the react adapter's
 * public `FormStore`). App code passes the wrapper; core and tests pass the
 * internal store directly.
 */
export type FormRef =
  | InternalFormStore
  | { readonly internal: InternalFormStore };

/**
 * Unwraps a `FormRef` to the internal form store.
 */
export function internalOf(form: FormRef): InternalFormStore {
  return "internal" in form ? form.internal : form;
}
