/**
 * canon is the record the domain's canonical loader returns; bagger
 * distributes it: schema-declared keys become form state through the
 * store's allow-list, the whole record becomes the off-form value bag.
 *
 * Two constraints:
 * - The shelf (`offFormValues`) unwraps kind envelopes (`computeBag`); the
 *   form side never does — row seeding reads a SECOND, intact row index
 *   built here from `flattenSourceRow`, so a seeded estimate keeps its
 *   `{ kind, value, mode }` envelope instead of collapsing to a bare
 *   number (LOS-461).
 * - `build` runs BEFORE the schema walk, so it may read only
 *   `config.schema` — `form.schema` (set by `initializeFieldStore`) is
 *   still undefined there. The shelf is written from the ROOT `buildScope`
 *   call instead, the one write point after the walk (dispatched in plugin
 *   array order — `create-form-store.ts`).
 *
 * A seeded envelope leaf (estimate / amount-or-percent) must never fork
 * its two halves: the envelopes plugin already built this leaf's slot
 * (empty) from the row's OWN raw before bagger runs in the same
 * `buildScope` dispatch, so seeding writes through the SAME decode
 * (`decodeSourceEnvelope`/`decodeHybridEnvelope`) and the SAME sole
 * writer (`writeEnvelope`) the walk itself uses — never a hand-built
 * envelope object landing straight in `input`.
 */
import { PluginKey } from "../../core/plugin/key";
import type { JsonischPlugin, PluginCtx } from "../../core/plugin/types";
import type { InternalObjectStore, InternalValueStore } from "../../core/types";
import {
  decodeHybridEnvelope,
  decodeSourceEnvelope,
  writeEnvelope,
} from "../envelopes/envelope";
import { envelopesKey } from "../envelopes/key";
import {
  collectionKeys,
  computeBag,
  flattenSourceRow,
  type BaggerOptions,
} from "./compute-scope";

export type { BaggerOptions, ComputeBagOptions } from "./compute-scope";
export { collectionKeys, computeBag } from "./compute-scope";

/**
 * The bagger plugin's state: the computed shelf plus an id-keyed row index
 * per many:true relation field, used to seed a row's declared keys with
 * their canonical baseline. Single-pick relations (`many: false`) hold a
 * ref object, not a row collection, so they have no rows to index.
 */
export interface BaggerState {
  readonly scope: Record<string, unknown>;
  readonly rowsByField: Map<string, Map<string, Record<string, unknown>>>;
}

export const baggerKey = new PluginKey<BaggerState>("bagger");

/**
 * Builds the id-keyed row index for one many:true relation field, from the
 * INTACT (non-unwrapped) flatten — the seeding source, never `computeBag`'s
 * unwrapped rows.
 */
function indexRows(
  rows: unknown,
  bag: string,
): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(rows)) return index;
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const flat = flattenSourceRow(row as Record<string, unknown>, bag);
    const id = flat.id;
    if (typeof id === "string") index.set(id, flat);
  }
  return index;
}

/**
 * Seeds one declared leaf with its canonical value as BASELINE: `input`,
 * `startInput`, AND `initialInput` — `reset()` restores a field from
 * `initialInput` (`methods/reset.ts`), so a seed that skipped it would
 * survive until the first reset and then blank out, the legacy-hydration
 * parity `reset` otherwise breaks (a legacy record merged canonical
 * values into the row BEFORE decode, so every channel already carried
 * them; seeding after the walk must land on the same three channels by
 * hand).
 *
 * An envelope-control leaf (estimate / amount-or-percent) does NOT get
 * its raw envelope object written into `input` — that would fork the
 * value half (a wrapped object landing in a number field) from the
 * envelopes plugin's own slot, which the walk already built empty from
 * this row's OWN raw earlier in the same `buildScope` dispatch. Instead
 * this decodes through the plugin's own functions
 * (`decodeSourceEnvelope`/`decodeHybridEnvelope`) and writes through its
 * sole writer (`writeEnvelope`), plus reassigns `slot.startEnvelope` —
 * the same field `rebase`'s `bindAdopted` reassigns when adopting a new
 * baseline (`envelope.ts`) — so the meta half (mode, manualValue) seeds
 * alongside the value half instead of staying at its empty default.
 */
