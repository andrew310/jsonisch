import { computed, createSignal } from "../framework";
import { readOwn } from "../schema-utils";
import type { Signal } from "../signal";
import type {
  DerivationMode,
  EntryMode,
  HybridCompanion,
  InternalHybridMeta,
  InternalObjectStore,
  InternalSourceMeta,
  InternalValueStore,
  SourceCompanion,
} from "../types";

/**
 * Reads a companion blob defensively: the wire is runtime DB data, so a
 * non-object blob decodes as an empty companion (janska's `?? {}`).
 */
function readCompanion(companions: unknown, key: string): Record<string, unknown> {
  const value = readOwn(companions, key);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Builds the meta channel over ONE object scope — the document root or a
 * single array row: every estimate child gets its `mode` signal (decoded
 * from the `<key>Source` companion) plus source meta, every
 * amount-or-percent child gets hybrid meta decoded from `<key>Hybrid`. Runs
 * before the scope's derivation graph, which reuses the mode signal for the
 * estimate pin.
 *
 * Scope is the ONLY difference between root and row (LOS-602). At the root
 * the companions come from the record's `data` bag through
 * `decodeCompanions`; inside a row they are FLAT SIBLING KEYS of the row
 * object itself (`{ totalProjectBudget: 5, totalProjectBudgetSource: {…} }`)
 * — the shape the nested write path already posts, and the shape LOS-573's
 * future `{value, source}` nesting folds away in one place.
 *
 * Initial mode of an estimate field: the companion wins — `manual` (or a
 * companion without a mode, janska's default) reopens as `estimate`,
 * `calculated` reopens as `formula` even though a value is persisted (the
 * materialized formula result — treating it as an estimate was the v1c
 * provisional gap). With NO companion the field opens as `estimate`
 * (manual-first, LOS-461) — the empty-estimate fall-through in derivation
 * keeps dependents on the formula until a real estimate is typed.
 *
 * Idempotent: called again on a REUSED store (an array shrink-then-regrow,
 * a rebased row) it re-seeds the existing signals in place instead of
 * replacing them, so computeds already wired to the mode signal keep
 * tracking it.
 *
 * @param objectStore The object scope to build the meta channel over.
 * @param companions The companion bag (root) or the row's own object value.
 */
export function buildMeta(
  objectStore: InternalObjectStore,
  companions: unknown,
): void {
  for (const key of Object.keys(objectStore.children)) {
    const child = objectStore.children[key];
    if (child.kind !== "value") continue;

    if (child.control === "estimate") {
      buildSourceMeta(child, readCompanion(companions, `${key}Source`));
    } else if (child.control === "amount-or-percent") {
      buildHybridMeta(child, readCompanion(companions, `${key}Hybrid`));
    }
  }
}

/**
 * Resolves the mode a `<key>Source` companion decodes to: the companion
 * wins; without one the field opens as `estimate` — janska's manual-first
 * default (LOS-461), so a fresh field is always typeable. The settled
 * LOS-515 rule keeps the modes honest without a heuristic: an EMPTY
 * estimate silently defers to the formula (derivation + server recompute
 * both fall through), and a typed estimate pins with a `manual` companion
 * on save.
 */
function resolveSourceMode(companion: SourceCompanion): DerivationMode {
  return companion.mode === "calculated" ? "formula" : "estimate";
}

/**
 * Resolves the entry state a `<key>Hybrid` companion decodes to, falling
 * back to the schema's declared default denominator.
 */
function resolveHybridEntry(
  companion: HybridCompanion,
  schema: InternalValueStore["schema"],
): { entryMode: EntryMode; percentBasis: string | undefined } {
  const schemaDefault = schema["x-hybrid-default-denominator"];
  return {
    entryMode: companion.mode === "bps" ? "percent" : "amount",
    percentBasis:
      typeof companion.denominator === "string"
        ? companion.denominator
        : typeof schemaDefault === "string" && schemaDefault !== ""
          ? schemaDefault
          : undefined,
  };
}

function buildSourceMeta(
  store: InternalValueStore,
  companion: SourceCompanion,
): void {
  const initialMode = resolveSourceMode(companion);

  // Reused store (array shrink-then-regrow, a row rebuilt from a fresh
  // record): re-seed the existing signals so the derived computed keeps
  // tracking the SAME mode signal it was wired to
  const existing = store.meta?.family === "source" ? store.meta : undefined;
  if (existing && store.mode) {
    existing.startCompanion = companion;
    existing.startMode.value = initialMode;
    store.mode.value = initialMode;
    existing.manualValue.value = companion.manualValue ?? null;
    existing.lastFlippedAt.value = undefined;
    return;
  }

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
  const { entryMode: initialEntryMode, percentBasis: initialBasis } =
    resolveHybridEntry(companion, store.schema);

  // Reused store — re-seed in place (see `buildSourceMeta`)
  const existing = store.meta?.family === "hybrid" ? store.meta : undefined;
  if (existing) {
    existing.entryMode.value = initialEntryMode;
    existing.startEntryMode.value = initialEntryMode;
    existing.percentBasis.value = initialBasis;
    existing.startPercentBasis.value = initialBasis;
    return;
  }

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

/**
 * Rebases the meta channel onto freshly decoded companions — the meta half
 * of `applyBaseline`, following the same clean-vs-dirty rule as values: the
 * decode-time baselines (`startCompanion`, `startMode`, `startEntryMode`,
 * `startPercentBasis`) always move to the fresh companion; the live signals
 * move with them only when they were clean, so a user's in-session mode
 * flip or entry-state change survives (and becomes clean when it matches
 * the fresh companion — the dirty computeds re-diff automatically).
 *
 * Runs AFTER the value rebase (the companion-less mode heuristic reads the
 * rebased baseline value). Callers must wrap in `batch` + `untrack`.
 *
 * Scope-agnostic like `buildMeta`: at the root `companions` is the decoded
 * companion bag, inside a row it is the fresh row object (whose companions
 * are flat sibling keys).
 *
 * @param objectStore The object scope to rebase the meta channel of.
 * @param companions The fresh companion bag (root) or row object.
 */
export function rebaseMeta(
  objectStore: InternalObjectStore,
  companions: unknown,
): void {
  for (const key of Object.keys(objectStore.children)) {
    const child = objectStore.children[key];
    if (child.kind !== "value" || !child.meta) continue;

    if (child.meta.family === "source") {
      rebaseSourceMeta(child, child.meta, readCompanion(companions, `${key}Source`));
    } else {
      rebaseHybridMeta(child, child.meta, readCompanion(companions, `${key}Hybrid`));
    }
  }
}

function rebaseSourceMeta(
  store: InternalValueStore,
  meta: InternalSourceMeta,
  companion: SourceCompanion,
): void {
  const mode = store.mode!;
  const newMode = resolveSourceMode(companion);
  const modeClean = mode.value === meta.startMode.value;

  meta.startCompanion = companion;
  meta.startMode.value = newMode;
  if (modeClean) {
    mode.value = newMode;
    meta.manualValue.value = companion.manualValue ?? null;
    meta.lastFlippedAt.value = undefined;
  }
}

function rebaseHybridMeta(
  store: InternalValueStore,
  meta: InternalHybridMeta,
  companion: HybridCompanion,
): void {
  const { entryMode, percentBasis } = resolveHybridEntry(companion, store.schema);

  if (meta.entryMode.value === meta.startEntryMode.value) {
    meta.entryMode.value = entryMode;
  }
  meta.startEntryMode.value = entryMode;

  if (meta.percentBasis.value === meta.startPercentBasis.value) {
    meta.percentBasis.value = percentBasis;
  }
  meta.startPercentBasis.value = percentBasis;
}

/**
 * Copies one field's meta channel onto another — the meta half of
 * `copyItemState`, so a row's estimate/entry state travels with the row
 * through an insert, remove or move. The serialization baselines
 * (`startCompanion`, `startMode`, `startEntryMode`, `startPercentBasis`)
 * move with the live state, exactly like `startInput` does: the dirty
 * baseline belongs to the moving item, not the position.
 *
 * A no-op unless both stores carry the same meta family (a mismatched pair
 * can only come from a shape divergence, and meta is not transferable then).
 *
 * @param from The source value store.
 * @param to The destination value store.
 */
export function copyMetaState(
  from: InternalValueStore,
  to: InternalValueStore,
): void {
  const source = from.meta;
  const target = to.meta;
  if (!source || !target || source.family !== target.family) return;

  if (source.family === "source" && target.family === "source") {
    target.startCompanion = source.startCompanion;
    target.startMode.value = source.startMode.value;
    target.manualValue.value = source.manualValue.value;
    target.lastFlippedAt.value = source.lastFlippedAt.value;
    if (from.mode && to.mode) to.mode.value = from.mode.value;
  } else if (source.family === "hybrid" && target.family === "hybrid") {
    target.entryMode.value = source.entryMode.value;
    target.startEntryMode.value = source.startEntryMode.value;
    target.percentBasis.value = source.percentBasis.value;
    target.startPercentBasis.value = source.startPercentBasis.value;
  }
}

/**
 * Swaps two fields' meta channels — the meta half of `swapItemState` (see
 * `copyMetaState` for the baseline-moves-with-the-item rule).
 *
 * @param first The first value store.
 * @param second The second value store.
 */
export function swapMetaState(
  first: InternalValueStore,
  second: InternalValueStore,
): void {
  const a = first.meta;
  const b = second.meta;
  if (!a || !b || a.family !== b.family) return;

  if (a.family === "source" && b.family === "source") {
    const companion = a.startCompanion;
    a.startCompanion = b.startCompanion;
    b.startCompanion = companion;
    swapSignals(a.startMode, b.startMode);
    swapSignals(a.manualValue, b.manualValue);
    swapSignals(a.lastFlippedAt, b.lastFlippedAt);
    if (first.mode && second.mode) swapSignals(first.mode, second.mode);
  } else if (a.family === "hybrid" && b.family === "hybrid") {
    swapSignals(a.entryMode, b.entryMode);
    swapSignals(a.startEntryMode, b.startEntryMode);
    swapSignals(a.percentBasis, b.percentBasis);
    swapSignals(a.startPercentBasis, b.startPercentBasis);
  }
}

/**
 * Swaps the values of two signals of the same type.
 */
function swapSignals<T>(first: Signal<T>, second: Signal<T>): void {
  const value = first.value;
  first.value = second.value;
  second.value = value;
}
