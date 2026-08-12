import type { WireContract, WireEnvelope } from "../../core/plugin/types";
import { readOwn } from "../../core/schema-utils";
import type { EntryMeta, SourceMeta } from "./types";

/**
 * The envelope key the source family's meta half nests under
 * (`myField: { value, source }`).
 */
export const SOURCE_ENVELOPE_KEY = "source";

/**
 * The envelope key the hybrid family's meta half nests under
 * (`myField: { value, entry }`).
 */
export const ENTRY_ENVELOPE_KEY = "entry";

/**
 * Returns whether a raw persisted entry is an envelope: an object carrying
 * at least one of the envelope's own keys. Anything else — including the
 * bare scalars every non-envelope field persists — is a bare value.
 */
export function isEnvelope(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (
    Object.prototype.hasOwnProperty.call(raw, "value") ||
    Object.prototype.hasOwnProperty.call(raw, SOURCE_ENVELOPE_KEY) ||
    Object.prototype.hasOwnProperty.call(raw, ENTRY_ENVELOPE_KEY)
  );
}

function metaOf(raw: Record<string, unknown>): Record<string, unknown> {
  const meta =
    readOwn(raw, SOURCE_ENVELOPE_KEY) ?? readOwn(raw, ENTRY_ENVELOPE_KEY);
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

/**
 * Wraps an estimate field's halves into its envelope. The value key is
 * OMITTED when `value` is `undefined` (formula mode ships
 * `{ source: { mode: "calculated" } }` and lets the server recompute
 * author the value half).
 */
export function wrapSource(value: unknown, meta: SourceMeta): unknown {
  return value === undefined
    ? { [SOURCE_ENVELOPE_KEY]: meta }
    : { value, [SOURCE_ENVELOPE_KEY]: meta };
}

/**
 * Wraps an amount-or-percent field's halves into its envelope. Always
 * complete — an envelope is one bag key, so a partial write would clobber
 * the persisted other half.
 */
export function wrapEntry(value: unknown, meta: EntryMeta): unknown {
  return { value, [ENTRY_ENVELOPE_KEY]: meta };
}

/**
 * The envelopes plugin's STATIC wire contract — isomorphic by
 * construction: the server imports this same object for save routing
 * (`encodeDirty`), the recompute pass, and engine-less readers
 * (changelog, list pages), with no form store anywhere (D7).
 *
 * Envelope shape (LOS-573): estimate fields persist
 * `{ value, source: { mode, manualValue, lastFlippedAt? } }`,
 * amount-or-percent fields `{ value, entry: { mode, denominator } }`.
 * Only these two controls grow the envelope; scalars stay bare.
 */
export const envelopesWire: WireContract = {
  envelopeControls: ["estimate", "amount-or-percent"],

  /**
   * Splits a raw persisted entry into its halves. Non-envelope raw (bad
   * data) decodes defensively as `{ value: raw, meta: {} }`.
   */
  unwrap(raw: unknown): WireEnvelope {
    if (!isEnvelope(raw)) return { value: raw, meta: {} };
    return { value: readOwn(raw, "value"), meta: metaOf(raw) };
  },

  /**
   * Server-side enforcement of the LOS-461 skip policy on an outgoing
   * envelope (the twin of the client plugin's `encodeValue`): an estimate
   * value persists exactly when its meta pins `mode: "manual"` — any other
   * mode strips the value half and leaves the recompute pass as its only
   * author. A bare estimate value with no envelope has no pin and is
   * dropped entirely. Amount-or-percent envelopes pass through.
   */
  encode(control: string, raw: unknown): unknown {
    if (control !== "estimate") return raw;
    if (!isEnvelope(raw)) return undefined;
    const meta = metaOf(raw);
    if (meta.mode === "manual") return raw;
    return { [SOURCE_ENVELOPE_KEY]: meta };
  },
};
