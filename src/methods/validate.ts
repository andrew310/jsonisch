import {
  type ValidateFormInputConfig,
  validateFormInput,
  type ValidationResult,
} from "../core/form/validate-form-input";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Validates the entire form input with the injected validator, routing each
 * issue to its field's `errors` signal. Optionally focuses the first field
 * with an error.
 *
 * @param form The form store to validate.
 * @param config The validation configuration.
 *
 * @returns The validation result.
 */
export function validate(
  form: FormRef,
  config?: ValidateFormInputConfig,
): ValidationResult {
  return validateFormInput(internalOf(form), config);
}
