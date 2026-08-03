import type { InternalFieldStore, InternalFormStore, Path } from "../types";

/**
 * Returns the chain of field stores along the specified path, from the form
 * root (inclusive) to the target field (inclusive). Throws on a path
 * segment that does not resolve to a declared field — the schema is the
 * allow-list, so navigating to an undeclared key is a caller bug, never a
 * silent no-op. Array segments are bounded by the CURRENT item count:
 * stale child stores kept past the end of a shrunk array (for baseline
 * reuse on regrow) are not addressable.
 *
 * @param internalFormStore The form store to traverse.
 * @param path The path to the field store.
 *
 * @returns The store chain, `[root, …, target]`.
 */
export function getFieldStoreChain(
  internalFormStore: InternalFormStore,
  path: Path,
): InternalFieldStore[] {
  let internalFieldStore: InternalFieldStore = internalFormStore;
  const chain: InternalFieldStore[] = [internalFieldStore];
  for (const key of path) {
    let child: InternalFieldStore | undefined;
    if (internalFieldStore.kind === "object" && typeof key === "string") {
      child = Object.prototype.hasOwnProperty.call(
        internalFieldStore.children,
        key,
      )
        ? internalFieldStore.children[key]
        : undefined;
    } else if (
      internalFieldStore.kind === "array" &&
      typeof key === "number" &&
      Number.isInteger(key) &&
      key >= 0 &&
      key < internalFieldStore.items.value.length
    ) {
      child = internalFieldStore.children[key];
    }
    if (!child) {
      throw new Error(
        `No field at path ${JSON.stringify(path)} — segment ${JSON.stringify(key)} is not declared in the schema`,
      );
    }
    internalFieldStore = child;
    chain.push(child);
  }
  return chain;
}

/**
 * Returns the field store at the specified path. See `getFieldStoreChain`
 * for the resolution and throw semantics.
 *
 * @param internalFormStore The form store to traverse.
 * @param path The path to the field store.
 *
 * @returns The field store.
 */
export function getFieldStore(
  internalFormStore: InternalFormStore,
  path: Path,
): InternalFieldStore {
  const chain = getFieldStoreChain(internalFormStore, path);
  return chain[chain.length - 1];
}
