import { internalOf } from "./form-ref";
import type { FormRef } from "./form-ref";

/**
 * Replaces the form's off-form values (the read-only eval scope formula
 * resolution falls back to). One signal write: every formula field reading
 * off-form values re-resolves once — the LOS-470 `BpsBaseSync` behavior as
 * a store property. `applyBaseline` (later slice) calls this on reconcile.
 *
 * @param form The form store.
 * @param values The new off-form values.
 */
export function setOffFormValues(
  form: FormRef,
  values: Record<string, unknown>,
): void {
  internalOf(form).offFormValues.value = values;
}
