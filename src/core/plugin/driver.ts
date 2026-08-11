import type {
  InternalFieldStore,
  InternalFormStore,
  InternalObjectStore,
  InternalValueStore,
} from "../types";
import type { FormConfig } from "../types/form";
import type { PluginKey } from "./key";
import type { JsonischPlugin, PluginsInput, WireContract } from "./types";

/**
 * The members a plugin object may carry. Anything else is a typo'd hook
 * name and throws at `createFormStore` instead of silently never running.
 */
const KNOWN_MEMBERS = new Set([
  "name",
  "key",
  "dependsOn",
  "wire",
  "build",
  "buildScope",
  "reseedScope",
  "resetField",
  "rebase",
  "transferField",
  "swapField",
  "fieldIsDirty",
  "encodeValue",
  "isDirty",
]);

/**
 * The hooks the driver precomputes implementer lists for (the per-field
 * ones run in loops; scanning all plugins per field would be quadratic).
 */
const HOOK_NAMES = [
  "buildScope",
  "reseedScope",
  "resetField",
  "rebase",
  "transferField",
  "swapField",
  "fieldIsDirty",
  "encodeValue",
  "isDirty",
] as const;

type HookName = (typeof HOOK_NAMES)[number];

/**
 * The resolved plugin runtime on a form store: the flat plugin list,
 * per-hook implementer lists, and the envelope wire contracts keyed by
 * control kind — all precomputed once at `createFormStore`.
 */
export interface PluginDriver {
  readonly plugins: readonly JsonischPlugin<unknown>[];
  readonly hooks: Readonly<
    Record<HookName, readonly JsonischPlugin<unknown>[]>
  >;
  /**
   * Envelope wire contracts by control kind (`estimate` →
   * `companionsWire`), consulted by the leaf decode paths.
   */
  readonly envelopes: ReadonlyMap<string, WireContract>;
}

/**
 * Wraps a hook dispatch for error attribution: a throwing plugin surfaces
 * as `Error running "build" for jsonisch plugin "derivation": …` instead of
 * an anonymous stack out of `createFormStore`.
 */
function attributed<T>(
  plugin: JsonischPlugin<unknown>,
  hook: string,
  run: () => T,
): T {
  try {
    return run();
  } catch (error) {
    throw new Error(
      `Error running "${hook}" for jsonisch plugin "${plugin.name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

/**
 * Flattens and validates the `plugins` config into the driver: falsy
 * entries and one level of nesting are accepted; names and keys must be
 * unique; `dependsOn` keys must belong to EARLIER plugins (a missing or
 * later dependency is a startup error naming both plugins); every member
 * must be a known hook with the right shape.
 */
export function resolvePlugins(input: PluginsInput | undefined): PluginDriver {
  const plugins: JsonischPlugin<unknown>[] = [];
  for (const entry of (input ?? []).flat()) {
    if (!entry) continue;
    plugins.push(entry as JsonischPlugin<unknown>);
  }

  const names = new Set<string>();
  const keys = new Map<PluginKey<unknown>, string>();
  for (const plugin of plugins) {
    if (typeof plugin !== "object" || typeof plugin.name !== "string" || !plugin.name) {
      throw new Error("A jsonisch plugin must be an object with a name");
    }
    if (names.has(plugin.name)) {
      throw new Error(`Duplicate jsonisch plugin name "${plugin.name}"`);
    }
    names.add(plugin.name);

    if (!plugin.key || typeof plugin.key !== "object") {
      throw new Error(`Jsonisch plugin "${plugin.name}" has no key`);
    }
    if (keys.has(plugin.key)) {
      throw new Error(
        `Jsonisch plugins "${keys.get(plugin.key)}" and "${plugin.name}" share the same key`,
      );
    }

    if (typeof plugin.build !== "function") {
      throw new Error(`Jsonisch plugin "${plugin.name}" has no build hook`);
    }
    for (const member of Object.keys(plugin)) {
      if (!KNOWN_MEMBERS.has(member)) {
        throw new Error(
          `Unknown member "${member}" on jsonisch plugin "${plugin.name}" — a typo'd hook never runs, so it throws instead`,
        );
      }
    }

    // Declared-dependency-or-throw: the smallest thing that turns ordering
    // comments into hard errors (no pre/post tiers, no topo sort)
    for (const dependency of plugin.dependsOn ?? []) {
      const owner = keys.get(dependency);
      if (owner === undefined) {
        throw new Error(
          `Jsonisch plugin "${plugin.name}" requires plugin "${dependency.name}" earlier in the plugins array`,
        );
      }
    }

    keys.set(plugin.key, plugin.name);
  }

  const hooks = {} as Record<HookName, readonly JsonischPlugin<unknown>[]>;
  for (const hook of HOOK_NAMES) {
    hooks[hook] = plugins.filter((plugin) => typeof plugin[hook] === "function");
  }

  const envelopes = new Map<string, WireContract>();
  for (const plugin of plugins) {
    for (const control of plugin.wire?.envelopeControls ?? []) {
      if (envelopes.has(control)) {
        throw new Error(
          `Two jsonisch plugins declare an envelope for the "${control}" control`,
        );
      }
      envelopes.set(control, plugin.wire!);
    }
  }

  return { plugins, hooks, envelopes };
}

