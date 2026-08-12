import type { WireContract } from "../../core/plugin/types";

/**
 * The derivation plugin's STATIC wire contract: a `formula` value is
 * ALWAYS server-recomputed — a client payload only carries a stale echo of
 * the last-rendered result, so `encodeDirty` drops it. (The estimate-pin
 * policy lives on `envelopesWire.encode` — the envelope owns it.)
 */
export const derivationWire: WireContract = {
  skipValue: (control) => control === "formula",
};
