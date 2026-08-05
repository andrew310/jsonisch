import { useMemo } from "react";
import { getFieldBool } from "../core/field/get-field-bool";
import { getFieldStore } from "../core/field/get-field-store";
import type { InternalArrayStore, Path } from "../core/types";
import type { FieldArrayStore, FormStore } from "./types";
import { useSignalSnapshot } from "./use-signal-snapshot";

/**
 * The array field's reactive state, read in one tracked pass.
 */
function readFieldArraySnapshot(internalFieldStore: InternalArrayStore) {
  return {
    items: internalFieldStore.items.value,
    errors: internalFieldStore.errors.value,
    isTouched: getFieldBool(internalFieldStore, "isTouched"),
    isEdited: getFieldBool(internalFieldStore, "isEdited"),
    isDirty: getFieldBool(internalFieldStore, "isDirty"),
    // Calc errors don't invalidate the field — the user can't fix them
    hasValidationErrors: getFieldBool(internalFieldStore, "validationErrors"),
  };
}

/**
 * Creates a reactive field array store for the array field at the given
 * path. Render one row per `items` entry and use the item ID as the React
 * key so row state and DOM follow their row across reorders.
 *
 * The returned store is an immutable SNAPSHOT (see `useField` for the
 * model).
 *
 * @param form The form store the array field belongs to.
 * @param path The path to the array field.
 *
 * @returns The field array store snapshot.
 */
export function useFieldArray(form: FormStore, path: Path): FieldArrayStore {
  const internalFieldStore = getFieldStore(form.internal, path);
  if (internalFieldStore.kind !== "array") {
    throw new Error(
      `Expected an array field at path ${JSON.stringify(path)}, got "${internalFieldStore.kind}"`,
    );
  }

  const reactive = useSignalSnapshot(
    () => readFieldArraySnapshot(internalFieldStore),
    [internalFieldStore],
  );

  return useMemo(
    () => ({
      path,
      items: reactive.items,
      errors: reactive.errors,
      isTouched: reactive.isTouched,
      isEdited: reactive.isEdited,
      isDirty: reactive.isDirty,
      isValid: !reactive.hasValidationErrors,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reactive],
  );
}
