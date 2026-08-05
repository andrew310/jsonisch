// "use no memo" — jsonisch reactivity is signal-based: `useSignals`
// re-subscribes from the reads of EVERY render, so the React Compiler's
// auto-memoization (which skips those reads when `field`/`form` refs are
// stable) silently kills the subscriptions and freezes the UI
// (LOS-567; same class as the PR #334 zustand freeze).
"use no memo";
import { useMemo } from "react";
import { getFieldBool } from "../core/field/get-field-bool";
import { getFieldStore } from "../core/field/get-field-store";
import type { Path } from "../core/types";
import type { FieldArrayStore, FormStore } from "./types";
import { useSignals } from "./use-signals";

/**
 * Creates a reactive field array store for the array field at the given
 * path. Render one row per `items` entry and use the item ID as the React
 * key so row state and DOM follow their row across reorders.
 *
 * @param form The form store the array field belongs to.
 * @param path The path to the array field.
 *
 * @returns The field array store with reactive properties.
 */
export function useFieldArray(form: FormStore, path: Path): FieldArrayStore {
  useSignals();

  const internalFieldStore = getFieldStore(form.internal, path);
  if (internalFieldStore.kind !== "array") {
    throw new Error(
      `Expected an array field at path ${JSON.stringify(path)}, got "${internalFieldStore.kind}"`,
    );
  }

  return useMemo(
    () => ({
      path,
      get items() {
        return internalFieldStore.items.value;
      },
      get errors() {
        return internalFieldStore.errors.value;
      },
      get isTouched() {
        return getFieldBool(internalFieldStore, "isTouched");
      },
      get isEdited() {
        return getFieldBool(internalFieldStore, "isEdited");
      },
      get isDirty() {
        return getFieldBool(internalFieldStore, "isDirty");
      },
      get isValid() {
        // Calc errors don't invalidate the field — the user can't fix them
        return !getFieldBool(internalFieldStore, "validationErrors");
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [internalFieldStore],
  );
}
