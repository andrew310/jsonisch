import { inferControl } from "../control";
import { isSafeKey } from "../schema-utils";
import type { JsonSchema } from "../types";

/**
 * The save payload partitioned by record geometry: real table columns,
 * `data` JSONB bag entries, and companion meta state (`<key>Source`/
 * `<key>Hybrid`, wire-compatible with today's shapes).
 */
export interface EncodedDirty {
  columns: Record<string, unknown>;
  data: Record<string, unknown>;
  companions: Record<string, unknown>;
}

/**
 * Options for `encodeDirty`.
 */
export interface EncodeDirtyOptions {
  /**
   * The real table columns that exist (server-side drizzle column keys).
   * When provided, an `x-column: true` key with no matching real column is
   * DROPPED instead of routed to `columns` — a schema declaring a column
   * that does not exist is an undeclared write path, and one bad key must
   * not fail the whole save (mirrors `partitionAssetRow`).
   */
  knownColumns?: ReadonlySet<string>;
}

/**
 * The companion suffixes that may ride alongside a declared field
 * (`<key>Source` mode state, `<key>Hybrid` amount-or-percent state).
 */
const COMPANION_SUFFIXES = ["Source", "Hybrid"] as const;

/**
 * Control kinds whose VALUES are derived and server-recomputed — never
 * written by the client save path. Client payloads may carry stale echoes
 * of the last-rendered result; they are skipped silently (mirrors the
 * `FORMULA_FIELD_TYPES` skip in `partitionAssetRow`). Companions
 * (`<key>Source` mode state) still persist.
 */
const DERIVED_CONTROLS = new Set(["formula", "estimate"]);

/**
 * Encodes a dirty-values object (the `pickDirty`/`getDirtyInput` result)
 * into the save payload, partitioning each root key by its `x-column`
 * geometry: `x-column: true` fields become column updates, everything else
 * lands in the `data` bag. Formula-driven values are skipped — the server
 * recompute pass is their only author. Companion keys (`<key>Source`/
 * `<key>Hybrid` whose base key is a declared non-column field) are split
 * into `companions`, keeping today's wire shape. Undeclared keys —
 * including prototype-pollution keys — are dropped: the schema is the
 * allow-list at the write boundary too.
 *
 * v1a note: nothing in the field-store tree produces companion keys yet —
 * they arrive when the meta channel (mode/hybrid/ledger state) lands in a
 * later slice and serializes into the dirty payload. Until then the branch
 * pins the wire shape.
 *
 * This function is isomorphic (no DOM): the server imports the same
 * partition for save routing and whitelist enforcement.
 *
 * @param schema The form's JSON-Schema (object schema with properties).
 * @param dirty The dirty values, or `undefined` when nothing is dirty.
 * @param options Encoding options (e.g. the server's real column set).
 *
 * @returns The partitioned payload, or `undefined` when nothing survives.
 */
export function encodeDirty(
  schema: JsonSchema,
  dirty: Record<string, unknown> | null | undefined,
  options: EncodeDirtyOptions = {},
): EncodedDirty | undefined {
  if (dirty == null) return undefined;

  const properties = schema.properties ?? {};
  const declared = (key: string): JsonSchema | undefined =>
    Object.prototype.hasOwnProperty.call(properties, key) && isSafeKey(key)
      ? properties[key]
      : undefined;

  const columns: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};
  const companions: Record<string, unknown> = {};
  let hasEntries = false;

  for (const key of Object.keys(dirty)) {
    if (!isSafeKey(key)) continue;

    const property = declared(key);
    if (property) {
      // Derived values are outputs — the recompute pass is their only
      // author; a client echo must never persist
      if (DERIVED_CONTROLS.has(inferControl(property))) continue;

      if (property["x-column"] === true) {
        if (options.knownColumns && !options.knownColumns.has(key)) {
          // Declared column with no real table column — drop just this key
          continue;
        }
        columns[key] = dirty[key];
      } else {
        data[key] = dirty[key];
      }
      hasEntries = true;
      continue;
    }

    // Companion of a declared non-column field — meta state serialized
    // next to its field, wire-compatible with today's shapes
    const suffix = COMPANION_SUFFIXES.find((s) => key.endsWith(s));
    if (suffix) {
      const base = declared(key.slice(0, -suffix.length));
      if (base && base["x-column"] !== true) {
        companions[key] = dirty[key];
        hasEntries = true;
        continue;
      }
    }

    // Undeclared — dropped by the allow-list
  }

  return hasEntries ? { columns, data, companions } : undefined;
}
