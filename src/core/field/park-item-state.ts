import type {
  InternalArrayStore,
  InternalFieldStore,
  InternalFormStore,
} from "../types";
import { copyItemState } from "./copy-item-state";
import { initializeFieldStore } from "./initialize-field-store";

/**
 * Path must be the item path or envelope slots are not built (LOS-596).
 */
export function parkItemState(
  form: InternalFormStore,
  array: InternalArrayStore,
  source: InternalFieldStore,
  sourceIndex: number,
): InternalFieldStore {
  const parked = {} as InternalFieldStore;
  initializeFieldStore(
    form,
    parked,
    array.itemSchema,
    undefined,
    [...array.path, sourceIndex],
  );
  copyItemState(form, source, parked);
  return parked;
}
