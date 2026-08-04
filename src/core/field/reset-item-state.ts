import { batch, createId } from "../framework";
import {
  containerPresence,
  readOwn,
  resolveValueInput,
} from "../schema-utils";
import type {
  FieldElement,
  InternalFieldStore,
  InternalFormStore,
} from "../types";
import { initializeFieldStore } from "./initialize-field-store";

/**
 * Resets the state of a field store (signal values) deeply. Clears
 * `elements`, `errors`, `isTouched`, `isEdited` and `isDirty`, and sets
 * `startInput`, `input`, `startItems` and `items` to the new input value.
 * Keeps `initialInput` and `initialItems` unchanged for form reset.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The field store to reset.
 * @param input The new input value.
 * @param keepStart Whether to keep `startInput` and `startItems` as the
 * dirty baseline instead of resetting them to the new input. Used when a
 * field store is reused for an in-place edit (array shrink-then-regrow) so
 * its dirty state stays detectable against the original baseline.
 */
export function resetItemState(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  input: unknown,
  keepStart = false,
): void {
  batch(() => {
    // Clear elements, keeping `initialElements` in sync while the store
    // still owns its elements (same reference). After a reorder moved
    // elements in, the original owner's `initialElements` must survive so
    // `reset` can restore it.
    const elements: FieldElement[] = [];
    if (internalFieldStore.elements === internalFieldStore.initialElements) {
      internalFieldStore.initialElements = elements;
    }
    internalFieldStore.elements = elements;
    internalFieldStore.validationErrors.value = null;
    internalFieldStore.isTouched.value = false;
    internalFieldStore.isEdited.value = false;
    internalFieldStore.isDirty.value = false;

    if (
      internalFieldStore.kind === "array" ||
      internalFieldStore.kind === "object"
    ) {
      const presence = containerPresence(internalFieldStore.isNullish, input);
      if (!keepStart) {
        internalFieldStore.startInput.value = presence;
      }
      internalFieldStore.input.value = presence;

      if (internalFieldStore.kind === "array") {
        if (Array.isArray(input)) {
          const newItems = input.map(() => createId());
          if (!keepStart) {
            internalFieldStore.startItems.value = newItems;
          }
          internalFieldStore.items.value = newItems;

          for (let index = 0; index < input.length; index++) {
            if (internalFieldStore.children[index]) {
              resetItemState(
                internalFormStore,
                internalFieldStore.children[index],
                input[index],
                keepStart,
              );
            } else {
              internalFieldStore.children[index] = {} as InternalFieldStore;
              initializeFieldStore(
                internalFormStore,
                internalFieldStore.children[index],
                internalFieldStore.itemSchema,
                input[index],
                [...internalFieldStore.path, index],
              );
            }
          }
        } else {
          if (!keepStart) {
            internalFieldStore.startItems.value = [];
          }
          internalFieldStore.items.value = [];
        }
      } else {
        for (const key in internalFieldStore.children) {
          resetItemState(
            internalFormStore,
            internalFieldStore.children[key],
            readOwn(input, key),
            keepStart,
          );
        }
      }
    } else {
      const valueInput = resolveValueInput(
        internalFormStore.emptyInput,
        internalFieldStore.schema,
        internalFieldStore.isNullish,
        input,
      );
      if (!keepStart) {
        internalFieldStore.startInput.value = valueInput;
      }
      internalFieldStore.input.value = valueInput;
    }
  });
}
