import { isEmptyish } from "../../core/dirty";
import { computed, createSignal } from "../../core/framework";
import type { JsonischPlugin, PluginCtx } from "../../core/plugin/types";
import { readOwn } from "../../core/schema-utils";
import { setEntryMode, setPercentBasis } from "../../methods/set-entry";
import { setMode } from "../../methods/set-mode";
import type {
  DerivationMode,
  InternalFieldStore,
  InternalObjectStore,
  InternalValueStore,
} from "../../core/types";
import { envelopesKey } from "./key";
import { envelopesWire, wrapEstimate, wrapHybrid } from "./wire";
import type {
  EnvelopeSlot,
  EntryMeta,
  EntryMode,
  HybridSlot,
  SourceMeta,
  SourceSlot,
} from "./types";

/**
 * The envelopes plugin's state: one slot per estimate/amount-or-percent
 * value store, keyed by store identity.
 */
export type EnvelopeState = Map<InternalFieldStore, EnvelopeSlot>;

/**
 * Reads a field's meta half out of its scope's raw value: the raw is the
 * decoded record at the root and the row's own object inside an array —
 * one convention at every depth, because the envelope rides the field key
 * itself (`myField: { kind, value?, mode, … }`).
 */
function rawMetaOf(raw: unknown, key: string): Record<string, unknown> {
  return envelopesWire.unwrap!(readOwn(raw, key)).meta;
}

/**
 * Resolves the mode a persisted estimate meta decodes to: the persisted
 * meta wins; without one the field opens as `estimate` — the manual-first
 * default (LOS-461), so a fresh field is always typeable. An EMPTY
 * estimate silently defers to the formula (derivation + server recompute
 * both fall through), and a typed estimate pins with `mode: "estimate"`
 * on save.
 */
function resolveSourceMode(meta: SourceMeta): DerivationMode {
  return meta.mode === "formula" ? "formula" : "estimate";
}

/**
 * Resolves the entry state a persisted hybrid meta decodes to, falling
 * back to the schema's declared default denominator.
 */
function resolveHybridEntry(
  meta: EntryMeta,
  schema: InternalValueStore["schema"],
): { entryMode: EntryMode; percentBasis: string | undefined } {
  const schemaDefault = schema["x-hybrid-default-denominator"];
  return {
    entryMode: meta.mode === "percent" ? "percent" : "amount",
    percentBasis:
      typeof meta.basis === "string"
        ? meta.basis
        : typeof schemaDefault === "string" && schemaDefault !== ""
          ? schemaDefault
          : undefined,
  };
}

/**
 * Builds (or re-seeds) the slots of ONE object scope — the document root
 * or a single array row. Idempotent: called again on a REUSED store (an
 * array shrink-then-regrow, a rebuilt row) it re-seeds the existing
 * signals in place instead of replacing them, so computeds already wired
 * to the mode signal keep tracking it.
 */
function buildScopeSlots(
  state: EnvelopeState,
  scope: InternalObjectStore,
  raw: unknown,
): void {
  for (const key of Object.keys(scope.children)) {
    const child = scope.children[key];
    if (child.kind !== "value") continue;

    if (child.control === "estimate") {
      buildSourceSlot(state, child, rawMetaOf(raw, key) as SourceMeta);
    } else if (child.control === "amount-or-percent") {
      buildHybridSlot(state, child, rawMetaOf(raw, key) as EntryMeta);
    }
  }
}

function buildSourceSlot(
  state: EnvelopeState,
  store: InternalValueStore,
  meta: SourceMeta,
): void {
  const initialMode = resolveSourceMode(meta);

  const existing = state.get(store);
  if (existing?.family === "source") {
    existing.startMeta = meta;
    existing.startMode.value = initialMode;
    existing.mode.value = initialMode;
    existing.manualValue.value = meta.manualValue ?? null;
    existing.lastFlippedAt.value = undefined;
    return;
  }

  const mode = createSignal<DerivationMode>(initialMode);
  const startMode = createSignal<DerivationMode>(initialMode);

  const slot: SourceSlot = {
    family: "source",
    mode,
    startMode,
    manualValue: createSignal<unknown>(meta.manualValue ?? null),
    lastFlippedAt: createSignal<string | undefined>(undefined),
    startMeta: meta,
    isDirty: computed<boolean>(
      () =>
        mode.value !== startMode.value ||
        // An estimate keystroke mirrors into the meta half — a value edit
        // in estimate mode dirties the meta with it
        (mode.value === "estimate" && store.isDirty.value),
    ),
  };
  state.set(store, slot);
}

