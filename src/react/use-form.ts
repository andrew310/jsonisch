import { useLayoutEffect, useMemo } from "react";
import { createFormStore } from "../core/form/create-form-store";
import { validateFormInput } from "../core/form/validate-form-input";
import type { FormConfig, InternalFormStore } from "../core/types";
import type { FormStore } from "./types";
import { useSignalSnapshot } from "./use-signal-snapshot";

/**
 * The form-level reactive state, read in one tracked pass. The whole-tree
 * walks behind `isTouched`/`isEdited`/`isDirty`/`isValid` are cached as
 * computeds on the internal store (`aggregates`), so a notification
 * re-reads four cache hits, not four tree walks.
 */
function readFormSnapshot(internal: InternalFormStore) {
  return {
    isSubmitting: internal.isSubmitting.value,
    isSubmitted: internal.isSubmitted.value,
    isValidating: internal.isValidating.value,
    isTouched: internal.aggregates.isTouched.value,
    isEdited: internal.aggregates.isEdited.value,
    isDirty: internal.aggregates.isDirty.value,
    isValid: internal.aggregates.isValid.value,
    errors: internal.errors.value,
  };
}

/**
 * Creates a reactive form store from a form configuration. The store is
 * created once for the component's lifetime — config changes after mount
 * are ignored (`applyBaseline` rebases on a fresh server record; `reset`
 * with a new `initialInput` discards in-flight edits with it).
 *
 * The returned store is an immutable SNAPSHOT over the stable `internal`
 * store: its identity changes when any observed form-level value changes
 * (see `useField` for the model).
 *
 * @param config The form configuration.
 *
 * @returns The form store snapshot.
 */
export function useForm(config: FormConfig): FormStore {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const internal = useMemo(() => createFormStore(config), []);

  useLayoutEffect(() => {
    if (config.validate === "initial") {
      validateFormInput(internal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reactive = useSignalSnapshot(
    () => readFormSnapshot(internal),
    [internal],
  );

  return useMemo(
    () => ({ internal, ...reactive }),
    [internal, reactive],
  );
}
