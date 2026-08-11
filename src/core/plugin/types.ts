import type {
  InternalFieldStore,
  InternalFormStore,
  InternalObjectStore,
  InternalValueStore,
  Path,
} from "../types";
import type { FormConfig } from "../types/form";
import type { PluginKey } from "./key";

/**
 * A persisted wire entry split into its halves: the field's own value and
 * the plugin-owned meta channel nested next to it.
 */
export interface WireEnvelope {
  readonly value: unknown;
  readonly meta: Record<string, unknown>;
}

/**
 * A plugin's STATIC wire behavior — a plain descriptor exported next to the
 * plugin factory, never runtime state, because the codec is isomorphic: the
 * server imports the same descriptor for save routing (`encodeDirty`) with
 * no form store anywhere (D7).
 */
export interface WireContract {
  /**
   * The controls whose persisted shape is the nested envelope
   * (`{ value, source | entry }`). Core's decode paths unwrap these at the
   * value leaf; everything else stays a bare value.
   */
  readonly envelopeControls?: readonly string[];
  /**
   * Splits a raw persisted entry into its halves. Non-envelope raw (bad
   * data) must decode defensively as `{ value: raw, meta: {} }`.
   */
  readonly unwrap?: (raw: unknown) => WireEnvelope;
  /**
   * Returns whether a declared key's outgoing value must be dropped from
   * the save payload entirely (`encodeDirty`) — e.g. a formula value, which
   * is always server-recomputed.
   */
  readonly skipValue?: (
    control: string,
    dirty: Record<string, unknown>,
    key: string,
  ) => boolean;
  /**
   * Normalizes a declared key's outgoing value in `encodeDirty` — the
   * server-side enforcement twin of the client plugin's `encodeValue` (e.g.
   * stripping the value half of an estimate envelope that does not pin
   * `mode: "manual"`). Returning `undefined` drops the key.
   */
  readonly encode?: (control: string, raw: unknown) => unknown;
}

/**
 * The context every per-form plugin hook receives: the form store and the
 * plugin's own state (created by its `build`).
 */
export interface PluginCtx<TState> {
  readonly form: InternalFormStore;
  readonly state: TState;
}

/**
 * A jsonisch plugin: a plain object from a factory. Config lives in the
 * factory closure; all mutable state is created inside `build`, keyed to
 * the form store (a module-scope-hoisted plugin shared by two open forms
 * must not cross-write). Registration happens only in the `createFormStore`
 * config — no late registration.
 *
 * Every hook is sync — passes run inside `batch(() => untrack(() => …))`
 * and an `await` there would let React render a half-rebased form.
 *
 * Core owns the phases: each hook is a pinned call site in core (a plugin
 * can never sort itself before the value rebase). Plugins only order among
 * themselves — array order within each hook, validated by `dependsOn`.
 */
export interface JsonischPlugin<TState = unknown> {
  /**
   * The plugin name (error attribution + uniqueness).
   */
  readonly name: string;
  /**
   * The identity the plugin's state is stored under. Exported as a
   * module-level singleton so other plugins can read this plugin's state
   * without importing its implementation.
   */
  readonly key: PluginKey<TState>;
  /**
   * Keys of plugins that must be registered EARLIER in the plugins array.
   * `createFormStore` throws when one is missing or later — turning
   * ordering comments into hard startup errors (the estimate-pin data-loss
   * scenario of D2).
   */
  readonly dependsOn?: readonly PluginKey<unknown>[];
  /**
   * The plugin's static wire contract, collected onto the form store so
   * core's decode paths can unwrap envelopes. The same descriptor object is
   * exported next to the factory for the server-side `encodeDirty`.
   */
  readonly wire?: WireContract;

  /**
   * 1 — creates the plugin's state container, BEFORE the schema walk (so
   * the walk can dispatch `buildScope` for the rows it creates). No tree
   * access here — scope work belongs in `buildScope`.
   */
  build(form: InternalFormStore, config: FormConfig): TState;

