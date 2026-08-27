import { isEmptyish, isSemanticEqual } from "../../core/dirty";
import { computed, createSignal } from "../../core/framework";
import type { JsonischPlugin, PluginCtx } from "../../core/plugin/types";
import { readOwn } from "../../core/schema-utils";
import { setEntryMode, setPercentBasis } from "../../methods/set-entry";
import { setMode } from "../../methods/set-mode";
import type {
  DerivationMode,
  InternalFieldStore,
  InternalFormStore,
  InternalObjectStore,
  InternalValueStore,
} from "../../core/types";
import {
  adoptEnvelope,
  bindAdopted,
  decodeHybridEnvelope,
  decodeSourceEnvelope,
  resolveSourceMode,
  syncHybridInput,
  syncSourceInput,
  writeEnvelope,
} from "./envelope";
import { envelopesKey } from "./key";
import { envelopesWire, wrapEstimate, wrapHybrid } from "./wire";
import type {
  EnvelopeSlot,
  EntryMode,
  EstimateEnvelope,
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
 * Builds (or re-seeds) the slots of ONE object scope — the document root
 * or a single array row. Idempotent: called again on a REUSED store (an
 * array shrink-then-regrow, a rebuilt row) it re-seeds the existing
 * signals in place instead of replacing them, so computeds already wired
 * to the mode signal keep tracking it.
 */
function buildScopeSlots(
  form: InternalFormStore,
  state: EnvelopeState,
  scope: InternalObjectStore,
  raw: unknown,
): void {
  for (const key of Object.keys(scope.children)) {
    const child = scope.children[key];
    if (child.kind !== "value") continue;

    if (child.control === "estimate") {
      buildSourceSlot(form, state, child, readOwn(raw, key));
    } else if (child.control === "amount-or-percent") {
      buildHybridSlot(form, state, child, readOwn(raw, key));
    }
  }
}

function sourceDirty(
  live: EstimateEnvelope,
  start: EstimateEnvelope,
  schema: InternalValueStore["schema"],
): boolean {
  return (
    resolveSourceMode(live, schema) !== resolveSourceMode(start, schema) ||
    (resolveSourceMode(live, schema) === "estimate" &&
      !isSemanticEqual(live.value, start.value))
  );
}

function buildSourceSlot(
  form: InternalFormStore,
  state: EnvelopeState,
  store: InternalValueStore,
  raw: unknown,
): void {
  const decoded = decodeSourceEnvelope(form, store, raw);

  const existing = state.get(store);
  if (existing?.family === "source") {
    existing.startEnvelope.value = decoded;
    writeEnvelope(form, store, existing, decoded);
    return;
  }

  const envelope = createSignal<EstimateEnvelope>(decoded);
  const startEnvelope = createSignal<EstimateEnvelope>(decoded);

  const slot: SourceSlot = {
    family: "source",
    envelope,
    startEnvelope,
    mode: computed<DerivationMode>(() =>
      resolveSourceMode(envelope.value, store.schema),
    ),
    manualValue: computed<unknown>(() => envelope.value.manualValue ?? null),
    lastFlippedAt: computed<string | undefined>(
      () => envelope.value.lastFlippedAt,
    ),
    isDirty: computed<boolean>(() =>
      sourceDirty(envelope.value, startEnvelope.value, store.schema),
    ),
  };
  state.set(store, slot);
}

function buildHybridSlot(
  form: InternalFormStore,
  state: EnvelopeState,
  store: InternalValueStore,
  raw: unknown,
): void {
  const decoded = decodeHybridEnvelope(form, store, raw);

  const existing = state.get(store);
  if (existing?.family === "hybrid") {
    existing.startEnvelope.value = decoded;
    writeEnvelope(form, store, existing, decoded);
    return;
  }

  const envelope = createSignal(decoded);
  const startEnvelope = createSignal(decoded);

  const slot: HybridSlot = {
    family: "hybrid",
    envelope,
    startEnvelope,
    entryMode: computed<EntryMode>(() => envelope.value.mode),
    percentBasis: computed<string | undefined>(() => envelope.value.basis),
    isDirty: computed<boolean>(
      () =>
        envelope.value.mode !== startEnvelope.value.mode ||
        envelope.value.basis !== startEnvelope.value.basis,
    ),
  };
  state.set(store, slot);
}

/**
 * Rebases one scope's slots onto fresh raw data — the meta half of
 * `applyBaseline`. `adoptEnvelope` keeps per-channel clean-vs-dirty, then
 * `writeEnvelope` runs once.
 */
function rebaseScopeSlots(
  form: InternalFormStore,
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
      const incoming = decodeSourceEnvelope(form, child, readOwn(raw, key));
      bindAdopted(
        form,
        child,
        slot,
        adoptEnvelope(
          slot.envelope.value,
          slot.startEnvelope.value,
          incoming,
          child.schema,
        ),
      );
    } else {
      const incoming = decodeHybridEnvelope(form, child, readOwn(raw, key));
      bindAdopted(
        form,
        child,
        slot,
        adoptEnvelope(
          slot.envelope.value,
          slot.startEnvelope.value,
          incoming,
          child.schema,
        ),
      );
    }
  }
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
  const live = slot.envelope.value;
  const start = slot.startEnvelope.value;
  const mode = resolveSourceMode(live, store.schema);
  const meta: SourceMeta = {
    mode,
    manualValue:
      mode === "estimate"
        ? store.isDirty.value
          ? isEmptyish(store.input.value)
            ? null
            : store.input.value
          : (start.manualValue ?? null)
        : (live.manualValue ?? null),
  };
  const flippedAt = live.lastFlippedAt ?? start.lastFlippedAt;
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
      buildScopeSlots(ctx.form, ctx.state, scope, raw);
    },

    // A reused row store adopting a different row re-seeds in place — the
    // same idempotent body
    reseedScope(ctx, scope, raw) {
      buildScopeSlots(ctx.form, ctx.state, scope, raw);
    },

    resetField(ctx, store) {
      if (store.kind !== "value") return;
      const slot = ctx.state.get(store);
      if (!slot) return;
      // Overlay start meta onto the value the reset walk already wrote
      // (`keepInput` keeps the live number; otherwise that write is the
      // start value).
      if (slot.family === "source") {
        writeEnvelope(ctx.form, store, slot, {
          ...slot.startEnvelope.value,
          value: store.input.value,
        });
      } else {
        writeEnvelope(ctx.form, store, slot, {
          ...slot.startEnvelope.value,
          value: store.input.value,
        });
      }
    },

    rebase(ctx, scope, raw) {
      rebaseScopeSlots(ctx.form, ctx.state, scope, raw);
    },

    syncInput(ctx, store, input) {
      if (store.kind !== "value") return false;
      const slot = ctx.state.get(store);
      if (!slot) return false;
      if (slot.family === "source") {
        syncSourceInput(ctx.form, store, slot, input);
      } else {
        syncHybridInput(ctx.form, store, slot, input);
      }
      return true;
    },

    syncInitial(ctx, store, raw) {
      if (store.kind !== "value") return;
      const slot = ctx.state.get(store);
      if (!slot) return;
      if (slot.family === "source") {
        slot.startEnvelope.value = decodeSourceEnvelope(ctx.form, store, raw);
      } else {
        slot.startEnvelope.value = decodeHybridEnvelope(ctx.form, store, raw);
      }
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
        target.startEnvelope.value = source.startEnvelope.value;
        target.envelope.value = source.envelope.value;
      } else if (source.family === "hybrid" && target.family === "hybrid") {
        target.startEnvelope.value = source.startEnvelope.value;
        target.envelope.value = source.envelope.value;
      }
    },

    swapField(ctx, first, second) {
      const a = ctx.state.get(first);
      const b = ctx.state.get(second);
      if (!a || !b || a.family !== b.family) return;

      if (a.family === "source" && b.family === "source") {
        swapSignals(a.startEnvelope, b.startEnvelope);
        swapSignals(a.envelope, b.envelope);
      } else if (a.family === "hybrid" && b.family === "hybrid") {
        swapSignals(a.startEnvelope, b.startEnvelope);
        swapSignals(a.envelope, b.envelope);
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
          const persisted = slot.startEnvelope.value.mode;
          if (persisted === undefined) return undefined;
          const start = slot.startEnvelope.value;
          const meta: SourceMeta = {
            mode: persisted,
            manualValue: start.manualValue ?? null,
          };
          if (start.lastFlippedAt !== undefined) {
            meta.lastFlippedAt = start.lastFlippedAt;
          }
          return persisted === "estimate"
            ? wrapEstimate(valueOut, meta)
            : wrapEstimate(undefined, meta);
        }

        const meta = encodeSourceMeta(store, slot);
        return resolveSourceMode(slot.envelope.value, store.schema) === "estimate"
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
