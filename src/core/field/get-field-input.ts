import type { InternalFieldStore } from "../types";

/**
 * Returns the current input of the field store. For arrays and objects,
 * recursively collects input from all children (the tree is the allow-list:
 * only declared fields can ever appear in the result). Returns `null` or
 * `undefined` for nullish container inputs, or the leaf value for value
 * fields.
 *
 * @param internalFieldStore The field store to get input from.
 *
 * @returns The field input.
 */
export function getFieldInput(internalFieldStore: InternalFieldStore): unknown {
  if (internalFieldStore.kind === "array") {
    if (internalFieldStore.input.value) {
      const value = [];
      for (
        let index = 0;
        index < internalFieldStore.items.value.length;
        index++
      ) {
        value[index] = getFieldInput(internalFieldStore.children[index]);
      }
      return value;
    }
    return internalFieldStore.input.value;
  }

  if (internalFieldStore.kind === "object") {
    if (internalFieldStore.input.value) {
      const value: Record<string, unknown> = {};
      for (const key in internalFieldStore.children) {
        value[key] = getFieldInput(internalFieldStore.children[key]);
      }
      return value;
    }
    return internalFieldStore.input.value;
  }

  return internalFieldStore.input.value;
}