  /**
   * 2 — wires one object scope, in plugin array order: the form root
   * (after the walk, with the raw initial input) and every array-item
   * object AS THE WALK CREATES IT (with the raw row object). A row created
   * by an insert or a whole-array write behaves exactly like one the
   * record loaded with.
   */
  buildScope?(
    ctx: PluginCtx<TState>,
    scope: InternalObjectStore,
    raw: unknown,
  ): void;

  /**
   * 3 — re-seeds an EXISTING row scope that adopts a different row (an
   * array shrink-then-regrow, a grown baseline row). Signals must be
   * re-seeded in place, never replaced — computeds already wired to them
   * keep tracking.
   */
  reseedScope?(
    ctx: PluginCtx<TState>,
    scope: InternalObjectStore,
    raw: unknown,
  ): void;

  /**
   * 4 — per value leaf, from INSIDE reset's existing walk (scoped resets
   * stay correct for free). Restore live plugin state to its decode-time
   * baseline.
   */
  resetField?(ctx: PluginCtx<TState>, store: InternalFieldStore): void;

  /**
   * 5 — after the value/baseline rebase of one object scope: the form root
   * (from `applyBaseline`, with the raw decoded record) and each array-item
   * object (from the baseline rebase walk, with the fresh raw row). The
   * plugin owns its own decode of the raw.
   */
  rebase?(
    ctx: PluginCtx<TState>,
    scope: InternalObjectStore,
    raw: unknown,
  ): void;

  /**
   * 6 — item-state transfer: per-field plugin state travels with its row
   * through an insert, remove or move, exactly like the input signals
   * (`copyItemState`). Field stores are position-fixed; only values move.
   */
  transferField?(
    ctx: PluginCtx<TState>,
    from: InternalValueStore,
    to: InternalValueStore,
  ): void;

  /**
   * 7 — the swap twin of `transferField` (`swapItemState`).
   */
  swapField?(
    ctx: PluginCtx<TState>,
    first: InternalValueStore,
    second: InternalValueStore,
  ): void;

  /**
   * 8 — whether THIS field's plugin state is dirty (must serialize). Feeds
   * the subtree dirty walks that decide payload emission.
   */
  fieldIsDirty?(ctx: PluginCtx<TState>, store: InternalValueStore): boolean;

  /**
   * 9 — wraps a value field's own payload entry (the LOS-573 envelope):
   * called for a dirty leaf with its outgoing value (`undefined` when only
   * the plugin half is dirty), returns the wire entry to emit — or
   * `undefined` for "no opinion" (a bare scalar). Two plugins claiming the
   * same field throw.
   */
  encodeValue?(
    ctx: PluginCtx<TState>,
    store: InternalValueStore,
    valueOut: unknown,
  ): unknown;

  /**
   * 10 — the plugin's contribution to form-level `isDirty`. Runs inside a
   * computed, so it MUST read its signals unconditionally — the aggregate
   * never short-circuits between plugins (an unran handler contributes no
   * signal reads and deafens the projection).
   */
  isDirty?(ctx: PluginCtx<TState>): boolean;

  /**
   * 11 — members merged into the react field snapshot, computed inside the
   * library-owned tracked read (the D5 snapshot model): plain values read
   * off signals — never getters — plus identity-stable callbacks (a fresh
   * closure per call would defeat the snapshot equality gate and re-render
   * every notification; cache them on the plugin's per-field state). Types
   * ride the `FieldStoreSlots` declare-module augmentation in the plugin's
   * own file. A key claimed twice, or colliding with a core field member,
   * throws.
   */
  fieldSnapshot?(
    ctx: PluginCtx<TState>,
    store: InternalFieldStore,
    path: Path,
  ): Record<string, unknown>;
}

/**
 * The `plugins` config entry: factories may be composed conditionally —
 * falsy entries and nested arrays are accepted and flattened
 * (`plugins: [companions(), engine && derivation(engine)]`).
 */
export type PluginsInput = ReadonlyArray<
  | JsonischPlugin<unknown>
  | false
  | null
  | undefined
  | ReadonlyArray<JsonischPlugin<unknown> | false | null | undefined>
>;
