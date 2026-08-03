import { getFieldBool } from "../field/get-field-bool";
import { untrack } from "../framework";
import type {
  InternalFieldStore,
  InternalFormStore,
  ValidationMode,
} from "../types";
import { validateFormInput } from "./validate-form-input";

/**
 * Validates the form input if required by the configured modes: the form's
 * `validate` mode applies until the form is in the "already validated"
 * state — submitted (for `validate: "submit"`), or the triggering subtree
 * has errors (any other mode) — after which the `revalidate` mode takes
 * over. `validate: "initial"` forms always run in revalidate mode.
 *
 * @param internalFormStore The form store to validate.
 * @param internalFieldStore The field store that triggered validation.
 * @param validationMode The validation mode of the triggering event.
 */
export function validateIfRequired(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  validationMode: ValidationMode,
): void {
  if (
    validationMode ===
    (internalFormStore.validate === "initial" ||
    (internalFormStore.validate === "submit"
      ? untrack(() => internalFormStore.isSubmitted.value)
      : untrack(() => getFieldBool(internalFieldStore, "errors")))
      ? internalFormStore.revalidate
      : internalFormStore.validate)
  ) {
    validateFormInput(internalFormStore);
  }
}
