import { useLayoutEffect, useMemo } from "react";
import { getFieldBool } from "../core/field/get-field-bool";
import { createFormStore } from "../core/form/create-form-store";
import { validateFormInput } from "../core/form/validate-form-input";
import type { FormConfig } from "../core/types";
import type { FormStore } from "./types";
import { useSignals } from "./use-signals";

/**
 * Creates a reactive form store from a form configuration. The store is
 * created once for the component's lifetime — config changes after mount
 * are ignored (reset with a new `initialInput` to rebase).
 *
 * @param config The form configuration.
 *
 * @returns The form store with reactive properties.
 */
export function useForm(config: FormConfig): FormStore {
  useSignals();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const internal = useMemo(() => createFormStore(config), []);

  useLayoutEffect(() => {
    if (config.validate === "initial") {
      validateFormInput(internal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({
      internal,
      get isSubmitting() {
        return internal.isSubmitting.value;
      },
      get isSubmitted() {
        return internal.isSubmitted.value;
      },
      get isValidating() {
        return internal.isValidating.value;
      },
      get isTouched() {
        return getFieldBool(internal, "isTouched");
      },
      get isEdited() {
        return getFieldBool(internal, "isEdited");
      },
      get isDirty() {
        return getFieldBool(internal, "isDirty");
      },
      get isValid() {
        return !getFieldBool(internal, "errors");
      },
      get errors() {
        return internal.errors.value;
      },
    }),
    [internal],
  );
}