/**
 * The `PluginCtx` for one plugin on one form (state read fresh off the
 * store, so hooks always see the current container).
 */
function ctxOf(form: InternalFormStore, plugin: JsonischPlugin<unknown>) {
  return { form, state: form.pluginState.get(plugin.key) };
}

/**
 * Runs every plugin's `build` in array order, storing each state container
 * under its key. Runs BEFORE the walk (see `JsonischPlugin.build`).
 */
export function dispatchBuild(form: InternalFormStore, config: FormConfig): void {
  for (const plugin of form.pluginDriver.plugins) {
    form.pluginState.set(
      plugin.key,
      attributed(plugin, "build", () => plugin.build(form, config)),
    );
  }
}

/**
 * Wires one object scope (the root after the walk, or an array-item object
 * as the walk creates it), in plugin array order.
 */
export function dispatchBuildScope(
  form: InternalFormStore,
  scope: InternalObjectStore,
  raw: unknown,
): void {
  for (const plugin of form.pluginDriver?.hooks.buildScope ?? []) {
    attributed(plugin, "buildScope", () =>
      plugin.buildScope!(ctxOf(form, plugin), scope, raw),
    );
  }
}

/**
 * Re-seeds an existing row scope that adopts a different row.
 */
export function dispatchReseedScope(
  form: InternalFormStore,
  scope: InternalObjectStore,
  raw: unknown,
): void {
  for (const plugin of form.pluginDriver?.hooks.reseedScope ?? []) {
    attributed(plugin, "reseedScope", () =>
      plugin.reseedScope!(ctxOf(form, plugin), scope, raw),
    );
  }
}

/**
 * Rebases one object scope's plugin state on fresh raw data — the root
 * from `applyBaseline`, rows from the baseline-rebase walk. Runs AFTER the
 * scope's value rebase.
 */
export function dispatchRebase(
  form: InternalFormStore,
  scope: InternalObjectStore,
  raw: unknown,
): void {
  for (const plugin of form.pluginDriver?.hooks.rebase ?? []) {
    attributed(plugin, "rebase", () =>
      plugin.rebase!(ctxOf(form, plugin), scope, raw),
    );
  }
}

/**
 * Restores one value leaf's plugin state to its decode-time baseline, from
 * inside reset's walk.
 */
export function dispatchResetField(
  form: InternalFormStore,
  store: InternalFieldStore,
): void {
  for (const plugin of form.pluginDriver?.hooks.resetField ?? []) {
    attributed(plugin, "resetField", () =>
      plugin.resetField!(ctxOf(form, plugin), store),
    );
  }
}

/**
 * Transfers per-field plugin state between two value stores (item-state
 * copy during array inserts/removes/moves).
 */
export function dispatchTransferField(
  form: InternalFormStore,
  from: InternalValueStore,
  to: InternalValueStore,
): void {
  for (const plugin of form.pluginDriver?.hooks.transferField ?? []) {
    attributed(plugin, "transferField", () =>
      plugin.transferField!(ctxOf(form, plugin), from, to),
    );
  }
}

/**
 * Swaps per-field plugin state between two value stores.
 */
