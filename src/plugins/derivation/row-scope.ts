import { getFieldInput } from "../../core/field/get-field-input";
import { readOwn } from "../../core/schema-utils";
import type {
  InternalFieldStore,
  InternalFormStore,
  InternalObjectStore,
  Path,
} from "../../core/types";
import { derivationKey } from "./key";

/**
 * Returns the INNERMOST array-item object store containing the field at the
 * given path, or `undefined` when the path is not inside an array row (a
 * root-level field, or a field under a plain nested object).
 *
 * Tolerant on purpose: an unresolvable segment stops the walk and returns
 * whatever row was found so far, so a stale path (a row removed mid-render)
 * degrades to a scope lookup instead of throwing.
 *
 * @param internalFormStore The form store.
 * @param path The path to the field.
 *
 * @returns The row store, or `undefined`.
 */
export function findRowStore(
  internalFormStore: InternalFormStore,
  path: Path,
): InternalObjectStore | undefined {
  let current: InternalFieldStore = internalFormStore;
  let row: InternalObjectStore | undefined;
  for (const segment of path) {
    if (current.kind === "object" && typeof segment === "string") {
      const child = readOwn(current.children, segment) as
        | InternalFieldStore
        | undefined;
      if (!child) return row;
      current = child;
    } else if (current.kind === "array" && typeof segment === "number") {
      const child: InternalFieldStore | undefined =
        current.children[segment];
      if (!child) return row;
      current = child;
      if (current.kind === "object") row = current;
    } else {
      return row;
    }
  }
  return row;
}

/**
 * Resolves a row's CANONICAL record: the server row from `offFormValues`
 * that carries the full column set (core columns the write model never
 * holds, plus the server's pre-evaluated derived values). The row's
 * collection is read by walking the row's own path into `offFormValues`
 * (`["assets", 0]` → `offFormValues.assets`), and the row is matched by
 * `id` — index is not identity, rows reorder.
 *
 * Reads signals (`offFormValues`, the row's `id` input), so callers get
 * re-resolution for free inside a computed.
 *
 * @param internalFormStore The form store.
 * @param rowStore The array-item object store.
 *
 * @returns The canonical row, or `undefined`.
 */
export function canonicalRowOf(
  internalFormStore: InternalFormStore,
  rowStore: InternalObjectStore,
): Record<string, unknown> | undefined {
  const path = rowStore.path;
  if (path.length < 2) return undefined;

  let collection: unknown = internalFormStore.offFormValues.value;
  for (let index = 0; index < path.length - 1; index++) {
    collection = readOwn(collection, path[index]);
    if (collection == null) return undefined;
  }
  if (!Array.isArray(collection)) return undefined;

  const idStore = readOwn(rowStore.children, "id") as
    | InternalFieldStore
    | undefined;
  const rowId = idStore ? getFieldInput(idStore) : undefined;
  return collection.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      (candidate as Record<string, unknown>).id === rowId,
  ) as Record<string, unknown> | undefined;
}

/**
 * Resolves a row-scope dependency once the LIVE row value is already in
 * hand — the precedence a per-row formula evaluates in:
 *
 *   1. the root-record alias (`form.rootRecordAlias`) from `offFormValues` (it
 *      wins outright: a row column named like the alias is never the
 *      root record),
 *   2. the live sibling value in the SAME row (an explicit `null` counts —
 *      only `undefined` means "the row does not hold this"),
 *   3. the canonical row's column.
 *
 * A row scope deliberately does NOT see root-level form fields or other
 * `offFormValues` keys: a row's formula is evaluated against its own record
 * plus the root record, exactly as the server evaluates it.
 *
 * @param internalFormStore The form store.
 * @param rowStore The array-item object store the formula lives in.
 * @param key The dependency identifier.
 * @param formValue The live value the row holds for `key`, or `undefined`.
 *
 * @returns The resolved value, or `undefined`.
 */
export function resolveRowFallback(
  internalFormStore: InternalFormStore,
  rowStore: InternalObjectStore,
  key: string,
  formValue: unknown,
): unknown {
  if (key === internalFormStore.rootRecordAlias) {
    const handle = readOwn(internalFormStore.offFormValues.value, key);
    if (handle && typeof handle === "object") return handle;
  }
  if (formValue !== undefined) return formValue;
  return readOwn(canonicalRowOf(internalFormStore, rowStore), key);
}

/**
 * Resolves a single identifier in the scope of a row: the same precedence
 * `buildDerivation` evaluates a row formula's dependencies in, with the
 * live sibling read derived-aware (a sibling formula resolves through its
 * own derived signal, so the read is always fresh; an erroring sibling
 * resolves `undefined`, never a stale number).
 *
 * @param internalFormStore The form store.
 * @param rowStore The array-item object store.
 * @param key The identifier to resolve.
 *
 * @returns The resolved value, or `undefined`.
 */
export function resolveRowScopeValue(
  internalFormStore: InternalFormStore,
  rowStore: InternalObjectStore,
  key: string,
): unknown {
  const child = readOwn(rowStore.children, key) as
    | InternalFieldStore
    | undefined;
  let formValue: unknown;
  if (child) {
    const slot =
      child.kind === "value"
        ? derivationKey.get(internalFormStore, child)
        : undefined;
    if (slot) {
      const state = slot.derived.value;
      formValue = state.error === null ? state.value : undefined;
    } else {
      formValue = getFieldInput(child);
    }
  }
  return resolveRowFallback(internalFormStore, rowStore, key, formValue);
}
