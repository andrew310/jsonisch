import type { ReadonlySignal, Signal } from "../signal";
import type { DerivationMode } from "./derivation";

/**
 * The persisted `<key>Source` companion of an estimate field, exactly as
 * janska writes it today (wire-compatible by requirement — no data
 * migration). `mode` uses the LEGACY names on the wire: `manual` is the
 * estimate mode, `calculated` the formula mode. `manualValue` preserves the
 * typed estimate across a mode flip; `lastFlippedAt` is stamped only when
 * the mode actually changes.
 */
export interface SourceCompanion {
  mode?: "manual" | "calculated";
  manualValue?: unknown;
  lastFlippedAt?: string;
}

/**
 * The persisted `<key>Hybrid` companion of an amount-or-percent field.
 * Legacy names on the wire: `bps` is the percent entry mode, `fixed_amount`
 * the amount mode; `denominator` is the percent basis (a loan field key).
 * The companion holds ONLY entry state — the field's own value is always
 * the resolved dollar amount.
 */
export interface HybridCompanion {
  mode?: "bps" | "fixed_amount";
  denominator?: string;
}

/**
 * The entry mode of an amount-or-percent field (settled naming; translates
 * to the wire's `fixed_amount`/`bps`): enter a dollar `amount`, or a
 * `percent` of the percent basis.
 */
export type EntryMode = "amount" | "percent";

/**
 * The meta state of an estimate field (the `<key>Source` family). The mode
 * signal itself lives on the field store (`store.mode`, the derivation
 * seam); this record carries the serialization baselines around it.
 */
export interface InternalSourceMeta {
  readonly family: "source";
  /**
   * The decoded companion at store init — the carry-forward source for
   * wire keys the session did not change (`manualValue` while in formula
   * mode, an inherited `lastFlippedAt`).
   */
  startCompanion: SourceCompanion;
  /**
   * The mode dirty baseline (what the companion decoded/defaulted to).
   */
  startMode: Signal<DerivationMode>;
  /**
   * The estimate value preserved when the mode flipped to formula this
   * session (wire `manualValue` carry: janska keeps the last typed value in
   * the companion so a later flip back can be reasoned about server-side).
   * Initialized from the decoded companion.
   */
  manualValue: Signal<unknown>;
  /**
   * The flip timestamp stamped this session, or `undefined` while the mode
   * has not changed (the encoded companion then carries the decoded one).
   */
  lastFlippedAt: Signal<string | undefined>;
  /**
   * Whether the companion must serialize: the mode changed, or the estimate
   * value did (janska updates `manualValue` on every estimate keystroke).
   */
  isDirty: ReadonlySignal<boolean>;
}

/**
 * The meta state of an amount-or-percent field (the `<key>Hybrid` family).
 * Value edits never dirty the companion — only entry-state changes do.
 */
export interface InternalHybridMeta {
  readonly family: "hybrid";
  /**
   * The current entry mode.
   */
  entryMode: Signal<EntryMode>;
  /**
   * The entry-mode dirty baseline.
   */
  startEntryMode: Signal<EntryMode>;
  /**
   * The current percent basis (a loan field key), or `undefined` when the
   * schema declares no default and none was stored.
   */
  percentBasis: Signal<string | undefined>;
  /**
   * The percent-basis dirty baseline.
   */
  startPercentBasis: Signal<string | undefined>;
  /**
   * Whether the companion must serialize (entry mode or basis changed).
   */
  isDirty: ReadonlySignal<boolean>;
}

/**
 * The meta state a value field store may carry: companion state that is
 * dirty-tracked and serialized by core, never rendered as a field.
 */
export type InternalMetaStore = InternalSourceMeta | InternalHybridMeta;
