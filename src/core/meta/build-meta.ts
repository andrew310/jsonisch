import { computed, createSignal } from "../framework";
import { readOwn } from "../schema-utils";
import type {
  DerivationMode,
  EntryMode,
  HybridCompanion,
  InternalFormStore,
  InternalHybridMeta,
  InternalSourceMeta,
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
 * provisional gap). With NO companion the field opens as `estimate`
 * (manual-first, LOS-461) — the empty-estimate fall-through in derivation
 * keeps dependents on the formula until a real estimate is typed.
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
 */
export function rebaseMeta(
  internalFormStore: InternalFormStore,
  companions: Record<string, unknown> | undefined,
): void {
  for (const key of Object.keys(internalFormStore.children)) {
    const child = internalFormStore.children[key];
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
