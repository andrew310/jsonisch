import { copyItemState } from "../core/field/copy-item-state";
import { getFieldStoreChain } from "../core/field/get-field-store";
import { initializeFieldStore } from "../core/field/initialize-field-store";
import { parkItemState } from "../core/field/park-item-state";
import { resetItemState } from "../core/field/reset-item-state";
import { computeContainerDirty } from "../core/field/set-field-input";
import { swapItemState } from "../core/field/swap-item-state";
import { validateIfRequired } from "../core/form/validate-if-required";
import { batch, createId, untrack } from "../core/framework";
import type {
  InternalArrayStore,
  InternalFieldStore,
  InternalFormStore,
  Path,
} from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Resolves the array store at a path, marking every container between the
 * root and the array as present (an insert into a nullish ancestor is a
 * real change), and throws when the path does not resolve to an array
 * field.
 */
function resolveArrayStore(
  internalFormStore: InternalFormStore,
  path: Path,
): InternalArrayStore {
  const chain = getFieldStoreChain(internalFormStore, path);
  const target = chain[chain.length - 1];
  if (target.kind !== "array") {
    throw new Error(
      `Expected an array field at path ${JSON.stringify(path)}, got "${target.kind}"`,
    );
  }
  for (let index = 1; index < chain.length - 1; index++) {
    const ancestor = chain[index];
    if (ancestor.kind === "value") continue;
    ancestor.input.value = true;
    ancestor.isDirty.value = computeContainerDirty(ancestor);
  }
  return target;
}

/**
 * Configuration for inserting an array item.
 */
export interface InsertConfig {
  /**
   * The index to insert the new item at. Appends to the end when omitted.
   */
  readonly at?: number | undefined;
  /**
   * The initial input value for the new item.
   */
  readonly initialInput?: unknown;
}

/**
 * Inserts a new item into the array field at the given path. All items at
 * or after the insertion point shift up by one index, and their full state
 * (values, errors, touched/dirty flags, elements) shifts with them.
 *
 * @param form The form store containing the array field.
 * @param path The path to the array field.
 * @param config The insert configuration.
 */
export function insert(
  form: FormRef,
  path: Path,
  config?: InsertConfig,
): void {
  batch(() => {
    untrack(() => {
      const internalFormStore = internalOf(form);
      const internalArrayStore = resolveArrayStore(internalFormStore, path);
      const items = internalArrayStore.items.value;
      const insertIndex = config?.at ?? items.length;
      if (insertIndex < 0 || insertIndex > items.length) return;

      // Insert the new item ID at the specified index
      const newItems = [...items];
      newItems.splice(insertIndex, 0, createId());
      internalArrayStore.items.value = newItems;

      // Move the state of all children after the insertion point one index
      // up, initializing a missing tail slot
      for (let index = items.length; index > insertIndex; index--) {
        if (!internalArrayStore.children[index]) {
          internalArrayStore.children[index] = {} as InternalFieldStore;
          initializeFieldStore(
            internalFormStore,
            internalArrayStore.children[index],
            internalArrayStore.itemSchema,
            undefined,
            [...internalArrayStore.path, index],
          );
        }
        copyItemState(
          internalFormStore,
          internalArrayStore.children[index - 1],
          internalArrayStore.children[index],
        );
      }

      // Initialize or reset the freed slot with the new item's input
      if (!internalArrayStore.children[insertIndex]) {
        internalArrayStore.children[insertIndex] = {} as InternalFieldStore;
        initializeFieldStore(
          internalFormStore,
          internalArrayStore.children[insertIndex],
          internalArrayStore.itemSchema,
          config?.initialInput,
          [...internalArrayStore.path, insertIndex],
        );
      } else {
        resetItemState(
          internalFormStore,
          internalArrayStore.children[insertIndex],
          config?.initialInput,
        );
      }

      internalArrayStore.input.value = true;
      internalArrayStore.isTouched.value = true;
      internalArrayStore.isEdited.value = true;
      internalArrayStore.isDirty.value = true;

      validateIfRequired(internalFormStore, internalArrayStore, "input");
    });
  });
}

/**
 * Removes the item at the given index from the array field at the given
 * path. All items after it shift down by one index with their full state.
 *
 * @param form The form store containing the array field.
 * @param path The path to the array field.
 * @param at The index of the item to remove.
 */