function buildHybridSlot(
  state: EnvelopeState,
  store: InternalValueStore,
  meta: EntryMeta,
): void {
  const { entryMode: initialEntryMode, percentBasis: initialBasis } =
    resolveHybridEntry(meta, store.schema);

  const existing = state.get(store);
  if (existing?.family === "hybrid") {
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

  const slot: HybridSlot = {
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
  state.set(store, slot);
}

/**
 * Rebases one scope's slots onto fresh raw data — the meta half of
 * `applyBaseline`, following the same clean-vs-dirty rule as values: the
 * decode-time baselines always move to the fresh meta; the live signals
 * move with them only when they were clean, so a user's in-session mode
 * flip or entry-state change survives a save round-trip.
 */
function rebaseScopeSlots(
  state: EnvelopeState,
  scope: InternalObjectStore,
  raw: unknown,
): void {
  for (const key of Object.keys(scope.children)) {
    const child = scope.children[key];
    if (child.kind !== "value") continue;
    const slot = state.get(child);
    if (!slot) continue;

    if (slot.family === "source") {
      rebaseSourceSlot(slot, rawMetaOf(raw, key) as SourceMeta);
    } else {
      rebaseHybridSlot(child, slot, rawMetaOf(raw, key) as EntryMeta);
    }
  }
}

function rebaseSourceSlot(slot: SourceSlot, meta: SourceMeta): void {
  const newMode = resolveSourceMode(meta);
  const modeClean = slot.mode.value === slot.startMode.value;

  slot.startMeta = meta;
  slot.startMode.value = newMode;
  if (modeClean) {
    slot.mode.value = newMode;
    slot.manualValue.value = meta.manualValue ?? null;
    slot.lastFlippedAt.value = undefined;
  }
}

function rebaseHybridSlot(
  store: InternalValueStore,
  slot: HybridSlot,
  meta: EntryMeta,
): void {
  const { entryMode, percentBasis } = resolveHybridEntry(meta, store.schema);

  if (slot.entryMode.value === slot.startEntryMode.value) {
    slot.entryMode.value = entryMode;
  }
  slot.startEntryMode.value = entryMode;

  if (slot.percentBasis.value === slot.startPercentBasis.value) {
    slot.percentBasis.value = percentBasis;
  }
  slot.startPercentBasis.value = percentBasis;
}

/**
 * Serializes a source slot's meta half. In estimate mode an EDITED input
 * is the manual value (keystrokes mirror into the meta — never the loaded
 * column value); an unedited one carries the decoded `manualValue`
 * forward. In formula mode the value preserved at flip time carries
 * forward.
 */
function encodeSourceMeta(
  store: InternalValueStore,
  slot: SourceSlot,
): SourceMeta {
  const mode = slot.mode.value;
  const meta: SourceMeta = {
    mode,
    manualValue:
      mode === "estimate"
        ? store.isDirty.value
          ? isEmptyish(store.input.value)
            ? null
            : store.input.value
          : (slot.startMeta.manualValue ?? null)
        : (slot.manualValue.value ?? null),
  };
  const flippedAt = slot.lastFlippedAt.value ?? slot.startMeta.lastFlippedAt;
  if (flippedAt !== undefined) {
    meta.lastFlippedAt = flippedAt;
  }
  return meta;
}

/**
 * Whether any LIVE value leaf in the subtree carries a dirty slot. Walks
 * the tree (not the slot map): stale child stores past an array shrink
 * keep their slots, and those must never phantom-dirty the form. Reads
 * array `items`, so a reactive caller subscribes to structural changes.
 * Never short-circuits — this runs inside the `isDirty` aggregate
 * computed, and an unread branch would deafen the projection.
 */
function hasDirtySlot(state: EnvelopeState, store: InternalFieldStore): boolean {
  if (store.kind === "value") {
    return state.get(store)?.isDirty.value ?? false;
  }
  let dirty = false;
  if (store.kind === "array") {
    const length = store.items.value.length;
    for (let index = 0; index < length; index++) {
      const child = store.children[index];
      if (child && hasDirtySlot(state, child)) dirty = true;
    }
    return dirty;
  }
  for (const key in store.children) {
    if (hasDirtySlot(state, store.children[key])) dirty = true;
  }
  return dirty;
}

/**
 * The envelopes plugin: owns the meta half of estimate and
 * amount-or-percent fields — mode/entry state decoded from the kind
 * envelope, dirty-tracked, and serialized by wrapping the field's own
 * payload entry. No factory arguments: the envelope rides the field key,
 * so every scope's raw value already carries the meta half (no envelope
 * side-channel to decode).
 */
export function envelopes(): JsonischPlugin<EnvelopeState> {
  return {
    name: "envelopes",
    key: envelopesKey,
    wire: envelopesWire,

    build: () => new Map(),

    buildScope(ctx, scope, raw) {
      buildScopeSlots(ctx.state, scope, raw);
    },

    // A reused row store adopting a different row re-seeds in place — the
    // same idempotent body
    reseedScope(ctx, scope, raw) {
      buildScopeSlots(ctx.state, scope, raw);
    },

    resetField(ctx, store) {
      const slot = ctx.state.get(store);
      if (!slot) return;
      if (slot.family === "source") {
        slot.mode.value = slot.startMode.value;
        slot.manualValue.value = slot.startMeta.manualValue ?? null;
        slot.lastFlippedAt.value = undefined;
      } else {
        slot.entryMode.value = slot.startEntryMode.value;
        slot.percentBasis.value = slot.startPercentBasis.value;
      }
    },

    rebase(ctx, scope, raw) {
      rebaseScopeSlots(ctx.state, scope, raw);
    },

    // The meta channel travels with its row through insert/remove/move,
    // exactly like the input signals. The serialization baselines move
    // with the live state: the dirty baseline belongs to the moving item,
    // not the position. A no-op unless both stores carry the same family
    // (a mismatch can only come from a shape divergence).
    transferField(ctx, from, to) {
      const source = ctx.state.get(from);
      const target = ctx.state.get(to);
      if (!source || !target || source.family !== target.family) return;

      if (source.family === "source" && target.family === "source") {
        target.startMeta = source.startMeta;
        target.startMode.value = source.startMode.value;
        target.manualValue.value = source.manualValue.value;
        target.lastFlippedAt.value = source.lastFlippedAt.value;
        target.mode.value = source.mode.value;
      } else if (source.family === "hybrid" && target.family === "hybrid") {
        target.entryMode.value = source.entryMode.value;
        target.startEntryMode.value = source.startEntryMode.value;
        target.percentBasis.value = source.percentBasis.value;
        target.startPercentBasis.value = source.startPercentBasis.value;
      }
    },

    swapField(ctx, first, second) {
      const a = ctx.state.get(first);
      const b = ctx.state.get(second);
      if (!a || !b || a.family !== b.family) return;

      if (a.family === "source" && b.family === "source") {
        const meta = a.startMeta;
        a.startMeta = b.startMeta;
        b.startMeta = meta;
        swapSignals(a.startMode, b.startMode);
        swapSignals(a.manualValue, b.manualValue);
        swapSignals(a.lastFlippedAt, b.lastFlippedAt);
        swapSignals(a.mode, b.mode);
      } else if (a.family === "hybrid" && b.family === "hybrid") {
        swapSignals(a.entryMode, b.entryMode);
        swapSignals(a.startEntryMode, b.startEntryMode);
        swapSignals(a.percentBasis, b.percentBasis);
        swapSignals(a.startPercentBasis, b.startPercentBasis);
      }
    },

    fieldIsDirty(ctx, store) {
      return ctx.state.get(store)?.isDirty.value ?? false;
    },

    // Wrap your own payload entry — no sibling keys, and the envelope is
    // always COMPLETE (it is one bag key; a partial write would clobber
    // the persisted other half). A pinned estimate persists the typed
    // value; formula mode ships `{ kind: "estimate", mode: "formula" }`
    // with no value half and lets the server recompute author it.
    encodeValue(ctx, store, valueOut) {
      const slot = ctx.state.get(store);
      if (!slot) return undefined;
      if (!slot.isDirty.value && valueOut === undefined) return undefined;

      if (slot.family === "source") {
        // A CLEAN leaf inside a wholesale emission (a whole-array post, a
        // full-values host) re-emits its PERSISTED shape — never a
        // fabricated pin: a virgin estimate (no envelope ever saved) stays
        // a bare value, which the wire policy drops, exactly as an
        // unpinned estimate posts nothing today. Fabricating
        // `mode: "estimate"` here would pin every virgin estimate empty and
        // the recompute would preserve the empty forever.
        if (!slot.isDirty.value) {
          const persisted = slot.startMeta.mode;
          if (persisted === undefined) return undefined;
          const meta: SourceMeta = {
            mode: persisted,
            manualValue: slot.startMeta.manualValue ?? null,
          };
          if (slot.startMeta.lastFlippedAt !== undefined) {
            meta.lastFlippedAt = slot.startMeta.lastFlippedAt;
          }
          return persisted === "estimate"
            ? wrapEstimate(valueOut, meta)
            : wrapEstimate(undefined, meta);
        }

        const meta = encodeSourceMeta(store, slot);
        return slot.mode.value === "estimate"
          ? wrapEstimate(valueOut !== undefined ? valueOut : store.input.value, meta)
          : wrapEstimate(undefined, meta);
      }
      return wrapHybrid(valueOut !== undefined ? valueOut : store.input.value, {
        mode: slot.entryMode.value,
        basis: slot.percentBasis.value ?? "",
      });
    },

    isDirty(ctx: PluginCtx<EnvelopeState>) {
      return hasDirtySlot(ctx.state, ctx.form);
    },

    // Live values are read fresh per tracked snapshot; the callbacks are
    // cached on the slot so their identity is stable across snapshots
    // (a fresh closure would defeat the snapshot equality gate)
    fieldSnapshot(ctx, store, path) {
      const slot = ctx.state.get(store);
      if (!slot) return {};

      if (slot.family === "source") {
        slot.callbacks ??= {
          setMode: (mode) => setMode(ctx.form, path, mode),
        };
        return { mode: slot.mode.value, setMode: slot.callbacks.setMode };
      }

      slot.callbacks ??= {
        setEntryMode: (mode) => setEntryMode(ctx.form, path, mode),
        setPercentBasis: (percentBasis) =>
          setPercentBasis(ctx.form, path, percentBasis),
      };
      return {
        entryMode: slot.entryMode.value,
        percentBasis: slot.percentBasis.value,
        setEntryMode: slot.callbacks.setEntryMode,
        setPercentBasis: slot.callbacks.setPercentBasis,
      };
    },
  };
}

declare module "../../react/types" {
  interface FieldStoreSlots {
    /**
     * The estimate/formula mode of an estimate field, `undefined`
     * otherwise.
     */
    readonly mode: DerivationMode | undefined;
    /**
     * Flips an estimate field's mode (the `setMode` method — seeds the
     * estimate from the last formula result, stamps the meta half).
     * Contributed only for estimate fields.
     */
    readonly setMode: (mode: DerivationMode) => void;
    /**
     * The entry mode of an amount-or-percent field, `undefined` otherwise.
     */
    readonly entryMode: EntryMode | undefined;
    /**
     * Sets an amount-or-percent field's entry mode (dirties the meta
     * half). Contributed only for amount-or-percent fields.
     */
    readonly setEntryMode: (mode: EntryMode) => void;
    /**
     * The percent basis of an amount-or-percent field (a loan field key).
     */
    readonly percentBasis: string | undefined;
    /**
     * Sets an amount-or-percent field's percent basis (dirties the meta
     * half). Contributed only for amount-or-percent fields.
     */
    readonly setPercentBasis: (percentBasis: string) => void;
  }
}

function swapSignals<T>(
  first: { value: T },
  second: { value: T },
): void {
  const value = first.value;
  first.value = second.value;
  second.value = value;
}
