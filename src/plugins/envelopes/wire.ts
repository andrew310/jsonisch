import type { WireContract, WireEnvelope } from "../../core/plugin/types";
import { readOwn } from "../../core/schema-utils";
import type { EntryMeta, SourceMeta } from "./types";

/** Discriminator of a persisted estimate / amount-or-percent envelope. */
export type EnvelopeKind = "estimate" | "amount-or-percent";

/**
 * Returns whether a raw persisted entry is an envelope: an object whose
 * `kind` is `estimate` or `amount-or-percent`. Anything else — including
 * the bare scalars every non-envelope field persists — is a bare value.
 */
export function isEnvelope(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const kind = (raw as { kind?: unknown }).kind;
  return kind === "estimate" || kind === "amount-or-percent";
}

/** Meta keys only — `kind` and `value` are the envelope's own halves. */
function metaOf(raw: Record<string, unknown>): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (key === "kind" || key === "value") continue;
    meta[key] = raw[key];
  }
  return meta;
}

/**
 * Wraps an estimate field's halves into its envelope. The value key is
 * OMITTED when `value` is `undefined` (formula mode ships
 * `{ kind: "estimate", mode: "formula" }` and lets the server recompute
 * author the value half).
 */
export function wrapEstimate(value: unknown, meta: SourceMeta): unknown {
  const envelope: Record<string, unknown> = { kind: "estimate", ...meta };
  if (value !== undefined) envelope.value = value;
  return envelope;
}

/**
 * Wraps an amount-or-percent field's halves into its envelope. Always
 * complete — an envelope is one bag key, so a partial write would clobber
 * the persisted other half.
 */
export function wrapHybrid(value: unknown, meta: EntryMeta): unknown {
  return { kind: "amount-or-percent", value, ...meta };
}

/**
 * The envelopes plugin's STATIC wire contract — isomorphic by
 * construction: the server imports this same object for save routing
 * (`encodeDirty`), the recompute pass, and engine-less readers
 * (changelog, list pages), with no form store anywhere (D7).
 *
 * Envelope shape: estimate fields persist
 * `{ kind: "estimate", value?, mode, manualValue?, lastFlippedAt? }`,
 * amount-or-percent fields
 * `{ kind: "amount-or-percent", value, mode, basis? }`.
 * Wire `mode` uses settled names (`estimate`/`formula`, `amount`/`percent`).
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
   * Server-side enforcement of the skip policy on an outgoing envelope
   * (the twin of the client plugin's `encodeValue`): an estimate value
   * persists exactly when its meta pins `mode: "estimate"` — any other
   * mode strips the value half and leaves the recompute pass as its only
   * author. A bare estimate value with no envelope has no pin and is
   * dropped entirely. Amount-or-percent envelopes pass through.
   */
  encode(control: string, raw: unknown): unknown {
    if (control !== "estimate") return raw;
    if (!isEnvelope(raw)) return undefined;
    const meta = metaOf(raw);
    if (meta.mode === "estimate") return raw;
    return wrapEstimate(undefined, meta as SourceMeta);
  },
};
