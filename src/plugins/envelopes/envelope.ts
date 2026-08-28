import { isEmptyish, isSemanticEqual } from "../../core/dirty";
import { resolveValueInput } from "../../core/schema-utils";
import type {
  DerivationMode,
  InternalFormStore,
  InternalValueStore,
  JsonSchema,
} from "../../core/types";
import type {
  EntryMeta,
  EntryMode,
  EnvelopeSlot,
  EstimateEnvelope,
  HybridEnvelope,
  HybridSlot,
  SourceMeta,
  SourceSlot,
} from "./types";
import { envelopesWire } from "./wire";

/**
 * Schema-declared opening mode for an unpinned estimate field.
 * Missing / anything other than `"formula"` → `estimate` (manual-first).
 */
export function schemaDefaultSourceMode(
  schema: JsonSchema | undefined,
): DerivationMode {
  return schema?.["x-estimate-default-mode"] === "formula"
    ? "formula"
    : "estimate";
}

/**
 * Resolves an estimate field's live mode:
 *   - an explicit `formula` / `estimate` pin always wins
 *   - no pin + empty value + schema default `formula` → `formula` (LOS-823)
 *   - otherwise → `estimate` (manual-first, LOS-461: a stored unpinned
 *     value stays typeable so a schema default cannot clobber it)
 */
export function resolveSourceMode(
  meta: SourceMeta & { value?: unknown },
  schema?: JsonSchema,
): DerivationMode {
  if (meta.mode === "formula" || meta.mode === "estimate") return meta.mode;
  if (
    schemaDefaultSourceMode(schema) === "formula" &&
    isEmptyish(meta.value)
  ) {
    return "formula";
  }
  return "estimate";
}

/**
 * Schema-declared opening unit for an unpinned amount-or-percent field.
 * Missing / anything other than `"percent"` → `amount` (amount-first).
 */
export function schemaDefaultEntryMode(
  schema: JsonSchema | undefined,
): EntryMode {
  return schema?.["x-hybrid-default-mode"] === "percent" ? "percent" : "amount";
}

/**
 * Resolves persisted hybrid entry state:
 *   - an explicit `percent` / `amount` pin always wins
 *   - no pin + empty value + schema default `percent` → `percent` (LOS-824)
 *   - otherwise → `amount` (amount-first: a stored unpinned value stays
 *     dollars so imported/legacy amounts are not treated as percent-owned)
 * Percent basis falls back to the schema's declared default denominator.
 */
export function resolveHybridEntry(
  meta: EntryMeta,
  schema: InternalValueStore["schema"],
  value?: unknown,
): { entryMode: EntryMode; percentBasis: string | undefined } {
  const schemaDefault = schema["x-hybrid-default-denominator"];
  const entryMode: EntryMode =
    meta.mode === "percent" || meta.mode === "amount"
      ? meta.mode
      : schemaDefaultEntryMode(schema) === "percent" && isEmptyish(value)
        ? "percent"
        : "amount";
  return {
    entryMode,
    percentBasis:
      typeof meta.basis === "string"
        ? meta.basis
        : typeof schemaDefault === "string" && schemaDefault !== ""
          ? schemaDefault
          : undefined,
  };
}

function resolveEnvelopeValue(
  form: InternalFormStore,
  store: InternalValueStore,
  value: unknown,
): unknown {
  return resolveValueInput(
    form.emptyInput,
    store.schema,
    store.isNullish,
    value,
  );
}

/**
 * Decodes one estimate field's raw (kind envelope or bare scalar) into
 * the in-memory envelope. `mode` is omitted when the wire never pinned
 * one — encode must not fabricate `{ mode: "estimate" }` for a virgin
 * field.
 */
