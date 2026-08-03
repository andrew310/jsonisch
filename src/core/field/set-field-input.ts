import { isPresenceEqual, isSemanticEqual } from "../dirty";
import { batch, createId, untrack } from "../framework";
import { readOwn } from "../schema-utils";
import type {
  InternalArrayStore,
  InternalFieldStore,
  InternalFormStore,
  InternalObjectStore,
  Path,
} from "../types";
import { getFieldStoreChain } from "./get-field-store";
import { initializeFieldStore } from "./initialize-field-store";
import { resetItemState } from "./reset-item-state";

/**
 * Recomputes a container's dirty flag from its presence sentinel (and, for
 * arrays, its item count) against the start baseline. Content changes live
 * on the children, not here.
 */
export function computeContainerDirty(
  internalFieldStore: InternalArrayStore | InternalObjectStore,
): boolean {
  const presenceDirty = !isPresenceEqual(
    internalFieldStore.startInput.value,
    internalFieldStore.input.value,
  );
  if (internalFieldStore.kind === "array") {
    return (
      presenceDirty ||
      internalFieldStore.startItems.value.length !==
        internalFieldStore.items.value.length
    );
  }
  return presenceDirty;
}

/**
 * Sets the input for a nested field store and all its children, updating
 * touched, edited and dirty states. Handles dynamic array resizing with
 * child-store reuse (a regrown index keeps its dirty baseline, so
 * shrink-then-regrow behaves exactly like a direct edit).
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The field store to update.
 * @param input The new input value.
 */
function setNestedInput(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  input: unknown,
): void {
  internalFieldStore.isTouched.value = true;
  internalFieldStore.isEdited.value = true;

  if (internalFieldStore.kind === "array") {
    // A truthy non-array input (e.g. an unparsed JSON string) must not be
    // spread element-by-element — treat it like the walk and reset do: a
    // present empty array
    const arrayInput = Array.isArray(input) ? input : [];
    const items = internalFieldStore.items.value;
    const length = arrayInput.length;

    // If new array is shorter, truncate items
    if (length < items.length) {
      internalFieldStore.items.value = items.slice(0, length);

      // Otherwise, if new array is longer, extend items
    } else if (length > items.length) {
      for (let index = items.length; index < length; index++) {
        // Reset the reused stale child but keep its start input as the
        // dirty baseline: a child store from a previously longer array
        // still holds stale errors and nested values that must be cleared,
        // but editing a regrown index must be detected as dirty just like a
        // direct edit on a never-shrunk array would be
        if (internalFieldStore.children[index]) {
          resetItemState(
            internalFormStore,
            internalFieldStore.children[index],
            arrayInput[index],
            true,
          );
        } else {
          internalFieldStore.children[index] = {} as InternalFieldStore;
          initializeFieldStore(
            internalFormStore,
            internalFieldStore.children[index],
            internalFieldStore.itemSchema,
            arrayInput[index],
            [...internalFieldStore.path, index],
          );
        }
      }
      internalFieldStore.items.value = [
        ...items,
        ...Array.from({ length: length - items.length }, () => createId()),
      ];
    }

    // Set input for each array item
    for (let index = 0; index < length; index++) {
      setNestedInput(
        internalFormStore,
        internalFieldStore.children[index],
        arrayInput[index],
      );
    }

    internalFieldStore.input.value = input == null ? input : true;
    internalFieldStore.isDirty.value =
      computeContainerDirty(internalFieldStore);
  } else if (internalFieldStore.kind === "object") {
    for (const key in internalFieldStore.children) {
      setNestedInput(
        internalFormStore,
        internalFieldStore.children[key],
        readOwn(input, key),
      );
    }

    internalFieldStore.input.value = input == null ? input : true;
    internalFieldStore.isDirty.value =
      computeContainerDirty(internalFieldStore);
  } else {
    internalFieldStore.input.value = input;

    // Semantic, empty-aware dirty compare (`null` ≡ `undefined` ≡ `""` ≡
    // `NaN`; deep equality for leaf array/object values)
    internalFieldStore.isDirty.value = !isSemanticEqual(
      input,
      internalFieldStore.startInput.value,
    );
  }
}

/**
 * Sets the input for the field at the specified path in the form store,
 * marking all parent containers along the way as present and recomputing
 * their presence dirtiness (a nullish container transitioned to present by
 * a nested set is a real change and must reach the dirty projections).
 *
 * @param internalFormStore The form store containing the field.
 * @param path The path to the field.
 * @param input The new input value.
 */
export function setFieldInput(
  internalFormStore: InternalFormStore,
  path: Path,
  input: unknown,
): void {
  batch(() => {
    // Untrack to avoid creating reactive dependencies during update
    untrack(() => {
      // One validated traversal — an undeclared path throws before any
      // state is touched
      const chain = getFieldStoreChain(internalFormStore, path);
      const target = chain[chain.length - 1];

      // Mark each container between the root (exclusive) and the target
      // (exclusive) as present
      for (let index = 1; index < chain.length - 1; index++) {
        const ancestor = chain[index];
        if (ancestor.kind === "value") continue;
        ancestor.input.value = true;
        ancestor.isDirty.value = computeContainerDirty(ancestor);
      }

      setNestedInput(internalFormStore, target, input);
    });
  });
}
