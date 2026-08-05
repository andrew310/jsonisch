import { isPresenceEqual, isSemanticEqual } from "../dirty";
import { createId } from "../framework";
import { containerPresence, readOwn, resolveValueInput } from "../schema-utils";
import type {
  InternalArrayStore,
  InternalFieldStore,
  InternalFormStore,
  JsonSchema,
} from "../types";
import { initializeFieldStore } from "./initialize-field-store";
import { resetItemState } from "./reset-item-state";
import { computeContainerDirty } from "./set-field-input";

/**
 * Rebases the live state of a field store and all its children onto a new
 * baseline value — the live half of `applyBaseline` (`setInitialFieldInput`
 * is the reset-target half and must run first): the dirty baseline
 * (`startInput`/`startItems`) always moves to the new value; the current
 * input moves with it only when the field was clean, so an in-flight edit
 * survives and is re-diffed against the new baseline (an edit equal to the
 * fresh server value becomes clean — semantic dirty rules apply).
 *
 * Callers must wrap in `batch` + `untrack` (like the reset internals).
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The field store to rebase.
 * @param input The new baseline value.
 */
export function rebaseFieldBaseline(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  input: unknown,
): void {
  if (internalFieldStore.kind === "array") {
    rebaseArrayBaseline(internalFormStore, internalFieldStore, input);
  } else if (internalFieldStore.kind === "object") {
    const presence = containerPresence(internalFieldStore.isNullish, input);
    const presenceClean = isPresenceEqual(
      internalFieldStore.startInput.value,
      internalFieldStore.input.value,
    );
    internalFieldStore.startInput.value = presence;
    if (presenceClean) {
      internalFieldStore.input.value = presence;
    }

    for (const key in internalFieldStore.children) {
      rebaseFieldBaseline(
        internalFormStore,
        internalFieldStore.children[key],
        readOwn(input, key),
      );
    }

    internalFieldStore.isDirty.value = computeContainerDirty(
      internalFieldStore,
    );
  } else {
    const newValue = resolveValueInput(
      internalFormStore.emptyInput,
      internalFieldStore.schema,
      internalFieldStore.isNullish,
      input,
    );
    const wasClean = isSemanticEqual(
      internalFieldStore.input.value,
      internalFieldStore.startInput.value,
    );
    internalFieldStore.startInput.value = newValue;
    if (wasClean) {
      internalFieldStore.input.value = newValue;
    }
    internalFieldStore.isDirty.value = !isSemanticEqual(
      internalFieldStore.input.value,
      newValue,
    );
  }
}

/**
 * The array half of the rebase. Membership (item identity) follows the same
 * clean-vs-dirty rule as values: unchanged membership adopts the server
 * rows positionally, KEEPING surviving item IDs so mounted rows preserve
 * their identity (react keys); locally changed membership (insert, remove,
 * reorder, presence flip) wins wholesale — the array stays dirty and only
 * rows matchable by a server `id` still rebase their content.
 */
function rebaseArrayBaseline(
  internalFormStore: InternalFormStore,
  internalArrayStore: InternalArrayStore,
  input: unknown,
): void {
  const presence = containerPresence(internalArrayStore.isNullish, input);
  const presenceClean = isPresenceEqual(
    internalArrayStore.startInput.value,
    internalArrayStore.input.value,
  );
  internalArrayStore.startInput.value = presence;
  if (presenceClean) {
    internalArrayStore.input.value = presence;
  }

  const serverRows = Array.isArray(input) ? input : [];
  const items = internalArrayStore.items.value;
  // Identity join catches length changes AND reorders (the array-ops dirty
  // convention) — a reordered array must not adopt rows positionally
  const membershipClean =
    presenceClean &&
    internalArrayStore.startItems.value.join() === items.join();

  if (membershipClean) {
    // Grown rows are fresh baseline rows: reuse a stale child store (cleared
    // deeply) or initialize a new one — either way they start clean
    for (let index = items.length; index < serverRows.length; index++) {
      if (internalArrayStore.children[index]) {
        resetItemState(
          internalFormStore,
          internalArrayStore.children[index],
          serverRows[index],
        );
      } else {
        internalArrayStore.children[index] = {} as InternalFieldStore;
        initializeFieldStore(
          internalFormStore,
          internalArrayStore.children[index],
          internalArrayStore.itemSchema,
          serverRows[index],
          [...internalArrayStore.path, index],
        );
      }
    }

    const shared = Math.min(items.length, serverRows.length);
    for (let index = 0; index < shared; index++) {
      rebaseFieldBaseline(
        internalFormStore,
        internalArrayStore.children[index],
        serverRows[index],
      );
    }

    const newItems = [
      ...items.slice(0, serverRows.length),
      ...Array.from(
        { length: Math.max(0, serverRows.length - items.length) },
        () => createId(),
      ),
    ];
    internalArrayStore.items.value = newItems;
    internalArrayStore.startItems.value = newItems;
  } else {
    const serverRowsById = indexServerRowsById(
      internalArrayStore.itemSchema,
      serverRows,
    );
    if (serverRowsById) {
      for (let index = 0; index < items.length; index++) {
        const child = internalArrayStore.children[index];
        if (child?.kind !== "object") continue;
        const idStore = child.children.id;
        const id = idStore?.kind === "value" ? idStore.input.value : undefined;
        const matched =
          id != null && id !== "" ? serverRowsById.get(id) : undefined;
        if (matched !== undefined) {
          rebaseFieldBaseline(internalFormStore, child, matched);
        }
      }
    }
  }

  internalArrayStore.isDirty.value =
    !isPresenceEqual(
      internalArrayStore.startInput.value,
      internalArrayStore.input.value,
    ) ||
    internalArrayStore.startItems.value.join() !==
      internalArrayStore.items.value.join();
}

/**
 * Indexes server rows by their `id` value when the item schema declares an
 * `id` property — the identity used to rebase row content inside a
 * locally-changed membership. Returns `undefined` when rows have no usable
 * identity (no declared `id`, or no row carries one).
 */
function indexServerRowsById(
  itemSchema: JsonSchema,
  serverRows: unknown[],
): Map<unknown, unknown> | undefined {
  if (!itemSchema.properties || itemSchema.properties.id === undefined) {
    return undefined;
  }
  const index = new Map<unknown, unknown>();
  for (const row of serverRows) {
    const id = readOwn(row, "id");
    if (id != null && id !== "" && !index.has(id)) {
      index.set(id, row);
    }
  }
  return index.size > 0 ? index : undefined;
}