function seedLeaf(
  ctx: PluginCtx<BaggerState>,
  child: InternalValueStore,
  rawValue: unknown,
): void {
  const slot = envelopesKey.get(ctx.form, child);
  if (!slot) {
    child.input.value = rawValue;
    child.startInput.value = rawValue;
    child.initialInput.value = rawValue;
    return;
  }

  if (slot.family === "source") {
    const decoded = decodeSourceEnvelope(ctx.form, child, rawValue);
    slot.startEnvelope.value = decoded;
    child.startInput.value = decoded.value;
    child.initialInput.value = decoded.value;
    writeEnvelope(ctx.form, child, slot, decoded);
  } else {
    const decoded = decodeHybridEnvelope(ctx.form, child, rawValue);
    slot.startEnvelope.value = decoded;
    child.startInput.value = decoded.value;
    child.initialInput.value = decoded.value;
    writeEnvelope(ctx.form, child, slot, decoded);
  }
}

/**
 * Seeds one row scope's declared value leaves from its canonical source
 * row: a leaf with no live input yet (`input.value === undefined`) takes
 * the source row's value as baseline (`seedLeaf`). A row already holding
 * a value, or with no canonical match, is left untouched.
 */
function seedRow(
  ctx: PluginCtx<BaggerState>,
  scope: InternalObjectStore,
  raw: unknown,
): void {
  const fieldKey = String(scope.path[0]);
  const rowId = (raw as { id?: string } | undefined)?.id ?? "";
  const sourceRow = ctx.state.rowsByField.get(fieldKey)?.get(rowId);
  if (!sourceRow) return;

  for (const [key, child] of Object.entries(scope.children)) {
    if (child.kind !== "value") continue;
    if (child.input.value !== undefined) continue;
    const rawValue = sourceRow[key];
    if (rawValue === undefined) continue;
    seedLeaf(ctx, child, rawValue);
  }
}

/**
 * The bagger plugin: computes the off-form shelf once (`computeBag`) and
 * owns `offFormValues`, then seeds every relation row's declared keys from
 * its canonical row as an unedited baseline. Registration order:
 * `[envelopes(), bagger(record), derivation?, visibility()]` — envelopes
 * first so its slot already exists on every estimate/hybrid leaf by the
 * time seeding runs (`dependsOn: [envelopesKey]` enforces this at
 * `createFormStore`).
 */
export function bagger(
  record: Record<string, unknown>,
  opts?: BaggerOptions,
): JsonischPlugin<BaggerState> {
  const bag = opts?.bag ?? "data";

  return {
    name: "bagger",
    key: baggerKey,
    dependsOn: [envelopesKey],

    build(form, config): BaggerState {
      // `config.schema`, not `form.schema` — `initializeFieldStore` (the
      // walk that sets the root store's `schema`) runs AFTER every
      // plugin's `build` (`create-form-store.ts`), so `form.schema` is
      // still undefined here.
      const schema = config.schema;
      // The handle comes from the store, never from a plugin option — the
      // alias this writes and the reserved word row scope resolves must be
      // the same key by construction.
      const scope = computeBag(schema, record, {
        ...opts,
        handle: form.recordHandle,
      });
      const rowsByField = new Map<string, Map<string, Record<string, unknown>>>();
      // Same classification as the shelf (`collectionKeys`) — a key the
      // dataset schema calls a collection and the stage schema does not
      // must still index its rows, or a tray rendered from a synthesized
      // stage node would have no seeding source.
      for (const key of collectionKeys(schema, opts?.collectionsSchema)) {
        rowsByField.set(key, indexRows(record[key], bag));
      }
      return { scope, rowsByField };
    },

    buildScope(ctx, scope, raw) {
      if (scope === ctx.form) {
        ctx.form.offFormValues.value = ctx.state.scope;
        return;
      }
      seedRow(ctx, scope, raw);
    },

    reseedScope(ctx, scope, raw) {
      seedRow(ctx, scope, raw);
    },
  };
}
