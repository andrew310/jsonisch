import { getDirtyFieldInput } from "../core/field/get-dirty-field-input";
import { getFieldStore } from "../core/field/get-field-store";
import type { InternalFormStore, Path } from "../core/types";

/**
 * Retrieves only the dirty input values of the field at the given path, or
 * the entire form when no path is given. Arrays are treated as atomic and
 * returned in full if any item is dirty, while object keys without a dirty
 * descendant are omitted. Returns `undefined` if nothing in the inspected
 * subtree is dirty.
 *
 * @param form The form store to retrieve dirty input from.
 * @param path The path to the field (omit for the whole form).
 *
 * @returns The dirty input, or `undefined`.
 */
export function getDirtyInput(form: InternalFormStore, path?: Path): unknown {
  return getDirtyFieldInput(path ? getFieldStore(form, path) : form);
}
