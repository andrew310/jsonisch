import type { ReadonlySignal, Signal } from "../../core/signal";
import type { DerivationMode } from "../../core/types";

/**
 * The persisted meta half of an estimate field's envelope
 * (`{ value, source }`). `mode` uses the LEGACY inner names on the wire:
 * `manual` is the estimate mode, `calculated` the formula mode.
 * `manualValue` preserves the typed estimate across a mode flip;
 * `lastFlippedAt` is stamped only when the mode actually changes. The
 * server recompute writes a PARTIAL meta (`{ mode: "calculated" }` only) —
 * every reader tolerates that.
 */
export interface SourceMeta {
  mode?: "manual" | "calculated";
  manualValue?: unknown;
  lastFlippedAt?: string;
}

/**
 * The persisted meta half of an amount-or-percent field's envelope
 * (`{ value, entry }`). Legacy inner names: `bps` is the percent entry
 * mode, `fixed_amount` the amount mode; `denominator` is the percent basis
 * (a loan field key). The meta holds ONLY entry state — the value half is
 * always the resolved dollar amount.
 */
export interface EntryMeta {
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
 * The envelope slot of an estimate field (the `source` family). The mode
 * signal lives here — the derivation plugin reads it through
 * `envelopesKey` for the estimate pin.
 */
export interface SourceSlot {
  readonly family: "source";
  /**
   * The estimate/formula mode. Write via `setMode` (the flip API), not
   * directly: a raw write skips value seeding and the flip timestamp.
   */
  readonly mode: Signal<DerivationMode>;
  /**
   * The mode dirty baseline (what the persisted meta decoded/defaulted to).
   */
  readonly startMode: Signal<DerivationMode>;
  /**
   * The estimate value preserved when the mode flipped to formula this
   * session (wire `manualValue` carry). Initialized from the decoded meta.
   */
  readonly manualValue: Signal<unknown>;
  /**
   * The flip timestamp stamped this session, or `undefined` while the mode
   * has not changed (the encoded meta then carries the decoded one).
   */
  readonly lastFlippedAt: Signal<string | undefined>;
  /**
   * The decoded meta at store init — the carry-forward source for wire
   * keys the session did not change. Reassigned on rebase.
   */
  startMeta: SourceMeta;
  /**
   * Whether the meta half must serialize: the mode changed, or the
   * estimate value did (an estimate keystroke dirties the meta with it).
   */
  readonly isDirty: ReadonlySignal<boolean>;
  /**
   * The identity-stable react callbacks the plugin's `fieldSnapshot`
   * contributes, created lazily on first snapshot — a fresh closure per
   * snapshot would defeat the equality gate and re-render every
   * notification. Bound to form + path, which is safe because stores are
   * position-fixed (array ops move values, not stores).
   */
  callbacks?: {
    readonly setMode: (mode: DerivationMode) => void;
  };
}

/**
 * The envelope slot of an amount-or-percent field (the `entry` family).
 * Value edits never dirty the meta — only entry-state changes do.
 */
export interface HybridSlot {
  readonly family: "hybrid";
  /**
   * The current entry mode.
   */
  readonly entryMode: Signal<EntryMode>;
  /**
   * The entry-mode dirty baseline.
   */
  readonly startEntryMode: Signal<EntryMode>;
  /**
   * The current percent basis (a loan field key), or `undefined` when the
   * schema declares no default and none was stored.
   */
  readonly percentBasis: Signal<string | undefined>;
  /**
   * The percent-basis dirty baseline.
   */
  readonly startPercentBasis: Signal<string | undefined>;
  /**
   * Whether the meta half must serialize (entry mode or basis changed).
   */
  readonly isDirty: ReadonlySignal<boolean>;
  /**
   * The identity-stable react callbacks (see `SourceSlot.callbacks`).
   */
  callbacks?: {
    readonly setEntryMode: (mode: EntryMode) => void;
    readonly setPercentBasis: (percentBasis: string) => void;
  };
}

/**
 * The envelope slot a value field may carry: meta state that is
 * dirty-tracked and serialized by the envelopes plugin, never rendered as
 * a field.
 */
export type EnvelopeSlot = SourceSlot | HybridSlot;
