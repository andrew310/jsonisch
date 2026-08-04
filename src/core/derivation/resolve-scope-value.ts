import { getFieldInput } from "../field/get-field-input";
import { readOwn } from "../schema-utils";
import type { InternalFieldStore, InternalFormStore } from "../types";

/**
 * Resolves a single scalar key through the canonical scope precedence —
 * the same order `buildDerivation` evaluates formula dependencies in: the
 * form value wins (a formula field resolves through its derived signal, so
 * the read is always fresh; an erroring formula resolves `undefined`, never
 * a stale number), `offFormValues` fills what the form does not hold (an
 * off-stage field still resolves from the loan canon).
 *
 * For widget-side scalar reads (e.g. an amount-or-percent field resolving
 * its percent basis). Collection overlay semantics stay inside
 * `buildDerivation` — this helper is for scalars.
 *
 * @param internalFormStore The form store.
 * @param key The root-level field key to resolve.
 *
 * @returns The resolved value, or `undefined`.
 */
export function resolveScopeValue(
  internalFormStore: InternalFormStore,
  key: string,
): unknown {
  const child = readOwn(internalFormStore.children, key) as
    | InternalFieldStore
    | undefined;
  let formValue: unknown;
  if (child) {
    if (child.kind === "value" && child.derived) {
      const state = child.derived.value;
      formValue = state.error === null ? state.value : undefined;
    } else {
      formValue = getFieldInput(child);
    }
  }
  return formValue === undefined
    ? readOwn(internalFormStore.offFormValues.value, key)
    : formValue;
}
