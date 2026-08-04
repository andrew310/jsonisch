import { setFieldBool } from "../core/field/set-field-bool";
import { validateFormInput } from "../core/form/validate-form-input";
import { batch, untrack } from "../core/framework";
import { type FormRef, internalOf } from "./form-ref";

/**
 * The minimal submit event shape the handler needs — structurally
 * compatible with both the native `SubmitEvent` and React's synthetic form
 * event.
 */
export interface SubmitLikeEvent {
  preventDefault: () => void;
}

/**
 * The submit handler called with the validated form output when validation
 * succeeds.
 */
export type SubmitHandler = (
  output: Record<string, unknown>,
  event?: SubmitLikeEvent,
) => unknown | Promise<unknown>;

/**
 * Creates a submit event handler for the form: prevents default browser
 * submission, marks every field touched (errors must be visible everywhere
 * after a submit attempt), validates the form input, and calls the provided
 * handler with the validated output if validation succeeds — an invalid
 * form blocks the handler and focuses the first erroring field. A handler
 * throw lands as a form-level (root) error. Re-entrant submits while
 * `isSubmitting` are ignored.
 *
 * @param form The form store to handle submission for.
 * @param handler The submit handler called with the validated output.
 *
 * @returns A submit event handler to attach to the form element.
 */
export function handleSubmit(
  form: FormRef,
  handler: SubmitHandler,
): (event?: SubmitLikeEvent) => Promise<void> {
  return async (event?: SubmitLikeEvent) => {
    event?.preventDefault();
    const internalFormStore = internalOf(form);

    // Ignore a re-entrant submit (double-click, Enter during submit)
    if (untrack(() => internalFormStore.isSubmitting.value)) {
      return;
    }

    batch(() => {
      internalFormStore.isSubmitted.value = true;
      internalFormStore.isSubmitting.value = true;
      // Touch all fields regardless of errors so untouched-field error
      // styling cannot hide a blocking issue
      setFieldBool(internalFormStore, "isTouched", true);
    });

    try {
      const result = validateFormInput(internalFormStore, {
        shouldFocus: true,
      });
      if (result.success) {
        await handler(result.output as Record<string, unknown>, event);
      }

      // A handler throw lands as a form-level error
    } catch (error) {
      internalFormStore.validationErrors.value = [
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "An unknown error has occurred.",
      ];
    } finally {
      internalFormStore.isSubmitting.value = false;
    }
  };
}
