import { batch, untrack } from "../framework";
import { dispatchSwapField } from "../plugin/driver";
import type { InternalFieldStore, InternalFormStore } from "../types";
import { initializeFieldStore } from "./initialize-field-store";

/**
 * Swaps the deeply nested state (signal values) between two field stores:
 * `elements`, `errors`, `startInput`, `input`, `isTouched`, `isEdited`,
 * `isDirty`, and for arrays `startItems` and `items`. The state-transfer
 * engine under `swap` — errors and dirty/touched flags travel with their
 * row. `initialInput`, `initialItems` and `initialElements` stay put: the
 * reset target belongs to the position, not the moving item.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param firstInternalFieldStore The first field store to swap.
 * @param secondInternalFieldStore The second field store to swap.
 */
export function swapItemState(
  internalFormStore: InternalFormStore,
  firstInternalFieldStore: InternalFieldStore,
  secondInternalFieldStore: InternalFieldStore,
): void {
  batch(() => {
    // Untrack to avoid creating reactive dependencies during the swap
    untrack(() => {
      // Swap the elements references so registered DOM elements follow
      // their rows
      const tempElements = firstInternalFieldStore.elements;
      firstInternalFieldStore.elements = secondInternalFieldStore.elements;
      secondInternalFieldStore.elements = tempElements;

      const tempErrors = firstInternalFieldStore.validationErrors.value;
      firstInternalFieldStore.validationErrors.value =
        secondInternalFieldStore.validationErrors.value;
      secondInternalFieldStore.validationErrors.value = tempErrors;

      const tempStartInput = firstInternalFieldStore.startInput.value;
      firstInternalFieldStore.startInput.value =
        secondInternalFieldStore.startInput.value;
      secondInternalFieldStore.startInput.value = tempStartInput;

      const tempInput = firstInternalFieldStore.input.value;
      firstInternalFieldStore.input.value =
        secondInternalFieldStore.input.value;
      secondInternalFieldStore.input.value = tempInput;

      const tempIsTouched = firstInternalFieldStore.isTouched.value;
      firstInternalFieldStore.isTouched.value =
        secondInternalFieldStore.isTouched.value;
      secondInternalFieldStore.isTouched.value = tempIsTouched;

      const tempIsEdited = firstInternalFieldStore.isEdited.value;
      firstInternalFieldStore.isEdited.value =
        secondInternalFieldStore.isEdited.value;
      secondInternalFieldStore.isEdited.value = tempIsEdited;

      const tempIsDirty = firstInternalFieldStore.isDirty.value;
      firstInternalFieldStore.isDirty.value =
        secondInternalFieldStore.isDirty.value;
      secondInternalFieldStore.isDirty.value = tempIsDirty;

      // Per-field plugin state travels with its row (see `copyItemState`)
      if (
        firstInternalFieldStore.kind === "value" &&
        secondInternalFieldStore.kind === "value"
      ) {
        dispatchSwapField(
          internalFormStore,
          firstInternalFieldStore,
          secondInternalFieldStore,
        );
      }

      // If both stores are arrays, swap array-specific state
      if (
        firstInternalFieldStore.kind === "array" &&
        secondInternalFieldStore.kind === "array"
      ) {
        const firstItems = firstInternalFieldStore.items.value;
        const secondItems = secondInternalFieldStore.items.value;

        const tempStartItems = firstInternalFieldStore.startItems.value;
        firstInternalFieldStore.startItems.value =
          secondInternalFieldStore.startItems.value;
        secondInternalFieldStore.startItems.value = tempStartItems;

        firstInternalFieldStore.items.value = secondItems;
        secondInternalFieldStore.items.value = firstItems;

        // Swap children up to the longer of the two arrays, initializing
        // missing children where the shapes differ in length
        const maxLength = Math.max(firstItems.length, secondItems.length);
        for (let index = 0; index < maxLength; index++) {
          if (!firstInternalFieldStore.children[index]) {
            firstInternalFieldStore.children[index] = {} as InternalFieldStore;
            initializeFieldStore(
              internalFormStore,
              firstInternalFieldStore.children[index],
              firstInternalFieldStore.itemSchema,
              undefined,
              [...firstInternalFieldStore.path, index],
            );
          }
          if (!secondInternalFieldStore.children[index]) {
            secondInternalFieldStore.children[index] = {} as InternalFieldStore;
            initializeFieldStore(
              internalFormStore,
              secondInternalFieldStore.children[index],
              secondInternalFieldStore.itemSchema,
              undefined,
              [...secondInternalFieldStore.path, index],
            );
          }
          swapItemState(
            internalFormStore,
            firstInternalFieldStore.children[index],
            secondInternalFieldStore.children[index],
          );
        }

        // Otherwise, if both stores are objects, swap each object property
      } else if (
        firstInternalFieldStore.kind === "object" &&
        secondInternalFieldStore.kind === "object"
      ) {
        for (const key in firstInternalFieldStore.children) {
          swapItemState(
            internalFormStore,
            firstInternalFieldStore.children[key],
            secondInternalFieldStore.children[key],
          );
        }
      }
    });
  });
}
