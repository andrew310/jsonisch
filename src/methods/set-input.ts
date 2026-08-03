import { setFieldInput } from "../core/field/set-field-input";
import type { InternalFormStore, Path } from "../core/types";

/**
 * Sets the input value of the field at the given path (or the entire form
 * for an empty path), updating touched, edited and dirty state. Throws on a
 * path not declared in the schema.
 *
 * @param form The form store to set input on.
 * @param path The path to the field (`[]` for the whole form).
 * @param input The new input value.
 */
export function setInput(
  form: InternalFormStore,
  path: Path,
  input: unknown,
): void {
  setFieldInput(form, path, input);
}
