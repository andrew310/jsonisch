import { FieldSlotKey } from "../../core/plugin/key";
import type { EnvelopeSlot } from "./types";

/**
 * The envelopes plugin's slot key. Other plugins read envelope state
 * through this identity (the derivation plugin pins on `mode`), never
 * through the envelopes implementation.
 */
export const envelopesKey = new FieldSlotKey<EnvelopeSlot>("envelopes");
