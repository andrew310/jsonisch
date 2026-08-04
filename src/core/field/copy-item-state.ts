import { batch, untrack } from "../framework";
import type { InternalFieldStore, InternalFormStore } from "../types";
import { initializeFieldStore } from "./initialize-field-store";

/**
 * Copies the deeply nested state (signal values) from one field store to
 * another: `elements`, `errors`, `startInput`, `input`, `isTouched`,
 * `isEdited`, `isDirty`, and for arrays `startItems` and `items`. This is
 * the state-transfer engine under `insert`, `remove` and `move` — errors
 * and dirty/touched flags travel with their row. `initialInput`,
 * `initialItems` and `initialElements` stay put: the reset target belongs
 * to the position, not the moving item.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param fromInternalFieldStore The source field store to copy from.
 * @param toInternalFieldStore The destination field store to copy to.
 */
export function copyItemState(
  internalFormStore: InternalFormStore,
  fromInternalFieldStore: InternalFieldStore,
  toInternalFieldStore: InternalFieldStore,
): void {
  batch(() => {
    // Untrack to avoid creating reactive dependencies during the copy
    untrack(() => {
      // Copy the elements reference so a registered DOM element follows its
      // row (the react adapter re-registers against the destination store)
      toInternalFieldStore.elements = fromInternalFieldStore.elements;
      toInternalFieldStore.validationErrors.value =
        fromInternalFieldStore.validationErrors.value;
      toInternalFieldStore.startInput.value =
        fromInternalFieldStore.startInput.value;
      toInternalFieldStore.input.value = fromInternalFieldStore.input.value;
      toInternalFieldStore.isTouched.value =
        fromInternalFieldStore.isTouched.value;
      toInternalFieldStore.isEdited.value =
        fromInternalFieldStore.isEdited.value;
      toInternalFieldStore.isDirty.value =
        fromInternalFieldStore.isDirty.value;

      // If both stores are arrays, copy array-specific state
      if (
        fromInternalFieldStore.kind === "array" &&
        toInternalFieldStore.kind === "array"
      ) {
        const fromItems = fromInternalFieldStore.items.value;
        toInternalFieldStore.startItems.value =
          fromInternalFieldStore.startItems.value;
        toInternalFieldStore.items.value = fromItems;

        for (let index = 0; index < fromItems.length; index++) {
          // Initialize a missing destination child before copying into it
          if (!toInternalFieldStore.children[index]) {
            toInternalFieldStore.children[index] = {} as InternalFieldStore;
            initializeFieldStore(
              internalFormStore,
              toInternalFieldStore.children[index],
              toInternalFieldStore.itemSchema,
              undefined,
              [...toInternalFieldStore.path, index],
            );
          }
          copyItemState(
            internalFormStore,
            fromInternalFieldStore.children[index],
            toInternalFieldStore.children[index],
          );
        }

        // Otherwise, if both stores are objects, copy each object property
      } else if (
        fromInternalFieldStore.kind === "object" &&
        toInternalFieldStore.kind === "object"
      ) {
        for (const key in fromInternalFieldStore.children) {
          copyItemState(
            internalFormStore,
            fromInternalFieldStore.children[key],
            toInternalFieldStore.children[key],
          );
        }
      }
    });
  });
}
