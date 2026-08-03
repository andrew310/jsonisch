import { batch, untrack } from "../framework";
import type { InternalFieldStore } from "../types";
import { walkFieldStore } from "./walk-field-store";

/**
 * Sets the specified boolean property for the field store and all nested
 * children.
 *
 * @param internalFieldStore The field store to update.
 * @param type The boolean property type to set.
 * @param bool The boolean value to set.
 */
export function setFieldBool(
  internalFieldStore: InternalFieldStore,
  type: "isTouched" | "isDirty",
  bool: boolean,
): void {
  batch(() => {
    // Untracked to avoid subscribing a surrounding reactive scope to the
    // form structure
    untrack(() => {
      walkFieldStore(internalFieldStore, (fieldStore) => {
        fieldStore[type].value = bool;
      });
    });
  });
}
