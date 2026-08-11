import type { InternalFieldStore, InternalFormStore } from "../types";

declare const stateBrand: unique symbol;

/**
 * The identity a plugin's state is stored under in the form store's
 * `pluginState` map (the ProseMirror pattern, minus its string-name
 * registry). The generic is a phantom — it exists only so `getState`
 * returns the right type; nothing is stored on the key itself.
 *
 * Keys are module-level singletons exported next to their plugin factory.
 * Cross-plugin reads go through the exported key (derivation imports
 * `companionsKey`, never the companions implementation), and stay
 * `T | undefined` — a form without the owning plugin is a legal config.
 */
export class PluginKey<TState> {
  declare private readonly [stateBrand]: TState;

  constructor(readonly name: string) {}

  /**
   * Reads the owning plugin's state off a form store, or `undefined` when
   * the plugin is not registered on this form.
   */
  getState(form: InternalFormStore): TState | undefined {
    return form.pluginState.get(this as PluginKey<unknown>) as
      | TState
      | undefined;
  }
}

/**
 * A plugin key whose state is a per-field map keyed by field-store
 * IDENTITY. Field stores are position-fixed — array operations move signal
 * VALUES between stores, not the stores themselves — so per-field slots
 * must transfer with item state via the `transferField`/`swapField` hooks,
 * exactly like the input signals they sit next to.
 */
export class FieldSlotKey<TSlot> extends PluginKey<
  Map<InternalFieldStore, TSlot>
> {
  /**
   * Reads one field's slot, or `undefined` when the plugin is absent or the
   * field carries no slot (a bare scalar to this plugin).
   */
  get(
    form: InternalFormStore,
    store: InternalFieldStore,
  ): TSlot | undefined {
    return this.getState(form)?.get(store);
  }
}