export function remove(form: FormRef, path: Path, at: number): void {
  batch(() => {
    untrack(() => {
      const internalFormStore = internalOf(form);
      const internalArrayStore = resolveArrayStore(internalFormStore, path);
      const items = internalArrayStore.items.value;
      if (at < 0 || at > items.length - 1) return;

      // Remove the item ID from the items array
      const newItems = [...items];
      newItems.splice(at, 1);
      internalArrayStore.items.value = newItems;

      // Move the state of all children after the removed item one index down
      for (let index = at; index < items.length - 1; index++) {
        copyItemState(
          internalFormStore,
          internalArrayStore.children[index + 1],
          internalArrayStore.children[index],
        );
      }

      internalArrayStore.isTouched.value = true;
      internalArrayStore.isEdited.value = true;
      // Compare item identity, not just length, so remove-then-insert at
      // the same length stays dirty
      internalArrayStore.isDirty.value =
        internalArrayStore.startItems.value.join() !== newItems.join();

      validateIfRequired(internalFormStore, internalArrayStore, "input");
    });
  });
}

/**
 * Moves the item at one index to another within the array field at the
 * given path. All items between the two indices shift accordingly with
 * their full state.
 *
 * @param form The form store containing the array field.
 * @param path The path to the array field.
 * @param from The index of the item to move.
 * @param to The index to move the item to.
 */
export function move(
  form: FormRef,
  path: Path,
  from: number,
  to: number,
): void {
  batch(() => {
    untrack(() => {
      const internalFormStore = internalOf(form);
      const internalArrayStore = resolveArrayStore(internalFormStore, path);
      const items = internalArrayStore.items.value;
      if (
        from < 0 ||
        from > items.length - 1 ||
        to < 0 ||
        to > items.length - 1 ||
        from === to
      ) {
        return;
      }

      // Move the item ID in the items array
      const newItems = [...items];
      newItems.splice(to, 0, newItems.splice(from, 1)[0]);
      internalArrayStore.items.value = newItems;

      const tempStore = parkItemState(
        internalFormStore,
        internalArrayStore,
        internalArrayStore.children[from],
        from,
      );

      // Shift the state of the children between the two indices
      if (from < to) {
        for (let index = from; index < to; index++) {
          copyItemState(
            internalFormStore,
            internalArrayStore.children[index + 1],
            internalArrayStore.children[index],
          );
        }
      } else {
        for (let index = from; index > to; index--) {
          copyItemState(
            internalFormStore,
            internalArrayStore.children[index - 1],
            internalArrayStore.children[index],
          );
        }
      }

      // Land the parked state at the destination
      copyItemState(
        internalFormStore,
        tempStore,
        internalArrayStore.children[to],
      );

      internalArrayStore.isTouched.value = true;
      internalArrayStore.isEdited.value = true;
      internalArrayStore.isDirty.value =
        internalArrayStore.startItems.value.join() !== newItems.join();

      validateIfRequired(internalFormStore, internalArrayStore, "input");
    });
  });
}

/**
 * Swaps two items in the array field at the given path by exchanging their
 * positions and their full state.
 *
 * @param form The form store containing the array field.
 * @param path The path to the array field.
 * @param at The index of the first item.
 * @param and The index of the second item.
 */
export function swap(
  form: FormRef,
  path: Path,
  at: number,
  and: number,
): void {
  batch(() => {
    untrack(() => {
      const internalFormStore = internalOf(form);
      const internalArrayStore = resolveArrayStore(internalFormStore, path);
      const items = internalArrayStore.items.value;
      if (
        at < 0 ||
        at > items.length - 1 ||
        and < 0 ||
        and > items.length - 1 ||
        at === and
      ) {
        return;
      }

      // Swap the item IDs in the items array
      const newItems = [...items];
      const tempItemId = newItems[at];
      newItems[at] = newItems[and];
      newItems[and] = tempItemId;
      internalArrayStore.items.value = newItems;

      // Swap the child stores' full state
      swapItemState(
        internalFormStore,
        internalArrayStore.children[at],
        internalArrayStore.children[and],
      );

      internalArrayStore.isTouched.value = true;
      internalArrayStore.isEdited.value = true;
      internalArrayStore.isDirty.value =
        internalArrayStore.startItems.value.join() !== newItems.join();

      validateIfRequired(internalFormStore, internalArrayStore, "input");
    });
  });
}
