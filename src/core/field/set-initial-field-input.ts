import { batch, createId } from "../framework";
import { unwrapLeafInput } from "../plugin/driver";
import { containerPresence, readOwn, resolveValueInput } from "../schema-utils";
import type { InternalFieldStore, InternalFormStore } from "../types";
import { initializeFieldStore } from "./initialize-field-store";

/**
 * Sets the initial input (the reset target) for a field store and all its
 * children recursively, initializing missing array children as needed.
 * Updates only `initialInput` and `initialItems` — `reset` moves them into
 * the live state. This is half of `applyBaseline`.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The field store to update.
 * @param initialInput The new initial input value.
 */
export function setInitialFieldInput(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  initialInput: unknown,
): void {
  batch(() => {
    if (internalFieldStore.kind === "array") {
      internalFieldStore.initialInput.value = containerPresence(
        internalFieldStore.isNullish,
        initialInput,
      );

      // Normalize a nullish input to an empty array for the walk below
      const initialArrayInput = Array.isArray(initialInput)
        ? initialInput
        : [];

      // If the initial input exceeds children capacity, initialize new
      // children so the reset target has a store to land in
      for (
        let index = internalFieldStore.children.length;
        index < initialArrayInput.length;
        index++
      ) {
        internalFieldStore.children[index] = {} as InternalFieldStore;
        initializeFieldStore(
          internalFormStore,
          internalFieldStore.children[index],
          internalFieldStore.itemSchema,
          initialArrayInput[index],
          [...internalFieldStore.path, index],
        );
      }

      // Mint new IDs for the initial items (a reset creates fresh rows)
      internalFieldStore.initialItems.value = Array.from(
        { length: initialArrayInput.length },
        () => createId(),
      );

      // Set the initial input for every existing child, clearing children
      // past the new length (their reset target is "not present")
      for (
        let index = 0;
        index < internalFieldStore.children.length;
        index++
      ) {
        setInitialFieldInput(
          internalFormStore,
          internalFieldStore.children[index],
          initialArrayInput[index],
        );
      }
    } else if (internalFieldStore.kind === "object") {
      internalFieldStore.initialInput.value = containerPresence(
        internalFieldStore.isNullish,
        initialInput,
      );

      for (const key in internalFieldStore.children) {
        setInitialFieldInput(
          internalFormStore,
          internalFieldStore.children[key],
          readOwn(initialInput, key),
        );
      }
    } else {
      // Fall back to the empty input for this field's type when no input is
      // provided so the reset target stays consistent with initialization
      internalFieldStore.initialInput.value = resolveValueInput(
        internalFormStore.emptyInput,
        internalFieldStore.schema,
        internalFieldStore.isNullish,
        unwrapLeafInput(
          internalFormStore,
          internalFieldStore.control,
          initialInput,
        ),
      );
    }
  });
}