export function decodeSourceEnvelope(
  form: InternalFormStore,
  store: InternalValueStore,
  raw: unknown,
): EstimateEnvelope {
  const { value, meta } = envelopesWire.unwrap!(raw);
  const sourceMeta = meta as SourceMeta;
  const envelope: EstimateEnvelope = {
    kind: "estimate",
    value: resolveEnvelopeValue(form, store, value),
  };
  if (sourceMeta.mode === "formula" || sourceMeta.mode === "estimate") {
    return {
      ...envelope,
      mode: sourceMeta.mode,
      manualValue: sourceMeta.manualValue ?? null,
      ...(sourceMeta.lastFlippedAt !== undefined
        ? { lastFlippedAt: sourceMeta.lastFlippedAt }
        : {}),
    };
  }
  return {
    ...envelope,
    manualValue: sourceMeta.manualValue ?? null,
    ...(sourceMeta.lastFlippedAt !== undefined
      ? { lastFlippedAt: sourceMeta.lastFlippedAt }
      : {}),
  };
}

/**
 * Decodes one amount-or-percent field's raw into the in-memory envelope
 * with entry state already resolved against the schema default.
 */
export function decodeHybridEnvelope(
  form: InternalFormStore,
  store: InternalValueStore,
  raw: unknown,
): HybridEnvelope {
  const { value, meta } = envelopesWire.unwrap!(raw);
  const { entryMode, percentBasis } = resolveHybridEntry(
    meta as EntryMeta,
    store.schema,
    value,
  );
  return {
    kind: "amount-or-percent",
    value: resolveEnvelopeValue(form, store, value),
    mode: entryMode,
    ...(percentBasis !== undefined ? { basis: percentBasis } : {}),
  };
}

/**
 * Sole writer of `slot.envelope` and this field's `store.input` for live
 * edits, decode, and rebase. Array transfer/swap move the envelope signal
 * itself (`copyItemState` already moved `store.input`). `input` is the
 * value half, empty-input-resolved — widgets still bind a scalar.
 */
export function writeEnvelope(
  form: InternalFormStore,
  store: InternalValueStore,
  slot: SourceSlot,
  next: EstimateEnvelope,
): void;
export function writeEnvelope(
  form: InternalFormStore,
  store: InternalValueStore,
  slot: HybridSlot,
  next: HybridEnvelope,
): void;
export function writeEnvelope(
  form: InternalFormStore,
  store: InternalValueStore,
  slot: EnvelopeSlot,
  next: EstimateEnvelope | HybridEnvelope,
): void {
  const resolved = resolveEnvelopeValue(form, store, next.value);
  if (slot.family === "source") {
    slot.envelope.value = { ...(next as EstimateEnvelope), value: resolved };
  } else {
    slot.envelope.value = { ...(next as HybridEnvelope), value: resolved };
  }
  store.input.value = resolved;
  store.isDirty.value = !isSemanticEqual(resolved, store.startInput.value);
}

/**
 * Per-channel adopt: `start` becomes `incoming`; `live` is incoming with
 * any dirty channels overlaid from the previous live. A mode flip must
 * not freeze a clean number against a server update.
 */
export function adoptEnvelope(
  live: EstimateEnvelope,
  start: EstimateEnvelope,
  incoming: EstimateEnvelope,
  schema?: JsonSchema,
): { live: EstimateEnvelope; start: EstimateEnvelope };
export function adoptEnvelope(
  live: HybridEnvelope,
  start: HybridEnvelope,
  incoming: HybridEnvelope,
  schema?: JsonSchema,
): { live: HybridEnvelope; start: HybridEnvelope };
export function adoptEnvelope(
  live: EstimateEnvelope | HybridEnvelope,
  start: EstimateEnvelope | HybridEnvelope,
  incoming: EstimateEnvelope | HybridEnvelope,
  schema?: JsonSchema,
): {
  live: EstimateEnvelope | HybridEnvelope;
  start: EstimateEnvelope | HybridEnvelope;
} {
  if (incoming.kind === "estimate") {
    return adoptSource(
      live as EstimateEnvelope,
      start as EstimateEnvelope,
      incoming,
      schema,
    );
  }
  return adoptHybrid(
    live as HybridEnvelope,
    start as HybridEnvelope,
    incoming,
  );
}

