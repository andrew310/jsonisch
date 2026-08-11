import { FieldSlotKey } from "../../core/plugin/key";
import type { CompanionSlot } from "./types";

/**
 * The companions plugin's slot key. Other plugins read companion state
 * through this identity (the derivation plugin pins on `mode`), never
 * through the companions implementation.
 */
export const companionsKey = new FieldSlotKey<CompanionSlot>("companions");
