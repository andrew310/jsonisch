import { getFieldStore } from "../core/field/get-field-store";
import { setFieldInput } from "../core/field/set-field-input";
import { validateIfRequired } from "../core/form/validate-if-required";
import { batch } from "../core/framework";
import type { Path } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Sets the input value of the field at the given path (or the entire form
 * for an empty path), updating touched, edited and dirty state, and
 * triggers validation when the form's validation mode requires it. Throws
 * on a path not declared in the schema.
 *
 * @param form The form store to set input on.
 * @param path The path to the field (`[]` for the whole form).
 * @param input The new input value.
 */
export function setInput(form: FormRef, path: Path, input: unknown): void {
  batch(() => {
    const internalFormStore = internalOf(form);
    setFieldInput(internalFormStore, path, input);
    validateIfRequired(
      internalFormStore,
      path.length
        ? getFieldStore(internalFormStore, path)
        : internalFormStore,
      "input",
    );
  });
}