function adoptSource(
  live: EstimateEnvelope,
  start: EstimateEnvelope,
  incoming: EstimateEnvelope,
  schema?: JsonSchema,
): { live: EstimateEnvelope; start: EstimateEnvelope } {
  const modeDirty =
    resolveSourceMode(live, schema) !== resolveSourceMode(start, schema);
  const valueDirty = !isSemanticEqual(live.value, start.value);
  return {
    start: incoming,
    live: {
      ...incoming,
      ...(modeDirty
        ? {
            mode: live.mode,
            lastFlippedAt: live.lastFlippedAt,
            manualValue: live.manualValue,
          }
        : {}),
      ...(valueDirty
        ? {
            value: live.value,
            ...(resolveSourceMode(live, schema) === "estimate"
              ? { manualValue: live.manualValue }
              : {}),
          }
        : {}),
    },
  };
}

function adoptHybrid(
  live: HybridEnvelope,
  start: HybridEnvelope,
  incoming: HybridEnvelope,
): { live: HybridEnvelope; start: HybridEnvelope } {
  return {
    start: incoming,
    live: {
      ...incoming,
      ...(live.mode !== start.mode ? { mode: live.mode } : {}),
      ...(live.basis !== start.basis ? { basis: live.basis } : {}),
      ...(!isSemanticEqual(live.value, start.value)
        ? { value: live.value }
        : {}),
    },
  };
}

/**
 * Moves the dirty baseline to `start` (value half onto `startInput`) and
 * writes the live envelope once.
 */
export function bindAdopted(
  form: InternalFormStore,
  store: InternalValueStore,
  slot: SourceSlot,
  adopted: { live: EstimateEnvelope; start: EstimateEnvelope },
): void;
export function bindAdopted(
  form: InternalFormStore,
  store: InternalValueStore,
  slot: HybridSlot,
  adopted: { live: HybridEnvelope; start: HybridEnvelope },
): void;
export function bindAdopted(
  form: InternalFormStore,
  store: InternalValueStore,
  slot: EnvelopeSlot,
  adopted: {
    live: EstimateEnvelope | HybridEnvelope;
    start: EstimateEnvelope | HybridEnvelope;
  },
): void {
  if (slot.family === "source") {
    slot.startEnvelope.value = adopted.start as EstimateEnvelope;
    store.startInput.value = resolveEnvelopeValue(
      form,
      store,
      adopted.start.value,
    );
    writeEnvelope(form, store, slot, adopted.live as EstimateEnvelope);
    return;
  }
  slot.startEnvelope.value = adopted.start as HybridEnvelope;
  store.startInput.value = resolveEnvelopeValue(
    form,
    store,
    adopted.start.value,
  );
  writeEnvelope(form, store, slot, adopted.live as HybridEnvelope);
}

/**
 * Estimate keystroke: value (and, in estimate mode, `manualValue`) land
 * on the same envelope as the number.
 */
export function syncSourceInput(
  form: InternalFormStore,
  store: InternalValueStore,
  slot: SourceSlot,
  input: unknown,
): void {
  const live = slot.envelope.value;
  writeEnvelope(form, store, slot, {
    ...live,
    value: input,
    ...(resolveSourceMode(live, store.schema) === "estimate"
      ? { manualValue: isEmptyish(input) ? null : input }
      : {}),
  });
}

/**
 * Amount-or-percent keystroke: value half only — entry state is untouched.
 */
export function syncHybridInput(
  form: InternalFormStore,
  store: InternalValueStore,
  slot: HybridSlot,
  input: unknown,
): void {
  writeEnvelope(form, store, slot, {
    ...slot.envelope.value,
    value: input,
  });
}
