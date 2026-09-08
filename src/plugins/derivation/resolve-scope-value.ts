import { getFieldInput } from "../../core/field/get-field-input";
import { readOwn } from "../../core/schema-utils";
import type {
  InternalFieldStore,
  InternalFormStore,
  Path,
} from "../../core/types";
import { derivationKey } from "./key";
import { findRowStore, resolveRowScopeValue } from "./row-scope";

/**
 * Resolves a single scalar key through the canonical scope precedence —
 * the same order the derivation plugin evaluates formula dependencies in:
 * the form value wins (a formula field resolves through its derived
 * signal, so the read is always fresh; an erroring formula resolves
 * `undefined`, never a stale number), `offFormValues` fills what the form
 * does not hold (an off-stage field still resolves from the canonical record).
 *
 * For widget-side scalar reads (e.g. an amount-or-percent field resolving
 * its percent basis). Collection overlay semantics stay inside the
 * derivation plugin — this helper is for scalars.
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
    const slot =
      child.kind === "value"
        ? derivationKey.get(internalFormStore, child)
        : undefined;
    if (slot) {
      const state = slot.derived.value;
      formValue = state.error === null ? state.value : undefined;
    } else {
      formValue = getFieldInput(child);
    }
  }
  return formValue === undefined
    ? readOwn(internalFormStore.offFormValues.value, key)
    : formValue;
}

/**
 * Resolves a single scalar key in the scope of the field at `path` — the
 * path-aware sibling of `resolveScopeValue`, and the read a widget owned by
 * a field should use:
 *
 * - inside an array row, the ROW's scope (live siblings in the same row →
 *   the canonical row from `offFormValues` matched by `id` → the parent
 *   record handle under the form's `recordHandle`), so a per-row formula's inputs are ITS
 *   row's values;
 * - anywhere else, the document scope (`resolveScopeValue`).
 *
 * The same precedence the derivation graph evaluates the field's own
 * formula in, so a widget can never display an input the value was not
 * computed from.
 *
 * @param internalFormStore The form store.
 * @param path The path of the field whose scope to resolve in.
 * @param key The identifier to resolve.
 *
 * @returns The resolved value, or `undefined`.
 */
export function resolveScopeValueAt(
  internalFormStore: InternalFormStore,
  path: Path,
  key: string,
): unknown {
  const rowStore = findRowStore(internalFormStore, path);
  return rowStore
    ? resolveRowScopeValue(internalFormStore, rowStore, key)
    : resolveScopeValue(internalFormStore, key);
}
