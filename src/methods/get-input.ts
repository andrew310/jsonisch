import { getFieldInput } from "../core/field/get-field-input";
import { getFieldStore } from "../core/field/get-field-store";
import type { InternalFormStore, Path } from "../core/types";

/**
 * Retrieves the current input value of the field at the given path, or the
 * entire form when no path is given. The tree is the allow-list, so the
 * result only ever contains declared fields.
 *
 * @param form The form store to retrieve input from.
 * @param path The path to the field (omit for the whole form).
 *
 * @returns The input value.
 */
export function getInput(form: InternalFormStore, path?: Path): unknown {
  return getFieldInput(path ? getFieldStore(form, path) : form);
}
