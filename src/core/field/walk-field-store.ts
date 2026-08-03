import type { InternalFieldStore } from "../types";

/**
 * Walks through the field store and all nested children, calling the
 * callback for each field store in depth-first order. The callback may
 * return `true` to stop the walk early, in which case `walkFieldStore`
 * returns `true` as well.
 *
 * The walk reads array `items` reactively, so a reactive caller subscribes
 * to structural changes naturally. Imperative callers that must not
 * subscribe should wrap the call in `untrack`.
 *
 * @param internalFieldStore The field store to walk.
 * @param callback The callback to invoke for each field store. Return `true` to stop the walk early.
 *
 * @returns Whether the walk was stopped early by the callback.
 */
export function walkFieldStore(
  internalFieldStore: InternalFieldStore,
  callback: (internalFieldStore: InternalFieldStore) => boolean | void,
): boolean {
  if (callback(internalFieldStore)) {
    return true;
  }
  if (internalFieldStore.kind === "array") {
    for (
      let index = 0;
      index < internalFieldStore.items.value.length;
      index++
    ) {
      if (walkFieldStore(internalFieldStore.children[index], callback)) {
        return true;
      }
    }
  } else if (internalFieldStore.kind === "object") {
    for (const key in internalFieldStore.children) {
      if (walkFieldStore(internalFieldStore.children[key], callback)) {
        return true;
      }
    }
  }
  return false;
}
