import type { InternalFieldStore } from "../types";
import { getFieldBool } from "./get-field-bool";
import { getFieldInput } from "./get-field-input";

/**
 * Returns only the dirty input of the field store. Arrays are treated as
 * atomic and returned in full if any item is dirty, while object keys
 * without a dirty descendant are omitted. Returns `undefined` if no
 * descendant is dirty.
 *
 * @param internalFieldStore The field store to get dirty input from.
 *
 * @returns The dirty input, or `undefined` if no descendant is dirty.
 */
export function getDirtyFieldInput(
  internalFieldStore: InternalFieldStore,
): unknown {
  if (!getFieldBool(internalFieldStore, "isDirty")) {
    return undefined;
  }

  // Arrays are atomic — one dirty item returns the whole current array
  if (internalFieldStore.kind === "array") {
    return getFieldInput(internalFieldStore);
  }

  // Objects recurse only into dirty children
  if (internalFieldStore.kind === "object") {
    if (internalFieldStore.input.value) {
      const value: Record<string, unknown> = {};
      for (const key in internalFieldStore.children) {
        const child = internalFieldStore.children[key];
        if (getFieldBool(child, "isDirty")) {
          value[key] = getDirtyFieldInput(child);
        }
      }
      return value;
    }
    return internalFieldStore.input.value;
  }

  return internalFieldStore.input.value;
}
