import { fieldIsOutput } from "../plugin/driver";
import type { InternalFieldStore, InternalFormStore } from "../types";

/**
 * Returns the current input of the field store. For arrays and objects,
 * recursively collects input from all children (the tree is the allow-list:
 * only declared fields can ever appear in the result). Returns `null` or
 * `undefined` for nullish container inputs, or the leaf value for value
 * fields.
 *
 * With a form store, object assembly additionally skips derived OUTPUT
 * leaves (`fieldIsOutput`) — the key is ABSENT from the projection, never
 * own-key `undefined` (issue #29: `JSON.stringify` hides the leak, but
 * `Object.keys`/`in`/spread consumers see it). Leaf reads stay raw either
 * way: asking for the output field itself returns its stored input.
 *
 * @param internalFieldStore The field store to get input from.
 * @param internalFormStore The form store — pass it to project OUTPUT
 * leaves out of object assembly; omit for raw tree reads (plugin scope
 * resolution, per-field snapshots).
 *
 * @returns The field input.
 */
export function getFieldInput(
  internalFieldStore: InternalFieldStore,
  internalFormStore?: InternalFormStore,
): unknown {
  if (internalFieldStore.kind === "array") {
    if (internalFieldStore.input.value) {
      const value = [];
      for (
        let index = 0;
        index < internalFieldStore.items.value.length;
        index++
      ) {
        value[index] = getFieldInput(
          internalFieldStore.children[index],
          internalFormStore,
        );
      }
      return value;
    }
    return internalFieldStore.input.value;
  }

  if (internalFieldStore.kind === "object") {
    if (internalFieldStore.input.value) {
      const value: Record<string, unknown> = {};
      for (const key in internalFieldStore.children) {
        const child = internalFieldStore.children[key];
        if (
          internalFormStore &&
          child.kind === "value" &&
          fieldIsOutput(internalFormStore, child)
        ) {
          continue;
        }
        value[key] = getFieldInput(child, internalFormStore);
      }
      return value;
    }
    return internalFieldStore.input.value;
  }

  return internalFieldStore.input.value;
}
