import { isPresenceEqual, isSemanticEqual } from "../dirty";
import { createId } from "../framework";
import { dispatchRebase, unwrapLeafInput } from "../plugin/driver";
import { containerPresence, readOwn, resolveValueInput } from "../schema-utils";
import type {
  InternalArrayStore,
  InternalFieldStore,
  InternalFormStore,
  JsonSchema,
} from "../types";
import { alignRows } from "./align-rows";
import { copyItemState } from "./copy-item-state";
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

    // An array item rebases its plugin state from its OWN fresh row object
    // (each envelope field's meta half rides the field key) — the row twin
    // of the root rebase dispatch in `applyBaseline`. Envelope leaves skip
    // the value rebase above; `adoptEnvelope` + `writeEnvelope` run here.
    if (
      typeof internalFieldStore.path[internalFieldStore.path.length - 1] ===
      "number"
    ) {
      dispatchRebase(internalFormStore, internalFieldStore, input);
    }

    internalFieldStore.isDirty.value = computeContainerDirty(
      internalFieldStore,
    );
  } else {
    // Envelope-control leaves adopt through the plugin (`adoptEnvelope`
    // then `writeEnvelope` once). Writing the number here would fork it
    // from the live envelope and last-write-wins the whole object.
    if (internalFormStore.pluginDriver.envelopes.has(internalFieldStore.control)) {
      return;
    }
    const newValue = resolveValueInput(
      internalFormStore.emptyInput,
      internalFieldStore.schema,
      internalFieldStore.isNullish,
      unwrapLeafInput(internalFormStore, internalFieldStore.control, input),
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
 * rows — by `id` when the item schema has usable ids, otherwise
 * positionally — KEEPING surviving item IDs so mounted rows preserve their
 * identity (react keys). Locally changed membership (insert, remove,
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

  const serverRowsById = indexServerRowsById(
    internalArrayStore.itemSchema,
    serverRows,
  );

  if (membershipClean && serverRowsById) {
    rebaseCleanMembershipById(
      internalFormStore,
      internalArrayStore,
      items,
      serverRows,
    );
  } else if (membershipClean) {
    rebaseCleanMembershipPositional(
      internalFormStore,
      internalArrayStore,
      items,
      serverRows,
    );
  } else if (serverRowsById) {
    const alignment = alignRows(
      items.map((_, index) => readItemId(internalArrayStore.children[index])),
      serverRows,
    );
    for (let index = 0; index < alignment.length; index++) {
      const fromLocalIndex = alignment[index].fromLocalIndex;
      if (fromLocalIndex == null) continue;
      rebaseFieldBaseline(
        internalFormStore,
        internalArrayStore.children[fromLocalIndex],
        serverRows[index],
      );
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
 * Clean membership, no usable ids: adopt server rows by index. Grown
 * slots are fresh baseline rows; surviving item IDs stay on their index.
 */
function rebaseCleanMembershipPositional(
  internalFormStore: InternalFormStore,
  internalArrayStore: InternalArrayStore,
  items: readonly string[],
  serverRows: unknown[],
): void {
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
}

/**
 * Clean membership with usable ids: grow/shrink to the server list, move
 * live row state onto the aligned indices, then rebase each child onto
 * that server row. Stores are position-fixed (`path` stays on the store)
 * — never `children[i] = oldChildren[j]`.
 */
function rebaseCleanMembershipById(
  internalFormStore: InternalFormStore,
  internalArrayStore: InternalArrayStore,
  items: readonly string[],
  serverRows: unknown[],
): void {
  const alignment = alignRows(
    items.map((_, index) => readItemId(internalArrayStore.children[index])),
    serverRows,
  );

  // Park every source before any dest write. A later dest can occupy a
  // source index (prepend, swap, shrink) and copyItemState would otherwise
  // clobber state still needed elsewhere.
  const parked = new Map<number, InternalFieldStore>();
  for (const { fromLocalIndex } of alignment) {
    if (fromLocalIndex == null || parked.has(fromLocalIndex)) continue;
    parked.set(
      fromLocalIndex,
      parkItemState(
        internalFormStore,
        internalArrayStore,
        internalArrayStore.children[fromLocalIndex],
        fromLocalIndex,
      ),
    );
  }

  for (let index = 0; index < serverRows.length; index++) {
    ensureItemStore(
      internalFormStore,
      internalArrayStore,
      index,
      serverRows[index],
    );
    const fromLocalIndex = alignment[index].fromLocalIndex;
    if (fromLocalIndex == null) {
      resetItemState(
        internalFormStore,
        internalArrayStore.children[index],
        serverRows[index],
      );
    } else {
      copyItemState(
        internalFormStore,
        parked.get(fromLocalIndex)!,
        internalArrayStore.children[index],
      );
    }
    rebaseFieldBaseline(
      internalFormStore,
      internalArrayStore.children[index],
      serverRows[index],
    );
  }

  const newItems = alignment.map(({ fromLocalIndex }) =>
    fromLocalIndex != null ? items[fromLocalIndex] : createId(),
  );
  internalArrayStore.items.value = newItems;
  internalArrayStore.startItems.value = newItems;
}

/**
 * Reads the live `id` of an object row, or `undefined` when the store has
 * no value-leaf `id` child.
 */
function readItemId(store: InternalFieldStore | undefined): unknown {
  if (store?.kind !== "object") return undefined;
  const idStore = store.children.id;
  return idStore?.kind === "value" ? idStore.input.value : undefined;
}

/**
 * A detached copy of one row's live state. The park store is walked at an
 * array-item path so plugin slots exist — transfer into a store without
 * them drops the row's envelope state.
 */
function parkItemState(
  internalFormStore: InternalFormStore,
  internalArrayStore: InternalArrayStore,
  source: InternalFieldStore,
  sourceIndex: number,
): InternalFieldStore {
  const parked = {} as InternalFieldStore;
  initializeFieldStore(
    internalFormStore,
    parked,
    internalArrayStore.itemSchema,
    undefined,
    [...internalArrayStore.path, sourceIndex],
  );
  copyItemState(internalFormStore, source, parked);
  return parked;
}

/**
 * Ensures a child store exists at `index` so a dest write has a home.
 * Existing stores are left as-is (live state is transferred or reset next).
 */
function ensureItemStore(
  internalFormStore: InternalFormStore,
  internalArrayStore: InternalArrayStore,
  index: number,
  input: unknown,
): void {
  if (internalArrayStore.children[index]) return;
  internalArrayStore.children[index] = {} as InternalFieldStore;
  initializeFieldStore(
    internalFormStore,
    internalArrayStore.children[index],
    internalArrayStore.itemSchema,
    input,
    [...internalArrayStore.path, index],
  );
}

/**
 * Indexes server rows by their `id` value when the item schema declares an
 * `id` property. Returns `undefined` when rows have no usable identity
 * (no declared `id`, or no row carries one) — clean membership stays
 * positional; dirty membership skips the id join.
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
