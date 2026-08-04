import { isEmptyish } from "../dirty";
import type {
  HybridCompanion,
  InternalHybridMeta,
  InternalMetaStore,
  InternalObjectStore,
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
 * Returns whether any root-level field's meta channel is dirty — the meta
 * side of the form's dirty aggregate (a mode flip with an unchanged value
 * must still enable Save, the janska hidden-descriptor behavior this
 * replaces).
 */
export function hasDirtyMeta(store: InternalObjectStore): boolean {
  for (const key in store.children) {
    const child = store.children[key];
    if (child.kind === "value" && child.meta?.isDirty.value) {
      return true;
    }
  }
  return false;
}
