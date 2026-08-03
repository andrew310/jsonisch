import { getFieldBool } from "../core/field/get-field-bool";
import { getFieldStore } from "../core/field/get-field-store";
import type { InternalFieldStore, Path } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Returns the paths to the dirty fields of the form (or of the subtree at
 * the given path). Arrays are treated as atomic and contribute only their
 * own path if any item is dirty; object branches are recursed into, and a
 * container that flipped dirty itself (e.g. nullish → present) emits its
 * own path only when no descendant already covers it.
 *
 * @param form The form store to inspect.
 * @param path The path to scope to (omit for the whole form).
 *
 * @returns The list of paths to the dirty fields.
 */
export function getDirtyPaths(form: FormRef, path?: Path): Path[] {
  const internal = internalOf(form);
  const paths: Path[] = [];
  collectDirtyPaths(path ? getFieldStore(internal, path) : internal, paths);
  return paths;
}

function collectDirtyPaths(
  internalFieldStore: InternalFieldStore,
  paths: Path[],
): void {
  if (
    internalFieldStore.kind === "object" &&
    internalFieldStore.input.value
  ) {
    // The recursion already prunes clean subtrees, so no per-child
    // pre-check is needed
    const lengthBefore = paths.length;
    for (const key in internalFieldStore.children) {
      collectDirtyPaths(internalFieldStore.children[key], paths);
    }

    // If no descendant emitted a path but the object itself flipped dirty
    // (e.g. transitioned from nullish to present), emit the object's own
    // path so the change isn't silently dropped
    if (
      paths.length === lengthBefore &&
      internalFieldStore.isDirty.value &&
      internalFieldStore.path.length > 0
    ) {
      paths.push([...internalFieldStore.path]);
    }
  } else if (internalFieldStore.kind === "value") {
    if (
      internalFieldStore.isDirty.value &&
      internalFieldStore.path.length > 0
    ) {
      paths.push([...internalFieldStore.path]);
    }
  } else if (
    getFieldBool(internalFieldStore, "isDirty") &&
    internalFieldStore.path.length > 0
  ) {
    // Arrays (and cleared objects) are atomic — one path for the whole
    // subtree
    paths.push([...internalFieldStore.path]);
  }
}
