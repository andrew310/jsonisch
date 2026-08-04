import { isEmptyish } from "../dirty";
import { computed, createSignal, untrack } from "../framework";
import { readOwn } from "../schema-utils";
import type {
  DerivationMode,
  EntryMode,
  HybridCompanion,
  InternalFormStore,
  InternalValueStore,
  SourceCompanion,
} from "../types";

/**
 * Reads a companion blob defensively: the wire is runtime DB data, so a
 * non-object blob decodes as an empty companion (janska's `?? {}`).
 */
function readCompanion(
  companions: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> {
  const value = readOwn(companions, key);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Builds the meta channel over a walked form store: every root-level
 * estimate field gets its `mode` signal (decoded from the `<key>Source`
 * companion) plus source meta, every root-level amount-or-percent field
 * gets hybrid meta decoded from `<key>Hybrid`. Runs before
 * `buildDerivation`, which reuses the mode signal for the estimate pin.
 *
 * Initial mode of an estimate field: the companion wins — `manual` (or a
 * companion without a mode, janska's default) reopens as `estimate`,
 * `calculated` reopens as `formula` even though a value is persisted (the
 * materialized formula result — treating it as an estimate was the v1c
 * provisional gap). With NO companion the value-presence heuristic decides
 * (a field starting with a value holds it as the estimate, an empty one
 * computes) — mirroring the server recompute's own defaulting for
 * companion-less fields, so client mode and server write behavior agree.
 *
 * Root-level only, the same boundary as derivation: janska's stage form is
 * flat, and row-level companions ride the row-partition save path, not the
 * form store.
 */
export function buildMeta(
  internalFormStore: InternalFormStore,
  companions: Record<string, unknown> | undefined,
): void {
  for (const key of Object.keys(internalFormStore.children)) {
    const child = internalFormStore.children[key];
    if (child.kind !== "value") continue;

    if (child.control === "estimate") {
      buildSourceMeta(child, readCompanion(companions, `${key}Source`));
    } else if (child.control === "amount-or-percent") {
      buildHybridMeta(child, readCompanion(companions, `${key}Hybrid`));
    }
  }
}

function buildSourceMeta(
  store: InternalValueStore,
  companion: SourceCompanion,
): void {
  const initialMode: DerivationMode =
    companion.mode === "calculated"
      ? "formula"
      : companion.mode === "manual" || Object.keys(companion).length > 0
        ? "estimate"
        : untrack(() => (isEmptyish(store.input.value) ? "formula" : "estimate"));

  const mode = createSignal<DerivationMode>(initialMode);
  const startMode = createSignal<DerivationMode>(initialMode);
  store.mode = mode;

  const isDirty = computed<boolean>(
    () =>
      mode.value !== startMode.value ||
      // janska writes `manualValue` into the companion on every estimate
      // keystroke — an estimate value edit dirties the companion with it
      (mode.value === "estimate" && store.isDirty.value),
  );

  store.meta = {
    family: "source",
    startCompanion: companion,
    startMode,
    manualValue: createSignal<unknown>(companion.manualValue ?? null),
    lastFlippedAt: createSignal<string | undefined>(undefined),
    isDirty,
  };
}

function buildHybridMeta(
  store: InternalValueStore,
  companion: HybridCompanion,
): void {
  const schemaDefault = store.schema["x-hybrid-default-denominator"];
  const initialEntryMode: EntryMode =
    companion.mode === "bps" ? "percent" : "amount";
  const initialBasis =
    typeof companion.denominator === "string"
      ? companion.denominator
      : typeof schemaDefault === "string" && schemaDefault !== ""
        ? schemaDefault
        : undefined;

  const entryMode = createSignal<EntryMode>(initialEntryMode);
  const startEntryMode = createSignal<EntryMode>(initialEntryMode);
  const percentBasis = createSignal<string | undefined>(initialBasis);
  const startPercentBasis = createSignal<string | undefined>(initialBasis);

  store.meta = {
    family: "hybrid",
    entryMode,
    startEntryMode,
    percentBasis,
    startPercentBasis,
    isDirty: computed<boolean>(
      () =>
        entryMode.value !== startEntryMode.value ||
        percentBasis.value !== startPercentBasis.value,
    ),
  };
}
