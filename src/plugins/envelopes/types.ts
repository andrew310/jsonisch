import type { ReadonlySignal, Signal } from "../../core/signal";
import type { DerivationMode } from "../../core/types";

/**
 * The persisted meta half of an estimate field. Wire `mode` uses the
 * settled names (`estimate` / `formula`). `manualValue` preserves the
 * typed estimate across a mode flip; `lastFlippedAt` is stamped only when
 * the mode actually changes. Server recompute may write a PARTIAL meta
 * (`{ mode: "formula" }` only) — every reader tolerates that.
 */
export interface EstimateMeta {
  mode?: DerivationMode;
  manualValue?: unknown;
  lastFlippedAt?: string;
}

/**
 * The persisted meta half of an amount-or-percent field. Wire `mode` is
 * `amount` | `percent`; `basis` is the percent-of field key. The meta
 * holds ONLY entry state — the value half is always the resolved dollar
 * amount.
 */
export interface EntryMeta {
  mode?: EntryMode;
  basis?: string;
}

/**
 * The entry mode of an amount-or-percent field: enter a dollar `amount`,
 * or a `percent` of the percent basis.
 */
export type EntryMode = "amount" | "percent";

/**
 * In-memory estimate envelope (PR #553 kind union). `mode` is omitted
 * when nothing was ever persisted — encode must not fabricate a pin.
 */
export interface EstimateEnvelope {
  readonly kind: "estimate";
  readonly value?: unknown;
  readonly mode?: DerivationMode;
  readonly manualValue?: unknown;
  readonly lastFlippedAt?: string;
}

/**
 * In-memory amount-or-percent envelope. `mode` / `basis` are resolved
 * (schema default applied) so dirty compare is `!==`, not re-defaulting.
 */
export interface AmountOrPercentEnvelope {
  readonly kind: "amount-or-percent";
  readonly value?: unknown;
  readonly mode: EntryMode;
  readonly basis?: string;
}

export type Envelope = EstimateEnvelope | AmountOrPercentEnvelope;

/**
 * The envelope slot of an estimate field (the `estimate` family). The mode
 * signal is a computed over `envelope.mode` — write via `setMode` (the
 * flip API), never by assigning `mode`.
 */
export interface EstimateSlot {
  readonly family: "estimate";
  /**
   * Live envelope. Written only by `writeEnvelope`.
   */
  readonly envelope: Signal<EstimateEnvelope>;
  /**
   * Dirty baseline / reset target. Reassigned on rebase and on
   * `reset({ initialInput })`.
   */
  readonly startEnvelope: Signal<EstimateEnvelope>;
  /**
   * Resolved estimate/formula mode. An unpinned empty field follows
   * `x-estimate-default-mode`; a stored unpinned value stays `estimate`.
   */
  readonly mode: ReadonlySignal<DerivationMode>;
  /**
   * The estimate value preserved when the mode flipped to formula this
   * session (wire `manualValue` carry).
   */
  readonly manualValue: ReadonlySignal<unknown>;
  /**
   * The flip timestamp stamped this session, or the decoded one.
   */
  readonly lastFlippedAt: ReadonlySignal<string | undefined>;
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
 * The envelope slot of an amount-or-percent field (the `amount-or-percent` family).
 * Value edits never dirty the meta — only entry-state changes do.
 */
export interface AmountOrPercentSlot {
  readonly family: "amount-or-percent";
  /**
   * Live envelope. Written only by `writeEnvelope`.
   */
  readonly envelope: Signal<AmountOrPercentEnvelope>;
  /**
   * Dirty baseline / reset target. Reassigned on rebase and on
   * `reset({ initialInput })`.
   */
  readonly startEnvelope: Signal<AmountOrPercentEnvelope>;
  /**
   * The current entry mode. An unpinned empty field follows
   * `x-hybrid-default-mode`; a stored unpinned value stays `amount`.
   */
  readonly entryMode: ReadonlySignal<EntryMode>;
  /**
   * The current percent basis (a root-level field key), or `undefined` when the
   * schema declares no default and none was stored.
   */
  readonly percentBasis: ReadonlySignal<string | undefined>;
  /**
   * Whether the meta half must serialize (entry mode or basis changed).
   */
  readonly isDirty: ReadonlySignal<boolean>;
  /**
   * The identity-stable react callbacks (see `EstimateSlot.callbacks`).
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
export type EnvelopeSlot = EstimateSlot | AmountOrPercentSlot;
