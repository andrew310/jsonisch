import { isEmptyish } from "../dirty";
import type {
  HybridCompanion,
  InternalFieldStore,
  InternalHybridMeta,
  InternalMetaStore,
  InternalSourceMeta,
  InternalValueStore,
  SourceCompanion,
} from "../types";

/**
 * The wire suffix of a meta family (`<key>Source` / `<key>Hybrid`).
 */
export function metaSuffix(meta: InternalMetaStore): "Source" | "Hybrid" {
  return meta.family === "source" ? "Source" : "Hybrid";
}

/**
 * Serializes a field's meta state into its companion wire blob —
 * byte-compatible with what janska writes for the same interactions
 * (`buildNextSourceMeta` / `persistHybridMeta` are the reference
 * implementations). Call when the meta channel is dirty; the result is the
 * `<key>Source`/`<key>Hybrid` value in the dirty payload.
 */
export function encodeCompanion(store: InternalValueStore): unknown {
  const meta = store.meta!;
  return meta.family === "source"
    ? encodeSource(store, meta)
    : encodeHybrid(meta);
}

/**
 * The `<key>Source` wire: `mode` always present (legacy names),
 * `manualValue` always present (`null` when nothing was ever typed — the
 * janska `?? null` fallback), `lastFlippedAt` only when the mode flipped
 * this session or the decoded companion already carried one.
 */
function encodeSource(
  store: InternalValueStore,
  meta: InternalSourceMeta,
): SourceCompanion {
  const mode = store.mode!.value;
  const wire: SourceCompanion = {
    mode: mode === "formula" ? "calculated" : "manual",
    // In estimate mode an EDITED input is the manual value (janska mirrors
    // keystrokes into the companion — never the loaded column value); an
    // unedited one carries the decoded `manualValue` forward. In formula
    // mode the value preserved at flip time carries forward.
    manualValue:
      mode === "estimate"
        ? store.isDirty.value
          ? isEmptyish(store.input.value)
            ? null
            : store.input.value
          : (meta.startCompanion.manualValue ?? null)
        : (meta.manualValue.value ?? null),
  };
  const flippedAt = meta.lastFlippedAt.value ?? meta.startCompanion.lastFlippedAt;
  if (flippedAt !== undefined) {
    wire.lastFlippedAt = flippedAt;
  }
  return wire;
}

/**
 * The `<key>Hybrid` wire: entry state only, both keys always present —
 * janska emits the schema default (or `""` without one) for the
 * denominator, never omits it.
 */
function encodeHybrid(meta: InternalHybridMeta): HybridCompanion {
  return {
    mode: meta.entryMode.value === "percent" ? "bps" : "fixed_amount",
    denominator: meta.percentBasis.value ?? "",
  };
}

/**
 * Returns whether any field's meta channel in the subtree is dirty — the
 * meta side of the form's dirty aggregate (a mode flip with an unchanged
 * value must still enable Save, the janska hidden-descriptor behavior this
 * replaces). Reaches into array rows (LOS-602): a row estimate's mode flip
 * is a real change, and nothing else in the store records it.
 *
 * Reads array `items` (not the raw `children`, which may hold stale stores
 * past the end after a shrink), so a reactive caller subscribes to
 * structural changes like `walkFieldStore` does.
 *
 * @param store The field store to inspect.
 *
 * @returns Whether any meta channel in the subtree is dirty.
 */
export function hasDirtyMeta(store: InternalFieldStore): boolean {
  if (store.kind === "value") {
    return Boolean(store.meta?.isDirty.value);
  }
  if (store.kind === "array") {
    const length = store.items.value.length;
    for (let index = 0; index < length; index++) {
      const child = store.children[index];
      if (child && hasDirtyMeta(child)) return true;
    }
    return false;
  }
  for (const key in store.children) {
    if (hasDirtyMeta(store.children[key])) return true;
  }
  return false;
}

/**
 * Returns `value` with the dirty companions of `store`'s subtree merged in
 * as flat sibling keys INSIDE their own row object — the row half of the
 * companion wire (LOS-602):
 *
 * ```jsonc
 * // dirty payload for a formula/estimate field inside an assets row
 * { "assets": [{ "id": "a1", "totalProjectBudget": 500000,
 *                "totalProjectBudgetSource": { "mode": "manual", … } }] }
 * ```
 *
 * The same convention as the root (`<key>Source`/`<key>Hybrid` next to
 * `<key>`), just scoped to the row object — which is what the row-partition
 * save path already reads, and what LOS-573's `{value, source}` nesting
 * will fold away in one place.
 *
 * Copies only the branches that gain a key; `value` is never mutated, so it
 * is safe over a caller-supplied value (`pickDirty`).
 *
 * @param store The field store the value was produced from.
 * @param value The value to merge companions into.
 *
 * @returns The value with row companions merged in.
 */
export function withRowCompanions(
  store: InternalFieldStore | undefined,
  value: unknown,
): unknown {
  if (!store || !hasDirtyMeta(store)) return value;

  if (store.kind === "array" && Array.isArray(value)) {
    return value.map((item, index) =>
      withRowCompanions(store.children[index], item),
    );
  }

  if (
    store.kind === "object" &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const row = { ...(value as Record<string, unknown>) };
    for (const key in store.children) {
      const child = store.children[key];
      if (child.kind === "value") {
        if (child.meta?.isDirty.value) {
          row[`${key}${metaSuffix(child.meta)}`] = encodeCompanion(child);
        }
      } else if (Object.prototype.hasOwnProperty.call(row, key)) {
        row[key] = withRowCompanions(child, row[key]);
      }
    }
    return row;
  }

  return value;
}
