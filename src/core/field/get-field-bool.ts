import type { InternalFieldStore } from "../types";
import { walkFieldStore } from "./walk-field-store";

/**
 * Returns whether the specified boolean property is true for the field
 * store or any of its nested children.
 *
 * @param internalFieldStore The field store to check.
 * @param type The boolean property type to check.
 *
 * @returns Whether the property is true.
 */
export function getFieldBool(
  internalFieldStore: InternalFieldStore,
  type: "errors" | "validationErrors" | "isTouched" | "isEdited" | "isDirty",
): boolean {
  return walkFieldStore(internalFieldStore, (fieldStore) =>
    Boolean(fieldStore[type].value),
  );
}