export function dispatchSwapField(
  form: InternalFormStore,
  first: InternalValueStore,
  second: InternalValueStore,
): void {
  for (const plugin of form.pluginDriver?.hooks.swapField ?? []) {
    attributed(plugin, "swapField", () =>
      plugin.swapField!(ctxOf(form, plugin), first, second),
    );
  }
}

/**
 * Whether any plugin's form-level state is dirty. Runs inside the
 * `isDirty` aggregate computed, so it reads EVERY implementer — never
 * short-circuits: an unran handler contributes no signal reads and would
 * deafen the projection.
 */
export function pluginsDirty(form: InternalFormStore): boolean {
  let dirty = false;
  for (const plugin of form.pluginDriver?.hooks.isDirty ?? []) {
    if (attributed(plugin, "isDirty", () => plugin.isDirty!(ctxOf(form, plugin)))) {
      dirty = true;
    }
  }
  return dirty;
}

/**
 * Whether THIS value leaf's plugin state is dirty (must serialize). Reads
 * every implementer for the same no-short-circuit reason as `pluginsDirty`
 * — callers may sit inside computeds.
 */
export function fieldPluginDirty(
  form: InternalFormStore,
  store: InternalValueStore,
): boolean {
  let dirty = false;
  for (const plugin of form.pluginDriver?.hooks.fieldIsDirty ?? []) {
    if (
      attributed(plugin, "fieldIsDirty", () =>
        plugin.fieldIsDirty!(ctxOf(form, plugin), store),
      )
    ) {
      dirty = true;
    }
  }
  return dirty;
}

/**
 * Whether any value leaf in the subtree has dirty plugin state — the
 * plugin half of the dirty walks that decide payload emission (a mode flip
 * with an unchanged value must still produce a payload). Reads array
 * `items` (not raw `children`, which may hold stale stores past the end
 * after a shrink), so a reactive caller subscribes to structural changes.
 */
export function hasPluginDirtyField(
  form: InternalFormStore,
  store: InternalFieldStore,
): boolean {
  if (store.kind === "value") {
    return fieldPluginDirty(form, store);
  }
  if (store.kind === "array") {
    const length = store.items.value.length;
    let dirty = false;
    for (let index = 0; index < length; index++) {
      const child = store.children[index];
      if (child && hasPluginDirtyField(form, child)) dirty = true;
    }
    return dirty;
  }
  let dirty = false;
  for (const key in store.children) {
    if (hasPluginDirtyField(form, store.children[key])) dirty = true;
  }
  return dirty;
}

/**
 * Encodes one dirty value leaf's payload entry: asks the `encodeValue`
 * implementers to wrap it (the LOS-573 envelope). Exactly one plugin may
 * claim a field; with no claim the outgoing value is emitted as-is.
 *
 * @param form The form store.
 * @param store The value leaf being encoded.
 * @param valueOut The outgoing value (`undefined` when only plugin state
 * is dirty).
 *
 * @returns The wire entry to emit.
 */
export function encodeFieldValue(
  form: InternalFormStore,
  store: InternalValueStore,
  valueOut: unknown,
): unknown {
  let claimed: string | undefined;
  let result: unknown = valueOut;
  for (const plugin of form.pluginDriver?.hooks.encodeValue ?? []) {
    const wrapped = attributed(plugin, "encodeValue", () =>
      plugin.encodeValue!(ctxOf(form, plugin), store, valueOut),
    );
    if (wrapped === undefined) continue;
    if (claimed !== undefined) {
      throw new Error(
        `Jsonisch plugins "${claimed}" and "${plugin.name}" both encode the "${store.name}" field`,
      );
    }
    claimed = plugin.name;
    result = wrapped;
  }
  return result;
}

/**
 * Unwraps a raw persisted leaf entry through the form's envelope wire
 * contracts: an envelope-control leaf resolves its value half, everything
 * else passes through. The single decode seam shared by the walk, reset,
 * and the baseline rebase — a leaf can never round-trip to two different
 * values.
 */
export function unwrapLeafInput(
  form: InternalFormStore,
  control: string,
  raw: unknown,
): unknown {
  const wire = form.pluginDriver?.envelopes.get(control);
  if (!wire?.unwrap || raw === undefined) return raw;
  return wire.unwrap(raw).value;
}
