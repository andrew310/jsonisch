import { getFieldInput } from "../core/field/get-field-input";
import { getFieldStore } from "../core/field/get-field-store";
import type { Path } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

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
export function getInput(form: FormRef, path?: Path): unknown {
  const internal = internalOf(form);
  return getFieldInput(
    path ? getFieldStore(internal, path) : internal,
    internal,
  );
}
