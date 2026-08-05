// "use no memo" — jsonisch reactivity is signal-based: `useSignals`
// re-subscribes from the reads of EVERY render, so the React Compiler's
// auto-memoization (which skips those reads when `field`/`form` refs are
// stable) silently kills the subscriptions and freezes the UI
// (LOS-567; same class as the PR #334 zustand freeze).
"use no memo";
import { useLayoutEffect, useMemo } from "react";
import { getFieldBool } from "../core/field/get-field-bool";
import { createFormStore } from "../core/form/create-form-store";
import { hasDirtyMeta } from "../core/meta/encode-companion";
import { validateFormInput } from "../core/form/validate-form-input";
import type { FormConfig } from "../core/types";
import type { FormStore } from "./types";
import { useSignals } from "./use-signals";

/**
 * Creates a reactive form store from a form configuration. The store is
 * created once for the component's lifetime — config changes after mount
 * are ignored (`applyBaseline` rebases on a fresh server record; `reset`
 * with a new `initialInput` discards in-flight edits with it).
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
        // A dirty meta channel (mode flip, basis change) counts: it
        // produces a payload, so Save must enable
        return getFieldBool(internal, "isDirty") || hasDirtyMeta(internal);
      },
      get isValid() {
        // Calc errors are the admin's problem (#ERROR display), not the form
        // user's — only user-fixable validation gates validity
        return !getFieldBool(internal, "validationErrors");
      },
      get errors() {
        return internal.errors.value;
      },
    }),
    [internal],
  );
}
